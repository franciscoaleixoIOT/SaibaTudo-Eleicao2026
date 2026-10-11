// Service worker do PWA (web/src/eleicoes2026/sw.js): o ARQUIVO REAL é carregado num ambiente simulado (caches, fetch, eventos) e cada estratégia é exercitada.
// Cobre: pré-cache, ativação (poda de shells antigos), nunca interceptar /api/ nem apuração do TSE, navegação offline, manifesto (stale-while-revalidate e
// rede primeiro quando forçado), fatias versionadas cache-first com poda, redirecionamento "limpo", limites de fotos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { RAIZ } from './support.mjs';

const ORIGEM = 'https://saibatudo.net';
const FONTE = readFileSync(resolve(RAIZ, 'web/src/eleicoes2026/sw.js'), 'utf8');
const abs = (u) => new URL(typeof u === 'string' ? u : u.url, ORIGEM).href;

/** CacheStorage simulado, com as opções de match que o SW usa (ignoreSearch). */
function criarCaches() {
  const nomes = new Map();
  const fazerCache = (fetchFn) => {
    const m = new Map();
    return {
      _m: m,
      async match(req, opts = {}) {
        const alvo = new URL(abs(req));
        for (const [k, r] of m) {
          const u = new URL(k);
          if (u.origin + u.pathname === alvo.origin + alvo.pathname && (opts.ignoreSearch || u.search === alvo.search)) return r.clone();
        }
        return undefined;
      },
      async put(req, res) { m.set(abs(req), res); },
      async add(req) {
        const r = await fetchFn(req);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        m.set(abs(req), r);
      },
      async addAll(lista) { for (const x of lista) await this.add(x); },
      async keys() { return [...m.keys()].map((url) => ({ url })); },
      async delete(req) { return m.delete(abs(req)); },
    };
  };
  return {
    _nomes: nomes,
    fabrica: fazerCache,
    api(fetchFn) {
      return {
        async open(n) { if (!nomes.has(n)) nomes.set(n, fazerCache(fetchFn)); return nomes.get(n); },
        async keys() { return [...nomes.keys()]; },
        async delete(n) { return nomes.delete(n); },
      };
    },
  };
}

/** Carrega o sw.js com os marcadores do build substituídos, devolve os manipuladores e utilitários. */
function carregar({ versao = 'dev', precache = [], precacheDados = [], fetchImpl, cachesProntos } = {}) {
  const fonte = FONTE
    .replace("/*__BUILD__*/ 'dev'", JSON.stringify(versao))
    .replace('/*__PRECACHE__*/ []', JSON.stringify(precache))
    .replace('/*__PRECACHE_DADOS__*/ []', JSON.stringify(precacheDados));
  const chamadasFetch = [];
  const fetchSim = async (req, init) => {
    const url = abs(req);
    chamadasFetch.push({ url, init, cache: req?.cache });
    const r = await fetchImpl(url, req, init);
    // respostas same-origin de um fetch real têm type "basic": o estático só guarda essas
    if (new URL(url).origin === ORIGEM && r instanceof Response && !Object.prototype.hasOwnProperty.call(r, 'type')) Object.defineProperty(r, 'type', { value: 'basic' });
    return r;
  };
  // no navegador um Request relativo resolve contra self.location; no Node precisa de URL absoluta
  class RequestSim extends Request {
    constructor(u, init) { super(typeof u === 'string' ? new URL(u, ORIGEM).href : u, init); }
  }
  const cs = cachesProntos ?? criarCaches();
  const manipuladores = {};
  const estado = { skipWaiting: 0, claim: 0 };
  const self = {
    location: new URL(ORIGEM),
    addEventListener: (tipo, fn) => { manipuladores[tipo] = fn; },
    skipWaiting: async () => { estado.skipWaiting++; },
    clients: { claim: async () => { estado.claim++; } },
  };
  vm.runInNewContext(fonte, { self, caches: cs.api(fetchSim), fetch: fetchSim, Request: RequestSim, Response, URL, Promise, console }, { filename: 'sw.js' });
  const disparar = async (tipo, extra = {}) => {
    const resp = { espera: [], resposta: null };
    const evento = { ...extra, waitUntil: (p) => resp.espera.push(p), respondWith: (p) => { resp.resposta = p; } };
    manipuladores[tipo](evento);
    await Promise.all(resp.espera);
    return resp;
  };
  const pedir = async (req) => {
    const r = await disparar('fetch', { request: { method: 'GET', mode: 'cors', destination: '', cache: 'default', ...req } });
    if (!r.resposta) return undefined; // o SW NÃO interceptou
    const resposta = await r.resposta;
    // waitUntil é registrado DEPOIS da resposta (gravação em cache em segundo plano): espera até estabilizar
    for (let i = 0; i < 3; i++) await Promise.all(r.espera);
    return resposta;
  };
  return { manipuladores, estado, disparar, pedir, caches: cs, chamadasFetch, cache: (n) => cs._nomes.get(n) };
}

