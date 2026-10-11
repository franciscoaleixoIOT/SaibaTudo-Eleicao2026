// Contratos entre os projetos do repositório único, no mesmo domínio (saibatudo.net):
// a home (portal/, Vercel saibatudo-portal), o dono do domínio (apps/eleicoes2026/vercel.json) e os apps servidos por proxy.
// Roda na raiz: node --test "tests/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const eleicoes = JSON.parse(readFileSync(join(RAIZ, 'apps/eleicoes2026/vercel.json'), 'utf8'));
const por = Object.fromEntries(eleicoes.rewrites.map((r) => [r.source, r.destination]));
const PORTAL = 'https://saibatudo-portal.vercel.app';
const QUIMICA = 'https://saibatudo-quimica.vercel.app';

test('a home vem do portal (proxy) e eleições não gera mais os arquivos da home', () => {
  for (const [origem, destino] of [['/', `${PORTAL}/`], ['/sw.js', `${PORTAL}/sw.js`], ['/manifest.webmanifest', `${PORTAL}/manifest.webmanifest`],
    ['/portal/:path*', `${PORTAL}/portal/:path*`]]) assert.equal(por[origem], destino, origem);
  for (const p of ['portal/src/index.html', 'portal/src/sw.js', 'portal/src/manifest.webmanifest']) assert.ok(existsSync(join(RAIZ, p)), p);
  // o sistema de arquivos vem antes das regras na Vercel: um index.html na raiz do site de eleições esconderia a home do portal
  for (const p of ['index.html', 'sw.js', 'manifest.webmanifest']) assert.ok(!existsSync(join(RAIZ, 'apps/eleicoes2026/web/src', p)), `eleições não pode ter ${p}`);
});

test('cada cartão da home tem rota: app do próprio domínio de eleições ou regra exata de proxy (a barra final é literal)', async () => {
  const { APPS } = await import(pathToFileURL(join(RAIZ, 'portal/src/portal/apps.js')).href);
  for (const app of APPS) assert.ok(app.url.startsWith('/eleicoes2026/') || por[app.url], `cartão ${app.id}: sem regra para ${app.url}`);
});

test('química: as três formas do endereço vão ao projeto de química', () => {
  assert.equal(por['/quimica'], `${QUIMICA}/quimica/`);
  assert.equal(por['/quimica/'], `${QUIMICA}/quimica/`);
  assert.equal(por['/quimica/:path*'], `${QUIMICA}/quimica/:path*`);
});

test('o service worker da home (escopo /) não intercepta nenhum app servido por proxy', () => {
  const sw = readFileSync(join(RAIZ, 'portal/src/sw.js'), 'utf8');
  const prefixos = [...new Set(eleicoes.rewrites.map((r) => r.source).filter((s) => /^\/[a-z0-9-]+\/:path\*$/.test(s)).map((s) => s.split('/')[1]))]
    .filter((p) => p !== 'portal');
  assert.ok(prefixos.includes('quimica'));
  for (const p of prefixos) assert.ok(sw.includes(`p.startsWith('/${p}/')`), `portal/src/sw.js precisa ignorar /${p}/`);
});
