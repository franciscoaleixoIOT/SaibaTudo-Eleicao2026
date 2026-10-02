// NLU LOCAL determinístico (regras): porte fiel de LocalNlu.kt. Converte uma pergunta em ParsedQuery.
// Não consulta nem produz fatos: apenas identifica intenção e entidades (cargo, UF, partido, nome, número, tema).
// Os mesmos casos de referência (contracts/nlu_golden_cases.json) validam este NLU e o do Android.
import { NOMES_UF, SIGLAS, escapeRx, normalizar } from './model.js';
import { STOP_NOME } from './gazetteer.js';

export const INTENTS = [
  'LISTAR_CANDIDATOS', 'PERFIL_CANDIDATO', 'CONTAR', 'PESQUISAS', 'CALENDARIO', 'LOCAL_VOTACAO', 'REGRAS_URNA',
  'REGRAS_VOTO', // voto branco/nulo, obrigatoriedade, justificativa
  'SENADO_DOIS_VOTOS',
  'ELEGIBILIDADE', // situação do registro e Ficha Limpa
  'PLANO_GOVERNO', 'CONTAS_CAMPANHA', 'RESULTADOS', 'SEGUNDO_TURNO', 'PATRIMONIO', 'FONTES', 'SOBRE_DADOS',
  'SIMULADOR', // abre o simulador educativo da urna
  'AJUDA', // saudações, agradecimentos e "o que você faz"
  'RECOMENDACAO', 'DESCONHECIDA'
];

const rxPalavra = (kw) => new RegExp(`\\b${escapeRx(kw)}\\b`);

const CARGOS = [
  ['vice presidente', 'VICE_PRESIDENTE'], ['vice governador', 'VICE_GOVERNADOR'],
  ['deputado federal', 'DEPUTADO_FEDERAL'], ['deputados federais', 'DEPUTADO_FEDERAL'],
  ['deputada federal', 'DEPUTADO_FEDERAL'], ['dep federal', 'DEPUTADO_FEDERAL'],
  ['deputado estadual', 'DEPUTADO_ESTADUAL'], ['deputados estaduais', 'DEPUTADO_ESTADUAL'],
  ['deputada estadual', 'DEPUTADO_ESTADUAL'], ['dep estadual', 'DEPUTADO_ESTADUAL'],
  ['deputado distrital', 'DEPUTADO_DISTRITAL'], ['deputados distritais', 'DEPUTADO_DISTRITAL'],
  ['senadores', 'SENADOR'], ['senadora', 'SENADOR'], ['senador', 'SENADOR'], ['senado', 'SENADOR'],
  ['governo federal', 'PRESIDENTE'],
  ['governadores', 'GOVERNADOR'], ['governadora', 'GOVERNADOR'], ['governador', 'GOVERNADOR'],
  ['governo do estado', 'GOVERNADOR'], ['governo de', 'GOVERNADOR'], ['governo', 'GOVERNADOR'],
  ['presidentes', 'PRESIDENTE'], ['presidencia', 'PRESIDENTE'], ['presidente', 'PRESIDENTE'],
  ['planalto', 'PRESIDENTE'], ['federais', 'DEPUTADO_FEDERAL'], ['estaduais', 'DEPUTADO_ESTADUAL']
].map(([kw, code]) => ({ kw, code, rx: rxPalavra(kw), rxG: new RegExp(`\\b${escapeRx(kw)}\\b`, 'g') }));

/** "plano de governo" não é o cargo de Governador. */
const RX_PLANO_DE_GOVERNO = /\b(planos?|programas?|projetos?) (de|do) governo\b/g;

// "mato grosso do sul" antes de "mato grosso"; "minas gerais" antes de "minas" (ordenação estável por tamanho, igual ao Kotlin)
const NOMES_UF_NORM = [
  ...Object.entries(NOMES_UF).map(([sigla, nome]) => ({ nome: normalizar(nome), sigla })),
  { nome: 'minas', sigla: 'MG' }, { nome: 'brasilia', sigla: 'DF' }
]
  .sort((a, b) => b.nome.length - a.nome.length)
  .map((x) => ({ ...x, rx: rxPalavra(x.nome), rxG: new RegExp(`\\b${escapeRx(x.nome)}\\b`, 'g') }));

