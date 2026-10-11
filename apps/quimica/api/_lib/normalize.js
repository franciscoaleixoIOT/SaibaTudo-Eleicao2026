// Normaliza a saída bruta do modelo de interpretação para o contrato do NLU (docs/DATA_CONTRACT.md §8):
//   { intent, elemento?, composto?, propriedade?, quantidades?: [{valor, unidade}], equacao?, nivel?, unidadeDestino? }
//
// Princípios:
//  - A nuvem NUNCA fornece fatos: só intenção e entidades; qualquer outro campo do modelo é ignorado.
//  - Valores fora dos vocabulários fechados (vocab.js) são descartados.
//  - Com `question`, cada entidade só é mantida se houver evidência textual na pergunta (ground.js).
//  - Se a intenção É a entidade (perfil, ficha, massa molar...) e ela não sobreviveu, vira DESCONHECIDA (o cliente cai no NLU local).
//  - JSON inválido ou sem `intent` => { ok:false }. Intenção fora do vocabulário => DESCONHECIDA.
// O cliente ainda revalida tudo contra o pacote de dados assinado.

import {
  INTENT_SET, INTENTS_SEM_ENTIDADES, NIVEL_SET, PROPRIEDADES, PROPRIEDADE_CLIENTE, SIMBOLOS, UNIDADES,
} from './vocab.js';
import {
  fold, groundComposto, groundElemento, groundEquacao, groundNivel, groundPropriedade, groundQuantidade, groundUnidadeDestino,
} from './ground.js';

