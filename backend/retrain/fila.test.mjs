import test from 'node:test';
import assert from 'node:assert/strict';
import { INTENCOES_AUTO, alvoDoJuiz, chavesConhecidas, decidir, lerJulgadas, montarFila } from './fila.mjs';
import { carregarGazetteer, chaveQ } from './label_extra.mjs';

const gaz = await carregarGazetteer();
const jul = (obj) => JSON.stringify(obj);

test('decidir: concordância em intenção SEM entidade é a única via automática', () => {
  const cal = { intent: 'CALENDARIO' };
  assert.deepEqual(decidir({ alvoRegras: cal, alvoJuiz: cal }), { status: 'auto', motivos: [] });
  for (const intent of INTENCOES_AUTO) {
    assert.equal(decidir({ alvoRegras: { intent }, alvoJuiz: { intent } }).status, 'auto', intent);
  }
});

test('decidir: divergência, falta de juiz, entidade, DESCONHECIDA e RECOMENDACAO vão para uma pessoa', () => {
  const m = (r, j) => decidir({ alvoRegras: r, alvoJuiz: j });
  assert.ok(m({ intent: 'CALENDARIO' }, { intent: 'LOCAL_VOTACAO' }).motivos.includes('divergente'));
  assert.ok(m({ intent: 'CALENDARIO' }, null).motivos.includes('sem_juiz'));
  assert.ok(m(null, { intent: 'CALENDARIO' }).motivos.includes('regras_nao_representa'));
  const ent = { intent: 'LISTAR_CANDIDATOS', cargo: 'GOVERNADOR', uf: 'SP' };
  assert.ok(m(ent, ent).motivos.includes('tem_entidade'), 'mesmo concordando, entidade exige pessoa');
  assert.ok(m({ intent: 'DESCONHECIDA' }, { intent: 'DESCONHECIDA' }).motivos.includes('desconhecida'));
  assert.ok(m({ intent: 'RECOMENDACAO' }, { intent: 'RECOMENDACAO' }).motivos.includes('recomendacao'));
  assert.equal(m({ intent: 'PERFIL_CANDIDATO' }, { intent: 'PERFIL_CANDIDATO' }).status, 'revisao');
});

test('alvoDoJuiz: ancora no texto da pergunta e descarta o que o modelo inventou', () => {
  assert.deepEqual(alvoDoJuiz(jul({ intent: 'CALENDARIO' }), 'quando é a eleição'), { intent: 'CALENDARIO' });
  assert.deepEqual(
    alvoDoJuiz(jul({ intent: 'LISTAR_CANDIDATOS', cargo: 'GOVERNADOR', uf: 'SP' }), 'candidatos a governador em SP'),
    { intent: 'LISTAR_CANDIDATOS', cargo: 'GOVERNADOR', uf: 'SP' },
  );
  // o modelo "lembrou" SP, mas a pergunta não cita estado: não vale como rótulo
  assert.equal(alvoDoJuiz(jul({ intent: 'LISTAR_CANDIDATOS', cargo: 'GOVERNADOR', uf: 'SP' }), 'candidatos a governador'), null);
  assert.equal(alvoDoJuiz('não é json', 'qualquer coisa'), null);
  assert.equal(alvoDoJuiz(null, 'qualquer coisa'), null);
  assert.equal(alvoDoJuiz(jul({ intent: 'INTENCAO_INVENTADA' }), 'qualquer coisa'), null);
});

