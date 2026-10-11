// Service worker do portal (web/src/sw.js, escopo /): o ARQUIVO REAL num ambiente simulado. Ele atende a home com cache;
// o SaibaTudo Química (/quimica/*, servido por proxy de outro projeto) tem service worker e dados assinados próprios e nunca
// pode passar por este cache (cache-primeiro com ignoreSearch prenderia JS e manifesto antigos).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { RAIZ } from './support.mjs';

const ORIGEM = 'https://saibatudo.net';
const FONTE = readFileSync(resolve(RAIZ, 'web/src/sw.js'), 'utf8');

/** Carrega o sw.js do portal e devolve intercepta(url, modo) → true se o SW chamou respondWith. */
function carregar() {
  const manipuladores = {};
  const self = {
    location: new URL(ORIGEM),
    addEventListener: (tipo, fn) => { manipuladores[tipo] = fn; },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const caches = { open: async () => ({ match: async () => undefined, put: async () => {} }), keys: async () => [], delete: async () => true };
  const fetch = async () => new Response('ok');
  vm.runInNewContext(FONTE, { self, caches, fetch, Response, Request, URL, Promise, console }, { filename: 'sw.js' });
  return (url, mode = 'cors') => {
    let interceptou = false;
    manipuladores.fetch({
      request: { url: new URL(url, ORIGEM).href, mode, method: 'GET' },
      respondWith: (p) => { interceptou = true; p.catch(() => {}); },
      waitUntil: () => {},
    });
    return interceptou;
  };
}

test('portal: NUNCA intercepta o SaibaTudo Química (/quimica/*), nem páginas nem arquivos nem dados', () => {
  const intercepta = carregar();
  for (const u of ['/quimica', '/quimica/', '/quimica/tabela', '/quimica/js/main.js', '/quimica/data/manifest.json',
    '/quimica/data/compostos/index.json', '/quimica/api/health', '/quimica/sw.js']) {
    assert.equal(intercepta(u), false, u);
    assert.equal(intercepta(u, 'navigate'), false, `${u} (navegação)`);
  }
});

test('portal: continua atendendo a home e respeitando /api/, /data/ e as navegações de /eleicoes2026/', () => {
  const intercepta = carregar();
  assert.equal(intercepta('/', 'navigate'), true);
  assert.equal(intercepta('/assets/home.js'), true);
  assert.equal(intercepta('/api/health'), false);
  assert.equal(intercepta('/data/eleicoes2026/manifest.json'), false);
  assert.equal(intercepta('/eleicoes2026/', 'navigate'), false);
  assert.equal(intercepta('/quimicax/arquivo.js'), true, 'só o prefixo exato /quimica/ fica de fora');
});
