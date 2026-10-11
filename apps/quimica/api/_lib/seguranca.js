// Segurança química: recusa por REGRA (antes de qualquer modelo) de pedidos de síntese, purificação, escalonamento ou obtenção
// caseira de explosivos, agentes químicos de guerra, drogas ilícitas e seus precursores controlados, venenos, gases tóxicos, reagentes
// perigosos "feitos em casa" e dano a pessoas (inclusive a si mesmo). Perigos, EPI, primeiros socorros, neutralização, descarte e
// incompatibilidades são respondidos normalmente.
//
// Paridade: este arquivo é espelhado em Seguranca.kt (Android) e em web/src/quimica/js/seguranca.js; os três são conferidos contra
// contracts/seguranca_cases.json (api/test/seguranca.test.mjs). Falha segura: na dúvida entre um pedido de produção e uma pergunta
// legítima, quem decide é a combinação ALVO (substância ou classe) + AÇÃO de produção, nunca a substância sozinha. Um contexto de
// proteção (primeiros socorros, antídoto, "o que fazer se...", efeitos...) salva uma ação GENÉRICA ("como fazer"), mas nunca uma ação
// FORTE ("sintetizar", "receita", "passo a passo"); e "com segurança" ou "descartar os resíduos" não salvam nada contra substâncias ilícitas.
//
// Tolerância a grafias alteradas: o texto é dobrado (acentos, caixa), "leet" (m3t4nf3t4m1n4), letras separadas (s i n t e s e),
// letras repetidas, palavras partidas (explo sivo) e variações fonéticas (k/c, z/s, ph/f, h mudo) são normalizados nos DOIS lados
// (texto e termos das regras); palavras longas toleram um erro de digitação. Aceita também os pedidos mais comuns em inglês.

import { editDistanceAtMost1, fold } from './ground.js';

export const RECUSA_PADRAO = 'Não posso ajudar com isso: o pedido envolve a produção, a purificação ou a obtenção de substâncias perigosas ou ilícitas '
  + '(explosivos, armas químicas, drogas ou venenos). Posso explicar os perigos, os equipamentos de proteção, os primeiros socorros, '
  + 'o descarte seguro e a química envolvida em nível conceitual.';

// ---------------------------------------------------------------- normalização

// Zero-width, soft hyphen e BOM (montado por código: sem caracteres invisíveis no arquivo)
const CONTROLES_INVISIVEIS = new RegExp(`[${[0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2060, 0xfeff, 0xad].map((c) => String.fromCodePoint(c)).join('')}]`, 'g');
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't' };

/** Variações fonéticas: aplicadas ao texto e aos termos das regras (por isso as regras são escritas em português normal). */
export function fonetica(s) {
  return s
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/h/g, '')
    .replace(/k/g, 'c')
    .replace(/y/g, 'i')
    .replace(/w/g, 'u')
    .replace(/[zx]/g, 's')
    .replace(/c(?=[ei])/g, 's')
    .replace(/(.)\1+/g, '$1');
}

/**
 * Duas visões do texto: `v1` (dobrado, só letras/dígitos, para siglas) e `v2` (leet resolvido, fonético, sem letras repetidas, para
 * palavras). `colado` = v2 sem espaços (pega "co.ca.ina" e "explo sivo").
 */
export function preparar(texto) {
  let t = fold(String(texto ?? '')).replace(CONTROLES_INVISIVEIS, '');
  t = t.replace(/[@]/g, 'a').replace(/\$/g, 's').replace(/(?<=[a-z])!(?=[a-z])/g, 'i');
  // letras soltas separadas por espaço, ponto, hífen ou asterisco ("s i n t e s e", "c.o.c.a.i.n.a") voltam a ser uma palavra
  t = t.replace(/(?<![a-z0-9])(?:[a-z0-9][ .\-_*]){3,}[a-z0-9](?![a-z0-9])/g, (m) => m.replace(/[ .\-_*]/g, ''));
  const v1 = t.replace(/[^a-z0-9]+/g, ' ').trim();
  const palavras = v1.split(' ').filter(Boolean).map((w) => (/[a-z]/.test(w) ? w.replace(/[0-9]/g, (d) => LEET[d] ?? d) : w));
  const t2 = palavras.map(fonetica);
  return { v1, tokens1: v1.split(' ').filter(Boolean), tokens2: t2, colado: t2.join('') };
}

