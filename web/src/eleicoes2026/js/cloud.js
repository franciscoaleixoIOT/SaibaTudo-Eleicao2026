// IA na nuvem (opcional, OPT-IN): só ajuda a INTERPRETAR a pergunta. Porte de CloudNlu.kt (NluValidator + CloudNluClient).
// A nuvem NUNCA fornece fatos: só entidades que são revalidadas contra os dados oficiais locais; qualquer valor fora do
// vocabulário é descartado (defesa contra alucinação). Contrato: docs/DATA_CONTRACT.md §9.
import { SIGLAS_SET, normalizar } from './model.js';
import { INTENTS } from './nlu.js';

const CARGOS_VALIDOS = new Set([
  'PRESIDENTE', 'VICE_PRESIDENTE', 'GOVERNADOR', 'VICE_GOVERNADOR', 'SENADOR',
  'DEPUTADO_FEDERAL', 'DEPUTADO_ESTADUAL', 'DEPUTADO_DISTRITAL'
]);
const HISTORICOS = new Set(['NUNCA_ELEITO', 'ELEITO_MESMO_CARGO', 'ELEITO_2_OU_MAIS']);

const sv = (o, k) => {
  const v = o?.[k];
  if (v == null || typeof v === 'object') return null;
  const s = String(v).trim();
  return s !== '' && s !== 'null' ? s : null;
};

/** Valida a saída do NLU da nuvem. Retorna ParsedQuery ou null (interpretação não confiável). */
export function validarNluNuvem(json, gaz, textoOriginal) {
  const nome0 = sv(json, 'intent');
  const intent = nome0 && INTENTS.includes(nome0.toUpperCase()) ? nome0.toUpperCase() : null;
  if (!intent || intent === 'DESCONHECIDA') return null;
  const cargoUp = sv(json, 'cargo')?.toUpperCase();
  const cargo = cargoUp && CARGOS_VALIDOS.has(cargoUp) ? cargoUp : null;
  const ufUp = sv(json, 'uf')?.toUpperCase();
  const uf = ufUp && SIGLAS_SET.has(ufUp) ? ufUp : null;
  const partido = sv(json, 'partido') ? (gaz.partidos.get(normalizar(sv(json, 'partido'))) ?? null) : null;
  const n = sv(json, 'nome');
  const nome = n && n.length >= 3 && n.length <= 60 && gaz.buscarPorNome(n, null, null, 1).length > 0 ? n : null;
  const t = Number(json?.turno);
  const turno = typeof json?.turno === 'number' && (t === 1 || t === 2) ? t : null;
  const h = sv(json, 'historico')?.toUpperCase();
  const historico = h && HISTORICOS.has(h) ? h : null;
  const apenasDeferidas = typeof json?.apenasDeferidas === 'boolean' ? json.apenasDeferidas : null;
  const temaS = sv(json, 'tema');
  const tema = temaS && /^[a-z_]{3,20}$/.test(temaS) ? temaS : null;
  const parsed = { intent, cargo, uf, partido, nome, tema, apenasDeferidas, historico, turno, textoOriginal };
  // Intenções que dependem de entidade: se a entidade foi descartada, a interpretação não é confiável
  if (intent === 'PERFIL_CANDIDATO' && nome == null) return null;
  if (intent === 'LISTAR_CANDIDATOS' && cargo == null && uf == null && partido == null && tema == null) return null;
  return parsed;
}

/** O backend leva até ~12 s (modelo em CPU, partida a frio): o cliente espera até ~14 s antes de seguir com a resposta local. */
export const TIMEOUT_NUVEM_MS = 14_000;

/** Cliente do NLU na nuvem (POST /api/nlu, mesma origem). Só é chamado com consentimento e se o NLU local não entendeu. */
export class NuvemNlu {
  /**
   * @param {{endpoint?: string, fetchFn?: typeof fetch, installId: () => string, habilitada: () => boolean, timeoutMs?: number}} o
   */
  constructor({ endpoint = '/api/nlu', fetchFn = (...a) => globalThis.fetch(...a), installId, habilitada, timeoutMs = TIMEOUT_NUVEM_MS }) {
    Object.assign(this, { endpoint, fetchFn, installId, habilitada, timeoutMs });
  }

  async interpretar(pergunta, gaz) {
    if (!this.habilitada()) return null; // nunca envia sem consentimento
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), this.timeoutMs) : null;
    try {
      const r = await this.fetchFn(this.endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'omit', cache: 'no-store',
        body: JSON.stringify({ q: pergunta.slice(0, 300), v: 1, client: 'web', iid: this.installId() }),
        signal: ctl?.signal
      });
      if (!r.ok) return null;
      const txt = await r.text();
      if (txt.length > 20000) return null;
      const raiz = JSON.parse(txt);
      if (raiz?.ok !== true || !raiz.nlu || typeof raiz.nlu !== 'object') return null;
      return validarNluNuvem(raiz.nlu, gaz, pergunta);
    } catch {
      return null; // rede/timeout/JSON malformado: segue com a resposta local
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

/** Cliente do canal de correções (POST /api/report), SOMENTE após ação explícita do usuário. */
export async function enviarRelato(r, { endpoint = '/api/report', fetchFn = (...a) => globalThis.fetch(...a) } = {}) {
  const corpo = {
    q: r.pergunta.slice(0, 300), a: r.resposta.slice(0, 1500), intent: r.intencao, origem: r.origem,
    dataVersion: r.versaoDados ?? '', app: r.versaoApp, note: (r.comentario ?? '').slice(0, 500), client: 'web'
  };
  try {
    const res = await fetchFn(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'omit', cache: 'no-store', body: JSON.stringify(corpo)
    });
    return res.ok;
  } catch {
    return false;
  }
}
