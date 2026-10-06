import test from 'node:test';
import assert from 'node:assert/strict';
import { createNluHandler, createNluState } from '../_lib/nlu-handler.js';
import {
  ENV_BASE, IID_V4, SAIDA_GOVERNADOR_SP, bodyNlu, capturarLog, fakeNodeReq, fakeNodeRes, mkRequest, novoIid, relogio,
  respostaModal,
} from './_helpers.mjs';

/** Monta um handler isolado (estado próprio) com fetch simulado. */
function montar({ env = {}, fetchImpl, now } = {}) {
  const relo = now ?? relogio();
  const chamadas = [];
  const fetchFalso = async (url, init) => {
    chamadas.push({ url, init, corpo: init?.body ? JSON.parse(init.body) : undefined });
    return fetchImpl ? fetchImpl(url, init, chamadas.length) : respostaModal(SAIDA_GOVERNADOR_SP);
  };
  const cap = capturarLog();
  const handler = createNluHandler({
    env: () => ({ ...ENV_BASE, ...env }),
    fetch: fetchFalso,
    now: relo,
    log: cap.log,
    state: createNluState({ now: relo }),
  });
  return { handler, chamadas, cap, now: relo };
}

const post = (body, headers = {}) => mkRequest({ json: body, headers: { 'x-forwarded-for': '203.0.113.7', ...headers } });

// ------------------------------------------------------------------ caminho feliz

test('POST válido: chama o Modal com Modal-Key/Modal-Secret e devolve o contrato normalizado', async () => {
  const { handler, chamadas } = montar();
  const res = await handler(post(bodyNlu('candidatos a governador em SP')));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    ok: true,
    nlu: { intent: 'LISTAR_CANDIDATOS', cargo: 'GOVERNADOR', uf: 'SP' },
    model: 'teste-1',
    cached: false,
  });
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].url, 'https://exemplo--saibatudo-nlu.modal.run/');
  assert.equal(chamadas[0].init.method, 'POST');
  assert.equal(chamadas[0].init.headers['Modal-Key'], 'wk-teste');
  assert.equal(chamadas[0].init.headers['Modal-Secret'], 'ws-teste');
  assert.deepEqual(chamadas[0].corpo, { q: 'candidatos a governador em SP', v: 1 });
  assert.ok(chamadas[0].init.signal instanceof AbortSignal, 'timeout via AbortController');
});

test('a resposta nunca repassa direct_answer/suggested_questions do modelo', async () => {
  const { handler } = montar();
  const txt = await (await handler(post(bodyNlu('candidatos a governador em SP')))).text();
  assert.ok(!txt.includes('Mostrando candidatos'));
  assert.ok(!txt.includes('suggested'));
});

test('entidade alucinada (ausente na pergunta) é descartada na resposta', async () => {
  const { handler } = montar();
  // o modelo devolve SP, mas a pergunta não cita estado algum
  const res = await handler(post(bodyNlu('candidatos a governador')));
  assert.deepEqual((await res.json()).nlu, { intent: 'LISTAR_CANDIDATOS', cargo: 'GOVERNADOR' });
});

test('model reflete MODEL_VERSION', async () => {
  const { handler } = montar({ env: { MODEL_VERSION: 'v2-2026-10-15' } });
  assert.equal((await (await handler(post(bodyNlu('candidatos a governador em SP')))).json()).model, 'v2-2026-10-15');
});

test('saída do Modal sem o envelope {ok,output} (objeto direto) também é aceita', async () => {
  const { handler } = montar({ fetchImpl: async () => new Response(JSON.stringify(SAIDA_GOVERNADOR_SP), { status: 200 }) });
  const res = await handler(post(bodyNlu('candidatos a governador em SP')));
  assert.equal((await res.json()).nlu.intent, 'LISTAR_CANDIDATOS');
});

// ------------------------------------------------------------------ cache

test('cache: pergunta repetida (outra caixa/acento/espaços) não chama o Modal de novo', async () => {
  const { handler, chamadas } = montar();
  const a = await (await handler(post(bodyNlu('Candidatos a governador em SP?')))).json();
  assert.equal(a.cached, false);
  const b = await (await handler(post(bodyNlu('  candidatos   a GOVERNADOR em sp ')))).json();
  assert.equal(b.cached, true);
  assert.deepEqual(b.nlu, a.nlu);
  assert.equal(chamadas.length, 1);
});

