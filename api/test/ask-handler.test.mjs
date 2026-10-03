import test from 'node:test';
import assert from 'node:assert/strict';
import { createAskHandler, createAskState } from '../_lib/ask-handler.js';
import {
  ENV_BASE, IID_V4, capturarLog, fakeNodeReq, fakeNodeRes, mkRequest, relogio,
} from './_helpers.mjs';
import { toNodeHandler } from '../_lib/http.js';

function respostaModalAsk(answer, { status = 200, model = 'Qwen2.5-7B-Instruct-AWQ' } = {}) {
  return new Response(JSON.stringify({ ok: status < 400, answer, model }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function montar({ env = {}, fetchImpl, now } = {}) {
  const relo = now ?? relogio();
  const chamadas = [];
  const fetchFalso = async (url, init) => {
    chamadas.push({ url, init, corpo: init?.body ? JSON.parse(init.body) : undefined });
    return fetchImpl ? fetchImpl(url, init, chamadas.length) : respostaModalAsk('Em 2026 serão renovados 2/3 do Senado.');
  };
  const cap = capturarLog();
  const handler = createAskHandler({
    env: () => ({
      ...ENV_BASE,
      MODAL_ASK_ENDPOINT: 'https://franciscoaleixo--saibatudo-qwen7b-awq-qwen7bengine-ask.modal.run',
      ...env,
    }),
    fetch: fetchFalso,
    now: relo,
    log: cap.log,
    state: createAskState({ now: relo }),
  });
  return { handler, chamadas, cap, now: relo };
}

const post = (body, headers = {}) => mkRequest({ json: body, headers: { 'x-forwarded-for': '203.0.113.7', ...headers } });

const bodyAsk = (q, { context = '', client = 'web', iid = IID_V4 } = {}) => ({
  q, context, v: 1, client, iid,
});

test('POST /api/ask válido: chama o Modal com Modal-Key/Modal-Secret e devolve a resposta gerada', async () => {
  const { handler, chamadas } = montar();
  const res = await handler(post(bodyAsk('Como funciona a votação do Senado em 2026?')));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(data.answer.includes('Senado'));
  assert.equal(data.model, 'Qwen2.5-7B-Instruct-AWQ');
  assert.equal(data.cached, false);

  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].url, 'https://franciscoaleixo--saibatudo-qwen7b-awq-qwen7bengine-ask.modal.run/');
  assert.equal(chamadas[0].init.headers['Modal-Key'], 'wk-teste');
  assert.equal(chamadas[0].init.headers['Modal-Secret'], 'ws-teste');
  assert.deepEqual(chamadas[0].corpo, {
    question: 'Como funciona a votação do Senado em 2026?',
    context: '',
  });
});

test('POST /api/ask com contexto: passa o contexto adiante para o Modal', async () => {
  const { handler, chamadas } = montar();
  const res = await handler(post(bodyAsk('Quem é o vice?', { context: 'Candidato: João da Silva (PL), Vice: Maria Santos (PL)' })));
  assert.equal(res.status, 200);
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].corpo.context, 'Candidato: João da Silva (PL), Vice: Maria Santos (PL)');
});

test('Cache de perguntas: segunda chamada idêntica não consome o Modal', async () => {
  const { handler, chamadas } = montar();
  const q = 'quais são as regras de votação para presidente?';
  const r1 = await handler(post(bodyAsk(q)));
  assert.equal(r1.status, 200);
  assert.equal((await r1.json()).cached, false);
  assert.equal(chamadas.length, 1);

  const r2 = await handler(post(bodyAsk(q)));
  assert.equal(r2.status, 200);
  assert.equal((await r2.json()).cached, true);
  assert.equal(chamadas.length, 1); // continua 1
});

test('Kill switch: sem credenciais responde 503 disabled', async () => {
  const { handler, chamadas } = montar({ env: { MODAL_KEY: '', MODAL_SECRET: '' } });
  const res = await handler(post(bodyAsk('qualquer pergunta')));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'disabled');
  assert.equal(chamadas.length, 0);
});

test('Validação: pergunta curta ou sem iid é rejeitada com 400', async () => {
  const { handler } = montar();
  const rCurta = await handler(post({ q: 'oi', v: 1, client: 'web', iid: IID_V4 }));
  assert.equal(rCurta.status, 400);

  const rSemIid = await handler(post({ q: 'pergunta válida', v: 1, client: 'web' }));
  assert.equal(rSemIid.status, 400);
});

test('Node handler integration: toNodeHandler funciona perfeitamente', async () => {
  const { handler } = montar();
  const nodeFn = toNodeHandler(handler);
  const req = fakeNodeReq({
    method: 'POST',
    url: '/api/ask',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(bodyAsk('Pergunta via Node handler')),
  });
  const res = fakeNodeRes();
  await nodeFn(req, res);
  assert.equal(res.statusCode, 200);
  const json = JSON.parse(res.body);
  assert.equal(json.ok, true);
  assert.ok(json.answer);
});
