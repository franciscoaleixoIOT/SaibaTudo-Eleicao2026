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
import { PADRAO, sanear } from '../src/eleicoes2026/js/prefs.js';

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
  assert.ok(t.includes('• 13 — LULA (PT)'), t);
  assert.ok(!t.includes('PABLO MARÇAL'), 'candidato com registro indeferido e fora da urna não deve ser listado: ' + t);
  assert.ok(t.includes('fora da urna'));
  assert.ok(r.fonte.includes('TSE'));
  assert.equal(r.filters.cargo, 'PRESIDENTE');
});

test('perfil mostra a situação oficial e a Ficha Limpa DERIVADA dela (nunca "sem pendências")', async () => {
  const r = await responder('Quem é Pablo Marçal?');
  const t = r.directAnswer;
  assert.ok(t.includes('Candidatura indeferida'), t);
  assert.ok(t.includes('NÃO está inserida na urna'), t);
  assert.ok(!t.toLowerCase().includes('ficha limpa sem pend'));
  assert.ok(t.includes('\nFicha Limpa: Inelegibilidade reconhecida (LC 64/90, alterada pela Lei da Ficha Limpa)'), t);
  assert.ok(t.includes('\nMotivos registrados: '), t);
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
  assert.ok(t.includes('• 13 — LULA (PT): 1.234.567 votos (46,10%)'), t);
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
  assert.ok(comUf.directAnswer.includes('Governador em São Paulo'), comUf.directAnswer);
});

test('segundo turno: antes da apuração explica a regra; depois consulta o resultado', async () => {
  const antes = await responder('Quem vai pro segundo turno?', { hoje: '2026-10-01' });
  assert.equal(antes.intent, 'SEGUNDO_TURNO');
  assert.ok(antes.directAnswer.includes('Só para Presidente e Governador'), antes.directAnswer);
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
  assert.ok(r.directAnswer.includes('\nO que significa cada situação:'), r.directAnswer);
  assert.equal(r.filters.apenasDeferidas, true);
  assert.equal(r.filters.apenasIndeferidas, null);
  const n = await responder('Qual a situação da candidatura do Pablo Marçal?');
  assert.ok(n.directAnswer.startsWith('PABLO MARÇAL (Presidente da República, nº 28) — Ficha Limpa e situação do registro no TSE'), n.directAnswer);
  assert.ok(n.directAnswer.includes('\nSituação no TSE: Candidatura indeferida — NÃO está inserida na urna'));
  assert.ok(n.directAnswer.includes('\nMotivos registrados: '));
  assert.ok(n.directAnswer.includes('não é certidão e pode caber recurso'));
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
  assert.ok(total.directAnswer.includes('\nNa urna, por cargo:\n• '), total.directAnswer);
});

test('patrimônio declarado vem do registro do candidato', async () => {
  const r = await responder('Qual o patrimônio declarado de Flávio Bolsonaro?');
  assert.equal(r.intent, 'PATRIMONIO');
  assert.ok(r.directAnswer.startsWith('FLAVIO BOLSONARO (Presidente da República, nº 22) — bens declarados ao TSE'), r.directAnswer);
  assert.ok(/\nPatrimônio declarado: R\$\s[\d.]+,\d{2} \(\d+ bens\)/.test(r.directAnswer), r.directAnswer);
  assert.ok((await responder('patrimônio dos candidatos')).directAnswer.includes('Pergunte pelo nome'));
});

test('pesquisas: o registro não traz resultados', async () => {
  const { store, gaz } = await pacoteCompleto();
  await store.ensurePesquisas();
  // snapshot novo: o de pacoteCompleto() foi tirado antes de as pesquisas serem carregadas
  const r = await new AnswerBuilder({ data: store.snapshot(), gaz, hoje: '2026-10-01' }).construir(parse('Pesquisas para governador de SP', gaz));
  assert.ok(r.directAnswer.includes('o registro no TSE não traz os resultados'), r.directAnswer);
  assert.ok(r.directAnswer.includes(' pesquisas eleitorais registradas em São Paulo (Governador).'), r.directAnswer);
  assert.match(r.directAnswer, /registrada em \d{2}\/\d{2}\/\d{4}/);
});

test('regras da urna e senado (dois votos)', async () => {
  const u = await responder('Qual a ordem de votação na urna?');
  assert.ok(u.directAnswer.includes('\n• 1º) Deputado Federal — 4 dígitos') && u.directAnswer.includes('não é a urna oficial'), u.directAnswer);
  const s = await responder('Quantos votos para senador?');
  assert.equal(s.intent, 'SENADO_DOIS_VOTOS');
  assert.ok(s.directAnswer.includes('segundo voto é anulado'));
});

test('fontes oficiais e sobre os dados', async () => {
  const f = await responder('Sites oficiais do TSE');
  assert.ok(f.directAnswer.includes('DivulgaCandContas'));
  const sd = await responder('De onde vêm os dados?');
  assert.ok(sd.directAnswer.includes('licença CC BY') && sd.directAnswer.includes('\nPacote: 2026'), sd.directAnswer);
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
  assert.ok(r.directAnswer.endsWith('\nFiltrado pelo seu estado (SP). Para ver o Brasil todo, peça "em todo o Brasil" ou desligue "Meu estado".'), r.directAnswer);
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
  assert.ok(/\nContas de campanha \([^)]+\): receitas R\$\s\S+ · despesas contratadas R\$\s\S+/.test(t), t);
  assert.ok(t.includes((com.contas.tipo ?? 'parcial').toLowerCase()));
  const zerada = { ...com, contas: { receitas: 0, despesasContratadas: 0, tipo: 'PARCIAL', geradoEm: null } };
  assert.ok(!b.descricaoPerfil(zerada).includes('Contas de campanha'));
  assert.ok(!b.descricaoPerfil({ ...com, contas: null }).includes('Contas de campanha'));
});

test('preferências: historicoPerguntas é saneado (máximo 50, corte de espaços e strings válidas)', () => {
  assert.deepEqual(PADRAO.historicoPerguntas, []);
  const invalido = sanear({ historicoPerguntas: 'não é array' });
  assert.deepEqual(invalido.historicoPerguntas, []);

  const bruto = Array.from({ length: 60 }, (_, i) => `  Pergunta ${i + 1}  `);
  bruto.push('', '   ', null, 123);
  const saneado = sanear({ historicoPerguntas: bruto });
  assert.equal(saneado.historicoPerguntas.length, 50);
  assert.equal(saneado.historicoPerguntas[0], 'Pergunta 11');
  assert.equal(saneado.historicoPerguntas[49], 'Pergunta 60');
});
