# -*- coding: utf-8 -*-
"""Gera app/src/main/java/net/saibatudo/quimica/domain/GhsTextos.kt a partir de dataset/ghs_pt.py (frases H, pictogramas,
classes e rótulos em português), o mesmo dicionário que alimenta o site (web/tools/gerar_ghs_js.py) e o dataset.

    python app/tools/gerar_ghs_kt.py
"""
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "dataset"))
import ghs_pt as g  # noqa: E402


def k(s):
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"').replace("$", "\\$") + '"'


def mapa(d, valor=k):
    return ",\n".join(f"        {k(a)} to {valor(b)}" for a, b in d.items())


SPLIT_REGEX = r'Regex("\\s*\\+\\s*")'

linhas = [
    "package net.saibatudo.quimica.domain",
    "",
    "// GERADO por app/tools/gerar_ghs_kt.py a partir de dataset/ghs_pt.py: não edite à mão.",
    "// Frases de perigo (H), pictogramas e rótulos do GHS em português do Brasil, idênticos aos do site.",
    f"// Fonte dos textos padronizados: {g.FONTE_GHS['nome']} ({g.FONTE_GHS['licenca']}).",
    "",
    "/** Textos padronizados do GHS em português (os mesmos do site). */",
    "object GhsTextos {",
    f"    const val FONTE_NOME = {k(g.FONTE_GHS['nome'])}",
    f"    const val FONTE_LICENCA = {k(g.FONTE_GHS['licenca'])}",
    "",
    "    /** Texto das frases de perigo padronizadas, por código. */",
    "    val FRASES_H: Map<String, String> = mapOf(",
    mapa(g.FRASES_H),
    "    )",
    "",
    "    /** Pictograma: descrição do desenho e quando aparece. */",
    "    val PICTOGRAMAS: Map<String, Pair<String, String>> = mapOf(",
    ",\n".join(f"        {k(a)} to ({k(b[0])} to {k(b[1])})" for a, b in g.PICTOGRAMAS.items()),
    "    )",
    "",
    "    val CLASSES_PT: Map<String, String> = mapOf(",
    mapa(g.CLASSES_PT),
    "    )",
    "",
    "    val CATEGORIA_GRUPO_PLURAL: Map<String, String> = mapOf(",
    mapa(g.CATEGORIA_GRUPO_PLURAL),
    "    )",
    "",
    '    /** "H302+H312": texto das frases juntas; null se algum código for desconhecido. */',
    "    fun fraseH(codigo: String): String? {",
    f"        val cods = codigo.trim().split({SPLIT_REGEX})",
    "        if (cods.isEmpty() || cods.any { it !in FRASES_H }) return null",
    "        if (cods.size == 1) return FRASES_H.getValue(cods[0])",
    '        return cods.joinToString(" / ") { FRASES_H.getValue(it).trimEnd(\'.\') } + "."',
    "    }",
    "",
    "    fun classePt(c: String): String = CLASSES_PT[c] ?: c.replace('_', ' ')",
    "}",
    "",
]
saida = RAIZ / "app" / "src" / "main" / "java" / "net" / "saibatudo" / "quimica" / "domain" / "GhsTextos.kt"
saida.write_text("\n".join(linhas), encoding="utf-8")
print("GhsTextos.kt gerado:", len(g.FRASES_H), "frases H,", len(g.PICTOGRAMAS), "pictogramas")
