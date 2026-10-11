# -*- coding: utf-8 -*-
"""
Compostos do núcleo (DATA_CONTRACT §3), lotes de 200 em `compostos/lote-NNN.json` + `compostos/index.json`.

Fontes por campo (política de docs/FONTES_E_LICENCAS.md §5):
- PubChem (só campos calculados pelo NLM e identificadores): formulaHill, massaMolar, massaExata, smiles, inchiKey, nomeIupac,
  propriedades (xlogp, tpsa, contagens, carga). Sem sinônimos nem depósitos de terceiros.
- GHS: só a classificação harmonizada da UE (Regulamento 1272/2008, Anexo VI) lida do PUG View; `ghs.fonte` guarda o texto
  literal da fonte; as frases H em português estão em `ghs_frases.json` (Anexo III do CLP, EUR-Lex).
- Wikidata (CC0): nome em português, rótulos/apelidos, CAS (identificador), fórmula convencional (P274), QID, ChEBI ID (P683).
- ChEBI (CC BY 4.0): `definicaoChebi` (texto em inglês) e nomes alternativos.
- ICSC: nada é copiado; cada composto com CAS recebe `icscBuscaUrl` (link de busca por CAS no site da OIT, em português).
"""
import re

import coleta_chebi
import coleta_icsc
import pubchem as P
import quimica_util as Q
import wikidata as W
from http_cache import HttpErro

LOTE_ARQUIVO = 200
LOTE_WIKIDATA = 100
URL_PUBCHEM_CID = "https://pubchem.ncbi.nlm.nih.gov/compound/{cid}"
LICENCA_PUBCHEM = "domínio público (NCBI/NLM)"
URL_WIKIDATA = "https://www.wikidata.org/wiki/{q}"
URL_EURLEX_CLP = "https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:32008R1272"

CONSULTA_ENRIQUECER = """SELECT ?cid ?item ?sl
  (GROUP_CONCAT(DISTINCT ?lbr; separator="|") AS ?pbr)
  (GROUP_CONCAT(DISTINCT ?lpt; separator="|") AS ?ppt)
  (GROUP_CONCAT(DISTINCT ?len; separator="|") AS ?pen)
  (GROUP_CONCAT(DISTINCT ?apt; separator="|") AS ?apts)
  (GROUP_CONCAT(DISTINCT ?aen; separator="|") AS ?aens)
  (GROUP_CONCAT(DISTINCT ?cas; separator="|") AS ?cass)
  (GROUP_CONCAT(DISTINCT ?frm; separator="|") AS ?frms)
  (GROUP_CONCAT(DISTINCT ?chebi; separator="|") AS ?chebis)
  (GROUP_CONCAT(DISTINCT ?ptw; separator="|") AS ?ptws) WHERE {
  VALUES ?cid { %s }
  ?item wdt:P662 ?cid ; wikibase:sitelinks ?sl .
  OPTIONAL { ?item rdfs:label ?lbr . FILTER(LANG(?lbr) = "pt-br") }
  OPTIONAL { ?item rdfs:label ?lpt . FILTER(LANG(?lpt) = "pt") }
  OPTIONAL { ?item rdfs:label ?len . FILTER(LANG(?len) = "en") }
  OPTIONAL { ?item skos:altLabel ?apt . FILTER(LANG(?apt) IN ("pt", "pt-br")) }
  OPTIONAL { ?item skos:altLabel ?aen . FILTER(LANG(?aen) = "en") }
  OPTIONAL { ?item wdt:P231 ?cas }
  OPTIONAL { ?item wdt:P274 ?frm }
  OPTIONAL { ?item wdt:P683 ?chebi }
  OPTIONAL { ?art schema:about ?item ; schema:isPartOf <https://pt.wikipedia.org/> ; schema:name ?ptw }
} GROUP BY ?cid ?item ?sl"""


