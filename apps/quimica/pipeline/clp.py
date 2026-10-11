# -*- coding: utf-8 -*-
"""
Frases de perigo (H/EUH) em português: texto do Anexo III do Regulamento (CE) n.º 1272/2008 (CLP), publicado no
Jornal Oficial da UE e distribuído pelo EUR-Lex / Serviço de Publicações da UE (Cellar). Legislação com reuso livre
("you can re-use the legal documents published in EUR-Lex"); citar a fonte e indicar alterações (nenhuma é feita no texto).

O Anexo III é uma tabela multilíngue: para cada código vem uma linha por idioma ("PT" + texto). Extraímos a linha PT.
Também reúne os rótulos em português dos pictogramas GHS (autoria própria, descritivos) e das palavras de advertência.
"""
import html as _html
import re

CELEX_BASE = "02008R1272"
URL_CELLAR_SPARQL = "https://publications.europa.eu/webapi/rdf/sparql"
URL_CELLAR = "http://publications.europa.eu/resource/celex/{celex}"
URL_EURLEX = "https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:{celex}"
NOME_FONTE = "Regulamento (CE) n.º 1272/2008 (CLP), Anexo III, texto consolidado, EUR-Lex"
LICENCA = "reutilização livre da legislação (EUR-Lex); citar a fonte"

_CODIGO = re.compile(r"^(H\d{3}[A-Za-z]*|EUH\d{3}[A-Z]?)\s*(\+)?$")
_MARCAS = re.compile(r"►[^◄]*◄|\(\d+\)|▼\S*")

PICTOGRAMAS = {
    "GHS01": "Bomba explodindo (explosivo)",
    "GHS02": "Chama (inflamável)",
    "GHS03": "Chama sobre círculo (comburente)",
    "GHS04": "Botijão de gás (gás sob pressão)",
    "GHS05": "Corrosão (corrosivo)",
    "GHS06": "Caveira e tíbias cruzadas (toxicidade aguda)",
    "GHS07": "Ponto de exclamação (irritante, nocivo)",
    "GHS08": "Perigo para a saúde (sistêmico)",
    "GHS09": "Meio ambiente (perigoso para o ambiente aquático)",
}
PALAVRAS_SINAL = {"Perigo": "Danger", "Atenção": "Warning"}


def norm_codigo(c):
    return re.sub(r"\s+", "", c)


def _texto_p(trecho):
    t = re.sub(r"<[^>]+>", "", trecho)
    return re.sub(r"\s+", " ", _html.unescape(t)).strip()


def parse_anexo_iii(xhtml):
    """Devolve {código sem espaços: texto em português}. Levanta ValueError se o Anexo III não for encontrado.

    Na versão consolidada o código vem com marcas de alteração ("H200 ►M2 ◄") e os combinados ficam em células
    separadas ("H300 +", "H310 +", "H330")."""
    ini = re.search(r"ANEXO\s*(?:<[^>]*>\s*)*III(?![IV])", xhtml)
    if not ini:
        raise ValueError("Anexo III não encontrado (formato do documento mudou?)")
    fim = re.search(r"ANEXO\s*(?:<[^>]*>\s*)*IV(?![IVX])", xhtml[ini.end():])
    seg = xhtml[ini.end(): ini.end() + fim.start()] if fim else xhtml[ini.end():]
    tokens = [_texto_p(m.group(1)) for m in re.finditer(r"<p[^>]*>(.*?)</p>", seg, flags=re.S)]
    frases, partes, atual, esperando = {}, [], None, False
    for t in tokens:
        t = _MARCAS.sub("", t).strip()
        if not t:
            continue
        m = _CODIGO.match(t)
        if m:
            partes.append(m.group(1))
            if not m.group(2):
                atual, partes, esperando = "+".join(partes), [], False
        elif t == "PT" and atual:
            esperando = True
        elif esperando:
            frases.setdefault(atual, t)
            esperando = False
    return frases


def ultima_consolidada(http, hoje):
    """CELEX da última versão consolidada em vigor até `hoje` (consulta o SPARQL do Serviço de Publicações da UE)."""
    import urllib.parse
    q = ('PREFIX cdm: <http://publications.europa.eu/ontology/cdm#> SELECT DISTINCT ?c WHERE { ?w cdm:resource_legal_id_celex ?c . '
         'FILTER(STRSTARTS(STR(?c),"%s-")) } ORDER BY DESC(?c) LIMIT 40' % CELEX_BASE)
    r = http.get(URL_CELLAR_SPARQL, dados=urllib.parse.urlencode({"query": q}).encode(),
                 cabecalhos={"Accept": "application/sparql-results+json",
                             "Content-Type": "application/x-www-form-urlencoded"})
    limite = hoje.replace("-", "")
    datas = sorted(b["c"]["value"] for b in r.json()["results"]["bindings"]
                   if re.fullmatch(CELEX_BASE + r"-\d{8}", b["c"]["value"]) and b["c"]["value"][-8:] <= limite)
    if not datas:
        raise RuntimeError("nenhuma versão consolidada do CLP encontrada")
    return datas[-1]


def coletar(http, hoje):
    """Devolve (dicionário, stats). O XHTML do Cellar tem ~29 MB; fica em cache gzip."""
    celex = ultima_consolidada(http, hoje)
    r = http.get(URL_CELLAR.format(celex=celex), cabecalhos={"Accept": "application/xhtml+xml", "Accept-Language": "por"})
    if r.status != 200:
        raise RuntimeError(f"Cellar devolveu HTTP {r.status}")
    frases = parse_anexo_iii(r.corpo.decode("utf-8", errors="replace"))
    if len(frases) < 70:
        raise RuntimeError(f"Anexo III com poucas frases ({len(frases)}): formato mudou?")
    return frases, {"celex": celex, "url": URL_EURLEX.format(celex=celex),
                    "frasesH": len([c for c in frases if c.startswith("H")]),
                    "frasesEUH": len([c for c in frases if c.startswith("EUH")]),
                    "combinadas": len([c for c in frases if "+" in c])}
