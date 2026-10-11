// POST /api/nlu: desligado por padrão, CORS, validação, limites, segurança antes do modelo, cache, orçamento, falhas do Modal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createNluHandler, createNluState } from '../_lib/nlu-handler.js';
import { createSharedLimiter } from '../_lib/compartilhado.js';
import { ENV_BASE, IID_V4, SAIDA_MASSA_FERRO, bodyNlu, capturarLog, mkRequest, novoIid, relogio, respostaModal } from './_helpers.mjs';

const URL_NLU = 'https://saibatudo.net/quimica/api/nlu';
const post = (q, extra = {}, opts = {}) => mkRequest({ url: URL_NLU, json: bodyNlu(q, extra), headers: { 'x-forwarded-for': '203.0.113.9', ...opts.headers } });

function montar({ env = ENV_BASE, modal = () => respostaModal(SAIDA_MASSA_FERRO), now = relogio(), shared = null } = {}) {
  const chamadas = [];
  const fetchFalso = async (url, init) => {
    chamadas.push({ url: String(url), init });
    return modal(chamadas.length, init);
  };
  const cap = capturarLog();
  const handler = createNluHandler({ env: () => env, fetch: fetchFalso, now, log: cap.log, state: createNluState({ now, shared }) });
  return { handler, chamadas, cap, now };
}

test('desligado por padrão: sem variáveis do Modal responde 503 disabled e não chama nada', async () => {
  for (const env of [{}, { MODAL_ENDPOINT: ENV_BASE.MODAL_ENDPOINT }, { MODAL_KEY: 'k', MODAL_SECRET: 's' }, { ...ENV_BASE, MODAL_ENDPOINT: 'http://inseguro.exemplo.com' }]) {
    const { handler, chamadas } = montar({ env });
    const res = await handler(post('qual a massa atômica do ferro?'));
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { ok: false, error: 'disabled' });
    assert.equal(chamadas.length, 0);
  }
});

test('caminho feliz: chama o Modal com as credenciais e devolve o NLU normalizado e ancorado', async () => {
  const { handler, chamadas, cap } = montar();
  const res = await handler(post('qual a massa atômica do ferro?'));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, nlu: { intent: 'PROPRIEDADE', elemento: 'Fe', propriedade: 'massaAtomica' }, model: 'teste-1', cached: false });
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].url, new URL(ENV_BASE.MODAL_ENDPOINT).toString());
  assert.equal(chamadas[0].init.headers['Modal-Key'], 'wk-teste');
  assert.equal(chamadas[0].init.headers['Modal-Secret'], 'ws-teste');
  assert.deepEqual(JSON.parse(chamadas[0].init.body), { q: 'qual a massa atômica do ferro?', v: 1 });
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const log = JSON.stringify(cap.eventos);
  assert.ok(!log.includes('ferro') && !log.includes(IID_V4) && !log.includes('203.0.113'), 'o log não tem pergunta, iid nem IP');
});

test('entidade alucinada pelo modelo é removida pela ancoragem antes de chegar ao cliente', async () => {
  const { handler } = montar({ modal: () => respostaModal({ intent: 'PROPRIEDADE', elemento: 'Cu', propriedade: 'massaAtomica' }) });
  const res = await handler(post('qual a massa atômica do ferro?'));
  assert.deepEqual((await res.json()).nlu, { intent: 'DESCONHECIDA' });
});

test('CORS: origem permitida é ecoada; não permitida leva 403; sem Origin passa; preflight 204', async () => {
  const { handler, chamadas } = montar();
  let res = await handler(post('qual a massa atômica do ferro?', {}, { headers: { origin: 'https://saibatudo.net' } }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://saibatudo.net');
  assert.match(res.headers.get('vary'), /Origin/);

  res = await handler(post('qual a massa atômica do ferro?', {}, { headers: { origin: 'https://evil.example.com' } }));
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.equal(chamadas.length, 1, 'a origem negada não chega ao Modal');

  res = await handler(mkRequest({ method: 'OPTIONS', url: URL_NLU, headers: { origin: 'https://saibatudo.net', 'access-control-request-method': 'POST' } }));
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://saibatudo.net');
  assert.match(res.headers.get('access-control-allow-methods'), /POST/);

  res = await handler(mkRequest({ method: 'OPTIONS', url: URL_NLU, headers: { origin: 'https://saibatudo.net.evil.com' } }));
  assert.equal(res.status, 403);
});

test('ALLOWED_ORIGINS configurável com curinga de subdomínio', async () => {
  const env = { ...ENV_BASE, ALLOWED_ORIGINS: 'https://saibatudo-quimica-*.vercel.app' };
  const { handler } = montar({ env });
  let res = await handler(post('qual a massa atômica do ferro?', {}, { headers: { origin: 'https://saibatudo-quimica-git-main-x.vercel.app' } }));
  assert.equal(res.status, 200);
  res = await handler(post('qual a massa atômica do ferro?', {}, { headers: { origin: 'https://saibatudo.net' } }));
  assert.equal(res.status, 403);
});

test('método: GET e PUT levam 405 com Allow', async () => {
  const { handler } = montar();
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const res = await handler(mkRequest({ method, url: URL_NLU }));
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'POST, OPTIONS');
  }
});