/** Siglas de UF que coincidem com palavras comuns: só valem após preposição/“estado”/“uf” ou em maiúsculas. */
const SIGLAS_AMBIGUAS = new Set(['se', 'pa', 'to', 'ma', 'al', 'am', 'go', 'es', 'ac', 'ap', 'pe', 'pi', 'ro', 'rr']);

const SIGLAS_RX = SIGLAS.map((sigla) => {
  const s = sigla.toLowerCase();
  return {
    sigla,
    maiuscula: new RegExp(`(^|[^A-Za-zÀ-ÿ])${sigla}(?![A-Za-zÀ-ÿ])`),
    comPrep: new RegExp(`\\b(em|de|do|da|no|na|por|pelo|pela|uf|estado|governo de|senado de)\\s+${s}\\b`),
    livre: SIGLAS_AMBIGUAS.has(s) ? null : new RegExp(`\\b${s}\\b`)
  };
});

const TEMAS = [
  ['saude', 'saude'], ['educacao', 'educacao'], ['escola', 'educacao'], ['seguranca', 'seguranca'],
  ['seguranca publica', 'seguranca'], ['economia', 'economia'], ['emprego', 'economia'],
  ['meio ambiente', 'meio_ambiente'], ['ambiente', 'meio_ambiente'], ['transporte', 'transporte'],
  ['mobilidade', 'transporte'], ['moradia', 'moradia'], ['habitacao', 'moradia'], ['agro', 'agro'],
  ['agropecuaria', 'agro'], ['agricultura', 'agro'], ['cultura', 'cultura'], ['esporte', 'esporte'],
  ['tecnologia', 'tecnologia'], ['inovacao', 'tecnologia'], ['ciencia', 'tecnologia'],
  ['assistencia social', 'assistencia'], ['saneamento', 'saneamento'], ['energia', 'energia'],
  ['infraestrutura', 'infraestrutura'], ['transparencia', 'transparencia'], ['corrupcao', 'transparencia'],
  ['mulheres', 'mulheres'], ['juventude', 'juventude'], ['jovens', 'juventude'], ['idosos', 'idosos'],
  ['turismo', 'turismo'], ['pessoa com deficiencia', 'pcd'], ['acessibilidade', 'pcd']
].map(([kw, id]) => ({ kw, id, rx: rxPalavra(kw) }))
  .sort((a, b) => b.kw.length - a.kw.length); // sortedByDescending (estável)

/** Pedido explícito do país todo: não aplicar o "Meu estado". */
const FRASES_BRASIL_TODO = ['em todo o brasil', 'no brasil todo', 'brasil todo', 'todo o pais', 'pais todo', 'em todo o pais', 'todos os estados'];

const PARTIDOS_AMBIGUOS = new Set([
  'novo', 'rede', 'agir', 'missao', 'democrata', 'uniao', 'pode', 'avante', 'mobiliza', 'solidariedade',
  'cidadania', 'up', 'dc', 'pv', 'pp', 'psd'
]);

const RX_RECOMENDACAO = [
  /\bem quem (eu )?(devo|deveria|posso|vou|voto|votar|votaria|votar)\b/,
  /\bquem (eu )?(devo|deveria|vale a pena|e melhor|seria melhor|merece)\b/,
  /\b(melhor|pior|mais honest\w*|mais corrupt\w*|mais competente|mais preparad\w*|ideal|mais confiavel)\b.*\b(candidat\w*|president\w*|governador\w*|senador\w*|deputad\w*)\b/,
  /\b(candidat\w*|president\w*|governador\w*|senador\w*|deputad\w*)\b.*\b(melhor|pior|mais honest\w*|mais corrupt\w*|mais competente|mais preparad\w*)\b/,
  /\bvota(r)?\s+(em|no|na)\s+quem\b/,
  /\b(recomend\w*|indic\w*|indiq\w*|sugir\w*|suger\w*|aconselh\w*)\b.*\b(candidat\w*|voto|votar|president\w*|governador\w*|senador\w*|deputad\w*)\b/,
  /\bquem (vai|vao|deve|devera|tem mais chance de) (ganhar|vencer|ser eleito|se eleger|ganha)\b/,
  /\bquem (ganha|vence|ganhara|vencera)\b.*\b(eleic\w*|president\w*|governo|senado)\b/
];

