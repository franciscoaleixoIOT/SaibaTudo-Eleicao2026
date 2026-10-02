// Garante que todos os módulos da interface carregam (imports/exports consistentes) e que os HTML referenciam arquivos existentes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(aqui, '../src');
const js = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? js(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : []);

test('todos os módulos JS do app carregam sem erro de import/export', async () => {
  for (const f of js(join(SRC, 'eleicoes2026', 'js'))) {
    if (f.endsWith('main.js')) continue; // inicia o app ao ser importado (precisa de DOM)
    await import(pathToFileURL(f).href);
  }
});

test('imports relativos de cada módulo apontam para arquivos existentes e exportam o que é importado', async () => {
  for (const f of js(join(SRC, 'eleicoes2026', 'js'))) {
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

test('páginas HTML: lang pt-BR, viewport, e todos os recursos locais referenciados existem no src ou são gerados no build', () => {
  const geradosNoBuild = (p) => p.startsWith('/brand/') || p.startsWith('/fonts/') || p.startsWith('/data/');
  for (const pagina of ['index.html', 'privacidade/index.html', 'sobre-os-dados/index.html', 'eleicoes2026/index.html', 'eleicoes2026/offline.html']) {
    const html = readFileSync(join(SRC, pagina), 'utf8');
    assert.match(html, /<html lang="pt-BR">/, pagina);
    assert.match(html, /name="viewport"/, pagina);
    assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>[^<]/i.test(html.replace(/<script[^>]*type="application\/ld\+json"[\s\S]*?<\/script>/g, '')), `${pagina}: script inline viola a CSP`);
    assert.ok(!/\sstyle=/.test(html), `${pagina}: atributo style viola a CSP`);
    for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)"/g)) {
      const p = m[1];
      if (geradosNoBuild(p) || ['/', '/privacidade', '/sobre-os-dados'].includes(p) || /^\/eleicoes2026\/[^.]*$/.test(p)) continue; // rotas do SPA e páginas limpas
      assert.ok(existsSync(join(SRC, p)) || existsSync(join(SRC, p, 'index.html')), `${pagina}: recurso ausente ${p}`);
    }
  }
});

test('privacidade: a página espelha docs/PRIVACIDADE.md (versão e localização aproximada) e nenhum texto do app ainda diz "não usamos GPS"', () => {
  const md = readFileSync(resolve(SRC, '../../docs/PRIVACIDADE.md'), 'utf8');
  const html = readFileSync(join(SRC, 'privacidade/index.html'), 'utf8');
  const versao = /\*\*Versão (\d+\.\d+) — ([^*]+)\*\*/.exec(md);
  assert.ok(versao, 'versão no markdown');
  assert.ok(html.includes(`<strong>Versão ${versao[1]} — ${versao[2]}</strong>`), `a página deve estar na versão ${versao[1]}`);
  const semMarcacao = (s) => s.replace(/<[^>]+>|\*\*/g, '').replace(/\s+/g, ' ');
  const paragrafo = semMarcacao(/\*\*Localização aproximada[\s\S]*?(?:\r?\n\r?\n)/.exec(md)?.[0] ?? '').trim();
  assert.ok(paragrafo.length > 100, 'parágrafo de localização no markdown');
  assert.ok(semMarcacao(html).includes(paragrafo), 'parágrafo "Localização aproximada" idêntico na página');
  for (const f of [...js(join(SRC, 'eleicoes2026', 'js')), join(SRC, 'privacidade/index.html')]) {
    assert.ok(!/não usa(mos)? GPS|Nunca é detectada por geolocalização/i.test(readFileSync(f, 'utf8')), `${f}: texto antigo sobre GPS`);
  }
});