const ORDEM_CAMPOS = ['elemento', 'composto', 'propriedade', 'quantidades', 'equacao', 'nivel', 'unidadeDestino'];
const MAX_QUANTIDADES = 6;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Extrai o objeto JSON de um texto do modelo (tolera lixo antes/depois). */
export function parseModelJson(raw) {
  if (isPlainObject(raw)) return raw;
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  if (i === -1 || j <= i) return null;
  try {
    const v = JSON.parse(s.slice(i, j + 1));
    return isPlainObject(v) ? v : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ normalizadores (vocabulário e forma)

function texto(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'none') return null;
  return s;
}

const SIMBOLO_POR_MINUSCULA = new Map(SIMBOLOS.map((s) => [s.toLowerCase(), s]));
// ids de propriedade unificados: o id do contrato (pontoFusaoK...) vale para cliente e modelo (PROPRIEDADE_CLIENTE ficou vazio)
const PROPRIEDADE_POR_MINUSCULA = new Map([
  ...PROPRIEDADES.map((p) => [p.toLowerCase(), p]),
  ...Object.entries(PROPRIEDADE_CLIENTE).map(([modelo, cliente]) => [cliente.toLowerCase(), modelo]),
]);
const UNIDADE_POR_MINUSCULA = new Map(UNIDADES.map((u) => [u.toLowerCase(), u]));

export function normElemento(v) {
  const s = texto(v);
  return s ? SIMBOLO_POR_MINUSCULA.get(s.toLowerCase()) ?? null : null;
}

/** Nome, fórmula ou CID. Mantém letras (com acento), dígitos e a pontuação de nomes/fórmulas. */
export function normComposto(v) {
  const s = texto(v);
  if (!s) return null;
  const c = s.replace(/[^\p{L}\p{N} ,.'()+\-·\[\]/]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (c.length < 1 || c.length > 60) return null;
  if (!/[\p{L}\p{N}]/u.test(c)) return null;
  return c;
}

export function normPropriedade(v) {
  const s = texto(v);
  return s ? PROPRIEDADE_POR_MINUSCULA.get(s.toLowerCase()) ?? null : null;
}

export function normNivel(v) {
  const s = texto(v);
  if (!s) return null;
  const n = fold(s);
  return NIVEL_SET.has(n) ? n : null;
}

export function normUnidade(v) {
  const s = texto(v);
  return s ? UNIDADE_POR_MINUSCULA.get(s.toLowerCase()) ?? UNIDADE_POR_MINUSCULA.get(s.replace(/^º/, '°').toLowerCase()) ?? null : null;
}

export function normEquacaoTexto(v) {
  const s = texto(v);
  if (!s) return null;
  const e = s.replace(/[^\p{L}\p{N} +=<>()._/,^·→⇌↔⇄⟶-]/gu, ' ').replace(/\s+/g, ' ').trim();
  return e.length >= 3 && e.length <= 120 && /\p{L}/u.test(e) ? e : null;
}

/** [{valor, unidade}] do modelo -> lista saneada (vocabulário de unidades, valor numérico finito). Descarta o resto. */
export function normQuantidades(v) {
  if (!Array.isArray(v)) return { itens: [], descartadas: 0 };
  const itens = [];
  let descartadas = 0;
  for (const x of v.slice(0, MAX_QUANTIDADES * 2)) {
    const valor = typeof x?.valor === 'number' ? x.valor : typeof x?.valor === 'string' && /^-?\d+(?:[.,]\d+)?(?:e[-+]?\d+)?$/i.test(x.valor.trim()) ? Number(x.valor.trim().replace(',', '.')) : NaN;
    const unidade = normUnidade(x?.unidade);
    if (!Number.isFinite(valor) || !unidade) {
      descartadas += 1;
      continue;
    }
    itens.push({ valor, unidade });
  }
  return { itens, descartadas };
}

// ------------------------------------------------------------------ requisitos por intenção

// Intenções cuja resposta É a entidade (perfil, ficha, estrutura, nome, massa molar, propriedade): se a entidade não sobreviveu à ancoragem,
// a interpretação vira DESCONHECIDA (o cliente cai no NLU local e não pergunta "qual elemento?" por uma intenção alucinada).
// As calculadoras (balancear, estequiometria, concentração, pH, gás ideal, conversão) continuam válidas SEM entidades: o cliente abre a
// calculadora e lê os números da própria pergunta (o golden tem "balanceamento de equações" => BALANCEAR sem equação).
const REQUISITOS = {
  ELEMENTO: (e) => Boolean(e.elemento),
  COMPOSTO: (e) => Boolean(e.composto),
  PROPRIEDADE: (e) => Boolean(e.propriedade && (e.elemento || e.composto)),
  MASSA_MOLAR: (e) => Boolean(e.composto || e.elemento),
  NOMENCLATURA: (e) => Boolean(e.composto),
  DESENHAR: (e) => Boolean(e.composto),
  COMPARAR: (e) => Boolean(e.elemento || e.composto || e.propriedade),
};

function montar(intent, e) {
  const nlu = { intent };
  if (INTENTS_SEM_ENTIDADES.has(intent)) return nlu;
  for (const k of ORDEM_CAMPOS) {
    const v = e[k];
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    nlu[k] = k === 'propriedade' ? PROPRIEDADE_CLIENTE[v] ?? v : v; // o cliente conhece o id sem unidade
  }
  return nlu;
}

/**
 * @param {string|object} raw  saída do modelo (texto com JSON ou objeto já parseado)
 * @param {{question?: string}} [opts]  com `question`, as entidades são ancoradas no texto da pergunta
 * @returns {{ok:true, nlu:object, dropped:string[]} | {ok:false, error:string}}
 */
export function normalizeModelOutput(raw, opts = {}) {
  const obj = parseModelJson(raw);
  if (!obj) return { ok: false, error: 'invalid_json' };
  if (typeof obj.intent !== 'string' || !obj.intent.trim()) return { ok: false, error: 'invalid_shape' };

  const intent = obj.intent.trim().toUpperCase();
  if (!INTENT_SET.has(intent)) return { ok: true, nlu: { intent: 'DESCONHECIDA' }, dropped: ['intent'] };
  if (INTENTS_SEM_ENTIDADES.has(intent)) return { ok: true, nlu: { intent }, dropped: [] };

  const question = typeof opts.question === 'string' ? opts.question : null;
  const dropped = [];
  const e = {
    elemento: normElemento(obj.elemento),
    composto: normComposto(obj.composto),
    propriedade: normPropriedade(obj.propriedade),
    equacao: normEquacaoTexto(obj.equacao),
    nivel: normNivel(obj.nivel),
    unidadeDestino: normUnidade(obj.unidadeDestino),
  };
  const q = normQuantidades(obj.quantidades);
  e.quantidades = q.itens;

  // chave presente no modelo, mas fora do vocabulário/forma: registra o descarte (só o nome do campo)
  const presente = (k) => obj[k] !== undefined && obj[k] !== null && texto(obj[k]) !== null;
  for (const k of ['elemento', 'composto', 'propriedade', 'equacao', 'nivel', 'unidadeDestino']) {
    if (presente(k) && e[k] === null) dropped.push(k);
  }
  if (q.descartadas > 0) dropped.push('quantidades');

  if (question !== null) {
    const solta = (campo) => {
      e[campo] = null;
      dropped.push(campo);
    };
    if (e.elemento && !groundElemento(e.elemento, question)) solta('elemento');
    if (e.composto && !groundComposto(e.composto, question)) solta('composto');
    if (e.propriedade && !groundPropriedade(e.propriedade, question)) solta('propriedade');
    if (e.nivel && !groundNivel(e.nivel, question)) solta('nivel');
    if (e.equacao) {
      const g = groundEquacao(e.equacao, question);
      if (g) e.equacao = g.valor;
      else solta('equacao');
    }
    const antes = e.quantidades.length;
    e.quantidades = e.quantidades.filter((x) => groundQuantidade(x, question)).slice(0, MAX_QUANTIDADES);
    if (e.quantidades.length < antes) dropped.push('quantidades');
    if (e.unidadeDestino && !groundUnidadeDestino(e.unidadeDestino, question, e.quantidades)) solta('unidadeDestino');
  } else {
    e.quantidades = e.quantidades.slice(0, MAX_QUANTIDADES);
  }
  // a unidade de destino só faz sentido para conversões
  if (e.unidadeDestino && intent !== 'CONVERSAO_UNIDADE' && intent !== 'CONCENTRACAO') e.unidadeDestino = null;

  const exige = REQUISITOS[intent];
  if (exige && !exige(e)) return { ok: true, nlu: { intent: 'DESCONHECIDA' }, dropped: [...new Set([...dropped, 'requisito'])] };
  return { ok: true, nlu: montar(intent, e), dropped: [...new Set(dropped)] };
}
