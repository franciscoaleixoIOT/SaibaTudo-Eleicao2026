# -*- coding: utf-8 -*-
"""
Textos licenciados (DATA_CONTRACT §5) e utilidades de empacotamento em trechos.

Fontes de texto do pacote (docs/FONTES_E_LICENCAS.md §5):
- Wikipédia em português e Wikilivros (Wikibooks) em português: CC BY-SA 4.0 (coleta_wikimedia.py)
- ChEBI: CC BY 4.0, definições dos compostos (coleta_chebi.py -> textos/chebi/)
- *The Chemical History of a Candle* (Faraday, 1861), Project Gutenberg #14474: domínio público (este módulo)
- IUPAC Gold Book (CC BY-SA 4.0 por verbete): o site responde 403 (Cloudflare) a clientes automáticos; não é contornado
- OpenStax *Chemistry 2e*: REMOVIDA (CC BY-NC-SA 4.0 e cláusula contra IA generativa). Nenhum texto dela é coletado.

Trechos de 400 a 1.200 caracteres, quebrados em fronteiras de parágrafo (parágrafos maiores são divididos em frases).
"""
import html
import re
import zipfile
from html.parser import HTMLParser
from pathlib import Path

import quimica_util as Q

URL_GUTENBERG = "https://www.gutenberg.org/cache/epub/14474/pg14474-images.html"
URL_GUTENBERG_PAGINA = "https://www.gutenberg.org/ebooks/14474"
NOME_GUTENBERG = "Project Gutenberg #14474 (Faraday, 1861)"
FONTE_GUTENBERG_DIR = "gutenberg-14474"

URL_GOLDBOOK = "https://goldbook.iupac.org/"

MINIMO, MAXIMO = 400, 1200
MINIMO_ABSOLUTO = 120

# elementos químicos citados pelo nome em inglês (para `entidades.elementos`); "lead" e "tin" são palavras comuns
_AMBIGUOS = {"lead", "tin"}


def limpar(t):
    t = t.replace("\u00a0", " ").replace("\u200b", "")
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"\s+([,.;:!?%)])", r"\1", t)
    t = re.sub(r"([(])\s+", r"\1", t)
    return t


# ---- empacotamento em trechos
def dividir_frases(texto, maximo=MAXIMO):
    """Divide um parágrafo maior que `maximo` em pedaços (fronteira de frase; em último caso, de palavra)."""
    frases = re.split(r"(?<=[.!?])\s+(?=[A-Z“\"(\[])", texto)
    partes, atual = [], ""
    for fr in frases:
        while len(fr) > maximo:  # frase gigante
            corte = fr.rfind(" ", 0, maximo)
            corte = corte if corte > 0 else maximo
            if atual:
                partes.append(atual)
                atual = ""
            partes.append(fr[:corte])
            fr = fr[corte:].strip()
        if atual and len(atual) + 1 + len(fr) > maximo:
            partes.append(atual)
            atual = fr
        else:
            atual = (atual + " " + fr).strip()
    if atual:
        partes.append(atual)
    return partes


