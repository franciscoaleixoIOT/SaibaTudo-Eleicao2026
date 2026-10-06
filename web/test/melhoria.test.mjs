// "Ajudar a melhorar o app": captura opcional das perguntas que o app não entendeu (web/src/eleicoes2026/js/melhoria.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LIMITE_FILA, LOTE, MELHORIA_TEXTOS, MIN_PARA_ENVIAR, FilaMelhoria, melhoriaLigada, revelaOpiniao, textoEnfileiravel } from '../src/eleicoes2026/js/melhoria.js';
import { RAIZ } from './support.mjs';
import { PADRAO, sanear } from '../src/eleicoes2026/js/prefs.js';

const memoria = () => {
  let lista = [];
  return { ler: () => lista, gravar: (l) => { lista = l; }, apagar: () => { lista = []; } };
};

function fila({ ligada = true, noPacote = true, resposta, armazenamento = memoria() } = {}) {
  const chamadas = [];
  const fetchFn = async (url, init) => {
    chamadas.push({ url, init, corpo: JSON.parse(init.body) });
    return resposta ? resposta(init) : new Response(JSON.stringify({ ok: true, aceitas: 1, descartadas: 0 }), { status: 200 });
  };
  const estado = { ligada, noPacote };
  const f = new FilaMelhoria({ habilitada: () => estado.ligada, noPacote: () => estado.noPacote, installId: () => 'iid-teste', fetchFn, armazenamento });
  return { f, chamadas, estado, armazenamento };
}

test('o pacote assinado só liga com enabled === true (padrão: desligado)', () => {
  assert.equal(melhoriaLigada(null), false);
  assert.equal(melhoriaLigada({}), false);
  assert.equal(melhoriaLigada({ cliente: { melhoria: {} } }), false);
  assert.equal(melhoriaLigada({ cliente: { melhoria: { enabled: 'true' } } }), false);
  assert.equal(melhoriaLigada({ cliente: { melhoria: { enabled: true } } }), true);
});

test('a preferência é opt-in: desligada por padrão e saneada como booleano', () => {
  assert.equal(PADRAO.melhoria, false);
  assert.equal(sanear({}).melhoria, false);
  assert.equal(sanear({ melhoria: 'sim' }).melhoria, false);
  assert.equal(sanear({ melhoria: true }).melhoria, true);
});

test('texto de consentimento: desligado por padrão, sem identificar, avisa de opinião política e de e-mail/CPF/telefone', () => {
  assert.match(MELHORIA_TEXTOS.descricao, /Desligado por padrão/);
  assert.match(MELHORIA_TEXTOS.descricao, /opinião política/);
  assert.match(MELHORIA_TEXTOS.descricao, /e-mail, CPF ou telefone/);
  assert.match(MELHORIA_TEXTOS.descricao, /apagado/);
});

test('textoEnfileiravel: limites e dados pessoais derrubam a pergunta', () => {
  assert.equal(textoEnfileiravel('  quando   é a eleição '), 'quando é a eleição');
  assert.equal(textoEnfileiravel('oi'), null);
  assert.equal(textoEnfileiravel('x'.repeat(301)), null);
  assert.equal(textoEnfileiravel('meu cpf é 123.456.789-09'), null);
  assert.equal(textoEnfileiravel('fale com joao@exemplo.com'), null);
  assert.equal(textoEnfileiravel('me liga 11 98765-4321'), null);
  assert.equal(textoEnfileiravel('título 123456789012'), null);
  assert.equal(textoEnfileiravel('candidato 2222'), 'candidato 2222', 'número de urna (curto) é permitido');
  assert.equal(textoEnfileiravel(42), null);
});

test('sem o pacote ligando OU sem a pessoa ligar, NADA entra na fila e NADA é enviado', async () => {
  for (const cfg of [{ ligada: false, noPacote: true }, { ligada: true, noPacote: false }, { ligada: false, noPacote: false }]) {
    const { f, chamadas } = fila(cfg);
    assert.equal(f.enfileirar('quando é a eleição'), false);
    assert.deepEqual(f.pendentes(), []);
    assert.equal(await f.enviarSePreciso({ forcar: true }), 'inativa');
    assert.equal(chamadas.length, 0);
  }
});

test('enfileira sem repetir (sem diferenciar caixa) e respeita o limite da fila', () => {
  const { f } = fila();
  assert.equal(f.enfileirar('Quando é a eleição'), true);
  assert.equal(f.enfileirar('quando é a eleição'), false);
  for (let i = 0; i < LIMITE_FILA + 10; i++) f.enfileirar(`pergunta numero ${i}`);
  assert.equal(f.pendentes().length, LIMITE_FILA);
  assert.equal(f.pendentes().at(-1), `pergunta numero ${LIMITE_FILA + 9}`, 'as mais novas ficam');
});

test('só envia com perguntas suficientes (ou forçando) e em lotes', async () => {
  const { f, chamadas } = fila();
  f.enfileirar('pergunta um'); f.enfileirar('pergunta dois');
  assert.equal(await f.enviarSePreciso(), 'nada', `menos de ${MIN_PARA_ENVIAR}: espera`);
  assert.equal(chamadas.length, 0);
  f.enfileirar('pergunta tres');
  assert.equal(await f.enviarSePreciso(), 'enviado');
  assert.equal(chamadas.length, 1);
  assert.deepEqual(f.pendentes(), []);

  const g = fila();
  for (let i = 0; i < LOTE + 5; i++) g.f.enfileirar(`pergunta lote ${i}`);
  assert.equal(await g.f.enviarSePreciso(), 'enviado');
  assert.equal(g.chamadas[0].corpo.itens.length, LOTE, 'no máximo LOTE por envio');
  assert.equal(g.f.pendentes().length, 5, 'o resto continua na fila');
});

