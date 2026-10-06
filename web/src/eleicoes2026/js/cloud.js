// IA na nuvem (opcional, OPT-IN): só ajuda a INTERPRETAR a pergunta. Porte de CloudNlu.kt (NluValidator + CloudNluClient).
// A nuvem NUNCA fornece fatos: só entidades que são revalidadas contra os dados oficiais locais; qualquer valor fora do
// vocabulário é descartado (defesa contra alucinação). Contrato: docs/DATA_CONTRACT.md §9.
// Consentimento: por pergunta (botão "Perguntar à IA na nuvem" na resposta não entendida) ou contínuo (modo automático,
// desligado por padrão em Configurações).
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
  // Entidades novas (número, gênero, vice, indeferidas): aceitas só em formato estrito, como no CloudNlu.kt
  const apenasIndeferidas = typeof json?.apenasIndeferidas === 'boolean' ? json.apenasIndeferidas : null;
  const numS = sv(json, 'numero');
  const numero = numS && /^\d{2,5}$/.test(numS) ? numS : null;
  const genS = sv(json, 'genero')?.toUpperCase();
  const genero = genS === 'FEMININO' || genS === 'MASCULINO' ? genS : null;
  const vice = json?.vice === true;
  const parsed = {
    intent, cargo, uf, partido, nome, tema, apenasDeferidas, apenasIndeferidas, historico, turno,
    numero, genero, vice, nacional: false, textoOriginal
  };
  // Intenções que dependem de entidade: se a entidade foi descartada, a interpretação não é confiável
  if (intent === 'PERFIL_CANDIDATO' && nome == null && numero == null) return null;
  if (intent === 'LISTAR_CANDIDATOS' && cargo == null && uf == null && partido == null && tema == null) return null;
  return parsed;
}

/** O backend leva até ~12 s (modelo em CPU, partida a frio): o cliente espera até ~14 s antes de seguir com a resposta local. */
export const TIMEOUT_NUVEM_MS = 14_000;
/** Pedido explícito ("Perguntar à IA na nuvem"): a pessoa escolheu esperar, então o cliente aguarda até 25 s (partida a frio). */
export const TIMEOUT_NUVEM_EXPLICITA_MS = 25_000;

/** Textos da IA na nuvem exibidos no app (botão na resposta, espera, falha e a chave do modo automático). */
export const NUVEM_TEXTOS = Object.freeze({
  botao: 'Perguntar à IA na nuvem',
  nota: 'Envia só o texto desta pergunta ao nosso servidor para interpretar; a resposta continua vindo dos dados oficiais. Pode levar até 20 s.',
  // resposta já entendida: o botão gera TEXTO por modelo de IA (só quando o pacote assinado liga cliente.ask.enabled)
  botaoGerar: 'Gerar explicação com IA (pode conter erros)',
  notaGerar: 'Envia a pergunta e um resumo da resposta acima ao nosso servidor. O texto é gerado por modelo de IA, pode conter erros e não é dado oficial; os dados oficiais são os do app. Pode levar até 25 s.',
  // resposta já entendida pelo app e IA generativa desligada: o botão pede uma SEGUNDA interpretação (a resposta continua vindo dos dados oficiais)
  notaConferir: 'A resposta acima veio do app. Se não era o que você queria, a IA na nuvem tenta entender a pergunta de outro jeito; a resposta continua vindo dos dados oficiais. Envia só o texto desta pergunta. Pode levar até 20 s.',
  falhouConferir: 'A IA na nuvem não trouxe outra resposta agora (indisponível, demorou demais ou não entendeu a pergunta). A resposta acima continua valendo.',
  consultando: 'Consultando a IA na nuvem…',
  falhou: 'A IA na nuvem não conseguiu interpretar agora (indisponível ou demorou demais). Tente reformular citando cargo, estado, partido, nome ou número do candidato.',
  chave: 'IA na nuvem automática',
  descricaoChave: 'Desligada por padrão. Quando o app não entende uma pergunta, você pode tocar em "Perguntar à IA na nuvem" para enviar só aquela pergunta. ' +
    'Ligue aqui para isso acontecer automaticamente. Só o texto da pergunta é enviado, com um código aleatório da instalação; as respostas vêm sempre dos dados oficiais.'
});

