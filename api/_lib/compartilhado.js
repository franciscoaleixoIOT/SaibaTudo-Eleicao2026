// Limites COMPARTILHADOS entre instâncias serverless (Upstash Redis via REST), OPCIONAIS.
//
// Os limitadores de ratelimit.js vivem na memória de cada instância da Vercel: uma instância fria zera os contadores e N
// instâncias somam N vezes o limite. Esta camada acrescenta contadores globais por IP, por instalação e por dia, SEM trocar a
// camada local (que continua sendo a primeira barreira, barata e sem rede).
//
// Liga sozinha quando existem as variáveis (nomes do Upstash ou da integração "Vercel KV"):
//   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN   |   KV_REST_API_URL + KV_REST_API_TOKEN
// Sem elas, tudo aqui é no-op e o comportamento é exatamente o de antes.
//
// FALHA ABERTO: se o Redis estiver fora do ar ou lento (>1,5 s), a requisição segue e só vale a camada local. Uma dependência
// auxiliar nunca pode derrubar o serviço. Os contadores são de JANELA FIXA (chave por balde de tempo), o que dispensa TTL perfeito:
// um EXPIRE que falhe nunca deixa uma chave presa para sempre.
//
// Privacidade: as chaves levam o IP e o `iid` em texto no Redis do projeto, com expiração igual à janela (no máximo 1 dia).
// Eles nunca saem daí (nem para o Modal nem para o GitHub), como a camada local. Ver docs/PRIVACIDADE.md §8 (retenção).

import { diaBrasilia } from './ratelimit.js';

const TIMEOUT_MS = 1500;

export function lerConfigCompartilhado(env = process.env) {
  const url = (env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || '').trim().replace(/\/+$/, '');
  const token = (env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || '').trim();
  let ok = false;
  try {
    ok = new URL(url).protocol === 'https:' && token !== '';
  } catch {
    ok = false;
  }
  return { ativo: ok, url: ok ? url : '', token: ok ? token : '' };
}

/**
 * @param {{ env?: () => object, fetchFn?: typeof fetch, now?: () => number, log?: (o:object)=>void }} deps
 */
export function createSharedLimiter({ env = () => process.env, fetchFn = (...a) => globalThis.fetch(...a), now = () => Date.now(), log = () => {} } = {}) {
  /** Executa comandos Redis em um pipeline. Devolve a lista de resultados, ou null (inativo, indisponível ou com erro). */
  async function executar(comandos) {
    const cfg = lerConfigCompartilhado(env());
    if (!cfg.ativo) return null;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const r = await fetchFn(`${cfg.url}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(comandos),
        signal: ctl.signal,
      });
      if (!r.ok) return null;
      const corpo = await r.json();
      if (!Array.isArray(corpo) || corpo.some((x) => x?.error)) return null;
      return corpo.map((x) => x?.result);
    } catch {
      log({ evt: 'shared', err: 'unavailable' });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** INCR + EXPIRE. Devolve o novo valor do contador, ou null (indisponível: falha aberto). */
  async function incrementar(chave, ttlSeg) {
    const r = await executar([['INCR', chave], ['EXPIRE', chave, String(ttlSeg)]]);
    return r && Number.isInteger(r[0]) ? r[0] : null;
  }

  return {
    ativo: () => lerConfigCompartilhado(env()).ativo,

    /** Pipeline de comandos Redis arbitrários (usado pela captura de melhoria). null = indisponível. */
    executar,

    /**
     * Conta uma requisição na janela fixa de `janelaSeg` segundos para `chave`.
     * @returns {Promise<{allowed:boolean, retryAfterMs:number, shared:boolean}>}
     */
    async hit(chave, janelaSeg, limite) {
      const t = now();
      const balde = Math.floor(t / (janelaSeg * 1000));
      const n = await incrementar(`st:${chave}:${balde}`, janelaSeg + 5);
      if (n === null) return { allowed: true, retryAfterMs: 0, shared: false };
      if (n <= limite) return { allowed: true, retryAfterMs: 0, shared: true };
      const fimDoBalde = (balde + 1) * janelaSeg * 1000;
      return { allowed: false, retryAfterMs: Math.max(1000, fimDoBalde - t), shared: true };
    },

    /** Consome 1 unidade do orçamento diário GLOBAL (dia de Brasília) de `nome`. true = pode gastar; falha aberto. */
    async consumirDia(nome, limite) {
      const n = await incrementar(`st:orcamento:${nome}:${diaBrasilia(now())}`, 2 * 24 * 3600);
      return n === null ? true : n <= limite;
    },
  };
}

/**
 * Orçamento que combina o contador local (sincrônico) com o compartilhado (assíncrono). `consume` agora devolve Promise<boolean>;
 * quem chamava `budget.consume(limite)` passa a usar `await`. A camada local vem primeiro (barata e sem rede).
 */
export function orcamentoComCompartilhado(local, compartilhado, nome) {
  return {
    async consume(limite) {
      if (!local.consume(limite)) return false;
      return compartilhado.consumirDia(nome, limite);
    },
    remaining: (limite) => local.remaining(limite),
    used: () => local.used(),
    reset: () => local.reset(),
  };
}
