// Build (web/build.mjs), minificação, service worker gerado, servidor local e vercel.json. O build usa o pacote de teste (DATA_DIR) assinado.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { DADOS, RAIZ } from './support.mjs';

const aqui = dirname(fileURLToPath(import.meta.url));
const BUILD = resolve(aqui, '../build.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'stq-build-'));
const OUT = join(tmp, 'dist');
const OUT2 = join(tmp, 'dist2');
const Q = (base = OUT) => join(base, 'quimica');
const roda = (out, env = {}) => execFileSync(process.execPath, [BUILD], { env: { ...process.env, DATA_DIR: DADOS, OUT_DIR: out, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

before(() => { roda(OUT); });
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* arquivos em uso no Windows */ } });

const ler = (p, base = OUT) => readFileSync(join(Q(base), ...p.split('/')), 'utf8');
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const vercel = JSON.parse(readFileSync(join(RAIZ, 'vercel.json'), 'utf8'));
const jsDe = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? jsDe(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : []);

test('estrutura de dist: tudo sob /quimica/ (páginas, manifesto, service worker, marca, fonte, bibliotecas e dados)', () => {
  for (const p of ['index.html', 'offline.html', 'privacidade/index.html', 'manifest.webmanifest', 'sw.js', 'css/base.css', 'css/app.css', 'js/main.js', 'js/nlu.js', 'js/seguranca.js',
    'js/answers.js', 'js/engine.js', 'js/data.js', 'js/verify.js', 'js/calc/balancear.js', 'js/ui/calculadoras.js', 'js/build-info.js', 'js/theme-init.js',
    'vendor/katex/katex.min.js', 'vendor/katex/katex.min.css', 'vendor/katex/LICENSE', 'vendor/katex/fonts/KaTeX_Main-Regular.woff2', 'vendor/smiles-drawer/smiles-drawer.min.js', 'vendor/smiles-drawer/LICENSE',
    'vendor/ghs/ghs05.svg', 'vendor/VENDOR.md', 'fonts/poppins-semibold.woff', 'fonts/OFL.txt',
    'brand/pwa-quimica-192.png', 'brand/pwa-quimica-maskable-512.png', 'brand/apple-touch-icon-180.png', 'brand/favicon-32.png', 'brand/og-quimica-1200.png', 'brand/quimica-icon.svg',
    'data/manifest.json', 'data/manifest.sig', 'data/elementos.json', 'data/regras.json', 'data/constantes.json', 'data/fontes.json', 'data/compostos/index.json', 'data/compostos/lote-001.json', 'data/ghs_frases.json', 'data/textos/wikipedia-pt/mol.json']) {
    assert.ok(existsSync(join(Q(), ...p.split('/'))), `faltando em dist/quimica: ${p}`);
  }
  assert.equal(readFileSync(join(Q(), 'fonts/poppins-semibold.woff')).subarray(0, 4).toString('latin1'), 'wOFF');
  assert.deepEqual(readdirSync(OUT), ['quimica'], 'nada fora de /quimica/ (o projeto é servido assim, direto ou por rewrite)');
});

test('dados em dist são cópias byte a byte do pacote assinado (sem conversão de EOL) e conferem com o manifesto', () => {
  const m = JSON.parse(readFileSync(join(DADOS, 'manifest.json'), 'utf8'));
  for (const [path, a] of Object.entries(m.files)) assert.equal(sha(readFileSync(join(Q(), 'data', ...path.split('/')))), a.sha256, path);
  assert.equal(sha(readFileSync(join(Q(), 'data/manifest.json'))), sha(readFileSync(join(DADOS, 'manifest.json'))));
  assert.equal(ler('data/manifest.sig'), readFileSync(join(DADOS, 'manifest.sig'), 'utf8'));
});

test('service worker gerado: versão e listas de pré-cache preenchidas, URLs limpas, com bibliotecas offline, sem /api e sem dados no shell', () => {
  const sw = ler('sw.js');
  assert.ok(!sw.includes('/*__'), 'marcadores não substituídos');
  const versao = /const VERSAO = "([0-9a-f]{12})"/.exec(sw)?.[1];
  assert.ok(versao, 'VERSAO (hash do conteúdo)');
  assert.ok(new RegExp(`export const BUILD = "${versao}"`).test(ler('js/build-info.js')));
  assert.match(ler('js/build-info.js'), /DATA_VERSION = "fixture-1"/);
  const pre = JSON.parse(/const PRECACHE = (\[[\s\S]*?\]);/.exec(sw)[1]);
  for (const u of ['/quimica/', '/quimica/offline', '/quimica/privacidade', '/quimica/js/main.js', '/quimica/css/app.css', '/quimica/manifest.webmanifest', '/quimica/vendor/katex/katex.min.js',
    '/quimica/vendor/katex/katex.min.css', '/quimica/vendor/smiles-drawer/smiles-drawer.min.js', '/quimica/vendor/ghs/ghs01.svg', '/quimica/vendor/katex/fonts/KaTeX_Main-Regular.woff2', '/quimica/fonts/poppins-semibold.woff', '/quimica/brand/quimica-icon.svg']) {
    assert.ok(pre.includes(u), `pré-cache sem ${u}`);
  }
  assert.ok(pre.every((u) => u.startsWith('/quimica/') && !u.endsWith('.html') && !u.includes('/api/') && !u.startsWith('/quimica/data/') && !u.includes('og-quimica')), 'URLs limpas (sem redirecionamento), sem dados nem API no shell');
  const dados = JSON.parse(/const PRECACHE_DADOS = (\[[\s\S]*?\]);/.exec(sw)[1]);
  assert.ok(dados.includes('/quimica/data/manifest.json') && dados.includes('/quimica/data/manifest.sig'));
  for (const f of ['elementos', 'regras', 'constantes', 'fontes']) assert.ok(dados.some((u) => new RegExp(`^/quimica/data/${f}\\.json\\?v=[0-9a-f]{16}$`).test(u)), f);
  assert.ok(dados.some((u) => /compostos\/index\.json\?v=[0-9a-f]{16}$/.test(u)));
  assert.ok(!dados.some((u) => /compostos\/lote-/.test(u)), 'lotes de compostos são sob demanda');
  for (const u of [...pre, ...dados]) {
    const p = u.split('?')[0].replace(/^\/quimica\/?/, '');
    const abs = join(Q(), ...p.split('/').filter(Boolean));
    assert.ok(existsSync(abs) || existsSync(join(abs, 'index.html')) || existsSync(abs + '.html'), `pré-cache aponta para arquivo inexistente: ${u}`);
  }
  assert.match(sw, /startsWith\(['"]\/api\//);
  assert.match(sw, /startsWith\(['"]\/quimica\/api\//);
  assert.match(sw, /req\.method!=="GET"|req\.method !== 'GET'/);
});

test('a versão (hash) é determinística: duas builds idênticas geram o mesmo BUILD e o mesmo service worker', () => {
  roda(OUT2);
  assert.equal(ler('js/build-info.js', OUT2), ler('js/build-info.js'));
  assert.equal(ler('sw.js', OUT2), ler('sw.js'));
});

test('o bundle minificado funciona: casos de referência do NLU, respostas e cálculos passam com o código de dist', async () => {
  const d = (p) => import(pathToFileURL(join(Q(), 'js', p)).href);
  const [{ DataStore }, { Dicionario }, { parse }, { Engine }, { balancear }, { calcularMassaMolar }, { normalizar }] = await Promise.all([d('data.js'), d('dicionario.js'), d('nlu.js'), d('engine.js'), d('calc/balancear.js'), d('calc/massa.js'), d('texto.js')]);
  const { BASE, fetchDeDisco } = await import('./support.mjs');
  const store = new DataStore({ baseUrl: BASE, fetchFn: fetchDeDisco() });
  await store.iniciar();
  const dic = new Dicionario(store);
  const golden = JSON.parse(readFileSync(join(RAIZ, 'contracts/nlu_golden_cases.json'), 'utf8')).cases;
  const falhas = [];
  let n = 0;
  for (const c of golden) {
    if (c.elemento && !store.porSimbolo.has(c.elemento)) continue;
    if (typeof c.composto === 'number' && !store.indice.porCid.has(c.composto)) continue;
    const p = parse(c.q, dic);
    n++;
    if (p.intent !== c.intent) falhas.push(`${c.q}: ${p.intent} ≠ ${c.intent}`);
    for (const k of ['elemento', 'propriedade', 'equacao', 'unidadeDestino', 'grupo', 'periodo', 'bloco', 'categoria', 'estado']) {
      if (k in c && c[k] !== null && p[k] !== c[k] && !(k === 'equacao' && p[k]?.replace(/\s+/g, ' ') === c[k])) falhas.push(`${c.q}: ${k} ${p[k]} ≠ ${c[k]}`);
    }
  }
  assert.ok(n >= 60);
  assert.deepEqual(falhas, []);
  const e = new Engine({ store });
  assert.match((await e.responder('massa molar da água')).directAnswer, /18,015 g\/mol/);
  assert.match((await e.responder('como fazer metanfetamina?')).directAnswer, /Não posso ajudar/);
  assert.equal(balancear('C8H18 + O2 -> CO2 + H2O').equacao, '2 C₈H₁₈ + 25 O₂ → 16 CO₂ + 18 H₂O');
  assert.ok(Math.abs(calcularMassaMolar('Ca(OH)2', store.ctx).massaMolar - 74.092) < 0.001);
  assert.equal(normalizar('Ácido  Sulfúrico!'), 'acido sulfurico');
});

test('todos os módulos de dist carregam (parse e imports/exports íntegros)', async () => {
  for (const f of jsDe(join(Q(), 'js'))) {
    if (f.endsWith('main.js') || f.endsWith('theme-init.js')) continue;
    await import(pathToFileURL(f).href);
  }
  const vm = await import('node:vm');
  for (const p of ['sw.js', 'js/theme-init.js']) new vm.Script(ler(p), { filename: p });
  assert.ok(ler('js/app.js').length < readFileSync(join(RAIZ, 'web/src/quimica/js/app.js'), 'utf8').length, 'minificado');
});

test('minificador: preserva strings, templates, regex e a semântica de ASI', async () => {
  const { minifyJs, minifyCss } = await import('../tools/minify.mjs');
  const fonte = `
    // comentário
    const a = 1 /* x */ + 2
    const b = a
    ++b2
    const url = 'https://exemplo.com/a//b' // não é comentário dentro da string
    const re = /ab+\\/c[/]d/gi
    const lb = /(?<![A-Za-z])\\d+(?=(\\S+))/gu
    const t = \`olá \${a + \`\${b}\`} // texto\`
    const dv = a / 2 / 3
    function f(x) { return /x/.test(x) ? "ok" : 'não' }
    export { f }
  `;
  const min = minifyJs(fonte);
  assert.ok(min.includes("'https://exemplo.com/a//b'"));
  assert.ok(min.includes('/ab+\\/c[/]d/gi'));
  assert.ok(min.includes('/(?<![A-Za-z])\\d+(?=(\\S+))/gu'), 'lookbehind e lookahead preservados');
  assert.ok(min.includes('`olá ${a + `${b}`} // texto`'));
  assert.ok(min.includes('a/2/3'));
  assert.ok(!min.includes('comentário\n') && !min.includes('/* x */'));
  assert.ok(/const b=a\n\+\+b2/.test(min), 'quebra de linha entre "a" e "++b2" preservada (ASI)');
  assert.equal(minifyCss('/* c */ a  >  b , c {\n  color : red ;\n  margin: 0 auto;\n}\n@media (min-width: 10px) { .x { top: calc(1px + 2px); content: "a  b"; } }'),
    'a>b,c{color : red;margin: 0 auto}@media (min-width: 10px){.x{top: calc(1px + 2px);content: "a  b"}}\n');
});

// ------------------------------------------------------------------------------------------- falhas de build

test('o build FALHA se o pacote de dados estiver adulterado, incompleto ou sem assinatura (nunca publica dados inválidos)', () => {
  const sujo = join(tmp, 'dados-sujos');
  mkdirSync(sujo, { recursive: true });
  cpSync(join(DADOS, 'manifest.json'), join(sujo, 'manifest.json'));
  cpSync(join(DADOS, 'manifest.sig'), join(sujo, 'manifest.sig'));
  assert.throws(() => roda(join(tmp, 'x1'), { DATA_DIR: sujo }), (e) => /arquivo do manifesto ausente/.test(String(e.stderr)));
  // arquivo adulterado (mesmo tamanho): sha256 divergente
  cpSync(DADOS, sujo, { recursive: true });
  const el = readFileSync(join(sujo, 'elementos.json'), 'utf8').replace('Oxigênio', 'Oxigenio');
  writeFileSync(join(sujo, 'elementos.json'), el);
  assert.throws(() => roda(join(tmp, 'x2'), { DATA_DIR: sujo }), (e) => /(sha256|tamanho) divergente em elementos\.json/.test(String(e.stderr)));
  // manifesto adulterado: assinatura inválida
  cpSync(DADOS, sujo, { recursive: true });
  const m = JSON.parse(readFileSync(join(DADOS, 'manifest.json'), 'utf8'));
  m.version = 'adulterado';
  writeFileSync(join(sujo, 'manifest.json'), JSON.stringify(m, null, 1) + '\n');
  assert.throws(() => roda(join(tmp, 'x3'), { DATA_DIR: sujo }), (e) => /assinatura do manifesto INVÁLIDA/.test(String(e.stderr)));
  // sem assinatura: não publica
  rmSync(join(sujo, 'manifest.sig'));
  assert.throws(() => roda(join(tmp, 'x4'), { DATA_DIR: sujo }), (e) => /assinatura não verificável/.test(String(e.stderr)));
  // pasta sem manifesto: mensagem com o caminho do pacote de teste
  assert.throws(() => roda(join(tmp, 'x5'), { DATA_DIR: join(tmp, 'nao-existe') }), (e) => /manifest\.json não encontrado/.test(String(e.stderr)));
  // caminho malicioso no manifesto
  cpSync(DADOS, sujo, { recursive: true });
  const m2 = JSON.parse(readFileSync(join(DADOS, 'manifest.json'), 'utf8'));
  m2.files['../fora.json'] = { bytes: 1, sha256: 'a'.repeat(64) };
  writeFileSync(join(sujo, 'manifest.json'), JSON.stringify(m2, null, 1) + '\n');
  assert.throws(() => roda(join(tmp, 'x6'), { DATA_DIR: sujo }), (e) => /caminho inválido/.test(String(e.stderr)));
});

// ------------------------------------------------------------------------------------------- servidor local

test('serve.mjs imita o vercel.json: cleanUrls, rewrite SPA em /quimica/, página estática, CSP e Cache-Control', async () => {
  const porta = 4600 + Math.floor(Math.random() * 300);
  const srv = spawn(process.execPath, [resolve(aqui, '../serve.mjs')], { env: { ...process.env, PORT: String(porta), DIR: OUT }, stdio: 'ignore' });
  try {
    const u = (p) => `http://127.0.0.1:${porta}${p}`;
    for (let i = 0; i < 40; i++) { try { await fetch(u('/quimica/')); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
    const home = await fetch(u('/quimica/'));
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(home.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.match(home.headers.get('cache-control'), /max-age=0, must-revalidate/);
    assert.match(home.headers.get('permissions-policy'), /geolocation=\(\)/);
    assert.match(await home.text(), /<title>SaibaTudo Química/);
    assert.equal((await fetch(u('/quimica'))).status, 200, '/quimica (sem barra) também abre');
    for (const rota of ['/quimica/tabela', '/quimica/elemento/Fe', '/quimica/composto/2244', '/quimica/calculadoras/ph', '/quimica/sobre-os-dados', '/quimica/seguranca']) {
      const r = await fetch(u(rota));
      assert.equal(r.status, 200, rota);
      assert.match(await r.text(), /<div id="app">/, `${rota} cai no shell do SPA`);
    }
    const priv = await fetch(u('/quimica/privacidade'));
    assert.equal(priv.status, 200);
    assert.match(await priv.text(), /Política de Privacidade — SaibaTudo Química/);
    assert.equal((await fetch(u('/quimica/js/inexistente.js'))).status, 404, 'arquivos com extensão não são capturados pelo rewrite');
    assert.equal((await fetch(u('/quimica/data/inexistente.json'))).status, 404);
    assert.equal((await fetch(u('/api/nlu'), { method: 'POST' })).status, 404);
    assert.match((await fetch(u('/quimica/data/manifest.json'))).headers.get('cache-control'), /must-revalidate/);
    assert.match((await fetch(u('/quimica/data/manifest.sig'))).headers.get('cache-control'), /must-revalidate/);
    assert.match((await fetch(u('/quimica/data/elementos.json'))).headers.get('cache-control'), /max-age=300$/);
    assert.match((await fetch(u('/quimica/fonts/poppins-semibold.woff'))).headers.get('cache-control'), /immutable/);
    assert.match((await fetch(u('/quimica/vendor/katex/katex.min.js'))).headers.get('cache-control'), /max-age=604800/);
    assert.match((await fetch(u('/quimica/sw.js'))).headers.get('cache-control'), /must-revalidate/);
    assert.match((await fetch(u('/quimica/vendor/katex/fonts/KaTeX_Main-Regular.woff2'))).headers.get('content-type'), /font\/woff2/);
    assert.match((await fetch(u('/quimica/vendor/ghs/ghs06.svg'))).headers.get('content-type'), /image\/svg\+xml/);
    assert.equal((await fetch(u('/../../etc/passwd'))).status === 200, false);
    assert.equal((await fetch(u('/quimica/..%2f..%2fpackage.json'))).status === 200, false);
  } finally {
    srv.kill();
  }
});

// ------------------------------------------------------------------------------------------- vercel.json

test('vercel.json: build, saída, cleanUrls, rewrite do SPA em /quimica/, CSP restritiva e cabeçalhos de cache', () => {
  assert.equal(vercel.buildCommand, 'node web/build.mjs');
  assert.equal(vercel.outputDirectory, 'web/dist');
  assert.equal(vercel.cleanUrls, true);
  const rw = vercel.rewrites.find((r) => r.destination === '/quimica/index.html');
  assert.equal(rw.source, '/quimica/:path((?!api/)(?!.*\\.).*)', 'rewrite do SPA que não captura arquivos com extensão nem a API');
  const rx = new RegExp('^' + rw.source.replace(/:path\((.*)\)$/, '$1') + '$');
  assert.ok(rx.test('/quimica/tabela') && rx.test('/quimica/composto/2244') && !rx.test('/quimica/js/app.js') && !rx.test('/quimica/data/manifest.json'));
  assert.ok(!rx.test('/quimica/api/nlu') && !rx.test('/quimica/api/health'), 'o SPA não engole /quimica/api/*');
  // A API vive em /api/* e é exposta em /quimica/api/* (a home em saibatudo.net encaminha só /quimica/*); é a ÚNICA menção a /api
  const api = vercel.rewrites.find((r) => r.source === '/quimica/api/:path*');
  assert.equal(api.destination, '/api/:path*');
  assert.ok(vercel.rewrites.indexOf(api) < vercel.rewrites.indexOf(rw), 'o rewrite da API vem antes do SPA');
  assert.equal(JSON.stringify(vercel).split('"/api').length - 1, 1, 'nenhuma outra regra toca /api');
  assert.deepEqual(vercel.functions, { 'api/health.js': { includeFiles: 'data/quimica/manifest.json' } }, 'o manifesto vai junto do /health');
  const todos = vercel.headers.find((h) => h.source === '/(.*)').headers;
  const h = Object.fromEntries(todos.map((x) => [x.key, x.value]));
  const csp = h['Content-Security-Policy'];
  assert.ok(!csp.includes('unsafe-inline') && !csp.includes('unsafe-eval'));
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /style-src 'self'(;|$)/);
  assert.match(csp, /connect-src 'self'(;|$)/);
  assert.match(csp, /img-src 'self' data:(;|$)/, 'data: só para o SmilesDrawer (rótulos dos átomos)');
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.ok(!/https?:\/\//.test(csp), 'a CSP não libera nenhuma origem externa');
  assert.equal(h['X-Content-Type-Options'], 'nosniff');
  assert.equal(h['Referrer-Policy'], 'strict-origin-when-cross-origin');
  const pp = Object.fromEntries(h['Permissions-Policy'].split(',').map((d) => d.trim().split('=')));
  for (const k of ['camera', 'microphone', 'geolocation', 'payment', 'usb', 'bluetooth', 'accelerometer', 'gyroscope', 'magnetometer', 'display-capture']) assert.equal(pp[k], '()', `${k} deve estar desabilitado`);
  assert.ok(Object.values(pp).every((v) => v === '()'), 'nenhum recurso do aparelho é liberado');
  const regras = vercel.headers.map((x) => x.source);
  assert.ok(regras.every((s) => s === '/(.*)' || s === '/quimica' || s.startsWith('/quimica/')), 'todas as regras são do /quimica/');
  // a ordem importa na Vercel (a regra mais específica vem depois da geral): data/(.*) antes de manifest.*
  assert.ok(regras.indexOf('/quimica/data/(.*)') < regras.indexOf('/quimica/data/manifest.json'));
  const cache = (src) => vercel.headers.find((x) => x.source === src)?.headers.find((x) => x.key === 'Cache-Control')?.value;
  assert.equal(cache('/quimica/data/(.*)'), 'public, max-age=300');
  assert.match(cache('/quimica/fonts/(.*)'), /immutable/);
  assert.equal(cache('/quimica/vendor/(.*)'), 'public, max-age=604800');
  for (const s of ['/quimica/data/manifest.json', '/quimica/data/manifest.sig', '/quimica/sw.js', '/quimica/manifest.webmanifest', '/quimica/index.html', '/quimica/js/(.*)', '/quimica/css/(.*)', '/quimica/privacidade', '/quimica/']) {
    assert.equal(cache(s), 'public, max-age=0, must-revalidate', s);
  }
});

test('nenhum segredo ou dado pessoal em dist (chaves privadas, e-mails, tokens)', () => {
  const textos = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === 'data' || e.name === 'vendor' ? [] : textos(join(dir, e.name))) : /\.(js|css|html|json|webmanifest|svg|txt|md)$/.test(e.name) ? [join(dir, e.name)] : []);
  for (const f of textos(OUT)) {
    const s = readFileSync(f, 'utf8');
    assert.ok(!/BEGIN (EC |RSA )?PRIVATE KEY/.test(s), f);
    // só o e-mail institucional de contato (público, na política de privacidade) é permitido
    const semPermitidos = s.replaceAll('saibatudo@saibatudo.net', '');
    assert.ok(!/[\w.+-]+@[\w-]+\.[\w.]+/.test(semPermitidos), `e-mail em ${f}`);
    assert.ok(!/(ghp_|github_pat_|sk-[A-Za-z0-9]{20}|AKIA[0-9A-Z]{16})/.test(s), `token em ${f}`);
  }
  assert.ok(!existsSync(join(Q(), 'secrets')) && !readdirSync(Q()).some((n) => /\.pem$/.test(n)));
});

test('o build também funciona com o pacote REAL de data/quimica (se existir e for válido)', { skip: !existsSync(join(RAIZ, 'data/quimica/manifest.sig')) ? 'sem pacote real assinado em data/quimica' : false }, () => {
  const saida = roda(join(tmp, 'real'), { DATA_DIR: join(RAIZ, 'data/quimica') });
  assert.match(saida, /assinatura do manifesto verificada/);
  assert.ok(existsSync(join(tmp, 'real/quimica/data/elementos.json')));
});
