import test from 'node:test';
import assert from 'node:assert/strict';
import { FIM, INICIO, avaliar, emCongelamento, hojeBrasilia } from './congelamento.mjs';

const MODELO = ['backend/modal/convert_gguf.py'];

test('janela: 24 a 26/10 inclusive, horário de Brasília', () => {
  assert.equal(INICIO, '2026-10-24');
  assert.equal(FIM, '2026-10-26');
  for (const d of ['2026-10-24', '2026-10-25', '2026-10-26']) assert.equal(emCongelamento(d), true, d);
  for (const d of ['2026-10-23', '2026-10-27', '2026-10-05']) assert.equal(emCongelamento(d), false, d);
  // 26/10 às 22h de Brasília = 27/10 01:00 UTC: ainda é dia 26 em Brasília
  assert.equal(hojeBrasilia(Date.UTC(2026, 9, 27, 1, 0)), '2026-10-26');
  // 24/10 às 01h de Brasília = 24/10 04:00 UTC
  assert.equal(hojeBrasilia(Date.UTC(2026, 9, 24, 4, 0)), '2026-10-24');
  assert.equal(hojeBrasilia(Date.UTC(2026, 9, 24, 2, 0)), '2026-10-23', '23h de Brasília ainda é dia 23');
});

test('fora do congelamento tudo passa', () => {
  assert.equal(avaliar({ dia: '2026-10-20', arquivos: MODELO }).liberado, true);
});

test('durante o congelamento, mudar modelo, NLU, API, pipeline, contratos, workflows e app é bloqueado', () => {
  const protegidos = [
    'backend/modal/convert_gguf.py', 'ai_model/scripts/train_hybrid.py', 'api/_lib/neutralidade.js', 'api/nlu.js',
    'pipeline/build.py', 'contracts/nlu_golden_cases.json', '.github/workflows/data_refresh.yml', 'vercel.json',
    'web/src/eleicoes2026/js/nlu.js', 'web/src/eleicoes2026/js/answers.js', 'app/src/main/java/net/saibatudo/eleicoes2026/ai/nlu/LocalNlu.kt',
    'app/build.gradle.kts',
  ];
  for (const f of protegidos) {
    const r = avaliar({ dia: '2026-10-25', arquivos: [f] });
    assert.equal(r.liberado, false, f);
    assert.deepEqual(r.bloqueados, [f]);
  }
});

test('durante o congelamento, dados, documentação, métricas e testes seguem livres', () => {
  const livres = ['data/eleicoes2026/manifest.json', 'data/eleicoes2026/resultados/SP.json', 'docs/OPERACAO.md', 'eval/2026-10-25.json',
    'README.md', 'web/test/answers.test.mjs', 'api/test/health.test.mjs', 'app/src/test/java/net/saibatudo/eleicoes2026/X.kt', 'store/play/ficha.md'];
  assert.equal(avaliar({ dia: '2026-10-25', arquivos: livres }).liberado, true);
});

test('um arquivo protegido no meio de arquivos livres bloqueia só ele', () => {
  const r = avaliar({ dia: '2026-10-25', arquivos: ['data/a.json', 'pipeline/sign.py', 'docs/x.md'] });
  assert.equal(r.liberado, false);
  assert.deepEqual(r.bloqueados, ['pipeline/sign.py']);
});

test('exceção explícita: [congelamento-ok] na mensagem ou FREEZE_OVERRIDE', () => {
  assert.equal(avaliar({ dia: '2026-10-25', arquivos: MODELO, mensagem: 'fix(nlu): bug crítico [congelamento-ok]' }).liberado, true);
  assert.equal(avaliar({ dia: '2026-10-25', arquivos: MODELO, mensagem: 'fix(nlu): [CONGELAMENTO-OK] urgente' }).liberado, true);
  assert.equal(avaliar({ dia: '2026-10-25', arquivos: MODELO, override: true }).liberado, true);
  assert.equal(avaliar({ dia: '2026-10-25', arquivos: MODELO, mensagem: 'fix: ajuste' }).liberado, false);
});
