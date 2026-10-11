# -*- coding: utf-8 -*-
"""
Textos da Wikipédia e do Wikilivros (Wikibooks) em português, CC BY-SA 4.0, pela API de ações da Wikimedia
(`/w/api.php`, requisições em série, 1 req/s, `User-Agent` com contato; ver robots.EXCECOES).

Wikipédia: introdução (seção 0) via `prop=extracts&exintro&explaintext`. Artigos escolhidos por:
  1. os 118 elementos (título do artigo = sitelink ptwiki do item do elemento no Wikidata);
  2. os compostos do núcleo com mais sitelinks (até 150) que têm artigo;
  3. conceitos: cada `chave` de cada tema de `dataset/topicos.json` (título exato; se não existir ou for página de
     desambiguação, a busca `list=search` e o melhor resultado relevante) e uma lista fixa de títulos (FIXOS_CONCEITOS).
Wikilivros: livros "Introdução à Química", "Química Orgânica" e "Química inorgânica" (páginas de conteúdo, sem exercícios).

Cada trecho guarda `url` (permalink com oldid), `urlArtigo`, `revisao` (revid) e, para conceitos, `tema`.
"""
import json
import re
import urllib.parse
from pathlib import Path

import coleta_textos as T
import quimica_util as Q

API_WP = "https://pt.wikipedia.org/w/api.php"
API_WB = "https://pt.wikibooks.org/w/api.php"
NOME_WP = "Wikipédia em português"
NOME_WB = "Wikilivros em português"
LICENCA = "CC BY-SA 4.0"
LOTE_TITULOS = 20
MAX_COMPOSTOS = 150

LIVROS_WIKILIVROS = ["Introdução à Química", "Química Orgânica", "Química inorgânica"]

FIXOS_CONCEITOS = [
    "Química", "Matéria", "Átomo", "Molécula", "Elemento químico", "Substância química", "Composto químico", "Isótopo",
    "Íon", "Tabela periódica", "Número atómico", "Massa atómica", "Configuração electrónica", "Orbital atómico",
    "Modelo atómico de Bohr", "Mecânica quântica", "Ligação química", "Ligação iónica", "Ligação covalente",
    "Ligação metálica", "Ligação de hidrogénio", "Forças intermoleculares", "Regra do octeto", "Geometria molecular",
    "Número de oxidação", "Mol", "Constante de Avogadro", "Massa molar", "Estequiometria", "Reação química",
    "Equação química", "Reagente limitante", "Lei de conservação da massa", "Gás ideal", "Lei de Boyle-Mariotte",
    "Teoria cinética dos gases", "Solução (química)", "Solubilidade", "Concentração (química)", "Propriedade coligativa",
    "Osmose", "Ácido", "Base (química)", "Sal (química)", "Óxido", "pH", "Titulação", "Solução tampão", "Equilíbrio químico",
    "Princípio de Le Chatelier", "Termoquímica", "Entalpia", "Entropia", "Energia livre de Gibbs", "Cinética química",
    "Catalisador", "Energia de ativação", "Eletroquímica", "Eletrólise", "Pilha eletroquímica", "Corrosão",
    "Radioatividade", "Fissão nuclear", "Fusão nuclear", "Química orgânica", "Hidrocarboneto", "Alcano", "Alceno", "Alcino",
    "Álcool", "Aldeído", "Cetona", "Éster", "Ácido carboxílico", "Amina", "Isomeria", "Polímero", "Petróleo", "Carboidrato",
    "Lipídio", "Proteína", "Aminoácido",     "Ácido nucleico", "Cromatografia", "Destilação", "Espectroscopia",
    "Química analítica", "Química inorgânica", "Química verde", "Alquimia", "História da química",
    # títulos exigidos por pares de conceito escritos à mão em dataset/conceitos/ (slug confere 1:1)
    "Sólido", "Solução aquosa", "Reação ácido–base", "Reação de Bosch", "Dispersão de Rayleigh",
    "Açúcar redutor", "Ânion enolato",
]