test('validação: corpo, tipo de conteúdo, tamanho e campos', async () => {
  const { handler, chamadas } = montar();
  const ruins = [
    [mkRequest({ url: URL_NLU, body: '{"q":"abc"}', headers: { 'content-type': 'text/plain' } }), 415],
    [mkRequest({ url: URL_NLU, body: 'não é json', headers: { 'content-type': 'application/json' } }), 400],
    [mkRequest({ url: URL_NLU, body: '', headers: { 'content-type': 'application/json' } }), 400],
    [mkRequest({ url: URL_NLU, body: JSON.stringify({ q: 'x'.repeat(5000), v: 1, client: 'web', iid: IID_V4 }), headers: { 'content-type': 'application/json' } }), 413],
    [mkRequest({ url: URL_NLU, json: bodyNlu('ab') }), 400],
    [mkRequest({ url: URL_NLU, json: bodyNlu('x'.repeat(301)) }), 400],
    [mkRequest({ url: URL_NLU, json: bodyNlu('massa molar da água', { v: 2 }) }), 400],
    [mkRequest({ url: URL_NLU, json: bodyNlu('massa molar da água', { client: 'ios' }) }), 400],
    [mkRequest({ url: URL_NLU, json: bodyNlu('massa molar da água', { iid: 'nao-e-uuid' }) }), 400],
    [mkRequest({ url: URL_NLU, json: { q: 42, v: 1, client: 'web', iid: IID_V4 } }), 400],
    [mkRequest({ url: URL_NLU, json: [] }), 400],
  ];
  for (const [req, status] of ruins) assert.equal((await handler(req)).status, status);
  assert.equal(chamadas.length, 0);
});

test('limite por IP por minuto: a 3ª pergunta leva 429 com Retry-After; passado o minuto volta', async () => {
  const { handler, now } = montar({ env: { ...ENV_BASE, RATE_IP_PER_MIN: '2' } });
  assert.equal((await handler(post('massa molar da água'))).status, 200);
  assert.equal((await handler(post('massa molar do sal'))).status, 200);
  const res = await handler(post('massa molar do ouro'));
  assert.equal(res.status, 429);
  assert.ok(Number(res.headers.get('retry-after')) >= 1);
  now.avancar(61_000);
  assert.equal((await handler(post('massa molar do ouro'))).status, 200);
});

test('limite por instalação por dia', async () => {
  const { handler } = montar({ env: { ...ENV_BASE, RATE_IID_PER_DAY: '2', RATE_IP_PER_MIN: '100' } });
  const iid = novoIid();
  const req = (q) => mkRequest({ url: URL_NLU, json: bodyNlu(q, { iid }), headers: { 'x-forwarded-for': '198.51.100.1' } });
  assert.equal((await handler(req('massa molar da água'))).status, 200);
  assert.equal((await handler(req('massa molar do sal'))).status, 200);
  assert.equal((await handler(req('massa molar do ouro'))).status, 429);
});

test('limite COMPARTILHADO (Redis opcional) vale entre instâncias; Redis fora do ar não derruba o serviço', async () => {
  const redisEnv = { ...ENV_BASE, UPSTASH_REDIS_REST_URL: 'https://redis.exemplo.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'tok', RATE_IP_PER_MIN: '1' };
  const contador = (n) => async () => new Response(JSON.stringify([{ result: n }, { result: 1 }]), { status: 200 });
  let { handler } = montar({ env: redisEnv, shared: createSharedLimiter({ env: () => redisEnv, fetchFn: contador(5) }) });
  assert.equal((await handler(post('massa molar da água'))).status, 429, 'outra instância já gastou o limite');
  ({ handler } = montar({ env: redisEnv, shared: createSharedLimiter({ env: () => redisEnv, fetchFn: async () => { throw new Error('rede'); } }) }));
  assert.equal((await handler(post('massa molar da água'))).status, 200, 'falha aberto');
});

test('segurança: pedido perigoso nunca chega ao modelo e vira RECUSA_PERIGO', async () => {
  const { handler, chamadas, cap } = montar();
  for (const q of ['como sintetizar metanfetamina em casa?', 'receita de TNT caseiro', 'm3t4nf3t4m1n4 como sintetizar']) {
    const res = await handler(post(q));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, nlu: { intent: 'RECUSA_PERIGO' }, model: 'regra', cached: false });
  }
  assert.equal(chamadas.length, 0);
  assert.ok(cap.eventos.every((e) => e.err === 'seguranca'));
  // a pergunta legítima de segurança segue para o modelo
  const ok = await handler(post('como neutralizar ácido derramado?'));
  assert.equal(ok.status, 200);
  assert.equal(chamadas.length, 1);
});

