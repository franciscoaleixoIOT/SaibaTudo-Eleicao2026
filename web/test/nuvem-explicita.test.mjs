// "Perguntar à IA na nuvem": botão na resposta não entendida (modo automático desligado por padrão). O toque é o consentimento
// para enviar SÓ aquela pergunta; espera até 25 s; sucesso troca a resposta (origem NUVEM, fatos dos dados oficiais); qualquer
// falha mantém a resposta original com um aviso, sem lançar exceção.
import test from 'node:test';
import assert from 'node:assert/strict';
import { motor } from './support.mjs';
import {
  NUVEM_TEXTOS, NuvemNlu, TIMEOUT_NUVEM_EXPLICITA_MS, TIMEOUT_NUVEM_MS, ofereceNuvem, pedirANuvem
} from '../src/eleicoes2026/js/cloud.js';

const NAO_ENTENDIDA = 'asdkjh qwerty';
const OK_RJ = () => new Response(JSON.stringify({ ok: true, nlu: { intent: 'LISTAR_CANDIDATOS', cargo: 'GOVERNADOR', uf: 'RJ' } }), { status: 200 });

/** NuvemNlu com fetch simulado; `automatica` = preferência "IA na nuvem automática". */
function nuvemCom(resposta, { automatica = false, timeoutExplicitoMs } = {}) {
  const chamadas = [];
  const fetchFn = async (url, init) => {
    chamadas.push({ url, init });
    return typeof resposta === 'function' ? resposta(init) : resposta;
  };
  const nuvem = new NuvemNlu({ fetchFn, installId: () => 'iid-teste', habilitada: () => automatica, timeoutMs: 500, ...(timeoutExplicitoMs ? { timeoutExplicitoMs } : {}) });
  return { chamadas, nuvem };
}

test('textos: botão, nota, espera, falha e a chave "IA na nuvem automática" (Configurações/boas-vindas)', () => {
  assert.equal(NUVEM_TEXTOS.botao, 'Perguntar à IA na nuvem');
  assert.equal(NUVEM_TEXTOS.nota, 'Envia só o texto desta pergunta ao nosso servidor para interpretar; a resposta continua vindo dos dados oficiais. Pode levar até 20 s.');
  assert.equal(NUVEM_TEXTOS.consultando, 'Consultando a IA na nuvem…');
  assert.equal(NUVEM_TEXTOS.falhou, 'A IA na nuvem não conseguiu interpretar agora (indisponível ou demorou demais). Tente reformular citando cargo, estado, partido, nome ou número do candidato.');
  assert.equal(NUVEM_TEXTOS.chave, 'IA na nuvem automática');
  assert.equal(NUVEM_TEXTOS.descricaoChave,
    'Desligada por padrão. Quando o app não entende uma pergunta, você pode tocar em "Perguntar à IA na nuvem" para enviar só aquela pergunta. ' +
    'Ligue aqui para isso acontecer automaticamente. Só o texto da pergunta é enviado, com um código aleatório da instalação; as respostas vêm sempre dos dados oficiais.');
});

test('modo automático desligado: a pergunta não entendida NÃO vai à nuvem e o cartão oferece o botão', async () => {
  const { chamadas, nuvem } = nuvemCom(OK_RJ);
  const etapas = [];
  const local = await (await motor({ nuvem })).responder(NAO_ENTENDIDA, { onEtapa: (e) => etapas.push(e) });
  assert.equal(local.resolvida, false);
  assert.equal(local.origem, 'LOCAL');
  assert.equal(chamadas.length, 0, 'nada é enviado sem o toque');
  assert.ok(!etapas.includes('nuvem'), 'sem aviso de "IA na nuvem analisando" quando nada será enviado');
  assert.equal(ofereceNuvem(local, false), true);
});

