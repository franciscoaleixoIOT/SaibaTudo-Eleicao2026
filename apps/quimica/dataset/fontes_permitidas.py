# -*- coding: utf-8 -*-
"""Lista de fontes permitidas no dataset (política: docs/FONTES_E_LICENCAS.md §5) e verificação de `fontes[]` de cada par.

Permitido = fontes de `data/quimica/fontes.json` com `dataset: "sim"` (ou, se o arquivo não trouxer esse campo, todas as que não
estiverem na lista proibida) + as fontes internas do gerador (autoria própria, definições do SI, política de segurança, CLP).
Proibido sempre: OpenStax, ICSC, LibreTexts, NIST WebBook, ECHA e qualquer fonte/licença NC (não comercial) ou ND (sem derivações).
"""
import re

from comum import fold

# palavras (sem acento, minúsculas) que NUNCA podem aparecer no nome de uma fonte do dataset
PROIBIDAS_NO_NOME = ("openstax", "icsc", "libretexts", "libre texts", "webbook", "chemistry webbook", "echa", "chemspider", "sdbs", "matweb", "astm",
                     "iso tc", "cameo", "drugbank", "common chemistry", "compound interest", "qnesc", "quimica nova na escola", "campus plastics",
                     "ul prospector", "enem", "inep", "livrosquimica", "atkins", "feltre", "solomons", "clayden", "levine", "mcquarrie")
# fragmentos de licença proibidos (NC / ND)
PROIBIDAS_NA_LICENCA = (r"\bnc\b", r"\bnd\b", "noncommercial", "nao comercial", "no derivatives", "sem derivacoes", r"by-nc", r"by-nd")

# fontes internas do gerador (nome -> licença)
INTERNAS = {
    "autoria propria": "CC BY-SA 4.0",
    "definicoes do si": "CC BY-SA 4.0",
    "politica de seguranca": "CC BY-SA 4.0",
    "regulamento clp": "CC BY 4.0",
}
# lista fixa (igual à §5 de FONTES_E_LICENCAS.md) usada quando fontes.json não existe
FIXA = ["pubchem", "codata", "wikidata", "wikipedia", "wikilivros", "wikibooks", "gold book", "chebi", "gutenberg", "quimica nova", "polimeros",
        "regulamento (ce) n", "clp"]


def _chave(nome: str) -> str:
    n = fold(nome)
    for corte in (" (", " —", " -", ":", ","):
        n = n.split(corte)[0]
    return n.strip()


def chaves_permitidas(fontes_json):
    chaves = set(INTERNAS)
    achou = False
    for f in fontes_json or []:
        if f.get("dataset") not in (None, "sim"):
            continue
        achou = True
        for c in (f.get("id"), f.get("nome")):
            if c:
                chaves.add(_chave(str(c)))
    if not achou:
        chaves |= set(FIXA)
    return {c for c in chaves if len(c) >= 4}


def fonte_ok(fonte: dict, chaves) -> str:
    """'' se a fonte é permitida; senão o motivo."""
    nome = fold(fonte.get("nome") or "")
    lic = fold(fonte.get("licenca") or "")
    if not nome:
        return "fonte sem nome"
    for p in PROIBIDAS_NO_NOME:
        if re.search(r"(?<![a-z0-9])" + re.escape(p) + r"(?![a-z0-9])", nome):
            return f"fonte proibida: {fonte.get('nome')!r}"
    for p in PROIBIDAS_NA_LICENCA:
        if re.search(p, lic):
            return f"licença NC/ND: {fonte.get('licenca')!r}"
    if not any(c in nome for c in chaves):
        return f"fonte fora da lista permitida: {fonte.get('nome')!r}"
    return ""
