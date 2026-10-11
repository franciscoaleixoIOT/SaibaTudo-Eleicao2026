// Apuração ao vivo: consulta DIRETA ao JSON público do TSE (resultados.tse.jus.br). Porte de TseApuracaoClient.kt.
// Respeita os limites publicados pelo TSE: cache ≈ 60 s, requisição condicional (If-None-Match), espaçamento mínimo de
// 500 ms entre chamadas e cache negativo de 5 min para erros (muitos 404 podem bloquear o IP). Os números são repassados
// exatamente como publicados.

export const TTL_MS = 60_000;
export const TTL_NEGATIVO_MS = 300_000;
export const MIN_INTERVALO_MS = 500;

const str = (o, k) => {
  const v = o?.[k];
  return v != null && typeof v !== 'object' ? String(v) : null;
};

/** Interpreta o JSON de apuração do TSE; null se não for um JSON de apuração válido. */
export function parseApuracao(json, cargo, uf, turno) {
  let raiz;
  try { raiz = typeof json === 'string' ? JSON.parse(json) : json; } catch { return null; }
  const carg = Array.isArray(raiz?.carg) ? raiz.carg[0] : null;
  if (!carg || typeof carg !== 'object') return null;
  const linhas = [];
  for (const agr of Array.isArray(carg.agr) ? carg.agr : []) {
    for (const par of Array.isArray(agr?.par) ? agr.par : []) {
      const partido = str(par, 'sg') ?? '';
      for (const o of Array.isArray(par?.cand) ? par.cand : []) {
        const votos = Number.parseInt(str(o, 'vap') ?? '', 10);
        const pct = str(o, 'pvap');
        // Situação publicada pelo TSE ("Eleito", "2º turno", "Não eleito"…). ATENÇÃO: o TSE envia "e":"s" também para quem PASSA ao
        // 2º turno; ler só o "e" fazia o app dizer que os dois classificados foram "eleitos". A situação é que decide.
        const situacao = str(o, 'st');
        const segundoTurno = situacao != null && /\bturno\b/i.test(situacao);
        linhas.push({
          sqCandidato: str(o, 'sqcand'),
          numero: str(o, 'n') ?? '',
          nome: str(o, 'nmu') ?? str(o, 'nm') ?? '',
          partido,
          votos: Number.isNaN(votos) ? 0 : votos,
          percentual: pct != null && pct.trim() !== '' ? pct : null,
          situacao,
          segundoTurno,
          eleito: str(o, 'e') === 's' && !segundoTurno
        });
      }
    }
  }
  return {
    cargo, uf, turno,
    geradoEm: `${str(raiz, 'dg') ?? ''} ${str(raiz, 'hg') ?? ''}`.trim(),
    secoesTotalizadasPct: str(raiz?.s, 'pst'),
    totalizacaoFinal: str(raiz, 'tf') === 's',
    linhas
  };
}

/** URL oficial do JSON de apuração (códigos vêm de regras.resultadosTse). null se cargo/config desconhecidos. */
export function urlApuracao(cfg, cargo, uf, turno) {
  if (!cfg?.base || !cfg.cargos?.[cargo]) return null;
  const federal = cargo === 'PRESIDENTE';
  const cd = federal ? (turno === 1 ? cfg.federal?.turno1 : cfg.federal?.turno2) : (turno === 1 ? cfg.estadual?.turno1 : cfg.estadual?.turno2);
  if (!cd) return null;
  const u = uf.toLowerCase();
  return `${cfg.base}/${cd}/dados/${u}/${u}-c${String(cfg.cargos[cargo]).padStart(4, '0')}-e${String(cd).padStart(6, '0')}-u.json`;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export class ApuracaoClient {
  /**
   * @param {() => object|null} config regras.resultadosTse (base, federal, estadual, cargos)
   * @param {{fetchFn?: typeof fetch, agora?: () => number, esperar?: (ms:number)=>Promise<void>}} [opcoes]
   */
  constructor(config, { fetchFn = (...a) => globalThis.fetch(...a), agora = () => Date.now(), esperar = dormir } = {}) {
    this.config = config;
    this.fetchFn = fetchFn;
    this.agora = agora;
    this.esperar = esperar;
    this.cache = new Map();
    this.ultimaRequisicao = 0;
    this.fila = Promise.resolve();
    /** Se o servidor/CORS recusar o cabeçalho condicional (preflight), usamos a revalidação nativa do navegador. */
    this.semCabecalhoCondicional = false;
    this.requisicoes = 0;
  }

  /** Serializa as chamadas (um mutex simples) para respeitar o espaçamento mínimo. */
  obter(cargo, uf, turno) {
    const p = this.fila.then(() => this._obter(cargo, uf, turno));
    this.fila = p.catch(() => {});
    return p;
  }

  async _obter(cargo, uf, turno) {
    const url = urlApuracao(this.config(), cargo, uf, turno);
    if (!url) return null;
    const atual = this.cache.get(url);
    const t0 = this.agora();
    const ttl = atual && atual.corpoOk === false ? TTL_NEGATIVO_MS : TTL_MS;
    if (atual && t0 - atual.quando < ttl) return atual.valor;
    const espera = MIN_INTERVALO_MS - (t0 - this.ultimaRequisicao);
    if (espera > 0) await this.esperar(espera);
    this.ultimaRequisicao = this.agora();

    const tentar = async (usarCabecalho) => {
      this.requisicoes++;
      const init = { method: 'GET', credentials: 'omit', cache: usarCabecalho ? 'default' : 'no-cache' };
      if (usarCabecalho && atual?.etag) init.headers = { 'If-None-Match': atual.etag };
      return this.fetchFn(url, init);
    };
    try {
      let r;
      try {
        r = await tentar(!this.semCabecalhoCondicional);
      } catch (e) {
        // Falha de rede/CORS (p.ex. preflight recusado pelo cabeçalho condicional): tenta uma vez sem o cabeçalho.
        if (this.semCabecalhoCondicional || !atual?.etag) throw e;
        this.semCabecalhoCondicional = true;
        this.ultimaRequisicao = this.agora();
        r = await tentar(false);
      }
      if (r.status === 304 && atual) {
        this.cache.set(url, { ...atual, quando: this.agora() });
        return atual.valor;
      }
      if (r.ok) {
        const corpo = await r.text();
        const ap = parseApuracao(corpo, cargo, uf, turno);
        this.cache.set(url, { quando: this.agora(), etag: r.headers?.get?.('ETag') ?? null, valor: ap, corpoOk: ap != null });
        return ap;
      }
      this.cache.set(url, { quando: this.agora(), etag: null, valor: null, corpoOk: false });
      return null;
    } catch {
      this.cache.set(url, { quando: this.agora(), etag: null, valor: atual?.valor ?? null, corpoOk: false });
      return atual?.valor ?? null;
    }
  }
}
