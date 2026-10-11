// Perigos (GHS): pictogramas, palavra de sinal e frases H em português. Os textos das frases vêm de ghs.js (gerado de dataset/ghs_pt.py);
// o pacote de dados pode trazer `regras.frasesH` para sobrepor. A classificação de cada composto vem do pacote (campo `ghs`).
import { FONTE_GHS, FRASES_H, PICTOGRAMAS } from './ghs.js';

export { FRASES_H, PICTOGRAMAS, FONTE_GHS };

export const NOMES_PICTOGRAMA = {
  GHS01: 'Explosivo', GHS02: 'Inflamável', GHS03: 'Comburente (oxidante)', GHS04: 'Gás sob pressão', GHS05: 'Corrosivo',
  GHS06: 'Toxicidade aguda (tóxico ou fatal)', GHS07: 'Nocivo, irritante ou sensibilizante', GHS08: 'Perigo grave à saúde', GHS09: 'Perigoso ao ambiente aquático'
};
export const CODIGOS_PICTOGRAMA = Object.keys(NOMES_PICTOGRAMA);
export const urlPictograma = (codigo) => `/quimica/vendor/ghs/${String(codigo).toLowerCase()}.svg`;

export const GRUPOS_FRASES_H = [
  { faixa: 'H2xx', titulo: 'Perigos físicos', descricao: 'explosivos, inflamáveis, comburentes, gases sob pressão, corrosivos para metais (H200 a H290).' },
  { faixa: 'H3xx', titulo: 'Perigos para a saúde', descricao: 'toxicidade aguda, corrosão e irritação da pele e dos olhos, sensibilização, mutagenicidade, carcinogenicidade, toxicidade reprodutiva e para órgãos-alvo (H300 a H373).' },
  { faixa: 'H4xx', titulo: 'Perigos ao meio ambiente', descricao: 'toxicidade para organismos aquáticos e para a camada de ozônio (H400 a H420).' }
];

/** Texto de uma frase H ("H314", ou combinada "H302+H312"). null se desconhecida. */
export function fraseH(codigo, regras = null) {
  const cod = String(codigo ?? '').trim().toUpperCase();
  const doPacote = regras?.frasesH;
  const mapa = doPacote && typeof doPacote === 'object' && !Array.isArray(doPacote) ? { ...FRASES_H, ...doPacote } : FRASES_H;
  if (mapa[cod]) return mapa[cod];
  const partes = cod.split(/\s*\+\s*/);
  if (partes.length > 1 && partes.every((c) => mapa[c])) return `${partes.map((c) => mapa[c].replace(/\.$/, '')).join(' / ')}.`;
  return null;
}

/** Normaliza a palavra de sinal ("Danger" → "Perigo"). */
export function palavraSinal(p) {
  const t = String(p ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!t) return null;
  if (t === 'danger' || t === 'perigo') return 'Perigo';
  if (t === 'warning' || t === 'atencao') return 'Atenção';
  return String(p);
}

/**
 * Descrição pronta da classificação GHS de um composto (campo `ghs` do pacote), ou null se não houver.
 * @returns {{pictogramas: {codigo: string, nome: string, descricao: string, url: string}[], palavraSinal: string|null, frases: {codigo: string, texto: string|null}[], fonte: string|null}|null}
 */
export function descreverGhs(ghs, regras = null) {
  if (!ghs || typeof ghs !== 'object') return null;
  const pict = (Array.isArray(ghs.pictogramas) ? ghs.pictogramas : []).map((c) => String(c).toUpperCase()).filter((c) => /^GHS0[1-9]$/.test(c));
  const frases = (Array.isArray(ghs.frasesH) ? ghs.frasesH : []).map((c) => String(c).toUpperCase()).map((codigo) => ({ codigo, texto: fraseH(codigo, regras) }));
  if (!pict.length && !frases.length && !ghs.palavraSinal) return null;
  return {
    pictogramas: pict.map((codigo) => ({ codigo, nome: NOMES_PICTOGRAMA[codigo], descricao: PICTOGRAMAS[codigo]?.[0] ?? '', url: urlPictograma(codigo) })),
    palavraSinal: palavraSinal(ghs.palavraSinal),
    frases,
    fonte: ghs.fonte ?? null
  };
}

/** URL externa segura (só https). */
export const urlSegura = (u) => { try { const x = new URL(String(u)); return x.protocol === 'https:' ? x.href : null; } catch { return null; } };
