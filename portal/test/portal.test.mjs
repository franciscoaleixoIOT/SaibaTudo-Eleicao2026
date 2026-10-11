// Home de saibatudo.net (projeto próprio, servido pelo proxy do projeto de eleições): build, independência dos outros
// projetos, service worker (arquivo real num ambiente simulado) e vercel.json.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(RAIZ, 'src');
const tmp = mkdtempSync(join(tmpdir(), 'st-portal-'));
const OUT = join(tmp, 'dist');
const OUT2 = join(tmp, 'dist2');
const roda = (out) => execFileSync(process.execPath, [join(RAIZ, 'build.mjs')], { env: { ...process.env, OUT_DIR: out }, encoding: 'utf8' });
const ler = (p, base = OUT) => readFileSync(join(base, ...p.split('/')), 'utf8');
const existe = (u, base = OUT) => { const p = u.split(/[?#]/)[0]; return p === '/' ? existsSync(join(base, 'index.html')) : existsSync(join(base, ...p.split('/').filter(Boolean))); };
/** Links de navegação para páginas de outros projetos no mesmo domínio (não são recursos da home). */
const PAGINAS = ['/', '/eleicoes2026/', '/privacidade', '/sobre-os-dados', '/quimica/'];

before(() => { roda(OUT); });
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows */ } });

