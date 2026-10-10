// Validação de entrada de /api/nlu e /api/ask. Todas as funções são puras e devolvem { ok:true, value } ou { ok:false, status, error, field? }.

import { CLIENTS } from './vocab.js';

export const MAX_Q = 300;
export const MIN_Q = 3;
export const MAX_ASK_CONTEXT = 4000;
export const MAX_TRECHOS = 6;
export const MAX_TRECHO_TEXTO = 1200;
export const MAX_TRECHOS_TOTAL = 6000;
/** Tamanho máximo do corpo de /api/ask (pergunta + contexto + até 6 trechos). */
export const MAX_ASK_BODY_BYTES = 24_576;

/** UUID v4 ou v7 (versão 4/7, variante RFC 4122: 8, 9, a ou b). */
export const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** id de trecho: o mesmo de `data/quimica/textos/<fonte>/<id>.json`. */
export const TRECHO_ID_RX = /^[A-Za-z0-9._:-]{1,80}$/;

// C0/C1 de controle (menos tab, LF e CR), zero-width, marcas bidi e BOM. Montada por codigo: sem caracteres invisiveis no arquivo.
const FAIXAS_DE_CONTROLE = [[0, 8], [0xb, 0xc], [0xe, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x202a, 0x202e], [0x2060, 0x2064], [0x2066, 0x2069], [0xfeff, 0xfeff]];
export const CONTROLES = new RegExp(`[${FAIXAS_DE_CONTROLE.map(([a, b]) => `${String.fromCodePoint(a)}-${String.fromCodePoint(b)}`).join('')}]`, 'g');

/**
 * Limpa texto do usuário antes de qualquer uso: remove controles/zero-width, espaços repetidos e neutraliza os delimitadores
 * de token especial do ChatML do Qwen (`<|im_start|>`, `<|im_end|>`...), para que o texto não fabrique turnos de conversa no prompt.
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

/** Campos comuns: q, v, client, iid. */
function validarBase(body) {
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

/** Valida o corpo (já parseado) de POST /api/nlu: { q, v:1, client, iid }. */
export function validateNluBody(body) {
  return validarBase(body);
}

/** Valida o corpo de POST /api/ask: { q, context?, trechos?: [{id, texto}], v:1, client, iid }. */
export function validateAskBody(body) {
  const base = validarBase(body);
  if (!base.ok) return base;
  const { context, trechos } = body;

  let limpoContexto = '';
  if (context !== undefined && context !== null && context !== '') {
    if (typeof context !== 'string' || context.length > MAX_ASK_CONTEXT) return fail(400, 'bad_request', 'context');
    limpoContexto = cleanText(context);
  }

  const limpos = [];
  if (trechos !== undefined && trechos !== null) {
    if (!Array.isArray(trechos) || trechos.length > MAX_TRECHOS) return fail(400, 'bad_request', 'trechos');
    const vistos = new Set();
    let total = 0;
    for (const t of trechos) {
      if (!isObject(t) || typeof t.id !== 'string' || !TRECHO_ID_RX.test(t.id) || vistos.has(t.id)) return fail(400, 'bad_request', 'trechos');
      if (typeof t.texto !== 'string' || t.texto.length > MAX_TRECHO_TEXTO * 2) return fail(400, 'bad_request', 'trechos');
      const texto = cleanText(t.texto).slice(0, MAX_TRECHO_TEXTO);
      if (texto.length < 3) return fail(400, 'bad_request', 'trechos');
      total += texto.length;
      if (total > MAX_TRECHOS_TOTAL) return fail(400, 'bad_request', 'trechos');
      vistos.add(t.id);
      limpos.push({ id: t.id, texto });
    }
  }
  return { ok: true, value: { ...base.value, context: limpoContexto, trechos: limpos } };
}
