// Comparação dos casos de referência do NLU (contracts/nlu_golden_cases.json) com a interpretação do site. Usado pelos testes do NLU e das respostas.
import { normalizar } from '../src/quimica/js/texto.js';

export const CHAVES_GOLDEN = ['intent', 'elemento', 'composto', 'propriedade', 'equacao', 'unidadeDestino', 'grupo', 'periodo', 'bloco', 'categoria', 'estado', 'formula', 'nivel', 'conceito'];

/** O composto esperado (CID ou nome) existe no pacote? Devolve o CID. */
export function cidDe(esperado, store) {
  if (esperado == null) return null;
  if (typeof esperado === 'number' || /^\d+$/.test(String(esperado))) return store.indice.porCid.has(Number(esperado)) ? Number(esperado) : undefined;
  const k = normalizar(esperado);
  const e = store.indice.entradas.find((x) => [x.nome, x.nomePopular, x.nomeIupac, ...(x.sinonimos ?? [])].some((n) => n && normalizar(n) === k));
  return e ? e.cid : undefined;
}

export function falhasDoCaso(c, p, store) {
  const falhas = [];
  for (const k of CHAVES_GOLDEN) {
    if (!(k in c)) continue;
    const esperado = c[k];
    let atual = p[k] ?? null;
    if (k === 'composto') { atual = p.composto; const cid = cidDe(esperado, store); if (esperado != null && cid === undefined) continue; if (esperado != null) { if (atual !== cid) falhas.push(`composto: esperado ${cid}, veio ${atual}`); continue; } }
    if (k === 'equacao' && esperado) atual = atual ? atual.replace(/\s+/g, ' ') : atual;
    if (esperado === null ? atual != null : atual !== esperado) falhas.push(`${k}: esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(atual)}`);
  }
  return falhas;
}

/** O caso pode ser avaliado neste pacote? (as entidades esperadas existem) */
export function avaliavel(c, store) {
  if (c.elemento && !store.porSimbolo.has(c.elemento)) return false;
  if (c.composto != null && cidDe(c.composto, store) === undefined) return false;
  return true;
}

