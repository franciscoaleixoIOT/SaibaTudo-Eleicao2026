// Segurança química: recusa por REGRAS, antes de qualquer outro processamento (NLU, dados ou modelo), de pedidos de síntese, purificação ou
// ampliação de escala de explosivos, armas químicas, drogas ilícitas e precursores, e de receitas "em casa" com reagentes perigosos.
// Perguntas legítimas (neutralizar um derramamento, EPI, primeiros socorros, por que não misturar produtos de limpeza, fórmula ou estrutura de
// uma substância) NÃO são recusadas. Espelho: Seguranca.kt (Android). Casos compartilhados: contracts/seguranca_cases.json.
//
// Estratégia: (alvo perigoso) E (ação de produzir/obter/esconder) no mesmo pedido. A mesma frase é examinada em três versões: normal (sem acentos),
// com trocas de "leet" (s1ntese, 3xplosivo, m3tanf3tamina) e "colada" (letras repetidas e separadores removidos: "explo sivo", "e x p l o s i v o").

const CATEGORIAS = {
  EXPLOSIVOS: 'explosivos',
  ARMAS_QUIMICAS: 'armas químicas',
  DROGAS: 'drogas ilícitas',
  PRECURSORES: 'precursores de drogas ou de armas',
  REAGENTES_CASEIROS: 'receitas caseiras com reagentes perigosos',
  DANO_A_PESSOAS: 'dano a pessoas',
  AUTOLESAO: 'risco à própria vida'
};

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '|': 'l', '€': 'e' };

/** Texto sem acentos, minúsculo e sem caracteres invisíveis. */
function limpar(texto) {
  return String(texto ?? '')
    .normalize('NFKD')
    .replace(/[​-‏⁠﻿­‪-‮]/g, '')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}
const espacado = (s) => s.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const leet = (s) => s.replace(/[01345789@$!|€]/g, (c) => LEET[c] ?? c);
/** Colada: só letras, sem repetições consecutivas ("exploosivo" → "explosivo"). */
const colada = (s) => s.replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');

// ------------------------------------------------------------------------------------------------ padrões (texto sem acentos)
// Ações que PRODUZEM, obtêm, ampliam ou escondem. "fazer" sozinho conta; "o que fazer se…" é removido antes (ver CONTEXTO_SEGURO / LIMPEZA).
const ACAO = new RegExp('\\b(?:' + [
  'fa(?:z|zer|zendo|zem|zia|co|ca|cam)', 'fabric(?:ar|ando|o|a|am|ac\\w+)', 'produz\\w*', 'prepar\\w*', 'sintetiz\\w*', 'sintese', 'obter', 'obtenc\\w*', 'obtem', 'conseguir', 'adquirir',
  'comprar', 'compra', 'vender', 'vend\\w+ (?:de|da|do)', 'trafic\\w*', 'contrabande\\w*', 'desvi\\w+', 'burl\\w+', 'esconder', 'escond\\w+',
  'extrair', 'extrac\\w*', 'extrai', 'cozinhar', 'cozinh\\w+', 'montar', 'monto', 'constru\\w+', 'criar', 'cria', 'gerar', 'gero', 'gera',
  'purific\\w*', 'refin\\w+', 'cristaliz\\w*', 'destil\\w*', 'escalon\\w*', 'escal(?:ar|a|ando|e)', 'larga escala', 'aument\\w+ (?:a |o |de )?(?:producao|rendimento|escala|potencia|pureza)',
  'receita', 'passo a passo', 'tutorial', 'instruc\\w+', 'ensina\\w*', 'rota de sintese', 'procedimento (?:de|para)', 'protocolo (?:de|para)', 'como (?:se )?(?:faz|fabrica|produz|prepara|sintetiza|obtem|extrai|cozinha|monta)',
  'quantidade de .{1,40} para (?:fazer|produzir|preparar)', 'quais reagentes', 'que reagentes', 'o que preciso para (?:fazer|produzir)', 'ingredientes para', 'materiais para (?:fazer|montar|produzir)',
  'make', 'making', 'synthesi[sz]\\w*', 'synthesis', 'produce', 'cook', 'recipe', 'manufactur\\w+', 'extract', 'build', 'steps to'
].join('|') + ')\\b');

