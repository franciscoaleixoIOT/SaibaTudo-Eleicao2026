// Neutralidade eleitoral e verificação das respostas da IA generativa (/api/ask).
//
// A Res. TSE 23.755/2026 veda à IA recomendar, comparar ou prever candidaturas. O NLU local já recusa esses pedidos
// (RX_RECOMENDACAO em web/.../nlu.js e LocalNlu.kt); aqui o proxy repete a checagem ANTES de gastar GPU, e confere a
// resposta gerada DEPOIS. Falha segura: qualquer dúvida => o cliente cai na resposta local, montada só dos dados.
//
// Paridade: `pedeRecomendacao` espelha RX_RECOMENDACAO do NLU dos clientes. api/test/neutralidade.test.mjs confere,
// contra contracts/nlu_golden_cases.json, que todo pedido de recomendação do contrato é barrado.

import { fold } from './ground.js';

const RX_PEDIDO = [
  /\bem quem (eu )?(devo|deveria|posso|vou|voto|votar|votaria)\b/,
  /\bquem (eu )?(devo|deveria|vale a pena|e melhor|seria melhor|merece)\b/,
  /\b(melhor|pior|mais honest\w*|mais corrupt\w*|mais competente|mais preparad\w*|ideal|mais confiavel)\b.*\b(candidat\w*|president\w*|governador\w*|senador\w*|deputad\w*)\b/,
  /\b(candidat\w*|president\w*|governador\w*|senador\w*|deputad\w*)\b.*\b(melhor|pior|mais honest\w*|mais corrupt\w*|mais competente|mais preparad\w*)\b/,
  /\bvota(r)?\s+(em|no|na)\s+quem\b/,
  /\b(recomend\w*|indic\w*|indiq\w*|sugir\w*|suger\w*|aconselh\w*)\b.*\b(candidat\w*|voto|votar|president\w*|governador\w*|senador\w*|deputad\w*)\b/,
  /\bquem (vai|vao|deve|devera|tem mais chance de) (ganhar|vencer|ser eleito|se eleger|ganha)\b/,
  /\bquem (ganha|vence|ganhara|vencera|ganharia|venceria)\b.*\b(eleic\w*|president\w*|governo|senado|turno)\b/,
  /\bfavorit\w*\b/,
  /\b(mais|menos|maior|menor) chances?\b|\bchances? de (vencer|ganhar|se eleger|eleger)\b/,
  /\bquem (e|eh) (o |a )?(mais|menos|melhor|pior|maior|menor)\b/,
  /\bquem (tem|possui) (mais|menos|maior|menor|melhor|pior)\b/,
  /\bquem (sera|vai ser) o proximo\b|\bproximo presidente\b/,
  /\bquem (pode|vai|deve) (surpreender|despontar|decolar)\b/,
  /\bquem (ira|vai|deve) (disputar|ir|estar|passar) (o |no |para o )?(segundo|2 ?o) turno\b/,
  /\bcenario (eleitoral )?(mais )?provavel\b|\brisco de virada\b|\bvirada eleitoral\b/,
  /\bquem (vence|venceria|ganha|ganharia) (no|em|com) (mais )?(folga|vantagem)\b/,
  /\b(mais|menos|maior|menor) rejeicao\b/,
  // tentativas de contornar a regra pela própria pergunta (injeção de instrução)
  /\b(ignore|esqueca|desconsidere)\b.*\b(regras?|instruc\w*|neutralidade)\b/,
];

/** A pergunta pede recomendação, comparação ou previsão de candidatos? (texto livre do usuário) */
export function pedeRecomendacao(pergunta) {
  const t = fold(String(pergunta ?? '')).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ');
  return RX_PEDIDO.some((rx) => rx.test(t));
}

const RX_RESPOSTA = [
  /\b(vote|votem|vota|votar|voto)\s+(em|no|na|nele|nela)\b/,
  /\b(recomend\w*|sugir\w*|suger\w*|indic\w*|indiq\w*|aconselh\w*)\b[^.\n]{0,80}\b(candidat\w*|voto|votar|vote)\b/,
  /\b(melhor|pior|mais honest\w*|mais corrupt\w*|mais competente|mais preparad\w*)\s+(candidat\w*|opcao)\b/,
  /\b(voce|o eleitor|eleitores)\s+(deve|deveria|devem|deveriam)\s+votar\b/,
  /\b(e|sera|seria|parece ser) (o |a )?(favorit\w*|virtual (vencedor|eleito)|franco (favorito|vencedor))\b/,
  /\b(vai|vao|deve|devera|tende a|tem tudo para) (ganhar|vencer|se eleger|ser eleito)\b/,
  /\bmais chances? de (vencer|ganhar|se eleger)\b/,
];

