#!/usr/bin/env node
// Rotula perguntas coletadas de fontes EXTERNAS (relatos de usuários, FAQ/ouvidoria oficial do TSE,
// parafraseamento sintético, datasets com licença permissiva) para o retreino do NLU no formato v2.
//
// REGRA DE OURO: o rótulo NUNCA vem da fonte coletada. Ele é produzido pelo NLU determinístico dos
// clientes (web/src/eleicoes2026/js/nlu.js, porte de LocalNlu.kt) sobre o pacote de dados OFICIAL e só é
// aceito se for PONTO FIXO do normalizador do proxy (api/_lib/normalize.js), que ancora cada entidade no
// texto da pergunta. Assim uma pergunta de origem não oficial não tem como introduzir fato não oficial:
// o alvo contém apenas intenção + entidades já validadas contra o pacote assinado (o cliente ainda
// revalida tudo — NluValidator no Android, validarNluNuvem no site).
//
// Descartados (com contadores): fora do limite de tamanho, dados pessoais (mascarados ou detectados),
// duplicados, entidades que o contrato v2 não representa (numero/genero/vice/apenasIndeferidas — o NLU
// local cobre esses casos), DESCONHECIDA (só entram até --manter-desconhecidas) e rótulos que não são
// ponto fixo do normalizador.
//
// Uso:
//   node backend/retrain/label_extra.mjs --in backend/retrain/extra/perguntas.jsonl \
//        --out backend/retrain/extra/rotuladas.jsonl [--data data/eleicoes2026] [--manter-desconhecidas 200]
//
// Entrada: JSONL (um objeto por linha) ou array JSON com { q, fonte?, licenca?, coletadoEm? }.
// Saída:   JSONL com { q, alvo, intent, nomeFonte?, fonte?, licenca?, coletadoEm? } — consumido por
//          build_nlu_dataset.py --extra.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataStore } from '../../web/src/eleicoes2026/js/data.js';
import { Gazetteer } from '../../web/src/eleicoes2026/js/gazetteer.js';
import { parse } from '../../web/src/eleicoes2026/js/nlu.js';
import { normalizeModelOutput } from '../../api/_lib/normalize.js';
import { limparMultilinha, redactPii } from '../../api/_lib/sanitize.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(AQUI, '../..');

/** Ordem canônica das chaves do rótulo v2 (a mesma de api/_lib/normalize.js: ORDEM_CAMPOS). */
export const CHAVES_ROTULO = ['cargo', 'uf', 'partido', 'nome', 'tema', 'apenasDeferidas', 'historico', 'turno'];

/** Entidades que o NLU local entende mas o contrato v2 não expressa: a pergunta não pode virar exemplo. */
export const NAO_REPRESENTAVEIS = ['apenasIndeferidas', 'numero', 'genero', 'vice'];

/** Marcas deixadas por redactPii: se aparecerem, o texto original tinha dado pessoal — descartar. */
const MARCAS_PII = ['[e-mail removido]', '[documento removido]', '[telefone removido]', '[número removido]'];

const MIN_PADRAO = 3;
const MAX_PADRAO = 300;

export const opt = (argv, nome, padrao = null) => {
  const i = argv.indexOf(`--${nome}`);
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : padrao;
};

/** Normalização para deduplicação — a mesma de build_nlu_dataset.py: só palavras alfanuméricas,
 *  sem acento e em minúsculas (pontuação e espaços não distinguem exemplos). */
export function chaveQ(q) {
  return String(q)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join(' ');
}