// ---------------------------------------------------------------- termos

/** Compila um termo em português normal: "sintetiz*" (radical), "gas mostarda" (frase). */
function termo(txt) {
  const palavras = fold(txt).split(' ').filter(Boolean).map((p) => {
    const stem = p.endsWith('*');
    const w = fonetica(stem ? p.slice(0, -1) : p);
    return { w, stem };
  });
  // palavra única longa também é procurada no texto "colado" (pega palavras partidas ou com pontuação no meio)
  return { palavras, colar: palavras.length === 1 && palavras[0].w.length >= 8 ? palavras[0].w : null };
}

function palavraBate(tok, { w, stem }) {
  if (stem) return tok.startsWith(w);
  if (tok === w) return true;
  return w.length >= 7 && tok.length >= 6 && editDistanceAtMost1(tok, w);
}

function casa(p, t) {
  const n = t.palavras.length;
  for (let i = 0; i + n <= p.tokens2.length; i++) {
    let ok = true;
    for (let j = 0; j < n && ok; j++) ok = palavraBate(p.tokens2[i + j], t.palavras[j]);
    if (ok) return true;
  }
  return t.colar !== null && p.colado.includes(t.colar);
}

const compilar = (lista) => lista.map(termo);
const algum = (p, termos) => termos.some((t) => casa(p, t));
const siglas = (p, lista) => lista.some((s) => p.tokens1.includes(s));
const todos = (p, ...grupos) => grupos.every((g) => algum(p, typeof g[0] === 'string' ? compilar(g) : g));

// ---------------------------------------------------------------- ALVOS (substâncias e classes)

