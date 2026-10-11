// "Ancoragem" das entidades na pergunta do usuário (defesa contra alucinação do modelo de interpretação).
//
// O modelo pequeno às vezes completa de memória: devolve o elemento "Fe" para "massa molar da ferrugem", ou uma quantidade que não foi
// dita. Por isso cada entidade só é repassada ao cliente se houver evidência textual na PERGUNTA: símbolo ou nome do elemento, nome
// ou fórmula do composto, forma de superfície da propriedade, número seguido da unidade, trecho da equação. Na dúvida, descarta
// (o cliente ainda revalida contra o pacote de dados assinado).

import {
  APELIDOS_UNIDADE, COMPOSTOS_COMUNS, FORMAS_PROPRIEDADE, NIVEIS_FORMAS, NOMES_ALTERNATIVOS, NOMES_ELEMENTOS, SIMBOLO_SET,
} from './vocab.js';

// ---------------------------------------------------------------- texto

const SUBSCRITOS = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
const SUPERSCRITOS = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' };

/** Troca sub e sobrescritos por dígitos/sinais comuns (H₂O -> H2O) e normaliza símbolos que atrapalham (×, −, º, Å). */
export function simplificar(s) {
  return String(s)
    .replace(/[₀-₉]/g, (c) => SUBSCRITOS[c])
    .replace(/[⁰¹²³⁴-⁹⁺⁻]/g, (c) => SUPERSCRITOS[c])
    .replace(/[×✕]/g, 'x')
    .replace(/[−–—]/g, '-')
    .replace(/[ÅÅ]/g, ' angstrom ')
    .replace(/µ/g, 'u');
}

/** minúsculas, sem acentos/diacríticos (e já sem sub/sobrescritos). */
export function fold(s) {
  return simplificar(s).normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
}

/** Tokens alfanuméricos (sem acento, minúsculos). */
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

/** Letras repetidas viram uma só ("ferrrro" -> "fero"): tolera o dedo que escorrega no teclado. */
const semRepetidas = (s) => s.replace(/(.)\1+/g, '$1');

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** `frase` aparece em `texto` (ambos já dobrados) começando em fronteira de palavra. */
function contemFrase(texto, frase, { fim = false } = {}) {
  const rx = new RegExp(`(?<![a-z0-9])${escapar(frase)}${fim ? '(?![a-z0-9])' : ''}`);
  return rx.test(texto);
}

// ---------------------------------------------------------------- elemento

// Símbolos que, escritos com a mesma grafia, também são palavras comuns em português ou inglês ("As", "No", "Na", "Se", "Ir"...).
// Só valem fora da primeira palavra da pergunta e com a capitalização exata do símbolo.
const SIMBOLOS_AMBIGUOS = new Set(['As', 'No', 'Os', 'Se', 'Na', 'In', 'Be', 'La', 'Ho', 'Pa', 'Ne', 'Re', 'He', 'Er', 'Ar', 'Cu', 'Si', 'Ir', 'Ta', 'Po', 'Fr', 'Mo', 'Ni']);
const RX_CUE_SIMBOLO = /(?:^|\s)(?:elemento|simbolo(?: quimico)?)\s+(?:(?:do|de|e)\s+)?$/;

/** Evidência do SÍMBOLO: token isolado com a caixa exata (Fe, Na+, Fe3+), ou em minúsculas logo depois de "elemento"/"símbolo". */
function simboloNoTexto(simbolo, raw) {
  const s = simplificar(raw);
  const toks = [...s.matchAll(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9]*(?:[+-]\d*)?/g)].map((m) => ({ t: m[0], i: m.index }));
  const rx = new RegExp('^' + simbolo + '(?:\\d?[+-]\\d?)?$');
  for (let n = 0; n < toks.length; n++) {
    const { t, i } = toks[n];
    if (rx.test(t)) {
      if (n === 0 && (simbolo === 'O' || SIMBOLOS_AMBIGUOS.has(simbolo))) continue; // "O que é...", "Na água..."
      return true;
    }
    if (simbolo.length === 2 && t === simbolo.toLowerCase() && !SIMBOLOS_AMBIGUOS.has(simbolo) && RX_CUE_SIMBOLO.test(fold(s.slice(0, i)))) return true;
  }
  return false;
}

