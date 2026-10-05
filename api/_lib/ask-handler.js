// Núcleo do POST /api/ask (Request/Response padrão).
// Conecta a camada serverless da Vercel ao modelo generativo Qwen2.5-7B-Instruct-AWQ no Modal.com.
// O TEXTO DA PERGUNTA NUNCA É REGISTRADO em log (só status, latência, cache, client).

import { readConfig } from './config.js';
import { avaliarCors, clientIp, json, readJsonBody } from './http.js';
import { createCache, normalizeQuestion } from './cache.js';
import { createDailyBudget, createSlidingWindow, JANELAS } from './ratelimit.js';
import { validateAskBody } from './validate.js';

export function defaultLog(evento) {
  // Whitelist de campos: status, latência, cache, client, motivo — nunca pergunta, IP ou iid.
  const { evt, status, ms, cache, client, err } = evento;
  console.log(JSON.stringify({ evt, status, ms, cache, client, err }));
}

/** Estado em memória da instância (limitadores, orçamento, cache, requisições em andamento). */
export function createAskState({ now = Date.now, cacheMax = 500, cacheTtlMs = 3600_000 } = {}) {
  return {
    ipWindow: createSlidingWindow({ windowMs: JANELAS.MINUTO, now }),
    iidWindow: createSlidingWindow({ windowMs: JANELAS.DIA, now }),
    budget: createDailyBudget({ now }),
    cache: createCache({ maxEntries: cacheMax, ttlMs: cacheTtlMs, now }),
    inflight: new Map(),
  };
}

/**
 * Validador e sanitizador de respostas da IA generativa ancorado nas regras constitucionais e dados do TSE.
 * Detecta e previne alucinações matemáticas (como alegar que < 50% é maioria absoluta) ou confusão com eleições passadas.
 */
export function sanitizarRespostaAsk(answer, q = '', context = '') {
  if (!answer || typeof answer !== 'string') return answer;
  const qNorm = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const ansNorm = answer.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const ehSobreSegundoTurnoOuExecutivo =
    qNorm.includes('segundo turno') || qNorm.includes('2o turno') || qNorm.includes('2 turno') ||
    ansNorm.includes('segundo turno') || ansNorm.includes('2o turno') || ansNorm.includes('2 turno') ||
    qNorm.includes('governador') || qNorm.includes('governo') || qNorm.includes('presidente') ||
    ansNorm.includes('governador') || ansNorm.includes('presidente');

  if (ehSobreSegundoTurnoOuExecutivo) {
    const afirmaSemSegundoTurno =
      ansNorm.includes('nao havera segundo turno') ||
      ansNorm.includes('nao tera segundo turno') ||
      ansNorm.includes('liquidou a eleicao') ||
      ansNorm.includes('liquidada em turno unico') ||
      ansNorm.includes('liquidou em turno unico') ||
      ansNorm.includes('eleito em primeiro turno') ||
      ansNorm.includes('eleito em 1o turno') ||
      ansNorm.includes('eleito em 1 turno');

    if (afirmaSemSegundoTurno) {
      // Extrai todos os percentuais presentes na resposta
      const pcts = [...answer.matchAll(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/g)]
        .map((m) => parseFloat(m[1].replace(',', '.')))
        .filter((n) => !isNaN(n) && n > 0 && n <= 100);

      const temPctAbaixoOuIgual50 = pcts.some((p) => p <= 50.0);
      const afirmaMaioriaComMenosDe50 = ansNorm.includes('maioria absoluta') && temPctAbaixoOuIgual50;
      const casoHistoricoOmar = ansNorm.includes('omar aziz') || ansNorm.includes('40,63') || ansNorm.includes('40.63');

      if ((temPctAbaixoOuIgual50 && afirmaMaioriaComMenosDe50) || casoHistoricoOmar || (temPctAbaixoOuIgual50 && ansNorm.includes('liquidou'))) {
        return 'De acordo com a Constituição Federal (Art. 28 e Art. 77) e as regras oficiais do Tribunal Superior Eleitoral (TSE):\n\n' +
          '• Para Governador e Presidente da República, a eleição só é decidida em 1º turno se o candidato mais votado alcançar mais de 50% dos votos válidos (maioria absoluta, desconsiderados brancos e nulos).\n' +
          '• Um percentual igual ou inferior a 50% dos votos válidos não elege candidato ao Executivo em 1º turno: a disputa segue obrigatoriamente para o 2º turno entre os dois mais votados.\n' +
          '• Data da votação do 2º turno: 25 de outubro de 2026, das 8h às 17h (horário de Brasília).\n\n' +
          'Nota: Senadores e Deputados são eleitos em turno único por maioria simples ou quociente eleitoral no 1º turno e não disputam 2º turno.';
      }
    }
  }

  return answer;
}

/**
 * Chama o endpoint /ask no Modal com autenticação de proxy.
 * @returns {Promise<{ok:true, answer:string, model:string} | {ok:false, kind:'timeout'|'upstream'|'auth'|'bad_output'|'budget'}>}
 */