test('cache: expira em 1 hora', async () => {
  const { handler, chamadas, now } = montar();
  await handler(post(bodyNlu('candidatos a governador em SP')));
  now.avancar(3600_000 - 1000);
  assert.equal((await (await handler(post(bodyNlu('candidatos a governador em SP')))).json()).cached, true);
  now.avancar(2000);
  assert.equal((await (await handler(post(bodyNlu('candidatos a governador em SP')))).json()).cached, false);
  assert.equal(chamadas.length, 2);
});

test('cache: chave inclui a versão do modelo (promoção de versão invalida o cache)', async () => {
  const relo = relogio();
  const estado = createNluState({ now: relo });
  const chamadas = [];
  const mk = (versao) =>
    createNluHandler({
      env: () => ({ ...ENV_BASE, MODEL_VERSION: versao }),
      fetch: async (u, i) => {
        chamadas.push(i);
        return respostaModal(SAIDA_GOVERNADOR_SP);
      },
      now: relo,
      log: () => {},
      state: estado,
    });
  await mk('v1')(post(bodyNlu('candidatos a governador em SP')));
  const r = await (await mk('v2')(post(bodyNlu('candidatos a governador em SP')))).json();
  assert.equal(r.cached, false);
  assert.equal(chamadas.length, 2);
});

test('cache: falhas e saídas inválidas NÃO são cacheadas', async () => {
  let n = 0;
  const { handler } = montar({
    fetchImpl: async () => (++n === 1 ? respostaModal('texto sem json') : respostaModal(SAIDA_GOVERNADOR_SP)),
  });
  const r1 = await handler(post(bodyNlu('candidatos a governador em SP')));
  assert.equal(r1.status, 502);
  assert.deepEqual(await r1.json(), { ok: false, error: 'bad_model_output' });
  const r2 = await handler(post(bodyNlu('candidatos a governador em SP')));
  assert.equal(r2.status, 200);
});

test('perguntas idênticas simultâneas compartilham uma única chamada ao Modal', async () => {
  let liberar;
  const portao = new Promise((r) => (liberar = r));
  const { handler, chamadas } = montar({
    fetchImpl: async () => {
      await portao;
      return respostaModal(SAIDA_GOVERNADOR_SP);
    },
  });
  const p = [1, 2, 3].map(() => handler(post(bodyNlu('candidatos a governador em SP'))));
  await new Promise((r) => setTimeout(r, 20));
  liberar();
  const res = await Promise.all(p);
  assert.deepEqual(res.map((r) => r.status), [200, 200, 200]);
  assert.equal(chamadas.length, 1);
});

// ------------------------------------------------------------------ validação de entrada

test('400: JSON inválido, campos inválidos', async () => {
  const { handler, chamadas } = montar();
  const ruim = mkRequest({ headers: { 'content-type': 'application/json' }, body: '{quebrado' });
  assert.equal((await handler(ruim)).status, 400);
  for (const body of [
    bodyNlu('ab'), bodyNlu('x'.repeat(301)), bodyNlu('ok ok', { v: 2 }), bodyNlu('ok ok', { client: 'ios' }),
    bodyNlu('ok ok', { iid: 'nao-e-uuid' }), bodyNlu('ok ok', { iid: undefined }), [], 'texto',
  ]) {
    const r = await handler(post(body));
    assert.equal(r.status, 400, JSON.stringify(body).slice(0, 60));
    assert.equal((await r.json()).ok, false);
  }
  assert.equal(chamadas.length, 0, 'entrada inválida nunca chega ao Modal');
});

test('415: Content-Type diferente de application/json', async () => {
  const { handler } = montar();
  const r = await handler(mkRequest({ headers: { 'content-type': 'text/plain' }, body: JSON.stringify(bodyNlu('ola mundo')) }));
  assert.equal(r.status, 415);
});

test('413: corpo acima do limite', async () => {
  const { handler } = montar();
  const r = await handler(mkRequest({ headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q: 'x'.repeat(6000) }) }));
  assert.equal(r.status, 413);
});

test('405: método diferente de POST/OPTIONS, com cabeçalho Allow', async () => {
  const { handler } = montar();
  const r = await handler(mkRequest({ method: 'GET' }));
  assert.equal(r.status, 405);
  assert.equal(r.headers.get('allow'), 'POST, OPTIONS');
});

