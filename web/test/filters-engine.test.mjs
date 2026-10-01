// Filtros determinísticos, carga sob demanda no motor de IA e IA na nuvem (opt-in, validada contra os dados locais).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE, DADOS, fetchDeDisco, pacoteCompleto } from './support.mjs';
import { DataStore } from '../src/eleicoes2026/js/data.js';
import { Engine } from '../src/eleicoes2026/js/engine.js';
import { filtrar, novoFiltro, ufsNecessarias } from '../src/eleicoes2026/js/filters.js';
import { NuvemNlu, TIMEOUT_NUVEM_MS, enviarRelato, validarNluNuvem } from '../src/eleicoes2026/js/cloud.js';
import { urlFotoRemota } from '../src/eleicoes2026/js/model.js';

test('filtro por UF inclui os nacionais e a ordem é fixa (cargo, UF, número) e determinística', async () => {
  const { store } = await pacoteCompleto();
  const d = store.candidatos;
  const sp = filtrar(d, novoFiltro({ estadoUf: 'SP' }));
  assert.ok(sp.some((c) => c.estadoUf === 'BR'));
  assert.ok(sp.every((c) => c.estadoUf === 'SP' || c.estadoUf === 'BR'));
  const ordem = sp.map((c) => c.cargoCodigo);
  assert.ok(ordem.indexOf('PRESIDENTE') < ordem.indexOf('GOVERNADOR'));
  assert.ok(ordem.indexOf('GOVERNADOR') < ordem.indexOf('DEPUTADO_FEDERAL'));
  assert.deepEqual(sp.map((c) => c.id), filtrar(d, novoFiltro({ estadoUf: 'SP' })).map((c) => c.id));
  // dentro do mesmo cargo/UF, ordenado pelo número
  const gov = filtrar(d, novoFiltro({ estadoUf: 'SP', cargo: 'GOVERNADOR' })).filter((c) => c.cargoCodigo === 'GOVERNADOR').map((c) => Number(c.numero));
  assert.deepEqual(gov, [...gov].sort((a, b) => a - b));
});

test('filtros de situação, histórico, tema, região, partido, urna e busca', async () => {
  const { store } = await pacoteCompleto();
  const d = store.candidatos;
  assert.ok(filtrar(d, novoFiltro({ apenasDeferidas: true, apenasNaUrna: false })).every((c) => c.elegibilidade.apta === true));
  assert.ok(filtrar(d, novoFiltro({ historico: 'NUNCA_ELEITO' })).every((c) => c.vezesEleito === 0));
  assert.ok(filtrar(d, novoFiltro({ historico: 'ELEITO_2_OU_MAIS' })).every((c) => c.vezesEleito >= 2));
  assert.ok(filtrar(d, novoFiltro({ historico: 'ELEITO_MESMO_CARGO' })).every((c) => c.eleitoMesmoCargo));
  const comTema = filtrar(d, novoFiltro({ tema: 'saude' }));
  assert.ok(comTema.length > 0 && comTema.every((c) => c.temasPlano.includes('saude')));
  const sudeste = filtrar(d, novoFiltro({ regiao: 'Sudeste' }));
  assert.ok(sudeste.every((c) => c.regiao === 'Sudeste' || c.estadoUf === 'BR'));
  assert.ok(filtrar(d, novoFiltro({ partido: 'pt' })).every((c) => c.partido === 'PT'));
  assert.ok(filtrar(d, novoFiltro({ cargo: 'PRESIDENTE' })).every((c) => c.naUrna));
  assert.ok(filtrar(d, novoFiltro({ cargo: 'PRESIDENTE', apenasNaUrna: false })).some((c) => !c.naUrna));
  assert.ok(filtrar(d, novoFiltro({ buscaTexto: 'tarcísio' })).some((c) => c.nomeUrna.includes('TARC')));
  assert.ok(filtrar(d, novoFiltro({ buscaTexto: '13', cargo: 'PRESIDENTE' })).some((c) => c.numero === '13'));
  assert.equal(filtrar(d, novoFiltro({ apenasEleitos: true })).length, 0, 'sem resultados publicados, ninguém consta como eleito');
  // cargo SENADOR inclui suplentes; DEPUTADO_ESTADUAL inclui distritais
  const sen = new Set(filtrar(d, novoFiltro({ cargo: 'SENADOR' })).map((c) => c.cargoCodigo));
  assert.ok(sen.has('SENADOR') && sen.has('SUPLENTE_1') && sen.has('SUPLENTE_2'));
  const est = new Set(filtrar(d, novoFiltro({ cargo: 'DEPUTADO_ESTADUAL' })).map((c) => c.cargoCodigo));
  assert.ok(est.has('DEPUTADO_ESTADUAL') && est.has('DEPUTADO_DISTRITAL'));
});