const CATEGORIAS = [
  {
    id: 'explosivo',
    siglas: ['tnt', 'rdx', 'hmx', 'petn', 'tatp', 'hmtd', 'anfo', 'ied', 'c4', 'c-4'],
    termos: compilar([
      'explosivo*', 'explosive*', 'bomba caseira', 'bomba artesanal', 'bomba improvisada', 'artefato explosivo', 'coquetel molotov', 'molotov',
      'granada', 'detonador*', 'dinamite', 'polvora', 'gunpowder', 'trinitrotolueno', 'nitroglicerina', 'hexogenio', 'octogeno', 'pentrita',
      'semtex', 'nitrocelulose', 'algodao polvora', 'peroxido de acetona', 'triperoxido de triacetona', 'azida de chumbo',
      'fulminato de mercurio', 'acido picrico', 'nitrato de ureia', 'napalm', 'termita', 'termite', 'fogos de artificio',
    ]),
    compostos: [
      [['nitrato de amonio'], ['diesel', 'oleo combustivel', 'combustivel']],
      [['acetona'], ['agua oxigenada', 'peroxido de hidrogenio'], ['acido']],
      [['clorato de potassio', 'perclorato'], ['acucar', 'enxofre', 'aluminio em po']],
      [['salitre', 'nitrato de potassio'], ['carvao'], ['enxofre']],
    ],
    // "bomba"/"bomb" sozinha: só vale se não for bomba de banho, de água, de chocolate etc.
    bomba: true,
  },
  {
    id: 'arma_quimica',
    siglas: ['vx'],
    termos: compilar([
      'sarin', 'soman', 'tabun', 'novichok', 'ciclosarin', 'agente nervoso', 'agentes nervosos', 'gas nervoso', 'gas mostarda',
      'mustard gas', 'mostarda sulfurada', 'mostarda nitrogenada', 'iperita', 'lewisita', 'fosgenio', 'phosgene', 'difosgenio', 'cianogenio',
      'arma quimica', 'armas quimicas', 'chemical weapon*', 'agente quimico de guerra', 'guerra quimica', 'gas de combate', 'agente laranja',
    ]),
  },
  {
    id: 'droga',
    siglas: ['lsd', 'mdma', 'ghb', 'pcp', 'dmt', 'meth'],
    termos: compilar([
      'cocaina', 'cocaine', 'crack', 'pasta base', 'pasta de coca', 'merla', 'heroina', 'heroin', 'metanfetamina', 'methamphetamine',
      'ecstasy', 'extase', 'molly', 'acido lisergico', 'dietilamida do acido lisergico', 'fentanil', 'fentanyl', 'fentanila', 'carfentanil',
      'mescalina', 'haxixe', 'hashish', 'catinona*', 'mefedrona', 'metcatinona', 'lean', 'opio', 'cloridrato de cocaina', 'spice',
      'canabinoide* sintetico*', 'droga* sintetica*', 'drogas ilicitas sinteticas',
      'fabricar droga*', 'produzir droga*', 'fazer droga*', 'cozinhar droga*', 'sintetizar droga*', 'preparar droga*', 'fabricar entorpecente*', 'produzir entorpecente*',
    ]),
  },
  {
    id: 'precursor',
    siglas: ['p2p', 'gbl'],
    termos: compilar([
      'pseudoefedrina', 'efedrina', 'safrol', 'isosafrol', 'piperonal', 'fenilacetona', 'acido fenilacetico', 'anidrido acetico',
      'ergotamina', 'norefedrina', 'fenilpropanolamina', 'butirolactona', 'acido antranilico', 'metilamina'
    ]),
  },
  {
    id: 'veneno',
    siglas: [],
    termos: compilar(['ricina', 'abrina', 'tetrodotoxina', 'aconitina', 'veneno indetectavel', 'veneno caseiro', 'cianeto*', 'cianureto', 'estricnina']),
  },
  {
    id: 'gas_toxico',
    siglas: [],
    termos: compilar([
      'gas toxico', 'gas venenoso', 'gas letal', 'gas asfixiante', 'gas lacrimogeneo', 'acido cianidrico', 'gas cianidrico',
      'cianeto de hidrogenio', 'arsina',
    ]),
    // o cloro (e a amônia) gasosos só viram alvo quando o pedido é usá-los contra alguém ou gerá-los misturando produtos de casa
    compostos: [[
      ['gas cloro', 'gas de cloro', 'cloro gasoso', 'gas amonia'],
      ['arma', 'atacar', 'ataque', 'machucar', 'ferir', 'matar', 'intoxicar', 'pessoas', 'produtos de limpeza', 'produto de limpeza', 'agua sanitaria', 'misturando', 'em casa', 'caseir*'],
    ]],
  },
  {
    id: 'cbrn',
    siglas: [],
    termos: compilar([
      'bomba atomica', 'bomba nuclear', 'bomba suja', 'arma nuclear', 'armas nucleares', 'bomba de hidrogenio', 'arma biologica',
      'armas biologicas', 'antraz', 'anthrax',
    ]),
  },
];

const PALAVRAS_BOMBA = ['bomba', 'bomb'].map(fonetica);
const BOMBA_BENIGNA = compilar([
  'atomica', 'nuclear', 'suja', // armas nucleares são da categoria cbrn
  'de banho', 'de chocolate', 'de agua', 'de ar', 'de calor', 'de vacuo', 'de insulina', 'de combustivel', 'de gasolina',
  'de bicicleta', 'de aquario', 'de piscina', 'de cabelo', 'de sorvete', 'de creme', 'hidraulica', 'submersa', 'peristaltica', 'centrifuga',
  'calorimetrica', 'calorimeter', 'calorimeters',
]);

/** "bomba" só conta se a(s) palavra(s) seguinte(s) não a tornam inofensiva (bomba de banho, de água, de chocolate...). */
function bombaPerigosa(p) {
  for (let i = 0; i < p.tokens2.length; i++) {
    const tk = p.tokens2[i];
    if (!PALAVRAS_BOMBA.some((b) => tk === b || tk === `${b}s`)) continue;
    const inicio = p.tokens2.slice(i + 1, i + 4);
    const benigna = BOMBA_BENIGNA.some((b) => b.palavras.every((pal, j) => inicio[j] !== undefined && palavraBate(inicio[j], pal)));
    if (!benigna) return true;
  }
  return false;
}

