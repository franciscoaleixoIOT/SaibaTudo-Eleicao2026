// Comportamento da home: ícones, botão da Google Play (configurável em apps.js), lista de apps, tema e instalação.
import { svgIcone } from '/portal/icons.js';
import { APPS, EM_BREVE, GOOGLE_PLAY_URL } from '/portal/apps.js';

const CHAVE = 'st26:prefs';
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

// Ícones decorativos: <span data-icone="github" data-tam="20">
for (const s of document.querySelectorAll('[data-icone]')) {
  const t = document.createElement('template');
  t.innerHTML = svgIcone(s.dataset.icone, Number(s.dataset.tam) || 20);
  s.replaceChildren(t.content.firstChild);
}

// Botão "Baixar na Google Play": desabilitado ("em breve") até GOOGLE_PLAY_URL existir
const play = document.getElementById('btn-play');
if (play && GOOGLE_PLAY_URL) {
  const a = el('a', 'btn btn-contorno grande');
  a.href = GOOGLE_PLAY_URL;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = 'Baixar na Google Play';
  play.replaceWith(a);
}

// Apps adicionais (APPS) e "Em breve" (EM_BREVE) a partir de dados
const listaApps = document.getElementById('apps-extra');
if (listaApps) {
  for (const app of APPS) {
    const c = el('article', 'card app-card');
    c.append(el('h3', null, app.nome), el('p', 'mudo', app.descricao));
    const acoes = el('div', 'acoes');
    const abrir = el('a', 'btn btn-primario', `Abrir ${app.nome}`);
    abrir.href = app.url;
    acoes.append(abrir);
    if (app.playUrl) { const p = el('a', 'btn btn-contorno', 'Baixar na Google Play'); p.href = app.playUrl; p.target = '_blank'; p.rel = 'noopener noreferrer'; acoes.append(p); }
    c.append(acoes);
    listaApps.append(c);
  }
}
const emBreve = document.getElementById('em-breve-lista');
if (emBreve) {
  for (const app of EM_BREVE) {
    const c = el('li', 'card breve');
    c.append(el('span', 'tag tag-ouro', 'Em breve'), el('h3', null, app.titulo), el('p', 'mudo', app.descricao));
    if (app.repo) { const r = el('p', 'mini mudo'); r.append('Repositório sugerido: ', el('code', null, app.repo)); c.append(r); }
    emBreve.append(c);
  }
}

// Tema (compartilha a preferência "tema" com o app: localStorage st26:prefs)
const ciclo = ['SISTEMA', 'CLARO', 'ESCURO'];
const rotulos = { SISTEMA: 'seguir o sistema', CLARO: 'claro', ESCURO: 'escuro' };
const lerPrefs = () => { try { return JSON.parse(localStorage.getItem(CHAVE) || 'null') || {}; } catch { return {}; } };
const btnTema = document.getElementById('btn-tema');
function aplicarTema(t) {
  const r = document.documentElement;
  if (t === 'CLARO') r.setAttribute('data-theme', 'light'); else if (t === 'ESCURO') r.setAttribute('data-theme', 'dark'); else r.removeAttribute('data-theme');
  if (btnTema) {
    btnTema.setAttribute('aria-label', `Tema: ${rotulos[t]}. Toque para alternar entre sistema, claro e escuro.`);
    btnTema.title = `Tema: ${rotulos[t]}`;
    const rot = btnTema.querySelector('.tema-rot');
    if (rot) rot.textContent = { SISTEMA: 'Auto', CLARO: 'Claro', ESCURO: 'Escuro' }[t];
  }
}
let tema = ciclo.includes(lerPrefs().tema) ? lerPrefs().tema : 'SISTEMA';
aplicarTema(tema);
btnTema?.addEventListener('click', () => {
  tema = ciclo[(ciclo.indexOf(tema) + 1) % ciclo.length];
  try { localStorage.setItem(CHAVE, JSON.stringify({ ...lerPrefs(), tema })); } catch { /* sem armazenamento */ }
  aplicarTema(tema);
});

// Instalação do portal SaibaTudo (a instalação do app Eleições 2026 é oferecida dentro do próprio app)
const btnInstalar = document.getElementById('btn-instalar');
let evento = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); evento = e; if (btnInstalar) btnInstalar.hidden = false; });
window.addEventListener('appinstalled', () => { evento = null; if (btnInstalar) btnInstalar.hidden = true; });
btnInstalar?.addEventListener('click', async () => {
  if (!evento) return;
  const e = evento; evento = null; btnInstalar.hidden = true;
  await e.prompt();
});

// Service worker do portal: só em HTTPS ou localhost
if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname))) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {}); });
}
