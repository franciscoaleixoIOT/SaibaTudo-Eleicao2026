// Respostas montadas dos dados oficiais — equivalentes a AnswerBuilderTest.kt (Android) + regras de neutralidade.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pacoteCompleto } from './support.mjs';
import { inteiro } from '../src/eleicoes2026/js/model.js';
import { AnswerBuilder } from '../src/eleicoes2026/js/answers.js';
import { parse } from '../src/eleicoes2026/js/nlu.js';
import { ApuracaoClient, parseApuracao } from '../src/eleicoes2026/js/live.js';

const aqui = dirname(fileURLToPath(import.meta.url));
// Formato do JSON de apuração do TSE (fixture SOMENTE de teste; nunca é publicada no site).
const fixture = readFileSync(resolve(aqui, 'fixtures/tse_apuracao_presidente.json'), 'utf8');

async function responder(pergunta, { hoje = '2026-10-01', uf = null, apuracao = null } = {}) {
  const { dados, gaz } = await pacoteCompleto();
  return new AnswerBuilder({ data: dados, gaz, hoje, ufPadrao: uf, apuracao, origem: 'LOCAL' }).construir(parse(pergunta, gaz));
}

test('presidenciáveis na urna são listados (13) e Pablo Marçal não aparece', async () => {
  const r = await responder('Quem disputa a Presidência em 2026?');
  const t = r.directAnswer;
  assert.ok(t.includes('13 candidaturas na urna'), t);
  assert.ok(t.includes('LULA (PT, nº 13)'));
  assert.ok(!t.includes('PABLO MARÇAL'), 'candidato com registro indeferido e fora da urna não deve ser listado: ' + t);
  assert.ok(t.includes('fora da urna'));
  assert.ok(r.fonte.includes('TSE'));
  assert.equal(r.filters.cargo, 'PRESIDENTE');
});

test('perfil mostra a situação oficial e nunca "Ficha Limpa" inferida', async () => {
  const r = await responder('Quem é Pablo Marçal?');
  const t = r.directAnswer;
  assert.ok(t.includes('Candidatura indeferida'), t);
  assert.ok(t.includes('NÃO está inserida na urna'), t);
  assert.ok(!t.toLowerCase().includes('ficha limpa sem pend'));
  assert.ok(!/ficha limpa/i.test(t), 'o perfil nunca deve afirmar "ficha limpa"');
});

test('pedido de recomendação é recusado com neutralidade', async () => {
  const r = await responder('Em quem devo votar para presidente?');
  assert.equal(r.intent, 'RECOMENDACAO');
  assert.ok(r.directAnswer.includes('Não indico, recomendo'));
  assert.deepEqual(r.candidateIds, []);
  assert.equal(r.origem, 'AVISO');
  for (const q of ['Qual o melhor candidato a governador?', 'Quem vai ganhar a eleição?', 'Me indique um candidato a deputado', 'quem merece meu voto']) {
    const x = await responder(q);
    assert.equal(x.intent, 'RECOMENDACAO', q);
    assert.deepEqual(x.candidateIds, [], q);
  }
});

test('resultados antes da eleição explicam que a votação não ocorreu', async () => {
  const r = await responder('Quem foi eleito presidente?', { hoje: '2026-10-01' });
  assert.ok(r.directAnswer.includes('ainda não ocorreu'));
  assert.ok(r.directAnswer.includes('04/10/2026'));
});

test('resultados ao vivo usam os números do TSE sem alterar', async () => {
  const ap = { obter: async (cargo, uf, turno) => parseApuracao(fixture, cargo, uf, turno) };
  const r = await responder('Resultado para presidente', { hoje: '2026-10-04', apuracao: ap });
  const t = r.directAnswer;
  assert.ok(t.includes('LULA (PT, nº 13): 1.234.567 votos (46,10%)'), t);
  assert.ok(t.includes('Apuração em andamento (50,00% das seções totalizadas)'));
  assert.ok(r.abrirResultados);
  assert.equal(r.candidateIds[0], '280002542548');
  assert.equal(r.apuracao.linhas.length, 3);
});

test('resultados pós-eleição sem apuração publicada informam que não há resultado', async () => {
  const r = await responder('Resultado para governador em SP', { hoje: '2026-10-05', apuracao: { obter: async () => null } });
  assert.ok(r.directAnswer.includes('Ainda não há resultado oficial publicado'), r.directAnswer);
});

