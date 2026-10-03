// Validação de entrada de /api/nlu e /api/report (contrato: docs/DATA_CONTRACT.md §9).
// Todas as funções são puras e devolvem { ok:true, value } ou { ok:false, status, error, field? }.

import { CLIENTS, INTENT_SET, ORIGENS } from './vocab.js';

export const MAX_Q = 300;
export const MIN_Q = 3;

/** UUID v4 ou v7 (versão 4/7, variante RFC 4122: 8, 9, a ou b). */
export const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// C0/C1 de controle (exceto \t \n \r), zero-width, marcas bidi e BOM.
const CONTROLES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

/**
 * Limpa texto do usuário antes de qualquer uso: remove controles/zero-width, espaços repetidos e
 * neutraliza os delimitadores de token especial do ChatML do Qwen (`<|im_start|>`, `<|im_end|>`...),
 * para que a pergunta não consiga fabricar turnos de conversa no prompt.
 */
export function cleanText(s) {
  return String(s)
    .replace(CONTROLES, ' ')
    .replace(/<\|/g, '< |')
    .replace(/\|>/g, '| >')
    .replace(/\s+/g, ' ')
    .trim();
}

const fail = (status, error, field) => ({ ok: false, status, error, ...(field ? { field } : {}) });

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Valida o corpo (já parseado) de POST /api/nlu. */
export function validateNluBody(body) {
  if (!isObject(body)) return fail(400, 'bad_request', 'body');
  const { q, v, client, iid } = body;
  if (typeof q !== 'string') return fail(400, 'bad_request', 'q');
  if (q.length > MAX_Q) return fail(400, 'bad_request', 'q');
  const limpa = cleanText(q);
  if (limpa.length < MIN_Q) return fail(400, 'bad_request', 'q');
  if (v !== 1) return fail(400, 'bad_request', 'v');
  if (typeof client !== 'string' || !CLIENTS.has(client)) return fail(400, 'bad_request', 'client');
  if (typeof iid !== 'string' || !UUID_RX.test(iid)) return fail(400, 'bad_request', 'iid');
  return { ok: true, value: { q: limpa, client, iid: iid.toLowerCase() } };
}

// ---------------------------------------------------------------- geração de texto (/api/ask)

export const MAX_ASK_CONTEXT = 4000;

/** Valida o corpo (já parseado) de POST /api/ask. */
export function validateAskBody(body) {
  if (!isObject(body)) return fail(400, 'bad_request', 'body');
  const { q, v, client, iid, context } = body;
  if (typeof q !== 'string') return fail(400, 'bad_request', 'q');
  if (q.length > MAX_Q) return fail(400, 'bad_request', 'q');
  const limpa = cleanText(q);
  if (limpa.length < MIN_Q) return fail(400, 'bad_request', 'q');
  if (v !== 1) return fail(400, 'bad_request', 'v');
  if (typeof client !== 'string' || !CLIENTS.has(client)) return fail(400, 'bad_request', 'client');
  if (typeof iid !== 'string' || !UUID_RX.test(iid)) return fail(400, 'bad_request', 'iid');
  let limpaContexto = '';
  if (context !== undefined && context !== null && context !== '') {
    if (typeof context !== 'string') return fail(400, 'bad_request', 'context');
    if (context.length > MAX_ASK_CONTEXT) return fail(400, 'bad_request', 'context');
    limpaContexto = cleanText(context);
  }
  return { ok: true, value: { q: limpa, client, iid: iid.toLowerCase(), context: limpaContexto } };
}

// ---------------------------------------------------------------- relatos (/api/report)

export const MAX_REPORT_Q = 300;
export const MAX_REPORT_A = 1500;
export const MAX_REPORT_NOTE = 500;

const DATAVERSION_RX = /^[A-Za-z0-9._:-]{3,64}$/;
const APP_RX = /^[A-Za-z0-9 ._()+/-]{1,40}$/;

function campoTexto(body, nome, max, { obrigatorio }) {
  const v = body[nome];
  if (v === undefined || v === null || v === '') {
    return obrigatorio ? fail(400, 'bad_request', nome) : { ok: true, value: '' };
  }
  if (typeof v !== 'string') return fail(400, 'bad_request', nome);
  // Limite duro de entrada (evita processar textos gigantes); o excesso moderado é truncado na sanitização.
  if (v.length > max * 4) return fail(400, 'bad_request', nome);
  return { ok: true, value: v };
}

/**
 * Valida o corpo de POST /api/report: { q, a, intent, origem, dataVersion, app, note, client }.
 * Os campos livres (q, a, note) são devolvidos CRUS (sem truncar) para a sanitização; os
 * campos de metadados são validados com regex estritas (entram na issue dentro de código inline).
 */
export function validateReportBody(body) {
  if (!isObject(body)) return fail(400, 'bad_request', 'body');

  const q = campoTexto(body, 'q', MAX_REPORT_Q, { obrigatorio: true });
  if (!q.ok) return q;
  const a = campoTexto(body, 'a', MAX_REPORT_A, { obrigatorio: true });
  if (!a.ok) return a;
  const note = campoTexto(body, 'note', MAX_REPORT_NOTE, { obrigatorio: false });
  if (!note.ok) return note;

  const dataVersion = body.dataVersion;
  if (typeof dataVersion !== 'string' || !DATAVERSION_RX.test(dataVersion)) return fail(400, 'bad_request', 'dataVersion');
  const app = body.app;
  if (typeof app !== 'string' || !APP_RX.test(app)) return fail(400, 'bad_request', 'app');
  const client = body.client;
  if (typeof client !== 'string' || !CLIENTS.has(client)) return fail(400, 'bad_request', 'client');

  let intent = 'DESCONHECIDA';
  if (body.intent !== undefined && body.intent !== null && body.intent !== '') {
    if (typeof body.intent !== 'string') return fail(400, 'bad_request', 'intent');
    const i = body.intent.trim().toUpperCase();
    if (!INTENT_SET.has(i)) return fail(400, 'bad_request', 'intent');
    intent = i;
  }
  let origem = 'LOCAL';
  if (body.origem !== undefined && body.origem !== null && body.origem !== '') {
    if (typeof body.origem !== 'string') return fail(400, 'bad_request', 'origem');
    const o = body.origem.trim().toUpperCase();
    if (!ORIGENS.has(o)) return fail(400, 'bad_request', 'origem');
    origem = o;
  }

  return {
    ok: true,
    value: { q: q.value, a: a.value, note: note.value, intent, origem, dataVersion, app, client },
  };
}
