// Contexto das calculadoras: monta, a partir do pacote de dados (elementos, constantes, regras), as funções que os cálculos usam.
// Nenhum valor numérico é embutido aqui, exceto convenções documentadas (CNTP e pKw a 25 °C), usadas só quando o pacote não as traz.
import { SIMBOLOS_SET } from './formula.js';
import { paraBase, tabelaDeUnidades } from './unidades.js';

const CONSTANTES = {
  R: { ids: ['r', 'rgas', 'constantedosgases', 'gasconstant', 'molargasconstant'], nome: /constante\s+(universal\s+)?(molar\s+)?dos\s+gases|molar\s+gas\s+constant|gas\s+constant/i },
  NA: { ids: ['na', 'n_a', 'navogadro', 'avogadro', 'numerodeavogadro', 'constantedeavogadro'], nome: /avogadro/i },
  kB: { ids: ['kb', 'k_b', 'boltzmann', 'constantedeboltzmann'], nome: /boltzmann/i },
  F: { ids: ['f', 'faraday', 'constantedefaraday'], nome: /faraday/i }
};
const chaveId = (s) => String(s ?? '').toLowerCase().replace(/[\s_\-.{}^]/g, '');

/** Lê um valor numérico do pacote: número, "6.02214076e23", {valor: ...}. */
export function numeroDoDado(v) {
  if (v == null) return NaN;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v.replace(',', '.'));
  if (typeof v === 'object') return numeroDoDado(v.valor ?? v.value);
  return NaN;
}

function listaDeConstantes(c) {
  if (!c) return [];
  if (Array.isArray(c)) return c;
  const lista = c.constantes ?? c.itens ?? null;
  if (Array.isArray(lista)) return lista;
  return Object.entries(lista ?? c).filter(([, v]) => v && typeof v === 'object').map(([id, v]) => ({ id, ...v }));
}

/**
 * @param {{elementos?: object[], constantes?: any, regras?: any, fontes?: any}} dados
 */
export function criarContexto({ elementos = [], constantes = null, regras = null } = {}) {
  const porSimbolo = new Map(elementos.map((e) => [e.simbolo, e]));
  const lista = listaDeConstantes(constantes);
  const unidades = tabelaDeUnidades(regras);

  function constante(chave) {
    const def = CONSTANTES[chave];
    const alvo = def?.ids ?? [chaveId(chave)];
    const item = lista.find((c) => [c.id, c.simbolo, c.chave].some((x) => x != null && alvo.includes(chaveId(x))))
      ?? (def ? lista.find((c) => def.nome.test(String(c.nome ?? c.nomeEn ?? ''))) : null);
    if (!item) return null;
    const valor = numeroDoDado(item.valor ?? item);
    if (!Number.isFinite(valor)) return null;
    return {
      chave, valor, unidade: item.unidade ?? item.unidades ?? '', nome: item.nome ?? chave, simbolo: item.simbolo ?? chave,
      incerteza: item.incerteza != null ? numeroDoDado(item.incerteza) : null, exata: item.exata === true,
      fonte: item.fonte ?? item.fontes?.[0] ?? null
    };
  }

  let rCache;
  /** R em J/(mol·K): direto, ou N_A × k_B. */
  function gasR() {
    if (rCache !== undefined) return rCache;
    const r = constante('R');
    if (r && /J/.test(r.unidade || 'J')) { rCache = r; return r; }
    const na = constante('NA');
    const kb = constante('kB');
    rCache = na && kb ? { chave: 'R', valor: na.valor * kb.valor, unidade: 'J mol^-1 K^-1', nome: 'Constante universal dos gases (N_A × k_B)', simbolo: 'R', exata: true, fonte: kb.fonte, derivada: true } : null;
    return rCache;
  }

  const atm = () => { try { return paraBase(unidades, 'atm', 'pressao', 1); } catch { return null; } };
  const zeroCelsius = () => { try { return paraBase(unidades, '°C', 'temperatura', 0); } catch { return null; } };

  /** Volume molar de um gás ideal (m³/mol) nas CNTP adotadas: 0 °C e 1 atm. */
  function volumeMolarCNTP() {
    const R = gasR();
    const P = atm();
    const T = zeroCelsius();
    if (!R || !P || !T) return null;
    return { valor: (R.valor * T) / P, T, P, R };
  }

  const regrasPKw = Number(regras?.agua?.pKw ?? regras?.pKw ?? regras?.constantes?.pKw);
  const kwCons = constante('Kw');
  const pKw = Number.isFinite(regrasPKw) ? { valor: regrasPKw, origem: 'regras.json (pacote de dados)' }
    : kwCons ? { valor: -Math.log10(kwCons.valor), origem: 'constantes.json (pacote de dados)' }
      : { valor: 14, origem: 'convenção a 25 °C (produto iônico da água, pH + pOH = 14)' };

  const fonteElemento = elementos.find((e) => e.fontes?.length)?.fontes[0] ?? null;

  return {
    elementos, porSimbolo, unidades, constante, gasR, volumeMolarCNTP, pKw, fonteElemento,
    simbolos: porSimbolo.size ? new Set([...SIMBOLOS_SET]) : SIMBOLOS_SET,
    massaDe: (s) => porSimbolo.get(s)?.massaAtomica,
    nomeDe: (s) => porSimbolo.get(s)?.nome ?? s,
    avogadro: () => constante('NA')
  };
}
