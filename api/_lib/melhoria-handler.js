// POST /api/melhoria — captura, COM CONSENTIMENTO PRÓPRIO, das perguntas que o app não entendeu, para melhorar o NLU.
//
// É um canal DIFERENTE da "IA na nuvem" (que só interpreta uma pergunta e a descarta): aqui o texto é GUARDADO. Por isso:
//   - desligado por padrão: exige MELHORIA_ENABLED=1 E o Redis compartilhado configurado; sem isso responde 503 `disabled`.
//     Os clientes só mostram a opção quando o manifesto assinado traz cliente.melhoria.enabled=true (docs/OPERACAO.md §7);
//   - o cliente só envia se a pessoa ligou a opção (padrão desligado) e depois de mascarar dado pessoal; o servidor refaz a checagem
//     e DESCARTA (não mascara) qualquer item que tenha e-mail, CPF, telefone ou número longo;
//   - NÃO guarda iid, IP, intenção, resposta nem horário da pergunta: só o texto e quantas vezes apareceu no dia (hash por dia no Redis,
//     HINCRBY), com expiração de 90 dias. Isso dá frequência sem rastrear ninguém;
//   - o texto NUNCA é registrado em log; ninguém o lê automaticamente: o uso passa por revisão humana (backend/retrain/revisar.mjs).
// Atenção (LGPD): uma pergunta livre pode revelar opinião política (dado sensível, art. 5º II). O texto de consentimento do app precisa dizer isso
// e a política precisa ser atualizada ANTES de ligar (docs/PRIVACIDADE_melhoria_RASCUNHO.md).
//
// Entrada : { v:1, client:"android"|"web", iid:"<uuid>", itens:[ { q:"..." }, ... ] }   (até 10 itens, corpo ≤ 4 KB)
// Saída   : { ok:true, aceitas:n, descartadas:n }

import { readConfig } from './config.js';
import { createSharedLimiter, lerConfigCompartilhado } from './compartilhado.js';
import { avaliarCors, clientIp, json, readJsonBody } from './http.js';
import { createSlidingWindow, diaBrasilia, JANELAS } from './ratelimit.js';
import { redactPii } from './sanitize.js';
import { cleanText, MAX_Q, MIN_Q, UUID_RX } from './validate.js';
import { CLIENTS } from './vocab.js';

export const MAX_ITENS = 10;
export const RETENCAO_DIAS = 90;
const MARCAS_PII = ['[e-mail removido]', '[documento removido]', '[telefone removido]', '[número removido]'];

export function defaultLog(evento) {
  // Whitelist: nunca o texto, o IP ou o iid.
  const { evt, status, ms, client, err, aceitas, descartadas } = evento;
  console.log(JSON.stringify({ evt, status, ms, client, err, aceitas, descartadas }));
}

export function createMelhoriaState({ now = Date.now, shared = null } = {}) {
  return {
    shared: shared ?? createSharedLimiter({ now }),
    ipWindow: createSlidingWindow({ windowMs: JANELAS.HORA, now }),
    iidWindow: createSlidingWindow({ windowMs: JANELAS.DIA, now }),
  };
}

const fail = (status, error, field) => ({ ok: false, status, error, ...(field ? { field } : {}) });

/** Valida o corpo. Devolve { ok, value:{ client, iid, itens:string[] } }; os textos já limpos (cleanText) e com 3..300 caracteres. */
export function validateMelhoriaBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'bad_request', 'body');
  const { v, client, iid, itens } = body;
  if (v !== 1) return fail(400, 'bad_request', 'v');
  if (typeof client !== 'string' || !CLIENTS.has(client)) return fail(400, 'bad_request', 'client');
  if (typeof iid !== 'string' || !UUID_RX.test(iid)) return fail(400, 'bad_request', 'iid');
  if (!Array.isArray(itens) || itens.length === 0 || itens.length > MAX_ITENS) return fail(400, 'bad_request', 'itens');
  const textos = [];
  for (const it of itens) {
    if (it === null || typeof it !== 'object' || typeof it.q !== 'string') return fail(400, 'bad_request', 'itens');
    if (it.q.length > MAX_Q * 2) return fail(400, 'bad_request', 'itens');
    textos.push(it.q);
  }
  return { ok: true, value: { client, iid: iid.toLowerCase(), textos } };
}

