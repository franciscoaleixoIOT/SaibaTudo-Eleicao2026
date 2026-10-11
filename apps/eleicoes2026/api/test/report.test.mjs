import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIssue, createReportHandler, createReportState } from '../_lib/report-handler.js';
import {
  ZWSP, codeFence, neutralizeMentions, neutralizeRefs, redactPii, sanitizeFreeText, truncate,
} from '../_lib/sanitize.js';
import { capturarLog, fakeNodeReq, fakeNodeRes, mkRequest, relogio } from './_helpers.mjs';

const ENV = Object.freeze({ GITHUB_TOKEN: 'ghp_teste_token', GITHUB_REPO: 'franciscoaleixoIOT/SaibaTudo' });

const relato = (over = {}) => ({
  q: 'Quem vai ganhar a eleição?',
  a: 'Não faço previsões. Veja os candidatos oficiais.',
  intent: 'RECOMENDACAO',
  origem: 'LOCAL',
  dataVersion: '20261001T164600Z-9fe2c36a1f68',
  app: 'android 1.0.0 (12)',
  note: 'achei a resposta estranha',
  client: 'android',
  ...over,
});

function montar({ env = {}, fetchImpl, now } = {}) {
  const relo = now ?? relogio();
  const chamadas = [];
  const cap = capturarLog();
  const handler = createReportHandler({
    env: () => ({ ...ENV, ...env }),
    fetch: async (url, init) => {
      chamadas.push({ url, init, corpo: init?.body ? JSON.parse(init.body) : undefined });
      return fetchImpl ? fetchImpl(url, init, chamadas.length) : new Response(JSON.stringify({ number: 7 }), { status: 201 });
    },
    now: relo,
    log: cap.log,
    state: createReportState({ now: relo }),
  });
  return { handler, chamadas, cap, now: relo };
}

const post = (body, headers = {}) => mkRequest({ url: 'https://saibatudo.net/api/report', json: body, headers: { 'x-forwarded-for': '203.0.113.9', ...headers } });

// ------------------------------------------------------------------ sanitização

test('@menções são neutralizadas (zero-width) e não notificam ninguém', () => {
  const s = neutralizeMentions('oi @octocat e @org/time, email-like a@b e ＠fullwidth');
  assert.ok(s.includes(`@${ZWSP}octocat`));
  assert.ok(s.includes(`@${ZWSP}org/time`));
  assert.ok(!/@[A-Za-z0-9_]/.test(s.replace(/a@b/, '')), 'nenhuma menção ativa restante');
  assert.equal(neutralizeMentions('sem menção'), 'sem menção');
});