const RX_ANION_ANTES = /(?:eto|ato|ito|ido|ureto|ilo)$/; // "cloreto de sódio": o nome do elemento faz parte do nome do composto

function nomeNoTexto(nomes, raw) {
  const toks = tokens(raw);
  for (const nome of nomes) {
    for (let i = 0; i < toks.length; i++) {
      const w = toks[i];
      const bate = w === nome || (nome.length >= 6 && w.length >= 5 && editDistanceAtMost1(w, nome)) || (nome.length >= 4 && semRepetidas(w) === semRepetidas(nome));
      if (!bate) continue;
      const ant1 = toks[i - 1];
      const ant2 = toks[i - 2];
      if ((ant1 === 'de' || ant1 === 'do') && ant2 && RX_ANION_ANTES.test(ant2)) continue; // parte do nome de um composto
      return true;
    }
  }
  return false;
}

/** O elemento (símbolo canônico, ex.: "Fe") tem evidência na pergunta? */
export function groundElemento(simbolo, raw) {
  if (!SIMBOLO_SET.has(simbolo)) return false;
  const nomes = [...(NOMES_ELEMENTOS[simbolo] ?? []), ...(NOMES_ALTERNATIVOS[simbolo] ?? [])].map(fold);
  return nomeNoTexto(nomes, raw) || simboloNoTexto(simbolo, raw);
}

// ---------------------------------------------------------------- composto

const CONECTORES = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'o', 'a', 'em']);

/** Símbolos válidos de uma fórmula como "Ca(OH)2" -> ["Ca","O","H"]; null se não for uma fórmula bem formada. */
export function simbolosDaFormula(f) {
  const s = simplificar(f).replace(/·.*$/, '').replace(/[+-]\d*$/, '');
  if (!s || !/^(?:[A-Z][a-z]?\d*|\((?:[A-Z][a-z]?\d*)+\)\d*)+$/.test(s)) return null;
  const simbolos = s.match(/[A-Z][a-z]?/g) ?? [];
  return simbolos.length > 0 && simbolos.every((x) => SIMBOLO_SET.has(x)) ? simbolos : null;
}

export const normFormula = (f) => simplificar(f).replace(/\s+/g, '').replace(/[+-]\d*$/, '');

function tokensDeFormula(raw) {
  return (simplificar(raw).match(/[A-Za-z0-9()·]+/g) ?? []).map((t) => t.replace(/^\)+|\(+$/g, '').replace(/\.$/, '')).filter(Boolean);
}

function formulaNoTexto(formula, raw) {
  const alvo = normFormula(formula);
  const baixo = alvo.toLowerCase();
  for (const t of tokensDeFormula(raw)) {
    if (t === alvo) return true;
    // digitou tudo em minúsculas ("h2so4", "nacl"): vale se não puder ser uma palavra comum
    if (t === t.toLowerCase() && t.toLowerCase() === baixo && (/\d/.test(t) || t.length >= 3)) return true;
  }
  return false;
}

function grupoDoComposto(valor) {
  const v = String(valor).trim();
  const f = normFormula(v);
  const n = fold(v).replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  return COMPOSTOS_COMUNS.find((g) => g.formulas.includes(f) || g.nomes.includes(n)) ?? null;
}

function nomeNoTextoComposto(nome, raw) {
  const sig = tokens(nome).filter((t) => !CONECTORES.has(t) && t.length >= 3);
  if (sig.length === 0 || !sig.some((t) => t.length >= 4)) return false;
  const q = tokens(raw);
  const semS = (w) => (w.length >= 5 && w.endsWith('s') ? w.slice(0, -1) : w);
  return sig.every((t) => q.some((w) => w === t || semS(w) === semS(t) || (t.length >= 6 && w.length >= 5 && editDistanceAtMost1(semS(w), semS(t)))));
}

