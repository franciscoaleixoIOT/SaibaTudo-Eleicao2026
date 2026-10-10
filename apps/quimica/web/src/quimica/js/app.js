// Aplicativo (SPA) de /quimica/: carrega o pacote de dados assinado, monta o motor local e navega entre as telas sem recarregar.
import { DataStore } from './data.js';
import { Engine } from './engine.js';
import { h, icon, anunciar } from './dom.js';
import { iniciarInstalacao } from './install.js';
import { aplicarAparencia, carregar } from './prefs.js';
import { roteador, toast } from './ui/componentes.js';
import { viewCalculadoras } from './ui/calculadoras.js';
import { viewComposto, viewCompostos } from './ui/compostos.js';
import { viewConfig } from './ui/config.js';
import { viewElemento } from './ui/elemento.js';
import { viewInicio } from './ui/inicio.js';
import { viewSeguranca } from './ui/seguranca.js';
import { viewSobreDados } from './ui/sobre.js';
import { viewTabela } from './ui/tabela.js';

export { toast };

const BASE = '/quimica/';
const S = { store: null, engine: null, shell: null, primeira: true };

const ABAS = [
  ['/quimica/', 'Início', 'sparkles'], ['/quimica/tabela', 'Tabela periódica', 'table'], ['/quimica/compostos', 'Compostos', 'molecule'],
  ['/quimica/calculadoras', 'Calculadoras', 'calculator'], ['/quimica/seguranca', 'Segurança', 'shield']
];

const ROTAS = [
  [/^\/quimica\/?$/, viewInicio, []],
  [/^\/quimica\/tabela\/?$/, viewTabela, []],
  [/^\/quimica\/elemento\/([^/]+)\/?$/, viewElemento, ['simbolo']],
  [/^\/quimica\/compostos\/?$/, viewCompostos, []],
  [/^\/quimica\/composto\/(\d+)\/?$/, viewComposto, ['cid']],
  [/^\/quimica\/calculadoras(?:\/([a-z0-9-]+))?\/?$/, viewCalculadoras, ['id']],
  [/^\/quimica\/seguranca\/?$/, viewSeguranca, []],
  [/^\/quimica\/sobre-os-dados\/?$/, viewSobreDados, []],
  [/^\/quimica\/configuracoes\/?$/, viewConfig, []]
];

/** Rota de um caminho: { view, params } ou null. */
export function resolverRota(pathname) {
  for (const [rx, view, nomes] of ROTAS) {
    const m = rx.exec(pathname);
    if (m) return { view, params: Object.fromEntries(nomes.map((n, i) => [n, m[i + 1]])) };
  }
  return null;
}

const raiz = () => document.getElementById('app');

function viewNaoEncontrada() {
  return { titulo: 'Página não encontrada', status: 404, node: h('div', null,
    h('h1', { class: 'titulo-pagina', id: 'titulo-pagina', tabindex: '-1' }, 'Página não encontrada'),
    h('p', { class: 'sub-pagina' }, 'Esse endereço não existe no SaibaTudo Química.'), h('a', { class: 'btn btn-primario', href: '/quimica/' }, 'Ir para o início')) };
}

function montarShell() {
  const conteudo = h('main', { id: 'conteudo', class: 'conteudo', tabindex: '-1' });
  const nav = h('nav', { class: 'abas', 'aria-label': 'Seções' }, h('ul', null, ABAS.map(([href, rotulo, ic]) => h('li', null, h('a', { href, 'data-aba': href }, icon(ic, 18), rotulo)))));
  const topo = h('header', { class: 'appbar' },
    h('a', { class: 'appbar-marca', href: '/quimica/', 'aria-label': 'SaibaTudo Química, início' },
      h('img', { class: 'appbar-logo', src: '/quimica/brand/quimica-icon.svg', width: '38', height: '38', alt: '' }),
      h('div', { class: 'appbar-textos' }, h('div', { class: 'appbar-titulo' }, 'SaibaTudo Química'), h('div', { class: 'appbar-sub' }, 'Dados abertos, cálculos no seu aparelho'))),
    h('div', { class: 'appbar-acoes' }, h('a', { class: 'btn-icone claro', href: '/quimica/configuracoes', 'aria-label': 'Configurações', 'data-aba': '/quimica/configuracoes' }, icon('settings', 22))));
  const rodape = h('footer', { class: 'rodape' },
    h('a', { href: '/quimica/sobre-os-dados' }, 'Sobre os dados'), h('a', { href: '/quimica/privacidade' }, 'Privacidade'), h('a', { href: '/quimica/configuracoes' }, 'Configurações'),
    h('p', null, 'Projeto independente e de código aberto (MIT). Sem anúncios, login ou rastreadores.'));
  const aviso = h('div', { id: 'aviso-global' });
  raiz().replaceChildren(h('div', { class: 'app' }, topo, nav, aviso, conteudo, rodape));
  S.shell = { conteudo, nav, aviso };
}

