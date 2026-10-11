// Filtragem determinística de candidaturas (porte de CandidateQuery.kt).
// A ORDEM da lista é fixa (cargo, UF, número do candidato): o app nunca ranqueia nem prioriza candidaturas.
import { HISTORICO, ModeloCargo, normalizar, resultadoEleito, ufsDaRegiao, SIGLAS } from './model.js';

/**
 * apenasIndeferidas: registros indeferidos (inclui inelegíveis pela Ficha Limpa); ignora "apenas na urna".
 * genero: gênero declarado ao TSE ("FEMININO"/"MASCULINO").
 */
export const novoFiltro = (parcial = {}) => ({
  regiao: null, estadoUf: null, cargo: null, apenasDeferidas: false, apenasIndeferidas: false, apenasNaUrna: true, genero: null,
  apenasEleitos: false, historico: 'TODOS', partido: null, tema: null, buscaTexto: null, ...parcial
});

const numeroOrdem = (n) => {
  const v = Number.parseInt(n, 10);
  return Number.isNaN(v) ? Number.MAX_SAFE_INTEGER : v;
};
const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Comparador da ordem oficial: cargo, UF, número, nome de urna. */
export const ORDEM = (a, b) =>
  ModeloCargo.ordem(a.cargoCodigo) - ModeloCargo.ordem(b.cargoCodigo) ||
  cmpStr(a.estadoUf, b.estadoUf) ||
  numeroOrdem(a.numero) - numeroOrdem(b.numero) ||
  cmpStr(a.nomeUrna, b.nomeUrna);

export function filtrar(todos, f) {
  const busca = f.buscaTexto ? normalizar(f.buscaTexto) : '';
  const hist = f.historico ?? 'TODOS';
  const partidoLower = f.partido ? f.partido.toLowerCase() : null;
  const generoLower = f.genero ? f.genero.toLowerCase() : null;
  const out = [];
  for (const c of todos) {
    if (f.estadoUf != null && c.estadoUf !== f.estadoUf && c.estadoUf !== 'BR') continue;
    if (f.regiao != null && c.regiao !== f.regiao && c.estadoUf !== 'BR') continue;
    if (f.cargo != null && !ModeloCargo.mesmaFamilia(f.cargo, c.cargoCodigo)) continue;
    if (f.apenasNaUrna && !f.apenasIndeferidas && !c.naUrna) continue;
    if (f.apenasDeferidas && c.elegibilidade.apta !== true) continue;
    if (f.apenasIndeferidas && !c.elegibilidade.indeferida) continue;
    if (generoLower != null && (c.genero ?? '').toLowerCase() !== generoLower) continue;
    if (f.apenasEleitos && !resultadoEleito(c.resultado)) continue;
    if (hist === 'NUNCA_ELEITO' && c.vezesEleito !== 0) continue;
    if (hist === 'ELEITO_MESMO_CARGO' && !c.eleitoMesmoCargo) continue;
    if (hist === 'ELEITO_2_OU_MAIS' && c.vezesEleito < 2) continue;
    if (partidoLower != null && c.partido.toLowerCase() !== partidoLower) continue;
    if (f.tema != null && !c.temasPlano.includes(f.tema)) continue;
    if (busca && !(c.chaveBusca.includes(busca) || c.numero === busca || c.partidoNorm.includes(busca) ||
      (c.municipioNorm != null && c.municipioNorm.includes(busca)))) continue;
    out.push(c);
  }
  return out.sort(ORDEM);
}

/**
 * Aplica ao filtro atual as alterações sugeridas por uma resposta da IA (MainViewModel.perguntar): com `resetar`, parte do
 * filtro limpo. "Ficha Limpa: registro deferido" e "Indeferidos/inelegíveis" são excludentes: vale o que a resposta pediu.
 */
export function filtroDaResposta(f, atual, apenasNaUrnaPadrao = true) {
  const base = f.resetar ? novoFiltro({ apenasNaUrna: apenasNaUrnaPadrao }) : atual;
  const sem = f.resetar ? null : undefined;
  const novo = {
    ...base,
    cargo: f.cargo ?? sem ?? base.cargo, estadoUf: f.estadoUf ?? sem ?? base.estadoUf, partido: f.partido ?? sem ?? base.partido,
    tema: f.tema ?? sem ?? base.tema, buscaTexto: f.buscaTexto ?? sem ?? base.buscaTexto,
    apenasDeferidas: f.apenasDeferidas ?? base.apenasDeferidas, apenasIndeferidas: f.apenasIndeferidas ?? base.apenasIndeferidas ?? false,
    apenasEleitos: f.apenasEleitos ?? base.apenasEleitos, historico: f.historico ?? base.historico,
    genero: f.genero ?? sem ?? base.genero ?? null
  };
  if (f.apenasIndeferidas === true) novo.apenasDeferidas = false;
  else if (f.apenasDeferidas === true) novo.apenasIndeferidas = false;
  return novo;
}

/** Apenas titulares do cargo (sem vices/suplentes) — usado em contagens e listas de resposta. */
export const titulares = (todos, cargo, uf, somenteNaUrna = true) =>
  todos.filter((c) => c.cargoCodigo === cargo && (uf == null || c.estadoUf === uf) && (!somenteNaUrna || c.naUrna)).sort(ORDEM);

/**
 * Quais fatias (UFs) do pacote são necessárias para responder a um filtro. "BR" (Presidente/Vice) sempre entra,
 * pois o filtro por UF inclui as candidaturas nacionais. Sem UF/região e sem cargo nacional: todas as UFs.
 */
export function ufsNecessarias(f) {
  if (f.cargo === 'PRESIDENTE' || f.cargo === 'VICE_PRESIDENTE') return ['BR'];
  const base = new Set(['BR']);
  if (f.estadoUf) {
    base.add(f.estadoUf);
    if (f.regiao && !ufsDaRegiao(f.regiao).includes(f.estadoUf)) return ['BR']; // combinação vazia (AND)
    return [...base];
  }
  if (f.regiao) {
    for (const u of ufsDaRegiao(f.regiao)) base.add(u);
    return [...base];
  }
  return ['BR', ...SIGLAS];
}

export { HISTORICO };
