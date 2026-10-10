# -*- coding: utf-8 -*-
"""Família COMPOSTOS: ~17 templates × cada composto do núcleo (fórmula, massa molar, nomes, CAS, SMILES, classes, GHS...)."""
import re
from collections import Counter

from comum import MENOS, PLACEHOLDER, Resp, cap, com_artigo, dec, fmt_pacote, fmt_sig, fold, lista_pt, renderizar
from ghs_pt import PICTOGRAMAS, classe_pt, expandir_h, palavra_sinal_pt
from pacote import fontes_do_registro
from qa_base import FONTE_UNECE, Ctx, nome_em_frase, sup_composto

FAM = "compostos"


def PC(c, campo):
    return f"compostos#{c['cid']}.{campo}"


class V:
    """Ajudante de texto para um composto na RESPOSTA (registra números/trechos literais no Resp)."""

    def __init__(self, ctx, c, r):
        self.ctx, self.c, self.r = ctx, c, r
        self.pac = ctx.pac
        self.nome = self.pac.nome_composto(c)
        self.pend = self.pac.comp_pendente(c)
        self.formula = self.pac.formula_exibicao(c)

    def de(self, prep="de"):
        t = com_artigo(self.nome, prep, pendente=self.pend)
        if re.search(r"\d", self.nome):
            self.r.lit(nome_em_frase(self.nome))
        return t

    def O(self):
        return cap(self.de(""))

    def fonte(self):
        cid = self.r.pkg_txt(str(self.c["cid"]), PC(self.c, "cid"))
        return f" Fonte: PubChem, CID {cid}."


def _pictos(c):
    itens = []
    for p in (c.get("ghs") or {}).get("pictogramas") or []:
        nome = PICTOGRAMAS.get(p, (None,))[0]
        itens.append(f"{p} ({nome})" if nome else p)
    return itens


def _frases_h(c, r=None, curto=False):
    itens = []
    for h in (c.get("ghs") or {}).get("frasesH") or []:
        t = expandir_h(h)
        if t and r is not None:
            r.lit(t)
            r.lit(t.rstrip("."))
        itens.append(f"{h} ({t.rstrip('.')})" if t and not curto else h)
    return itens


def _ghs_fontes(c):
    return fontes_do_registro(c, 1) + [FONTE_UNECE]


# ---------------------------------------------------------------------------------------------------------
def t_formula(ctx, c, r, v):
    if not v.formula:
        return None
    extra = ""
    if c.get("formulaHill") and c["formulaHill"] != v.formula:
        extra = f" (na ordem de Hill, {c['formulaHill']})"
    return f"A fórmula molecular {v.de()} é {v.formula}{extra}.{v.fonte()}"


def t_massa_molar(ctx, c, r, v):
    if c.get("massaMolar") is None:
        return None
    return f"A massa molar {v.de()} ({v.formula}) é {r.pkg(c['massaMolar'], PC(c, 'massaMolar'))} g/mol.{v.fonte()}"


def t_iupac(ctx, c, r, v):
    if not c.get("nomeIupac"):
        return None
    return f"O nome IUPAC {v.de()} ({v.formula}), em inglês, é {r.lit(c['nomeIupac'])}.{v.fonte()}"


def t_popular(ctx, c, r, v):
    if not c.get("nomePopular") or v.pend:
        return None
    return f"O nome popular {v.de()} ({v.formula}) é {c['nomePopular'][:1].lower() + c['nomePopular'][1:]}.{v.fonte()}"


def t_cas(ctx, c, r, v):
    if not c.get("cas"):
        return None
    return f"O número CAS {v.de()} ({v.formula}) é {r.pkg_txt(c['cas'], PC(c, 'cas'))}.{v.fonte()}"


def t_smiles(ctx, c, r, v):
    if not c.get("smiles"):
        return None
    return f"O SMILES {v.de()} ({v.formula}) é {r.lit(c['smiles'])}.{v.fonte()}"


def t_classes(ctx, c, r, v):
    cl = c.get("classes")
    if not cl:
        return None
    return f"As classes químicas registradas {v.de()} ({v.formula}) são: {lista_pt([classe_pt(x) for x in cl])}.{v.fonte()}"


def t_pictogramas(ctx, c, r, v):
    if not (c.get("ghs") or {}).get("pictogramas"):
        return None
    return f"Os pictogramas GHS {v.de()} ({v.formula}) são: {lista_pt(_pictos(c))}.{v.fonte()}"


def t_palavra(ctx, c, r, v):
    p = palavra_sinal_pt((c.get("ghs") or {}).get("palavraSinal"))
    if not p:
        return None
    return f"A palavra de sinal do GHS {v.de()} ({v.formula}) é “{p}”.{v.fonte()}"


