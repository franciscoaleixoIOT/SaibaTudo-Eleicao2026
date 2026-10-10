// Balanceamento de equações químicas por álgebra linear exata (frações de BigInt): monta a matriz elemento × substância
// (mais uma linha de carga, quando há íons ou elétrons), obtém o espaço nulo e escala para os menores inteiros positivos.
import { Frac, mdc, mmc } from './frac.js';
import { ErroFormula, SIMBOLOS_SET, formulaTex, formulaUnicode, normalizarEntrada, ordemHill, parseFormula } from './formula.js';

const RX_SETA = /\s*(?:<=>|<->|<-->|⇌|⇄|-->|->|→|⟶|⇒|=>|==|=)\s*/;
const RX_ELETRON = /^e(?:\^?[-−]|⁻)$/;

/** Divide um lado da equação em substâncias, separando pelo "+" que não é carga elétrica ("Fe3+ + Cl-" tem duas substâncias). */
export function dividirEspecies(lado) {
  const s = String(lado ?? '');
  const partes = [];
  let ini = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '+' || i === 0) continue;
    const antes = s[i - 1];
    const depois = s.slice(i + 1);
    const prox = depois.trimStart()[0];
    const colado = antes !== ' ' && depois[0] !== ' ';
    let separador;
    if (prox == null) separador = false; // "+" no fim: carga
    else if (colado && /\d/.test(depois[0]) && /[A-Za-z)\]\d]/.test(antes)) {
      // "Fe+3": carga quando os dígitos terminam a substância; "H2+3O2": coeficiente
      const fim = /^\d+/.exec(depois)[0].length;
      separador = !(depois.length === fim || /^[\s+]/.test(depois[fim]) || RX_SETA.test(depois.slice(fim, fim + 3)));
    } else separador = /[\dA-Z(\[]/.test(prox) || /^e\^?[-−⁻]/.test(depois.trimStart());
    if (separador) { partes.push(s.slice(ini, i)); ini = i + 1; }
  }
  partes.push(s.slice(ini));
  return partes.map((x) => x.trim()).filter((x) => x.length > 0);
}

