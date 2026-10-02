// Build (web/build.mjs), minificação, service workers, servidor local e vercel.json.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { DADOS, RAIZ, BASE, fetchDeDisco } from './support.mjs';

const aqui = dirname(fileURLToPath(import.meta.url));
const BUILD = resolve(aqui, '../build.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'st-build-'));
const OUT = join(tmp, 'dist');
const OUT2 = join(tmp, 'dist2');
const roda = (out, env = {}) => execFileSync(process.execPath, [BUILD], { env: { ...process.env, OUT_DIR: out, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

before(() => { roda(OUT); });
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* arquivos em uso no Windows */ } });

const ler = (p, base = OUT) => readFileSync(join(base, ...p.split('/')), 'utf8');
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const vercel = JSON.parse(readFileSync(join(RAIZ, 'vercel.json'), 'utf8'));

test('estrutura de dist: páginas, manifestos, service workers, brand, fonte e dados oficiais', () => {
  for (const p of ['index.html', 'privacidade/index.html', 'sobre-os-dados/index.html', 'eleicoes2026/index.html', 'eleicoes2026/offline.html',
    'manifest.webmanifest', 'eleicoes2026/manifest.webmanifest', 'sw.js', 'eleicoes2026/sw.js', 'assets/base.css', 'assets/site.css', 'assets/home.js', 'assets/apps.js',
    'eleicoes2026/js/main.js', 'eleicoes2026/js/nlu.js', 'eleicoes2026/css/app.css', 'fonts/poppins-semibold.woff', 'fonts/OFL.txt',
    'brand/pwa-eleicoes2026-192.png', 'brand/pwa-eleicoes2026-maskable-512.png', 'brand/apple-touch-icon-180.png', 'brand/favicon-32.png', 'brand/og-symbol-1200.png',
    'brand/svg/saibatudo-logo-horizontal-dark.svg', 'brand/svg/eleicoes2026-icon.svg',
    'data/eleicoes2026/manifest.json', 'data/eleicoes2026/manifest.sig', 'data/eleicoes2026/regras.json', 'data/eleicoes2026/pesquisas.json',
    'data/eleicoes2026/fontes.json', 'data/eleicoes2026/candidatos/BR.json', 'data/eleicoes2026/candidatos/SP.json',
    'data/geo/ufs.json', 'eleicoes2026/js/geo.js']) {
    assert.ok(existsSync(join(OUT, ...p.split('/'))), `faltando em dist: ${p}`);
  }
  assert.equal(readFileSync(join(OUT, 'fonts/poppins-semibold.woff')).subarray(0, 4).toString('latin1'), 'wOFF');
  assert.ok(!existsSync(join(OUT, 'brand/svg/eleicoes2026-feature-graphic.svg')), 'arte da Play Store não vai para o site');
});

test('dados em dist são cópias byte a byte do pacote assinado (sem conversão de EOL)', () => {
  const m = JSON.parse(readFileSync(join(DADOS, 'manifest.json'), 'utf8'));
  for (const a of m.arquivos.filter((x) => !x.path.startsWith('fotos/') || /[05]\.jpg$/.test(x.path))) {
    assert.equal(sha(readFileSync(join(OUT, 'data/eleicoes2026', ...a.path.split('/')))), a.sha256, a.path);
  }
  assert.equal(sha(readFileSync(join(OUT, 'data/eleicoes2026/manifest.json'))), sha(readFileSync(join(DADOS, 'manifest.json'))));
  assert.equal(ler('data/eleicoes2026/manifest.sig'), readFileSync(join(DADOS, 'manifest.sig'), 'utf8'));
});

test('service worker do app: versão e listas de pré-cache preenchidas, URLs limpas, sem /api', () => {
  const sw = ler('eleicoes2026/sw.js');
  assert.ok(!sw.includes("/*__"), 'marcadores não substituídos');
  const versao = /const VERSAO = "([0-9a-f]{12})"/.exec(sw)?.[1];
  assert.ok(versao, 'VERSAO (hash do conteúdo)');
  assert.equal(new RegExp(`export const BUILD = "${versao}"`).test(ler('eleicoes2026/js/build-info.js')), true);
  const pre = JSON.parse(/const PRECACHE = (\[[\s\S]*?\]);/.exec(sw)[1]);
  assert.ok(pre.includes('/eleicoes2026/') && pre.includes('/eleicoes2026/offline') && pre.includes('/eleicoes2026/js/main.js') && pre.includes('/eleicoes2026/css/app.css'));
  assert.ok(pre.every((u) => !u.endsWith('.html') && !u.includes('/api/') && !u.startsWith('/data/')), 'URLs limpas (sem redirecionamento) e sem dados/API no shell');
  const dados = JSON.parse(/const PRECACHE_DADOS = (\[[\s\S]*?\]);/.exec(sw)[1]);
  assert.ok(dados.includes('/data/eleicoes2026/manifest.json') && dados.some((u) => /candidatos\/BR\.json\?v=[0-9a-f]{16}$/.test(u)));
  // todo recurso pré-cacheado existe em dist
  for (const u of [...pre, ...dados]) {
    const p = u.split('?')[0];
    assert.ok(existsSync(join(OUT, ...p.split('/').filter(Boolean))) || existsSync(join(OUT, ...p.split('/').filter(Boolean), 'index.html')) || existsSync(join(OUT, ...p.split('/').filter(Boolean)) + '.html'), `pré-cache aponta para arquivo inexistente: ${u}`);
  }
  // regras do fetch: nunca intercepta /api e só GET
  assert.match(sw, /startsWith\(['"]\/api\//);
  assert.match(sw, /req\.method!=="GET"|req\.method !== 'GET'|method!=='GET'/);
});

test('contorno das UFs (sugestão do estado pela localização): cópia byte a byte em dist, fora do pré-cache, e geo.js minificado passa nos casos de referência', async () => {
  assert.equal(sha(readFileSync(join(OUT, 'data/geo/ufs.json'))), sha(readFileSync(join(RAIZ, 'data/geo/ufs.json'))));
  const sw = ler('eleicoes2026/sw.js');
  const pre = JSON.parse(/const PRECACHE = (\[[\s\S]*?\]);/.exec(sw)[1]);
  const dados = JSON.parse(/const PRECACHE_DADOS = (\[[\s\S]*?\]);/.exec(sw)[1]);
  assert.ok(![...pre, ...dados].some((u) => u.includes('/data/geo/')), 'baixado sob demanda, não no pré-cache');
  assert.ok(!ler('sw.js').includes('/data/geo/'));
  const { ufPorCoordenada, URL_CONTORNOS_UF } = await import(pathToFileURL(join(OUT, 'eleicoes2026/js/geo.js')).href);
  assert.equal(URL_CONTORNOS_UF, '/data/geo/ufs.json');
  const geo = JSON.parse(ler('data/geo/ufs.json'));
  const casos = JSON.parse(readFileSync(join(RAIZ, 'contracts/geo_cases.json'), 'utf8')).cases;
  assert.deepEqual(casos.filter((c) => ufPorCoordenada(c.lat, c.lon, geo) !== c.uf).map((c) => c.nome), []);
});

test('service worker do portal', () => {
  const sw = ler('sw.js');
  assert.ok(!sw.includes('/*__'));
  const pre = JSON.parse(/const PRECACHE = (\[[\s\S]*?\]);/.exec(sw)[1]);
  assert.ok(pre.includes('/') && pre.includes('/privacidade') && pre.includes('/assets/home.js'));
});

test('a versão (hash) é determinística: duas builds idênticas geram o mesmo BUILD', () => {
  roda(OUT2);
  assert.equal(ler('eleicoes2026/js/build-info.js', OUT2), ler('eleicoes2026/js/build-info.js'));
  assert.equal(ler('eleicoes2026/sw.js', OUT2), ler('eleicoes2026/sw.js'));
});

test('o bundle minificado funciona: casos de referência do NLU e respostas passam com o código de dist', async () => {
  const d = (p) => import(pathToFileURL(join(OUT, 'eleicoes2026/js', p)).href);
  const [{ DataStore }, { Gazetteer }, { parse }, { AnswerBuilder }, { normalizar }] = await Promise.all([d('data.js'), d('gazetteer.js'), d('nlu.js'), d('answers.js'), d('model.js')]);
  const store = new DataStore({ baseUrl: BASE, fetchFn: fetchDeDisco() });
  await store.iniciar();
  await store.ensureTodas();
  const gaz = new Gazetteer(store.candidatos, store.partidosConhecidos());
  const golden = JSON.parse(readFileSync(join(RAIZ, 'contracts/nlu_golden_cases.json'), 'utf8'));
  const falhas = [];
  for (const c of golden.cases) {
    const r = parse(c.q, gaz);
    for (const k of ['intent', 'cargo', 'uf', 'partido', 'nome', 'tema', 'apenasDeferidas', 'apenasIndeferidas', 'historico', 'turno', 'numero', 'genero', 'vice']) {
      if (!(k in c)) continue;
      const a = k === 'vice' ? (r.vice === true ? true : null) : r[k];
      const ok = c[k] === null ? a === null : k === 'nome' ? normalizar(a ?? '') === normalizar(c[k]) : a === c[k];
      if (!ok) falhas.push(`${c.q}: ${k}`);
    }
  }
  assert.deepEqual(falhas, []);
  const b = new AnswerBuilder({ data: store.snapshot(), gaz, hoje: '2026-10-01' });
  const r = await b.construir(parse('Quem disputa a Presidência em 2026?', gaz));
  assert.ok(r.directAnswer.includes('13 candidaturas na urna') && r.directAnswer.includes('\n• 13 — LULA (PT)'));
  assert.ok((await b.construir(parse('Simular voto em LULA (13)', gaz))).abrirSimulador);
  assert.ok((await b.construir(parse('Em quem devo votar?', gaz))).directAnswer.includes('Não indico, recomendo'));
});

test('todos os módulos de dist carregam (parse e imports/exports íntegros)', async () => {
  const js = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? js(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : []);
  for (const f of js(join(OUT, 'eleicoes2026/js'))) {
    if (f.endsWith('main.js')) continue;
    await import(pathToFileURL(f).href);
  }
  // sw.js e home.js usam globais do navegador: basta que sejam sintaticamente válidos (compilação sem execução)
  const vm = await import('node:vm');
  for (const p of ['eleicoes2026/sw.js', 'sw.js']) new vm.Script(ler(p), { filename: p });
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
    const t = \`olá \${a + \`\${b}\`} // texto\`
    const dv = a / 2 / 3
    function f(x) { return /x/.test(x) ? "ok" : 'não' }
    export { f }
  `;
  const min = minifyJs(fonte);
  assert.ok(min.includes("'https://exemplo.com/a//b'"));
  assert.ok(min.includes('/ab+\\/c[/]d/gi'));
  assert.ok(min.includes('`olá ${a + `${b}`} // texto`'));
  assert.ok(min.includes('a/2/3'));
  assert.ok(!min.includes('comentário\n') && !min.includes('/* x */'));
  assert.ok(/const b=a\n\+\+b2/.test(min), 'quebra de linha entre "a" e "++b2" preservada (ASI)');
  assert.equal(minifyCss('/* c */ a  >  b , c {\n  color : red ;\n  margin: 0 auto;\n}\n@media (min-width: 10px) { .x { top: calc(1px + 2px); content: "a  b"; } }'),
    'a>b,c{color : red;margin: 0 auto}@media (min-width: 10px){.x{top: calc(1px + 2px);content: "a  b"}}\n');
});

// ------------------------------------------------------------------------------------------- falhas de build

test('o build FALHA se o pacote de dados estiver adulterado ou incompleto (nunca publica dados inválidos)', () => {
  const sujo = join(tmp, 'dados-sujos');
  mkdirSync(sujo, { recursive: true });
  cpSync(join(DADOS, 'manifest.json'), join(sujo, 'manifest.json'));
  cpSync(join(DADOS, 'manifest.sig'), join(sujo, 'manifest.sig'));
  assert.throws(() => roda(join(tmp, 'x1'), { DATA_DIR: sujo }), (e) => /arquivo do manifesto ausente/.test(String(e.stderr)));
  // manifesto adulterado: assinatura inválida
  const m = JSON.parse(readFileSync(join(DADOS, 'manifest.json'), 'utf8'));
  m.dataVersion = 'adulterado';
  writeFileSync(join(sujo, 'manifest.json'), JSON.stringify(m, null, 2));
  assert.throws(() => roda(join(tmp, 'x2'), { DATA_DIR: sujo }), (e) => /assinatura do manifesto INVÁLIDA/.test(String(e.stderr)));
});

// ------------------------------------------------------------------------------------------- servidor local

test('serve.mjs imita o vercel.json: cleanUrls, rewrite SPA, redirect, CSP e Cache-Control', async () => {
  const porta = 4300 + Math.floor(Math.random() * 500);
  const srv = spawn(process.execPath, [resolve(aqui, '../serve.mjs')], { env: { ...process.env, PORT: String(porta), DIR: OUT }, stdio: 'ignore' });
  try {
    const u = (p) => `http://127.0.0.1:${porta}${p}`;
    for (let i = 0; i < 40; i++) { try { await fetch(u('/')); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
    const home = await fetch(u('/'));
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(home.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.match(home.headers.get('cache-control'), /max-age=0, must-revalidate/);
    assert.match(home.headers.get('permissions-policy'), /(^|, )geolocation=\(self\)(,|$)/);
    const geo = await fetch(u('/data/geo/ufs.json'));
    assert.equal(geo.status, 200);
    assert.equal(geo.headers.get('cache-control'), 'public, max-age=86400');
    assert.equal(Object.keys((await geo.json()).ufs).length, 27);
    assert.equal((await fetch(u('/privacidade'))).status, 200);
    assert.match(await (await fetch(u('/privacidade'))).text(), /Política de privacidade — SaibaTudo Eleições 2026/);
    const spa = await fetch(u('/eleicoes2026/candidato/280002542548'));
    assert.equal(spa.status, 200);
    assert.match(await spa.text(), /SaibaTudo Eleições 2026/);
    assert.equal((await fetch(u('/eleicoes2026/js/inexistente.js'))).status, 404, 'arquivos com extensão não são capturados pelo rewrite');
    const red = await fetch(u('/sobre-os-dados'), { redirect: 'manual' });
    assert.ok([301, 302, 307, 308].includes(red.status));
    assert.equal(red.headers.get('location'), '/eleicoes2026/sobre-os-dados');
    assert.equal((await fetch(u('/api/nlu'), { method: 'POST' })).status, 404);
    const foto = await fetch(u('/data/eleicoes2026/fotos/280002542548.jpg'));
    assert.match(foto.headers.get('cache-control'), /immutable/);
    assert.match((await fetch(u('/data/eleicoes2026/candidatos/BR.json'))).headers.get('cache-control'), /max-age=300$/);
    assert.match((await fetch(u('/data/eleicoes2026/manifest.json'))).headers.get('cache-control'), /must-revalidate/);
    assert.match((await fetch(u('/eleicoes2026/sw.js'))).headers.get('cache-control'), /must-revalidate/);
    assert.equal((await fetch(u('/../../etc/passwd'))).status === 200, false);
  } finally {
    srv.kill();
  }
});

// ------------------------------------------------------------------------------------------- vercel.json

test('vercel.json: build, saída, cleanUrls, rewrite do SPA, CSP restritiva e cabeçalhos de cache', () => {
  assert.equal(vercel.buildCommand, 'node web/build.mjs');
  assert.equal(vercel.outputDirectory, 'web/dist');
  assert.equal(vercel.cleanUrls, true);
  const rw = vercel.rewrites.find((r) => r.destination === '/eleicoes2026/index.html');
  assert.ok(rw && rw.source.startsWith('/eleicoes2026/') && rw.source.includes('(?!.*\\.)'), 'rewrite do SPA que não captura arquivos com extensão');
  assert.ok(!JSON.stringify(vercel).includes('"/api'), 'as funções serverless em /api não são tocadas pelo vercel.json');
  const todos = vercel.headers.find((h) => h.source === '/(.*)').headers;
  const h = Object.fromEntries(todos.map((x) => [x.key, x.value]));
  const csp = h['Content-Security-Policy'];
  assert.ok(!csp.includes('unsafe-inline') && !csp.includes('unsafe-eval'));
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /connect-src 'self' https:\/\/resultados\.tse\.jus\.br/);
  assert.match(csp, /img-src 'self' https:\/\/resultados\.tse\.jus\.br data:/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(h['X-Content-Type-Options'], 'nosniff');
  assert.equal(h['Referrer-Policy'], 'strict-origin-when-cross-origin');
  // geolocalização só para a própria origem (sugestão do estado, calculada no aparelho); o resto continua bloqueado
  const pp = Object.fromEntries(h['Permissions-Policy'].split(',').map((d) => d.trim().split('=')));
  assert.equal(pp.geolocation, '(self)');
  for (const k of ['camera', 'microphone', 'payment', 'usb', 'bluetooth', 'accelerometer', 'gyroscope', 'magnetometer', 'display-capture', 'autoplay', 'hid', 'midi', 'serial', 'publickey-credentials-get', 'xr-spatial-tracking']) {
    assert.equal(pp[k], '()', `${k} deve continuar desabilitado`);
  }
  assert.equal(Object.values(pp).filter((v) => v !== '()').length, 1, 'só a geolocalização é liberada');
  const cache = (src) => vercel.headers.find((x) => x.source === src)?.headers.find((x) => x.key === 'Cache-Control')?.value;
  assert.equal(cache('/data/geo/(.*)'), 'public, max-age=86400');
  assert.match(cache('/data/eleicoes2026/fotos/(.*)'), /immutable/);
  assert.match(cache('/brand/(.*)'), /immutable/);
  assert.match(cache('/fonts/(.*)'), /immutable/);
  assert.equal(cache('/data/eleicoes2026/candidatos/(.*)'), 'public, max-age=300');
  assert.equal(cache('/data/eleicoes2026/regras.json'), 'public, max-age=300');
  for (const s of ['/data/eleicoes2026/manifest.json', '/data/eleicoes2026/manifest.sig', '/sw.js', '/eleicoes2026/sw.js', '/eleicoes2026/manifest.webmanifest', '/eleicoes2026/index.html']) {
    assert.equal(cache(s), 'public, max-age=0, must-revalidate', s);
  }
});

test('nenhum segredo ou dado pessoal em dist (chaves privadas, e-mails, tokens)', () => {
  const textos = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === 'fotos' || e.name === 'data' ? [] : textos(join(dir, e.name))) : /\.(js|css|html|json|webmanifest|svg|txt)$/.test(e.name) ? [join(dir, e.name)] : []);
  for (const f of textos(OUT)) {
    const s = readFileSync(f, 'utf8');
    assert.ok(!/BEGIN (EC |RSA )?PRIVATE KEY/.test(s), f);
    // só o e-mail institucional de contato (público, na política de privacidade) é permitido
    const semPermitidos = s.replace(/\S+@\d+\.\d+\.\d+/g, '').replaceAll('saibatudo@saibatudo.net', '');
    assert.ok(!/[\w.+-]+@[\w-]+\.[\w.]+/.test(semPermitidos), `e-mail em ${f}`);
    assert.ok(!/(ghp_|github_pat_|sk-[A-Za-z0-9]{20}|AKIA[0-9A-Z]{16})/.test(s), `token em ${f}`);
  }
});