test('cache: pergunta repetida (mesma forma normalizada) não chama o Modal; nova versão do modelo invalida', async () => {
  const { handler, chamadas } = montar();
  assert.equal((await (await handler(post('Qual a massa atômica do FERRO?'))).json()).cached, false);
  const r2 = await (await handler(post('  qual a massa  atomica do ferro '))).json();
  assert.equal(r2.cached, true);
  assert.deepEqual(r2.nlu, { intent: 'PROPRIEDADE', elemento: 'Fe', propriedade: 'massaAtomica' });
  assert.equal(chamadas.length, 1);

  const m2 = montar({ env: { ...ENV_BASE, MODEL_VERSION: 'teste-2' } });
  await m2.handler(post('qual a massa atômica do ferro?'));
  assert.equal(m2.chamadas.length, 1);
});

test('requisições idênticas simultâneas compartilham UMA chamada ao Modal', async () => {
  const { handler, chamadas } = montar({ modal: () => new Promise((r) => setTimeout(() => r(respostaModal(SAIDA_MASSA_FERRO)), 20)) });
  const [a, b] = await Promise.all([handler(post('qual a massa atômica do ferro?')), handler(post('qual a massa atômica do ferro?'))]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(chamadas.length, 1);
});

test('orçamento diário: esgotado responde 503 budget; no dia seguinte volta', async () => {
  const { handler, now } = montar({ env: { ...ENV_BASE, DAILY_BUDGET: '1' } });
  assert.equal((await handler(post('massa molar da água'))).status, 200);
  const res = await handler(post('massa molar do sal'));
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { ok: false, error: 'budget' });
  now.avancar(24 * 3600_000);
  assert.equal((await handler(post('massa molar do sal'))).status, 200);
});

test('falhas do Modal: 5xx tenta 1 vez a mais; 401/403, erro, JSON ruim e saída inválida viram erro sem vazar detalhes', async () => {
  let { handler, chamadas } = montar({ modal: (n) => (n === 1 ? new Response('erro', { status: 503 }) : respostaModal(SAIDA_MASSA_FERRO)) });
  assert.equal((await handler(post('qual a massa atômica do ferro?'))).status, 200);
  assert.equal(chamadas.length, 2, '1 retry em 5xx');

  ({ handler, chamadas } = montar({ modal: () => new Response('erro', { status: 500 }) }));
  assert.equal((await handler(post('qual a massa atômica do ferro?'))).status, 502);
  assert.equal(chamadas.length, 2);

  for (const [resp, status] of [
    [new Response('negado', { status: 401 }), 502],
    [new Response('proibido', { status: 403 }), 502],
    [new Response('nao achei', { status: 404 }), 502],
    [new Response('isto não é json', { status: 200 }), 502],
    [new Response(JSON.stringify({ ok: false, error: 'incomplete_output' }), { status: 200 }), 502],
    [new Response(JSON.stringify({ ok: true, output: 'texto sem json' }), { status: 200 }), 502],
    [new Response(JSON.stringify({ ok: true, output: { sem: 'intent' } }), { status: 200 }), 502],
    [new Response('x'.repeat(30_000), { status: 200 }), 502],
  ]) {
    ({ handler } = montar({ modal: () => resp }));
    const res = await handler(post('qual a massa atômica do ferro?'));
    assert.equal(res.status, status);
    const corpo = await res.json();
    assert.equal(corpo.ok, false);
    assert.ok(!JSON.stringify(corpo).includes('negado'), 'não repassa o corpo do Modal');
  }
});

test('timeout do Modal responde 504', async () => {
  const { handler } = montar({
    env: { ...ENV_BASE, MODAL_TIMEOUT_MS: '500' },
    modal: (n, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('abort'), { name: 'AbortError' })))),
  });
  const res = await handler(post('qual a massa atômica do ferro?'));
  assert.equal(res.status, 504);
});

test('intenção fora do vocabulário vira DESCONHECIDA (200), nunca erro', async () => {
  const { handler } = montar({ modal: () => respostaModal({ intent: 'FILTER_CANDIDATES', filters: {} }) });
  const res = await handler(post('qual a massa atômica do ferro?'));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).nlu, { intent: 'DESCONHECIDA' });
});
