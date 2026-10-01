// Casos de referência compartilhados com o Android (contracts/nlu_golden_cases.json): o NLU do site DEVE passar em todos.
// Chave ausente = não verificada; chave com null = deve estar ausente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RAIZ, pacoteCompleto } from './support.mjs';
import { parse } from '../src/eleicoes2026/js/nlu.js';
import { normalizar } from '../src/eleicoes2026/js/model.js';

const golden = JSON.parse(readFileSync(resolve(RAIZ, 'contracts/nlu_golden_cases.json'), 'utf8'));

test('todos os casos de referência do NLU (golden cases)', async () => {
  const { gaz } = await pacoteCompleto();
  assert.ok(golden.cases.length >= 40, 'casos esperados');
  const falhas = [];
  for (const c of golden.cases) {
    const r = parse(c.q, gaz);
    const atual = {
      intent: r.intent, cargo: r.cargo, uf: r.uf, partido: r.partido, nome: r.nome, tema: r.tema,
      apenasDeferidas: r.apenasDeferidas, historico: r.historico, turno: r.turno
    };
    for (const chave of Object.keys(atual)) {
      if (!(chave in c)) continue;
      const esperado = c[chave];
      const a = atual[chave];
      const ok = esperado === null ? a === null
        : chave === 'nome' ? normalizar(a ?? '') === normalizar(esperado)
          : a === esperado;
      if (!ok) falhas.push(`"${c.q}": ${chave} esperado=${JSON.stringify(esperado)} atual=${JSON.stringify(a)}`);
    }
  }
  assert.deepEqual(falhas, [], 'Falhas de NLU:\n' + falhas.join('\n'));
});

test('pergunta vazia é desconhecida e entrada grande não quebra', async () => {
  const { gaz } = await pacoteCompleto();
  assert.equal(parse('   ', gaz).intent, 'DESCONHECIDA');
  assert.equal(parse('???', gaz).cargo, null);
  const longa = 'candidatos a governador '.repeat(500);
  const r = parse(longa, gaz);
  assert.equal(r.cargo, 'GOVERNADOR');
  assert.ok(r.textoOriginal.length <= 300);
});

test('partido ambíguo só vale com prefixo; sigla de UF ambígua só em maiúsculas ou após preposição', async () => {
  const { gaz } = await pacoteCompleto();
  assert.equal(parse('um novo candidato', gaz).partido, null);
  assert.equal(parse('candidatos do partido novo', gaz).partido, 'NOVO');
  assert.equal(parse('candidatos do pt', gaz).partido, 'PT');
  assert.equal(parse('se eu votar em branco', gaz).uf, null);
  assert.equal(parse('governador em SE', gaz).uf, 'SE');
  assert.equal(parse('candidatos a governador no pará', gaz).uf, 'PA');
  assert.equal(parse('governador de mato grosso do sul', gaz).uf, 'MS');
  assert.equal(parse('governador de mato grosso', gaz).uf, 'MT');
});

test('o NLU do site entende o mesmo vocabulário do Android (cargos, temas, histórico, turno)', async () => {
  const { gaz } = await pacoteCompleto();
  assert.equal(parse('vice presidente', gaz).cargo, 'VICE_PRESIDENTE');
  assert.equal(parse('deputados federais do PL', gaz).cargo, 'DEPUTADO_FEDERAL');
  assert.equal(parse('candidatos veteranos ao senado', gaz).historico, 'ELEITO_2_OU_MAIS');
  assert.equal(parse('candidatos à reeleição', gaz).historico, 'ELEITO_MESMO_CARGO');
  assert.equal(parse('candidatos que falam de meio ambiente', gaz).tema, 'meio_ambiente');
  assert.equal(parse('resultado do 2º turno para governador', gaz).turno, 2);
  assert.equal(parse('candidatos deferidos a senador', gaz).apenasDeferidas, true);
});