test('todo recurso local da home existe no próprio projeto (independente de eleições e química)', () => {
  const html = ler('index.html');
  const locais = [...html.matchAll(/(?:href|src)="(\/[^"#]*)"/g)].map((m) => m[1]);
  assert.ok(locais.length > 10);
  for (const u of locais) {
    if (PAGINAS.includes(u)) continue;
    assert.ok(u.startsWith('/portal/') || u === '/manifest.webmanifest', `recurso fora de /portal/: ${u}`);
    assert.ok(existe(u), `recurso ausente no build: ${u}`);
  }
  for (const m of html.matchAll(/content="https:\/\/saibatudo\.net(\/[^"]+)"/g)) if (!PAGINAS.includes(m[1])) assert.ok(existe(m[1]), `imagem de compartilhamento ausente: ${m[1]}`);
  for (const arq of ['index.html', 'portal/home.js', 'portal/base.css', 'portal/site.css', 'manifest.webmanifest']) {
    const s = ler(arq);
    for (const proibido of ['"/assets/', "'/assets/", '"/brand/', '"/fonts/', '/eleicoes2026/js/', '/quimica/js/']) assert.ok(!s.includes(proibido), `${arq} depende de outro projeto: ${proibido}`);
  }
  for (const m of ler('portal/home.js').matchAll(/from '([^']+)'/g)) assert.ok(m[1].startsWith('/portal/') && existe(m[1]), `import fora do portal: ${m[1]}`);
  for (const m of ler('portal/base.css').matchAll(/url\("([^"]+)"\)/g)) assert.ok(existe(m[1]), `CSS aponta para arquivo ausente: ${m[1]}`);
  for (const i of JSON.parse(ler('manifest.webmanifest')).icons) assert.ok(existe(i.src), `ícone do manifesto ausente: ${i.src}`);
  assert.equal(readFileSync(join(OUT, 'portal/fonts/poppins-semibold.woff')).subarray(0, 4).toString('latin1'), 'wOFF');
});

test('módulos da home: apps.js e icons.js carregam; cada app tem id, nome e endereço no mesmo domínio', async () => {
  const { APPS, EM_BREVE } = await import(pathToFileURL(join(OUT, 'portal/apps.js')).href);
  const { svgIcone } = await import(pathToFileURL(join(OUT, 'portal/icons.js')).href);
  assert.ok(Array.isArray(APPS) && Array.isArray(EM_BREVE));
  for (const a of APPS) assert.ok(a.id && a.nome && /^\/[a-z0-9-]+\/$/.test(a.url), JSON.stringify(a));
  for (const s of ler('index.html').matchAll(/data-icone="([a-z-]+)"/g)) assert.match(svgIcone(s[1], 20), /^<svg/, `ícone ${s[1]}`);
});

test('service worker: versão (hash) e pré-cache preenchidos, todos existentes, sem /api, /data nem outros apps; build reproduzível', () => {
  const sw = ler('sw.js');
  assert.ok(!sw.includes('/*__'), 'marcadores não substituídos');
  assert.match(sw, /const VERSAO = "[0-9a-f]{12}"/);
  const pre = JSON.parse(/const PRECACHE = (\[[\s\S]*?\]);/.exec(sw)[1]);
  assert.ok(pre.includes('/') && pre.includes('/portal/home.js') && pre.includes('/portal/apps.js') && pre.includes('/manifest.webmanifest'));
  for (const u of pre) {
    assert.ok(existe(u), `pré-cache aponta para arquivo inexistente: ${u}`);
    assert.ok(!/^\/(api|data|quimica|eleicoes2026)\//.test(u) && !u.endsWith('.html'), `fora do escopo da home: ${u}`);
  }
  new vm.Script(sw, { filename: 'sw.js' });
  roda(OUT2);
  assert.equal(ler('sw.js', OUT2), sw, 'duas builds idênticas geram o mesmo service worker');
});

/** Carrega o sw.js do src e devolve intercepta(url, modo) → true se o SW chamou respondWith. */
function carregarSw() {
  const manipuladores = {};
  const self = { location: new URL('https://saibatudo.net'), addEventListener: (t, fn) => { manipuladores[t] = fn; }, skipWaiting: async () => {}, clients: { claim: async () => {} } };
  const caches = { open: async () => ({ match: async () => undefined, put: async () => {} }), keys: async () => [], delete: async () => true };
  vm.runInNewContext(readFileSync(join(SRC, 'sw.js'), 'utf8'), { self, caches, fetch: async () => new Response('ok'), Response, Request, URL, Promise, console }, { filename: 'sw.js' });
  return (url, mode = 'cors', method = 'GET') => {
    let interceptou = false;
    manipuladores.fetch({ request: { url: new URL(url, 'https://saibatudo.net').href, mode, method }, respondWith: (p) => { interceptou = true; p.catch(() => {}); }, waitUntil: () => {} });
    return interceptou;
  };
}

test('service worker: NUNCA intercepta química, API, dados, navegações de eleições nem métodos além de GET', () => {
  const intercepta = carregarSw();
  for (const u of ['/quimica', '/quimica/', '/quimica/tabela', '/quimica/js/main.js', '/quimica/data/manifest.json', '/quimica/api/health']) {
    assert.equal(intercepta(u), false, u);
    assert.equal(intercepta(u, 'navigate'), false, `${u} (navegação)`);
  }
  assert.equal(intercepta('/api/health'), false);
  assert.equal(intercepta('/data/eleicoes2026/manifest.json'), false);
  assert.equal(intercepta('/eleicoes2026/', 'navigate'), false);
  assert.equal(intercepta('/portal/home.js', 'cors', 'POST'), false);
  assert.equal(intercepta('/', 'navigate'), true);
  assert.equal(intercepta('/portal/home.js'), true);
  assert.equal(intercepta('/quimicax/arquivo.js'), true, 'só o prefixo exato /quimica/ fica de fora');
});

test('manifesto web da home: campos exigidos, escopo / e ícones any + maskable', () => {
  const m = JSON.parse(ler('manifest.webmanifest'));
  assert.equal(m.name, 'SaibaTudo');
  assert.equal(m.short_name, 'SaibaTudo');
  assert.equal(m.scope, '/');
  assert.equal(m.display, 'standalone');
  assert.equal(m.theme_color, '#0C2340');
  assert.equal(m.lang, 'pt-BR');
  assert.ok(m.start_url.startsWith('/') && m.start_url.includes('source=pwa'));
  assert.ok(m.background_color);
  const tamanhos = m.icons.map((i) => `${i.sizes}:${i.purpose}`);
  for (const t of ['192x192:any', '512x512:any', '192x192:maskable', '512x512:maskable']) assert.ok(tamanhos.includes(t), `ícone ${t}`);
  for (const s of m.shortcuts ?? []) assert.ok(s.url.startsWith('/') && s.icons.every((i) => existe(i.src)), `atalho ${s.name}`);
});

test('vercel.json: build, saída, cleanUrls e CSP restritiva', () => {
  const v = JSON.parse(readFileSync(join(RAIZ, 'vercel.json'), 'utf8'));
  assert.equal(v.buildCommand, 'node build.mjs');
  assert.equal(v.outputDirectory, 'dist');
  assert.equal(v.cleanUrls, true);
  const csp = v.headers.find((h) => h.source === '/(.*)').headers.find((x) => x.key === 'Content-Security-Policy').value;
  assert.ok(!csp.includes('unsafe-inline') && !csp.includes('unsafe-eval') && !/https?:\/\//.test(csp));
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
});
