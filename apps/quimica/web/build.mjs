#!/usr/bin/env node
// Gera web/dist (site estático + PWA em /quimica/) sem dependências npm.
//
//   node web/build.mjs
//
// Variáveis de ambiente (opcionais):
//   DATA_DIR      pasta do pacote de dados (padrão: data/quimica na raiz do repositório)
//   OUT_DIR       pasta de saída (padrão: web/dist)
//   SKIP_VERIFY=1 não verifica checksums/assinatura do pacote (NÃO use em produção)
//   NO_MINIFY=1   não minifica JS/CSS
//
// O que faz: (1) copia web/src/quimica/** para dist/quimica/ ; (2) copia o pacote de dados para dist/quimica/data/ conferindo tamanho, SHA-256
// e a assinatura ECDSA do manifesto com pipeline/data_signing_public.b64 ; (3) copia ícones/marca e converte a fonte Poppins (OFL) para WOFF ;
// (4) calcula o hash do conteúdo do app e gera build-info.js e o service worker versionado (pré-cache do app e dos dados essenciais).
// Todos os caminhos publicados começam em /quimica/ (o projeto é servido assim, direto ou por rewrite de saibatudo.net).
import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, gzipSync } from 'node:zlib';
import { minifyCss, minifyJs } from './tools/minify.mjs';

const aqui = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(aqui, '..');
const SRC = join(aqui, 'src');
const OUT_RAIZ = resolve(process.env.OUT_DIR ?? join(aqui, 'dist'));
const OUT = join(OUT_RAIZ, 'quimica');
const DADOS = resolve(process.env.DATA_DIR ?? join(RAIZ, 'data', 'quimica'));
const BRAND = join(RAIZ, 'brand');
const PUB_KEY = join(RAIZ, 'pipeline', 'data_signing_public.b64');
const SKIP_VERIFY = process.env.SKIP_VERIFY === '1';

const posix = (p) => p.split(sep).join('/');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const falhar = (msg) => { console.error(`\nERRO: ${msg}`); process.exit(1); };
const log = (msg) => console.log(msg);

function* arquivos(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* arquivos(p);
    else yield p;
  }
}
const copiar = (de, para) => { mkdirSync(dirname(para), { recursive: true }); copyFileSync(de, para); };

