// Concentração de soluções: molaridade, massa necessária, g/L ↔ mol/L, percentuais e diluição (C1·V1 = C2·V2).
import { arredondar, fmt, fmtTex } from '../formato.js';
import { ErroFormula, formulaUnicode, massaMolar, parseFormula } from './formula.js';
import { acharUnidade, paraBase } from './unidades.js';

const fm = (x, sig = 6) => fmt(x, { sig });
const ft = (x, sig = 6) => fmtTex(x, { sig });

export const MODOS_CONCENTRACAO = [
  { id: 'molaridade', rotulo: 'Molaridade (mol/L) a partir da massa de soluto e do volume' },
  { id: 'massa', rotulo: 'Massa de soluto necessária para uma solução' },
  { id: 'gl-mol', rotulo: 'Converter g/L ↔ mol/L' },
  { id: 'percentual-mm', rotulo: 'Percentual em massa (m/m)' },
  { id: 'percentual-mv', rotulo: 'Percentual massa/volume (g por 100 mL)' },
  { id: 'diluicao', rotulo: 'Diluição (C₁V₁ = C₂V₂)' }
];

function gramas(e, ctx, rot) {
  if (!e || !Number.isFinite(e.valor)) throw new ErroFormula(`Informe ${rot}.`);
  if (!acharUnidade(ctx.unidades, e.unidade || 'g').some((x) => x.grupo === 'massa')) throw new ErroFormula(`Unidade de massa desconhecida: "${e.unidade}".`);
  return paraBase(ctx.unidades, e.unidade || 'g', 'massa', e.valor) * 1000;
}
function litros(e, ctx, rot) {
  if (!e || !Number.isFinite(e.valor)) throw new ErroFormula(`Informe ${rot}.`);
  if (!acharUnidade(ctx.unidades, e.unidade || 'L').some((x) => x.grupo === 'volume')) throw new ErroFormula(`Unidade de volume desconhecida: "${e.unidade}".`);
  return paraBase(ctx.unidades, e.unidade || 'L', 'volume', e.valor) * 1000;
}
function massaMolarDe(formula, ctx) {
  const f = parseFormula(formula, { simbolos: ctx.simbolos });
  const mm = massaMolar(f, ctx.massaDe);
  if (mm.faltando.length) throw new ErroFormula(`O pacote de dados não tem a massa atômica de: ${mm.faltando.join(', ')}.`);
  return { f, M: arredondar(mm.total, 6) };
}
const positivo = (x, rot) => { if (!(x > 0)) throw new ErroFormula(`${rot} deve ser maior que zero.`); return x; };