/** Cliente do NLU na nuvem (POST /api/nlu, mesma origem). Só é chamado com consentimento e se o NLU local não entendeu. */
export class NuvemNlu {
  /**
   * @param {{endpoint?: string, fetchFn?: typeof fetch, installId: () => string, habilitada: () => boolean, timeoutMs?: number,
   *   timeoutExplicitoMs?: number}} o  `habilitada`: consentimento contínuo (modo automático, Configurações).
   */
  constructor({
    endpoint = '/api/nlu', fetchFn = (...a) => globalThis.fetch(...a), installId, habilitada, timeoutMs = TIMEOUT_NUVEM_MS,
    timeoutExplicitoMs = TIMEOUT_NUVEM_EXPLICITA_MS
  }) {
    Object.assign(this, { endpoint, fetchFn, installId, habilitada, timeoutMs, timeoutExplicitoMs });
  }

  /** Modo automático: só envia com o consentimento contínuo ligado em Configurações. */
  async interpretar(pergunta, gaz) {
    if (!this.habilitada()) return null; // nunca envia sem consentimento
    return this._enviar(pergunta, gaz, this.timeoutMs);
  }

  /**
   * Pedido explícito: o toque em "Perguntar à IA na nuvem" é o consentimento para enviar SÓ esta pergunta (não liga o modo
   * automático). Mesmo formato de requisição; espera até 25 s.
   */
  async interpretarAgora(pergunta, gaz) {
    return this._enviar(pergunta, gaz, this.timeoutExplicitoMs);
  }

  async _enviar(pergunta, gaz, timeoutMs) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
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

  /**
   * Resposta generativa da Qwen 7B ancorada no TSE (POST /api/ask).
   * @param {string} pergunta
   * @param {string} [contexto]
   * @param {number} [timeoutMs]
   */
  async gerarResposta(pergunta, contexto = '', timeoutMs = this.timeoutExplicitoMs) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    try {
      const r = await this.fetchFn('/api/ask', {
        method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'omit', cache: 'no-store',
        body: JSON.stringify({
          q: pergunta.slice(0, 300), context: (contexto || '').slice(0, 3000), v: 1, client: 'web', iid: this.installId()
        }),
        signal: ctl?.signal
      });
      if (!r.ok) return null;
      const txt = await r.text();
      if (txt.length > 50000) return null;
      const raiz = JSON.parse(txt);
      if (raiz?.ok !== true || typeof raiz.answer !== 'string' || !raiz.answer.trim()) return null;
      return { answer: raiz.answer.trim(), model: raiz.model || 'Qwen2.5-7B-Instruct-AWQ' };
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

/** Intenções cuja resposta não depende de interpretação (recusa neutra e saudação): não há o que reinterpretar na nuvem. */
const SEM_NUVEM = new Set(['RECOMENDACAO', 'AJUDA']);

/**
 * A resposta atual oferece o botão "Perguntar à IA na nuvem"? Sempre que ela não veio da nuvem, INCLUSIVE depois de uma resposta local
 * entendida: a IA local às vezes erra e a da nuvem interpreta melhor, então a pessoa pode pedir uma segunda interpretação. Com o modo
 * automático ligado, a nuvem já foi tentada nas perguntas não entendidas (não repete); nas entendidas localmente o botão continua.
 * (Com `cliente.ask.enabled` no pacote assinado, o mesmo botão de uma resposta entendida passa a gerar texto por modelo; ver app.js.)
 * Falha interna do motor não conta.
 */
export const ofereceNuvem = (resposta, automatica) =>
  resposta != null && resposta.origem !== 'NUVEM' && resposta.origem !== 'GENERATIVA' && resposta.erro !== true && !SEM_NUVEM.has(resposta.intent) &&
  (resposta.resolvida === true || !automatica);

/**
 * Executa o pedido explícito para a resposta `atual`. Sucesso ⇒ `{ ok: true, resposta }` com a nova resposta
 * (texto gerado com Qwen 7B só quando `generativo` — IA generativa ligada no pacote assinado —; senão, montada dos dados oficiais via NLU na nuvem).
 * Qualquer falha ⇒ `{ ok: false, resposta: atual }`. Nunca lança.
 * @param {{engine: {perguntarANuvem(q: string, atual?: object, opts?: object): Promise<object|null>}, atual: object, pergunta: string, generativo?: boolean}} o
 */
export async function pedirANuvem({ engine, atual, pergunta, generativo = false }) {
  let nova = null;
  try { nova = await engine.perguntarANuvem(pergunta, atual, { generativo }); } catch { nova = null; }
  return nova && nova.resolvida === true ? { ok: true, resposta: nova } : { ok: false, resposta: atual };
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