# ------------------------------------------------------------------------------------------------ Wikidata
def enriquecer_wikidata(http, cids, log=print):
    """{cid: {...}} com o item de maior número de sitelinks para cada CID."""
    cids = sorted({int(c) for c in cids})
    por_cid, falhas = {}, []
    for i in range(0, len(cids), LOTE_WIKIDATA):
        lote = cids[i:i + LOTE_WIKIDATA]
        valores = " ".join(f'"{c}"' for c in lote)
        try:
            linhas = W.sparql(http, CONSULTA_ENRIQUECER % valores, post=True)
        except Exception as exc:  # noqa: BLE001
            falhas.append({"cids": f"{lote[0]}-{lote[-1]}", "erro": str(exc)[:160]})
            log(f"  [wikidata] enriquecimento {lote[0]}-{lote[-1]} falhou: {exc}")
            continue
        for l in linhas:
            cid = int(l["cid"])
            reg = {"qid": W.qid(l["item"]), "sl": int(l["sl"]), "pbr": W.valores(l.get("pbr")), "ppt": W.valores(l.get("ppt")),
                   "pen": W.valores(l.get("pen")), "apt": W.valores(l.get("apts")), "aen": W.valores(l.get("aens")),
                   "cas": W.valores(l.get("cass")), "formulas": W.valores(l.get("frms")),
                   "chebi": W.valores(l.get("chebis")), "ptwiki": W.valores(l.get("ptws"))}
            if cid not in por_cid or reg["sl"] > por_cid[cid]["sl"]:
                por_cid[cid] = reg
        log(f"  [wikidata] enriquecimento {min(i + LOTE_WIKIDATA, len(cids))}/{len(cids)}")
    return por_cid, falhas


def escolher_cas(candidatos):
    validos = sorted({c.strip() for c in candidatos if Q.cas_valido(c.strip())}, key=lambda c: (len(c), c))
    return validos[0] if validos else None


def escolher_formula(declarada, wd_formulas, formula_pubchem):
    """Fórmula convencional: a declarada na lista fixa > Wikidata P274 (se a composição bate) > fórmula Hill do PubChem."""
    if declarada and Q.hill_igual(declarada, formula_pubchem):
        return declarada
    for f in sorted(wd_formulas, key=lambda x: (len(x), x)):
        f2 = Q.sem_subscritos(f).strip()
        if f2 and Q.hill_igual(f2, formula_pubchem):
            return f2
    return formula_pubchem


_CODIGO = re.compile(r"[A-Z0-9][A-Z0-9\-\s.,:/()]*")


def sinonimo_valido(s):
    s = (s or "").strip()
    if not (2 <= len(s) <= 50):
        return False
    if Q.cas_valido(s) or re.search(r"\d", s) and not re.search(r"[a-zà-ú]", s):
        return False
    if re.search(r"[<>&=]", s) or s.startswith(("[", "(")) or s.count("(") != s.count(")"):
        return False
    if s.upper().startswith(("CHEBI", "CHEMBL", "UNII", "DTXSID", "SCHEMBL", "NSC", "EINECS", "INCHI")):
        return False
    return True


def montar_sinonimos(exclui, *listas, maximo=10):
    ja = {Q.norm(x) for x in exclui if x}
    out = []
    for lista in listas:
        for s in lista:
            n = Q.norm(s)
            if n and n not in ja and sinonimo_valido(s):
                ja.add(n)
                out.append(s.strip())
                if len(out) >= maximo:
                    return out
    return out


