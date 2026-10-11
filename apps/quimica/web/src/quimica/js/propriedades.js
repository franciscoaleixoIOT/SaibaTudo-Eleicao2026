// Propriedades consultáveis de elementos e compostos (ids usados pelo NLU: `regras.propriedades`). O pacote pode trazer a lista em
// regras.json (mesmo formato abaixo); sem ela vale a lista padrão, que só nomeia os campos do contrato (docs/DATA_CONTRACT.md §2 e §3).
import { fmt } from './formato.js';
import { acharUnidade, deBase, paraBase } from './calc/unidades.js';
import { listar } from './texto.js';

/** @typedef {{id: string, rotulo: string, alvo: 'elemento'|'composto', campo: string, tipo?: string, unidade?: string, sinonimos: string[]}} Propriedade */

/** @type {Propriedade[]} */
export const PROPRIEDADES_PADRAO = [
  { id: 'numeroAtomico', rotulo: 'número atômico', alvo: 'elemento', campo: 'z', tipo: 'inteiro', sinonimos: ['numero atomico', 'z'] },
  { id: 'massaAtomica', rotulo: 'massa atômica', alvo: 'elemento', campo: 'massaAtomica', tipo: 'massaAtomica', unidade: 'u', sinonimos: ['massa atomica', 'peso atomico', 'massa do atomo'] },
  { id: 'simbolo', rotulo: 'símbolo', alvo: 'elemento', campo: 'simbolo', tipo: 'texto', sinonimos: ['simbolo'] },
  { id: 'grupo', rotulo: 'grupo (família)', alvo: 'elemento', campo: 'grupo', tipo: 'inteiro', sinonimos: ['grupo', 'familia'] },
  { id: 'periodo', rotulo: 'período', alvo: 'elemento', campo: 'periodo', tipo: 'inteiro', sinonimos: ['periodo'] },
  { id: 'bloco', rotulo: 'bloco', alvo: 'elemento', campo: 'bloco', tipo: 'texto', sinonimos: ['bloco'] },
  { id: 'categoria', rotulo: 'categoria', alvo: 'elemento', campo: 'categoria', tipo: 'categoria', sinonimos: ['categoria', 'classificacao', 'tipo de elemento', 'classe do elemento'] },
  { id: 'configuracaoEletronica', rotulo: 'configuração eletrônica', alvo: 'elemento', campo: 'configuracaoEletronica', tipo: 'texto', sinonimos: ['configuracao eletronica', 'distribuicao eletronica'] },
  { id: 'eletronegatividade', rotulo: 'eletronegatividade (Pauling)', alvo: 'elemento', campo: 'eletronegatividade', tipo: 'numero', sinonimos: ['eletronegatividade'] },
  { id: 'raioAtomicoPm', rotulo: 'raio atômico', alvo: 'elemento', campo: 'raioAtomicoPm', tipo: 'numero', unidade: 'pm', sinonimos: ['raio atomico', 'tamanho do atomo'] },
  { id: 'afinidadeEletronicaKJmol', rotulo: 'afinidade eletrônica', alvo: 'elemento', campo: 'afinidadeEletronicaKJmol', tipo: 'numero', unidade: 'kJ/mol', sinonimos: ['afinidade eletronica', 'eletroafinidade'] },
  { id: 'energiaIonizacaoKJmol', rotulo: 'energia de ionização', alvo: 'elemento', campo: 'energiaIonizacaoKJmol', tipo: 'numero', unidade: 'kJ/mol', sinonimos: ['energia de ionizacao', 'potencial de ionizacao', 'primeira energia de ionizacao'] },
  { id: 'pontoFusaoK', rotulo: 'ponto de fusão', alvo: 'elemento', campo: 'pontoFusaoK', tipo: 'temperatura', sinonimos: ['ponto de fusao', 'temperatura de fusao', 'fusao', 'derrete', 'funde'] },
  { id: 'pontoEbulicaoK', rotulo: 'ponto de ebulição', alvo: 'elemento', campo: 'pontoEbulicaoK', tipo: 'temperatura', sinonimos: ['ponto de ebulicao', 'temperatura de ebulicao', 'ebulicao', 'ferve'] },
  { id: 'densidadeKgm3', rotulo: 'densidade', alvo: 'elemento', campo: 'densidadeKgm3', tipo: 'densidade', sinonimos: ['densidade', 'massa especifica'] },
  { id: 'estadoPadrao', rotulo: 'estado físico (condições padrão)', alvo: 'elemento', campo: 'estadoPadrao', tipo: 'estado', sinonimos: ['estado fisico', 'estado padrao', 'estado da materia', 'e solido', 'e liquido', 'e gasoso'] },
  { id: 'estadosOxidacao', rotulo: 'estados de oxidação', alvo: 'elemento', campo: 'estadosOxidacao', tipo: 'lista', sinonimos: ['estados de oxidacao', 'numeros de oxidacao', 'nox', 'estado de oxidacao', 'valencia'] },
  { id: 'descoberta', rotulo: 'descoberta', alvo: 'elemento', campo: 'descoberta', tipo: 'descoberta', sinonimos: ['descoberta', 'descobriu', 'descobridor', 'quem descobriu', 'ano da descoberta', 'quando foi descoberto', 'foi descoberto', 'foi descoberta', 'foram descobertos'] },

  { id: 'massaMolar', rotulo: 'massa molar', alvo: 'composto', campo: 'massaMolar', tipo: 'massaMolar', unidade: 'g/mol', sinonimos: ['massa molar', 'massa molecular', 'peso molecular', 'peso molar', 'massa formula'] },
  { id: 'massaExata', rotulo: 'massa exata (monoisotópica)', alvo: 'composto', campo: 'massaExata', tipo: 'numero', unidade: 'u', sinonimos: ['massa exata', 'massa monoisotopica'] },
  { id: 'formula', rotulo: 'fórmula', alvo: 'composto', campo: 'formula', tipo: 'formula', sinonimos: ['formula', 'formula molecular', 'formula quimica'] },
  { id: 'cas', rotulo: 'número CAS', alvo: 'composto', campo: 'cas', tipo: 'texto', sinonimos: ['numero cas', 'cas'] },
  { id: 'cid', rotulo: 'CID no PubChem', alvo: 'composto', campo: 'cid', tipo: 'inteiro', sinonimos: ['cid', 'pubchem'] },
  { id: 'smiles', rotulo: 'SMILES', alvo: 'composto', campo: 'smiles', tipo: 'texto', sinonimos: ['smiles'] },
  { id: 'inchiKey', rotulo: 'InChIKey', alvo: 'composto', campo: 'inchiKey', tipo: 'texto', sinonimos: ['inchikey', 'inchi key'] },
  { id: 'nomeIupac', rotulo: 'nome IUPAC', alvo: 'composto', campo: 'nomeIupac', tipo: 'texto', sinonimos: ['nome iupac', 'nome sistematico', 'iupac'] },
  { id: 'xlogp', rotulo: 'XLogP (lipofilicidade calculada)', alvo: 'composto', campo: 'xlogp', tipo: 'numero', sinonimos: ['xlogp', 'logp', 'lipofilicidade', 'coeficiente de particao'] },
  { id: 'doadoresH', rotulo: 'doadores de ligação de hidrogênio', alvo: 'composto', campo: 'doadoresH', tipo: 'inteiro', sinonimos: ['doadores de hidrogenio', 'doadores de ligacao de hidrogenio'] },
  { id: 'aceptoresH', rotulo: 'aceptores de ligação de hidrogênio', alvo: 'composto', campo: 'aceptoresH', tipo: 'inteiro', sinonimos: ['aceptores de hidrogenio', 'aceptores de ligacao de hidrogenio'] },
  { id: 'ligacoesRotaveis', rotulo: 'ligações rotáveis', alvo: 'composto', campo: 'ligacoesRotaveis', tipo: 'inteiro', sinonimos: ['ligacoes rotaveis'] },
  { id: 'carga', rotulo: 'carga elétrica', alvo: 'composto', campo: 'carga', tipo: 'inteiro', sinonimos: ['carga eletrica', 'carga formal'] },
  { id: 'tpsa', rotulo: 'área de superfície polar (TPSA)', alvo: 'composto', campo: 'tpsa', tipo: 'numero', unidade: 'Å²', sinonimos: ['tpsa', 'area de superficie polar'] }
];

