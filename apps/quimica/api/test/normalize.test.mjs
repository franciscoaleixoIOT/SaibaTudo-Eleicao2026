// Normalização e ANCORAGEM das entidades da saída do modelo (api/_lib/normalize.js + ground.js). Sem rede.
// Cada entidade só passa se houver evidência no texto da pergunta; sem a entidade que sustenta a intenção, vira DESCONHECIDA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelOutput, parseModelJson } from '../_lib/normalize.js';
import { groundElemento, groundQuantidade, groundEquacao, normEquacao, quantidadesDoTexto, valoresDoToken } from '../_lib/ground.js';

const D = { intent: 'DESCONHECIDA' };

// [descrição, pergunta, saída do modelo, nlu esperado]
const CASOS = [
  // --- propriedade de elemento
  ['propriedade do elemento por nome', 'qual a massa atômica do ferro?', { intent: 'PROPRIEDADE', elemento: 'Fe', propriedade: 'massaAtomica' }, { intent: 'PROPRIEDADE', elemento: 'Fe', propriedade: 'massaAtomica' }],
  ['elemento alucinado derruba a intenção', 'qual a massa atômica do ferro?', { intent: 'PROPRIEDADE', elemento: 'Cu', propriedade: 'massaAtomica' }, D],
  ['símbolo em caixa errada do modelo é corrigido', 'ponto de fusão do ferro', { intent: 'PROPRIEDADE', elemento: 'FE', propriedade: 'pontoFusaoK' }, { intent: 'PROPRIEDADE', elemento: 'Fe', propriedade: 'pontoFusao' }],
  ['símbolo escrito na pergunta', 'massa atômica do Na', { intent: 'PROPRIEDADE', elemento: 'Na', propriedade: 'massaAtomica' }, { intent: 'PROPRIEDADE', elemento: 'Na', propriedade: 'massaAtomica' }],
  ['"Na" no início da frase é preposição, não sódio', 'Na água o sal se dissolve?', { intent: 'ELEMENTO', elemento: 'Na' }, D],
  ['nome do elemento dentro do nome do composto não conta', 'cloreto de sódio', { intent: 'ELEMENTO', elemento: 'Na' }, D],
  ['ouro e solubilidade', 'o ouro é solúvel em água?', { intent: 'PROPRIEDADE', elemento: 'Au', propriedade: 'solubilidade' }, { intent: 'PROPRIEDADE', elemento: 'Au', propriedade: 'solubilidade' }],
  ['perfil do elemento por nome', 'me fale do sódio', { intent: 'ELEMENTO', elemento: 'Na' }, { intent: 'ELEMENTO', elemento: 'Na' }],
  ['perfil do elemento por símbolo isolado', 'elemento O', { intent: 'ELEMENTO', elemento: 'O' }, { intent: 'ELEMENTO', elemento: 'O' }],
  ['propriedade sem evidência é descartada, o perfil fica', 'o que é o ferro?', { intent: 'ELEMENTO', elemento: 'Fe', propriedade: 'densidadeKgm3' }, { intent: 'ELEMENTO', elemento: 'Fe' }],
  ['propriedade fora do vocabulário é descartada', 'qual o peso do ferro?', { intent: 'ELEMENTO', elemento: 'Fe', propriedade: 'pesoBruto' }, { intent: 'ELEMENTO', elemento: 'Fe' }],
  ['erro de digitação no nome do elemento', 'massa atomica do magnesio', { intent: 'PROPRIEDADE', elemento: 'Mg', propriedade: 'massaAtomica' }, { intent: 'PROPRIEDADE', elemento: 'Mg', propriedade: 'massaAtomica' }],
  ['comparação entre elementos', 'compare a eletronegatividade do sódio e do potássio', { intent: 'COMPARAR', elemento: 'Na', propriedade: 'eletronegatividade' }, { intent: 'COMPARAR', elemento: 'Na', propriedade: 'eletronegatividade' }],
  ['tendência na tabela periódica', 'como varia o raio atômico na tabela periódica?', { intent: 'TABELA_PERIODICA', propriedade: 'raioAtomicoPm' }, { intent: 'TABELA_PERIODICA', propriedade: 'raioAtomico' }],

  // --- compostos
  ['massa molar por fórmula', 'massa molar do H2SO4', { intent: 'MASSA_MOLAR', composto: 'H2SO4' }, { intent: 'MASSA_MOLAR', composto: 'H2SO4' }],
  ['fórmula digitada em minúsculas', 'massa molar do h2so4', { intent: 'MASSA_MOLAR', composto: 'H2SO4' }, { intent: 'MASSA_MOLAR', composto: 'H2SO4' }],
  ['massa molar por nome', 'massa molar do ácido sulfúrico', { intent: 'MASSA_MOLAR', composto: 'Ácido sulfúrico' }, { intent: 'MASSA_MOLAR', composto: 'Ácido sulfúrico' }],
  ['composto alucinado derruba a intenção', 'massa molar do ácido sulfúrico', { intent: 'MASSA_MOLAR', composto: 'HCl' }, D],
  ['nome equivalente à fórmula da pergunta (água)', 'massa molar de H2O', { intent: 'MASSA_MOLAR', composto: 'água' }, { intent: 'MASSA_MOLAR', composto: 'água' }],
  ['fórmula equivalente ao nome da pergunta', 'massa molar da água', { intent: 'MASSA_MOLAR', composto: 'H2O' }, { intent: 'MASSA_MOLAR', composto: 'H2O' }],
  ['nome popular', 'qual a estrutura da cafeína', { intent: 'DESENHAR', composto: 'cafeína' }, { intent: 'DESENHAR', composto: 'cafeína' }],
  ['fórmula da pergunta e nome do modelo (grupo conhecido)', 'desenhe a molécula de C8H10N4O2', { intent: 'DESENHAR', composto: 'cafeína' }, { intent: 'DESENHAR', composto: 'cafeína' }],
  ['erro de digitação em palavra longa do nome', 'perigos do acido sufurico', { intent: 'SEGURANCA', composto: 'Ácido sulfúrico' }, { intent: 'SEGURANCA', composto: 'Ácido sulfúrico' }],
  ['composto de outro nome não casa', 'perigos do ácido sulfúrico', { intent: 'SEGURANCA', composto: 'Ácido nítrico' }, { intent: 'SEGURANCA' }],
  ['segurança por nome do composto (grupo conhecido)', 'perigos do ácido clorídrico', { intent: 'SEGURANCA', composto: 'HCl' }, { intent: 'SEGURANCA', composto: 'HCl' }],
  ['nomenclatura de óxido', 'qual o nome do Fe2O3?', { intent: 'NOMENCLATURA', composto: 'Fe2O3' }, { intent: 'NOMENCLATURA', composto: 'Fe2O3' }],
  ['nome do composto por extenso', 'cloreto de sódio', { intent: 'COMPOSTO', composto: 'cloreto de sódio' }, { intent: 'COMPOSTO', composto: 'cloreto de sódio' }],
  ['CID só vale com "CID" na pergunta', 'mostre o composto CID 2244', { intent: 'COMPOSTO', composto: '2244' }, { intent: 'COMPOSTO', composto: '2244' }],
  ['número solto não é CID', 'mostre o composto 2244', { intent: 'COMPOSTO', composto: '2244' }, D],
  ['composto exige evidência mesmo sendo fórmula válida', 'o que é a ferrugem?', { intent: 'COMPOSTO', composto: 'NaCl' }, D],
  ['estrutura de composto sem composto vira desconhecida', 'desenhe uma molécula bonita', { intent: 'DESENHAR' }, D],

  // --- equações
  ['equação literal', 'balanceie H2 + O2 -> H2O', { intent: 'BALANCEAR', equacao: 'H2 + O2 -> H2O' }, { intent: 'BALANCEAR', equacao: 'H2 + O2 -> H2O' }],
  ['seta diferente na pergunta', 'balanceie H2 + O2 = H2O', { intent: 'BALANCEAR', equacao: 'H2 + O2 -> H2O' }, { intent: 'BALANCEAR', equacao: 'H2 + O2 -> H2O' }],
  ['subscritos e seta unicode', 'balanceie H₂ + O₂ → H₂O', { intent: 'BALANCEAR', equacao: 'H2 + O2 -> H2O' }, { intent: 'BALANCEAR', equacao: 'H2 + O2 -> H2O' }],
  ['coeficientes dados na pergunta e omitidos pelo modelo', 'balanceie 2 H2 + O2 -> 2 H2O', { intent: 'BALANCEAR', equacao: 'H2 + O2 -> H2O' }, { intent: 'BALANCEAR', equacao: 'H2 + O2 -> H2O' }],
  ['equação inventada a partir de "combustão do metano" é removida; a calculadora continua', 'balanceie a combustão do metano', { intent: 'BALANCEAR', equacao: 'CH4 + O2 -> CO2 + H2O' }, { intent: 'BALANCEAR' }],
  ['equação com reagente trocado', 'balanceie N2 + H2 -> NH3', { intent: 'BALANCEAR', equacao: 'N2 + O2 -> NH3' }, { intent: 'BALANCEAR' }],
  ['balancear sem equação na pergunta', 'balanceamento de equações', { intent: 'BALANCEAR' }, { intent: 'BALANCEAR' }],

  // --- quantidades e unidades
  ['mols de água', 'quantos mols tem em 18 g de água?', { intent: 'ESTEQUIOMETRIA', composto: 'H2O', quantidades: [{ valor: 18, unidade: 'g' }] }, { intent: 'ESTEQUIOMETRIA', composto: 'H2O', quantidades: [{ valor: 18, unidade: 'g' }] }],
  ['unidade trocada derruba a quantidade; a estequiometria continua', 'quantos mols tem em 18 g de água?', { intent: 'ESTEQUIOMETRIA', quantidades: [{ valor: 18, unidade: 'kg' }] }, { intent: 'ESTEQUIOMETRIA' }],
  ['duas quantidades ancoradas', 'molaridade de 5 g de NaCl em 250 mL', { intent: 'CONCENTRACAO', composto: 'NaCl', quantidades: [{ valor: 5, unidade: 'g' }, { valor: 250, unidade: 'mL' }] }, { intent: 'CONCENTRACAO', composto: 'NaCl', quantidades: [{ valor: 5, unidade: 'g' }, { valor: 250, unidade: 'mL' }] }],
  ['quantidade inventada é removida, as demais ficam', 'molaridade de 5 g de NaCl em 250 mL', { intent: 'CONCENTRACAO', composto: 'NaCl', quantidades: [{ valor: 5, unidade: 'g' }, { valor: 100, unidade: 'mL' }] }, { intent: 'CONCENTRACAO', composto: 'NaCl', quantidades: [{ valor: 5, unidade: 'g' }] }],
  ['"M" maiúsculo é mol/L', 'pH de HCl 0,01 M', { intent: 'PH', composto: 'HCl', quantidades: [{ valor: 0.01, unidade: 'mol/L' }] }, { intent: 'PH', composto: 'HCl', quantidades: [{ valor: 0.01, unidade: 'mol/L' }] }],
  ['ponto decimal e "mol/L"', 'ph de 0.01 mol/L de HCl', { intent: 'PH', composto: 'HCl', quantidades: [{ valor: 0.01, unidade: 'mol/L' }] }, { intent: 'PH', composto: 'HCl', quantidades: [{ valor: 0.01, unidade: 'mol/L' }] }],
  ['notação científica com "e"', 'pH da solução 1e-3 mol/L', { intent: 'PH', quantidades: [{ valor: 0.001, unidade: 'mol/L' }] }, { intent: 'PH', quantidades: [{ valor: 0.001, unidade: 'mol/L' }] }],
  ['notação científica com x 10^', 'quantos gramas em 2,5 x 10^-3 mol de NaCl', { intent: 'ESTEQUIOMETRIA', composto: 'NaCl', quantidades: [{ valor: 0.0025, unidade: 'mol' }] }, { intent: 'ESTEQUIOMETRIA', composto: 'NaCl', quantidades: [{ valor: 0.0025, unidade: 'mol' }] }],
  ['separador de milhar', 'dilua para 1.000 mL', { intent: 'CONCENTRACAO', quantidades: [{ valor: 1000, unidade: 'mL' }] }, { intent: 'CONCENTRACAO', quantidades: [{ valor: 1000, unidade: 'mL' }] }],
  ['valor numérico em texto do modelo', 'quantos mols em 2,5 g de NaCl', { intent: 'ESTEQUIOMETRIA', composto: 'NaCl', quantidades: [{ valor: '2,5', unidade: 'g' }] }, { intent: 'ESTEQUIOMETRIA', composto: 'NaCl', quantidades: [{ valor: 2.5, unidade: 'g' }] }],
  ['unidade fora do vocabulário', 'quantos furlongs em 3 metros', { intent: 'CONVERSAO_UNIDADE', quantidades: [{ valor: 3, unidade: 'furlong' }] }, { intent: 'CONVERSAO_UNIDADE' }],
  ['conversão de temperatura', 'converter 25 °C para K', { intent: 'CONVERSAO_UNIDADE', quantidades: [{ valor: 25, unidade: '°C' }], unidadeDestino: 'K' }, { intent: 'CONVERSAO_UNIDADE', quantidades: [{ valor: 25, unidade: '°C' }], unidadeDestino: 'K' }],
  ['unidades por extenso', 'converter 25 graus celsius em kelvin', { intent: 'CONVERSAO_UNIDADE', quantidades: [{ valor: 25, unidade: '°C' }], unidadeDestino: 'K' }, { intent: 'CONVERSAO_UNIDADE', quantidades: [{ valor: 25, unidade: '°C' }], unidadeDestino: 'K' }],
  ['pressão', 'converter 2 atm para mmHg', { intent: 'CONVERSAO_UNIDADE', quantidades: [{ valor: 2, unidade: 'atm' }], unidadeDestino: 'mmHg' }, { intent: 'CONVERSAO_UNIDADE', quantidades: [{ valor: 2, unidade: 'atm' }], unidadeDestino: 'mmHg' }],
  ['destino alucinado é removido, a conversão fica', 'converter 25 °C', { intent: 'CONVERSAO_UNIDADE', quantidades: [{ valor: 25, unidade: '°C' }], unidadeDestino: 'K' }, { intent: 'CONVERSAO_UNIDADE', quantidades: [{ valor: 25, unidade: '°C' }] }],
  ['destino não pode ser a mesma ocorrência da origem', 'converter 25 K', { intent: 'CONVERSAO_UNIDADE', quantidades: [{ valor: 25, unidade: 'K' }], unidadeDestino: 'K' }, { intent: 'CONVERSAO_UNIDADE', quantidades: [{ valor: 25, unidade: 'K' }] }],
  ['gás ideal com três quantidades', 'PV = nRT com 2 mol a 300 K e 1 atm', { intent: 'GAS_IDEAL', quantidades: [{ valor: 2, unidade: 'mol' }, { valor: 300, unidade: 'K' }, { valor: 1, unidade: 'atm' }] }, { intent: 'GAS_IDEAL', quantidades: [{ valor: 2, unidade: 'mol' }, { valor: 300, unidade: 'K' }, { valor: 1, unidade: 'atm' }] }],
  ['gás ideal: quantidade que não está na pergunta é removida', 'como funciona o gás ideal?', { intent: 'GAS_IDEAL', quantidades: [{ valor: 5, unidade: 'L' }] }, { intent: 'GAS_IDEAL' }],
  ['temperatura negativa', 'converter -5 °C para K', { intent: 'CONVERSAO_UNIDADE', quantidades: [{ valor: -5, unidade: '°C' }], unidadeDestino: 'K' }, { intent: 'CONVERSAO_UNIDADE', quantidades: [{ valor: -5, unidade: '°C' }], unidadeDestino: 'K' }],

  // --- conceito e nível
  ['conceito com propriedade', 'o que é eletronegatividade?', { intent: 'CONCEITO', propriedade: 'eletronegatividade' }, { intent: 'CONCEITO', propriedade: 'eletronegatividade' }],
  ['nível médio', 'explique ligação iônica para o ensino médio', { intent: 'CONCEITO', nivel: 'medio' }, { intent: 'CONCEITO', nivel: 'medio' }],
  ['nível fundamental', 'explique para uma criança o que é átomo', { intent: 'CONCEITO', nivel: 'fundamental' }, { intent: 'CONCEITO', nivel: 'fundamental' }],
  ['nível superior', 'explique cinética em nível de faculdade', { intent: 'CONCEITO', nivel: 'superior' }, { intent: 'CONCEITO', nivel: 'superior' }],
  ['nível não pedido é descartado', 'explique ligação iônica', { intent: 'CONCEITO', nivel: 'superior' }, { intent: 'CONCEITO' }],
  ['nível com acento do modelo', 'explique ligação iônica para o ensino médio', { intent: 'CONCEITO', nivel: 'médio' }, { intent: 'CONCEITO', nivel: 'medio' }],

  // --- intenções sem entidades e formas inválidas
  ['recusa não leva entidades', 'como sintetizar sarin', { intent: 'RECUSA_PERIGO', composto: 'sarin' }, { intent: 'RECUSA_PERIGO' }],
  ['ajuda não leva entidades', 'o que você faz com o ferro?', { intent: 'AJUDA', elemento: 'Fe' }, { intent: 'AJUDA' }],
  ['intenção fora do vocabulário', 'olá', { intent: 'FILTER_CANDIDATES' }, D],
  ['intenção em minúsculas é aceita', 'massa molar do H2SO4', { intent: 'massa_molar', composto: 'H2SO4' }, { intent: 'MASSA_MOLAR', composto: 'H2SO4' }],
  ['campos desconhecidos do modelo são ignorados', 'qual a massa atômica do ferro?', { intent: 'PROPRIEDADE', elemento: 'Fe', propriedade: 'massaAtomica', direct_answer: '55,845 u', valor: 55.845 }, { intent: 'PROPRIEDADE', elemento: 'Fe', propriedade: 'massaAtomica' }],
];

