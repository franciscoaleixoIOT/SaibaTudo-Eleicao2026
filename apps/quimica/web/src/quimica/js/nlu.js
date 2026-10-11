// NLU LOCAL determinístico (regras): converte uma pergunta em ParsedQuery (intenção + entidades). Não consulta nem produz fatos.
// Mesma ordem de regras do Android (LocalNlu.kt); os casos de referência estão em contracts/nlu_golden_cases.json.
// Intenções (docs/DATA_CONTRACT.md §8): ELEMENTO, COMPOSTO, PROPRIEDADE, MASSA_MOLAR, BALANCEAR, ESTEQUIOMETRIA, CONCENTRACAO, PH, GAS_IDEAL,
// CONVERSAO_UNIDADE, NOMENCLATURA, DESENHAR, COMPARAR, TABELA_PERIODICA, SEGURANCA, CONCEITO, RECUSA_PERIGO, SOBRE_DADOS, FONTES, AJUDA, DESCONHECIDA.
import { dividirEspecies } from './calc/balancear.js';
import { acharUnidade } from './calc/unidades.js';
import { tentarFormula } from './calc/formula.js';
import { lerNumero } from './formato.js';
import { avaliarSeguranca } from './seguranca.js';
import { normalizar } from './texto.js';
import { tokensOriginais } from './dicionario.js';

export const INTENTS = [
  'ELEMENTO', 'COMPOSTO', 'PROPRIEDADE', 'MASSA_MOLAR', 'BALANCEAR', 'ESTEQUIOMETRIA', 'CONCENTRACAO', 'PH', 'GAS_IDEAL', 'CONVERSAO_UNIDADE',
  'NOMENCLATURA', 'DESENHAR', 'COMPARAR', 'TABELA_PERIODICA', 'SEGURANCA', 'CONCEITO', 'RECUSA_PERIGO', 'SOBRE_DADOS', 'FONTES', 'AJUDA', 'DESCONHECIDA'
];

export const TAMANHO_MAXIMO = 300;

// ---------------------------------------------------------------------------------------------------- vocabulário de unidades (nomes em português)
const UNIDADE_PALAVRAS = [
  [/^graus? (?:celsius|centigrados?)$|^celsius$/, '°C'], [/^graus? fahrenheit$|^fahrenheit$/, '°F'], [/^kelvins?$/, 'K'],
  [/^atmosferas?$/, 'atm'], [/^pascais$|^pascal$/, 'Pa'], [/^quilopascais$|^quilopascal$/, 'kPa'], [/^milimetros? de mercurio$/, 'mmHg'],
  [/^litros?$/, 'L'], [/^mililitros?$/, 'mL'], [/^microlitros?$/, 'µL'], [/^gramas?$/, 'g'], [/^miligramas?$/, 'mg'], [/^quilogramas?$|^quilos?$/, 'kg'],
  [/^toneladas?$/, 't'], [/^mols?$/, 'mol'], [/^milimols?$/, 'mmol'], [/^kilomols?$|^quilomols?$/, 'kmol'], [/^joules?$/, 'J'], [/^calorias?$/, 'cal'],
  [/^quilocalorias?$/, 'kcal'], [/^quilojoules?$/, 'kJ'], [/^molar(?:es)?$/, 'mol/L'], [/^mol por litro$|^mols por litro$/, 'mol/L'], [/^gramas? por litro$/, 'g/L'],
  [/^(?:moleculas?|atomos?|particulas?|ions?|unidades|entidades)$/, 'particulas'], [/^metros?$/, 'm'], [/^centimetros?$/, 'cm'], [/^milimetros?$/, 'mm'],
  [/^nanometros?$/, 'nm'], [/^quilometros?$/, 'km'], [/^por ?cento$/, '%'], [/^bars?$/, 'bar'], [/^torr$/, 'mmHg'], [/^horas?$/, 'h'], [/^minutos?$/, 'min'], [/^segundos?$/, 's']
];

/** Interpreta uma unidade escrita (símbolo ou nome em português): devolve o símbolo ou null. */
export function lerUnidade(texto, unidades) {
  const bruto = String(texto ?? '').trim().replace(/[.,;:!?]+$/, '');
  if (!bruto) return null;
  if (bruto === '%') return '%';
  const n = normalizar(bruto);
  for (const [rx, sim] of UNIDADE_PALAVRAS) if (rx.test(n)) return sim;
  if (/^[A-Za-zµμ°º/³²⁻¹·.-]+$/.test(bruto) && unidades && acharUnidade(unidades, bruto.replace(/·/g, '/').replace(/\/+/g, '/')).length) return bruto;
  return null;
}