/** Separa o que pode ser guardado do que deve ser descartado (sem mascarar: dado pessoal derruba o item inteiro). */
export function filtrarTextos(textos) {
  const aceitos = [];
  let descartadas = 0;
  const vistos = new Set();
  for (const bruto of textos) {
    const q = cleanText(bruto);
    if (q.length < MIN_Q || q.length > MAX_Q) { descartadas++; continue; }
    if (redactPii(q) !== q || MARCAS_PII.some((m) => q.includes(m))) { descartadas++; continue; }
    if (vistos.has(q)) { descartadas++; continue; } // repetida no mesmo envio
    vistos.add(q);
    aceitos.push(q);
  }
  return { aceitos, descartadas };
}

/** Comandos Redis do dia: HINCRBY por texto + EXPIRE do hash. */
export function comandosDoDia(textos, agora) {
  const chave = `st:sinais:${diaBrasilia(agora)}`;
  return [...textos.map((q) => ['HINCRBY', chave, q, '1']), ['EXPIRE', chave, String(RETENCAO_DIAS * 24 * 3600)]];
}

export function melhoriaAtiva(cfg, env) {
  return cfg.melhoriaEnabled && lerConfigCompartilhado(env).ativo;
}

export function createMelhoriaHandler(deps = {}) {
  const getEnv = deps.env ?? (() => process.env);
  const now = deps.now ?? (() => Date.now());
  const log = deps.log ?? defaultLog;
  const state = deps.state ?? createMelhoriaState({ now, shared: deps.shared ?? null });

  return async function handleMelhoria(request) {
    const t0 = now();
    const env = getEnv();
    const cfg = readConfig(env);
    const cors = avaliarCors(request, cfg.allowedOrigins, 'POST, OPTIONS');
    const meta = { client: undefined };
    const responder = (status, corpo, extra = {}) => {
      log({ evt: 'melhoria', status, ms: now() - t0, ...meta });
      return json(status, corpo, { ...cors.headers, ...extra });
    };

    if (!cors.allowed) return responder(403, { ok: false, error: 'origin' });
    if (request.method === 'OPTIONS') { meta.err = 'preflight'; return responder(204, null); }
    if (request.method !== 'POST') return responder(405, { ok: false, error: 'method_not_allowed' }, { Allow: 'POST, OPTIONS' });

    if (!melhoriaAtiva(cfg, env)) { meta.err = 'disabled'; return responder(503, { ok: false, error: 'disabled' }); }

    const corpo = await readJsonBody(request);
    if (!corpo.ok) { meta.err = corpo.error; return responder(corpo.status, { ok: false, error: corpo.error }); }
    const v = validateMelhoriaBody(corpo.value);
    if (!v.ok) { meta.err = `invalid_${v.field ?? 'body'}`; return responder(v.status, { ok: false, error: v.error, field: v.field }); }
    const { client, iid, textos } = v.value;
    meta.client = client;

    // limites: poucos envios por IP/hora e por instalação/dia (a captura é em lote, 1 envio já leva até 10 perguntas)
    const ip = clientIp(request);
    const porIp = state.ipWindow.check(ip, cfg.melhoriaPerHour);
    const porIid = state.iidWindow.check(iid, cfg.melhoriaPerDay);
    if (!porIp.allowed || !porIid.allowed) {
      meta.err = 'rate_limited';
      return responder(429, { ok: false, error: 'rate_limited' }, { 'Retry-After': String(Math.ceil(Math.max(porIp.retryAfterMs, porIid.retryAfterMs) / 1000)) });
    }
    state.ipWindow.record(ip);
    state.iidWindow.record(iid);
    const gIp = await state.shared.hit(`melhoria:ip:${ip}`, 3600, cfg.melhoriaPerHour);
    const gIid = gIp.allowed ? await state.shared.hit(`melhoria:iid:${iid}`, 86400, cfg.melhoriaPerDay) : gIp;
    if (!gIp.allowed || !gIid.allowed) {
      meta.err = 'rate_limited';
      return responder(429, { ok: false, error: 'rate_limited' }, { 'Retry-After': String(Math.ceil(Math.max(gIp.retryAfterMs, gIid.retryAfterMs) / 1000)) });
    }

    const { aceitos, descartadas } = filtrarTextos(textos);
    meta.aceitas = aceitos.length;
    meta.descartadas = descartadas;
    if (aceitos.length === 0) return responder(200, { ok: true, aceitas: 0, descartadas });

    const r = await state.shared.executar(comandosDoDia(aceitos, now()));
    if (r === null) { meta.err = 'store_unavailable'; return responder(503, { ok: false, error: 'unavailable' }); }
    return responder(200, { ok: true, aceitas: aceitos.length, descartadas });
  };
}