const ok = (corpo = 'ok', extra = {}) => new Response(corpo, { status: 200, ...extra });

test('install: pré-cacheia o shell da versão, o pacote de dados em melhor esforço e ativa na hora', async () => {
  const sw = carregar({
    versao: 'abc123',
    precache: ['/eleicoes2026/', '/eleicoes2026/js/main.js'],
    precacheDados: ['/data/eleicoes2026/regras.json', '/data/eleicoes2026/quebra.json'],
    fetchImpl: async (url) => (url.includes('quebra') ? new Response('x', { status: 404 }) : ok(url)),
  });
  await sw.disparar('install');
  const shell = sw.cache('st26-shell-abc123');
  assert.deepEqual([...shell._m.keys()].sort(), [`${ORIGEM}/eleicoes2026/`, `${ORIGEM}/eleicoes2026/js/main.js`]);
  const dados = sw.cache('st26-dados-v1');
  assert.deepEqual([...dados._m.keys()], [`${ORIGEM}/data/eleicoes2026/regras.json`], 'um arquivo de dados que falha não aborta a instalação');
  assert.equal(sw.estado.skipWaiting, 1);
});

test('install: o shell usa cache:"reload" (não aproveita cache HTTP velho) e falha de shell ABORTA a instalação', async () => {
  const sw = carregar({ precache: ['/eleicoes2026/'], fetchImpl: async () => ok() });
  await sw.disparar('install');
  assert.equal(sw.chamadasFetch[0].cache, 'reload');
  const quebrado = carregar({ precache: ['/eleicoes2026/'], fetchImpl: async () => new Response('x', { status: 500 }) });
  await assert.rejects(quebrado.disparar('install'));
});

test('activate: apaga só os shells de OUTRAS versões, preserva dados e fotos, e assume as abas', async () => {
  const cs = criarCaches();
  const sw = carregar({ versao: 'nova', cachesProntos: cs, fetchImpl: async () => ok() });
  for (const n of ['st26-shell-velha', 'st26-shell-nova', 'st26-dados-v1', 'st26-fotos-v1', 'outro-site']) await cs.api(async () => ok()).open(n);
  await sw.disparar('activate');
  assert.deepEqual([...cs._nomes.keys()].sort(), ['outro-site', 'st26-dados-v1', 'st26-fotos-v1', 'st26-shell-nova']);
  assert.equal(sw.estado.claim, 1);
});

test('mensagem SKIP_WAITING ativa a versão nova', async () => {
  const sw = carregar({ fetchImpl: async () => ok() });
  await sw.disparar('message', { data: 'SKIP_WAITING' });
  await sw.disparar('message', { data: 'outra coisa' });
  assert.equal(sw.estado.skipWaiting, 1);
});

test('NUNCA intercepta /api/, métodos que não são GET, outras origens nem a apuração ao vivo do TSE', async () => {
  const sw = carregar({ fetchImpl: async () => ok() });
  assert.equal(await sw.pedir({ url: `${ORIGEM}/api/nlu` }), undefined);
  assert.equal(await sw.pedir({ url: `${ORIGEM}/api/health`, mode: 'navigate' }), undefined);
  assert.equal(await sw.pedir({ method: 'POST', url: `${ORIGEM}/eleicoes2026/js/app.js` }), undefined);
  assert.equal(await sw.pedir({ url: 'https://exemplo.com/lib.js' }), undefined);
  assert.equal(await sw.pedir({ url: 'https://resultados.tse.jus.br/oficial/ele2026/544/dados-simplificados/br/br-c0001-e000544-r.json' }), undefined);
  assert.equal(sw.chamadasFetch.length, 0);
});