const NUM = String.raw`(\d+(?:[.,]\d+)?(?:\s*(?:[x×*]\s*10\s*\^?\s*\{?-?\d+\}?|e[+-]?\d+))?)`;
const RX_QUANT = new RegExp(String.raw`(?<![A-Za-z(\[)\]^_\-.,\d])${NUM}\s*(°\s*[CF]|º\s*[CF]|%|[A-Za-zµμ°º][A-Za-zµμ°º/³²⁻¹·.-]*(?:\s+(?:de|por)\s+[A-Za-zçãéêíóú]+)?(?:\s+[A-Za-zçãéêíóú]+)?)?`, 'gu');

/** Quantidades com unidade encontradas no texto: [{valor, unidade, texto}] (unidade null quando não reconhecida). */
export function lerQuantidades(texto, unidades) {
  const out = [];
  for (const m of String(texto).matchAll(RX_QUANT)) {
    const valor = lerNumero(m[1]);
    if (!Number.isFinite(valor)) continue;
    let unidade = null;
    let usado = '';
    const cand = (m[2] ?? '').trim().replace(/\s+/g, ' ');
    if (cand) {
      const palavras = cand.split(' ');
      for (let k = Math.min(palavras.length, 3); k >= 1 && !unidade; k--) {
        const frase = palavras.slice(0, k).join(' ');
        unidade = lerUnidade(frase.replace(/^°\s*/, '°'), unidades);
        if (unidade) usado = frase;
      }
    }
    out.push({ valor, unidade, texto: `${m[1]}${usado ? ' ' + usado : ''}`.trim() });
  }
  return out;
}

/**
 * Liga cada "número unidade de X" à substância X: [{valor, unidade, especie (fórmula ou símbolo), cid|null}].
 * Ex.: "4 g de H2 e 16 g de O2" → [{4, g, H2}, {16, g, O2}].
 */