test('fatias necessárias para cada filtro (carga sob demanda)', () => {
  assert.deepEqual(ufsNecessarias(novoFiltro({ cargo: 'PRESIDENTE' })), ['BR']);
  assert.deepEqual(ufsNecessarias(novoFiltro({ estadoUf: 'SP' })).sort(), ['BR', 'SP']);
  assert.deepEqual(ufsNecessarias(novoFiltro({ regiao: 'Sul' })).sort(), ['BR', 'PR', 'RS', 'SC']);
  assert.equal(ufsNecessarias(novoFiltro()).length, 28);
  assert.equal(ufsNecessarias(novoFiltro({ cargo: 'GOVERNADOR' })).length, 28);
});

test('eleitos aparecem somente quando o TSE publica resultados (merge de resultados/<UF>.json)', async () => {
  // pacote sintético mínimo: um shard de candidatos + resultados
  const enc = new TextEncoder();
  const { webcrypto } = await import('node:crypto');
  const { sha256Hex } = await import('../src/eleicoes2026/js/verify.js');
  const cand = [
    { id: '10', numero: '13', nomeUrna: 'ALFA', nomeCompleto: 'ALFA', cargo: 'GOVERNADOR', partido: 'PT', estadoUf: 'SP', elegibilidade: 'DEFERIDA', naUrna: true },
    { id: '11', numero: '22', nomeUrna: 'BETA', nomeCompleto: 'BETA', cargo: 'GOVERNADOR', partido: 'PL', estadoUf: 'SP', elegibilidade: 'DEFERIDA', naUrna: true }
  ];
  const res = { 10: { situacaoTotalizacao: 'ELEITO', 1: { votos: 100, percentual: 55.5, situacao: 'Eleito' } }, 11: { situacaoTotalizacao: 'NÃO ELEITO', 1: { votos: 80, percentual: 44.5, situacao: 'Não eleito' } } };
  const par = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const arq = new Map([
    ['regras.json', enc.encode(JSON.stringify({ turno1: '2026-10-04', turno2: '2026-10-25', estatisticas: { porPartido: { PT: 1, PL: 1 } }, ordemVotacaoUrna: [] }))],
    ['candidatos/SP.json', enc.encode(JSON.stringify(cand))],
    ['resultados/SP.json', enc.encode(JSON.stringify(res))]
  ]);
  const lista = [];
  for (const [path, b] of arq) lista.push({ path, bytes: b.length, sha256: await sha256Hex(b) });
  const manifesto = enc.encode(JSON.stringify({ schemaVersion: 1, dataVersion: 'r1', generatedAt: '2026-10-05T00:00:00Z', arquivos: lista, resultadosDisponiveis: true }));
  const raw = new Uint8Array(await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, par.privateKey, manifesto));
  const inteiro = (v) => { let i = 0; while (i < 31 && v[i] === 0) i++; let x = v.slice(i); if (x[0] & 0x80) x = new Uint8Array([0, ...x]); return [0x02, x.length, ...x]; };
  const corpo = [...inteiro(raw.slice(0, 32)), ...inteiro(raw.slice(32))];
  arq.set('manifest.json', manifesto);
  arq.set('manifest.sig', enc.encode(Buffer.from(new Uint8Array([0x30, corpo.length, ...corpo])).toString('base64')));
  const fetchFn = async (url) => { const b = arq.get(String(url).split('?')[0].replace('http://r.local/d/', '')); return b ? new Response(b) : new Response('', { status: 404 }); };
  const spki = Buffer.from(await webcrypto.subtle.exportKey('spki', par.publicKey)).toString('base64');
  const store = new DataStore({ baseUrl: 'http://r.local/d/', fetchFn, chavePublica: spki });
  await store.iniciar();
  await store.ensureUfs(['SP']);
  const eleitos = filtrar(store.candidatos, novoFiltro({ apenasEleitos: true }));
  assert.deepEqual(eleitos.map((c) => c.id), ['10']);
  const motor = new Engine({ store, hoje: () => '2026-10-05', apuracao: { obter: async () => null } });
  const r = await motor.responder('Quem foi eleito governador em SP?');
  assert.ok(r.directAnswer.includes('Eleito para Governador em SP segundo o TSE: ALFA (PT, nº 13)'), r.directAnswer);
  const perfil = await motor.responder('Quem é Alfa?');
  assert.ok(perfil.directAnswer.includes('Resultado oficial: ELEITO 1º turno: 100 votos (55,50%);'), perfil.directAnswer);
});

