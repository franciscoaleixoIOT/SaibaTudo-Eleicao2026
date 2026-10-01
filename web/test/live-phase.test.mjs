// Apuração ao vivo (limites do TSE) e fase do calendário.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerJson } from './support.mjs';
import { ApuracaoClient, MIN_INTERVALO_MS, TTL_MS, TTL_NEGATIVO_MS, parseApuracao, urlApuracao } from '../src/eleicoes2026/js/live.js';
import { FASES, diasEntre, faseDe, formatarBr, hojeBrasilia, menuPrincipal } from '../src/eleicoes2026/js/phase.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const amostra = readFileSync(resolve(aqui, 'fixtures/tse_apuracao_presidente.json'), 'utf8');
const cfg = lerJson('regras.json').resultadosTse;

test('o parser lê a apuração do TSE exatamente como publicada', () => {
  const ap = parseApuracao(amostra, 'PRESIDENTE', 'BR', 1);
  assert.equal(ap.linhas.length, 3);
  assert.equal(ap.geradoEm, '04/10/2026 19:45:10');
  assert.equal(ap.secoesTotalizadasPct, '50,00');
  assert.equal(ap.totalizacaoFinal, false);
  const lula = ap.linhas.find((l) => l.numero === '13');
  assert.equal(lula.votos, 1234567);
  assert.equal(lula.percentual, '46,10'); // texto do TSE, sem reformatar
  assert.equal(lula.sqCandidato, '280002542548');
  assert.equal(lula.eleito, false);
});

test('o parser rejeita JSON inválido ou sem cargos', () => {
  assert.equal(parseApuracao('{nao-json', 'PRESIDENTE', 'BR', 1), null);
  assert.equal(parseApuracao('{"carg":[]}', 'PRESIDENTE', 'BR', 1), null);
  assert.equal(parseApuracao('null', 'PRESIDENTE', 'BR', 1), null);
});

test('URL oficial de apuração por cargo/UF/turno (contrato §5)', () => {
  assert.equal(urlApuracao(cfg, 'PRESIDENTE', 'BR', 1), 'https://resultados.tse.jus.br/oficial/ele2026/6257/dados/br/br-c0001-e006257-u.json');
  assert.equal(urlApuracao(cfg, 'PRESIDENTE', 'BR', 2), 'https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json');
  assert.equal(urlApuracao(cfg, 'GOVERNADOR', 'SP', 1), 'https://resultados.tse.jus.br/oficial/ele2026/6259/dados/sp/sp-c0003-e006259-u.json');
  assert.equal(urlApuracao(cfg, 'SENADOR', 'MG', 2), 'https://resultados.tse.jus.br/oficial/ele2026/6260/dados/mg/mg-c0005-e006260-u.json');
  assert.equal(urlApuracao(cfg, 'VEREADOR', 'SP', 1), null);
});

test('cliente: cache de 60 s, requisição condicional, espaçamento de 500 ms e cache negativo de 5 min', async () => {
  let agora = 1_000_000;
  const esperas = [];
  const chamadas = [];
  const respostas = [
    new Response(amostra, { status: 200, headers: { ETag: '"abc"' } }),
    new Response(null, { status: 304 }),
    new Response('x', { status: 404 }),
    new Response(amostra, { status: 200 })
  ];
  const fetchFn = async (url, init) => { chamadas.push({ url, init }); return respostas.shift(); };
  const c = new ApuracaoClient(() => cfg, { fetchFn, agora: () => agora, esperar: async (ms) => { esperas.push(ms); agora += ms; } });

  const a = await c.obter('PRESIDENTE', 'BR', 1);
  assert.equal(a.linhas.length, 3);
  assert.equal(chamadas[0].url, 'https://resultados.tse.jus.br/oficial/ele2026/6257/dados/br/br-c0001-e006257-u.json');
  assert.equal(chamadas[0].init.credentials, 'omit');

  // dentro do TTL: sem nova requisição
  agora += TTL_MS / 2;
  await c.obter('PRESIDENTE', 'BR', 1);
  assert.equal(chamadas.length, 1);

  // depois do TTL: requisição condicional (If-None-Match); 304 reaproveita o valor
  agora += TTL_MS;
  const b = await c.obter('PRESIDENTE', 'BR', 1);
  assert.equal(chamadas.length, 2);
  assert.equal(chamadas[1].init.headers['If-None-Match'], '"abc"');
  assert.equal(b.linhas.length, 3);

  // governador: 404 => null + cache negativo (não repete por 5 min)
  assert.equal(await c.obter('GOVERNADOR', 'SP', 1), null);
  assert.equal(chamadas.length, 3);
  agora += TTL_MS + 1000;
  assert.equal(await c.obter('GOVERNADOR', 'SP', 1), null);
  assert.equal(chamadas.length, 3, 'dentro dos 5 min do cache negativo');
  agora += TTL_NEGATIVO_MS;
  assert.ok((await c.obter('GOVERNADOR', 'SP', 1)).linhas.length === 3);
  assert.equal(chamadas.length, 4);
  assert.ok(esperas.every((e) => e <= MIN_INTERVALO_MS));
});

