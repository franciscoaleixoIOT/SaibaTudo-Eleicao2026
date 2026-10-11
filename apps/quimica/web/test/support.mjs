// Apoio aos testes. Por padrão os testes usam o pacote de FIXTURE (web/test/fixtures/data-quimica, 13 elementos e 12 compostos, assinado),
// que não depende do pacote real. Se existir um pacote real válido em data/quimica, alguns testes também o usam (variável DADOS_REAIS);
// DATA_DIR força outra pasta no lugar da fixture.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataStore } from '../src/quimica/js/data.js';

const aqui = dirname(fileURLToPath(import.meta.url));
export const RAIZ = resolve(aqui, '../..');
export const FIXTURE = resolve(aqui, 'fixtures/data-quimica');
export const DADOS = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : FIXTURE;
export const DADOS_REAIS = existsSync(resolve(RAIZ, 'data/quimica/manifest.json')) && existsSync(resolve(RAIZ, 'data/quimica/manifest.sig')) ? resolve(RAIZ, 'data/quimica') : null;
export const BASE = 'http://teste.local/quimica/data/';

export const lerJson = (p, dir = DADOS) => JSON.parse(readFileSync(resolve(dir, p), 'utf8'));

/** fetch que serve os arquivos do pacote em disco (ignora a query ?v=). `contador` recebe os caminhos pedidos. */
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

const caches = new Map();
/** DataStore iniciado (um por pasta, compartilhado entre os testes do mesmo arquivo). */
export function loja(dir = DADOS) {
  if (!caches.has(dir)) {
    caches.set(dir, (async () => {
      const store = new DataStore({ baseUrl: BASE, fetchFn: fetchDeDisco(dir) });
      await store.iniciar();
      return store;
    })());
  }
  return caches.get(dir);
}

/** Loja nova (sem cache), para testes que mexem no estado. */
export async function lojaNova(dir = DADOS, fetchFn = fetchDeDisco(dir)) {
  const store = new DataStore({ baseUrl: BASE, fetchFn });
  await store.iniciar();
  return store;
}

export async function ctx(dir = DADOS) { return (await loja(dir)).ctx; }

