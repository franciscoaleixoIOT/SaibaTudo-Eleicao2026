// Dicionário do NLU, derivado do pacote de dados: elementos (nomes PT e EN, símbolos), compostos (nome, popular, IUPAC, sinônimos, fórmula, CAS, CID),
// propriedades (sinônimos) e leitura de fórmulas digitadas ("H2O", "ca(oh)2", "nacl"). Nada é embutido além do vocabulário de unidades.
import { SIMBOLOS_SET, chaveFormula, tentarFormula } from './calc/formula.js';
import { tabelaDePropriedades } from './propriedades.js';
import { distancia, normalizar } from './texto.js';

/** Palavras do português que coincidem com símbolos (só valem no meio da frase, com a inicial maiúscula já no texto original). */
const SIMBOLOS_AMBIGUOS = new Set(['Na', 'No', 'Os', 'As', 'Se', 'Ar', 'Si', 'In', 'At', 'Be', 'Am', 'Ta', 'Re', 'Ge', 'Pa', 'Mo', 'Ho', 'Er', 'Ra', 'Ca', 'Co', 'Ir', 'La', 'Li', 'Lu', 'Mi', 'Y']);
/** Siglas e interjeições que formam "fórmulas" válidas por acaso. */
const NAO_FORMULAS = new Set(['OK', 'SOS', 'PH', 'HOHO', 'IN', 'AS', 'BIS', 'PIS', 'SP', 'CIP', 'OH']);
const STOP_PALAVRAS = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'o', 'a', 'os', 'as', 'um', 'uma', 'em', 'no', 'na', 'que', 'para', 'por', 'com', 'ao', 'se']);