_STOP = {"para", "como", "entre", "sobre", "pela", "pelo", "dos", "das", "com", "uma", "que"}


# --------------------------------------------------------------------------------------------- API
def api(http, base, params):
    p = {"format": "json", "formatversion": "2"}
    p.update(params)
    r = http.get(base, params=p, cabecalhos={"Accept": "application/json"})
    if r.status != 200:
        raise RuntimeError(f"API Wikimedia devolveu HTTP {r.status}")
    return r.json()


def slug(titulo):
    t = Q.strip_accents(titulo).lower()
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return t or "sem-titulo"


def paginas_intro(http, titulos):
    """{título pedido: página | None}. Segue normalizações e redirecionamentos; página = dict da API."""
    saida = {}
    for i in range(0, len(titulos), LOTE_TITULOS):
        lote = titulos[i:i + LOTE_TITULOS]
        d = api(http, API_WP, {"action": "query", "prop": "extracts|revisions|info|pageprops", "exintro": 1, "explaintext": 1,
                               "exlimit": "max", "rvprop": "ids", "inprop": "url", "ppprop": "disambiguation",
                               "redirects": 1, "titles": "|".join(lote)})
        q = d.get("query", {})
        norm = {n["from"]: n["to"] for n in q.get("normalized", [])}
        red = {r["from"]: r["to"] for r in q.get("redirects", [])}
        paginas = {p["title"]: p for p in q.get("pages", [])}
        for t in lote:
            x = norm.get(t, t)
            for _ in range(5):
                if x in red:
                    x = red[x]
            pg = paginas.get(x)
            saida[t] = None if (pg is None or pg.get("missing")) else pg
    return saida


def e_desambiguacao(pg):
    return "disambiguation" in (pg.get("pageprops") or {})


def pesquisar(http, termo, n=4):
    d = api(http, API_WP, {"action": "query", "list": "search", "srsearch": termo, "srnamespace": 0, "srlimit": n,
                           "srprop": ""})
    return [r["title"] for r in d.get("query", {}).get("search", [])]


def relevante(chave, pg, todas=False):
    """Alguma (ou, com `todas`, cada) palavra significativa da chave aparece no título ou no começo da introdução."""
    palavras = [w for w in re.findall(r"\w+", Q.norm(chave)) if len(w) >= 4 and w not in _STOP]
    if not palavras:
        return True
    texto = Q.norm(pg["title"] + " " + (pg.get("extract") or "")[:500])
    achou = [w[:5] in texto for w in palavras]
    return all(achou) if todas else any(achou)


_VOCAB_QUIMICA = ("quimic", "quimica", "atomo", "atomic", "molecul", "composto", "acido", "solucao", "eletron", "ligacao",
                  "reacao", "substancia", "polimero", "oxid", "organic", "cristal", "mistura", "elemento")


def tem_vocabulario_quimica(pg):
    """Filtro dos resultados de BUSCA: a introdução precisa falar de química (evita 'Grupo étnico', 'Mick Thomson'...)."""
    texto = Q.norm((pg.get("extract") or "")[:800])
    return sum(1 for v in _VOCAB_QUIMICA if v in texto) >= 2