def t_frases_h(ctx, c, r, v):
    fh = (c.get("ghs") or {}).get("frasesH")
    if not fh:
        return None
    return f"As frases de perigo (H) {v.de()} ({v.formula}) são: {'; '.join(_frases_h(c, r))}.{v.fonte()}"


def t_perigoso(ctx, c, r, v):
    g = c.get("ghs") or {}
    if ctx.pac.tem_ghs(c):
        partes = []
        p = palavra_sinal_pt(g.get("palavraSinal"))
        if p:
            partes.append(f"palavra de sinal “{p}”")
        if g.get("pictogramas"):
            partes.append(f"pictogramas {lista_pt(_pictos(c))}")
        if g.get("frasesH"):
            partes.append(f"frases de perigo: {'; '.join(_frases_h(c, r))}")
        return (f"Segundo a classificação GHS harmonizada registrada no pacote de dados (via PubChem), sim, há perigos conhecidos {v.de()} ({v.formula}): "
                f"{'; '.join(partes)}. Antes de manusear, consulte a ficha de segurança (FISPQ/FDS).{v.fonte()}")
    return (f"O pacote de dados não traz classificação de perigo GHS harmonizada {v.de()} ({v.formula}). Isso não significa ausência de risco: "
            f"consulte a ficha de segurança (FISPQ/FDS) do produto antes de manusear.{v.fonte()}")


def t_massa_exata(ctx, c, r, v):
    if c.get("massaExata") is None:
        return None
    return f"A massa exata (monoisotópica) {v.de()} ({v.formula}) é {r.pkg(c['massaExata'], PC(c, 'massaExata'))} u.{v.fonte()}"


def _prop(campo, rotulo, unid=""):
    def f(ctx, c, r, v):
        val = (c.get("propriedades") or {}).get(campo)
        if val is None:
            return None
        return f"{cap(rotulo)} {v.de()} ({v.formula}) é {r.pkg(val, PC(c, 'propriedades.' + campo))}{unid}.{v.fonte()}"
    return f


def t_perfil(ctx, c, r, v):
    partes = []
    if c.get("massaMolar") is not None:
        partes.append(f"massa molar {r.pkg(c['massaMolar'], PC(c, 'massaMolar'))} g/mol")
    if c.get("cas"):
        partes.append(f"número CAS {r.pkg_txt(c['cas'], PC(c, 'cas'))}")
    if c.get("classes"):
        partes.append(f"classes: {lista_pt([classe_pt(x) for x in c['classes']])}")
    p = palavra_sinal_pt((c.get("ghs") or {}).get("palavraSinal"))
    if p:
        partes.append(f"palavra de sinal GHS “{p}”")
    if not partes:
        return None
    return f"{v.O()} ({v.formula}): " + "; ".join(partes) + f".{v.fonte()}"


# (chave, nível, modelos, função, exige_nome_confiavel)
TEMPLATES = [
    ("formula", "fundamental", ["Qual é a fórmula molecular {c_de}?", "Qual a fórmula {c_de}?", "Fórmula molecular {c_de}", "Como se escreve a fórmula {c_de}?"], t_formula),
    ("massa_molar", "medio", ["Qual é a massa molar {c_de}?", "Qual a massa molar {c_de} em g/mol?", "Massa molar {c_de}", "Quanto pesa um mol {c_de}?"], t_massa_molar),
    ("nome_iupac", "superior", ["Qual é o nome IUPAC {c_de}?", "Qual o nome sistemático {c_de}?", "Nome IUPAC {c_de}"], t_iupac),
    ("nome_popular", "fundamental", ["Qual é o nome popular {c_de}?", "Como {c_de} é chamado popularmente?", "Nome popular {c_de}"], t_popular),
    ("cas", "superior", ["Qual é o número CAS {c_de}?", "Qual o CAS {c_de}?", "Número CAS {c_de}", "Me diga o registro CAS {c_de}."], t_cas),
    ("smiles", "superior", ["Qual é o SMILES {c_de}?", "Qual a notação SMILES {c_de}?", "SMILES {c_de}", "Me dê o SMILES {c_de}."], t_smiles),
    ("classes", "medio", ["A que classes químicas pertence {c}?", "Que tipo de substância é {c}?", "Qual a classificação química {c_de}?"], t_classes),
    ("ghs_pictogramas", "medio", ["Quais são os pictogramas GHS {c_de}?", "Quais pictogramas de perigo aparecem no rótulo {c_de}?", "Pictogramas {c_de}"], t_pictogramas),
    ("ghs_palavra", "medio", ["Qual é a palavra de sinal do GHS {c_de}?", "{c} tem a palavra de sinal Perigo ou Atenção?", "Palavra de sinal {c_de}"], t_palavra),
    ("ghs_frases_h", "medio", ["Quais são as frases H {c_de}?", "Quais as frases de perigo {c_de}?", "Frases de perigo (H) {c_de}", "O que dizem as frases H {c_de}?"], t_frases_h),
    ("perigoso", "fundamental", ["{c} é perigoso?", "É perigoso manusear {c}?", "{c} oferece algum risco?", "Quais os perigos {c_de}?"], t_perigoso),
    ("massa_exata", "superior", ["Qual é a massa exata {c_de}?", "Qual a massa monoisotópica {c_de}?"], t_massa_exata),
    ("xlogp", "superior", ["Qual é o XLogP {c_de}?", "XLogP {c_de}"], _prop("xlogp", "o XLogP")),
    ("tpsa", "superior", ["Qual é a área de superfície polar topológica (TPSA) {c_de}?", "TPSA {c_de}"], _prop("tpsa", "a área de superfície polar topológica (TPSA)", " Å²")),
    ("doadores_h", "superior", ["Quantos doadores de ligação de hidrogênio {c} tem?", "Número de doadores de H {c_de}"], _prop("doadoresH", "o número de doadores de ligação de hidrogênio")),
    ("aceptores_h", "superior", ["Quantos aceptores de ligação de hidrogênio {c} tem?", "Número de aceptores de H {c_de}"], _prop("aceptoresH", "o número de aceptores de ligação de hidrogênio")),
    ("ligacoes_rotaveis", "superior", ["Quantas ligações rotáveis {c} tem?", "Número de ligações rotáveis {c_de}"], _prop("ligacoesRotaveis", "o número de ligações rotáveis")),
    ("perfil", "medio", ["Fale sobre {c}.", "O que é {c}?", "Ficha resumida {c_de}", "Me dê um resumo {c_de}."], t_perfil),
]


