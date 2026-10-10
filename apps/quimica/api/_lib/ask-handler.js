// Núcleo do POST /api/ask (Request/Response padrão): explicação gerada, ANCORADA nos trechos licenciados e nos dados que o app enviou.
// Provedor principal: Space do Hugging Face (ZeroGPU). Reserva: Modal (orçamento diário próprio e baixo). A resposta só sai se passar
// no verificador de fidelidade (fidelidade.js): números, fórmulas, segurança e citações. O TEXTO DA PERGUNTA NUNCA É REGISTRADO em log.

import { askAtivo, askTemHf, askTemModal, readConfig } from './config.js';
import { createSharedLimiter, orcamentoComCompartilhado } from './compartilhado.js';
import { verificarFidelidade } from './fidelidade.js';
import { avaliarPedido } from './seguranca.js';
import { avaliarCors, clientIp, json, readJsonBody } from './http.js';
import { createCache, normalizeQuestion } from './cache.js';
import { createDailyBudget, createSlidingWindow, JANELAS } from './ratelimit.js';
import { MAX_ASK_BODY_BYTES, validateAskBody } from './validate.js';

export function defaultLog(evento) {
  // Whitelist de campos: status, latência, cache, client, motivo — nunca pergunta, resposta, IP ou iid.
  const { evt, status, ms, cache, client, err, provider } = evento;
  console.log(JSON.stringify({ evt, status, ms, cache, client, err, provider }));
}

/** Estado em memória da instância (limitadores, orçamentos, cache, requisições em andamento). */
export function createAskState({ now = Date.now, cacheMax = 500, cacheTtlMs = 3600_000, shared = null } = {}) {
  const compartilhado = shared ?? createSharedLimiter({ now });
  return {
    shared: compartilhado,
    ipWindow: createSlidingWindow({ windowMs: JANELAS.MINUTO, now }),
    iidWindow: createSlidingWindow({ windowMs: JANELAS.DIA, now }),
    // um orçamento para o Hugging Face (protege a cota diária da conta) e outro, pequeno, para a reserva no Modal (GPU cobra o contêiner)
    budgetHf: orcamentoComCompartilhado(createDailyBudget({ now }), compartilhado, 'ask-hf'),
    budgetModal: orcamentoComCompartilhado(createDailyBudget({ now }), compartilhado, 'ask-modal'),
    cache: createCache({ maxEntries: cacheMax, ttlMs: cacheTtlMs, now }),
    inflight: new Map(),
  };
}

/** Verificação pós-geração comum aos dois provedores. */
function conferir(rawAnswer, dados, modelo, provedor) {
  const v = verificarFidelidade(rawAnswer, dados);
  if (!v.ok) return { ok: false, kind: 'rejected', motivo: v.motivo };
  return { ok: true, answer: rawAnswer, model: modelo, fontes: v.fontes, provedor };
}

/**
 * Chama o endpoint de texto no Modal (reserva) com autenticação de proxy.
 * @returns {Promise<{ok:true, answer:string, model:string, fontes:string[]} | {ok:false, kind:'timeout'|'upstream'|'auth'|'bad_output'|'budget'|'rejected', motivo?:string}>}
 */
export async function chamarModalAsk(cfg, dados, { doFetch, now, budget }) {
  const limite = now() + cfg.askTimeoutMs;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const restante = limite - now();
    if (tentativa === 1 && restante < 1000) break;
    if (!(await budget.consume(cfg.askModalDailyBudget))) {
      return tentativa === 0 ? { ok: false, kind: 'budget' } : { ok: false, kind: 'upstream' };
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), Math.max(1, restante));
    try {
      const resp = await doFetch(cfg.modalAskEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Modal-Key': cfg.modalKey, 'Modal-Secret': cfg.modalSecret },
        body: JSON.stringify({ question: dados.q, context: dados.context || '', trechos: dados.trechos }),
        signal: ctl.signal,
      });
      if (resp.status >= 500) continue; // retry em 5xx
      if (resp.status === 401 || resp.status === 403) return { ok: false, kind: 'auth' };
      if (!resp.ok) return { ok: false, kind: 'upstream' };
      const texto = await resp.text();
      if (texto.length > 50_000) return { ok: false, kind: 'bad_output' };
      let corpo;
      try {
        corpo = JSON.parse(texto);
      } catch {
        return { ok: false, kind: 'bad_output' };
      }
      if (corpo && corpo.ok === false) return { ok: false, kind: 'upstream' };
      const resposta = typeof corpo?.answer === 'string' ? corpo.answer.trim() : null;
      if (!resposta) return { ok: false, kind: 'bad_output' };
      return conferir(resposta, dados, typeof corpo.model === 'string' ? corpo.model : cfg.askModelVersion, 'modal');
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
 * resultado em SSE. A cota diária da conta só é gasta enquanto a GPU trabalha. Entradas do Space: [pergunta, contexto, trechos (JSON)].
 */