// Contexto de manuseio, incidente ou descarte: "o que fazer se inalar cloro em casa" NÃO é um pedido de produção.
const CONTEXTO_SEGURO = new RegExp('\\b(?:' + [
  'descart\\w*', 'neutraliz\\w*', 'armazen\\w*', 'guard\\w*', 'manuse\\w*', 'manipul\\w*', 'primeiros? socorros?', 'epis?', 'derram\\w*', 'vazament\\w*', 'respingo\\w*',
  'inal(?:ar|ei|ou|ado|acao)', 'ingeri\\w*', 'queimadura\\w*', 'intoxicac\\w+ (?:por|com)', 'primeiro atendimento', 'equipamento de protecao', 'protecao individual', 'luvas', 'oculos de protecao', 'mascara',
  'o que fazer (?:se|quando|em caso)', 'o que (?:eu )?(?:devo|posso) fazer (?:se|quando|em caso)', 'em caso de', 'ficha de seguranca', 'fispq', 'icsc', 'reciclar', 'reciclagem'
].join('|') + ')\\b');

const TIRAR_FAZER_SEGURO = /\b(?:o que (?:eu |a gente |se )?(?:devo |posso |preciso |deve |tenho que )?fa(?:zer|co|z) (?:se|quando|em caso|apos|depois|com|ao|diante)|fa(?:zer|co|z) (?:o |a |um |uma )?(?:descarte|limpeza|neutralizacao|armazenamento|transporte|manuseio|diluicao|primeiros socorros))\b/g;

const rx = (partes, flags = '') => new RegExp('\\b(?:' + partes.join('|') + ')\\b', flags);

const ALVO_EXPLOSIVOS = rx([
  'explosiv\\w*', 'dinamite', 'tnt', 'trinitrotolueno', 'nitroglicerina', 'c ?4 explosiv\\w*', 'c-4', 'rdx', 'hmx', 'petn', 'hmtd', 'tatp', 'peroxido de acetona', 'triperoxido de triacetona',
  'azida de (?:chumbo|sodio)', 'fulminato\\w*', 'anfo', 'picrato\\w*', 'tetril', 'polvora(?: negra| sem fumaca)?', 'nitrato de amonio (?:com|e|\\+|mais) (?:diesel|oleo|combustivel|gasolina)',
  'bomba[s]? (?:caseira[s]?|artesana(?:l|is)|improvisada[s]?|quimica[s]?|incendiaria[s]?|de fumaca|de pressao|relogio|de pregos?|de tubo)', 'pipe bomb', 'coquetel[s]? molotov', 'molotov', 'napalm',
  'explosives?', 'nitroglycerin', 'gunpowder', 'granada[s]?', 'artefato[s]? explosivo[s]?', 'detonador(?:es)?', 'pavio de bomba', 'fogos? de artificio(?: caseiro[s]?)?', 'termit[ae]', 'thermite', 'material incendiario', 'bomba atomica', 'bomba suja'
], 'u');
// "fazer uma bomba" sem qualificativo inofensivo (bomba d'água, de calor, calorimétrica, de insulina, de vácuo...)
const FAZER_BOMBA = /\b(?:fa(?:z|zer|zendo)|fabric\w*|montar|constru\w+|criar|produzir|preparar|make|build)\s+(?:uma?\s+|an?\s+|as\s+|a\s+)?(?:bomba|bomb)\b(?!\s+(?:de\s+)?(?:agua|calor|vacuo|insulina|combustivel|ar|infusao|hidraulica|calorimetrica|centrifuga|submersa|peristaltica|de))/;

const ALVO_ARMAS = rx([
  'sarin', 'soman', 'tabun', 'vx', 'nerve agents?', 'chemical weapons?', 'mustard gas', 'novichok', 'agentes? (?:nervos\\w*|neurotoxic\\w*|vesican\\w*|quimic\\w*(?: de guerra)?)', 'armas? quimic\\w*', 'armas? bacteriologic\\w*', 'arma de destruicao em massa',
  'gas(?:es)? (?:mostarda|sarin|nervos\\w*|lacrimogeneo\\w*|toxic\\w*|venenos\\w*|letal|letais|asfixiante\\w*|de guerra|cloro|fosgenio)', 'mostarda (?:sulfurada|nitrogenada)', 'fosgenio', 'cloropicrina', 'lewisita',
  'ricina', 'cianeto(?: de hidrogenio| de potassio| de sodio)?', 'acido cianidrico', 'cloraminas?', 'arsina', 'fosfina', 'toxina botulinica', 'antraz', 'cloro gasoso', 'cloro em gas', 'acido sulfidrico', 'gas sulfidrico',
  'monoxido de carbono (?:para|pra) (?:matar|ferir|envenenar)'
], 'u');

