// Comparação dos casos do contrato de NLU (contracts/nlu_golden_cases.json e contracts/nlu_real_cases.json) com o NLU do site.
// Mesma semântica de NluGoldenCasesTest.kt: chave ausente = não verificada; chave com null = deve estar ausente.
// Compartilhado por web/test/nlu-golden.test.mjs, web/test/real-cases.test.mjs e backend/retrain/lacunas.mjs.
import { parse } from '../src/eleicoes2026/js/nlu.js';
import { normalizar } from '../src/eleicoes2026/js/model.js';

/** Chaves verificadas (mesmas do NluGoldenCasesTest.kt). */
export const CHAVES_GOLDEN = [
  'intent', 'cargo', 'uf', 'partido', 'nome', 'tema', 'apenasDeferidas', 'apenasIndeferidas', 'historico', 'turno',
  'numero', 'genero', 'vice'
];

/** Compara como o Android: null = ausente; nome sem acento/caixa; vice só conta quando verdadeiro (r.vice.takeIf { it }). */
export function confere(chave, esperado, r) {
  const a = chave === 'vice' ? (r.vice === true ? true : null) : r[chave];
  if (esperado === null) return a === null || a === undefined;
  if (chave === 'nome') return normalizar(a ?? '') === normalizar(esperado);
  return a === esperado;
}

/** Falhas de UM caso contra o NLU local: lista de textos (vazia = passou). */
export function falhasDoCaso(caso, gaz) {
  const r = parse(caso.q, gaz);
  const falhas = [];
  for (const chave of CHAVES_GOLDEN) {
    if (!(chave in caso)) continue;
    if (!confere(chave, caso[chave], r)) falhas.push(`${chave} esperado=${JSON.stringify(caso[chave])} atual=${JSON.stringify(r[chave])}`);
  }
  return falhas;
}

/** Avalia vários casos: [{ caso, falhas }] só dos que falharam. */
export function avaliarCasos(casos, gaz) {
  return casos.map((caso) => ({ caso, falhas: falhasDoCaso(caso, gaz) })).filter((x) => x.falhas.length > 0);
}
