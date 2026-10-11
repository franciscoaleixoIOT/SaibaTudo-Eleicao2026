// Garante que todos os módulos da interface carregam (imports/exports consistentes), que as páginas HTML não têm recursos ausentes nem código inline
// (CSP estrita), que ícones, rotas, bibliotecas vendorizadas e pictogramas existem e que o manifesto do PWA está coerente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(aqui, '../src');
const Q = join(SRC, 'quimica');
const js = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? js(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : []);
const todosJs = () => js(join(Q, 'js'));
const gerados = (p) => p.startsWith('/quimica/brand/') || p.startsWith('/quimica/fonts/') || p.startsWith('/quimica/data/');

test('todos os módulos JS do app carregam sem erro de import/export', async () => {
  for (const f of todosJs()) {
    if (f.endsWith('main.js') || f.endsWith('theme-init.js')) continue; // main inicia o app (precisa de DOM); theme-init é script clássico
    await import(pathToFileURL(f).href);
  }
});

test('imports relativos de cada módulo apontam para arquivos existentes e exportam o que é importado', async () => {
  for (const f of todosJs()) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'(\.[^']+)'/g)) {
      const alvo = resolve(dirname(f), m[2]);
      assert.ok(existsSync(alvo), `${f}: import inexistente ${m[2]}`);
      if (f.endsWith('main.js') || alvo.endsWith('main.js')) continue;
      const mod = await import(pathToFileURL(alvo).href);
      for (const nome of m[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
        assert.ok(nome in mod, `${f}: '${nome}' não é exportado por ${m[2]}`);
      }
    }
  }
});

test('CSP: nenhum eval, new Function, document.write, atributo style, handler inline ou innerHTML com dados (só os ícones constantes)', () => {
  for (const f of todosJs()) {
    const s = readFileSync(f, 'utf8');
    const rel = f.slice(Q.length + 1);
    assert.ok(!/\beval\s*\(/.test(s) && !/new Function\s*\(/.test(s) && !/document\.write\s*\(/.test(s), `${rel}: eval/Function/document.write`);
    assert.ok(!/setAttribute\(\s*['"]style['"]/.test(s) && !/\bstyle:\s*['"`]/.test(s), `${rel}: atributo style (a CSP bloqueia; use classes ou CSSOM)`);
    assert.ok(!/\bon(click|load|error|submit|change)\s*=\s*['"]/i.test(s), `${rel}: handler inline`);
    if (!rel.endsWith('icons.js')) assert.ok(!/\.innerHTML\s*=|insertAdjacentHTML|outerHTML\s*=/.test(s), `${rel}: innerHTML (use createTextNode/h())`);
    assert.ok(!/(?:fetch|import)\(\s*['"`]https?:/.test(s), `${rel}: requisição a origem externa`);
  }
});

test('páginas HTML: lang pt-BR, viewport, sem script/estilo inline e todos os recursos locais referenciados existem (ou são gerados no build)', () => {
  const rotasSpa = /^\/quimica\/(tabela|compostos|calculadoras|seguranca|sobre-os-dados|configuracoes|privacidade)?\/?$/;
  for (const pagina of ['index.html', 'offline.html', 'privacidade/index.html']) {
    const html = readFileSync(join(Q, pagina), 'utf8');
    assert.match(html, /<html lang="pt-BR">/, pagina);
    assert.match(html, /name="viewport"/, pagina);
    assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>[^<]/i.test(html), `${pagina}: script inline viola a CSP`);
    assert.ok(!/<style[\s>]/i.test(html) && !/\sstyle=/.test(html), `${pagina}: estilo inline viola a CSP`);
    assert.ok(!/(?:src|href)="https?:\/\/[^"]*\.(?:js|css|woff2?|png|jpe?g|svg)"/i.test(html), `${pagina}: recurso de terceiros`);
    for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)"/g)) {
      const p = m[1];
      if (gerados(p) || rotasSpa.test(p)) continue;
      assert.ok(existsSync(join(SRC, p)) || existsSync(join(SRC, p, 'index.html')), `${pagina}: recurso ausente ${p}`);
    }
  }
  const index = readFileSync(join(Q, 'index.html'), 'utf8');
  assert.match(index, /<link rel="canonical" href="https:\/\/saibatudo\.net\/quimica\/">/);
  assert.match(index, /<script type="module" src="\/quimica\/js\/main\.js">/);
});

test('CSS: todo url() aponta para arquivo existente (ou gerado no build); KaTeX só referencia fontes publicadas', () => {
  const css = [join(Q, 'css', 'base.css'), join(Q, 'css', 'app.css'), join(Q, 'vendor/katex/katex.min.css')];
  for (const f of css) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      let p = m[1];
      if (p.startsWith('data:')) continue;
      if (!p.startsWith('/')) p = '/' + join('quimica/vendor/katex', p).replace(/\\/g, '/');
      assert.ok(gerados(p) || existsSync(join(SRC, p)), `${f}: url() ausente ${p}`);
    }
  }
});

