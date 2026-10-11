#!/usr/bin/env node
// Gera e assina o pacote MÍNIMO de teste em web/test/fixtures/data-quimica/ (14 elementos, 15 compostos, 3 constantes, 4 textos, regras.json e fontes.json do
// próprio pipeline, ghs_frases.json e manifesto), nos FORMATOS REAIS do pipeline (índice {porCid, nomes}, lote-001, regras com prefixosSI/fatores/afins...). NÃO é dado
// oficial: serve só para testar o site sem depender do pacote real. Assinatura com a chave de produção (secrets/data_signing_key.pem), generatedAt antigo (o app rejeita
// como "mais antigo" qualquer pacote real: ver anti-rollback em data.js). Precisa de Python com `ecdsa` (pipeline/sign.py).
//
//   node web/test/fixtures/gerar-data-quimica.mjs
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(aqui, '../../..');
const OUT = join(aqui, 'data-quimica');
rmSync(OUT, { recursive: true, force: true });

const FIXTURE = { nome: 'Fixture de teste (valores de referência: PubChem Periodic Table)', url: 'https://pubchem.ncbi.nlm.nih.gov/periodic-table/', licenca: 'domínio público (NIH)', acessadoEm: '2026-10-10' };
const el = (z, simbolo, nome, nomeEn, massaAtomica, grupo, periodo, bloco, categoria, configuracaoEletronica, o) => ({
  z, simbolo, nome, nomeEn, massaAtomica, massaAtomicaIncerteza: null, grupo, periodo, bloco, categoria, configuracaoEletronica, ...o, fontes: [FIXTURE]
});
const elementos = [
  el(1, 'H', 'Hidrogênio', 'Hydrogen', 1.008, 1, 1, 's', 'nao_metal', '1s1', { eletronegatividade: 2.2, raioAtomicoPm: 120, afinidadeEletronicaKJmol: 72.8, energiaIonizacaoKJmol: 1312.0, pontoFusaoK: 13.99, pontoEbulicaoK: 20.271, densidadeKgm3: 0.08988, estadoPadrao: 'gas', estadosOxidacao: [-1, 1], descoberta: { ano: 1766, por: 'Henry Cavendish' } }),
  el(2, 'He', 'Hélio', 'Helium', 4.0026, 18, 1, 's', 'gas_nobre', '1s2', { raioAtomicoPm: 140, energiaIonizacaoKJmol: 2372.3, pontoEbulicaoK: 4.222, densidadeKgm3: 0.1786, estadoPadrao: 'gas', estadosOxidacao: [0], descoberta: { ano: 1895, por: 'William Ramsay; Nils Langlet; Per Teodor Cleve' } }),
  el(6, 'C', 'Carbono', 'Carbon', 12.011, 14, 2, 'p', 'nao_metal', '[He] 2s2 2p2', { eletronegatividade: 2.55, raioAtomicoPm: 170, afinidadeEletronicaKJmol: 121.8, energiaIonizacaoKJmol: 1086.5, pontoFusaoK: 3823, pontoEbulicaoK: 4098, densidadeKgm3: 2267, estadoPadrao: 'solido', estadosOxidacao: [-4, -3, -2, -1, 0, 1, 2, 3, 4] }),
  el(7, 'N', 'Nitrogênio', 'Nitrogen', 14.007, 15, 2, 'p', 'nao_metal', '[He] 2s2 2p3', { eletronegatividade: 3.04, raioAtomicoPm: 155, energiaIonizacaoKJmol: 1402.3, pontoFusaoK: 63.15, pontoEbulicaoK: 77.355, densidadeKgm3: 1.2506, estadoPadrao: 'gas', estadosOxidacao: [-3, -2, -1, 1, 2, 3, 4, 5], descoberta: { ano: 1772, por: 'Daniel Rutherford' } }),
  el(8, 'O', 'Oxigênio', 'Oxygen', 15.999, 16, 2, 'p', 'nao_metal', '[He] 2s2 2p4', { eletronegatividade: 3.44, raioAtomicoPm: 152, afinidadeEletronicaKJmol: 141.0, energiaIonizacaoKJmol: 1313.9, pontoFusaoK: 54.36, pontoEbulicaoK: 90.188, densidadeKgm3: 1.429, estadoPadrao: 'gas', estadosOxidacao: [-2, -1, 0, 1, 2], descoberta: { ano: 1774, por: 'Carl Wilhelm Scheele; Joseph Priestley' } }),
  el(9, 'F', 'Flúor', 'Fluorine', 18.998, 17, 2, 'p', 'halogenio', '[He] 2s2 2p5', { eletronegatividade: 3.98, raioAtomicoPm: 147, afinidadeEletronicaKJmol: 328.2, energiaIonizacaoKJmol: 1681.0, pontoFusaoK: 53.53, pontoEbulicaoK: 85.03, densidadeKgm3: 1.696, estadoPadrao: 'gas', estadosOxidacao: [-1], descoberta: { ano: 1886, por: 'Henri Moissan' } }),
  el(11, 'Na', 'Sódio', 'Sodium', 22.99, 1, 3, 's', 'metal_alcalino', '[Ne] 3s1', { eletronegatividade: 0.93, raioAtomicoPm: 227, afinidadeEletronicaKJmol: 52.8, energiaIonizacaoKJmol: 495.8, pontoFusaoK: 370.95, pontoEbulicaoK: 1156.1, densidadeKgm3: 968, estadoPadrao: 'solido', estadosOxidacao: [-1, 1], descoberta: { ano: 1807, por: 'Humphry Davy' } }),
  el(16, 'S', 'Enxofre', 'Sulfur', 32.06, 16, 3, 'p', 'nao_metal', '[Ne] 3s2 3p4', { eletronegatividade: 2.58, raioAtomicoPm: 180, afinidadeEletronicaKJmol: 200.4, energiaIonizacaoKJmol: 999.6, pontoFusaoK: 388.36, pontoEbulicaoK: 717.87, densidadeKgm3: 2070, estadoPadrao: 'solido', estadosOxidacao: [-2, -1, 1, 2, 3, 4, 5, 6] }),
  el(17, 'Cl', 'Cloro', 'Chlorine', 35.45, 17, 3, 'p', 'halogenio', '[Ne] 3s2 3p5', { eletronegatividade: 3.16, raioAtomicoPm: 175, afinidadeEletronicaKJmol: 349.0, energiaIonizacaoKJmol: 1251.2, pontoFusaoK: 171.6, pontoEbulicaoK: 239.11, densidadeKgm3: 3.214, estadoPadrao: 'gas', estadosOxidacao: [-1, 1, 2, 3, 4, 5, 6, 7], descoberta: { ano: 1774, por: 'Carl Wilhelm Scheele' } }),
  el(20, 'Ca', 'Cálcio', 'Calcium', 40.078, 2, 4, 's', 'metal_alcalino_terroso', '[Ar] 4s2', { eletronegatividade: 1.0, raioAtomicoPm: 231, afinidadeEletronicaKJmol: 2.37, energiaIonizacaoKJmol: 589.8, pontoFusaoK: 1115, pontoEbulicaoK: 1757, densidadeKgm3: 1550, estadoPadrao: 'solido', estadosOxidacao: [2], descoberta: { ano: 1808, por: 'Humphry Davy' } }),
  el(26, 'Fe', 'Ferro', 'Iron', 55.845, 8, 4, 'd', 'metal_transicao', '[Ar] 3d6 4s2', { eletronegatividade: 1.83, raioAtomicoPm: 156, afinidadeEletronicaKJmol: 15.7, energiaIonizacaoKJmol: 762.5, pontoFusaoK: 1811, pontoEbulicaoK: 3134, densidadeKgm3: 7874, estadoPadrao: 'solido', estadosOxidacao: [-2, -1, 1, 2, 3, 4, 5, 6] }),
  el(29, 'Cu', 'Cobre', 'Copper', 63.546, 11, 4, 'd', 'metal_transicao', '[Ar] 3d10 4s1', { eletronegatividade: 1.9, raioAtomicoPm: 140, afinidadeEletronicaKJmol: 119.2, energiaIonizacaoKJmol: 745.5, pontoFusaoK: 1357.77, pontoEbulicaoK: 2835, densidadeKgm3: 8960, estadoPadrao: 'solido', estadosOxidacao: [1, 2, 3, 4] }),
  el(79, 'Au', 'Ouro', 'Gold', 196.97, 11, 6, 'd', 'metal_transicao', '[Xe] 4f14 5d10 6s1', { eletronegatividade: 2.54, raioAtomicoPm: 144, afinidadeEletronicaKJmol: 222.8, energiaIonizacaoKJmol: 890.1, pontoFusaoK: 1337.33, pontoEbulicaoK: 3129, densidadeKgm3: 19300, estadoPadrao: 'solido', estadosOxidacao: [-1, 1, 2, 3, 5] }),
  el(80, 'Hg', 'Mercúrio', 'Mercury', 200.59, 12, 6, 'd', 'metal_transicao', '[Xe] 4f14 5d10 6s2', { eletronegatividade: 2.0, raioAtomicoPm: 155, energiaIonizacaoKJmol: 1007.1, pontoFusaoK: 234.32, pontoEbulicaoK: 629.88, densidadeKgm3: 13534, estadoPadrao: 'liquido', estadosOxidacao: [1, 2] })
];