test('montarFila: roteia cada pergunta, conta descartes e ordena por frequência', () => {
  const julgadas = new Map([
    [chaveQ('quando é a eleição'), jul({ intent: 'CALENDARIO' })],
    [chaveQ('que dia é o pleito'), jul({ intent: 'LOCAL_VOTACAO' })],
    [chaveQ('candidatos a governador em SP'), jul({ intent: 'LISTAR_CANDIDATOS', cargo: 'GOVERNADOR', uf: 'SP' })],
  ]);
  const entradas = [
    { q: 'quando é a eleição', n: 2 },            // regras e juiz concordam, sem entidade: auto
    { q: 'que dia é o pleito', n: 7 },             // juiz diverge das regras: revisão
    { q: 'candidatos a governador em SP', n: 4 }, // tem entidade: revisão
    { q: 'asdkjh qwerty zzz', n: 9 },              // regras não entendem e não há juiz: revisão (mais frequente)
    { q: 'meu cpf é 123.456.789-09', n: 1 },       // dado pessoal: descartada
    { q: 'QUANDO é a eleição?!', n: 1 },           // duplicada (mesma chave normalizada)
    { q: 'oi', n: 1 },                             // curto
    { q: 'x'.repeat(301), n: 1 },                  // longo
    { q: '', n: 1 },                               // vazio
  ];
  const conhecidas = new Set([chaveQ('já é caso de teste')]);
  const r = montarFila([...entradas, { q: 'já é caso de teste' }], { gaz, julgadas, conhecidas });

  assert.deepEqual(r.auto.map((x) => x.q), ['quando é a eleição']);
  assert.equal(r.auto[0].decisao, 'auto');
  assert.deepEqual(r.revisao.map((x) => x.q), ['asdkjh qwerty zzz', 'que dia é o pleito', 'candidatos a governador em SP'], 'mais frequentes primeiro');
  assert.ok(r.revisao[0].motivos.includes('sem_juiz'));
  assert.ok(r.revisao[1].motivos.includes('divergente'));
  assert.ok(r.revisao[2].motivos.includes('tem_entidade'));
  assert.deepEqual(r.resumo.descartes, { vazio: 1, curto: 1, longo: 1, pii: 1, duplicada: 1, ja_e_caso_de_teste: 1 });
  assert.equal(r.resumo.auto, 1);
  assert.equal(r.resumo.para_revisao, 3);
});

test('montarFila: o destino (holdout x treino) segue o balde estável e a fila crua guarda o texto original', () => {
  // vetores de holdout.test.mjs: "minas" -> 3 (holdout), "Qual o horário da votação?" -> 84 (treino)
  const r = montarFila([{ q: 'minas', n: 1 }, { q: 'Qual o horário da votação?', n: 1 }], { gaz });
  const por = Object.fromEntries([...r.auto, ...r.revisao].map((x) => [x.q, x.destino]));
  assert.equal(por.minas, 'holdout');
  assert.equal(por['Qual o horário da votação?'], 'treino');
  assert.equal(r.resumo.destino.holdout + r.resumo.destino.treino, 2);
});

test('montarFila: pergunta que a regra entende com entidade nunca é automática, e o juiz inventado não vira rótulo', () => {
  const julgadas = new Map([[chaveQ('candidatos a governador'), jul({ intent: 'LISTAR_CANDIDATOS', cargo: 'GOVERNADOR', uf: 'SP' })]]);
  const r = montarFila([{ q: 'candidatos a governador' }], { gaz, julgadas });
  assert.equal(r.auto.length, 0);
  assert.equal(r.revisao[0].alvo_juiz, null, 'uf SP não está na pergunta: ancoragem descarta o rótulo do juiz');
});

test('chavesConhecidas lê o golden e tolera arquivo ausente', () => {
  const k = chavesConhecidas(['contracts/nlu_golden_cases.json', 'contracts/nao_existe.json']);
  assert.ok(k.has(chaveQ('Em quem devo votar para presidente?')));
  assert.ok(k.size > 100);
});

test('lerJulgadas: ausente vira mapa vazio; lê { q, bruto }', async () => {
  assert.equal(lerJulgadas('nao/existe.jsonl').size, 0);
  assert.equal(lerJulgadas(null).size, 0);
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'fila-'));
  writeFileSync(join(dir, 'j.jsonl'), '{"q":"Quando é?","bruto":"{\\"intent\\":\\"CALENDARIO\\"}"}\n\n{"q":"sem bruto"}\n');
  const m = lerJulgadas(join(dir, 'j.jsonl'));
  assert.equal(m.get(chaveQ('quando e')), '{"intent":"CALENDARIO"}');
  assert.equal(m.get(chaveQ('sem bruto')), null);
});