/** O composto (nome, fórmula ou CID) tem evidência na pergunta? */
export function groundComposto(valor, raw) {
  const v = String(valor).trim();
  if (!v) return false;
  if (/^\d{1,9}$/.test(v)) return new RegExp(`\\bcid\\s*[:#]?\\s*${v}\\b`, 'i').test(raw);
  const n = fold(raw);
  const grupo = grupoDoComposto(v);
  if (grupo) {
    return grupo.formulas.some((f) => formulaNoTexto(f, raw)) || grupo.nomes.some((nome) => contemFrase(n, nome, { fim: true }) || nomeNoTextoComposto(nome, raw));
  }
  if (simbolosDaFormula(v)) return formulaNoTexto(v, raw);
  return nomeNoTextoComposto(v, raw);
}

// ---------------------------------------------------------------- propriedade, nível

export function groundPropriedade(id, raw) {
  const n = fold(raw);
  return (FORMAS_PROPRIEDADE[id] ?? []).some((forma) => contemFrase(n, forma));
}

export function groundNivel(nivel, raw) {
  const n = fold(raw);
  return (NIVEIS_FORMAS[nivel] ?? []).some((forma) => contemFrase(n, forma, { fim: true }));
}

// ---------------------------------------------------------------- números e unidades

/** Valores possíveis de um token numérico em português/inglês ("1,5", "1.5", "1.000", "1.234,56"). */
export function valoresDoToken(tok) {
  const t = tok.replace(/\s+/g, '');
  const virgulas = (t.match(/,/g) ?? []).length;
  const pontos = (t.match(/\./g) ?? []).length;
  const num = (s) => Number(s);
  if (virgulas && pontos) {
    const ultimoVirgula = t.lastIndexOf(',') > t.lastIndexOf('.');
    return [num(ultimoVirgula ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, ''))];
  }
  if (virgulas) return virgulas === 1 ? [num(t.replace(',', '.'))] : [num(t.replace(/,/g, ''))];
  if (pontos) {
    if (pontos > 1) return [num(t.replace(/\./g, ''))];
    return /^\d{1,3}\.\d{3}$/.test(t) ? [num(t), num(t.replace('.', ''))] : [num(t)];
  }
  return [num(t)];
}

/** Números do texto (já com sub/sobrescritos simplificados) com a posição do fim: [{valores, fim, texto}]. Inclui "2,5 x 10^-3" e "1e-3". */
export function numerosComPosicao(texto) {
  const s = simplificar(texto);
  const achados = [];
  const rx = /(?<![\w.,])(\d+(?:[.,]\d+)*)(?:\s*(?:x|\*)\s*10\s*(?:\^|\*\*)?\s*\(?([-+]?\d+)\)?|e([-+]?\d+)(?![\w]))?/gi;
  for (const m of s.matchAll(rx)) {
    const expo = m[2] ?? m[3];
    let valores = valoresDoToken(m[1]);
    if (expo !== undefined) valores = valores.map((v) => v * 10 ** Number(expo));
    const antes = s[m.index - 1];
    if (antes === '-') valores = [...valores, ...valores.map((v) => -v)];
    achados.push({ valores, fim: m.index + m[0].length, texto: m[0] });
  }
  return achados;
}

const ORDEM_APELIDOS = Object.entries(APELIDOS_UNIDADE)
  .flatMap(([unidade, apelidos]) => apelidos.map((a) => [fold(a), unidade]))
  .sort((a, b) => b[0].length - a[0].length);

