// Pacote de dados oficiais (docs/DATA_CONTRACT.md): carga sob demanda por UF, verificação SHA-256 e assinatura ECDSA
// do manifesto, atualização com troca atômica. Equivalente a DataUpdater/BundleLoader/ElectionDataStore do Android.
// Fonte única: o próprio deploy (mesma origem). Funciona no navegador e no Node (fetchFn injetável).
import { mapCandidate, mapResultados } from './model.js';
import { CHAVE_PUBLICA_B64, sha256Hex, subtleDisponivel, verificarManifesto } from './verify.js';

export const SCHEMA_SUPORTADO = 1;
export const CONCORRENCIA = 4;

export class ErroDados extends Error {
  constructor(msg, arquivo = null) { super(msg); this.name = 'ErroDados'; this.arquivo = arquivo; }
}

const dec = new TextDecoder('utf-8');

/** Valida estrutura básica e proteção contra caminhos maliciosos. Lança ErroDados. */
export function validarManifesto(m) {
  const exige = (c, msg) => { if (!c) throw new ErroDados(msg); };
  exige(m && typeof m === 'object', 'manifesto vazio');
  exige(Number.isInteger(m.schemaVersion) && m.schemaVersion <= SCHEMA_SUPORTADO, `schema não suportado: ${m.schemaVersion}`);
  exige(typeof m.dataVersion === 'string' && m.dataVersion.trim() !== '', 'dataVersion ausente');
  exige(typeof m.generatedAt === 'string' && m.generatedAt.trim() !== '', 'generatedAt ausente');
  const lista = Array.isArray(m.arquivos) ? m.arquivos : [];
  exige(lista.length > 0, 'manifesto sem arquivos');
  for (const a of lista) {
    const p = a?.path ?? '';
    exige(typeof p === 'string' && p !== '' && !p.startsWith('/') && !p.includes('..') && !p.includes('\\'), `caminho inválido: ${p}`);
    exige(typeof a.sha256 === 'string' && a.sha256.length === 64, `sha256 inválido em ${p}`);
    exige(Number.isInteger(a.bytes) && a.bytes >= 0, `tamanho inválido em ${p}`);
  }
  exige(lista.some((a) => a.path === 'regras.json'), 'regras.json ausente');
  exige(lista.some((a) => a.path.startsWith('candidatos/')), 'candidatos ausentes');
}

/** Intervalo de verificação em minutos (mínimo 5; padrão 360). */
export const pollIntervalMinutes = (m) => Math.min(Math.max(m?.cliente?.pollIntervalMinutes ?? 360, 5), 24 * 60);

const rotuloOrigem = { verificada: 'site (assinatura digital verificada)', invalida: 'site (assinatura NÃO verificada)', indisponivel: 'site (verificação indisponível neste navegador)' };

