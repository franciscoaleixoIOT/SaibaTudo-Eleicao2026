import test from 'node:test';
import assert from 'node:assert/strict';
import { casoDoContrato, chavesExistentes, marcarLacunas, planejarPromocao } from './promover.mjs';
import { carregarGazetteer } from './label_extra.mjs';
import { chaveQ } from './label_extra.mjs';
import { HOLDOUT_PCT, holdoutBucket } from './holdout.mjs';

const dec = (q, alvo, extra = {}) => ({
  q, q_final: q, n: 1, alvo, intent: alvo.intent, decisao: 'juiz', publicavel: true, revisor: 'ana', revisadoEm: '2026-10-06T12:00:00.000Z', ...extra,
});
const CAL = { intent: 'CALENDARIO' };
// "minas" -> balde 3 (holdout); "Qual o horário da votação?" -> 84 (treino)  [vetores de holdout.test.mjs]

test('roteia pelo balde do TEXTO FINAL: holdout só mede, o resto treina', () => {
  const r = planejarPromocao(
    [dec('minas', { intent: 'LISTAR_CANDIDATOS', uf: 'MG' }), dec('Qual o horário da votação?', { intent: 'LOCAL_VOTACAO' })],
    { existentes: new Set() },
  );
  assert.deepEqual(r.holdout.map((x) => x.q_final), ['minas']);
  assert.deepEqual(r.treino.map((x) => x.q_final), ['Qual o horário da votação?']);
});

test('o balde vale para o texto reescrito, não para o original', () => {
  // original cairia no holdout ("minas"), mas o revisor reescreveu para outro texto
  const r = planejarPromocao([dec('minas', { intent: 'LISTAR_CANDIDATOS', uf: 'MG' }, { q_final: 'candidatos de minas gerais' })], { existentes: new Set() });
  assert.equal(r.holdout.length + r.treino.length, 1);
  const esperado = holdoutBucket('candidatos de minas gerais') < HOLDOUT_PCT ? 'holdout' : 'treino';
  assert.equal(r[esperado].length, 1, 'segue o balde do texto final');
  assert.equal(r[esperado][0].q_final, 'candidatos de minas gerais');
});

test('ignora o que não é publicável, rejeitado, com texto ou rótulo inválido e duplicado', () => {
  const regs = [
    dec('Qual o horário da votação?', { intent: 'LOCAL_VOTACAO' }, { publicavel: false }),
    dec('quando é a eleição', CAL, { decisao: 'rejeitada' }),
    dec('meu cpf 123.456.789-09 quando é', CAL),
    dec('candidatos a governador', { intent: 'LISTAR_CANDIDATOS', cargo: 'GOVERNADOR', uf: 'SP' }), // SP não está no texto
    dec('como votar na urna', { intent: 'REGRAS_URNA' }),
    dec('Como votar na urna?', { intent: 'REGRAS_URNA' }), // duplicada (mesma chave)
    dec('já existe no contrato', CAL),
  ];
  const r = planejarPromocao(regs, { existentes: new Set([chaveQ('já existe no contrato')]) });
  assert.deepEqual(r.ignoradas, { nao_publicavel: 1, rejeitada: 1, texto_invalido: 1, rotulo_invalido: 1, duplicada: 2 });
  assert.equal(r.holdout.length + r.treino.length, 1);
});

test('casoDoContrato: entidades como chaves diretas, com origem e revisão', () => {
  const c = casoDoContrato(dec('candidatos a governador em SP', { intent: 'LISTAR_CANDIDATOS', cargo: 'GOVERNADOR', uf: 'SP' }));
  assert.deepEqual(c, {
    q: 'candidatos a governador em SP', intent: 'LISTAR_CANDIDATOS', cargo: 'GOVERNADOR', uf: 'SP',
    origem: 'usuario', revisor: 'ana', revisadoEm: '2026-10-06T12:00:00.000Z',
  });
});

test('chavesExistentes junta golden, holdout e treino anterior', () => {
  const k = chavesExistentes({
    golden: 'contracts/nlu_golden_cases.json', reais: 'contracts/nlu_real_cases.json', pastaExtra: 'backend/retrain/extra',
  });
  assert.ok(k.has(chaveQ('Em quem devo votar para presidente?')), 'golden');
  assert.ok(k.has(chaveQ('minas')), 'extras de treino anteriores');
});

test('a fila crua (auto.jsonl) nunca é publicada: entra com publicavel=false', () => {
  const r = planejarPromocao([{ ...dec('quando é a eleição agora', CAL), decisao: 'auto', publicavel: false }], { existentes: new Set() });
  assert.equal(r.holdout.length + r.treino.length, 0);
  assert.equal(r.ignoradas.nao_publicavel, 1);
});

test('marcarLacunas: caso que o NLU local não entende entra com "lacuna": true, o que entende entra limpo, sem mutar o original', async () => {
  const gaz = await carregarGazetteer();
  const entende = casoDoContrato(dec('quando é a eleição', { intent: 'CALENDARIO' }));
  const naoEntende = casoDoContrato(dec('asdkjh qwerty zzz', { intent: 'REGRAS_URNA' }));
  const r = marcarLacunas([entende, naoEntende], gaz);
  assert.equal('lacuna' in r[0], false);
  assert.equal(r[1].lacuna, true);
  assert.equal('lacuna' in naoEntende, false, 'o objeto original não é alterado');
});
