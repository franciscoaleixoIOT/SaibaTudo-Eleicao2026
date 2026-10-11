// Verificador de FIDELIDADE do texto gerado (/api/ask): o modelo explica, os dados respondem. A resposta é REJEITADA quando:
//   (a) traz um número (2 ou mais dígitos, ou decimal) que não está na pergunta, no contexto nem nos trechos enviados;
//   (b) viola a segurança química (ensina a produzir/obter algo perigoso, ou responde a um pedido que a regra manda recusar);
//   (c) afirma uma fórmula química que não está nos dados enviados;
//   (d) inventa uma citação de fonte (id de trecho que não foi enviado, fonte ou endereço que não consta dos dados).
// Falha segura: reprovou => o cliente continua exibindo a resposta montada localmente, sem o texto gerado. Nada é "corrigido".

import { avaliarPedido, respostaViolaSeguranca } from './seguranca.js';
import { NOMES_ELEMENTOS, SIMBOLO_SET } from './vocab.js';
import { fold, numerosComPosicao, simbolosDaFormula, simplificar } from './ground.js';

export const MAX_RESPOSTA = 3000;

// ---------------------------------------------------------------- números

const chave = (v) => Number(v.toPrecision(10)).toString();

/** Texto sem o que parece número mas não é um dado: citações [id], endereços, marcadores de lista e fórmulas com índices. */
function semRuido(texto) {
  return simplificar(texto)
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/(?:https?:\/\/|www\.)\S+/gi, ' ')
    .replace(/\bdoi:\s*\S+|\b10\.\d{4,}\/\S+|\bisbn[ :-]*[0-9-]{9,}/gi, ' ')
    .replace(/^\s*\d{1,3}[.)]\s+/gm, ' ')
    .replace(/(?<![A-Za-z0-9])[A-Z(][A-Za-z0-9()]*\d[A-Za-z0-9()]*/g, ' ');
}

/** Conjunto de chaves numéricas (todas as leituras possíveis: "1.000" vale 1 e 1000) de um texto. */
export function numerosDe(texto) {
  const saida = new Set();
  for (const n of numerosComPosicao(simplificar(texto))) for (const v of n.valores) saida.add(chave(Math.abs(v)));
  return saida;
}

const relevante = (tok) => tok.replace(/\D/g, '').length >= 2 || /\d[.,]\d/.test(tok) || /x\s*10|e[-+]?\d/i.test(tok);

/** Números da resposta que não aparecem nos dados enviados (texto de cada ocorrência). */
export function numerosSemFonte(resposta, permitidos) {
  const sobras = [];
  for (const n of numerosComPosicao(semRuido(resposta))) {
    if (!relevante(n.texto)) continue;
    if (!n.valores.some((v) => permitidos.has(chave(Math.abs(v))))) sobras.push(n.texto);
  }
  return [...new Set(sobras)];
}

// ---------------------------------------------------------------- fórmulas

// Siglas que parecem fórmulas (todas as letras são símbolos de elementos) mas não são.
const NAO_FORMULAS = new Set(['HIV', 'PVC', 'ONU', 'UV', 'UN', 'ICSC', 'USP', 'PET', 'PH', 'SI', 'NO']);
// Grupos funcionais e radicais, citados sem número em qualquer explicação.
const GRUPOS_FUNCIONAIS = new Set(['OH', 'COOH', 'NH2', 'CH3', 'CH2', 'CHO', 'CN', 'SH', 'NH', 'CH', 'COO']);

/** O primeiro "(" só é fechado pelo último caractere do token? */
function fechaNoFim(w) {
  let nivel = 0;
  for (let i = 0; i < w.length; i++) {
    if (w[i] === '(') nivel += 1;
    else if (w[i] === ')') {
      nivel -= 1;
      if (nivel === 0) return i === w.length - 1;
    }
  }
  return false;
}

/** Tira parênteses sobrando nas pontas ("H2O)" -> "H2O"). */
function balancear(w) {
  const conta = (c) => w.split(c).length - 1;
  while (w.endsWith(')') && conta(')') > conta('(')) w = w.slice(0, -1);
  while (w.startsWith('(') && conta('(') > conta(')')) w = w.slice(1);
  // "(H2O2)" -> "H2O2": parênteses que envolvem o token inteiro são pontuação, não parte da fórmula
  while (w.startsWith('(') && w.endsWith(')') && fechaNoFim(w)) w = w.slice(1, -1);
  return w;
}

/** Fórmulas químicas (normalizadas) mencionadas em um texto, pela regex de fórmula + validação dos símbolos. */
export function formulasDe(texto, { grupos = false } = {}) {
  const saida = new Set();
  const palavras = simplificar(texto).replace(/\[[^\]]*\]/g, ' ').match(/[A-Za-z0-9()·]+/g) ?? [];
  for (const bruta of palavras) {
    const w = balancear(bruta);
    if (!/^[A-Z(]/.test(w)) continue;
    const simbolos = simbolosDaFormula(w);
    if (!simbolos) continue;
    const temDigito = /\d/.test(w);
    const segmentos = (w.match(/[A-Z][a-z]?/g) ?? []).length;
    const temMinuscula = /[a-z]/.test(w);
    if (!temDigito && !w.includes('(')) {
      if (segmentos < 2) continue; // "Na", "Fe": símbolo solto, não fórmula
      if (!temMinuscula && (w.length > 4 || NAO_FORMULAS.has(w))) continue; // sigla em maiúsculas
    }
    if (!grupos && GRUPOS_FUNCIONAIS.has(w)) continue;
    saida.add(w.replace(/·.*$/, ''));
  }
  return saida;
}