function temAlvo(p, cat) {
  if (siglas(p, cat.siglas)) return true;
  if (algum(p, cat.termos)) return true;
  if (cat.compostos?.some((grupos) => todos(p, ...grupos))) return true;
  if (cat.bomba && bombaPerigosa(p)) return true;
  if (cat.id === 'explosivo' && /(?:^| )c ?4(?: |$)/.test(p.v1)) return true;
  return false;
}

// ---------------------------------------------------------------- AÇÕES e contextos

// Verbos e expressões que descrevem PRODUZIR, PURIFICAR, AMPLIAR, OBTER ou ESCONDER: valem sozinhos junto de um alvo.
const ACAO_FORTE = compilar([
  'sintetiz*', 'synthesi*', 'sintese', 'fabricar', 'fabricacao', 'fabricando', 'fabricado', 'fabricada', 'cozinhar', 'cozinha*', 'purificar',
  'purificacao', 'refinar', 'refino', 'recristaliz*', 'extrair', 'extracao', 'receita', 'passo a passo', 'rota de sintese', 'larga escala',
  'escala industrial', 'em escala', 'escalonar', 'aumentar a producao', 'ampliar a producao', 'rendimento', 'caseir*', 'artesanal', 'clandestin*',
  'confeccionar', 'manufatur*', 'produzir', 'producao de', 'sem deixar rastro', 'sem ser detectado', 'sem ser descoberto', 'indetectavel',
  'esconder', 'ocultar', 'disfarcar', 'driblar', 'burlar', 'how to make', 'how to produce', 'how to build', 'how to cook', 'how to synthesize',
  'how to manufacture',
]);

// Verbos genéricos: só valem junto de um alvo e SEM contexto de proteção ("como fazer a descontaminação do sarin" passa).
const ACAO_GENERICA = compilar([
  'como fazer', 'como faco', 'como se faz', 'como faz', 'fazer', 'preparar', 'preparo', 'obter', 'conseguir', 'criar', 'construir',
  'montar', 'misturar', 'ensine', 'ensina', 'tutorial', 'proporcao', 'proporcoes', 'quanto de', 'quantidade para', 'comprar', 'adquirir',
  'sem receita', 'escondido', 'reagentes', 'how to', 'make', 'making',
]);

// Contexto que descreve o PERIGO, o EFEITO, a DEFESA ou o PEDIDO DE AJUDA: não é pedido de produção. Não pode ser usado como camuflagem.
const PROTECAO_FORTE = compilar([
  'neutraliz*', 'descontamin*', 'derram*', 'vazamento', 'primeiros socorros', 'antidoto', 'tratamento', 'tratar', 'tratada', 'sintoma*',
  'o que fazer', 'o que acontece', 'epi', 'luva*', 'respirador', 'incompativ*', 'perigo*', 'perigoso', 'risco*', 'toxicidade', 'efeito*',
  'historia', 'ilegal', 'crime', 'proibid*', 'detectar', 'identificar', 'evitar', 'prevenir', 'prevencao', 'bombeiro*', 'formula',
  'estrutura', 'massa molar', 'propriedades', 'o que e', 'o que sao', 'significa', 'diferenca', 'parar de usar', 'largar', 'vicio',
  'dependencia', 'dependente', 'reabilitacao', 'abstinencia', 'overdose', 'socorro', 'por que', 'porque', 'como funciona', 'como age',
  'age no', 'estavel', 'quem inventou', 'encontrad*', 'emergencia',
]);
// Contexto que só faz sentido para substâncias do dia a dia (descartar ácido, armazenar solvente): NÃO salva pedido sobre droga ou explosivo.
const PROTECAO_BRANDA = compilar(['seguranca', 'descarte', 'descartar', 'armazen*', 'proteger', 'protecao']);

