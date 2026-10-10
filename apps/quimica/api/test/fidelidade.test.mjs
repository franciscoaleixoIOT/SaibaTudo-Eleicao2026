// Verificador de fidelidade do texto gerado: números, fórmulas, segurança e citações. Sem rede.
import test from 'node:test';
import assert from 'node:assert/strict';
import { formulasDe, formulasSemFonte, numerosDe, numerosSemFonte, verificarFidelidade, verificarFontes } from '../_lib/fidelidade.js';

const T_AGUA = { id: 'openstax-chem2e-3.1-001', texto: 'A massa molar da água (H2O) é 18,015 g/mol. Uma molécula tem 2 átomos de hidrogênio e 1 de oxigênio.' };
const T_NACL = { id: 'openstax-chem2e-3.1-002', texto: 'O cloreto de sódio (NaCl) tem massa molar de 58,44 g/mol e funde a 801 °C.' };
const T_AVOGADRO = { id: 'libretexts-mol-001', texto: 'Um mol contém 6,022 × 10²³ entidades. A constante de Avogadro vale 6,022e23 mol⁻¹.' };
const D = (extra = {}) => ({ q: 'qual a massa molar da água?', context: '', trechos: [T_AGUA, T_NACL], ...extra });

test('resposta boa: números, fórmulas e citações vindos dos trechos', () => {
  const r = verificarFidelidade('A água (H2O) tem massa molar de 18,015 g/mol e cada molécula tem 2 átomos de hidrogênio [openstax-chem2e-3.1-001].', D());
  assert.deepEqual(r, { ok: true, fontes: ['openstax-chem2e-3.1-001'] });
});

test('resposta boa sem citação devolve fontes vazias; o id solto também conta como citação', () => {
  assert.deepEqual(verificarFidelidade('A massa molar da água é 18,015 g/mol.', D()), { ok: true, fontes: [] });
  const r = verificarFidelidade('Segundo o trecho openstax-chem2e-3.1-002, o NaCl funde a 801 °C.', D());
  assert.deepEqual(r, { ok: true, fontes: ['openstax-chem2e-3.1-002'] });
});

test('(a) número inventado é rejeitado', () => {
  const r = verificarFidelidade('A massa molar da água é 18,02 g/mol.', D());
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'numero_sem_fonte');
  assert.deepEqual(r.itens, ['18,02']);
});

test('(a) número arredondado ou calculado pelo modelo também é rejeitado', () => {
  assert.equal(verificarFidelidade('Duas moléculas pesam 36,03 g/mol.', D()).motivo, 'numero_sem_fonte');
  assert.equal(verificarFidelidade('O ponto de fusão do NaCl é cerca de 800 °C.', D()).motivo, 'numero_sem_fonte');
  assert.equal(verificarFidelidade('A água foi estudada em 1781.', D()).motivo, 'numero_sem_fonte');
});

test('(a) números de 1 dígito não contam, mas decimais sim', () => {
  assert.equal(verificarFidelidade('Cada molécula tem 2 átomos de hidrogênio e 1 de oxigênio, em 3 etapas.', D()).ok, true);
  assert.equal(verificarFidelidade('O pH vale 7,4.', D()).motivo, 'numero_sem_fonte');
});

test('(a) números da pergunta e do contexto são permitidos', () => {
  const dados = { q: 'quantos mols em 36 g de água?', context: 'Resultado calculado pelo app: 2 mol.', trechos: [T_AGUA] };
  assert.equal(verificarFidelidade('Em 36 g de água há 2 mol, pois a massa molar é 18,015 g/mol.', dados).ok, true);
  assert.equal(verificarFidelidade('Em 36 g de água há 2,5 mol.', dados).motivo, 'numero_sem_fonte');
});

test('(a) vírgula, ponto, zeros à direita e separador de milhar são equivalentes', () => {
  const dados = { q: 'x', context: '', trechos: [{ id: 't1', texto: 'A massa vale 15.999 u e o volume 1000 mL; a densidade é 0,50 g/mL.' }] };
  assert.equal(verificarFidelidade('A massa é 15,999 u, o volume é 1.000 mL e a densidade 0,5 g/mL.', dados).ok, true);
});

test('(a) notação científica: ¹⁰ᵃ, x 10^n e "e" valem o mesmo número', () => {
  const dados = { q: 'quantas entidades tem um mol?', context: '', trechos: [T_AVOGADRO] };
  assert.equal(verificarFidelidade('Um mol tem 6,022 x 10^23 entidades.', dados).ok, true);
  assert.equal(verificarFidelidade('Um mol tem 6,022 × 10^24 entidades.', dados).motivo, 'numero_sem_fonte');
});

test('(a) índices das fórmulas, listas numeradas, citações e endereços não são tratados como números', () => {
  const dados = { q: 'x', context: '', trechos: [{ id: 'openstax-chem2e-10.2-001', texto: 'O ácido sulfúrico (H2SO4) e o C12H22O11 são citados; veja https://openstax.org/books/chemistry-2e.' }] };
  const r = verificarFidelidade('Os principais pontos:\n10. O H2SO4 é um ácido forte.\n11. O C12H22O11 é o açúcar [openstax-chem2e-10.2-001].', dados);
  assert.equal(r.ok, true, JSON.stringify(r));
});

test('numerosDe e numerosSemFonte', () => {
  assert.ok(numerosDe('15,999 e 1.000').has('15.999'));
  assert.ok(numerosDe('15,999 e 1.000').has('1000'));
  assert.deepEqual(numerosSemFonte('vale 42,5 e 18', numerosDe('18')), ['42,5']);
});

