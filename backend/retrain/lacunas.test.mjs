import test from 'node:test';
import assert from 'node:assert/strict';
import { agrupar, dicaDoGrupo, jaccard, relatorioMarkdown, termosDistintivos, tokens } from './lacunas.mjs';
import { carregarGazetteer } from './label_extra.mjs';
import { avaliarCasos } from '../../web/test/contrato.mjs';

const falha = (q, intent, extra = {}, f = ['intent esperado']) => ({ caso: { q, intent, ...extra }, falhas: f });

test('tokens ignora palavras vazias e acentos; jaccard mede a sobreposição', () => {
  assert.deepEqual(tokens('Como funciona a biometria?'), ['funciona', 'biometria']);
  assert.equal(jaccard(['a', 'b'], ['a', 'b']), 1);
  assert.equal(jaccard(['a', 'b'], ['c']), 0);
  assert.equal(jaccard([], []), 0);
});

test('agrupar junta perguntas parecidas da mesma intenção e separa as de intenções diferentes', () => {
  const grupos = agrupar([
    falha('o eleitor pode votar de bermuda', 'REGRAS_URNA'),
    falha('posso votar de bermuda ou chinelo', 'REGRAS_URNA'),
    falha('votar de bermuda é permitido', 'REGRAS_URNA'),
    falha('que horas abre a votação', 'CALENDARIO'),
    falha('votar de bermuda', 'LOCAL_VOTACAO'), // mesma frase, outra intenção esperada: grupo próprio
  ]);
  assert.equal(grupos.length, 3);
  assert.equal(grupos[0].intent, 'REGRAS_URNA');
  assert.equal(grupos[0].casos.length, 3, 'o maior grupo vem primeiro');
});

test('termosDistintivos só devolve termos que NÃO aparecem em outras intenções (evita falso positivo)', () => {
  const grupo = agrupar([
    falha('posso votar de bermuda', 'REGRAS_URNA'),
    falha('voto de bermuda e permitido', 'REGRAS_URNA'),
  ])[0];
  const outros = [
    { q: 'quando é a votação', intent: 'CALENDARIO' },    // "votacao" em outra intenção
    { q: 'onde é o meu local de voto', intent: 'LOCAL_VOTACAO' }, // "voto" em outra intenção
  ];
  const termos = termosDistintivos(grupo, outros).map((t) => t.termo);
  assert.ok(termos.includes('bermuda'));
  assert.ok(!termos.includes('voto'), 'colidiria com LOCAL_VOTACAO');
  assert.equal(termosDistintivos(grupo, outros)[0].termo, 'bermuda', 'o termo repetido no grupo vem primeiro');
});

test('dicaDoGrupo aponta onde mexer e repete as regras de ouro', () => {
  assert.match(dicaDoGrupo({ intent: 'REGRAS_URNA', casos: [falha('x', 'REGRAS_URNA')] }), /sem entidade/);
  const d = dicaDoGrupo({ intent: 'LISTAR_CANDIDATOS', casos: [falha('minas', 'LISTAR_CANDIDATOS', { uf: 'MG' })] });
  assert.match(d, /gazetteer/);
  assert.match(d, /EXISTE no pacote oficial/);
});

test('relatório em Markdown: contagens, os dois NLUs, a regra da marca lacuna e cada pergunta', () => {
  const grupos = agrupar([falha('posso votar de bermuda', 'REGRAS_URNA', {}, ['intent esperado="REGRAS_URNA" atual="DESCONHECIDA"'])]);
  const md = relatorioMarkdown(grupos, { total: 5, falhas: 1, todos: [] });
  assert.match(md, /\*\*1 de 5\*\*/);
  assert.match(md, /nlu\.js/);
  assert.match(md, /LocalNlu\.kt/);
  assert.match(md, /"lacuna": true/);
  assert.match(md, /"posso votar de bermuda"/);
  assert.match(md, /Sugere, não altera código/);
});

test('integração: o NLU local real aponta como lacuna o que ele de fato não entende', async () => {
  const gaz = await carregarGazetteer();
  const casos = [
    { q: 'quando é a eleição', intent: 'CALENDARIO' },                       // entende
    { q: 'asdkjh qwerty zzz', intent: 'REGRAS_URNA' },                       // não entende
    { q: 'candidatos a governador em SP', intent: 'LISTAR_CANDIDATOS', cargo: 'GOVERNADOR', uf: 'SP' }, // entende
  ];
  const falhas = avaliarCasos(casos, gaz);
  assert.deepEqual(falhas.map((f) => f.caso.q), ['asdkjh qwerty zzz']);
  assert.match(falhas[0].falhas[0], /intent esperado="REGRAS_URNA"/);
});