def _vals(ctx, c, modelo):
    out = {}
    tipo = None
    for ph in PLACEHOLDER.findall(modelo):
        if ph == "c_de":
            out[ph], tipo = sup_composto(ctx, c, "de")
        elif ph == "c":
            out[ph], tipo = sup_composto(ctx, c, "")
        else:
            raise KeyError(ph)
    return out


def _unicos(ctx):
    """Compostos com nome (PT) e fórmula únicos: perguntas por nome são inequívocas."""
    pac = ctx.pac
    cont = Counter(fold(pac.nome_composto(c)) for c in pac.compostos)
    return {c["cid"] for c in pac.compostos if cont[fold(pac.nome_composto(c))] == 1}


def gerar(ctx: Ctx, variantes: int = 1):
    pac, rng = ctx.pac, ctx.rng
    unicos = _unicos(ctx)
    cont_form = Counter(pac.formula_exibicao(c) for c in pac.compostos)
    cont_pop = Counter(fold(c.get("nomePopular") or "") for c in pac.compostos if c.get("nomePopular"))
    for c in pac.compostos:
        if not pac.formula_exibicao(c):
            ctx.stats["compostos_sem_formula_ignorado"] += 1
            continue
        if c["cid"] not in unicos:
            ctx.stats["compostos_nome_ambiguo_ignorado"] += 1
            continue
        ents = {"compostos": [c["cid"]]}
        for chave, nivel, modelos, fn in TEMPLATES:
            r0 = Resp()
            if fn(ctx, c, r0, V(ctx, c, r0)) is None:
                ctx.stats[f"compostos_ausente:{chave}"] += 1
                continue
            for i, modelo in enumerate(rng.sample(modelos, min(variantes, len(modelos)))):
                r = Resp()
                texto = fn(ctx, c, r, V(ctx, c, r))
                pergunta = renderizar(modelo, _vals(ctx, c, modelo), rng)
                fontes = fontes_do_registro(c, 1) + ([FONTE_UNECE] if chave.startswith("ghs") or chave == "perigoso" else [])
                ctx.add(f"co-{c['cid']}-{chave}-{i + 1}", pergunta, texto, r, "fato", nivel, ents, fontes, f"template:composto.{chave}", FAM)

        # reverso do nome popular: "O que é a aspirina?"
        pop = c.get("nomePopular")
        if pop and not pac.comp_pendente(c) and cont_pop[fold(pop)] == 1 and pac.formula_exibicao(c):
            r = Resp()
            v = V(ctx, c, r)
            pop_l = pop[:1].lower() + pop[1:]
            for i, modelo in enumerate(rng.sample(["O que é {pop}?", "{pop} é o nome popular de qual composto?", "Qual é o nome químico {pop_de}?"], 1)):
                art = com_artigo(pop_l, "de", minusculo=False)
                pergunta = renderizar(modelo, {"pop": pop_l, "pop_de": art}, rng)
                texto = (f"{cap(pop_l)} é o nome popular {v.de()} ({v.formula}).{v.fonte()}")
                ctx.add(f"co-{c['cid']}-popular_reverso-{i + 1}", pergunta, texto, r, "fato", "fundamental", ents,
                        fontes_do_registro(c, 1), "template:composto.popular_reverso", FAM)

        # reverso por CAS
        if c.get("cas"):
            r = Resp()
            v = V(ctx, c, r)
            cas_q = r.ent(c["cas"])
            pergunta = renderizar(rng.choice(["Qual composto tem o número CAS {cas}?", "O CAS {cas} corresponde a qual substância?"]), {"cas": c["cas"]}, rng)
            texto = f"O número CAS {cas_q} corresponde {v.de('a')} ({v.formula}).{v.fonte()}"
            r.pkg_txt(c["cas"], PC(c, "cas"))
            ctx.add(f"co-{c['cid']}-cas_reverso-1", pergunta, texto, r, "fato", "superior", ents, fontes_do_registro(c, 1),
                    "template:composto.cas_reverso", FAM)

        # reverso por fórmula (só se a fórmula é única no pacote)
        f = pac.formula_exibicao(c)
        if f and cont_form[f] == 1:
            r = Resp()
            v = V(ctx, c, r)
            pergunta = renderizar(rng.choice(["Qual composto tem a fórmula {f}?", "A fórmula {f} é de que substância?", "Que substância é {f}?"]), {"f": f}, rng)
            texto = f"No pacote de dados, a fórmula {f} corresponde {v.de('a')}.{v.fonte()}"
            ctx.add(f"co-{c['cid']}-formula_reverso-1", pergunta, texto, r, "fato", "fundamental", ents, fontes_do_registro(c, 1),
                    "template:composto.formula_reverso", FAM)

    _comparar_massas(ctx, [c for c in pac.compostos if c["cid"] in unicos])