// "como envenenar alguém", "que produto mata uma pessoa sem deixar rastro"
const PESSOAS = compilar([
  'alguem', 'uma pessoa', 'pessoa', 'vizinho', 'vizinha', 'chefe', 'meu marido', 'minha esposa', 'minha mulher', 'meu ex', 'minha ex',
  'colega', 'professor', 'professora', 'crianca', 'cachorro', 'gato', 'animal',
]);
const DANO_ENVENENAR = [compilar(['envenenar', 'envenena']), PESSOAS];
const DANO_MATAR = [
  compilar(['matar', 'mata', 'matam', 'mate', 'matou', 'assassinar', 'ferir', 'machucar', 'intoxicar', 'prejudicar']),
  PESSOAS,
  compilar([
    'veneno', 'venenoso', 'letal', 'cianeto', 'raticida', 'gas toxico', 'sem deixar rastro', 'sem deixar vestigio', 'sem deixar vestigios',
    'indetectavel', 'dose letal', 'substancia*', 'quimic*', 'sem ser detectado', 'sem ser descoberto',
  ]),
];
const SEM_DANO = compilar(['primeiros socorros', 'antidoto', 'tratamento', 'sintoma*', 'prevenir', 'evitar', 'por que', 'como funciona', 'como age']);

// dano a si mesmo: recusa sempre (o app mostra a orientação de ajuda); só passa quem pergunta sobre prevenção
const AUTOLESAO = compilar(['me matar', 'me envenenar', 'me suicidar', 'suicidio', 'tirar minha vida', 'acabar com minha vida', 'me intoxicar', 'me machucar com']);
const AJUDA_AUTOLESAO = compilar(['prevenir', 'prevencao', 'evitar', 'sinais de', 'como ajudar', 'estatistica*', 'cvv']);

const MISTURA_GAS = [
  compilar(['misturar', 'mistura', 'juntar', 'combinar']),
  compilar(['gas toxico', 'gas venenoso', 'gas letal', 'gerar gas', 'liberar gas', 'produzir gas', 'fazer gas', 'gas cloro', 'cloroamina*']),
  compilar(['para machucar', 'para ferir', 'para matar', 'para intoxicar', 'para prejudicar', 'para fazer mal', 'para atacar']),
];

const DROGA_RECREATIVA = [
  compilar(['dose', 'dosagem', 'quanto tomar', 'quanto usar', 'quanto consumir', 'quanto cheirar', 'quanto fumar']),
  compilar(['recreativ*', 'curtir', 'balada', 'festa', 'viajar', 'ficar chapado', 'ficar doidao', 'pra ficar', 'para ficar']),
];

// Ácidos e reagentes fortes: produzi-los EM CASA é pedido de risco (e nada que um app de química precise ensinar); descartar, diluir, armazenar,
// manusear e a produção industrial são perguntas legítimas.
const REAGENTES_PERIGOSOS = compilar([
  'acido sulfurico', 'acido nitrico', 'acido cloridrico', 'acido muriatico', 'acido fluoridrico', 'acido perclorico', 'agua regia', 'oleum',
]);
const PRODUCAO_DE_REAGENTE = compilar([
  'fazer', 'como fazer', 'produzir', 'sintetiz*', 'fabricar', 'fabricacao', 'obter', 'extrair', 'gerar', 'criar', 'sintese', 'producao de',
]);
const CASEIRO = compilar(['em casa', 'caseir*', 'artesanal', 'na cozinha', 'no quintal', 'na garagem', 'sem laboratorio', 'at home', 'homemade']);

/**
 * Avalia o texto da PERGUNTA do usuário. Devolve { recusar, categoria, regra }.
 *   regra: 'alvo+acao_forte' | 'alvo+acao_generica' | 'dano_a_pessoa' | 'autolesao' | 'mistura_gas' | 'droga_dose_recreativa' | 'reagente_caseiro'
 */
