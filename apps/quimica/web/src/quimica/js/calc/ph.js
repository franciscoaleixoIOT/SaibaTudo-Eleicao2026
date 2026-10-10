// pH de ácidos e bases fortes (ionização total) e de ácidos/bases fracos monopróticos (Ka ou Kb dados), e conversões pH ↔ pOH ↔ [H+] ↔ [OH-].
// A 25 °C o produto iônico da água vem do pacote quando existir; senão vale a convenção pH + pOH = 14 (dita no resultado).
import { fmt, fmtTex } from '../formato.js';

const fm = (x, sig = 4) => fmt(x, { sig });
const ft = (x, sig = 4) => fmtTex(x, { sig });
const dec = (x, c = 2) => fmt(x, { casas: c });
const log10 = Math.log10;

export const TIPOS_PH = [
  { id: 'acido-forte', rotulo: 'Ácido forte' },
  { id: 'base-forte', rotulo: 'Base forte' },
  { id: 'acido-fraco', rotulo: 'Ácido fraco (Ka dado)' },
  { id: 'base-fraca', rotulo: 'Base fraca (Kb dado)' },
  { id: 'converter', rotulo: 'Converter pH, pOH, [H⁺], [OH⁻]' }
];

function classe(pH, pKw) {
  const neutro = pKw / 2;
  if (Math.abs(pH - neutro) < 0.005) return 'neutra';
  return pH < neutro ? 'ácida' : 'básica';
}

function montar({ pH, pKw, passos, notas, extras = [], pKwOrigem }) {
  const pOH = pKw - pH;
  const H = 10 ** -pH;
  const OH = 10 ** -pOH;
  const cl = classe(pH, pKw);
  return {
    ok: true,
    pH, pOH, H, OH, classificacao: cl,
    resultados: [
      { rotulo: 'pH', valor: dec(pH), unidade: '', destaque: true },
      { rotulo: 'pOH', valor: dec(pOH), unidade: '' },
      { rotulo: '[H⁺]', valor: fm(H), unidade: 'mol/L' },
      { rotulo: '[OH⁻]', valor: fm(OH), unidade: 'mol/L' },
      { rotulo: 'Solução', valor: cl, unidade: '' },
      ...extras
    ],
    passos,
    notas: [...notas, `Produto iônico da água: pKw = ${fm(pKw)} (${pKwOrigem}).`],
    fontes: []
  };
}

/**
 * @param {{tipo: string, C?: number, n?: number, Ka?: number, pKa?: number, Kb?: number, pKb?: number, pH?: number, pOH?: number, H?: number, OH?: number}} e
 */
