# -*- coding: utf-8 -*-
"""Família REGRAS: solubilidade de sais e reatividade de metais, aplicadas por código às regras de ensino de `regras.json`
(`solubilidade.regras`, `serieReatividadeMetais.ordem`). Autoria própria do projeto (regras gerais de ensino, com exceções)."""
import re
from math import gcd

from calculo import FormulaInvalida, parse_formula
from comum import Resp, cap, com_artigo, lista_pt, renderizar
from fam_nomenclatura import ANIONS, CATIONS, CONHECIDAS
from qa_base import FONTE_AUTORIA, Ctx

FAM = "regras"
SUP = str.maketrans("0123456789+-", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻")


def _ion_anion(formula: str, q: int) -> str:
    cont = parse_formula(formula)
    mono = len(cont) == 1 and sum(cont.values()) == 1
    if q == 1:
        return f"{formula}-"
    return f"{formula}{q}-" if mono else f"{formula} {q}-"


def _ion_cation(simbolo: str, q: int) -> str:
    return f"{simbolo}+" if q == 1 else f"{simbolo}{q}+"


def classificar(regras_solub, cation: str, anion: str):
    """(classe, regra, é_exceção). A regra do ânion tem prioridade (é a mais específica); exceções invertem o resultado. Ânions sem regra
    própria só são classificados para cátions alcalinos/amônio (regra de maior alcance). None se nenhuma regra cobre o sal."""
    r_an = next((r for r in regras_solub if anion in r["ions"]), None)
    if r_an:
        if cation in r_an.get("excecoes", []):
            if anion == "O2-":
                return "reage", r_an, True
            return ("insoluvel" if r_an["solubilidade"] == "soluvel" else "soluvel"), r_an, True
        return r_an["solubilidade"], r_an, False
    r_cat = next((r for r in regras_solub if cation in r["ions"] and r["solubilidade"] == "soluvel"), None)
    if r_cat:
        return "soluvel", r_cat, False
    return None


def gerar(ctx: Ctx):
    pac, rng = ctx.pac, ctx.rng
    solub = (pac.regras.get("solubilidade") or {}).get("regras") or []
    nota = (pac.regras.get("solubilidade") or {}).get("nota") or ""
    serie = (pac.regras.get("serieReatividadeMetais") or {}).get("ordem") or []
    # --- solubilidade: perguntas sobre cada regra e sobre cada sal validado ----------------------------------
    for k, reg in enumerate(solub):
        alvo = {"soluvel": "solúveis", "insoluvel": "insolúveis"}[reg["solubilidade"]]
        r = Resp()
        pergunta = renderizar(rng.choice(["Qual é a regra de solubilidade em água para {t}?", "Como é a solubilidade em água dos {t}?", "{t_cap}: solúveis ou insolúveis em água?"]),
                              {"t": reg["id"].replace("-", " e "), "t_cap": cap(reg["id"].replace("-", " e "))}, rng)
        ctx.add(f"rg-sol-regra-{k}", pergunta, f"{reg['regra']} {nota}".strip(), r, "fato", "medio", {}, [FONTE_AUTORIA], "regras:solubilidade.regra", FAM)
    if not solub:
        return
    usados = set()
    # sais ionicos validados (mesma tabela CONHECIDAS da nomenclatura)
    for cs, cn, cargas in CATIONS:
        for q in cargas:
            for af, an, qa in ANIONS:
                g = gcd(q, qa)
                n_cat, n_an = qa // g, q // g
                nome = f"{an} de {cn}" + ({1: "(I)", 2: "(II)", 3: "(III)", 4: "(IV)"}[q] if len(cargas) > 1 else "")
                if nome not in CONHECIDAS or nome in usados or af in ("H",):
                    continue
                try:
                    res = classificar(solub, _ion_cation(cs, q), _ion_anion(af, qa))
                except FormulaInvalida:
                    res = None
                if not res:
                    ctx.stats["regras_sal_sem_regra"] += 1
                    continue
                usados.add(nome)
                tipo, regra, excecao = res
                texto_cl = {"soluvel": "solúvel", "insoluvel": "insolúvel", "reage": "reativo com a água"}[tipo]
                if excecao:  # a própria regra pode qualificar a exceção ("pouco solúveis", "moderadamente solúveis")
                    pretty = (cs + (str(q) if q > 1 else "") + "+").translate(SUP)
                    for seg in regra["regra"].split(";"):
                        if pretty in seg and "pouco solúve" in seg and "insolúve" in seg:
                            texto_cl = "insolúvel ou pouco solúvel"
                        elif pretty in seg and "pouco solúve" in seg:
                            texto_cl = "pouco solúvel"
                        elif pretty in seg and "moderadamente solúve" in seg:
                            texto_cl = "moderadamente solúvel"
                if excecao:
                    expl = f"Ele é uma exceção da regra a seguir: {regra['regra']}"
                else:
                    expl = f"Regra aplicada: {regra['regra']}"
                r = Resp()
                modelo = rng.choice(["{n_cap} é solúvel em água?", "O {n} dissolve em água?", "{n_cap} é solúvel ou insolúvel?", "Qual a solubilidade em água do {n}?"])
                pergunta = renderizar(modelo, {"n": nome, "n_cap": cap(nome)}, rng)
                if tipo == "reage":
                    frase = f"Pelas regras gerais de solubilidade, {nome} reage com a água, formando o hidróxido correspondente, em vez de apenas se dissolver."
                else:
                    frase = f"Pelas regras gerais de solubilidade, {nome} é {texto_cl} em água."
                texto = (f"{frase} {expl} (regras de ensino: a solubilidade real depende de temperatura e concentração.)")
                ctx.add(f"rg-sol-{len(usados)}", pergunta, texto, r, "fato", "medio", {"nome": nome}, [FONTE_AUTORIA], "regras:solubilidade.sal", FAM)
    ctx.stats["regras_sais_classificados"] = len(usados)
    # --- reatividade dos metais --------------------------------------------------------------------------------
    metais = [s for s in serie if s in pac.el_simbolo]
    if len(metais) >= 2:
        pares, tent = set(), 0
        while len(pares) < 160 and tent < 4000:
            tent += 1
            a, b = rng.sample(metais, 2)
            if (a, b) in pares or (b, a) in pares:
                continue
            pares.add((a, b))
            ia, ib = serie.index(a), serie.index(b)
            mais, menos = (a, b) if ia < ib else (b, a)
            nm = lambda s, prep="": com_artigo(pac.el_simbolo[s]["nome"], prep, elemento=True)
            r = Resp()
            if rng.random() < 0.5:
                pergunta = renderizar(rng.choice(["Qual é mais reativo: {a} ou {b}?", "Entre {a} e {b}, qual metal é mais reativo?"]),
                                      {"a": pac.el_simbolo[a]["nome"].lower(), "b": pac.el_simbolo[b]["nome"].lower()}, rng)
                texto = (f"Na série de reatividade dos metais, {nm(mais)} ({mais}) vem antes {nm(menos, 'de')} ({menos}); logo, {nm(mais)} é mais reativo. "
                         f"Um metal desloca o cátion de outro que está depois dele na série.")
            else:
                pergunta = renderizar(rng.choice(["{a} desloca o cátion {b_de} em solução?", "{a_cap} reage com um sal {b_de}, deslocando o metal?"]),
                                      {"a": nm(a), "a_cap": cap(nm(a)), "b_de": nm(b, "de")}, rng)
                if ia < ib:
                    texto = f"Sim: {nm(a)} ({a}) vem antes {nm(b, 'de')} ({b}) na série de reatividade, então desloca o cátion de {b} em solução."
                else:
                    texto = f"Não: {nm(a)} ({a}) vem depois {nm(b, 'de')} ({b}) na série de reatividade, então não desloca o cátion de {b} em solução."
            ctx.add(f"rg-rea-{len(pares)}", pergunta, texto + " (Regra de ensino, série de reatividade do pacote de dados.)", r, "fato", "medio",
                    {"elementos": [a, b]}, [FONTE_AUTORIA], "regras:reatividade", FAM)
        if "H" in serie:
            for s in metais:
                if s == "H":
                    continue
                r = Resp()
                antes = serie.index(s) < serie.index("H")
                pergunta = renderizar(rng.choice(["{m} reage com ácidos diluídos liberando hidrogênio?", "O {n} desloca o hidrogênio dos ácidos?"]),
                                      {"m": cap(com_artigo(pac.el_simbolo[s]["nome"], "", elemento=True)), "n": pac.el_simbolo[s]["nome"].lower()}, rng)
                texto = (f"{'Sim' if antes else 'Não'}: na série de reatividade, {com_artigo(pac.el_simbolo[s]['nome'], '', elemento=True)} ({s}) vem "
                         f"{'antes' if antes else 'depois'} do hidrogênio, então {'desloca' if antes else 'não desloca'} o H₂ dos ácidos diluídos "
                         f"(regra de ensino).")
                ctx.add(f"rg-rea-h-{s}", pergunta, texto, r, "fato", "medio", {"elementos": [s]}, [FONTE_AUTORIA], "regras:reatividade.hidrogenio", FAM)
