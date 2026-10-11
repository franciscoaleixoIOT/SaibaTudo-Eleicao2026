# -*- coding: utf-8 -*-
"""
Seleção do núcleo de compostos (~2.000). Critério público e reprodutível:

1. LISTA_FIXA (lista_fixa.py): ~490 compostos do ensino médio e de cultura geral. O CID vem do PubChem (busca por nome) e é
   conferido pela fórmula: composição da fórmula convencional == fórmula Hill do PubChem. O que não confere é descartado.
2. Wikidata (CC0): itens com PubChem CID (P662) **e** artigo na Wikipédia em português, instância de tipo de entidade química /
   composto químico / medicamento / substância química (ou subclasse delas), fora os elementos, ordenados por número de sitelinks.
   A ordenação global estoura os 60 s do WDQS, então os CIDs 1..99.999 são varridos em lotes via VALUES (as substâncias comuns
   têm CIDs baixos) e o ranking é feito aqui. Só moléculas neutras com mais de um elemento entram por esta via.
3. Completa até o alvo (2.000) pela ordem de sitelinks.
"""
import time

import lista_fixa
import quimica_util as Q
import wikidata as W
from http_cache import HttpErro

CLASSES_QUIMICAS = ("wd:Q113145171", "wd:Q11173", "wd:Q12140", "wd:Q79529")  # tipo de entidade química, composto, medicamento, substância
MAX_CID_VARREDURA = 100_000
LOTE_VARREDURA = 2_500
ALVO_PADRAO = 2_000


def consulta_lote(inicio, fim):
    valores = " ".join(f'"{i}"' for i in range(inicio, fim))
    return f"""SELECT DISTINCT ?item ?cid ?sl WHERE {{
  VALUES ?cid {{ {valores} }}
  ?item wdt:P662 ?cid .
  ?item wikibase:sitelinks ?sl .
  ?article schema:about ?item ; schema:isPartOf <https://pt.wikipedia.org/> .
  VALUES ?cls {{ {' '.join(CLASSES_QUIMICAS)} }}
  ?item wdt:P31/wdt:P279* ?cls .
  FILTER NOT EXISTS {{ ?item wdt:P1086 ?z }}
}}"""


def resolver_lista_fixa(pubchem, itens, log=print):
    """Resolve CIDs da lista fixa. Devolve (selecionados, descartados)."""
    candidatos, falhas = {}, []
    for i, it in enumerate(itens):
        try:
            candidatos[it["termo"]] = pubchem.nome_para_cids(it["termo"])[:5]
        except HttpErro as exc:
            if exc.status == 429:  # bloqueio persistente do PubChem: insistir só prolonga o bloqueio
                raise
            falhas.append(it)
        if (i + 1) % 100 == 0:
            log(f"  [lista fixa] nomes resolvidos: {i + 1}/{len(itens)}")
    if falhas:  # segunda chance depois de uma pausa; se persistir em mais de 5% da lista, aborta (não descarta em silêncio)
        log(f"  [lista fixa] {len(falhas)} nomes falharam na rede; nova tentativa em 60 s")
        time.sleep(60)
        for it in falhas:
            try:
                candidatos[it["termo"]] = pubchem.nome_para_cids(it["termo"])[:5]
            except HttpErro:
                pass
        if len([f for f in falhas if f["termo"] not in candidatos]) > 0.05 * len(itens):
            raise RuntimeError("PubChem indisponível para resolver a lista fixa (muitos erros de rede/429)")
        for it in falhas:
            candidatos.setdefault(it["termo"], [])
    props = pubchem.propriedades({c for cs in candidatos.values() for c in cs})
    sel, desc, vistos = [], [], {}
    for it in itens:
        escolhido = None
        for cid in candidatos[it["termo"]]:
            p = props.get(cid)
            if p and Q.hill_igual(it["formula"], p["MolecularFormula"]):
                escolhido = cid
                break
        if escolhido is None:
            motivo = "sem CID" if not candidatos[it["termo"]] else \
                f"fórmula não confere (esperada {it['formula']}; PubChem: " + \
                ", ".join(f"{c}={props[c]['MolecularFormula']}" for c in candidatos[it["termo"]] if props.get(c)) + ")"
            desc.append({"nome": it["nome"], "termo": it["termo"], "motivo": motivo})
            continue
        if escolhido in vistos:
            desc.append({"nome": it["nome"], "termo": it["termo"], "motivo": f"duplicado de {vistos[escolhido]} (CID {escolhido})"})
            continue
        vistos[escolhido] = it["nome"]
        reg = {"cid": escolhido, "nome": it["nome"], "classes": it["classes"], "formulaDeclarada": it["formula"],
               "origem": "lista_fixa"}
        if it.get("popular"):
            reg["popular"] = it["popular"]
        sel.append(reg)
    return sel, desc