# Chaves de dataset/topicos.json cujo artigo certo não é o primeiro resultado da busca (títulos conferidos na API).
SOBRESCRITAS = {
    "thomson": ["Joseph John Thomson"], "grupo": ["Grupo (química)"], "periodo": ["Período (química)"],
    "mar de eletrons": ["Ligação metálica"], "base": ["Base (química)"], "neutralizacao": ["Salificação"],
    "reacao de deslocamento": ["Reação de simples troca"], "composicao centesimal": ["Fórmula percentual"],
    "dispersao": ["Dispersão (química)"], "suspensao": ["Suspensão (química)"], "curva de solubilidade": ["Solubilidade"],
    "titulo": ["Título (química)"], "deslocamento de equilibrio": ["Princípio de Le Châtelier"],
    "hidrolise salina": ["Hidrólise"], "agente redutor": ["Redução"], "balanceamento redox": ["Oxirredução"],
    "carbono assimetrico": ["Isomeria espacial"], "espontaneidade": ["Processo espontâneo"],
    "ligante": ["Ligante (química inorgânica)"], "sn1": ["Reação SN1"], "sn2": ["Reação SN2"],
    "orientacao orto, meta e para": ["Substituição eletrofílica aromática"],
    "ressonancia magnetica nuclear": ["Espectroscopia NMR"], "condutividade": ["Condutividade elétrica"],
    "emissao": ["Emissão espontânea"], "absorcao": ["Absorção (química)"], "volumetria": ["Titulação"],
    "lei de velocidade": ["Cinética química"], "solucao saturada": ["Solução"],
    "algarismos significativos": ["Algarismo significativo"], "datacao por carbono-14": ["Carbono-14"],
    "produto de solubilidade": ["Equilíbrio de solubilidade"], "reciclagem de plasticos": ["Reciclagem de plástico"],
    "fila de reatividade": ["Reatividade"], "forca de london": ["Força de Van der Waals"],
    "nitrocomposto": ["Composto nitrogenado"], "regra das fases": ["Regra das fases de Gibbs"],
}
CHAVES_IGNORADAS = {"prefixo", "indice de fluidez", "pureza", "nomenclatura de acidos", "ficha de seguranca", "e1", "e2",
                    "acidos e bases duros e moles", "solvente nao aquoso", "mistura de solucoes", "isomeria em complexos",
                    "misturar produtos de limpeza", "temperatura de fusao de polimero", "produto ionico da agua"}


def titulos_ptwiki_por_qid(http, qids):
    """{QID: título do artigo na Wikipédia em português} via SPARQL (CC0)."""
    import wikidata as W
    saida = {}
    qids = sorted(set(qids))
    for i in range(0, len(qids), 150):
        lote = qids[i:i + 150]
        q = ("SELECT ?item ?t WHERE { VALUES ?item { %s } ?a schema:about ?item ; schema:isPartOf <https://pt.wikipedia.org/> ; "
             "schema:name ?t }" % " ".join("wd:" + x for x in lote))
        for l in W.sparql(http, q, post=True):
            saida[W.qid(l["item"])] = l["t"]
    return saida


# --------------------------------------------------------------------------------------------- registros
def _unidades(extract, titulo):
    return [{"cabecalho": titulo, "texto": T.limpar(p), "termos": []}
            for p in (extract or "").split("\n") if T.limpar(p)]


def _permalink(base_wiki, titulo, revid):
    return f"https://{base_wiki}/w/index.php?title={urllib.parse.quote(titulo.replace(' ', '_'))}&oldid={revid}"


def registros_pagina(pg, base_wiki, nome_fonte, dir_slug, hoje, extra=None, entidades=None, palavras=None, usados=None,
                     capitulo="", secao=None, unidades=None):
    """Converte uma página em registros (trechos de 400-1200 caracteres). `usados`: conjunto de slugs já emitidos."""
    titulo = pg["title"]
    revid = (pg.get("revisions") or [{}])[0].get("revid")
    unid = unidades if unidades is not None else _unidades(pg.get("extract"), titulo)
    trechos, curtos = T.empacotar(unid, minimo_absoluto=40)  # introduções curtas de elementos ainda valem
    base = slug(titulo)
    if usados is not None:
        n = 2
        orig = base
        while base in usados:
            base = f"{orig}-{n}"
            n += 1
        usados.add(base)
    permalink = _permalink(base_wiki, titulo, revid) if revid else f"https://{base_wiki}/wiki/{urllib.parse.quote(titulo.replace(' ', '_'))}"
    url_artigo = pg.get("fullurl") or f"https://{base_wiki}/wiki/{urllib.parse.quote(titulo.replace(' ', '_'))}"
    regs = []
    for i, t in enumerate(trechos, 1):
        reg = {
            "_arquivo": f"{base}-{i:03d}.json", "id": f"{dir_slug}-{base}-{i:03d}",
            "fonte": nome_fonte, "licenca": LICENCA, "url": permalink, "urlArtigo": url_artigo,
            "capitulo": capitulo or titulo, "secao": secao or "Introdução", "titulo": t["cabecalho"],
            "textoOriginal": t["texto"], "textoPt": t["texto"], "traducao": "não se aplica (original em português)",
            "idioma": "pt", "revisao": revid, "palavrasChave": (palavras or [titulo.lower()])[:8],
            "entidades": entidades or {"elementos": [], "compostos": []},
            "fontes": [Q.fonte(f"{nome_fonte}: {titulo}", url_artigo, LICENCA, hoje)],
        }
        if extra:
            reg.update(extra)
        regs.append(reg)
    return regs, curtos


