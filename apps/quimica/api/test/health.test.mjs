// GET /api/health: sem segredos, sem chamar Modal/Hugging Face; lê o manifesto do pacote de dados (arquivo ou site).
import test from 'node:test';
import assert from 'node:assert/strict';
import handlerNode, { handleHealth, lerDadosPublicados } from '../health.js';
import { ENV_BASE, fakeNodeReq, fakeNodeRes, mkRequest } from './_helpers.mjs';

const MANIFESTO = { version: '2026-10-10T03-00-00Z', generatedAt: '2026-10-07T03:00:00Z', schemaVersion: 1 };
const agora = Date.UTC(2026, 9, 10, 15, 0, 0);
const get = (url = 'https://saibatudo.net/quimica/api/health', method = 'GET') => mkRequest({ method, url });
const doArquivo = { readFileFn: async () => JSON.stringify(MANIFESTO), now: () => agora };

test('responde ok com a versão do pacote lida do arquivo e a idade em dias', async () => {
  const res = await handleHealth(get(), { ...ENV_BASE, VERCEL_GIT_COMMIT_SHA: 'abcdef1234567' }, doArquivo);
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.ok, true);
  assert.equal(j.version, 'abcdef1');
  assert.equal(j.model, 'teste-1');
  assert.equal(j.nlu, 'on');
  assert.equal(j.ask, 'off');
  assert.equal(j.shared, 'off');
  assert.deepEqual(j.data, { version: MANIFESTO.version, generatedAt: MANIFESTO.generatedAt, packageAgeDays: 3 });
  assert.match(j.time, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('nlu, ask e shared refletem as variáveis; nunca expõe segredos', async () => {
  const env = { ...ENV_BASE, ASK_ENABLED: '1', HF_ASK_SPACE_URL: 'https://x.hf.space', HF_TOKEN: 'hf_segredo', UPSTASH_REDIS_REST_URL: 'https://r.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'tok_redis' };
  const texto = await (await handleHealth(get(), env, doArquivo)).text();
  const j = JSON.parse(texto);
  assert.deepEqual([j.nlu, j.ask, j.shared], ['on', 'on', 'on']);
  for (const segredo of ['hf_segredo', 'tok_redis', 'wk-teste', 'ws-teste']) assert.ok(!texto.includes(segredo), segredo);
  const off = JSON.parse(await (await handleHealth(get(), {}, doArquivo)).text());
  assert.deepEqual([off.nlu, off.ask, off.shared, off.model], ['off', 'off', 'off', 'dev']);
});

test('sem o arquivo, busca o manifesto no próprio site (origem permitida) e nunca em outro host', async () => {
  const buscados = [];
  const fetchFn = async (url) => {
    buscados.push(String(url));
    return new Response(JSON.stringify(MANIFESTO), { status: 200 });
  };
  const semArquivo = { readFileFn: async () => { throw new Error('ENOENT'); }, fetchFn, now: () => agora };
  let j = await (await handleHealth(get('https://saibatudo.net/quimica/api/health'), ENV_BASE, semArquivo)).json();
  assert.equal(j.data.packageAgeDays, 3);
  assert.deepEqual(buscados, ['https://saibatudo.net/quimica/data/manifest.json']);

  buscados.length = 0;
  j = await (await handleHealth(get('https://evil.example.com/quimica/api/health'), ENV_BASE, semArquivo)).json();
  assert.equal(j.data, null);
  assert.deepEqual(buscados, [], 'host fora da lista não é consultado');
});

test('data é null (e o health continua 200) se o manifesto falhar', async () => {
  const semArquivo = { readFileFn: async () => { throw new Error('ENOENT'); }, now: () => agora };
  for (const fetchFn of [async () => new Response('x', { status: 500 }), async () => { throw new Error('rede'); }, async () => new Response('não é json', { status: 200 })]) {
    const res = await handleHealth(get(), ENV_BASE, { ...semArquivo, fetchFn });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).data, null);
  }
  const local = await lerDadosPublicados(get('http://localhost:3000/x'), { allowedOrigins: [] }, { ...semArquivo, fetchFn: async () => new Response(JSON.stringify(MANIFESTO)) });
  assert.equal(local.version, MANIFESTO.version, 'localhost vale em desenvolvimento');
});

test('manifesto sem generatedAt válido não quebra', async () => {
  const j = await (await handleHealth(get(), ENV_BASE, { readFileFn: async () => '{"version":"v1"}', now: () => agora })).json();
  assert.deepEqual(j.data, { version: 'v1', generatedAt: null, packageAgeDays: null });
});

test('só GET e HEAD; os demais levam 405', async () => {
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const res = await handleHealth(mkRequest({ method, url: 'https://saibatudo.net/quimica/api/health' }), ENV_BASE, { semDados: true });
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'GET, HEAD');
  }
  assert.equal((await handleHealth(get('https://saibatudo.net/quimica/api/health', 'HEAD'), ENV_BASE, { semDados: true })).status, 200);
});

test('adaptador Node (req/res da Vercel) responde JSON com cabeçalhos de segurança', async () => {
  const res = fakeNodeRes();
  await handlerNode(fakeNodeReq({ method: 'GET', url: '/quimica/api/health' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).ok, true);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.match(res.headers['content-type'], /application\/json/);
});
