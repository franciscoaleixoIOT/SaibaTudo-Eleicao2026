import test from 'node:test';
import assert from 'node:assert/strict';
import { HOLDOUT_PCT, ehHoldout, holdoutBucket } from './holdout.mjs';

// Mesmos vetores de test_holdout.py (Python): a separação holdout/treino tem de ser idêntica nas duas linguagens.
const VETORES = {
  'Em quem devo votar?': 4,
  'quem e o favorito': 1,
  'Quem é o favorito?!': 1,
  minas: 3,
  'Qual o horário da votação?': 84,
  'Resultado para governador em SP': 15,
  'Como justificar o voto?': 0,
  'Quem disputa a Presidência?': 50
};

test('vetores de referência (idênticos aos do Python)', () => {
  for (const [q, balde] of Object.entries(VETORES)) assert.equal(holdoutBucket(q), balde, q);
});

test('acento, caixa e pontuação não mudam o lado', () => {
  assert.equal(holdoutBucket('Quem é o favorito?!'), holdoutBucket('quem e o favorito'));
  assert.equal(holdoutBucket('  QUEM   é o  FAVORITO '), holdoutBucket('quem e o favorito'));
});

test('fatia de holdout próxima de 20 %, pct 0 não reserva e pct 100 reserva tudo', () => {
  assert.equal(HOLDOUT_PCT, 20);
  const n = 5000;
  let dentro = 0;
  for (let i = 0; i < n; i++) if (ehHoldout(`como faco para votar na secao ${i} do municipio ${i * 7}`)) dentro++;
  assert.ok(dentro / n > 0.17 && dentro / n < 0.23, String(dentro / n));
  assert.equal(ehHoldout('minas', 0), false);
  assert.equal(ehHoldout('minas', 100), true);
});
