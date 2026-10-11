/* SaibaTudo — service worker do portal (escopo /). Gerado por web/build.mjs (VERSAO e PRECACHE sao preenchidos no build).
 * As navegações para /eleicoes2026/ são do service worker do app (escopo mais específico) e passam direto aqui.
 * Nunca intercepta /api/*, /data/*, /quimica/* (outro projeto, servido por proxy, com service worker e dados assinados
 * próprios: cache-primeiro aqui prenderia JS e dados antigos) nem outros métodos além de GET. */
const VERSAO = /*__BUILD__*/ 'dev';
const PRECACHE = /*__PRECACHE__*/ [];
const CACHE = `st-site-${VERSAO}`;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('st-site-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const p = url.pathname;
  if (p.startsWith('/api/') || p.startsWith('/data/')) return;
  if (p === '/quimica' || p.startsWith('/quimica/')) return; // SaibaTudo Química: nada passa por este cache
  if (p.startsWith('/eleicoes2026/') && req.mode === 'navigate') return; // o app tem o próprio service worker
  if (req.mode === 'navigate') { event.respondWith(redeOuCache(event, req)); return; }
  event.respondWith(cacheOuRede(event, req));
});

/** Páginas: rede primeiro (conteúdo sempre atual), cache se estiver offline. */
async function redeOuCache(event, req) {
  const c = await caches.open(CACHE);
  try {
    const r = await fetch(req);
    if (r.ok) event.waitUntil(c.put(req, r.clone()));
    return r;
  } catch {
    return (await c.match(req, { ignoreSearch: true })) || (await c.match('/')) || Response.error();
  }
}

async function cacheOuRede(event, req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const r = await fetch(req);
    if (r.ok && r.type === 'basic') event.waitUntil(c.put(req, r.clone()));
    return r;
  } catch {
    return Response.error();
  }
}
