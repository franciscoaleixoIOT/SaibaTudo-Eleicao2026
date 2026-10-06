import test from 'node:test';
import assert from 'node:assert/strict';
import { comandosDoDia, createMelhoriaHandler, createMelhoriaState, filtrarTextos, validateMelhoriaBody } from '../_lib/melhoria-handler.js';
import { createSharedLimiter } from '../_lib/compartilhado.js';
import { handleHealth } from '../health.js';
import { IID_V4, capturarLog, mkRequest, novoIid, relogio } from './_helpers.mjs';

const REDIS = { UPSTASH_REDIS_REST_URL: 'https://exemplo.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'tok' };
const ENV_ON = { ...REDIS, MELHORIA_ENABLED: '1' };

/** Redis falso que guarda os comandos recebidos e responde como o Upstash (HINCRBY/EXPIRE com resultado inteiro). */
function redisFalso({ falha = false } = {}) {
  const pedidos = [];
  const fetchFn = async (url, init) => {
    const cmds = JSON.parse(init.body);
    pedidos.push(cmds);
    if (falha) return new Response('erro', { status: 500 });
    return new Response(JSON.stringify(cmds.map(() => ({ result: 1 }))), { status: 200 });
  };
  /** Só os envios de SINAIS (HINCRBY); os contadores de limite (INCR por IP/iid, expiram em 1 h/1 dia) ficam de fora. */
  const salvos = () => pedidos.filter((p) => p[0][0] === 'HINCRBY');
  return { fetchFn, pedidos, salvos };
}

function montar({ env = ENV_ON, redis = redisFalso(), now = relogio() } = {}) {
  const cap = capturarLog();
  const shared = createSharedLimiter({ env: () => env, fetchFn: redis.fetchFn, now });
  const handler = createMelhoriaHandler({ env: () => env, now, log: cap.log, state: createMelhoriaState({ now, shared }) });
  return { handler, redis, cap, now };
}

const post = (body, headers = {}) => mkRequest({ url: 'https://saibatudo.net/api/melhoria', json: body, headers: { 'x-forwarded-for': '203.0.113.9', ...headers } });
const corpo = (itens, extra = {}) => ({ v: 1, client: 'android', iid: IID_V4, itens: itens.map((q) => ({ q })), ...extra });

test('desligado por padrão: sem MELHORIA_ENABLED ou sem Redis responde 503 disabled e não toca no store', async () => {
  for (const env of [REDIS, { MELHORIA_ENABLED: '1' }, {}, { ...REDIS, MELHORIA_ENABLED: 'true' }]) {
    const m = montar({ env });
    const res = await m.handler(post(corpo(['quando é a eleição'])));
    assert.equal(res.status, 503, JSON.stringify(env));
    assert.equal((await res.json()).error, 'disabled');
    assert.equal(m.redis.pedidos.length, 0);
  }
});

test('envio válido guarda SÓ o texto e a contagem do dia, com expiração de 90 dias', async () => {
  const m = montar();
  const res = await m.handler(post(corpo(['que dia é o pleito', 'posso votar de bermuda'])));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, aceitas: 2, descartadas: 0 });
  assert.equal(m.redis.salvos().length, 1, 'um único pipeline de sinais');
  const cmds = m.redis.salvos()[0];
  assert.deepEqual(cmds.slice(0, 2).map((c) => c[0]), ['HINCRBY', 'HINCRBY']);
  assert.equal(cmds[0][1], 'st:sinais:2026-10-01');
  assert.equal(cmds[0][2], 'que dia é o pleito');
  assert.equal(cmds[0][3], '1');
  const expire = cmds.at(-1);
  assert.deepEqual(expire, ['EXPIRE', 'st:sinais:2026-10-01', String(90 * 24 * 3600)]);
});

