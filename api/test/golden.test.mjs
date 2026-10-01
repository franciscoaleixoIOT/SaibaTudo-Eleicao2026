// Casos de referência compartilhados (contracts/nlu_golden_cases.json) contra o normalizador do proxy:
// um modelo "perfeito" (que devolve exatamente o esperado) NÃO pode ter nenhuma entidade derrubada pela
// ancoragem nas perguntas reais do contrato, e o resultado respeita as regras do NluValidator do app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeModelOutput } from '../_lib/normalize.js';
import { fold } from '../_lib/ground.js';

const CASOS = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../contracts/nlu_golden_cases.json', import.meta.url)), 'utf8')
).cases;

const CHAVES = ['cargo', 'uf', 'partido', 'nome', 'tema', 'apenasDeferidas', 'historico', 'turno'];

/** Saída que um modelo v2 perfeito daria para o caso. */
function oraculoV2(c) {
  const o = { intent: c.intent ?? 'DESCONHECIDA' };
  for (const k of CHAVES) if (c[k] !== undefined && c[k] !== null) o[k] = k === 'nome' ? c[k].toUpperCase() : c[k];
  return o;
}

test('há casos de referência suficientes', () => {
  assert.ok(CASOS.length >= 40);
});

test('modelo perfeito (v2): nenhuma entidade dos casos de referência é descartada pela ancoragem', () => {
  for (const c of CASOS) {
    const r = normalizeModelOutput(oraculoV2(c), { question: c.q });
    assert.equal(r.ok, true, c.q);
    assert.deepEqual(r.dropped, [], `entidade descartada em: ${c.q} -> ${JSON.stringify(r.dropped)}`);
  }
});

test('modelo perfeito (v2): entidades e intenção batem com o caso (exceto regras de validação do app)', () => {
  for (const c of CASOS) {
    const { nlu } = normalizeModelOutput(oraculoV2(c), { question: c.q });
    for (const k of CHAVES) {
      if (!(k in c)) continue; // chave ausente no caso: não verificada
      if (c[k] === null) {
        assert.equal(nlu[k], undefined, `${c.q}: ${k} deveria estar ausente`);
      } else if (k === 'nome') {
        assert.equal(fold(nlu[k]), fold(c[k]), `${c.q}: nome`);
      } else {
        assert.equal(nlu[k], c[k], `${c.q}: ${k}`);
      }
    }
    if (c.intent) {
      const semEntidade = c.intent === 'LISTAR_CANDIDATOS' && !(c.cargo || c.uf || c.partido || c.tema);
      if (semEntidade) assert.equal(nlu.intent, 'DESCONHECIDA', `${c.q}: LISTAR sem entidade é rejeitado como no app`);
      else assert.equal(nlu.intent, c.intent, c.q);
    }
  }
});

test('modelo perfeito (formato legado) nas intenções representáveis', () => {
  const legado = (c) => {
    const f = { cargo: c.cargo ?? null, estado_uf: c.uf ?? null, partido: c.partido ?? null, tema: null, nome_candidato: c.nome ? c.nome.toUpperCase() : null, apenas_ficha_limpa: null, mandatos_anteriores: null };
    if (c.intent === 'PERFIL_CANDIDATO') return { intent: 'CANDIDATE_LOOKUP', target_route: 'candidates/todos', filters: f };
    if (c.intent === 'CALENDARIO') return { intent: 'CALENDAR_QUERY', target_route: 'info/calendario', filters: f };
    if (c.intent === 'LOCAL_VOTACAO') return { intent: 'VOTING_LOCATION_QUERY', target_route: 'info/locais', filters: f };
    if (c.intent === 'CONTAR') return { intent: 'EXPLAIN_TOPIC', target_route: 'info/estatisticas', filters: f };
    if (c.intent === 'PESQUISAS') return { intent: 'EXPLAIN_TOPIC', target_route: 'info/pesquisas', filters: f };
    if (c.intent === 'LISTAR_CANDIDATOS') return { intent: 'FILTER_CANDIDATES', target_route: 'candidates/todos', filters: f };
    return null;
  };
  let verificados = 0;
  for (const c of CASOS) {
    const saida = legado(c);
    if (!saida) continue;
    const { nlu } = normalizeModelOutput(saida, { question: c.q });
    for (const k of ['cargo', 'uf', 'partido']) {
      if (c[k]) assert.equal(nlu[k], c[k], `${c.q}: ${k}`);
      else if (k in c) assert.equal(nlu[k], undefined, `${c.q}: ${k} deveria estar ausente`);
    }
    verificados += 1;
  }
  assert.ok(verificados >= 20);
});

test('perguntas do contrato: alucinações típicas do modelo legado são derrubadas', () => {
  // "Quem é Lula?": o modelo devolve cargo/UF/partido de memória; a pergunta não cita nenhum
  const lula = CASOS.find((c) => c.q === 'Quem é Lula?');
  const r = normalizeModelOutput(
    { intent: 'CANDIDATE_LOOKUP', target_route: 'candidates/presidente', filters: { cargo: 'PRESIDENTE', estado_uf: null, partido: 'PT', nome_candidato: 'LULA' } },
    { question: lula.q }
  );
  assert.deepEqual(r.nlu, { intent: 'PERFIL_CANDIDATO', nome: 'LULA' });
  assert.deepEqual([...r.dropped].sort(), ['cargo', 'partido']);
});
