// Casos de referência compartilhados (contracts/nlu_golden_cases.json): um "modelo perfeito" que devolve exatamente o que o golden pede
// precisa atravessar a normalização e a ancoragem SEM perder nenhuma entidade (recall da ancoragem), e as perguntas perigosas do golden
// precisam ser barradas pela regra de segurança antes do modelo. Sem rede; pula se o arquivo ainda não existir.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { normalizeModelOutput } from '../_lib/normalize.js';
import { avaliarPedido } from '../_lib/seguranca.js';
import { PROPRIEDADE_CLIENTE } from '../_lib/vocab.js';

const URL_GOLDEN = new URL('../../contracts/nlu_golden_cases.json', import.meta.url);
const carregar = () => {
  const d = JSON.parse(readFileSync(URL_GOLDEN, 'utf8'));
  return Array.isArray(d) ? d : d.cases;
};
const paraModelo = (id) => Object.entries(PROPRIEDADE_CLIENTE).find(([, cliente]) => cliente === id)?.[0] ?? id;

/** O que um modelo perfeito devolveria (só entidades que o contrato da nuvem carrega e que têm texto: CID não tem). */
function saidaPerfeita(c) {
  const s = { intent: c.intent };
  if (c.elemento) s.elemento = c.elemento;
  if (typeof c.composto === 'string') s.composto = c.composto;
  if (c.formula) s.composto = c.formula;
  if (c.propriedade) s.propriedade = paraModelo(c.propriedade);
  if (c.equacao) s.equacao = c.equacao;
  if (c.unidadeDestino) s.unidadeDestino = c.unidadeDestino;
  return s;
}

test('golden: o modelo perfeito não perde elemento, propriedade, equação, fórmula nem unidade de destino na ancoragem', (t) => {
  if (!existsSync(URL_GOLDEN)) return t.skip('contracts/nlu_golden_cases.json ainda não existe');
  const perdas = [];
  let verificados = 0;
  for (const c of carregar()) {
    if (!c.q || !c.q.trim()) continue;
    const esperado = saidaPerfeita(c);
    const r = normalizeModelOutput(esperado, { question: c.q });
    assert.equal(r.ok, true, c.q);
    // intenções que dependem de um composto dado como CID (sem texto) ficam de fora: a nuvem devolve nome/fórmula, o cliente resolve
    const dependeDeCid = typeof c.composto === 'number' && ['COMPOSTO', 'DESENHAR', 'NOMENCLATURA', 'SEGURANCA', 'ESTEQUIOMETRIA', 'CONCENTRACAO', 'PH', 'MASSA_MOLAR', 'COMPARAR', 'PROPRIEDADE'].includes(c.intent);
    for (const k of ['elemento', 'composto', 'equacao', 'unidadeDestino']) {
      if (!esperado[k] || dependeDeCid) continue;
      verificados += 1;
      const obtido = r.nlu[k];
      const ok = k === 'equacao' ? typeof obtido === 'string' && obtido.replace(/\s|→|=|-+>/g, '').length > 0 : obtido !== undefined;
      if (!ok) perdas.push(`${k} perdido em "${c.q}" (dropped: ${r.dropped})`);
    }
    if (esperado.propriedade && !dependeDeCid) {
      verificados += 1;
      if (r.nlu.propriedade !== c.propriedade) perdas.push(`propriedade ${c.propriedade} -> ${r.nlu.propriedade} em "${c.q}"`);
    }
  }
  assert.ok(verificados >= 60, `entidades verificadas: ${verificados}`);
  assert.deepEqual(perdas, [], `${perdas.length} entidade(s) do golden perdida(s) pela ancoragem:\n${perdas.join('\n')}`);
});

test('golden: a intenção do modelo perfeito sobrevive quando a entidade exigida existe no texto', (t) => {
  if (!existsSync(URL_GOLDEN)) return t.skip('contracts/nlu_golden_cases.json ainda não existe');
  const falhas = [];
  for (const c of carregar()) {
    if (!c.q || !c.q.trim() || typeof c.composto === 'number') continue;
    const r = normalizeModelOutput(saidaPerfeita(c), { question: c.q });
    if (r.nlu.intent !== c.intent) falhas.push(`${c.q}: ${c.intent} -> ${r.nlu.intent} (dropped: ${r.dropped})`);
  }
  // BALANCEAR sem equação e afins viram DESCONHECIDA de propósito; o golden marca esses casos com null
  const aceitas = falhas.filter((f) => !/equacao: null/.test(f));
  assert.ok(aceitas.length <= 3, `intenções perdidas:\n${aceitas.join('\n')}`);
});

test('golden: os pedidos RECUSA_PERIGO do golden são barrados pela regra antes do modelo', (t) => {
  if (!existsSync(URL_GOLDEN)) return t.skip('contracts/nlu_golden_cases.json ainda não existe');
  const perigosos = carregar().filter((c) => c.intent === 'RECUSA_PERIGO');
  assert.ok(perigosos.length >= 3);
  for (const c of perigosos) assert.equal(avaliarPedido(c.q).recusar, true, c.q);
});

test('golden: nenhuma pergunta legítima do golden (qualquer outra intenção) é recusada pela regra', (t) => {
  if (!existsSync(URL_GOLDEN)) return t.skip('contracts/nlu_golden_cases.json ainda não existe');
  for (const c of carregar().filter((x) => x.intent !== 'RECUSA_PERIGO' && x.q)) {
    assert.equal(avaliarPedido(c.q).recusar, false, c.q);
  }
});
