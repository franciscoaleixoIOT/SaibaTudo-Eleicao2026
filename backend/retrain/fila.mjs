#!/usr/bin/env node
// Fila de revisão das perguntas reais que o app NÃO entendeu (parte do ciclo de auto-melhoria; docs/OPERACAO.md e o relatório de evolução).
//
// Cada pergunta recebe DOIS rótulos independentes:
//   - alvo_regras: o NLU determinístico dos clientes sobre o pacote oficial (o oráculo que já existe em label_extra.mjs);
//   - alvo_juiz:   a saída do modelo (judge_extra.py), normalizada e ANCORADA no texto da pergunta pelo mesmo normalizador do proxy.
// Quem decide é a regra abaixo. O custo de um rótulo errado muda conforme a intenção:
//   - intenção SEM entidade (calendário, regras da urna, ajuda...): o erro é de roteamento, nunca um fato errado. Se regras e juiz
//     CONCORDAM e o rótulo é ponto fixo do normalizador, entra sozinho ("auto").
//   - qualquer coisa com entidade (nome, partido, UF, tema...), qualquer divergência, DESCONHECIDA e RECOMENDACAO: vai para uma PESSOA.
// Nunca se usa a intenção que o usuário "viu" num relato como rótulo: era justamente a que falhou.
//
// Destino por balde estável (holdout.mjs): ~20 % das aprovadas só MEDEM (contracts/nlu_real_cases.json), o resto ENSINA (treino).
//
// Privacidade: a fila contém texto de usuários e NÃO deve ser versionada (backend/retrain/review/ está no .gitignore). Só o que uma pessoa
// revisou e marcou como publicável, com o texto final dela, entra em arquivos versionados (promover.mjs).
//
// Uso:
//   node backend/retrain/fila.mjs --in sinais.jsonl [--julgadas julgadas.jsonl] [--out backend/retrain/review] [--data data/eleicoes2026]
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../../web/src/eleicoes2026/js/nlu.js';
import { normalizeModelOutput } from '../../api/_lib/normalize.js';
import { limparMultilinha, redactPii } from '../../api/_lib/sanitize.js';
import { HOLDOUT_PCT, holdoutBucket } from './holdout.mjs';
import { REPO, alvoDe, carregarGazetteer, chaveQ, ehPontoFixo, escreverJsonl, lerEntradas, opt } from './label_extra.mjs';

/** Intenções cujo erro é só de roteamento (sem entidade): únicas elegíveis à aceitação automática. */
export const INTENCOES_AUTO = new Set([
  'CALENDARIO', 'LOCAL_VOTACAO', 'REGRAS_URNA', 'REGRAS_VOTO', 'SENADO_DOIS_VOTOS', 'FONTES', 'SOBRE_DADOS', 'AJUDA', 'SIMULADOR',
]);

const MARCAS_PII = ['[e-mail removido]', '[documento removido]', '[telefone removido]', '[número removido]'];
const MIN = 3;
const MAX = 300;

/** Chaves de perguntas que já são casos de teste (golden e holdout real): não entram na fila, para não treinar/medir duas vezes. */
export function chavesConhecidas(caminhos) {
  const chaves = new Set();
  for (const c of caminhos) {
    if (!existsSync(c)) continue;
    for (const caso of JSON.parse(readFileSync(c, 'utf8')).cases ?? []) chaves.add(chaveQ(caso.q));
  }
  return chaves;
}

/** Normaliza a saída bruta do juiz (texto do modelo) para um alvo ancorado na pergunta; null se inaproveitável. */
export function alvoDoJuiz(bruto, q) {
  if (bruto === null || bruto === undefined) return null;
  const r = normalizeModelOutput(bruto, { question: q });
  if (!r.ok || r.dropped.length > 0) return null; // o modelo inventou algo que a pergunta não sustenta: não vale como rótulo
  const alvo = alvoDe(r.nlu);
  return alvo && ehPontoFixo(q, alvo) ? alvo : null;
}

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Decide o destino de uma pergunta já rotulada.
 * @returns {{status:'auto'|'revisao', motivos:string[]}}
 */
export function decidir({ alvoRegras, alvoJuiz }) {
  const motivos = [];
  if (!alvoJuiz) motivos.push('sem_juiz');
  if (!alvoRegras) motivos.push('regras_nao_representa');
  if (alvoRegras && alvoJuiz && !igual(alvoRegras, alvoJuiz)) motivos.push('divergente');
  const alvo = alvoRegras ?? alvoJuiz;
  if (alvo) {
    if (alvo.intent === 'DESCONHECIDA') motivos.push('desconhecida');
    if (alvo.intent === 'RECOMENDACAO') motivos.push('recomendacao');
    if (Object.keys(alvo).length > 1) motivos.push('tem_entidade');
    if (!INTENCOES_AUTO.has(alvo.intent) && !motivos.includes('tem_entidade')) motivos.push('intencao_nao_elegivel_a_auto');
  }
  return motivos.length === 0 ? { status: 'auto', motivos } : { status: 'revisao', motivos };
}

