# -*- coding: utf-8 -*-
"""Famílias RECUSAS, DESENHO e SEGURANÇA (GHS). Segurança geral de laboratório/doméstica vem dos trechos (fam_textos.py)."""
from collections import Counter

from comum import Resp, cap, com_artigo, lista_pt, renderizar
from dados_recusas import RECUSA_PADRAO, gerar_pedidos
import ghs_pt
from ghs_pt import PICTOGRAMAS, expandir_h, palavra_sinal_pt
from pacote import fontes_do_registro
from qa_base import FONTE_CLP, FONTE_RECUSA, Ctx, nome_em_frase, sup_composto, sup_composto_sem_artigo

# ---------------------------------------------------------------------------------------------------------
# RECUSAS
# ---------------------------------------------------------------------------------------------------------


def gerar_recusas(ctx: Ctx, n: int = 420):
    rng = ctx.rng
    for k, (pergunta, cat) in enumerate(gerar_pedidos(rng, n)):
        ctx.add(f"re-{k + 1}", pergunta, RECUSA_PADRAO, Resp(), "recusa", "medio", {}, [FONTE_RECUSA], f"template:recusa.{cat}", "recusas")


# ---------------------------------------------------------------------------------------------------------
# DESENHO
# ---------------------------------------------------------------------------------------------------------
def gerar_desenho(ctx: Ctx):
    pac, rng = ctx.pac, ctx.rng
    from collections import Counter as C
    cont = C(pac.nome_composto(c).lower() for c in pac.compostos)
    for c in pac.compostos:
        smiles, formula = c.get("smiles"), pac.formula_exibicao(c)
        if not smiles or not formula or cont[pac.nome_composto(c).lower()] != 1:
            continue
        for i, modelo in enumerate(rng.sample(["Desenhe a estrutura {c_de}.", "Mostre a estrutura molecular {c_de}.", "Como é a molécula {c_de}? Desenhe.",
                                               "Desenhe {c}.", "Quero ver a estrutura {c_de}.", "Faça o desenho da fórmula estrutural {c_de}."], 2)):
            r = Resp()
            v_de = com_artigo(pac.nome_composto(c), "de", pendente=pac.comp_pendente(c))
            c_de, _ = sup_composto(ctx, c, "de", permitir_formula=True)
            c_nu, _ = sup_composto(ctx, c, "", permitir_formula=True)
            pergunta = renderizar(modelo, {"c_de": c_de, "c": c_nu}, rng)
            cid = r.pkg_txt(str(c["cid"]), f"compostos#{c['cid']}.cid")
            texto = (f"Vou desenhar a estrutura {v_de} ({formula}) a partir do SMILES do PubChem (CID {cid}): {r.lit(smiles)}. "
                     f"O desenho 2D aparece no app, gerado localmente a partir desse SMILES.")
            ctx.add(f"de-{c['cid']}-{i + 1}", pergunta, texto, r, "desenho", "fundamental", {"compostos": [c["cid"]]}, fontes_do_registro(c, 1),
                    "template:desenho.estrutura", "desenho", {"acao": "desenhar", "smiles": smiles})


# ---------------------------------------------------------------------------------------------------------
# SEGURANÇA (GHS harmonizado do pacote + dicionário de frases H)
# ---------------------------------------------------------------------------------------------------------
def _h_range(codigo: str):
    base = codigo.split("+")[0]
    if not base.startswith("H") or not base[1:4].isdigit():
        return "outro"
    n = int(base[1:4])
    return "fisico" if n < 300 else ("saude" if n < 400 else "ambiente")


