import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/eleicoes2026/js/nlu.js';
import { motor } from './support.mjs';

test('continuidade de contexto: resolve elipses como "e do acre", "e para senador?", "e os vices?"', async () => {
  const gaz = {
    buscarPorNome: (t) => t.includes('tarcisio') ? [{ id: '1', nomeUrna: 'TARCISIO DE FREITAS' }] : [],
    partidos: [['pt', 'PT'], ['pl', 'PL']]
  };

  // 1. "quais sao os governadores de sao paulo" seguido por "e do acre"
  const p1 = parse('quais sao os governadores de sao paulo', gaz);
  assert.equal(p1.intent, 'LISTAR_CANDIDATOS');
  assert.equal(p1.cargo, 'GOVERNADOR');
  assert.equal(p1.uf, 'SP');

  const p2 = parse('e do acre', gaz, p1);
  assert.equal(p2.intent, 'LISTAR_CANDIDATOS');
  assert.equal(p2.cargo, 'GOVERNADOR', 'deve herdar o cargo GOVERNADOR da pergunta anterior');
  assert.equal(p2.uf, 'AC', 'deve atualizar a UF para AC');

  // 2. "candidatos a governador de sp" seguido por "e para senador?"
  const p3 = parse('e para senador?', gaz, p1);
  assert.equal(p3.cargo, 'SENADOR', 'deve atualizar o cargo para SENADOR');
  assert.equal(p3.uf, 'SP', 'deve herdar a UF SP da pergunta anterior');

  // 3. "quem disputa a presidencia?" seguido por "e os vices?"
  const pres1 = parse('quem disputa a presidencia?', gaz);
  assert.equal(pres1.cargo, 'PRESIDENTE');
  const pres2 = parse('e os vices?', gaz, pres1);
  assert.equal(pres2.intent, 'LISTAR_CANDIDATOS');
  assert.equal(pres2.cargo, 'PRESIDENTE');
  assert.equal(pres2.vice, true, 'deve marcar vice como true');

  // 4. "candidatos a governador do pt em sp" seguido por "e do pl?"
  const pt1 = parse('candidatos a governador do pt em sp', gaz);
  assert.equal(pt1.partido, 'PT');
  const pl2 = parse('e do pl?', gaz, pt1);
  assert.equal(pl2.cargo, 'GOVERNADOR');
  assert.equal(pl2.uf, 'SP');
  assert.equal(pl2.partido, 'PL', 'deve atualizar o partido para PL');

  // 5. "quantos candidatos tem em sp?" seguido por "e no acre?"
  const count1 = parse('quantos candidatos tem em sp?', gaz);
  assert.equal(count1.intent, 'CONTAR');
  const count2 = parse('e no acre?', gaz, count1);
  assert.equal(count2.intent, 'CONTAR', 'deve herdar a intenção CONTAR');
  assert.equal(count2.uf, 'AC');

  // 6. Pergunta independente NÃO herda contexto
  const indep = parse('onde eu voto?', gaz, p1);
  assert.equal(indep.intent, 'LOCAL_VOTACAO');
  assert.equal(indep.cargo, null);
  assert.equal(indep.uf, null);
});

test('Engine preserva e limpa contexto conversacional entre chamadas', async () => {
  const engine = await motor();

  // 1ª pergunta: governadores de são paulo
  const r1 = await engine.responder('quais sao os governadores de sao paulo');
  assert.equal(r1.resolvida, true);
  assert.equal(r1.filters.cargo, 'GOVERNADOR');
  assert.equal(r1.filters.estadoUf, 'SP');

  // 2ª pergunta: "e do acre"
  const r2 = await engine.responder('e do acre');
  assert.equal(r2.resolvida, true);
  assert.equal(r2.filters.cargo, 'GOVERNADOR', 'Engine deve manter cargo GOVERNADOR na resposta seguinte');
  assert.equal(r2.filters.estadoUf, 'AC', 'Engine deve aplicar UF AC');
  assert.match(r2.directAnswer, /Governador no Acre/i);

  // Limpar contexto
  engine.limparContexto();

  // Agora "e do acre" sem contexto anterior não assume mais governadores
  const r3 = await engine.responder('e do acre');
  assert.equal(r3.filters.cargo, null);
  assert.equal(r3.filters.estadoUf, 'AC');
});