# --------------------------------------------------------------------------------------------- Wikipédia
def ler_topicos(caminho):
    """{chave: [ids de tema]} e {tema id: nome}."""
    d = json.loads(Path(caminho).read_text(encoding="utf-8"))
    chaves, nomes = {}, {}
    for area in d.get("areas", []):
        for tema in area.get("temas", []):
            nomes[tema["id"]] = tema["nome"]
            for c in tema.get("chaves", []):
                chaves.setdefault(c.strip(), []).append(tema["id"])
    return chaves, nomes


def coletar_wikipedia(http, elementos, compostos, meta, topicos_json, hoje, limites=None, log=print):
    """Devolve (registros, stats). `limites`: {"elementos": n, "compostos": n, "conceitos": n} (modo rápido)."""
    lim = limites or {}
    stats = {"elementos": 0, "compostos": 0, "conceitos": 0, "trechos": 0, "trechosPorTema": {}, "temasSemArtigo": [],
             "chavesSemArtigo": [], "descartados": [], "trechosCurtos": 0}
    regs, usados, vistos_pageid = [], set(), {}

    def emitir(pg, **kw):
        if pg["pageid"] in vistos_pageid:
            return 0
        rs, curtos = registros_pagina(pg, "pt.wikipedia.org", NOME_WP, "wikipedia-pt", hoje, usados=usados, **kw)
        stats["trechosCurtos"] += curtos
        vistos_pageid[pg["pageid"]] = rs
        regs.extend(rs)
        return len(rs)

    # 1. elementos
    els = [e for e in elementos if e.get("wikidata")][: lim.get("elementos", 999)]
    tit_q = titulos_ptwiki_por_qid(http, [e["wikidata"] for e in els])
    pedidos = {e["z"]: tit_q.get(e["wikidata"]) or e["nome"] for e in els}
    paginas = paginas_intro(http, sorted(set(pedidos.values())))
    for e in els:
        pg = paginas.get(pedidos[e["z"]])
        if not pg or e_desambiguacao(pg):
            stats["descartados"].append({"tipo": "elemento", "z": e["z"], "titulo": pedidos[e["z"]]})
            continue
        if emitir(pg, entidades={"elementos": [e["simbolo"]], "compostos": []},
                  palavras=[pg["title"].lower(), e["nome"].lower(), e["simbolo"]], extra={"tipo": "elemento"}):
            stats["elementos"] += 1
    log(f"  [wikipedia] elementos: {stats['elementos']}")

    # 2. compostos mais conhecidos
    cand = sorted((c for c in compostos if meta.get(c["cid"], {}).get("ptwiki")),
                  key=lambda c: -meta[c["cid"]]["sl"])[: lim.get("compostos", MAX_COMPOSTOS)]
    paginas = paginas_intro(http, sorted({meta[c["cid"]]["ptwiki"] for c in cand}))
    for c in cand:
        pg = paginas.get(meta[c["cid"]]["ptwiki"])
        if not pg or e_desambiguacao(pg):
            stats["descartados"].append({"tipo": "composto", "cid": c["cid"], "titulo": meta[c["cid"]]["ptwiki"]})
            continue
        if emitir(pg, entidades={"elementos": [], "compostos": [c["cid"]]},
                  palavras=[pg["title"].lower(), c["nome"].lower(), c["formula"]], extra={"tipo": "composto"}):
            stats["compostos"] += 1
    log(f"  [wikipedia] compostos: {stats['compostos']}")

    # 3. conceitos: chaves dos temas + títulos fixos
    chaves, nomes_tema = ler_topicos(topicos_json) if topicos_json and Path(topicos_json).exists() else ({}, {})
    chaves_lista = list(chaves)[: lim.get("conceitos", 99999)]
    # sobrescritas manuais (título certo no lugar do resultado ambíguo da busca) e chaves sem artigo adequado
    sobre = {c: SOBRESCRITAS[Q.norm(c)] for c in chaves_lista if Q.norm(c) in SOBRESCRITAS}
    ignoradas = [c for c in chaves_lista if Q.norm(c) in CHAVES_IGNORADAS]
    paginas = paginas_intro(http, [c for c in chaves_lista if c not in sobre and c not in ignoradas])
    paginas_sobre = paginas_intro(http, sorted({t for ts in sobre.values() for t in ts}))
    resolvidos = {}
    for chave in chaves_lista:
        if chave in ignoradas:
            continue
        if chave in sobre:
            for t in sobre[chave]:
                pg = paginas_sobre.get(t)
                if pg and not e_desambiguacao(pg):
                    resolvidos[chave] = pg
                    break
            continue
        pg = paginas.get(chave)
        if pg and not e_desambiguacao(pg) and relevante(chave, pg):
            resolvidos[chave] = pg
    pendentes = [c for c in chaves_lista if c not in resolvidos and c not in ignoradas and c not in sobre]
    for chave in pendentes:  # busca: só aceita resultado com vocabulário de química e todas as palavras da chave
        achados = []
        for consulta in (f"{chave} química", chave):
            achados += [t for t in pesquisar(http, consulta, 4) if t not in achados]
        if not achados:
            continue
        cand_pg = paginas_intro(http, achados)
        for t in achados:
            pg = cand_pg.get(t)
            if pg and not e_desambiguacao(pg) and relevante(chave, pg, todas=True) and tem_vocabulario_quimica(pg):
                resolvidos[chave] = pg
                break
    temas_pagina, paginas_conceito = {}, {}
    for chave in chaves_lista:
        pg = resolvidos.get(chave)
        if not pg:
            stats["chavesSemArtigo"].append(chave)
            continue
        paginas_conceito.setdefault(pg["pageid"], (pg, chave))
        temas_pagina.setdefault(pg["pageid"], set()).update(chaves[chave])
    for pid, (pg, chave) in paginas_conceito.items():
        if emitir(pg, palavras=[pg["title"].lower(), chave.lower()], extra={"tipo": "conceito"}):
            stats["conceitos"] += 1
    # `tema` (primeiro) e `temas` (todos) em todos os trechos do artigo, inclusive os já emitidos como elemento/composto
    for pid, temas in temas_pagina.items():
        ts = sorted(temas)
        for r in vistos_pageid.get(pid, []):
            r["tema"] = ts[0]
            if len(ts) > 1:
                r["temas"] = ts
    contagem = {}
    for r in regs:
        for t in (r.get("temas") or ([r["tema"]] if r.get("tema") else [])):
            contagem[t] = contagem.get(t, 0) + 1
    stats["trechosPorTema"] = dict(sorted(contagem.items()))
    stats["temasSemArtigo"] = sorted(t for t in nomes_tema if not contagem.get(t))

    fixos = FIXOS_CONCEITOS[: lim.get("conceitos", 99999)]
    paginas = paginas_intro(http, fixos)
    for t in fixos:
        pg = paginas.get(t)
        if pg and not e_desambiguacao(pg):
            if emitir(pg, palavras=[pg["title"].lower()], extra={"tipo": "conceito"}):
                stats["conceitos"] += 1
    stats["trechos"] = len(regs)
    stats["artigos"] = len(vistos_pageid)
    log(f"  [wikipedia] conceitos: {stats['conceitos']} | trechos: {len(regs)}")
    return regs, stats


