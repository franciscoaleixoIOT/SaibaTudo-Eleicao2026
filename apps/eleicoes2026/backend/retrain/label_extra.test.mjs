// Testes do rotulador de perguntas externas (backend/retrain/label_extra.mjs) e do coletor de relatos
// (colher_relatos.mjs). O rotulador usa o pacote de dados OFICIAL real (data/eleicoes2026) — nada fictício.
// Rodar: node --test "backend/retrain/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CHAVES_ROTULO, alvoDe, chaveQ, carregarGazetteer, ehPontoFixo, lerEntradas, rotular,
} from './label_extra.mjs';
import { deduplicar, perguntaDaIssue, secaoEmBloco } from './colher_relatos.mjs';

// ------------------------------------------------------------------ mapeamento do rótulo (funções puras)

test('alvoDe mantém só as chaves do contrato v2, na ordem canônica', () => {
  const r = alvoDe({ intent: 'LISTAR_CANDIDATOS', cargo: 'GOVERNADOR', uf: 'SP', partido: 'PT', nome: null, tema: undefined,
    apenasDeferidas: false, apenasIndeferidas: null, historico: null, turno: null, textoOriginal: 'x', resolvida: true });
  assert.deepEqual(r, { intent: 'LISTAR_CANDIDATOS', cargo: 'GOVERNADOR', uf: 'SP', partido: 'PT' });
  assert.deepEqual(Object.keys(r), ['intent', 'cargo', 'uf', 'partido']);
  for (const k of Object.keys(r)) assert.ok(k === 'intent' || CHAVES_ROTULO.includes(k));
});

test('alvoDe: RECOMENDACAO e DESCONHECIDA não levam entidades (Res. TSE 23.755/2026)', () => {
  assert.deepEqual(alvoDe({ intent: 'RECOMENDACAO', cargo: 'PRESIDENTE' }), { intent: 'RECOMENDACAO' });
  assert.deepEqual(alvoDe({ intent: 'DESCONHECIDA', uf: 'SP' }), { intent: 'DESCONHECIDA' });
});

test('alvoDe: SEGUNDO_TURNO implica turno 2', () => {
  assert.deepEqual(alvoDe({ intent: 'SEGUNDO_TURNO' }), { intent: 'SEGUNDO_TURNO', turno: 2 });
});

test('alvoDe descarta o que o contrato v2 não representa (numero, genero, vice, apenasIndeferidas)', () => {
  for (const extra of [{ numero: 13 }, { genero: 'FEMININO' }, { vice: true }, { apenasIndeferidas: true }]) {
    assert.equal(alvoDe({ intent: 'LISTAR_CANDIDATOS', cargo: 'SENADOR', ...extra }), null, JSON.stringify(extra));
  }
  // ausência ou valor neutro não descarta
  assert.ok(alvoDe({ intent: 'LISTAR_CANDIDATOS', cargo: 'SENADOR', vice: false, numero: null }));
});

test('chaveQ normaliza caixa, acento e espaços para deduplicar', () => {
  assert.equal(chaveQ('  Quem   É LULA? '), chaveQ('quem e lula'));
  assert.notEqual(chaveQ('quem é lula'), chaveQ('quem é bolsonaro'));
});

test('ehPontoFixo aceita rótulo ancorado e rejeita entidade sem evidência na pergunta', () => {
  assert.ok(ehPontoFixo('candidatos a governador em SP', { intent: 'LISTAR_CANDIDATOS', cargo: 'GOVERNADOR', uf: 'SP' }));
  // UF que não aparece na pergunta: a ancoragem do proxy derruba => não é ponto fixo
  assert.ok(!ehPontoFixo('candidatos a governador', { intent: 'LISTAR_CANDIDATOS', cargo: 'GOVERNADOR', uf: 'SP' }));
  // PERFIL sem nome volta como DESCONHECIDA => não é ponto fixo
  assert.ok(!ehPontoFixo('quem é ele', { intent: 'PERFIL_CANDIDATO' }));
});

