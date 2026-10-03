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