test('o envio leva SÓ o texto: sem resposta, intenção, horário ou identificação além do iid aleatório', async () => {
  const { f, chamadas } = fila();
  f.enfileirar('que dia é o pleito'); f.enfileirar('onde fica a seção'); f.enfileirar('posso votar de bermuda');
  await f.enviarSePreciso();
  const { url, init, corpo } = chamadas[0];
  assert.equal(url, '/api/melhoria');
  assert.equal(init.credentials, 'omit');
  assert.deepEqual(Object.keys(corpo).sort(), ['client', 'iid', 'itens', 'v']);
  assert.equal(corpo.client, 'web');
  assert.equal(corpo.iid, 'iid-teste');
  assert.deepEqual(corpo.itens.map((i) => Object.keys(i)), [['q'], ['q'], ['q']]);
});

test('falhas (503 desligado, 429, rede, ok:false) mantêm a fila; só o 400 descarta o lote impossível', async () => {
  for (const [resposta, status] of [
    [() => new Response(JSON.stringify({ ok: false, error: 'disabled' }), { status: 503 }), 'falhou'],
    [() => new Response('{}', { status: 429 }), 'falhou'],
    [() => new Response(JSON.stringify({ ok: false }), { status: 200 }), 'falhou'],
  ]) {
    const { f } = fila({ resposta });
    ['um dois', 'tres quatro', 'cinco seis'].forEach((q) => f.enfileirar(q));
    assert.equal(await f.enviarSePreciso(), status);
    assert.equal(f.pendentes().length, 3, 'mantida para tentar depois');
  }
  const rede = fila({ resposta: () => { throw new Error('offline'); } });
  ['um dois', 'tres quatro', 'cinco seis'].forEach((q) => rede.f.enfileirar(q));
  assert.equal(await rede.f.enviarSePreciso(), 'falhou');
  assert.equal(rede.f.pendentes().length, 3);

  const invalido = fila({ resposta: () => new Response(JSON.stringify({ ok: false, error: 'bad_request' }), { status: 400 }) });
  ['um dois', 'tres quatro', 'cinco seis'].forEach((q) => invalido.f.enfileirar(q));
  assert.equal(await invalido.f.enviarSePreciso(), 'falhou');
  assert.equal(invalido.f.pendentes().length, 0, 'lote que o servidor nunca aceitará não trava a fila');
});

test('não envia duas vezes ao mesmo tempo', async () => {
  let libera;
  const f = new FilaMelhoria({
    habilitada: () => true, noPacote: () => true, installId: () => 'iid', armazenamento: memoria(),
    fetchFn: () => new Promise((res) => { libera = () => res(new Response(JSON.stringify({ ok: true }), { status: 200 })); })
  });
  ['um dois', 'tres quatro', 'cinco seis'].forEach((q) => f.enfileirar(q));
  const primeiro = f.enviarSePreciso();
  assert.equal(await f.enviarSePreciso(), 'nada');
  libera();
  assert.equal(await primeiro, 'enviado');
});

test('desligar a opção apaga o que ainda não foi enviado', () => {
  const { f, estado } = fila();
  f.enfileirar('pergunta um'); f.enfileirar('pergunta dois');
  estado.ligada = false;
  f.limpar();
  assert.deepEqual(f.pendentes(), []);
});

// ---- perguntas que revelam a opinião/preferência política não saem do aparelho (contrato com o servidor e o Android) ----
const casosOpiniao = JSON.parse(readFileSync(resolve(RAIZ, 'contracts/opiniao_cases.json'), 'utf8')).cases;

test('contrato de opinião: o filtro do site concorda com o do servidor e do Android em todos os casos', () => {
  const erros = casosOpiniao.filter((c) => revelaOpiniao(c.q) !== c.opiniao).map((c) => `${c.opiniao ? 'deveria barrar' : 'deveria passar'}: ${c.q}`);
  assert.deepEqual(erros, []);
});

test('pergunta que revela opinião não entra na fila nem é enviada; a neutra entra', () => {
  const { f, chamadas } = fila();
  assert.equal(textoEnfileiravel('Quero que fulano ganhe, o que posso fazer?'), null);
  assert.equal(textoEnfileiravel('Qual estratégia para aumentar as chances de fulano ganhar?'), null);
  assert.equal(f.enfileirar('Quero que fulano ganhe, o que posso fazer?'), false);
  assert.equal(f.enfileirar('Qual estratégia para aumentar as chances de fulano ganhar?'), false);
  assert.deepEqual(f.pendentes(), []);
  assert.equal(f.enfileirar('Como justificar o voto?'), true);
  assert.deepEqual(f.pendentes(), ['Como justificar o voto?']);
  assert.equal(chamadas.length, 0);
});

test('o texto de consentimento avisa que perguntas que revelam opinião ou preferência política não são enviadas', () => {
  assert.match(MELHORIA_TEXTOS.descricao, /revelar sua opinião ou preferência política/);
  assert.match(MELHORIA_TEXTOS.descricao, /não são enviadas/);
  assert.match(MELHORIA_TEXTOS.descricao, /nenhum filtro é perfeito/);
});