const RX_RESULTADOS = new RegExp(
  '\\b(quem (ganhou|venceu|foi eleito|foram eleitos|esta ganhando|esta na frente|lidera|ficou em)|resultados?|apuracao|apurado\\w*|' +
  'votos (teve|recebeu|obteve|tem)|quantos votos|eleitos?|mais votad\\w*|percentual de votos|totalizacao|boletim de urna|' +
  'passou para o segundo|quem passou)\\b'
);

/** Mensagem que é SÓ saudação/agradecimento/pedido de ajuda (ex.: "oi", "bom dia, tudo bem?", "obrigado!"). */
const RX_SAUDACAO = new RegExp(
  '^(oi+|ola|opa|bom dia|boa tarde|boa noite|e ai|eai|hey|hello|hi|obrigad[oa]|muito obrigad[oa]|valeu|vlw|brigad[oa]|' +
  'ajuda|help|socorro|menu|inicio|comecar|teste|testando)([\\s,!.?]+(tudo bem|td bem|tudo bom|como vai|assistente|ia|amigo|pessoal))*[\\s,!.?]*$'
);
const RX_AJUDA = new RegExp(
  '\\b(o que|oque) (voce|vc|o app|o aplicativo|esse app|este app|a ia) (faz|sabe|responde|pode)\\b|\\bcomo (usar|uso|funciona) (o |este |esse )?(app|aplicativo|assistente)\\b|' +
  '\\bsobre o (app|aplicativo)\\b|\\bquem (fez|criou|desenvolveu) (o |este |esse )?(app|aplicativo)\\b|\\bo que (posso|eu posso|da para|da pra) perguntar\\b|\\bpreciso de ajuda\\b'
);
const RX_SIMULADOR = /\bsimula\w*\b|\btreinar (o |meu )?voto\b|\bpraticar (o |meu )?voto\b|\burna (de )?teste\b/;
const RX_REGRAS_VOTO = new RegExp(
  '\\bvot\\w* (nulo|em branco|branco|nul\\w*)\\b|\\bnulos?\\b|\\bem branco\\b|\\bbrancos e nulos\\b|\\banular (o |meu )?voto\\b|' +
  '\\bvoto (e |eh )?obrigatori\\w*|\\bobrigad\\w* a votar\\b|\\bobrigatori\\w* (votar|o voto)\\b|\\bvoto facultativo\\b|\\bfacultativ\\w*\\b|' +
  '\\bquem (e|eh) obrigado\\b|\\bvotos validos\\b|\\bse eu nao votar\\b|\\bmulta\\b'
);
const RX_PLANO = /\bplanos? de governo\b|\bprogramas? de governo\b|\bpropostas?\b|\bplano\b/;
const RX_CONTAS = new RegExp(
  '\\bgast\\w*\\b|\\bdespesas?\\b|\\barrecad\\w*\\b|\\breceitas?\\b|\\bdoac\\w*\\b|\\bdoador\\w*\\b|\\bprestacao de contas\\b|' +
  '\\bcontas (de|da) campanha\\b|\\bfinanciamento\\b|\\bfundo (eleitoral|partidario)\\b|\\bcusto da campanha\\b|\\bquanto (custou|recebeu)\\b'
);
const RX_ELEGIBILIDADE = new RegExp(
  '\\bficha (limpa|suja)\\b|\\belegibilidade\\b|\\binelegi\\w*\\b|\\bindeferid\\w*\\b|\\bimpugna\\w*\\b|\\bcassa\\w*\\b|\\bbarrad\\w*\\b|' +
  '\\bsituacao (do|da) (registro|candidatura)\\b|\\bregistro (negado|aprovado|deferido|indeferido)\\b|\\bdeferid\\w*\\b|\\bsub judice\\b|' +
  '\\bcondenad\\w*\\b|\\bprocessad\\w*\\b|\\bcriminal\\b|\\bantecedentes\\b|\\baptos?\\b|\\binaptos?\\b'
);
const RX_FICHA_POSITIVA = /\bficha limpa\b|\bdeferid\w*|\belegivel\b|\belegiveis\b|\baptos?\b/;
const RX_FICHA_NEGATIVA = /\bficha suja\b|\bindeferid\w*|\binelegive\w*|\bbarrad\w*|\bimpugnad\w*|\binaptos?\b|\bcassad\w*|\bnegad\w*/;
const RX_VICE = /\bvices?\b|\bsuplentes?\b|\bcompanheir\w* de chapa\b|\bchapa\b/;
const RX_FEMININO = /\bmulher(es)?\b|\bcandidatas\b|\bfeminin\w*\b/;
const RX_MASCULINO = /\bhomens\b|\bmasculin\w*\b/;
const RX_TEMA_EXPLICITO = /\bpropost\w*\b|\bplano\b|\btemas?\b|\bdefend\w*\b|\bcit\w+\b|\bfala\w* (de|sobre)\b/;
const RX_NUMERO = /\b(numero|n|no|nº|n°|candidat[oa]s?|quem e (?:o|a)|qual e (?:o|a)|o|a)\s+(\d{2,5})\b/;
const RX_SO_NUMERO = /^\s*(\d{2,5})\s*\??\s*$/;
const NUMERO_EXPLICITO = new Set(['numero', 'n', 'nº', 'n°']);
const TEM_LETRA_OU_DIGITO = /[\p{L}\p{Nd}]/u; // Char.isLetterOrDigit (Kotlin)

