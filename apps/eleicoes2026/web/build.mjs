#!/usr/bin/env node
// Gera web/dist (site estático + PWA) sem dependências npm.
//
//   node web/build.mjs
//
// Variáveis de ambiente (opcionais):
//   DATA_DIR      pasta do pacote de dados (padrão: data/eleicoes2026 na raiz do repositório)
//   OUT_DIR       pasta de saída (padrão: web/dist)
//   SKIP_VERIFY=1 não verifica checksums/assinatura do pacote (NÃO use em produção)
//
// O que faz: (1) copia web/src/** ; (2) copia os dados oficiais (manifest, regras, pesquisas, fontes, candidatos, resultados,
// fotos) para dist/data/eleicoes2026/ conferindo checksums e a assinatura do manifesto, e o contorno das UFs (data/geo/ufs.json)
// para dist/data/geo/; (3) copia ícones/brand e converte a fonte
// Poppins (OFL) para WOFF; (4) calcula o hash do conteúdo do app e gera build-info.js e os service workers versionados.
import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, gzipSync } from 'node:zlib';
import { minifyCss, minifyJs } from './tools/minify.mjs';

const aqui = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(aqui, '..');
const SRC = join(aqui, 'src');
const OUT = resolve(process.env.OUT_DIR ?? join(aqui, 'dist'));
const DADOS = resolve(process.env.DATA_DIR ?? join(RAIZ, 'data', 'eleicoes2026'));
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
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(SRC, OUT, { recursive: true });
log(`✔ web/src → ${relative(RAIZ, OUT)}`);

// minificação conservadora de JS/CSS (NO_MINIFY=1 desliga). Os service workers (sw.js) e build-info.js não passam por aqui.
if (process.env.NO_MINIFY !== '1') {
  let antes = 0;
  let depois = 0;
  for (const f of arquivos(OUT)) {
    const r = posix(relative(OUT, f));
    if (!/^(eleicoes2026\/(js|css)\/|assets\/).*\.(js|css)$/.test(r)) continue;
    const bruto = readFileSync(f, 'utf8');
    const min = r.endsWith('.css') ? minifyCss(bruto) : minifyJs(bruto);
    antes += Buffer.byteLength(bruto);
    depois += Buffer.byteLength(min);
    writeFileSync(f, min);
  }
  log(`✔ minificação JS/CSS: ${(antes / 1024).toFixed(0)} KB → ${(depois / 1024).toFixed(0)} KB`);
}

// ---------------------------------------------------------------------------------------------------- 2. dados oficiais
if (!existsSync(join(DADOS, 'manifest.json'))) falhar(`manifest.json não encontrado em ${DADOS}`);
const manifestBytes = readFileSync(join(DADOS, 'manifest.json'));
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const DESTINO_DADOS = join(OUT, 'data', 'eleicoes2026');

if (!SKIP_VERIFY) {
  // assinatura ECDSA P-256/SHA-256 (DER) do manifesto
  if (existsSync(PUB_KEY) && existsSync(join(DADOS, 'manifest.sig'))) {
    const chave = createPublicKey({ key: Buffer.from(readFileSync(PUB_KEY, 'utf8').trim(), 'base64'), format: 'der', type: 'spki' });
    const sig = Buffer.from(readFileSync(join(DADOS, 'manifest.sig'), 'utf8').trim(), 'base64');
    if (!cryptoVerify('sha256', manifestBytes, { key: chave, dsaEncoding: 'der' }, sig)) falhar('assinatura do manifesto INVÁLIDA (pipeline/data_signing_public.b64)');
    log('✔ assinatura do manifesto verificada');
  } else {
    log('! assinatura não verificada (chave pública ou manifest.sig ausentes)');
  }
  // checksums e tamanhos de todos os arquivos listados no manifesto
  for (const a of manifest.arquivos) {
    const f = join(DADOS, ...a.path.split('/'));
    if (!existsSync(f)) falhar(`arquivo do manifesto ausente: ${a.path}`);
    const b = readFileSync(f);
    if (b.length !== a.bytes) falhar(`tamanho divergente em ${a.path}`);
    if (sha256(b) !== a.sha256) falhar(`sha256 divergente em ${a.path}`);
  }
  log(`✔ ${manifest.arquivos.length} arquivos conferem com o manifesto (sha256 e bytes)`);
}

