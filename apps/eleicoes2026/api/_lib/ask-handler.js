// Núcleo do POST /api/ask (Request/Response padrão).
// Conecta a camada serverless da Vercel ao modelo generativo Qwen2.5-7B: Space no ZeroGPU do Hugging Face (principal) e
// Modal.com (reserva, com orçamento diário próprio). Ver chamarAsk.
// O TEXTO DA PERGUNTA NUNCA É REGISTRADO em log (só status, latência, cache, client).

import { askAtivo, askTemHf, askTemModal, readConfig } from './config.js';
import { createSharedLimiter, orcamentoComCompartilhado } from './compartilhado.js';
import { pedeRecomendacao, verificarRespostaAsk } from './neutralidade.js';
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
export function createAskState({ now = Date.now, cacheMax = 500, cacheTtlMs = 3600_000, shared = null } = {}) {
  const compartilhado = shared ?? createSharedLimiter({ now });
  return {
    shared: compartilhado,
    ipWindow: createSlidingWindow({ windowMs: JANELAS.MINUTO, now }),
    iidWindow: createSlidingWindow({ windowMs: JANELAS.DIA, now }),
    // o ask tem orçamento PRÓPRIO (GPU custa muito mais que a CPU do NLU)
    budget: orcamentoComCompartilhado(createDailyBudget({ now }), compartilhado, 'ask'),
    // com o Hugging Face como principal: um orçamento para ele (protege a cota diária da conta) e outro, pequeno, para a reserva no Modal
    budgetHf: orcamentoComCompartilhado(createDailyBudget({ now }), compartilhado, 'ask-hf'),
    budgetModal: orcamentoComCompartilhado(createDailyBudget({ now }), compartilhado, 'ask-modal'),
    cache: createCache({ maxEntries: cacheMax, ttlMs: cacheTtlMs, now }),
    inflight: new Map(),
  };
}

/**
 * Chama o endpoint /ask no Modal com autenticação de proxy.
 * @returns {Promise<{ok:true, answer:string, model:string} | {ok:false, kind:'timeout'|'upstream'|'auth'|'bad_output'|'budget'|'rejected', motivo?:string}>}
 */
export async function chamarModalAsk(cfg, q, context, { doFetch, now, budget }) {
  const limite = now() + (cfg.askTimeoutMs ?? cfg.timeoutMs);
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const restante = limite - now();
    if (tentativa === 1 && restante < 1000) break;
    if (!(await budget.consume(cfg.dailyBudget))) {
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
      // Verificação pós-geração: recomendação/previsão, contradição com a CF e números sem fonte no contexto => descarta
      // (o cliente usa a resposta local, montada só dos dados). Nada é "corrigido" com texto fixo.
      const v = verificarRespostaAsk(rawAnswer, { q, context });
      if (!v.ok) return { ok: false, kind: 'rejected', motivo: v.motivo };
      return { ok: true, answer: rawAnswer, model: dados.model || 'Qwen2.5-7B-Instruct-AWQ' };
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, kind: 'timeout' };
      return { ok: false, kind: 'upstream' };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, kind: 'upstream' };
}

const RX_EVENT_ID = /^[A-Za-z0-9_-]{1,80}$/;

/** Último evento "complete"/"error" de uma resposta SSE do Gradio: { evento, dado } ou null. */
export function lerSseGradio(texto) {
  let evento = null;
  let achado = null;
  for (const linha of String(texto ?? '').split(/\r?\n/)) {
    if (linha.startsWith('event:')) evento = linha.slice(6).trim();
    else if (linha.startsWith('data:') && (evento === 'complete' || evento === 'error')) achado = { evento, dado: linha.slice(5).trim() };
  }
  return achado;
}

/**
 * Chama o Space do Hugging Face (Gradio, ZeroGPU): POST /gradio_api/call/ask devolve um event_id; GET .../<event_id> devolve o
 * resultado em SSE. A cota diária da conta só é gasta enquanto a GPU trabalha. Mesma verificação pós-geração do Modal.
 * @returns mesmo formato de chamarModalAsk
 */
