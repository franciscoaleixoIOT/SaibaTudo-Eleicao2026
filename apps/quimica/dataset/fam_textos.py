# -*- coding: utf-8 -*-
"""Família CONCEITOS (e SEGURANÇA geral) ancorada em trechos licenciados de `data/quimica/textos/`.

Os pares são ESCRITOS À MÃO (pelo agente, em português do Brasil) em `dataset/conceitos/*.jsonl`, a partir EXCLUSIVAMENTE do
trecho citado, e este módulo os VALIDA e transforma em registros do dataset:
  - `ids` apontam para trechos existentes no pacote (senão o par é recusado);
  - a fonte (nome e licença) é copiada do trecho;
  - todo número da resposta tem de existir no(s) trecho(s) citado(s) (por valor, em formato pt-BR ou en);
  - nada é copiado de obras protegidas.

Formato de cada linha: {"pergunta", "resposta", "nivel", "ids": [...], "tipo": "conceito"|"seguranca", "tema": <id de dataset/topicos.json>}
A cobertura por tema (>= 3 pares por tema; temas sem trecho licenciado ficam como "sem fonte licenciada ainda") vai para stats.json.
"""
import json
import re
from collections import Counter
from decimal import Decimal, InvalidOperation

from comum import AQUI, Resp, fold, ler_json, ler_jsonl, numeros_do_texto, valor_do_token
from qa_base import Ctx

TOPICOS_JSON = AQUI / "topicos.json"
PASTA_AUTORIA = AQUI / "conceitos"
PASTA_AUTORIA_FIXTURE = AQUI / "tests" / "fixtures" / "conceitos"
NIVEIS = {"fundamental", "medio", "superior"}
_SUP_PARA_DIGITO = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹⁻", "0123456789-")


def valores_no_texto(texto: str):
    """Conjunto de valores numéricos (Decimal) presentes em um trecho, em qualquer convenção (1.234,5 | 1,234.5 | 0,5 | 0.5)."""
    vals = set()
    texto = texto.translate(_SUP_PARA_DIGITO)
    # expoentes de potências de dez ("× 1023", "x 10^23", "× 10-27"): o expoente também é um valor presente no trecho
    for m in re.finditer(r"[×x]\s*10\s*\^?\{?\(?([−-]?\d{1,3})\)?\}?", texto):
        try:
            vals.add(Decimal(m.group(1).replace("−", "-")).normalize())
        except InvalidOperation:
            pass
    for m in re.finditer(r"\d[\d.,]*\d|\d", texto):
        tok = m.group(0)
        cands = {re.sub(r"[.,]", "", tok)}
        for sep in ".,":
            if sep in tok:
                i = tok.rindex(sep)
                inteiro, frac = tok[:i], tok[i + 1:]
                cands.add(re.sub(r"[.,]", "", inteiro) + "." + frac)
                j = tok.index(sep)
                cands.add(re.sub(r"[.,]", "", tok[:j]) + "." + re.sub(r"[.,]", "", tok[j + 1:]))
        for c in cands:
            try:
                vals.add(Decimal(c).normalize())
            except InvalidOperation:
                pass
    return vals


def numero_na_fonte(tok: str, vals) -> bool:
    m = re.fullmatch(r"(\d+(?:,\d+)?)\s×\s10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)", tok)
    if m:
        inv = str.maketrans("⁻⁰¹²³⁴⁵⁶⁷⁸⁹", "-0123456789")
        mant = Decimal(m.group(1).replace(",", ".")).normalize()
        expo = Decimal(int(m.group(2).translate(inv))).normalize()
        return mant in vals and expo in vals
    v = valor_do_token(tok)
    if v is None:  # CAS etc.
        return False
    return v.normalize() in vals


def carregar_temas():
    """{id: {nome, area, nivel, chaves}} a partir de dataset/topicos.json (mapa de temas; ideias, não texto)."""
    if not TOPICOS_JSON.exists():
        return {}
    d = ler_json(TOPICOS_JSON)
    out = {}
    for a in d.get("areas", []):
        for t in a.get("temas", []):
            out[t["id"]] = {"id": t["id"], "nome": t["nome"], "area": a["id"], "nivel": a.get("nivel"), "chaves": t.get("chaves", [])}
    return out