test('resultados sem cargo pedem o cargo; governador sem UF pede o estado', async () => {
  assert.ok((await responder('Resultado da apuração', { hoje: '2026-10-04' })).directAnswer.includes('De qual cargo'));
  assert.ok((await responder('Quem foi eleito governador?', { hoje: '2026-10-04' })).directAnswer.includes('De qual estado?'));
  const comUf = await responder('Quem foi eleito governador?', { hoje: '2026-10-04', uf: 'SP', apuracao: { obter: async () => null } });
  assert.ok(comUf.directAnswer.includes('SP'));
});

test('segundo turno: antes da apuração explica a regra; depois consulta o resultado', async () => {
  const antes = await responder('Quem vai pro segundo turno?', { hoje: '2026-10-01' });
  assert.equal(antes.intent, 'SEGUNDO_TURNO');
  assert.ok(antes.directAnswer.includes('somente para Presidente e Governador'));
  const depois = await responder('Quem vai pro segundo turno para presidente?', { hoje: '2026-10-10', apuracao: { obter: async () => null } });
  assert.equal(depois.intent, 'SEGUNDO_TURNO');
});

test('o calendário muda com a fase eleitoral', async () => {
  assert.ok((await responder('Quando é a eleição?', { hoje: '2026-10-01' })).directAnswer.includes('daqui a 3 dias'));
  assert.ok((await responder('Quando é a eleição?', { hoje: '2026-10-03' })).directAnswer.includes('amanhã'));
  assert.ok((await responder('Quando é a eleição?', { hoje: '2026-10-04' })).directAnswer.includes('Hoje é o 1º turno'));
  assert.ok((await responder('Quando é a eleição?', { hoje: '2026-10-10' })).directAnswer.includes('O 1º turno foi em 04/10/2026'));
  assert.ok((await responder('Quando é a eleição?', { hoje: '2026-10-25' })).directAnswer.includes('Hoje é o 2º turno'));
  assert.ok((await responder('Quando é a eleição?', { hoje: '2026-11-02' })).directAnswer.includes('As votações ocorreram'));
});

test('elegibilidade não emite certidão de Ficha Limpa e filtra apenas deferidas', async () => {
  const r = await responder('O que é ficha limpa?');
  assert.ok(r.directAnswer.includes('NÃO emite certidão'));
  assert.equal(r.filters.apenasDeferidas, true);
  const n = await responder('Qual a situação da candidatura do Pablo Marçal?');
  assert.ok(n.directAnswer.includes('Situação oficial da candidatura de PABLO MARÇAL'), n.directAnswer);
  assert.ok(n.directAnswer.includes('Candidatura indeferida'));
  assert.ok(n.directAnswer.includes('Motivos registrados'));
  assert.ok(n.directAnswer.includes('não emite certidão de Ficha Limpa'));
});

test('pergunta desconhecida fica não resolvida (possível apoio da nuvem)', async () => {
  const r = await responder('asdkjh qwerty');
  assert.equal(r.resolvida, false);
  assert.ok(r.suggestedQuestions[0]);
});

test('contagem por cargo e UF', async () => {
  const r = await responder('Quantos candidatos a governador em SP?');
  assert.ok(r.directAnswer.includes('sendo'), r.directAnswer);
  assert.equal(r.filters.estadoUf, 'SP');
  const total = await responder('Quantos candidatos foram registrados?');
  const { store } = await pacoteCompleto();
  assert.ok(total.directAnswer.includes(`${inteiro(store.manifest.contagens.candidaturas)} candidaturas`), total.directAnswer);
  assert.ok(total.directAnswer.includes('Por cargo (na urna)'));
});

test('patrimônio declarado vem do registro do candidato', async () => {
  const r = await responder('Qual o patrimônio declarado de Flávio Bolsonaro?');
  assert.equal(r.intent, 'PATRIMONIO');
  assert.ok(/declarou ao TSE \d+ bem\(ns\), somando R\$/.test(r.directAnswer), r.directAnswer);
  assert.ok((await responder('patrimônio dos candidatos')).directAnswer.includes('Pergunte pelo nome'));
});

test('pesquisas: o registro não traz resultados', async () => {
  const { store } = await pacoteCompleto();
  await store.ensurePesquisas();
  const r = await responder('Pesquisas para governador de SP');
  assert.ok(r.directAnswer.includes('o registro no TSE não informa os resultados'), r.directAnswer);
});

