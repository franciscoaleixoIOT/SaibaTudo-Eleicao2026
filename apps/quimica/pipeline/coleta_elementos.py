# -*- coding: utf-8 -*-
"""
Coleta dos 118 elementos (DATA_CONTRACT §2).

Fonte principal: PubChem Periodic Table (domínio público). Nomes em português: tabela fixa da SBQ (quimica_util).
Complementos via Wikidata (CC0): descobridor, CAS, QID, rótulos (conferência dos nomes) e massa atômica convencional
quando o PubChem a entrega com poucas casas (ex.: Li "7.0", Fe "55.84").

Unidades de saída (SI/contrato): K, kg/m³, pm, kJ/mol (eV x 96,485).
"""
import re
from decimal import Decimal

import quimica_util as Q
import wikidata as W

URL_PUBCHEM = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/periodictable/JSON"
URL_PUBCHEM_PAGINA = "https://pubchem.ncbi.nlm.nih.gov/periodic-table/"
LICENCA_PUBCHEM = "domínio público (NCBI/NLM)"
EV_PARA_KJ_MOL = Decimal("96.485")

CATEGORIAS = {
    "Alkali metal": "metal_alcalino",
    "Alkaline earth metal": "metal_alcalino_terroso",
    "Transition metal": "metal_transicao",
    "Post-transition metal": "metal_pos_transicao",
    "Metalloid": "semimetal",
    "Nonmetal": "nao_metal",
    "Halogen": "halogenio",
    "Noble gas": "gas_nobre",
    "Lanthanide": "lantanideo",
    "Actinide": "actinideo",
}
ESTADOS = {"Solid": "solido", "Liquid": "liquido", "Gas": "gas"}

CONSULTA_WIKIDATA = """
SELECT ?item ?sym ?z ?cas ?lpt ?lptbr ?len ?mass ?ano
       (GROUP_CONCAT(DISTINCT ?porNome; separator="|") AS ?por) WHERE {
  ?item wdt:P31 wd:Q11344 ; wdt:P246 ?sym ; wdt:P1086 ?z .
  FILTER(xsd:integer(?z) <= 118)
  OPTIONAL { ?item wdt:P231 ?cas }
  OPTIONAL { ?item wdt:P2067 ?mass }
  OPTIONAL { ?item wdt:P575 ?disc . BIND(YEAR(?disc) AS ?ano) }
  OPTIONAL {
    ?item wdt:P61 ?d .
    OPTIONAL { ?d rdfs:label ?dbr . FILTER(LANG(?dbr) = "pt-br") }
    OPTIONAL { ?d rdfs:label ?dpt . FILTER(LANG(?dpt) = "pt") }
    OPTIONAL { ?d rdfs:label ?den . FILTER(LANG(?den) = "en") }
    BIND(COALESCE(?dbr, ?dpt, ?den) AS ?porNome)
  }
  OPTIONAL { ?item rdfs:label ?lpt . FILTER(LANG(?lpt) = "pt") }
  OPTIONAL { ?item rdfs:label ?lptbr . FILTER(LANG(?lptbr) = "pt-br") }
  OPTIONAL { ?item rdfs:label ?len . FILTER(LANG(?len) = "en") }
} GROUP BY ?item ?sym ?z ?cas ?lpt ?lptbr ?len ?mass ?ano ORDER BY xsd:integer(?z)
"""


# ------------------------------------------------------------------------------------------------ conversões
def numero(txt):
    """'13.598' -> Decimal; '', None, 'Ancient' -> None."""
    if txt is None:
        return None
    txt = str(txt).strip()
    if not txt:
        return None
    try:
        return Decimal(txt)
    except Exception:  # noqa: BLE001
        return None


def _nu(d, casas=None):
    """Decimal -> int se inteiro, senão float (sem artefatos de ponto flutuante)."""
    if d is None:
        return None
    if casas is not None:
        d = round(d, casas)
    if d == d.to_integral_value():
        return int(d)
    return float(d)


def ev_para_kj_mol(ev_txt):
    d = numero(ev_txt)
    return None if d is None else float(round(d * EV_PARA_KJ_MOL, 1))


def g_cm3_para_kg_m3(txt):
    d = numero(txt)
    if d is None:
        return None
    return _nu(d * 1000, 6)


def categoria(group_block):
    return CATEGORIAS.get((group_block or "").strip(), "desconhecida")


