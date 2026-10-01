// Sanitização do conteúdo de relatos (vai para uma issue PÚBLICA do GitHub).
// Objetivos: (1) impedir menções/notificações (@usuario) e referências cruzadas (#123);
// (2) impedir injeção de markdown/HTML (todo texto do usuário vai em bloco de código cercado, com cerca
// maior que qualquer sequência de crases do conteúdo); (3) minimizar dados pessoais digitados por engano
// (e-mail, CPF, telefone, títulos e outros números longos); (4) truncar nos limites do contrato.

export const ZWSP = '​';

// Controles (exceto \n e \t), zero-width e marcas bidi (que poderiam disfarçar o texto).
const CONTROLES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

const RX_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const RX_CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const RX_TELEFONE = /(?:\+?55[\s-]?)?(?:\(?\d{2}\)?[\s-]?)?9?\d{4}[\s-]\d{4}\b/g;
const RX_NUMERO_LONGO = /\b\d{9,}\b/g;

/** Mascara dados pessoais comuns. Números curtos (número de urna, 2–5 dígitos) são preservados. */
export function redactPii(s) {
  return s
    .replace(RX_EMAIL, '[e-mail removido]')
    .replace(RX_CPF, '[documento removido]')
    .replace(RX_TELEFONE, '[telefone removido]')
    .replace(RX_NUMERO_LONGO, '[número removido]');
}

/** `@usuario` / `@org/time` -> `@<ZWSP>usuario` (não notifica ninguém). Também cobre o "＠" de largura total. */
export function neutralizeMentions(s) {
  return s.replace(/[@＠](?=[A-Za-z0-9_])/g, `@${ZWSP}`);
}

/** `#123` / `org/repo#123` / `GH-123` -> sem autolink de issue/PR. */
export function neutralizeRefs(s) {
  return s.replace(/#(?=\d)/g, `#${ZWSP}`).replace(/\bGH-(?=\d)/gi, `GH${ZWSP}-`);
}

/** Trunca por pontos de código (sem partir pares substitutos), acrescentando "…" quando cortar. */
export function truncate(s, max) {
  const cps = Array.from(s);
  if (cps.length <= max) return s;
  return `${cps.slice(0, Math.max(0, max - 1)).join('').trimEnd()}…`;
}

/** Normaliza quebras de linha, remove controles e limita linhas em branco consecutivas. */
export function limparMultilinha(s) {
  return String(s)
    .replace(/\r\n?/g, '\n')
    .replace(CONTROLES, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Pipeline completo para um campo de texto livre. */
export function sanitizeFreeText(s, max) {
  return neutralizeRefs(neutralizeMentions(redactPii(truncate(limparMultilinha(s), max))));
}

/** Envolve o texto em bloco de código com cerca mais longa que qualquer sequência de crases no conteúdo. */
export function codeFence(texto) {
  let maior = 0;
  for (const m of texto.matchAll(/`+/g)) maior = Math.max(maior, m[0].length);
  const cerca = '`'.repeat(Math.max(3, maior + 1));
  return `${cerca}text\n${texto}\n${cerca}`;
}