test('motor: carga sob demanda — só BR para presidente, BR+UF para perguntas de UF, tudo para nomes', async () => {
  const lidos = [];
  const store = new DataStore({ baseUrl: BASE, fetchFn: fetchDeDisco(DADOS, BASE, lidos) });
  await store.iniciar();
  const motor = new Engine({ store, hoje: () => '2026-10-01' });

  const cal = await motor.responder('Quando é a eleição?'); // independe de candidaturas
  assert.ok(cal.directAnswer.includes('daqui a 3 dias'));
  assert.deepEqual(store.ufsCarregadas, []);

  const pres = await motor.responder('Quem disputa a Presidência?');
  assert.ok(pres.directAnswer.includes('13 candidaturas na urna'));
  assert.deepEqual(store.ufsCarregadas, ['BR']);

  const gov = await motor.responder('Candidatos a governador em SP');
  assert.deepEqual(store.ufsCarregadas.sort(), ['BR', 'SP']);
  assert.ok(gov.directAnswer.includes('candidaturas na urna a Governador em São Paulo'), gov.directAnswer);
  assert.ok(!lidos.includes('candidatos/RJ.json'));

  const nome = await motor.responder('Quem é Pablo Marçal?'); // nome: precisa de todas as UFs
  assert.equal(store.todasCarregadas, true);
  assert.ok(nome.directAnswer.includes('Candidatura indeferida'));
});

test('motor: ao carregar mais UFs a pergunta é reinterpretada (nome de candidato de outra UF)', async () => {
  const store = new DataStore({ baseUrl: BASE, fetchFn: fetchDeDisco() });
  await store.iniciar();
  await store.ensureUfs(['BR']);
  const motor = new Engine({ store, hoje: () => '2026-10-01' });
  const r = await motor.responder('Quem é Celso Russomanno?'); // deputado federal por SP
  assert.equal(r.intent, 'PERFIL_CANDIDATO');
  assert.ok(r.directAnswer.includes('CELSO RUSSOMANNO'));
});

// ---------------------------------------------------------------------------------------------- IA na nuvem

test('validador da nuvem aceita vocabulário conhecido e descarta alucinações', async () => {
  const { gaz } = await pacoteCompleto();
  const ok = validarNluNuvem({ intent: 'LISTAR_CANDIDATOS', cargo: 'governador', uf: 'sp', partido: 'pt' }, gaz, 'x');
  assert.equal(ok.cargo, 'GOVERNADOR');
  assert.equal(ok.uf, 'SP');
  assert.equal(ok.partido, 'PT');
  assert.equal(validarNluNuvem({ intent: 'LISTAR_CANDIDATOS', cargo: 'IMPERADOR', uf: 'XX', partido: 'PARTIDO_FANTASMA' }, gaz, 'x'), null);
  assert.equal(validarNluNuvem({ intent: 'PERFIL_CANDIDATO', nome: 'Fulano Inexistente da Silva' }, gaz, 'x'), null);
  assert.equal(validarNluNuvem({ intent: 'PERFIL_CANDIDATO', nome: 'Lula' }, gaz, 'x').intent, 'PERFIL_CANDIDATO');
  assert.equal(validarNluNuvem({ intent: 'DESCONHECIDA' }, gaz, 'x'), null);
  assert.equal(validarNluNuvem({ intent: 'HACKEAR' }, gaz, 'x'), null);
  assert.equal(validarNluNuvem({ cargo: 'SENADOR' }, gaz, 'x'), null);
});