const RX = {
  senado: /\b(dois|2|duas) (senadores|votos para senador|vagas)\b|\bsegunda vaga\b|\bmesmo senador\b|\brenovacao de 2\/3\b|\bvoto duplicado\b/,
  senadoQtd: /\b(quantos votos|quantos senadores|voto duplo)\b/,
  urna: /\bordem de votacao\b|\bcomo (funciona|vota|votar|e) (a |na )?urna\b|\bquantos (digitos|numeros)\b|\bdigitos\b|\bcomo digitar\b|\bcomo (se )?votar\b|\bcomo (eu )?voto\b|\bcomo se vota\b|\bpasso a passo\b/,
  local: /\bonde (eu )?(voto|votar|vou votar)\b|\blocal de votacao\b|\bzona eleitoral\b|\bsecao eleitoral\b|\btitulo\b|\be-titulo\b|\bjustific\w*\b|\bdocumentos?\b|\bnao (vou|posso) votar\b/,
  calendario: /\bcalendario\b|\bquando (e|sera|ocorre|acontece|vai ser|tem|e a)\b|\bque dia\b|\bdata (da|das|de|do) (eleic|votac|segundo|primeiro|posse)\w*\b|\bdia (da|de) (eleic|votac)\w*\b|\bque horas\b|\bate que horas\b|\bprazos?\b|\bhorarios?\b|\bposse\b|\bdiplom\w*\b/,
  pesquisas: /\bpesquisas?\b|\binstituto\b|\bdatafolha\b|\bquaest\b|\bipec\b|\batlas ?intel\b|\bpesq ?ele\b|\bintencao de voto\b/,
  turno2: /\bsegundo turno\b|\b2 ?(o|º)? turno\b/,
  turno1: /\bprimeiro turno\b|\b1 ?(o|º)? turno\b/,
  sobreDados: /\bde onde (vem|vêm|sao)\b|\bfontes?\b|\bdados (sao|vem|oficiais)\b|\batualizad\w*\b|\batualizacao\b|\bultima atualizacao\b|\bversao\b/,
  fontes: /\bsites? oficia\w*\b|\bdivulgacand\w*\b|\btre\b|\bonde consulto\b|\blinks? (oficia\w*|do tse)\b/,
  listagem: /\bquem (disputa|disputam|concorre|concorrem|sao)\b|\bcandidat\w* (a|ao|à|para|de|do|da|em|que|com)\b|\blista( de)? candidat\w*\b|\bmostr\w* (os )?candidat\w*\b|\bver (os )?candidat\w*\b|\bquais (os |sao os )?candidat\w*\b/,
  patrimonio: /\bpatrimonio\b|\bbens\b|\briqueza\b|\bric[oa]s?\b|\bdeclarou\b|\bquanto (tem|possui)\b/,
  contar: /\bquantos\b|\bquantas\b|\bnumero de candidat\w*\b|\btotal de candidat\w*\b/,
  candidat: /\bcandidat\w*\b/,
  estreante: /\bestreante\w*\b|\bprimeira vez\b|\bnunca (foi )?eleit\w*\b|\bnovato\w*\b/,
  reeleicao: /\breeleicao\b|\btentando reeleicao\b|\bja (foi )?eleit\w*\b/,
  veterano: /\bveterano\w*\b|\bvarias vezes eleito\b/,
  paraPA: /\b(estado do|no|em|do|de) para\b/
};

