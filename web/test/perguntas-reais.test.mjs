// Perguntas como as pessoas digitam no celular (minúsculas, sem acento, curtas) e todas as SUGESTÕES que a tela oferece:
// nenhuma pode ficar sem resposta, e toda resposta segue o formato em linhas (título, itens, campos).
// Equivalente a PerguntasReaisTest.kt (Android), com os dados REAIS do pacote oficial.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE, DADOS, fetchDeDisco, pacoteCompleto } from './support.mjs';
import { AnswerBuilder, SUGESTOES_PADRAO } from '../src/eleicoes2026/js/answers.js';
import { validarNluNuvem } from '../src/eleicoes2026/js/cloud.js';
import { DataStore } from '../src/eleicoes2026/js/data.js';
import { Engine, independeDosDados } from '../src/eleicoes2026/js/engine.js';
import { filtrar, filtroDaResposta, novoFiltro } from '../src/eleicoes2026/js/filters.js';
import { linhasResposta, partesComLinks } from '../src/eleicoes2026/js/formato.js';
import { ELEGIBILIDADE, FICHA_LIMPA, fichaLimpa, fichaLimpaDe, fichaLimpaTexto, ufEm, ufPor } from '../src/eleicoes2026/js/model.js';
import { parse } from '../src/eleicoes2026/js/nlu.js';

let dadosComPesquisas = null;
async function base() {
  const { store, gaz } = await pacoteCompleto();
  if (!dadosComPesquisas) { await store.ensurePesquisas(); dadosComPesquisas = store.snapshot(); }
  return { store, gaz, dados: dadosComPesquisas };
}

async function responder(q, uf = 'SP', hoje = '2026-10-01') {
  const { gaz, dados } = await base();
  return new AnswerBuilder({ data: dados, gaz, hoje, ufPadrao: uf, origem: 'LOCAL' }).construir(parse(q, gaz));
}

const ESPERADAS = [
  ['candidatos a governador', 'LISTAR_CANDIDATOS'], ['governador sp', 'LISTAR_CANDIDATOS'],
  ['presidente', 'LISTAR_CANDIDATOS'], ['senado rj', 'LISTAR_CANDIDATOS'], ['rio de janeiro', 'LISTAR_CANDIDATOS'],
  ['minas', 'LISTAR_CANDIDATOS'], ['dep federal mg pl', 'LISTAR_CANDIDATOS'], ['estreantes', 'LISTAR_CANDIDATOS'],
  ['candidatas mulheres a governador', 'LISTAR_CANDIDATOS'],
  ['lula', 'PERFIL_CANDIDATO'], ['quem é o tarcisio', 'PERFIL_CANDIDATO'], ['nikolas ferreira', 'PERFIL_CANDIDATO'],
  ['quem é o 22', 'PERFIL_CANDIDATO'], ['numero 13', 'PERFIL_CANDIDATO'], ['vice do lula', 'PERFIL_CANDIDATO'],
  ['haddad é ficha limpa?', 'ELEGIBILIDADE'], ['o lula é ficha limpa', 'ELEGIBILIDADE'], ['ficha limpa', 'ELEGIBILIDADE'],
  ['candidatos ficha limpa a governador em sp', 'ELEGIBILIDADE'], ['quais candidatos são ficha suja', 'ELEGIBILIDADE'],
  ['candidatos inelegíveis', 'ELEGIBILIDADE'], ['o que significa indeferido', 'ELEGIBILIDADE'],
  ['qual o patrimônio do lula', 'PATRIMONIO'], ['bens do tarcisio', 'PATRIMONIO'],
  ['quanto o haddad gastou na campanha', 'CONTAS_CAMPANHA'], ['plano de governo do lula', 'PLANO_GOVERNO'],
  ['propostas do haddad', 'PLANO_GOVERNO'], ['candidatos com propostas de educação em SP', 'LISTAR_CANDIDATOS'],
  ['quando é a eleição', 'CALENDARIO'], ['dia da eleição', 'CALENDARIO'], ['que horas abre a votação', 'CALENDARIO'],
  ['que horas fecha a urna', 'CALENDARIO'], ['onde eu voto', 'LOCAL_VOTACAO'], ['como justificar o voto', 'LOCAL_VOTACAO'],
  ['como votar', 'REGRAS_URNA'], ['quantos números tem o voto para senador', 'REGRAS_URNA'],
  ['em quantos senadores eu voto', 'SENADO_DOIS_VOTOS'], ['voto nulo', 'REGRAS_VOTO'], ['voto em branco', 'REGRAS_VOTO'],
  ['o que acontece se eu votar nulo', 'REGRAS_VOTO'], ['voto é obrigatório?', 'REGRAS_VOTO'],
  ['pesquisas', 'PESQUISAS'], ['quem está na frente nas pesquisas', 'PESQUISAS'],
  ['quem vai ganhar', 'RECOMENDACAO'], ['em quem votar', 'RECOMENDACAO'],
  ['resultado', 'RESULTADOS'], ['segundo turno', 'SEGUNDO_TURNO'], ['quantos candidatos', 'CONTAR'],
  ['quantas mulheres candidatas', 'CONTAR'], ['simular voto', 'SIMULADOR'], ['simulador', 'SIMULADOR'],
  ['oi', 'AJUDA'], ['bom dia', 'AJUDA'], ['obrigado', 'AJUDA'], ['ajuda', 'AJUDA'], ['sobre o app', 'AJUDA'],
  ['de onde vem os dados', 'SOBRE_DADOS']
];