const PUBCHEM = (cid) => ({ nome: `PubChem CID ${cid} (fixture de teste)`, url: `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`, licenca: 'domínio público (NIH)', acessadoEm: '2026-10-10' });
const co = (cid, nome, formula, formulaHill, massaMolar, smiles, inchiKey, cas, nomeIupac, extra = {}) => ({
  cid, nome, ...extra, nomeIupac, sinonimos: extra.sinonimos ?? [], formula, formulaHill, massaMolar, smiles, inchiKey, cas, fontes: [PUBCHEM(cid)]
});
const GHS = (pictogramas, palavraSinal, frasesH) => ({ pictogramas, palavraSinal, frasesH, fonte: 'PubChem (ECHA C&L) — fixture de teste' });
const compostos = [
  co(962, 'Água', 'H2O', 'H2O', 18.015, 'O', 'XLYOFNOQVPJJNP-UHFFFAOYSA-N', '7732-18-5', 'oxidane', { sinonimos: ['água destilada', 'oxidano'], propriedades: { xlogp: -0.5, doadoresH: 1, aceptoresH: 1, ligacoesRotaveis: 0, carga: 0, tpsa: 0 }, classes: ['solvente'], wikidata: 'Q283' }),
  co(280, 'Dióxido de carbono', 'CO2', 'CO2', 44.009, 'C(=O)=O', 'CURLTUGMZLYLDI-UHFFFAOYSA-N', '124-38-9', 'carbon dioxide', { nomePopular: 'Gás carbônico', sinonimos: ['gás carbônico', 'anidrido carbônico', 'CO2'], ghs: GHS(['GHS04'], 'Atenção', ['H280']), propriedades: { carga: 0 }, classes: ['gas'] }),
  co(5234, 'Cloreto de sódio', 'NaCl', 'ClNa', 58.44, '[Na+].[Cl-]', 'FAPWRFPIFSIZLT-UHFFFAOYSA-M', '7647-14-5', 'sodium chloride', { nomePopular: 'Sal de cozinha', sinonimos: ['sal comum', 'sal de cozinha', 'sal'], propriedades: { carga: 0 }, classes: ['sal'] }),
  co(5793, 'Glicose', 'C6H12O6', 'C6H12O6', 180.156, 'C([C@@H]1[C@H]([C@@H]([C@H](C(O1)O)O)O)O)O', 'WQZGKKKJIJFFOK-GASJEMHNSA-N', '50-99-7', '(2R,3R,4S,5S,6R)-6-(hydroxymethyl)oxane-2,3,4,5-tetrol', { nomePopular: 'Dextrose', sinonimos: ['dextrose', 'açúcar do sangue'], propriedades: { xlogp: -2.6, doadoresH: 5, aceptoresH: 6, ligacoesRotaveis: 1, carga: 0, tpsa: 110 }, classes: ['carboidrato'] }),
  co(176, 'Ácido acético', 'C2H4O2', 'C2H4O2', 60.052, 'CC(=O)O', 'QTBSBXVTEAMEQO-UHFFFAOYSA-N', '64-19-7', 'acetic acid', { nomePopular: 'Vinagre (solução diluída)', sinonimos: ['ácido etanoico', 'ácido acético glacial'], ghs: GHS(['GHS02', 'GHS05'], 'Perigo', ['H226', 'H314']), propriedades: { xlogp: -0.2, doadoresH: 1, aceptoresH: 2, ligacoesRotaveis: 0, carga: 0, tpsa: 37.3 }, classes: ['acido_carboxilico'], definicaoChebi: 'A monocarboxylic acid that is methane in which one of the hydrogens is substituted by a carboxy group.' }),
  co(702, 'Etanol', 'C2H6O', 'C2H6O', 46.069, 'CCO', 'LFQSCWFLJHTTHZ-UHFFFAOYSA-N', '64-17-5', 'ethanol', { nomePopular: 'Álcool etílico', sinonimos: ['álcool etílico', 'álcool', 'álcool comum'], ghs: GHS(['GHS02', 'GHS07'], 'Perigo', ['H225', 'H319']), propriedades: { xlogp: -0.1, doadoresH: 1, aceptoresH: 1, ligacoesRotaveis: 0, carga: 0, tpsa: 20.2 }, classes: ['alcool', 'solvente'], definicaoChebi: { texto: 'A primary alcohol that is ethane in which one of the hydrogens is substituted by a hydroxy group.', chebi: 'CHEBI:16236', url: 'https://www.ebi.ac.uk/chebi/searchId.do?chebiId=CHEBI:16236', licenca: 'CC BY 4.0' } }),
  co(222, 'Amônia', 'NH3', 'H3N', 17.031, 'N', 'QGZKDVFQNNGYKY-UHFFFAOYSA-N', '7664-41-7', 'azane', { nomePopular: 'Amoníaco', sinonimos: ['amoníaco', 'amonia', 'gás amônia'], ghs: GHS(['GHS04', 'GHS05', 'GHS06', 'GHS09'], 'Perigo', ['H221', 'H280', 'H314', 'H331', 'H400']), propriedades: { xlogp: -0.5, doadoresH: 1, aceptoresH: 1, ligacoesRotaveis: 0, carga: 0, tpsa: 1 }, classes: ['base'] }),
  co(2244, 'Ácido acetilsalicílico', 'C9H8O4', 'C9H8O4', 180.159, 'CC(=O)OC1=CC=CC=C1C(=O)O', 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N', '50-78-2', '2-acetyloxybenzoic acid', { nomePopular: 'Aspirina', sinonimos: ['aspirina', 'AAS'], ghs: GHS(['GHS07'], 'Atenção', ['H302', 'H315', 'H319']), propriedades: { xlogp: 1.2, doadoresH: 1, aceptoresH: 4, ligacoesRotaveis: 3, carga: 0, tpsa: 63.6 }, classes: ['acido_carboxilico', 'ester', 'aromatico'], wikidata: 'Q18216' }),
  co(1118, 'Ácido sulfúrico', 'H2SO4', 'H2O4S', 98.072, 'OS(=O)(=O)O', 'QAOWNCQODCNURD-UHFFFAOYSA-N', '7664-93-9', 'sulfuric acid', { sinonimos: ['óleo de vitríolo', 'vitríolo'], ghs: GHS(['GHS05'], 'Perigo', ['H290', 'H314']), propriedades: { doadoresH: 2, aceptoresH: 4, ligacoesRotaveis: 0, carga: 0, tpsa: 94.8 }, classes: ['acido_forte'], icscBuscaUrl: 'https://www.ilo.org/dyn/icsc/showcard.listcards3?p_lang=pt&p_cas=7664-93-9' }),
  co(14798, 'Hidróxido de sódio', 'NaOH', 'HNaO', 39.997, '[OH-].[Na+]', 'HEMHJVSKTPXQMS-UHFFFAOYSA-M', '1310-73-2', 'sodium hydroxide', { nomePopular: 'Soda cáustica', sinonimos: ['soda cáustica', 'soda', 'lixívia'], ghs: GHS(['GHS05'], 'Perigo', ['H290', 'H314']), propriedades: { carga: 0 }, classes: ['base_forte'] }),
  co(313, 'Ácido clorídrico', 'HCl', 'ClH', 36.458, 'Cl', 'VEXZGXHMUGYJMC-UHFFFAOYSA-N', '7647-01-0', 'chlorane', { nomePopular: 'Ácido muriático', sinonimos: ['ácido muriático', 'cloreto de hidrogênio', 'muriático'], ghs: GHS(['GHS05', 'GHS07'], 'Perigo', ['H290', 'H314', 'H335']), propriedades: { doadoresH: 1, aceptoresH: 0, ligacoesRotaveis: 0, carga: 0, tpsa: 0 }, classes: ['acido_forte'] }),
  co(297, 'Metano', 'CH4', 'CH4', 16.043, 'C', 'VNWKTOKETHGBQD-UHFFFAOYSA-N', '74-82-8', 'methane', { nomePopular: 'Gás natural (principal componente)', sinonimos: ['gás metano', 'hidreto de carbono'], ghs: GHS(['GHS02', 'GHS04'], 'Perigo', ['H220', 'H280']), propriedades: { xlogp: 1.1, doadoresH: 0, aceptoresH: 0, ligacoesRotaveis: 0, carga: 0, tpsa: 0 }, classes: ['alcano', 'gas'] }),
  co(241, 'Benzeno', 'C6H6', 'C6H6', 78.114, 'C1=CC=CC=C1', 'UHOVQNZJYSORNB-UHFFFAOYSA-N', '71-43-2', 'benzene', { sinonimos: ['benzol'], ghs: GHS(['GHS02', 'GHS07', 'GHS08'], 'Perigo', ['H225', 'H304', 'H315', 'H319', 'H340', 'H350']), propriedades: { xlogp: 2.1, doadoresH: 0, aceptoresH: 0, ligacoesRotaveis: 0, carga: 0, tpsa: 0 }, classes: ['hidrocarboneto', 'aromatico'] }),
  co(6371, 'Fosgênio', 'COCl2', 'CCl2O', 98.916, 'C(=O)(Cl)Cl', 'YGYAWVDWMABLBF-UHFFFAOYSA-N', '75-44-5', 'carbonyl dichloride', { sinonimos: ['cloreto de carbonila', 'dicloreto de carbonila'], ghs: GHS(['GHS04', 'GHS05', 'GHS06'], 'Perigo', ['H280', 'H314', 'H330']), propriedades: { doadoresH: 0, aceptoresH: 1, ligacoesRotaveis: 0, carga: 0, tpsa: 17.1 }, classes: ['organoclorado'] }),
  co(23665760, 'Hipoclorito de sódio', 'NaOCl', 'ClNaO', 74.439, '[O-]Cl.[Na+]', 'SUKJFIGYRHOWBL-UHFFFAOYSA-N', '7681-52-9', 'sodium hypochlorite', { nomePopular: 'Água sanitária', sinonimos: ['água sanitária', 'alvejante', 'cloro líquido', 'hipoclorito'], ghs: GHS(['GHS05', 'GHS09'], 'Perigo', ['H314', 'H400']), propriedades: { carga: 0 }, classes: ['oxidante'] })
];

// ------------------------------------------------------------------------------------------------ formatos REAIS do pipeline (regras, fontes, índice, ghs_frases)
// regras.json e fontes.json vêm do próprio pipeline (pipeline/regras.py e pipeline/fontes.py), para a fixture nunca divergir dele; as frases H vêm de dataset/ghs_pt.py.
const py = (codigo) => JSON.parse(execFileSync('python', ['-I', '-c', `import sys, json\nsys.path.insert(0, ${JSON.stringify(join(RAIZ, 'pipeline'))})\nsys.path.insert(0, ${JSON.stringify(join(RAIZ, 'dataset'))})\n${codigo}`], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, maxBuffer: 1 << 26 }));
const HOJE = '2026-10-10';
const regras = py(`import regras\nprint(json.dumps(regras.montar('${HOJE}'), ensure_ascii=False))`);
// extensão do aplicativo (não existe no pipeline): incompatibilidades conhecidas, para o teste da resposta "por que não misturar…"
regras.incompatibilidades = [
  { a: 'hipoclorito de sódio', b: 'amônia', motivo: 'Misturar água sanitária (hipoclorito) com amoníaco libera cloraminas, gases tóxicos que irritam e queimam as vias respiratórias.', fonte: 'autoria própria (fixture de teste)' },
  { a: 'hipoclorito de sódio', b: 'ácido clorídrico', motivo: 'Misturar água sanitária com um ácido libera cloro gasoso, que é tóxico.', fonte: 'autoria própria (fixture de teste)' }
];
const fontes = py(`import fontes\nprint(json.dumps(fontes.gerar(None, '${HOJE}'), ensure_ascii=False))`);
const cas = [...new Set(compostos.map((c) => c.cas).filter(Boolean))];
const urlsIcsc = py(`import coleta_icsc\nprint(json.dumps({c: coleta_icsc.url_busca_cas(c) for c in ${JSON.stringify(cas)}}))`);
for (const c of compostos) if (c.cas) c.icscBuscaUrl = urlsIcsc[c.cas];
const ETANOL = compostos.find((c) => c.cid === 702);
const ACETICO = compostos.find((c) => c.cid === 176);
ETANOL.definicaoChebi = { texto: 'A primary alcohol that is ethane in which one of the hydrogens is substituted by a hydroxy group.', chebiId: 'CHEBI:16236', licenca: 'CC BY 4.0' };
ACETICO.definicaoChebi = { texto: 'A monocarboxylic acid that is methane in which one of the hydrogens is substituted by a carboxy group.', chebiId: 'CHEBI:15366', licenca: 'CC BY 4.0' };