export function calcularPH(e, ctx) {
  const pKw = ctx.pKw.valor;
  const Kw = 10 ** -pKw;
  const origem = ctx.pKw.origem;
  const notas = [];
  const T = e.tipo;
  if (T === 'converter') {
    const dado = ['pH', 'pOH', 'H', 'OH'].filter((k) => e[k] != null && Number.isFinite(e[k]));
    if (dado.length !== 1) return { ok: false, erro: 'Informe exatamente um valor: pH, pOH, [H⁺] ou [OH⁻].' };
    const k = dado[0];
    if ((k === 'H' || k === 'OH') && !(e[k] > 0)) return { ok: false, erro: 'A concentração deve ser maior que zero.' };
    let pH;
    let texto;
    let tex;
    if (k === 'pH') { pH = e.pH; texto = 'O pH foi informado.'; tex = `\\mathrm{pH} = ${ft(pH)}`; }
    if (k === 'pOH') { pH = pKw - e.pOH; texto = 'pH = pKw − pOH:'; tex = `\\mathrm{pH} = ${ft(pKw)} - ${ft(e.pOH)} = ${ft(pH)}`; }
    if (k === 'H') { pH = -log10(e.H); texto = 'pH = −log₁₀[H⁺]:'; tex = `\\mathrm{pH} = -\\log_{10}(${ft(e.H)}) = ${ft(pH)}`; }
    if (k === 'OH') { const pOH = -log10(e.OH); pH = pKw - pOH; texto = 'pOH = −log₁₀[OH⁻] e pH = pKw − pOH:'; tex = `\\mathrm{pOH} = -\\log_{10}(${ft(e.OH)}) = ${ft(pOH)}, \\quad \\mathrm{pH} = ${ft(pKw)} - ${ft(pOH)} = ${ft(pH)}`; }
    const passos = [{ texto, tex }, { texto: 'Relações usadas:', tex: ['\\mathrm{pH} = -\\log_{10}[\\mathrm{H^+}]', '\\mathrm{pOH} = -\\log_{10}[\\mathrm{OH^-}]', '\\mathrm{pH} + \\mathrm{pOH} = \\mathrm{p}K_w'], lista: true }];
    return montar({ pH, pKw, passos, notas, pKwOrigem: origem });
  }

  const C = e.C;
  if (!Number.isFinite(C) || !(C > 0)) return { ok: false, erro: 'Informe a concentração (maior que zero) em mol/L.' };

  if (T === 'acido-forte' || T === 'base-forte') {
    const n = Math.max(1, Math.round(e.n ?? 1));
    const ac = T === 'acido-forte';
    const c = C * n;
    const ion = ac ? '\\mathrm{H^+}' : '\\mathrm{OH^-}';
    const passos = [{ texto: `${ac ? 'Ácido' : 'Base'} forte: ionização (dissociação) total. Cada fórmula libera ${n} ${ac ? 'H⁺' : 'OH⁻'}.`, tex: `[${ion}] = ${n} \\times ${ft(C)} = ${ft(c)}\\ \\mathrm{mol/L}` }];
    let x = c;
    if (c < 1e-6) {
      x = (c + Math.sqrt(c * c + 4 * Kw)) / 2;
      passos.push({ texto: 'Como a solução é muito diluída, a autoionização da água não pode ser ignorada; resolva [íon]² − c[íon] − Kw = 0:', tex: `[${ion}] = \\dfrac{c + \\sqrt{c^2 + 4K_w}}{2} = ${ft(x)}\\ \\mathrm{mol/L}` });
      notas.push('Solução muito diluída: o cálculo incluiu a água.');
    }
    let pH;
    if (ac) {
      pH = -log10(x);
      passos.push({ texto: 'pH = −log₁₀[H⁺]:', tex: `\\mathrm{pH} = -\\log_{10}(${ft(x)}) = ${ft(pH)}`, destaque: true });
    } else {
      const pOH = -log10(x);
      pH = pKw - pOH;
      passos.push({ texto: 'pOH = −log₁₀[OH⁻] e pH = pKw − pOH:', tex: `\\mathrm{pOH} = -\\log_{10}(${ft(x)}) = ${ft(pOH)}, \\quad \\mathrm{pH} = ${ft(pKw)} - ${ft(pOH)} = ${ft(pH)}`, destaque: true });
    }
    if (n > 1 && ac) notas.push('Modelo escolar: considera-se a ionização completa dos n hidrogênios ionizáveis (na prática, a segunda ionização de vários ácidos é parcial).');
    return montar({ pH, pKw, passos, notas, pKwOrigem: origem });
  }

  if (T === 'acido-fraco' || T === 'base-fraca') {
    const ac = T === 'acido-fraco';
    let K = ac ? e.Ka : e.Kb;
    const pK = ac ? e.pKa : e.pKb;
    if (!(K > 0) && Number.isFinite(pK)) K = 10 ** -pK;
    if (!(K > 0)) return { ok: false, erro: `Informe ${ac ? 'Ka (ou pKa)' : 'Kb (ou pKb)'} do ${ac ? 'ácido' : 'da base'} fraco(a).` };
    const x = (-K + Math.sqrt(K * K + 4 * K * C)) / 2;
    const alfa = (x / C) * 100;
    const ion = ac ? '\\mathrm{H^+}' : '\\mathrm{OH^-}';
    const kk = ac ? 'K_a' : 'K_b';
    const passos = [
      { texto: `${ac ? 'Ácido' : 'Base'} fraco(a) monoprótico(a): equilíbrio ${ac ? 'HA ⇌ H⁺ + A⁻' : 'B + H₂O ⇌ BH⁺ + OH⁻'}. Com x = [${ac ? 'H⁺' : 'OH⁻'}] no equilíbrio:`, tex: `${kk} = \\dfrac{x^2}{C - x}${Number.isFinite(pK) && !(e[ac ? 'Ka' : 'Kb'] > 0) ? ` \\quad (${kk} = 10^{-${ft(pK)}} = ${ft(K)})` : ` = ${ft(K)}`}` },
      { texto: 'Resolva a equação do segundo grau x² + K·x − K·C = 0 (sem aproximações):', tex: `x = \\dfrac{-${kk} + \\sqrt{${kk}^2 + 4${kk}C}}{2} = ${ft(x)}\\ \\mathrm{mol/L}` },
      { texto: `Portanto [${ac ? 'H⁺' : 'OH⁻'}] = x.`, tex: `[${ion}] = ${ft(x)}\\ \\mathrm{mol/L}` }
    ];
    let pH;
    if (ac) {
      pH = -log10(x);
      passos.push({ texto: 'pH = −log₁₀[H⁺]:', tex: `\\mathrm{pH} = -\\log_{10}(${ft(x)}) = ${ft(pH)}`, destaque: true });
    } else {
      const pOH = -log10(x);
      pH = pKw - pOH;
      passos.push({ texto: 'pOH = −log₁₀[OH⁻] e pH = pKw − pOH:', tex: `\\mathrm{pOH} = -\\log_{10}(${ft(x)}) = ${ft(pOH)}, \\quad \\mathrm{pH} = ${ft(pKw)} - ${ft(pOH)} = ${ft(pH)}`, destaque: true });
    }
    passos.push({ texto: `Grau de ${ac ? 'ionização' : 'ionização da base'} (α = x ÷ C):`, tex: `\\alpha = \\dfrac{x}{C} = \\dfrac{${ft(x)}}{${ft(C)}} = ${ft(alfa)}\\,\\%` });
    if (x < 1e-6) notas.push('[íon] resultou muito pequeno: a autoionização da água pode ser relevante e este modelo a ignora.');
    return montar({ pH, pKw, passos, notas, extras: [{ rotulo: 'Grau de ionização', valor: fm(alfa), unidade: '%' }], pKwOrigem: origem });
  }
  return { ok: false, erro: 'Escolha o tipo de solução.' };
}
