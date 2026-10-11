// Preferências (tema e tamanho do texto): ficam só neste navegador (localStorage). Nada é enviado a servidores.
const CHAVE = 'stq:prefs';

export const TEMAS = { SISTEMA: 'Seguir o sistema', CLARO: 'Claro', ESCURO: 'Escuro' };
export const FONTES = {
  PEQUENA: { rotulo: 'Pequena', fator: 0.9 }, NORMAL: { rotulo: 'Normal', fator: 1 },
  GRANDE: { rotulo: 'Grande', fator: 1.15 }, MUITO_GRANDE: { rotulo: 'Muito grande', fator: 1.3 }
};
export const PADRAO = Object.freeze({ tema: 'SISTEMA', tamanhoFonte: 'NORMAL' });

let memoria = null; // fallback quando o armazenamento está bloqueado (modo privado etc.)

/** Valida e completa as preferências lidas (valores inválidos voltam ao padrão). */
export function sanear(b) {
  const o = b && typeof b === 'object' ? b : {};
  return { tema: o.tema in TEMAS ? o.tema : PADRAO.tema, tamanhoFonte: o.tamanhoFonte in FONTES ? o.tamanhoFonte : PADRAO.tamanhoFonte };
}

export function carregar() {
  let bruto = null;
  try { bruto = JSON.parse(localStorage.getItem(CHAVE) ?? 'null'); } catch { bruto = memoria; }
  memoria = sanear(bruto);
  return memoria;
}

export function salvar(p) {
  memoria = p;
  try { localStorage.setItem(CHAVE, JSON.stringify(p)); } catch { /* sem armazenamento: vale só nesta sessão */ }
}

export function apagar() {
  memoria = null;
  try { localStorage.removeItem(CHAVE); } catch { /* ignorado */ }
}

/** Aplica tema e tamanho de texto ao documento. */
export function aplicarAparencia(p, doc = document) {
  const r = doc.documentElement;
  if (p.tema === 'CLARO') r.setAttribute('data-theme', 'light');
  else if (p.tema === 'ESCURO') r.setAttribute('data-theme', 'dark');
  else r.removeAttribute('data-theme');
  r.style.setProperty('--fs', String(FONTES[p.tamanhoFonte].fator));
}

/** O tema efetivo agora ('light' | 'dark'), considerando a preferência do aparelho. */
export function temaEfetivo(doc = document) {
  const t = doc.documentElement.getAttribute('data-theme');
  if (t === 'light' || t === 'dark') return t;
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