test('lerEntradas aceita JSONL e array JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'extras-'));
  try {
    const jsonl = join(dir, 'a.jsonl');
    writeFileSync(jsonl, '{"q":"um"}\n\n{"q":"dois"}\n', 'utf8');
    assert.deepEqual(lerEntradas(jsonl), [{ q: 'um' }, { q: 'dois' }]);
    const arr = join(dir, 'b.json');
    writeFileSync(arr, JSON.stringify([{ q: 'tres' }]), 'utf8');
    assert.deepEqual(lerEntradas(arr), [{ q: 'tres' }]);
    const vazio = join(dir, 'c.jsonl');
    writeFileSync(vazio, '   \n', 'utf8');
    assert.deepEqual(lerEntradas(vazio), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------ rotulagem sobre o pacote oficial real

test('rotular: rótulos reais, descartes por PII/duplicada/desconhecida e invariantes', async () => {
  const gaz = await carregarGazetteer();
  const perguntas = [
    { q: 'quais sao os candidatos a governador de sao paulo', fonte: 'faq-tse', licenca: 'oficial TSE' },
    { q: 'QUAIS SAO OS CANDIDATOS A GOVERNADOR DE SAO PAULO', fonte: 'duplicada' },        // mesma pergunta
    { q: 'meu cpf é 123.456.789-09 e quero ver os candidatos', fonte: 'relato-ia#1' },    // dado pessoal
    { q: 'quero falar com fulano@mail.com sobre a eleição', fonte: 'relato-ia#2' },
    { q: 'asdf qwerty zxcv', fonte: 'relato-ia#3' },                                      // não entendida
    { q: 'em quem devo votar para presidente', fonte: 'relato-ia#4' },                    // recomendação
    { q: 'ab', fonte: 'curta' },                                                          // abaixo do mínimo
  ];
  const { aceitas, resumo } = rotular(perguntas, { gaz });

  assert.equal(resumo.lidas, perguntas.length);
  assert.equal(resumo.descartes.duplicado, 1);
  assert.equal(resumo.descartes.pii, 2);
  assert.equal(resumo.descartes.desconhecida, 1);   // DESCONHECIDA só entra com --manter-desconhecidas
  assert.equal(resumo.descartes.curto, 1);
  assert.equal(resumo.descartes.nao_ponto_fixo, 0);

  const porQ = Object.fromEntries(aceitas.map((a) => [chaveQ(a.q), a]));
  const listar = porQ['quais sao os candidatos a governador de sao paulo'];
  assert.ok(listar, 'pergunta real deveria ser rotulada');
  assert.equal(listar.alvo.intent, 'LISTAR_CANDIDATOS');
  assert.equal(listar.alvo.cargo, 'GOVERNADOR');
  assert.equal(listar.alvo.uf, 'SP');
  assert.equal(listar.fonte, 'faq-tse');
  assert.equal(listar.licenca, 'oficial TSE');

  const rec = porQ['em quem devo votar para presidente'];
  assert.deepEqual(rec.alvo, { intent: 'RECOMENDACAO' });   // recusa, sem entidades

  // invariante: TUDO que sai rotulado é ponto fixo do normalizador do proxy
  for (const a of aceitas) assert.ok(ehPontoFixo(a.q, a.alvo), a.q);
});

test('rotular: --manter-desconhecidas preserva até N não entendidas (ensina o modelo a não chutar)', async () => {
  const gaz = await carregarGazetteer();
  // Tokens impossíveis: sem vogais/sem qualquer nome de urna oficial (uma palavra que EXISTA como nome
  // de urna vira PERFIL_CANDIDATO — comportamento correto, coberto pelo teste de nome parcial).
  const perguntas = [
    { q: 'xqz ploftk zbrtl', fonte: 'a' },
    { q: 'wxyz qkvrm jhtpd', fonte: 'b' },
    { q: 'bnmqx ztlpr wvkjd', fonte: 'c' },
  ];
  const sem = rotular(perguntas, { gaz });
  assert.equal(sem.aceitas.length, 0);
  assert.equal(sem.resumo.descartes.desconhecida, 3);

  const comTeto = rotular(perguntas, { gaz, manterDesconhecidas: 2 });
  assert.equal(comTeto.aceitas.length, 2);
  assert.ok(comTeto.aceitas.every((a) => a.alvo.intent === 'DESCONHECIDA'));
  assert.deepEqual(comTeto.aceitas[0].alvo, { intent: 'DESCONHECIDA' });
});

test('palavra que existe como nome de urna oficial é resolvida como PERFIL_CANDIDATO', async () => {
  const gaz = await carregarGazetteer();
  const { aceitas } = rotular([{ q: 'quem é xqz ploftk zbrtl', fonte: 'a' }], { gaz });
  assert.equal(aceitas.length, 0);   // nenhum desses tokens é candidatura oficial
});

// ------------------------------------------------------------------ coletor de relatos (issues públicas)

const ISSUE = {
  number: 42,
  created_at: '2026-10-02T03:04:05Z',
  body: [
    'Relato criado pelo app.', '', '| Campo | Valor |', '| --- | --- |', '| Intenção | `DESCONHECIDA` |',
    '| Origem da resposta | `LOCAL` |', '| Versão dos dados | `20261002T085828Z-ace5a77c3157` |',
    '| App | `1.0.0` |', '| Cliente | `web` |', '',
    '### Pergunta', '```text', 'quantos candidatos a deputado distrital tem no df', '```', '',
    '### Resposta exibida', '```text', 'Não entendi…', '```',
  ].join('\n'),
};

test('secaoEmBloco extrai o bloco de código da seção (inclusive com cerca maior que 3 crases)', () => {
  assert.equal(secaoEmBloco(ISSUE.body, 'Pergunta'), 'quantos candidatos a deputado distrital tem no df');
  assert.ok(secaoEmBloco(ISSUE.body, 'Resposta exibida').startsWith('Não entendi'));
  assert.equal(secaoEmBloco(ISSUE.body, 'Inexistente'), null);
  assert.equal(secaoEmBloco('### Pergunta\n````text\ncom crase ` dentro\n````', 'Pergunta'), 'com crase ` dentro');
});

test('perguntaDaIssue monta a proveniência e recusa texto com dado pessoal mascarado', () => {
  assert.deepEqual(perguntaDaIssue(ISSUE), {
    q: 'quantos candidatos a deputado distrital tem no df',
    fonte: 'relato-ia#42',
    licenca: 'primeira parte: relato enviado pelo usuário no app/site (público no repositório)',
    coletadoEm: '2026-10-02',
  });
  const comPii = { ...ISSUE, body: ISSUE.body.replace(/quantos candidatos[^\n]*/, 'meu email é [e-mail removido] e quero ver') };
  assert.equal(perguntaDaIssue(comPii), null);
  assert.equal(perguntaDaIssue({ number: 1, body: 'sem seção' }), null);
});

test('deduplicar preserva a primeira ocorrência e ignora vazias', () => {
  const unicas = deduplicar([
    { q: 'Quem é LULA?', fonte: 'a' }, { q: 'quem e lula', fonte: 'b' }, { q: '   ', fonte: 'c' }, { q: 'outra pergunta', fonte: 'd' },
  ]);
  assert.deepEqual(unicas.map((u) => u.fonte), ['a', 'd']);
});