export async function chamarModalAsk(cfg, q, context, { doFetch, now, budget }) {
  const limite = now() + (cfg.askTimeoutMs ?? cfg.timeoutMs);
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const restante = limite - now();
    if (tentativa === 1 && restante < 1000) break;
    if (!budget.consume(cfg.dailyBudget)) {
      return tentativa === 0 ? { ok: false, kind: 'budget' } : { ok: false, kind: 'upstream' };
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), Math.max(1, restante));
    try {
      const resp = await doFetch(cfg.modalAskEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Modal-Key': cfg.modalKey,
          'Modal-Secret': cfg.modalSecret,
        },
        body: JSON.stringify({ question: q, context: context || '' }),
        signal: ctl.signal,
      });
      if (resp.status >= 500) continue; // retry em 5xx
      if (resp.status === 401 || resp.status === 403) return { ok: false, kind: 'auth' };
      if (!resp.ok) return { ok: false, kind: 'upstream' };
      const texto = await resp.text();
      if (texto.length > 50_000) return { ok: false, kind: 'bad_output' };
      let dados;
      try {
        dados = JSON.parse(texto);
      } catch {
        return { ok: false, kind: 'bad_output' };
      }
      if (dados && dados.ok === false) return { ok: false, kind: 'upstream' };
      const rawAnswer = typeof dados?.answer === 'string' ? dados.answer.trim() : null;
      if (!rawAnswer) return { ok: false, kind: 'bad_output' };
      const answer = sanitizarRespostaAsk(rawAnswer, q, context);
      return { ok: true, answer, model: dados.model || 'Qwen2.5-7B-Instruct-AWQ' };
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, kind: 'timeout' };
      return { ok: false, kind: 'upstream' };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, kind: 'upstream' };
}

export function createAskHandler(deps = {}) {
  const getEnv = deps.env ?? (() => process.env);
  const now = deps.now ?? (() => Date.now());
  const doFetch = deps.fetch ?? ((...args) => globalThis.fetch(...args));
  const log = deps.log ?? defaultLog;
  const state = deps.state ?? createAskState({ now });

  return async function handleAsk(request) {
    const t0 = now();
    const cfg = readConfig(getEnv());
    const cors = avaliarCors(request, cfg.allowedOrigins, 'POST, OPTIONS');
    let meta = { client: undefined, cache: 'na' };

    const responder = (status, corpo, extra = {}) => {
      log({ evt: 'ask', status, ms: now() - t0, ...meta });
      return json(status, corpo, { ...cors.headers, ...extra });
    };

    if (!cors.allowed) return responder(403, { ok: false, error: 'origin' });
    if (request.method === 'OPTIONS') {
      meta.err = 'preflight';
      return responder(204, null);
    }
    if (request.method !== 'POST') return responder(405, { ok: false, error: 'method_not_allowed' }, { Allow: 'POST, OPTIONS' });

    // Kill switch: desliga se não houver endpoint e credenciais
    const habilitado = cfg.mock || Boolean(cfg.modalAskEndpoint && cfg.modalKey && cfg.modalSecret);
    if (!habilitado) {
      meta.err = 'disabled';
      return responder(503, { ok: false, error: 'disabled' });
    }

    const corpo = await readJsonBody(request);
    if (!corpo.ok) {
      meta.err = corpo.error;
      return responder(corpo.status, { ok: false, error: corpo.error });
    }
    const v = validateAskBody(corpo.value);
    if (!v.ok) {
      meta.err = `invalid_${v.field ?? 'body'}`;
      return responder(v.status, { ok: false, error: v.error, field: v.field });
    }
    const { q, client, iid, context } = v.value;
    meta.client = client;

    // --- rate limit (IP por minuto e iid por dia)
    const ip = clientIp(request);
    const porIp = state.ipWindow.check(ip, cfg.rateIpPerMin);
    const porIid = state.iidWindow.check(iid, cfg.rateIidPerDay);
    if (!porIp.allowed || !porIid.allowed) {
      const espera = Math.ceil(Math.max(porIp.retryAfterMs, porIid.retryAfterMs) / 1000);
      meta.err = 'rate_limited';
      return responder(429, { ok: false, error: 'rate_limited' }, { 'Retry-After': String(espera) });
    }
    state.ipWindow.record(ip);
    state.iidWindow.record(iid);

    // --- cache
    const chave = context
      ? `ask|${cfg.modelVersion}|${normalizeQuestion(q)}|${normalizeQuestion(context)}`
      : `ask|${cfg.modelVersion}|${normalizeQuestion(q)}`;
    const emCache = state.cache.get(chave);
    if (emCache) {
      meta.cache = 'hit';
      return responder(200, { ok: true, answer: emCache.answer, model: emCache.model, cached: true });
    }
    meta.cache = 'miss';

    // --- chamada ao modelo
    let pendente = state.inflight.get(chave);
    if (!pendente) {
      pendente = (async () => {
        if (cfg.mock) {
          if (!state.budget.consume(cfg.dailyBudget)) return { ok: false, kind: 'budget' };
          return {
            ok: true,
            answer: `Resposta simulada da IA Generativa para: "${q}". Informações com base no TSE.`,
            model: 'Qwen2.5-7B-Instruct-AWQ (mock)',
          };
        }
        return chamarModalAsk(cfg, q, context, { doFetch, now, budget: state.budget });
      })().finally(() => state.inflight.delete(chave));
      state.inflight.set(chave, pendente);
    }
    const r = await pendente;

    if (!r.ok) {
      meta.err = r.kind;
      if (r.kind === 'budget') return responder(503, { ok: false, error: 'budget' });
      if (r.kind === 'timeout') return responder(504, { ok: false, error: 'timeout' });
      return responder(502, { ok: false, error: 'upstream' });
    }

    state.cache.set(chave, { answer: r.answer, model: r.model }, cfg.cacheTtlMs);
    return responder(200, { ok: true, answer: r.answer, model: r.model, cached: false });
  };
}