// ------------------------------------------------------------------ CORS

test('CORS: preflight de origem permitida -> 204 com cabeçalhos', async () => {
  const { handler } = montar();
  const r = await handler(mkRequest({ method: 'OPTIONS', headers: { origin: 'https://saibatudo.net', 'access-control-request-method': 'POST' } }));
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://saibatudo.net');
  assert.match(r.headers.get('access-control-allow-methods'), /POST/);
});

test('CORS: origem não permitida -> 403 (POST e OPTIONS), sem Allow-Origin e sem chamar o Modal', async () => {
  const { handler, chamadas } = montar();
  for (const method of ['POST', 'OPTIONS']) {
    const r = await handler(mkRequest({ method, json: bodyNlu('candidatos a governador em SP'), headers: { origin: 'https://evil.com' } }));
    assert.equal(r.status, 403, method);
    assert.equal(r.headers.get('access-control-allow-origin'), null);
  }
  assert.equal(chamadas.length, 0);
});

test('CORS: POST de origem permitida recebe Allow-Origin; app Android (sem Origin) funciona', async () => {
  const { handler } = montar();
  const web = await handler(post(bodyNlu('candidatos a governador em SP', { client: 'web' }), { origin: 'https://www.saibatudo.net' }));
  assert.equal(web.status, 200);
  assert.equal(web.headers.get('access-control-allow-origin'), 'https://www.saibatudo.net');
  const android = await handler(post(bodyNlu('candidatos a governador em SP')));
  assert.equal(android.status, 200);
  assert.equal(android.headers.get('access-control-allow-origin'), null);
});

test('CORS: previews do projeto via ALLOWED_ORIGINS', async () => {
  const { handler } = montar({ env: { ALLOWED_ORIGINS: 'https://saibatudo.net,https://saibatudo-*.vercel.app' } });
  const ok = await handler(post(bodyNlu('candidatos a governador em SP'), { origin: 'https://saibatudo-git-dev-x.vercel.app' }));
  assert.equal(ok.status, 200);
  const nao = await handler(post(bodyNlu('candidatos a governador em SP'), { origin: 'https://www.saibatudo.net' }));
  assert.equal(nao.status, 403, 'a lista da variável substitui o padrão');
});

test('toda resposta (inclusive erro) traz cabeçalhos de segurança', async () => {
  const { handler } = montar();
  for (const r of [await handler(post(bodyNlu('ab'))), await handler(mkRequest({ method: 'GET' })), await handler(post(bodyNlu('candidatos a governador em SP')))]) {
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
    assert.match(r.headers.get('content-type'), /application\/json/);
  }
});

// ------------------------------------------------------------------ rate limit

test('rate limit por IP: 20/min por padrão; 21ª -> 429 com Retry-After; libera após a janela', async () => {
  const { handler, now } = montar();
  for (let i = 0; i < 20; i++) {
    const r = await handler(post(bodyNlu(`pergunta numero ${i} sobre candidatos`)));
    assert.equal(r.status, 200, `req ${i}`);
  }
  const r = await handler(post(bodyNlu('pergunta numero 21 sobre candidatos')));
  assert.equal(r.status, 429);
  assert.deepEqual(await r.json(), { ok: false, error: 'rate_limited' });
  assert.ok(Number(r.headers.get('retry-after')) >= 1);
  now.avancar(61_000);
  assert.equal((await handler(post(bodyNlu('pergunta numero 22 sobre candidatos')))).status, 200);
});

test('rate limit por IP: IPs diferentes têm janelas independentes', async () => {
  const { handler } = montar({ env: { RATE_IP_PER_MIN: '2' } });
  const de = (ip) => post(bodyNlu('candidatos a governador em SP'), { 'x-forwarded-for': ip });
  assert.equal((await handler(de('198.51.100.1'))).status, 200);
  assert.equal((await handler(de('198.51.100.1'))).status, 200);
  assert.equal((await handler(de('198.51.100.1'))).status, 429);
  assert.equal((await handler(de('198.51.100.2'))).status, 200);
});

