// Texto gerado pelo Qwen 7B: Space do Hugging Face (ZeroGPU) como provedor PRINCIPAL e Modal como RESERVA, e o verificador
// reforçado (contagem inventada, contradição com o que o app apurou). O recurso continua desligado sem ASK_ENABLED=1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAskHandler, createAskState, lerSseGradio } from '../_lib/ask-handler.js';
import { askAtivo, readConfig } from '../_lib/config.js';
import { contagensSemFonte, contradizDadosDoApp, verificarRespostaAsk } from '../_lib/neutralidade.js';
import { ENV_BASE, IID_V4, capturarLog, mkRequest, relogio } from './_helpers.mjs';

const HF = 'https://exemplo-saibatudo-qwen7b.hf.space';
const MODAL = 'https://exemplo--saibatudo-qwen7b-awq-qwen7bengine-ask.modal.run';
const ENV_HF = { ...ENV_BASE, ASK_ENABLED: '1', HF_ASK_SPACE_URL: HF, HF_TOKEN: 'hf_segredo_de_teste' };

const sse = (obj) => new Response(`event: heartbeat\ndata: null\n\nevent: complete\ndata: ${JSON.stringify([obj])}\n\n`, { status: 200 });
const sseErro = () => new Response('event: error\ndata: null\n\n', { status: 200 });
const idOk = () => new Response(JSON.stringify({ event_id: 'abc123' }), { status: 200 });
const modalOk = (answer) => new Response(JSON.stringify({ ok: true, answer, model: 'Qwen2.5-7B-Instruct-AWQ' }), { status: 200 });

/** `hf`: função (chamadaDoHf) => Response para o GET do resultado; `modal`: resposta do Modal. */
function montar({ env = ENV_HF, hf = () => sse({ ok: true, answer: 'O segundo turno será em 25/10/2026.', model: 'Qwen2.5-7B-Instruct', gpu_s: 0.7 }), modal = () => modalOk('Resposta da reserva.'), postHf = idOk } = {}) {
  const chamadas = [];
  const fetchFalso = async (url, init) => {
    chamadas.push({ url: String(url), init });
    if (String(url).startsWith(HF)) return init.method === 'POST' ? postHf() : hf();
    return modal();
  };
  const cap = capturarLog();
  const now = relogio();
  const handler = createAskHandler({ env: () => env, fetch: fetchFalso, now, log: cap.log, state: createAskState({ now }) });
  return { handler, chamadas, cap };
}

const post = (q, context = '') => mkRequest({ url: 'https://saibatudo.net/api/ask', json: { q, context, v: 1, client: 'web', iid: IID_V4 }, headers: { 'x-forwarded-for': '203.0.113.7' } });

test('config: o ask liga com Hugging Face OU Modal configurado, e só com ASK_ENABLED=1', () => {
  assert.equal(askAtivo(readConfig({ ...ENV_HF, MODAL_KEY: '', MODAL_SECRET: '' })), true, 'só Hugging Face basta');
  assert.equal(askAtivo(readConfig({ ...ENV_HF, ASK_ENABLED: '0' })), false);
  assert.equal(askAtivo(readConfig({ ...ENV_BASE, ASK_ENABLED: '1', HF_ASK_SPACE_URL: HF })), false, 'sem token não liga');
  assert.equal(askAtivo(readConfig({ ...ENV_BASE, ASK_ENABLED: '1', HF_ASK_SPACE_URL: 'http://inseguro.hf.space', HF_TOKEN: 'x' })), false, 'só https');
  const cfg = readConfig(ENV_HF);
  assert.equal(cfg.askHfDailyBudget, 400);
  assert.equal(cfg.askModalDailyBudget, 15, 'a reserva no Modal tem teto diário baixo por padrão');
});

