import test from 'node:test';
import assert from 'node:assert/strict';
import { baldeDoCanario, readConfig, variantePara } from '../_lib/config.js';
import { createNluHandler, createNluState } from '../_lib/nlu-handler.js';
import { ENV_BASE, SAIDA_GOVERNADOR_SP, bodyNlu, capturarLog, mkRequest, novoIid, relogio, respostaModal } from './_helpers.mjs';

const PROD = 'https://exemplo--saibatudo-nlu.modal.run';
const CANARIO = 'https://exemplo--saibatudo-nlu-canary.modal.run';
const ENV_CANARIO = { ...ENV_BASE, MODAL_ENDPOINT: PROD, MODAL_CANARY_ENDPOINT: CANARIO, CANARY_PCT: '50', CANARY_MODEL_VERSION: 'v2.2-teste', MODEL_VERSION: 'v2.1-prod' };

/** Uma instalação (iid) cujo balde cai no canário (< pct) ou fora dele. */
function iidNoBalde(dentro, pct = 50) {
  for (let i = 0; i < 1000; i++) {
    const iid = novoIid();
    if ((baldeDoCanario(iid) < pct) === dentro) return iid;
  }
  throw new Error('sem iid no balde pedido');
}

function montar({ env = ENV_CANARIO, respostaPara } = {}) {
  const chamadas = [];
  const relo = relogio();
  const cap = capturarLog();
  const handler = createNluHandler({
    env: () => env,
    fetch: async (url, init) => {
      chamadas.push(String(url));
      return respostaPara ? respostaPara(String(url)) : respostaModal(SAIDA_GOVERNADOR_SP);
    },
    now: relo,
    log: cap.log,
    state: createNluState({ now: relo }),
  });
  return { handler, chamadas, cap };
}
const post = (q, iid, ip = '203.0.113.7') => mkRequest({ json: bodyNlu(q, { iid }), headers: { 'x-forwarded-for': ip } });

test('config: sem endpoint ou com CANARY_PCT=0 nunca há canário', () => {
  const iid = iidNoBalde(true, 100);
  assert.equal(variantePara(readConfig({ ...ENV_CANARIO, CANARY_PCT: '0' }), iid), 'prod');
  assert.equal(variantePara(readConfig({ ...ENV_CANARIO, MODAL_CANARY_ENDPOINT: '' }), iid), 'prod');
  assert.equal(variantePara(readConfig({ ...ENV_CANARIO, CANARY_PCT: '100' }), iid), 'canary');
  assert.equal(variantePara(readConfig(ENV_BASE), iid), 'prod', 'padrão: desligado');
  assert.equal(readConfig({ CANARY_PCT: 'abc' }).canaryPct, 0);
  assert.equal(readConfig({ CANARY_PCT: '500' }).canaryPct, 100);
});

test('o balde é estável por instalação e a fatia fica perto de CANARY_PCT', () => {
  const iid = novoIid();
  assert.equal(baldeDoCanario(iid), baldeDoCanario(iid.toUpperCase()));
  let dentro = 0;
  const n = 4000;
  for (let i = 0; i < n; i++) if (baldeDoCanario(novoIid()) < 20) dentro++;
  assert.ok(dentro / n > 0.16 && dentro / n < 0.24, String(dentro / n));
});

test('instalação do canário vai ao endpoint do canário e a resposta traz a versão do canário', async () => {
  const m = montar();
  const res = await m.handler(post('candidatos a governador em SP', iidNoBalde(true)));
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.model, 'v2.2-teste');
  assert.equal(m.chamadas.length, 1);
  assert.ok(m.chamadas[0].startsWith(CANARIO));
  assert.equal(m.cap.eventos[0].variant, 'canary');
});

test('instalação fora do canário continua na produção', async () => {
  const m = montar();
  const j = await (await m.handler(post('candidatos a governador em SP', iidNoBalde(false)))).json();
  assert.equal(j.model, 'v2.1-prod');
  assert.ok(m.chamadas[0].startsWith(PROD));
  assert.equal(m.cap.eventos[0].variant, 'prod');
});

test('FALHA DO CANÁRIO: a pergunta é refeita na produção e o eleitor recebe a resposta (rollback sem queda)', async () => {
  const m = montar({ respostaPara: (url) => (url.startsWith(CANARIO) ? new Response('sem modelo', { status: 503 }) : respostaModal(SAIDA_GOVERNADOR_SP)) });
  const res = await m.handler(post('candidatos a governador em SP', iidNoBalde(true)));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).model, 'v2.1-prod', 'quem respondeu foi a produção');
  assert.ok(m.chamadas.some((u) => u.startsWith(CANARIO)) && m.chamadas.some((u) => u.startsWith(PROD)));
  const ev = m.cap.eventos[0];
  assert.equal(ev.fallback, true);
  assert.equal(ev.variant, 'prod');
});

test('canário e produção falhando: 502 normal, sem laço', async () => {
  const m = montar({ respostaPara: () => new Response('x', { status: 503 }) });
  const res = await m.handler(post('candidatos a governador em SP', iidNoBalde(true)));
  assert.equal(res.status, 502);
});

test('o cache nunca mistura versões: o que a produção respondeu não vira "do canário" e vice-versa', async () => {
  // canário cai => produção responde => resultado fica no cache da PRODUÇÃO
  const m = montar({ respostaPara: (url) => (url.startsWith(CANARIO) ? new Response('x', { status: 503 }) : respostaModal(SAIDA_GOVERNADOR_SP)) });
  await m.handler(post('candidatos a governador em SP', iidNoBalde(true), '203.0.113.1'));
  const naProducao = await (await m.handler(post('candidatos a governador em SP', iidNoBalde(false), '203.0.113.2'))).json();
  assert.equal(naProducao.cached, true, 'a produção reaproveita o que ela mesma respondeu');
  assert.equal(naProducao.model, 'v2.1-prod');

  // canário responde => cache do canário, que a produção NÃO reaproveita
  const n = montar();
  await n.handler(post('candidatos a governador em SP', iidNoBalde(true), '203.0.113.3'));
  const prod = await (await n.handler(post('candidatos a governador em SP', iidNoBalde(false), '203.0.113.4'))).json();
  assert.equal(prod.cached, false);
  assert.equal(prod.model, 'v2.1-prod');
  assert.equal(n.chamadas.filter((u) => u.startsWith(PROD)).length, 1);
});

test('o log do canário não vaza pergunta, IP nem iid', async () => {
  const m = montar();
  const iid = iidNoBalde(true);
  await m.handler(post('pergunta-unica-zebra-7731 candidatos a governador em SP', iid, '198.51.100.9'));
  const log = JSON.stringify(m.cap.eventos);
  for (const proibido of ['zebra-7731', '198.51.100.9', iid]) assert.ok(!log.includes(proibido), proibido);
});