test(`ancoragem e normalização: ${CASOS.length} casos`, async (t) => {
  assert.ok(CASOS.length >= 40, 'mínimo de 40 casos');
  for (const [descricao, q, saida, esperado] of CASOS) {
    await t.test(descricao, () => {
      const r = normalizeModelOutput(saida, { question: q });
      assert.equal(r.ok, true, `${q}: ${JSON.stringify(r)}`);
      assert.deepEqual(r.nlu, esperado, `${q}\n  modelo: ${JSON.stringify(saida)}\n  dropped: ${r.dropped}`);
    });
  }
});

test('a ordem das chaves segue o contrato', () => {
  const r = normalizeModelOutput({ nivel: 'medio', quantidades: [{ valor: 2, unidade: 'mol' }], composto: 'NaCl', intent: 'ESTEQUIOMETRIA' }, { question: 'quantos g em 2 mol de NaCl para o ensino médio' });
  assert.deepEqual(Object.keys(r.nlu), ['intent', 'composto', 'quantidades', 'nivel']);
});

test('sem pergunta, só vale o vocabulário (sem ancoragem)', () => {
  const r = normalizeModelOutput({ intent: 'PROPRIEDADE', elemento: 'Fe', propriedade: 'massaAtomica' });
  assert.deepEqual(r.nlu, { intent: 'PROPRIEDADE', elemento: 'Fe', propriedade: 'massaAtomica' });
});