// ---- a IA na nuvem tem de seguir a conversa: o contexto das perguntas anteriores vale também para a interpretação que vem da nuvem ----
import { pedirANuvem, NuvemNlu } from '../src/eleicoes2026/js/cloud.js';

/** Nuvem simulada que, sem ver as perguntas anteriores, devolve a interpretação "genérica" da última frase. */
function nuvemGenerica(nlu) {
  const chamadas = [];
  const fetchFn = async (url, init) => {
    chamadas.push({ url, corpo: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, nlu }), { status: 200 });
  };
  return { chamadas, nuvem: new NuvemNlu({ fetchFn, installId: () => 'iid-teste', habilitada: () => false, timeoutMs: 500 }) };
}

test('IA na nuvem (botão): "e de SP?" mantém o cargo da pergunta anterior e a conversa continua a partir da resposta da nuvem', async () => {
  const { chamadas, nuvem } = nuvemGenerica({ intent: 'LISTAR_CANDIDATOS', uf: 'SP' }); // sem cargo: a nuvem só viu "e de SP?"
  const m = await motor({ nuvem });
  const a = await m.responder('candidatos a governador do rj');
  assert.equal(a.resolvida, true);
  const b = await m.responder('e de sp?');
  assert.equal(b.resolvida, true);
  assert.equal(b.filters.cargo, 'GOVERNADOR', 'o NLU local já herda o cargo');
  const r = await pedirANuvem({ engine: m, atual: b, pergunta: 'e de sp?' });
  assert.equal(r.ok, true);
  assert.equal(r.resposta.origem, 'NUVEM');
  assert.equal(r.resposta.filters.estadoUf, 'SP');
  assert.equal(r.resposta.filters.cargo, 'GOVERNADOR', 'a resposta da nuvem também herda o cargo (antes virava uma lista genérica de SP)');
  // só o texto da pergunta atual vai à nuvem: o contexto é aplicado NO APARELHO, sem enviar as perguntas anteriores
  assert.equal(chamadas.length, 1);
  assert.deepEqual(Object.keys(chamadas[0].corpo).sort(), ['client', 'iid', 'q', 'v']);
  assert.equal(chamadas[0].corpo.q, 'e de sp?');
  // a pergunta seguinte continua a partir da resposta da nuvem
  const c = await m.responder('e para senador?');
  assert.equal(c.filters.cargo, 'SENADOR');
  assert.equal(c.filters.estadoUf, 'SP');
});

test('IA na nuvem: pergunta que não é continuação não herda contexto', async () => {
  const { nuvem } = nuvemGenerica({ intent: 'LISTAR_CANDIDATOS', uf: 'SP' });
  const m = await motor({ nuvem });
  await m.responder('candidatos a governador do rj');
  const b = await m.responder('candidatos de sp');
  const r = await pedirANuvem({ engine: m, atual: b, pergunta: 'candidatos de sp' });
  assert.equal(r.ok, true);
  assert.equal(r.resposta.filters.estadoUf, 'SP');
  assert.notEqual(r.resposta.filters.cargo, 'GOVERNADOR');
});

test('"no Rio" e "do Rio" valem Rio de Janeiro; os outros "rio" não', () => {
  const gaz = { buscarPorNome: () => [], partidos: [] };
  for (const q of ['quem ganhou para governador no rio?', 'candidatos a governador do rio', 'resultado no Rio', 'senadores pelo rio']) assert.equal(parse(q, gaz).uf, 'RJ', q);
  assert.equal(parse('governador do rio grande do sul', gaz).uf, 'RS');
  assert.equal(parse('candidatos no rio grande do norte', gaz).uf, 'RN');
  assert.equal(parse('governador do rio de janeiro', gaz).uf, 'RJ');
  for (const q of ['prefeito do rio branco', 'poluição do rio doce', 'rio']) assert.equal(parse(q, gaz).uf, null, q);
});
