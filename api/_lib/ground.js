// "Ancoragem" das entidades na pergunta do usuário (defesa contra alucinação).
//
// O modelo legado foi treinado com ~4,5 mil exemplos de CANDIDATE_LOOKUP em que cargo/UF/partido saem
// da MEMÓRIA do treino (não da pergunta). Se o usuário pergunta "Quem é Maria Silva?", o modelo pode
// devolver cargo/UF/partido de uma Maria Silva específica — e o cliente filtraria por uma pessoa que o
// usuário não pediu. Por isso cada entidade só é repassada se houver evidência textual na PERGUNTA.
// É uma checagem conservadora: na dúvida a entidade é descartada (o cliente ainda revalida contra os dados).

import { TEMAS, UF_NOMES, UFS } from './vocab.js';

/** minúsculas, sem acentos/diacríticos. */
export function fold(s) {
  return String(s).normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
}

/** Tokens alfanuméricos (já sem acento, minúsculos). */
export function tokens(s) {
  return fold(s).split(/[^a-z0-9]+/).filter(Boolean);
}

/** true se a distância de edição entre a e b é <= 1 (tolera um erro de digitação). */
export function editDistanceAtMost1(a, b) {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) return a.slice(i + 1) === b.slice(i + 1); // substituição
  if (la < lb) return a.slice(i) === b.slice(i + 1); // inserção em a
  return a.slice(i + 1) === b.slice(i); // remoção em a
}

// ---------------------------------------------------------------- UF

// Apelidos aceitos pelo NLU do app (LocalNlu.kt / nlu.js): "minas" = MG, "brasilia" = DF.
const APELIDOS_UF = [['minas', 'MG'], ['brasilia', 'DF']];

const NOMES_UF_ORDENADOS = [...Object.entries(UF_NOMES).map(([sigla, nome]) => [fold(nome), sigla]), ...APELIDOS_UF]
  .sort((a, b) => b[0].length - a[0].length); // "mato grosso do sul" antes de "mato grosso"; "minas gerais" antes de "minas"

// Siglas que coincidem com palavras comuns: só valem em MAIÚSCULAS (ou pelo nome do estado).
const SIGLAS_AMBIGUAS = new Set(['se', 'pa', 'to', 'ma', 'al', 'am', 'go', 'es', 'ac', 'ap', 'pe', 'pi', 'ro', 'rr']);

/** Conjunto de UFs mencionadas (por nome ou sigla) em `raw`. */
export function ufsMencionadas(raw) {
  const out = new Set();
  let work = ` ${fold(raw).replace(/[^a-z0-9]+/g, ' ')} `;
  for (const [nome, sigla] of NOMES_UF_ORDENADOS) {
    if (nome === 'para') {
      // "para" (estado) colide com a preposição: só vale como "estado do pará" / "no pará" / "em pará"...
      if (/ (estado do|no|em|do|de|pelo) para /.test(work)) out.add('PA');
      continue;
    }
    const needle = ` ${nome} `;
    if (work.includes(needle)) {
      out.add(sigla);
      work = work.split(needle).join(' ');
    }
  }
  for (const tok of String(raw).split(/[^A-Za-zÀ-ÿ]+/)) {
    if (tok.length !== 2) continue;
    const up = tok.toUpperCase();
    if (!UFS.has(up)) continue;
    if (tok === up || !SIGLAS_AMBIGUAS.has(tok.toLowerCase())) out.add(up);
  }
  return out;
}

export function groundUf(uf, raw) {
  return ufsMencionadas(raw).has(uf);
}

// ---------------------------------------------------------------- cargo

const RX_CARGO = {
  PRESIDENTE: /\b(president\w*|presidencia|planalto)\b/,
  VICE_PRESIDENTE: /\bvice[ -]?president\w*\b/,
  GOVERNADOR: /\b(govern\w*)\b/,
  VICE_GOVERNADOR: /\bvice[ -]?governador\w*\b/,
  SENADOR: /\b(senad\w*)\b/,
  DEPUTADO_FEDERAL: /\b(deput\w* federa\w*|dep\.? federa\w*|federais|federal)\b/,
  DEPUTADO_ESTADUAL: /\b(deput\w* estadua\w*|dep\.? estadua\w*|estaduais|estadual)\b/,
  DEPUTADO_DISTRITAL: /\b(deput\w* distrita\w*|distritais|distrital)\b/,
};

export function groundCargo(cargo, raw) {
  const rx = RX_CARGO[cargo];
  // "Distrito Federal" e "governo federal" não indicam deputado federal
  const texto = fold(raw).replace(/distrito federal|governo federal/g, ' ');
  return rx ? rx.test(texto) : false;
}

// ---------------------------------------------------------------- partido

export function groundPartido(partido, raw) {
  const alvo = fold(partido).replace(/[^a-z0-9]+/g, '');
  if (!alvo) return false;
  const toks = tokens(raw);
  if (toks.includes(alvo)) return true;
  // "PC do B" -> pcdob; só para siglas/nomes mais longos (evita falso positivo de "pt", "pl"...)
  if (alvo.length >= 4) return toks.join('').includes(alvo);
  return false;
}

// ---------------------------------------------------------------- nome

/** Pelo menos uma palavra do nome (>=3 letras) aparece na pergunta (tolera 1 erro de digitação em palavras >=5). */
export function groundNome(nome, raw) {
  const q = tokens(raw);
  for (const t of tokens(nome)) {
    if (t.length < 3) continue;
    for (const w of q) {
      if (w === t) return true;
      if (t.length >= 5 && w.length >= 5 && editDistanceAtMost1(w, t)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- tema / flags

/**
 * Tema ancorado se a pergunta traz o valor bruto do modelo (ex.: "saude"), o início dele (5 letras: "educa" cobre
 * "educação") ou qualquer sinônimo do MESMO id (ex.: id "juventude" <- "jovens"; id "economia" <- "emprego").
 * `id` = id do app já normalizado; `rawTemaFold` = valor bruto do modelo, sem acento e com espaços.
 */
export function groundTema(id, rawTemaFold, raw) {
  const q = fold(raw);
  const stem = rawTemaFold.replace(/_/g, ' ').slice(0, 5);
  if (stem.length >= 3 && q.includes(stem)) return true;
  return Object.entries(TEMAS).some(([alias, tid]) => tid === id && q.includes(alias));
}

export function groundDeferidas(raw) {
  return /(ficha|limp|deferid|elegiv|regular|aprovad|sem (processo|condena|problema))/.test(fold(raw));
}

export function groundHistorico(raw) {
  return /(mandat|eleit|estreant|novat|veteran|reeleic|primeir|nunca|experien|iniciant|renova|vez)/.test(fold(raw));
}

export function groundVice(raw) {
  return /\b(vices?|suplentes?|chapas?|companheir\w* de chapa)\b/i.test(fold(raw));
}