/** Listas sempre em itens ("• "), nunca em parágrafo corrido; linhas curtas o bastante para ler no celular. */
function formatoValido(q, r) {
  const linhas = (r.directAnswer ?? '').split('\n');
  const longa = linhas.find((l) => l.length > 420);
  if (longa) return `"${q}": linha longa demais (${longa.length}): ${longa.slice(0, 80)}…`;
  const corrida = linhas.find((l) => (l.match(/;/g) ?? []).length > 3);
  if (corrida) return `"${q}": lista em parágrafo corrido: ${corrida.slice(0, 80)}…`;
  return null;
}

test('perguntas do dia a dia são entendidas e respondidas (mesmas intenções do Android)', async () => {
  const falhas = [];
  for (const [q, intent] of ESPERADAS) {
    const r = await responder(q);
    if (r.intent !== intent) falhas.push(`"${q}": intenção ${r.intent}, esperada ${intent}`);
    if (!r.resolvida || !r.directAnswer || !r.directAnswer.trim()) falhas.push(`"${q}": sem resposta`);
    const f = formatoValido(q, r);
    if (f) falhas.push(f);
  }
  assert.deepEqual(falhas, [], 'Falhas:\n' + falhas.join('\n'));
});

test('todas as sugestões da tela têm resposta (busca em largura a partir das sugestões padrão e de perguntas reais)', async () => {
  const sementes = [...SUGESTOES_PADRAO,
    'lula', 'quem é o tarcisio', 'marina silva', 'candidatos a governador', 'governador sp', 'ficha limpa',
    'haddad é ficha limpa?', 'oi', 'pesquisas', 'resultado', 'voto nulo', 'numero 13', 'plano de governo do lula',
    'quanto o haddad gastou na campanha', 'bens do tarcisio', 'candidatos inelegíveis', 'rio de janeiro'];
  const vistas = new Set();
  let fronteira = sementes;
  const falhas = [];
  for (let nivel = 0; nivel < 2; nivel++) {
    const proxima = [];
    for (const q of fronteira) {
      if (vistas.has(q)) continue;
      vistas.add(q);
      for (const uf of ['SP', null]) {
        const r = await responder(q, uf);
        if (r.intent === 'DESCONHECIDA' || !r.resolvida) falhas.push(`"${q}" (uf=${uf}) não foi entendida`);
        proxima.push(...r.suggestedQuestions);
      }
    }
    fronteira = [...new Set(proxima)];
  }
  // a última fronteira também precisa ser entendida
  for (const q of fronteira.filter((x) => !vistas.has(x))) {
    const r = await responder(q);
    if (r.intent === 'DESCONHECIDA' || !r.resolvida) falhas.push(`"${q}" não foi entendida`);
  }
  assert.ok(vistas.size > 40, `poucas perguntas visitadas: ${vistas.size}`);
  assert.deepEqual([...new Set(falhas)], [], 'Sugestões sem resposta:\n' + [...new Set(falhas)].join('\n'));
});

test('o simulador abre pela pergunta e com o candidato citado', async () => {
  const { store } = await base();
  const geral = await responder('Simular voto na urna');
  assert.equal(geral.intent, 'SIMULADOR');
  assert.equal(geral.abrirSimulador, true);
  assert.deepEqual(geral.candidateIds, []);
  const r = await responder('Simular voto em LULA (13)');
  assert.equal(r.abrirSimulador, true);
  assert.equal(store.porId.get(r.candidateIds[0])?.nomeUrna, 'LULA');
  assert.ok(r.directAnswer.startsWith('Abrindo o simulador educativo da urna com LULA (13).'), r.directAnswer);
  assert.ok(r.directAnswer.includes('\nOrdem na urna: Deputado Federal (4) → '), r.directAnswer);
  // demais respostas não abrem o simulador
  assert.equal((await responder('lula')).abrirSimulador, false);
});