test('navegação: devolve o shell do cache; sem shell vai à rede; offline cai em /eleicoes2026/offline; arquivo real não é interceptado', async () => {
  let rede = true;
  const sw = carregar({
    precache: ['/eleicoes2026/', '/eleicoes2026/offline'],
    fetchImpl: async (url) => {
      if (!rede) throw new Error('offline');
      return ok(`rede:${url}`);
    },
  });
  await sw.disparar('install');
  const nav = (path) => ({ url: `${ORIGEM}${path}`, mode: 'navigate' });
  assert.match(await (await sw.pedir(nav('/eleicoes2026/?x=1'))).text(), /rede:.*\/eleicoes2026\//, 'o shell pré-cacheado foi servido (corpo da pré-carga)');
  assert.equal(await sw.pedir(nav('/eleicoes2026/offline.html')), undefined, 'arquivo real (extensão) vai à rede normal');

  // sem shell no cache: tenta a rede; offline: página offline do cache
  const vazio = carregar({ precache: [], fetchImpl: async () => { throw new Error('offline'); } });
  const r = await vazio.pedir(nav('/eleicoes2026/'));
  assert.equal(r.type, 'error', 'sem shell, sem rede e sem página offline: Response.error()');
  const comOffline = carregar({ precache: [], fetchImpl: async () => ok('offline') });
  const c = await comOffline.caches.api(async () => ok()).open('st26-shell-dev');
  await c.put('/eleicoes2026/offline', ok('PAGINA-OFFLINE'));
  comOffline.chamadasFetch.length = 0;
  const semRede = carregar({ precache: [], fetchImpl: async () => { throw new Error('offline'); }, cachesProntos: comOffline.caches });
  assert.equal(await (await semRede.pedir(nav('/eleicoes2026/'))).text(), 'PAGINA-OFFLINE');
});

test('resposta de redirecionamento é copiada para uma resposta "limpa" antes de servir a uma navegação', async () => {
  const sw = carregar({ fetchImpl: async () => ok() });
  const c = await sw.caches.api(async () => ok()).open('st26-shell-dev');
  const redirecionada = { redirected: true, status: 200, statusText: 'OK', headers: new Headers({ 'content-type': 'text/html' }), blob: async () => new Blob(['SHELL']), clone() { return this; } };
  await c.put('/eleicoes2026/', redirecionada);
  c.match = async () => redirecionada;
  const r = await sw.pedir({ url: `${ORIGEM}/eleicoes2026/`, mode: 'navigate' });
  assert.equal(r.redirected, false, 'uma navegação não pode ser respondida com resposta redirecionada');
  assert.equal(await r.text(), 'SHELL');
});

test('estático: serve do cache ignorando a query e só guarda respostas OK e básicas', async () => {
  const sw = carregar({ fetchImpl: async (url) => (url.includes('/ruim.js') ? new Response('x', { status: 404 }) : ok(`corpo:${url}`)) });
  const css = `${ORIGEM}/eleicoes2026/css/app.css`;
  assert.match(await (await sw.pedir({ url: `${css}?v=1` })).text(), /corpo:/);
  const n = sw.chamadasFetch.length;
  assert.match(await (await sw.pedir({ url: `${css}?v=2` })).text(), /corpo:/, 'segunda vez vem do cache, mesmo com outra query');
  assert.equal(sw.chamadasFetch.length, n, 'sem nova ida à rede');
  await sw.pedir({ url: `${ORIGEM}/eleicoes2026/js/ruim.js` });
  assert.equal(sw.cache('st26-shell-dev')._m.has(`${ORIGEM}/eleicoes2026/js/ruim.js`), false, '404 não é guardado');
});

test('estático: resposta que não é "basic" (opaca/cors) é servida mas NÃO é guardada no cache do shell', async () => {
  const sw = carregar({
    fetchImpl: async () => { const r = ok('de-outra-origem'); Object.defineProperty(r, 'type', { value: 'cors' }); return r; },
  });
  const url = `${ORIGEM}/eleicoes2026/js/terceiros.js`;
  assert.equal(await (await sw.pedir({ url })).text(), 'de-outra-origem');
  assert.equal(sw.cache('st26-shell-dev')._m.has(url), false);
});

test('manifesto: stale-while-revalidate (serve o cache e atualiza em segundo plano)', async () => {
  let versao = 'A';
  const sw = carregar({ fetchImpl: async () => ok(`manifesto-${versao}`) });
  const url = `${ORIGEM}/data/eleicoes2026/manifest.json`;
  assert.equal(await (await sw.pedir({ url })).text(), 'manifesto-A', 'primeira vez: rede');
  versao = 'B';
  assert.equal(await (await sw.pedir({ url })).text(), 'manifesto-A', 'depois: o cache responde na hora');
  await new Promise((r) => setTimeout(r, 10)); // a revalidação em segundo plano grava a versão nova
  assert.equal(await (await sw.pedir({ url })).text(), 'manifesto-B', 'a atualização em segundo plano chegou ao cache');
});

test('manifesto: quando o app força a checagem (cache:reload) a rede vem primeiro e o cache só serve offline', async () => {
  let rede = true;
  let corpoAtual = 'manifesto-novo';
  const sw = carregar({ fetchImpl: async () => { if (!rede) throw new Error('offline'); return ok(corpoAtual); } });
  sw.setCorpo = (c) => { corpoAtual = c; };
  const url = `${ORIGEM}/data/eleicoes2026/manifest.sig`;
  assert.equal(await (await sw.pedir({ url, cache: 'reload' })).text(), 'manifesto-novo');
  // com o cache já preenchido, a checagem FORÇADA ainda tem de ir à rede (cache-primeiro serviria o conteúdo velho)
  sw.setCorpo?.('manifesto-mais-novo');
  assert.equal(await (await sw.pedir({ url, cache: 'reload' })).text(), 'manifesto-mais-novo', 'forçado: rede primeiro, mesmo com cache');
  rede = false;
  assert.equal(await (await sw.pedir({ url, cache: 'no-cache' })).text(), 'manifesto-mais-novo', 'offline: devolve o último que veio da rede');
  const vazio = carregar({ fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal((await vazio.pedir({ url, cache: 'reload' })).type, 'error', 'offline sem cache: erro de rede explícito');
});

test('manifesto: a chave do cache ignora a query (um cache-buster não duplica nem esconde a entrada)', async () => {
  const sw = carregar({ fetchImpl: async () => ok('m') });
  await sw.pedir({ url: `${ORIGEM}/data/eleicoes2026/manifest.json?t=123`, cache: 'reload' });
  assert.deepEqual([...sw.cache('st26-dados-v1')._m.keys()], [`${ORIGEM}/data/eleicoes2026/manifest.json`]);
});

test('fatias versionadas (?v=sha256): cache-first e poda das versões antigas do MESMO arquivo', async () => {
  let corpo = 'v1';
  const sw = carregar({ fetchImpl: async () => ok(corpo) });
  const base = `${ORIGEM}/data/eleicoes2026/candidatos/SP.json`;
  assert.equal(await (await sw.pedir({ url: `${base}?v=aaa` })).text(), 'v1');
  const n = sw.chamadasFetch.length;
  assert.equal(await (await sw.pedir({ url: `${base}?v=aaa` })).text(), 'v1');
  assert.equal(sw.chamadasFetch.length, n, 'mesma URL versionada: nunca volta à rede');

  await sw.pedir({ url: `${ORIGEM}/data/eleicoes2026/candidatos/RJ.json?v=rj1` });
  corpo = 'v2';
  assert.equal(await (await sw.pedir({ url: `${base}?v=bbb` })).text(), 'v2', 'conteúdo novo = URL nova');
  const chaves = [...sw.cache('st26-dados-v1')._m.keys()];
  assert.ok(chaves.includes(`${base}?v=bbb`));
  assert.ok(!chaves.includes(`${base}?v=aaa`), 'a versão antiga de SP foi podada');
  assert.ok(chaves.includes(`${ORIGEM}/data/eleicoes2026/candidatos/RJ.json?v=rj1`), 'outros arquivos não são tocados');
});

test('fotos do pacote: cache com limite (as mais antigas saem primeiro)', async () => {
  const cs = criarCaches();
  const sw = carregar({ cachesProntos: cs, fetchImpl: async (url) => ok(`foto:${url}`) });
  const c = await cs.api(async () => ok()).open('st26-fotos-v1');
  for (let i = 0; i < 500; i++) await c.put(`/data/eleicoes2026/fotos/${i}.jpg`, ok(String(i)));
  await sw.pedir({ url: `${ORIGEM}/data/eleicoes2026/fotos/nova.jpg` });
  assert.equal(c._m.size, 500, 'respeita o limite de 500');
  assert.ok(!c._m.has(`${ORIGEM}/data/eleicoes2026/fotos/0.jpg`), 'a mais antiga saiu');
  assert.ok(c._m.has(`${ORIGEM}/data/eleicoes2026/fotos/nova.jpg`));
});

test('fotos do CDN do TSE: só imagens em /fotos/, pedidas com CORS e sem credenciais', async () => {
  const sw = carregar({ fetchImpl: async () => ok('img') });
  const foto = 'https://resultados.tse.jus.br/oficial/ele2026/fotos/sp/280002542548.jpeg';
  const r = await sw.pedir({ url: foto, destination: 'image' });
  assert.equal(await r.text(), 'img');
  assert.equal(sw.chamadasFetch[0].init.mode, 'cors');
  assert.equal(sw.chamadasFetch[0].init.credentials, 'omit');
  assert.equal(sw.cache('st26-fotos-tse-v1')._m.has(foto), true);
  const n = sw.chamadasFetch.length;
  await sw.pedir({ url: foto, destination: 'image' });
  assert.equal(sw.chamadasFetch.length, n, 'a segunda vem do cache');
  assert.equal(await sw.pedir({ url: 'https://resultados.tse.jus.br/oficial/ele2026/fotos/x.jpeg', destination: 'script' }), undefined, 'só destination=image');
});

test('os marcadores do build existem no arquivo (se alguém os remover, o build para de injetar a versão e o pré-cache)', () => {
  for (const marcador of ["/*__BUILD__*/ 'dev'", '/*__PRECACHE__*/ []', '/*__PRECACHE_DADOS__*/ []']) assert.ok(FONTE.includes(marcador), marcador);
});
