// Componentes de interface compartilhados: fórmulas, listas chave/valor, passos de cálculo, blocos de resposta, GHS, tabelas e toasts.
// Todo texto entra por createTextNode/textContent; os únicos innerHTML são os SVG de ícones constantes (icons.js).
import { formulaTokens, formulaUnicode } from '../calc/formula.js';
import { h, icon } from '../dom.js';
import { mathEl } from '../math.js';
import { moleculaEl } from '../molecula.js';
import { urlSegura, urlPictograma } from '../perigos.js';

/** Ponte para a navegação (definida por app.js): evita importação circular. */
export const roteador = { ir: (href) => { globalThis.location.assign(href); } };

let _seq = 0;
export const novoId = (p = 'id') => `${p}-${++_seq}`;

/** Fórmula com <sub> e <sup>, lida corretamente por leitores de tela (rótulo em Unicode). */
export function formulaEl(texto, { grande = false } = {}) {
  let toks;
  try { toks = formulaTokens(texto); } catch { toks = [{ t: 'txt', v: String(texto) }]; }
  return h('span', { class: `formula${grande ? ' formula-grande' : ''}`, 'aria-label': formulaUnicode(texto) },
    toks.map((t) => (t.t === 'sub' ? h('sub', { 'aria-hidden': 'true' }, t.v) : t.t === 'sup' ? h('sup', { 'aria-hidden': 'true' }, t.v) : h('span', { 'aria-hidden': 'true' }, t.v))));
}

/** Link interno da SPA (o clique é tratado por app.js) ou externo seguro. */
export function linkRota(href, texto, props = {}) {
  return h('a', { href, ...props }, texto);
}
export const linkExterno = (href, texto, props = {}) => {
  const url = urlSegura(href);
  return url ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', ...props }, texto) : h('span', props, texto);
};

export function chip({ rotulo, selecionado = false, onClick, icone = null, classe = '', ariaLabel = null, cor = null }) {
  const el = h('button', {
    type: 'button', class: `chip${selecionado ? ' on' : ''} ${classe}`.trim(), 'aria-pressed': selecionado ? 'true' : 'false', 'aria-label': ariaLabel, onClick
  }, cor ? h('span', { class: 'cor-amostra', 'aria-hidden': 'true' }) : null, icone ? icon(icone, 14) : null, rotulo);
  if (cor) el.firstChild.style.setProperty('--cor', cor);
  return el;
}

/** Lista de pares rótulo/valor (<dl>). `valor` pode ser texto ou nó. */
export function kvEl(itens) {
  return h('dl', { class: 'kv' }, itens.flatMap((i) => [h('dt', null, i.rotulo), h('dd', null, i.valor)]));
}

/** "Fonte: nome — licença" com link quando houver. */
export function fonteEl(fonte) {
  const lista = (Array.isArray(fonte) ? fonte : [fonte]).filter(Boolean);
  if (!lista.length) return null;
  const partes = [];
  lista.forEach((f, i) => {
    if (i) partes.push('; ');
    partes.push(f.url ? linkExterno(f.url, f.nome) : f.nome);
    if (f.licenca) partes.push(` — ${f.licenca}`);
  });
  return h('p', { class: 'bloco-fonte' }, 'Fonte: ', partes);
}

/** Resultado de calculadora: lista de itens {rotulo, valor, unidade, destaque, extra}. */
export function resultadosEl(itens) {
  return h('div', { class: 'res-lista' }, itens.map((i) => h('div', { class: `res-item${i.destaque ? ' destaque' : ''}` },
    h('span', { class: 'rot' }, i.rotulo),
    h('span', { class: 'val' }, `${i.valor}${i.unidade ? ` ${i.unidade}` : ''}`),
    i.extra ? h('span', { class: 'extra' }, i.extra) : null)));
}

/** Passos de cálculo: texto + fórmulas renderizadas pelo KaTeX. */
export function passosEl(passos) {
  return h('ol', { class: 'passos' }, passos.map((p) => h('li', { class: `passo${p.destaque ? ' destaque' : ''}` },
    h('div', { class: 'passo-texto' }, p.texto),
    p.tex ? (Array.isArray(p.tex) ? p.tex : [p.tex]).map((t) => mathEl(t)) : null)));
}