test('PRIVACIDADE: nada do iid, do IP, do client nem de horário vai para o store', async () => {
  const m = montar();
  const iid = novoIid();
  await m.handler(post(corpo(['que dia é o pleito'], { iid }), { 'x-forwarded-for': '198.51.100.77' }));
  assert.equal(m.redis.salvos().length, 1);
  const tudo = JSON.stringify(m.redis.salvos());
  assert.ok(!tudo.includes(iid), 'iid');
  assert.ok(!tudo.includes('198.51.100.77'), 'IP');
  assert.ok(!tudo.includes('android'), 'client');
  assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(tudo), 'horário');
});

test('PRIVACIDADE: o texto da pergunta, o IP e o iid nunca aparecem no log', async () => {
  const m = montar();
  const iid = novoIid();
  await m.handler(post(corpo(['pergunta secreta do usuário'], { iid }), { 'x-forwarded-for': '198.51.100.78' }));
  const log = JSON.stringify(m.cap.eventos);
  for (const proibido of ['pergunta secreta', '198.51.100.78', iid]) assert.ok(!log.includes(proibido), proibido);
  assert.deepEqual(Object.keys(m.cap.eventos[0]).sort(), ['aceitas', 'client', 'descartadas', 'err', 'evt', 'ms', 'status'].filter((k) => k in m.cap.eventos[0]).sort());
});

test('dado pessoal derruba o item (não é mascarado e guardado)', async () => {
  const m = montar();
  const res = await m.handler(post(corpo([
    'meu cpf é 123.456.789-09', 'me liga 11 98765-4321', 'escreva para joao@exemplo.com', 'documento 123456789012', 'que dia é o pleito',
  ])));
  assert.deepEqual(await res.json(), { ok: true, aceitas: 1, descartadas: 4 });
  assert.equal(m.redis.salvos()[0][0][2], 'que dia é o pleito');
  assert.ok(!JSON.stringify(m.redis.pedidos).includes('123.456.789-09'));
});

test('tudo descartado: 200 sem tocar no store', async () => {
  const m = montar();
  const res = await m.handler(post(corpo(['oi', 'x'.repeat(400).slice(0, 301), 'cpf 123.456.789-09'])));
  assert.deepEqual(await res.json(), { ok: true, aceitas: 0, descartadas: 3 });
  assert.equal(m.redis.salvos().length, 0, 'nada é guardado');
});

test('validação: método, corpo, itens, client e iid', async () => {
  const m = montar();
  assert.equal((await m.handler(mkRequest({ method: 'GET', url: 'https://saibatudo.net/api/melhoria' }))).status, 405);
  const casos = [
    [corpo(['ok ok']), 200],
    [{ ...corpo(['ok ok']), v: 2 }, 400],
    [{ ...corpo(['ok ok']), client: 'ios' }, 400],
    [{ ...corpo(['ok ok']), iid: 'nao-e-uuid' }, 400],
    [{ ...corpo(['ok ok']), itens: [] }, 400],
    [{ ...corpo(['ok ok']), itens: 'texto' }, 400],
    [{ ...corpo(['ok ok']), itens: Array.from({ length: 11 }, () => ({ q: 'pergunta válida' })) }, 400],
    [{ ...corpo(['ok ok']), itens: [{ q: 123 }] }, 400],
    [{ ...corpo(['ok ok']), itens: [null] }, 400],
  ];
  for (const [b, esperado] of casos) {
    const mm = montar();
    assert.equal((await mm.handler(post(b))).status, esperado, JSON.stringify(b).slice(0, 80));
  }
});

test('repetidas no mesmo envio contam uma vez; mesma pergunta em dias seguintes usa o hash do dia', async () => {
  const relo = relogio();
  const m = montar({ now: relo });
  const r1 = await (await m.handler(post(corpo(['que dia é o pleito', 'que dia é o pleito  ', 'outra pergunta boa'])))).json();
  assert.deepEqual(r1, { ok: true, aceitas: 2, descartadas: 1 });
  relo.avancar(24 * 3600 * 1000);
  await m.handler(post(corpo(['que dia é o pleito'], { iid: novoIid() }), { 'x-forwarded-for': '203.0.113.200' }));
  assert.equal(m.redis.salvos()[0][0][1], 'st:sinais:2026-10-01');
  assert.equal(m.redis.salvos()[1][0][1], 'st:sinais:2026-10-02');
});

