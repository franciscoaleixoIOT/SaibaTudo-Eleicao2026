// "Esta pergunta revela a OPINIÃO ou a PREFERÊNCIA política de quem a fez?" — heurística CONSERVADORA usada pela captura de perguntas
// (api/_lib/melhoria-handler.js) e espelhada nos clientes (web/src/eleicoes2026/js/melhoria.js e Melhoria em MelhoriaClient.kt).
//
// Por quê: opinião política é dado pessoal SENSÍVEL (LGPD, art. 5º, II). Perguntas como "Quero que fulano ganhe, o que posso fazer?" ou "Qual a estratégia
// para aumentar as chances de fulano ganhar?" mostram o lado de quem pergunta; elas NÃO devem sair do aparelho nem ser guardadas. Na dúvida, descarta:
// perder uma pergunta neutra custa pouco; guardar uma opinião custa muito.
//
// Limite honesto: é um filtro de padrões, não entende contexto. Pode deixar passar uma opinião escrita de forma inusitada e pode descartar uma pergunta
// neutra que use uma dessas palavras. Por isso a captura continua desligada por padrão, tem aviso de consentimento, só aceita o que o app NÃO entendeu e
// passa por revisão humana. Os três filtros (servidor, site e Android) são conferidos contra o MESMO contrato: contracts/opiniao_cases.json.
//
// Os padrões rodam sobre o texto sem acento, em minúsculas e sem pontuação. Mantenha-os compatíveis com JavaScript e Java (sem recursos exclusivos).
import { fold } from './ground.js';

export const PADROES_OPINIAO = [
  // desejo e torcida
  /\bquero que\b/,
  /\bgostaria que\b/,
  /\bespero que\b.{0,40}\b(ganh\w+|venc\w+|elej\w+|perd\w+)/,
  /\btorc\w* (por|pra|para|pelo|pela)\b/,
  // apoio e voto declarado
  /\b(apoio|apoiar|apoiando|apoiador\w*|apoiadora\w*)\b/,
  /\b(vou votar|votei|votarei)\b/,
  /\b(meu candidato|minha candidata|meu partido|meu presidente|meu governador)\b/,
  // estratégia e campanha
  /\bestrategi\w*\b/,
  /\baument\w* (as |a )?chances?\b/,
  /\b(ajudar|fazer|conseguir|garantir)\b.{0,50}\b(ganhar|vencer|eleger|eleito|vitoria)\b/,
  /\b(fazer|minha|nossa) (campanha|propaganda)\b/,
  /\b(conseguir votos?|pedir votos? (para|pra|pro|pela|pelo))\b/,
  /\bcabo eleitoral\b/,
  // juízo de valor sobre pessoas e partidos
  /\b(odeio|detesto|adoro|amo|ladrao|corrupt\w*|bandid\w*|vagabund\w*|golpist\w*|fascist\w*|comunist\w*|petralh\w*|bolsominion\w*|incompetente|safado|canalha)\b/,
  // posição pessoal
  /\bsou (de )?(direita|esquerda|centro|bolsonarista|lulista|petista|tucano|conservador\w*|progressista|liberal|evangelic\w*|catolic\w*|ateu)\b/,
  /\b(minha opiniao|na minha opiniao)\b/,
  /\b(eu )?(acho|acredito|penso) que\b/,
];

/** Texto sem acento, minúsculo e sem pontuação (a mesma normalização dos clientes). */
export const normalizarOpiniao = (q) => fold(String(q ?? '')).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** A pergunta parece expressar opinião, preferência ou estratégia eleitoral de quem a fez? */
export function revelaOpiniao(q) {
  const t = normalizarOpiniao(q);
  return PADROES_OPINIAO.some((rx) => rx.test(t));
}
