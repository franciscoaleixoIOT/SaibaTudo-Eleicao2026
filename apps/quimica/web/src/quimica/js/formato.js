// Números no padrão brasileiro (vírgula decimal) e leitura tolerante do que a pessoa digita. Sem DOM.

const NF = new Map();
function nf(opts) {
  const k = JSON.stringify(opts);
  if (!NF.has(k)) NF.set(k, new Intl.NumberFormat('pt-BR', opts));
  return NF.get(k);
}

const SUPER = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻' };

/** Mantissa e expoente decimais com `sig` algarismos significativos (sem erros de arredondamento de toExponential). */
function cientifico(n, sig) {
  const [m, e] = n.toExponential(Math.max(0, sig - 1)).split('e');
  return { mantissa: Number(m), expoente: Number(e) };
}

/**
 * Formata um número: sempre com algarismos significativos (padrão 6), notação científica para valores muito grandes ou pequenos.
 * @param {number} n
 * @param {{sig?: number, casas?: number, cientifica?: 'auto'|boolean, semMilhar?: boolean}} [o] `casas` = casas decimais fixas
 */
export function fmt(n, { sig = 6, casas = null, cientifica = 'auto', semMilhar = false } = {}) {
  if (n == null || Number.isNaN(n)) return '—';
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '−∞';
  if (n === 0) return casas != null && casas > 0 ? nf({ minimumFractionDigits: casas, maximumFractionDigits: casas }).format(0) : '0';
  const abs = Math.abs(n);
  const usaCient = cientifica === true || (cientifica === 'auto' && casas == null && (abs >= 1e7 || abs < 1e-4));
  if (usaCient) {
    const { mantissa, expoente } = cientifico(n, Math.min(sig, 15));
    const m = nf({ maximumFractionDigits: Math.max(0, Math.min(sig, 15) - 1) }).format(mantissa);
    return `${m} × 10${[...String(expoente)].map((c) => SUPER[c] ?? c).join('')}`;
  }
  const opts = casas != null
    ? { minimumFractionDigits: casas, maximumFractionDigits: casas }
    : { maximumSignificantDigits: sig };
  if (semMilhar) opts.useGrouping = false;
  return nf(opts).format(n).replace('-', '−');
}

/** O mesmo número em TeX: "1{,}5", "1{,}8 \\times 10^{-5}", milhares com espaço fino. */
export function fmtTex(n, o = {}) {
  if (n == null || Number.isNaN(n)) return '\\text{—}';
  if (!Number.isFinite(n)) return n > 0 ? '\\infty' : '-\\infty';
  const s = fmt(n, { semMilhar: false, ...o });
  const m = /^(.*?) × 10(.+)$/.exec(s);
  const tex = (x) => x.replace(/−/g, '-').replace(/,/g, '{,}').replace(/\./g, '\\,');
  if (m) {
    const exp = [...m[2]].map((c) => Object.keys(SUPER).find((k) => SUPER[k] === c) ?? c).join('');
    return `${tex(m[1])} \\times 10^{${exp}}`;
  }
  return tex(s);
}

/** Dígitos após a vírgula necessários para exibir `n` com `sig` algarismos significativos. */
export function casasPara(n, sig = 4) {
  if (!n) return 0;
  return Math.max(0, sig - 1 - Math.floor(Math.log10(Math.abs(n))));
}

/**
 * Lê um número digitado em pt-BR ou inglês: "1,5", "1.5", "1.234,56", "1,8e-5", "1,8 x 10^-5", "10^-3".
 * @returns {number} NaN se não for um número.
 */
export function lerNumero(entrada) {
  let s = String(entrada ?? '').trim().replace(/\s+/g, ' ').replace(/−/g, '-');
  if (!s) return NaN;
  s = s.replace(/\s*[x×*·]\s*10\s*\^?\s*\{?(-?\d+)\}?/i, 'e$1').replace(/^10\s*\^\s*\{?(-?\d+)\}?$/, '1e$1');
  s = s.replace(/\s/g, '');
  if (/^[+-]?\d{1,3}(\.\d{3})+(,\d+)?(e[+-]?\d+)?$/i.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^[+-]?\d+(,\d+)?(e[+-]?\d+)?$/i.test(s)) s = s.replace(',', '.');
  else if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Arredonda para n casas (evita 18.015000000000001). */
export const arredondar = (x, casas = 6) => Number(Number(x).toFixed(casas));