test('limite por instalação/dia e por IP/hora', async () => {
  const m = montar({ env: { ...ENV_ON, MELHORIA_PER_HOUR: '2', MELHORIA_PER_DAY: '50' } });
  const ip = { 'x-forwarded-for': '203.0.113.31' };
  assert.equal((await m.handler(post(corpo(['pergunta numero um']), ip))).status, 200);
  assert.equal((await m.handler(post(corpo(['pergunta numero dois']), ip))).status, 200);
  const terceira = await m.handler(post(corpo(['pergunta numero tres']), ip));
  assert.equal(terceira.status, 429);
  assert.ok(Number(terceira.headers.get('retry-after')) >= 1);
});

test('store indisponível: 503 unavailable (a captura não finge ter guardado)', async () => {
  const m = montar({ redis: redisFalso({ falha: true }) });
  const res = await m.handler(post(corpo(['que dia é o pleito'])));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'unavailable');
});

test('CORS: origem não permitida é negada; sem Origin (app Android) passa', async () => {
  const m = montar();
  assert.equal((await m.handler(post(corpo(['que dia é o pleito']), { origin: 'https://evil.example.com' }))).status, 403);
  assert.equal((await m.handler(post(corpo(['que dia é o pleito']), { origin: 'https://saibatudo.net' }))).status, 200);
});

test('filtrarTextos e comandosDoDia (funções puras)', () => {
  assert.deepEqual(filtrarTextos(['  oi  ', 'boa pergunta', 'Boa pergunta', 'boa pergunta']), { aceitos: ['boa pergunta', 'Boa pergunta'], descartadas: 2 });
  assert.equal(comandosDoDia(['a b c'], Date.UTC(2026, 9, 1, 2, 0))[0][1], 'st:sinais:2026-09-30', 'dia de Brasília (02:00 UTC ainda é 30/09)');
  assert.equal(validateMelhoriaBody(null).ok, false);
});

test('health mostra melhoria on só com a flag e o Redis', async () => {
  const get = () => mkRequest({ method: 'GET', url: 'https://saibatudo.net/api/health' });
  const melhoria = async (env) => (await (await handleHealth(get(), env, { semDados: true })).json()).melhoria;
  assert.equal(await melhoria({}), 'off');
  assert.equal(await melhoria({ MELHORIA_ENABLED: '1' }), 'off');
  assert.equal(await melhoria(REDIS), 'off');
  assert.equal(await melhoria(ENV_ON), 'on');
});

test('pergunta que revela opinião política não chega ao Redis nem ao log; o envio responde ok com a contagem de descartadas', async () => {
  const m = montar();
  const res = await m.handler(post(corpo(['Quero que fulano ganhe, o que posso fazer?', 'Qual estratégia para aumentar as chances de fulano ganhar?', 'Como justificar o voto?'])));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, aceitas: 1, descartadas: 2 });
  const gravado = JSON.stringify(m.redis.pedidos);
  assert.ok(!/fulano/i.test(gravado), 'nada que revele opinião pode ser enviado ao Redis');
  assert.ok(!/fulano/i.test(JSON.stringify(m.cap.eventos ?? m.cap)), 'nem ao log');
  assert.equal(m.redis.salvos().length, 1);
});

test('lote só com perguntas de opinião: nada é gravado', async () => {
  const m = montar();
  const res = await m.handler(post(corpo(['Quero que fulano ganhe, o que posso fazer?', 'Torço para o partido dele ganhar'])));
  assert.deepEqual(await res.json(), { ok: true, aceitas: 0, descartadas: 2 });
  assert.equal(m.redis.salvos().length, 0);
});