/** A resposta gerada recomenda, compara ou prevê candidatos? */
export function respostaRecomenda(resposta) {
  const t = fold(String(resposta ?? '')).replace(/[^a-z0-9 .\n]+/g, ' ').replace(/[ \t]+/g, ' ');
  return RX_RESPOSTA.some((rx) => rx.test(t));
}

// Números que a própria regra do prompt (system prompt do Modal) autoriza a citar sem constar do contexto:
// ano e datas do calendário (25/10/2026, 04/10/2026), o limiar de 50 %, horário de votação (8h às 17h), distância de armas (100 m),
// artigos da CF (28, 77), LC 64/90, Lei 9.504/97, Res. TSE 23.736/2024 e 23.755/2026. Números de 1 dígito nunca são checados.
const NUMEROS_DAS_REGRAS = new Set([
  '2026', '2024', '1988', '88', '25', '10', '50', '17', '100', '28', '77', '64', '90', '97', '9504', '23736', '23755',
]);

const semZerosAEsquerda = (d) => d.replace(/^0+(?=\d)/, '');
const digitos = (tok) => semZerosAEsquerda(tok.replace(/\D/g, ''));

/** Tokens numéricos de um texto, normalizados (só dígitos, sem zeros à esquerda). */
export function numerosDe(texto) {
  const achados = String(texto ?? '').match(/\d[\d.,]*\d|\d/g) ?? [];
  const saida = new Set();
  for (const tok of achados) {
    saida.add(digitos(tok));
    // "46,10" também vale como "46" e "10": partes separadas por ponto ou vírgula
    for (const parte of tok.split(/[.,]/)) if (parte) saida.add(semZerosAEsquerda(parte));
  }
  return saida;
}

/**
 * Números da resposta que NÃO aparecem na pergunta, no contexto enviado pelo app nem nas regras autorizadas.
 * Números de 1 dígito são ignorados (numeração de tópicos, "2º turno").
 */
export function numerosNaoFundamentados(resposta, { q = '', context = '' } = {}) {
  const permitidos = numerosDe(`${q}\n${context}`);
  const sobras = [];
  for (const tok of String(resposta ?? '').match(/\d[\d.,]*\d|\d/g) ?? []) {
    const d = digitos(tok);
    if (d.length <= 1) continue;
    if (permitidos.has(d) || NUMEROS_DAS_REGRAS.has(d)) continue;
    // número composto ("46,10"): vale se as partes estão no contexto (ex.: "46,1" vs "46,10")
    const partes = tok.split(/[.,]/).map(semZerosAEsquerda).filter(Boolean);
    if (partes.length > 1 && partes.every((p) => p.length <= 1 || permitidos.has(p) || NUMEROS_DAS_REGRAS.has(p))) continue;
    sobras.push(tok);
  }
  return [...new Set(sobras)];
}

/** Afirma "sem segundo turno" junto de percentual de 50 % ou menos para Executivo? (contradição com Art. 28 e 77 da CF) */
export function contradizSegundoTurno(resposta) {
  const t = fold(String(resposta ?? ''));
  const semSegundo = /\b(nao (havera|tera) segundo turno|liquid\w+ (a eleicao|em turno unico)|eleito em (primeiro|1o|1) turno)\b/.test(t);
  if (!semSegundo) return false;
  const pcts = [...String(resposta).matchAll(/(\d{1,3}(?:[.,]\d{1,2})?)\s*%/g)].map((m) => parseFloat(m[1].replace(',', '.')));
  return pcts.some((p) => p > 0 && p <= 50) && /\b(governador|president)\w*/.test(t);
}

/**
 * Verificação final da resposta gerada. Devolve { ok:true } ou { ok:false, motivo }.
 * Motivos: 'recomendacao' | 'numero_sem_fonte' | 'contradicao_2t' | 'contradiz_dados' | 'contagem_sem_fonte'.
 */