# ------------------------------------------------------------------------------------------------ montagem
def montar(sel, props, wd, ghs, chebi, hoje):
    """Monta o registro do contrato §3 (ou None se faltar o essencial)."""
    cid = sel["cid"]
    p = props
    if not p or not p.get("MolecularFormula") or not p.get("ConnectivitySMILES"):
        return None, "sem fórmula/SMILES no PubChem"
    wd = wd or {}
    fontes = [Q.fonte(f"PubChem CID {cid}", URL_PUBCHEM_CID.format(cid=cid), LICENCA_PUBCHEM, hoje)]
    c = {"cid": cid}
    iupac = (p.get("IUPACName") or "").strip() or None
    en = (wd.get("pen") or [None])[0]
    pt = next((x for x in (wd.get("pbr") or []) + (wd.get("ppt") or []) if x), None)
    nome_pt = sel.get("nome") or (Q.capitalizar(pt) if pt else None)
    if nome_pt:
        c["nome"] = nome_pt
    else:
        pend = iupac or en
        if not pend:
            return None, "sem nome"
        c["nome"] = pend
        c["nomePtPendente"] = True
    if sel.get("popular"):
        c["nomePopular"] = sel["popular"]
    if iupac:
        c["nomeIupac"] = iupac
    excl = [c["nome"], c.get("nomePopular"), iupac]
    sin = montar_sinonimos(excl, wd.get("apt", []), [Q.capitalizar(x) for x in (wd.get("pbr", []) + wd.get("ppt", []))
                                                      if Q.norm(x) != Q.norm(c["nome"])],
                           ([en] if en else []), wd.get("aen", []), (chebi or {}).get("sinonimos", []))
    if sin:
        c["sinonimos"] = sin
    c["formula"] = escolher_formula(sel.get("formulaDeclarada"), wd.get("formulas", []), p["MolecularFormula"])
    c["formulaHill"] = p["MolecularFormula"]
    mm, me = P.numero(p.get("MolecularWeight")), P.numero(p.get("ExactMass"))
    if mm is None:
        return None, "sem massa molar"
    c["massaMolar"] = mm
    if me is not None:
        c["massaExata"] = me
    c["smiles"] = p["ConnectivitySMILES"]
    if p.get("InChIKey"):
        c["inchiKey"] = p["InChIKey"]
    cas = escolher_cas(wd.get("cas", []))
    if cas:
        c["cas"] = cas
        c["icscBuscaUrl"] = coleta_icsc.url_busca_cas(cas)
    prop = {}
    for chave, campo in (("XLogP", "xlogp"), ("HBondDonorCount", "doadoresH"), ("HBondAcceptorCount", "aceptoresH"),
                         ("RotatableBondCount", "ligacoesRotaveis"), ("Charge", "carga"), ("TPSA", "tpsa")):
        v = P.numero(p.get(chave))
        if v is not None:
            prop[campo] = v
    if prop:
        c["propriedades"] = prop
    if ghs:
        c["ghs"] = ghs
        fontes.append(Q.fonte("Regulamento (CE) n.º 1272/2008, Anexo VI (classificação harmonizada), via PubChem",
                              ghs.get("fonteUrl") or URL_EURLEX_CLP, "reutilização livre da legislação (EUR-Lex)", hoje))
    if sel.get("classes"):
        c["classes"] = sel["classes"]
    if wd.get("qid"):
        c["wikidata"] = wd["qid"]
        fontes.append(Q.fonte("Wikidata", URL_WIKIDATA.format(q=wd["qid"]), "CC0", hoje))
    if chebi and chebi.get("definicao"):
        cid_chebi = f"CHEBI:{chebi['id']}"
        c["definicaoChebi"] = {"texto": chebi["definicao"], "chebiId": cid_chebi, "licenca": coleta_chebi.LICENCA}
        fontes.append(Q.fonte(f"ChEBI {cid_chebi}", coleta_chebi.URL_PAGINA.format(id=chebi["id"]), coleta_chebi.LICENCA, hoje))
    c["fontes"] = fontes
    return c, None