test('Hugging Face é o principal: POST com o token, GET do resultado, e o Modal não é chamado', async () => {
  const { handler, chamadas, cap } = montar({ env: { ...ENV_HF, MODAL_ASK_ENDPOINT: MODAL } });
  const res = await handler(post('quando é o segundo turno?', 'Dados apurados no sistema:\n2º turno em 25/10/2026.'));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, answer: 'O segundo turno será em 25/10/2026.', model: 'Qwen2.5-7B-Instruct', cached: false });
  assert.equal(chamadas.length, 2);
  assert.equal(chamadas[0].url, `${HF}/gradio_api/call/ask`);
  assert.equal(chamadas[0].init.headers.Authorization, 'Bearer hf_segredo_de_teste');
  // o validador do proxy achata os espaços do contexto (quebras de linha viram espaço) antes de enviar
  assert.deepEqual(JSON.parse(chamadas[0].init.body), { data: ['quando é o segundo turno?', 'Dados apurados no sistema: 2º turno em 25/10/2026.'] });
  assert.equal(chamadas[1].url, `${HF}/gradio_api/call/ask/abc123`);
  assert.ok(chamadas.every((c) => !c.url.includes('modal.run')));
  assert.ok(!JSON.stringify(cap.eventos).includes('hf_segredo_de_teste'), 'o token nunca vai para o log');
  assert.ok(!JSON.stringify(cap.eventos).includes('segundo turno'), 'nem a pergunta');
});

test('reserva: Space fora do ar, cota esgotada (evento de erro) ou resposta sem texto caem no Modal', async () => {
  for (const hf of [() => new Response('fora', { status: 503 }), sseErro, () => sse({ ok: true, answer: '' }), () => sse({ ok: false, error: 'x' })]) {
    const { handler, chamadas } = montar({ env: { ...ENV_HF, MODAL_ASK_ENDPOINT: MODAL }, hf });
    const res = await handler(post('Como funciona a votação do Senado?'));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).answer, 'Resposta da reserva.');
    assert.ok(chamadas.at(-1).url.startsWith(MODAL));
  }
});

test('sem Modal configurado, a falha do Hugging Face vira erro (o cliente mantém a resposta do app)', async () => {
  const { handler, chamadas } = montar({ env: { ...ENV_HF, MODAL_KEY: '', MODAL_SECRET: '' }, hf: sseErro });
  const res = await handler(post('Como funciona a votação do Senado?'));
  assert.equal(res.status, 502);
  assert.ok(chamadas.every((c) => c.url.startsWith(HF)));
});

test('resposta REPROVADA no verificador não é refeita na reserva', async () => {
  const { handler, chamadas, cap } = montar({
    env: { ...ENV_HF, MODAL_ASK_ENDPOINT: MODAL },
    hf: () => sse({ ok: true, answer: 'Os candidatos são A e B. O número total de candidaturas válidas é de 5.' }),
  });
  const res = await handler(post('Quem disputa a Presidência?', 'Dados apurados no sistema:\nO TSE registra 13 candidaturas na urna a Presidente da República: A, B'));
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error, 'rejected');
  assert.ok(chamadas.every((c) => !c.url.startsWith(MODAL)), 'mesmo modelo, mesmo risco: não tenta de novo');
  assert.ok(JSON.stringify(cap.eventos).includes('rejected_contagem_sem_fonte'));
});

test('orçamentos separados: o do Hugging Face esgota e a reserva tem o próprio teto', async () => {
  const env = { ...ENV_HF, MODAL_ASK_ENDPOINT: MODAL, HF_ASK_DAILY_BUDGET: '1', MODAL_ASK_DAILY_BUDGET: '1' };
  const { handler, chamadas } = montar({ env });
  assert.equal((await handler(post('pergunta um sobre o senado'))).status, 200);          // Hugging Face
  const segunda = await handler(post('pergunta dois sobre o senado'));                       // HF sem orçamento -> Modal
  assert.equal((await segunda.json()).answer, 'Resposta da reserva.');
  const terceira = await handler(post('pergunta três sobre o senado'));                      // os dois esgotados
  assert.equal(terceira.status, 503);
  assert.equal((await terceira.json()).error, 'budget');
  assert.equal(chamadas.filter((c) => c.url.startsWith(MODAL)).length, 1);
});

test('event_id estranho ou SSE sem "complete" não viram resposta', async () => {
  const a = montar({ env: { ...ENV_HF, MODAL_KEY: '', MODAL_SECRET: '' }, postHf: () => new Response(JSON.stringify({ event_id: '../../x' }), { status: 200 }) });
  assert.equal((await a.handler(post('Como funciona o Senado?'))).status, 502);
  assert.equal(a.chamadas.length, 1, 'não faz o GET com um id inválido');
  assert.equal(lerSseGradio('event: generating\ndata: [1]\n\n'), null);
  assert.deepEqual(lerSseGradio('event: complete\r\ndata: [{"a":1}]\r\n\r\n'), { evento: 'complete', dado: '[{"a":1}]' });
});

