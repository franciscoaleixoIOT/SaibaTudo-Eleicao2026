// Calculadoras: fórmulas, massa molar, balanceamento, estequiometria, concentração, pH, gás ideal e unidades (determinísticas, com o pacote de teste).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ctx as ctxDe, loja } from './support.mjs';
import { validarPassos, validarTex } from './tex.mjs';
import { ErroFormula, chaveFormula, formulaHill, formulaTex, formulaTokens, formulaUnicode, parseFormula, separarCarga } from '../src/quimica/js/calc/formula.js';
import { balancear, dividirEspecies } from '../src/quimica/js/calc/balancear.js';
import { calcularMassaMolar } from '../src/quimica/js/calc/massa.js';
import { calcularEstequiometria, converterQuantidade } from '../src/quimica/js/calc/estequiometria.js';
import { calcularConcentracao } from '../src/quimica/js/calc/concentracao.js';
import { calcularPH } from '../src/quimica/js/calc/ph.js';
import { calcularGas } from '../src/quimica/js/calc/gas.js';
import { converter, tabelaDeUnidades, UNIDADES_PADRAO } from '../src/quimica/js/calc/unidades.js';
import { fmt, lerNumero } from '../src/quimica/js/formato.js';
import { Frac } from '../src/quimica/js/calc/frac.js';