def coletar(http, pubchem, selecao, hoje, frases_h=None, com_ghs=True, com_chebi=True, log=print):
    """Devolve (compostos, meta, stats). `meta[cid]` = {"sl", "ptwiki", "qid"} para a etapa de textos."""
    cids = [s["cid"] for s in selecao]
    props = pubchem.propriedades(cids)
    wd_por_cid, wd_falhas = enriquecer_wikidata(http, cids, log)

    ghs_por_cid, ghs_falhas = {}, []
    if com_ghs:
        for i, cid in enumerate(cids, 1):
            try:
                g = pubchem.ghs_harmonizado(cid)
            except HttpErro as exc:
                if exc.status == 429:
                    raise
                ghs_falhas.append({"cid": cid, "erro": str(exc)[:120]})
                continue
            if g:
                ghs_por_cid[cid] = g
            if i % 200 == 0:
                log(f"  [ghs] {i}/{len(cids)} (com classificação harmonizada: {len(ghs_por_cid)})")

    if len(ghs_falhas) > max(3, 0.02 * len(cids)):  # não publica pacote com GHS silenciosamente incompleto
        raise RuntimeError(f"GHS: {len(ghs_falhas)} falhas de rede em {len(cids)} compostos (ex.: {ghs_falhas[0]})")

    chebi_dados, chebi_stats = {}, {}
    if com_chebi:
        ids = {int(x) for wd in wd_por_cid.values() for x in wd.get("chebi", []) if str(x).isdigit()}
        chebi_dados, chebi_stats = coleta_chebi.coletar(http, ids, log)

    compostos, meta, descartados = [], {}, []
    for sel in selecao:
        cid = sel["cid"]
        wd = wd_por_cid.get(cid)
        ch = None
        if wd:
            for x in wd.get("chebi", []):
                if str(x).isdigit() and int(x) in chebi_dados:
                    ch = dict(chebi_dados[int(x)], id=int(x))
                    break
        c, motivo = montar(sel, props.get(cid), wd, ghs_por_cid.get(cid), ch, hoje)
        if c is None:
            descartados.append({"cid": cid, "motivo": motivo})
            continue
        compostos.append(c)
        meta[cid] = {"sl": (wd or {}).get("sl", 0), "ptwiki": ((wd or {}).get("ptwiki") or [None])[0],
                     "qid": (wd or {}).get("qid")}

    faltam_h = sorted({h for c in compostos for h in c.get("ghs", {}).get("frasesH", []) if frases_h is not None and h not in frases_h})
    stats = {"compostos": len(compostos), "descartados": descartados, "comGhsHarmonizado": len(ghs_por_cid), "ghsFalhasDeRede": ghs_falhas,
             "comCas": sum(1 for c in compostos if "cas" in c), "comWikidata": sum(1 for c in compostos if "wikidata" in c),
             "nomePtPendente": sum(1 for c in compostos if c.get("nomePtPendente")),
             "comDefinicaoChebi": sum(1 for c in compostos if "definicaoChebi" in c),
             "frasesHSemTextoPt": faltam_h, "wikidataFalhas": wd_falhas, "chebi": chebi_stats,
             "sinonimosDePubChem": "não coletados (política de campos calculados do PubChem)"}
    return compostos, meta, stats


# ------------------------------------------------------------------------------------------------ saída
def para_lotes(compostos):
    """[(nome_lote, lista), ...] com 200 por arquivo e o índice `{porCid, nomes}`."""
    lotes, porcid, nomes = [], {}, set()
    for i in range(0, len(compostos), LOTE_ARQUIVO):
        nome = f"lote-{i // LOTE_ARQUIVO + 1:03d}"
        parte = compostos[i:i + LOTE_ARQUIVO]
        lotes.append((nome, parte))
        for c in parte:
            porcid[str(c["cid"])] = nome
            for n in [c["nome"], c.get("nomePopular"), c.get("nomeIupac")] + c.get("sinonimos", []) + [c["formula"], c["formulaHill"]]:
                if n:
                    nomes.add((Q.norm(n), c["cid"]))
    return lotes, {"porCid": porcid, "nomes": [[n, cid] for n, cid in sorted(nomes)]}
