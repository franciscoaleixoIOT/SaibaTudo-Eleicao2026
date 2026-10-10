// Pacote de dados da Química (docs/DATA_CONTRACT.md): carga sob demanda, verificação SHA-256 de cada arquivo e da assinatura ECDSA do
// manifesto, atualização com troca atômica. Fonte única: o próprio deploy (/quimica/data/). Funciona no navegador e no Node (fetchFn injetável).
import { criarContexto } from './calc/contexto.js';
import { chaveFormula } from './calc/formula.js';
import { normalizar } from './texto.js';
import { CHAVE_PUBLICA_B64, sha256Hex, subtleDisponivel, verificarManifesto } from './verify.js';

export const SCHEMA_SUPORTADO = 1;
export const CONCORRENCIA = 4;
export const BASE_DADOS = '/quimica/data/';

export class ErroDados extends Error {
  constructor(msg, arquivo = null) { super(msg); this.name = 'ErroDados'; this.arquivo = arquivo; }
}

const dec = new TextDecoder('utf-8');

/** `files` do contrato ({ caminho: {bytes, sha256} }) ou `arquivos` (lista de {path, bytes, sha256}) → lista uniforme. */
export function arquivosDoManifesto(m) {
  if (m?.files && !Array.isArray(m.files) && typeof m.files === 'object') {
    return Object.entries(m.files).map(([path, v]) => ({ path, bytes: v.bytes, sha256: v.sha256 }));
  }
  const lista = Array.isArray(m?.files) ? m.files : Array.isArray(m?.arquivos) ? m.arquivos : [];
  return lista.map((a) => ({ path: a.path, bytes: a.bytes, sha256: a.sha256 }));
}

export const versaoDoManifesto = (m) => String(m?.version ?? m?.dataVersion ?? '');

/** Valida estrutura básica e proteção contra caminhos maliciosos. Lança ErroDados. */
export function validarManifesto(m) {
  const exige = (c, msg) => { if (!c) throw new ErroDados(msg); };
  exige(m && typeof m === 'object', 'manifesto vazio');
  exige(Number.isInteger(m.schemaVersion) && m.schemaVersion <= SCHEMA_SUPORTADO, `schema não suportado: ${m.schemaVersion}`);
  exige(versaoDoManifesto(m).trim() !== '', 'version ausente');
  exige(typeof m.generatedAt === 'string' && m.generatedAt.trim() !== '', 'generatedAt ausente');
  const lista = arquivosDoManifesto(m);
  exige(lista.length > 0, 'manifesto sem arquivos');
  for (const a of lista) {
    const p = a.path ?? '';
    exige(typeof p === 'string' && p !== '' && !p.startsWith('/') && !p.includes('..') && !p.includes('\\') && !p.includes('?'), `caminho inválido: ${p}`);
    exige(typeof a.sha256 === 'string' && /^[0-9a-f]{64}$/.test(a.sha256), `sha256 inválido em ${p}`);
    exige(Number.isInteger(a.bytes) && a.bytes >= 0, `tamanho inválido em ${p}`);
  }
  exige(lista.some((a) => a.path === 'elementos.json'), 'elementos.json ausente');
}

export const pollIntervalMinutes = (m) => Math.min(Math.max(m?.cliente?.pollIntervalMinutes ?? 10080, 5), 7 * 24 * 60);
/** IA na nuvem (fase 5) ligada pelo pacote assinado? Ausente ou false = desligada. */
export const askLigado = (m) => m?.cliente?.ask?.enabled === true;

/**
 * Índice de compostos (compostos/index.json). Aceita:
 *  - o formato do pipeline: { porCid: { "2244": "lote-001" }, nomes: [[nome normalizado, cid], ...], lotes: [...] } — sem nomes de exibição:
 *    cada entrada traz só `cid`, `lote` e as chaves de busca (`chaves`, `chavesF`); o registro completo vem do lote, sob demanda;
 *  - { compostos: [ {cid, lote, nome, nomePopular, nomeIupac, sinonimos, formula, cas, massaMolar} ] } (ou a lista direta), com nomes de exibição;
 *  - o mapa direto { "2244": "lote-001" }, com `nomes` como mapa {nome: cid} ou lista de {nome, cid}.
 * @returns {{entradas: object[], porCid: Map<number, object>, temNomes: boolean}}
 */