/** Tokens do texto original separados por espaço, sem pontuação final (preserva parênteses internos). */
export function tokensOriginais(texto) {
  return String(texto ?? '').split(/\s+/).map((t) => {
    let s = t.replace(/^[\s"'“‘¿¡]+/, '').replace(/[\s"'”’?!,;:]+$/, '');
    // ponto final de frase (não o de hidrato: "CuSO4.5H2O")
    s = s.replace(/\.+$/, '');
    // parêntese de fechamento sobrando (texto entre parênteses): "(H2O)" → "H2O"
    if (s.startsWith('(') && s.endsWith(')') && (s.match(/\(/g) ?? []).length === 1) s = s.slice(1, -1);
    if (s.endsWith(')') && !s.includes('(')) s = s.slice(0, -1);
    return s;
  }).filter(Boolean);
}

export class Dicionario {
  /** @param {import('./data.js').DataStore} store */
  constructor(store) {
    this.rev = store.rev;
    this.elementos = store.elementos;
    this.porSimbolo = store.porSimbolo;
    this.entradas = store.indice.entradas;
    this.props = tabelaDePropriedades(store.regras);
    this.unidades = store.ctx.unidades;

    // elementos: nome → símbolo
    const nomesEl = new Map();
    for (const e of this.elementos) {
      for (const n of [e.nome, e.nomeEn, ...(Array.isArray(e.sinonimos) ? e.sinonimos : [])]) {
        const k = normalizar(n);
        if (k.length >= 3 && !nomesEl.has(k)) nomesEl.set(k, e.simbolo);
      }
    }
    this.nomesElemento = [...nomesEl].map(([chave, simbolo]) => ({ chave, simbolo })).sort((a, b) => b.chave.length - a.chave.length);
    this.nomesElementoMap = nomesEl;

    // compostos: nome → cid, em ordem de prioridade
    const nomesCo = new Map();
    const passes = [(e) => [e.nome], (e) => [e.nomePopular], (e) => e.sinonimos ?? [], (e) => [e.nomeIupac], (e) => e.chaves ?? []];
    for (const pega of passes) {
      for (const e of this.entradas) {
        for (const n of pega(e)) {
          const k = normalizar(n);
          if (k.length >= 3 && !/^\d+$/.test(k) && !nomesCo.has(k)) nomesCo.set(k, e.cid);
        }
      }
    }
    this.nomesComposto = [...nomesCo].map(([chave, cid]) => ({ chave, cid })).sort((a, b) => b.chave.length - a.chave.length);
    this.nomesCompostoMap = nomesCo;

    // fórmulas (sem diferenciar maiúsculas) e CAS
    this.formulaParaCid = new Map();
    this.casParaCid = new Map();
    this.porCid = store.indice.porCid;
    for (const e of this.entradas) {
      if (e.formula) {
        const k = chaveFormula(e.formula);
        if (!this.formulaParaCid.has(k)) this.formulaParaCid.set(k, e.cid);
      }
      for (const k of e.chavesF ?? []) if (!this.formulaParaCid.has(k)) this.formulaParaCid.set(k, e.cid); // índice do pipeline: fórmulas entre as chaves
      if (e.cas) this.casParaCid.set(String(e.cas), e.cid);
    }

    // propriedades: sinônimo → id, mais longos primeiro
    const sin = [];
    for (const p of this.props) for (const s of [p.rotulo, ...(p.sinonimos ?? [])]) {
      const k = normalizar(s);
      if (k) sin.push({ chave: k, id: p.id, alvo: p.alvo });
    }
    this.sinonimosPropriedade = sin.sort((a, b) => b.chave.length - a.chave.length);
    this.propPorId = new Map(this.props.map((p) => [p.id, p]));
  }

  nomeDoElemento(simbolo) { return this.porSimbolo.get(simbolo)?.nome ?? simbolo; }
  entrada(cid) { return this.porCid.get(Number(cid)) ?? null; }

  /** Segmenta "nacl" em símbolos (única segmentação válida); devolve a fórmula com a caixa correta ou null. */
  recuperarCaixa(token) {
    const t = token.toLowerCase();
    if (!/^[a-z0-9()]+$/.test(t) || !/[a-z]/.test(t)) return null;
    const simbolosMin = new Map([...SIMBOLOS_SET].map((s) => [s.toLowerCase(), s]));
    const resultados = [];
    const dfs = (i, acc) => {
      if (resultados.length > 2) return;
      if (i === t.length) { resultados.push(acc); return; }
      const c = t[i];
      if (/[0-9()]/.test(c)) { dfs(i + 1, acc + c); return; }
      const dois = t.slice(i, i + 2);
      if (dois.length === 2 && /^[a-z]{2}$/.test(dois) && simbolosMin.has(dois)) dfs(i + 2, acc + simbolosMin.get(dois));
      if (simbolosMin.has(c)) dfs(i + 1, acc + simbolosMin.get(c));
    };
    dfs(0, '');
    const validos = [...new Set(resultados.filter((f) => tentarFormula(f)))];
    return validos.length === 1 ? validos[0] : null;
  }

  /**
   * Entidades do texto: elementos, compostos e fórmulas. `via` indica de onde veio ('nome', 'simbolo', 'formula', 'cas', 'cid', 'aproximado').
   * @returns {{elementos: object[], compostos: object[], formulas: object[], tudo: object[]}}
   */
  entidades(original) {
    const texto = String(original ?? '');
    const n = normalizar(texto);
    const usado = new Array(n.length).fill(false);
    const achados = [];
    const livre = (i, j) => { for (let k = i; k < j; k++) if (usado[k]) return false; return true; };
    const marcar = (i, j) => { for (let k = i; k < j; k++) usado[k] = true; };
    const limite = (i, j) => (i === 0 || n[i - 1] === ' ') && (j === n.length || n[j] === ' ');
    const procurar = (chave, fn) => {
      let i = n.indexOf(chave);
      while (i !== -1) {
        const j = i + chave.length;
        if (limite(i, j) && livre(i, j)) { marcar(i, j); fn(i, j); }
        i = n.indexOf(chave, i + 1);
      }
    };

    // 1) cabeçalhos explícitos: CID e CAS
    for (const m of texto.matchAll(/\bCID\s*[:#]?\s*(\d{1,9})\b/gi)) {
      const e = this.porCid.get(Number(m[1]));
      if (e) achados.push({ tipo: 'composto', cid: e.cid, nome: e.nome, via: 'cid', pos: m.index / Math.max(texto.length, 1) });
    }
    for (const m of texto.matchAll(/\b(\d{2,7}-\d{2}-\d)\b/g)) {
      const cid = this.casParaCid.get(m[1]);
      if (cid) achados.push({ tipo: 'composto', cid, nome: this.entrada(cid)?.nome, via: 'cas', pos: m.index / Math.max(texto.length, 1) });
    }

    // 2) nomes de compostos (mais longos primeiro) e de elementos
    for (const { chave, cid } of this.nomesComposto) {
      procurar(chave, (i) => achados.push({ tipo: 'composto', cid, nome: this.entrada(cid)?.nome, via: 'nome', pos: i / Math.max(n.length, 1) }));
    }
    for (const { chave, simbolo } of this.nomesElemento) {
      procurar(chave, (i) => achados.push({ tipo: 'elemento', simbolo, nome: this.nomeDoElemento(simbolo), via: 'nome', pos: i / Math.max(n.length, 1) }));
    }

    // 3) fórmulas e símbolos digitados (na caixa original)
    const toks = tokensOriginais(texto);
    const total = Math.max(toks.length, 1);
    const unico = toks.length === 1;
    toks.forEach((t, idx) => {
      const pos = idx / total;
      if (!/^[A-Za-z0-9()·.*+^\-−₀-₉⁰-⁹⁺⁻]+$/.test(t) || !/[A-Za-z]/.test(t)) return;
      if (NAO_FORMULAS.has(t.toUpperCase())) return;
      const temDigito = /\d/.test(t);
      const properCase = /^[A-Z(]/.test(t);
      const f = properCase ? tentarFormula(t) : null;
      const nEl = f ? f.atomos.size : 0;
      const cid = this.formulaParaCid.get(chaveFormula(t));
      // A) fórmula conhecida do índice
      if (cid != null) {
        const minuscula = /^[a-z0-9()]+$/.test(t);
        const aceita = temDigito || (f && nEl >= 2) || (minuscula && t.length >= 3 && !STOP_PALAVRAS.has(t) && this.recuperarCaixa(t) != null);
        if (aceita) { achados.push({ tipo: 'composto', cid, nome: this.entrada(cid)?.nome, via: 'formula', texto: t, pos }); return; }
      }
      // B) fórmula bem escrita fora do índice
      if (f) {
        const simples = nEl === 1 && f.partes.length === 1 && [...f.atomos.values()][0] === 1 && f.carga === 0;
        if (!simples) {
          const palavraComum = !temDigito && !/[()·+^-]/.test(t) && (t.match(/[A-Z]/g) ?? []).length < 2;
          if (!palavraComum && (nEl >= 2 || temDigito || f.carga !== 0)) { achados.push({ tipo: 'formula', texto: f.texto, hill: f.hill, via: 'formula', pos }); return; }
        } else {
          // C) símbolo de um elemento
          const s = [...f.atomos.keys()][0];
          const ambiguo = s.length === 2 && SIMBOLOS_AMBIGUOS.has(s) && idx === 0 && !unico;
          if (!ambiguo && (s.length === 2 || unico || this.cueElemento(texto))) {
            achados.push({ tipo: 'elemento', simbolo: s, nome: this.nomeDoElemento(s), via: 'simbolo', pos });
            return;
          }
        }
      }
      // D) minúsculas com dígito ("h2so4", "c2h5oh") fora do índice
      if (!properCase && temDigito && /^[a-z0-9()]+$/.test(t)) {
        const rec = this.recuperarCaixa(t);
        const ff = rec ? tentarFormula(rec) : null;
        if (ff) achados.push({ tipo: 'formula', texto: ff.texto, hill: ff.hill, via: 'formula', pos });
      }
    });

    // 4) aproximação por erro de digitação (só se nada foi achado)
    if (achados.length === 0) {
      const ap = this.aproximar(n);
      if (ap) achados.push(ap);
    }

    // saída organizada, sem repetir a mesma entidade
    achados.sort((a, b) => a.pos - b.pos);
    const vistosEl = new Set();
    const vistosCo = new Set();
    const elementos = [];
    const compostos = [];
    const formulas = [];
    for (const a of achados) {
      if (a.tipo === 'elemento' && !vistosEl.has(a.simbolo)) { vistosEl.add(a.simbolo); elementos.push(a); }
      else if (a.tipo === 'composto' && !vistosCo.has(a.cid)) { vistosCo.add(a.cid); compostos.push(a); }
      else if (a.tipo === 'formula' && !formulas.some((f) => f.texto === a.texto)) formulas.push(a);
    }
    // uma fórmula que o índice conhece é o composto (sem duplicar)
    for (const f of [...formulas]) {
      const cid = this.formulaParaCid.get(chaveFormula(f.texto));
      if (cid && !vistosCo.has(cid)) { vistosCo.add(cid); compostos.push({ tipo: 'composto', cid, nome: this.entrada(cid)?.nome, via: 'formula', texto: f.texto, pos: f.pos }); formulas.splice(formulas.indexOf(f), 1); }
      else if (cid) formulas.splice(formulas.indexOf(f), 1);
    }
    return { elementos, compostos, formulas, tudo: achados.sort((a, b) => a.pos - b.pos) };
  }

  cueElemento(texto) { return /\b(elemento|s[ií]mbolo|s[ií]mbolo qu[ií]mico)\b/i.test(texto); }

  /** Erro de digitação em nomes (distância de edição 1 ou 2): "oxigenio" → "oxigênio", "acido sulfuico". */
  aproximar(n) {
    const palavras = n.split(' ').filter(Boolean);
    let melhor = null;
    for (let tam = 3; tam >= 1; tam--) {
      for (let i = 0; i + tam <= palavras.length; i++) {
        const frase = palavras.slice(i, i + tam).join(' ');
        if (frase.length < 5 || palavras.slice(i, i + tam).every((p) => STOP_PALAVRAS.has(p))) continue;
        const lim = frase.length >= 10 ? 2 : 1;
        const cand = [
          ...this.nomesElemento.filter((x) => Math.abs(x.chave.length - frase.length) <= lim).map((x) => ({ ...x, tipo: 'elemento' })),
          ...this.nomesComposto.filter((x) => Math.abs(x.chave.length - frase.length) <= lim && x.chave.split(' ').length === tam).map((x) => ({ ...x, tipo: 'composto' }))
        ];
        for (const c of cand) {
          const d = distancia(frase, c.chave, lim);
          if (d <= lim && (!melhor || d < melhor.d)) melhor = { d, c, pos: i / Math.max(palavras.length, 1) };
        }
        if (melhor) {
          const c = melhor.c;
          return c.tipo === 'elemento'
            ? { tipo: 'elemento', simbolo: c.simbolo, nome: this.nomeDoElemento(c.simbolo), via: 'aproximado', pos: melhor.pos }
            : { tipo: 'composto', cid: c.cid, nome: this.entrada(c.cid)?.nome, via: 'aproximado', pos: melhor.pos };
        }
      }
    }
    return null;
  }

  /** Propriedades citadas no texto normalizado, na ordem em que aparecem: [{id, alvo}]. */
  propriedadesEm(n) {
    const usado = new Array(n.length).fill(false);
    const out = [];
    for (const { chave, id, alvo } of this.sinonimosPropriedade) {
      let i = n.indexOf(chave);
      while (i !== -1) {
        const j = i + chave.length;
        const ok = (i === 0 || n[i - 1] === ' ') && (j === n.length || n[j] === ' ');
        if (ok && !usado.slice(i, j).some(Boolean)) {
          for (let k = i; k < j; k++) usado[k] = true;
          out.push({ id, alvo, pos: i });
        }
        i = n.indexOf(chave, i + 1);
      }
    }
    out.sort((a, b) => a.pos - b.pos);
    const vistos = new Set();
    return out.filter((p) => (vistos.has(p.id) ? false : vistos.add(p.id)));
  }
}