export function verificarRespostaAsk(resposta, { q = '', context = '' } = {}) {
  if (respostaRecomenda(resposta)) return { ok: false, motivo: 'recomendacao' };
  if (contradizSegundoTurno(resposta)) return { ok: false, motivo: 'contradicao_2t' };
  if (contradizDadosDoApp(resposta, context)) return { ok: false, motivo: 'contradiz_dados' };
  const contagens = contagensSemFonte(resposta, { q, context });
  if (contagens.length > 0) return { ok: false, motivo: 'contagem_sem_fonte', numeros: contagens.slice(0, 5) };
  const sobras = numerosNaoFundamentados(resposta, { q, context });
  if (sobras.length > 0) return { ok: false, motivo: 'numero_sem_fonte', numeros: sobras.slice(0, 5) };
  return { ok: true };
}

// ------------------------------------------------------------------ texto gerado × dados que o app enviou

const RX_2T = '(?:2.?|o 2.?|segundo|o segundo) turno';
const RX_NEGA_2T = new RegExp(`\\bnao (?:havera|tera|vai ter|vai haver|ha|tem|houve|teve) ${RX_2T}\\b|\\bsem (?:necessidade de )?${RX_2T}\\b|` +
  '\\beleit[oa]s? (?:ja )?(?:em|no) (?:1.?|primeiro) turno\\b|\\b(?:em|no) (?:1.?|primeiro) turno\\b[^.\\n]{0,40}\\beleit[oa]\\b|\\bturno unico\\b', 'g');
const RX_AFIRMA_2T = new RegExp(`\\b(?:havera|tera|vai ter|vai haver|tem|houve|teve) ${RX_2T}\\b|\\b(?:disput\\w+|foram para|vao para|passaram para) o ${RX_2T}\\b`);

/**
 * O texto gerado CONTRADIZ o que o app apurou e enviou no contexto? O contexto traz a resposta que o app já mostra, montada
 * dos dados oficiais ("Sim, haverá 2º turno para…", "Não haverá 2º turno…", "… foi eleito(a) em 1º turno"). Regras:
 *  - contexto diz que HÁ 2º turno e o texto diz que não há (ou que alguém foi eleito no 1º turno), e vice-versa;
 *  - o texto afirma que alguém "foi eleito" e o contexto não fala em eleito em lugar nenhum.
 * Fatos críticos nunca vêm do modelo: divergiu, descarta (o usuário continua vendo a resposta do app).
 */
export function contradizDadosDoApp(resposta, context = '') {
  const c = fold(String(context ?? ''));
  const r = fold(String(resposta ?? ''));
  const ctxNega = RX_NEGA_2T.test(c);
  RX_NEGA_2T.lastIndex = 0;
  const ctxAfirma = RX_AFIRMA_2T.test(c.replace(RX_NEGA_2T, ' '));
  const respNega = RX_NEGA_2T.test(r);
  RX_NEGA_2T.lastIndex = 0;
  const respAfirma = RX_AFIRMA_2T.test(r.replace(RX_NEGA_2T, ' '));
  if (ctxAfirma && !ctxNega && respNega) return true;
  if (ctxNega && !ctxAfirma && respAfirma && !respNega) return true;
  if (/\b(?:foi|foram|esta|estao|sai\w*) eleit[oa]s?\b|\bse eleg\w+\b|\bvenceu a eleicao\b|\bganhou a eleicao\b/.test(r) && !/\beleit/.test(c)) return true;
  return false;
}

/**
 * Contagens afirmadas pelo texto ("o total de candidaturas é de 5", "são 5 candidatos") cujo número não está na pergunta nem
 * no contexto. Vale também para UM dígito (o verificador de números ignora esses): contar itens de uma lista cortada é o erro
 * típico do modelo.
 */
export function contagensSemFonte(resposta, { q = '', context = '' } = {}) {
  const permitidos = numerosDe(`${q}\n${context}`);
  const t = fold(String(resposta ?? ''));
  const rx = new RegExp(
    '\\b(?:total|numero|quantidade)\\b[^.\\n]{0,70}?\\b(?:e|sao|foi|eram|de)\\s+(?:de\\s+)?(\\d{1,6})\\b(?!\\s*(?:%|digitos|de outubro|\\/))|' +
    '\\b(?:sao|ha|existem|temos|foram|constam|disputam)\\s+(\\d{1,6})\\s+(?:candidat|concorrent|nomes|pessoas|chapas|postulantes)', 'g');
  const sobras = [];
  for (const m of t.matchAll(rx)) {
    const n = (m[1] ?? m[2]).replace(/^0+(?=\d)/, '');
    if (!permitidos.has(n)) sobras.push(n);
  }
  return [...new Set(sobras)];
}