test('ícones usados existem; todas as rotas "/quimica/..." do código resolvem para uma tela ou arquivo', async () => {
  const { ICONES } = await import(pathToFileURL(join(Q, 'js/icons.js')).href);
  const { resolverRota } = await import(pathToFileURL(join(Q, 'js/app.js')).href);
  for (const f of todosJs()) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/\bicon\(\s*'([a-zA-Z]+)'/g)) assert.ok(ICONES.includes(m[1]), `${f}: ícone inexistente ${m[1]}`);
    for (const m of s.matchAll(/\bicone:\s*'([a-zA-Z]+)'/g)) assert.ok(ICONES.includes(m[1]), `${f}: ícone inexistente ${m[1]}`);
    for (const m of s.matchAll(/['"`](\/quimica\/[^'"`?#\s]*)/g)) {
      const p = m[1].replace(/\$\{[^}]*\}/g, '1').replace(/\/$/, ''); // "${...}" vira um valor qualquer que as rotas aceitam
      if (p === '/quimica' || gerados(p) || /\/quimica\/(js|css|vendor|data|brand|fonts)\//.test(m[1]) || p.endsWith('/sw.js') || p === '/quimica/privacidade') continue;
      assert.ok(resolverRota(p) || existsSync(join(SRC, p)), `${f}: rota sem tela ${m[1]}`);
    }
  }
  assert.ok(resolverRota('/quimica/elemento/Fe') && resolverRota('/quimica/composto/2244') && resolverRota('/quimica/calculadoras/ph'));
  assert.equal(resolverRota('/quimica/composto/abc'), null);
  assert.equal(resolverRota('/outra/coisa'), null);
});

test('bibliotecas vendorizadas: arquivo, licença MIT ao lado, versão declarada em VENDOR.md; fontes do KaTeX e pictogramas GHS presentes', async () => {
  const v = join(Q, 'vendor');
  for (const [dir, arquivos] of [['katex', ['katex.min.js', 'katex.min.css', 'LICENSE']], ['smiles-drawer', ['smiles-drawer.min.js', 'LICENSE']]]) {
    for (const a of arquivos) assert.ok(existsSync(join(v, dir, a)), `${dir}/${a}`);
    assert.match(readFileSync(join(v, dir, 'LICENSE'), 'utf8'), /MIT License|The MIT License/i);
  }
  const doc = readFileSync(join(v, 'VENDOR.md'), 'utf8');
  assert.match(doc, /smiles-drawer\*\* \| 2\.4\.1 \| MIT/);
  assert.match(doc, /KaTeX\*\* \| 0\.19\.0 \| MIT/);
  assert.match(readFileSync(join(v, 'katex/katex.min.js'), 'utf8').slice(0, 400), /katex/i);
  const fontes = readdirSync(join(v, 'katex/fonts'));
  assert.ok(fontes.length >= 11 && fontes.every((f) => f.endsWith('.woff2')));
  const { URL_KATEX, URL_KATEX_CSS, URL_SMILES } = await import(pathToFileURL(join(Q, 'js/vendor.js')).href);
  for (const u of [URL_KATEX, URL_KATEX_CSS, URL_SMILES]) assert.ok(existsSync(join(SRC, u)), u);
  assert.ok(!/sourceMappingURL/.test(readFileSync(join(v, 'smiles-drawer/smiles-drawer.min.js'), 'utf8')), 'sem referência a mapa inexistente');
  const { CODIGOS_PICTOGRAMA, NOMES_PICTOGRAMA, urlPictograma } = await import(pathToFileURL(join(Q, 'js/perigos.js')).href);
  assert.equal(CODIGOS_PICTOGRAMA.length, 9);
  for (const c of CODIGOS_PICTOGRAMA) {
    const arq = join(SRC, urlPictograma(c));
    assert.ok(existsSync(arq), c);
    const svg = readFileSync(arq, 'utf8');
    assert.match(svg, /<title id="t">GHS0\d/);
    assert.match(svg, /<desc id="d">/);
    assert.ok(NOMES_PICTOGRAMA[c]);
  }
});