// ---------------------------------------------------------------- verificador reforçado
test('contagem inventada: o caso REAL do teste no ZeroGPU ("total de candidaturas válidas é de 5", sendo 13) é reprovado', () => {
  const context = 'Dados apurados no sistema:\nO TSE registra 13 candidaturas na urna a Presidente da República:\n• 13 — LULA (PT)\n• 14 — RENAN SANTOS (MISSÃO)\n• 22 — FLAVIO BOLSONARO (PL)\n• 30 — ZEMA (NOVO)';
  const resposta = 'Os candidatos que disputam a Presidência da República são:\n- LULA (PT)\n- RENAN SANTOS (MISSÃO)\n- FLAVIO BOLSONARO (PL)\n- ZEMA (NOVO)\n- SAMARA (UP)\n\nO número total de candidaturas válidas para a Presidência é de 5.';
  assert.deepEqual(contagensSemFonte(resposta, { q: 'Quem disputa a Presidência?', context }), ['5']);
  assert.deepEqual(verificarRespostaAsk(resposta, { q: 'Quem disputa a Presidência?', context }), { ok: false, motivo: 'contagem_sem_fonte', numeros: ['5'] });
  // com o total certo, que está nos dados, passa
  assert.equal(verificarRespostaAsk(resposta.replace('é de 5', 'é de 13'), { q: 'Quem disputa a Presidência?', context }).ok, true);
  assert.deepEqual(contagensSemFonte('São 7 candidatos a governador.', { context: 'lista: A, B' }), ['7']);
  assert.deepEqual(contagensSemFonte('Governador tem 2 dígitos e o total de dígitos é 2.', { context: 'Governador: 2 dígitos' }), []);
});

test('contradição com o que o app apurou: 2º turno e "foi eleito"', () => {
  const sim = 'Dados apurados no sistema:\nSim, haverá 2º turno para Presidente da República.\n• Nenhum candidato alcançou mais de 50% dos votos válidos no 1º turno\n  1º: FLAVIO BOLSONARO (PL) — 47,03%\n  2º: LULA (PT) — 45,16%';
  const nao = 'Dados apurados no sistema:\nNão haverá 2º turno para Governador em São Paulo.\n• TARCÍSIO (REPUBLICANOS) foi eleito(a) em 1º turno';
  // o erro de 06/10: dizer que não há 2º turno (ou que alguém foi eleito no 1º) quando o app apurou que há
  for (const r of ['Não haverá segundo turno para presidente.', 'Flavio Bolsonaro foi eleito em 1º turno com 47,03%.', 'A eleição foi decidida em turno único.']) {
    assert.equal(contradizDadosDoApp(r, sim), true, r);
    assert.equal(verificarRespostaAsk(r, { q: 'haverá 2º turno para presidente?', context: sim }).ok, false, r);
  }
  assert.equal(contradizDadosDoApp('Sim, haverá segundo turno entre Flavio Bolsonaro e Lula, em 25/10/2026.', sim), false);
  // o inverso: o app apurou que NÃO há e o texto diz que há
  assert.equal(contradizDadosDoApp('Haverá segundo turno para governador em São Paulo.', nao), true);
  assert.equal(contradizDadosDoApp('Não haverá segundo turno: Tarcísio foi eleito em 1º turno.', nao), false);
  // "foi eleito" sem nenhum "eleito" nos dados enviados
  assert.equal(contradizDadosDoApp('Zema foi eleito governador.', 'Dados apurados no sistema:\nPatrimônio declarado: R$ 178.707.610,09 (18 bens)'), true);
  assert.equal(contradizDadosDoApp('Patrimônio declarado: R$ 178.707.610,09.', 'Dados apurados no sistema:\nPatrimônio declarado: R$ 178.707.610,09 (18 bens)'), false);
  // regra geral explicada, sem contexto de apuração, não é contradição
  assert.equal(contradizDadosDoApp('Só haverá 2º turno se ninguém passar de 50% dos votos válidos.', 'Dados apurados no sistema:\nCalendário: 2º turno em 25/10/2026'), false);
});