test('referências #123 e GH-123 não viram autolink', () => {
  const s = neutralizeRefs('veja #123, org/repo#45 e GH-9');
  assert.ok(!/#\d/.test(s));
  assert.ok(!/GH-\d/i.test(s));
});

test('dados pessoais são mascarados; números de urna e anos preservados', () => {
  const s = redactPii('fale com fulano@exemplo.com.br, CPF 123.456.789-09 ou 12345678909, tel (11) 91234-5678, título 123456789012. Urna 13, 15456, ano 2026.');
  assert.ok(!s.includes('fulano@exemplo'));
  assert.ok(!s.includes('123.456.789-09'));
  assert.ok(!s.includes('12345678909'));
  assert.ok(!s.includes('91234-5678'));
  assert.ok(!s.includes('123456789012'));
  assert.ok(s.includes('Urna 13, 15456, ano 2026.'));
});

test('truncate respeita o limite em pontos de código e acrescenta reticências', () => {
  assert.equal(truncate('abc', 5), 'abc');
  const t = truncate('a'.repeat(20), 10);
  assert.equal(Array.from(t).length, 10);
  assert.ok(t.endsWith('…'));
  const emoji = truncate('😀'.repeat(20), 5);
  assert.equal(Array.from(emoji).length, 5, 'não parte pares substitutos');
});

test('codeFence usa cerca maior que qualquer sequência de crases do conteúdo', () => {
  assert.ok(codeFence('texto simples').startsWith('```text\n'));
  const f = codeFence('abre ``` fecha e ````` mais');
  const cerca = f.split('\n')[0].replace('text', '');
  assert.ok(cerca.length >= 6);
  assert.ok(f.endsWith(`\n${cerca}`));
});

test('sanitizeFreeText: remove controles, zero-width e bidi do usuário; normaliza quebras', () => {
  const s = sanitizeFreeText('a\u0000b‮c​d\r\n\r\n\r\n\r\ne', 100);
  assert.equal(s, 'abcd\n\ne');
});

// ------------------------------------------------------------------ construção da issue

test('buildIssue: todo texto do usuário fica dentro de blocos de código; metadados em código inline', () => {
  const { title, body } = buildIssue(relato());
  assert.match(title, /^Relato da IA: RECOMENDACAO \(LOCAL, android\) id [0-9a-f]{6}$/);
  assert.ok(body.includes('### Pergunta'));
  assert.ok(body.includes('### Resposta exibida'));
  assert.ok(body.includes('### Observação do usuário'));
  assert.ok(body.includes('`20261001T164600Z-9fe2c36a1f68`'));
  assert.ok(body.includes('`android 1.0.0 (12)`'));
  assert.ok(!title.includes('ganhar'), 'o título não carrega texto do usuário');
});

test('buildIssue: tentativa de injeção (HTML, markdown, fechamento de cerca, menções, links, #refs)', () => {
  const ataque = [
    '```\n## Título falso\n```\n<img src=x onerror=alert(1)> <script>x</script>',
    '[clique aqui](https://evil.example/phishing) https://evil.example/a @octocat @org/seguranca fixes #1',
    '`````\nfecha cerca\n`````',
  ].join('\n');
  const { body } = buildIssue(relato({ q: ataque, a: ataque, note: ataque }));
  assert.ok(!/@[A-Za-z0-9_]/.test(body), 'nenhuma @menção ativa');
  assert.ok(!/#\d/.test(body), 'nenhuma #referência ativa');
  // Percorre o markdown: nenhum cabeçalho/HTML/link fora de bloco de código.
  let dentro = null;
  for (const linha of body.split('\n')) {
    const m = /^(`{3,})/.exec(linha);
    if (dentro === null) {
      if (m) dentro = m[1].length;
      else {
        assert.ok(!/<[a-z]/i.test(linha), `HTML fora de bloco: ${linha}`);
        assert.ok(!/\]\(http/.test(linha), `link fora de bloco: ${linha}`);
        if (/^#{1,6} /.test(linha)) assert.ok(/^(##|###) (Relato de resposta da IA|Pergunta|Resposta exibida|Observação do usuário)$/.test(linha), `cabeçalho injetado: ${linha}`);
      }
    } else if (m && linha.trim() === m[1] && m[1].length >= dentro) {
      dentro = null;
    }
  }
  assert.equal(dentro, null, 'todos os blocos de código foram fechados');
});

test('buildIssue: trunca q em 300, a em 1500 e note em 500', () => {
  const { body } = buildIssue(relato({ q: 'q'.repeat(400), a: 'a'.repeat(2000), note: 'n'.repeat(900) }));
  assert.ok(!body.includes('q'.repeat(301)));
  assert.ok(body.includes('q'.repeat(299) + '…'));
  assert.ok(!body.includes('a'.repeat(1501)));
  assert.ok(body.includes('a'.repeat(1499) + '…'));
  assert.ok(!body.includes('n'.repeat(501)));
});

test('buildIssue: sem observação não cria a seção; PII no texto é mascarada', () => {
  const { body } = buildIssue(relato({ note: '', q: 'meu cpf é 123.456.789-09 e email eu@x.com' }));
  assert.ok(!body.includes('Observação do usuário'));
  assert.ok(!body.includes('123.456.789-09'));
  assert.ok(!body.includes('eu@x.com'));
});

// ------------------------------------------------------------------ handler

test('POST válido cria a issue pública no repositório configurado com o rótulo relato-ia', async () => {
  const { handler, chamadas } = montar();
  const res = await handler(post(relato()));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].url, 'https://api.github.com/repos/franciscoaleixoIOT/SaibaTudo/issues');
  assert.equal(chamadas[0].init.method, 'POST');
  assert.equal(chamadas[0].init.headers.Authorization, 'Bearer ghp_teste_token');
  assert.equal(chamadas[0].init.headers.Accept, 'application/vnd.github+json');
  assert.deepEqual(chamadas[0].corpo.labels, ['relato-ia']);
  assert.ok(chamadas[0].corpo.title.startsWith('Relato da IA'));
  assert.ok(chamadas[0].corpo.body.includes('Quem vai ganhar a eleição?'));
  assert.ok(!('assignees' in chamadas[0].corpo), 'não atribui a ninguém');
});

test('GITHUB_REPO configurável; valor malformado desliga o canal', async () => {
  const a = montar({ env: { GITHUB_REPO: 'org/outro-repo' } });
  await a.handler(post(relato()));
  assert.ok(a.chamadas[0].url.includes('/repos/org/outro-repo/issues'));
  const b = montar({ env: { GITHUB_REPO: '../../evil' } });
  assert.equal((await b.handler(post(relato()))).status, 503);
  assert.equal(b.chamadas.length, 0);
});

test('sem GITHUB_TOKEN responde 503 e não chama o GitHub', async () => {
  const { handler, chamadas } = montar({ env: { GITHUB_TOKEN: '' } });
  const r = await handler(post(relato()));
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { ok: false, error: 'disabled' });
  assert.equal(chamadas.length, 0);
});

test('validação: dataVersion/app obrigatórios, tipos, 415, 413, JSON inválido, 405', async () => {
  const { handler, chamadas } = montar();
  assert.equal((await handler(post(relato({ dataVersion: undefined })))).status, 400);
  assert.equal((await handler(post(relato({ app: undefined })))).status, 400);
  assert.equal((await handler(post(relato({ q: undefined })))).status, 400);
  assert.equal((await handler(post(relato({ client: 'ios' })))).status, 400);
  assert.equal((await handler(mkRequest({ url: 'https://saibatudo.net/api/report', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(relato()) }))).status, 415);
  assert.equal((await handler(mkRequest({ url: 'https://saibatudo.net/api/report', headers: { 'content-type': 'application/json' }, body: '{x' }))).status, 400);
  assert.equal((await handler(post({ ...relato(), a: 'x'.repeat(30_000) }))).status, 413);
  const get = await handler(mkRequest({ method: 'GET', url: 'https://saibatudo.net/api/report' }));
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('allow'), 'POST, OPTIONS');
  assert.equal(chamadas.length, 0);
});

test('CORS: mesma política do NLU (origem não permitida -> 403; preflight -> 204)', async () => {
  const { handler, chamadas } = montar();
  assert.equal((await handler(post(relato(), { origin: 'https://evil.com' }))).status, 403);
  const pre = await handler(mkRequest({ method: 'OPTIONS', url: 'https://saibatudo.net/api/report', headers: { origin: 'https://saibatudo.net' } }));
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), 'https://saibatudo.net');
  const ok = await handler(post(relato(), { origin: 'https://www.saibatudo.net' }));
  assert.equal(ok.status, 200);
  assert.equal(chamadas.length, 1);
});

test('rate limit: 5 relatos por hora por IP; libera após 1 h', async () => {
  const { handler, chamadas, now } = montar();
  for (let i = 0; i < 5; i++) assert.equal((await handler(post(relato({ q: `pergunta distinta ${i}` })))).status, 200);
  const r = await handler(post(relato({ q: 'pergunta distinta 6' })));
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get('retry-after')) > 0);
  assert.equal(chamadas.length, 5);
  assert.equal((await handler(post(relato({ q: 'x' }), { 'x-forwarded-for': '198.51.100.99' }))).status, 200, 'outro IP não é afetado');
  now.avancar(3600_000 + 1000);
  assert.equal((await handler(post(relato({ q: 'pergunta distinta 7' })))).status, 200);
});

test('relato idêntico na última hora não cria issue duplicada (responde ok)', async () => {
  const { handler, chamadas } = montar();
  assert.equal((await handler(post(relato()))).status, 200);
  assert.equal((await handler(post(relato()))).status, 200);
  assert.equal(chamadas.length, 1);
});

test('teto diário global de issues (REPORT_DAILY_MAX)', async () => {
  const { handler, chamadas } = montar({ env: { REPORT_DAILY_MAX: '2', REPORT_PER_HOUR: '100' } });
  assert.equal((await handler(post(relato({ q: 'um 1' })))).status, 200);
  assert.equal((await handler(post(relato({ q: 'dois 2' })))).status, 200);
  const r = await handler(post(relato({ q: 'tres 3' })));
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error, 'budget');
  assert.equal(chamadas.length, 2);
});

test('falha do GitHub -> 502 (sem vazar detalhes) e não marca como duplicado', async () => {
  let n = 0;
  const { handler, chamadas } = montar({
    fetchImpl: async () => (++n === 1 ? new Response('{"message":"Bad credentials"}', { status: 401 }) : new Response('{}', { status: 201 })),
  });
  const r = await handler(post(relato()));
  assert.equal(r.status, 502);
  const txt = await r.text();
  assert.ok(!txt.includes('Bad credentials') && !txt.includes('ghp_'));
  assert.equal((await handler(post(relato()))).status, 200, 'nova tentativa chega ao GitHub');
  assert.equal(chamadas.length, 2);
});

test('erro de rede/timeout do GitHub -> 502/504', async () => {
  const rede = montar({ fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  assert.equal((await rede.handler(post(relato()))).status, 502);
  const tempo = montar({ fetchImpl: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); } });
  assert.equal((await tempo.handler(post(relato()))).status, 504);
});

test('o conteúdo do relato, o IP e o token nunca aparecem nos logs', async () => {
  const { handler, cap } = montar();
  await handler(post(relato({ q: 'pergunta zebra-unica-7788', a: 'resposta zebra-unica-7788', note: 'nota zebra-unica-7788' })));
  await handler(post(relato({ dataVersion: undefined })));
  const tudo = JSON.stringify(cap.eventos);
  for (const proibido of ['zebra-unica-7788', '203.0.113.9', 'ghp_teste_token', 'android 1.0.0']) assert.ok(!tudo.includes(proibido), proibido);
  assert.equal(cap.eventos.length, 2);
});

test('api/report.js: handler real da Vercel (req/res do Node) com fetch global simulado', async () => {
  const guardado = { env: { ...process.env }, fetch: globalThis.fetch, log: console.log };
  console.log = () => {};
  Object.assign(process.env, ENV, { ALLOWED_ORIGINS: '' });
  const chamadas = [];
  globalThis.fetch = async (url, init) => {
    chamadas.push({ url, init });
    return new Response('{}', { status: 201 });
  };
  try {
    const mod = await import('../report.js');
    const res = fakeNodeRes();
    await mod.default(
      fakeNodeReq({ url: '/api/report', headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.77' }, body: JSON.stringify(relato({ q: 'via adaptador' })) }),
      res
    );
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { ok: true });
    assert.equal(chamadas.length, 1);
  } finally {
    globalThis.fetch = guardado.fetch;
    console.log = guardado.log;
    for (const k of ['GITHUB_TOKEN', 'GITHUB_REPO', 'ALLOWED_ORIGINS']) {
      if (k in guardado.env) process.env[k] = guardado.env[k];
      else delete process.env[k];
    }
  }
});
