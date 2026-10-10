// Fórmulas e equações com KaTeX (vendorizado). Antes de a biblioteca carregar (ou se falhar, por exemplo sem rede), o TeX aparece como texto.
import { h } from './dom.js';
import { carregarKatex } from './vendor.js';

/** Elemento que mostra `tex` renderizado pelo KaTeX (saída HTML + MathML, para leitores de tela). */
export function mathEl(tex, { display = true } = {}) {
  const el = h('span', { class: 'math carregando-math', 'data-tex': tex }, tex);
  carregarKatex().then((katex) => {
    try {
      katex.render(tex, el, { displayMode: display, throwOnError: false, output: 'htmlAndMathml', strict: 'ignore', trust: false });
      el.classList.remove('carregando-math');
    } catch { /* mantém o texto */ }
  }).catch(() => { /* sem KaTeX: mantém o texto */ });
  return el;
}
