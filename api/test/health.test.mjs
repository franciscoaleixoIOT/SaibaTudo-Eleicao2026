import test from 'node:test';
import assert from 'node:assert/strict';
import { handleHealth, lerDadosPublicados } from '../health.js';
import { readConfig } from '../_lib/config.js';
import { ENV_BASE, mkRequest } from './_helpers.mjs';

const get = (url = 'https://saibatudo.net/api/health') => mkRequest({ method: 'GET', url });
const SEM_REDE = { semDados: true };

test('GET /api/health devolve {ok,version,time} sem segredos', async () => {
  const env = { ...ENV_BASE, GITHUB_TOKEN: 'ghp_segredo', VERCEL_GIT_COMMIT_SHA: 'abcdef1234567890' };
  const r = await handleHealth(get(), env, SEM_REDE);
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
  const j = await (await handleHealth(get(), { MODAL_ENDPOINT: '' }, SEM_REDE)).json();
  assert.equal(j.nlu, 'off');
  assert.equal(j.report, 'off');
  assert.equal(j.version, 'dev');
});

test('health: ask fica off por padrão e só liga com ASK_ENABLED=1 + MODAL_ASK_ENDPOINT explícito', async () => {
  const askUrl = 'https://exemplo--saibatudo-qwen7b-ask.modal.run';
  const ask = async (env) => (await (await handleHealth(get(), env, SEM_REDE)).json()).ask;
  assert.equal(await ask({ ...ENV_BASE }), 'off');
  assert.equal(await ask({ ...ENV_BASE, MODAL_ASK_ENDPOINT: askUrl }), 'off');
  assert.equal(await ask({ ...ENV_BASE, ASK_ENABLED: '1' }), 'off', 'sem endpoint explícito não há fallback');
  assert.equal(await ask({ ...ENV_BASE, ASK_ENABLED: '1', MODAL_ASK_ENDPOINT: askUrl }), 'on');
});

test('health: shared só fica on com Redis configurado (https + token)', async () => {
  const shared = async (env) => (await (await handleHealth(get(), env, SEM_REDE)).json()).shared;
  assert.equal(await shared({ ...ENV_BASE }), 'off');
  assert.equal(await shared({ ...ENV_BASE, UPSTASH_REDIS_REST_URL: 'https://x.upstash.io' }), 'off');
  assert.equal(await shared({ ...ENV_BASE, UPSTASH_REDIS_REST_URL: 'https://x.upstash.io', UPSTASH_REDIS_REST_TOKEN: 't' }), 'on');
  assert.equal(await shared({ ...ENV_BASE, KV_REST_API_URL: 'https://x.upstash.io', KV_REST_API_TOKEN: 't' }), 'on');
});

test('health só aceita GET/HEAD', async () => {
  assert.equal((await handleHealth(mkRequest({ method: 'POST', json: {} }), {}, SEM_REDE)).status, 405);
});

// ------------------------------------------------------------------------------------- dados publicados (frescor)
const MANIFESTO = {
  dataVersion: '20261006T022620Z-c0cf1ab2978c',
  generatedAt: '2026-10-06T02:26:20Z',
  extracaoTse: '05/10/2026 10:14:11',
  faseEleitoral: 'ENTRE_TURNOS',
  resultadosDisponiveis: true,
  cliente: { ask: { enabled: false } },
};
const AGORA = Date.parse('2026-10-06T04:26:20Z'); // 2 h depois
const fetchOk = (corpo = MANIFESTO, status = 200) => async () => new Response(JSON.stringify(corpo), { status });

test('health expõe a idade do pacote de dados publicado', async () => {
  const chamadas = [];
  const fetchFn = async (url, init) => { chamadas.push(String(url)); return fetchOk()(url, init); };
  const j = await (await handleHealth(get(), ENV_BASE, { fetchFn, now: () => AGORA })).json();
  assert.deepEqual(j.data, {
    version: '20261006T022620Z-c0cf1ab2978c',
    generatedAt: '2026-10-06T02:26:20Z',
    packageAgeMinutes: 120,
    extracaoTse: '05/10/2026 10:14:11',
    fase: 'ENTRE_TURNOS',
    resultados: true,
    ask: false,
  });
  assert.deepEqual(chamadas, ['https://saibatudo.net/data/eleicoes2026/manifest.json'], 'só consulta o próprio site');
});

test('health: manifesto inacessível ou inválido vira data:null e nunca derruba o health', async () => {
  const cfg = readConfig(ENV_BASE);
  const req = get();
  assert.equal(await lerDadosPublicados(req, cfg, { fetchFn: async () => { throw new Error('rede'); } }), null);
  assert.equal(await lerDadosPublicados(req, cfg, { fetchFn: fetchOk({}, 503) }), null);
  assert.equal(await lerDadosPublicados(req, cfg, { fetchFn: async () => new Response('não é json', { status: 200 }) }), null);
  const j = await (await handleHealth(req, ENV_BASE, { fetchFn: async () => { throw new Error('rede'); } })).json();
  assert.equal(j.ok, true);
  assert.equal(j.data, null);
});

test('health: timeout de 2 s no manifesto', async () => {
  const cfg = readConfig(ENV_BASE);
  const lento = (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('abortado'))));
  const t0 = Date.now();
  assert.equal(await lerDadosPublicados(get(), cfg, { fetchFn: lento }), null);
  assert.ok(Date.now() - t0 < 4000);
});

test('health: nunca consulta um host fora das origens permitidas (sem SSRF por cabeçalho Host)', async () => {
  const cfg = readConfig(ENV_BASE);
  let chamou = false;
  const fetchFn = async () => { chamou = true; return fetchOk()(); };
  assert.equal(await lerDadosPublicados(get('https://evil.example.com/api/health'), cfg, { fetchFn }), null);
  assert.equal(await lerDadosPublicados(get('http://169.254.169.254/api/health'), cfg, { fetchFn }), null);
  assert.equal(chamou, false);
  assert.notEqual(await lerDadosPublicados(get('https://www.saibatudo.net/api/health'), cfg, { fetchFn }), null);
  assert.equal(chamou, true);
});

test('health: campos do manifesto com tipo inesperado são descartados, não repassados', async () => {
  const cfg = readConfig(ENV_BASE);
  const d = await lerDadosPublicados(get(), cfg, {
    fetchFn: fetchOk({ dataVersion: { x: 1 }, generatedAt: 'ontem', extracaoTse: 5, faseEleitoral: null, resultadosDisponiveis: 'sim' }),
  });
  assert.deepEqual(d, { version: null, generatedAt: 'ontem', packageAgeMinutes: null, extracaoTse: null, fase: null, resultados: false, ask: false });
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