const ghsUsados = [...new Set(compostos.flatMap((c) => c.ghs?.frasesH ?? []))].sort();
const ghsPt = py('import ghs_pt\nprint(json.dumps({"frases": ghs_pt.FRASES_H, "pict": {k: list(v) for k, v in ghs_pt.PICTOGRAMAS.items()}}, ensure_ascii=False))');
const ghsFrases = {
  versao: 1,
  descricao: 'Frases de perigo (H/EUH) em português do Regulamento (CE) n.º 1272/2008 (CLP), Anexo III (fixture de teste, textos de dataset/ghs_pt.py).',
  frasesH: Object.fromEntries(ghsUsados.map((c) => [c, { texto: ghsPt.frases[c] }])),
  usadosSemTexto: [],
  todasAsFrases: ghsPt.frases,
  pictogramas: ghsPt.pict,
  palavrasSinal: ['Perigo', 'Atenção'],
  fontes: [{ nome: 'Regulamento (CE) n.º 1272/2008 (CLP) — EUR-Lex', url: 'https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:32008R1272', licenca: 'reutilização livre da legislação (EUR-Lex)', acessadoEm: HOJE }]
};

// índice no formato do pipeline (coleta_compostos.para_lotes): porCid + nomes normalizados (nome, popular, IUPAC, sinônimos, fórmula, fórmula de Hill)
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const LOTE = 'lote-001';
const nomesSet = new Set();
for (const c of compostos) for (const n of [c.nome, c.nomePopular, c.nomeIupac, ...(c.sinonimos ?? []), c.formula, c.formulaHill]) if (n) nomesSet.add(`${norm(n)}\u0000${c.cid}`);
const indice = {
  porCid: Object.fromEntries(compostos.map((c) => [String(c.cid), LOTE])),
  nomes: [...nomesSet].sort().map((x) => { const [n, cid] = x.split('\u0000'); return [n, Number(cid)]; }),
  lotes: [LOTE]
};

