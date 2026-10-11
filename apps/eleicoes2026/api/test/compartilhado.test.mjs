import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedLimiter, lerConfigCompartilhado, orcamentoComCompartilhado } from '../_lib/compartilhado.js';
import { createNluHandler, createNluState } from '../_lib/nlu-handler.js';
import { createDailyBudget } from '../_lib/ratelimit.js';
import {
  ENV_BASE, SAIDA_GOVERNADOR_SP, bodyNlu, capturarLog, mkRequest, novoIid, relogio, respostaModal,
} from './_helpers.mjs';

const REDIS = { UPSTASH_REDIS_REST_URL: 'https://exemplo.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'tok-teste' };

/** Upstash falso: contadores em memória + registro do que foi pedido. Responde ao /pipeline como o serviço real. */
function redisFalso() {
  const contadores = new Map();
  const pedidos = [];
  const fetchFn = async (url, init) => {
    const comandos = JSON.parse(init.body);
    pedidos.push({ url: String(url), auth: init.headers.Authorization, comandos });
    const saida = comandos.map(([cmd, chave]) => {
      if (cmd === 'INCR') {
        const n = (contadores.get(chave) ?? 0) + 1;
        contadores.set(chave, n);
        return { result: n };
      }
      return { result: 1 };
    });
    return new Response(JSON.stringify(saida), { status: 200 });
  };
  return { fetchFn, contadores, pedidos };
}

test('config: sem variáveis fica inativo; aceita os nomes do Upstash e da integração KV; exige https', () => {
  assert.equal(lerConfigCompartilhado({}).ativo, false);
  assert.equal(lerConfigCompartilhado({ UPSTASH_REDIS_REST_URL: 'https://x.io' }).ativo, false, 'sem token');
  assert.equal(lerConfigCompartilhado({ UPSTASH_REDIS_REST_URL: 'http://x.io', UPSTASH_REDIS_REST_TOKEN: 't' }).ativo, false, 'http não vale');
  assert.equal(lerConfigCompartilhado({ UPSTASH_REDIS_REST_URL: 'lixo', UPSTASH_REDIS_REST_TOKEN: 't' }).ativo, false);
  const a = lerConfigCompartilhado({ UPSTASH_REDIS_REST_URL: 'https://x.io/', UPSTASH_REDIS_REST_TOKEN: 't' });
  assert.deepEqual(a, { ativo: true, url: 'https://x.io', token: 't' });
  assert.equal(lerConfigCompartilhado({ KV_REST_API_URL: 'https://kv.io', KV_REST_API_TOKEN: 't' }).ativo, true);
});

test('sem Redis configurado é no-op: tudo permitido e nenhuma chamada de rede', async () => {
  let chamou = false;
  const s = createSharedLimiter({ env: () => ({}), fetchFn: async () => { chamou = true; return new Response('[]'); } });
  assert.equal(s.ativo(), false);
  assert.deepEqual(await s.hit('ip:1', 60, 1), { allowed: true, retryAfterMs: 0, shared: false });
  assert.equal(await s.consumirDia('nlu', 0), true);
  assert.equal(chamou, false);
});

test('hit: conta por janela fixa, bloqueia acima do limite com Retry-After e libera no balde seguinte', async () => {
  const relo = relogio();
  const r = redisFalso();
  const s = createSharedLimiter({ env: () => REDIS, fetchFn: r.fetchFn, now: relo });
  assert.equal((await s.hit('ip:1.2.3.4', 60, 2)).allowed, true);
  assert.equal((await s.hit('ip:1.2.3.4', 60, 2)).allowed, true);
  const negado = await s.hit('ip:1.2.3.4', 60, 2);
  assert.equal(negado.allowed, false);
  assert.equal(negado.shared, true);
  assert.ok(negado.retryAfterMs >= 1000 && negado.retryAfterMs <= 60_000);
  assert.equal((await s.hit('ip:5.6.7.8', 60, 2)).allowed, true, 'outro IP tem contador próprio');
  relo.avancar(61_000);
  assert.equal((await s.hit('ip:1.2.3.4', 60, 2)).allowed, true, 'balde novo, contador novo');
});

test('as chamadas levam o token, vão para /pipeline e fazem INCR + EXPIRE', async () => {
  const r = redisFalso();
  const s = createSharedLimiter({ env: () => REDIS, fetchFn: r.fetchFn });
  await s.hit('ip:9.9.9.9', 60, 5);
  assert.equal(r.pedidos[0].url, 'https://exemplo.upstash.io/pipeline');
  assert.equal(r.pedidos[0].auth, 'Bearer tok-teste');
  assert.equal(r.pedidos[0].comandos[0][0], 'INCR');
  assert.equal(r.pedidos[0].comandos[1][0], 'EXPIRE');
  assert.ok(Number(r.pedidos[0].comandos[1][2]) >= 60, 'expira só depois da janela');
});

test('FALHA ABERTO: erro de rede, HTTP 500, corpo inválido e timeout nunca bloqueiam a requisição', async () => {
  const falhas = [
    async () => { throw new Error('rede'); },
    async () => new Response('erro', { status: 500 }),
    async () => new Response('não é json', { status: 200 }),
    async () => new Response(JSON.stringify([{ error: 'WRONGTYPE' }]), { status: 200 }),
    (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('abortado')))),
  ];
  for (const fetchFn of falhas) {
    const s = createSharedLimiter({ env: () => REDIS, fetchFn });
    const h = await s.hit('ip:1', 60, 1);
    assert.deepEqual(h, { allowed: true, retryAfterMs: 0, shared: false });
    assert.equal(await s.consumirDia('nlu', 0), true);
  }
});