test('os campos descartados são registrados só pelo nome, nunca pelo valor', () => {
  const r = normalizeModelOutput({ intent: 'ELEMENTO', elemento: 'Fe', propriedade: 'densidadeKgm3', nivel: 'superior' }, { question: 'o que é o ferro?' });
  assert.deepEqual(r.dropped.sort(), ['nivel', 'propriedade']);
});

test('saída do modelo: texto com lixo ao redor, JSON inválido e forma errada', () => {
  assert.deepEqual(parseModelJson('claro! {"intent": "AJUDA"} pronto'), { intent: 'AJUDA' });
  assert.equal(normalizeModelOutput('sem json aqui').error, 'invalid_json');
  assert.equal(normalizeModelOutput('{"intent": ').error, 'invalid_json');
  assert.equal(normalizeModelOutput('[1,2]').error, 'invalid_json');
  assert.equal(normalizeModelOutput({ cargo: 'x' }).error, 'invalid_shape');
  assert.equal(normalizeModelOutput({ intent: '' }).error, 'invalid_shape');
  assert.equal(normalizeModelOutput({ intent: 5 }).error, 'invalid_shape');
});

test('no máximo 6 quantidades', () => {
  const q = '1 g 2 g 3 g 4 g 5 g 6 g 7 g 8 g';
  const quantidades = [1, 2, 3, 4, 5, 6, 7, 8].map((valor) => ({ valor, unidade: 'g' }));
  const r = normalizeModelOutput({ intent: 'CONCENTRACAO', quantidades }, { question: q });
  assert.equal(r.nlu.quantidades.length, 6);
});

