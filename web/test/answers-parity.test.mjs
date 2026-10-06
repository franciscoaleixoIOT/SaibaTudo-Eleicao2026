// Paridade das RESPOSTAS com o Android: contracts/answers_parity.json (gerado por web/tools/gerar_paridade.mjs) traz o texto que o site monta para
// perguntas que não dependem de candidatos. O Android confere o mesmo arquivo (AnswersParityTest.kt). Se um texto mudar de propósito: altere os DOIS
// AnswerBuilders (answers.js e AnswerBuilder.kt) e rode `node web/tools/gerar_paridade.mjs`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RAIZ } from './support.mjs';
import { EXTRAS, INTENCOES_ESTATICAS, gerar } from '../tools/gerar_paridade.mjs';

const contrato = JSON.parse(readFileSync(resolve(RAIZ, 'contracts/answers_parity.json'), 'utf8'));

test('o arquivo de paridade está em dia com o AnswerBuilder do site (regerar com web/tools/gerar_paridade.mjs)', async () => {
  const atual = await gerar();
  const porQ = new Map(contrato.cases.map((c) => [c.q, c]));
  const diferentes = atual.filter((c) => JSON.stringify(c) !== JSON.stringify(porQ.get(c.q))).map((c) => c.q);
  assert.deepEqual(diferentes, [], `respostas do site diferentes do contrato (rode o gerador e revise o diff): ${diferentes.join(' | ')}`);
  assert.equal(atual.length, contrato.cases.length, 'o conjunto de perguntas mudou: regere o contrato');
});

test('o contrato cobre as intenções estáticas e as perguntas extras, sem repetir pergunta', () => {
  const intents = new Set(contrato.cases.map((c) => c.intent));
  for (const i of ['REGRAS_URNA', 'REGRAS_VOTO', 'CALENDARIO', 'RECOMENDACAO', 'AJUDA', 'FONTES', 'SIMULADOR']) assert.ok(intents.has(i), i);
  assert.ok(INTENCOES_ESTATICAS.length >= 9 && EXTRAS.length >= 10);
  assert.equal(new Set(contrato.cases.map((c) => c.q)).size, contrato.cases.length);
  for (const c of contrato.cases) {
    assert.equal(c.resolvida, true, c.q);
    assert.ok(c.texto.length > 10, c.q);
    assert.equal(c.texto, c.texto.replace(/\s+/g, ' ').trim(), `${c.q}: texto precisa estar normalizado`);
  }
});

test('recusas de recomendação não citam candidato nem partido', () => {
  for (const c of contrato.cases.filter((x) => x.intent === 'RECOMENDACAO')) {
    assert.match(c.texto, /Res\.? ?TSE|neutralidade|recomend/i, c.q);
    assert.ok(!/vote (em|no|na)\b/i.test(c.texto), `${c.q}: a recusa não pode instruir voto`);
  }
});