const ALVO_DROGAS = rx([
  'metanfetamina[s]?', 'methamphetamine', 'cocaine', 'heroin', 'meth', 'cristal (?:de )?meth', 'cocaina', 'crack', 'pasta base', 'merla', 'heroina', 'lsd', 'acido lisergico', 'mdma', 'ecstasy', 'extase', 'molly', 'fentanil\\w*', 'fentanyl',
  'pcp', 'fenciclidina', 'ketamina', 'cetamina', 'dmt', 'dimetiltriptamina', 'mescalina', 'psilocibina', 'cogumelos? magicos?', 'anfetamina[s]?', 'ghb', 'gbh', 'oxicodona', 'opio', 'maconha', 'cannabis',
  'haxixe', 'thc', 'canabinoides? sinteticos?', 'spice', 'bath salts', 'catinonas? sinteticas?', 'drogas? sinteticas?', 'droga[s]? ilicitas?', 'entorpecentes?', 'lanca[- ]perfume', 'cheirinho da loló', 'lolo', 'skank',
  'laboratorio clandestino', 'narcolaboratorio'
], 'u');

const PRECURSORES_NOMES = rx([
  'efedrina', 'pseudoefedrina', 'norefedrina', 'safrol', 'isosafrol', 'piperonal', 'fenilacetona', 'p2p', 'fenil-?2-?propanona', 'acido fenilacetico', 'anidrido acetico', 'ergotamina', 'ergometrina',
  'acido antranilico', 'n-?acetilantranilico', 'acido lisergico', 'precursores? (?:de|da|do|para|quimicos?|controlados?)', 'precursores? controlados?', 'iodo vermelho', 'fosforo vermelho'
], 'u');

const ALVO_DANO = rx([
  'envenen\\w+ (?:alguem|uma pessoa|o|a|meu|minha|um|uma|alguns?|animal|animais|cachorro|gato|crianca[s]?|vizinh\\w+|colega|professor\\w*|chefe|marido|esposa|mulher|namorad\\w+|ex)',
  'matar (?:alguem|uma pessoa|meu|minha|o|a|um|uma)', 'assassinar', 'intoxicar (?:alguem|uma pessoa|propositalmente)', 'veneno[s]? (?:indetectave\\w+|que nao (?:deixa|deixam) rastro\\w*|sem rastro\\w*|letal|letais|mortal|mortais|caseiro[s]?)',
  'dose letal para matar', 'ferir (?:alguem|uma pessoa)', 'queimar (?:alguem|uma pessoa) com (?:acido|quimico)', 'jogar acido em', 'atacar (?:alguem|uma pessoa) com'
], 'u');

const ALVO_AUTOLESAO = rx([
  'me matar', 'me suicidar', 'suicidio', 'suicidar', 'tirar (?:a )?minha vida', 'acabar com (?:a )?minha vida', 'me envenenar', 'quero morrer', 'morrer sem dor', 'morrer sem sofrer', 'overdose para morrer',
  'me machucar', 'me ferir', 'me cortar', 'me intoxicar de proposito'
], 'u');