test('número de urna encontra o candidato (2 dígitos = Presidente + Governador do estado; anos não são números)', async () => {
  const { store, gaz } = await base();
  const r = await responder('quem é o 22', null);
  assert.equal(store.porId.get(r.candidateIds[0])?.nomeUrna, 'FLAVIO BOLSONARO');
  const dois = (await responder('numero 13', 'SP')).directAnswer;
  assert.ok(dois.includes('LULA') && dois.includes('FERNANDO HADDAD'), dois);
  assert.ok(dois.includes('\n• 13 — LULA (PT) · Presidente da República'), dois);
  assert.equal(parse('Quem disputa a Presidência em 2026?', gaz).numero, null);
  assert.equal(parse('candidato 2026', gaz).numero, null, 'ano sem "número" não é número de urna');
  assert.equal(parse('número 2026', gaz).numero, '2026', 'após "número" vale');
  assert.equal(parse('13', gaz).numero, '13');
  // 3 dígitos = Senador; 5 = Deputado Estadual/Distrital (só candidaturas do estado ou nacionais)
  const sen = store.candidatos.find((c) => c.cargoCodigo === 'SENADOR' && c.estadoUf === 'SP' && c.naUrna);
  const rs = await responder(`quem é o ${sen.numero}`, 'SP');
  assert.ok(rs.candidateIds.includes(sen.id), rs.directAnswer);
  assert.ok(rs.candidateIds.every((id) => ['SENADOR', 'SUPLENTE_1', 'SUPLENTE_2'].includes(store.porId.get(id).cargoCodigo)), rs.directAnswer);
  const nada = await responder('quem é o 99999', 'SP');
  assert.ok(nada.directAnswer.startsWith('Não encontrei candidatura com o número 99999 (em São Paulo ou nacional)'), nada.directAnswer);
  assert.ok(nada.directAnswer.includes('\nNúmeros de urna: 2 dígitos = Presidente e Governador'), nada.directAnswer);
});

test('Ficha Limpa aparece por candidato, no perfil (com vice) e na visão geral por situação', async () => {
  const haddad = (await responder('haddad é ficha limpa?')).directAnswer;
  assert.ok(haddad.includes('Ficha Limpa: Sem impedimento reconhecido'), haddad);
  assert.ok(haddad.includes('não é certidão'), haddad);
  const perfil = (await responder('lula')).directAnswer;
  assert.ok(perfil.includes('\nFicha Limpa: '), perfil);
  assert.ok(perfil.includes('\nVice: GERALDO ALCKMIN (PSB)'), perfil);
  const geral = await responder('candidatos inelegíveis', null);
  assert.equal(geral.filters.apenasIndeferidas, true);
  assert.equal(geral.filters.apenasDeferidas, null);
  assert.ok(geral.directAnswer.includes('Inelegibilidade reconhecida (LC 64/90 / Ficha Limpa)'), geral.directAnswer);
  assert.ok(geral.candidateIds.length > 0);
  // "Meu estado" também vale para a visão geral de Ficha Limpa (cargo estadual sem UF)
  const gov = await responder('ficha limpa dos candidatos a governador', 'SP');
  assert.equal(gov.filters.estadoUf, 'SP');
  assert.ok(gov.directAnswer.startsWith('Ficha Limpa — candidaturas a Governador em São Paulo'), gov.directAnswer);
  assert.ok(gov.directAnswer.endsWith('\nFiltrado pelo seu estado (SP). Para ver o Brasil todo, peça "em todo o Brasil" ou desligue "Meu estado".'));
  // ...mas não quando a pergunta cita um candidato
  assert.ok(!(await responder('haddad é ficha limpa?', 'RJ')).directAnswer.includes('Filtrado'));
});

