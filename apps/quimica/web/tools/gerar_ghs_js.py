# -*- coding: utf-8 -*-
"""Gera web/src/quimica/js/ghs.js a partir de dataset/ghs_pt.py (frases H, pictogramas, classes e rótulos em português).

    python web/tools/gerar_ghs_js.py

O mesmo dicionário alimenta o dataset de treino e o site: assim o texto de uma frase H é idêntico nos dois.
"""
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "dataset"))
import ghs_pt as g  # noqa: E402


def js(obj):
    return json.dumps(obj, ensure_ascii=False, indent=1)


saida = f"""// GERADO por web/tools/gerar_ghs_js.py a partir de dataset/ghs_pt.py — não edite à mão.
// Frases de perigo (H), pictogramas e rótulos do GHS em português do Brasil. Fonte dos textos padronizados: UNECE GHS / ECHA CLP.

export const FONTE_GHS = {js(g.FONTE_GHS)};

/** Texto das frases de perigo padronizadas, por código (H200–H420). */
export const FRASES_H = {js(g.FRASES_H)};

/** Pictogramas: [descrição do desenho, quando aparece]. */
export const PICTOGRAMAS = {js({k: list(v) for k, v in g.PICTOGRAMAS.items()})};

export const CLASSES_PT = {js(g.CLASSES_PT)};
export const CATEGORIA_GRUPO_PLURAL = {js(g.CATEGORIA_GRUPO_PLURAL)};
"""
(RAIZ / "web" / "src" / "quimica" / "js" / "ghs.js").write_text(saida, encoding="utf-8")
print("ghs.js gerado:", len(g.FRASES_H), "frases H,", len(g.PICTOGRAMAS), "pictogramas")