const PERIGOSOS_CASEIROS = rx([
  'acido (?:sulfurico|nitrico|cloridrico|muriatico|fluoridrico|perclorico|picrico|cianidrico)', 'agua regia', 'cloro(?: gasoso| em gas)?', 'gas cloro', 'cianeto\\w*', 'arsenio', 'arsina', 'fosfina', 'fosgenio',
  'mercurio', 'fosforo (?:branco|vermelho)', 'sodio metalico', 'potassio metalico', 'amonia anidra', 'clorato\\w*', 'perclorato\\w*', 'peroxido de (?:acetona|metil\\w*|benzoila)',
  'agua oxigenada (?:concentrada|de? \\d+ ?volumes?)', 'nitrato de (?:amonio|potassio) (?:concentrado)?', 'permanganato de potassio', 'acido sulfidrico', 'sulfeto de hidrogenio', 'monoxido de carbono',
  'gas(?:es)? (?:toxic\\w*|venenos\\w*|inflamave\\w*|asfixiante\\w*)', 'fluoreto\\w*', 'acido fluoridrico', 'veneno[s]?', 'toxina[s]?', 'napalm', 'termit[ae]', 'thermite', 'nitrocelulose', 'nitroglicerina', 'tolueno nitrado',
  'acetona e agua oxigenada', 'agua sanitaria e (?:amonia|acido|vinagre)', 'cloro e amonia', 'soda e aluminio'
], 'u');

const CASA = rx([
  'em casa', 'caseir[oa]s?', 'artesana(?:l|is)', 'improvisad[oa]s?', 'na cozinha', 'no quintal', 'na garagem', 'no banheiro', 'no apartamento', 'com produtos? (?:de casa|domesticos?|de limpeza|de supermercado|de farmacia)',
  'sem laboratorio', 'faca voce mesmo', 'diy', 'com materiais? (?:facil|faceis|de casa|domesticos?)', 'usando (?:so |apenas )?produtos? (?:de casa|domesticos?|de limpeza)'
], 'u');

// Palavras-chave "coladas" (sem espaços nem repetições): pegam "explo sivo", "e x p l o s i v o", "m e t a n f e t a m i n a".
const colar = (...l) => l.map(colada);
const COLADA_ALVOS = {
  EXPLOSIVOS: colar('explosivo', 'nitroglicerina', 'dinamite', 'trinitrotolueno', 'peroxidodeacetona', 'molotov', 'napalm', 'bombacaseira', 'bombaartesanal', 'polvora', 'detonador', 'fulminato', 'tatp', 'hmtd'),
  ARMAS_QUIMICAS: colar('sarin', 'novichok', 'gasmostarda', 'agentenervoso', 'armaquimica', 'fosgenio', 'ricina', 'gastoxico', 'gasvenenoso', 'cianeto', 'cloraminas', 'gascloro'),
  DROGAS: colar('metanfetamina', 'cocaina', 'heroina', 'fentanil', 'ecstasy', 'mdma', 'anfetamina', 'drogassinteticas', 'pastabase', 'crack', 'lsd', 'ketamina', 'cetamina'),
  PRECURSORES: colar('pseudoefedrina', 'efedrina', 'safrol', 'fenilacetona', 'anidridoacetico', 'precursores')
};
const COLADA_ACOES = colar('sintese', 'sintetizar', 'fazer', 'fabricar', 'produzir', 'preparar', 'purificar', 'refinar', 'cozinhar', 'extrair', 'comofaz', 'receita', 'passoapasso', 'montar', 'construir', 'obter', 'comprar', 'escalonar');

const MENSAGENS = {
  padrao: 'Não posso ajudar com isso. O SaibaTudo Química não fornece instruções de síntese, purificação, ampliação de escala nem receitas caseiras de explosivos, armas químicas, drogas ilícitas, seus precursores ou outros reagentes perigosos, porque podem causar mortes e ferimentos graves.',
  alternativas: 'Posso ajudar com segurança e conhecimento: perigos, equipamentos de proteção (EPI), armazenamento, descarte e primeiros socorros de uma substância; propriedades, fórmula, massa molar e estrutura; cálculos e conceitos de Química.',
  [`${'DANO_A_PESSOAS'}`]: 'Não posso ajudar com isso. Não oriento sobre como ferir, envenenar ou intoxicar pessoas ou animais. Se alguém corre perigo ou foi exposto a uma substância, procure imediatamente um serviço de emergência ou um centro de informação toxicológica da sua região.',
  [`${'AUTOLESAO'}`]: 'Sinto muito que você esteja passando por isso. Não posso orientar sobre esse assunto, mas você não está sozinho(a): procure agora alguém de confiança e um serviço de emergência da sua região. O Centro de Valorização da Vida (CVV) conversa com qualquer pessoa, de forma gratuita e sigilosa, em https://cvv.org.br.'
};

