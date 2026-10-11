// Busca, propriedades, perigos (GHS), dicionário e peças do NLU (unidades, equação, quantidades) com o pacote de teste.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loja } from './support.mjs';
import { normalizarIndice } from '../src/quimica/js/data.js';
import { Engine } from '../src/quimica/js/engine.js';
import { buscarCompostos, buscarElementos } from '../src/quimica/js/busca.js';
import { Dicionario } from '../src/quimica/js/dicionario.js';
import { extrairEquacao, ligarQuantidades, lerQuantidades, lerUnidade, parse } from '../src/quimica/js/nlu.js';
import { descreverGhs, fraseH, palavraSinal, urlPictograma, urlSegura } from '../src/quimica/js/perigos.js';
import { formatarValor, tabelaDePropriedades, valorBruto, estadoRotulo, estadoChave, categoriaRotulo } from '../src/quimica/js/propriedades.js';
import { distancia, normalizar, listar } from '../src/quimica/js/texto.js';

const store = await loja();
const dic = new Dicionario(store);
const primeiro = (q) => buscarCompostos(store.indice.entradas, q)[0]?.cid;

test('busca de compostos (índice do pipeline: só chaves normalizadas): nome (sem acento), popular, IUPAC, sinônimo, fórmula e CID', async () => {
  assert.equal(primeiro('acido sulfurico'), 1118);
  assert.equal(primeiro('Ácido sulfúrico'), 1118);
  assert.equal(primeiro('aspirina'), 2244);
  assert.equal(primeiro('oxidane'), 962);
  assert.equal(primeiro('sal de cozinha'), 5234);
  assert.equal(primeiro('agua sanitaria'), 23665760);
  assert.equal(primeiro('H2SO4'), 1118);
  assert.equal(primeiro('h2so4'), 1118);
  assert.equal(primeiro('NaCl'), 5234);
  assert.equal(primeiro('2244'), 2244);
  assert.equal(primeiro('CID 962'), 962);
  assert.equal(primeiro('soda'), 14798);
  assert.equal(buscarCompostos(store.indice.entradas, 'zzzz').length, 0);
  assert.equal(buscarCompostos(store.indice.entradas, '').length, 0);
  assert.ok(buscarCompostos(store.indice.entradas, 'acido', 3).length <= 3);
  // o resultado exato vem antes do parcial
  const r = buscarCompostos(store.indice.entradas, 'acido');
  assert.ok(r.length >= 3 && r[0].pontos >= r[r.length - 1].pontos);
  // o índice do pipeline não traz CAS: a busca por CAS percorre os lotes (um por vez, com cache)
  assert.equal(buscarCompostos(store.indice.entradas, '64-17-5').length, 0);
  assert.equal(await store.cidPorCas('64-17-5'), 702);
  assert.equal(await store.cidPorCas('000-00-0'), null);
  assert.equal(await store.cidPorCas('abc'), null);
});

test('busca com índice que traz nomes de exibição (outro formato aceito): mesmos resultados, incluindo CAS', async () => {
  const lote = await store.composto(962).then(() => [...store._compostos.values()]);
  const { entradas } = normalizarIndice(lote.map((c) => ({ cid: c.cid, lote: 'lote-001', nome: c.nome, nomePopular: c.nomePopular, nomeIupac: c.nomeIupac, sinonimos: c.sinonimos, formula: c.formula, cas: c.cas })));
  const p = (q) => buscarCompostos(entradas, q)[0]?.cid;
  assert.equal(p('64-17-5'), 702);
  assert.equal(p('aspirina'), 2244);
  assert.equal(p('H2SO4'), 1118);
  assert.equal(p('acido sulfurico'), 1118);
  assert.equal(buscarCompostos(entradas, '64-17-5')[0].motivo, 'CAS');
});