/** Lê JSONL, array JSON ou .txt (uma pergunta por linha; linhas iniciadas por # são comentários). */
export function lerEntradas(caminho) {
  const bruto = readFileSync(caminho, 'utf8').trim();
  if (!bruto) return [];
  if (caminho.toLowerCase().endsWith('.txt')) {
    return bruto
      .split('\n')
      .map((l) => l.replace(/\r$/, '').trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((q) => ({ q }));
  }
  if (bruto.startsWith('[')) return JSON.parse(bruto);
  return bruto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

/** fetch que serve o pacote de dados oficial do disco (mesma abordagem dos testes do site). */
function fetchDeDisco(dir) {
  const base = 'http://rotulador.local/data/eleicoes2026/';
  return async (url) => {
    const u = String(url).split('?')[0];
    if (!u.startsWith(base)) return new Response('fora do pacote', { status: 404 });
    const arq = resolve(dir, u.slice(base.length));
    if (!existsSync(arq)) return new Response('não encontrado', { status: 404 });
    return new Response(readFileSync(arq), { status: 200 });
  };
}

/** Carrega o pacote oficial completo e devolve o Gazetteer usado pelo NLU. */
export async function carregarGazetteer(dataDir = resolve(REPO, 'data/eleicoes2026')) {
  const store = new DataStore({ baseUrl: 'http://rotulador.local/data/eleicoes2026/', fetchFn: fetchDeDisco(dataDir) });
  await store.iniciar();
  await store.ensureTodas();
  return new Gazetteer(store.candidatos, store.partidosConhecidos());
}

/** Converte o resultado do NLU no rótulo v2 canônico; null quando não representável. */
export function alvoDe(r) {
  if (!r || typeof r.intent !== 'string') return null;
  for (const k of NAO_REPRESENTAVEIS) {
    const v = r[k];
    if (v !== null && v !== undefined && v !== false) return null;
  }
  const alvo = { intent: r.intent };
  if (r.intent === 'DESCONHECIDA' || r.intent === 'RECOMENDACAO') return alvo;
  for (const k of CHAVES_ROTULO) {
    const v = r[k];
    if (v !== null && v !== undefined && v !== false) alvo[k] = v;
  }
  if (r.intent === 'SEGUNDO_TURNO' && alvo.turno === undefined) alvo.turno = 2;
  return alvo;
}

/** O rótulo precisa sobreviver intacto ao normalizador do proxy (ancoragem + vocabulário). */
export function ehPontoFixo(q, alvo) {
  const label = JSON.stringify(alvo);
  const r = normalizeModelOutput(label, { question: q });
  return r.ok && r.dropped.length === 0 && JSON.stringify(r.nlu) === label;
}

/**
 * Rotula uma lista de perguntas.
 * @param {Array<{q:string,fonte?:string,licenca?:string,coletadoEm?:string}>} perguntas
 * @param {{gaz:object, manterDesconhecidas?:number, minChars?:number, maxChars?:number}} cfg
 */
export function rotular(perguntas, { gaz, manterDesconhecidas = 0, minChars = MIN_PADRAO, maxChars = MAX_PADRAO }) {
  const descartes = {
    vazio: 0, curto: 0, longo: 0, pii: 0, duplicado: 0,
    nao_representavel: 0, desconhecida: 0, nao_ponto_fixo: 0,
  };
  const aceitas = [];
  const porIntencao = {};
  const porFonte = {};
  const vistas = new Set();
  let desconhecidasMantidas = 0;

  for (const item of perguntas) {
    if (!item || typeof item.q !== 'string') { descartes.vazio++; continue; }
    const q = limparMultilinha(item.q).replace(/\s+/g, ' ').trim();
    if (!q) { descartes.vazio++; continue; }
    if (q.length < minChars) { descartes.curto++; continue; }
    if (q.length > maxChars) { descartes.longo++; continue; }
    if (redactPii(q) !== q || MARCAS_PII.some((m) => q.includes(m))) { descartes.pii++; continue; }

    const chave = chaveQ(q);
    if (vistas.has(chave)) { descartes.duplicado++; continue; }
    vistas.add(chave);

    const alvo = alvoDe(parse(q, gaz));
    if (!alvo) { descartes.nao_representavel++; continue; }

    if (alvo.intent === 'DESCONHECIDA') {
      if (desconhecidasMantidas >= manterDesconhecidas) { descartes.desconhecida++; continue; }
      desconhecidasMantidas++;
    }
    // Intenções sem entidade (CALENDARIO, LOCAL_VOTACAO, REGRAS_VOTO, RECOMENDACAO, AJUDA, SIMULADOR,
    // FONTES, SOBRE_DADOS) têm rótulo {"intent"} e SÃO exemplos válidos: quem garante o necessário é o
    // ponto fixo abaixo (PERFIL sem nome ou LISTAR sem entidade voltam como DESCONHECIDA e caem).

    if (!ehPontoFixo(q, alvo)) { descartes.nao_ponto_fixo++; continue; }

    porIntencao[alvo.intent] = (porIntencao[alvo.intent] ?? 0) + 1;
    const fonte = item.fonte ?? 'desconhecida';
    porFonte[fonte] = (porFonte[fonte] ?? 0) + 1;
    aceitas.push({
      q,
      alvo,
      intent: alvo.intent,
      ...(alvo.nome ? { nomeFonte: alvo.nome } : {}),
      ...(item.fonte ? { fonte: item.fonte } : {}),
      ...(item.licenca ? { licenca: item.licenca } : {}),
      ...(item.coletadoEm ? { coletadoEm: item.coletadoEm } : {}),
    });
  }

  return {
    aceitas,
    resumo: {
      lidas: perguntas.length,
      rotuladas: aceitas.length,
      por_intencao: Object.fromEntries(Object.entries(porIntencao).sort()),
      por_fonte: Object.fromEntries(Object.entries(porFonte).sort()),
      descartes,
    },
  };
}

export function escreverJsonl(caminho, itens) {
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, itens.map((i) => JSON.stringify(i)).join('\n') + (itens.length ? '\n' : ''), 'utf8');
}

async function main() {
  const argv = process.argv.slice(2);
  const entrada = opt(argv, 'in');
  if (!entrada) {
    console.error('uso: node backend/retrain/label_extra.mjs --in <perguntas.jsonl> --out <rotuladas.jsonl> [--data <pacote>] [--manter-desconhecidas N]');
    process.exit(2);
  }
  const caminhoIn = resolve(REPO, entrada);
  const caminhoOut = resolve(REPO, opt(argv, 'out', 'backend/retrain/extra/rotuladas.jsonl'));
  const dataDir = resolve(REPO, opt(argv, 'data', 'data/eleicoes2026'));
  const manterDesconhecidas = Number(opt(argv, 'manter-desconhecidas', '0'));

  const nomeArquivo = caminhoIn.split(/[\\/]/).pop();
  const fontePadrao = opt(argv, 'fonte', nomeArquivo);
  const licencaPadrao = opt(argv, 'licenca');
  const coletadoEmPadrao = opt(argv, 'coletado-em');
  const perguntas = lerEntradas(caminhoIn).map((p) => ({
    ...p,
    fonte: p.fonte ?? fontePadrao,
    ...(licencaPadrao && !p.licenca ? { licenca: licencaPadrao } : {}),
    ...(coletadoEmPadrao && !p.coletadoEm ? { coletadoEm: coletadoEmPadrao } : {}),
  }));
  const gaz = await carregarGazetteer(dataDir);
  const { aceitas, resumo } = rotular(perguntas, { gaz, manterDesconhecidas });
  escreverJsonl(caminhoOut, aceitas);
  console.log(JSON.stringify({ ...resumo, saida: caminhoOut }, null, 1));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