const cacheRxPartido = new Map();
function rxPartido(norm) {
  let r = cacheRxPartido.get(norm);
  if (!r) {
    const esc = escapeRx(norm);
    r = PARTIDOS_AMBIGUOS.has(norm)
      ? new RegExp(`\\b(partido|do|pelo|pela|da|federacao|legenda)\\s+${esc}\\b`)
      : new RegExp(`\\b${esc}\\b`);
    cacheRxPartido.set(norm, r);
  }
  return r;
}

/** O usuário pediu explicitamente o país todo ("em todo o Brasil"): não aplicar o "Meu estado". */
export const pedeBrasilTodo = (t) => FRASES_BRASIL_TODO.some((f) => t.includes(f));

/**
 * Interpreta a pergunta. Mesma ORDEM de verificações do LocalNlu.kt.
 * @param {string} query pergunta do usuário
 * @param {import('./gazetteer.js').Gazetteer} gaz dicionário de partidos/nomes
 */
export function parse(query, gaz) {
  const raw = String(query ?? '').trim().slice(0, 300);
  const t = normalizar(raw);
  const cargo = extrairCargo(t.replace(RX_PLANO_DE_GOVERNO, ' '));
  const uf = extrairUf(raw, t);
  const partido = extrairPartido(t, gaz);
  let tema = extrairTema(t);
  const turno = extrairTurno(t);
  const positiva = RX_FICHA_POSITIVA.test(t);
  const negativa = RX_FICHA_NEGATIVA.test(t);
  const deferidas = positiva && !negativa ? true : null;
  const indeferidas = negativa && !positiva ? true : null;
  const historico = extrairHistorico(t);
  let genero = RX_FEMININO.test(t) ? 'FEMININO' : RX_MASCULINO.test(t) ? 'MASCULINO' : null;
  // "mulheres" também é tema de plano de governo: só é tema quando a pergunta fala de plano/propostas
  if (tema === 'mulheres' && genero != null) {
    if (RX_TEMA_EXPLICITO.test(t)) genero = null; else tema = null;
  }
  const numero = extrairNumero(t);
  const vice = RX_VICE.test(t);
  const nacional = uf == null && pedeBrasilTodo(t);

  const q = (intent, nome = null) => ({
    intent, cargo, uf, partido, nome, tema, apenasDeferidas: deferidas, apenasIndeferidas: indeferidas, historico, turno,
    numero, genero, vice, nacional, textoOriginal: raw
  });
  const nome = () => resolverNome(t, raw, cargo, uf, partido, gaz);

  if (t.length === 0 || !TEM_LETRA_OU_DIGITO.test(t)) return q('DESCONHECIDA');

  // 0. Saudações, agradecimentos e pedidos de ajuda (respondidos sem consultar dados)
  if (RX_SAUDACAO.test(t) || RX_AJUDA.test(t)) return q('AJUDA');

  // 1. Pedido de recomendação/previsão: recusa neutra (política do app + normas eleitorais sobre IA)
  if (RX_RECOMENDACAO.some((r) => r.test(t))) return q('RECOMENDACAO');

  // 1.1 Simulador educativo (opcionalmente com um candidato: "Simular voto em LULA (13)")
  if (RX_SIMULADOR.test(t)) return q('SIMULADOR', nome());

  // 2. Regras e informações do processo eleitoral
  if (RX.senado.test(t) || (t.includes('senador') && RX.senadoQtd.test(t))) return q('SENADO_DOIS_VOTOS');
  if (RX_REGRAS_VOTO.test(t)) return q('REGRAS_VOTO');
  if (RX.urna.test(t)) return q('REGRAS_URNA');
  if (RX.local.test(t)) return q('LOCAL_VOTACAO');
  if (RX.calendario.test(t)) return q('CALENDARIO');

  // 3. Pesquisas registradas (antes de "resultado", que também aparece em "resultado da pesquisa")
  if (RX.pesquisas.test(t)) return q('PESQUISAS');

  // 3.1 Segundo turno e resultados
  if (RX.turno2.test(t) && !RX_RESULTADOS.test(t.replaceAll('segundo turno', ''))) return q('SEGUNDO_TURNO');
  if (RX_RESULTADOS.test(t)) return q('RESULTADOS');

  // 4. Fontes e sobre os dados
  if (RX.sobreDados.test(t)) return q('SOBRE_DADOS');
  if (RX.fontes.test(t)) return q('FONTES');

  // 5. Plano de governo, contas, patrimônio, Ficha Limpa, contagem
  const listagem = RX.listagem.test(t);
  const falaCandidatos = listagem || RX.candidat.test(t);
  if (RX_PLANO.test(t)) {
    if (tema != null && falaCandidatos) return q('LISTAR_CANDIDATOS');
    const n = nome();
    if (n != null) return q('PLANO_GOVERNO', n);
    if (numero != null) return q('PLANO_GOVERNO');
    return q(tema != null ? 'LISTAR_CANDIDATOS' : 'PLANO_GOVERNO');
  }
  if (RX_CONTAS.test(t)) return q('CONTAS_CAMPANHA', nome());
  if (RX.patrimonio.test(t)) return q('PATRIMONIO', !listagem ? nome() : null);
  if (RX_ELEGIBILIDADE.test(t)) return q('ELEGIBILIDADE', nome());
  if (RX.contar.test(t)) return q('CONTAR');

  // 6. Candidato por número ("quem é o 13") ou por nome (quando não é uma pergunta de listagem)
  if (numero != null) return q('PERFIL_CANDIDATO');
  if (!listagem) {
    const n = nome();
    if (n != null) return q('PERFIL_CANDIDATO', n);
  }

  // 7. Listagens por cargo/UF/partido/tema/gênero
  if (listagem || cargo != null || partido != null || tema != null || historico != null || genero != null || uf != null || falaCandidatos) {
    return q('LISTAR_CANDIDATOS');
  }
  return q('DESCONHECIDA');
}

