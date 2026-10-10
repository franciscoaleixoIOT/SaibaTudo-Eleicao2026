// O cliente lê os formatos REAIS que o pipeline gera (a fixture é feita com pipeline/regras.py, pipeline/fontes.py e o índice de coleta_compostos.para_lotes):
// regras (prefixosSI, unidades com fatores/afins, acidosFortes/basesFortes, propriedades em snake_case com "origem"), fontes (uso: dados | textos | link),
// índice {porCid, nomes} sem nomes de exibição e ghs_frases.json. Também cobre os casos em que o pacote NÃO traz algo (cai no padrão do aplicativo).
import test from 'node:test';
import assert from 'node:assert/strict';
import { lojaNova } from './support.mjs';
import { Engine } from '../src/quimica/js/engine.js';
import { converter, tabelaDeUnidades } from '../src/quimica/js/calc/unidades.js';
import { Dicionario } from '../src/quimica/js/dicionario.js';
import { parse } from '../src/quimica/js/nlu.js';
import { tabelaDePropriedades } from '../src/quimica/js/propriedades.js';
import { agruparFontes, REFERENCIAS_EXTERNAS } from '../src/quimica/js/ui/sobre.js';
import { comExibicao } from '../src/quimica/js/ui/compostos.js';

test('regras do pipeline: unidades (fatores e afins), prefixos em prefixosSI e grandezas ausentes (concentração) completadas pela tabela padrão', async () => {
  const store = await lojaNova();
  assert.ok(store.regras.prefixosSI && store.regras.unidades.pressao.fatores && store.regras.unidades.temperatura.afins, 'a fixture usa o formato do pipeline');
  const t = tabelaDeUnidades(store.regras);
  assert.equal(t.doPacote, true);
  assert.equal(converter(1, 'atm', 'Pa', t).resultado, 101325);
  assert.equal(converter(100, '°C', 'K', t).resultado, 373.15, 'temperatura por a·x + b (afins)');
  assert.ok(Math.abs(converter(212, '°F', '°C', t).resultado - 100) < 1e-9);
  assert.equal(converter(2.5, 'L', 'mL', t).resultado, 2500);
  assert.equal(converter(1, 'mol/L', 'mmol/L', t).resultado, 1000, 'grupo "concentração" vem da tabela padrão');
  assert.equal(converter(5, 'ug', 'µg', t).resultado, 5, 'aliases da tabela padrão valem para as unidades do pacote');
  assert.equal(converter(1, 'kPa', 'Pa', t).resultado, 1000, 'prefixo SI do pacote (prefixosSI)');
  assert.ok(t.prefixos.some((p) => p.simbolo === 'k' && p.fator === 1000));
});

test('propriedades do pipeline (ids em snake_case com "origem") casam com as propriedades padrão e somam sinônimos, sem duplicar', async () => {
  const store = await lojaNova();
  const props = tabelaDePropriedades(store.regras);
  assert.ok(!props.some((p) => /_/.test(p.id)), 'ids do pacote não viram propriedades novas');
  const ids = props.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  const fusao = props.find((p) => p.id === 'pontoFusao');
  assert.ok(fusao.sinonimos.includes('temperatura de fusão'), 'sinônimo do pacote (com acento)');
  assert.ok(props.find((p) => p.id === 'descoberta').sinonimos.includes('descobridor'), 'ano_descoberta e descobridor → descoberta');
  assert.ok(props.find((p) => p.id === 'xlogp').sinonimos.includes('logp'), 'compostos.propriedades.xlogp → xlogp');
  const e = new Engine({ store });
  const r = await e.responder('temperatura de fusão do ferro');
  assert.equal(r.parsed.propriedade, 'pontoFusao');
  assert.match(r.directAnswer, /1\.811 K/);
});

test('ácidos e bases fortes vêm de acidosFortes/basesFortes: n derivado da fórmula e "forte na 1ª ionização" respeitado', async () => {
  const e = new Engine({ store: await lojaNova() });
  const hcl = await e.responder('pH de HCl 0,01 mol/L');
  assert.match(hcl.titulo, /^pH 2,00/);
  const caoh = await e.responder('pH de Ca(OH)2 0,005 mol/L');
  assert.match(caoh.titulo, /^pH 12,00/, 'dois OH⁻ por fórmula: [OH⁻] = 0,01');
  const sulfurico = await e.responder('pH de H2SO4 0,1 mol/L');
  assert.match(sulfurico.titulo, /^pH 1,00/, 'só a 1ª ionização, como diz o pacote');
  assert.match(sulfurico.directAnswer, /1ª ionização/);
  const fraco = await e.responder('pH de CH3COOH 0,1 mol/L');
  assert.equal(fraco.resolvida, false, 'ácido fraco sem Ka: pede os dados em vez de inventar');
  assert.match(fraco.directAnswer, /Ka/);
});