function nuvemCom(resposta, { ligada = true } = {}) {
  const chamadas = [];
  const fetchFn = async (url, init) => {
    chamadas.push({ url, init });
    return typeof resposta === 'function' ? resposta() : resposta;
  };
  return { chamadas, nuvem: new NuvemNlu({ fetchFn, installId: () => 'iid-teste', habilitada: () => ligada, timeoutMs: 500 }) };
}

test('a pergunta entendida localmente NUNCA vai à nuvem', async () => {
  const { chamadas, nuvem } = nuvemCom(new Response('{}'));
  const motor = await import('./support.mjs').then((m) => m.motor({ nuvem }));
  const r = await motor.responder('Quem disputa a Presidência?');
  assert.equal(r.origem, 'LOCAL');
  assert.equal(chamadas.length, 0);
});

test('pergunta não entendida usa a nuvem SOMENTE com consentimento; a resposta factual vem dos dados locais', async () => {
  const corpo = JSON.stringify({ ok: true, nlu: { intent: 'LISTAR_CANDIDATOS', cargo: 'GOVERNADOR', uf: 'RJ' } });
  const sem = nuvemCom(new Response(corpo), { ligada: false });
  const { motor } = await import('./support.mjs');
  const a = await (await motor({ nuvem: sem.nuvem })).responder('asdkjh qwerty');
  assert.equal(a.resolvida, false);
  assert.equal(sem.chamadas.length, 0, 'sem consentimento nada é enviado');

  const com = nuvemCom(new Response(corpo));
  const b = await (await motor({ nuvem: com.nuvem })).responder('asdkjh qwerty');
  assert.equal(com.chamadas.length, 1);
  assert.equal(b.origem, 'NUVEM');
  assert.equal(b.resolvida, true);
  assert.equal(b.filters.estadoUf, 'RJ');
  assert.ok(b.directAnswer.includes('candidaturas na urna a Governador em Rio de Janeiro'), b.directAnswer);
  const enviado = JSON.parse(com.chamadas[0].init.body);
  assert.deepEqual(Object.keys(enviado).sort(), ['client', 'iid', 'q', 'v']);
  assert.equal(enviado.client, 'web');
  assert.equal(enviado.iid, 'iid-teste');
  assert.equal(enviado.v, 1);
  assert.equal(com.chamadas[0].url, '/api/nlu');
  assert.equal(com.chamadas[0].init.method, 'POST');
  assert.equal(com.chamadas[0].init.credentials, 'omit');
});

test('falhas da nuvem (HTTP, JSON inválido, alucinação) caem para a resposta local', async () => {
  const { motor } = await import('./support.mjs');
  for (const resp of [
    () => new Response('erro', { status: 503 }),
    () => new Response('isto não é json'),
    () => new Response(JSON.stringify({ ok: true, nlu: { intent: 'PERFIL_CANDIDATO', nome: 'Nome Que Nao Existe' } })),
    () => new Response(JSON.stringify({ ok: false })),
    () => { throw new TypeError('offline'); }
  ]) {
    const { nuvem } = nuvemCom(resp);
    const r = await (await motor({ nuvem })).responder('asdkjh qwerty');
    assert.equal(r.origem, 'LOCAL');
    assert.equal(r.resolvida, false);
  }
});

