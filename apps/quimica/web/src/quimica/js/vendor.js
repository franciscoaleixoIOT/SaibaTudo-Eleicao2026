// Carga sob demanda das bibliotecas vendorizadas (KaTeX e SmilesDrawer): scripts clássicos de /quimica/vendor/ (CSP: script-src 'self').
const promessas = new Map();

function unico(chave, fabrica) {
  if (!promessas.has(chave)) {
    const p = fabrica();
    p.catch(() => promessas.delete(chave)); // permite tentar de novo se a rede falhou
    promessas.set(chave, p);
  }
  return promessas.get(chave);
}

function carregarScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.addEventListener('load', () => resolve(), { once: true });
    s.addEventListener('error', () => reject(new Error(`Não foi possível carregar ${src}`)), { once: true });
    document.head.append(s);
  });
}

function carregarCss(href) {
  return new Promise((resolve) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.addEventListener('load', () => resolve(), { once: true });
    l.addEventListener('error', () => resolve(), { once: true }); // sem estilo o texto ainda aparece
    document.head.append(l);
  });
}

export const URL_KATEX = '/quimica/vendor/katex/katex.min.js';
export const URL_KATEX_CSS = '/quimica/vendor/katex/katex.min.css';
export const URL_SMILES = '/quimica/vendor/smiles-drawer/smiles-drawer.min.js';

/** @returns {Promise<any>} o objeto global `katex` */
export const carregarKatex = () => unico('katex', async () => {
  await Promise.all([carregarCss(URL_KATEX_CSS), globalThis.katex ? null : carregarScript(URL_KATEX)]);
  if (!globalThis.katex) throw new Error('KaTeX indisponível');
  return globalThis.katex;
});

/** @returns {Promise<any>} o objeto global `SmilesDrawer` */
export const carregarSmiles = () => unico('smiles', async () => {
  if (!globalThis.SmilesDrawer) await carregarScript(URL_SMILES);
  if (!globalThis.SmilesDrawer) throw new Error('SmilesDrawer indisponível');
  return globalThis.SmilesDrawer;
});