export function ligarQuantidades(texto, dic) {
  const rx = new RegExp(String.raw`(?<![A-Za-z(\[)\]^_\-.,\d])(\d+(?:[.,]\d+)?(?:\s*(?:[x×*]\s*10\s*\^?\s*\{?-?\d+\}?|e[+-]?\d+))?)\s*([A-Za-zµμ°º]+(?:/[A-Za-z]+)?)\s+(?:de|do|da|dos|das)\s+(?=(\S+(?:\s+\S+){0,2}))`, 'gu');
  const out = [];
  for (const m of String(texto).matchAll(rx)) {
    const valor = lerNumero(m[1]);
    const unidade = lerUnidade(m[2], dic.unidades);
    if (!Number.isFinite(valor) || !unidade) continue;
    const toks = m[3].split(/\s+/);
    for (let k = Math.min(toks.length, 3); k >= 1; k--) {
      const ent = dic.entidades(toks.slice(0, k).join(' ').replace(/[?!.,;]+$/, ''));
      const c = ent.compostos[0];
      const f = ent.formulas[0];
      const e = ent.elementos[0];
      const especie = c ? dic.entrada(c.cid)?.formula ?? null : f?.texto ?? e?.simbolo;
      if (c || especie) { out.push({ valor, unidade, especie, cid: c ? c.cid : null }); break; } // com o índice do pipeline a fórmula vem do registro do composto
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- equação
const RX_SETA = /\s*(?:<=>|<->|⇌|⇄|-->|->|→|⟶|⇒|=>|==|=)\s*/;

function ehEspecie(tok) {
  const t = tok.replace(/[.,;:!?]+$/, '');
  if (!t) return false;
  if (t === '+' || /^\d+$/.test(t)) return true;
  const partes = dividirEspecies(t);
  if (partes.length === 0) return false;
  return partes.every((p) => {
    const corpo = p.replace(/^\d+\s*/, '');
    return /^e(?:\^?[-−]|⁻)$/.test(corpo) || (!!corpo && /^[A-Z(\[]/.test(corpo) && tentarFormula(corpo) != null);
  });
}

/** Extrai "Fe + O2 -> Fe2O3" de uma frase ("balanceie a equação Fe + O2 -> Fe2O3 por favor"). null se não houver. */
export function extrairEquacao(texto) {
  const original = String(texto ?? '');
  const m = RX_SETA.exec(original);
  if (!m) return null;
  const esq = original.slice(0, m.index).trim().split(/\s+/).filter(Boolean);
  const dir = original.slice(m.index + m[0].length).trim().split(/\s+/).filter(Boolean);
  const L = [];
  for (let i = esq.length - 1; i >= 0; i--) { if (ehEspecie(esq[i])) L.unshift(esq[i]); else break; }
  const R = [];
  for (let i = 0; i < dir.length; i++) { if (ehEspecie(dir[i])) R.push(dir[i].replace(/[.,;:!?]+$/, '')); else break; }
  // não termina em "+" solto
  while (L.length && L[L.length - 1] === '+') L.pop();
  while (R.length && R[R.length - 1] === '+') R.pop();
  if (!L.length || !R.length || L.every((t) => /^\d+$|^\+$/.test(t)) || R.every((t) => /^\d+$|^\+$/.test(t))) return null;
  return `${L.join(' ')} -> ${R.join(' ')}`;
}

// ---------------------------------------------------------------------------------------------------- expressões
const RX_SAUDACAO = /^(oi+|ola|opa|bom dia|boa tarde|boa noite|e ai|eai|hey|hello|hi|obrigad[oa]|muito obrigad[oa]|valeu|vlw|brigad[oa]|ajuda|help|socorro|menu|inicio|comecar|teste|testando)( tudo bem| td bem| tudo bom| como vai| assistente| ia| amigo| pessoal)*$/;
const RX_AJUDA = /\b(?:o que (?:voce|vc|o app|o aplicativo|esse app|este app|a ia) (?:faz|sabe|responde|pode)|como (?:usar|uso|funciona) (?:o |este |esse )?(?:app|aplicativo|assistente)|o que (?:posso|eu posso|da para|da pra) perguntar|preciso de ajuda|quem (?:fez|criou|desenvolveu) (?:o |este |esse )?(?:app|aplicativo))\b/;
const RX_SOBRE_DADOS = /\b(?:sobre os dados|de onde (?:vem|vêm|veem) os dados|origem dos dados|fonte dos dados|atualizacao dos dados|dados (?:sao )?atualizados|versao dos dados|quando foi atualizado|assinatura dos dados)\b/;
const RX_FONTES = /\b(?:quais (?:sao )?as (?:fontes|licencas)|licencas? dos dados|qual (?:e )?a fonte|fontes? (?:das? )?(?:informac\w+|respostas?)|de onde (?:tirou|vem) (?:essa|esta|a) (?:informacao|resposta)|referencias?)\b/;
const RX_BALANCEAR = /\bbalanc\w*|\bequilibr\w+ (?:a |uma )?equacao\b|\bacert\w+ (?:os )?coeficientes\b/;
const RX_CONVERSAO = /\b(?:convert\w+|converta|transform\w+|passar|passe|equivale\w*|quantos? \S+(?: \S+)? (?:tem|ha|sao|equivalem|existem|correspondem)|quantas? \S+(?: \S+)? (?:tem|ha|sao|equivalem|existem|correspondem)|em quantos?)\b/;
const RX_PH = /\b(?:ph|poh)\b|\bacidez de\b|\bbasicidade\b/;
const RX_GAS = /\b(?:gas(?:es)? ideais?|gas ideal|pv ?= ?nrt|pvnrt|lei dos gases|equacao (?:de clapeyron|dos gases|geral dos gases)|clapeyron|volume (?:molar|de um gas|de gas)|pressao (?:de um gas|do gas)|lei de boyle|lei de charles|gay lussac)\b/;
const RX_GAS_VAR = /\bgas(?:es)?\b/;
const RX_CONCENTRACAO = /\b(?:molaridade|concentracao|concentrad[ao]|diluic\w*|diluir|dilua|diluido|c1 ?v1|c1v1|titulo (?:em massa|da solucao)|percentual (?:em )?massa|porcentagem em massa|partes por milhao|ppm|normalidade|molalidade|solucao de|gramas por litro|mol l|mol por litro|g l)\b/;
const RX_ESTEQ = /\b(?:estequiometri\w*|reagente (?:limitante|em excesso)|limitante|excesso de reagente|rendimento|quantos? (?:mols?|gramas?|moleculas?|atomos?|litros?|ions?|particulas?|quilos?|mg|miligramas?)\b|quantas? (?:moleculas|particulas|atomos|gramas|mols|litros)|numero de (?:mols?|moleculas|atomos|particulas|ions)|cntp|condicoes normais|volume ocupado|constante de avogadro|numero de avogadro)\b/;
const RX_MASSA_MOLAR = /\b(?:massa molar|massa molecular|massa formula|peso molecular|peso molar|quanto pesa (?:um )?mol|quanto vale (?:a )?massa molar)\b|\bg mol\b/;
const RX_DESENHAR = /\b(?:desenh\w+|estrutura (?:2d|molecular|quimica|plana|de lewis|do|da|de)|estrutura|mostr\w+ (?:a )?(?:estrutura|molecula)|molecula (?:do|da|de)|como (?:e|eh) (?:a )?(?:molecula|estrutura)|formula estrutural|geometria molecular|visualizar|esqueleto)\b/;
const RX_COMPARAR = /\b(?:compar\w+|diferenca (?:s )?entre|diferencas? entre|\bversus\b|\bvs\b|qual (?:a )?diferenca|semelhanca\w*|igual a|parecid\w+)\b/;
const RX_SEGURANCA = /\b(?:perig\w+|toxic\w+|segur\w+|epis?\b|equipamentos? de protecao|primeiros? socorros|derram\w+|vazament\w+|armazen\w+|incendi\w+|inflamav\w+|corrosiv\w+|irritant\w+|irrita\w*|ghs|pictogramas?|frases? h\b|ficha de seguranca|icsc|fispq|mistur\w+|incompativ\w+|descart\w+|manusear|manuseio|inala\w+|ingest\w+|queimadur\w+|venenos\w+|veneno|faz mal|fazem mal|neutraliz\w+|luvas|oculos de protecao|palavra de sinal|classificacao de perigo|e seguro|e perigoso|cancerigen\w+|explosiv\w+|reage com agua|reativ\w+ com)\b/;
const RX_NOMENCLATURA = /\b(?:qual (?:e )?(?:o )?nome|como (?:se )?chama|nome (?:quimico|iupac|sistematico|cientifico|oficial)|nomenclatura|como (?:se )?escreve|qual (?:e )?a? ?formula(?: quimica| molecular)?|formula (?:do|da|de|quimica do|quimica da|molecular do|molecular da)|nome do composto)\b/;
const RX_TABELA = /\b(?:tabela periodica|periodicidade|tendencia\w*|grupo \d{1,2}|familia \d{1,2}|periodo \d|bloco [spdf]|elementos? (?:do|da|dos|das) (?:grupo|periodo|bloco|familia)|quais (?:sao )?(?:os )?elementos|quantos elementos|elementos (?:gasosos|liquidos|solidos)|metais|nao metais|ametais|semimetais|metaloides|halogenios?|gases? nobres?|alcalino terrosos?|alcalinos?|lantanideos?|lantanidios?|actinideos?|actinidios?|elemento mais|elementos mais|ordem crescente|ordem decrescente|maior (?:raio|eletronegatividade|energia|ponto|massa|densidade)|menor (?:raio|eletronegatividade|energia|ponto|massa|densidade))\b/;
const RX_CONCEITO_CUE = /^(?:o que (?:e|eh|sao|significa|quer dizer|seria)|oque e|expli(?:c|qu)\w*|defin\w+|conceito de|definicao de|me explica\w*|como funciona\w*|por que|por qu[eê]|porque|para que serve|qual (?:e )?a? ?(?:definicao|diferenca|importancia|funcao)|diferenca entre|ensin\w+|resum\w+)\b/;

const CATEGORIAS = [
  [/\balcalino terros\w*|\balcalinos terros\w*/, 'metal_alcalino_terroso'], [/\bmetais? alcalinos?|\balcalinos\b/, 'metal_alcalino'],
  [/\bmetais? de transicao|\bmetal de transicao|\belementos? de transicao/, 'metal_transicao'], [/\bpos transicao|\bmetais? representativos?/, 'metal_pos_transicao'],
  [/\bsemimetais?|\bmetaloides?/, 'semimetal'], [/\bnao metais?|\bametais?/, 'nao_metal'], [/\bhalogenios?/, 'halogenio'], [/\bgas(?:es)? nobres?|\bnobres\b/, 'gas_nobre'],
  [/\blantanideos?|\blantanidios?|\bterras raras/, 'lantanideo'], [/\bactinideos?|\bactinidios?|\bactinoides?|\bactinios\b/, 'actinideo'], [/\bmetais\b|\bmetal\b/, 'metal']
];
const ESTADOS = [[/\b(?:gasosos?|gases|no estado gasoso)\b/, 'gas'], [/\bliquidos?\b/, 'liquido'], [/\bsolidos?\b/, 'solido']];
const EXTREMOS = [
  [/\bmais eletronegativ\w+|\bmaior eletronegatividade/, ['eletronegatividade', 'max']], [/\bmenos eletronegativ\w+|\bmenor eletronegatividade/, ['eletronegatividade', 'min']],
  [/\bmais densos?\b|\bmaior densidade/, ['densidadeKgm3', 'max']], [/\bmenos densos?\b|\bmenor densidade|\bmais leves?\b/, ['densidadeKgm3', 'min']],
  [/\bmaior raio|\bmais volumos\w+/, ['raioAtomicoPm', 'max']], [/\bmenor raio/, ['raioAtomicoPm', 'min']],
  [/\bmaior ponto de fusao/, ['pontoFusaoK', 'max']], [/\bmenor ponto de fusao/, ['pontoFusaoK', 'min']],
  [/\bmaior ponto de ebulicao/, ['pontoEbulicaoK', 'max']], [/\bmenor ponto de ebulicao/, ['pontoEbulicaoK', 'min']],
  [/\bmaior energia de ionizacao/, ['energiaIonizacaoKJmol', 'max']], [/\bmenor energia de ionizacao/, ['energiaIonizacaoKJmol', 'min']],
  [/\bmais pesad\w+|\bmaior massa atomica/, ['massaAtomica', 'max']], [/\bmenor massa atomica/, ['massaAtomica', 'min']]
];

function parseVazio(original) {
  return {
    intent: 'DESCONHECIDA', textoOriginal: original, elemento: null, elementos: [], composto: null, compostoNome: null, compostos: [], formulas: [], formula: null,
    propriedade: null, propriedades: [], quantidades: [], equacao: null, nivel: null, unidadeDestino: null, conceito: null,
    grupo: null, periodo: null, bloco: null, categoria: null, estado: null, extremo: null, tendencia: false, mistura: false, constantes: {}, seguranca: null
  };
}

function nivelDe(n) {
  if (/\b(?:ensino fundamental|fundamental|crianca|simples|bem simples|facil de entender|para leigos)\b/.test(n)) return 'fundamental';
  if (/\b(?:ensino medio|medio|enem|vestibular)\b/.test(n)) return 'medio';
  if (/\b(?:faculdade|universidade|superior|avancado|graduacao|aprofundad\w+|detalhad\w+)\b/.test(n)) return 'superior';
  return null;
}

function lerConstantes(original) {
  const out = {};
  for (const m of original.matchAll(/\b(pka|pkb|ka|kb)\s*(?:=|:|de|igual a|vale)?\s*([0-9][0-9.,]*(?:\s*(?:[x×*]\s*10\s*\^?\s*\{?-?\d+\}?|e-?\d+))?)/gi)) {
    const v = lerNumero(m[2]);
    if (Number.isFinite(v)) out[m[1].toLowerCase() === 'pka' ? 'pKa' : m[1].toLowerCase() === 'pkb' ? 'pKb' : m[1].toLowerCase() === 'ka' ? 'Ka' : 'Kb'] = v;
  }
  return out;
}

/**
 * @param {string} pergunta
 * @param {import('./dicionario.js').Dicionario} dic
 * @param {object|null} [contexto] ParsedQuery da última pergunta resolvida (para "e o ponto de ebulição?")
 */
export function parse(pergunta, dic, contexto = null) {
  const original = String(pergunta ?? '').replace(/\s+/g, ' ').trim().slice(0, TAMANHO_MAXIMO);
  const p = parseVazio(original);
  const n = normalizar(original);
  if (!n && !RX_SETA.test(original)) return p;

  // 1) segurança: antes de tudo
  const seg = avaliarSeguranca(original);
  if (seg.recusar) { p.intent = 'RECUSA_PERIGO'; p.seguranca = seg; return p; }

  const unidades = dic.unidades ?? null;
  const ents = dic.entidades(original);
  const props = dic.propriedadesEm(n);
  const quant = lerQuantidades(original, unidades);
  const temQuant = quant.some((q) => q.unidade && q.unidade !== '%') ;
  const equacao = extrairEquacao(original);
  const nivel = nivelDe(n);
  Object.assign(p, { nivel, quantidades: quant, constantes: lerConstantes(original) });

  // entidades
  const comps = ents.compostos;
  const els = ents.elementos;
  // um nome que é de elemento e de composto ao mesmo tempo (ex.: "oxigênio") prefere o elemento, salvo "gás"/fórmula molecular digitada
  let compostos = comps;
  if (els.length && comps.length) {
    const nomesEl = new Set(els.map((e) => normalizar(e.nome)));
    compostos = comps.filter((c) => c.via !== 'nome' || !nomesEl.has(normalizar(c.nome)) || /\bgas\b/.test(n));
  }
  // com vários compostos, o primeiro é o da quantidade ("16 g de metano" em "quantos gramas de CO2 se formam na queima de 16 g de metano?")
  if (compostos.length > 1 && quant.length) {
    const ligado = ligarQuantidades(original, dic).find((x) => x.cid != null && compostos.some((c) => c.cid === x.cid));
    if (ligado) compostos = [compostos.find((c) => c.cid === ligado.cid), ...compostos.filter((c) => c.cid !== ligado.cid)];
  }
  const elementos = els.filter((e) => !(compostos.length && compostos.some((c) => c.via === 'formula' && c.texto === e.simbolo)));
  p.elementos = elementos.map((e) => e.simbolo);
  p.elemento = p.elementos[0] ?? null;
  p.compostos = compostos.map((c) => c.cid);
  p.composto = p.compostos[0] ?? null;
  p.compostoNome = compostos[0]?.nome ?? null;
  p.formulas = ents.formulas.map((f) => f.texto);
  p.formula = p.formulas[0] ?? compostos.find((c) => c.via === 'formula')?.texto ?? null;
  p.propriedades = props.map((x) => x.id);
  p.propriedade = p.propriedades[0] ?? null;
  const nEnt = p.elementos.length + p.compostos.length + p.formulas.length;
  const tem = nEnt > 0;

  const fim = (intent, extra = {}) => { p.intent = intent; Object.assign(p, extra); return p; };

  // 2) conversa e meta
  if (RX_SAUDACAO.test(n) && !tem) return fim('AJUDA');
  if (RX_SOBRE_DADOS.test(n)) return fim('SOBRE_DADOS');
  if (RX_FONTES.test(n) && !tem) return fim('FONTES');
  if (RX_AJUDA.test(n)) return fim('AJUDA');

  // 3) equação química
  if (equacao || RX_BALANCEAR.test(n)) {
    const eq = equacao ?? null;
    const querCalcular = temQuant && /\b(?:limitante|rendimento|quantos?|quantas?|massa de|gramas?|mols?|produz\w*|forma\w*|obt\w+|reage\w*|consum\w+|sobra\w*|excesso|volume|litros?)\b/.test(n);
    if (eq && querCalcular) return fim('ESTEQUIOMETRIA', { equacao: eq });
    if (eq || RX_BALANCEAR.test(n)) return fim('BALANCEAR', { equacao: eq });
  }

  // 4) conversão de unidades (duas unidades de uma mesma grandeza, ou "converter X para Y")
  const unidadesLidas = quant.filter((q) => q.unidade);
  const paraUnidade = (() => {
    const m = /\b(?:para|em|a|pra|ate)\s+(?:o |a |os |as )?([A-Za-zµμ°º/³²·.]+(?: celsius| fahrenheit| por litro| de mercurio)?)\s*[?!.]*$/i.exec(original.replace(/^(.*\d)\s+/, '$1 ').trim());
    return m ? lerUnidade(m[1], unidades) : null;
  })();
  const quantosUnidade = /^\s*(?:quantos?|quantas?)\s+((?:graus\s+)?[A-Za-zµμ°º/³²·.]+(?: celsius| fahrenheit)?)\s+(?:tem|t[eê]m|h[aá]|s[aã]o|equivalem|existem|correspondem|vale|valem)(?![A-Za-zÀ-ÿ])/i.exec(original);
  if (!tem || p.formulas.length === 0 || temQuant) {
    const temConv = RX_CONVERSAO.test(n) || /(?:->|→| em | para | pra | to )/.test(original);
    if (unidadesLidas.length >= 1 && temConv && !RX_PH.test(n) && !RX_GAS.test(n) && !RX_CONCENTRACAO.test(n) && !RX_ESTEQ.test(n) && !RX_MASSA_MOLAR.test(n)) {
      let destino = quantosUnidade ? lerUnidade(quantosUnidade[1], unidades) : paraUnidade;
      if (!destino && unidadesLidas.length >= 2) destino = unidadesLidas[unidadesLidas.length - 1].unidade;
      const origem = unidadesLidas[0].unidade;
      if (destino && origem && destino !== origem && acharUnidade(unidades ?? { grupos: {}, prefixos: [] }, origem).length) {
        return fim('CONVERSAO_UNIDADE', { unidadeDestino: destino, quantidades: [unidadesLidas[0]] });
      }
    }
  }

  // 5) cálculos
  const temKaKb = Object.keys(p.constantes).length > 0;
  if (RX_PH.test(n)) {
    if (temQuant || temKaKb || tem || /\b(?:acido|base|solucao)\b/.test(n)) {
      if (temQuant || temKaKb) return fim('PH');
      if (/\bde\b/.test(n) && tem) return fim('PH'); // "pH da água" (sem concentração): a resposta pede os dados
    }
    return fim('CONCEITO', { conceito: 'ph' });
  }
  if (RX_GAS.test(n) || /pv\s*=\s*nrt/i.test(original) || (RX_GAS_VAR.test(n) && unidadesLidas.some((q) => ['atm', 'Pa', 'kPa', 'mmHg', 'bar', 'K', '°C'].includes(q.unidade)) && /\b(?:volume|pressao|temperatura|mols?|quantos)\b/.test(n))) {
    if (/^(?:o que|oque|expli|defin|conceito|como funciona|por que)/.test(n) && !temQuant) return fim('CONCEITO', { conceito: 'gas ideal' });
    return fim('GAS_IDEAL');
  }
  if (RX_CONCENTRACAO.test(n) && (temQuant || /\bdilu\w*|molaridade|concentracao\b/.test(n)) && !/^(?:o que|oque|expli|defin|conceito|como funciona|por que)\b/.test(n)) return fim('CONCENTRACAO');
  if (RX_ESTEQ.test(n) && (temQuant || tem) && !/^(?:o que|oque|expli|defin|conceito)\b/.test(n)) return fim('ESTEQUIOMETRIA', { equacao });
  if (RX_MASSA_MOLAR.test(n) && !/^(?:o que|oque|expli|defin|conceito)\b/.test(n)) return fim('MASSA_MOLAR');

  // 6) representação, comparação, segurança, nomenclatura
  if (RX_COMPARAR.test(n) && p.compostos.length + p.elementos.length + p.formulas.length >= 2) return fim('COMPARAR');
  if (RX_DESENHAR.test(n) && (p.compostos.length || p.formulas.length) && !/\bpropriedades\b/.test(n)) return fim('DESENHAR');
  if (RX_SEGURANCA.test(n)) {
    const mistura = /\b(?:mistur\w+|junto com|juntos|combinar|misturado|misturada|incompativ\w+)\b/.test(n);
    return fim('SEGURANCA', { mistura });
  }
  if (RX_NOMENCLATURA.test(n) && (p.compostos.length || p.formulas.length)) return fim('NOMENCLATURA');

  // 7) tabela periódica
  const grupo = /\b(?:grupo|familia)\s+(\d{1,2})\b/.exec(n);
  const periodo = /\bperiodo\s+(\d)\b/.exec(n);
  const bloco = /\bbloco\s+([spdf])\b/.exec(n);
  const categoria = CATEGORIAS.find(([rx]) => rx.test(n))?.[1] ?? null;
  const estado = ESTADOS.find(([rx]) => rx.test(n))?.[1] ?? null;
  const extremo = EXTREMOS.find(([rx]) => rx.test(n))?.[1] ?? null;
  const tendencia = /\btendencia\w*|\bperiodicidade|\bvaria\w* (?:ao longo|no periodo|no grupo)|\bao longo d[oa] (?:periodo|grupo)/.test(n);
  const filtroTabela = grupo || periodo || bloco || categoria || extremo || tendencia || /\btabela periodica\b/.test(n);
  if (filtroTabela && !(p.propriedade && nEnt > 0 && !grupo && !periodo && !bloco && !tendencia)) {
    const naoEhFiltroPuro = nEnt > 0 && categoria === 'metal' && !grupo && !periodo;
    if (!naoEhFiltroPuro) {
      return fim('TABELA_PERIODICA', {
        grupo: grupo ? Number(grupo[1]) : null, periodo: periodo ? Number(periodo[1]) : null, bloco: bloco ? bloco[1] : null, categoria,
        estado: /\belementos?\b/.test(n) || categoria ? estado : null, extremo, tendencia, propriedade: p.propriedade ?? (extremo ? extremo[0] : null)
      });
    }
  }
  if (estado && /\belementos?\b/.test(n) && nEnt === 0) return fim('TABELA_PERIODICA', { estado });

  // 8) propriedades e perfis
  if (p.propriedade && tem) {
    const alvos = new Set(props.map((x) => x.alvo));
    // propriedade de composto com um elemento citado: prefere o alvo certo
    return fim('PROPRIEDADE', { alvoPropriedade: alvos.has('composto') && p.compostos.length ? 'composto' : p.elementos.length ? 'elemento' : 'composto' });
  }
  const cue = RX_CONCEITO_CUE.test(n);
  if (p.propriedade && !tem && cue) return fim('CONCEITO', { conceito: n.replace(RX_CONCEITO_CUE, '').replace(/^(?:e |eh |sao |significa |quer dizer |seria )/, '').replace(/^(?:um |uma |o |a |os |as |de |do |da )+/, '').trim() });
  if (p.propriedade && !tem) {
    const herdado = contexto && (contexto.elemento || contexto.composto);
    if (herdado) {
      return fim('PROPRIEDADE', { elemento: contexto.elemento, elementos: contexto.elementos ?? [], composto: contexto.composto, compostos: contexto.compostos ?? [], compostoNome: contexto.compostoNome, herdado: true });
    }
    return fim('PROPRIEDADE');
  }
  if (tem && (p.compostos.length || p.elementos.length || p.formulas.length)) {
    // "e do ferro?" depois de uma pergunta de propriedade
    if (/^e (?:o |a |os |as )?(?:de |do |da |dos |das )?/.test(n) && n.split(' ').length <= 5 && contexto?.propriedade && contexto.intent === 'PROPRIEDADE') {
      return fim('PROPRIEDADE', { propriedade: contexto.propriedade, propriedades: contexto.propriedades ?? [contexto.propriedade], herdado: true });
    }
    if (p.compostos.length || p.formulas.length) {
      if (p.elementos.length && !p.compostos.length && !p.formulas.length) return fim('ELEMENTO');
      return fim('COMPOSTO');
    }
    return fim('ELEMENTO');
  }

  // 9) conceito
  if (cue || /\b(?:mol|ph|estequiometria|ligacao (?:ionica|covalente|metalica|quimica)|eletronegatividade|oxidacao|reducao|oxirreducao|redox|equilibrio quimico|entalpia|entropia|isomeria|acido|base|sal|oxido|solucao|concentracao|molaridade|diluicao|tabela periodica|reacao quimica|cinetica|catalisador|eletrolise|pilha|polaridade|forca intermolecular|forcas intermoleculares)\b/.test(n)) {
    const conceito = n.replace(RX_CONCEITO_CUE, '').replace(/^(?:e |eh |sao |significa |quer dizer |seria )/, '').replace(/^(?:um |uma |o |a |os |as |de |do |da )+/, '').trim();
    if (conceito) return fim('CONCEITO', { conceito });
  }
  return p;
}

/** Palavras da pergunta úteis para recuperar trechos de texto (sem artigos nem verbos de pedido). */
export function termosDeBusca(texto) {
  const stop = new Set(['o', 'a', 'os', 'as', 'um', 'uma', 'de', 'do', 'da', 'dos', 'das', 'e', 'que', 'em', 'no', 'na', 'para', 'por', 'com', 'qual', 'quais', 'como', 'se', 'eh', 'sao', 'ser', 'quer', 'dizer', 'significa', 'explique', 'explica', 'defina', 'conceito', 'oque', 'porque', 'me', 'funciona']);
  return normalizar(texto).split(' ').filter((t) => t.length >= 2 && !stop.has(t));
}

export { tokensOriginais };