/**
 * Monta a fila.
 * @param {Array<{q:string, n?:number, fonte?:string}>} entradas  perguntas (n = quantas vezes apareceu, se conhecido)
 * @param {{gaz:object, julgadas?:Map<string,*>, conhecidas?:Set<string>, holdoutPct?:number}} cfg  `julgadas`: chaveQ -> saída bruta do juiz
 */
export function montarFila(entradas, { gaz, julgadas = new Map(), conhecidas = new Set(), holdoutPct = HOLDOUT_PCT }) {
  const descartes = { vazio: 0, curto: 0, longo: 0, pii: 0, duplicada: 0, ja_e_caso_de_teste: 0 };
  const auto = [];
  const revisao = [];
  const vistas = new Set();

  for (const item of entradas) {
    if (!item || typeof item.q !== 'string') { descartes.vazio++; continue; }
    const q = limparMultilinha(item.q).replace(/\s+/g, ' ').trim();
    if (!q) { descartes.vazio++; continue; }
    if (q.length < MIN) { descartes.curto++; continue; }
    if (q.length > MAX) { descartes.longo++; continue; }
    if (redactPii(q) !== q || MARCAS_PII.some((m) => q.includes(m))) { descartes.pii++; continue; }
    const chave = chaveQ(q);
    if (conhecidas.has(chave)) { descartes.ja_e_caso_de_teste++; continue; }
    if (vistas.has(chave)) { descartes.duplicada++; continue; }
    vistas.add(chave);

    const rotuloRegras = alvoDe(parse(q, gaz));
    const alvoRegras = rotuloRegras && ehPontoFixo(q, rotuloRegras) ? rotuloRegras : null;
    const alvoJuiz = alvoDoJuiz(julgadas.get(chave), q);
    const { status, motivos } = decidir({ alvoRegras, alvoJuiz });
    const registro = {
      q,
      n: Number.isInteger(item.n) && item.n > 0 ? item.n : 1,
      alvo_regras: alvoRegras,
      alvo_juiz: alvoJuiz,
      motivos,
      destino: holdoutBucket(q) < holdoutPct ? 'holdout' : 'treino',
      ...(item.fonte ? { fonte: item.fonte } : {}),
    };
    if (status === 'auto') auto.push({ ...registro, alvo: alvoRegras, decisao: 'auto', revisor: 'regras+juiz' });
    else revisao.push(registro);
  }

  // o que mais se repete e mais precisa de rótulo vem primeiro: poucas decisões humanas, alto valor
  revisao.sort((a, b) => b.n - a.n || a.q.localeCompare(b.q, 'pt-BR'));
  const motivos = {};
  for (const r of revisao) for (const m of r.motivos) motivos[m] = (motivos[m] ?? 0) + 1;
  return {
    auto,
    revisao,
    resumo: {
      lidas: entradas.length,
      auto: auto.length,
      para_revisao: revisao.length,
      descartes,
      motivos_da_revisao: Object.fromEntries(Object.entries(motivos).sort()),
      destino: {
        holdout: [...auto, ...revisao].filter((r) => r.destino === 'holdout').length,
        treino: [...auto, ...revisao].filter((r) => r.destino === 'treino').length,
      },
    },
  };
}

/** Lê o arquivo do juiz: JSONL { q, bruto } -> Map(chaveQ -> bruto). */
export function lerJulgadas(caminho) {
  const mapa = new Map();
  if (!caminho || !existsSync(caminho)) return mapa;
  for (const l of readFileSync(caminho, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    const o = JSON.parse(l);
    if (typeof o.q === 'string') mapa.set(chaveQ(o.q), o.bruto ?? o.saida ?? null);
  }
  return mapa;
}

async function main() {
  const argv = process.argv.slice(2);
  const entrada = opt(argv, 'in');
  if (!entrada) {
    console.error('uso: node backend/retrain/fila.mjs --in <perguntas.jsonl> [--julgadas <julgadas.jsonl>] [--out backend/retrain/review] [--data data/eleicoes2026]');
    process.exit(2);
  }
  const saida = resolve(REPO, opt(argv, 'out', 'backend/retrain/review'));
  const gaz = await carregarGazetteer(resolve(REPO, opt(argv, 'data', 'data/eleicoes2026')));
  const conhecidas = chavesConhecidas([resolve(REPO, 'contracts/nlu_golden_cases.json'), resolve(REPO, 'contracts/nlu_real_cases.json')]);
  const julgadas = lerJulgadas(opt(argv, 'julgadas') ? resolve(REPO, opt(argv, 'julgadas')) : null);
  const { auto, revisao, resumo } = montarFila(lerEntradas(resolve(REPO, entrada)), { gaz, julgadas, conhecidas });
  escreverJsonl(resolve(saida, 'pending.jsonl'), revisao);
  escreverJsonl(resolve(saida, 'auto.jsonl'), auto);
  console.log(JSON.stringify({ ...resumo, saida }, null, 1));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
