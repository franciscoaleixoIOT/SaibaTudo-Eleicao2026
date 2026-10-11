import test from 'node:test';
import assert from 'node:assert/strict';
import { createCache, normalizeQuestion } from '../_lib/cache.js';
import { createDailyBudget, createSlidingWindow, diaBrasilia } from '../_lib/ratelimit.js';
import { relogio } from './_helpers.mjs';

// ------------------------------------------------------------------ janela deslizante

test('janela deslizante: permite até o limite e bloqueia o excedente', () => {
  const now = relogio();
  const w = createSlidingWindow({ windowMs: 60_000, now });
  for (let i = 0; i < 3; i++) {
    assert.equal(w.check('ip', 3).allowed, true);
    w.record('ip');
  }
  const r = w.check('ip', 3);
  assert.equal(r.allowed, false);
  assert.equal(r.remaining, 0);
  assert.ok(r.retryAfterMs > 0 && r.retryAfterMs <= 60_000);
});

test('janela deslizante: libera quando as requisições antigas saem da janela (não é janela fixa)', () => {
  const now = relogio();
  const w = createSlidingWindow({ windowMs: 60_000, now });
  w.record('ip'); // t=0
  now.avancar(30_000);
  w.record('ip'); // t=30s
  assert.equal(w.check('ip', 2).allowed, false);
  now.avancar(30_001); // t=60,001s: a 1ª saiu, a 2ª ainda conta
  const r = w.check('ip', 2);
  assert.equal(r.allowed, true);
  assert.equal(r.remaining, 1);
  now.avancar(30_000);
  assert.equal(w.check('ip', 1).allowed, true);
});

test('janela deslizante: chaves são independentes e check não consome', () => {
  const w = createSlidingWindow({ windowMs: 1000, now: relogio() });
  w.record('a');
  assert.equal(w.check('a', 1).allowed, false);
  assert.equal(w.check('b', 1).allowed, true);
  for (let i = 0; i < 10; i++) w.check('b', 1);
  assert.equal(w.check('b', 1).allowed, true, 'check repetido não consome');
});

test('janela deslizante: memória limitada (maxKeys)', () => {
  const w = createSlidingWindow({ windowMs: 60_000, maxKeys: 100, now: relogio() });
  for (let i = 0; i < 1000; i++) w.record(`ip-${i}`);
  assert.ok(w.size() <= 100, `size=${w.size()}`);
});

test('janela deslizante: janela diária por iid', () => {
  const now = relogio();
  const w = createSlidingWindow({ windowMs: 24 * 3600_000, now });
  for (let i = 0; i < 60; i++) w.record('iid');
  assert.equal(w.check('iid', 60).allowed, false);
  now.avancar(24 * 3600_000 + 1);
  assert.equal(w.check('iid', 60).allowed, true);
});

// ------------------------------------------------------------------ orçamento diário

test('orçamento diário: consome até o limite e zera no dia seguinte (fuso de Brasília)', () => {
  const now = relogio(Date.UTC(2026, 9, 1, 12, 0, 0)); // 09:00 em Brasília
  const b = createDailyBudget({ now });
  assert.equal(b.consume(2), true);
  assert.equal(b.consume(2), true);
  assert.equal(b.consume(2), false);
  assert.equal(b.remaining(2), 0);
  now.avancar(14 * 3600_000); // 23:00 em Brasília: mesmo dia
  assert.equal(b.consume(2), false);
  now.avancar(3 * 3600_000); // 02:00 do dia 02 em Brasília (05:00 UTC)
  assert.equal(b.consume(2), true);
});

test('orçamento diário: limite 0 = sempre esgotado (kill switch por orçamento)', () => {
  const b = createDailyBudget({ now: relogio() });
  assert.equal(b.consume(0), false);
});

test('diaBrasilia usa UTC-3', () => {
  assert.equal(diaBrasilia(Date.UTC(2026, 9, 2, 2, 59, 0)), '2026-10-01');
  assert.equal(diaBrasilia(Date.UTC(2026, 9, 2, 3, 0, 0)), '2026-10-02');
});

// ------------------------------------------------------------------ cache

test('normalizeQuestion: minúsculas, sem acentos, espaços e pontuação colapsados', () => {
  assert.equal(normalizeQuestion('  Quem   É  LULA?? '), 'quem e lula');
  assert.equal(normalizeQuestion('Tarcísio de Freitas'), 'tarcisio de freitas');
  assert.equal(normalizeQuestion('Açaí, Pará!'), 'acai para');
  assert.equal(normalizeQuestion('2º turno'), '2º turno');
  assert.equal(normalizeQuestion('quem e lula'), normalizeQuestion('Quem é Lula?'));
});

test('cache: get/set e expiração por TTL', () => {
  const now = relogio();
  const c = createCache({ ttlMs: 1000, now });
  c.set('k', { intent: 'CONTAR' });
  assert.deepEqual(c.get('k'), { intent: 'CONTAR' });
  now.avancar(999);
  assert.deepEqual(c.get('k'), { intent: 'CONTAR' });
  now.avancar(2);
  assert.equal(c.get('k'), undefined);
  assert.equal(c.size(), 0, 'entrada expirada é removida');
});

test('cache: TTL padrão de 1 hora', () => {
  const now = relogio();
  const c = createCache({ now });
  c.set('k', 1);
  now.avancar(3600_000 - 1);
  assert.equal(c.get('k'), 1);
  now.avancar(2);
  assert.equal(c.get('k'), undefined);
});

test('cache: LRU descarta o menos recentemente usado', () => {
  const c = createCache({ maxEntries: 2, now: relogio() });
  c.set('a', 1);
  c.set('b', 2);
  assert.equal(c.get('a'), 1); // 'a' vira o mais recente
  c.set('c', 3); // descarta 'b'
  assert.equal(c.get('b'), undefined);
  assert.equal(c.get('a'), 1);
  assert.equal(c.get('c'), 3);
  assert.equal(c.size(), 2);
});

test('cache: set regrava e renova o TTL', () => {
  const now = relogio();
  const c = createCache({ ttlMs: 1000, now });
  c.set('k', 1);
  now.avancar(900);
  c.set('k', 2);
  now.avancar(900);
  assert.equal(c.get('k'), 2);
});