test('busca de elementos: símbolo, número atômico, nome em português e em inglês', () => {
  const s = (q) => buscarElementos(store.elementos, q).map((e) => e.simbolo);
  assert.deepEqual(s('fe'), ['Fe']);
  assert.deepEqual(s('26'), ['Fe']);
  assert.deepEqual(s('ferro'), ['Fe']);
  assert.deepEqual(s('iron'), ['Fe']);
  assert.ok(s('o').includes('O'));
  assert.equal(s('').length, store.elementos.length);
  assert.deepEqual(s('xyz'), []);
});

test('propriedades: unidades legíveis (K também em °C, kg/m³ também em g/cm³), fontes de dados e lista do pacote mesclada à padrão', () => {
  const props = tabelaDePropriedades(store.regras);
  const p = (id) => props.find((x) => x.id === id);
  const fe = store.porSimbolo.get('Fe');
  assert.equal(formatarValor(p('pontoFusaoK'), valorBruto(p('pontoFusaoK'), fe), store.ctx).texto, '1.811 K (1.537,85 °C)');
  assert.equal(formatarValor(p('pontoEbulicaoK'), valorBruto(p('pontoEbulicaoK'), fe), store.ctx).texto, '3.134 K (2.860,85 °C)');
  assert.equal(formatarValor(p('densidadeKgm3'), valorBruto(p('densidadeKgm3'), fe), store.ctx).texto, '7.874 kg/m³ (7,874 g/cm³)');
  assert.equal(formatarValor(p('massaAtomica'), 55.845, store.ctx).texto, '55,845 u (g/mol)');
  assert.equal(formatarValor(p('estadosOxidacao'), [-2, 2, 3], store.ctx).texto, '−2, +2 e +3');
  assert.equal(formatarValor(p('descoberta'), { ano: 1774, por: 'A' }, store.ctx).texto, 'em 1774 por A');
  assert.equal(formatarValor(p('categoria'), 'halogenio', store.ctx).texto, 'halogênio');
  assert.equal(formatarValor(p('pontoFusaoK'), undefined, store.ctx), null, 'ausência de dado = ausência de valor');
  assert.equal(formatarValor(p('pontoFusaoK'), null, store.ctx), null);
  // propriedade do composto fica em registro.propriedades
  const agua = { propriedades: { xlogp: -0.5 } };
  assert.equal(valorBruto(p('xlogp'), agua), -0.5);
  assert.equal(valorBruto(p('massaMolar'), { massaMolar: 18.015 }), 18.015);
  // o pacote pode acrescentar propriedades e sinônimos
  const mesclada = tabelaDePropriedades({ propriedades: [{ id: 'pKa', rotulo: 'pKa', alvo: 'composto', campo: 'pKa', tipo: 'numero', sinonimos: ['constante de acidez'] }, { id: 'pontoFusaoK', sinonimos: ['derretimento'] }] });
  assert.ok(mesclada.some((x) => x.id === 'pKa'));
  assert.ok(mesclada.find((x) => x.id === 'pontoFusaoK').sinonimos.includes('derretimento') && mesclada.find((x) => x.id === 'pontoFusaoK').sinonimos.includes('ponto de fusao'));
  assert.equal(estadoRotulo('gas'), 'gás');
  assert.equal(estadoChave('liquid'), 'liquido');
  assert.equal(categoriaRotulo('metal_alcalino_terroso'), 'metal alcalino-terroso');
});

