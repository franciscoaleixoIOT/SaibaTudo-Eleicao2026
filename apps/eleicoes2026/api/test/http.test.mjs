import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SECURITY_HEADERS, avaliarCors, clientIp, compilarOrigem, json, origemPermitida, readJsonBody, toNodeHandler,
} from '../_lib/http.js';
import { parseOrigins } from '../_lib/config.js';
import { fakeNodeReq, fakeNodeRes, mkRequest } from './_helpers.mjs';

const PADRAO = parseOrigins(undefined);

// ------------------------------------------------------------------ CORS

test('origens padrão: saibatudo.net e www', () => {
  assert.deepEqual(PADRAO, ['https://saibatudo.net', 'https://www.saibatudo.net']);
  assert.equal(origemPermitida('https://saibatudo.net', PADRAO), true);
  assert.equal(origemPermitida('https://www.saibatudo.net', PADRAO), true);
  assert.equal(origemPermitida('https://SaibaTudo.net', PADRAO), true, 'host é case-insensitive');
});

test('origens não permitidas: outros domínios, subdomínios disfarçados, http, porta, null', () => {
  for (const o of [
    'https://evil.com', 'https://saibatudo.net.evil.com', 'https://evilsaibatudo.net', 'http://saibatudo.net',
    'https://saibatudo.net:8443', 'https://app.saibatudo.net', 'null', '', 'https://saibatudo.net/', 'file://',
  ]) {
    assert.equal(origemPermitida(o, PADRAO), false, o);
  }
});

test('curinga de previews *.vercel.app do projeto casa só um trecho de hostname', () => {
  const lista = [...PADRAO, 'https://saibatudo-*.vercel.app'];
  assert.equal(origemPermitida('https://saibatudo-git-main-fulano.vercel.app', lista), true);
  assert.equal(origemPermitida('https://saibatudo-abc123.vercel.app', lista), true);
  assert.equal(origemPermitida('https://outro-projeto.vercel.app', lista), false);
  assert.equal(origemPermitida('https://saibatudo-x.evil.com', lista), false);
  assert.equal(origemPermitida('https://saibatudo-x.vercel.app.evil.com', lista), false);
  assert.equal(origemPermitida('https://saibatudo-a.b.vercel.app', lista), false, '"*" não atravessa pontos');
  assert.ok(compilarOrigem('https://x-*.vercel.app/').test('https://x-1.vercel.app'));
});

test('ALLOWED_ORIGINS: lista separada por vírgula substitui o padrão', () => {
  const l = parseOrigins(' https://a.example , https://b.example ,,');
  assert.deepEqual(l, ['https://a.example', 'https://b.example']);
  assert.equal(origemPermitida('https://saibatudo.net', l), false);
});

test('avaliarCors: sem Origin (app Android) é permitido, sem cabeçalhos CORS', () => {
  const r = avaliarCors(mkRequest({ json: {} }), PADRAO);
  assert.equal(r.allowed, true);
  assert.equal(r.headers['Access-Control-Allow-Origin'], undefined);
});

test('avaliarCors: origem permitida ecoa a origem (nunca "*") com Vary', () => {
  const r = avaliarCors(mkRequest({ headers: { origin: 'https://saibatudo.net' }, json: {} }), PADRAO);
  assert.equal(r.allowed, true);
  assert.equal(r.headers['Access-Control-Allow-Origin'], 'https://saibatudo.net');
  assert.equal(r.headers.Vary, 'Origin');
  assert.match(r.headers['Access-Control-Allow-Methods'], /POST/);
  assert.equal(r.headers['Access-Control-Allow-Headers'], 'Content-Type');
});

test('avaliarCors: origem não permitida é negada, sem Allow-Origin', () => {
  const r = avaliarCors(mkRequest({ headers: { origin: 'https://evil.com' }, json: {} }), PADRAO);
  assert.equal(r.allowed, false);
  assert.equal(r.headers['Access-Control-Allow-Origin'], undefined);
});

// ------------------------------------------------------------------ respostas e cliente

test('json(): cabeçalhos de segurança em toda resposta', async () => {
  const r = json(200, { ok: true });
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) assert.equal(r.headers.get(k), v, k);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.match(r.headers.get('content-security-policy'), /default-src 'none'/);
  assert.deepEqual(await r.json(), { ok: true });
});

test('clientIp: x-vercel-forwarded-for > x-real-ip > primeiro de x-forwarded-for', () => {
  const h = (headers) => clientIp(new Request('https://x/', { headers }));
  assert.equal(h({ 'x-vercel-forwarded-for': '1.1.1.1', 'x-real-ip': '2.2.2.2' }), '1.1.1.1');
  assert.equal(h({ 'x-real-ip': '2.2.2.2', 'x-forwarded-for': '3.3.3.3' }), '2.2.2.2');
  assert.equal(h({ 'x-forwarded-for': '3.3.3.3, 4.4.4.4' }), '3.3.3.3');
  assert.equal(h({}), 'desconhecido');
});

