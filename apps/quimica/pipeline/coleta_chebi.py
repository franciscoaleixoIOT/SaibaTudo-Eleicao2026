# -*- coding: utf-8 -*-
"""
ChEBI (EMBL-EBI, CC BY 4.0): definição textual e nomes dos compostos do núcleo que têm ChEBI ID.

O ID vem do Wikidata (P683, CC0). A API pública em lote (`/chebi/backend/api/public/compounds/?chebi_ids=...`) é permitida
pelo robots.txt do EBI, que declara Crawl-delay de 10 s (respeitado em http_cache: 1 requisição a cada 10 s).
Citação exigida: Malik, A. et al. (2025). ChEBI: re-engineered for a sustainable future. Nucleic Acids Research.
"""
import html as _html
import re

import quimica_util as Q

LICENCA = "CC BY 4.0"
URL_API = "https://www.ebi.ac.uk/chebi/backend/api/public/compounds/"
URL_PAGINA = "https://www.ebi.ac.uk/chebi/searchId.do?chebiId=CHEBI:{id}"
CITACAO = "Malik, A. et al. (2025). ChEBI: re-engineered for a sustainable future. Nucleic Acids Research."
LOTE = 60


def limpar_markup(txt):
    """ChEBI usa HTML simples (<sub>, <sup>, <small>, <i>, &#946;...): converte para texto com Unicode."""
    if not txt:
        return txt
    txt = re.sub(r"<sub>(.*?)</sub>", lambda m: Q.subscrito(m.group(1)), txt, flags=re.S)
    txt = re.sub(r"<sup>(.*?)</sup>", lambda m: Q.sobrescrito(m.group(1)), txt, flags=re.S)
    txt = re.sub(r"<[^>]+>", "", txt)
    return re.sub(r"\s+", " ", _html.unescape(txt)).strip()


def extrair(resposta_json):
    """Resposta da API -> {id numérico (int): {"nome", "definicao"|None, "sinonimos": [...]}} só dos existentes."""
    out = {}
    for chave, reg in resposta_json.items():
        if not isinstance(reg, dict) or not reg.get("exists"):
            continue
        d = reg.get("data") or {}
        nomes = d.get("names") or {}
        sin = []
        for tipo in ("SYNONYM", "IUPAC_NAME", "INN", "BRAND_NAME"):
            for n in nomes.get(tipo, []) or []:
                nome = limpar_markup(n.get("name") or "")
                if nome and (n.get("language_code") in (None, "en")) and nome not in sin:
                    sin.append(nome)
        definicao = limpar_markup(d.get("definition") or "") or None
        try:
            out[int(str(reg.get("primary_chebi_id") or chave).replace("CHEBI:", ""))] = {
                "nome": limpar_markup(d.get("name") or ""), "definicao": definicao, "sinonimos": sin}
        except ValueError:
            continue
    return out


def coletar(http, ids, log=print):
    """ids: iterável de inteiros. Devolve ({id: {...}}, stats)."""
    ids = sorted({int(i) for i in ids})
    res, falhas = {}, []
    for i in range(0, len(ids), LOTE):
        lote = ids[i:i + LOTE]
        try:
            r = http.get(URL_API, params={"chebi_ids": ",".join(map(str, lote))})
            if r.status == 200:
                res.update(extrair(r.json()))
            else:
                falhas.append({"ids": f"{lote[0]}-{lote[-1]}", "status": r.status})
        except Exception as exc:  # noqa: BLE001
            falhas.append({"ids": f"{lote[0]}-{lote[-1]}", "erro": str(exc)[:160]})
        log(f"  [chebi] {min(i + LOTE, len(ids))}/{len(ids)}")
    return res, {"solicitados": len(ids), "encontrados": len(res),
                 "comDefinicao": sum(1 for v in res.values() if v["definicao"]), "falhas": falhas}
