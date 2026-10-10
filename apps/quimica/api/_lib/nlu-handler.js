// Núcleo do POST /api/nlu (Request/Response padrão). Fluxo:
//   CORS/origem -> método -> kill switch -> corpo/validação -> rate limit (IP e iid, local e compartilhado)
//   -> SEGURANÇA (regra, antes do modelo) -> cache -> orçamento diário -> Modal (timeout, 1 retry só em 5xx)
//   -> normalização + ancoragem -> cache -> resposta.
// O TEXTO DA PERGUNTA NUNCA É REGISTRADO em log (só status, latência, cache, client, motivo).

import { nluAtivo, readConfig } from './config.js';
import { avaliarCors, clientIp, json, readJsonBody } from './http.js';
import { createCache, normalizeQuestion } from './cache.js';
import { createDailyBudget, createSlidingWindow, JANELAS } from './ratelimit.js';
import { createSharedLimiter, orcamentoComCompartilhado } from './compartilhado.js';
import { normalizeModelOutput } from './normalize.js';
import { avaliarPedido } from './seguranca.js';
import { validateNluBody } from './validate.js';

export function defaultLog(evento) {
  // Whitelist de campos: status, latência, cache, client, motivo — nunca pergunta, IP ou iid.
  const { evt, status, ms, cache, client, err, drop } = evento;
  console.log(JSON.stringify({ evt, status, ms, cache, client, err, drop }));
}

/** Estado em memória da instância (limitadores, orçamento, cache, requisições em andamento). */
export function createNluState({ now = Date.now, cacheMax = 500, cacheTtlMs = 3600_000, shared = null } = {}) {
  const compartilhado = shared ?? createSharedLimiter({ now });
  return {
    shared: compartilhado,
    ipWindow: createSlidingWindow({ windowMs: JANELAS.MINUTO, now }),
    iidWindow: createSlidingWindow({ windowMs: JANELAS.DIA, now }),
    // orçamento = local (por instância) E compartilhado (global, se Redis configurado); consume() é assíncrono
    budget: orcamentoComCompartilhado(createDailyBudget({ now }), compartilhado, 'nlu'),
    cache: createCache({ maxEntries: cacheMax, ttlMs: cacheTtlMs, now }),
    inflight: new Map(),
  };
}

/**
 * Chama o Modal. Timeout TOTAL (AbortController) = cfg.timeoutMs; 1 retry apenas em resposta 5xx (consome orçamento de novo e só
 * ocorre se sobrar tempo). Timeouts/erros de rede não são repetidos.
 * @returns {Promise<{ok:true, output:any} | {ok:false, kind:'timeout'|'upstream'|'auth'|'bad_output'|'budget'}>}
 */
export async function chamarModal(cfg, q, { doFetch, now, budget }) {
  const limite = now() + cfg.timeoutMs;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const restante = limite - now();
    if (tentativa === 1 && restante < 800) break;
    if (!(await budget.consume(cfg.dailyBudget))) {
      return tentativa === 0 ? { ok: false, kind: 'budget' } : { ok: false, kind: 'upstream' };
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), Math.max(1, restante));
    try {
      const resp = await doFetch(cfg.modalEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Modal-Key': cfg.modalKey, 'Modal-Secret': cfg.modalSecret },
        body: JSON.stringify({ q, v: 1 }),
        signal: ctl.signal,
      });
      if (resp.status >= 500) continue; // 5xx: 1 retry
      if (resp.status === 401 || resp.status === 403) return { ok: false, kind: 'auth' };
      if (!resp.ok) return { ok: false, kind: 'upstream' };
      const texto = await resp.text();
      if (texto.length > 20_000) return { ok: false, kind: 'bad_output' };
      let dados;
      try {
        dados = JSON.parse(texto);
      } catch {
        return { ok: false, kind: 'bad_output' };
      }
      if (dados && dados.ok === false) return { ok: false, kind: 'upstream' };
      // Contrato do Modal: { ok:true, output:{...JSON do modelo...}, model, ms }. Tolera o objeto direto.
      return { ok: true, output: dados && dados.output !== undefined ? dados.output : dados };
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, kind: 'timeout' };
      return { ok: false, kind: 'upstream' };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, kind: 'upstream' };
}

