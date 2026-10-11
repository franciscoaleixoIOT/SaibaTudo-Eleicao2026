// Cache LRU com TTL, em memória (por instância). Só guarda a interpretação NORMALIZADA
// (intenção/entidades) — nunca o texto da pergunta: a chave é um texto normalizado (minúsculas,
// sem acentos, espaços colapsados) e fica apenas na memória da instância, com TTL de 1 h.

/** Chave de cache: minúsculas, sem acentos, só letras/dígitos separados por 1 espaço. */
export function normalizeQuestion(q) {
  return String(q)
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function createCache({ maxEntries = 500, ttlMs = 60 * 60 * 1000, now = Date.now } = {}) {
  /** @type {Map<string, {valor:any, expira:number}>} (ordem de inserção = ordem de uso, do mais antigo ao mais recente) */
  const store = new Map();

  return {
    get(chave) {
      const e = store.get(chave);
      if (!e) return undefined;
      if (e.expira <= now()) {
        store.delete(chave);
        return undefined;
      }
      // LRU: reinsere como o mais recente
      store.delete(chave);
      store.set(chave, e);
      return e.valor;
    },
    set(chave, valor, ttl = ttlMs) {
      if (store.has(chave)) store.delete(chave);
      store.set(chave, { valor, expira: now() + ttl });
      while (store.size > maxEntries) {
        const maisAntigo = store.keys().next().value;
        store.delete(maisAntigo);
      }
    },
    delete: (chave) => store.delete(chave),
    clear: () => store.clear(),
    size: () => store.size,
  };
}