/** Unidade que começa em `resto` (dobrado, sem espaços iniciais): o apelido MAIS LONGO vence ("mol/L" antes de "mol"). */
function unidadeNoInicio(resto, restoOriginal) {
  // "0,1 M" (molar) só vale com M maiúsculo isolado; em minúsculas "m" é metro
  if (/^M(?![A-Za-z0-9])/.test(restoOriginal)) return 'mol/L';
  for (const [apelido, unidade] of ORDEM_APELIDOS) {
    if (resto.startsWith(apelido) && !/[a-z0-9]/.test(resto[apelido.length] ?? '')) return unidade;
  }
  return null;
}

/** Duas cópias do texto com os MESMOS índices: sem acentos com a caixa original, e em minúsculas. */
function alinhado(raw) {
  const original = simplificar(raw).normalize('NFD').replace(/\p{M}+/gu, '');
  return { dobrado: original.toLowerCase(), original };
}

/** Para cada número da pergunta, a unidade escrita logo depois dele: [{valores, unidade|null}]. */
export function quantidadesDoTexto(raw) {
  const { dobrado, original } = alinhado(raw);
  return numerosComPosicao(original).map((n) => {
    let i = n.fim;
    while (dobrado[i] === ' ') i += 1;
    return { valores: n.valores, unidade: unidadeNoInicio(dobrado.slice(i), original.slice(i)) };
  });
}

const iguais = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** A quantidade {valor, unidade} aparece na pergunta como número seguido da unidade? */
export function groundQuantidade(q, raw) {
  return quantidadesDoTexto(raw).some((c) => c.unidade === q.unidade && c.valores.some((v) => iguais(v, q.valor)));
}

/** A unidade de destino é mencionada na pergunta além das vezes em que já serve de unidade de uma quantidade ancorada? */
export function groundUnidadeDestino(unidade, raw, quantidades = []) {
  const { dobrado, original } = alinhado(raw);
  let ocorrencias = 0;
  for (let i = 0; i < dobrado.length; i++) {
    if (i > 0 && /[a-z0-9]/.test(dobrado[i - 1])) continue; // só no começo de palavra
    if (unidadeNoInicio(dobrado.slice(i), original.slice(i)) === unidade) ocorrencias += 1;
  }
  return ocorrencias > quantidades.filter((x) => x.unidade === unidade).length;
}

// ---------------------------------------------------------------- equação

const SETA_DUPLA = /<[-=]{1,3}>|⇌|↔|⇄/g;
const SETA = /(?:-{1,3}|={1,3})>|→|⟶|➔|⇒|=/g;

/** Forma comparável de uma equação: sem espaços, sem sub/sobrescritos, setas unificadas em "->" / "<->". */
export function normEquacao(eq) {
  return simplificar(eq).replace(SETA_DUPLA, '<->').replace(SETA, '->').replace(/\s+/g, '');
}

const semCoeficientes = (s) => s
  .split(/(<->|->|\+)/)
  .map((t) => t.replace(/^\d+(?:\/\d+)?/, '').replace(/\((?:s|l|g|aq)\)/gi, ''))
  .join('');

/**
 * A equação tem evidência na pergunta? Devolve a forma a usar: a do modelo (se estiver escrita assim na pergunta, ignorando
 * espaços e setas equivalentes), a forma SEM coeficientes (se só ela está na pergunta), ou null.
 */
export function groundEquacao(eq, raw) {
  const alvo = normEquacao(eq);
  const q = normEquacao(raw);
  if (alvo.length < 3 || !/[A-Za-z]/.test(alvo)) return null;
  if (q.includes(alvo)) return { modo: 'literal', valor: eq };
  if (!/[A-Z]/.test(raw) && q.toLowerCase().includes(alvo.toLowerCase())) return { modo: 'literal', valor: eq };
  const alvoSemCoef = semCoeficientes(alvo);
  const qSemCoef = semCoeficientes(q);
  if (alvoSemCoef.length >= 3 && qSemCoef.includes(alvoSemCoef)) {
    return { modo: 'sem_coeficientes', valor: alvoSemCoef.replace(/<->/g, ' <-> ').replace(/->/g, ' -> ').replace(/\+/g, ' + ').replace(/\s+/g, ' ').trim() };
  }
  return null;
}
