#!/usr/bin/env node
// Coleta as perguntas que os usuários, COM CONSENTIMENTO, enviaram por POST /api/melhoria (guardadas no Redis em st:sinais:<dia>,
// um hash texto -> quantas vezes) e as grava em backend/retrain/review/sinais.jsonl para a fila de revisão (fila.mjs).
//
// O arquivo de saída contém texto de usuários: fica em backend/retrain/review/ (git-ignorado) e NUNCA deve ser versionado.
// Só o que uma pessoa revisar e marcar como publicável entra em arquivos do repositório (revisar.mjs / promover.mjs).
//
// Exige --confirmar-politica: a política de privacidade precisa JÁ descrever esta finalidade (docs/PRIVACIDADE_melhoria_RASCUNHO.md).
//
// Uso:
//   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... \
//   node backend/retrain/colher_sinais.mjs --confirmar-politica [--out backend/retrain/review/sinais.jsonl] [--apagar]
//   --apagar remove do Redis os dias coletados (minimização: depois de coletar, não precisa ficar lá até os 90 dias).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO, opt } from './label_extra.mjs';

const PREFIXO = 'st:sinais:';

/** Executa um comando no Upstash REST (POST com o comando como array). Levanta erro se o serviço responder erro. */
async function cmd(cfg, comando, fetchFn) {
  const r = await fetchFn(cfg.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(comando),
  });
  if (!r.ok) throw new Error(`Redis HTTP ${r.status}`);
  const corpo = await r.json();
  if (corpo.error) throw new Error(`Redis: ${corpo.error}`);
  return corpo.result;
}

/** Lista as chaves st:sinais:* (SCAN com cursor) e devolve ordenadas por dia. */
export async function listarDias(cfg, fetchFn = fetch) {
  const chaves = new Set();
  let cursor = '0';
  do {
    const [prox, achadas] = await cmd(cfg, ['SCAN', cursor, 'MATCH', `${PREFIXO}*`, 'COUNT', '200'], fetchFn);
    for (const c of achadas) chaves.add(c);
    cursor = String(prox);
  } while (cursor !== '0');
  return [...chaves].sort();
}

/** Lê os sinais de um dia: HGETALL devolve [campo, valor, campo, valor...]. */
export async function lerDia(cfg, chave, fetchFn = fetch) {
  const dia = chave.slice(PREFIXO.length);
  const plano = await cmd(cfg, ['HGETALL', chave], fetchFn);
  const itens = [];
  for (let i = 0; i + 1 < plano.length; i += 2) {
    const n = Number.parseInt(plano[i + 1], 10);
    itens.push({ q: plano[i], n: Number.isInteger(n) && n > 0 ? n : 1, dia, fonte: 'melhoria-app' });
  }
  return itens;
}

/** Junta os dias, somando a frequência de textos iguais (sem diferenciar maiúsculas, para a fila). */
export function consolidar(listasPorDia) {
  const mapa = new Map();
  for (const itens of listasPorDia) {
    for (const it of itens) {
      const chave = it.q.trim().toLowerCase();
      const atual = mapa.get(chave);
      if (atual) atual.n += it.n;
      else mapa.set(chave, { q: it.q.trim(), n: it.n, fonte: it.fonte });
    }
  }
  return [...mapa.values()].sort((a, b) => b.n - a.n || a.q.localeCompare(b.q, 'pt-BR'));
}

export async function colher(cfg, { fetchFn = fetch, apagar = false } = {}) {
  const dias = await listarDias(cfg, fetchFn);
  const porDia = [];
  for (const d of dias) porDia.push(await lerDia(cfg, d, fetchFn));
  if (apagar && dias.length) await cmd(cfg, ['DEL', ...dias], fetchFn);
  return { dias, itens: consolidar(porDia) };
}

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.includes('--confirmar-politica')) {
    console.error('Recusado: a política de privacidade precisa descrever esta finalidade ("melhorar o app com as perguntas que ele não entendeu") ANTES de coletar.');
    console.error('Confirme com --confirmar-politica depois de atualizar docs/PRIVACIDADE.md e a página web (rascunho em docs/PRIVACIDADE_melhoria_RASCUNHO.md).');
    process.exit(2);
  }
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? '').replace(/\/+$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? '';
  if (!url || !token) {
    console.error('Defina UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN (os mesmos da Vercel).');
    process.exit(2);
  }
  const saida = resolve(REPO, opt(argv, 'out', 'backend/retrain/review/sinais.jsonl'));
  const { dias, itens } = await colher({ url, token }, { apagar: argv.includes('--apagar') });
  mkdirSync(dirname(saida), { recursive: true });
  writeFileSync(saida, itens.map((i) => JSON.stringify(i)).join('\n') + (itens.length ? '\n' : ''), 'utf8');
  console.log(JSON.stringify({ dias: dias.length, perguntas: itens.length, apagadoDoRedis: argv.includes('--apagar'), saida }, null, 1));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