let nDados = 0;
for (const p of ['manifest.json', 'manifest.sig', 'regras.json', 'pesquisas.json', 'fontes.json']) {
  if (existsSync(join(DADOS, p))) { copiar(join(DADOS, p), join(DESTINO_DADOS, p)); nDados++; }
}
for (const sub of ['candidatos', 'resultados', 'fotos']) {
  const d = join(DADOS, sub);
  if (!existsSync(d)) continue;
  for (const f of arquivos(d)) { copiar(f, join(DESTINO_DADOS, sub, relative(d, f))); nDados++; }
}
log(`✔ dados oficiais: ${nDados} arquivos (dataVersion ${manifest.dataVersion})`);

// contorno das UFs (malha do IBGE) para SUGERIR o estado pela localização aproximada: o cálculo é feito no aparelho
// (js/geo.js). Baixado sob demanda (fora do pré-cache do service worker) e copiado byte a byte.
const GEO_UFS = join(RAIZ, 'data', 'geo', 'ufs.json');
if (!existsSync(GEO_UFS)) falhar('data/geo/ufs.json ausente (gere com: python pipeline/geo_ufs.py)');
{
  let geo;
  try { geo = JSON.parse(readFileSync(GEO_UFS, 'utf8')); } catch (e) { falhar(`data/geo/ufs.json inválido: ${e.message}`); }
  const ufs = Object.keys(geo?.ufs ?? {});
  if (ufs.length !== 27 || !ufs.every((u) => Array.isArray(geo.ufs[u]) && geo.ufs[u].length > 0)) falhar(`data/geo/ufs.json: esperadas 27 UFs com contorno, vieram ${ufs.length}`);
  copiar(GEO_UFS, join(OUT, 'data', 'geo', 'ufs.json'));
  log(`✔ contorno das UFs (IBGE) → data/geo/ufs.json (${(statSync(GEO_UFS).size / 1024).toFixed(0)} KB)`);
}

// ---------------------------------------------------------------------------------------------------- 3. brand e fontes
const pngs = join(BRAND, 'png');
let nBrand = 0;
if (existsSync(pngs)) {
  for (const f of readdirSync(pngs)) {
    if (/^(pwa-|apple-touch-icon-|favicon-)/.test(f) || f === 'og-symbol-1200.png') { copiar(join(pngs, f), join(OUT, 'brand', f)); nBrand++; }
  }
}
const svgs = join(BRAND, 'svg');
if (existsSync(svgs)) {
  for (const f of readdirSync(svgs)) {
    if (f.endsWith('.svg') && !f.includes('feature-graphic')) { copiar(join(svgs, f), join(OUT, 'brand', 'svg', f)); nBrand++; }
  }
}
log(`✔ brand: ${nBrand} arquivos`);

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

// ---------------------------------------------------------------------------------------------------- 4. versão e service workers
const SEM_HASH = new Set(['sw.js', 'eleicoes2026/sw.js', 'eleicoes2026/js/build-info.js']);
const hash = createHash('sha256');
const lista = [...arquivos(OUT)].map((f) => posix(relative(OUT, f))).filter((r) => !r.startsWith('data/') && !SEM_HASH.has(r)).sort();
for (const r of lista) hash.update(r).update('\0').update(readFileSync(join(OUT, ...r.split('/')))).update('\0');
const BUILD = hash.digest('hex').slice(0, 12);

writeFileSync(join(OUT, 'eleicoes2026', 'js', 'build-info.js'),
  `// Gerado por web/build.mjs — hash do conteúdo do app (sem timestamp: a build é reproduzível).\nexport const BUILD = ${JSON.stringify(BUILD)};\nexport const DATA_VERSION = ${JSON.stringify(manifest.dataVersion)};\n`);