test('regras da urna e senado (dois votos)', async () => {
  const u = await responder('Qual a ordem de votação na urna?');
  assert.ok(u.directAnswer.includes('1º) Deputado Federal (4 dígitos)') && u.directAnswer.includes('não é a urna oficial'));
  const s = await responder('Quantos votos para senador?');
  assert.equal(s.intent, 'SENADO_DOIS_VOTOS');
  assert.ok(s.directAnswer.includes('segundo voto é anulado'));
});

test('fontes oficiais e sobre os dados', async () => {
  const f = await responder('Sites oficiais do TSE');
  assert.ok(f.directAnswer.includes('DivulgaCandContas'));
  const sd = await responder('De onde vêm os dados?');
  assert.ok(sd.directAnswer.includes('licença CC BY') && sd.directAnswer.includes('Pacote 2026'), sd.directAnswer);
});

test('toda resposta factual cita a fonte (TSE) e é determinística', async () => {
  for (const q of ['Candidatos a governador em SP', 'Quem é Lula?', 'Quando é a eleição?', 'Onde eu voto?']) {
    const a = await responder(q);
    const b = await responder(q);
    assert.ok(a.fonte && a.fonte.includes('TSE'), q);
    assert.deepEqual(a, b, q);
  }
});

test('o cliente de apuração (ApuracaoClient) alimenta a resposta de resultados', async () => {
  const { dados } = await pacoteCompleto();
  const cliente = new ApuracaoClient(() => dados.resultadosTse, {
    fetchFn: async () => new Response(fixture, { status: 200 }), esperar: async () => {}
  });
  const r = await responder('Resultado para presidente', { hoje: '2026-10-04', apuracao: cliente });
  assert.ok(r.directAnswer.includes('1.234.567 votos (46,10%)'));
});

test('"Meu estado" vale para cargos estaduais sem UF na pergunta (paridade com o Android)', async () => {
  const r = await responder('Candidatos a governador', { uf: 'SP' });
  assert.equal(r.filters.estadoUf, 'SP');
  assert.ok(r.directAnswer.includes('Filtrado pelo seu estado, SP'), r.directAnswer);
  assert.ok(r.directAnswer.includes('em São Paulo'));
  // contagem também; senador e deputados idem
  assert.equal((await responder('Quantos candidatos a senador?', { uf: 'MG' })).filters.estadoUf, 'MG');
  assert.equal((await responder('Candidatos a deputado federal', { uf: 'RJ' })).filters.estadoUf, 'RJ');
  // cargo nacional não é afetado; UF explícita na pergunta prevalece
  assert.ok(!(await responder('Quem disputa a Presidência?', { uf: 'SP' })).directAnswer.includes('Filtrado'));
  const rj = await responder('Candidatos a governador em RJ', { uf: 'SP' });
  assert.equal(rj.filters.estadoUf, 'RJ');
  assert.ok(!rj.directAnswer.includes('Filtrado'));
  // sem "Meu estado" ligado (uf nula) a pergunta continua nacional
  assert.equal((await responder('Candidatos a governador')).filters.estadoUf, null);
  // outras intenções não são afetadas (perfil, pesquisas, calendário)
  assert.ok(!(await responder('Quando é a eleição?', { uf: 'SP' })).directAnswer.includes('Filtrado'));
  // "em todo o Brasil" afasta o recorte, como a própria dica ensina
  const br = await responder('Candidatos a governador em todo o Brasil', { uf: 'SP' });
  assert.equal(br.filters.estadoUf, null);
  assert.ok(!br.directAnswer.includes('Filtrado'));
});

test('prestação de contas aparece no perfil só quando há valores (receitas ou despesas > 0)', async () => {
  const { store, gaz, dados } = await pacoteCompleto();
  const b = new AnswerBuilder({ data: dados, gaz, hoje: '2026-10-01' });
  const com = store.candidatos.find((c) => c.contas && (c.contas.receitas > 0 || c.contas.despesasContratadas > 0));
  assert.ok(com, 'o pacote tem candidaturas com prestação de contas');
  const t = b.descricaoPerfil(com);
  assert.ok(/Prestação de contas \([^)]+\): receitas R\$\s.*, despesas contratadas R\$\s.*\./.test(t), t);
  assert.ok(t.includes((com.contas.tipo ?? 'parcial').toLowerCase()));
  const zerada = { ...com, contas: { receitas: 0, despesasContratadas: 0, tipo: 'PARCIAL', geradoEm: null } };
  assert.ok(!b.descricaoPerfil(zerada).includes('Prestação de contas'));
  assert.ok(!b.descricaoPerfil({ ...com, contas: null }).includes('Prestação de contas'));
});
