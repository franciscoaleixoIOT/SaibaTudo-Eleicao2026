#!/usr/bin/env node
// Verificação no navegador real: abre o site em Chrome headless (protocolo CDP puro, sem dependências), percorre as telas e as calculadoras,
// coleta erros de console e violações da CSP e grava screenshots. Requer o servidor local no ar:
//
//   DATA_DIR=web/test/fixtures/data-quimica node web/build.mjs && node web/serve.mjs      (outro terminal)
//   node web/tools/screenshots.mjs [url-base] [pasta-saida]
//   CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"  (padrão no Windows)
//   ONLY=inicio,tabela   limita os cenários
//
// Sai com código 1 se houver exceção, console.error ou violação de CSP.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const BASE = (process.argv[2] ?? 'http://localhost:4173').replace(/\/$/, '');
const SAIDA = resolve(process.argv[3] ?? join(aqui, '..', '.screenshots'));
const CHROME = process.env.CHROME ?? (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome');
const PORTA = 9334;
const ONLY = (process.env.ONLY ?? '').split(',').filter(Boolean);

mkdirSync(SAIDA, { recursive: true });
const perfil = mkdtempSync(join(tmpdir(), 'stq-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORTA}`, `--user-data-dir=${perfil}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function conectar() {
  for (let i = 0; i < 60; i++) {
    try {
      const alvos = await (await fetch(`http://127.0.0.1:${PORTA}/json`)).json();
      const pag = alvos.find((a) => a.type === 'page');
      if (pag) return pag.webSocketDebuggerUrl;
    } catch { /* ainda subindo */ }
    await dormir(250);
  }
  throw new Error('Chrome não respondeu no CDP');
}

const ws = new WebSocket(await conectar());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pend = new Map();
const problemas = [];
let contexto = '';
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { const { ok, err } = pend.get(d.id); pend.delete(d.id); d.error ? err(new Error(d.error.message)) : ok(d.result); return; }
  if (d.method === 'Runtime.exceptionThrown') problemas.push(`[${contexto}] exceção: ${d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text}`);
  if (d.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(d.params.type)) problemas.push(`[${contexto}] console.${d.params.type}: ${d.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  if (d.method === 'Log.entryAdded' && ['error', 'warning'].includes(d.params.entry.level) && !/willReadFrequently/.test(d.params.entry.text)) problemas.push(`[${contexto}] log ${d.params.entry.level}: ${d.params.entry.text} ${d.params.entry.url ?? ''}`);
});
const cdp = (method, params = {}) => new Promise((ok, err) => { const id = ++seq; pend.set(id, { ok, err }); ws.send(JSON.stringify({ id, method, params })); });
const avaliar = async (expressao) => {
  const r = await cdp('Runtime.evaluate', { expression: expressao, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
async function esperar(expr, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (await avaliar(`!!(${expr})`)) return true; } catch { /* página navegando */ }
    await dormir(150);
  }
  throw new Error(`timeout esperando: ${expr}`);
}
await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Log.enable');

async function preparar({ largura, altura, escuro, mobile }) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: largura, height: altura, deviceScaleFactor: 1, mobile });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: escuro ? 'dark' : 'light' }] });
}
async function foto(nome) {
  const m = await cdp('Page.getLayoutMetrics');
  const w = Math.ceil(m.cssContentSize?.width ?? m.contentSize.width);
  const alt = Math.min(Math.ceil(m.cssContentSize?.height ?? m.contentSize.height), 3400);
  const r = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: alt, scale: 1 } });
  writeFileSync(join(SAIDA, `${nome}.png`), Buffer.from(r.data, 'base64'));
}
async function abrir(caminho, esperarExpr) {
  await cdp('Page.navigate', { url: BASE + caminho });
  await esperar(esperarExpr ?? "document.querySelector('#conteudo')?.children.length > 0");
  await dormir(400);
}
const clicar = (sel) => avaliar(`document.querySelector(${JSON.stringify(sel)}).click()`);
const digitar = (sel, texto) => avaliar(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.focus(); e.value = ${JSON.stringify(texto)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const texto = (sel) => avaliar(`document.querySelector(${JSON.stringify(sel)})?.innerText ?? ''`);

const CENARIOS = {
  async inicio(p) {
    await abrir('/quimica/', "document.querySelector('#pergunta')");
    await foto(`${p}-inicio`);
    await digitar('#pergunta', 'massa molar da água');
    await avaliar("document.querySelector('form.busca-form').requestSubmit()");
    await esperar("document.querySelector('.resposta .katex')");
    await foto(`${p}-resposta-massa-molar`);
    await digitar('#pergunta', 'Por que não misturar água sanitária com amoníaco?');
    await avaliar("document.querySelector('form.busca-form').requestSubmit()");
    await esperar("document.querySelector('.resposta .picto img')");
    await dormir(300);
    await foto(`${p}-resposta-seguranca`);
    await digitar('#pergunta', 'como fazer metanfetamina?');
    await avaliar("document.querySelector('form.busca-form').requestSubmit()");
    await esperar("document.querySelector('.resposta.recusa')");
    await foto(`${p}-recusa`);
  },
  async tabela(p) {
    await abrir('/quimica/tabela', "document.querySelector('.tp-grade .el')");
    await foto(`${p}-tabela`);
    await abrir('/quimica/tabela?categoria=halogenio', "document.querySelector('.tp-grade .el')");
    await foto(`${p}-tabela-filtro`);
    await clicar('button.el[data-simbolo="Fe"]');
    await esperar("document.querySelector('.ficha-cab')");
    await foto(`${p}-elemento-ferro`);
  },
  async compostos(p) {
    await abrir('/quimica/compostos?q=aspirina', "document.querySelector('.lista-resultados li')");
    await foto(`${p}-compostos-busca`);
    await abrir('/quimica/composto/2244', "document.querySelector('canvas.molecula')");
    await esperar("(() => { const c = document.querySelector('canvas.molecula'); if (!c) return false; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true; return false; })()", 20000);
    await foto(`${p}-composto-aspirina`);
    await abrir('/quimica/composto/1118', "document.querySelector('.picto img')");
    await dormir(300);
    await foto(`${p}-composto-sulfurico`);
  },
  async calculadoras(p) {
    await abrir('/quimica/calculadoras');
    await foto(`${p}-calculadoras`);
    await abrir('/quimica/calculadoras/balanceamento?eq=' + encodeURIComponent('C8H18 + O2 -> CO2 + H2O'), "document.querySelector('.res-calc .katex')");
    await foto(`${p}-calc-balanceamento`);
    await abrir('/quimica/calculadoras/massa-molar?f=' + encodeURIComponent('CuSO4·5H2O'), "document.querySelector('.res-calc .katex')");
    await foto(`${p}-calc-massa-molar`);
    await abrir('/quimica/calculadoras/estequiometria');
    await avaliar("(() => { const s = document.querySelector('.form-calc select'); s.value = 'reacao'; s.dispatchEvent(new Event('change', { bubbles: true })); })()");
    await digitar('.form-calc input[type=text]', 'H2 + O2 -> H2O');
    await dormir(200);
    await avaliar("(() => { const i = [...document.querySelectorAll('.form-calc input[type=text]')]; i[1].value = '4'; i[2].value = '16'; })()");
    await avaliar("document.querySelector('.form-calc').requestSubmit()");
    await esperar("document.querySelector('.res-calc .katex')");
    await foto(`${p}-calc-estequiometria`);
    await abrir('/quimica/calculadoras/ph');
    await digitar('.form-calc input[type=text]', '0,01');
    await avaliar("document.querySelector('.form-calc').requestSubmit()");
    await esperar("document.querySelector('.res-calc .katex')");
    await foto(`${p}-calc-ph`);
    await abrir('/quimica/calculadoras/gas-ideal');
    await avaliar("(() => { const i = [...document.querySelectorAll('.form-calc input[type=text]')]; i[0].value = '1'; i[1].value = '1'; i[2].value = '298,15'; })()");
    await avaliar("(() => { const s = document.querySelector('.form-calc select'); s.value = 'n'; s.dispatchEvent(new Event('change', { bubbles: true })); })()");
    await avaliar("(() => { const i = [...document.querySelectorAll('.form-calc input[type=text]:not(:disabled)')]; i[0].value = '1'; i[1].value = '1'; i[2].value = '298,15'; })()");
    await avaliar("document.querySelector('.form-calc').requestSubmit()");
    await esperar("document.querySelector('.res-calc')");
    await foto(`${p}-calc-gas`);
    await abrir('/quimica/calculadoras/concentracao');
    await avaliar("(() => { const i = [...document.querySelectorAll('.form-calc input[type=text]')]; i[0].value = 'NaCl'; i[1].value = '5,85'; i[2].value = '500'; })()");
    await avaliar("document.querySelector('.form-calc').requestSubmit()");
    await esperar("document.querySelector('.res-calc .katex')");
    await abrir('/quimica/calculadoras/unidades');
    await avaliar("document.querySelector('.form-calc').requestSubmit()");
    await esperar("document.querySelector('.res-calc .katex')");
    await foto(`${p}-calc-unidades`);
  },
  async offline(p) {
    // instala o service worker, visita as telas online (para guardar o lote do composto) e recarrega SEM rede
    await abrir('/quimica/', "document.querySelector('#pergunta')");
    await esperar("navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true)", 20000);
    await avaliar("navigator.serviceWorker.ready.then((r) => r.active.state)");
    await dormir(1500); // pré-cache terminando
    await abrir('/quimica/composto/1118', "document.querySelector('.picto img')");
    await dormir(500);
    await cdp('Network.enable');
    await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    try {
      await abrir('/quimica/tabela', "document.querySelector('.tp-grade .el')");
      await abrir('/quimica/composto/1118', "document.querySelector('canvas.molecula')");
      await esperar("(() => { const c = document.querySelector('canvas.molecula'); if (!c) return false; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true; return false; })()", 20000);
      if (!(await texto('#titulo-pagina')).includes('Ácido sulfúrico')) throw new Error('ficha offline sem o título');
      await abrir('/quimica/calculadoras/balanceamento?eq=' + encodeURIComponent('Fe + O2 -> Fe2O3'), "document.querySelector('.res-calc .katex')");
      await abrir('/quimica/privacidade', "document.querySelector('main h1')");
      await foto(`${p}-offline-privacidade`);
    } finally {
      await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    }
  },
  async paginas(p) {
    await abrir('/quimica/seguranca');
    await foto(`${p}-seguranca`);
    await abrir('/quimica/sobre-os-dados');
    await foto(`${p}-sobre-os-dados`);
    await abrir('/quimica/configuracoes');
    await foto(`${p}-configuracoes`);
    await abrir('/quimica/privacidade', "document.querySelector('main h1')");
    await foto(`${p}-privacidade`);
  }
};

const VISTAS = [
  { prefixo: 'mobile-claro', largura: 390, altura: 844, escuro: false, mobile: true },
  { prefixo: 'desktop-escuro', largura: 1280, altura: 800, escuro: true, mobile: false }
];
try {
  for (const v of VISTAS) {
    await preparar(v);
    for (const [nome, fn] of Object.entries(CENARIOS)) {
      if (ONLY.length && !ONLY.includes(nome)) continue;
      contexto = `${v.prefixo}/${nome}`;
      try { await fn(v.prefixo); console.log(`✔ ${contexto}`); } catch (e) { problemas.push(`[${contexto}] cenário falhou: ${e.message}`); console.log(`✖ ${contexto}: ${e.message}`); try { await foto(`${v.prefixo}-FALHA-${nome}`); } catch { /* ignorado */ } }
    }
  }
} finally {
  chrome.kill();
  await dormir(300);
  try { rmSync(perfil, { recursive: true, force: true }); } catch { /* arquivos em uso no Windows */ }
}
const unicos = [...new Set(problemas)];
if (unicos.length) { console.log(`\n${unicos.length} problema(s):\n- ${unicos.join('\n- ')}`); process.exit(1); }
console.log(`\nSem erros de console nem violações de CSP. Screenshots em ${SAIDA}`);