test('perigos (GHS): frases H em português, combinadas, palavra de sinal, pictogramas e URLs seguras', () => {
  assert.equal(fraseH('H314'), 'Provoca queimaduras graves na pele e lesões oculares graves.');
  assert.equal(fraseH('h302+h312'), 'Nocivo se ingerido / Nocivo em contato com a pele.');
  assert.equal(fraseH('H999'), null);
  assert.equal(fraseH('H314', { frasesH: { H314: 'texto do pacote' } }), 'texto do pacote', 'o pacote pode sobrepor o texto');
  assert.equal(palavraSinal('Danger'), 'Perigo');
  assert.equal(palavraSinal('warning'), 'Atenção');
  assert.equal(palavraSinal(null), null);
  const g = descreverGhs({ pictogramas: ['GHS05', 'ghs09', 'XYZ'], palavraSinal: 'Danger', frasesH: ['H314', 'H400'], fonte: 'F' });
  assert.deepEqual(g.pictogramas.map((x) => x.codigo), ['GHS05', 'GHS09']);
  assert.equal(g.palavraSinal, 'Perigo');
  assert.equal(g.pictogramas[0].url, urlPictograma('GHS05'));
  assert.equal(g.pictogramas[0].nome, 'Corrosivo');
  assert.equal(descreverGhs(null), null);
  assert.equal(descreverGhs({}), null);
  assert.equal(urlSegura('https://www.ilo.org/x'), 'https://www.ilo.org/x');
  assert.equal(urlSegura('http://www.ilo.org/x'), null);
  assert.equal(urlSegura('javascript:alert(1)'), null);
  assert.equal(urlSegura('//evil.com'), null);
  assert.equal(urlSegura(null), null);
});

test('dicionário: fórmulas digitadas em qualquer caixa, símbolos sem confundir com palavras, nomes com erro de digitação', () => {
  const ents = (t) => { const e = dic.entidades(t); return { el: e.elementos.map((x) => x.simbolo), co: e.compostos.map((x) => x.cid), f: e.formulas.map((x) => x.texto) }; };
  assert.equal(dic.recuperarCaixa('nacl'), 'NaCl');
  assert.equal(dic.recuperarCaixa('naoh'), 'NaOH');
  assert.equal(dic.recuperarCaixa('h2so4'), 'H2SO4');
  assert.equal(dic.recuperarCaixa('c2h5oh'), 'C2H5OH');
  assert.equal(dic.recuperarCaixa('co2'), null, 'ambíguo: Co2 ou CO2');
  assert.deepEqual(ents('h2o').co, [962]);
  assert.deepEqual(ents('co2').co, [280], 'o dicionário de fórmulas resolve a ambiguidade');
  assert.deepEqual(ents('Ca(OH)2').f, ['Ca(OH)2']);
  assert.deepEqual(ents('massa de CuSO4·5H2O').f, ['CuSO4·5H2O']);
  assert.deepEqual(ents('Fe3+').f, ['Fe3+']);
  // palavras comuns não viram fórmulas nem símbolos
  for (const t of ['Como se faz', 'Sim ou não', 'quero saber', 'OK', 'SOS', 'Na tabela periódica, quem é o primeiro?', 'No Brasil e no mundo']) {
    const e = ents(t);
    assert.deepEqual([e.el, e.f], [[], []], t);
  }
  // símbolos: dois caracteres sempre; um caractere só sozinho ou com a palavra "elemento"; "Na" no começo da frase é a preposição
  assert.deepEqual(ents('ponto de fusão do Fe').el, ['Fe']);
  assert.deepEqual(ents('ponto de fusão do Na').el, ['Na']);
  assert.deepEqual(ents('O').el, ['O']);
  assert.deepEqual(ents('elemento C').el, ['C']);
  assert.deepEqual(ents('O ferro é um metal').el, ['Fe'], 'o "O" artigo não vira oxigênio');
  // erro de digitação
  assert.deepEqual(ents('oxigenyo').el, ['O']);
  assert.deepEqual(ents('acido sulfuico').co, [1118]);
  assert.deepEqual(ents('ferrro').el, ['Fe']);
  assert.deepEqual(ents('xylofone').el, []);
  // nome mais longo vence ("água sanitária" não é "água")
  assert.deepEqual(ents('misturar agua sanitaria').co, [23665760]);
  // CAS e CID
  assert.deepEqual(ents('CID 2244').co, [2244]);
});

