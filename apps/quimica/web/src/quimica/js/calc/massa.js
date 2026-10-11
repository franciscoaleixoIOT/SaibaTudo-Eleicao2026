// Massa molar a partir da fórmula e das massas atômicas do pacote de dados, com passos e composição percentual.
import { arredondar, fmt, fmtTex } from '../formato.js';
import { ErroFormula, formulaTex, formulaUnicode, massaMolar, ordemHill, parseFormula } from './formula.js';

const m = (x) => fmt(arredondar(x, 5), { sig: 9, cientifica: false });
const mt = (x) => fmtTex(arredondar(x, 5), { sig: 9, cientifica: false });

/** Resultado da massa molar de uma fórmula. Nunca lança. */
export function calcularMassaMolar(texto, ctx) {
  let f;
  try { f = parseFormula(texto, { simbolos: ctx.simbolos }); } catch (e) {
    if (e instanceof ErroFormula) return { ok: false, erro: e.message };
    throw e;
  }
  const mm = massaMolar(f, ctx.massaDe);
  if (mm.faltando.length) {
    return { ok: false, erro: `O pacote de dados não tem a massa atômica de: ${mm.faltando.map((s) => `${ctx.nomeDe(s)} (${s})`).join(', ')}.` };
  }
  const total = arredondar(mm.total, 6);
  const passos = [
    {
      texto: 'Conte os átomos de cada elemento na fórmula' + (f.hidrato ? ' (somando a água de cristalização)' : '') + ':',
      tex: `${formulaTex(f.texto)} \\;\\Rightarrow\\; ${mm.linhas.map((l) => `${l.n}\\,\\mathrm{${l.simbolo}}`).join(',\\; ')}`
    },
    {
      texto: 'Multiplique o número de átomos pela massa atômica de cada elemento (valores do pacote de dados, em g/mol):',
      tex: mm.linhas.map((l) => `\\mathrm{${l.simbolo}}:\\; ${l.n} \\times ${mt(l.massa)} = ${mt(l.subtotal)}`),
      lista: true
    },
    {
      texto: 'Some as contribuições:',
      tex: `M = ${mm.linhas.map((l) => mt(l.subtotal)).join(' + ')} = ${mt(total)}\\ \\mathrm{g/mol}`,
      destaque: true
    }
  ];
  if (f.hidrato) {
    const partes = f.partes.map((p) => {
      const ps = massaMolar({ atomos: p.atomos }, ctx.massaDe);
      return { ...p, massa: ps.total * p.coef };
    });
    passos.push({
      texto: 'Cada parte do hidrato contribui assim (g/mol):',
      tex: partes.map((p) => `${p.coef > 1 ? `${p.coef}\\times ` : ''}${formulaTex(p.corpo)}:\\; ${mt(p.massa)}`),
      lista: true
    });
  }
  const notas = [];
  if (f.carga !== 0) notas.push('A massa dos elétrons ganhos ou perdidos é desprezada (é muito menor que a incerteza das massas atômicas).');
  const composicao = mm.linhas.map((l) => ({ simbolo: l.simbolo, nome: ctx.nomeDe(l.simbolo), n: l.n, massa: l.massa, subtotal: l.subtotal, percentual: (l.subtotal / mm.total) * 100 }));
  return {
    ok: true,
    formula: f.texto,
    formulaUnicode: formulaUnicode(f.texto),
    hill: f.hill,
    carga: f.carga,
    massaMolar: total,
    composicao,
    resultados: [
      { rotulo: `Massa molar de ${formulaUnicode(f.texto)}`, valor: m(total), unidade: 'g/mol', destaque: true },
      ...composicao.map((c) => ({ rotulo: `${c.nome} (${c.simbolo}), % em massa`, valor: fmt(c.percentual, { sig: 4 }), unidade: '%' }))
    ],
    passos,
    notas,
    elementosUsados: ordemHill(f.atomos.keys()),
    fontes: [ctx.fonteElemento ?? { nome: 'Massas atômicas do pacote de dados (elementos.json)' }]
  };
}