// ------------------------------------------------------------------------------------------------ entidades

export function extrairCargo(t) {
  for (const c of CARGOS) if (c.rx.test(t)) return c.code;
  return null;
}

export function extrairUf(raw, t) {
  for (const { nome, sigla, rx } of NOMES_UF_NORM) {
    // "para" (estado) colide com a preposição: só vale como "estado do pará"/"no pará"/"em pará"
    if (nome === 'para') {
      if (RX.paraPA.test(t)) return 'PA';
      continue;
    }
    if (rx.test(t)) return sigla;
  }
  // Siglas isoladas
  for (const { sigla, maiuscula, comPrep, livre } of SIGLAS_RX) {
    if (maiuscula.test(raw) || comPrep.test(t) || (livre != null && livre.test(t))) return sigla;
  }
  return null;
}

export function extrairPartido(t, gaz) {
  for (const [norm, sigla] of gaz.partidos) {
    if (rxPartido(norm).test(t)) return sigla;
  }
  return null;
}

export function extrairTema(t) {
  for (const x of TEMAS) if (x.rx.test(t)) return x.id;
  return null;
}

/** Número de urna citado ("quem é o 13", "candidato 1234", "13"). Anos (2018–2030) só valem após "número". */
export function extrairNumero(t) {
  const so = RX_SO_NUMERO.exec(t);
  if (so) return so[1];
  const m = RX_NUMERO.exec(t);
  if (!m) return null;
  const n = m[2];
  const explicito = NUMERO_EXPLICITO.has(m[1]);
  const v = Number.parseInt(n, 10);
  if (n.length === 4 && v >= 2018 && v <= 2030 && !explicito) return null;
  return n;
}

