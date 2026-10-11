/* SaibaTudo Química — service worker (escopo /quimica/).
 *
 * As constantes VERSAO, PRECACHE e PRECACHE_DADOS (marcadores __BUILD__, __PRECACHE__ e __PRECACHE_DADOS__) são preenchidas por
 * web/build.mjs; a versão é o hash do conteúdo do app.
 *
 * Estratégias:
 *  - App shell (HTML/CSS/JS/ícones/bibliotecas): pré-cache versionado; navegações devolvem o shell (SPA) — exceto páginas estáticas
 *    pré-cacheadas (ex.: /quimica/privacidade) — e, sem rede nem cache, /quimica/offline.
 *  - Dados (/quimica/data/): manifest.json e manifest.sig em stale-while-revalidate (rede primeiro quando o app força a revalidação);
 *    fatias (elementos, regras, lotes de compostos, textos...) em cache-first VERSIONADO (?v=<sha256>): o conteúdo de uma URL nunca
 *    muda, e versões antigas do mesmo arquivo são podadas. Offline funciona com o que já foi baixado.
 *  - NUNCA intercepta /api/*, /quimica/api/* nem outros métodos além de GET.
 */
const VERSAO = /*__BUILD__*/ 'dev';
const PRECACHE = /*__PRECACHE__*/ [];
const PRECACHE_DADOS = /*__PRECACHE_DADOS__*/ [];

const CACHE_SHELL = `quimica-shell-${VERSAO}`;
const CACHE_DADOS = 'quimica-dados-v1';
const RAIZ_DADOS = '/quimica/data/';
// URLs "limpas" (cleanUrls): /quimica/index.html e /offline.html redirecionam, e uma resposta redirecionada não pode responder a uma navegação.
const APP_SHELL = '/quimica/';
const OFFLINE = '/quimica/offline';

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
      if (k.startsWith('quimica-shell-') && k !== CACHE_SHELL) await caches.delete(k);
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
  if (url.origin !== self.location.origin) return; // outras origens: sem interceptação
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/quimica/api/')) return; // nunca cachear a API
  if (req.mode === 'navigate') {
    if (/\.[a-z0-9]+$/i.test(url.pathname)) return; // arquivos reais (ex.: offline.html): rede normal
    event.respondWith(navegacao(req, url));
    return;
  }
  if (url.pathname.startsWith(RAIZ_DADOS)) { event.respondWith(dados(event, req, url)); return; }
  event.respondWith(estatico(event, req));
});

/** Resposta utilizável em navegações (se veio de um redirecionamento, copia o corpo para uma resposta "limpa"). */
async function limpa(r) {
  if (!r || !r.redirected) return r;
  return new Response(await r.blob(), { status: r.status, statusText: r.statusText, headers: r.headers });
}

async function navegacao(req, url) {
  const cache = await caches.open(CACHE_SHELL);
  const caminho = url.pathname.replace(/\/+$/, '') || '/';
  // página estática pré-cacheada (ex.: /quimica/privacidade): serve exatamente ela
  if (caminho !== APP_SHELL.replace(/\/+$/, '') && caminho !== OFFLINE) {
    const exata = await cache.match(url.origin + url.pathname, { ignoreSearch: true, ignoreVary: true })
      ?? await cache.match(url.origin + caminho, { ignoreSearch: true, ignoreVary: true }); // "/quimica/privacidade/" = "/quimica/privacidade"
    if (exata) return limpa(exata);
  }
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