test('rate limit por iid: 60/dia por padrão (configurável); outro iid não é afetado', async () => {
  const { handler, now } = montar({ env: { RATE_IID_PER_DAY: '3', RATE_IP_PER_MIN: '1000' } });
  const iid = novoIid();
  for (let i = 0; i < 3; i++) assert.equal((await handler(post(bodyNlu(`pergunta ${i} candidatos`, { iid })))).status, 200);
  assert.equal((await handler(post(bodyNlu('pergunta 4 candidatos', { iid })))).status, 429);
  assert.equal((await handler(post(bodyNlu('pergunta 4 candidatos', { iid: novoIid() })))).status, 200);
  now.avancar(24 * 3600_000 + 1000);
  assert.equal((await handler(post(bodyNlu('pergunta 5 candidatos', { iid })))).status, 200);
});

test('requisições inválidas (400) não consomem a cota', async () => {
  const { handler } = montar({ env: { RATE_IP_PER_MIN: '2' } });
  for (let i = 0; i < 5; i++) assert.equal((await handler(post(bodyNlu('ab')))).status, 400);
  assert.equal((await handler(post(bodyNlu('candidatos a governador em SP')))).status, 200);
});

// ------------------------------------------------------------------ orçamento diário

test('orçamento diário: ao estourar responde 503 {ok:false,error:"budget"}; cache continua servindo; renova no dia seguinte', async () => {
  const { handler, chamadas, now } = montar({ env: { DAILY_BUDGET: '2', RATE_IP_PER_MIN: '1000' } });
  assert.equal((await handler(post(bodyNlu('candidatos a governador em SP')))).status, 200);
  assert.equal((await handler(post(bodyNlu('candidatos a senador em MG')))).status, 200);
  const estourou = await handler(post(bodyNlu('candidatos a prefeito em RJ')));
  assert.equal(estourou.status, 503);
  assert.deepEqual(await estourou.json(), { ok: false, error: 'budget' });
  assert.equal(chamadas.length, 2);
  const doCache = await handler(post(bodyNlu('candidatos a governador em SP')));
  assert.equal(doCache.status, 200);
  assert.equal((await doCache.json()).cached, true);
  now.avancar(24 * 3600_000);
  assert.equal((await handler(post(bodyNlu('candidatos a prefeito em RJ')))).status, 200);
});

test('DAILY_BUDGET=0 desliga chamadas ao Modal (503 budget)', async () => {
  const { handler, chamadas } = montar({ env: { DAILY_BUDGET: '0' } });
  const r = await handler(post(bodyNlu('candidatos a governador em SP')));
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error, 'budget');
  assert.equal(chamadas.length, 0);
});

// ------------------------------------------------------------------ falhas do upstream

test('5xx do Modal: 1 retry; sucesso na 2ª tentativa; ambas consomem orçamento', async () => {
  const { handler, chamadas } = montar({
    env: { DAILY_BUDGET: '2' },
    fetchImpl: async (_u, _i, n) => (n === 1 ? new Response('erro', { status: 503 }) : respostaModal(SAIDA_GOVERNADOR_SP)),
  });
  const r = await handler(post(bodyNlu('candidatos a governador em SP')));
  assert.equal(r.status, 200);
  assert.equal(chamadas.length, 2);
  // orçamento de 2 já foi todo usado (1 falha + 1 retry): a próxima pergunta nova estoura
  assert.equal((await handler(post(bodyNlu('candidatos a senador em MG')))).status, 503);
});

test('5xx persistente: exatamente 1 retry (2 chamadas) e resposta 502', async () => {
  const { handler, chamadas } = montar({ fetchImpl: async () => new Response('erro', { status: 500 }) });
  const r = await handler(post(bodyNlu('candidatos a governador em SP')));
  assert.equal(r.status, 502);
  assert.deepEqual(await r.json(), { ok: false, error: 'upstream' });
  assert.equal(chamadas.length, 2);
});

test('4xx do Modal (inclui 401 de autenticação): sem retry', async () => {
  for (const status of [400, 401, 403, 404, 429]) {
    const { handler, chamadas } = montar({ fetchImpl: async () => new Response('x', { status }) });
    const r = await handler(post(bodyNlu('candidatos a governador em SP')));
    assert.equal(r.status, 502, String(status));
    assert.equal(chamadas.length, 1, String(status));
  }
});

