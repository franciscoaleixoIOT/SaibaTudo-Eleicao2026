// Fórmulas químicas: leitura (parênteses, hidratos "·5H2O", cargas), notação de Hill, massa molar e representações
// (Unicode, TeX para o KaTeX, tokens sub/sobrescrito para a interface). Sem DOM, sem dados embutidos além da lista de símbolos IUPAC.

/** Símbolos dos 118 elementos (IUPAC), para validar a escrita das fórmulas; as propriedades vêm do pacote de dados. */
export const SIMBOLOS = ('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe ' +
  'Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr ' +
  'Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og').split(' ');
export const SIMBOLOS_SET = new Set(SIMBOLOS);

export class ErroFormula extends Error {
  constructor(mensagem, posicao = null) { super(mensagem); this.name = 'ErroFormula'; this.posicao = posicao; }
}

const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' };
const SUB_DE = '₀₁₂₃₄₅₆₇₈₉';
const SUP_DE = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻' };

/** Texto "limpo": subscritos/sobrescritos Unicode viram ASCII (carga com "^"), pontos de hidrato viram "·", colchetes viram parênteses, sem espaços. */
export function normalizarEntrada(texto) {
  let s = String(texto ?? '').normalize('NFC');
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+/g, (m) => '^' + [...m].map((c) => SUP[c]).join(''));
  s = s.replace(/[₀-₉]/g, (c) => SUB[c]);
  s = s.replace(/[−–—‒]/g, '-').replace(/[＋]/g, '+');
  s = s.replace(/[•∙⋅*]/g, '·').replace(/(?<=[A-Za-z0-9)\]}])\.(?=[0-9A-Z(\[{])/g, '·');
  s = s.replace(/[\[{]/g, '(').replace(/[\]}]/g, ')');
  s = s.replace(/\s+/g, '');
  s = s.replace(/\((?:s|l|g|aq)\)$/i, ''); // estado físico: (s) (l) (g) (aq)
  return s;
}

/**
 * Separa a carga elétrica do corpo da fórmula. Aceita "^2+", "^+2", "^-", "Fe+3", "SO4-2", "Fe3+", "SO42-", "NO3-", "NH4+", "Cl-", "Na+", "Fe++".
 * Sem "^", um dígito logo antes do sinal é CARGA quando o resto da fórmula é um único elemento (Fe3+, Cu2+) e SUBSCRITO nos demais casos (NO3-, NH4+);
 * com dois ou mais dígitos, o último é a carga ("SO42-" = SO4 com 2-). Para o íon superóxido use "O2^-".
 * @returns {{corpo: string, carga: number}}
 */
export function separarCarga(norm) {
  let m = /\^\{?([+-]?)(\d*)([+-]?)\}?$/.exec(norm);
  if (m && (m[1] || m[3])) {
    const sinal = (m[1] || m[3]) === '-' ? -1 : 1;
    const n = m[2] === '' ? 1 : Number(m[2]);
    return { corpo: norm.slice(0, m.index), carga: sinal * n };
  }
  m = /([+-])(\d+)$/.exec(norm);
  if (m && m.index > 0) return { corpo: norm.slice(0, m.index), carga: (m[1] === '-' ? -1 : 1) * Number(m[2]) };
  m = /(\d*)([+-]+)$/.exec(norm);
  if (m && m.index + m[1].length > 0) {
    const run = m[1];
    const sinais = m[2];
    const antes = norm.slice(0, m.index);
    if (new Set(sinais).size > 1) return { corpo: norm, carga: 0 }; // "+-": não é carga (a leitura da fórmula acusa o erro)
    const sinal = sinais[0] === '-' ? -1 : 1;
    if (sinais.length > 1) return { corpo: antes + run, carga: sinal * sinais.length }; // "Fe++"
    if (run === '') return { corpo: antes, carga: sinal };
    if (run.length >= 2) return { corpo: antes + run.slice(0, -1), carga: sinal * Number(run.slice(-1)) };
    // um dígito: carga se o resto é um único elemento ("Fe" + 3), senão subscrito ("NO3-")
    if (/^[A-Z][a-z]?$/.test(antes)) return { corpo: antes, carga: sinal * Number(run) };
    return { corpo: antes + run, carga: sinal };
  }
  return { corpo: norm, carga: 0 };
}

function lerContagem(s, i) {
  let j = i;
  while (j < s.length && s.charCodeAt(j) >= 48 && s.charCodeAt(j) <= 57) j++;
  if (j === i) return { n: 1, i, explicito: false };
  const n = Number(s.slice(i, j));
  if (!Number.isSafeInteger(n) || n < 1) throw new ErroFormula(`Quantidade inválida "${s.slice(i, j)}"`, i);
  if (n > 100000) throw new ErroFormula('Quantidade grande demais', i);
  return { n, i: j, explicito: true };
}

function somar(destino, origem, k = 1) {
  for (const [s, n] of origem) destino.set(s, (destino.get(s) ?? 0) + n * k);
}

function lerGrupo(s, i, aninhado, simbolos) {
  const atomos = new Map();
  while (i < s.length) {
    const c = s[i];
    if (c === ')') {
      if (!aninhado) throw new ErroFormula('Parêntese ")" sem "(" correspondente', i);
      return { atomos, i };
    }
    if (c === '(') {
      const interno = lerGrupo(s, i + 1, true, simbolos);
      if (s[interno.i] !== ')') throw new ErroFormula('Parêntese "(" sem ")" correspondente', i);
      if (interno.atomos.size === 0) throw new ErroFormula('Parênteses vazios', i);
      const q = lerContagem(s, interno.i + 1);
      somar(atomos, interno.atomos, q.n);
      i = q.i;
    } else if (c >= 'A' && c <= 'Z') {
      const dois = s[i + 1] >= 'a' && s[i + 1] <= 'z' ? c + s[i + 1] : null;
      let simbolo;
      if (dois && simbolos.has(dois)) simbolo = dois;
      else if (simbolos.has(c)) simbolo = c;
      else throw new ErroFormula(`"${dois ?? c}" não é símbolo de elemento`, i);
      const q = lerContagem(s, i + simbolo.length);
      atomos.set(simbolo, (atomos.get(simbolo) ?? 0) + q.n);
      i = q.i;
    } else if (c >= 'a' && c <= 'z') {
      throw new ErroFormula(`Letra minúscula "${c}" fora de lugar (símbolos começam com maiúscula, como em "Na" e "Cl")`, i);
    } else {
      throw new ErroFormula(`Caractere inesperado "${c}"`, i);
    }
  }
  if (aninhado) throw new ErroFormula('Parêntese "(" sem ")" correspondente', i);
  return { atomos, i };
}

/** Notação de Hill: C, H, depois ordem alfabética (sem carbono: tudo em ordem alfabética). */
export function ordemHill(simbolos) {
  const lista = [...simbolos];
  if (lista.includes('C')) return ['C', ...(lista.includes('H') ? ['H'] : []), ...lista.filter((x) => x !== 'C' && x !== 'H').sort()];
  return lista.sort();
}

export function formulaHill(atomos) {
  return ordemHill(atomos.keys()).map((s) => s + (atomos.get(s) > 1 ? atomos.get(s) : '')).join('');
}

/**
 * Lê uma fórmula. Lança ErroFormula (com mensagem em português e posição) se for inválida.
 * @param {string} texto ex.: "Ca(OH)2", "CuSO4·5H2O", "Fe2(SO4)3", "SO4^2-", "Fe3+"
 * @param {{simbolos?: Set<string>}} [op]
 * @returns {{texto: string, corpo: string, carga: number, atomos: Map<string, number>, partes: {coef: number, corpo: string, atomos: Map<string, number>}[], hill: string, hidrato: boolean}}
 */
export function parseFormula(texto, { simbolos = SIMBOLOS_SET } = {}) {
  const norm = normalizarEntrada(texto);
  if (!norm) throw new ErroFormula('Fórmula vazia');
  const { corpo, carga } = separarCarga(norm);
  if (!corpo) throw new ErroFormula('Fórmula vazia');
  const partes = [];
  const total = new Map();
  let deslocamento = 0;
  for (const bruta of corpo.split('·')) {
    const q = lerContagem(bruta, 0);
    const resto = bruta.slice(q.i);
    if (!resto) throw new ErroFormula('Parte vazia (confira o "·" do hidrato)', deslocamento);
    let atomos;
    try {
      atomos = lerGrupo(resto, 0, false, simbolos).atomos;
    } catch (e) {
      if (e instanceof ErroFormula && e.posicao != null) e.posicao += deslocamento + q.i;
      throw e;
    }
    partes.push({ coef: q.explicito ? q.n : 1, corpo: resto, atomos });
    somar(total, atomos, q.explicito ? q.n : 1);
    deslocamento += bruta.length + 1;
  }
  return { texto: norm, corpo, carga, atomos: total, partes, hill: formulaHill(total), hidrato: partes.length > 1 };
}

/** Versão que devolve null em vez de lançar. */
export function tentarFormula(texto, op) {
  try { return parseFormula(texto, op); } catch { return null; }
}

/**
 * Massa molar a partir das massas atômicas do pacote de dados.
 * @param {ReturnType<typeof parseFormula>} f
 * @param {Map<string, number>|((s: string) => number|undefined)} massas símbolo → massa atômica (u = g/mol)
 * @returns {{total: number, linhas: {simbolo: string, n: number, massa: number, subtotal: number}[], faltando: string[]}}
 */
export function massaMolar(f, massas) {
  const obter = typeof massas === 'function' ? massas : (s) => massas.get(s);
  const linhas = [];
  const faltando = [];
  let total = 0;
  for (const simbolo of ordemHill(f.atomos.keys())) {
    const n = f.atomos.get(simbolo);
    const massa = obter(simbolo);
    if (typeof massa !== 'number' || !Number.isFinite(massa)) { faltando.push(simbolo); continue; }
    const subtotal = n * massa;
    total += subtotal;
    linhas.push({ simbolo, n, massa, subtotal });
  }
  return { total, linhas, faltando };
}

/** Número de átomos no total (útil para validar). */
export const totalAtomos = (atomos) => [...atomos.values()].reduce((a, b) => a + b, 0);

// ------------------------------------------------------------------------------------------------ representações

/** @returns {{t: 'txt'|'sub'|'sup', v: string}[]} tokens para montar com <sub>/<sup>. Coeficientes e dígitos iniciais ficam normais. */
export function formulaTokens(texto) {
  const { corpo, carga } = separarCarga(normalizarEntrada(texto));
  const out = [];
  let buf = '';
  const solta = () => { if (buf) { out.push({ t: 'txt', v: buf }); buf = ''; } };
  for (let i = 0; i < corpo.length; i++) {
    const c = corpo[i];
    if (c >= '0' && c <= '9') {
      let j = i;
      while (j < corpo.length && corpo[j] >= '0' && corpo[j] <= '9') j++;
      const anterior = corpo[i - 1];
      if (anterior && anterior !== '·') { solta(); out.push({ t: 'sub', v: corpo.slice(i, j) }); } else buf += corpo.slice(i, j);
      i = j - 1;
    } else buf += c;
  }
  solta();
  if (carga !== 0) out.push({ t: 'sup', v: (Math.abs(carga) === 1 ? '' : String(Math.abs(carga))) + (carga > 0 ? '+' : '−') });
  return out;
}

const subUni = (d) => [...d].map((x) => SUB_DE[Number(x)]).join('');
const supUni = (d) => [...d].map((x) => SUP_DE[x] ?? x).join('');

/** "H₂O", "Fe³⁺", "SO₄²⁻", "CuSO₄·5H₂O" (para texto simples e rótulos de acessibilidade). */
export function formulaUnicode(texto) {
  return formulaTokens(texto).map((t) => (t.t === 'sub' ? subUni(t.v) : t.t === 'sup' ? supUni(t.v.replace('−', '-')) : t.v)).join('');
}

/** Fórmula em TeX para o KaTeX: \mathrm{Ca(OH)_2}, \mathrm{CuSO_4}\cdot 5\mathrm{H_2O}, \mathrm{Fe}^{3+}. */
export function formulaTex(texto) {
  const toks = formulaTokens(texto);
  let corpo = '';
  let carga = '';
  for (const t of toks) {
    if (t.t === 'sub') corpo += `_{${t.v}}`;
    else if (t.t === 'sup') carga = `^{${t.v.replace('−', '-')}}`;
    else corpo += t.v.replace(/·/g, '\\cdot ');
  }
  return `\\mathrm{${corpo}}${carga}`;
}

/** Texto simples ASCII sem espaços para comparar fórmulas ("H2O", "ca(oh)2" → "ca(oh)2"). */
export const chaveFormula = (texto) => normalizarEntrada(texto).replace(/\^/g, '').toLowerCase();