test('relato de problema só envia o necessário e nenhum dado pessoal', async () => {
  const chamadas = [];
  const ok = await enviarRelato(
    { pergunta: 'p'.repeat(400), resposta: 'r'.repeat(2000), intencao: 'LISTAR_CANDIDATOS', origem: 'LOCAL', versaoDados: 'v1', versaoApp: 'web 1', comentario: 'c'.repeat(900) },
    { fetchFn: async (u, i) => { chamadas.push({ u, i }); return new Response('{}', { status: 200 }); } }
  );
  assert.equal(ok, true);
  const b = JSON.parse(chamadas[0].i.body);
  assert.deepEqual(Object.keys(b).sort(), ['a', 'app', 'client', 'dataVersion', 'intent', 'note', 'origem', 'q']);
  assert.equal(b.q.length, 300);
  assert.equal(b.a.length, 1500);
  assert.equal(b.note.length, 500);
  assert.equal(b.client, 'web');
  assert.equal(chamadas[0].u, '/api/report');
  assert.equal(await enviarRelato({ pergunta: 'x', resposta: 'y', intencao: 'I', origem: 'LOCAL', versaoApp: 'w' }, { fetchFn: async () => { throw new Error('x'); } }), false);
});

test('fotos: pacote para majoritários; CDN do TSE somente quando temFoto', async () => {
  const { store } = await pacoteCompleto();
  const lula = store.candidatos.find((c) => c.id === '280002542548');
  assert.equal(store.fotoUrl(lula), BASE + 'fotos/280002542548.jpg');
  const dep = store.candidatos.find((c) => c.cargoCodigo === 'DEPUTADO_FEDERAL' && c.temFoto && !c.foto);
  assert.match(urlFotoRemota(dep), /^https:\/\/resultados\.tse\.jus\.br\/oficial\/ele2026\/6259\/fotos\/[a-z]{2}\/\d+\.jpeg$/);
  assert.match(urlFotoRemota(lula), /\/6257\/fotos\/br\//);
  const semFoto = store.candidatos.find((c) => !c.temFoto);
  if (semFoto) assert.equal(urlFotoRemota(semFoto), null);
});

test('o NLU na nuvem espera ~14 s (backend ~12 s) e depois cai para a resposta local', async () => {
  assert.equal(TIMEOUT_NUVEM_MS, 14000);
  const { gaz } = await pacoteCompleto();
  // fetch que só termina quando é abortado (simula backend lento)
  const lento = (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
  const n = new NuvemNlu({ fetchFn: lento, installId: () => 'iid', habilitada: () => true, timeoutMs: 80 });
  const t0 = Date.now();
  assert.equal(await n.interpretar('asdkjh qwerty', gaz), null);
  assert.ok(Date.now() - t0 >= 70);
  assert.equal(new NuvemNlu({ installId: () => 'i', habilitada: () => true }).timeoutMs, 14000);
});

test('o motor avisa a interface quando vai usar a nuvem (spinner "IA analisando…") e quando baixa mais UFs', async () => {
  const etapas = [];
  const corpo = JSON.stringify({ ok: true, nlu: { intent: 'LISTAR_CANDIDATOS', cargo: 'SENADOR', uf: 'MG' } });
  const { nuvem } = nuvemCom(new Response(corpo));
  const { motor } = await import('./support.mjs');
  const r = await (await motor({ nuvem })).responder('asdkjh qwerty', { onEtapa: (e) => etapas.push(e) });
  assert.equal(r.origem, 'NUVEM');
  assert.ok(etapas.includes('nuvem'));
});

test('"Meu estado" ligado só precisa das fatias BR + UF para cargos estaduais sem UF na pergunta', async () => {
  const { DataStore } = await import('../src/eleicoes2026/js/data.js');
  const lidos = [];
  const store = new DataStore({ baseUrl: BASE, fetchFn: fetchDeDisco(DADOS, BASE, lidos) });
  await store.iniciar();
  const motor = new Engine({ store, hoje: () => '2026-10-01', ufPadrao: () => 'SP' });
  const r = await motor.responder('Candidatos a governador');
  assert.equal(r.filters.estadoUf, 'SP');
  assert.deepEqual(store.ufsCarregadas.sort(), ['BR', 'SP']);
  assert.ok(!lidos.includes('candidatos/RJ.json'));
  const todos = await motor.responder('Candidatos a governador em todo o Brasil');
  assert.equal(todos.filters.estadoUf, null);
  assert.equal(store.todasCarregadas, true);
});
