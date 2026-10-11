"""Gera data/geo/ufs.json: contornos simplificados das 27 UFs (malha oficial do IBGE, qualidade mínima).

Usado pelo app e pelo site para SUGERIR o estado a partir da localização aproximada do aparelho. O cálculo
(ponto-no-polígono) é feito no próprio aparelho: a localização nunca é enviada a servidor nenhum.

Fonte: IBGE — API de malhas territoriais v3 (https://servicodados.ibge.gov.br/api/docs/malhas?versao=3).
Uso: python pipeline/geo_ufs.py   (só stdlib; rode quando o IBGE publicar nova malha — fronteiras raramente mudam)
"""
from __future__ import annotations

import gzip
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "data" / "geo" / "ufs.json"
URL_MALHA = ("https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR"
             "?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF")
URL_UFS = "https://servicodados.ibge.gov.br/api/v1/localidades/estados"
CASAS = 3  # ~110 m: suficiente para sugerir a UF (a escolha final é sempre do usuário)


def baixar(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "SaibaTudo-pipeline/1.0 (+https://saibatudo.net)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        corpo = r.read()
    if corpo[:2] == b"\x1f\x8b":  # o IBGE responde em gzip mesmo sem Accept-Encoding
        corpo = gzip.decompress(corpo)
    return json.loads(corpo.decode("utf-8"))


def arredondar(anel):
    pts = []
    for lon, lat in anel:
        p = [round(lon, CASAS), round(lat, CASAS)]
        if not pts or pts[-1] != p:
            pts.append(p)
    return pts


def main():
    siglas = {str(e["id"]): e["sigla"] for e in baixar(URL_UFS)}
    malha = baixar(URL_MALHA)
    ufs = {}
    for f in malha["features"]:
        sigla = siglas[str(f["properties"]["codarea"])]
        g = f["geometry"]
        poligonos = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        ufs[sigla] = [[arredondar(anel) for anel in poligono] for poligono in poligonos]
    if len(ufs) != 27:
        raise SystemExit(f"esperadas 27 UFs, vieram {len(ufs)}")
    saida = {
        "fonte": "IBGE — Malhas territoriais (API v3), contorno das UFs em qualidade mínima",
        "url": URL_MALHA,
        "licenca": "Dados públicos do IBGE; citar a fonte",
        "geradoEm": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "formato": "ufs[SIGLA] = lista de polígonos; polígono = [anel externo, buracos...]; ponto = [lon, lat] (WGS84)",
        "ufs": dict(sorted(ufs.items())),
    }
    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    SAIDA.write_text(json.dumps(saida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{SAIDA.relative_to(RAIZ)}: {SAIDA.stat().st_size / 1024:.1f} KB, {sum(len(a) for p in ufs.values() for pol in p for a in pol)} pontos")


if __name__ == "__main__":
    main()