test('derivação da Ficha Limpa segue os motivos oficiais (mesma regra do Android) e vale nos dados reais', async () => {
  const fl = 'Inelegibilidade infraconstitucional(LC 64/90)';
  const E = ELEGIBILIDADE;
  assert.equal(fichaLimpaDe(E.DEFERIDA, []), FICHA_LIMPA.SEM_IMPEDIMENTO);
  assert.equal(fichaLimpaDe(E.DEFERIDA_COM_RECURSO, []), FICHA_LIMPA.SEM_IMPEDIMENTO);
  assert.equal(fichaLimpaDe(E.INDEFERIDA_COM_RECURSO, ['Outros', fl]), FICHA_LIMPA.INELEGIVEL_FICHA_LIMPA);
  assert.equal(fichaLimpaDe(E.INDEFERIDA, ['Inelegibilidade constitucional']), FICHA_LIMPA.INELEGIVEL_CONSTITUCIONAL);
  assert.equal(fichaLimpaDe(E.INDEFERIDA, ['Ausência de quitação eleitoral (Lei 9.504/97)']), FICHA_LIMPA.INDEFERIDA_OUTRO_MOTIVO);
  assert.equal(fichaLimpaDe(E.INDEFERIDA, []), FICHA_LIMPA.INDEFERIDA_SEM_MOTIVO);
  assert.equal(fichaLimpaDe(E.PENDENTE, []), FICHA_LIMPA.AGUARDANDO);
  assert.equal(fichaLimpaDe(E.RENUNCIA, []), FICHA_LIMPA.FORA_DA_DISPUTA);
  assert.equal(fichaLimpaDe(E.DESCONHECIDA, []), FICHA_LIMPA.NAO_INFORMADO);
  assert.equal(fichaLimpaDe('CANCELADA', []), FICHA_LIMPA.FORA_DA_DISPUTA);
  // rótulos e "com recurso"
  assert.equal(fichaLimpaTexto({ elegibilidade: E.DEFERIDA_COM_RECURSO, motivosIndeferimento: [] }), 'Sem impedimento reconhecido — com recurso pendente');
  assert.equal(fichaLimpaTexto({ elegibilidade: E.INDEFERIDA, motivosIndeferimento: [fl] }), 'Inelegibilidade reconhecida (LC 64/90, alterada pela Lei da Ficha Limpa)');
  assert.equal(FICHA_LIMPA.SEM_IMPEDIMENTO.impedimento, false);
  assert.equal(FICHA_LIMPA.INELEGIVEL_CONSTITUCIONAL.impedimento, true);
  assert.equal(FICHA_LIMPA.INDEFERIDA_OUTRO_MOTIVO.impedimento, null);
  // nos dados reais, todo indeferimento com motivo "infraconstitucional" vira inelegível pela Ficha Limpa
  const { store } = await base();
  const reais = store.candidatos.filter((c) => c.motivosIndeferimento.some((m) => m.includes('infraconstitucional')) && c.elegibilidade.indeferida);
  assert.ok(reais.length > 0);
  assert.ok(reais.every((c) => fichaLimpa(c) === FICHA_LIMPA.INELEGIVEL_FICHA_LIMPA));
  assert.ok(store.candidatos.filter((c) => c.elegibilidade.apta === true).every((c) => fichaLimpa(c) === FICHA_LIMPA.SEM_IMPEDIMENTO));
});

test('filtros: indeferidos ignoram "apenas na urna"; gênero declarado; deferidos e indeferidos são excludentes', async () => {
  const { store } = await base();
  const ind = filtrar(store.candidatos, novoFiltro({ apenasIndeferidas: true }));
  assert.ok(ind.length > 0 && ind.every((c) => c.elegibilidade.indeferida));
  assert.ok(ind.some((c) => !c.naUrna), 'indeferidos fora da urna também aparecem');
  const mulheres = filtrar(store.candidatos, novoFiltro({ cargo: 'GOVERNADOR', genero: 'FEMININO' }));
  assert.ok(mulheres.length > 0 && mulheres.every((c) => c.genero === 'FEMININO'));
  // resposta pede "indeferidos": desliga "deferidos"; e vice-versa; gênero some com resetar
  const atual = novoFiltro({ apenasDeferidas: true, genero: 'MASCULINO' });
  const a = filtroDaResposta({ resetar: false, apenasIndeferidas: true }, atual);
  assert.equal(a.apenasIndeferidas, true);
  assert.equal(a.apenasDeferidas, false);
  assert.equal(a.genero, 'MASCULINO');
  const b = filtroDaResposta({ resetar: false, apenasDeferidas: true }, a);
  assert.equal(b.apenasDeferidas, true);
  assert.equal(b.apenasIndeferidas, false);
  const c = filtroDaResposta({ resetar: true, cargo: 'GOVERNADOR', genero: 'FEMININO' }, b);
  assert.deepEqual([c.cargo, c.genero, c.apenasDeferidas, c.apenasIndeferidas], ['GOVERNADOR', 'FEMININO', false, false]);
  assert.equal(filtroDaResposta({ resetar: true }, c).genero, null);
  // a lista da resposta "candidatas mulheres a governador" usa o gênero
  const r = await responder('candidatas mulheres a governador', null);
  assert.equal(r.filters.genero, 'FEMININO');
  assert.ok(r.directAnswer.includes('a Governador (mulheres)'), r.directAnswer);
  assert.ok(r.directAnswer.includes('\nGênero conforme declarado ao TSE no registro.'));
});

