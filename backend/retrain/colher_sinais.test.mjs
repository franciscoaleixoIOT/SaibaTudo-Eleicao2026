import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { colher, consolidar, listarDias, lerDia } from './colher_sinais.mjs';

const CFG = { url: 'https://exemplo.upstash.io', token: 'tok' };

/** Upstash falso com dois dias de sinais e SCAN em duas páginas. */
function redisFalso() {
  const dados = {
    'st:sinais:2026-10-05': ['Que dia é o pleito', '3', 'posso votar de bermuda', '1'],
    'st:sinais:2026-10-06': ['que dia é o pleito', '2', 'onde fica a seção', '4'],
  };
  const chamadas = [];
  const fetchFn = async (url, init) => {
    const c = JSON.parse(init.body);
    chamadas.push(c);
    assert.equal(init.headers.Authorization, 'Bearer tok');
    if (c[0] === 'SCAN') {
      return new Response(JSON.stringify({ result: c[1] === '0' ? ['7', ['st:sinais:2026-10-06']] : ['0', ['st:sinais:2026-10-05']] }));
    }
    if (c[0] === 'HGETALL') return new Response(JSON.stringify({ result: dados[c[1]] ?? [] }));
    if (c[0] === 'DEL') return new Response(JSON.stringify({ result: c.length - 1 }));
    return new Response(JSON.stringify({ error: 'comando inesperado' }), { status: 200 });
  };
  return { fetchFn, chamadas };
}

test('listarDias percorre o cursor do SCAN e ordena por dia', async () => {
  const r = redisFalso();
  assert.deepEqual(await listarDias(CFG, r.fetchFn), ['st:sinais:2026-10-05', 'st:sinais:2026-10-06']);
  assert.equal(r.chamadas.filter((c) => c[0] === 'SCAN').length, 2);
});

test('lerDia converte o HGETALL em itens com dia e frequência', async () => {
  const r = redisFalso();
  assert.deepEqual(await lerDia(CFG, 'st:sinais:2026-10-05', r.fetchFn), [
    { q: 'Que dia é o pleito', n: 3, dia: '2026-10-05', fonte: 'melhoria-app' },
    { q: 'posso votar de bermuda', n: 1, dia: '2026-10-05', fonte: 'melhoria-app' },
  ]);
});

test('consolidar soma a frequência entre dias (sem diferenciar maiúsculas) e ordena pelos mais frequentes', async () => {
  const r = redisFalso();
  const { itens, dias } = await colher(CFG, { fetchFn: r.fetchFn });
  assert.equal(dias.length, 2);
  assert.deepEqual(itens.map((i) => [i.q, i.n]), [['Que dia é o pleito', 5], ['onde fica a seção', 4], ['posso votar de bermuda', 1]]);
  assert.ok(itens.every((i) => !('dia' in i)), 'o dia não acompanha a pergunta na fila');
});

test('--apagar remove os dias coletados do Redis (minimização)', async () => {
  const r = redisFalso();
  await colher(CFG, { fetchFn: r.fetchFn, apagar: true });
  const del = r.chamadas.find((c) => c[0] === 'DEL');
  assert.deepEqual(del, ['DEL', 'st:sinais:2026-10-05', 'st:sinais:2026-10-06']);
  const sem = redisFalso();
  await colher(CFG, { fetchFn: sem.fetchFn });
  assert.equal(sem.chamadas.some((c) => c[0] === 'DEL'), false, 'sem --apagar nada é removido');
});

test('erro do Redis é levantado, não engolido', async () => {
  await assert.rejects(listarDias(CFG, async () => new Response('x', { status: 500 })), /HTTP 500/);
  await assert.rejects(listarDias(CFG, async () => new Response(JSON.stringify({ error: 'WRONGPASS' }))), /WRONGPASS/);
});

test('o CLI recusa rodar sem --confirmar-politica', () => {
  const aqui = dirname(fileURLToPath(import.meta.url));
  const r = spawnSync(process.execPath, [resolve(aqui, 'colher_sinais.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /política de privacidade/);
});

test('consolidar tolera lista vazia', () => {
  assert.deepEqual(consolidar([]), []);
  assert.deepEqual(consolidar([[]]), []);
});
