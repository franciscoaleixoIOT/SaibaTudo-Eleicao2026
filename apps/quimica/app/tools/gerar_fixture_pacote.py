# -*- coding: utf-8 -*-
"""
Gera o pacote de FIXTURE usado pelos testes do app Android e, enquanto o pacote real (data/quimica/) não existe,
embutido no APK de depuração: 10 elementos, 20 compostos (SMILES reais), constantes, regras, 3 trechos,
fontes e um manifesto ASSINADO com a chave privada do projeto (secrets/data_signing_key.pem).

Os valores são de uso didático/teste (fixture), com a forma do contrato docs/DATA_CONTRACT.md. O app NÃO depende
destes números: com o pacote real publicado em data/quimica/ o Gradle passa a embutir o pacote real.

Uso (da raiz do repositório):
    python app/tools/gerar_fixture_pacote.py
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SAIDA = RAIZ / "app" / "src" / "test" / "resources" / "data-quimica"
HOJE = "2026-10-10"

FONTE_FIXTURE = {"nome": "Fixture de testes do app (valores conferidos; não é o pacote real)",
                 "url": "https://saibatudo.net/quimica/", "licenca": "uso em testes", "acessadoEm": HOJE}
FONTE_PUBCHEM_TP = {"nome": "PubChem Periodic Table", "url": "https://pubchem.ncbi.nlm.nih.gov/periodic-table/",
                    "licenca": "domínio público (NIH)", "acessadoEm": HOJE}


def f_pubchem(cid):
    return {"nome": f"PubChem CID {cid}", "url": f"https://pubchem.ncbi.nlm.nih.gov/compound/{cid}",
            "licenca": "domínio público (NIH)", "acessadoEm": HOJE}


# (z, símbolo, nome, nomeEn, massa, grupo, período, bloco, categoria, configuração, EN, raio pm, AE kJ/mol, EI kJ/mol,
#  fusão K, ebulição K, densidade kg/m3, estado, oxidação, descoberta)
ELEMENTOS = [
    (1, "H", "Hidrogênio", "Hydrogen", 1.008, 1, 1, "s", "nao_metal", "1s1", 2.20, 120, 72.8, 1312.0, 13.99, 20.271, 0.0899, "gas", [-1, 1], (1766, "Henry Cavendish")),
    (6, "C", "Carbono", "Carbon", 12.011, 14, 2, "p", "nao_metal", "[He] 2s2 2p2", 2.55, 170, 121.8, 1086.5, None, None, 2267, "solido", [-4, -3, -2, -1, 0, 1, 2, 3, 4], None),
    (7, "N", "Nitrogênio", "Nitrogen", 14.007, 15, 2, "p", "nao_metal", "[He] 2s2 2p3", 3.04, 155, None, 1402.3, 63.15, 77.355, 1.2506, "gas", [-3, -2, -1, 1, 2, 3, 4, 5], (1772, "Daniel Rutherford")),
    (8, "O", "Oxigênio", "Oxygen", 15.999, 16, 2, "p", "nao_metal", "[He] 2s2 2p4", 3.44, 152, 141.0, 1313.9, 54.36, 90.188, 1.429, "gas", [-2, -1, 0, 1, 2], (1774, "Carl Wilhelm Scheele; Joseph Priestley")),
    (11, "Na", "Sódio", "Sodium", 22.990, 1, 3, "s", "metal_alcalino", "[Ne] 3s1", 0.93, 227, 52.8, 495.8, 370.95, 1156.09, 968, "solido", [-1, 1], (1807, "Humphry Davy")),
    (16, "S", "Enxofre", "Sulfur", 32.06, 16, 3, "p", "nao_metal", "[Ne] 3s2 3p4", 2.58, 180, 200.4, 999.6, 388.36, 717.87, 2070, "solido", [-2, 2, 4, 6], None),
    (17, "Cl", "Cloro", "Chlorine", 35.45, 17, 3, "p", "halogenio", "[Ne] 3s2 3p5", 3.16, 175, 349.0, 1251.2, 171.6, 239.11, 3.2, "gas", [-1, 1, 3, 5, 7], (1774, "Carl Wilhelm Scheele")),
    (20, "Ca", "Cálcio", "Calcium", 40.078, 2, 4, "s", "metal_alcalino_terroso", "[Ar] 4s2", 1.00, 231, None, 589.8, 1115, 1757, 1550, "solido", [2], (1808, "Humphry Davy")),
    (26, "Fe", "Ferro", "Iron", 55.845, 8, 4, "d", "metal_transicao", "[Ar] 3d6 4s2", 1.83, 194, 15.7, 762.5, 1811, 3134, 7874, "solido", [2, 3], None),
    (29, "Cu", "Cobre", "Copper", 63.546, 11, 4, "d", "metal_transicao", "[Ar] 3d10 4s1", 1.90, 140, 119.2, 745.5, 1357.77, 2835, 8960, "solido", [1, 2], None),
]

# cid, nome PT, popular, IUPAC, sinônimos, fórmula, Hill, massa molar, massa exata, SMILES, InChIKey, CAS, props, ghs, classes, icsc
# ghs = (pictogramas, palavra de sinal, frases H) ou None
COMPOSTOS = [
    (962, "Água", None, "oxidane", ["agua", "water", "H2O", "óxido de hidrogênio"], "H2O", "H2O", 18.015, 18.0106, "O",
     "XLYOFNOQVPJJNP-UHFFFAOYSA-N", "7732-18-5", {"carga": 0, "doadoresH": 1, "aceptoresH": 1, "tpsa": 1.0, "pontoFusaoK": 273.15, "pontoEbulicaoK": 373.15, "densidadeKgm3": 997.0}, None, ["inorganico", "solvente"], None),
    (280, "Dióxido de carbono", "Gás carbônico", "carbon dioxide", ["co2", "gás carbônico", "anidrido carbônico", "carbon dioxide"], "CO2", "CO2", 44.009, 43.9898, "C(=O)=O",
     "CURLTUGMZLYLDI-UHFFFAOYSA-N", "124-38-9", {"carga": 0, "doadoresH": 0, "aceptoresH": 2, "tpsa": 34.1}, (["GHS04"], "Atenção", ["H280"]), ["inorganico", "gas"], None),
    (5234, "Cloreto de sódio", "Sal de cozinha", "sodium chloride", ["sal de cozinha", "sal comum", "sodium chloride", "NaCl", "halita"], "NaCl", "ClNa", 58.44, 57.9586, "[Na+].[Cl-]",
     "FAPWRFPIFSIZLT-UHFFFAOYSA-M", "7647-14-5", {"carga": 0, "pontoFusaoK": 1074, "pontoEbulicaoK": 1738, "densidadeKgm3": 2160}, None, ["sal", "ionico"], None),
    (313, "Ácido clorídrico", "Ácido muriático", "hydrochloric acid", ["hcl", "ácido muriático", "cloreto de hidrogênio", "hydrogen chloride"], "HCl", "ClH", 36.46, 35.9767, "Cl",
     "VEXZGXHMUGYJMC-UHFFFAOYSA-N", "7647-01-0", {"carga": 0, "doadoresH": 1, "aceptoresH": 0, "tpsa": 0.0}, (["GHS05", "GHS07"], "Perigo", ["H290", "H314", "H335"]), ["acido", "inorganico"], None),
    (14798, "Hidróxido de sódio", "Soda cáustica", "sodium hydroxide", ["naoh", "soda cáustica", "soda caustica", "sodium hydroxide", "lixívia"], "NaOH", "HNaO", 39.997, 39.9925, "[OH-].[Na+]",
     "HEMHJVSKTPXQMS-UHFFFAOYSA-M", "1310-73-2", {"carga": 0, "pontoFusaoK": 596, "pontoEbulicaoK": 1661, "densidadeKgm3": 2130}, (["GHS05"], "Perigo", ["H290", "H314"]), ["base", "inorganico"], None),
    (297, "Metano", "Gás natural", "methane", ["ch4", "gás natural", "methane", "gás do lixo"], "CH4", "CH4", 16.043, 16.0313, "C",
     "VNWKTOKETHGBQD-UHFFFAOYSA-N", "74-82-8", {"carga": 0, "doadoresH": 0, "aceptoresH": 0, "tpsa": 0.0, "pontoFusaoK": 90.7, "pontoEbulicaoK": 111.7}, (["GHS02", "GHS04"], "Perigo", ["H220", "H280"]), ["hidrocarboneto", "alcano"], None),
    (702, "Etanol", "Álcool etílico", "ethanol", ["álcool etílico", "alcool etilico", "álcool", "ethanol", "ethyl alcohol", "C2H5OH"], "C2H6O", "C2H6O", 46.07, 46.0419, "CCO",
     "LFQSCWFLJHTTHZ-UHFFFAOYSA-N", "64-17-5", {"xlogp": -0.1, "doadoresH": 1, "aceptoresH": 1, "ligacoesRotaveis": 0, "carga": 0, "tpsa": 20.2, "pontoFusaoK": 159.05, "pontoEbulicaoK": 351.44, "densidadeKgm3": 789.0},
     (["GHS02", "GHS07"], "Perigo", ["H225", "H319"]), ["alcool", "solvente"], True),
    (5793, "Glicose", "Açúcar do sangue", "(3R,4S,5S,6R)-6-(hydroxymethyl)oxane-2,3,4,5-tetrol", ["dextrose", "glucose", "D-glicose", "D-glucose"], "C6H12O6", "C6H12O6", 180.16, 180.0634,
     "C([C@@H]1[C@H]([C@@H]([C@H](C(O1)O)O)O)O)O", "WQZGKKKJIJFFOK-GASJEMHNSA-N", "50-99-7", {"xlogp": -2.6, "doadoresH": 5, "aceptoresH": 6, "ligacoesRotaveis": 1, "carga": 0, "tpsa": 110.0}, None, ["carboidrato"], None),
    (2244, "Ácido acetilsalicílico", "Aspirina", "2-acetyloxybenzoic acid", ["aspirina", "AAS", "aspirin", "acetylsalicylic acid"], "C9H8O4", "C9H8O4", 180.16, 180.0423, "CC(=O)OC1=CC=CC=C1C(=O)O",
     "BSYNRYMUTXBXSQ-UHFFFAOYSA-N", "50-78-2", {"xlogp": 1.2, "doadoresH": 1, "aceptoresH": 4, "ligacoesRotaveis": 3, "carga": 0, "tpsa": 63.6}, (["GHS07"], "Atenção", ["H302", "H315", "H319"]), ["acido_carboxilico", "ester", "aromatico"], None),
    (1118, "Ácido sulfúrico", "Óleo de vitríolo", "sulfuric acid", ["h2so4", "sulfuric acid", "vitríolo", "ácido de bateria"], "H2SO4", "H2O4S", 98.08, 97.9674, "OS(=O)(=O)O",
     "QAOWNCQODCNURD-UHFFFAOYSA-N", "7664-93-9", {"carga": 0, "doadoresH": 2, "aceptoresH": 4, "tpsa": 83.0}, (["GHS05"], "Perigo", ["H290", "H314"]), ["acido", "inorganico"], None),
    (222, "Amônia", None, "azane", ["amoníaco", "amoniaco", "nh3", "ammonia"], "NH3", "H3N", 17.031, 17.0265, "N",
     "QGZKDVFQNNGYKY-UHFFFAOYSA-N", "7664-41-7", {"carga": 0, "doadoresH": 1, "aceptoresH": 1, "tpsa": 1.0}, None, ["base", "inorganico", "gas"], None),
    (241, "Benzeno", None, "benzene", ["benzol", "benzene", "C6H6"], "C6H6", "C6H6", 78.11, 78.047, "C1=CC=CC=C1",
     "UHOVQNZJYSORNB-UHFFFAOYSA-N", "71-43-2", {"xlogp": 2.1, "doadoresH": 0, "aceptoresH": 0, "ligacoesRotaveis": 0, "carga": 0, "tpsa": 0.0, "pontoFusaoK": 278.7, "pontoEbulicaoK": 353.2, "densidadeKgm3": 876.5},
     (["GHS02", "GHS07", "GHS08"], "Perigo", ["H225", "H304", "H315", "H319", "H340", "H350", "H372"]), ["aromatico", "hidrocarboneto", "solvente"], None),
    (24462, "Sulfato de cobre(II)", "Vitríolo azul", "copper(2+) sulfate", ["sulfato cúprico", "cuso4", "copper sulfate", "sulfato de cobre"], "CuSO4", "CuO4S", 159.6, 158.8813, "[O-]S(=O)(=O)[O-].[Cu+2]",
     "ARUVKPQLZAKDPS-UHFFFAOYSA-L", "7758-98-7", {"carga": 0}, (["GHS07", "GHS09"], "Atenção", ["H302", "H315", "H319", "H410"]), ["sal", "ionico"], None),
    (10112, "Carbonato de cálcio", "Calcário", "calcium carbonate", ["caco3", "calcário", "giz", "calcita", "calcium carbonate"], "CaCO3", "CCaO3", 100.09, 99.9473, "C(=O)([O-])[O-].[Ca+2]",
     "VTYYLEPIZMXCLO-UHFFFAOYSA-L", "471-34-1", {"carga": 0}, None, ["sal", "ionico"], None),
    (14777, "Hidróxido de cálcio", "Cal hidratada", "calcium dihydroxide", ["cal hidratada", "cal apagada", "ca(oh)2", "calcium hydroxide"], "Ca(OH)2", "CaH2O2", 74.09, 73.9681, "[OH-].[OH-].[Ca+2]",
     "AXCZMVOFGPJBDE-UHFFFAOYSA-L", "1305-62-0", {"carga": 0}, (["GHS05", "GHS07"], "Perigo", ["H315", "H318", "H335"]), ["base", "inorganico"], None),
    (180, "Acetona", "Propanona", "propan-2-one", ["propanona", "dimetilcetona", "acetone", "removedor de esmalte"], "C3H6O", "C3H6O", 58.08, 58.0419, "CC(=O)C",
     "CSCPPACGZOOCGX-UHFFFAOYSA-N", "67-64-1", {"xlogp": -0.2, "doadoresH": 0, "aceptoresH": 1, "ligacoesRotaveis": 0, "carga": 0, "tpsa": 17.1, "pontoFusaoK": 178.5, "pontoEbulicaoK": 329.2, "densidadeKgm3": 784.0},
     (["GHS02", "GHS07"], "Perigo", ["H225", "H319", "H336"]), ["cetona", "solvente"], None),
    (176, "Ácido acético", "Ácido do vinagre", "acetic acid", ["ácido etanoico", "acido acetico", "vinagre", "acetic acid", "ch3cooh"], "C2H4O2", "C2H4O2", 60.05, 60.0211, "CC(=O)O",
     "QTBSBXVTEAMEQO-UHFFFAOYSA-N", "64-19-7", {"xlogp": -0.2, "doadoresH": 1, "aceptoresH": 2, "ligacoesRotaveis": 0, "carga": 0, "tpsa": 37.3, "pontoFusaoK": 289.8, "pontoEbulicaoK": 391.2, "densidadeKgm3": 1049.0},
     (["GHS02", "GHS05"], "Perigo", ["H226", "H314"]), ["acido_carboxilico"], None),
    (2519, "Cafeína", None, "1,3,7-trimethylpurine-2,6-dione", ["cafeina", "caffeine", "trimetilxantina"], "C8H10N4O2", "C8H10N4O2", 194.19, 194.0804, "CN1C=NC2=C1C(=O)N(C(=O)N2C)C",
     "RYYVLZVUVIJVGH-UHFFFAOYSA-N", "58-08-2", {"xlogp": -0.1, "doadoresH": 0, "aceptoresH": 3, "ligacoesRotaveis": 0, "carga": 0, "tpsa": 58.4}, (["GHS07"], "Atenção", ["H302"]), ["alcaloide", "aromatico"], None),
    (977, "Oxigênio (gás)", "Gás oxigênio", "molecular oxygen", ["o2", "oxigênio gasoso", "dioxigênio", "oxygen", "dioxygen"], "O2", "O2", 31.998, 31.9898, "O=O",
     "MYMOFIZGZYHOMD-UHFFFAOYSA-N", "7782-44-7", {"carga": 0, "pontoFusaoK": 54.36, "pontoEbulicaoK": 90.188}, (["GHS03", "GHS04"], "Perigo", ["H270", "H280"]), ["inorganico", "gas"], None),
    (24826, "Sulfato de ferro(III)", "Sulfato férrico", "iron(3+) trisulfate", ["sulfato férrico", "fe2(so4)3", "ferric sulfate", "iron(III) sulfate"], "Fe2(SO4)3", "Fe2O12S3", 399.9, 399.7251,
     "[O-]S(=O)(=O)[O-].[O-]S(=O)(=O)[O-].[O-]S(=O)(=O)[O-].[Fe+3].[Fe+3]", None, "10028-22-5", {"carga": 0}, None, ["sal", "ionico"], None),
]

CONSTANTES = [
    ("R", "Constante molar dos gases", "R", 8.314462618, "J mol-1 K-1", 0.0),
    ("NA", "Constante de Avogadro", "NA", 6.02214076e23, "mol-1", 0.0),
    ("kB", "Constante de Boltzmann", "kB", 1.380649e-23, "J K-1", 0.0),
    ("F", "Constante de Faraday", "F", 96485.33212, "C mol-1", 0.0),
    ("h", "Constante de Planck", "h", 6.62607015e-34, "J s", 0.0),
    ("c", "Velocidade da luz no vácuo", "c", 299792458, "m s-1", 0.0),
]

# SI e unidades de uso corrente (fator para a unidade-base da grandeza; base = valor * fator + offset)
UNIDADES = [
    ("temperatura", "K", "kelvin", 1, 0, ["k"]),
    ("temperatura", "°C", "grau Celsius", 1, 273.15, ["c", "ºc", "graus celsius", "celsius", "°c"]),
    ("temperatura", "°F", "grau Fahrenheit", 5 / 9, 255.3722222222222, ["f", "ºf", "fahrenheit", "°f"]),
    ("pressao", "Pa", "pascal", 1, 0, ["pa"]),
    ("pressao", "kPa", "quilopascal", 1000, 0, ["kpa"]),
    ("pressao", "bar", "bar", 100000, 0, ["bar"]),
    ("pressao", "atm", "atmosfera padrão", 101325, 0, ["atmosfera", "atmosferas"]),
    ("pressao", "mmHg", "milímetro de mercúrio", 133.322387415, 0, ["torr"]),
    ("volume", "m³", "metro cúbico", 1, 0, ["m3", "metro cubico", "metros cubicos"]),
    ("volume", "L", "litro", 0.001, 0, ["l", "litro", "litros"]),
    ("volume", "mL", "mililitro", 1e-06, 0, ["ml", "mililitro", "mililitros", "cm³", "cm3"]),
    ("massa", "kg", "quilograma", 1, 0, ["kg", "quilo", "quilos", "quilograma", "quilogramas"]),
    ("massa", "g", "grama", 0.001, 0, ["g", "grama", "gramas"]),
    ("massa", "mg", "miligrama", 1e-06, 0, ["mg", "miligrama", "miligramas"]),
    ("energia", "J", "joule", 1, 0, ["j", "joule", "joules"]),
    ("energia", "kJ", "quilojoule", 1000, 0, ["kj", "quilojoule", "quilojoules"]),
    ("energia", "cal", "caloria", 4.184, 0, ["caloria", "calorias"]),
    ("energia", "kcal", "quilocaloria", 4184, 0, ["kcal", "quilocaloria", "quilocalorias"]),
    ("quantidade", "mol", "mol", 1, 0, ["mols", "mole"]),
    ("quantidade", "mmol", "milimol", 0.001, 0, ["mmol", "milimol", "milimols"]),
    ("concentracao", "mol/L", "mol por litro", 1, 0, ["m", "molar", "mol/l", "mol l-1", "mol por litro"]),
    ("concentracao", "mmol/L", "milimol por litro", 0.001, 0, ["mmol/l"]),
]

PROPRIEDADES = [
    ("massaMolar", "Massa molar", "massaMolar", "composto", "g/mol", ["massa molar", "massa molecular", "peso molecular"]),
    ("massaAtomica", "Massa atômica", "massaAtomica", "elemento", "u", ["massa atomica", "peso atomico"]),
    ("pontoFusaoK", "Ponto de fusão", "pontoFusaoK", "ambos", "K", ["ponto de fusao", "temperatura de fusao", "fusao"]),
    ("pontoEbulicaoK", "Ponto de ebulição", "pontoEbulicaoK", "ambos", "K", ["ponto de ebulicao", "temperatura de ebulicao", "ebulicao"]),
    ("densidadeKgm3", "Densidade", "densidadeKgm3", "ambos", "kg/m³", ["densidade", "massa especifica"]),
    ("eletronegatividade", "Eletronegatividade", "eletronegatividade", "elemento", None, ["eletronegatividade"]),
    ("raioAtomicoPm", "Raio atômico", "raioAtomicoPm", "elemento", "pm", ["raio atomico", "raio"]),
    ("xlogp", "XLogP", "xlogp", "composto", None, ["xlogp", "logp", "lipofilicidade"]),
]

DEFINICAO_CHEBI_ETANOL = {
    "id": "CHEBI:16236", "url": "https://www.ebi.ac.uk/chebi/searchId.do?chebiId=CHEBI:16236", "licenca": "CC BY 4.0",
    "texto": "A primary alcohol that is ethane in which one of the hydrogens is replaced by a hydroxy group.",
}

TEXTOS = [
    ("wikipedia-pt", {"id": "wikipedia-pt-mol", "fonte": "Wikipédia em português (fixture)", "licenca": "CC BY-SA 4.0", "url": "https://pt.wikipedia.org/wiki/Mol",
     "secao": "Mol", "titulo": "Mol",
     "textoOriginal": "O mol é a unidade de quantidade de matéria do Sistema Internacional de Unidades. Um mol contém exatamente 6,02214076 × 10^23 entidades elementares.",
     "textoPt": "O mol é a unidade de quantidade de matéria do Sistema Internacional de Unidades. Um mol contém exatamente 6,02214076 × 10^23 entidades elementares.",
     "traducao": "original em português", "palavrasChave": ["mol", "quantidade de matéria", "constante de avogadro"], "entidades": {"elementos": [], "compostos": []}}),
    ("gold-book", {"id": "gold-book-molar-mass", "fonte": "IUPAC Gold Book (fixture)", "licenca": "CC BY-SA 4.0", "url": "https://goldbook.iupac.org/terms/view/M03970",
     "secao": "molar mass", "titulo": "Massa molar",
     "textoOriginal": "Mass divided by amount of substance.",
     "textoPt": "Massa dividida pela quantidade de substância.",
     "traducao": "automática, revisada: não", "palavrasChave": ["massa molar", "mol", "gramas"], "entidades": {"elementos": [], "compostos": []}}),
    ("chebi", {"id": "chebi-acid", "fonte": "ChEBI (fixture)", "licenca": "CC BY 4.0", "url": "https://www.ebi.ac.uk/chebi/",
     "secao": "ácido", "titulo": "Ácido de Brønsted",
     "textoOriginal": "A molecular entity capable of donating a hydron to an acceptor.",
     "textoPt": "Uma entidade molecular capaz de doar um próton a um receptor.",
     "traducao": "automática, revisada: não", "palavrasChave": ["ácido", "acido", "próton", "brønsted"], "entidades": {"elementos": [], "compostos": []}}),
]


def escrever(rel, obj, arquivos):
    caminho = SAIDA / rel
    caminho.parent.mkdir(parents=True, exist_ok=True)
    dados = (json.dumps(obj, ensure_ascii=False, indent=1, sort_keys=False) + "\n").encode("utf-8")
    caminho.write_bytes(dados)
    arquivos[rel] = {"bytes": len(dados), "sha256": hashlib.sha256(dados).hexdigest()}


def main():
    if SAIDA.exists():
        for p in sorted(SAIDA.rglob("*"), reverse=True):
            if p.is_file():
                p.unlink()
            else:
                p.rmdir()
    arquivos = {}

    elementos = []
    for (z, sim, nome, nome_en, massa, grupo, periodo, bloco, cat, conf, en, raio, ae, ei, pf, pe, dens, estado, ox, desc) in ELEMENTOS:
        e = {"z": z, "simbolo": sim, "nome": nome, "nomeEn": nome_en, "massaAtomica": massa, "grupo": grupo, "periodo": periodo, "bloco": bloco,
             "categoria": cat, "configuracaoEletronica": conf, "eletronegatividade": en, "raioAtomicoPm": raio}
        for chave, v in (("afinidadeEletronicaKJmol", ae), ("energiaIonizacaoKJmol", ei), ("pontoFusaoK", pf), ("pontoEbulicaoK", pe), ("densidadeKgm3", dens)):
            if v is not None:
                e[chave] = v
        e["estadoPadrao"] = estado
        e["estadosOxidacao"] = ox
        if desc:
            e["descoberta"] = {"ano": desc[0], "por": desc[1]}
        e["fontes"] = [FONTE_PUBCHEM_TP, FONTE_FIXTURE]
        elementos.append(e)
    escrever("elementos.json", elementos, arquivos)

    compostos, idx_cid, idx_nomes, idx_formulas, idx_cas = [], {}, {}, {}, {}
    for (cid, nome, popular, iupac, sins, formula, hill, mm, me, smiles, inchi, cas, props, ghs, classes, icsc) in COMPOSTOS:
        c = {"cid": cid, "nome": nome}
        if popular:
            c["nomePopular"] = popular
        c["nomeIupac"] = iupac
        c["sinonimos"] = sins
        c.update({"formula": formula, "formulaHill": hill, "massaMolar": mm, "massaExata": me, "smiles": smiles})
        if inchi:
            c["inchiKey"] = inchi
        c["cas"] = cas
        c["propriedades"] = props
        if ghs:
            c["ghs"] = {"pictogramas": ghs[0], "palavraSinal": ghs[1], "frasesH": ghs[2], "fonte": "Classificação harmonizada da UE (CLP, Anexo VI) – dado de teste"}
        c["classes"] = classes
        # ICSC não é copiado: o pacote traz só o link de busca por CAS no site da OIT
        c["icscBuscaUrl"] = f"https://www.ilo.org/dyn/icsc/showcard.listcards3?p_lang=pt&p_cas={cas}"
        if icsc is True:
            c["definicaoChebi"] = DEFINICAO_CHEBI_ETANOL
        c["fontes"] = [f_pubchem(cid), FONTE_FIXTURE]
        compostos.append(c)
        idx_cid[str(cid)] = "lote-001"
        idx_nomes[str(cid)] = [n for n in [nome, popular, iupac, *sins] if n]
        idx_formulas[str(cid)] = formula
        idx_cas[str(cid)] = cas
    escrever("compostos/lote-001.json", compostos, arquivos)
    escrever("compostos/index.json", {"tamanhoLote": 200, "total": len(compostos), "cid": idx_cid, "nomes": idx_nomes,
                                       "formulas": idx_formulas, "cas": idx_cas}, arquivos)

    escrever("constantes.json", [{"id": i, "nome": n, "simbolo": s, "valor": v, "unidade": u, "incerteza": inc,
                                   "fontes": [{"nome": "CODATA 2022 (NIST)", "url": "https://physics.nist.gov/cuu/Constants/", "licenca": "domínio público (NIST)", "acessadoEm": HOJE}]}
                                  for (i, n, s, v, u, inc) in CONSTANTES], arquivos)

    escrever("regras.json", {
        "propriedades": [{"id": i, "rotulo": r, "campo": c, "alvo": a, "unidade": u, "sinonimos": s} for (i, r, c, a, u, s) in PROPRIEDADES],
        "unidades": [{"grandeza": g, "simbolo": s, "nome": n, "fator": f, "offset": o, "apelidos": ap} for (g, s, n, f, o, ap) in UNIDADES],
        "prefixosSi": [{"simbolo": "k", "nome": "quilo", "expoente": 3}, {"simbolo": "m", "nome": "mili", "expoente": -3}, {"simbolo": "c", "nome": "centi", "expoente": -2}],
        "reatividade": ["K", "Na", "Ca", "Mg", "Al", "Zn", "Fe", "Pb", "H", "Cu", "Ag", "Au"],
        "solubilidade": [{"regra": "Sais de sódio, potássio e amônio são solúveis.", "excecoes": []}],
        "nomenclatura": {"sufixos": {"ico": "ácido com mais oxigênio", "oso": "ácido com menos oxigênio"}},
        "fontes": [FONTE_FIXTURE],
    }, arquivos)

    escrever("fontes.json", [
        {"id": "pubchem", "nome": "PubChem (NIH/NCBI) – campos calculados", "url": "https://pubchem.ncbi.nlm.nih.gov/", "licenca": "domínio público", "acessadoEm": HOJE, "uso": "elementos e compostos"},
        {"id": "codata", "nome": "CODATA 2022 (NIST)", "url": "https://physics.nist.gov/cuu/Constants/", "licenca": "domínio público", "acessadoEm": HOJE, "uso": "constantes"},
        {"id": "clp", "nome": "Regulamento CLP (UE), Anexo VI", "url": "https://eur-lex.europa.eu/", "licenca": "legislação da UE (reuso com atribuição)", "acessadoEm": HOJE, "uso": "classificação GHS harmonizada"},
        {"id": "wikipedia-pt", "nome": "Wikipédia em português", "url": "https://pt.wikipedia.org/", "licenca": "CC BY-SA 4.0", "acessadoEm": HOJE, "uso": "textos de explicação"},
        {"id": "gold-book", "nome": "IUPAC Gold Book", "url": "https://goldbook.iupac.org/", "licenca": "CC BY-SA 4.0", "acessadoEm": HOJE, "uso": "definições"},
        {"id": "chebi", "nome": "ChEBI (EMBL-EBI)", "url": "https://www.ebi.ac.uk/chebi/", "licenca": "CC BY 4.0", "acessadoEm": HOJE, "uso": "definições de compostos"},
        FONTE_FIXTURE | {"id": "fixture", "uso": "dados de teste do app"},
    ], arquivos)

    for pasta, t in TEXTOS:
        escrever(f"textos/{pasta}/{t['id']}.json", t, arquivos)

    manifest = {
        "version": "2026.10.10-fixture", "generatedAt": "2026-10-10T12:00:00Z", "schemaVersion": 1,
        "files": dict(sorted(arquivos.items())),
        "sources": [{"id": "fixture", "nome": FONTE_FIXTURE["nome"], "url": FONTE_FIXTURE["url"], "licenca": "uso em testes", "acessadoEm": HOJE}],
        "licencas": [{"nome": "domínio público", "url": "https://www.ncbi.nlm.nih.gov/home/about/policies/"}, {"nome": "CC BY 4.0", "url": "https://creativecommons.org/licenses/by/4.0/deed.pt-br"}, {"nome": "CC BY-SA 4.0", "url": "https://creativecommons.org/licenses/by-sa/4.0/deed.pt-br"}],
        "cliente": {"pollIntervalMinutes": 10080, "baseUrl": "https://saibatudo.net/quimica/data/", "minAppVersionCode": 1,
                    "nlu": {"endpoint": "https://saibatudo.net/quimica/api/nlu"}, "ask": {"enabled": False}, "melhoria": {"enabled": False}},
    }
    mpath = SAIDA / "manifest.json"
    mpath.write_bytes((json.dumps(manifest, ensure_ascii=False, indent=1) + "\n").encode("utf-8"))
    subprocess.run([sys.executable, str(RAIZ / "pipeline" / "sign.py"), "sign", str(mpath), "--private", str(RAIZ / "secrets" / "data_signing_key.pem")], check=True)
    subprocess.run([sys.executable, str(RAIZ / "pipeline" / "sign.py"), "verify", str(mpath), "--public", str(RAIZ / "pipeline" / "data_signing_public.pem")], check=True)
    print(f"fixture gerada em {SAIDA} ({len(arquivos)} arquivos)")


if __name__ == "__main__":
    main()
