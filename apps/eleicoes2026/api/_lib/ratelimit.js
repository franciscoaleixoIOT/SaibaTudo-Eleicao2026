// Limitadores EM MEMÓRIA (por instância da função serverless).
//
// ATENÇÃO: cada instância da Vercel tem sua própria memória e instâncias frias zeram os contadores.
// Estes limites são a 1ª camada (barata, sem estado externo). A barreira REAL de custo é:
//   1) a regra única do Vercel Firewall (rate limit por IP, disponível no plano Hobby);
//   2) `max_containers` + spend limit/workspace budget no Modal.
// Ver docs/BACKEND.md ("Custos e limites").

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Janela deslizante (log de timestamps) por chave.
 * Uso: `check(chave, limite)` consulta sem consumir; `record(chave)` consome.
 * O limite é passado a cada chamada para que a configuração (variáveis de ambiente) seja lida em tempo de requisição.
 */
export function createSlidingWindow({ windowMs, maxKeys = 5000, now = Date.now } = {}) {
  if (!(windowMs > 0)) throw new Error('windowMs inválido');
  /** @type {Map<string, number[]>} */
  const store = new Map();

  function podar(chave, t) {
    const arr = store.get(chave);
    if (!arr) return null;
    const corte = t - windowMs;
    let i = 0;
    while (i < arr.length && arr[i] <= corte) i++;
    if (i > 0) arr.splice(0, i);
    if (arr.length === 0) {
      store.delete(chave);
      return null;
    }
    return arr;
  }

  function limpar(t) {
    if (store.size <= maxKeys) return;
    for (const k of [...store.keys()]) podar(k, t);
    if (store.size > maxKeys) {
      // Ainda cheio: descarta as chaves mais antigas (ordem de inserção) até 90% da capacidade.
      const alvo = Math.floor(maxKeys * 0.9);
      for (const k of store.keys()) {
        if (store.size <= alvo) break;
        store.delete(k);
      }
    }
  }

  return {
    check(chave, limite) {
      const t = now();
      const arr = podar(chave, t);
      const usados = arr ? arr.length : 0;
      if (usados < limite) return { allowed: true, remaining: limite - usados, retryAfterMs: 0 };
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(1, arr[0] + windowMs - t) };
    },
    record(chave) {
      const t = now();
      let arr = podar(chave, t);
      if (!arr) {
        limpar(t);
        arr = [];
        store.set(chave, arr);
      }
      arr.push(t);
    },
    size: () => store.size,
    clear: () => store.clear(),
  };
}

/** Dia local de Brasília (UTC-3, sem horário de verão desde 2019) no formato AAAA-MM-DD. */
export function diaBrasilia(t) {
  return new Date(t - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Orçamento diário GLOBAL de chamadas ao Modal (por instância; ver aviso acima).
 * `consume(limite)` devolve false quando o orçamento do dia acabou (limite 0 = sempre esgotado).
 */
export function createDailyBudget({ now = Date.now } = {}) {
  let dia = diaBrasilia(now());
  let usados = 0;

  function rolar() {
    const hoje = diaBrasilia(now());
    if (hoje !== dia) {
      dia = hoje;
      usados = 0;
    }
  }

  return {
    consume(limite) {
      rolar();
      if (usados >= limite) return false;
      usados += 1;
      return true;
    },
    remaining(limite) {
      rolar();
      return Math.max(0, limite - usados);
    },
    used() {
      rolar();
      return usados;
    },
    reset() {
      usados = 0;
      dia = diaBrasilia(now());
    },
  };
}

export const JANELAS = Object.freeze({ MINUTO: 60 * 1000, HORA: 60 * 60 * 1000, DIA: DIA_MS });