# --------------------------------------------------------------------------------------------- Wikilivros
def paginas_do_livro(http, livro):
    titulos, cont = [], {}
    while True:
        d = api(http, API_WB, dict({"action": "query", "list": "allpages", "apprefix": livro, "apnamespace": 0, "aplimit": 500}, **cont))
        titulos += [p["title"] for p in d["query"]["allpages"]]
        if "continue" not in d:
            break
        cont = d["continue"]
    out = []
    for t in titulos:
        if t != livro and not t.startswith(livro + "/"):
            continue
        ultimo = t.rsplit("/", 1)[-1].lower()
        if ultimo.startswith(("exerc", "capa", "índice", "indice", "bibliografia", "autores", "licen")):
            continue
        out.append(t)
    return out


_CAB = re.compile(r"^(={2,6})\s*(.+?)\s*\1\s*$")


def unidades_wikitexto(extract, titulo):
    """Divide o texto simples da página nas seções "== X ==" e devolve as unidades (parágrafos) com o cabeçalho."""
    cab, unid = titulo, []
    for linha in (extract or "").split("\n"):
        linha = linha.strip()
        if not linha:
            continue
        m = _CAB.match(linha)
        if m:
            cab = T.limpar(m.group(2)) or titulo
            continue
        unid.append({"cabecalho": cab, "texto": T.limpar(linha), "termos": []})
    return unid