const constantes = {
  constantes: [
    { id: 'R', simbolo: 'R', nome: 'Constante universal dos gases', nomeEn: 'molar gas constant', valor: 8.31446261815324, valorTexto: '8.314462618...', exata: true, unidade: 'J mol⁻¹ K⁻¹' },
    { id: 'N_A', simbolo: 'N_A', nome: 'Constante de Avogadro', nomeEn: 'Avogadro constant', valor: 6.02214076e23, valorTexto: '6.02214076e23', exata: true, unidade: 'mol⁻¹' },
    { id: 'F', simbolo: 'F', nome: 'Constante de Faraday', nomeEn: 'Faraday constant', valor: 96485.33212331001, valorTexto: '96485.33212...', exata: true, unidade: 'C mol⁻¹' }
  ]
};

const FONTE_TESTE = { nome: 'Fixture de teste (texto escrito para os testes)', acessadoEm: HOJE };
const REF_TEXTO = (id, fonte, licenca, url, titulo, textoPt, palavrasChave, extra = {}) => ({
  id, fonte, licenca, url, capitulo: '', secao: titulo, titulo, textoOriginal: textoPt, textoPt, traducao: 'sem tradução (texto original em português)', idioma: 'pt', palavrasChave,
  entidades: { elementos: [], compostos: [] }, fontes: [{ ...FONTE_TESTE, nome: `${fonte} (fixture de teste)`, url, licenca }], ...extra
});
const textos = [
  { dir: 'wikipedia-pt', arq: 'mol.json', t: REF_TEXTO('wikipedia-pt-mol', 'Wikipédia em português', 'CC BY-SA 4.0', 'https://pt.wikipedia.org/wiki/Mol', 'Mol', 'O mol é a unidade do SI para a quantidade de matéria. Um mol contém exatamente o número de Avogadro de entidades elementares, como átomos, moléculas ou íons.', ['mol', 'quantidade de matéria', 'avogadro']) },
  { dir: 'wikipedia-pt', arq: 'ph.json', t: REF_TEXTO('wikipedia-pt-ph', 'Wikipédia em português', 'CC BY-SA 4.0', 'https://pt.wikipedia.org/wiki/PH', 'pH', 'O pH de uma solução é o logaritmo decimal negativo da atividade dos íons hidrogênio, que equivale aproximadamente à sua concentração.', ['ph', 'acidez', 'logaritmo', 'íons hidrogênio']) },
  { dir: 'gold-book', arq: 'E01990.json', t: REF_TEXTO('gold-book-eletronegatividade', 'IUPAC Gold Book', 'CC BY-SA 4.0', 'https://doi.org/10.1351/goldbook.E01990', 'Eletronegatividade', 'Eletronegatividade é a tendência de um átomo de atrair elétrons para si numa ligação química.', ['eletronegatividade', 'ligação química'], { traducao: 'automática, revisada: não' }) },
  // registro de definição do ChEBI (em inglês, sem tradução): fica fora do retrieval de conceitos, como no pipeline
  { dir: 'chebi', arq: '16236.json', t: { id: 'chebi-16236', fonte: 'ChEBI', licenca: 'CC BY 4.0', url: 'https://www.ebi.ac.uk/chebi/searchId.do?chebiId=CHEBI:16236', capitulo: '', secao: 'Definição', titulo: 'Etanol', textoOriginal: ETANOL.definicaoChebi.texto, textoPt: null, traducao: 'pendente', idioma: 'en', palavrasChave: ['etanol', 'C2H6O'], entidades: { elementos: [], compostos: [702] }, fontes: [{ nome: 'ChEBI CHEBI:16236', url: 'https://www.ebi.ac.uk/chebi/searchId.do?chebiId=CHEBI:16236', licenca: 'CC BY 4.0', acessadoEm: HOJE }] } }
];