export function avaliarPedido(texto) {
  const p = preparar(texto);
  if (!p.v1) return { recusar: false, categoria: null, regra: null };

  if (algum(p, AUTOLESAO) && !algum(p, AJUDA_AUTOLESAO)) return { recusar: true, categoria: 'autolesao', regra: 'autolesao' };
  if ((todos(p, ...DANO_ENVENENAR) || todos(p, ...DANO_MATAR)) && !algum(p, SEM_DANO)) {
    return { recusar: true, categoria: 'dano_a_pessoa', regra: 'dano_a_pessoa' };
  }
  if (todos(p, ...MISTURA_GAS)) return { recusar: true, categoria: 'gas_toxico', regra: 'mistura_gas' };

  const forte = algum(p, ACAO_FORTE);
  const generica = algum(p, ACAO_GENERICA);
  const protecaoForte = algum(p, PROTECAO_FORTE);
  for (const cat of CATEGORIAS) {
    if (!temAlvo(p, cat)) continue;
    if (forte) return { recusar: true, categoria: cat.id, regra: 'alvo+acao_forte' };
    if (generica && !protecaoForte) return { recusar: true, categoria: cat.id, regra: 'alvo+acao_generica' };
    if (cat.id === 'droga' && todos(p, ...DROGA_RECREATIVA)) return { recusar: true, categoria: cat.id, regra: 'droga_dose_recreativa' };
  }
  // reagente perigoso feito em casa: a proteção branda (descartar, armazenar, "com segurança") vale aqui, porque o pedido é do dia a dia
  if (algum(p, REAGENTES_PERIGOSOS) && algum(p, PRODUCAO_DE_REAGENTE) && algum(p, CASEIRO) && !protecaoForte && !algum(p, PROTECAO_BRANDA)) {
    return { recusar: true, categoria: 'reagente_caseiro', regra: 'reagente_caseiro' };
  }
  return { recusar: false, categoria: null, regra: null };
}

export const pedidoPerigoso = (texto) => avaliarPedido(texto).recusar;

// ---------------------------------------------------------------- verificação do TEXTO GERADO

const FRASES_DE_RECUSA = compilar(['nao posso', 'nao vou', 'nao consigo', 'nao devo', 'nao ofereco', 'nao fornec*', 'nao ensin*', 'nao ajud*', 'nao e possivel', 'recuso']);
const VERBOS_DE_PROCEDIMENTO = compilar([
  'adicione', 'misture', 'aqueca', 'aquecer', 'dissolva', 'filtre', 'destile', 'esfrie', 'resfrie', 'goteje', 'gotejar', 'reaja', 'cristalize',
  'seque', 'despeje', 'agite', 'misturar lentamente', 'junte', 'ferva',
]);

/**
 * A RESPOSTA gerada parece ensinar a produzir/obter algo perigoso? Uma resposta que descreve perigos ou recusa o pedido passa;
 * passos de procedimento (verbos no imperativo, lista numerada) junto de um alvo, ou produção sem contexto de proteção, reprovam.
 * Devolve { viola, categoria }.
 */
export function respostaViolaSeguranca(resposta) {
  const texto = String(resposta ?? '');
  const p = preparar(texto);
  const protecao = algum(p, PROTECAO_FORTE) || algum(p, PROTECAO_BRANDA);
  const cat = CATEGORIAS.find((c) => temAlvo(p, c));
  if (!cat) {
    if ((todos(p, ...DANO_ENVENENAR) || todos(p, ...DANO_MATAR)) && !algum(p, SEM_DANO)) return { viola: true, categoria: 'dano_a_pessoa' };
    return { viola: false, categoria: null };
  }
  const recusa = algum(p, FRASES_DE_RECUSA);
  const passos = (texto.match(/^\s*(?:\d{1,2}[.)]|[-•*])\s+\S/gm) ?? []).length;
  const verbos = VERBOS_DE_PROCEDIMENTO.filter((v) => casa(p, v)).length;
  if (verbos >= 2 || (passos >= 2 && verbos >= 1)) return { viola: true, categoria: cat.id };
  if (!recusa && algum(p, ACAO_FORTE) && !protecao) return { viola: true, categoria: cat.id };
  return { viola: false, categoria: null };
}