function marcarAba(pathname) {
  for (const a of S.shell.nav.querySelectorAll('a[data-aba]')) {
    const href = a.getAttribute('data-aba');
    const ativo = href === BASE ? pathname === '/quimica' || pathname === BASE : pathname.startsWith(href);
    if (ativo) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
}

function avisoAssinatura() {
  const ruim = S.store.sig.estado === 'invalida';
  S.shell.aviso.replaceChildren(...(ruim ? [h('p', { class: 'aviso-caixa', role: 'alert' }, icon('warning', 18), 'A assinatura digital do pacote de dados não confere. Os dados do próprio site continuam em uso, mas não foram autenticados: não confie em valores críticos.')] : []));
}

export async function renderizar() {
  const url = new URL(location.href);
  const rota = resolverRota(url.pathname) ?? { view: viewNaoEncontrada, params: {} };
  marcarAba(url.pathname);
  let r;
  try {
    r = await rota.view({ store: S.store, engine: S.engine, params: rota.params, query: url.searchParams, navegar: irPara });
  } catch (e) {
    r = { titulo: 'Erro', node: h('div', { class: 'tela-corpo' }, h('h1', { id: 'titulo-pagina', tabindex: '-1' }, 'Algo deu errado'), h('p', { class: 'mudo' }, `Não foi possível montar esta tela (${e instanceof Error ? e.message : String(e)}).`), h('a', { class: 'btn btn-primario', href: '/quimica/' }, 'Ir para o início')) };
  }
  S.shell.conteudo.replaceChildren(r.node);
  document.title = `${r.titulo} — SaibaTudo Química`;
  if (!S.primeira) {
    const alvo = (r.foco && S.shell.conteudo.querySelector(r.foco)) || S.shell.conteudo.querySelector('#titulo-pagina');
    if (url.hash && S.shell.conteudo.querySelector(url.hash)) S.shell.conteudo.querySelector(url.hash).scrollIntoView();
    else { window.scrollTo(0, 0); alvo?.focus({ preventScroll: true }); }
    anunciar(`${r.titulo}`);
  }
  S.primeira = false;
}

export function irPara(href, { substituir = false } = {}) {
  const url = new URL(href, location.origin);
  if (url.origin !== location.origin) { location.assign(href); return; }
  if (!resolverRota(url.pathname) && !url.pathname.startsWith(BASE)) { location.assign(href); return; }
  if (url.pathname + url.search + url.hash !== location.pathname + location.search + location.hash) history[substituir ? 'replaceState' : 'pushState']({}, '', url.pathname + url.search + url.hash);
  return renderizar();
}
roteador.ir = irPara;

/** Interceptação de cliques em links internos (sem recarregar a página). */
function interceptarLinks(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest?.('a[href]');
  if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith(BASE)) return;
  if (!resolverRota(url.pathname)) return; // arquivos e páginas estáticas (privacidade): navegação normal
  e.preventDefault();
  irPara(url.pathname + url.search + url.hash);
}

function telaErro(msg) {
  raiz().replaceChildren(h('div', { class: 'tela-corpo offline' }, h('h1', null, 'Não foi possível carregar os dados'),
    h('p', { class: 'mudo' }, msg), h('p', null, h('button', { class: 'btn btn-primario', type: 'button', onClick: () => iniciarApp() }, 'Tentar de novo'))));
}

export async function iniciarApp() {
  aplicarAparencia(carregar());
  iniciarInstalacao();
  raiz().replaceChildren(h('div', { class: 'carregando', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('p', { class: 'mudo' }, 'Carregando SaibaTudo Química…')));
  try {
    S.store = new DataStore();
    await S.store.iniciar();
    S.engine = new Engine({ store: S.store });
  } catch (e) {
    telaErro(`${e instanceof Error ? e.message : String(e)}. Verifique a conexão; depois da primeira carga o aplicativo funciona offline.`);
    return;
  }
  montarShell();
  avisoAssinatura();
  document.addEventListener('click', interceptarLinks);
  window.addEventListener('popstate', () => renderizar());
  await renderizar();
  // verificação de atualização em segundo plano (dois arquivos pequenos), sem travar a interface
  setTimeout(async () => {
    const r = await S.store.verificarAtualizacao().catch(() => null);
    if (r?.tipo === 'atualizado') { avisoAssinatura(); toast('Dados atualizados. Recarregue a página para usar a versão nova em todas as telas.'); }
  }, 4000);
}

export const _estado = S;