/** "2 H2O" → {coef: 2, corpo: "H2O"}; sem coeficiente, coef = null. */
function separarCoeficiente(texto) {
  const m = /^(\d+)\s*(?=[A-Za-z(\[])(.*)$/.exec(texto.trim());
  return m ? { coef: Number(m[1]), corpo: m[2].trim() } : { coef: null, corpo: texto.trim() };
}

const NOME_VAR = (i, n) => (n <= 26 ? String.fromCharCode(97 + i) : `x_{${i + 1}}`);

function texFrac(f) {
  if (f.inteiro) return String(f.n);
  return `${f.n < 0n ? '-' : ''}\\frac{${f.n < 0n ? -f.n : f.n}}{${f.d}}`;
}

/** Tex de uma espécie para a equação: coeficiente + fórmula (elétron = e^-). */
function texEspecie(coef, e) {
  const t = e.eletron ? 'e^{-}' : formulaTex(e.corpo);
  return coef === 1 && e.eletron ? t : coef === 1 ? t : `${coef}\\,${t}`;
}
const uniEspecie = (coef, e) => `${coef > 1 ? coef + ' ' : ''}${e.eletron ? 'e⁻' : formulaUnicode(e.corpo)}`;

/**
 * Lê "Fe + O2 -> Fe2O3" (aceita ->, →, =, =>, ⇌; estados (s)(l)(g)(aq); coeficientes digitados; íons e elétrons).
 * @returns {{reagentes: object[], produtos: object[], digitouCoeficientes: boolean}}
 */
export function lerEquacao(texto, { simbolos = SIMBOLOS_SET } = {}) {
  const bruto = String(texto ?? '').normalize('NFC').replace(/[−–—]/g, '-').trim();
  if (!bruto) throw new ErroFormula('Digite a equação, por exemplo: Fe + O2 -> Fe2O3');
  const m = RX_SETA.exec(bruto);
  if (!m) throw new ErroFormula('Não encontrei a seta da reação. Escreva reagentes -> produtos, por exemplo: H2 + O2 -> H2O');
  const esquerda = bruto.slice(0, m.index);
  const direita = bruto.slice(m.index + m[0].length);
  if (RX_SETA.test(direita)) throw new ErroFormula('A equação tem mais de uma seta. Digite uma reação por vez.');
  let digitou = false;
  const lerLado = (lado, nome) => {
    const itens = dividirEspecies(lado);
    if (itens.length === 0) throw new ErroFormula(`Faltam os ${nome} da equação`);
    return itens.map((item) => {
      const { coef, corpo } = separarCoeficiente(item);
      if (coef != null) digitou = true;
      const limpo = corpo.replace(/\s+/g, '');
      if (RX_ELETRON.test(limpo)) return { corpo: 'e-', eletron: true, atomos: new Map(), carga: -1, coefDigitado: coef };
      try {
        const f = parseFormula(corpo, { simbolos });
        return { corpo: f.texto, eletron: false, atomos: f.atomos, carga: f.carga, coefDigitado: coef, parsed: f };
      } catch (e) {
        if (e instanceof ErroFormula) throw new ErroFormula(`Substância "${corpo}": ${e.message}`, e.posicao);
        throw e;
      }
    });
  };
  return { reagentes: lerLado(esquerda, 'reagentes'), produtos: lerLado(direita, 'produtos'), digitouCoeficientes: digitou };
}

/** Espaço nulo (base) de uma matriz de frações por eliminação de Gauss-Jordan. */
function espacoNulo(matriz, nCols) {
  const A = matriz.map((l) => l.map((x) => Frac.de(x)));
  const pivos = [];
  let r = 0;
  for (let c = 0; c < nCols && r < A.length; c++) {
    let p = r;
    while (p < A.length && A[p][c].zero) p++;
    if (p === A.length) continue;
    [A[r], A[p]] = [A[p], A[r]];
    const inv = new Frac(1).div(A[r][c]);
    A[r] = A[r].map((x) => x.mul(inv));
    for (let i = 0; i < A.length; i++) {
      if (i !== r && !A[i][c].zero) {
        const f = A[i][c];
        A[i] = A[i].map((x, j) => x.sub(f.mul(A[r][j])));
      }
    }
    pivos.push(c);
    r++;
  }
  const livres = [...Array(nCols).keys()].filter((c) => !pivos.includes(c));
  const base = livres.map((lc) => {
    const v = Array.from({ length: nCols }, () => new Frac(0));
    v[lc] = new Frac(1);
    pivos.forEach((pc, i) => { v[pc] = A[i][lc].neg(); });
    return v;
  });
  return { base, pivos, livres };
}

/**
 * Balanceia a equação. Nunca lança: devolve {ok: false, erro} com a explicação em português.
 * @param {string} texto
 * @returns {object} {ok, equacao, equacaoTex, reagentes, produtos, passos, verificacao, ...}
 */
export function balancear(texto, { simbolos = SIMBOLOS_SET } = {}) {
  let eq;
  try { eq = lerEquacao(texto, { simbolos }); } catch (e) {
    if (e instanceof ErroFormula) return { ok: false, erro: e.message };
    throw e;
  }
  const especies = [...eq.reagentes.map((e) => ({ ...e, lado: 'r' })), ...eq.produtos.map((e) => ({ ...e, lado: 'p' }))];
  const n = especies.length;
  if (n > 40) return { ok: false, erro: 'Equação grande demais (máximo de 40 substâncias).' };
  const elementos = ordemHill(new Set(especies.flatMap((e) => [...e.atomos.keys()])));
  const temCarga = especies.some((e) => e.carga !== 0);
  const linhas = elementos.map((el) => especies.map((e) => (e.lado === 'r' ? 1 : -1) * (e.atomos.get(el) ?? 0)));
  if (temCarga) linhas.push(especies.map((e) => (e.lado === 'r' ? 1 : -1) * e.carga));

  // elemento presente só de um lado: impossível
  for (const el of elementos) {
    const noR = especies.some((e) => e.lado === 'r' && e.atomos.has(el));
    const noP = especies.some((e) => e.lado === 'p' && e.atomos.has(el));
    if (noR !== noP) return { ok: false, erro: `O elemento ${el} aparece só ${noR ? 'nos reagentes' : 'nos produtos'}: confira as fórmulas ou acrescente a substância que falta.` };
  }

  const { base } = espacoNulo(linhas, n);
  if (base.length === 0) return { ok: false, erro: 'Não existe combinação de coeficientes que equilibre essa equação. Confira as fórmulas e as cargas.' };
  if (base.length > 1) {
    return { ok: false, erro: 'A equação reúne mais de uma reação independente, então há várias maneiras de balanceá-la. Digite uma reação por vez.' };
  }
  let v = base[0];
  if (v.some((x) => x.zero)) return { ok: false, erro: 'Alguma substância ficaria com coeficiente zero: ela não participa da reação como escrita. Confira a equação.' };
  if (v.some((x) => x.sinal() < 0) && v.every((x) => x.sinal() <= 0)) v = v.map((x) => x.neg());
  if (v.some((x) => x.sinal() < 0)) return { ok: false, erro: 'Os coeficientes não podem ser todos positivos: a equação, como escrita, não representa uma reação possível.' };

  // passos: valores com a variável livre = 1 → inteiros
  const fracs = v;
  const denominadores = fracs.reduce((acc, x) => mmc(acc, x.d), 1n);
  let inteiros = fracs.map((x) => x.mul(denominadores).n);
  const g = inteiros.reduce((acc, x) => mdc(acc, x), 0n) || 1n;
  inteiros = inteiros.map((x) => x / g);
  const coefs = inteiros.map(Number);
  if (coefs.some((c) => !Number.isSafeInteger(c) || c > 1e6)) return { ok: false, erro: 'Coeficientes grandes demais para esta equação.' };

  const nome = (i) => NOME_VAR(i, n);
  const termos = (el, lado) => especies
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.lado === lado)
    .map(({ e, i }) => ({ qtd: el === '__carga__' ? e.carga : (e.atomos.get(el) ?? 0), v: nome(i) }))
    .filter((t) => t.qtd !== 0);
  const montar = (ts) => (ts.length === 0 ? '0' : ts.map((t) => (t.qtd === 1 ? t.v : t.qtd === -1 ? `-${t.v}` : `${t.qtd}${t.v}`)).join(' + ').replace(/\+ -/g, '- '));

  const passos = [];
  const lhsLit = eq.reagentes.map((e, i) => `${nome(i)}\\,${e.eletron ? 'e^{-}' : formulaTex(e.corpo)}`).join(' + ');
  const rhsLit = eq.produtos.map((e, i) => `${nome(eq.reagentes.length + i)}\\,${e.eletron ? 'e^{-}' : formulaTex(e.corpo)}`).join(' + ');
  passos.push({
    texto: 'Dê um coeficiente desconhecido a cada substância (letras) e escreva a equação com eles.',
    tex: `${lhsLit} \\rightarrow ${rhsLit}`
  });
  const eqs = elementos.map((el) => ({ rot: `\\mathrm{${el}}`, tex: `${montar(termos(el, 'r'))} = ${montar(termos(el, 'p'))}` }));
  if (temCarga) eqs.push({ rot: '\\text{carga}', tex: `${montar(termos('__carga__', 'r'))} = ${montar(termos('__carga__', 'p'))}` });
  passos.push({
    texto: `Para cada ${temCarga ? 'elemento (e para a carga elétrica)' : 'elemento'}, a quantidade de átomos tem de ser igual nos dois lados:`,
    tex: eqs.map((q) => `${q.rot}:\\; ${q.tex}`),
    lista: true
  });
  const fixado = fracs.map((x, i) => `${nome(i)} = ${texFrac(x)}`).join(',\\; ');
  passos.push({
    texto: 'Resolva o sistema (eliminação de Gauss com frações exatas), escolhendo uma das incógnitas como 1:',
    tex: fixado
  });
  if (denominadores !== 1n || g !== 1n) {
    passos.push({
      texto: `${denominadores !== 1n ? `Multiplique tudo por ${denominadores} (o mínimo múltiplo comum dos denominadores)` : 'Divida pelo maior divisor comum'} para obter os menores números inteiros:`,
      tex: coefs.map((c, i) => `${nome(i)} = ${c}`).join(',\\; ')
    });
  } else {
    passos.push({ texto: 'Os valores já são os menores números inteiros:', tex: coefs.map((c, i) => `${nome(i)} = ${c}`).join(',\\; ') });
  }

  const R = eq.reagentes.map((e, i) => ({ ...e, coef: coefs[i] }));
  const P = eq.produtos.map((e, i) => ({ ...e, coef: coefs[eq.reagentes.length + i] }));
  const equacao = `${R.map((e) => uniEspecie(e.coef, e)).join(' + ')} → ${P.map((e) => uniEspecie(e.coef, e)).join(' + ')}`;
  const equacaoTex = `${R.map((e) => texEspecie(e.coef, e)).join(' + ')} \\rightarrow ${P.map((e) => texEspecie(e.coef, e)).join(' + ')}`;
  passos.push({ texto: 'Equação balanceada:', tex: equacaoTex, destaque: true });

  const verificacao = elementos.map((el) => {
    const esq = R.reduce((a, e) => a + e.coef * (e.atomos.get(el) ?? 0), 0);
    const dir = P.reduce((a, e) => a + e.coef * (e.atomos.get(el) ?? 0), 0);
    return { elemento: el, esquerda: esq, direita: dir, ok: esq === dir };
  });
  if (temCarga) {
    const esq = R.reduce((a, e) => a + e.coef * e.carga, 0);
    const dir = P.reduce((a, e) => a + e.coef * e.carga, 0);
    verificacao.push({ elemento: 'carga', esquerda: esq, direita: dir, ok: esq === dir });
  }
  passos.push({
    texto: 'Conferência (reagentes = produtos): ' + verificacao.map((x) => `${x.elemento === 'carga' ? 'carga' : x.elemento} ${x.esquerda} = ${x.direita}`).join('; ') + '.'
  });

  return {
    ok: true,
    entrada: String(texto).trim(),
    reagentes: R.map(resumir),
    produtos: P.map(resumir),
    equacao,
    equacaoTex,
    passos,
    verificacao,
    coeficientes: coefs,
    comCarga: temCarga,
    digitouCoeficientes: eq.digitouCoeficientes
  };
}

function resumir(e) {
  return { coef: e.coef, formula: e.corpo, eletron: !!e.eletron, atomos: e.atomos, carga: e.carga, parsed: e.parsed ?? null };
}

export { normalizarEntrada };
