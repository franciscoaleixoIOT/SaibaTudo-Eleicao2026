#!/usr/bin/env node
// Servidor estático mínimo para testar web/dist localmente (sem dependências), imitando o vercel.json:
//   cleanUrls, rewrite SPA de /quimica/* (rotas sem extensão → /quimica/index.html) e os cabeçalhos (CSP, Cache-Control...).
//
//   node web/serve.mjs            → http://localhost:4173/quimica/  (pasta web/dist)
//   PORT=8080 DIR=web/dist node web/serve.mjs
//
// /api/* responde 404 aqui (são funções serverless da Vercel, em /api na raiz do repositório).
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const aqui = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(aqui, '..');
const DIR = resolve(process.env.DIR ?? join(aqui, 'dist'));
const PORT = Number(process.env.PORT ?? process.argv[2] ?? 4173);

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.sig': 'text/plain; charset=utf-8'
};
const COMPRIMIVEL = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.svg', '.txt', '.sig', '.woff']);

// ---- cabeçalhos: lê o vercel.json (fonte → RegExp: "(.*)" casa qualquer coisa; o restante é literal)
const vercel = JSON.parse(readFileSync(join(RAIZ, 'vercel.json'), 'utf8'));
const esc = (s) => s.replace(/[.*+?^${}|[\]\\]/g, '\\$&');
const casaFonte = (fonte) => new RegExp('^' + fonte.split('(.*)').map(esc).join('.*') + '/?$');
const regrasCab = (vercel.headers ?? []).map((h) => ({ rx: casaFonte(h.source), headers: h.headers }));
// "/quimica/:path((?!.*\.).*)" → regex ^/quimica/(?!.*\.).*$ ; o destino vem do próprio rewrite
const rewrites = (vercel.rewrites ?? []).map((r) => ({ rx: new RegExp('^' + r.source.replace(/:[A-Za-z]+\((.*)\)$/, '$1') + '$'), destino: r.destination }));
const redirects = vercel.redirects ?? [];

function cabecalhos(caminho) {
  const out = {};
  for (const r of regrasCab) if (r.rx.test(caminho)) for (const h of r.headers) out[h.key] = h.value;
  return out;
}

function resolverArquivo(caminho) {
  const rel = normalize(decodeURIComponent(caminho)).replace(/^([/\\])+/, '');
  const abs = resolve(DIR, rel);
  if (abs !== DIR && !abs.startsWith(DIR + sep)) return null; // fuga de diretório
  const candidatos = [abs, abs + '.html', join(abs, 'index.html')];
  for (const c of candidatos) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

const cacheGz = new Map();
function responder(req, res, arquivo, status, caminhoCab) {
  const ext = extname(arquivo).toLowerCase();
  const corpo = readFileSync(arquivo);
  const h = { 'Content-Type': TIPOS[ext] ?? 'application/octet-stream', ...cabecalhos(caminhoCab) };
  let saida = corpo;
  if (COMPRIMIVEL.has(ext) && corpo.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
    const k = arquivo + ':' + statSync(arquivo).mtimeMs;
    if (!cacheGz.has(k)) cacheGz.set(k, gzipSync(corpo));
    saida = cacheGz.get(k);
    h['Content-Encoding'] = 'gzip';
    h.Vary = 'Accept-Encoding';
  }
  h['Content-Length'] = saida.length;
  res.writeHead(status, h);
  res.end(req.method === 'HEAD' ? undefined : saida);
}

const servidor = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let p = url.pathname;
  try {
    for (const r of redirects) {
      if (p === r.source) { res.writeHead(r.permanent ? 308 : 307, { Location: r.destination + url.search }); return res.end(); }
    }
    if (p.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': 'application/json', ...cabecalhos(p) });
      return res.end(JSON.stringify({ ok: false, erro: 'API indisponível no servidor local (função serverless da Vercel).' }));
    }
    // cleanUrls: /x.html → /x ; /pasta/index.html → /pasta/
    if (/\.html$/.test(p) && !p.endsWith('/offline.html')) {
      const limpo = p.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
      res.writeHead(308, { Location: limpo + url.search });
      return res.end();
    }
    let arq = resolverArquivo(p);
    if (!arq) { const rw = rewrites.find((r) => r.rx.test(p)); if (rw) arq = resolverArquivo(rw.destino); }
    if (!arq) {
      const nf = resolverArquivo('/404.html');
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', ...cabecalhos(p) });
      return res.end(nf ? readFileSync(nf) : '<!doctype html><meta charset="utf-8"><title>404</title><h1>404 — página não encontrada</h1>');
    }
    responder(req, res, arq, 200, p);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Erro interno: ' + e.message);
  }
});

if (!existsSync(DIR)) {
  console.error(`Pasta ${DIR} não existe. Rode antes: node web/build.mjs`);
  process.exit(1);
}
servidor.listen(PORT, () => console.log(`SaibaTudo (dist) em http://localhost:${PORT}  — pasta ${DIR}`));
