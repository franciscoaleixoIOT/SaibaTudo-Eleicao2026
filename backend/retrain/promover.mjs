#!/usr/bin/env node
// Promove o que uma pessoa revisou (decididas.jsonl) e o que entrou sozinho (auto.jsonl) para os arquivos VERSIONADOS:
//   - balde de holdout (sha256 % 100 < 20, calculado sobre o TEXTO FINAL) -> contracts/nlu_real_cases.json  (só MEDE, nunca treina)
//   - demais                                                              -> backend/retrain/extra/rotuladas_humanas_<data>.jsonl (treino)
// Defesas, porque estes arquivos são PÚBLICOS: só entra o que tem `publicavel: true` e o texto final revisado; o rótulo é revalidado
// (ponto fixo do normalizador) sobre esse texto; duplicadas e casos já existentes (golden, holdout, treino anterior) são ignorados.
// A fila crua (texto original dos usuários) nunca é copiada para cá.
//
// Uso: node backend/retrain/promover.mjs [--dir backend/retrain/review] [--data AAAA-MM-DD] [--dry-run]
import { existsSync, readFileSync, readdirSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOLDOUT_PCT, holdoutBucket } from './holdout.mjs';
import { REPO, carregarGazetteer, chaveQ, ehPontoFixo, opt } from './label_extra.mjs';
import { falhasDoCaso } from '../../web/test/contrato.mjs';
import { textoPublicavel } from './revisar.mjs';

const LICENCA = 'primeira parte: pergunta de usuário que consentiu em ajudar a melhorar o app; texto revisado por uma pessoa';

function lerJsonl(caminho) {
  if (!existsSync(caminho)) return [];
  return readFileSync(caminho, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

/** Chaves de tudo que já está versionado como caso ou exemplo: evita duplicar. */
export function chavesExistentes({ golden, reais, pastaExtra }) {
  const chaves = new Set();
  for (const f of [golden, reais]) {
    if (!existsSync(f)) continue;
    for (const c of JSON.parse(readFileSync(f, 'utf8')).cases ?? []) chaves.add(chaveQ(c.q));
  }
  if (existsSync(pastaExtra)) {
    for (const arq of readdirSync(pastaExtra).filter((n) => n.endsWith('.jsonl'))) {
      for (const o of lerJsonl(resolve(pastaExtra, arq))) if (typeof o.q === 'string') chaves.add(chaveQ(o.q));
    }
  }
  return chaves;
}

/** Caso no esquema do contrato (entidades como chaves diretas). */
export function casoDoContrato(r) {
  const { intent, ...ent } = r.alvo;
  return { q: r.q_final, intent, ...ent, origem: 'usuario', revisor: r.revisor, revisadoEm: r.revisadoEm };
}

/**
 * Marca `"lacuna": true` nos casos que o NLU local do site AINDA não entende, para a promoção não deixar o CI vermelho: o caso entra no
 * contrato (e passa a ser medido), a lacuna aparece em backend/retrain/lacunas.mjs e a marca sai quando alguém ensinar a regra.
 * Devolve cópias; não altera os objetos recebidos.
 */
export function marcarLacunas(casos, gaz) {
  return casos.map((c) => (falhasDoCaso(c, gaz).length > 0 ? { ...c, lacuna: true } : c));
}

/**
 * Função pura: decide o que vai para onde.
 * @returns {{holdout:object[], treino:object[], ignoradas:Record<string,number>}}
 */
export function planejarPromocao(registros, { existentes, holdoutPct = HOLDOUT_PCT }) {
  const holdout = [];
  const treino = [];
  const ignoradas = { nao_publicavel: 0, rejeitada: 0, texto_invalido: 0, rotulo_invalido: 0, duplicada: 0 };
  const vistas = new Set(existentes);
  for (const r of registros) {
    if (r.decisao === 'rejeitada') { ignoradas.rejeitada++; continue; }
    if (r.publicavel !== true) { ignoradas.nao_publicavel++; continue; }
    const q = r.q_final ?? r.q;
    const t = textoPublicavel(q);
    if (!t.ok) { ignoradas.texto_invalido++; continue; }
    if (!r.alvo || !ehPontoFixo(t.q, r.alvo)) { ignoradas.rotulo_invalido++; continue; }
    const chave = chaveQ(t.q);
    if (vistas.has(chave)) { ignoradas.duplicada++; continue; }
    vistas.add(chave);
    const final = { ...r, q_final: t.q };
    (holdoutBucket(t.q) < holdoutPct ? holdout : treino).push(final);
  }
  return { holdout, treino, ignoradas };
}

async function main() {
  const argv = process.argv.slice(2);
  const pasta = resolve(REPO, opt(argv, 'dir', 'backend/retrain/review'));
  const dia = opt(argv, 'data', new Date().toISOString().slice(0, 10));
  const seco = argv.includes('--dry-run');
  const reais = resolve(REPO, 'contracts/nlu_real_cases.json');
  const pastaExtra = resolve(REPO, 'backend/retrain/extra');
  const registros = [...lerJsonl(resolve(pasta, 'decididas.jsonl')), ...lerJsonl(resolve(pasta, 'auto.jsonl')).map((a) => ({ ...a, publicavel: false }))];
  // auto.jsonl vem de regras+juiz SEM texto revisado por pessoa: nunca é publicado automaticamente (publicavel=false acima).
  const existentes = chavesExistentes({ golden: resolve(REPO, 'contracts/nlu_golden_cases.json'), reais, pastaExtra });
  const { holdout, treino, ignoradas } = planejarPromocao(registros, { existentes });

  if (!seco) {
    if (holdout.length) {
      const doc = JSON.parse(readFileSync(reais, 'utf8'));
      doc.cases.push(...marcarLacunas(holdout.map(casoDoContrato), await carregarGazetteer()));
      writeFileSync(reais, JSON.stringify(doc, null, 2) + '\n', 'utf8');
    }
    if (treino.length) {
      const arq = resolve(pastaExtra, `rotuladas_humanas_${dia}.jsonl`);
      mkdirSync(dirname(arq), { recursive: true });
      appendFileSync(arq, treino.map((r) => JSON.stringify({ q: r.q_final, alvo: r.alvo, intent: r.intent, fonte: 'humano-revisado', origem: 'humano', licenca: LICENCA, coletadoEm: dia })).join('\n') + '\n', 'utf8');
    }
  }
  console.log(JSON.stringify({ holdout: holdout.length, treino: treino.length, ignoradas, dryRun: seco }, null, 1));
  if (holdout.length) console.log('Dica: rode `node backend/retrain/lacunas.mjs` para ver o que o NLU local ainda não entende.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