/** Compostos têm os campos calculados dentro de `propriedades`. */
const CAMPOS_EM_PROPRIEDADES = new Set(['xlogp', 'doadoresH', 'aceptoresH', 'ligacoesRotaveis', 'carga', 'tpsa']);

export const ROTULO_CATEGORIA = {
  metal_alcalino: 'metal alcalino', metal_alcalino_terroso: 'metal alcalino-terroso', metal_transicao: 'metal de transição',
  metal_pos_transicao: 'metal pós-transição', semimetal: 'semimetal (metaloide)', nao_metal: 'não metal', halogenio: 'halogênio',
  gas_nobre: 'gás nobre', lantanideo: 'lantanídeo', actinideo: 'actinídeo', desconhecida: 'propriedades químicas desconhecidas'
};
export const CATEGORIAS = Object.keys(ROTULO_CATEGORIA);

export const ROTULO_ESTADO = { solido: 'sólido', solid: 'sólido', liquido: 'líquido', liquid: 'líquido', gas: 'gás', gasoso: 'gás', desconhecido: 'desconhecido', unknown: 'desconhecido' };
export const estadoRotulo = (e) => ROTULO_ESTADO[String(e ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')] ?? (e ? String(e) : 'desconhecido');
export const estadoChave = (e) => { const r = estadoRotulo(e); return r === 'sólido' ? 'solido' : r === 'líquido' ? 'liquido' : r === 'gás' ? 'gas' : 'desconhecido'; };
export const categoriaRotulo = (c) => ROTULO_CATEGORIA[c] ?? String(c ?? '').replace(/_/g, ' ');

/**
 * Lista efetiva: a padrão, enriquecida com `regras.propriedades` do pacote. Aceita o formato do pipeline ({id: {nome, unidade, origem: "elementos.pontoFusaoK",
 * escopo, sinonimos}}, ids em snake_case): cada propriedade do pacote é casada com a padrão pelo campo de origem, e seus sinônimos são somados. Propriedades
 * do pacote sem correspondente e sem `campo` (ex.: pictogramas) são ignoradas aqui: os perigos têm tratamento próprio.
 */
export function tabelaDePropriedades(regras) {
  const doPacote = regras?.propriedades;
  const lista = Array.isArray(doPacote) ? doPacote : doPacote && typeof doPacote === 'object' ? Object.entries(doPacote).map(([id, v]) => ({ id, ...v })) : [];
  const mapa = new Map(PROPRIEDADES_PADRAO.map((p) => [p.id, { ...p }]));
  const somar = (base, sin) => { base.sinonimos = [...new Set([...(base.sinonimos ?? []), ...(Array.isArray(sin) ? sin : [])])]; };
  for (const p of lista) {
    if (!p?.id) continue;
    const alvo = p.alvo ?? p.escopo;
    let base = mapa.get(p.id);
    if (!base && p.origem) {
      const caminho = String(p.origem).split('.').slice(1); // ['pontoFusaoK'] | ['descoberta', 'ano'] | ['propriedades', 'xlogp']
      const campo = caminho[0] === 'propriedades' ? caminho[1] : caminho[0];
      base = [...mapa.values()].find((x) => (!alvo || x.alvo === alvo) && (x.campo === campo || (caminho[0] === 'propriedades' && x.id === campo)));
    }
    if (base) { somar(base, p.sinonimos); continue; }
    if (p.campo) mapa.set(p.id, { alvo: alvo ?? 'elemento', tipo: 'texto', rotulo: p.rotulo ?? p.nome ?? p.id, ...p, sinonimos: Array.isArray(p.sinonimos) ? p.sinonimos : [] });
  }
  return [...mapa.values()];
}

/** Valor bruto da propriedade no registro (elemento ou composto); undefined se ausente. */
export function valorBruto(prop, registro) {
  if (!registro) return undefined;
  const v = CAMPOS_EM_PROPRIEDADES.has(prop.id) && prop.alvo === 'composto' ? registro.propriedades?.[prop.id] : registro[prop.campo];
  return v === null ? undefined : v;
}

function emCelsius(K, ctx) {
  try { return deBase(ctx.unidades, '°C', 'temperatura', K); } catch { return null; }
}

/** Densidade em g/cm³ a partir de kg/m³, usando a tabela de unidades (kg→g e m³→cm³). */
function paraGcm3(kgm3, ctx) {
  try {
    const kgParaG = paraBase(ctx.unidades, 'kg', 'massa', 1) / paraBase(ctx.unidades, 'g', 'massa', 1);
    const m3ParaCm3 = paraBase(ctx.unidades, 'm3', 'volume', 1) / paraBase(ctx.unidades, 'cm3', 'volume', 1);
    return (kgm3 * kgParaG) / m3ParaCm3;
  } catch { return null; }
}

/**
 * Texto legível do valor, com unidades (K também em °C, kg/m³ também em g/cm³).
 * @returns {{texto: string, curto: string, numeros: number[]}|null}
 */
export function formatarValor(prop, valor, ctx) {
  if (valor === undefined || valor === null || valor === '') return null;
  switch (prop.tipo) {
    case 'temperatura': {
      const c = emCelsius(valor, ctx);
      const k = `${fmt(valor, { sig: 7 })} K`;
      return { texto: c == null ? k : `${k} (${fmt(c, { sig: 7 })} °C)`, curto: k, numeros: c == null ? [valor] : [valor, c] };
    }
    case 'densidade': {
      const g = paraGcm3(valor, ctx);
      const base = `${fmt(valor, { sig: 7 })} kg/m³`;
      return { texto: g == null ? base : `${base} (${fmt(g, { sig: 7 })} g/cm³)`, curto: base, numeros: g == null ? [valor] : [valor, g] };
    }
    case 'massaAtomica': return { texto: `${fmt(valor, { sig: 9 })} u (g/mol)`, curto: `${fmt(valor, { sig: 9 })} u`, numeros: [valor] };
    case 'massaMolar': return { texto: `${fmt(valor, { sig: 9 })} g/mol`, curto: `${fmt(valor, { sig: 9 })} g/mol`, numeros: [valor] };
    case 'numero': {
      const t = `${fmt(valor, { sig: 7 })}${prop.unidade ? ` ${prop.unidade}` : ''}`;
      return { texto: t, curto: t, numeros: [valor] };
    }
    case 'inteiro': return { texto: String(valor), curto: String(valor), numeros: [valor] };
    case 'categoria': return { texto: categoriaRotulo(valor), curto: categoriaRotulo(valor), numeros: [] };
    case 'estado': return { texto: estadoRotulo(valor), curto: estadoRotulo(valor), numeros: [] };
    case 'lista': {
      const l = (Array.isArray(valor) ? valor : [valor]).map((x) => (typeof x === 'number' && x > 0 ? `+${x}` : String(x).replace('-', '−')));
      return { texto: listar(l), curto: l.join(', '), numeros: Array.isArray(valor) ? valor.filter((x) => typeof x === 'number') : [] };
    }
    case 'descoberta': {
      const ano = valor?.ano;
      const por = valor?.por;
      const t = [ano != null ? `em ${ano}` : null, por ? `por ${por}` : null].filter(Boolean).join(' ');
      return t ? { texto: t, curto: t, numeros: ano != null ? [ano] : [] } : null;
    }
    default: return { texto: String(valor), curto: String(valor), numeros: [] };
  }
}

/** Unidades da propriedade reconhecidas na tabela (útil para validar `unidade` do pacote). */
export const unidadeConhecida = (ctx, u) => acharUnidade(ctx.unidades, u).length > 0;