def empacotar(unidades, minimo=MINIMO, maximo=MAXIMO, minimo_absoluto=MINIMO_ABSOLUTO):
    """Agrupa unidades (parágrafos) em trechos de `minimo`..`maximo` caracteres. Devolve (trechos, curtos).

    Cada trecho: {cabecalho, texto, termos}. Quebra só em fronteira de parágrafo (ou de frase se o parágrafo > maximo).
    Um novo subtítulo começa novo trecho quando o atual já tem `minimo`."""
    atomos = []
    for u in unidades:
        if len(u["texto"]) > maximo:
            for p in dividir_frases(u["texto"], maximo):
                atomos.append({"cabecalho": u["cabecalho"], "texto": p, "termos": u["termos"]})
        else:
            atomos.append(dict(u))
    trechos, atual = [], None

    def tam(t):
        return len(t["texto"])

    def fechar():
        nonlocal atual
        if atual:
            trechos.append(atual)
        atual = None

    for a in atomos:
        if atual is None:
            atual = {"cabecalho": a["cabecalho"], "texto": a["texto"], "termos": list(a["termos"]), "_n": 1,
                     "_ult": len(a["texto"])}
            continue
        novo_cabecalho = a["cabecalho"] != atual["cabecalho"] and tam(atual) >= minimo
        if tam(atual) + 2 + len(a["texto"]) > maximo or novo_cabecalho:
            fechar()
            atual = {"cabecalho": a["cabecalho"], "texto": a["texto"], "termos": list(a["termos"]), "_n": 1,
                     "_ult": len(a["texto"])}
        else:
            atual["texto"] += "\n\n" + a["texto"]
            atual["termos"] += a["termos"]
            atual["_n"] += 1
            atual["_ult"] = len(a["texto"])
    fechar()
    # junta trechos curtos aos vizinhos quando couber
    mesclados = []
    for t in trechos:
        if mesclados and tam(t) < minimo and tam(mesclados[-1]) + 2 + tam(t) <= maximo:
            ant = mesclados[-1]
            ant["texto"] += "\n\n" + t["texto"]
            ant["termos"] += t["termos"]
        else:
            mesclados.append(t)
    saida, curtos = [], 0
    for i, t in enumerate(mesclados):
        if tam(t) < minimo:
            if tam(t) < minimo_absoluto:
                if saida and tam(saida[-1]) + 2 + tam(t) <= int(maximo * 1.25):
                    saida[-1]["texto"] += "\n\n" + t["texto"]
                    saida[-1]["termos"] += t["termos"]
                continue
            curtos += 1
        saida.append(t)
    return saida, curtos


# ---- entidades e palavras-chave
def palavras_chave(termos, cabecalho):
    vistos, out = set(), []
    for t in termos:
        k = t.lower().strip(" .,:;")
        if 2 < len(k) <= 60 and k not in vistos:
            vistos.add(k)
            out.append(k)
        if len(out) >= 8:
            break
    if cabecalho and not out:
        out.append(cabecalho.lower())
    return out


def elementos_no_texto(texto, nomes_en):
    """nomes_en: {nome inglês em minúsculas: símbolo}. Devolve os símbolos citados (ordem de primeira aparição)."""
    achados = {}
    for m in re.finditer(r"[A-Za-z]+", texto):
        w = m.group(0).lower()
        if w in nomes_en and w not in _AMBIGUOS and w not in achados:
            achados[w] = nomes_en[w]
    return list(achados.values())