def trechos_do_tema(pac, tema):
    """Trechos do pacote de um tema: os que o pipeline marcou com `tema`/`temas`; sem marcação, os que casam com as palavras-chave do tema
    (título, palavras-chave ou início do texto)."""
    marcados = [tid for tid, t in pac.textos.items() if tema.get("id") and (tema["id"] in (t.get("temas") or []) or t.get("tema") == tema["id"])]
    if marcados or any(t.get("tema") or t.get("temas") for t in pac.textos.values()):
        return marcados
    achados = []
    chaves = [fold(c) for c in tema["chaves"]] + [fold(tema["nome"])]
    for tid, t in pac.textos.items():
        alvo = fold(" ".join([t.get("titulo") or "", " ".join(t.get("palavrasChave") or []), (t.get("textoOriginal") or "")[:1500]]))
        if any(c and c in alvo for c in chaves):
            achados.append(tid)
    return achados


def cobertura_por_tema(ctx, pares_por_tema):
    temas = carregar_temas()
    cobertura = {}
    for tid, t in temas.items():
        n = pares_por_tema.get(tid, 0)
        disponiveis = trechos_do_tema(ctx.pac, t)
        if n >= 3:
            status = "ok"
        elif disponiveis:
            status = "faltam pares (há trecho disponível)"
        else:
            status = "sem fonte licenciada ainda"
        cobertura[tid] = {"nome": t["nome"], "nivel": t["nivel"], "pares": n, "trechosDisponiveis": len(disponiveis), "status": status}
    return cobertura


def carregar_linhas(ctx: Ctx):
    pasta = PASTA_AUTORIA_FIXTURE if ctx.pac.eh_fixture else PASTA_AUTORIA
    linhas = []
    if pasta.exists():
        for arq in sorted(pasta.glob("*.jsonl")):
            for i, item in enumerate(ler_jsonl(arq), 1):
                item["_origem"] = f"{arq.name}:{i}"
                linhas.append(item)
    return linhas


def gerar(ctx: Ctx):
    pac = ctx.pac
    por_fonte = Counter()
    rejeitadas = []
    temas = carregar_temas()
    pares_por_tema = Counter()
    for k, it in enumerate(carregar_linhas(ctx)):
        tipo = it.get("tipo", "conceito")
        fam = "conceitos" if tipo == "conceito" else "seguranca_texto"
        ids = it.get("ids") or []
        if not ids or any(i not in pac.textos for i in ids):
            ctx.stats["autoria_id_ausente_no_pacote"] += 1
            rejeitadas.append((it["_origem"], "id ausente"))
            continue
        if it.get("nivel") not in NIVEIS or tipo not in ("conceito", "seguranca"):
            ctx.stats["autoria_campos_invalidos"] += 1
            rejeitadas.append((it["_origem"], "nivel/tipo"))
            continue
        if temas and it.get("tema") not in temas:
            ctx.stats["autoria_tema_invalido"] += 1
            rejeitadas.append((it["_origem"], f"tema inválido: {it.get('tema')!r}"))
            continue
        pergunta, resposta = it["pergunta"].strip(), it["resposta"].strip()
        vals = set()
        for i in ids:
            t = pac.textos[i]
            vals |= valores_no_texto(t.get("textoOriginal", "") + " " + (t.get("textoPt") or ""))
        achados = numeros_do_texto(resposta)
        fora = [a for a in achados if not numero_na_fonte(a, vals)]
        if fora:
            ctx.stats["autoria_numero_fora_do_trecho"] += 1
            rejeitadas.append((it["_origem"], f"números fora do trecho: {fora}"))
            continue
        r = Resp()
        for a in achados:
            r.passagem(a, ids[0])
        fontes = []
        for i in ids:
            t = pac.textos[i]
            fontes.append({"id": i, "nome": t.get("fonte"), "licenca": t.get("licenca")})
            por_fonte[t.get("_pasta", "?")] += 1
        extra = {}
        if it.get("tema"):
            extra["tema"] = it["tema"]
            pares_por_tema[it["tema"]] += 1
        ctx.add(f"{'co' if tipo == 'conceito' else 'sg'}-{k + 1:04d}", pergunta, resposta, r, tipo, it["nivel"], {}, fontes, f"autoria:{tipo}", fam, extra)
    ctx.stats["autoria_rejeitadas"] = len(rejeitadas)
    ctx.__dict__["cobertura_temas"] = cobertura_por_tema(ctx, pares_por_tema)
    ctx.__dict__["autoria_rejeitadas"] = rejeitadas
    ctx.__dict__["autoria_por_fonte"] = dict(por_fonte)
