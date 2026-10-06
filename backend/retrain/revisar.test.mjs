import test from 'node:test';
import assert from 'node:assert/strict';
import { aplicarDecisao, textoPublicavel } from './revisar.mjs';

const AGORA = '2026-10-06T12:00:00.000Z';
const reg = (extra = {}) => ({
  q: 'que dia é o pleito', n: 7,
  alvo_regras: null, alvo_juiz: { intent: 'CALENDARIO' }, motivos: ['sem_regras'], destino: 'treino', ...extra,
});
const base = { revisor: 'ana', agora: AGORA, confirmouSemPii: true };

test('textoPublicavel: limites e dados pessoais', () => {
  assert.equal(textoPublicavel('  quando   é a eleição ').q, 'quando é a eleição');
  assert.equal(textoPublicavel('oi').ok, false);
  assert.equal(textoPublicavel('x'.repeat(301)).ok, false);
  assert.match(textoPublicavel('meu cpf 123.456.789-09 é válido?').erro, /dado pessoal/);
  assert.match(textoPublicavel('fala comigo em joao@exemplo.com').erro, /dado pessoal/);
});

test('aceitar o rótulo do juiz grava a decisão com revisor, data e o texto final', () => {
  const r = aplicarDecisao(reg(), { ...base, acao: 'juiz' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.registro, {
    q: 'que dia é o pleito', n: 7, revisor: 'ana', revisadoEm: AGORA,
    q_final: 'que dia é o pleito', alvo: { intent: 'CALENDARIO' }, intent: 'CALENDARIO', decisao: 'juiz', publicavel: true,
  });
});

test('sem confirmar "sem dado pessoal nem opinião", nada é aceito (o texto vira arquivo público)', () => {
  const r = aplicarDecisao(reg(), { ...base, acao: 'juiz', confirmouSemPii: false });
  assert.equal(r.ok, false);
  assert.match(r.erro, /dado pessoal/);
});

test('exige revisor identificado', () => {
  assert.equal(aplicarDecisao(reg(), { ...base, acao: 'juiz', revisor: '' }).ok, false);
});

test('rejeitar não exige confirmação e marca como não publicável', () => {
  const r = aplicarDecisao(reg(), { revisor: 'ana', agora: AGORA, acao: 'rejeitar' });
  assert.equal(r.ok, true);
  assert.equal(r.registro.decisao, 'rejeitada');
  assert.equal(r.registro.publicavel, false);
});

test('aceitar um rótulo que não existe é recusado', () => {
  assert.match(aplicarDecisao(reg(), { ...base, acao: 'regras' }).erro, /não há rótulo/);
});

test('rótulo manual é validado: vocabulário fechado e entidade ancorada no texto', () => {
  const q = 'candidatos a governador em SP';
  const ok = aplicarDecisao(reg({ q }), { ...base, acao: 'manual', alvoManual: { intent: 'LISTAR_CANDIDATOS', cargo: 'GOVERNADOR', uf: 'SP' } });
  assert.equal(ok.ok, true);
  assert.equal(ok.registro.decisao, 'manual');
  // MG não está na pergunta: ancoragem recusa
  assert.match(aplicarDecisao(reg({ q }), { ...base, acao: 'manual', alvoManual: { intent: 'LISTAR_CANDIDATOS', cargo: 'GOVERNADOR', uf: 'MG' } }).erro, /não se sustenta/);
  // intenção fora do vocabulário
  assert.equal(aplicarDecisao(reg({ q }), { ...base, acao: 'manual', alvoManual: { intent: 'INVENTADA' } }).ok, false);
});

test('texto reescrito: o rótulo é revalidado no TEXTO NOVO, não no original', () => {
  const original = reg({ q: 'candidatos a governador em SP, que político horrível', alvo_regras: { intent: 'LISTAR_CANDIDATOS', cargo: 'GOVERNADOR', uf: 'SP' } });
  const bom = aplicarDecisao(original, { ...base, acao: 'regras', qFinal: 'candidatos a governador em SP' });
  assert.equal(bom.ok, true);
  assert.equal(bom.registro.q, 'candidatos a governador em SP, que político horrível', 'o original fica só na fila local');
  assert.equal(bom.registro.q_final, 'candidatos a governador em SP');
  // reescrever tirando o estado invalida o rótulo que citava SP
  const ruim = aplicarDecisao(original, { ...base, acao: 'regras', qFinal: 'candidatos a governador' });
  assert.equal(ruim.ok, false);
});

test('exemplo negativo (DESCONHECIDA de propósito) é aceito', () => {
  const r = aplicarDecisao(reg({ q: 'asdkjh qwerty zzz' }), { ...base, acao: 'desconhecida' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.registro.alvo, { intent: 'DESCONHECIDA' });
  assert.equal(r.registro.decisao, 'desconhecida');
});

test('ação desconhecida é recusada', () => {
  assert.match(aplicarDecisao(reg(), { ...base, acao: 'vaipraonde' }).erro, /ação desconhecida/);
});