def estado_padrao(txt):
    """Só estados medidos; 'Expected to be a ...' (previsão para os superpesados) não vira dado."""
    return ESTADOS.get((txt or "").strip())


def estados_oxidacao(txt):
    out = set()
    for p in re.split(r"[,\s]+", (txt or "").strip()):
        p = p.strip().replace("+", "")
        if re.fullmatch(r"-?\d+", p):
            out.add(int(p))
    return sorted(out)


def configuracao(txt):
    t = (txt or "").strip()
    if not t:
        return None
    sufixo = ""
    m = re.search(r"\s*\((predicted|calculated)\)\s*$", t)
    if m:
        sufixo = " (prevista)" if m.group(1) == "predicted" else " (calculada)"
        t = t[:m.start()]
    t = re.sub(r"\](?=\S)", "] ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t + sufixo


def decimais(txt):
    s = str(txt).strip()
    return len(s.split(".")[1].rstrip("0")) if "." in s else 0


def escolher_massa(pubchem_txt, wikidata_txt):
    """PubChem por padrão. Usa o Wikidata (massa atômica convencional) quando ele refina o valor do PubChem: tem mais
    casas decimais e difere em no máximo uma unidade da última casa do PubChem (Li 7.0 -> 6.94, Fe 55.84 -> 55.845).
    Isótopos diferentes dos superpesados (Og 295.216 x 294.214) ficam de fora por essa regra."""
    pc = numero(pubchem_txt)
    wd = numero(wikidata_txt)
    if pc is None and wd is None:
        return None, None
    if pc is None:
        return _nu(wd), "wikidata"
    if wd is not None and decimais(wikidata_txt) > decimais(pubchem_txt) and             abs(wd - pc) <= Decimal(1).scaleb(-decimais(pubchem_txt)):
        return _nu(wd), "wikidata"
    return _nu(pc), "pubchem"


# ------------------------------------------------------------------------------------------------ coleta
def ler_pubchem(http):
    r = http.get(URL_PUBCHEM)
    if r.status != 200:
        raise RuntimeError(f"PubChem Periodic Table devolveu HTTP {r.status}")
    tab = r.json()["Table"]
    cols = tab["Columns"]["Column"]
    return [dict(zip(cols, linha["Cell"])) for linha in tab["Row"]]


def ler_wikidata(http):
    """Devolve {z: {...}} (apenas Z 1..118, símbolo conferido depois)."""
    por_z = {}
    for l in W.sparql(http, CONSULTA_WIKIDATA):
        z = int(l["z"])
        d = por_z.setdefault(z, {"itens": set(), "sym": l["sym"], "cas": set(), "massas": set(), "anos": set(),
                                 "por": [], "pt": set(), "ptbr": set(), "en": set()})
        d["itens"].add(W.qid(l["item"]))
        for k, campo in (("cas", "cas"), ("mass", "massas"), ("ano", "anos"), ("lpt", "pt"), ("lptbr", "ptbr"),
                         ("len", "en")):
            if l.get(k):
                d[campo].add(l[k])
        for nome in W.valores(l.get("por")):
            if nome not in d["por"]:
                d["por"].append(nome)
    return por_z


def montar_elemento(linha, wd, hoje, info=None):
    z = int(linha["AtomicNumber"])
    info = {} if info is None else info
    simbolo = linha["Symbol"]
    if Q.SIMBOLO_POR_Z.get(z) != simbolo:
        raise ValueError(f"símbolo do PubChem diverge da tabela fixa: Z={z} {simbolo}")
    fontes = [Q.fonte("PubChem Periodic Table", URL_PUBCHEM_PAGINA, LICENCA_PUBCHEM, hoje)]
    usou_wikidata = False
    e = {"z": z, "simbolo": simbolo, "nome": Q.NOME_PT_POR_Z[z], "nomeEn": linha["Name"]}

    wd_mass = None
    if wd and len(wd["massas"]) == 1:
        wd_mass = next(iter(wd["massas"]))
    massa, origem_massa = escolher_massa(linha.get("AtomicMass"), wd_mass)
    if massa is not None:
        e["massaAtomica"] = massa
        usou_wikidata |= origem_massa == "wikidata"
        info["massaDoWikidata"] = origem_massa == "wikidata"

    e["grupo"] = Q.grupo(z)
    if e["grupo"] is None:
        del e["grupo"]
    e["periodo"] = Q.periodo(z)
    e["bloco"] = Q.bloco(z)
    e["categoria"] = categoria(linha.get("GroupBlock"))
    cfg = configuracao(linha.get("ElectronConfiguration"))
    if cfg:
        e["configuracaoEletronica"] = cfg
    en = numero(linha.get("Electronegativity"))
    if en is not None:
        e["eletronegatividade"] = _nu(en)
    raio = numero(linha.get("AtomicRadius"))
    if raio is not None:
        e["raioAtomicoPm"] = _nu(raio)
    af = ev_para_kj_mol(linha.get("ElectronAffinity"))
    if af is not None:
        e["afinidadeEletronicaKJmol"] = af
    ie = ev_para_kj_mol(linha.get("IonizationEnergy"))
    if ie is not None:
        e["energiaIonizacaoKJmol"] = ie
    for campo, chave in (("pontoFusaoK", "MeltingPoint"), ("pontoEbulicaoK", "BoilingPoint")):
        v = numero(linha.get(chave))
        if v is not None:
            e[campo] = _nu(v)
    dens = g_cm3_para_kg_m3(linha.get("Density"))
    if dens is not None:
        e["densidadeKgm3"] = dens
    est = estado_padrao(linha.get("StandardState"))
    if est:
        e["estadoPadrao"] = est
    ox = estados_oxidacao(linha.get("OxidationStates"))
    if ox:
        e["estadosOxidacao"] = ox

    ano_pc = (linha.get("YearDiscovered") or "").strip()
    desc = {}
    if ano_pc.isdigit():
        desc["ano"] = int(ano_pc)
        # descobridor só quando o Wikidata concorda com o ano (evita atribuir a pessoa de outra "descoberta")
        if wd and wd["por"] and str(int(ano_pc)) in wd["anos"]:
            desc["por"] = "; ".join(wd["por"])
            usou_wikidata = True
    if desc:
        e["descoberta"] = desc

    if wd:
        # CAS fica de fora de propósito: nos gases diatômicos o CAS do "elemento" é o do átomo (H 12385-13-6,
        # O 17778-80-2), não o da substância (H2 1333-74-0, O2 7782-44-7); o CAS das substâncias está em compostos/.
        if len(wd["itens"]) == 1:
            e["wikidata"] = next(iter(wd["itens"]))
            usou_wikidata = True
    if usou_wikidata:
        fontes.append(Q.fonte("Wikidata", f"https://www.wikidata.org/wiki/{e.get('wikidata', 'Q11344')}", "CC0", hoje))
    e["fontes"] = fontes
    return e


def coletar(http, hoje):
    """Devolve (elementos, stats). Levanta exceção se o PubChem falhar (o Wikidata é opcional)."""
    linhas = ler_pubchem(http)
    stats = {"pubchemLinhas": len(linhas), "wikidata": "ok", "nomesDivergentesWikidata": [], "massaDoWikidata": 0,
             "descobertaSemDescobridor": [], "semEstadoPadrao": []}
    try:
        wd_por_z = ler_wikidata(http)
    except Exception as exc:  # noqa: BLE001  (Wikidata é complemento)
        wd_por_z = {}
        stats["wikidata"] = f"falhou: {exc}"
    elementos = []
    for linha in linhas:
        z = int(linha["AtomicNumber"])
        wd = wd_por_z.get(z)
        if wd and wd["sym"] != linha["Symbol"]:
            wd = None
        info = {}
        e = montar_elemento(linha, wd, hoje, info)
        if wd:
            rotulos = {Q.norm(x) for x in (wd["ptbr"] | wd["pt"])}
            if rotulos and Q.norm(e["nome"]) not in rotulos:
                stats["nomesDivergentesWikidata"].append({"z": z, "nome": e["nome"], "wikidata": sorted(wd["ptbr"] | wd["pt"])})
        if info.get("massaDoWikidata"):
            stats["massaDoWikidata"] += 1
        if "descoberta" in e and "por" not in e["descoberta"]:
            stats["descobertaSemDescobridor"].append(z)
        if "estadoPadrao" not in e:
            stats["semEstadoPadrao"].append(z)
        elementos.append(e)
    elementos.sort(key=lambda x: x["z"])
    stats["elementos"] = len(elementos)
    return elementos, stats
