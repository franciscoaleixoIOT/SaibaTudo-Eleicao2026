// "quem é o candidato a deputado CABO MACIEL": o NLU local tem de achar o candidato mesmo com "candidato a CARGO" na frase e com nomes que
// contêm palavras de outras regras. Contrato compartilhado com o Android (contracts/nlu_nome_cases.json, NomeCandidatoTest.kt).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RAIZ, pacoteCompleto } from './support.mjs';
import { acharNomeExato, parse } from '../src/eleicoes2026/js/nlu.js';
import { Gazetteer, semPontuacao } from '../src/eleicoes2026/js/gazetteer.js';
import { normalizar } from '../src/eleicoes2026/js/model.js';

const casos = JSON.parse(readFileSync(resolve(RAIZ, 'contracts/nlu_nome_cases.json'), 'utf8')).cases;

test('contrato de nomes: intenção e nome de todos os casos, inclusive as listagens que não podem virar perfil', async () => {
  const { gaz } = await pacoteCompleto();
  assert.ok(casos.length >= 30);
  const falhas = [];
  for (const c of casos) {
    const p = parse(c.q, gaz);
    if (p.intent !== c.intent) falhas.push(`${c.q}: intenção ${p.intent}, esperada ${c.intent}`);
    else if ((p.nome ?? null) !== c.nome) falhas.push(`${c.q}: nome ${p.nome}, esperado ${c.nome}`);
  }
  assert.deepEqual(falhas, []);
});

test('busca de nome ignora a pontuação: "prof. roger", "dr.luisinho" e "wilssa dantas-instituto"', async () => {
  const { gaz } = await pacoteCompleto();
  assert.equal(semPontuacao('prof. roger'), 'prof roger');
  assert.equal(semPontuacao('dr.luisinho'), 'dr luisinho');
  assert.ok(gaz.buscarPorNome('prof roger').some((c) => c.nomeUrna === 'PROF. ROGER'));
  assert.ok(gaz.buscarPorNome('dr luisinho').some((c) => c.nomeUrna === 'DR.LUISINHO'));
  assert.ok(gaz.buscarPorNome('dr. luisinho').some((c) => c.nomeUrna === 'DR.LUISINHO'), 'digitado com ponto também acha');
  assert.ok(gaz.buscarPorNome('wilssa dantas instituto').length > 0);
  // a busca manual da interface usa chaveBusca (com pontuação) e não muda
  const c = gaz.buscarPorNome('prof roger')[0];
  assert.ok(c.chaveBusca.includes('prof. roger'));
});

test('nome completo dentro da frase sai do texto antes da intenção: nomes com "animais", "celular", "fontes" e estado', async () => {
  const { gaz } = await pacoteCompleto();
  assert.deepEqual(acharNomeExato('quem e maria gato', gaz), { termo: 'maria gato', resto: 'quem e' });
  assert.equal(acharNomeExato('candidatos a governador em sp', gaz), null);
  assert.equal(acharNomeExato('voto em branco e voto nulo', gaz), null);
  const p = parse('quem é Nai da Bahia', gaz);
  assert.equal(p.intent, 'PERFIL_CANDIDATO');
  assert.equal(p.uf, null, 'a UF do nome não vira filtro');
  assert.equal(parse('maria gato é ficha limpa?', gaz).intent, 'ELEGIBILIDADE');
  assert.equal(parse('maria gato é ficha limpa?', gaz).nome, 'maria gato');
});

test('perguntas conhecidas: nome por extenso não muda o que já funcionava (dicionário sem o recurso continua valendo)', async () => {
  const { gaz } = await pacoteCompleto();
  // dicionário simulado sem ehNomeExato (testes antigos) continua funcionando
  const velho = { buscarPorNome: () => [], partidos: new Map() };
  assert.equal(acharNomeExato('quem e lula', velho), null);
  assert.equal(parse('candidatos a governador do PT em SP', gaz).intent, 'LISTAR_CANDIDATOS');
  assert.equal(parse('quantos candidatos a governador em SP', gaz).intent, 'CONTAR');
  assert.equal(parse('Quem foi eleito governador em SP?', gaz).intent, 'RESULTADOS');
  for (const q of ['quem vai pro segundo turno?', 'haverá 2º turno para presidente?']) assert.notEqual(parse(q, gaz).intent, 'PERFIL_CANDIDATO', q);
  assert.equal(parse('quem é o 13?', gaz).numero, '13', 'perfil por número continua valendo');
  assert.equal(normalizar('Cabo Maciel'), 'cabo maciel');
  assert.ok(new Gazetteer([]).ehNomeExato('x y') === false);
});

// ---- varredura: TODOS os candidatos do pacote, em quatro formas de perguntar (antes da correção, as formas com "candidato a CARGO" falhavam em 100 %) ----
test('varredura de todos os candidatos: o nome é achado em frases com "candidato a CARGO", "quem é", patrimônio e "quem é o CARGO"', async () => {
  const { gaz, dados } = await pacoteCompleto();
  const CARGO = { PRESIDENTE: 'presidente', GOVERNADOR: 'governador', SENADOR: 'senador', DEPUTADO_FEDERAL: 'deputado federal', DEPUTADO_ESTADUAL: 'deputado estadual', DEPUTADO_DISTRITAL: 'deputado distrital', VICE_PRESIDENTE: 'vice-presidente', VICE_GOVERNADOR: 'vice-governador' };
  const cands = dados.candidatos.filter((c) => CARGO[c.cargoCodigo]);
  assert.ok(cands.length > 10000, `candidatos varridos: ${cands.length}`);
  const formas = {
    quemEOCandidatoACargo: [(n, c) => `quem é o candidato a ${c} ${n}`, ['PERFIL_CANDIDATO']],
    quemEh: [(n) => `quem é ${n}`, ['PERFIL_CANDIDATO']],
    patrimonio: [(n, c) => `patrimônio do candidato a ${c} ${n}`, ['PATRIMONIO']],
    fichaLimpa: [(n) => `${n} é ficha limpa?`, ['ELEGIBILIDADE']],
  };
  for (const [nome, [f, esperado]] of Object.entries(formas)) {
    const falhas = [];
    for (const c of cands) {
      const p = parse(f(c.nomeUrna, CARGO[c.cargoCodigo]), gaz);
      const achou = p.nome && gaz.buscarPorNome(p.nome, null, null, 500).some((x) => x.id === c.id);
      if (!(esperado.includes(p.intent) && achou)) falhas.push(c.nomeUrna);
    }
    // sobram só nomes sem solução pelo texto: de 1 a 2 letras, iguais a palavra ou estado ("SEGUNDO", "SÃO", "MARANHÃO") e homônimos
    assert.ok(falhas.length / cands.length <= 0.003, `${nome}: ${falhas.length} de ${cands.length} falharam (ex.: ${falhas.slice(0, 8).join(', ')})`);
  }
});
