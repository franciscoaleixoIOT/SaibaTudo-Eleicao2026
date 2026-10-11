// Apoio aos testes: carrega os dados REAIS do pacote oficial (data/eleicoes2026) — nada fictício.
// (Os testes de atualização usam um pacote sintético assinado com chave de teste, só em memória.)
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataStore } from '../src/eleicoes2026/js/data.js';
import { Engine } from '../src/eleicoes2026/js/engine.js';
import { Gazetteer } from '../src/eleicoes2026/js/gazetteer.js';

const aqui = dirname(fileURLToPath(import.meta.url));
export const RAIZ = resolve(aqui, '../..');
export const DADOS = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : resolve(RAIZ, 'data/eleicoes2026');
export const BASE = 'http://teste.local/data/eleicoes2026/';

export const lerJson = (p) => JSON.parse(readFileSync(resolve(DADOS, p), 'utf8'));

/** fetch que serve os arquivos do pacote em disco (ignora a query ?v=). */
export function fetchDeDisco(dir = DADOS, base = BASE, contador = null) {
  return async (url) => {
    const u = String(url).split('?')[0];
    if (!u.startsWith(base)) return new Response('fora do pacote', { status: 404 });
    const arq = resolve(dir, u.slice(base.length));
    contador?.push(u.slice(base.length));
    if (!existsSync(arq)) return new Response('não encontrado', { status: 404 });
    return new Response(readFileSync(arq), { status: 200 });
  };
}

let cache = null;
/** Pacote completo (todas as UFs) carregado uma única vez e compartilhado entre os testes. */
export async function pacoteCompleto() {
  if (!cache) {
    cache = (async () => {
      const store = new DataStore({ baseUrl: BASE, fetchFn: fetchDeDisco() });
      await store.iniciar();
      await store.ensureTodas();
      const gaz = new Gazetteer(store.candidatos, store.partidosConhecidos());
      return { store, gaz, dados: store.snapshot() };
    })();
  }
  return cache;
}

export async function motor({ hoje = '2026-10-01', ufPadrao = null, apuracao = null, nuvem = null } = {}) {
  const { store } = await pacoteCompleto();
  return new Engine({ store, hoje: () => hoje, ufPadrao: () => ufPadrao, apuracao, nuvem });
}
