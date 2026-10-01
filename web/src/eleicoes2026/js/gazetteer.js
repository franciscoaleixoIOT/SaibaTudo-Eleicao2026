// Dicionário derivado dos DADOS oficiais carregados (partidos e nomes de candidatos). Porte de Gazetteer.kt.
// É incremental: novas UFs carregadas sob demanda entram via add(); a IA "aprende" sem retreino.
import { ModeloCargo, normalizar } from './model.js';

export const STOP_NOME = new Set([
  'quem', 'que', 'qual', 'quais', 'sobre', 'para', 'por', 'com', 'dos', 'das', 'uma', 'uns', 'foi', 'era',
  'esta', 'est', 'numero', 'candidato', 'candidata', 'candidatos', 'informacoes', 'informacao', 'dados',
  'perfil', 'presidente', 'presidencia', 'governador', 'governadora', 'senador', 'senadora', 'senado',
  'deputado', 'deputada', 'federal', 'estadual', 'distrital', 'vice', 'suplente', 'eleicao', 'eleicoes',
  'urna', 'partido', 'votos', 'voto', 'mostra', 'mostrar', 'quero', 'ver', 'fala', 'falar', 'conta', 'tem',
  'teve', 'ficha', 'limpa', 'bens', 'patrimonio', 'resultado', 'resultados', 'pesquisa', 'pesquisas'
]);

export class Gazetteer {
  /**
   * @param {object[]} candidatos candidaturas já carregadas
   * @param {string[]} partidosExtras siglas conhecidas antes das UFs carregarem (regras.estatisticas.porPartido)
   */
  constructor(candidatos = [], partidosExtras = []) {
    /** siglas de partido (normalizadas -> sigla oficial) */
    this.partidos = new Map();
    this.porToken = new Map();
    this.total = 0;
    for (const p of partidosExtras) this._partido(p);
    this.add(candidatos);
  }

  _partido(sigla) {
    if (typeof sigla === 'string' && sigla.length >= 2 && sigla.length <= 14) {
      const n = normalizar(sigla);
      if (!this.partidos.has(n)) this.partidos.set(n, sigla);
    }
  }

  add(candidatos) {
    for (const c of candidatos) {
      this._partido(c.partido);
      for (const t of new Set(c.chaveBusca.split(' '))) {
        if (t.length >= 3) {
          let l = this.porToken.get(t);
          if (!l) this.porToken.set(t, (l = []));
          l.push(c);
        }
      }
    }
    this.total += candidatos.length;
  }

  /**
   * Busca candidatos cujo nome contenha TODAS as palavras de termo (palavras inteiras).
   * Ordenação determinística: qualidade da correspondência, depois ordem oficial de cargo/UF/número
   * (nunca por preferência).
   */
  buscarPorNome(termo, cargo = null, uf = null, limite = 50) {
    const tokens = normalizar(termo).split(' ').filter((t) => t.length >= 3 && !STOP_NOME.has(t));
    if (tokens.length === 0) return [];
    // começa pela palavra mais rara (menos candidatos) e filtra pelas demais
    let base = null;
    for (const t of tokens) {
      const l = this.porToken.get(t);
      if (!l) return [];
      if (base === null || l.length < base.length) base = l;
    }
    const frase = tokens.join(' ');
    const achados = base.filter((c) => {
      const palavras = new Set(c.chaveBusca.split(' '));
      return tokens.every((t) => palavras.has(t));
    }).filter((c) => cargo == null || ModeloCargo.mesmaFamilia(cargo, c.cargoCodigo))
      .filter((c) => uf == null || c.estadoUf === uf);
    const chave = (c) => [pontuacao(c, frase), ModeloCargo.ordem(c.cargoCodigo), c.estadoUf, numeroOrdem(c.numero)];
    return achados.map((c) => ({ c, k: chave(c) }))
      .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || cmpStr(a.k[2], b.k[2]) || a.k[3] - b.k[3])
      .slice(0, limite).map((x) => x.c);
  }
}

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const numeroOrdem = (n) => {
  const v = Number.parseInt(n, 10);
  return Number.isNaN(v) ? Number.MAX_SAFE_INTEGER : v;
};

/** Menor = melhor: nome de urna idêntico > nome de urna começa com > demais. */
function pontuacao(c, frase) {
  const urna = normalizar(c.nomeUrna);
  if (urna === frase) return 0;
  if (urna.startsWith(frase + ' ')) return 1;
  if (urna.includes(frase)) return 2;
  return 3;
}
