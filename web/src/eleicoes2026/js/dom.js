// Helpers mínimos de DOM (sem framework). Todo texto entra por textContent/createTextNode: nada de innerHTML com dados.

import { icon, svgIcone } from './icons.js';
export { icon, svgIcone };

const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'open', 'tabIndex', 'textContent', 'indeterminate']);

/** Cria um elemento: h('div', { class: 'x', onClick: fn, 'aria-label': 'y' }, 'texto', outroNo). */
export function h(tag, props, ...filhos) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.length > 2 && k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (PROPS.has(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  anexar(el, filhos);
  return el;
}

function anexar(el, filhos) {
  for (const f of filhos) {
    if (f == null || f === false) continue;
    if (Array.isArray(f)) anexar(el, f);
    else el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
}

/** Substitui o conteúdo de um contêiner. */
export function trocar(el, ...filhos) {
  const tmp = document.createDocumentFragment();
  anexar(tmp, filhos);
  el.replaceChildren(tmp);
  return el;
}

export const $ = (sel, raiz = document) => raiz.querySelector(sel);

export function debounce(fn, ms) {
  let t = null;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.cancel = () => clearTimeout(t);
  return d;
}

/** Anuncia uma mensagem para leitores de tela (região aria-live). */
export function anunciar(msg) {
  let r = document.getElementById('anuncios');
  if (!r) {
    r = h('div', { id: 'anuncios', class: 'sr-only', role: 'status', 'aria-live': 'polite' });
    document.body.append(r);
  }
  r.textContent = '';
  setTimeout(() => { r.textContent = msg; }, 50);
}

/** Link externo seguro (abre em nova aba, sem vazar referrer/opener). */
export const link = (href, texto, props = {}) =>
  h('a', { href, target: '_blank', rel: 'noopener noreferrer', ...props }, texto);
