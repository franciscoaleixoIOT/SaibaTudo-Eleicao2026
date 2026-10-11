// Gera portal/dist (a home de saibatudo.net) sem dependências npm: copia src/ e preenche o service worker com a versão
// (hash do conteúdo, build reproduzível) e a lista de pré-cache.
//
//   node build.mjs            OUT_DIR (opcional) = pasta de saída; padrão portal/dist
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const SRC = join(aqui, 'src');
const OUT = resolve(process.env.OUT_DIR ?? join(aqui, 'dist'));
const posix = (p) => p.split(sep).join('/');
function* arquivos(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* arquivos(p); else yield p;
  }
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(SRC, OUT, { recursive: true });

// Fora do pré-cache: o próprio service worker, a licença da fonte, a imagem grande de compartilhamento e os ícones maskable
const FORA = new Set(['sw.js', 'portal/fonts/OFL.txt', 'portal/brand/og-symbol-1200.png']);
const lista = [...arquivos(OUT)].map((f) => posix(relative(OUT, f))).sort();
const hash = createHash('sha256');
for (const r of lista.filter((x) => x !== 'sw.js')) hash.update(r).update('\0').update(readFileSync(join(OUT, ...r.split('/')))).update('\0');
const VERSAO = hash.digest('hex').slice(0, 12);
const url = (r) => (r === 'index.html' ? '/' : '/' + r);
const PRECACHE = lista.filter((r) => !FORA.has(r) && !r.includes('maskable')).map(url);

const swArq = join(OUT, 'sw.js');
let sw = readFileSync(swArq, 'utf8');
for (const [rx, valor] of [[/\/\*__BUILD__\*\/\s*'dev'/, JSON.stringify(VERSAO)], [/\/\*__PRECACHE__\*\/\s*\[\]/, JSON.stringify(PRECACHE, null, 2)]]) {
  if (!rx.test(sw)) { console.error(`✖ marcador ausente em sw.js: ${rx}`); process.exit(1); }
  sw = sw.replace(rx, valor);
}
writeFileSync(swArq, sw);

let total = 0;
for (const f of arquivos(OUT)) total += statSync(f).size;
console.log(`✔ portal ${VERSAO}: ${lista.length} arquivos, ${PRECACHE.length} no pré-cache, ${(total / 1024).toFixed(0)} KB em ${posix(relative(aqui, OUT)) || '.'}`);