// ------------------------------------------------------------------------------------------------ gravação
const json = (obj) => JSON.stringify(obj, null, 1) + '\n';
const arquivos = {
  'elementos.json': json(elementos),
  'regras.json': json(regras),
  'constantes.json': json(constantes),
  'fontes.json': json(fontes),
  'ghs_frases.json': json(ghsFrases),
  'compostos/index.json': json(indice),
  [`compostos/${LOTE}.json`]: json(compostos),
  ...Object.fromEntries(textos.map((x) => [`textos/${x.dir}/${x.arq}`, json(x.t)]))
};
const files = {};
for (const [p, conteudo] of Object.entries(arquivos).sort(([a], [b]) => (a < b ? -1 : 1))) {
  const buf = Buffer.from(conteudo, 'utf8');
  mkdirSync(dirname(join(OUT, p)), { recursive: true });
  writeFileSync(join(OUT, p), buf);
  files[p] = { bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
}
const licencas = {};
for (const f of fontes) (licencas[f.licenca] ??= []).push(f.id);
const manifesto = {
  version: 'fixture-1',
  generatedAt: '2026-01-01T00:00:00Z',
  schemaVersion: 1,
  files,
  sources: fontes.map((f) => ({ id: f.id, nome: f.nome, url: f.url, licenca: f.licenca, uso: f.uso, acessadoEm: f.acessadoEm })),
  licencas: Object.entries(licencas).map(([licenca, ids]) => ({ licenca, fontes: ids })),
  contagens: { elementos: elementos.length, compostos: compostos.length, constantes: constantes.constantes.length, textos: textos.length },
  atribuicao: 'Pacote MÍNIMO de teste (fixture): não é dado oficial.',
  cliente: { pollIntervalMinutes: 10080, baseUrl: '/quimica/data/', nlu: { endpoint: '/quimica/api/nlu' }, ask: { enabled: false }, melhoria: { enabled: false } }
};
writeFileSync(join(OUT, 'manifest.json'), json(manifesto));
writeFileSync(join(OUT, '.gitattributes'), '* -text\n');
execFileSync('python', ['-I', join(RAIZ, 'pipeline', 'sign.py'), 'sign', join(OUT, 'manifest.json'), '--private', join(RAIZ, 'secrets', 'data_signing_key.pem')], { stdio: 'inherit', cwd: RAIZ });
execFileSync('python', ['-I', join(RAIZ, 'pipeline', 'sign.py'), 'verify', join(OUT, 'manifest.json'), '--public', join(RAIZ, 'pipeline', 'data_signing_public.pem')], { stdio: 'inherit', cwd: RAIZ });
console.log(`Fixture gerada em ${OUT}: ${Object.keys(files).length} arquivos, ${readFileSync(join(OUT, 'manifest.sig'), 'utf8').length} bytes de assinatura`);