/** @param {{modo: string} & Record<string, any>} e */
export function calcularConcentracao(e, ctx) {
  try {
    const fontes = [ctx.fonteElemento ?? { nome: 'Massas atômicas do pacote de dados (elementos.json)' }];
    if (e.modo === 'molaridade') {
      const { f, M } = massaMolarDe(e.formula, ctx);
      const m = positivo(gramas(e.massa, ctx, 'a massa do soluto'), 'A massa');
      const V = positivo(litros(e.volume, ctx, 'o volume da solução'), 'O volume');
      const n = m / M;
      const C = n / V;
      return {
        ok: true, modo: e.modo, valor: C,
        resultados: [{ rotulo: 'Concentração em quantidade de matéria', valor: fm(C), unidade: 'mol/L', destaque: true }, { rotulo: 'Quantidade de matéria do soluto', valor: fm(n), unidade: 'mol' }, { rotulo: 'Concentração em massa', valor: fm(m / V), unidade: 'g/L' }],
        passos: [
          { texto: `Massa molar do soluto (${formulaUnicode(f.texto)}):`, tex: `M = ${ft(M)}\\ \\mathrm{g/mol}` },
          { texto: 'Quantidade de matéria do soluto (n = m ÷ M):', tex: `n = \\dfrac{${ft(m)}\\ \\mathrm{g}}{${ft(M)}\\ \\mathrm{g/mol}} = ${ft(n)}\\ \\mathrm{mol}` },
          { texto: 'Molaridade (C = n ÷ V, com V em litros):', tex: `C = \\dfrac{n}{V} = \\dfrac{${ft(n)}\\ \\mathrm{mol}}{${ft(V)}\\ \\mathrm{L}} = ${ft(C)}\\ \\mathrm{mol/L}`, destaque: true }
        ],
        notas: [], fontes
      };
    }
    if (e.modo === 'massa') {
      const { f, M } = massaMolarDe(e.formula, ctx);
      const V = positivo(litros(e.volume, ctx, 'o volume da solução'), 'O volume');
      const c = e.concentracao;
      if (!c || !Number.isFinite(c.valor)) throw new ErroFormula('Informe a concentração desejada.');
      const u = String(c.unidade || 'mol/L');
      let molL;
      let tex1;
      if (/^g\/l$/i.test(u)) { molL = c.valor / M; tex1 = `C = \\dfrac{${ft(c.valor)}\\ \\mathrm{g/L}}{${ft(M)}\\ \\mathrm{g/mol}} = ${ft(molL)}\\ \\mathrm{mol/L}`; }
      else {
        const un = acharUnidade(ctx.unidades, u).find((x) => x.grupo === 'concentracao');
        if (!un) throw new ErroFormula(`Unidade de concentração desconhecida: "${u}". Use mol/L, mmol/L ou g/L.`);
        molL = (c.valor * un.fator) / 1000;
        tex1 = molL === c.valor ? null : `C = ${ft(molL)}\\ \\mathrm{mol/L}`;
      }
      positivo(molL, 'A concentração');
      const n = molL * V;
      const m = n * M;
      const passos = [{ texto: `Massa molar do soluto (${formulaUnicode(f.texto)}):`, tex: `M = ${ft(M)}\\ \\mathrm{g/mol}` }];
      if (tex1) passos.push({ texto: 'Concentração em mol/L:', tex: tex1 });
      passos.push({ texto: 'Quantidade de matéria necessária (n = C × V):', tex: `n = ${ft(molL)} \\times ${ft(V)} = ${ft(n)}\\ \\mathrm{mol}` });
      passos.push({ texto: 'Massa de soluto (m = n × M):', tex: `m = ${ft(n)} \\times ${ft(M)} = ${ft(m)}\\ \\mathrm{g}`, destaque: true });
      return { ok: true, modo: e.modo, valor: m, resultados: [{ rotulo: `Massa de ${formulaUnicode(f.texto)}`, valor: fm(m), unidade: 'g', destaque: true }, { rotulo: 'Quantidade de matéria', valor: fm(n), unidade: 'mol' }], passos, notas: ['Dissolva o soluto em solvente suficiente e complete até o volume final da solução (o volume é o da solução, não o do solvente).'], fontes };
    }
    if (e.modo === 'gl-mol') {
      const { f, M } = massaMolarDe(e.formula, ctx);
      if (!Number.isFinite(e.valor)) throw new ErroFormula('Informe a concentração.');
      positivo(e.valor, 'A concentração');
      const deGL = /g\/l/i.test(e.de || 'g/L');
      const res = deGL ? e.valor / M : e.valor * M;
      return {
        ok: true, modo: e.modo, valor: res,
        resultados: [{ rotulo: deGL ? 'Concentração em quantidade de matéria' : 'Concentração em massa', valor: fm(res), unidade: deGL ? 'mol/L' : 'g/L', destaque: true }],
        passos: [
          { texto: `Massa molar (${formulaUnicode(f.texto)}):`, tex: `M = ${ft(M)}\\ \\mathrm{g/mol}` },
          deGL
            ? { texto: 'Divida a concentração em massa pela massa molar:', tex: `C = \\dfrac{C_m}{M} = \\dfrac{${ft(e.valor)}\\ \\mathrm{g/L}}{${ft(M)}\\ \\mathrm{g/mol}} = ${ft(res)}\\ \\mathrm{mol/L}`, destaque: true }
            : { texto: 'Multiplique a molaridade pela massa molar:', tex: `C_m = C \\times M = ${ft(e.valor)}\\ \\mathrm{mol/L} \\times ${ft(M)}\\ \\mathrm{g/mol} = ${ft(res)}\\ \\mathrm{g/L}`, destaque: true }
        ],
        notas: [], fontes
      };
    }
    if (e.modo === 'percentual-mm') {
      const s = positivo(gramas(e.soluto, ctx, 'a massa do soluto'), 'A massa do soluto');
      const t = positivo(gramas(e.solucao, ctx, 'a massa da solução'), 'A massa da solução');
      if (s > t) throw new ErroFormula('A massa do soluto não pode ser maior que a da solução.');
      const p = (s / t) * 100;
      return {
        ok: true, modo: e.modo, valor: p,
        resultados: [{ rotulo: 'Percentual em massa (m/m)', valor: fm(p), unidade: '%', destaque: true }, { rotulo: 'Título (fração em massa)', valor: fm(s / t), unidade: '' }],
        passos: [{ texto: 'Divida a massa do soluto pela massa da solução e multiplique por 100:', tex: `\\%\\,(m/m) = \\dfrac{m_{\\text{soluto}}}{m_{\\text{solução}}} \\times 100 = \\dfrac{${ft(s)}}{${ft(t)}} \\times 100 = ${ft(p)}\\,\\%`, destaque: true }],
        notas: [], fontes: []
      };
    }
    if (e.modo === 'percentual-mv') {
      const s = positivo(gramas(e.soluto, ctx, 'a massa do soluto'), 'A massa do soluto');
      const mL = positivo(litros(e.volume, ctx, 'o volume da solução') * 1000, 'O volume');
      const p = (s / mL) * 100;
      return {
        ok: true, modo: e.modo, valor: p,
        resultados: [{ rotulo: 'Percentual massa/volume', valor: fm(p), unidade: 'g/100 mL', destaque: true }],
        passos: [{ texto: 'Massa de soluto (g) por 100 mL de solução:', tex: `\\%\\,(m/V) = \\dfrac{${ft(s)}\\ \\mathrm{g}}{${ft(mL)}\\ \\mathrm{mL}} \\times 100 = ${ft(p)}\\ \\mathrm{g/100\\,mL}`, destaque: true }],
        notas: [], fontes: []
      };
    }
    if (e.modo === 'diluicao') {
      const uc = e.unidadeC || 'mol/L';
      const uv = e.unidadeV || 'L';
      const vals = { C1: e.C1, V1: e.V1, C2: e.C2, V2: e.V2 };
      const faltam = Object.keys(vals).filter((k) => vals[k] == null || !Number.isFinite(vals[k]));
      if (faltam.length !== 1) throw new ErroFormula('Deixe exatamente um dos quatro campos em branco: é ele que será calculado.');
      for (const k of Object.keys(vals)) if (!faltam.includes(k) && !(vals[k] > 0)) throw new ErroFormula('Os valores informados devem ser maiores que zero.');
      const alvo = faltam[0];
      let r;
      let tex;
      let texto;
      const q = { C1: ft(vals.C1), V1: ft(vals.V1), C2: ft(vals.C2), V2: ft(vals.V2) };
      if (alvo === 'C1') { r = (vals.C2 * vals.V2) / vals.V1; tex = `C_1 = \\dfrac{C_2 V_2}{V_1} = \\dfrac{${q.C2} \\times ${q.V2}}{${q.V1}} = ${ft(r)}`; texto = 'Isole a concentração inicial:'; }
      if (alvo === 'V1') { r = (vals.C2 * vals.V2) / vals.C1; tex = `V_1 = \\dfrac{C_2 V_2}{C_1} = \\dfrac{${q.C2} \\times ${q.V2}}{${q.C1}} = ${ft(r)}`; texto = 'Isole o volume da solução concentrada a medir:'; }
      if (alvo === 'C2') { r = (vals.C1 * vals.V1) / vals.V2; tex = `C_2 = \\dfrac{C_1 V_1}{V_2} = \\dfrac{${q.C1} \\times ${q.V1}}{${q.V2}} = ${ft(r)}`; texto = 'Isole a concentração final:'; }
      if (alvo === 'V2') { r = (vals.C1 * vals.V1) / vals.C2; tex = `V_2 = \\dfrac{C_1 V_1}{C_2} = \\dfrac{${q.C1} \\times ${q.V1}}{${q.C2}} = ${ft(r)}`; texto = 'Isole o volume final:'; }
      const unid = alvo[0] === 'C' ? uc : uv;
      const resultados = [{ rotulo: { C1: 'Concentração inicial (C₁)', V1: 'Volume inicial (V₁)', C2: 'Concentração final (C₂)', V2: 'Volume final (V₂)' }[alvo], valor: fm(r), unidade: unid, destaque: true }];
      const notas = ['Na diluição a quantidade de soluto não muda: C₁V₁ = C₂V₂. Use a mesma unidade de concentração e a mesma unidade de volume nos dois lados.'];
      if (alvo === 'V1' || alvo === 'V2') {
        const v1 = alvo === 'V1' ? r : vals.V1; const v2 = alvo === 'V2' ? r : vals.V2;
        if (v2 >= v1) { resultados.push({ rotulo: 'Volume de solvente a acrescentar (V₂ − V₁)', valor: fm(v2 - v1), unidade: uv }); } else notas.push('Atenção: o volume final ficou menor que o inicial; isso é uma concentração, não uma diluição.');
      }
      return { ok: true, modo: e.modo, valor: r, resultados, passos: [{ texto: 'Na diluição a quantidade de soluto se conserva:', tex: 'C_1 V_1 = C_2 V_2' }, { texto, tex: `${tex}\\ \\mathrm{${unid.replace(/\//g, '/')}}`, destaque: true }], notas, fontes: [] };
    }
    return { ok: false, erro: 'Escolha o tipo de cálculo.' };
  } catch (err) {
    if (err instanceof ErroFormula) return { ok: false, erro: err.message };
    throw err;
  }
}