test('ground: leitura de números em português e inglês', () => {
  assert.deepEqual(valoresDoToken('1,5'), [1.5]);
  assert.deepEqual(valoresDoToken('1.5'), [1.5]);
  assert.deepEqual(valoresDoToken('1.000'), [1, 1000]);
  assert.deepEqual(valoresDoToken('1.234,56'), [1234.56]);
  assert.deepEqual(valoresDoToken('1,234.56'), [1234.56]);
  assert.deepEqual(valoresDoToken('1.000.000'), [1000000]);
});

test('ground: unidade é a de MAIOR apelido logo depois do número', () => {
  const [a] = quantidadesDoTexto('5 mol/L de HCl');
  assert.equal(a.unidade, 'mol/L');
  const [b] = quantidadesDoTexto('5 mols de HCl');
  assert.equal(b.unidade, 'mol');
  assert.equal(quantidadesDoTexto('H2O tem 3 átomos')[0].unidade, null);
  assert.equal(groundQuantidade({ valor: 5, unidade: 'mol' }, '5 mol/L de HCl'), false, 'mol não é mol/L');
});

test('ground: equações comparadas sem espaços, com setas equivalentes e sem coeficientes', () => {
  assert.equal(normEquacao('2 H₂ + O₂ ⇌ 2 H₂O'), '2H2+O2<->2H2O');
  assert.equal(groundEquacao('H2 + O2 -> H2O', 'balanceie h2 + o2 = h2o').modo, 'literal', 'tudo em minúsculas');
  assert.equal(groundEquacao('CO + O2 -> CO2', 'balanceie 2 CO + O2 -> 2 CO2').modo, 'sem_coeficientes');
  assert.equal(groundEquacao('H2 + Cl2 -> HCl', 'balanceie H2 + O2 -> H2O'), null);
});

test('ground: elementos — nome, símbolo com caixa exata e ambiguidade', () => {
  assert.equal(groundElemento('Fe', 'massa atômica do Fe'), true);
  assert.equal(groundElemento('Fe', 'o ferro enferruja?'), true);
  assert.equal(groundElemento('Fe', 'o Fe3+ é um cátion'), true);
  assert.equal(groundElemento('Fe', 'massa molar do Fe2O3'), false, 'o Fe de uma fórmula não conta como elemento citado');
  assert.equal(groundElemento('C', 'a letra C é carbono?'), true);
  assert.equal(groundElemento('Au', 'quanto vale o ouro?'), true);
  assert.equal(groundElemento('Zz', 'ferro'), false);
  assert.equal(groundElemento('S', 'o enxofre é amarelo'), true);
  assert.equal(groundElemento('Hg', 'propriedades do azougue'), true);
});