export const SUGESTOES_SEGURAS = [
  'Quais EPIs usar com ácido sulfúrico?',
  'Primeiros socorros para respingo de soda cáustica no olho',
  'Por que não misturar água sanitária com amoníaco?'
];

/**
 * @param {string} texto
 * @returns {{recusar: boolean, categoria: string|null, rotulo: string|null, motivo: string|null}}
 */
export function avaliarSeguranca(texto) {
  const base = limpar(texto);
  if (!base.trim()) return { recusar: false, categoria: null, rotulo: null, motivo: null };
  const v1 = espacado(base);
  const v2 = espacado(leet(base));
  const visoes = v1 === v2 ? [v1] : [v1, v2];

  // autolesão primeiro: resposta de acolhimento, mesmo sem "ação"
  for (const v of visoes) if (ALVO_AUTOLESAO.test(v)) return recusa('AUTOLESAO', 'pedido ligado a autolesão');

  for (const v of visoes) {
    const incidente = CONTEXTO_SEGURO.test(v);
    // "o que fazer se…", "fazer o descarte…" não são pedidos de produção
    const vc = v.replace(TIRAR_FAZER_SEGURO, ' ');
    const acao = ACAO.test(vc);
    const casa = CASA.test(v);
    // dano a pessoas: o alvo já contém a ação
    if (ALVO_DANO.test(v)) return recusa('DANO_A_PESSOAS', 'pedido para ferir ou envenenar');
    if (FAZER_BOMBA.test(vc)) return recusa('EXPLOSIVOS', 'construção de artefato explosivo');
    // alvos graves: a recusa vale mesmo com palavras de "segurança" na frase (não há como produzir "com segurança")
    if (acao && ALVO_EXPLOSIVOS.test(vc)) return recusa('EXPLOSIVOS', 'produção de explosivos');
    if (acao && ALVO_ARMAS.test(vc)) return recusa('ARMAS_QUIMICAS', 'produção de agentes tóxicos ou armas químicas');
    if (acao && ALVO_DROGAS.test(vc)) return recusa('DROGAS', 'produção ou obtenção de drogas ilícitas');
    if (acao && PRECURSORES_NOMES.test(vc) && (ALVO_DROGAS.test(vc) || /\b(?:extrair|extrac\w*|obter|comprar|conseguir|desvi\w+|sem (?:receita|licenca|autorizacao)|burl\w+|vender|trafic\w*|esconder|escond\w+|sintese|sintetiz\w*)\b/.test(vc))) {
      return recusa('PRECURSORES', 'obtenção ou uso de precursores controlados');
    }
    // receitas caseiras com reagentes perigosos: "em casa" + produzir; fica de fora quem trata de descarte, EPI, incidente etc.
    if (!incidente && acao && casa && PERIGOSOS_CASEIROS.test(vc)) return recusa('REAGENTES_CASEIROS', 'receita caseira com reagente perigoso');
  }

  // versão colada: tolera "explo sivo", "e x p l o s i v o", "exploosivo"
  const c = colada(leet(base).replace(/[^a-z0-9]+/g, " ").replace(TIRAR_FAZER_SEGURO, " "));
  if (c.length >= 8 && !CONTEXTO_SEGURO.test(v1)) {
    const acao = COLADA_ACOES.some((a) => c.includes(a));
    if (acao) {
      for (const [cat, alvos] of Object.entries(COLADA_ALVOS)) {
        if (alvos.some((a) => c.includes(a))) return recusa(cat, 'pedido de produção (grafia disfarçada)');
      }
    }
  }
  return { recusar: false, categoria: null, rotulo: null, motivo: null };
}

function recusa(categoria, motivo) {
  return { recusar: true, categoria, rotulo: CATEGORIAS[categoria], motivo };
}

/** Resposta padrão de recusa (sem dados, sem números). */
export function respostaRecusa(avaliacao) {
  const cat = avaliacao?.categoria ?? 'padrao';
  const principal = MENSAGENS[cat] ?? MENSAGENS.padrao;
  const linhas = [principal];
  if (cat !== 'AUTOLESAO') linhas.push(MENSAGENS.alternativas);
  return { principal, linhas, categoria: avaliacao?.categoria ?? null };
}