// ---------------------------------------------------------------------------------------------------- 1. limpeza e src
rmSync(OUT_RAIZ, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(join(SRC, 'quimica'), OUT, { recursive: true });
log(`✔ web/src/quimica → ${relative(RAIZ, OUT)}`);

// minificação conservadora de JS/CSS (NO_MINIFY=1 desliga). sw.js, build-info.js e vendor/ não passam por aqui.
if (process.env.NO_MINIFY !== '1') {
  let antes = 0;
  let depois = 0;
  for (const f of arquivos(OUT)) {
    const r = posix(relative(OUT, f));
    if (!/^(js|css)\/.*\.(js|css)$/.test(r) || r === 'js/build-info.js' || r === 'js/theme-init.js') continue;
    const bruto = readFileSync(f, 'utf8');
    const min = r.endsWith('.css') ? minifyCss(bruto) : minifyJs(bruto);
    antes += Buffer.byteLength(bruto);
    depois += Buffer.byteLength(min);
    writeFileSync(f, min);
  }
  log(`✔ minificação JS/CSS: ${(antes / 1024).toFixed(0)} KB → ${(depois / 1024).toFixed(0)} KB`);
}

// ---------------------------------------------------------------------------------------------------- 2. pacote de dados
if (!existsSync(join(DADOS, 'manifest.json'))) {
  falhar(`manifest.json não encontrado em ${DADOS}. Gere o pacote real (pipeline) ou use o de teste: DATA_DIR=web/test/fixtures/data-quimica node web/build.mjs`);
}
const manifestBytes = readFileSync(join(DADOS, 'manifest.json'));
const manifest = JSON.parse(manifestBytes.toString('utf8'));
/** `files` ({caminho: {bytes, sha256}}) do contrato, ou `arquivos` (lista). */
const listaArquivos = manifest.files && !Array.isArray(manifest.files)
  ? Object.entries(manifest.files).map(([path, v]) => ({ path, bytes: v.bytes, sha256: v.sha256 }))
  : (manifest.files ?? manifest.arquivos ?? []).map((a) => ({ path: a.path, bytes: a.bytes, sha256: a.sha256 }));
const dataVersion = String(manifest.version ?? manifest.dataVersion ?? '');
if (!listaArquivos.length || !dataVersion) falhar('manifesto sem version ou sem arquivos');
for (const a of listaArquivos) {
  if (typeof a.path !== 'string' || a.path.startsWith('/') || a.path.includes('..') || a.path.includes('\\')) falhar(`caminho inválido no manifesto: ${a.path}`);
}
const DESTINO_DADOS = join(OUT, 'data');

if (!SKIP_VERIFY) {
  // assinatura ECDSA P-256/SHA-256 (DER) do manifesto
  if (existsSync(PUB_KEY) && existsSync(join(DADOS, 'manifest.sig'))) {
    const chave = createPublicKey({ key: Buffer.from(readFileSync(PUB_KEY, 'utf8').trim(), 'base64'), format: 'der', type: 'spki' });
    const sig = Buffer.from(readFileSync(join(DADOS, 'manifest.sig'), 'utf8').trim(), 'base64');
    if (!cryptoVerify('sha256', manifestBytes, { key: chave, dsaEncoding: 'der' }, sig)) falhar('assinatura do manifesto INVÁLIDA (pipeline/data_signing_public.b64)');
    log('✔ assinatura do manifesto verificada');
  } else {
    falhar('assinatura não verificável: faltam pipeline/data_signing_public.b64 ou manifest.sig (use SKIP_VERIFY=1 só em testes locais)');
  }
  // checksums e tamanhos de todos os arquivos listados no manifesto
  for (const a of listaArquivos) {
    const f = join(DADOS, ...a.path.split('/'));
    if (!existsSync(f)) falhar(`arquivo do manifesto ausente: ${a.path}`);
    const b = readFileSync(f);
    if (b.length !== a.bytes) falhar(`tamanho divergente em ${a.path}`);
    if (sha256(b) !== a.sha256) falhar(`sha256 divergente em ${a.path}`);
  }
  log(`✔ ${listaArquivos.length} arquivos conferem com o manifesto (sha256 e bytes)`);
}

let nDados = 0;
for (const p of ['manifest.json', 'manifest.sig']) {
  if (existsSync(join(DADOS, p))) { copiar(join(DADOS, p), join(DESTINO_DADOS, p)); nDados++; }
}
for (const a of listaArquivos) {
  const f = join(DADOS, ...a.path.split('/'));
  if (existsSync(f)) { copiar(f, join(DESTINO_DADOS, ...a.path.split('/'))); nDados++; }
}
log(`✔ dados: ${nDados} arquivos (versão ${dataVersion})`);

// ---------------------------------------------------------------------------------------------------- 3. marca e fontes
const pngs = join(BRAND, 'png');
let nBrand = 0;
if (existsSync(pngs)) {
  for (const f of readdirSync(pngs)) {
    if (/^(pwa-quimica-|favicon-|apple-touch-icon-180\.png$|og-quimica-)/.test(f)) { copiar(join(pngs, f), join(OUT, 'brand', f)); nBrand++; }
  }
}
for (const f of ['quimica-icon.svg', 'saibatudo-symbol.svg']) {
  if (existsSync(join(BRAND, f))) { copiar(join(BRAND, f), join(OUT, 'brand', f)); nBrand++; }
}
log(`✔ brand: ${nBrand} arquivos`);
if (!existsSync(join(OUT, 'brand', 'pwa-quimica-512.png'))) log('! brand/png/pwa-quimica-512.png ausente: rode node web/tools/gerar_icones.mjs');

/** TTF → WOFF 1.0 (cada tabela comprimida com zlib). Sem dependências. */
function ttfParaWoff(ttf) {
  const numTables = ttf.readUInt16BE(4);
  const tabelas = [];
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    const tag = ttf.subarray(o, o + 4);
    const checksum = ttf.readUInt32BE(o + 4);
    const offset = ttf.readUInt32BE(o + 8);
    const length = ttf.readUInt32BE(o + 12);
    const dados = ttf.subarray(offset, offset + length);
    const comp = deflateSync(dados, { level: 9 });
    tabelas.push({ tag, checksum, length, dados: comp.length < length ? comp : dados, compLength: Math.min(comp.length, length) });
  }
  tabelas.sort((a, b) => Buffer.compare(a.tag, b.tag));
  const pad4 = (n) => (n + 3) & ~3;
  let off = 44 + numTables * 20;
  const dir = Buffer.alloc(numTables * 20);
  const partes = [];
  let totalSfnt = 12 + numTables * 16;
  tabelas.forEach((t, i) => {
    t.tag.copy(dir, i * 20);
    dir.writeUInt32BE(off, i * 20 + 4);
    dir.writeUInt32BE(t.compLength, i * 20 + 8);
    dir.writeUInt32BE(t.length, i * 20 + 12);
    dir.writeUInt32BE(t.checksum, i * 20 + 16);
    const bloco = Buffer.alloc(pad4(t.compLength));
    t.dados.copy(bloco);
    partes.push(bloco);
    off += bloco.length;
    totalSfnt += pad4(t.length);
  });
  const cab = Buffer.alloc(44);
  cab.write('wOFF', 0, 'latin1');
  ttf.copy(cab, 4, 0, 4); // flavor (versão do sfnt)
  cab.writeUInt32BE(off, 8); // tamanho total do WOFF
  cab.writeUInt16BE(numTables, 12);
  cab.writeUInt32BE(totalSfnt, 16);
  return Buffer.concat([cab, dir, ...partes]);
}
const fonteTtf = join(BRAND, 'fonts', 'Poppins-SemiBold.ttf');
if (existsSync(fonteTtf)) {
  mkdirSync(join(OUT, 'fonts'), { recursive: true });
  const woff = ttfParaWoff(readFileSync(fonteTtf));
  writeFileSync(join(OUT, 'fonts', 'poppins-semibold.woff'), woff);
  if (existsSync(join(BRAND, 'fonts', 'OFL.txt'))) copiar(join(BRAND, 'fonts', 'OFL.txt'), join(OUT, 'fonts', 'OFL.txt'));
  log(`✔ fonte Poppins SemiBold (OFL) → WOFF (${(woff.length / 1024).toFixed(0)} KB)`);
} else {
  log('! brand/fonts/Poppins-SemiBold.ttf ausente: o site usará a fonte do sistema');
}