/** URL "limpa" (cleanUrls): index.html → pasta/ ; x.html → /x (evita redirecionamentos no cache do service worker). */
const url = (r) => '/' + (r.endsWith('/index.html') ? r.slice(0, -'index.html'.length) : r.endsWith('.html') ? r.slice(0, -'.html'.length) : r);
const existe = (r) => existsSync(join(OUT, ...r.split('/')));
const dataUrl = (a) => `/data/eleicoes2026/${a.path}?v=${a.sha256.slice(0, 16)}`;

const shellApp = [...lista.filter((r) => r.startsWith('eleicoes2026/') && r !== 'eleicoes2026/sw.js').map(url),
  ...['assets/base.css', 'assets/theme-init.js', 'fonts/poppins-semibold.woff', 'brand/svg/eleicoes2026-icon.svg', 'brand/favicon-32.png', 'brand/favicon-48.png',
    'brand/apple-touch-icon-180.png', 'brand/pwa-eleicoes2026-192.png', 'brand/pwa-eleicoes2026-512.png'].filter(existe).map(url), '/eleicoes2026/js/build-info.js']
  .filter((u, i, a) => a.indexOf(u) === i);
const dadosApp = ['/data/eleicoes2026/manifest.json', '/data/eleicoes2026/manifest.sig',
  ...['regras.json', 'fontes.json', 'candidatos/BR.json'].map((p) => manifest.arquivos.find((a) => a.path === p)).filter(Boolean).map(dataUrl)];
// A home (/, /sw.js da raiz, /manifest.webmanifest) é o projeto portal/ (Vercel saibatudo-portal), encaminhado por proxy.

function preencherSw(arq, subs) {
  const f = join(OUT, ...arq.split('/'));
  let s = readFileSync(f, 'utf8');
  s = s.replace(/\/\*__BUILD__\*\/\s*'dev'/, JSON.stringify(BUILD));
  for (const [nome, valor] of Object.entries(subs)) {
    const rx = new RegExp(`/\\*__${nome}__\\*/\\s*\\[\\]`);
    if (!rx.test(s)) falhar(`marcador ${nome} ausente em ${arq}`);
    s = s.replace(rx, JSON.stringify(valor, null, 2));
  }
  if (s.includes('/*__BUILD__*/')) falhar(`marcador BUILD não substituído em ${arq}`);
  writeFileSync(f, s);
}
preencherSw('eleicoes2026/sw.js', { PRECACHE: shellApp, PRECACHE_DADOS: dadosApp });

// ---------------------------------------------------------------------------------------------------- resumo
const soma = (filtro) => {
  let bruto = 0; let gz = 0;
  for (const r of lista) if (filtro(r)) { const b = readFileSync(join(OUT, ...r.split('/'))); bruto += b.length; gz += gzipSync(b).length; }
  return `${(bruto / 1024).toFixed(1)} KB (gzip ${(gz / 1024).toFixed(1)} KB)`;
};
const appJsCss = (r) => /^(eleicoes2026\/(js|css)\/|assets\/base\.css)/.test(r) && /\.(js|css)$/.test(r);
log(`\nBuild ${BUILD} concluída em ${relative(RAIZ, OUT) || '.'}`);
log(`  JS+CSS do app (sem dados): ${soma(appJsCss)}`);
let total = 0;
for (const f of arquivos(OUT)) total += statSync(f).size;
log(`  Tamanho total de dist:     ${(total / 1048576).toFixed(1)} MB`);

// Aviso (não falha o build): a política de privacidade só pode ser divulgada com o e-mail de contato preenchido
try {
  const priv = readFileSync(join(OUT, 'privacidade', 'index.html'), 'utf8');
  if (priv.includes('E-MAIL DE CONTATO')) {
    log('  ⚠ PENDENTE: preencha o e-mail de contato em docs/PRIVACIDADE.md e em web/src/privacidade/index.html antes de divulgar.');
  }
} catch { /* página ausente: ignorado */ }