export async function chamarHfAsk(cfg, dados, { doFetch, budget }) {
  if (!(await budget.consume(cfg.askHfDailyBudget))) return { ok: false, kind: 'budget' };
  const base = `${cfg.hfAskUrl.replace(/\/+$/, '')}/gradio_api/call/ask`;
  const cab = { Authorization: `Bearer ${cfg.hfToken}`, 'Content-Type': 'application/json' };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), Math.max(1, cfg.askHfTimeoutMs));
  try {
    const corpo = JSON.stringify({ data: [dados.q, dados.context || '', JSON.stringify(dados.trechos)] });
    const r1 = await doFetch(base, { method: 'POST', headers: cab, body: corpo, signal: ctl.signal });
    if (r1.status === 401 || r1.status === 403) return { ok: false, kind: 'auth' };
    if (!r1.ok) return { ok: false, kind: 'upstream' };
    let id;
    try {
      id = JSON.parse(await r1.text())?.event_id;
    } catch {
      return { ok: false, kind: 'bad_output' };
    }
    if (typeof id !== 'string' || !RX_EVENT_ID.test(id)) return { ok: false, kind: 'bad_output' };
    const r2 = await doFetch(`${base}/${id}`, { method: 'GET', headers: { Authorization: cab.Authorization }, signal: ctl.signal });
    if (!r2.ok) return { ok: false, kind: 'upstream' };
    const texto = await r2.text();
    if (texto.length > 60_000) return { ok: false, kind: 'bad_output' };
    const fim = lerSseGradio(texto);
    if (!fim || fim.evento !== 'complete') return { ok: false, kind: 'upstream' }; // inclui cota do dia esgotada e fila cheia
    let saida;
    try {
      saida = JSON.parse(fim.dado)?.[0];
    } catch {
      return { ok: false, kind: 'bad_output' };
    }
    if (!saida || saida.ok === false) return { ok: false, kind: 'upstream' };
    const resposta = typeof saida.answer === 'string' ? saida.answer.trim() : null;
    if (!resposta) return { ok: false, kind: 'bad_output' };
    return conferir(resposta, dados, typeof saida.model === 'string' ? saida.model : cfg.askModelVersion, 'hf');
  } catch (e) {
    if (e && e.name === 'AbortError') return { ok: false, kind: 'timeout' };
    return { ok: false, kind: 'upstream' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Escolhe o provedor do texto gerado. Com o Space do Hugging Face configurado ele é o principal; o Modal só entra como RESERVA
 * (cota esgotada, Space fora do ar, tempo esgotado), com orçamento diário próprio e baixo. Resposta REPROVADA no verificador não é
 * refeita no outro provedor: é o mesmo modelo e o mesmo risco. Sem Hugging Face, vale só o Modal.
 */
export async function chamarAsk(cfg, dados, { doFetch, now, state }) {
  if (!askTemHf(cfg)) return chamarModalAsk(cfg, dados, { doFetch, now, budget: state.budgetModal });
  const r = await chamarHfAsk(cfg, dados, { doFetch, budget: state.budgetHf });
  if (r.ok || r.kind === 'rejected' || !askTemModal(cfg)) return r;
  const reserva = await chamarModalAsk(cfg, dados, { doFetch, now, budget: state.budgetModal });
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
    const meta = { client: undefined, cache: 'na' };

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

    // Kill switch: desligado por padrão (ASK_ENABLED=1 + provedor configurado)
    if (!askAtivo(cfg)) {
      meta.err = 'disabled';
      return responder(503, { ok: false, error: 'disabled' });
    }

    const corpo = await readJsonBody(request, MAX_ASK_BODY_BYTES);
    if (!corpo.ok) {
      meta.err = corpo.error;
      return responder(corpo.status, { ok: false, error: corpo.error });
    }
    const v = validateAskBody(corpo.value);
    if (!v.ok) {
      meta.err = `invalid_${v.field ?? 'body'}`;
      return responder(v.status, { ok: false, error: v.error, field: v.field });
    }
    const dados = v.value;
    const { q, client, iid, context, trechos } = dados;
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

    // --- segurança química: pedido perigoso nunca chega ao modelo (sem custo de GPU); o cliente mostra a recusa padrão
    if (avaliarPedido(q).recusar) {
      meta.err = 'seguranca';
      return responder(422, { ok: false, error: 'seguranca' });
    }

    // --- cache (a chave inclui a versão do modelo, o contexto e os trechos enviados)
    const ids = trechos.map((t) => t.id).join(',');
    const chave = `ask|${cfg.askModelVersion}|${normalizeQuestion(q)}|${normalizeQuestion(context)}|${ids}|${normalizeQuestion(trechos.map((t) => t.texto).join(' '))}`;
    const emCache = state.cache.get(chave);
    if (emCache) {
      meta.cache = 'hit';
      return responder(200, { ok: true, answer: emCache.answer, model: emCache.model, fontes: emCache.fontes, cached: true });
    }
    meta.cache = 'miss';

    // --- chamada ao modelo (coalescida: pedidos idênticos simultâneos compartilham 1 chamada)
    let pendente = state.inflight.get(chave);
    if (!pendente) {
      pendente = chamarAsk(cfg, dados, { doFetch, now, state }).finally(() => state.inflight.delete(chave));
      state.inflight.set(chave, pendente);
    }
    const r = await pendente;

    if (!r.ok) {
      meta.err = r.kind;
      if (r.kind === 'budget') return responder(503, { ok: false, error: 'budget' });
      if (r.kind === 'timeout') return responder(504, { ok: false, error: 'timeout' });
      if (r.kind === 'rejected') {
        meta.err = `rejected_${r.motivo}`; // só o motivo; nunca o texto gerado
        return responder(422, { ok: false, error: 'rejected' });
      }
      return responder(502, { ok: false, error: 'upstream' });
    }

    meta.provider = r.provedor;
    state.cache.set(chave, { answer: r.answer, model: r.model, fontes: r.fontes }, cfg.cacheTtlMs);
    return responder(200, { ok: true, answer: r.answer, model: r.model, fontes: r.fontes, cached: false });
  };
}
