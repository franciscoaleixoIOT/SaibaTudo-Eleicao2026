#!/usr/bin/env node
// Gera screenshots do site e do PWA com Chrome headless (protocolo CDP puro, sem dependências) e coleta erros de
// console/CSP. Requer o servidor local no ar:  node web/build.mjs && node web/serve.mjs
//
//   node web/tools/screenshots.mjs [url-base] [pasta-saida]
//   CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"  (padrão no Windows)
//
// Cenários: home, onboarding, lista, resposta da IA, detalhe do candidato, simulador da urna, configurações, sobre os dados;
// em 390×844 e 1280×800, tema claro e escuro (emulando prefers-color-scheme).
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const BASE = (process.argv[2] ?? 'http://localhost:4173').replace(/\/$/, '');
const SAIDA = resolve(process.argv[3] ?? join(aqui, '..', '.screenshots'));
const CHROME = process.env.CHROME ?? (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome');
const PORTA = 9333;
const ONLY = (process.env.ONLY ?? '').split(',').filter(Boolean);

mkdirSync(SAIDA, { recursive: true });
const perfil = mkdtempSync(join(tmpdir(), 'st-chrome-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORTA}`, `--user-data-dir=${perfil}`, '--no-first-run', '--no-default-browser-check',
  '--disable-gpu', '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank'
], { stdio: 'ignore' });

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
  if (d.method === 'Log.entryAdded' && ['error', 'warning'].includes(d.params.entry.level)) problemas.push(`[${contexto}] log ${d.params.entry.level}: ${d.params.entry.text} ${d.params.entry.url ?? ''}`);
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
  await cdp('Emulation.setDeviceMetricsOverride', { width: largura, height: altura, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: escuro ? 'dark' : 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
}
async function ir(caminho, { limpar = false, prefs = null } = {}) {
  await cdp('Page.navigate', { url: BASE + '/' });
  await esperar('document.readyState !== "loading"');
  if (limpar) await avaliar('localStorage.clear(); sessionStorage.clear(); true');
  if (prefs) await avaliar(`localStorage.setItem('st26:prefs', ${JSON.stringify(JSON.stringify(prefs))}); true`);
  await cdp('Page.navigate', { url: BASE + caminho });
  await esperar('document.readyState === "complete"');
}
async function foto(nome, { cheia = false } = {}) {
  await dormir(350);
  let params = { format: 'png' };
  if (cheia) {
    const m = await cdp('Page.getLayoutMetrics');
    const { width, height } = m.cssContentSize ?? m.contentSize;
    params = { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.min(height, 6000), scale: 1 } };
  }
  const r = await cdp('Page.captureScreenshot', params);
  writeFileSync(join(SAIDA, `${nome}.png`), Buffer.from(r.data, 'base64'));
  console.log('  ✔', nome);
}
const clicar = (sel) => avaliar(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) throw new Error('não achei ${sel.replace(/'/g, '')}'); e.click(); return true; })()`);

const PREFS = (extra = {}) => ({ onboardingConcluido: true, ufPadrao: 'SP', filtrarPorMinhaUf: true, ...extra });
const viewports = [
  { id: 'm', largura: 390, altura: 844, mobile: true },
  { id: 'd', largura: 1280, altura: 800, mobile: false }
];

