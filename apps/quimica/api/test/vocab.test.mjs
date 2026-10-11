// Consistência interna dos vocabulários (vocab.js) e das tabelas que dependem deles. A paridade com o Python é conferida em
// backend/modal/test_nlu_core.py.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APELIDOS_UNIDADE, COMPOSTOS_COMUNS, FORMAS_PROPRIEDADE, INTENTS, INTENTS_SEM_ENTIDADES, NIVEIS, NIVEIS_FORMAS, NOMES_ALTERNATIVOS,
  NOMES_ELEMENTOS, PROPRIEDADES, SIMBOLOS, UNIDADES,
} from '../_lib/vocab.js';
import { simbolosDaFormula } from '../_lib/ground.js';

const semAcento = (s) => s.normalize('NFD').replace(/\p{M}/gu, '');

test('21 intenções do contrato, sem repetição, e as sem entidades existem', () => {
  assert.equal(INTENTS.length, 21);
  assert.equal(new Set(INTENTS).size, 21);
  for (const i of INTENTS_SEM_ENTIDADES) assert.ok(INTENTS.includes(i), i);
  for (const i of ['ELEMENTO', 'COMPOSTO', 'RECUSA_PERIGO', 'DESCONHECIDA', 'CONVERSAO_UNIDADE']) assert.ok(INTENTS.includes(i), i);
});

test('118 elementos: símbolos únicos, todos com nome em português e inglês', () => {
  assert.equal(SIMBOLOS.length, 118);
  assert.equal(new Set(SIMBOLOS).size, 118);
  assert.deepEqual(Object.keys(NOMES_ELEMENTOS).sort(), [...SIMBOLOS].sort());
  for (const [s, nomes] of Object.entries(NOMES_ELEMENTOS)) assert.ok(nomes.length >= 2, s);
  assert.equal(NOMES_ELEMENTOS.Fe[0], 'Ferro');
  assert.equal(NOMES_ELEMENTOS.Og[0], 'Oganessônio');
  for (const s of Object.keys(NOMES_ALTERNATIVOS)) assert.ok(SIMBOLOS.includes(s), s);
});

test('toda propriedade tem formas de superfície, sem acento e em minúsculas', () => {
  assert.deepEqual(Object.keys(FORMAS_PROPRIEDADE).sort(), [...PROPRIEDADES].sort());
  for (const [id, formas] of Object.entries(FORMAS_PROPRIEDADE)) {
    assert.ok(formas.length > 0, id);
    for (const f of formas) assert.equal(f, semAcento(f).toLowerCase(), `forma "${f}" de ${id}`);
  }
});

test('toda unidade canônica tem apelidos e vice-versa; nenhum apelido pertence a duas unidades', () => {
  assert.deepEqual(Object.keys(APELIDOS_UNIDADE).sort(), [...UNIDADES].sort());
  assert.equal(new Set(UNIDADES).size, UNIDADES.length);
  const vistos = new Map();
  for (const [u, apelidos] of Object.entries(APELIDOS_UNIDADE)) {
    for (const a of apelidos) {
      assert.ok(!vistos.has(a) || vistos.get(a) === u, `apelido "${a}" repetido em ${vistos.get(a)} e ${u}`);
      vistos.set(a, u);
    }
  }
});

test('níveis têm formas de superfície', () => {
  assert.deepEqual(Object.keys(NIVEIS_FORMAS).sort(), [...NIVEIS].sort());
});

test('compostos comuns: todas as fórmulas são válidas (símbolos reais) e os nomes não têm acento', () => {
  for (const g of COMPOSTOS_COMUNS) {
    assert.ok(g.formulas.length > 0 && g.nomes.length > 0);
    for (const f of g.formulas) assert.ok(simbolosDaFormula(f), `fórmula inválida: ${f}`);
    for (const n of g.nomes) assert.equal(n, semAcento(n).toLowerCase(), n);
  }
});