test('consumirDia: orçamento global por dia de Brasília, com nome próprio por serviço', async () => {
  const relo = relogio();
  const r = redisFalso();
  const s = createSharedLimiter({ env: () => REDIS, fetchFn: r.fetchFn, now: relo });
  assert.equal(await s.consumirDia('ask', 2), true);
  assert.equal(await s.consumirDia('ask', 2), true);
  assert.equal(await s.consumirDia('ask', 2), false);
  assert.equal(await s.consumirDia('nlu', 2), true, 'nlu não gasta o orçamento do ask');
  const chaves = [...r.contadores.keys()];
  assert.ok(chaves.some((k) => /^st:orcamento:ask:\d{4}-\d{2}-\d{2}$/.test(k)), chaves.join(','));
});

test('orçamento combinado: a camada local nega antes de gastar uma chamada ao Redis', async () => {
  const r = redisFalso();
  const s = createSharedLimiter({ env: () => REDIS, fetchFn: r.fetchFn });
  const orc = orcamentoComCompartilhado(createDailyBudget(), s, 'nlu');
  assert.equal(await orc.consume(1), true);
  assert.equal(r.pedidos.length, 1);
  assert.equal(await orc.consume(1), false, 'local esgotado');
  assert.equal(r.pedidos.length, 1, 'sem nova chamada ao Redis');
  assert.equal(orc.used(), 1);
});

test('integração: duas instâncias serverless com memória separada dividem o MESMO limite por IP (o ponto da camada)', async () => {
  const redis = redisFalso();
  const relo = relogio();
  const montarInstancia = () => {
    const state = createNluState({ now: relo, shared: createSharedLimiter({ env: () => ({ ...ENV_BASE, ...REDIS }), fetchFn: redis.fetchFn, now: relo }) });
    return createNluHandler({
      env: () => ({ ...ENV_BASE, ...REDIS, RATE_IP_PER_MIN: '2' }),
      fetch: async () => respostaModal(SAIDA_GOVERNADOR_SP),
      now: relo,
      log: capturarLog().log,
      state,
    });
  };
  const a = montarInstancia();
  const b = montarInstancia();
  const req = (q) => mkRequest({ json: bodyNlu(q, { iid: novoIid() }), headers: { 'x-forwarded-for': '203.0.113.50' } });

  assert.equal((await a(req('candidatos a governador em SP'))).status, 200);
  assert.equal((await b(req('candidatos a senador em MG'))).status, 200);
  // memória local de A tem 1 uso e a de B tem 1: sozinhas, nenhuma bloquearia. O contador global já está em 2.
  const terceira = await a(req('candidatos a presidente'));
  assert.equal(terceira.status, 429, 'o limite global (2/min por IP) vale entre instâncias');
  assert.ok(Number(terceira.headers.get('retry-after')) >= 1);
  assert.equal((await b(req('candidatos a deputado federal em RJ'))).status, 429);
});

test('integração: sem Redis o handler se comporta como antes (limite só por instância)', async () => {
  const relo = relogio();
  const montarInstancia = () => createNluHandler({
    env: () => ({ ...ENV_BASE, RATE_IP_PER_MIN: '2' }),
    fetch: async () => respostaModal(SAIDA_GOVERNADOR_SP),
    now: relo,
    log: capturarLog().log,
    state: createNluState({ now: relo }),
  });
  const a = montarInstancia();
  const b = montarInstancia();
  const req = (q) => mkRequest({ json: bodyNlu(q, { iid: novoIid() }), headers: { 'x-forwarded-for': '203.0.113.51' } });
  assert.equal((await a(req('candidatos a governador em SP'))).status, 200);
  assert.equal((await b(req('candidatos a senador em MG'))).status, 200);
  assert.equal((await a(req('candidatos a presidente'))).status, 200, 'sem camada compartilhada cada instância tem seu limite');
});