test('cliente: chamadas simultâneas são serializadas com ≥ 500 ms entre requisições', async () => {
  let agora = 5_000_000;
  const instantes = [];
  const fetchFn = async () => { instantes.push(agora); return new Response(amostra, { status: 200 }); };
  const c = new ApuracaoClient(() => cfg, { fetchFn, agora: () => agora, esperar: async (ms) => { agora += ms; } });
  await Promise.all([c.obter('PRESIDENTE', 'BR', 1), c.obter('GOVERNADOR', 'SP', 1), c.obter('SENADOR', 'SP', 1)]);
  assert.equal(instantes.length, 3);
  assert.ok(instantes[1] - instantes[0] >= MIN_INTERVALO_MS);
  assert.ok(instantes[2] - instantes[1] >= MIN_INTERVALO_MS);
});

test('cliente: se o cabeçalho condicional falhar (CORS), tenta sem ele e não derruba a resposta', async () => {
  let agora = 9_000_000;
  let n = 0;
  const fetchFn = async (url, init) => {
    n++;
    if (n === 1) return new Response(amostra, { status: 200, headers: { ETag: '"e1"' } });
    if (init.headers?.['If-None-Match']) throw new TypeError('Failed to fetch (preflight)');
    return new Response(amostra, { status: 200 });
  };
  const c = new ApuracaoClient(() => cfg, { fetchFn, agora: () => agora, esperar: async (ms) => { agora += ms; } });
  await c.obter('PRESIDENTE', 'BR', 1);
  agora += TTL_MS + 1;
  const r = await c.obter('PRESIDENTE', 'BR', 1);
  assert.equal(r.linhas.length, 3);
  assert.equal(c.semCabecalhoCondicional, true);
});

test('fase do calendário acompanha as datas oficiais', () => {
  const t1 = '2026-10-04';
  const t2 = '2026-10-25';
  assert.equal(faseDe('2026-10-03', t1, t2), FASES.PRE_ELEICAO);
  assert.equal(faseDe('2026-10-04', t1, t2), FASES.DIA_1T);
  assert.equal(faseDe('2026-10-05', t1, t2), FASES.ENTRE_TURNOS);
  assert.equal(faseDe('2026-10-24', t1, t2), FASES.ENTRE_TURNOS);
  assert.equal(faseDe('2026-10-25', t1, t2), FASES.DIA_2T);
  assert.equal(faseDe('2026-10-26', t1, t2), FASES.POS_ELEICAO);
  assert.equal(FASES.PRE_ELEICAO.mostraResultados, false);
  assert.equal(FASES.POS_ELEICAO.mostraResultados, true);
});

test('datas em Brasília e diferença de dias', () => {
  // 2026-10-04 02:30 UTC ainda é 03/10 em Brasília (UTC-3)
  assert.equal(hojeBrasilia(Date.parse('2026-10-04T02:30:00Z')), '2026-10-03');
  assert.equal(hojeBrasilia(Date.parse('2026-10-04T03:00:00Z')), '2026-10-04');
  assert.equal(diasEntre('2026-10-01', '2026-10-04'), 3);
  assert.equal(diasEntre('2026-10-25', '2026-11-25'), 31);
  assert.equal(diasEntre('2027-02-28', '2028-02-29'), 366);
  assert.equal(formatarBr('2026-10-04'), '04/10/2026');
});

test('o menu muda com a fase: "Resultados e apuração" só após o dia da votação', () => {
  const regras = lerJson('regras.json');
  const pre = menuPrincipal(regras, FASES.PRE_ELEICAO, '2026-10-01');
  assert.ok(!pre.some((m) => m.id === 'menu_resultados'));
  assert.equal(pre[0].id, 'menu_presidente');
  assert.ok(pre[0].description.includes('13 candidaturas'));
  const dia = menuPrincipal(regras, FASES.DIA_1T, '2026-10-04');
  assert.equal(dia[0].id, 'menu_resultados');
  assert.equal(dia.find((m) => m.id === 'menu_calendario').description, 'Hoje: 1º turno • votação 8h às 17h');
});