test('SmilesDrawer vendorizado: sem estilo inline por atributo (a CSP bloqueia) nem anexo ao body', () => {
  const s = readFileSync(join(Q, 'vendor/smiles-drawer/smiles-drawer.min.js'), 'utf8');
  assert.ok(!/setAttributeNS\(null,"style"/.test(s), 'setAttributeNS(null,"style") reintroduzido');
  assert.ok(!/document\.body\.appendChild\(a\),this\.draw/.test(s));
});

test('manifesto web: campos exigidos, escopo /quimica/, ícones (any e maskable) e atalhos coerentes e existentes', () => {
  const m = JSON.parse(readFileSync(join(Q, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.name, 'SaibaTudo Química');
  assert.equal(m.id, '/quimica/');
  assert.equal(m.scope, '/quimica/');
  assert.equal(m.display, 'standalone');
  assert.equal(m.theme_color, '#0C2340');
  assert.equal(m.lang, 'pt-BR');
  assert.ok(m.start_url.startsWith('/quimica/') && m.start_url.includes('source=pwa'));
  assert.ok(m.background_color);
  const tamanhos = m.icons.map((i) => `${i.sizes}:${i.purpose}`);
  for (const t of ['192x192:any', '512x512:any', '192x192:maskable', '512x512:maskable']) assert.ok(tamanhos.includes(t), `ícone ${t}`);
  for (const i of m.icons) assert.ok(i.src.startsWith('/quimica/brand/'), i.src);
  assert.deepEqual(m.shortcuts.map((s) => s.name), ['Tabela periódica', 'Calculadoras', 'Compostos']);
  assert.ok(m.shortcuts.every((s) => s.url.startsWith('/quimica/')));
  // os ícones existem na marca do repositório (o build os copia para dist/quimica/brand)
  const brand = resolve(SRC, '../../brand');
  for (const i of m.icons) {
    const nome = i.src.split('/').pop();
    assert.ok(existsSync(join(brand, 'png', nome)) || existsSync(join(brand, nome)), `ícone ausente na marca: ${nome}`);
  }
});

test('marca: quimica-icon.svg com título e descrição; PNGs gerados nos tamanhos certos', () => {
  const brand = resolve(SRC, '../../brand');
  const svg = readFileSync(join(brand, 'quimica-icon.svg'), 'utf8');
  assert.match(svg, /<title id="t">SaibaTudo Química<\/title>/);
  assert.match(svg, /<desc id="d">/);
  const tam = (arq) => { const b = readFileSync(join(brand, 'png', arq)); assert.equal(b.subarray(1, 4).toString('latin1'), 'PNG'); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  assert.deepEqual(tam('pwa-quimica-192.png'), [192, 192]);
  assert.deepEqual(tam('pwa-quimica-512.png'), [512, 512]);
  assert.deepEqual(tam('pwa-quimica-maskable-512.png'), [512, 512]);
  assert.deepEqual(tam('apple-touch-icon-180.png'), [180, 180]);
  assert.deepEqual(tam('favicon-32.png'), [32, 32]);
  assert.deepEqual(tam('og-quimica-1200.png'), [1200, 1200]);
});