export function createNluHandler(deps = {}) {
  const getEnv = deps.env ?? (() => process.env);
  const now = deps.now ?? (() => Date.now());
  const doFetch = deps.fetch ?? ((...args) => globalThis.fetch(...args));
  const log = deps.log ?? defaultLog;
  const state = deps.state ?? createNluState({ now });

  return async function handleNlu(request) {
    const t0 = now();
    const cfg = readConfig(getEnv());
    const cors = avaliarCors(request, cfg.allowedOrigins, 'POST, OPTIONS');
    const meta = { client: undefined, cache: 'na' };

    const responder = (status, corpo, extra = {}) => {
      log({ evt: 'nlu', status, ms: now() - t0, ...meta });
      return json(status, corpo, { ...cors.headers, ...extra });
    };

    if (!cors.allowed) return responder(403, { ok: false, error: 'origin' });
    if (request.method === 'OPTIONS') {
      meta.err = 'preflight';
      return responder(204, null);
    }
    if (request.method !== 'POST') return responder(405, { ok: false, error: 'method_not_allowed' }, { Allow: 'POST, OPTIONS' });

    // Kill switch: MODAL_ENDPOINT vazio (ou sem credenciais) desliga a nuvem; os clientes caem no NLU local.
    if (!nluAtivo(cfg)) {
      meta.err = 'disabled';
      return responder(503, { ok: false, error: 'disabled' });
    }

    const corpo = await readJsonBody(request);
    if (!corpo.ok) {
      meta.err = corpo.error;
      return responder(corpo.status, { ok: false, error: corpo.error });
    }
    const v = validateNluBody(corpo.value);
    if (!v.ok) {
      meta.err = `invalid_${v.field ?? 'body'}`;
      return responder(v.status, { ok: false, error: v.error, field: v.field });
    }
    const { q, client, iid } = v.value;
    meta.client = client;

    // --- rate limit (IP por minuto e iid por dia). Só consome se ambos permitirem.
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
    const globalIp = await state.shared.hit(`nlu:ip:${ip}`, 60, cfg.rateIpPerMin);
    const globalIid = globalIp.allowed ? await state.shared.hit(`nlu:iid:${iid}`, 86400, cfg.rateIidPerDay) : globalIp;
    if (!globalIp.allowed || !globalIid.allowed) {
      meta.err = 'rate_limited';
      return responder(429, { ok: false, error: 'rate_limited' }, { 'Retry-After': String(Math.ceil(Math.max(globalIp.retryAfterMs, globalIid.retryAfterMs) / 1000)) });
    }

    // --- segurança química: pedido perigoso NUNCA chega ao modelo (sem custo); o cliente mostra a recusa padrão
    const seg = avaliarPedido(q);
    if (seg.recusar) {
      meta.err = 'seguranca';
      return responder(200, { ok: true, nlu: { intent: 'RECUSA_PERIGO' }, model: 'regra', cached: false });
    }

    // --- cache (chave inclui a versão do modelo: promoção de versão invalida o cache)
    const chave = `${cfg.modelVersion}|${normalizeQuestion(q)}`;
    const emCache = state.cache.get(chave);
    if (emCache) {
      meta.cache = 'hit';
      return responder(200, { ok: true, nlu: emCache, model: cfg.modelVersion, cached: true });
    }
    meta.cache = 'miss';

    // --- chamada ao modelo (coalescida: perguntas idênticas simultâneas compartilham 1 chamada)
    let pendente = state.inflight.get(chave);
    if (!pendente) {
      pendente = chamarModal(cfg, q, { doFetch, now, budget: state.budget }).finally(() => state.inflight.delete(chave));
      state.inflight.set(chave, pendente);
    }
    const r = await pendente;

    if (!r.ok) {
      meta.err = r.kind;
      if (r.kind === 'budget') return responder(503, { ok: false, error: 'budget' });
      if (r.kind === 'timeout') return responder(504, { ok: false, error: 'timeout' });
      return responder(502, { ok: false, error: 'upstream' });
    }

    const n = normalizeModelOutput(r.output, { question: q });
    if (!n.ok) {
      meta.err = n.error;
      return responder(502, { ok: false, error: 'bad_model_output' });
    }
    meta.drop = n.dropped.length;
    state.cache.set(chave, n.nlu, cfg.cacheTtlMs);
    return responder(200, { ok: true, nlu: n.nlu, model: cfg.modelVersion, cached: false });
  };
}