test('estados com preposição (Ufs.em/Ufs.por) e respostas por estado', async () => {
  assert.equal(ufEm('SP'), 'em São Paulo');
  assert.equal(ufEm('BA'), 'na Bahia');
  assert.equal(ufEm('RJ'), 'no Rio de Janeiro');
  assert.equal(ufEm('BR'), 'no Brasil');
  assert.equal(ufPor('DF'), 'pelo Distrito Federal');
  assert.equal(ufPor('PB'), 'pela Paraíba');
  assert.equal(ufPor('GO'), 'por Goiás');
  const r = await responder('candidatos ao governo da bahia', null);
  assert.ok(r.directAnswer.includes('a Governador na Bahia'), r.directAnswer);
  const tarcisio = (await responder('quem é o tarcisio')).directAnswer;
  assert.ok(tarcisio.startsWith('TARCÍSIO — Governador por São Paulo\nNúmero na urna: 10 · Partido: REPUBLICANOS'), tarcisio);
});

test('regras do voto: branco/nulo e obrigatoriedade com as citações legais', async () => {
  const nulo = await responder('voto nulo anula a eleição?');
  assert.equal(nulo.intent, 'REGRAS_VOTO');
  assert.ok(nulo.directAnswer.startsWith('Voto em branco e voto nulo (regras oficiais):'), nulo.directAnswer);
  assert.ok(nulo.directAnswer.includes('(Constituição, art. 77, §2º; Lei 9.504/1997, arts. 2º e 5º)'));
  assert.ok(nulo.directAnswer.includes('Código Eleitoral (art. 224)'));
  assert.ok(!nulo.directAnswer.includes('Quem deve votar'));
  assert.ok(nulo.fonte.startsWith('Fonte: Constituição Federal, Lei 9.504/1997 e Código Eleitoral'));
  const obr = await responder('o voto é obrigatório?');
  assert.ok(obr.directAnswer.startsWith('Quem deve votar (Constituição, art. 14, §1º):'), obr.directAnswer);
  assert.ok(obr.directAnswer.includes('\n• Facultativo: jovens de 16 e 17 anos, maiores de 70 anos e analfabetos.'));
});

test('pesquisas: plural, datas dd/mm/aaaa, a mais recente primeiro e cargo em lista ("Governador, Senador")', async () => {
  const { dados } = await base();
  const r = await responder('pesquisas para senador na bahia', null);
  const ba = dados.pesquisas.filter((p) => p.uf === 'BA' && (p.cargo ?? '').split(',').some((c) => c.trim() === 'Senador'));
  assert.ok(ba.length > 1);
  assert.ok(r.directAnswer.startsWith(`O TSE tem ${ba.length.toLocaleString('pt-BR')} pesquisas eleitorais registradas na Bahia (Senador).`), r.directAnswer);
  const recente = [...ba].sort((a, b) => (b.dataRegistro ?? '').localeCompare(a.dataRegistro ?? ''))[0];
  assert.ok(r.directAnswer.includes(`\nRegistro mais recente: ${recente.empresa}`), r.directAnswer);
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(r.directAnswer), 'datas sempre em dd/mm/aaaa');
});

