// Casos de referência compartilhados com o Android (contracts/nlu_golden_cases.json): o NLU do site DEVE passar em todos.
// Chave ausente = não verificada; chave com null = deve estar ausente. Com o pacote de teste (13 elementos, 12 compostos), casos que citam
// uma entidade que o pacote de teste não tem são pulados (e contados); com o pacote real (data/quimica) nenhum é pulado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DADOS, DADOS_REAIS, RAIZ, loja } from './support.mjs';
import { Dicionario } from '../src/quimica/js/dicionario.js';
import { INTENTS, parse } from '../src/quimica/js/nlu.js';
import { CHAVES_GOLDEN, avaliavel, falhasDoCaso } from './contrato.mjs';

const golden = JSON.parse(readFileSync(resolve(RAIZ, 'contracts/nlu_golden_cases.json'), 'utf8'));
async function rodar(dir) {
  const store = await loja(dir);
  const dic = new Dicionario(store);
  let puladas = 0;
  const falhas = [];
  for (const c of golden.cases) {
    if (!avaliavel(c, store)) { puladas++; continue; }
    const p = parse(c.q, dic);
    for (const f of falhasDoCaso(c, p, store)) falhas.push(`"${c.q}" → ${p.intent}: ${f}`);
    if (p.intent !== c.intent && !falhas.some((x) => x.startsWith(`"${c.q}"`))) falhas.push(`"${c.q}": intenção esperada ${c.intent}, veio ${p.intent}`);
  }
  return { falhas, puladas, total: golden.cases.length };
}

test('contrato dos casos de referência: pelo menos 60 casos, só intenções e chaves conhecidas, cobrindo todas as intenções', () => {
  assert.ok(golden.cases.length >= 60, `casos: ${golden.cases.length}`);
  for (const c of golden.cases) {
    assert.ok(INTENTS.includes(c.intent), `${c.q}: intenção desconhecida ${c.intent}`);
    for (const k of Object.keys(c)) assert.ok(k === 'q' || CHAVES_GOLDEN.includes(k), `${c.q}: chave não verificada ${k}`);
  }
  const usadas = new Set(golden.cases.map((c) => c.intent));
  for (const i of INTENTS) assert.ok(usadas.has(i), `nenhum caso para ${i}`);
});

test('todos os casos de referência do NLU (golden cases) com o pacote de teste', async () => {
  const { falhas, puladas, total } = await rodar(DADOS);
  assert.ok(puladas < total * 0.5, `muitos casos pulados (${puladas}/${total}): o pacote de teste não cobre as entidades`);
  assert.deepEqual(falhas, [], 'Falhas de NLU:\n' + falhas.join('\n'));
});

test('todos os casos de referência do NLU com o pacote REAL (se existir em data/quimica)', { skip: DADOS_REAIS ? false : 'sem pacote real em data/quimica' }, async () => {
  const { falhas, puladas } = await rodar(DADOS_REAIS);
  assert.deepEqual(falhas, [], 'Falhas de NLU no pacote real:\n' + falhas.join('\n'));
  assert.equal(puladas, 0, 'com o pacote real nenhum caso deve ser pulado');
});

test('pergunta vazia ou gigante não quebra o NLU', async () => {
  const dic = new Dicionario(await loja());
  assert.equal(parse('', dic).intent, 'DESCONHECIDA');
  assert.equal(parse('???', dic).intent, 'DESCONHECIDA');
  const longa = parse('massa molar da água '.repeat(500), dic);
  assert.ok(longa.textoOriginal.length <= 300);
  assert.equal(longa.intent, 'MASSA_MOLAR');
});