export async function chamarHfAsk(cfg, q, context, { doFetch, now, budget }) {
  if (!(await budget.consume(cfg.askHfDailyBudget))) return { ok: false, kind: 'budget' };
  const base = `${cfg.hfAskUrl.replace(/\/+$/, '')}/gradio_api/call/ask`;
  const cab = { Authorization: `Bearer ${cfg.hfToken}`, 'Content-Type': 'application/json' };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), Math.max(1, cfg.askHfTimeoutMs));
  try {
    const r1 = await doFetch(base, { method: 'POST', headers: cab, body: JSON.stringify({ data: [q, context || ''] }), signal: ctl.signal });
    if (r1.status === 401 || r1.status === 403) return { ok: false, kind: 'auth' };
    if (!r1.ok) return { ok: false, kind: 'upstream' };
    let id;
    try { id = JSON.parse(await r1.text())?.event_id; } catch { return { ok: false, kind: 'bad_output' }; }
    if (typeof id !== 'string' || !RX_EVENT_ID.test(id)) return { ok: false, kind: 'bad_output' };
    const r2 = await doFetch(`${base}/${id}`, { method: 'GET', headers: { Authorization: cab.Authorization }, signal: ctl.signal });
    if (!r2.ok) return { ok: false, kind: 'upstream' };
    const texto = await r2.text();
    if (texto.length > 60_000) return { ok: false, kind: 'bad_output' };
    const fim = lerSseGradio(texto);
    if (!fim || fim.evento !== 'complete') return { ok: false, kind: 'upstream' }; // inclui cota do dia esgotada e fila cheia
    let dados;
    try { dados = JSON.parse(fim.dado)?.[0]; } catch { return { ok: false, kind: 'bad_output' }; }
    if (!dados || dados.ok === false) return { ok: false, kind: 'upstream' };
    const rawAnswer = typeof dados.answer === 'string' ? dados.answer.trim() : null;
    if (!rawAnswer) return { ok: false, kind: 'bad_output' };
    const v = verificarRespostaAsk(rawAnswer, { q, context });
    if (!v.ok) return { ok: false, kind: 'rejected', motivo: v.motivo };
    return { ok: true, answer: rawAnswer, model: typeof dados.model === 'string' ? dados.model : 'Qwen2.5-7B-Instruct', provedor: 'hf' };
  } catch (e) {
    if (e && e.name === 'AbortError') return { ok: false, kind: 'timeout' };
    return { ok: false, kind: 'upstream' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Escolhe o provedor do texto gerado. Com o Space do Hugging Face configurado ele é o principal; o Modal só entra como RESERVA
 * (cota esgotada, Space fora do ar, tempo esgotado), com orçamento diário próprio e baixo. Resposta REPROVADA no verificador
 * não é refeita no outro provedor: é o mesmo modelo e o mesmo risco. Sem Hugging Face, vale o comportamento antigo (só Modal).
 */
export async function chamarAsk(cfg, q, context, { doFetch, now, state }) {
  if (!askTemHf(cfg)) return chamarModalAsk(cfg, q, context, { doFetch, now, budget: state.budget });
  const r = await chamarHfAsk(cfg, q, context, { doFetch, now, budget: state.budgetHf });
  if (r.ok || r.kind === 'rejected' || !askTemModal(cfg)) return r;
  const reserva = await chamarModalAsk({ ...cfg, dailyBudget: cfg.askModalDailyBudget }, q, context, { doFetch, now, budget: state.budgetModal });
  // a reserva também falhou: devolve o motivo do principal quando ele é mais informativo (ex.: orçamento do dia)
  return reserva.ok || reserva.kind === 'rejected' ? reserva : (r.kind === 'budget' && reserva.kind === 'budget' ? r : reserva);
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

    // Kill switch: desligado por padrão (ASK_ENABLED=1 + MODAL_ASK_ENDPOINT explícito + credenciais)
    if (!askAtivo(cfg)) {
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

    // --- limites COMPARTILHADOS entre instâncias (Redis opcional; falha aberto)
    const globalIp = await state.shared.hit(`ask:ip:${ip}`, 60, cfg.rateIpPerMin);
    const globalIid = globalIp.allowed ? await state.shared.hit(`ask:iid:${iid}`, 86400, cfg.rateIidPerDay) : globalIp;
    if (!globalIp.allowed || !globalIid.allowed) {
      meta.err = 'rate_limited';
      return responder(429, { ok: false, error: 'rate_limited' }, { 'Retry-After': String(Math.ceil(Math.max(globalIp.retryAfterMs, globalIid.retryAfterMs) / 1000)) });
    }

    // --- neutralidade (Res. TSE 23.755/2026): pedido de recomendação/previsão nunca chega ao modelo (sem custo de GPU)
    if (pedeRecomendacao(q)) {
      meta.err = 'neutrality';
      return responder(422, { ok: false, error: 'neutrality' });
    }

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
          if (!(await state.budget.consume(cfg.dailyBudget))) return { ok: false, kind: 'budget' };
          return {
            ok: true,
            answer: `Resposta simulada da IA Generativa para: "${q}". Informações com base no TSE.`,
            model: 'Qwen2.5-7B-Instruct-AWQ (mock)',
          };
        }
        return chamarAsk(cfg, q, context, { doFetch, now, state });
      })().finally(() => state.inflight.delete(chave));
      state.inflight.set(chave, pendente);
    }
    const r = await pendente;

    if (!r.ok) {
      meta.err = r.kind;
      if (r.kind === 'budget') return responder(503, { ok: false, error: 'budget' });
      if (r.kind === 'timeout') return responder(504, { ok: false, error: 'timeout' });
      if (r.kind === 'rejected') {
        meta.err = `rejected_${r.motivo}`;
        return responder(422, { ok: false, error: 'rejected' });
      }
      return responder(502, { ok: false, error: 'upstream' });
    }

    state.cache.set(chave, { answer: r.answer, model: r.model }, cfg.cacheTtlMs);
    return responder(200, { ok: true, answer: r.answer, model: r.model, cached: false });
  };
}
