/* SaibaTudo Eleições 2026 — service worker (escopo /eleicoes2026/).
 *
 * As constantes VERSAO, PRECACHE e PRECACHE_DADOS (marcadores __BUILD__, __PRECACHE__ e __PRECACHE_DADOS__) sao preenchidas por
 * web/build.mjs; a versao e o hash do conteudo do app.
 *
 * Estratégias:
 *  - App shell (HTML/CSS/JS/ícones): pré-cache versionado; navegações devolvem o shell (SPA) e, sem rede nem cache, /offline.html.
 *  - Dados oficiais (/data/eleicoes2026/): manifest.json e manifest.sig em stale-while-revalidate (rede primeiro quando o app
 *    força a revalidação); fatias (candidatos/*, regras, pesquisas...) em cache-first VERSIONADO (?v=<sha256>): o conteúdo de uma URL
 *    nunca muda, e versões antigas do mesmo arquivo são podadas.
 *  - Fotos: cache com limite (as empacotadas e as do CDN do TSE, estas somente quando a resposta não é opaca).
 *  - NUNCA intercepta /api/* nem outros métodos além de GET; a apuração ao vivo (resultados.tse.jus.br/...json) vai direto à rede.
 */
const VERSAO = /*__BUILD__*/ 'dev';
const PRECACHE = /*__PRECACHE__*/ [];
const PRECACHE_DADOS = /*__PRECACHE_DADOS__*/ [];

const CACHE_SHELL = `st26-shell-${VERSAO}`;
const CACHE_DADOS = 'st26-dados-v1';
const CACHE_FOTOS = 'st26-fotos-v1';
const CACHE_FOTOS_TSE = 'st26-fotos-tse-v1';
const LIMITE_FOTOS = 500;
const LIMITE_FOTOS_TSE = 300;
const RAIZ_DADOS = '/data/eleicoes2026/';
// URLs "limpas" (cleanUrls): /eleicoes2026/index.html e /offline.html redirecionam, e uma resposta redirecionada não pode ser
// usada para responder a uma navegação.
const APP_SHELL = '/eleicoes2026/';
const OFFLINE = '/eleicoes2026/offline';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(CACHE_SHELL);
    await shell.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })));
    const dados = await caches.open(CACHE_DADOS);
    // pacote de dados do deploy (melhor esforço): permite abrir offline na primeira visita
    await Promise.allSettled(PRECACHE_DADOS.map((u) => dados.add(new Request(u, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith('st26-shell-') && k !== CACHE_SHELL) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/')) return; // nunca cachear a API
    if (req.mode === 'navigate') {
      if (/\.[a-z0-9]+$/i.test(url.pathname)) return; // arquivos reais (ex.: offline.html): rede normal
      event.respondWith(navegacao(req));
      return;
    }
    if (url.pathname.startsWith(RAIZ_DADOS)) { event.respondWith(dados(event, req, url)); return; }
    event.respondWith(estatico(event, req));
    return;
  }
  if (url.hostname === 'resultados.tse.jus.br' && req.destination === 'image' && url.pathname.includes('/fotos/')) {
    event.respondWith(fotoTse(event, req));
  }
  // demais origens (incluindo o JSON de apuração do TSE): sem interceptação
});

/** Resposta utilizável em navegações (se veio de um redirecionamento, copia o corpo para uma resposta "limpa"). */
async function limpa(r) {
  if (!r || !r.redirected) return r;
  return new Response(await r.blob(), { status: r.status, statusText: r.statusText, headers: r.headers });
}

async function navegacao(req) {
  const cache = await caches.open(CACHE_SHELL);
  const shell = await cache.match(APP_SHELL, { ignoreVary: true });
  if (shell) return limpa(shell);
  try { return await fetch(req); } catch {
    const off = await cache.match(OFFLINE);
    return off ? limpa(off) : Response.error();
  }
}

async function estatico(event, req) {
  const cache = await caches.open(CACHE_SHELL);
  const hit = await cache.match(req, { ignoreSearch: true, ignoreVary: true });
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') event.waitUntil(cache.put(req, res.clone()));
    return res;
  } catch {
    return Response.error();
  }
}

async function dados(event, req, url) {
  const caminho = url.pathname.slice(RAIZ_DADOS.length);
  const cache = await caches.open(CACHE_DADOS);

  if (caminho === 'manifest.json' || caminho === 'manifest.sig') {
    const chave = url.origin + url.pathname; // sem query
    const forcado = ['no-cache', 'reload', 'no-store'].includes(req.cache);
    if (forcado) { // o app está checando atualização: rede primeiro, cache só se estiver offline
      try {
        const r = await fetch(req);
        if (r.ok) event.waitUntil(cache.put(chave, r.clone()));
        return r;
      } catch {
        return (await cache.match(chave, { ignoreVary: true })) || Response.error();
      }
    }
    const hit = await cache.match(chave, { ignoreVary: true });
    const rede = fetch(req).then((r) => { if (r.ok) cache.put(chave, r.clone()); return r; }).catch(() => null);
    event.waitUntil(rede);
    return hit || (await rede) || Response.error();
  }

  if (caminho.startsWith('fotos/')) return fotoPacote(event, req);

  // fatias versionadas (?v=<sha256>): cache-first
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok) event.waitUntil((async () => { await cache.put(req, r.clone()); await podarVersoesAntigas(cache, url); })());
  return r;
}

/** Remove versões antigas do mesmo arquivo (mesmo caminho, outra query ?v=). */
async function podarVersoesAntigas(cache, url) {
  for (const k of await cache.keys()) {
    const u = new URL(k.url);
    if (u.pathname === url.pathname && u.search !== url.search) await cache.delete(k);
  }
}

async function aparar(cache, limite) {
  const chaves = await cache.keys();
  for (let i = 0; i < chaves.length - limite; i++) await cache.delete(chaves[i]); // mais antigas primeiro
}

async function fotoPacote(event, req) {
  const cache = await caches.open(CACHE_FOTOS);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok) event.waitUntil((async () => { await cache.put(req, r.clone()); await aparar(cache, LIMITE_FOTOS); })());
  return r;
}

/** Fotos do CDN do TSE: só são guardadas se o servidor permitir CORS (respostas opacas pesam muito na cota). */
async function fotoTse(event, req) {
  const cache = await caches.open(CACHE_FOTOS_TSE);
  const hit = await cache.match(req.url, { ignoreVary: true });
  if (hit) return hit;
  try {
    const r = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
    if (r.ok) event.waitUntil((async () => { await cache.put(req.url, r.clone()); await aparar(cache, LIMITE_FOTOS_TSE); })());
    return r;
  } catch {
    try { return await fetch(req); } catch { return Response.error(); }
  }
}