def varrer_wikidata(http, max_cid=MAX_CID_VARREDURA, lote=LOTE_VARREDURA, log=print):
    """Devolve ({item: {"cids": [...], "sl": n}}, lotes_falhos)."""
    itens, falhos = {}, []
    for inicio in range(1, max_cid, lote):
        fim = min(inicio + lote, max_cid)
        try:
            linhas = W.sparql(http, consulta_lote(inicio, fim), post=True)
        except Exception as exc:  # noqa: BLE001
            falhos.append({"cids": f"{inicio}-{fim - 1}", "erro": str(exc)[:200]})
            log(f"  [wikidata] lote {inicio}-{fim - 1} falhou: {exc}")
            continue
        for l in linhas:
            q = W.qid(l["item"])
            d = itens.setdefault(q, {"cids": set(), "sl": int(l["sl"])})
            d["cids"].add(int(l["cid"]))
        log(f"  [wikidata] varredura CIDs {inicio}-{fim - 1}: {len(itens)} itens até aqui")
    return itens, falhos


def e_molecula_neutra_composta(p):
    try:
        c = Q.contagem_atomos(p["MolecularFormula"])
    except ValueError:
        return False
    return len(c) > 1 and (p.get("Charge") in (0, None))


def selecionar(http, pubchem, alvo=ALVO_PADRAO, rapido_n=None, max_cid=MAX_CID_VARREDURA, log=print):
    """Devolve (lista de seleção na ordem final, stats). `rapido_n`: só a lista fixa, limitada a N."""
    itens = lista_fixa.parse_lista()
    if rapido_n is not None:  # modo rápido: resolve só o começo da lista (com folga para os descartes)
        itens = itens[: int(rapido_n * 1.25) + 5]
    fixos, descartados = resolver_lista_fixa(pubchem, itens, log)
    stats = {"listaFixaEntradas": len(itens), "listaFixaResolvidas": len(fixos),
             "listaFixaDescartadas": descartados, "wikidataItens": 0, "wikidataAdicionados": 0, "lotesWikidataFalhos": []}
    if rapido_n is not None:
        return fixos[:rapido_n], stats
    itens_wd, falhos = varrer_wikidata(http, max_cid=max_cid, log=log)
    stats["wikidataItens"], stats["lotesWikidataFalhos"] = len(itens_wd), falhos
    usados = {f["cid"] for f in fixos}
    ordem = sorted(itens_wd.items(), key=lambda kv: (-kv[1]["sl"], min(kv[1]["cids"])))
    extras = []
    pendentes = []
    for q, d in ordem:
        if d["cids"] & usados:
            continue
        pendentes.append((q, min(d["cids"]), d["sl"]))
    faltam = max(0, alvo - len(fixos))
    # confere propriedades em blocos (moléculas neutras, mais de um elemento) até completar o alvo
    i = 0
    while len(extras) < faltam and i < len(pendentes):
        bloco = pendentes[i:i + 200]
        i += 200
        props = pubchem.propriedades([c for _, c, _ in bloco])
        for q, cid, sl in bloco:
            p = props.get(cid)
            if not p or not e_molecula_neutra_composta(p) or cid in usados:
                continue
            usados.add(cid)
            extras.append({"cid": cid, "classes": [], "origem": "wikidata", "wikidata": q, "sitelinks": sl})
            if len(extras) >= faltam:
                break
    stats["wikidataAdicionados"] = len(extras)
    return fixos + extras, stats