test('privacidade: os trechos sobre a IA na nuvem (resumo, tabela, parágrafo e base legal) são idênticos a docs/PRIVACIDADE.md', () => {
  const md = readFileSync(resolve(SRC, '../../docs/PRIVACIDADE.md'), 'utf8').replace(/\r\n/g, '\n');
  const html = readFileSync(join(SRC, 'privacidade/index.html'), 'utf8');
  // texto sem marcação: tags HTML, ênfase/código do markdown e o "> " das citações
  const texto = (s) => s.replace(/<[^>]+>/g, '').replace(/^> ?/gm, '').replace(/[*`]/g, '').replace(/\s+/g, ' ').trim();
  const pagina = texto(html);
  const trechos = {
    resumo: /^> \*\*Em uma frase:\*\*[\s\S]*?\n\n/m.exec(md)?.[0],
    paragrafo: /^\*\*IA na nuvem\.\*\*[\s\S]*?\n\n/m.exec(md)?.[0],
    baseLegal: /^## 6\.[^\n]*\n([\s\S]*?)\n\n/m.exec(md)?.[1]
  };
  for (const [nome, t] of Object.entries(trechos)) {
    assert.ok(t && texto(t).length > 80, `${nome}: trecho não encontrado no markdown`);
    assert.ok(pagina.includes(texto(t)), `${nome}: texto diferente na página — esperado "${texto(t)}"`);
  }
  assert.match(texto(trechos.resumo), /se você pedir ajuda da "IA na nuvem" \(pelo botão em uma pergunta ou ligando o modo automático\)/);
  // linha "IA na nuvem (opcional)" da tabela de conexões: célula a célula
  const linhaMd = md.split('\n').find((l) => l.startsWith('| **IA na nuvem (opcional)**'));
  assert.ok(linhaMd, 'linha da IA na nuvem na tabela do markdown');
  const celulasMd = linhaMd.split('|').slice(1, -1).map(texto);
  const linhaHtml = /<tr><td><strong>IA na nuvem \(opcional\)<\/strong><\/td>[\s\S]*?<\/tr>/.exec(html)?.[0] ?? '';
  const celulasHtml = [...linhaHtml.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((m) => texto(m[1]));
  assert.deepEqual(celulasHtml, celulasMd);
  assert.match(celulasMd[3], /^somente quando você toca em "Perguntar à IA na nuvem" \(vai só aquela pergunta\) ou se você ligar o modo automático/);
  // ênfase do markdown convertida em HTML (sem asteriscos soltos nos trechos da IA na nuvem)
  assert.ok(!html.includes('*Configurações › IA na nuvem automática*'), 'ênfase em markdown não convertida');
  assert.equal([...html.matchAll(/<em>Configurações › IA na nuvem automática<\/em>/g)].length, 2);
  assert.equal([...html.matchAll(/<strong>somente quando você toca em "Perguntar à IA na nuvem"<\/strong>/g)].length, 1);
});

test('manifestos web: campos exigidos e ícones/atalhos coerentes', () => {
  for (const [arq, escopo, nome] of [['eleicoes2026/manifest.webmanifest', '/eleicoes2026/', 'SaibaTudo Eleições 2026'], ['manifest.webmanifest', '/', 'SaibaTudo']]) {
    const m = JSON.parse(readFileSync(join(SRC, arq), 'utf8'));
    assert.equal(m.name, nome);
    assert.equal(m.short_name, 'SaibaTudo');
    assert.equal(m.scope, escopo);
    assert.equal(m.display, 'standalone');
    assert.equal(m.theme_color, '#0C2340');
    assert.equal(m.lang, 'pt-BR');
    assert.ok(m.start_url.startsWith(escopo) && m.start_url.includes('source=pwa'));
    assert.ok(m.background_color);
    const tamanhos = m.icons.map((i) => `${i.sizes}:${i.purpose}`);
    for (const t of ['192x192:any', '512x512:any', '192x192:maskable', '512x512:maskable']) assert.ok(tamanhos.includes(t), `${arq}: ícone ${t}`);
  }
  const app = JSON.parse(readFileSync(join(SRC, 'eleicoes2026/manifest.webmanifest'), 'utf8'));
  assert.deepEqual(app.shortcuts.map((s) => s.name), ['Presidente', 'Governador', 'Pesquisas']);
  assert.ok(app.shortcuts.every((s) => s.url.startsWith('/eleicoes2026/')));
});
