// Gêmeo de holdout.py: separação ESTÁVEL entre holdout (só mede) e treino (só ensina) para perguntas reais.
// balde = sha256(pergunta normalizada) % 100, sem semente nem estado: a mesma pergunta cai sempre do mesmo lado,
// em Python e em JavaScript (holdout.test.mjs e test_holdout.py conferem os mesmos vetores).
import { createHash } from 'node:crypto';
import { chaveQ } from './label_extra.mjs';

export const HOLDOUT_PCT = 20;

/** Balde 0..99, determinístico. */
export function holdoutBucket(q) {
  const hex = createHash('sha256').update(chaveQ(q), 'utf8').digest('hex').slice(0, 8);
  return parseInt(hex, 16) % 100;
}

export const ehHoldout = (q, pct = HOLDOUT_PCT) => holdoutBucket(q) < pct;