export function normalizarIndice(raw) {
  const entradas = [];
  const porCid = new Map();
  const novo = (cid, lote) => ({
    cid, lote: lote == null ? null : String(lote).replace(/^compostos\//, '').replace(/\.json$/, ''),
    nome: null, nomePopular: null, nomeIupac: null, sinonimos: [], formula: null, cas: null, massaMolar: null, icscBuscaUrl: null, nomePtPendente: false,
    chaves: [], chavesF: []
  });
  const adicionar = (e) => {
    const cid = Number(e.cid);
    if (!Number.isInteger(cid) || cid <= 0) return null;
    let obj = porCid.get(cid);
    if (!obj) { obj = novo(cid, e.lote ?? e.arquivo ?? e.l); porCid.set(cid, obj); entradas.push(obj); } else if (obj.lote == null && (e.lote ?? e.arquivo ?? e.l) != null) obj.lote = novo(cid, e.lote ?? e.arquivo ?? e.l).lote;
    obj.nome = e.nome ?? e.n ?? obj.nome;
    obj.nomePopular = e.nomePopular ?? e.popular ?? obj.nomePopular;
    obj.nomeIupac = e.nomeIupac ?? e.iupac ?? obj.nomeIupac;
    if (Array.isArray(e.sinonimos)) obj.sinonimos = e.sinonimos;
    obj.formula = e.formula ?? e.f ?? obj.formula;
    obj.cas = e.cas ?? obj.cas;
    if (typeof e.massaMolar === 'number') obj.massaMolar = e.massaMolar;
    obj.icscBuscaUrl = e.icscBuscaUrl ?? obj.icscBuscaUrl;
    obj.nomePtPendente = e.nomePtPendente === true || obj.nomePtPendente;
    return obj;
  };
  const chave = (obj, nome) => {
    if (!obj || nome == null || nome === '') return;
    const k = normalizar(nome);
    if (k && !obj.chaves.includes(k)) obj.chaves.push(k);
    const f = String(nome).trim();
    if (f && !/\s/.test(f)) { const kf = chaveFormula(f); if (kf && !obj.chavesF.includes(kf)) obj.chavesF.push(kf); }
  };
  const lista = Array.isArray(raw) ? raw : Array.isArray(raw?.compostos) ? raw.compostos : Array.isArray(raw?.itens) ? raw.itens : null;
  if (lista) {
    for (const e of lista) if (e && typeof e === 'object') adicionar(e);
  } else if (raw && typeof raw === 'object') {
    const mapa = raw.porCid ?? raw.cid ?? raw.lotes ?? raw;
    if (mapa && typeof mapa === 'object' && !Array.isArray(mapa)) {
      for (const [k, v] of Object.entries(mapa)) {
        if (/^\d+$/.test(k) && (typeof v === 'string' || typeof v === 'number')) adicionar({ cid: k, lote: v });
      }
    }
    const nomes = raw.nomes ?? raw.busca ?? null;
    if (nomes && typeof nomes === 'object') {
      const pares = Array.isArray(nomes) ? nomes.map((x) => (Array.isArray(x) ? x : [x?.nome ?? x?.n, x?.cid])) : Object.entries(nomes);
      for (const [nome, cid] of pares) chave(porCid.get(Number(cid)), nome);
    }
  }
  return { entradas, porCid, temNomes: entradas.some((e) => e.nome != null) };
}

const rotuloOrigem = {
  verificada: 'site (assinatura digital verificada)',
  invalida: 'site (assinatura NÃO verificada)',
  indisponivel: 'site (verificação indisponível neste navegador)'
};

export class DataStore {
  /** @param {{baseUrl?: string, fetchFn?: typeof fetch, chavePublica?: string}} [o] */
  constructor({ baseUrl = BASE_DADOS, fetchFn = (...a) => globalThis.fetch(...a), chavePublica = CHAVE_PUBLICA_B64 } = {}) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    this.fetchFn = fetchFn;
    this.chavePublica = chavePublica;
    this.manifest = null;
    this.arquivos = new Map(); // path → {path, bytes, sha256}
    this.manifestBytes = null;
    this.assinatura = null;
    this.sig = { estado: 'indisponivel', detalhe: '' };
    this.origem = rotuloOrigem.indisponivel;
    this.elementos = [];
    this.porSimbolo = new Map();
    this.porZ = new Map();
    this.regras = null;
    this.constantes = null;
    this.fontes = null;
    this.indice = { entradas: [], porCid: new Map() };
    this.ctx = criarContexto({});
    this._cache = new Map(); // path → { sha, valor }
    this._emVoo = new Map(); // path → Promise
    this._compostos = new Map(); // cid → registro
    this.rev = 0;
    this.erros = [];
    this.ultimaVerificacao = 0;
    this.ultimaAtualizacao = null;
    this.ouvintes = new Set();
    this._fila = Promise.resolve();
  }

  on(fn) { this.ouvintes.add(fn); return () => this.ouvintes.delete(fn); }
  _emitir(evento) { for (const fn of this.ouvintes) { try { fn(evento, this); } catch { /* ouvinte não pode derrubar o pacote */ } } }
  _serial(fn) { const p = this._fila.then(fn, fn); this._fila = p.catch(() => {}); return p; }
  _erro(e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!this.erros.some((x) => x.mensagem === msg)) this.erros.push({ mensagem: msg, arquivo: e?.arquivo ?? null });
  }

  get versao() { return versaoDoManifesto(this.manifest); }
  arquivo(path) { return this.arquivos.get(path) ?? null; }
  caminhos(prefixo) { return [...this.arquivos.keys()].filter((p) => p.startsWith(prefixo)); }

  // -------------------------------------------------------------------------------------------- rede + verificação

  async _buscar(url, cache) {
    const r = await this.fetchFn(url, { cache, credentials: 'same-origin' });
    if (!r.ok) throw new ErroDados(`HTTP ${r.status} em ${url}`);
    return new Uint8Array(await r.arrayBuffer());
  }

  async _lerManifesto(cache) {
    const [bytes, sigBytes] = await Promise.all([this._buscar(this.baseUrl + 'manifest.json', cache), this._buscar(this.baseUrl + 'manifest.sig', cache)]);
    return { bytes, assinatura: dec.decode(sigBytes).trim() };
  }

  /** Baixa um arquivo do pacote e confere tamanho e sha256 contra o manifesto indicado. */
  async _baixarVerificado(path, arquivos = this.arquivos) {
    const rec = arquivos.get(path);
    if (!rec) throw new ErroDados(`arquivo fora do manifesto: ${path}`, path);
    const url = `${this.baseUrl}${path}?v=${rec.sha256.slice(0, 16)}`;
    const verificavel = subtleDisponivel();
    let ultimo = null;
    for (const cache of ['default', 'reload']) {
      const bytes = await this._buscar(url, cache);
      if (bytes.length !== rec.bytes) { ultimo = `tamanho divergente em ${path}`; continue; }
      if (verificavel && (await sha256Hex(bytes)) !== rec.sha256) { ultimo = `checksum divergente em ${path}`; continue; }
      return bytes;
    }
    throw new ErroDados(ultimo ?? `falha ao verificar ${path}`, path);
  }

  async _json(path, arquivos) { return JSON.parse(dec.decode(await this._baixarVerificado(path, arquivos))); }

  /** JSON de um arquivo do pacote (verificado, com cache por caminho+sha256). Lança ErroDados se não existir. */
  carregar(path) {
    const rec = this.arquivos.get(path);
    if (!rec) return Promise.reject(new ErroDados(`arquivo fora do manifesto: ${path}`, path));
    const c = this._cache.get(path);
    if (c && c.sha === rec.sha256) return Promise.resolve(c.valor);
    const chave = `${path}@${rec.sha256}`;
    if (!this._emVoo.has(chave)) {
      const p = this._json(path).then((valor) => {
        if (this.arquivos.get(path)?.sha256 === rec.sha256) this._cache.set(path, { sha: rec.sha256, valor });
        return valor;
      }).finally(() => this._emVoo.delete(chave));
      this._emVoo.set(chave, p);
    }
    return this._emVoo.get(chave);
  }

  async _carregarOpcional(path) {
    if (!this.arquivos.has(path)) return null;
    try { return await this.carregar(path); } catch (e) { this._erro(e); return null; }
  }

  // -------------------------------------------------------------------------------------------- inicialização

  /** Carrega o manifesto (verificando a assinatura) e os arquivos-base. Os lotes de compostos vêm sob demanda. */
  async iniciar() {
    let r = await this._lerManifesto('default');
    let ok = await verificarManifesto(r.bytes, r.assinatura, this.chavePublica);
    if (!ok) { // par obsoleto no cache? tenta a rede antes de sinalizar
      r = await this._lerManifesto('reload');
      ok = await verificarManifesto(r.bytes, r.assinatura, this.chavePublica);
    }
    const manifesto = JSON.parse(dec.decode(r.bytes));
    validarManifesto(manifesto);
    this.manifest = manifesto;
    this.arquivos = new Map(arquivosDoManifesto(manifesto).map((a) => [a.path, a]));
    this.manifestBytes = r.bytes;
    this.assinatura = r.assinatura;
    this.sig = ok ? { estado: 'verificada', detalhe: '' }
      : subtleDisponivel() ? { estado: 'invalida', detalhe: 'A assinatura do manifesto não confere; usando os arquivos do próprio site.' }
        : { estado: 'indisponivel', detalhe: 'O navegador não oferece WebCrypto neste contexto (use HTTPS).' };
    this.origem = rotuloOrigem[this.sig.estado];
    const [elementos, regras, constantes, fontes, indice, ghs] = await Promise.all([
      this.carregar('elementos.json'),
      this._carregarOpcional('regras.json'),
      this._carregarOpcional('constantes.json'),
      this._carregarOpcional('fontes.json'),
      this._carregarOpcional('compostos/index.json'),
      this._carregarOpcional('ghs_frases.json')
    ]);
    this._aplicar({ elementos, regras, constantes, fontes, indice, ghs });
    this.ultimaVerificacao = Date.now();
    this._emitir('manifesto');
    return this;
  }

  _aplicar({ elementos, regras, constantes, fontes, indice, ghs }) {
    this.elementos = (Array.isArray(elementos) ? elementos : elementos?.elementos ?? []).filter((e) => e && e.simbolo && Number.isInteger(e.z)).sort((a, b) => a.z - b.z);
    this.porSimbolo = new Map(this.elementos.map((e) => [e.simbolo, e]));
    this.porZ = new Map(this.elementos.map((e) => [e.z, e]));
    // frases H em português do pacote (ghs_frases.json, do Regulamento CLP) valem mais que as do aplicativo
    const frases = {};
    for (const [cod, t] of Object.entries(ghs?.todasAsFrases ?? {})) if (typeof t === 'string') frases[cod] = t;
    for (const [cod, v] of Object.entries(ghs?.frasesH ?? {})) { const t = typeof v === 'string' ? v : v?.texto; if (t) frases[cod] = t; }
    this.ghsFrases = ghs ?? null;
    this.fonteFrasesH = ghs?.fontes?.[0] ?? null;
    this.regras = regras || Object.keys(frases).length ? { ...(regras ?? {}), ...(Object.keys(frases).length ? { frasesH: frases } : {}) } : null;
    this.constantes = constantes ?? null;
    this.fontes = fontes ?? null;
    this.indice = normalizarIndice(indice ?? {});
    this.ctx = criarContexto({ elementos: this.elementos, constantes: this.constantes, regras: this.regras });
    this.rev++;
  }

  // -------------------------------------------------------------------------------------------- compostos e textos

  /** Registro completo do composto (carrega o lote correspondente). null se não existir. */
  async composto(cid) {
    cid = Number(cid);
    if (this._compostos.has(cid)) return this._compostos.get(cid);
    const e = this.indice.porCid.get(cid);
    if (!e?.lote) return null;
    const path = `compostos/${e.lote}.json`;
    if (!this.arquivos.has(path)) return null;
    const lote = await this.carregar(path);
    for (const c of Array.isArray(lote) ? lote : lote?.compostos ?? []) if (c && Number.isInteger(Number(c.cid))) this._compostos.set(Number(c.cid), c);
    return this._compostos.get(cid) ?? null;
  }

  /** Vários compostos (os lotes distintos são baixados uma vez cada). */
  async compostos(cids) {
    const out = [];
    for (const cid of cids) out.push(await this.composto(cid));
    return out.filter(Boolean);
  }

  /** CID do composto com este número CAS: o índice do pipeline não traz CAS, então percorre os lotes (um por vez, com cache) até achar. null se não houver. */
  async cidPorCas(cas) {
    const alvo = String(cas ?? '').trim();
    if (!/^\d{2,7}-\d{2}-\d$/.test(alvo)) return null;
    const doIndice = this.indice.entradas.find((e) => e.cas === alvo);
    if (doIndice) return doIndice.cid;
    const vistos = new Set();
    for (const e of this.indice.entradas) {
      if (!e.lote || vistos.has(e.lote)) continue;
      vistos.add(e.lote);
      try { await this.composto(e.cid); } catch { continue; }
      for (const c of this._compostos.values()) if (c.cas === alvo) return Number(c.cid);
    }
    return null;
  }

  /** Registros completos (com nomes e fórmula) das entradas do índice; só baixa os lotes que faltam. */
  async enriquecer(entradas) {
    return this.compostos(entradas.map((e) => e.cid));
  }

  /** Os primeiros compostos do pacote (do primeiro lote), em ordem alfabética: para a lista inicial da busca. */
  async compostosIniciais(n = 40) {
    const lotes = [...new Set(this.indice.entradas.map((e) => e.lote).filter(Boolean))].sort();
    if (!lotes.length) return [];
    const primeiro = this.indice.entradas.find((e) => e.lote === lotes[0]);
    await this.composto(primeiro.cid);
    return [...this._compostos.values()].filter((c) => this.indice.porCid.get(Number(c.cid))?.lote === lotes[0])
      .sort((a, b) => String(a.nome ?? '').localeCompare(String(b.nome ?? ''), 'pt-BR')).slice(0, n);
  }

  textosCaminhos() { return this.caminhos('textos/'); }

  /**
   * Trechos licenciados para o retrieval local de "O que é…?". Com `termos` (palavras da pergunta), carrega só os arquivos cujo NOME combina com algum
   * termo; sem combinação carrega todos (os de textos/chebi/ ficam de fora: a definição do ChEBI já vem no registro do composto). Falhas individuais são ignoradas.
   */
  async textos(termos = null) {
    const todos = this.textosCaminhos().filter((p) => !p.startsWith('textos/chebi/'));
    const nome = (p) => normalizar(p.replace(/^textos\/[^/]+\//, '').replace(/\.json$/, ''));
    const uteis = (termos ?? []).filter((x) => x.length >= 3);
    const candidatos = uteis.length ? todos.filter((p) => uteis.some((x) => nome(p).includes(x))) : [];
    const alvo = candidatos.length ? candidatos : todos;
    this._textosCache ??= new Map();
    const fila = alvo.filter((p) => !this._textosCache.has(p));
    const trabalhador = async () => {
      while (fila.length) {
        const p = fila.shift();
        try {
          const t = await this.carregar(p);
          this._textosCache.set(p, (Array.isArray(t) ? t : [t]).filter((x) => x && typeof x === 'object').map((x) => ({ ...x, _path: p })));
        } catch (e) { this._erro(e); this._textosCache.set(p, []); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, fila.length) }, trabalhador));
    return alvo.flatMap((p) => this._textosCache.get(p) ?? []);
  }

  // -------------------------------------------------------------------------------------------- atualização

  /**
   * Procura uma versão nova do pacote: verifica a assinatura, rejeita schema incompatível e pacote mais antigo (anti-rollback), baixa
   * SOMENTE arquivos já carregados cujo sha256 mudou e troca tudo de forma atômica. Qualquer falha mantém o pacote ativo.
   * @returns {Promise<{tipo: 'atual'|'atualizado'|'ignorado'|'rejeitado'|'falha', [k: string]: any}>}
   */
  verificarAtualizacao() {
    return this._serial(async () => {
      let res;
      try { res = await this._atualizar(); } catch (e) { res = { tipo: 'falha', motivo: e instanceof Error ? e.message : String(e) }; }
      this.ultimaVerificacao = Date.now();
      this.ultimaAtualizacao = { ...res, quando: this.ultimaVerificacao };
      this._emitir('verificacao');
      return res;
    });
  }

  async _atualizar() {
    if (!this.manifest) throw new ErroDados('dados não iniciados');
    if (!subtleDisponivel()) return { tipo: 'ignorado', motivo: 'verificação de assinatura indisponível (HTTPS necessário)' };
    const r = await this._lerManifesto('no-cache');
    if (!(await verificarManifesto(r.bytes, r.assinatura, this.chavePublica))) {
      return { tipo: 'rejeitado', motivo: 'assinatura do manifesto INVÁLIDA — atualização rejeitada' };
    }
    const novo = JSON.parse(dec.decode(r.bytes));
    validarManifesto(novo);
    if (String(novo.generatedAt) < String(this.manifest.generatedAt)) return { tipo: 'ignorado', motivo: 'pacote remoto é mais antigo que o ativo (anti-rollback)' };
    if (versaoDoManifesto(novo) === this.versao) return { tipo: 'atual' };
    const arquivosNovos = new Map(arquivosDoManifesto(novo).map((a) => [a.path, a]));
    const cacheNovo = new Map();
    let baixados = 0;
    let bytes = 0;
    for (const [path, c] of this._cache) {
      const rec = arquivosNovos.get(path);
      if (!rec) continue; // removido do pacote
      if (rec.sha256 === c.sha) { cacheNovo.set(path, c); continue; }
      const b = await this._baixarVerificado(path, arquivosNovos);
      baixados++; bytes += b.length;
      cacheNovo.set(path, { sha: rec.sha256, valor: JSON.parse(dec.decode(b)) });
    }
    // ---- troca atômica (síncrona): nada acima alterou o pacote ativo
    this.manifest = novo;
    this.arquivos = arquivosNovos;
    this.manifestBytes = r.bytes;
    this.assinatura = r.assinatura;
    this.sig = { estado: 'verificada', detalhe: '' };
    this.origem = 'atualização verificada (assinatura digital)';
    this._cache = cacheNovo;
    this._compostos = new Map();
    this._textosCache = null;
    this._aplicar({
      elementos: cacheNovo.get('elementos.json')?.valor, regras: cacheNovo.get('regras.json')?.valor, constantes: cacheNovo.get('constantes.json')?.valor,
      fontes: cacheNovo.get('fontes.json')?.valor, indice: cacheNovo.get('compostos/index.json')?.valor, ghs: cacheNovo.get('ghs_frases.json')?.valor
    });
    this.erros = [];
    this._emitir('atualizado');
    return { tipo: 'atualizado', version: versaoDoManifesto(novo), arquivosBaixados: baixados, bytesBaixados: bytes };
  }
}