test('modo automático ligado: a nuvem já foi tentada, então o cartão NÃO oferece o botão', async () => {
  const { chamadas, nuvem } = nuvemCom(() => new Response(JSON.stringify({ ok: false, error: 'disabled' }), { status: 503 }), { automatica: true });
  const local = await (await motor({ nuvem })).responder(NAO_ENTENDIDA);
  assert.equal(local.resolvida, false);
  assert.equal(chamadas.length, 1, 'tentativa automática');
  assert.equal(ofereceNuvem(local, true), false);
});

test('o botão só aparece para perguntas não entendidas (nem para respostas entendidas, da nuvem ou falha interna do motor)', async () => {
  const m = await motor();
  const entendida = await m.responder('Quem disputa a Presidência?');
  assert.equal(entendida.resolvida, true);
  assert.equal(ofereceNuvem(entendida, false), false);
  const naoEntendida = await m.responder(NAO_ENTENDIDA);
  assert.equal(ofereceNuvem({ ...naoEntendida, origem: 'NUVEM' }, false), false);
  assert.equal(ofereceNuvem({ ...naoEntendida, erro: true }, false), false);
  assert.equal(ofereceNuvem(null, false), false);
});

test('toque no botão: envia UMA requisição só com o texto da pergunta e a resposta é trocada (origem NUVEM, dados oficiais)', async () => {
  const { chamadas, nuvem } = nuvemCom(OK_RJ);
  const m = await motor({ nuvem });
  const local = await m.responder(NAO_ENTENDIDA);
  const r = await pedirANuvem({ engine: m, atual: local, pergunta: NAO_ENTENDIDA });
  assert.equal(r.ok, true);
  assert.equal(r.resposta.origem, 'NUVEM');
  assert.equal(r.resposta.resolvida, true);
  assert.equal(r.resposta.filters.estadoUf, 'RJ', 'filtros sugeridos como numa resposta normal');
  assert.equal(r.resposta.filters.cargo, 'GOVERNADOR');
  assert.ok(r.resposta.directAnswer.includes('candidaturas na urna a Governador no Rio de Janeiro'), r.resposta.directAnswer);
  assert.equal(ofereceNuvem(r.resposta, false), false, 'a nova resposta não oferece o botão de novo');
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].url, '/api/nlu');
  assert.equal(chamadas[0].init.method, 'POST');
  assert.equal(chamadas[0].init.credentials, 'omit');
  const corpo = JSON.parse(chamadas[0].init.body);
  assert.deepEqual(Object.keys(corpo).sort(), ['client', 'iid', 'q', 'v']);
  assert.deepEqual(corpo, { q: NAO_ENTENDIDA, v: 1, client: 'web', iid: 'iid-teste' });
  // o pedido avulso não liga o modo automático: a próxima pergunta não entendida continua sem envio
  await m.responder('zxcvb poiuy');
  assert.equal(chamadas.length, 1);
});