test('timeout (AbortController): 504 sem retry', async () => {
  const { handler, chamadas } = montar({
    env: { MODAL_TIMEOUT_MS: '500' },
    fetchImpl: (_u, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      }),
  });
  const t0 = Date.now();
  const r = await handler(post(bodyNlu('candidatos a governador em SP')));
  assert.equal(r.status, 504);
  assert.deepEqual(await r.json(), { ok: false, error: 'timeout' });
  assert.equal(chamadas.length, 1);
  assert.ok(Date.now() - t0 < 2000);
});

test('erro de rede: 502 sem retry; resposta do Modal não-JSON ou gigante: 502', async () => {
  const rede = montar({ fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  assert.equal((await rede.handler(post(bodyNlu('candidatos a governador em SP')))).status, 502);
  assert.equal(rede.chamadas.length, 1);
  const naoJson = montar({ fetchImpl: async () => new Response('<html>', { status: 200 }) });
  assert.equal((await naoJson.handler(post(bodyNlu('candidatos a governador em SP')))).status, 502);
  const gigante = montar({ fetchImpl: async () => new Response('x'.repeat(30_000), { status: 200 }) });
  assert.equal((await gigante.handler(post(bodyNlu('candidatos a governador em SP')))).status, 502);
});

test('Modal respondendo {ok:false} -> 502', async () => {
  const { handler } = montar({ fetchImpl: async () => new Response(JSON.stringify({ ok: false, error: 'x' }), { status: 200 }) });
  assert.equal((await handler(post(bodyNlu('candidatos a governador em SP')))).status, 502);
});

test('saída do modelo com JSON quebrado/vazio -> 502 bad_model_output', async () => {
  for (const out of ['', '{"intent": "FILTER_CANDIDATES", "filters": {', 'sem json']) {
    const { handler } = montar({ fetchImpl: async () => respostaModal(out) });
    const r = await handler(post(bodyNlu('candidatos a governador em SP')));
    assert.equal(r.status, 502, out);
    assert.equal((await r.json()).error, 'bad_model_output');
  }
});

// ------------------------------------------------------------------ kill switch / modo mock

test('kill switch: MODAL_ENDPOINT vazio -> 503 disabled, sem chamar o Modal', async () => {
  const { handler, chamadas } = montar({ env: { MODAL_ENDPOINT: '' } });
  const r = await handler(post(bodyNlu('candidatos a governador em SP')));
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { ok: false, error: 'disabled' });
  assert.equal(chamadas.length, 0);
});

test('kill switch: endpoint inválido (http não-local) ou sem credenciais também desliga', async () => {
  for (const env of [{ MODAL_ENDPOINT: 'http://exemplo.com/x' }, { MODAL_ENDPOINT: 'lixo' }, { MODAL_KEY: '' }, { MODAL_SECRET: '' }]) {
    const { handler, chamadas } = montar({ env });
    assert.equal((await handler(post(bodyNlu('candidatos a governador em SP')))).status, 503, JSON.stringify(env));
    assert.equal(chamadas.length, 0);
  }
});

test('MOCK_NLU=1 (fora de produção): não chama o Modal e responde no contrato', async () => {
  const { handler, chamadas } = montar({ env: { MOCK_NLU: '1', MODAL_ENDPOINT: '', MODAL_KEY: '', MODAL_SECRET: '' } });
  const r = await handler(post(bodyNlu('candidatos a governador em SP')));
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).nlu, { intent: 'LISTAR_CANDIDATOS', cargo: 'GOVERNADOR', uf: 'SP' });
  assert.equal(chamadas.length, 0);
  const cal = await (await handler(post(bodyNlu('quando é a eleição?')))).json();
  assert.equal(cal.nlu.intent, 'CALENDARIO');
});

test('MOCK_NLU=1 é IGNORADO em produção (VERCEL_ENV=production)', async () => {
  const { handler, chamadas } = montar({
    env: { MOCK_NLU: '1', VERCEL_ENV: 'production', MODAL_ENDPOINT: '', MODAL_KEY: '', MODAL_SECRET: '' },
  });
  const r = await handler(post(bodyNlu('candidatos a governador em SP')));
  assert.equal(r.status, 503);
  assert.equal(chamadas.length, 0);
});

// ------------------------------------------------------------------ privacidade nos logs