def gerar_seguranca_ghs(ctx: Ctx):
    pac, rng = ctx.pac, ctx.rng
    fontes_clp = [FONTE_CLP]
    # significado de cada frase H
    for cod, txt in sorted(ghs_pt.frases_ativas().items()):
        for i, modelo in enumerate(rng.sample(["O que significa a frase de perigo {h}?", "{h} quer dizer o quê?", "Qual o significado do código {h} no rótulo?",
                                               "O que diz a frase {h}?"], 2)):
            r = Resp()
            r.lit(txt)
            ctx.add(f"se-h-{cod}-{i + 1}", renderizar(modelo, {"h": cod}, rng), f"A frase de perigo {cod} significa: {txt} Fonte: Regulamento CLP, Anexo III.",
                    r, "seguranca", "fundamental", {}, fontes_clp, "template:seguranca.frase_h", "seguranca")
    # significado dos pictogramas
    for cod, (nome, sig) in PICTOGRAMAS.items():
        for i, modelo in enumerate(rng.sample(["O que significa o pictograma {p}?", "O que representa o pictograma de {n} nos rótulos?", "Quando um produto leva o pictograma {n}?",
                                               "Qual o significado do símbolo {n} (GHS) no rótulo?"], 3)):
            r = Resp()
            ctx.add(f"se-pic-{cod}-{i + 1}", renderizar(modelo, {"p": cod, "n": nome}, rng),
                    f"O pictograma {cod} ({nome}) indica perigo ligado a: {sig}. Fonte: sistema GHS (classificação e rotulagem).",
                    r, "seguranca", "fundamental", {}, fontes_clp, "template:seguranca.pictograma", "seguranca")
    # palavra de sinal
    r = Resp()
    ctx.add("se-palavra-1", "O que significa a palavra de sinal “Perigo” no rótulo de um produto químico?",
            "No GHS, a palavra de sinal “Perigo” é usada para as categorias de perigo mais graves; “Atenção” é usada para as menos graves. "
            "Ela aparece junto dos pictogramas e das frases de perigo. Fonte: Regulamento CLP.", r, "seguranca", "fundamental", {}, fontes_clp,
            "template:seguranca.palavra_sinal", "seguranca")
    r = Resp()
    ctx.add("se-palavra-2", "Qual a diferença entre Perigo e Atenção nos rótulos de produtos químicos?",
            "No GHS, “Perigo” indica as categorias de perigo mais graves e “Atenção”, as menos graves. A palavra de sinal vem acompanhada dos pictogramas "
            "e das frases de perigo (H). Fonte: Regulamento CLP.", r, "seguranca", "fundamental", {}, fontes_clp, "template:seguranca.palavra_sinal", "seguranca")
    # por composto: riscos físicos, à saúde e ao ambiente
    cont = Counter(pac.nome_composto(c).lower() for c in pac.compostos)
    rotulos = {"fisico": ("físicos", ["Que riscos físicos (inflamabilidade, explosão, pressão) {c} apresenta?", "{c_cap} tem riscos físicos?"]),
               "saude": ("à saúde", ["Que riscos à saúde {c} apresenta?", "Quais os perigos à saúde {c_de}?"]),
               "ambiente": ("ao meio ambiente", ["{c_cap} é perigoso para o meio ambiente?", "Quais os riscos ambientais {c_de}?"])}
    for c in pac.compostos:
        g = c.get("ghs") or {}
        if not g.get("frasesH") or cont[pac.nome_composto(c).lower()] != 1 or not pac.formula_exibicao(c):
            continue
        por = {"fisico": [], "saude": [], "ambiente": []}
        textos_h = []
        for h in g["frasesH"]:
            t = expandir_h(h)
            if t and _h_range(h) in por:
                por[_h_range(h)].append(f"{h} ({t.rstrip('.')})")
                textos_h.append(t)
        for chave, itens in por.items():
            if not itens:
                continue
            nome_rot, modelos = rotulos[chave]
            r = Resp()
            nome = pac.nome_composto(c)
            pend = pac.comp_pendente(c)
            cid = r.pkg_txt(str(c["cid"]), f"compostos#{c['cid']}.cid")
            for t in textos_h:
                r.lit(t)
                r.lit(t.rstrip("."))
            import re
            if re.search(r"\d", nome):
                r.lit(nome_em_frase(nome))
            c_ = com_artigo(nome, "", pendente=pend)
            pergunta = renderizar(rng.choice(modelos), {"c": c_, "c_de": com_artigo(nome, "de", pendente=pend), "c_cap": cap(c_)}, rng)
            texto = (f"Pelas frases de perigo harmonizadas registradas para {c_} ({pac.formula_exibicao(c)}), os riscos {nome_rot} são: "
                     f"{'; '.join(itens)}. Fonte: PubChem, CID {cid}; texto das frases: Regulamento CLP, Anexo III.")
            ctx.add(f"se-{c['cid']}-{chave}", pergunta, texto, r, "seguranca", "medio", {"compostos": [c["cid"]]}, fontes_do_registro(c, 1) + fontes_clp,
                    f"template:seguranca.riscos_{chave}", "seguranca")