export function ghsEl(g, { grande = false } = {}) {
  const sinal = g.palavraSinal ? h('span', { class: `sinal ${g.palavraSinal === 'Perigo' ? 'perigo' : 'atencao'}` }, g.palavraSinal) : null;
  return h('div', { class: 'ghs' },
    g.titulo ? h('div', { class: 'bloco-tit' }, g.titulo) : null,
    sinal ? h('div', null, h('span', { class: 'mudo pequeno' }, 'Palavra de sinal: '), sinal) : null,
    g.pictogramas?.length ? h('ul', { class: 'ghs-pictos', 'aria-label': 'Pictogramas de perigo' }, g.pictogramas.map((p) => h('li', { class: `picto${grande ? ' grande' : ''}` },
      h('img', { src: p.url ?? urlPictograma(p.codigo), alt: `${p.codigo}: ${p.nome}`, width: '84', height: '84', loading: 'lazy' }),
      h('span', null, `${p.codigo} — ${p.nome}`)))) : null,
    g.frases?.length ? h('ul', { class: 'frases-h', 'aria-label': 'Frases de perigo (H)' }, g.frases.map((f) => h('li', null, h('span', { class: 'cod' }, f.codigo), h('span', null, f.texto ?? 'Texto da frase não disponível neste pacote.')))) : null);
}

export function tabelaEl(b) {
  return h('div', { class: 'tabela-rolagem' }, h('table', { class: 'tabela-dados' },
    b.legenda ? h('caption', null, b.legenda) : null,
    h('thead', null, h('tr', null, b.cabecalho.map((c) => h('th', { scope: 'col' }, c)))),
    h('tbody', null, b.linhas.map((l) => h('tr', null, l.map((c, i) => (i === 0 ? h('th', { scope: 'row' }, c) : h('td', null, c))))))));
}

/** Renderiza um bloco da resposta do motor (ver answers.js). */
export function blocoEl(b) {
  let corpo;
  switch (b.tipo) {
    case 'texto': corpo = h('p', { class: 'bloco-texto' }, b.texto); break;
    case 'aviso': corpo = h('div', { class: 'bloco-aviso', role: 'note' }, icon('warning', 18), h('span', null, b.texto)); break;
    case 'lista': corpo = h('div', null, b.titulo ? h('div', { class: 'bloco-tit' }, b.titulo) : null, h('ul', { class: 'lista-pontos' }, b.itens.map((i) => h('li', null, i)))); break;
    case 'kv': corpo = h('div', null, b.titulo ? h('div', { class: 'bloco-tit' }, b.titulo) : null, kvEl(b.itens)); break;
    case 'resultado': corpo = h('div', null, b.titulo ? h('div', { class: 'bloco-tit' }, b.titulo) : null, resultadosEl(b.itens)); break;
    case 'passos': corpo = h('details', { open: true }, h('summary', { class: 'bloco-tit' }, b.titulo ?? 'Passo a passo'), passosEl(b.passos)); break;
    case 'formula': corpo = h('p', null, formulaEl(b.formula, { grande: true })); break;
    case 'equacao': corpo = h('div', { class: 'equacao-final' }, mathEl(b.tex), h('span', { class: 'sr-only' }, b.texto)); break;
    case 'tabela': corpo = tabelaEl(b); break;
    case 'molecula': corpo = moleculaEl(b.smiles, b.nome); break;
    case 'ghs': corpo = ghsEl(b); break;
    case 'citacao': corpo = h('blockquote', { class: 'bloco-texto' }, b.texto, b.aviso ? h('p', { class: 'mini mudo' }, b.aviso) : null); break;
    default: corpo = null;
  }
  if (!corpo) return null;
  return h('div', { class: `bloco bloco-${b.tipo}` }, corpo, b.tipo === 'aviso' ? null : fonteEl(b.fonte));
}

let _toast = null;
let _toastT = null;
export function toast(msg) {
  if (!_toast) {
    _toast = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(_toast);
  }
  _toast.textContent = msg;
  _toast.classList.add('on');
  clearTimeout(_toastT);
  _toastT = setTimeout(() => _toast.classList.remove('on'), 3800);
}

/** Aviso de erro (role=alert) para formulários. */
export const erroEl = (msg) => h('div', { class: 'erro-calc', role: 'alert' }, msg);

/** Cartão-atalho para uma tela. */
export function cartaoEl(href, nomeIcone, titulo, descricao) {
  return h('a', { class: 'cartao', href }, icon(nomeIcone, 24), h('strong', null, titulo), h('span', null, descricao));
}