test('formato em linhas: título, itens, campos com rótulo curto e links (porte de TextoResposta.kt)', () => {
  const texto = 'Título da resposta: com dois-pontos\n• 13 — LULA (PT)\n• Fonte: https://exemplo.gov.br/a.\n' +
    'Ficha Limpa: Sem impedimento\nUm rótulo comprido demais com sete palavras aqui: valor\nVeja https://x.tse.jus.br/; ok\n\n   \n' +
    'Ver em https://a.b/c: detalhe';
  const l = linhasResposta(texto);
  assert.deepEqual(l.map((x) => x.tipo), ['titulo', 'item', 'item', 'campo', 'texto', 'texto', 'texto']);
  assert.deepEqual(l[1].partes, [{ texto: '13 — LULA (PT)' }]);
  assert.deepEqual(l[2].partes, [{ texto: 'Fonte: ' }, { url: 'https://exemplo.gov.br/a' }, { texto: '.' }], 'item não ganha rótulo; ponto final fora do link');
  assert.equal(l[3].rotulo, 'Ficha Limpa');
  assert.deepEqual(l[3].partes, [{ texto: 'Sem impedimento' }]);
  assert.deepEqual(l[5].partes, [{ texto: 'Veja ' }, { url: 'https://x.tse.jus.br/' }, { texto: '; ok' }]);
  assert.equal(l[6].tipo, 'texto', 'rótulo com "http" não é campo');
  assert.deepEqual(partesComLinks('sem links'), [{ texto: 'sem links' }]);
  assert.deepEqual(partesComLinks('(https://a.b/c)'), [{ texto: '(' }, { url: 'https://a.b/c' }, { texto: ')' }]);
  assert.deepEqual(linhasResposta(''), []);
});

test('respostas reais seguem o formato: 1ª linha título, itens "• ", e o perfil em campos', async () => {
  const lula = linhasResposta((await responder('lula')).directAnswer);
  assert.equal(lula[0].tipo, 'titulo');
  const campos = lula.filter((x) => x.tipo === 'campo').map((x) => x.rotulo);
  for (const c of ['Número na urna', 'Vice', 'Nome completo', 'Situação no TSE', 'Ficha Limpa']) assert.ok(campos.includes(c), `${c}: ${campos}`);
  const pres = linhasResposta((await responder('Quem disputa a Presidência?')).directAnswer);
  assert.ok(pres.filter((x) => x.tipo === 'item').length === 13);
});

test('ajuda, agradecimento e recomendação respondem sem consultar candidaturas', async () => {
  const oi = await responder('bom dia, tudo bem?');
  assert.equal(oi.intent, 'AJUDA');
  assert.ok(oi.directAnswer.startsWith('Olá! Sou o assistente do SaibaTudo Eleições 2026'), oi.directAnswer);
  assert.ok(oi.directAnswer.includes('• "Candidatos a governador em SP"'));
  const obg = await responder('obrigado!', 'MG');
  assert.ok(obg.directAnswer.startsWith('De nada!') && obg.directAnswer.includes('em MG"'), obg.directAnswer);
  const rec = await responder('em quem votar');
  assert.ok(rec.directAnswer.includes('\n• perfil, Ficha Limpa e situação da candidatura'), rec.directAnswer);
});

test('motor: simulador sem candidato e ajuda não baixam candidaturas; número com "Meu estado" baixa só BR + UF', async () => {
  const lidos = [];
  const store = new DataStore({ baseUrl: BASE, fetchFn: fetchDeDisco(DADOS, BASE, lidos) });
  await store.iniciar();
  const motor = new Engine({ store, hoje: () => '2026-10-01', ufPadrao: () => 'SP' });
  for (const q of ['Simular voto na urna', 'simulador', 'oi', 'voto nulo', 'obrigado']) {
    const r = await motor.responder(q);
    assert.ok(r.resolvida, q);
  }
  assert.deepEqual(store.ufsCarregadas, [], 'nenhuma UF baixada');
  const r = await motor.responder('quem é o 13');
  assert.ok(r.directAnswer.includes('LULA') && r.directAnswer.includes('FERNANDO HADDAD'), r.directAnswer);
  assert.deepEqual(store.ufsCarregadas.sort(), ['BR', 'SP']);
  assert.ok(!lidos.includes('candidatos/RJ.json'));
  // simulador com candidato precisa localizar o nome
  assert.equal(independeDosDados(parse('Simular voto em Fulano de Tal', { partidos: new Map(), buscarPorNome: () => [] })), false);
});

test('a nuvem também pode devolver as intenções novas (com entidades novas neutras)', async () => {
  const { gaz } = await base();
  const v = validarNluNuvem({ intent: 'regras_voto' }, gaz, 'pergunta');
  assert.equal(v.intent, 'REGRAS_VOTO');
  assert.deepEqual([v.numero, v.genero, v.vice, v.apenasIndeferidas, v.nacional], [null, null, false, null, false]);
  for (const i of ['SIMULADOR', 'AJUDA', 'PLANO_GOVERNO', 'CONTAS_CAMPANHA']) assert.equal(validarNluNuvem({ intent: i }, gaz, 'x')?.intent, i);
});
