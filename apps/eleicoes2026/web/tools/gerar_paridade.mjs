#!/usr/bin/env node
// Gera contracts/answers_parity.json: as RESPOSTAS (texto) que o site monta para perguntas cuja resposta NÃO depende dos dados de candidatos
// (regras da urna, voto, calendário, ajuda, fontes, neutralidade...). O app Android confere o MESMO arquivo (AnswersParityTest.kt) e o site também
// (web/test/answers-parity.test.mjs), então qualquer texto que divergir entre as duas implementações do AnswerBuilder derruba o CI.
//
// Quando mudar um texto de propósito: altere os DOIS (answers.js e AnswerBuilder.kt), rode `node web/tools/gerar_paridade.mjs` e revise o diff do contrato.
// Respostas que dependem de candidatos, resultados ou pesquisas ficam de fora de propósito: mudam a cada atualização dos dados.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RAIZ, pacoteCompleto } from '../test/support.mjs';
import { AnswerBuilder } from '../src/eleicoes2026/js/answers.js';
import { parse } from '../src/eleicoes2026/js/nlu.js';

/** Intenções cujo texto não depende dos candidatos: perguntas do contrato golden com essas intenções entram. */
// SOBRE_DADOS fica de fora de propósito: o texto traz a versão do pacote e a ORIGEM ("site (assinatura verificada)" x "Atualização baixada"), que mudam por atualização e por plataforma.
export const INTENCOES_ESTATICAS = ['REGRAS_URNA', 'REGRAS_VOTO', 'SENADO_DOIS_VOTOS', 'AJUDA', 'FONTES', 'SIMULADOR', 'RECOMENDACAO', 'CALENDARIO', 'LOCAL_VOTACAO'];
export const EXTRAS = [
  'oi', 'obrigado', 'o que você faz?', 'como votar?', 'o voto em branco é válido?', 'quem vai ganhar a eleição?', 'qual o melhor candidato?',
  'quando é o segundo turno?', 'tem voto impresso?', 'posso levar celular para a cabine?',
];
export const HOJE = '2026-10-01';

export const normalizarTexto = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export async function gerar() {
  const { dados, gaz } = await pacoteCompleto();
  const golden = JSON.parse(readFileSync(resolve(RAIZ, 'contracts/nlu_golden_cases.json'), 'utf8')).cases;
  const perguntas = [...new Set([...golden.filter((c) => INTENCOES_ESTATICAS.includes(c.intent)).map((c) => c.q), ...EXTRAS])];
  const casos = [];
  for (const q of perguntas) {
    const r = await new AnswerBuilder({ data: dados, gaz, hoje: HOJE, ufPadrao: null, origem: 'LOCAL' }).construir(parse(q, gaz));
    // só entra o que não depende de candidatos: sem lista de candidatos citados e resolvida
    if (!r.resolvida || (r.candidateIds ?? []).length > 0) continue;
    casos.push({ q, hoje: HOJE, intent: r.intent, resolvida: r.resolvida, texto: normalizarTexto(r.directAnswer) });
  }
  return casos;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const casos = await gerar();
  const doc = {
    version: 1,
    descricao: 'Respostas que NÃO dependem de candidatos, geradas pelo site (web/tools/gerar_paridade.mjs) e conferidas pelo Android (AnswersParityTest) e pelo site (answers-parity.test.mjs). Texto normalizado (espaços colapsados). Regerar ao mudar um texto DE PROPÓSITO, nos dois AnswerBuilders.',
    cases: casos,
  };
  writeFileSync(resolve(RAIZ, 'contracts/answers_parity.json'), JSON.stringify(doc, null, 1) + '\n', 'utf8');
  console.log(`${casos.length} respostas gravadas em contracts/answers_parity.json`);
}