def tem_prosa(extract, minimo=0.5):
    """True se pelo menos `minimo` do texto está em linhas longas (parágrafos); sumários e listas de links ficam de fora."""
    linhas = [l.strip() for l in (extract or "").split("\n") if l.strip() and not _CAB.match(l.strip())]
    total = sum(len(l) for l in linhas)
    return total > 0 and sum(len(l) for l in linhas if len(l) >= 60) / total >= minimo


def coletar_wikilivros(http, hoje, limite_paginas=None, log=print):
    stats = {"livros": {}, "paginas": 0, "trechos": 0, "paginasCurtas": [], "trechosCurtos": 0}
    regs, usados = [], set()
    n_pag = 0
    for livro in LIVROS_WIKILIVROS:
        titulos = paginas_do_livro(http, livro)
        stats["livros"][livro] = len(titulos)
        for t in titulos:
            if limite_paginas is not None and n_pag >= limite_paginas:
                break
            d = api(http, API_WB, {"action": "query", "prop": "extracts|revisions|info", "explaintext": 1, "rvprop": "ids",
                                   "inprop": "url", "redirects": 1, "titles": t})
            pgs = d.get("query", {}).get("pages", [])
            pg = pgs[0] if pgs else None
            if not pg or pg.get("missing") or len(pg.get("extract") or "") < 250:
                stats["paginasCurtas"].append(t)
                continue
            if t == livro or not tem_prosa(pg["extract"]):
                stats["paginasCurtas"].append(t)
                continue
            n_pag += 1
            unid = unidades_wikitexto(pg["extract"], pg["title"])
            rs, curtos = registros_pagina(pg, "pt.wikibooks.org", NOME_WB, "wikilivros-pt", hoje, usados=usados,
                                          palavras=[livro.lower(), pg["title"].lower()], capitulo=livro,
                                          secao=pg["title"], unidades=unid, extra={"tipo": "livro"})
            stats["trechosCurtos"] += curtos
            regs.extend(rs)
        log(f"  [wikilivros] {livro}: {stats['livros'][livro]} páginas")
    stats["paginas"] = n_pag
    stats["trechos"] = len(regs)
    return regs, stats
