// Texto: normalização para busca (sem acento, minúsculas), distância de edição e utilitários. Sem DOM.

/** "Ácido  Sulfúrico!" → "acido sulfurico" (letras e números, separados por um espaço). */
export function normalizar(s) {
  return String(s ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+\-]+/g, ' ')
    .replace(/(^|\s)[+-]+(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Como normalizar, mas descarta também hífens, sinais e espaços ("n-butano" ≈ "nbutano"): chave frouxa para nomes. */
export const chaveFrouxa = (s) => normalizar(s).replace(/[^a-z0-9]/g, '');

export const escapeRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Distância de Damerau-Levenshtein com corte: devolve max+1 se passar de `max`. */
export function distancia(a, b, max = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = a.length;
  const n = b.length;
  let p2 = null;
  let p1 = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    let minimo = i;
    for (let j = 1; j <= n; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(p1[j] + 1, cur[j - 1] + 1, p1[j - 1] + custo);
      if (p2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1);
      cur.push(v);
      if (v < minimo) minimo = v;
    }
    if (minimo > max) return max + 1;
    p2 = p1;
    p1 = cur;
  }
  return p1[n];
}

/** Primeira letra maiúscula. */
export const capitalizar = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Junta com vírgulas e "e": ["a", "b", "c"] → "a, b e c". */
export function listar(itens) {
  const l = itens.filter((x) => x != null && x !== '');
  if (l.length <= 1) return l.join('');
  return `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`;
}

/** Plural simples para contagens: plural(2, 'elemento', 'elementos'). */
export const plural = (n, um, varios) => (n === 1 ? um : varios);
