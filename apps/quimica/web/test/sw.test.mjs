// Service worker do PWA (web/src/quimica/sw.js): o ARQUIVO REAL é carregado num ambiente simulado (caches, fetch, eventos) e cada estratégia é exercitada.
// Cobre: pré-cache, ativação (poda de shells antigos), nunca interceptar /api/, navegação offline, página estática pré-cacheada (privacidade),
// manifesto (stale-while-revalidate e rede primeiro quando forçado), fatias versionadas cache-first com poda, redirecionamento "limpo".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { RAIZ } from './support.mjs';

const ORIGEM = 'https://saibatudo.net';
const FONTE = readFileSync(resolve(RAIZ, 'web/src/quimica/sw.js'), 'utf8');
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
      async delete(req) { return m.delete(abs(req)); }
    };
  };
  return {
    _nomes: nomes,
    api(fetchFn) {
      return {
        async open(n) { if (!nomes.has(n)) nomes.set(n, fazerCache(fetchFn)); return nomes.get(n); },
        async keys() { return [...nomes.keys()]; },
        async delete(n) { return nomes.delete(n); }
      };
    }
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
    clients: { claim: async () => { estado.claim++; } }
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

const ok = (corpo = 'ok') => new Response(corpo, { status: 200 });

test('install: pré-cacheia o shell da versão, o pacote de dados em melhor esforço e ativa na hora', async () => {
  const sw = carregar({
    versao: 'abc123',
    precache: ['/quimica/', '/quimica/js/main.js'],
    precacheDados: ['/quimica/data/regras.json', '/quimica/data/quebra.json'],
    fetchImpl: async (url) => (url.includes('quebra') ? new Response('x', { status: 404 }) : ok(url))
  });
  await sw.disparar('install');
  const shell = sw.cache('quimica-shell-abc123');
  assert.deepEqual([...shell._m.keys()].sort(), [`${ORIGEM}/quimica/`, `${ORIGEM}/quimica/js/main.js`]);
  const dados = sw.cache('quimica-dados-v1');
  assert.deepEqual([...dados._m.keys()], [`${ORIGEM}/quimica/data/regras.json`], 'um arquivo de dados que falha não aborta a instalação');
  assert.equal(sw.estado.skipWaiting, 1);
});

test('install: o shell usa cache:"reload" (não aproveita cache HTTP velho) e falha de shell ABORTA a instalação', async () => {
  const sw = carregar({ precache: ['/quimica/'], fetchImpl: async () => ok() });
  await sw.disparar('install');
  assert.equal(sw.chamadasFetch[0].cache, 'reload');
  const quebrado = carregar({ precache: ['/quimica/'], fetchImpl: async () => new Response('x', { status: 500 }) });
  await assert.rejects(quebrado.disparar('install'));
});

test('activate: apaga só os shells de OUTRAS versões, preserva os dados e caches de outros sites, e assume as abas', async () => {
  const cs = criarCaches();
  const sw = carregar({ versao: 'nova', cachesProntos: cs, fetchImpl: async () => ok() });
  for (const n of ['quimica-shell-velha', 'quimica-shell-nova', 'quimica-dados-v1', 'st26-shell-x', 'outro-site']) await cs.api(async () => ok()).open(n);
  await sw.disparar('activate');
  assert.deepEqual([...cs._nomes.keys()].sort(), ['outro-site', 'quimica-dados-v1', 'quimica-shell-nova', 'st26-shell-x']);
  assert.equal(sw.estado.claim, 1);
});

test('mensagem SKIP_WAITING ativa a versão nova', async () => {
  const sw = carregar({ fetchImpl: async () => ok() });
  await sw.disparar('message', { data: 'SKIP_WAITING' });
  await sw.disparar('message', { data: 'outra coisa' });
  assert.equal(sw.estado.skipWaiting, 1);
});

test('NUNCA intercepta /api/, /quimica/api/, métodos que não são GET nem outras origens', async () => {
  const sw = carregar({ fetchImpl: async () => ok() });
  assert.equal(await sw.pedir({ url: `${ORIGEM}/api/nlu` }), undefined);
  assert.equal(await sw.pedir({ url: `${ORIGEM}/api/quimica/ask` }), undefined);
  assert.equal(await sw.pedir({ url: `${ORIGEM}/quimica/api/health`, mode: 'navigate' }), undefined);
  assert.equal(await sw.pedir({ url: `${ORIGEM}/quimica/api/nlu` }), undefined);
  assert.equal(await sw.pedir({ method: 'POST', url: `${ORIGEM}/quimica/js/app.js` }), undefined);
  assert.equal(await sw.pedir({ url: 'https://exemplo.com/lib.js' }), undefined);
  assert.equal(await sw.pedir({ url: 'https://pubchem.ncbi.nlm.nih.gov/compound/962' }), undefined);
  assert.equal(sw.chamadasFetch.length, 0);
});

test('navegação: shell do cache; página estática pré-cacheada (privacidade) é servida como ela mesma; offline cai em /quimica/offline; arquivo real não é interceptado', async () => {
  const sw = carregar({
    precache: ['/quimica/', '/quimica/offline', '/quimica/privacidade'],
    fetchImpl: async (url) => ok(`rede:${url}`)
  });
  await sw.disparar('install');
  const nav = (path) => ({ url: `${ORIGEM}${path}`, mode: 'navigate' });
  assert.match(await (await sw.pedir(nav('/quimica/?x=1'))).text(), /rede:.*\/quimica\//, 'o shell pré-cacheado foi servido');
  assert.match(await (await sw.pedir(nav('/quimica/tabela'))).text(), /rede:.*\/quimica\/$/, 'rota do SPA → shell');
  assert.match(await (await sw.pedir(nav('/quimica/composto/2244'))).text(), /rede:.*\/quimica\/$/, 'rota do SPA → shell');
  assert.match(await (await sw.pedir(nav('/quimica/privacidade'))).text(), /rede:.*\/quimica\/privacidade$/, 'página estática: ela mesma, não o shell');
  assert.equal(await sw.pedir(nav('/quimica/offline.html')), undefined, 'arquivo real (extensão) vai à rede normal');

  const vazio = carregar({ precache: [], fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal((await vazio.pedir(nav('/quimica/'))).type, 'error', 'sem shell, sem rede e sem página offline: Response.error()');
  const comOffline = carregar({ precache: [], fetchImpl: async () => ok('offline') });
  const c = await comOffline.caches.api(async () => ok()).open('quimica-shell-dev');
  await c.put('/quimica/offline', ok('PAGINA-OFFLINE'));
  const semRede = carregar({ precache: [], fetchImpl: async () => { throw new Error('offline'); }, cachesProntos: comOffline.caches });
  assert.equal(await (await semRede.pedir(nav('/quimica/'))).text(), 'PAGINA-OFFLINE');
});

test('resposta de redirecionamento é copiada para uma resposta "limpa" antes de servir a uma navegação', async () => {
  const sw = carregar({ fetchImpl: async () => ok() });
  const c = await sw.caches.api(async () => ok()).open('quimica-shell-dev');
  const redirecionada = { redirected: true, status: 200, statusText: 'OK', headers: new Headers({ 'content-type': 'text/html' }), blob: async () => new Blob(['SHELL']), clone() { return this; } };
  await c.put('/quimica/', redirecionada);
  c.match = async () => redirecionada;
  const r = await sw.pedir({ url: `${ORIGEM}/quimica/`, mode: 'navigate' });
  assert.equal(r.redirected, false, 'uma navegação não pode ser respondida com resposta redirecionada');
  assert.equal(await r.text(), 'SHELL');
});

test('estático (JS, CSS, bibliotecas, fontes): serve do cache ignorando a query e só guarda respostas OK e básicas', async () => {
  const sw = carregar({ fetchImpl: async (url) => (url.includes('/ruim.js') ? new Response('x', { status: 404 }) : ok(`corpo:${url}`)) });
  const css = `${ORIGEM}/quimica/css/app.css`;
  assert.match(await (await sw.pedir({ url: `${css}?v=1` })).text(), /corpo:/);
  const n = sw.chamadasFetch.length;
  assert.match(await (await sw.pedir({ url: `${css}?v=2` })).text(), /corpo:/, 'segunda vez vem do cache, mesmo com outra query');
  assert.equal(sw.chamadasFetch.length, n, 'sem nova ida à rede');
  await sw.pedir({ url: `${ORIGEM}/quimica/js/ruim.js` });
  assert.equal(sw.cache('quimica-shell-dev')._m.has(`${ORIGEM}/quimica/js/ruim.js`), false, '404 não é guardado');
  await sw.pedir({ url: `${ORIGEM}/quimica/vendor/katex/katex.min.js` });
  assert.equal(sw.cache('quimica-shell-dev')._m.has(`${ORIGEM}/quimica/vendor/katex/katex.min.js`), true);
});

test('estático: resposta que não é "basic" (opaca/cors) é servida mas NÃO é guardada', async () => {
  const sw = carregar({ fetchImpl: async () => { const r = ok('de-outra-origem'); Object.defineProperty(r, 'type', { value: 'cors' }); return r; } });
  const url = `${ORIGEM}/quimica/js/terceiros.js`;
  assert.equal(await (await sw.pedir({ url })).text(), 'de-outra-origem');
  assert.equal(sw.cache('quimica-shell-dev')._m.has(url), false);
});

test('manifesto: stale-while-revalidate (serve o cache e atualiza em segundo plano)', async () => {
  let versao = 'A';
  const sw = carregar({ fetchImpl: async () => ok(`manifesto-${versao}`) });
  const url = `${ORIGEM}/quimica/data/manifest.json`;
  assert.equal(await (await sw.pedir({ url })).text(), 'manifesto-A', 'primeira vez: rede');
  versao = 'B';
  assert.equal(await (await sw.pedir({ url })).text(), 'manifesto-A', 'depois: o cache responde na hora');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(await (await sw.pedir({ url })).text(), 'manifesto-B', 'a atualização em segundo plano chegou ao cache');
});

test('manifesto: quando o app força a checagem (cache:reload) a rede vem primeiro e o cache só serve offline', async () => {
  let rede = true;
  let corpoAtual = 'manifesto-novo';
  const sw = carregar({ fetchImpl: async () => { if (!rede) throw new Error('offline'); return ok(corpoAtual); } });
  const url = `${ORIGEM}/quimica/data/manifest.sig`;
  assert.equal(await (await sw.pedir({ url, cache: 'reload' })).text(), 'manifesto-novo');
  corpoAtual = 'manifesto-mais-novo';
  assert.equal(await (await sw.pedir({ url, cache: 'reload' })).text(), 'manifesto-mais-novo', 'forçado: rede primeiro, mesmo com cache');
  rede = false;
  assert.equal(await (await sw.pedir({ url, cache: 'no-cache' })).text(), 'manifesto-mais-novo', 'offline: devolve o último que veio da rede');
  const vazio = carregar({ fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal((await vazio.pedir({ url, cache: 'reload' })).type, 'error', 'offline sem cache: erro de rede explícito');
});

test('manifesto: a chave do cache ignora a query (um cache-buster não duplica nem esconde a entrada)', async () => {
  const sw = carregar({ fetchImpl: async () => ok('m') });
  await sw.pedir({ url: `${ORIGEM}/quimica/data/manifest.json?t=123`, cache: 'reload' });
  assert.deepEqual([...sw.cache('quimica-dados-v1')._m.keys()], [`${ORIGEM}/quimica/data/manifest.json`]);
});

test('fatias versionadas (?v=sha256): cache-first e poda das versões antigas do MESMO arquivo; funciona offline com o que já foi baixado', async () => {
  let corpo = 'v1';
  let rede = true;
  const sw = carregar({ fetchImpl: async () => { if (!rede) throw new Error('offline'); return ok(corpo); } });
  const base = `${ORIGEM}/quimica/data/compostos/0001.json`;
  assert.equal(await (await sw.pedir({ url: `${base}?v=aaa` })).text(), 'v1');
  const n = sw.chamadasFetch.length;
  assert.equal(await (await sw.pedir({ url: `${base}?v=aaa` })).text(), 'v1');
  assert.equal(sw.chamadasFetch.length, n, 'mesma URL versionada: nunca volta à rede');
  rede = false;
  assert.equal(await (await sw.pedir({ url: `${base}?v=aaa` })).text(), 'v1', 'offline: o que já foi baixado continua disponível');
  rede = true;

  await sw.pedir({ url: `${ORIGEM}/quimica/data/elementos.json?v=el1` });
  corpo = 'v2';
  assert.equal(await (await sw.pedir({ url: `${base}?v=bbb` })).text(), 'v2', 'conteúdo novo = URL nova');
  const chaves = [...sw.cache('quimica-dados-v1')._m.keys()];
  assert.ok(chaves.includes(`${base}?v=bbb`));
  assert.ok(!chaves.includes(`${base}?v=aaa`), 'a versão antiga do lote foi podada');
  assert.ok(chaves.includes(`${ORIGEM}/quimica/data/elementos.json?v=el1`), 'outros arquivos não são tocados');
});

test('os marcadores do build existem no arquivo (se alguém os remover, o build para de injetar a versão e o pré-cache)', () => {
  for (const marcador of ["/*__BUILD__*/ 'dev'", '/*__PRECACHE__*/ []', '/*__PRECACHE_DADOS__*/ []']) assert.ok(FONTE.includes(marcador), marcador);
});