# ===================================================================================================== Gutenberg
class _PG(HTMLParser):
    """Extrai seções (h2/h5 'LECTURE ...') e parágrafos do HTML do Project Gutenberg."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.secoes = []  # [{"nome", "subtitulo", "paragrafos": []}]
        self._atual = None
        self._buf = None
        self._tag = None
        self._ignorar = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "header", "footer"):
            self._ignorar += 1
        if self._ignorar:
            return
        if tag in ("h2", "h4", "h5", "p", "li", "blockquote"):
            self._buf, self._tag = [], tag
        elif tag == "br" and self._buf is not None:
            self._buf.append(" ")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "header", "footer"):
            self._ignorar = max(0, self._ignorar - 1)
            return
        if self._ignorar or self._buf is None or tag != self._tag:
            return
        texto = limpar("".join(self._buf))
        self._buf, self._tag = None, None
        if not texto:
            return
        if tag == "h2":
            self._nova_secao(texto)
        elif tag == "h5" and re.match(r"LECTURE\s+[IVX]+\.?$", texto):
            self._nova_secao(texto)
        elif tag in ("h5", "h4"):
            if self._atual is not None and not self._atual["paragrafos"] and not self._atual["subtitulo"]:
                self._atual["subtitulo"] = texto
        elif self._atual is not None:
            if not texto.startswith("[Footnote") and not texto.startswith("[Illustration"):
                self._atual["paragrafos"].append(texto)

    def _nova_secao(self, nome):
        if nome.upper().startswith("THE CHEMICAL HISTORY OF A CANDLE"):
            self._atual = None
            return
        self._atual = {"nome": nome, "subtitulo": "", "paragrafos": []}
        self.secoes.append(self._atual)

    def handle_data(self, data):
        if self._buf is not None and not self._ignorar:
            self._buf.append(data)


_ROMANOS = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6}


def secoes_gutenberg(html_texto):
    p = _PG()
    p.feed(html_texto)
    out = []
    for s in p.secoes:
        nome = s["nome"].strip()
        up = nome.upper().rstrip(".")
        if up in ("CONTENTS", "NOTES") or up.startswith("THE FULL PROJECT GUTENBERG") or not s["paragrafos"]:
            continue
        m = re.match(r"LECTURE\s+([IVX]+)$", up)
        if up == "PREFACE":
            chave, rotulo = "preface", "Preface"
        elif m and m.group(1) in _ROMANOS:
            chave, rotulo = f"lecture-{_ROMANOS[m.group(1)]}", f"Lecture {m.group(1)}"
        elif up == "LECTURE ON PLATINUM":
            chave, rotulo = "lecture-platinum", "Lecture on Platinum"
        else:
            continue
        out.append({"chave": chave, "rotulo": rotulo, "subtitulo": s["subtitulo"], "paragrafos": s["paragrafos"]})
    return out


def coletar_gutenberg(html_texto, hoje, nomes_en=None):
    registros, stats = [], {"secoes": 0, "trechos": 0, "trechosCurtos": 0, "caracteres": 0}
    for s in secoes_gutenberg(html_texto):
        unid = [{"cabecalho": s["rotulo"], "texto": p, "termos": []} for p in s["paragrafos"]]
        trechos, curtos = empacotar(unid)
        stats["secoes"] += 1
        stats["trechosCurtos"] += curtos
        titulo = s["rotulo"] + (f": {s['subtitulo'].title()}" if s["subtitulo"] else "")
        for i, t in enumerate(trechos, 1):
            registros.append({
                "_arquivo": f"{s['chave']}-{i:03d}.json",
                "id": f"gutenberg-14474-{s['chave']}-{i:03d}",
                "fonte": NOME_GUTENBERG, "licenca": "domínio público", "url": URL_GUTENBERG_PAGINA,
                "capitulo": s["rotulo"], "secao": titulo, "titulo": titulo,
                "textoOriginal": t["texto"], "textoPt": None, "traducao": "pendente", "idioma": "en",
                "historico": True, "palavrasChave": [s["rotulo"].lower()] + (["candle"] if "candle" in t["texto"].lower() else []),
                "entidades": {"elementos": elementos_no_texto(t["texto"], nomes_en or {}), "compostos": []},
                "fontes": [Q.fonte(NOME_GUTENBERG, URL_GUTENBERG_PAGINA, "domínio público", hoje)],
            })
            stats["caracteres"] += len(t["texto"])
        stats["trechos"] += len(trechos)
    return registros, stats


def ler_gutenberg(http, zip_local=None, log=print):
    """HTML do livro: web (via cache) e, se falhar, o zip local indicado."""
    try:
        r = http.get(URL_GUTENBERG)
        if r.status == 200:
            return r.texto("utf-8")
    except Exception as exc:  # noqa: BLE001
        log(f"  [gutenberg] web indisponível ({exc})")
    if zip_local and Path(zip_local).exists():
        with zipfile.ZipFile(zip_local) as z:
            nome = next(n for n in z.namelist() if n.endswith(".html"))
            return z.read(nome).decode("utf-8")
    raise RuntimeError("Gutenberg #14474 indisponível (web e zip local)")
