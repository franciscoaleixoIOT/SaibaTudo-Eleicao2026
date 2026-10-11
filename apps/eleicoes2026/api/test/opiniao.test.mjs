// Filtro de OPINIÃO da captura de perguntas (api/_lib/opiniao.js): perguntas que revelam a opinião ou a preferência política de quem as fez
// não podem ser guardadas. O mesmo contrato (contracts/opiniao_cases.json) é conferido no site (web/test/melhoria.test.mjs) e no Android (MelhoriaTest.kt).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { revelaOpiniao } from '../_lib/opiniao.js';
import { filtrarTextos } from '../_lib/melhoria-handler.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const casos = JSON.parse(readFileSync(resolve(aqui, '../../contracts/opiniao_cases.json'), 'utf8')).cases;

test('contrato: todo caso de opinião é barrado e toda pergunta neutra passa', () => {
  assert.ok(casos.filter((c) => c.opiniao).length >= 20 && casos.filter((c) => !c.opiniao).length >= 20);
  const erros = casos.filter((c) => revelaOpiniao(c.q) !== c.opiniao).map((c) => `${c.opiniao ? 'deveria barrar' : 'deveria passar'}: ${c.q}`);
  assert.deepEqual(erros, []);
});

test('os exemplos pedidos pelo mantenedor são barrados, com ou sem acento e em caixa alta', () => {
  for (const q of [
    'Quero que fulano ganhe, o que posso fazer?',
    'Qual estratégia para aumentar as chances de fulano ganhar?',
    'QUERO QUE FULANO GANHE!!!',
    'qual estrategia pra aumentar as chances do fulano',
  ]) assert.equal(revelaOpiniao(q), true, q);
});

test('entradas estranhas não quebram o filtro', () => {
  for (const q of [undefined, null, 42, '', '   ', '\u0000​']) assert.equal(revelaOpiniao(q), false);
});

test('filtrarTextos descarta (não mascara) a pergunta que revela opinião e conta como descartada', () => {
  const r = filtrarTextos(['Quando é a eleição?', 'Quero que fulano ganhe, o que posso fazer?', 'Qual estratégia para aumentar as chances de fulano ganhar?', 'Como justificar o voto?']);
  assert.deepEqual(r.aceitos, ['Quando é a eleição?', 'Como justificar o voto?']);
  assert.equal(r.descartadas, 2);
});
