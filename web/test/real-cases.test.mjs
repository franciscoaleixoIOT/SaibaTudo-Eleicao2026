// Perguntas REAIS revisadas por uma pessoa (contracts/nlu_real_cases.json): o NLU local do site também deve entendê-las.
//
// É assim que as regras locais melhoram com o uso: uma pergunta real que o app não entendia entra no contrato (promover.mjs) e esta suíte
// fica vermelha até alguém ensinar a regra, no site (nlu.js) E no Android (LocalNlu.kt, NluRealCasesTest). Enquanto a regra não vem, o caso
// pode levar `"lacuna": true` (lacuna conhecida): não derruba o CI, aparece no relatório de lacunas (backend/retrain/lacunas.mjs) e a marca
// DEVE ser removida quando o NLU passar a entender (marca esquecida também falha, para a lista não envelhecer).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RAIZ, pacoteCompleto } from './support.mjs';
import { INTENTS } from '../src/eleicoes2026/js/nlu.js';
import { CHAVES_GOLDEN, falhasDoCaso } from './contrato.mjs';

const real = JSON.parse(readFileSync(resolve(RAIZ, 'contracts/nlu_real_cases.json'), 'utf8'));
const golden = JSON.parse(readFileSync(resolve(RAIZ, 'contracts/nlu_golden_cases.json'), 'utf8'));

test('o contrato de perguntas reais só usa intenções e chaves conhecidas, com revisor identificado e sem repetir o golden', () => {
  const doGolden = new Set(golden.cases.map((c) => c.q.toLowerCase().trim()));
  const vistas = new Set();
  for (const c of real.cases) {
    assert.equal(typeof c.q, 'string', JSON.stringify(c));
    assert.ok(INTENTS.includes(c.intent), `${c.q}: intenção desconhecida ${c.intent}`);
    for (const k of Object.keys(c)) {
      assert.ok(k === 'q' || CHAVES_GOLDEN.includes(k) || ['origem', 'revisor', 'revisadoEm', 'lacuna'].includes(k), `${c.q}: chave inesperada ${k}`);
    }
    assert.ok(c.revisor && c.revisadoEm, `${c.q}: caso sem revisor/data (só entra o que uma pessoa revisou)`);
    assert.ok(!doGolden.has(c.q.toLowerCase().trim()), `${c.q}: já está no contrato golden`);
    const chave = c.q.toLowerCase().trim();
    assert.ok(!vistas.has(chave), `${c.q}: repetida`);
    vistas.add(chave);
  }
});

test('o NLU local entende todas as perguntas reais (exceto lacunas conhecidas) e as marcas de lacuna não envelhecem', async () => {
  const { gaz } = await pacoteCompleto();
  const novas = [];
  const marcaEsquecida = [];
  for (const c of real.cases) {
    const falhas = falhasDoCaso(c, gaz);
    if (falhas.length > 0 && c.lacuna !== true) novas.push(`"${c.q}": ${falhas.join('; ')}`);
    if (falhas.length === 0 && c.lacuna === true) marcaEsquecida.push(`"${c.q}"`);
  }
  assert.deepEqual(novas, [], 'Perguntas reais que o NLU local NÃO entende (ensine a regra no site e no Android, ou marque "lacuna": true):\n' + novas.join('\n'));
  assert.deepEqual(marcaEsquecida, [], 'O NLU já entende; remova "lacuna": true de:\n' + marcaEsquecida.join('\n'));
});