function extrairTurno(t) {
  if (RX.turno2.test(t)) return 2;
  if (RX.turno1.test(t)) return 1;
  return null;
}

function extrairHistorico(t) {
  if (RX.estreante.test(t)) return 'NUNCA_ELEITO';
  if (RX.reeleicao.test(t)) return 'ELEITO_MESMO_CARGO';
  if (RX.veterano.test(t)) return 'ELEITO_2_OU_MAIS';
  return null;
}

// ------------------------------------------------------------------------------------------------ nome de candidato

const STOP_EXTRA = new Set([
  'disputa', 'disputam', 'disputar', 'concorre', 'concorrem', 'concorrer', 'lista', 'listar', 'todos', 'todas',
  'onde', 'quando', 'como', 'sao', 'ser', 'tenho', 'posso', 'quero', 'gostaria', 'saber', 'exibir', 'filtrar',
  'filtro', 'entre', 'estado', 'estados', 'brasil', 'nacional', 'regiao', 'ano', 'segundo', 'primeiro', 'turno',
  'fale', 'fala', 'falar', 'diga', 'me', 'pode', 'pelo', 'pela', 'uma', 'uns', 'esse', 'essa', 'este', 'esta',
  'aquele', 'aquela', 'dele', 'dela', 'seu', 'sua', 'meu', 'minha', 'tudo', 'mais', 'menos', 'muito', 'pouco',
  'votar', 'votei', 'votando', 'vota', 'novo', 'nova', 'novos', 'novas', 'outro', 'outra', 'algum', 'alguma',
  'preciso', 'precisa', 'decidir', 'escolher', 'escolha', 'gostar', 'gosto', 'queria', 'tinha',
  'simular', 'simulador', 'simule', 'plano', 'planos', 'governo', 'programa', 'propostas', 'proposta', 'projetos',
  'gastou', 'gastos', 'gasto', 'gasta', 'campanha', 'contas', 'despesas', 'receitas', 'doacoes', 'arrecadou',
  'chapa', 'suplentes', 'mulher', 'mulheres', 'homens', 'candidatas', 'feminino', 'masculino', 'suja',
  'situacao', 'registro', 'candidatura', 'inelegivel', 'indeferido', 'deferido', 'rico', 'rica', 'ajuda', 'voce'
]);

const SEPARADORES = /[ ?!.,;:"'()]/;
const TEM_LETRA = /\p{L}/u;

/**
 * Procura um nome de candidato na pergunta removendo palavras de função, cargos, UFs e partidos.
 * Só devolve um nome se existir candidato correspondente (todas as palavras presentes no nome).
 */
export function resolverNome(t, raw, cargo, uf, partido, gaz) {
  let texto = t;
  for (const c of CARGOS) texto = texto.replace(c.rxG, ' ');
  for (const n of NOMES_UF_NORM) texto = texto.replace(n.rxG, ' ');
  if (partido != null) texto = texto.replace(new RegExp(`\\b${escapeRx(normalizar(partido))}\\b`, 'g'), ' ');
  const tokens = texto.split(SEPARADORES)
    .filter((x) => x.length >= 3 && TEM_LETRA.test(x) && !STOP_NOME.has(x) && !STOP_EXTRA.has(x));
  if (tokens.length === 0) return null;
  for (let tamanho = Math.min(tokens.length, 4); tamanho >= 1; tamanho--) {
    for (let i = 0; i + tamanho <= tokens.length; i++) {
      const termo = tokens.slice(i, i + tamanho).join(' ');
      if (tamanho === 1 && termo.length < 4) continue;
      if (gaz.buscarPorNome(termo, null, null, 1).length > 0) return termo;
    }
  }
  return null;
}