test('pedido explícito espera até 25 s (o modo automático continua com ~14 s)', async (t) => {
  assert.equal(TIMEOUT_NUVEM_EXPLICITA_MS, 25_000);
  assert.equal(TIMEOUT_NUVEM_MS, 14_000);
  const padrao = new NuvemNlu({ installId: () => 'i', habilitada: () => false });
  assert.equal(padrao.timeoutExplicitoMs, 25_000);
  assert.equal(padrao.timeoutMs, 14_000);

  t.mock.timers.enable({ apis: ['setTimeout'] });
  const escoar = () => new Promise((r) => setImmediate(r));
  // fetch que só termina quando é abortado (backend lento / partida a frio)
  const lento = (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
  const espera = async (inicio, ms) => {
    let fim = false;
    const p = inicio().then((v) => { fim = true; return v; });
    t.mock.timers.tick(ms - 1);
    await escoar();
    assert.equal(fim, false, `ainda esperando em ${ms - 1} ms`);
    t.mock.timers.tick(1);
    assert.equal(await p, null, `desiste em ${ms} ms`);
  };
  const explicita = new NuvemNlu({ fetchFn: lento, installId: () => 'iid', habilitada: () => false });
  await espera(() => explicita.interpretarAgora(NAO_ENTENDIDA, null), 25_000);
  const automatica = new NuvemNlu({ fetchFn: lento, installId: () => 'iid', habilitada: () => true });
  await espera(() => automatica.interpretar(NAO_ENTENDIDA, null), 14_000);
});

test('falhas do pedido explícito (503 desligado/orçamento, 429, 5xx, tempo esgotado, rede, JSON inválido, interpretação desconhecida) mantêm a resposta original', async () => {
  const json = (status, corpo, headers = {}) => () => new Response(JSON.stringify(corpo), { status, headers });
  const lento = (init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
  const casos = {
    '503 desligado': json(503, { ok: false, error: 'disabled' }),
    '503 orçamento': json(503, { ok: false, error: 'budget' }),
    '429 limite': json(429, { ok: false, error: 'rate_limited' }, { 'Retry-After': '30' }),
    '502 upstream': json(502, { ok: false, error: 'upstream' }),
    '504 timeout do backend': json(504, { ok: false, error: 'timeout' }),
    'tempo esgotado (abort)': lento,
    'rede fora': () => { throw new TypeError('Failed to fetch'); },
    'JSON inválido': () => new Response('<html>erro</html>', { status: 200 }),
    'ok:false': json(200, { ok: false }),
    'intenção desconhecida': json(200, { ok: true, nlu: { intent: 'DESCONHECIDA' } }),
    'intenção inventada': json(200, { ok: true, nlu: { intent: 'HACKEAR' } }),
    'nome alucinado': json(200, { ok: true, nlu: { intent: 'PERFIL_CANDIDATO', nome: 'Nome Que Nao Existe' } })
  };
  for (const [nome, resposta] of Object.entries(casos)) {
    const { chamadas, nuvem } = nuvemCom(resposta, { timeoutExplicitoMs: 60 });
    const m = await motor({ nuvem });
    const local = await m.responder(NAO_ENTENDIDA);
    const r = await pedirANuvem({ engine: m, atual: local, pergunta: NAO_ENTENDIDA });
    assert.equal(r.ok, false, nome);
    assert.equal(r.resposta, local, `${nome}: a resposta original é mantida`);
    assert.equal(chamadas.length, 1, `${nome}: uma única requisição`);
  }
});

test('interpretação válida que ainda não resolve a pergunta e exceções do motor também caem no aviso (nunca lançam)', async () => {
  const local = await (await motor()).responder(NAO_ENTENDIDA);
  // a nuvem devolve algo que passa adiante, mas o montador de respostas continua sem entender
  const naoResolve = { interpretarAgora: async (q) => ({ intent: 'DESCONHECIDA', cargo: null, uf: null, partido: null, nome: null, numero: null, nacional: false, textoOriginal: q }) };
  const m = await motor({ nuvem: naoResolve });
  assert.equal(await m.perguntarANuvem(NAO_ENTENDIDA), null);
  assert.deepEqual(await pedirANuvem({ engine: m, atual: local, pergunta: NAO_ENTENDIDA }), { ok: false, resposta: local });
  // cliente que lança dentro do motor
  const quebra = await motor({ nuvem: { interpretarAgora: () => { throw new Error('bug'); } } });
  assert.deepEqual(await pedirANuvem({ engine: quebra, atual: local, pergunta: NAO_ENTENDIDA }), { ok: false, resposta: local });
  // motor que lança ou devolve resposta não resolvida
  for (const engine of [
    { perguntarANuvem: async () => { throw new Error('x'); } },
    { perguntarANuvem: () => { throw new Error('síncrono'); } },
    { perguntarANuvem: async () => ({ ...local, origem: 'NUVEM' }) }
  ]) {
    assert.deepEqual(await pedirANuvem({ engine, atual: local, pergunta: NAO_ENTENDIDA }), { ok: false, resposta: local });
  }
  // sem cliente de nuvem configurado
  assert.equal(await (await motor()).perguntarANuvem(NAO_ENTENDIDA), null);
});