// ------------------------------------------------------------------ corpo

test('readJsonBody: 415 sem application/json', async () => {
  for (const ct of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data']) {
    const r = await readJsonBody(mkRequest({ headers: { 'content-type': ct }, body: '{"a":1}' }));
    assert.deepEqual([r.ok, r.status], [false, 415], ct);
  }
  const semCt = await readJsonBody(new Request('https://x/', { method: 'POST', body: '{"a":1}', headers: { 'content-type': '' } }));
  assert.equal(semCt.status, 415);
});

test('readJsonBody: aceita application/json com charset', async () => {
  const r = await readJsonBody(mkRequest({ headers: { 'content-type': 'application/json; charset=utf-8' }, body: '{"a":1}' }));
  assert.deepEqual(r, { ok: true, value: { a: 1 } });
});

test('readJsonBody: 413 por Content-Length declarado e por tamanho real', async () => {
  const grande = JSON.stringify({ q: 'x'.repeat(5000) });
  const real = await readJsonBody(mkRequest({ headers: { 'content-type': 'application/json' }, body: grande }));
  assert.deepEqual([real.ok, real.status], [false, 413]);
  const declarado = await readJsonBody(
    mkRequest({ headers: { 'content-type': 'application/json', 'content-length': '99999' }, body: '{"a":1}' })
  );
  assert.equal(declarado.status, 413);
});

test('readJsonBody: 400 para JSON inválido, corpo vazio e UTF-8 inválido', async () => {
  const mk = (body) => mkRequest({ headers: { 'content-type': 'application/json' }, body });
  assert.equal((await readJsonBody(mk('{quebrado'))).status, 400);
  assert.equal((await readJsonBody(mk(''))).status, 400);
  assert.equal((await readJsonBody(mk(new Uint8Array([0x7b, 0x22, 0xff, 0x22, 0x7d])))).status, 400);
});

// ------------------------------------------------------------------ adaptador Node

test('toNodeHandler: converte req/res do Node e repassa método, URL, headers e corpo', async () => {
  let visto;
  const h = toNodeHandler(async (request) => {
    visto = { method: request.method, url: request.url, ct: request.headers.get('content-type'), corpo: await request.text() };
    return json(201, { ok: true });
  });
  const res = fakeNodeRes();
  await h(fakeNodeReq({ url: '/api/x?y=1', headers: { 'content-type': 'application/json' }, body: '{"a":1}' }), res);
  assert.deepEqual(visto, { method: 'POST', url: 'https://saibatudo.net/api/x?y=1', ct: 'application/json', corpo: '{"a":1}' });
  assert.equal(res.statusCode, 201);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.deepEqual(JSON.parse(res.body), { ok: true });
});

test('toNodeHandler: não bufferiza além do limite (entrega limite+1 bytes para o handler detectar 413)', async () => {
  let tamanho = -1;
  const h = toNodeHandler(
    async (request) => {
      tamanho = (await request.arrayBuffer()).byteLength;
      return json(200, {});
    },
    { maxBodyBytes: 100 }
  );
  await h(fakeNodeReq({ body: 'x'.repeat(10_000) }), fakeNodeRes());
  assert.equal(tamanho, 101);
});

test('toNodeHandler: erro interno vira 500 genérico, sem vazar a mensagem', async () => {
  const h = toNodeHandler(async () => {
    throw new Error('segredo: pergunta do usuário');
  });
  const res = fakeNodeRes();
  await h(fakeNodeReq({ body: '{}' }), res);
  assert.equal(res.statusCode, 500);
  assert.ok(!res.body.includes('segredo'));
  assert.deepEqual(JSON.parse(res.body), { ok: false, error: 'internal' });
});

test('toNodeHandler: GET não lê corpo e HEAD não devolve corpo', async () => {
  const h = toNodeHandler(async () => json(200, { ok: true }));
  const res = fakeNodeRes();
  await h(fakeNodeReq({ method: 'HEAD' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, '');
});

test('toNodeHandler: ignora pseudo-cabeçalhos HTTP/2 e junta cabeçalhos repetidos', async () => {
  let visto;
  const h = toNodeHandler(async (request) => {
    visto = { ua: request.headers.get('x-teste'), pseudo: request.headers.get('host') };
    return json(200, {});
  });
  const res = fakeNodeRes();
  await h(fakeNodeReq({ method: 'GET', headers: { ':authority': 'saibatudo.net', 'x-teste': ['a', 'b'] } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(visto.ua, 'a, b');
});