test('índice sem nomes de exibição: a busca e o motor completam nome e fórmula com os registros do lote, sob demanda', async () => {
  const store = await lojaNova();
  assert.equal(store.indice.temNomes, false);
  assert.ok(store.indice.entradas.every((x) => x.nome == null && x.chaves.length > 0));
  const dic = new Dicionario(store);
  assert.equal(parse('massa molar da água', dic).composto, 962);
  assert.equal(parse('aspirina', dic).composto, 2244);
  assert.equal(parse('H2SO4', dic).composto, 1118);
  assert.equal(parse('hcl', dic).composto, 313);
  const e = new Engine({ store });
  assert.match((await e.responder('massa molar da água')).directAnswer, /18,015 g\/mol/);
  assert.match((await e.responder('molaridade de 5,85 g de NaCl em 500 mL')).titulo, /Molaridade/);
  assert.match((await e.responder('quantos mols tem em 18 g de água?')).directAnswer, /0,999167 mol/);
  assert.match((await e.responder('reagente limitante de H2 + O2 -> H2O com 4 g de H2 e 16 g de O2')).directAnswer, /limitante: O₂/);
  const exib = await comExibicao(store, store.indice.entradas.slice(0, 3));
  assert.ok(exib.every((x) => x.nome && x.formula), 'nome e fórmula vindos do lote');
  assert.ok((await store.compostosIniciais(5)).length === 5);
});

test('fontes do pipeline (uso: dados | textos | link): agrupadas, licenças como em fontes.json, e OpenStax, ICSC, NIST e LibreTexts sempre como referências externas', async () => {
  const store = await lojaNova();
  const g = agruparFontes(store.fontes);
  const nomes = (l) => l.map((f) => f.id ?? f.nome);
  assert.ok(['pubchem', 'codata', 'wikidata', 'clp-eurlex'].every((id) => nomes(g.dados).includes(id)));
  assert.ok(['chebi', 'wikipedia-pt', 'wikibooks-pt', 'gutenberg-14474'].every((id) => nomes(g.textos).includes(id)));
  assert.ok(nomes(g.externas).includes('icsc-oit'), 'ICSC do pacote (uso: link)');
  for (const ref of ['OpenStax', 'NIST', 'LibreTexts', 'ICSC']) assert.ok(g.externas.some((f) => String(f.nome).includes(ref)), ref);
  assert.equal(g.externas.filter((f) => /ICSC/.test(f.nome)).length, 1, 'ICSC não duplica');
  // licença exatamente como no fontes.json
  for (const f of store.fontes) {
    const achada = [...g.dados, ...g.textos, ...g.externas].find((x) => x.id === f.id);
    assert.equal(achada.licenca, f.licenca, f.id);
  }
  assert.ok(REFERENCIAS_EXTERNAS.every((r) => r.licenca === 'somente link' && r.url.startsWith('https://')));
  // sem fontes.json: ainda aparecem as referências externas
  assert.equal(agruparFontes(null).externas.length, REFERENCIAS_EXTERNAS.length);
});

test('sem incompatibilidades no pacote (o pipeline não as traz): a resposta de mistura usa o aviso geral, sem inventar a reação', async () => {
  const store = await lojaNova();
  delete store.regras.incompatibilidades;
  const e = new Engine({ store });
  const r = await e.responder('por que não misturar água sanitária com amoníaco?');
  assert.equal(r.intent, 'SEGURANCA');
  assert.match(r.directAnswer, /Não misture .* com .*: misturar produtos químicos pode gerar calor, gases tóxicos/);
  assert.ok(!/cloraminas/.test(r.directAnswer));
  assert.equal(r.blocos.filter((b) => b.tipo === 'ghs').length, 2, 'perigos de cada um continuam vindo do GHS do pacote');
});

test('frases H: as do pacote (CLP) valem mais que as do aplicativo, e a fonte exibida é a do pacote', async () => {
  const store = await lojaNova();
  store.regras.frasesH.H314 = 'TEXTO DO PACOTE';
  const e = new Engine({ store });
  const r = await e.responder('quais os perigos do ácido sulfúrico?');
  const g = r.blocos.find((b) => b.tipo === 'ghs');
  assert.equal(g.frases.find((f) => f.codigo === 'H314').texto, 'TEXTO DO PACOTE');
  assert.ok(g.fonte.some((f) => /1272\/2008/.test(f.nome)), 'fonte do pacote: Regulamento CLP (EUR-Lex)');
});

test('definição do ChEBI no formato do pipeline ({texto, chebiId, licenca}) vira citação com link para o ChEBI e licença CC BY 4.0', async () => {
  const e = new Engine({ store: await lojaNova() });
  const r = await e.responder('etanol');
  const c = r.blocos.find((b) => b.tipo === 'citacao');
  assert.match(c.texto, /primary alcohol/);
  assert.equal(c.fonte.url, 'https://www.ebi.ac.uk/chebi/searchId.do?chebiId=CHEBI:16236');
  assert.match(c.fonte.nome, /CHEBI:16236/);
  assert.equal(c.fonte.licenca, 'CC BY 4.0');
});
