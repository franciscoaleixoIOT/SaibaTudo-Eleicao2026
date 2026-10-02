import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelOutput, parseModelJson } from '../_lib/normalize.js';
import { INTENTS } from '../_lib/vocab.js';

const legado = (intent, filters = {}, extra = {}) => ({
  intent,
  target_route: 'candidates/todos',
  menu_id: 'menu_home',
  submenu_id: null,
  filters: {
    cargo: null, digitos_urna: null, estado_uf: null, regiao: null, partido: null, tema: null,
    nome_candidato: null, apenas_ficha_limpa: null, max_processos_administrativos: null, mandatos_anteriores: null,
    ...filters,
  },
  direct_answer: 'resposta do modelo que NUNCA deve ser repassada',
  suggested_questions: ['sugestão que NUNCA deve ser repassada'],
  ...extra,
});

const norm = (raw, question) => normalizeModelOutput(raw, question === undefined ? {} : { question });

// ------------------------------------------------------------------ mapeamentos legados

test('FILTER_CANDIDATES -> LISTAR_CANDIDATOS com cargo e UF', () => {
  const r = norm(legado('FILTER_CANDIDATES', { cargo: 'GOVERNADOR', estado_uf: 'SP' }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.nlu, { intent: 'LISTAR_CANDIDATOS', cargo: 'GOVERNADOR', uf: 'SP' });
});

test('direct_answer e suggested_questions do modelo nunca chegam ao cliente', () => {
  const r = norm(legado('FILTER_CANDIDATES', { cargo: 'SENADOR' }));
  const txt = JSON.stringify(r);
  assert.ok(!txt.includes('NUNCA'));
  assert.ok(!('direct_answer' in r.nlu) && !('suggested_questions' in r.nlu));
  assert.ok(!('target_route' in r.nlu) && !('menu_id' in r.nlu) && !('filters' in r.nlu));
});

test('CANDIDATE_LOOKUP -> PERFIL_CANDIDATO exige nome', () => {
  const ok = norm(legado('CANDIDATE_LOOKUP', { nome_candidato: 'LULA' }));
  assert.deepEqual(ok.nlu, { intent: 'PERFIL_CANDIDATO', nome: 'LULA' });
  const semNome = norm(legado('CANDIDATE_LOOKUP', { cargo: 'PRESIDENTE' }));
  assert.deepEqual(semNome.nlu, { intent: 'DESCONHECIDA' });
});

test('CALENDAR_QUERY -> CALENDARIO e VOTING_LOCATION_QUERY -> LOCAL_VOTACAO', () => {
  assert.equal(norm(legado('CALENDAR_QUERY')).nlu.intent, 'CALENDARIO');
  assert.equal(norm(legado('VOTING_LOCATION_QUERY')).nlu.intent, 'LOCAL_VOTACAO');
});

test('apenas_ficha_limpa=true -> apenasDeferidas=true; false/null não geram o campo', () => {
  const a = norm(legado('FILTER_CANDIDATES', { cargo: 'SENADOR', apenas_ficha_limpa: true }));
  assert.equal(a.nlu.apenasDeferidas, true);
  const b = norm(legado('FILTER_CANDIDATES', { cargo: 'SENADOR', apenas_ficha_limpa: false }));
  assert.ok(!('apenasDeferidas' in b.nlu));
  const c = norm(legado('FILTER_CANDIDATES', { cargo: 'SENADOR', apenas_ficha_limpa: 'true' }));
  assert.ok(!('apenasDeferidas' in c.nlu), 'só booleano estrito');
});

test('mandatos_anteriores: 0 -> NUNCA_ELEITO, 1 -> ELEITO_MESMO_CARGO, 2+ -> ELEITO_2_OU_MAIS', () => {
  const h = (m) => norm(legado('FILTER_CANDIDATES', { cargo: 'DEPUTADO_FEDERAL', mandatos_anteriores: m })).nlu.historico;
  assert.equal(h(0), 'NUNCA_ELEITO');
  assert.equal(h(1), 'ELEITO_MESMO_CARGO');
  assert.equal(h(2), 'ELEITO_2_OU_MAIS');
  assert.equal(h(5), 'ELEITO_2_OU_MAIS');
  assert.equal(h(-1), undefined);
  assert.equal(h(1.5), undefined);
  assert.equal(h('0'), undefined);
});

test('reeleicao=true (campo extra do treino) -> ELEITO_MESMO_CARGO', () => {
  const r = norm(legado('FILTER_CANDIDATES', { cargo: 'GOVERNADOR', reeleicao: true }));
  assert.equal(r.nlu.historico, 'ELEITO_MESMO_CARGO');
});

test('NAVIGATE_MENU/EXPLAIN_TOPIC sem entidades -> DESCONHECIDA', () => {
  assert.deepEqual(norm(legado('NAVIGATE_MENU')).nlu, { intent: 'DESCONHECIDA' });
  assert.deepEqual(norm(legado('EXPLAIN_TOPIC')).nlu, { intent: 'DESCONHECIDA' });
  assert.deepEqual(norm(legado('EXPLAIN_TOPIC', {}, { target_route: 'info/regras' })).nlu, { intent: 'DESCONHECIDA' });
});

test('EXPLAIN_TOPIC com rota informativa conhecida é refinado (CONTAR/PESQUISAS/CALENDARIO/LOCAL_VOTACAO)', () => {
  const por = (rota, f = {}) => norm(legado('EXPLAIN_TOPIC', f, { target_route: rota })).nlu;
  assert.deepEqual(por('info/estatisticas', { estado_uf: 'SP' }), { intent: 'CONTAR', uf: 'SP' });
  assert.equal(por('info/pesquisas').intent, 'PESQUISAS');
  assert.equal(por('info/calendario').intent, 'CALENDARIO');
  assert.equal(por('info/locais').intent, 'LOCAL_VOTACAO');
});

test('NAVIGATE_MENU com entidades de listagem -> LISTAR_CANDIDATOS; EXPLAIN_TOPIC com entidades continua DESCONHECIDA', () => {
  assert.deepEqual(norm(legado('NAVIGATE_MENU', { cargo: 'SENADOR' })).nlu, { intent: 'LISTAR_CANDIDATOS', cargo: 'SENADOR' });
  assert.deepEqual(norm(legado('EXPLAIN_TOPIC', { cargo: 'SENADOR' })).nlu, { intent: 'DESCONHECIDA' });
});

test('FILTER_CANDIDATES sem nenhuma entidade de listagem -> DESCONHECIDA (mesma regra do NluValidator do app)', () => {
  assert.deepEqual(norm(legado('FILTER_CANDIDATES')).nlu, { intent: 'DESCONHECIDA' });
  assert.deepEqual(norm(legado('FILTER_CANDIDATES', { apenas_ficha_limpa: true })).nlu, { intent: 'DESCONHECIDA' });
});

test('campos legados sem equivalente (digitos_urna, regiao, max_processos_administrativos) são ignorados', () => {
  const r = norm(
    legado('FILTER_CANDIDATES', {
      cargo: 'PRESIDENTE', digitos_urna: 2, regiao: 'Sudeste', max_processos_administrativos: 0,
    })
  );
  assert.deepEqual(r.nlu, { intent: 'LISTAR_CANDIDATOS', cargo: 'PRESIDENTE' });
});

// ------------------------------------------------------------------ vocabulário / alucinações

test('cargo fora do vocabulário é descartado; maiúsculas/acentos/espaços são normalizados', () => {
  const f = (cargo) => norm(legado('FILTER_CANDIDATES', { cargo, estado_uf: 'MG' })).nlu;
  assert.equal(f('PREFEITO').cargo, undefined);
  assert.equal(f('SUPLENTE_1').cargo, undefined);
  assert.equal(f('deputado federal').cargo, 'DEPUTADO_FEDERAL');
  assert.equal(f('Deputado-Distrital').cargo, 'DEPUTADO_DISTRITAL');
  assert.equal(f('VICE_PRESIDENTE').cargo, 'VICE_PRESIDENTE');
});

test('UF inválida (inclui "BR") é descartada; minúscula é aceita', () => {
  const f = (uf) => norm(legado('FILTER_CANDIDATES', { cargo: 'GOVERNADOR', estado_uf: uf })).nlu.uf;
  assert.equal(f('XX'), undefined);
  assert.equal(f('BR'), undefined);
  assert.equal(f('São Paulo'), undefined);
  assert.equal(f('sp'), 'SP');
  assert.equal(f(42), undefined);
});

test('tema: acentos/sinônimos do treino viram o id do app; fora do vocabulário é descartado', () => {
  const t = (tema) => norm(legado('FILTER_CANDIDATES', { cargo: 'SENADOR', tema })).nlu.tema;
  assert.equal(t('saúde'), 'saude');
  assert.equal(t('educação'), 'educacao');
  assert.equal(t('segurança'), 'seguranca');
  assert.equal(t('meio ambiente'), 'meio_ambiente');
  assert.equal(t('meio_ambiente'), 'meio_ambiente');
  assert.equal(t('emprego'), 'economia');
  assert.equal(t('agricultura'), 'agro');
  assert.equal(t('criptomoedas'), undefined);
  assert.equal(t('"; DROP TABLE'), undefined);
  assert.equal(t('a'.repeat(50)), undefined);
});

test('o tema entregue sempre cumpre [a-z_]{3,20}', () => {
  for (const tema of ['saúde', 'educação', 'meio ambiente', 'emprego', 'tecnologia', 'pessoa com deficiência']) {
    const r = norm(legado('FILTER_CANDIDATES', { cargo: 'SENADOR', tema })).nlu;
    if (r.tema !== undefined) assert.match(r.tema, /^[a-z_]{3,20}$/);
  }
});

test('partido: formato inválido é descartado; "null" textual é descartado', () => {
  const p = (partido) => norm(legado('FILTER_CANDIDATES', { cargo: 'SENADOR', partido })).nlu.partido;
  assert.equal(p('pt'), 'PT');
  assert.equal(p('PCdoB'), 'PCDOB');
  assert.equal(p('<script>alert(1)</script>'), undefined);
  assert.equal(p('x'), undefined);
  assert.equal(p('PARTIDO DOS TRABALHADORES BRASILEIROS'), undefined);
  assert.equal(p('null'), undefined);
});

test('nome: higieniza caracteres, exige 3..60 caracteres', () => {
  const n = (nome) => norm(legado('CANDIDATE_LOOKUP', { nome_candidato: nome })).nlu;
  assert.equal(n('  Fernando   Haddad ').nome, 'Fernando Haddad');
  assert.equal(n('Zé <b>').nome, 'Zé b');
  assert.deepEqual(n('ab'), { intent: 'DESCONHECIDA' });
  assert.deepEqual(n('x'.repeat(61)), { intent: 'DESCONHECIDA' });
  assert.deepEqual(n('123'), { intent: 'DESCONHECIDA' });
  assert.deepEqual(n('null'), { intent: 'DESCONHECIDA' });
});

test('intenção desconhecida (alucinação) -> DESCONHECIDA, sem entidades', () => {
  const r = norm({ intent: 'HACK_THE_PLANET', filters: { cargo: 'PRESIDENTE' } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.nlu, { intent: 'DESCONHECIDA' });
});

// ------------------------------------------------------------------ JSON quebrado

test('JSON inválido, vazio ou sem intent -> ok:false', () => {
  for (const raw of ['', '   ', 'não é json', '{"intent": "FILTER_CANDIDATES", "filters": {', '[1,2,3]', '"texto"', null, undefined, 42]) {
    const r = norm(raw);
    assert.equal(r.ok, false, `deveria falhar: ${String(raw)}`);
  }
  assert.equal(norm({}).ok, false);
  assert.equal(norm({ intent: 42 }).ok, false);
  assert.equal(norm({ intent: '' }).ok, false);
});

test('texto com lixo antes/depois do JSON ainda é aproveitado', () => {
  const raw = `Claro! ${JSON.stringify(legado('CALENDAR_QUERY'))} Espero ter ajudado.`;
  assert.equal(norm(raw).nlu.intent, 'CALENDARIO');
  assert.deepEqual(parseModelJson('xx{"a":1}yy'), { a: 1 });
});

test('filters ausente, nulo ou com tipo errado não quebra', () => {
  assert.deepEqual(norm({ intent: 'FILTER_CANDIDATES' }).nlu, { intent: 'DESCONHECIDA' });
  assert.deepEqual(norm({ intent: 'FILTER_CANDIDATES', filters: null }).nlu, { intent: 'DESCONHECIDA' });
  assert.deepEqual(norm({ intent: 'FILTER_CANDIDATES', filters: 'x' }).nlu, { intent: 'DESCONHECIDA' });
  assert.deepEqual(norm({ intent: 'FILTER_CANDIDATES', filters: [1] }).nlu, { intent: 'DESCONHECIDA' });
});

// ------------------------------------------------------------------ ancoragem na pergunta

test('ancoragem: cargo/UF/partido de memória do modelo (ausentes na pergunta) são descartados', () => {
  const raw = legado('CANDIDATE_LOOKUP', {
    cargo: 'DEPUTADO_ESTADUAL', estado_uf: 'AL', partido: 'MDB', nome_candidato: 'REMI CALHEIROS',
  });
  const r = norm(raw, 'Quem é Remi Calheiros?');
  assert.deepEqual(r.nlu, { intent: 'PERFIL_CANDIDATO', nome: 'REMI CALHEIROS' });
  assert.deepEqual([...r.dropped].sort(), ['cargo', 'partido', 'uf']);
});

test('ancoragem: entidades presentes na pergunta são mantidas', () => {
  const raw = legado('CANDIDATE_LOOKUP', {
    cargo: 'DEPUTADO_ESTADUAL', estado_uf: 'AL', partido: 'MDB', nome_candidato: 'REMI CALHEIROS',
  });
  const r = norm(raw, 'Remi Calheiros MDB deputado estadual em Alagoas');
  assert.deepEqual(r.nlu, {
    intent: 'PERFIL_CANDIDATO', cargo: 'DEPUTADO_ESTADUAL', uf: 'AL', partido: 'MDB', nome: 'REMI CALHEIROS',
  });
});

test('ancoragem: nome inventado (nenhuma palavra na pergunta) derruba o PERFIL_CANDIDATO', () => {
  const r = norm(legado('CANDIDATE_LOOKUP', { nome_candidato: 'JOAO DA SILVA' }), 'Quem é aquele candidato famoso?');
  assert.deepEqual(r.nlu, { intent: 'DESCONHECIDA' });
});

test('ancoragem: nome expandido pelo modelo e erro de digitação de 1 letra são aceitos', () => {
  const expandido = norm(legado('CANDIDATE_LOOKUP', { nome_candidato: 'FLAVIO BOLSONARO' }), 'informações sobre Flávio');
  assert.equal(expandido.nlu.nome, 'FLAVIO BOLSONARO');
  const typo = norm(legado('CANDIDATE_LOOKUP', { nome_candidato: 'TARCISIO' }), 'quem é tarcisoo');
  assert.equal(typo.nlu.nome, 'TARCISIO');
});

test('ancoragem de UF: sigla, nome do estado, "Pará" vs preposição "para", siglas ambíguas', () => {
  const uf = (estado, pergunta) => norm(legado('FILTER_CANDIDATES', { cargo: 'GOVERNADOR', estado_uf: estado }), pergunta).nlu.uf;
  assert.equal(uf('SP', 'governador em SP'), 'SP');
  assert.equal(uf('MG', 'governador de Minas Gerais'), 'MG');
  assert.equal(uf('PA', 'governador do Pará'), 'PA');
  assert.equal(uf('PA', 'candidatos para governador'), undefined);
  assert.equal(uf('SE', 'governador de SE'), 'SE');
  assert.equal(uf('SE', 'se eu quiser ver o governador'), undefined);
  assert.equal(uf('MT', 'governador do Mato Grosso do Sul'), undefined);
  assert.equal(uf('MS', 'governador do Mato Grosso do Sul'), 'MS');
  assert.equal(uf('RJ', 'governador do Rio de Janeiro'), 'RJ');
});

test('ancoragem de cargo: "Distrito Federal" não indica deputado federal; deputado sem qualificador é descartado', () => {
  const c = (cargo, pergunta) => norm(legado('FILTER_CANDIDATES', { cargo, estado_uf: 'DF' }), pergunta).nlu;
  assert.deepEqual(c('DEPUTADO_FEDERAL', 'candidatos a deputado no Distrito Federal'), { intent: 'LISTAR_CANDIDATOS', uf: 'DF' });
  assert.equal(c('DEPUTADO_DISTRITAL', 'deputado distrital no DF').cargo, 'DEPUTADO_DISTRITAL');
  assert.equal(c('SENADOR', 'o senado do DF').cargo, 'SENADOR');
});

test('ancoragem de tema, ficha limpa e histórico', () => {
  const r = norm(
    legado('FILTER_CANDIDATES', { cargo: 'SENADOR', tema: 'saúde', apenas_ficha_limpa: true, mandatos_anteriores: 0 }),
    'senadores que falam de saúde, ficha limpa e estreantes'
  );
  assert.deepEqual(r.nlu, {
    intent: 'LISTAR_CANDIDATOS', cargo: 'SENADOR', tema: 'saude', apenasDeferidas: true, historico: 'NUNCA_ELEITO',
  });
  const alucinado = norm(
    legado('FILTER_CANDIDATES', { cargo: 'SENADOR', tema: 'saúde', apenas_ficha_limpa: true, mandatos_anteriores: 0 }),
    'candidatos ao senado'
  );
  assert.deepEqual(alucinado.nlu, { intent: 'LISTAR_CANDIDATOS', cargo: 'SENADOR' });
});

test('ancoragem de partido: sigla como palavra; "PC do B" ~ PCDOB; sigla curta não casa dentro de outra palavra', () => {
  const p = (partido, pergunta) => norm(legado('FILTER_CANDIDATES', { cargo: 'SENADOR', partido }), pergunta).nlu.partido;
  assert.equal(p('PT', 'senadores do PT'), 'PT');
  assert.equal(p('PCDOB', 'senadores do PC do B'), 'PCDOB');
  assert.equal(p('PT', 'senadores do partido pt'), 'PT');
  assert.equal(p('PL', 'senadores que falam de política'), undefined);
});

// ------------------------------------------------------------------ formato novo (modelo retreinado)

test('formato novo: intenção do contrato é aceita e as entidades validadas', () => {
  const r = norm({ intent: 'resultados', cargo: 'governador', uf: 'sp', turno: 1, extra: 'ignorado' });
  assert.deepEqual(r.nlu, { intent: 'RESULTADOS', cargo: 'GOVERNADOR', uf: 'SP', turno: 1 });
  assert.equal(r.format, 'v2');
});

test('formato novo: PERFIL_CANDIDATO sem nome e LISTAR sem entidade viram DESCONHECIDA', () => {
  assert.deepEqual(norm({ intent: 'PERFIL_CANDIDATO', cargo: 'SENADOR' }).nlu, { intent: 'DESCONHECIDA' });
  assert.deepEqual(norm({ intent: 'LISTAR_CANDIDATOS' }).nlu, { intent: 'DESCONHECIDA' });
});

test('formato novo: turno inválido, historico inválido e tema inventado são descartados', () => {
  const r = norm({ intent: 'LISTAR_CANDIDATOS', cargo: 'SENADOR', turno: 3, historico: 'TALVEZ', tema: 'xyz' });
  assert.deepEqual(r.nlu, { intent: 'LISTAR_CANDIDATOS', cargo: 'SENADOR' });
});

test('formato novo: SEGUNDO_TURNO assume turno 2; RECOMENDACAO não carrega entidades', () => {
  assert.deepEqual(norm({ intent: 'SEGUNDO_TURNO' }).nlu, { intent: 'SEGUNDO_TURNO', turno: 2 });
  assert.deepEqual(norm({ intent: 'RECOMENDACAO', cargo: 'PRESIDENTE', nome: 'Fulano' }).nlu, { intent: 'RECOMENDACAO' });
});

test('formato novo: todas as intenções do contrato passam sem erro', () => {
  for (const intent of INTENTS) {
    const r = norm({ intent, cargo: 'SENADOR', nome: 'Fulano Silva' });
    assert.equal(r.ok, true, intent);
    assert.ok(INTENTS.includes(r.nlu.intent), intent);
  }
});

test('a saída sempre cumpre o contrato (somente chaves conhecidas)', () => {
  const permitidas = new Set(['intent', 'cargo', 'uf', 'partido', 'nome', 'tema', 'apenasDeferidas', 'historico', 'turno']);
  const amostras = [
    legado('FILTER_CANDIDATES', { cargo: 'SENADOR', estado_uf: 'MG', tema: 'saúde', partido: 'PT', apenas_ficha_limpa: true, mandatos_anteriores: 2 }),
    legado('CANDIDATE_LOOKUP', { nome_candidato: 'Lula' }),
    { intent: 'RESULTADOS', cargo: 'PRESIDENTE', turno: 2 },
  ];
  for (const a of amostras) for (const k of Object.keys(norm(a).nlu)) assert.ok(permitidas.has(k), k);
});

test('ancoragem de tema aceita sinônimos do mesmo id (jovens -> juventude, emprego -> economia)', () => {
  const v2 = (tema, pergunta) => norm({ intent: 'LISTAR_CANDIDATOS', cargo: 'SENADOR', tema }, pergunta).nlu.tema;
  assert.equal(v2('juventude', 'senadores que falam de jovens'), 'juventude');
  assert.equal(v2('economia', 'senadores que falam de emprego'), 'economia');
  assert.equal(v2('educacao', 'senadores com propostas de educação'), 'educacao');
  assert.equal(v2('juventude', 'senadores que falam de esporte'), undefined, 'sinônimo de OUTRO id não ancora');
  assert.equal(v2('pcd', 'senadores e acessibilidade'), 'pcd');
});

test('UF por apelido do app ("minas" = MG, "brasília" = DF) é ancorada; "minas gerais" continua MG', () => {
  assert.equal(normalizeModelOutput({ intent: 'LISTAR_CANDIDATOS', uf: 'MG' }, { question: 'minas' }).nlu.uf, 'MG');
  assert.equal(normalizeModelOutput({ intent: 'LISTAR_CANDIDATOS', uf: 'DF' }, { question: 'governador em Brasília' }).nlu.uf, 'DF');
  assert.equal(normalizeModelOutput({ intent: 'LISTAR_CANDIDATOS', uf: 'MG' }, { question: 'senado em Minas Gerais' }).nlu.uf, 'MG');
  const r = normalizeModelOutput({ intent: 'LISTAR_CANDIDATOS', cargo: 'SENADOR', uf: 'SP' }, { question: 'senado em minas' });
  assert.equal(r.nlu.uf, undefined);
  assert.deepEqual(r.dropped, ['uf']);
});

test('intenções novas do app (sem entidades obrigatórias) passam pelo proxy', () => {
  for (const intent of ['SIMULADOR', 'AJUDA', 'REGRAS_VOTO', 'PLANO_GOVERNO', 'CONTAS_CAMPANHA']) {
    assert.deepEqual(normalizeModelOutput({ intent }, { question: 'pergunta qualquer' }).nlu, { intent }, intent);
  }
});