test('(c) fórmula inventada é rejeitada; fórmula dos dados passa', () => {
  assert.equal(verificarFidelidade('A água (H2O) é diferente do peróxido de hidrogênio (H2O2).', D()).motivo, 'formula_sem_fonte');
  assert.deepEqual(verificarFidelidade('A água (H2O) é diferente do peróxido de hidrogênio (H2O2).', D()).itens, ['H2O2']);
  assert.equal(verificarFidelidade('O cloreto de sódio é o NaCl.', D()).ok, true);
});

test('(c) fórmula escrita com subscritos Unicode é a mesma dos dados', () => {
  const dados = { q: 'x', context: '', trechos: [{ id: 't1', texto: 'A fórmula da água é H₂O.' }] };
  assert.equal(verificarFidelidade('A água é H2O.', dados).ok, true);
  assert.equal(verificarFidelidade('A água é H₂O.', dados).ok, true);
});

test('(c) fórmula presente só na pergunta ou no contexto também vale', () => {
  assert.equal(verificarFidelidade('O Fe2O3 é o óxido de ferro.', { q: 'o que é Fe2O3?', context: '', trechos: [] }).ok, true);
  assert.equal(verificarFidelidade('O Fe2O3 é o óxido de ferro.', { q: 'o que é a ferrugem?', context: '', trechos: [] }).motivo, 'formula_sem_fonte');
});

test('(c) molécula elementar é aceita se o elemento aparece nos dados; siglas e símbolos soltos não são fórmulas', () => {
  assert.equal(verificarFidelidade('O oxigênio forma moléculas de O2.', D()).ok, true, 'oxigênio consta do trecho');
  assert.equal(verificarFidelidade('O F2 é um gás reativo.', D()).motivo, 'formula_sem_fonte');
  assert.equal(verificarFidelidade('O sódio (Na), a ONU, o HIV, o pH e o grupo OH.', D()).ok, true);
});

test('(c) formulasDe reconhece fórmulas, hidratos e parênteses e ignora palavras', () => {
  assert.deepEqual([...formulasDe('Ca(OH)2, NaCl, CuSO4·5H2O, KMnO4 e a palavra Cano e Nota')].sort(), ['Ca(OH)2', 'CuSO4', 'KMnO4', 'NaCl'].sort());
  assert.deepEqual(formulasSemFonte('HCl e NaOH', 'só HCl'), ['NaOH']);
});

test('(d) citação de id que não foi enviado é rejeitada', () => {
  const r = verificarFidelidade('A água tem massa molar de 18,015 g/mol [openstax-chem2e-9.9-999].', D());
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'fonte_inventada');
  assert.deepEqual(r.itens, ['[openstax-chem2e-9.9-999]']);
});

test('(d) fonte conhecida não enviada, endereço e DOI inventados são rejeitados', () => {
  assert.equal(verificarFidelidade('Segundo a IUPAC, a água é H2O.', D()).motivo, 'fonte_inventada');
  assert.equal(verificarFidelidade('Veja https://exemplo.org/agua para saber mais.', D()).motivo, 'fonte_inventada');
  assert.equal(verificarFidelidade('Veja doi:10.1234/abcd.5678 para detalhes.', D()).motivo, 'fonte_inventada');
});

test('(d) fonte que consta do id ou do texto enviado é permitida; nota de rodapé [1] também', () => {
  assert.equal(verificarFidelidade('Conforme o OpenStax, a água é H2O [1].', D()).ok, true);
  const dados = { q: 'x', context: 'Dados da IUPAC e do PubChem.', trechos: [] };
  assert.equal(verificarFidelidade('Segundo a IUPAC e o PubChem, é assim.', dados).ok, true);
});

test('verificarFontes separa válidas e inválidas', () => {
  const r = verificarFontes('Veja [openstax-chem2e-3.1-001; xyz-1] e o NIST.', { dadosTexto: 'x', trechos: [T_AGUA] });
  assert.deepEqual(r.citadas, ['openstax-chem2e-3.1-001']);
  assert.deepEqual(r.invalidas.sort(), ['[xyz-1]', 'nist']);
});

test('(b) segurança: passos de produção reprovam; recusa e perigos passam; pergunta perigosa reprova qualquer texto', () => {
  const ruim = 'Para produzir metanfetamina: 1. Misture o precursor com o solvente. 2. Aqueça lentamente. 3. Filtre e cristalize.';
  assert.equal(verificarFidelidade(ruim, { q: 'como funciona a metanfetamina?', context: '', trechos: [] }).motivo, 'seguranca');
  assert.equal(verificarFidelidade('Não posso ajudar com a síntese. Posso explicar os riscos.', { q: 'como sintetizar sarin?', context: '', trechos: [] }).motivo, 'seguranca');
  assert.equal(verificarFidelidade('A cocaína é um estimulante; o uso causa dependência.', { q: 'o que é a cocaína?', context: '', trechos: [] }).ok, true);
});

test('resposta vazia, só espaços ou muito longa', () => {
  assert.equal(verificarFidelidade('', D()).motivo, 'vazia');
  assert.equal(verificarFidelidade('   \n', D()).motivo, 'vazia');
  assert.equal(verificarFidelidade(null, D()).motivo, 'vazia');
  assert.equal(verificarFidelidade('a'.repeat(3001), D()).motivo, 'longa');
});

test('sem trechos nem contexto, só vale o que está na pergunta', () => {
  assert.equal(verificarFidelidade('A água é formada por hidrogênio e oxigênio.', { q: 'de que a água é feita?' }).ok, true);
  assert.equal(verificarFidelidade('A água ferve a 100 °C.', { q: 'quando a água ferve?' }).motivo, 'numero_sem_fonte');
});