const RX_NOMES_ELEMENTOS = Object.entries(NOMES_ELEMENTOS).map(([simbolo, nomes]) => [simbolo, nomes.map((n) => new RegExp(`(?<![a-z])${fold(n)}`))]);

/** Elementos "presentes" nos dados: pelo nome, pelo símbolo isolado ou dentro de qualquer fórmula citada. */
function elementosDosDados(dadosFold, formulas) {
  const achados = new Set();
  for (const [simbolo, rxs] of RX_NOMES_ELEMENTOS) if (rxs.some((rx) => rx.test(dadosFold))) achados.add(simbolo);
  for (const f of formulas) for (const s of f.match(/[A-Z][a-z]?/g) ?? []) if (SIMBOLO_SET.has(s)) achados.add(s);
  return achados;
}

export function formulasSemFonte(resposta, dadosTexto) {
  const nosDados = formulasDe(dadosTexto, { grupos: true });
  const elementos = elementosDosDados(fold(dadosTexto), nosDados);
  const sobras = [];
  for (const f of formulasDe(resposta)) {
    if (nosDados.has(f)) continue;
    // molécula elementar ("O2", "N2", "Cl2") é aceita se o elemento aparece nos dados
    const unico = /^([A-Z][a-z]?)\d+$/.exec(f);
    if (unico && elementos.has(unico[1])) continue;
    sobras.push(f);
  }
  return sobras;
}

// ---------------------------------------------------------------- fontes

const FONTES_CONHECIDAS = [
  'openstax', 'libretexts', 'pubchem', 'codata', 'nist', 'iupac', 'wikidata', 'wikipedia', 'wikipédia', 'icsc', 'echa', 'sbq',
  'sociedade brasileira de quimica', 'anvisa', 'crc handbook', 'handbook', 'merck index', 'atkins', 'brown', 'chang', 'feltre', 'usberco',
  'kotz', 'zumdahl', 'mortimer', 'lehninger', 'solomons', 'clayden', 'skoog',
].map(fold);

const RX_ENDERECO = /(?:https?:\/\/|www\.)[^\s)\]]+|\bdoi:\s*\S+|\b10\.\d{4,}\/\S+|\bisbn[\s:-]*[\d-]{9,}/gi;

/**
 * Fontes inventadas: ids entre colchetes que não foram enviados, endereços/DOI/ISBN fora dos dados e nomes de fonte ou obra que
 * não aparecem nos dados. Devolve { invalidas: string[], citadas: string[] } (ids enviados que a resposta cita).
 */
export function verificarFontes(resposta, { dadosTexto, trechos }) {
  const ids = trechos.map((t) => t.id);
  const dadosFold = fold(dadosTexto);
  const invalidas = [];
  const citadas = new Set();
  for (const m of String(resposta).matchAll(/\[([^\]\n]{1,100})\]/g)) {
    const conteudo = m[1].trim();
    if (/^\d{1,3}$/.test(conteudo)) continue; // nota de rodapé [1]
    const partes = conteudo.split(/\s*[;,]\s*/);
    for (const parte of partes) {
      if (ids.includes(parte)) citadas.add(parte);
      else invalidas.push(`[${parte}]`);
    }
  }
  for (const id of ids) if (String(resposta).includes(id)) citadas.add(id);
  for (const m of String(resposta).matchAll(RX_ENDERECO)) {
    if (!dadosTexto.includes(m[0].replace(/[.,;]+$/, ''))) invalidas.push(m[0].slice(0, 40));
  }
  const respFold = fold(String(resposta).replace(/\[[^\]]*\]/g, ' '));
  for (const nome of FONTES_CONHECIDAS) {
    if (new RegExp(`(?<![a-z])${nome}(?![a-z])`).test(respFold) && !dadosFold.includes(nome)) invalidas.push(nome);
  }
  return { invalidas: [...new Set(invalidas)], citadas: [...citadas] };
}

// ---------------------------------------------------------------- verificação completa

/**
 * @param {string} resposta  texto gerado
 * @param {{q?:string, context?:string, trechos?:{id:string,texto:string}[]}} dados  o que o app enviou
 * @returns {{ok:true, fontes:string[]} | {ok:false, motivo:'vazia'|'longa'|'seguranca'|'numero_sem_fonte'|'formula_sem_fonte'|'fonte_inventada', itens?:string[]}}
 */
export function verificarFidelidade(resposta, { q = '', context = '', trechos = [] } = {}) {
  const texto = typeof resposta === 'string' ? resposta.trim() : '';
  if (!texto) return { ok: false, motivo: 'vazia' };
  if (texto.length > MAX_RESPOSTA) return { ok: false, motivo: 'longa' };

  // (b) segurança: a pergunta já deveria ter sido barrada; o texto não pode ensinar a produzir nem obter nada perigoso
  if (avaliarPedido(q).recusar || respostaViolaSeguranca(texto).viola) return { ok: false, motivo: 'seguranca' };

  const dadosTexto = [q, context, ...trechos.map((t) => t.texto), ...trechos.map((t) => t.id)].join('\n');

  // (a) números
  const sobrasNum = numerosSemFonte(texto, numerosDe(dadosTexto));
  if (sobrasNum.length > 0) return { ok: false, motivo: 'numero_sem_fonte', itens: sobrasNum.slice(0, 5) };

  // (c) fórmulas
  const sobrasFormula = formulasSemFonte(texto, dadosTexto);
  if (sobrasFormula.length > 0) return { ok: false, motivo: 'formula_sem_fonte', itens: sobrasFormula.slice(0, 5) };

  // (d) fontes
  const f = verificarFontes(texto, { dadosTexto, trechos });
  if (f.invalidas.length > 0) return { ok: false, motivo: 'fonte_inventada', itens: f.invalidas.slice(0, 5) };

  return { ok: true, fontes: f.citadas };
}