for (const vp of viewports) {
  for (const escuro of [false, true]) {
    const tema = escuro ? 'escuro' : 'claro';
    const pref = `${vp.id}-${tema}`;
    await preparar({ ...vp, escuro });
    console.log(`\n== ${vp.largura}x${vp.altura} ${tema}`);
    const cenarios = {
      async home() {
        contexto = `home ${pref}`;
        await ir('/', { limpar: true });
        await esperar('document.querySelector(".hero")');
        await dormir(400);
        await foto(`${pref}-01-home`, { cheia: true });
      },
      async onboarding() {
        contexto = `onboarding ${pref}`;
        await ir('/eleicoes2026/', { limpar: true });
        await esperar('document.querySelector(".onboarding")');
        await foto(`${pref}-02-onboarding`, { cheia: vp.mobile });
      },
      async onboardinggeo() {
        // localização aproximada EMULADA (São Paulo) com permissão concedida: o estado vem pré-selecionado
        contexto = `onboardinggeo ${pref}`;
        await cdp('Browser.grantPermissions', { origin: BASE, permissions: ['geolocation'] });
        await cdp('Emulation.setGeolocationOverride', { latitude: -23.5505, longitude: -46.6333, accuracy: 3000 });
        try {
          await ir('/eleicoes2026/', { limpar: true });
          await esperar('document.querySelector(".onboarding .chip.on") && document.querySelector(".geo-status").textContent.includes("São Paulo")');
          const sel = await avaliar('document.querySelector(".onboarding .chip.on").textContent');
          if (sel !== 'SP') throw new Error(`UF pré-selecionada ${sel}`);
          await foto(`${pref}-02b-onboarding-localizacao`, { cheia: vp.mobile });
          // "Começar" grava só a sigla
          await clicar('.onboarding .btn-primario');
          await esperar('JSON.parse(localStorage.getItem("st26:prefs") || "{}").ufPadrao === "SP"');
          const salvo = await avaliar('localStorage.getItem("st26:prefs") + JSON.stringify(Object.keys(localStorage))');
          if (/-23\.5|-46\.6|latitude|longitude/i.test(salvo)) throw new Error('coordenadas no armazenamento');
        } finally {
          await cdp('Emulation.clearGeolocationOverride');
          await cdp('Browser.resetPermissions');
        }
      },
      async onboardingnegado() {
        // permissão negada antes: nenhuma tentativa automática; o botão explica e a escolha segue manual
        contexto = `onboardingnegado ${pref}`;
        await cdp('Browser.setPermission', { origin: BASE, permission: { name: 'geolocation' }, setting: 'denied' });
        try {
          await ir('/eleicoes2026/', { limpar: true });
          await esperar('document.querySelector(".onboarding .geo-acao button")');
          await dormir(800);
          if (await avaliar('!!document.querySelector(".onboarding .chip.on") || document.querySelector(".geo-status").textContent !== ""')) throw new Error('tentativa automática com permissão negada');
          await clicar('.onboarding .geo-acao button');
          await esperar('document.querySelector(".geo-status").textContent.startsWith("Sem permissão")');
          await foto(`${pref}-02c-onboarding-negado`);
        } finally {
          await cdp('Browser.resetPermissions');
        }
      },
      async dialogouf() {
        // "Escolha seu estado" (Configurações › Meu estado): negado → mensagem curta; concedido (SP emulado) → escolhe e confirma
        contexto = `dialogouf ${pref}`;
        await cdp('Browser.setPermission', { origin: BASE, permission: { name: 'geolocation' }, setting: 'denied' });
        try {
          await ir('/eleicoes2026/configuracoes', { limpar: true, prefs: PREFS({ ufPadrao: null, filtrarPorMinhaUf: false }) });
          await esperar('document.querySelector(".tela-corpo .linha-link")');
          await clicar('.tela-corpo .linha-link');
          await esperar('document.querySelector("dialog.modal[open] .geo-acao button")');
          await clicar('dialog.modal[open] .geo-acao button');
          await esperar('document.querySelector("dialog.modal[open] .geo-status").textContent.startsWith("Sem permissão")');
          await foto(`${pref}-08c-escolher-estado-negado`);
          await cdp('Browser.grantPermissions', { origin: BASE, permissions: ['geolocation'] });
          await cdp('Emulation.setGeolocationOverride', { latitude: -23.5505, longitude: -46.6333, accuracy: 3000 });
          await clicar('dialog.modal[open] .geo-acao button');
          await esperar('!document.querySelector("dialog.modal[open]") && document.querySelector(".tela-corpo .linha-link").textContent.includes("São Paulo")');
          await esperar('document.querySelector("#toast.on") && document.querySelector("#toast").textContent.includes("São Paulo")');
          await foto(`${pref}-08d-escolher-estado-localizacao`);
        } finally {
          await cdp('Emulation.clearGeolocationOverride');
          await cdp('Browser.resetPermissions');
        }
      },
      async camposlongos() {
        // texto longo: pergunta inicial (Configurações, até 4 linhas) e caixa de pergunta (até 3 linhas) crescem e não cortam o fim
        contexto = `camposlongos ${pref}`;
        const longa = 'Quais candidatos a deputado federal do meu estado já foram eleitos antes e têm plano de governo registrado no TSE?';
        await ir('/eleicoes2026/configuracoes', { limpar: true, prefs: PREFS({ perguntaInicial: longa.slice(0, 120) }) });
        await esperar('document.querySelector("textarea#cfg-pergunta")');
        await dormir(200);
        const cfg = await avaliar('(() => { const t = document.querySelector("#cfg-pergunta"); return { h: t.clientHeight, s: t.scrollHeight, v: t.value }; })()');
        if (cfg.s > cfg.h + 1) throw new Error(`pergunta inicial cortada ${JSON.stringify(cfg)}`);
        await avaliar('document.querySelector("#cfg-pergunta").scrollIntoView({ block: "center" }); true');
        await foto(`${pref}-08b-pergunta-inicial-longa`);
        await ir('/eleicoes2026/', { limpar: true, prefs: PREFS() });
        await esperar('document.querySelector("#campo-busca") && document.querySelectorAll(".cand").length > 3');
        await avaliar(`(() => { const c = document.querySelector('#campo-busca'); c.focus(); c.value = ${JSON.stringify(longa + '\n' + longa)}; c.dispatchEvent(new Event('input', {bubbles:true})); return true; })()`);
        const busca = await avaliar('(() => { const t = document.querySelector("#campo-busca"); const cs = getComputedStyle(t); return { h: t.clientHeight, v: t.value, linhas: Math.round((t.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) / parseFloat(cs.lineHeight)) }; })()');
        if (busca.linhas !== 3) throw new Error(`caixa de pergunta com ${busca.linhas} linhas (esperado: 3, depois rola)`);
        if (busca.v.includes('\n')) throw new Error('quebra de linha não removida');
        await foto(`${pref}-04f-pergunta-longa`);
        // Enter envia (sem inserir quebra de linha)
        await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
        await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
        await esperar('document.querySelector(".resposta")');
        if ((await avaliar('document.querySelector("#campo-busca").value')).includes('\n')) throw new Error('Enter inseriu quebra de linha');
        console.log('    campos:', JSON.stringify({ cfg: { h: cfg.h, s: cfg.s }, busca: { h: busca.h, linhas: busca.linhas } }));
      },
      async lista() {
        contexto = `lista ${pref}`;
        await ir('/eleicoes2026/', { limpar: true, prefs: PREFS() });
        await esperar('document.querySelectorAll(".cand").length > 3');
        await foto(`${pref}-03-lista`);
        if (vp.mobile) await foto(`${pref}-03b-lista-cheia`, { cheia: true });
      },
      async ia() {
        contexto = `ia ${pref}`;
        await ir('/eleicoes2026/', { limpar: true, prefs: PREFS() });
        await esperar('document.querySelector("#campo-busca") && document.querySelectorAll(".cand").length > 3');
        await avaliar(`(() => { const c = document.querySelector('#campo-busca'); c.value = 'Quem disputa a Presidência em 2026?'; c.dispatchEvent(new Event('input', {bubbles:true})); document.querySelector('.busca-form').requestSubmit(); return true; })()`);
        await esperar('document.querySelector(".resposta")');
        await foto(`${pref}-04-resposta-ia`);
        if (vp.mobile) await foto(`${pref}-04b-resposta-ia-cheia`, { cheia: true });
      },
      async meuestado() {
        // "Meu estado" ligado vale para cargos estaduais sem UF na pergunta (paridade com o Android)
        contexto = `meuestado ${pref}`;
        await ir('/eleicoes2026/', { limpar: true, prefs: PREFS() });
        await esperar('document.querySelector("#campo-busca") && document.querySelectorAll(".cand").length > 3');
        await avaliar(`(() => { const c = document.querySelector('#campo-busca'); c.value = 'Candidatos a governador'; c.dispatchEvent(new Event('input', {bubbles:true})); document.querySelector('.busca-form').requestSubmit(); return true; })()`);
        await esperar('document.querySelector(".resp-txt") && document.querySelector(".resp-txt").textContent.includes("Filtrado pelo seu estado (SP)")');
        await esperar('document.querySelector("#contagem") && !document.querySelector("#carga-msg").textContent');
        await foto(`${pref}-04c-meu-estado`);
      },
      async fichalimpa() {
        // resposta em linhas (título, campos com rótulo em negrito, link) + filtro "Indeferidos / inelegíveis" vindo da IA
        contexto = `fichalimpa ${pref}`;
        await ir('/eleicoes2026/', { limpar: true, prefs: PREFS() });
        await esperar('document.querySelector("#campo-busca") && document.querySelectorAll(".cand").length > 3');
        await avaliar(`(() => { const c = document.querySelector('#campo-busca'); c.value = 'haddad é ficha limpa?'; c.dispatchEvent(new Event('input', {bubbles:true})); document.querySelector('.busca-form').requestSubmit(); return true; })()`);
        await esperar('document.querySelector(".resp-l1") && document.querySelector(".resp-txt strong") && document.querySelector(".resp-txt a[href^=\\"https://\\"]")');
        await foto(`${pref}-04d-ficha-limpa`);
        // sugestão da própria resposta: segue o mesmo fluxo da pergunta digitada
        await avaliar(`(() => { const b = [...document.querySelectorAll('.resp-acoes .chip.sug')].find((x) => x.textContent.startsWith('Ficha Limpa dos candidatos')); if (!b) throw new Error('sem sugestão'); b.click(); return true; })()`);
        await esperar('document.querySelector(".resp-l1") && document.querySelector(".resp-l1").textContent.startsWith("Ficha Limpa")');
        await avaliar(`(() => { const c = document.querySelector('#campo-busca'); c.value = 'candidatos inelegíveis'; c.dispatchEvent(new Event('input', {bubbles:true})); document.querySelector('.busca-form').requestSubmit(); return true; })()`);
        await esperar('document.querySelector(".resp-lista li") && document.querySelector(".tag-ficha-imp")');
        await foto(`${pref}-04e-inelegiveis`);
      },
      async simuladorpergunta() {
        // "Simular voto em LULA (13)": a resposta abre o simulador com o candidato citado
        contexto = `simuladorpergunta ${pref}`;
        await ir('/eleicoes2026/', { limpar: true, prefs: PREFS() });
        await esperar('document.querySelector("#campo-busca") && document.querySelectorAll(".cand").length > 3');
        await avaliar(`(() => { const c = document.querySelector('#campo-busca'); c.value = 'Simular voto em LULA (13)'; c.dispatchEvent(new Event('input', {bubbles:true})); document.querySelector('.busca-form').requestSubmit(); return true; })()`);
        await esperar('document.querySelector("dialog.modal-urna[open]") && document.querySelector(".urna-nome") && document.querySelector(".urna-nome").textContent.includes("LULA")');
        await foto(`${pref}-07b-urna-pela-pergunta`);
      },
      async filtros() {
        contexto = `filtros ${pref}`;
        await ir('/eleicoes2026/', { limpar: true, prefs: PREFS() });
        await esperar('document.querySelectorAll(".cand").length > 3');
        await clicar('.filtros-cab .btn-texto');
        await dormir(300);
        await foto(`${pref}-05-filtros`, { cheia: vp.mobile });
      },
      async detalhe() {
        contexto = `detalhe ${pref}`;
        await ir('/eleicoes2026/presidente', { limpar: true, prefs: PREFS() });
        await esperar('document.querySelectorAll(".cand").length > 3');
        await clicar('.cand .cand-link');
        await esperar('document.querySelector("dialog.modal[open]")');
        await foto(`${pref}-06-detalhe`);
      },
      async urna() {
        contexto = `urna ${pref}`;
        await ir('/eleicoes2026/', { limpar: true, prefs: PREFS() });
        await esperar('document.querySelectorAll(".cand").length > 3');
        await clicar('.btn-simulador');
        await esperar('document.querySelector("dialog.modal-urna[open]")');
        await avaliar(`(() => { for (const n of ['1','3']) document.querySelector('.urna-tecla.t'+n).click(); return true; })()`);
        await esperar('document.querySelector(".urna-dig")');
        await foto(`${pref}-07-urna`);
      },
      async configuracoes() {
        contexto = `config ${pref}`;
        await ir('/eleicoes2026/configuracoes', { limpar: true, prefs: PREFS() });
        await esperar('document.querySelector(".tela-corpo")');
        await foto(`${pref}-08-configuracoes`, { cheia: vp.mobile });
      },
      async offline() {
        // service worker: depois de duas visitas online, o app abre sem rede (shell + dados em cache)
        contexto = `offline ${pref}`;
        await ir('/eleicoes2026/', { limpar: true, prefs: PREFS() });
        await esperar('document.querySelectorAll(".cand").length > 3');
        await avaliar('navigator.serviceWorker.ready.then(() => true)');
        await cdp('Page.navigate', { url: BASE + '/eleicoes2026/' });
        await esperar('navigator.serviceWorker.controller && document.querySelectorAll(".cand").length > 3');
        await dormir(1200);
        await cdp('Network.enable');
        await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
        await cdp('Page.navigate', { url: BASE + '/eleicoes2026/presidente' });
        await esperar('document.querySelectorAll(".cand").length > 3', 20000);
        await foto(`${pref}-10-offline`);
        await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      },
      async apuracao() {
        // dia da votação (data simulada no navegador) + JSON de apuração do TSE interceptado: valida o fluxo "resultados ao vivo" na interface
        contexto = `apuracao ${pref}`;
        const fixture = readFileSync(join(aqui, '..', 'test', 'fixtures', 'tse_apuracao_presidente.json'));
        const relogio = "(()=>{const R=Date;const off=new R('2026-10-04T20:00:00-03:00').getTime()-R.now();class F extends R{constructor(...a){if(a.length)super(...a);else super(R.now()+off)}static now(){return R.now()+off}}globalThis.Date=F})()";
        const { identifier } = await cdp('Page.addScriptToEvaluateOnNewDocument', { source: relogio });
        const aoInterceptar = async (m) => {
          const d = JSON.parse(m.data);
          if (d.method !== 'Fetch.requestPaused') return;
          await cdp('Fetch.fulfillRequest', { requestId: d.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: fixture.toString('base64') });
        };
        ws.addEventListener('message', aoInterceptar);
        await cdp('Fetch.enable', { patterns: [{ urlPattern: 'https://resultados.tse.jus.br/*' }] });
        try {
          await ir('/eleicoes2026/', { limpar: true, prefs: PREFS() });
          await esperar('document.querySelectorAll(".cand").length > 3');
          await esperar('document.querySelector(".fase.destaque")');
          await clicar('.menu-card:first-child');
          await esperar('document.querySelector(".apuracao table")');
          await dormir(300);
          await foto(`${pref}-11-apuracao-SIMULADA`);
        } finally {
          await cdp('Fetch.disable');
          ws.removeEventListener('message', aoInterceptar);
          await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier });
        }
      },
      async sobre() {
        contexto = `sobre ${pref}`;
        await ir('/eleicoes2026/sobre-os-dados', { limpar: true, prefs: PREFS() });
        await esperar('document.querySelector(".tela-corpo .kv")');
        await foto(`${pref}-09-sobre-os-dados`, { cheia: vp.mobile });
      }
    };
    for (const [nome, fn] of Object.entries(cenarios)) {
      if (ONLY.length && !ONLY.includes(nome)) continue;
      try { await fn(); } catch (e) {
        problemas.push(`[${nome} ${pref}] FALHA: ${e.message}`); console.log('  ✖', nome, e.message);
        try { console.log('    texto da página:', JSON.stringify((await avaliar('document.body.innerText')).slice(0, 300))); await foto(`FALHA-${nome}-${pref}`); } catch { /* sem diagnóstico */ }
      }
    }
  }
}

ws.close();
chrome.kill();
await dormir(500);
try { rmSync(perfil, { recursive: true, force: true }); } catch { /* arquivos em uso no Windows */ }
console.log(`\nScreenshots em ${SAIDA}`);
if (problemas.length) { console.log(`\n${problemas.length} problema(s) de console/execução:`); for (const p of [...new Set(problemas)]) console.log(' -', p); process.exitCode = 1; }
else console.log('Sem erros de console/CSP.');