const perto = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≠ ${b}`);
const atomos = (f) => Object.fromEntries([...parseFormula(f).atomos]);

// ------------------------------------------------------------------------------------------------ fórmulas
test('parser de fórmulas: casos clássicos', () => {
  assert.deepEqual(atomos('H2O'), { H: 2, O: 1 });
  assert.deepEqual(atomos('Ca(OH)2'), { Ca: 1, O: 2, H: 2 });
  assert.deepEqual(atomos('CuSO4·5H2O'), { Cu: 1, S: 1, O: 9, H: 10 });
  assert.deepEqual(atomos('C6H12O6'), { C: 6, H: 12, O: 6 });
  assert.deepEqual(atomos('Fe2(SO4)3'), { Fe: 2, S: 3, O: 12 });
  assert.deepEqual(atomos('Al2(SO4)3·18H2O'), { Al: 2, S: 3, O: 30, H: 36 });
  assert.deepEqual(atomos('K4[Fe(CN)6]'), { K: 4, Fe: 1, C: 6, N: 6 });
  assert.deepEqual(atomos('(NH4)3PO4'), { N: 3, H: 12, P: 1, O: 4 });
  assert.deepEqual(atomos('Mg(OH)2'), { Mg: 1, O: 2, H: 2 });
  assert.deepEqual(atomos('Ca3(PO4)2'), { Ca: 3, P: 2, O: 8 });
  assert.deepEqual(atomos('Co'), { Co: 1 });
  assert.deepEqual(atomos('CO'), { C: 1, O: 1 });
  assert.deepEqual(atomos('NaCl'), { Na: 1, Cl: 1 });
});

test('parser: hidratos com vários separadores, subscritos Unicode, colchetes e espaços', () => {
  const ref = atomos('CuSO4·5H2O');
  for (const v of ['CuSO4.5H2O', 'CuSO4 * 5 H2O', 'CuSO₄·5H₂O', 'CuSO4•5H2O', 'CuSO4 · 5H2O']) assert.deepEqual(atomos(v), ref, v);
  assert.deepEqual(atomos('Fe₂(SO₄)₃'), atomos('Fe2(SO4)3'));
  assert.deepEqual(atomos('Ca[OH]2'), atomos('Ca(OH)2'));
  assert.equal(parseFormula('CuSO4·5H2O').hidrato, true);
  assert.equal(parseFormula('CuSO4·5H2O').partes[1].coef, 5);
  assert.equal(parseFormula('CaCl2(s)').hill, 'CaCl2', 'estado físico é ignorado');
});

test('parser: cargas elétricas em várias grafias', () => {
  const c = (t) => { const f = parseFormula(t); return [f.hill, f.carga]; };
  assert.deepEqual(c('Na+'), ['Na', 1]);
  assert.deepEqual(c('Cl-'), ['Cl', -1]);
  assert.deepEqual(c('Fe3+'), ['Fe', 3]);
  assert.deepEqual(c('Fe^3+'), ['Fe', 3]);
  assert.deepEqual(c('Fe+3'), ['Fe', 3]);
  assert.deepEqual(c('Fe³⁺'), ['Fe', 3]);
  assert.deepEqual(c('SO4^2-'), ['O4S', -2]);
  assert.deepEqual(c('SO42-'), ['O4S', -2]);
  assert.deepEqual(c('SO₄²⁻'), ['O4S', -2]);
  assert.deepEqual(c('NO3-'), ['NO3', -1]);
  assert.deepEqual(c('NH4+'), ['H4N', 1]);
  assert.deepEqual(c('CO32-'), ['CO3', -2]);
  assert.deepEqual(c('Cr2O72-'), ['Cr2O7', -2]);
  assert.deepEqual(c('OH-'), ['HO', -1]);
  assert.deepEqual(c('H3O+'), ['H3O', 1]);
  assert.deepEqual(c('O2^-'), ['O2', -1]);
  assert.deepEqual(c('H2O'), ['H2O', 0]);
  assert.deepEqual(separarCarga('Fe++'), { corpo: 'Fe', carga: 2 });
});

test('parser: erros claros em português', () => {
  const erro = (t) => { try { parseFormula(t); } catch (e) { assert.ok(e instanceof ErroFormula); return e.message; } assert.fail(`deveria falhar: ${t}`); };
  assert.match(erro(''), /vazia/);
  assert.match(erro('H2O)'), /sem "\("/);
  assert.match(erro('Ca(OH'), /sem "\)"/);
  assert.match(erro('Xx2'), /não é símbolo/);
  assert.match(erro('h2o'), /minúscula/);
  assert.match(erro('H2$O'), /inesperado/);
  assert.match(erro('()'), /vazios/);
  assert.match(erro('H0'), /Quantidade inválida/);
  assert.match(erro('CuSO4·'), /vazia/);
});

test('notação de Hill e representações (Unicode, TeX, tokens)', () => {
  assert.equal(parseFormula('C2H5OH').hill, 'C2H6O');
  assert.equal(parseFormula('NaCl').hill, 'ClNa');
  assert.equal(parseFormula('H2SO4').hill, 'H2O4S');
  assert.equal(formulaHill(new Map([['O', 1], ['H', 2]])), 'H2O');
  assert.equal(formulaUnicode('Ca(OH)2'), 'Ca(OH)₂');
  assert.equal(formulaUnicode('CuSO4·5H2O'), 'CuSO₄·5H₂O');
  assert.equal(formulaUnicode('SO4^2-'), 'SO₄²⁻');
  assert.equal(formulaUnicode('Fe3+'), 'Fe³⁺');
  assert.equal(formulaTex('Fe2(SO4)3'), '\\mathrm{Fe_{2}(SO_{4})_{3}}');
  assert.equal(formulaTex('Fe3+'), '\\mathrm{Fe}^{3+}');
  assert.deepEqual(formulaTokens('H2O').map((t) => `${t.t}:${t.v}`), ['txt:H', 'sub:2', 'txt:O']);
  assert.deepEqual(formulaTokens('CuSO4·5H2O').map((t) => `${t.t}:${t.v}`), ['txt:CuSO', 'sub:4', 'txt:·5H', 'sub:2', 'txt:O']);
  assert.equal(chaveFormula('Ca(OH)2'), 'ca(oh)2');
  for (const f of ['H2O', 'Ca(OH)2', 'CuSO4·5H2O', 'Fe2(SO4)3', 'SO4^2-', 'Fe3+', 'K4[Fe(CN)6]']) validarTex(formulaTex(f), f);
});

// ------------------------------------------------------------------------------------------------ massa molar
test('massa molar: valores conhecidos (tolerância 0,01 g/mol) e coerência com o pacote', async () => {
  const c = await ctxDe();
  const mm = (f) => calcularMassaMolar(f, c);
  const casos = { H2O: 18.015, CO2: 44.009, NaCl: 58.44, C6H12O6: 180.156, 'Ca(OH)2': 74.092, 'Fe2(SO4)3': 399.858, 'CuSO4·5H2O': 249.678, H2SO4: 98.072, 'Al2(SO4)3': undefined };
  for (const [f, esperado] of Object.entries(casos)) {
    if (f === 'Al2(SO4)3') { assert.equal(mm(f).ok, false, 'Al não está no pacote de teste'); continue; }
    const r = mm(f);
    assert.ok(r.ok, f);
    assert.ok(Math.abs(r.massaMolar - esperado) < 0.01, `${f}: ${r.massaMolar} vs ${esperado}`);
    validarPassos(r, f);
    assert.ok(r.fontes.length >= 1);
  }
  // soma exata a partir do pacote
  const h = c.massaDe('H'); const o = c.massaDe('O');
  perto(mm('H2O').massaMolar, 2 * h + o, 1e-9);
  const pct = mm('H2O').composicao.reduce((a, x) => a + x.percentual, 0);
  perto(pct, 100, 1e-9);
  assert.equal(mm('H2O').resultados[0].valor, '18,015');
  assert.match(mm('Xx').erro, /não é símbolo/);
  assert.match(mm('Pu').erro, /não tem a massa atômica de/);
  assert.ok(mm('Fe3+').notas.length > 0, 'nota sobre elétrons');
});

// ------------------------------------------------------------------------------------------------ balanceamento
const CLASSICAS = [
  ['H2 + O2 -> H2O', [2, 1, 2]],
  ['Fe + O2 -> Fe2O3', [4, 3, 2]],
  ['C8H18 + O2 -> CO2 + H2O', [2, 25, 16, 18]],
  ['C3H8 + O2 -> CO2 + H2O', [1, 5, 3, 4]],
  ['Al + HCl -> AlCl3 + H2', [2, 6, 2, 3]],
  ['KMnO4 + HCl -> KCl + MnCl2 + H2O + Cl2', [2, 16, 2, 2, 8, 5]],
  ['Ca(OH)2 + H3PO4 -> Ca3(PO4)2 + H2O', [3, 2, 1, 6]],
  ['Na + H2O -> NaOH + H2', [2, 2, 2, 1]],
  ['C6H12O6 + O2 -> CO2 + H2O', [1, 6, 6, 6]],
  ['NH3 + O2 -> NO + H2O', [4, 5, 4, 6]],
  ['Cu + HNO3 -> Cu(NO3)2 + NO + H2O', [3, 8, 3, 2, 4]],
  ['Zn + Cu2+ -> Zn2+ + Cu', [1, 1, 1, 1]],
  ['Fe + Cu2+ -> Fe3+ + Cu', [2, 3, 2, 3]],
  ['MnO4- + Fe2+ + H+ -> Mn2+ + Fe3+ + H2O', [1, 5, 8, 1, 5, 4]],
  ['Cr2O72- + Fe2+ + H+ -> Cr3+ + Fe3+ + H2O', [1, 6, 14, 2, 6, 7]],
  ['Ag+ + Cl- -> AgCl', [1, 1, 1]],
  ['Fe3+ + e- -> Fe2+', [1, 1, 1]],
  ['MnO4- + 5 e- + 8 H+ -> Mn2+ + 4 H2O', [1, 5, 8, 1, 4]]
];
test('balanceamento: equações clássicas (inclusive combustão do octano e redox com íons)', () => {
  assert.ok(CLASSICAS.length >= 10);
  for (const [eq, coefs] of CLASSICAS) {
    const r = balancear(eq);
    assert.ok(r.ok, `${eq}: ${r.erro}`);
    assert.deepEqual(r.coeficientes, coefs, eq);
    assert.ok(r.verificacao.every((v) => v.ok && v.esquerda === v.direita), eq);
    validarPassos(r, eq);
    validarTex(r.equacaoTex, eq);
  }
  assert.equal(balancear('C8H18 + O2 -> CO2 + H2O').equacao, '2 C₈H₁₈ + 25 O₂ → 16 CO₂ + 18 H₂O');
});

test('balanceamento: grafias da seta, estados físicos, coeficientes digitados e separação de substâncias', () => {
  for (const seta of ['->', '→', '=', '=>', '⟶', '-->']) assert.deepEqual(balancear(`H2 + O2 ${seta} H2O`).coeficientes, [2, 1, 2], seta);
  assert.deepEqual(balancear('H2(g)+O2(g)->H2O(l)').coeficientes, [2, 1, 2]);
  assert.deepEqual(balancear('2 H2 + 3 O2 -> 7 H2O').coeficientes, [2, 1, 2], 'coeficientes digitados são ignorados');
  assert.equal(balancear('2H2 + O2 -> 2H2O').digitouCoeficientes, true);
  assert.deepEqual(dividirEspecies('Fe3+ + 2 e-'), ['Fe3+', '2 e-']);
  assert.deepEqual(dividirEspecies('Ag+ + Cl-'), ['Ag+', 'Cl-']);
  assert.deepEqual(dividirEspecies('H2+O2'), ['H2', 'O2']);
  assert.deepEqual(dividirEspecies('Fe+3 + Cl-'), ['Fe+3', 'Cl-']);
  assert.deepEqual(dividirEspecies('Zn + Cu2+'), ['Zn', 'Cu2+']);
});

test('balanceamento: erros explicados (sem seta, elemento só de um lado, impossível, reações independentes, fórmula inválida)', () => {
  assert.match(balancear('H2 + O2').erro, /seta/);
  assert.match(balancear('').erro, /Digite a equação/);
  assert.match(balancear('H2 + O2 -> H2O + N2').erro, /só nos produtos/);
  assert.match(balancear('H2 + O2 -> H2O -> H2O2').erro, /mais de uma seta/);
  assert.match(balancear('Fe + Xx -> FeXx').erro, /não é símbolo/);
  assert.match(balancear('H2O -> H2O2').erro, /Não existe combinação|só/);
  assert.match(balancear('H2 + O2 -> H2O + H2O2').erro, /mais de uma reação independente/);
  assert.match(balancear('H2 + O2 -> HCl').erro, /só/);
});

test('balanceamento: sempre dá o mesmo resultado independentemente da ordem das substâncias', () => {
  const a = balancear('C3H8 + O2 -> CO2 + H2O');
  const b = balancear('O2 + C3H8 -> H2O + CO2');
  assert.equal(a.coeficientes.join(), '1,5,3,4');
  assert.equal(b.coeficientes.join(), '5,1,4,3');
});

test('frações exatas (BigInt)', () => {
  const x = new Frac(1, 3).add(new Frac(1, 6));
  assert.equal(x.toString(), '1/2');
  assert.equal(new Frac(6, -4).toString(), '-3/2');
  assert.equal(new Frac(2).div(new Frac(4)).mul(new Frac(2)).toString(), '1');
});

// ------------------------------------------------------------------------------------------------ estequiometria
test('estequiometria: conversão massa ↔ mol ↔ partículas ↔ volume (CNTP)', async () => {
  const c = await ctxDe();
  const NA = c.avogadro().valor;
  const r = converterQuantidade({ formula: 'H2O', valor: 36.03, unidade: 'g' }, c);
  assert.ok(r.ok);
  perto(r.mol, 36.03 / r.massaMolar);
  perto(r.particulas, r.mol * NA, 1e-9);
  validarPassos(r, 'H2O');
  // 1 mol de gás ideal nas CNTP (0 °C, 1 atm) = RT/P
  const g = converterQuantidade({ formula: 'CO2', valor: 1, unidade: 'mol' }, c);
  const vm = c.volumeMolarCNTP();
  perto(g.volumeL, vm.valor * 1000, 1e-12);
  assert.ok(Math.abs(g.volumeL - 22.414) < 0.001, `volume molar CNTP ${g.volumeL}`);
  // volta: litros → mol → mesma massa
  const volta = converterQuantidade({ formula: 'CO2', valor: g.volumeL, unidade: 'L' }, c);
  perto(volta.mol, 1, 1e-12);
  const part = converterQuantidade({ formula: 'O2', valor: NA, unidade: 'partículas' }, c);
  perto(part.mol, 1, 1e-12);
  perto(converterQuantidade({ formula: 'NaCl', valor: 500, unidade: 'mg' }, c).massa, 0.5, 1e-12);
  assert.match(converterQuantidade({ formula: 'NaCl', valor: 5, unidade: 'furlong' }, c).erro, /Unidade não reconhecida/);
  assert.equal(converterQuantidade({ formula: 'NaCl', valor: -1, unidade: 'g' }, c).ok, false);
});

test('estequiometria: reagente limitante, excesso e massa dos produtos', async () => {
  const c = await ctxDe();
  const r = calcularEstequiometria({ equacao: 'H2 + O2 -> H2O', dados: [{ especie: 'H2', valor: 4, unidade: 'g' }, { especie: 'O2', valor: 16, unidade: 'g' }] }, c);
  assert.ok(r.ok, r.erro);
  const M = (f) => c.massaDe('H') * 2 * (f === 'H2') + (f === 'O2') * 2 * c.massaDe('O');
  // 2 H2 + O2 -> 2 H2O: n(H2) = 4/2,016 ≈ 1,984 mol; n(O2) = 16/31,998 = 0,5 mol → limitante O2
  assert.equal(r.limitante, 'O2');
  const agua = r.tabela.find((t) => t.formula === 'H2O');
  perto(agua.formadoMol, 2 * (16 / M('O2')), 1e-12);
  perto(agua.formadoG, agua.formadoMol * (2 * c.massaDe('H') + c.massaDe('O')), 1e-12);
  const h2 = r.tabela.find((t) => t.formula === 'H2');
  perto(h2.sobraMol, 4 / M('H2') - 2 * (16 / M('O2')), 1e-12);
  // conservação de massa: reagentes consumidos = produtos formados
  const consumido = r.tabela.filter((t) => t.lado === 'reagente').reduce((a, t) => a + t.consumidoG, 0);
  const formado = r.tabela.filter((t) => t.lado === 'produto').reduce((a, t) => a + t.formadoG, 0);
  perto(consumido, formado, 1e-12);
  validarPassos(r, 'H2+O2');
  assert.ok(r.resultados.some((x) => x.destaque && /limitante/.test(x.rotulo)));
});

test('estequiometria: partir de um produto (quanto reagente é necessário)', async () => {
  const c = await ctxDe();
  const r = calcularEstequiometria({ equacao: 'CaCO3 -> CaO + CO2', dados: [{ especie: 'CO2', valor: 1, unidade: 'mol' }] }, c);
  assert.ok(r.ok, r.erro);
  const calcario = r.tabela.find((t) => t.formula === 'CaCO3');
  assert.equal(calcario.informado, false);
  perto(calcario.necessarioMol, 1, 1e-12);
  perto(calcario.necessarioG, c.massaDe('Ca') + c.massaDe('C') + 3 * c.massaDe('O'), 1e-12);
  assert.ok(r.resultados.some((x) => /necessário/.test(x.rotulo)));
  validarPassos(r, 'CaCO3');
});

test('estequiometria (combustão do etanol): massa de CO2 a partir de massa de etanol, com rendimento', async () => {
  const c = await ctxDe();
  const eq = 'C2H6O + O2 -> CO2 + H2O';
  const r = calcularEstequiometria({ equacao: eq, dados: [{ especie: 'C2H6O', valor: 46.069, unidade: 'g' }], rendimento: 50 }, c);
  assert.ok(r.ok, r.erro);
  const co2 = r.tabela.find((t) => t.formula === 'CO2');
  const etanol = r.tabela.find((t) => t.formula === 'C2H6O');
  perto(etanol.consumidoMol, 46.069 / etanol.massaMolar, 1e-9);
  perto(co2.teoricoMol, 2 * etanol.consumidoMol, 1e-9); // 1 C2H6O → 2 CO2
  perto(co2.formadoMol, 0.5 * co2.teoricoMol, 1e-12);
  assert.equal(calcularEstequiometria({ equacao: eq, dados: [{ especie: 'N2', valor: 1, unidade: 'g' }] }, c).ok, false);
  assert.match(calcularEstequiometria({ equacao: eq, dados: [] }, c).erro, /pelo menos uma/);
  assert.match(calcularEstequiometria({ equacao: eq, dados: [{ especie: 'CO2', valor: 1, unidade: 'g' }, { especie: 'O2', valor: 1, unidade: 'g' }] }, c).erro, /só reagentes/);
  assert.match(calcularEstequiometria({ equacao: eq, dados: [{ especie: 'O2', valor: 1, unidade: 'g' }], rendimento: 120 }, c).erro, /rendimento/);
});

// ------------------------------------------------------------------------------------------------ concentração
test('concentração: molaridade, massa necessária, g/L ↔ mol/L, percentuais e diluição', async () => {
  const c = await ctxDe();
  const M = c.massaDe('Na') + c.massaDe('Cl');
  const mol = calcularConcentracao({ modo: 'molaridade', formula: 'NaCl', massa: { valor: 5.844, unidade: 'g' }, volume: { valor: 500, unidade: 'mL' } }, c);
  assert.ok(mol.ok, mol.erro);
  perto(mol.valor, (5.844 / M) / 0.5, 1e-12);
  assert.ok(Math.abs(mol.valor - 0.2) < 0.001);
  validarPassos(mol, 'molaridade');
  const m = calcularConcentracao({ modo: 'massa', formula: 'NaCl', concentracao: { valor: 0.1, unidade: 'mol/L' }, volume: { valor: 250, unidade: 'mL' } }, c);
  perto(m.valor, 0.1 * 0.25 * M, 1e-12);
  const m2 = calcularConcentracao({ modo: 'massa', formula: 'NaCl', concentracao: { valor: 9, unidade: 'g/L' }, volume: { valor: 1, unidade: 'L' } }, c);
  perto(m2.valor, 9, 1e-12);
  const gl = calcularConcentracao({ modo: 'gl-mol', formula: 'NaCl', valor: 58.44, de: 'g/L' }, c);
  perto(gl.valor, 58.44 / M, 1e-12);
  const lg = calcularConcentracao({ modo: 'gl-mol', formula: 'NaCl', valor: 1, de: 'mol/L' }, c);
  perto(lg.valor, M, 1e-12);
  perto(calcularConcentracao({ modo: 'percentual-mm', soluto: { valor: 10, unidade: 'g' }, solucao: { valor: 200, unidade: 'g' } }, c).valor, 5, 1e-12);
  perto(calcularConcentracao({ modo: 'percentual-mv', soluto: { valor: 0.9, unidade: 'g' }, volume: { valor: 100, unidade: 'mL' } }, c).valor, 0.9, 1e-12);
  const dil = calcularConcentracao({ modo: 'diluicao', C1: 2, V1: 100, C2: 0.5, V2: null, unidadeC: 'mol/L', unidadeV: 'mL' }, c);
  perto(dil.valor, 400, 1e-12);
  assert.ok(dil.resultados.some((x) => /acrescentar/.test(x.rotulo) && x.valor === '300'));
  perto(calcularConcentracao({ modo: 'diluicao', C1: null, V1: 100, C2: 0.5, V2: 400 }, c).valor, 2, 1e-12);
  perto(calcularConcentracao({ modo: 'diluicao', C1: 2, V1: null, C2: 0.5, V2: 400 }, c).valor, 100, 1e-12);
  perto(calcularConcentracao({ modo: 'diluicao', C1: 2, V1: 100, C2: null, V2: 400 }, c).valor, 0.5, 1e-12);
  validarPassos(dil, 'diluição');
  assert.match(calcularConcentracao({ modo: 'diluicao', C1: 2, V1: 100, C2: 1, V2: 1 }, c).erro, /exatamente um/);
  assert.match(calcularConcentracao({ modo: 'percentual-mm', soluto: { valor: 20, unidade: 'g' }, solucao: { valor: 10, unidade: 'g' } }, c).erro, /maior/);
  assert.match(calcularConcentracao({ modo: 'molaridade', formula: 'NaCl', massa: { valor: 1, unidade: 'g' }, volume: { valor: 0, unidade: 'L' } }, c).erro, /maior que zero/);
});

// ------------------------------------------------------------------------------------------------ pH
test('pH: ácidos e bases fortes, fracos (Ka/Kb) e conversões', async () => {
  const c = await ctxDe();
  const f1 = calcularPH({ tipo: 'acido-forte', C: 0.01 }, c);
  perto(f1.pH, 2, 1e-12);
  assert.equal(f1.resultados[0].valor, '2,00');
  assert.equal(f1.classificacao, 'ácida');
  perto(calcularPH({ tipo: 'acido-forte', C: 0.01, n: 2 }, c).pH, -Math.log10(0.02), 1e-12);
  const b1 = calcularPH({ tipo: 'base-forte', C: 0.001 }, c);
  perto(b1.pH, 11, 1e-12);
  perto(b1.pOH, 3, 1e-12);
  assert.equal(b1.classificacao, 'básica');
  // ácido acético 0,1 mol/L com Ka dado: x² / (C − x) = Ka
  const Ka = 1.8e-5;
  const fraco = calcularPH({ tipo: 'acido-fraco', C: 0.1, Ka }, c);
  const x = 10 ** -fraco.pH;
  perto(x * x / (0.1 - x), Ka, 1e-9);
  assert.ok(Math.abs(fraco.pH - 2.88) < 0.01);
  const viaPka = calcularPH({ tipo: 'acido-fraco', C: 0.1, pKa: -Math.log10(Ka) }, c);
  perto(viaPka.pH, fraco.pH, 1e-9);
  const base = calcularPH({ tipo: 'base-fraca', C: 0.1, Kb: 1.8e-5 }, c);
  perto(base.pH, 14 - fraco.pH, 1e-9);
  assert.equal(base.classificacao, 'básica');
  // água pura muito diluída: ácido forte 1e-8 mol/L dá pH levemente abaixo de 7 (inclui a água)
  const dil = calcularPH({ tipo: 'acido-forte', C: 1e-8 }, c);
  assert.ok(dil.pH < 7 && dil.pH > 6.9);
  assert.ok(dil.notas.some((n) => /diluída/.test(n)));
  // conversões
  perto(calcularPH({ tipo: 'converter', pH: 3 }, c).H, 1e-3, 1e-12);
  perto(calcularPH({ tipo: 'converter', OH: 1e-4 }, c).pH, 10, 1e-12);
  perto(calcularPH({ tipo: 'converter', H: 1e-7 }, c).pH, 7, 1e-12);
  assert.equal(calcularPH({ tipo: 'converter', H: 1e-7 }, c).classificacao, 'neutra');
  assert.match(calcularPH({ tipo: 'converter' }, c).erro, /exatamente um/);
  assert.match(calcularPH({ tipo: 'acido-forte', C: 0 }, c).erro, /maior que zero/);
  assert.match(calcularPH({ tipo: 'acido-fraco', C: 0.1 }, c).erro, /Ka/);
  for (const r of [f1, b1, fraco, base, dil]) { validarPassos(r, 'pH'); assert.ok(r.notas.some((n) => /pKw/.test(n))); }
});

// ------------------------------------------------------------------------------------------------ gás ideal
test('gás ideal: PV = nRT com R do pacote, nos quatro sentidos e com conversões', async () => {
  const c = await ctxDe();
  const R = c.constante('R').valor;
  perto(R, 8.314462618, 1e-9);
  const v = calcularGas({ resolver: 'V', P: { valor: 1, unidade: 'atm' }, n: { valor: 1, unidade: 'mol' }, T: { valor: 0, unidade: '°C' }, saida: 'L' }, c);
  assert.ok(v.ok, v.erro);
  perto(v.valor, 1000 * R * 273.15 / 101325, 1e-12);
  assert.ok(Math.abs(v.valor - 22.414) < 0.001);
  const p = calcularGas({ resolver: 'P', V: { valor: 22.414, unidade: 'L' }, n: { valor: 1, unidade: 'mol' }, T: { valor: 273.15, unidade: 'K' }, saida: 'atm' }, c);
  assert.ok(Math.abs(p.valor - 1) < 1e-4);
  const n = calcularGas({ resolver: 'n', P: { valor: 2, unidade: 'atm' }, V: { valor: 10, unidade: 'L' }, T: { valor: 300, unidade: 'K' } }, c);
  perto(n.valor, (2 * 101325 * 0.010) / (R * 300), 1e-12);
  const t = calcularGas({ resolver: 'T', P: { valor: 101.325, unidade: 'kPa' }, V: { valor: 24.4651, unidade: 'L' }, n: { valor: 1, unidade: 'mol' }, saida: '°C' }, c);
  assert.ok(Math.abs(t.valor - 25) < 0.05, `T = ${t.valor}`);
  // massa + fórmula no lugar de n
  const vm = calcularGas({ resolver: 'V', P: { valor: 1, unidade: 'atm' }, T: { valor: 273.15, unidade: 'K' }, massa: { valor: 4.4009, unidade: 'g' }, formula: 'CO2', saida: 'L' }, c);
  assert.ok(Math.abs(vm.valor - 2.2414) < 0.001, `V(CO2) = ${vm.valor}`);
  validarPassos(v, 'gás');
  assert.match(calcularGas({ resolver: 'V', P: { valor: 1, unidade: 'atm' }, T: { valor: -300, unidade: '°C' }, n: { valor: 1, unidade: 'mol' } }, c).erro, /0 K/);
  assert.match(calcularGas({ resolver: 'V', P: { valor: 1, unidade: 'furlong' }, T: { valor: 300, unidade: 'K' }, n: { valor: 1, unidade: 'mol' } }, c).erro, /desconhecida/);
  assert.match(calcularGas({ resolver: 'V', P: { valor: 1, unidade: 'atm' }, T: { valor: 300, unidade: 'K' } }, c).erro, /quantidade de matéria/);
});

// ------------------------------------------------------------------------------------------------ unidades
test('unidades: tabela do pacote (regras.json) e tabela padrão dão os mesmos resultados nos casos comuns', async () => {
  const store = await loja();
  const doPacote = tabelaDeUnidades(store.regras);
  const padrao = tabelaDeUnidades(null);
  assert.equal(doPacote.doPacote, true);
  assert.equal(padrao.doPacote, false);
  for (const t of [doPacote, padrao]) {
    perto(converter(1, 'atm', 'kPa', t).resultado, 101.325, 1e-12);
    perto(converter(2.5, 'L', 'mL', t).resultado, 2500, 1e-12);
    perto(converter(500, 'mg', 'g', t).resultado, 0.5, 1e-12);
    perto(converter(100, '°C', 'K', t).resultado, 373.15, 1e-12);
    perto(converter(0, '°C', '°F', t).resultado, 32, 1e-9);
    perto(converter(212, '°F', '°C', t).resultado, 100, 1e-9);
    perto(converter(760, 'mmHg', 'atm', t).resultado, 1, t.doPacote ? 1e-6 : 1e-12); // o pacote usa 133,322387415 Pa por mmHg
    perto(converter(1, 'cal', 'J', t).resultado, 4.184, 1e-12);
    perto(converter(1, 'kcal', 'kJ', t).resultado, 4.184, 1e-12);
    perto(converter(1, 'nm', 'Å', t).resultado, 10, 1e-12);
    perto(converter(0.5, 'mol/L', 'mmol/L', t).resultado, 500, 1e-12);
    perto(converter(3, 'kg', 'g', t).resultado, 3000, 1e-12);
    perto(converter(1, 'bar', 'atm', t).resultado, 1e5 / 101325, 1e-12);
    validarPassos(converter(100, '°C', 'K', t), '°C→K');
    validarPassos(converter(2.5, 'L', 'mL', t), 'L→mL');
  }
  assert.match(converter(1, 'g', 'L', doPacote).erro, /grandezas diferentes/);
  assert.match(converter(1, 'xyz', 'L', doPacote).erro, /Não conheço/);
  assert.ok(Object.keys(UNIDADES_PADRAO).includes('temperatura'));
});

test('números: formatação pt-BR e leitura tolerante', () => {
  assert.equal(fmt(18.015000000000001), '18,015');
  assert.equal(fmt(1234.5678, { sig: 6 }), '1.234,57');
  assert.equal(fmt(0.00001234), '1,234 × 10⁻⁵');
  assert.equal(fmt(6.02214076e23, { sig: 9 }), '6,02214076 × 10²³');
  assert.equal(fmt(2, { casas: 2 }), '2,00');
  assert.equal(lerNumero('1,5'), 1.5);
  assert.equal(lerNumero('1.5'), 1.5);
  assert.equal(lerNumero('1.234,56'), 1234.56);
  assert.equal(lerNumero('1,8e-5'), 1.8e-5);
  assert.equal(lerNumero('1,8 x 10^-5'), 1.8e-5);
  assert.equal(lerNumero('10^-3'), 1e-3);
  assert.ok(Number.isNaN(lerNumero('abc')));
  assert.ok(Number.isNaN(lerNumero('')));
});