// ---------------------------------------------------------------------------------------------------- 4. versão e service worker
const SEM_HASH = new Set(['sw.js', 'js/build-info.js']);
const hash = createHash('sha256');
const lista = [...arquivos(OUT)].map((f) => posix(relative(OUT, f))).filter((r) => !r.startsWith('data/') && !SEM_HASH.has(r)).sort();
for (const r of lista) hash.update(r).update('\0').update(readFileSync(join(OUT, ...r.split('/')))).update('\0');
const BUILD = hash.digest('hex').slice(0, 12);

writeFileSync(join(OUT, 'js', 'build-info.js'),
  `// Gerado por web/build.mjs — hash do conteúdo do app (sem timestamp: a build é reproduzível).\nexport const BUILD = ${JSON.stringify(BUILD)};\nexport const DATA_VERSION = ${JSON.stringify(dataVersion)};\n`);

/** URL "limpa" (cleanUrls): quimica/index.html → /quimica/ ; quimica/x/index.html → /quimica/x ; x.html → /quimica/x. */
const url = (r) => {
  if (r === 'index.html') return '/quimica/';
  if (r.endsWith('/index.html')) return `/quimica/${r.slice(0, -'/index.html'.length)}`;
  if (r.endsWith('.html')) return `/quimica/${r.slice(0, -'.html'.length)}`;
  return `/quimica/${r}`;
};
const dataUrl = (a) => `/quimica/data/${a.path}?v=${a.sha256.slice(0, 16)}`;

const shell = [...lista.filter((r) => r !== 'sw.js' && !/^brand\/og-/.test(r) && !r.endsWith('.map')).map(url), '/quimica/js/build-info.js']
  .filter((u, i, a) => a.indexOf(u) === i);
const essenciais = ['elementos.json', 'regras.json', 'constantes.json', 'fontes.json', 'compostos/index.json'];
const dadosApp = ['/quimica/data/manifest.json', '/quimica/data/manifest.sig',
  ...essenciais.map((p) => listaArquivos.find((a) => a.path === p)).filter(Boolean).map(dataUrl)];

{
  const f = join(OUT, 'sw.js');
  let s = readFileSync(f, 'utf8');
  s = s.replace(/\/\*__BUILD__\*\/\s*'dev'/, JSON.stringify(BUILD));
  for (const [nome, valor] of Object.entries({ PRECACHE: shell, PRECACHE_DADOS: dadosApp })) {
    const rx = new RegExp(`/\\*__${nome}__\\*/\\s*\\[\\]`);
    if (!rx.test(s)) falhar(`marcador ${nome} ausente em sw.js`);
    s = s.replace(rx, JSON.stringify(valor, null, 2));
  }
  if (s.includes('/*__BUILD__*/')) falhar('marcador BUILD não substituído em sw.js');
  writeFileSync(f, s);
}

// ---------------------------------------------------------------------------------------------------- resumo
const soma = (filtro) => {
  let bruto = 0; let gz = 0;
  for (const r of lista) if (filtro(r)) { const b = readFileSync(join(OUT, ...r.split('/'))); bruto += b.length; gz += gzipSync(b).length; }
  return `${(bruto / 1024).toFixed(1)} KB (gzip ${(gz / 1024).toFixed(1)} KB)`;
};
log(`\nBuild ${BUILD} concluída em ${relative(RAIZ, OUT_RAIZ) || '.'}`);
log(`  JS+CSS do app (sem bibliotecas nem dados): ${soma((r) => /^(js|css)\//.test(r) && /\.(js|css)$/.test(r))}`);
log(`  Bibliotecas (KaTeX, SmilesDrawer, GHS):    ${soma((r) => r.startsWith('vendor/'))}`);
let total = 0;
for (const f of arquivos(OUT_RAIZ)) total += statSync(f).size;
log(`  Tamanho total de dist:                      ${(total / 1048576).toFixed(1)} MB`);