test('o texto da pergunta, o iid e o IP nunca aparecem nos logs', async () => {
  const { handler, cap } = montar({ fetchImpl: async (_u, _i, n) => (n === 1 ? respostaModal(SAIDA_GOVERNADOR_SP) : respostaModal('lixo')) });
  const segredo = 'candidatos a governador em SP zebra-unica-9137';
  const iid = novoIid();
  await handler(post(bodyNlu(segredo, { iid })));
  await handler(post(bodyNlu(segredo, { iid }))); // cache hit
  await handler(post(bodyNlu('outra pergunta zebra-unica-9137 diferente', { iid }))); // saída inválida
  await handler(post(bodyNlu('ab', { iid }))); // 400
  const tudo = JSON.stringify(cap.eventos);
  for (const proibido of ['zebra-unica-9137', iid, '203.0.113.7', 'governador']) {
    assert.ok(!tudo.includes(proibido), `log não deve conter ${proibido}`);
  }
  assert.ok(cap.eventos.length >= 4);
  for (const e of cap.eventos) {
    assert.equal(e.evt, 'nlu');
    assert.equal(typeof e.status, 'number');
    assert.equal(typeof e.ms, 'number');
  }
  assert.deepEqual(cap.eventos.slice(0, 2).map((e) => [e.status, e.cache, e.client]), [[200, 'miss', 'android'], [200, 'hit', 'android']]);
});

test('o log padrão (console) também não vaza a pergunta', async () => {
  const linhas = [];
  const original = console.log;
  console.log = (...a) => linhas.push(a.join(' '));
  try {
    const relo = relogio();
    const handler = createNluHandler({
      env: () => ({ ...ENV_BASE }),
      fetch: async () => respostaModal(SAIDA_GOVERNADOR_SP),
      now: relo,
      state: createNluState({ now: relo }),
    });
    await handler(post(bodyNlu('candidatos a governador em SP zebra-unica-5521')));
  } finally {
    console.log = original;
  }
  assert.equal(linhas.length, 1);
  assert.ok(!linhas[0].includes('zebra-unica-5521'));
  const e = JSON.parse(linhas[0]);
  assert.deepEqual(Object.keys(e).sort(), ['cache', 'client', 'drop', 'evt', 'ms', 'status', 'variant']);
});

// ------------------------------------------------------------------ api/nlu.js (função real, fetch global simulado)

test('api/nlu.js: handler real da Vercel (req/res do Node) com fetch global simulado', async () => {
  const guardado = { env: { ...process.env }, fetch: globalThis.fetch, log: console.log };
  console.log = () => {}; // o log padrão imprime JSON sem a pergunta; aqui só silencia o ruído
  Object.assign(process.env, ENV_BASE, { ALLOWED_ORIGINS: '', MOCK_NLU: '' });
  const chamadas = [];
  globalThis.fetch = async (url, init) => {
    chamadas.push({ url, init });
    return respostaModal(SAIDA_GOVERNADOR_SP);
  };
  try {
    const mod = await import('../nlu.js');
    assert.equal(typeof mod.default, 'function');
    const body = JSON.stringify(bodyNlu('candidatos a governador em SP', { iid: IID_V4 }));
    const res = fakeNodeRes();
    await mod.default(
      fakeNodeReq({ url: '/api/nlu', headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.55', origin: 'https://saibatudo.net' }, body }),
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['access-control-allow-origin'], 'https://saibatudo.net');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    const j = JSON.parse(res.body);
    assert.deepEqual(j.nlu, { intent: 'LISTAR_CANDIDATOS', cargo: 'GOVERNADOR', uf: 'SP' });
    assert.equal(j.model, 'teste-1');
    assert.equal(chamadas.length, 1);
    // 2ª chamada idêntica: cache da instância
    const res2 = fakeNodeRes();
    await mod.default(fakeNodeReq({ headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.55' }, body }), res2);
    assert.equal(JSON.parse(res2.body).cached, true);
    assert.equal(chamadas.length, 1);
    // corpo gigante: 413 via adaptador
    const res3 = fakeNodeRes();
    await mod.default(fakeNodeReq({ headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q: 'x'.repeat(9000) }) }), res3);
    assert.equal(res3.statusCode, 413);
  } finally {
    globalThis.fetch = guardado.fetch;
    console.log = guardado.log;
    for (const k of Object.keys(ENV_BASE).concat(['ALLOWED_ORIGINS', 'MOCK_NLU'])) {
      if (k in guardado.env) process.env[k] = guardado.env[k];
      else delete process.env[k];
    }
  }
});
