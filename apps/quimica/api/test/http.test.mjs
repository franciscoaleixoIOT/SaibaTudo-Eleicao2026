// Utilitários HTTP: CORS, corpo com limite e adaptador Node; e o comportamento "desligado por padrão" das funções reais. Sem rede.
import test from 'node:test';
import assert from 'node:assert/strict';
import { avaliarCors, clientIp, compilarOrigem, json, origemPermitida, readJsonBody, toNodeHandler } from '../_lib/http.js';
import { handle as handleNlu } from '../nlu.js';
import { handle as handleAsk } from '../ask.js';
import { fakeNodeReq, fakeNodeRes, mkRequest } from './_helpers.mjs';

test('origemPermitida: igualdade exata e curinga só dentro de um trecho de hostname', () => {
  const lista = ['https://saibatudo.net', 'https://saibatudo-quimica-*.vercel.app'];
  assert.equal(origemPermitida('https://saibatudo.net', lista), true);
  assert.equal(origemPermitida('https://SAIBATUDO.net', lista), true);
  assert.equal(origemPermitida('https://saibatudo-quimica-git-main-x.vercel.app', lista), true);
  for (const ruim of ['https://saibatudo.net.evil.com', 'http://saibatudo.net', 'https://saibatudo-quimica-x.evil.com', 'https://evil.com/.vercel.app', 'null', '', undefined]) {
    assert.equal(origemPermitida(ruim, lista), false, String(ruim));
  }
  assert.ok(compilarOrigem('https://a.b').test('https://a.b'));
});

test('avaliarCors: sem Origin passa sem cabeçalhos CORS; com Origin permitido ecoa; nunca "*"', () => {
  const lista = ['https://saibatudo.net'];
  const sem = avaliarCors(mkRequest({ url: 'https://x/api' }), lista);
  assert.equal(sem.allowed, true);
  assert.equal(sem.headers['Access-Control-Allow-Origin'], undefined);
  const com = avaliarCors(mkRequest({ url: 'https://x/api', headers: { origin: 'https://saibatudo.net' } }), lista);
  assert.equal(com.headers['Access-Control-Allow-Origin'], 'https://saibatudo.net');
  assert.equal(avaliarCors(mkRequest({ url: 'https://x/api', headers: { origin: 'https://evil.com' } }), lista).allowed, false);
});

test('clientIp usa os cabeçalhos da borda da Vercel', () => {
  assert.equal(clientIp(mkRequest({ url: 'https://x', headers: { 'x-vercel-forwarded-for': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' } })), '1.2.3.4');
  assert.equal(clientIp(mkRequest({ url: 'https://x', headers: { 'x-forwarded-for': '5.6.7.8, 10.0.0.1' } })), '5.6.7.8');
  assert.equal(clientIp(mkRequest({ url: 'https://x' })), 'desconhecido');
});

test('readJsonBody: limite de bytes configurável, tipo e JSON', async () => {
  const req = (body, extra = {}) => mkRequest({ url: 'https://x', body, headers: { 'content-type': 'application/json', ...extra } });
  assert.equal((await readJsonBody(req('{"a":1}'))).ok, true);
  assert.equal((await readJsonBody(req(JSON.stringify({ a: 'x'.repeat(5000) })))).status, 413);
  assert.equal((await readJsonBody(req(JSON.stringify({ a: 'x'.repeat(5000) })), 20_000)).ok, true);
  assert.equal((await readJsonBody(req('{'))).status, 400);
  assert.equal((await readJsonBody(mkRequest({ url: 'https://x', body: '{}', headers: { 'content-type': 'text/plain' } }))).status, 415);
});

test('json(): cabeçalhos de segurança e corpo nulo', () => {
  const r = json(204, null);
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.match(r.headers.get('content-security-policy'), /default-src 'none'/);
});

test('toNodeHandler: converte req/res e nunca vaza o erro interno', async () => {
  const ok = toNodeHandler(async (request) => json(200, { visto: await request.text() }));
  const res = fakeNodeRes();
  await ok(fakeNodeReq({ body: 'olá', headers: { 'content-type': 'text/plain' } }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { visto: 'olá' });

  const quebra = toNodeHandler(async () => { throw new Error('pergunta secreta do usuário'); });
  const res2 = fakeNodeRes();
  await quebra(fakeNodeReq({ body: '{}' }), res2);
  assert.equal(res2.statusCode, 500);
  assert.ok(!res2.body.includes('secreta'));
});

test('os módulos das funções exportam handler padrão e a duração máxima', async () => {
  for (const modulo of ['../nlu.js', '../ask.js', '../health.js']) {
    const m = await import(modulo);
    assert.equal(typeof m.default, 'function', modulo);
    assert.ok(m.config.maxDuration > 0);
  }
});

test('sem variáveis de ambiente, as funções reais respondem 503 disabled (desligado por padrão)', async () => {
  const guardado = { ...process.env };
  for (const k of Object.keys(process.env)) if (/^(MODAL_|HF_|ASK_|MODEL_VERSION|UPSTASH_|KV_REST)/.test(k)) delete process.env[k];
  try {
    for (const [handle, url, extra] of [[handleNlu, 'https://saibatudo.net/quimica/api/nlu', {}], [handleAsk, 'https://saibatudo.net/quimica/api/ask', { trechos: [] }]]) {
      const res = await handle(mkRequest({ url, json: { q: 'massa molar da água', v: 1, client: 'web', iid: '3f2b8c1e-6a4d-4c3b-9e1f-0a1b2c3d4e5f', ...extra } }));
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { ok: false, error: 'disabled' });
    }
  } finally {
    Object.assign(process.env, guardado);
  }
});
