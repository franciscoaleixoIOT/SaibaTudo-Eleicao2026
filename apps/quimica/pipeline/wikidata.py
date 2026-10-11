# -*- coding: utf-8 -*-
"""Consultas SPARQL ao Wikidata (CC0) pelo cache HTTP (1 req/s, `User-Agent` identificado)."""
import urllib.parse

ENDPOINT = "https://query.wikidata.org/sparql"
QID = "http://www.wikidata.org/entity/"


def sparql(http, consulta, post=False, ttl_s=None):
    """Executa a consulta e devolve a lista de linhas (dict nome -> valor em texto). Levanta HttpErro em falha."""
    cab = {"Accept": "application/sparql-results+json"}
    if post:
        corpo = urllib.parse.urlencode({"query": consulta}).encode("utf-8")
        cab["Content-Type"] = "application/x-www-form-urlencoded"
        r = http.get(ENDPOINT, dados=corpo, cabecalhos=cab, ttl_s=ttl_s)
    else:
        r = http.get(ENDPOINT, params={"format": "json", "query": consulta}, cabecalhos=cab, ttl_s=ttl_s)
    if r.status != 200:
        raise RuntimeError(f"SPARQL devolveu HTTP {r.status}")
    dados = r.json()
    return [{k: v["value"] for k, v in linha.items()} for linha in dados["results"]["bindings"]]


def qid(uri):
    return uri.rsplit("/", 1)[-1] if uri else None


def valores(lista_str, sep="|"):
    return [x for x in (lista_str or "").split(sep) if x]