export class DataStore {
  /**
   * @param {{baseUrl?: string, fetchFn?: typeof fetch, chavePublica?: string}} [o]
   */
  constructor({ baseUrl = '/data/eleicoes2026/', fetchFn = (...a) => globalThis.fetch(...a), chavePublica = CHAVE_PUBLICA_B64 } = {}) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    this.fetchFn = fetchFn;
    this.chavePublica = chavePublica;
    this.manifest = null;
    this.manifestBytes = null;
    this.assinatura = null;
    /** estado da verificação: 'verificada' | 'invalida' | 'indisponivel' */
    this.sig = { estado: 'indisponivel', detalhe: '' };
    this.regras = null;
    this.fontes = null;
    this.pesquisas = null;
    this.shards = new Map();      // uf -> { sha, lista }
    this.resultadosShards = new Map(); // uf -> { sha, mapa }
    this.candidatos = [];
    this.porId = new Map();
    this.rev = 0;
    /** muda somente quando a lista de candidaturas muda (invalida o Gazetteer) */
    this.revCand = 0;
    this.erros = [];
    this.origem = rotuloOrigem.indisponivel;
    this.ultimaVerificacao = 0;
    this.ultimaAtualizacao = null; // { tipo, ... }
    this.ouvintes = new Set();
    this._fila = Promise.resolve();
    this._emVoo = new Map();
  }

  on(fn) { this.ouvintes.add(fn); return () => this.ouvintes.delete(fn); }
  _emitir(evento) { for (const fn of this.ouvintes) { try { fn(evento, this); } catch { /* ouvinte não pode derrubar o pacote */ } } }
  _serial(fn) { const p = this._fila.then(fn, fn); this._fila = p.catch(() => {}); return p; }

  get ufsCarregadas() { return [...this.shards.keys()]; }
  get todasCarregadas() { return this.manifest ? this._ufsDoManifesto().every((u) => this.shards.has(u)) : false; }

  /** Instantâneo imutável para o AnswerBuilder (os arrays são substituídos, nunca alterados, a cada mudança). */
  snapshot() {
    return {
      manifest: this.manifest, origem: this.origem, candidatos: this.candidatos, porId: this.porId,
      pesquisas: this.pesquisas, regras: this.regras, fontes: this.fontes, resultadosTse: this.regras?.resultadosTse ?? null
    };
  }

  /** Siglas de partido conhecidas antes de carregar as UFs (regras.estatisticas.porPartido). */
  partidosConhecidos() { return Object.keys(this.regras?.estatisticas?.porPartido ?? {}); }

  arquivo(path) { return this.manifest?.arquivos?.find((a) => a.path === path) ?? null; }
  _ufsDoManifesto() {
    return (this.manifest?.arquivos ?? []).map((a) => /^candidatos\/([A-Z]{2})\.json$/.exec(a.path)?.[1]).filter(Boolean);
  }
  fotoUrl(c) { return c.foto ? this.baseUrl + c.foto : null; }

  // -------------------------------------------------------------------------------------------- rede + verificação

  async _buscar(url, cache) {
    const r = await this.fetchFn(url, { cache, credentials: 'same-origin' });
    if (!r.ok) throw new ErroDados(`HTTP ${r.status} em ${url}`);
    return new Uint8Array(await r.arrayBuffer());
  }

  /** Baixa o par manifest.json + manifest.sig. */
  async _lerManifesto(cache) {
    const [bytes, sigBytes] = await Promise.all([
      this._buscar(this.baseUrl + 'manifest.json', cache),
      this._buscar(this.baseUrl + 'manifest.sig', cache)
    ]);
    return { bytes, assinatura: dec.decode(sigBytes).trim() };
  }

  /** Baixa um arquivo do pacote e confere tamanho e sha256 contra o manifesto indicado. */
  async _baixarVerificado(path, manifesto = this.manifest) {
    const rec = manifesto.arquivos.find((a) => a.path === path);
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

  async _json(path, manifesto) { return JSON.parse(dec.decode(await this._baixarVerificado(path, manifesto))); }

  // -------------------------------------------------------------------------------------------- inicialização

  /**
   * Carrega o manifesto (verificando a assinatura), regras e fontes. Não carrega candidatos: use ensureUfs().
   * Se a assinatura não puder ser verificada, os dados do deploy continuam em uso e o fato é sinalizado em this.sig.
   */
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
    this.manifestBytes = r.bytes;
    this.assinatura = r.assinatura;
    this.sig = ok ? { estado: 'verificada', detalhe: '' }
      : subtleDisponivel() ? { estado: 'invalida', detalhe: 'A assinatura do manifesto não confere; usando os arquivos do próprio site.' }
        : { estado: 'indisponivel', detalhe: 'O navegador não oferece WebCrypto neste contexto (use HTTPS).' };
    this.origem = rotuloOrigem[this.sig.estado];
    this.regras = await this._json('regras.json');
    if (this.arquivo('fontes.json')) {
      try { this.fontes = await this._json('fontes.json'); } catch (e) { this._erro(e); } // opcional
    }
    this.ultimaVerificacao = Date.now();
    this.rev++;
    this._emitir('manifesto');
    return this;
  }

  _erro(e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!this.erros.some((x) => x.mensagem === msg)) this.erros.push({ mensagem: msg, arquivo: e?.arquivo ?? null });
  }

  // -------------------------------------------------------------------------------------------- candidaturas por UF

  /** Garante que as UFs informadas estejam carregadas. Falhas de uma UF não impedem as demais (ver this.erros). */
  async ensureUfs(ufs) {
    if (!this.manifest) throw new ErroDados('dados não iniciados');
    const validas = new Set(this._ufsDoManifesto());
    const faltam = [...new Set(ufs)].filter((u) => validas.has(u) && !this.shards.has(u));
    if (faltam.length === 0) return false;
    const falhas = [];
    const fila = [...faltam];
    const trabalhador = async () => {
      while (fila.length) {
        const uf = fila.shift();
        try { await this._carregarUf(uf); } catch (e) { falhas.push(uf); this._erro(e); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, fila.length) }, trabalhador));
    this._reconstruir();
    this._emitir('candidatos');
    if (falhas.length) throw new ErroDados(`Não foi possível carregar/verificar: ${falhas.join(', ')}`);
    return true;
  }

  ensureTodas() { return this.ensureUfs(this._ufsDoManifesto()); }

  _carregarUf(uf) {
    if (this._emVoo.has(uf)) return this._emVoo.get(uf);
    const p = (async () => {
      const path = `candidatos/${uf}.json`;
      const manifesto = this.manifest;
      const lista = (await this._json(path, manifesto)).map(mapCandidate).filter(Boolean);
      const resultados = await this._carregarResultados(uf, manifesto);
      if (this.manifest !== manifesto) return; // pacote trocado durante a carga: a atualização cuida das UFs carregadas
      this.shards.set(uf, { sha: this.arquivo(path).sha256, lista });
      if (resultados) this.resultadosShards.set(uf, resultados);
    })().finally(() => this._emVoo.delete(uf));
    this._emVoo.set(uf, p);
    return p;
  }

  async _carregarResultados(uf, manifesto) {
    const path = `resultados/${uf}.json`;
    const rec = manifesto.arquivos.find((a) => a.path === path);
    if (!rec) return null;
    return { sha: rec.sha256, mapa: mapResultados(await this._json(path, manifesto)) };
  }

  _reconstruir() {
    const candidatos = [];
    for (const uf of this._ufsDoManifesto()) {
      const s = this.shards.get(uf);
      if (!s) continue;
      const res = this.resultadosShards.get(uf)?.mapa;
      for (const c of s.lista) {
        const r = res?.get(c.id);
        if (r) c.resultado = r; else c.resultado = null;
        candidatos.push(c);
      }
    }
    this.candidatos = candidatos;
    this.porId = new Map(candidatos.map((c) => [c.id, c]));
    this.rev++;
    this.revCand++;
  }

  async ensurePesquisas() {
    if (this.pesquisas) return this.pesquisas;
    if (!this.arquivo('pesquisas.json')) { this.pesquisas = []; return this.pesquisas; }
    if (!this._pesqEmVoo) {
      this._pesqEmVoo = this._json('pesquisas.json').then((l) => {
        this.pesquisas = Array.isArray(l) ? l : [];
        this.rev++;
        this._emitir('pesquisas');
        return this.pesquisas;
      }).finally(() => { this._pesqEmVoo = null; });
    }
    return this._pesqEmVoo;
  }

  // -------------------------------------------------------------------------------------------- atualização

  /**
   * Procura uma versão nova do pacote (protocolo §7 do contrato): verifica a assinatura, rejeita schema incompatível e
   * pacote mais antigo (anti-rollback), baixa SOMENTE arquivos cujo sha256 mudou e troca tudo de forma atômica.
   * Qualquer falha mantém o pacote ativo. Retorna { tipo: 'atual'|'atualizado'|'ignorado'|'rejeitado'|'falha', ... }.
   */
  verificarAtualizacao() {
    return this._serial(async () => {
      let res;
      try {
        res = await this._atualizar();
      } catch (e) {
        res = { tipo: 'falha', motivo: e instanceof Error ? e.message : String(e) };
      }
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
    const ativo = this.manifest;
    if (String(novo.generatedAt) < String(ativo.generatedAt)) return { tipo: 'ignorado', motivo: 'pacote remoto é mais antigo que o ativo (anti-rollback)' };
    if (novo.dataVersion === ativo.dataVersion) return { tipo: 'atual' };

    const sha = (m, p) => m.arquivos.find((a) => a.path === p)?.sha256 ?? null;
    const mudou = (p) => sha(novo, p) !== sha(ativo, p);
    let baixados = 0;
    let bytes = 0;
    const baixar = async (path) => {
      const b = await this._baixarVerificado(path, novo);
      baixados++; bytes += b.length;
      return JSON.parse(dec.decode(b));
    };

    const regras = mudou('regras.json') ? await baixar('regras.json') : this.regras;
    const fontes = !novo.arquivos.some((a) => a.path === 'fontes.json') ? null : mudou('fontes.json') ? await baixar('fontes.json') : this.fontes;
    const pesquisas = this.pesquisas == null ? null
      : !novo.arquivos.some((a) => a.path === 'pesquisas.json') ? [] : mudou('pesquisas.json') ? await baixar('pesquisas.json') : this.pesquisas;

    const shards = new Map();
    const resultadosShards = new Map();
    for (const [uf, s] of this.shards) {
      const path = `candidatos/${uf}.json`;
      if (!sha(novo, path)) continue; // UF removida do pacote
      shards.set(uf, mudou(path) ? { sha: sha(novo, path), lista: (await baixar(path)).map(mapCandidate).filter(Boolean) } : s);
      const rpath = `resultados/${uf}.json`;
      if (sha(novo, rpath)) {
        const atual = this.resultadosShards.get(uf);
        resultadosShards.set(uf, atual && atual.sha === sha(novo, rpath) ? atual
          : { sha: sha(novo, rpath), mapa: mapResultados(await baixar(rpath)) });
      }
    }

    // ---- troca atômica (síncrona): nada acima alterou o pacote ativo
    this.manifest = novo;
    this.manifestBytes = r.bytes;
    this.assinatura = r.assinatura;
    this.sig = { estado: 'verificada', detalhe: '' };
    this.origem = 'atualização verificada (assinatura digital)';
    this.regras = regras;
    this.fontes = fontes;
    this.pesquisas = pesquisas;
    this.shards = shards;
    this.resultadosShards = resultadosShards;
    this._reconstruir();
    this.erros = [];
    this._emitir('atualizado');
    return { tipo: 'atualizado', dataVersion: novo.dataVersion, arquivosBaixados: baixados, bytesBaixados: bytes };
  }
}
