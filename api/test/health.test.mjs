import test from 'node:test';
import assert from 'node:assert/strict';
import { handleHealth } from '../health.js';
import { readConfig } from '../_lib/config.js';
import { ENV_BASE, mkRequest } from './_helpers.mjs';

const get = () => mkRequest({ method: 'GET', url: 'https://saibatudo.net/api/health' });

test('GET /api/health devolve {ok,version,time} sem segredos', async () => {
  const env = { ...ENV_BASE, GITHUB_TOKEN: 'ghp_segredo', VERCEL_GIT_COMMIT_SHA: 'abcdef1234567890' };
  const r = handleHealth(get(), env);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.version, 'abcdef1');
  assert.equal(j.model, 'teste-1');
  assert.equal(j.nlu, 'on');
  assert.equal(j.report, 'on');
  assert.ok(!Number.isNaN(Date.parse(j.time)));
  const txt = JSON.stringify(j);
  for (const segredo of ['wk-teste', 'ws-teste', 'ghp_segredo', 'modal.run']) assert.ok(!txt.includes(segredo), segredo);
});

test('health reflete o kill switch (nlu: off)', async () => {
  const j = await handleHealth(get(), { MODAL_ENDPOINT: '' }).json();
  assert.equal(j.nlu, 'off');
  assert.equal(j.report, 'off');
  assert.equal(j.version, 'dev');
});

test('health só aceita GET/HEAD', () => {
  assert.equal(handleHealth(mkRequest({ method: 'POST', json: {} }), {}).status, 405);
});

test('readConfig: valores padrão e limites', () => {
  const c = readConfig({});
  assert.equal(c.dailyBudget, 300);
  assert.equal(c.rateIpPerMin, 20);
  assert.equal(c.rateIidPerDay, 60);
  assert.equal(c.timeoutMs, 12000);
  assert.equal(c.reportPerHour, 5);
  assert.equal(c.modalEndpoint, '');
  assert.equal(c.mock, false);
  assert.equal(readConfig({ DAILY_BUDGET: 'abc' }).dailyBudget, 300);
  assert.equal(readConfig({ MODAL_TIMEOUT_MS: '999999' }).timeoutMs, 25000);
  assert.equal(readConfig({ MODAL_TIMEOUT_MS: '1' }).timeoutMs, 500);
  assert.equal(readConfig({ DAILY_BUDGET: '-5' }).dailyBudget, 0);
});