def _comparar_massas(ctx: Ctx, cs):
    rng = ctx.rng
    com_massa = [c for c in cs if c.get("massaMolar") is not None and ctx.pac.formula_exibicao(c)]
    if len(com_massa) < 2:
        return
    for c in com_massa:
        d = rng.choice(com_massa)
        if d is c:
            continue
        r = Resp()
        va, vb = V(ctx, c, r), V(ctx, d, r)
        ma, mb = dec(c["massaMolar"]), dec(d["massaMolar"])
        modelo = rng.choice(["Qual tem maior massa molar: {a} ou {b}?", "Compare a massa molar {a_de} e {b_de}.", "Entre {a} e {b}, qual é mais pesado por mol?",
                             "Qual a diferença de massa molar entre {a} e {b}?"])
        sa, _ = sup_composto(ctx, c, "", permitir_formula=True, permitir_popular=True)
        sb, _ = sup_composto(ctx, d, "", permitir_formula=True, permitir_popular=True)
        sa_de, _ = sup_composto(ctx, c, "de")
        sb_de, _ = sup_composto(ctx, d, "de")
        pergunta = renderizar(modelo, {"a": sa, "b": sb, "a_de": sa_de, "b_de": sb_de}, rng)
        pa = r.pkg(c["massaMolar"], PC(c, "massaMolar"))
        pb = r.pkg(d["massaMolar"], PC(d, "massaMolar"))
        if ma == mb:
            texto = (f"{va.O()} ({va.formula}) e {vb.de('')} ({vb.formula}) têm a mesma massa molar: {pa} g/mol cada um. "
                     f"Fonte: PubChem, CID {r.pkg_txt(str(c['cid']), PC(c, 'cid'))} e CID {r.pkg_txt(str(d['cid']), PC(d, 'cid'))}.")
        else:
            maior, menor = (c, d) if ma > mb else (d, c)
            vm, vn = (va, vb) if ma > mb else (vb, va)
            diff = abs(ma - mb)
            texto = (f"{vm.O()} ({vm.formula}) tem maior massa molar ({r.pkg(maior['massaMolar'], PC(maior, 'massaMolar'))} g/mol) "
                     f"do que {vn.de('')} ({vn.formula}), com {r.pkg(menor['massaMolar'], PC(menor, 'massaMolar'))} g/mol; "
                     f"a diferença é de {r.calc(diff, 'diferenca_massa_molar', 4)} g/mol. "
                     f"Fonte: PubChem, CID {r.pkg_txt(str(c['cid']), PC(c, 'cid'))} e CID {r.pkg_txt(str(d['cid']), PC(d, 'cid'))}.")
        ctx.add(f"co-cmp-{c['cid']}-{d['cid']}", pergunta, texto, r, "fato", "medio", {"compostos": [c["cid"], d["cid"]]},
                fontes_do_registro(c, 1) + fontes_do_registro(d, 1), "template:composto.comparar_massa_molar", FAM)