test('NLU: unidades por extenso e símbolos, quantidades com notação científica e vírgula decimal', () => {
  const u = store.ctx.unidades;
  assert.equal(lerUnidade('graus Celsius', u), '°C');
  assert.equal(lerUnidade('kelvin', u), 'K');
  assert.equal(lerUnidade('atmosferas', u), 'atm');
  assert.equal(lerUnidade('mililitros', u), 'mL');
  assert.equal(lerUnidade('mol por litro', u), 'mol/L');
  assert.equal(lerUnidade('kPa', u), 'kPa');
  assert.equal(lerUnidade('mmHg', u), 'mmHg');
  assert.equal(lerUnidade('banana', u), null);
  const q = (t) => lerQuantidades(t, u).map((x) => [x.valor, x.unidade]);
  assert.deepEqual(q('1,5 mol/L de HCl'), [[1.5, 'mol/L']]);
  assert.deepEqual(q('25 °C'), [[25, '°C']]);
  assert.deepEqual(q('100 mL de água a 300 K'), [[100, 'mL'], [300, 'K']]);
  assert.deepEqual(q('2,5 x 10^-3 mol'), [[0.0025, 'mol']]);
  assert.deepEqual(q('Ka 1,8e-5'), [[1.8e-5, null]]);
  assert.deepEqual(q('Ca(OH)2 com 5 g'), [[5, 'g']], 'o 2 da fórmula não é quantidade');
  assert.deepEqual(q('H2O'), []);
});

test('NLU: extração da equação, ligação quantidade ↔ substância e continuação', () => {
  assert.equal(extrairEquacao('balanceie a equação Fe + O2 -> Fe2O3 por favor'), 'Fe + O2 -> Fe2O3');
  assert.equal(extrairEquacao('Zn + Cu2+ → Zn2+ + Cu'), 'Zn + Cu2+ -> Zn2+ + Cu');
  assert.equal(extrairEquacao('2 H2 + O2 => 2 H2O'), '2 H2 + O2 -> 2 H2O');
  assert.equal(extrairEquacao('quanto é 2 -> 3'), null);
  assert.equal(extrairEquacao('sem seta alguma'), null);
  const l = ligarQuantidades('4 g de H2 e 16 g de O2', dic);
  assert.deepEqual(l.map((x) => [x.valor, x.unidade, x.especie]), [[4, 'g', 'H2'], [16, 'g', 'O2']]);
  const m = ligarQuantidades('quantos mols tem em 18 g de água?', dic);
  assert.deepEqual([m[0].valor, m[0].especie, m[0].cid], [18, null, 962], 'com o índice do pipeline a fórmula vem do registro do composto');
  // continuação: sem entidade, herda do contexto
  const ctx = parse('ponto de fusão do ferro', dic);
  const seg = parse('e o ponto de ebulição?', dic, ctx);
  assert.equal(seg.elemento, 'Fe');
  assert.equal(seg.propriedade, 'pontoEbulicaoK');
  assert.equal(parse('e o ponto de ebulição?', dic, null).elemento, null);
});

test('texto: normalização, distância de edição e listas', () => {
  assert.equal(normalizar('  Água   Sanitária! '), 'agua sanitaria');
  assert.equal(normalizar('H₂SO₄'), 'h2so4');
  assert.equal(distancia('ferro', 'ferrro', 2), 1);
  assert.equal(distancia('abc', 'xyz', 1), 2, 'corta e devolve max+1');
  assert.equal(distancia('ab', 'ba', 1), 1, 'transposição');
  assert.equal(listar(['a', 'b', 'c']), 'a, b e c');
  assert.equal(listar(['a']), 'a');
  assert.equal(listar([]), '');
});

test('CAS na pergunta: o motor resolve pelos lotes e responde sobre o composto', async () => {
  const e = new Engine({ store: await loja() });
  const r = await e.responder('composto 64-17-5');
  assert.equal(r.intent, 'COMPOSTO');
  assert.equal(r.parsed.composto, 702);
  assert.match(r.titulo, /Etanol/);
});
