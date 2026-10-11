# -*- coding: utf-8 -*-
"""Família CÁLCULOS: massa molar, balanceamento, estequiometria, soluções, pH, gás ideal e conversão de unidades.

Todo resultado numérico é produzido por código (calculo.py). As respostas mostram as etapas; os valores intermediários são
exibidos com 5 algarismos significativos E USADOS COMO EXIBIDOS (a conta se reproduz à mão); o resultado final traz 4
algarismos significativos, o que é declarado na resposta. As entradas sorteadas usam a semente do contexto.
"""
import re
from collections import Counter
from decimal import Decimal, ROUND_HALF_UP

from calculo import (FormulaInvalida, UNIDADES_BASE, ZERO_CELSIUS_K, tabela_de_regras, balancear, contagem_lado, conserva, converter, equacao_texto,
                     grandeza_da_unidade, h_de_ph, log10, massa_molar_passos, parse_equacao, parse_formula)
from comum import (MENOS, PLACEHOLDER, Resp, arred_sig, cap, com_artigo, dec, fmt_casas, fmt_pacote, fmt_plano, fmt_sig, inter, lista_pt,
                   renderizar, sup_expoente)
from equacoes import TIPO_PT, lista_equacoes
from pacote import const_id, fontes_do_registro
from qa_base import FONTE_DEFINICOES, Ctx, nome_em_frase, sup_composto, sup_composto_sem_artigo

FAM = "calculos"
SIMBOLOS = set("H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd "
               "Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra "
               "Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og".split())

SOLUTOS = ["NaCl", "NaOH", "KOH", "HCl", "H2SO4", "HNO3", "NaHCO3", "Na2CO3", "KCl", "KNO3", "CaCl2", "MgSO4", "CuSO4", "AgNO3", "NH4Cl", "C6H12O6",
           "C12H22O11", "KMnO4", "Na2SO4", "CaCO3", "LiOH", "KBr", "NaNO3", "ZnSO4", "FeCl3", "NaClO"]
ACIDOS_FORTES = {"HCl": 1, "HNO3": 1, "HBr": 1, "HI": 1, "HClO4": 1}
BASES_FORTES = {"NaOH": 1, "KOH": 1, "LiOH": 1, "Ca(OH)2": 2, "Ba(OH)2": 2}
MASSAS_G = ["1,0", "2,0", "2,5", "4,0", "5,0", "8,0", "10", "12", "16", "18", "20", "25", "32", "36", "40", "44", "50", "64", "80", "100"]
MOLS = ["0,10", "0,25", "0,50", "1,0", "1,5", "2,0", "2,5", "3,0", "4,0", "5,0", "10"]
CONC = ["0,10", "0,20", "0,25", "0,50", "1,0", "2,0", "0,050", "0,010", "0,40", "1,5"]
VOL_ML = ["50", "100", "200", "250", "500", "1000"]


def D(s):
    return Decimal(str(s).replace(",", "."))


def tabela(ctx):
    """Tabela de unidades: fatores de regras.json quando existem; senão as definições embutidas (registra a origem em stats)."""
    t = ctx.__dict__.get("_tabela")
    if t is None:
        t, vieram, total = tabela_de_regras(ctx.pac.regras)
        ctx.__dict__["_tabela"] = t
        ctx.stats["unidades_com_fator_de_regras_json"] = vieram
        ctx.stats["unidades_total"] = total
    return t


def sf(s: str) -> int:
    """algarismos significativos de um número digitado (ex.: '0,010' -> 2)."""
    return max(1, len(D(s).as_tuple().digits))


# ---------------------------------------------------------------------------------------------------------
# Massa molar a partir da fórmula
# ---------------------------------------------------------------------------------------------------------
def mm_info(ctx: Ctx, formula: str):
    cache = ctx.__dict__.setdefault("_mm_cache", {})
    if formula in cache:
        return cache[formula]
    info = None
    try:
        contagem = parse_formula(formula, validos=SIMBOLOS)
        if all(el in ctx.pac.massas for el in contagem):
            passos, total = massa_molar_passos(contagem, ctx.pac.massas)
            info = {"formula": formula, "contagem": contagem, "passos": passos, "total": total,
                    "M2": total.quantize(Decimal("0.01"), ROUND_HALF_UP)}
    except FormulaInvalida:
        info = None
    cache[formula] = info
    return info


def mm_composto(ctx: Ctx, c):
    """Informação de massa molar de um composto do pacote (calculada pelas massas atômicas; PubChem se divergir > 0,5 %)."""
    for f in (c.get("formula"), c.get("formulaHill")):
        if f:
            info = mm_info(ctx, f)
            if info:
                break
    else:
        ctx.stats["massa_molar_formula_nao_analisada"] += 1
        return None
    pub = c.get("massaMolar")
    info = dict(info)
    info["usa_pubchem"] = False
    if pub is not None and info["total"] != 0:
        dif = abs(info["total"] - dec(pub)) / dec(pub) * 100
        info["dif_pct"] = dif
        if dif > Decimal("0.5"):
            info["usa_pubchem"] = True
            info["M2"] = dec(pub).quantize(Decimal("0.01"), ROUND_HALF_UP)
            div = ctx.__dict__.setdefault("_divergentes", {})
            if c["cid"] not in div:
                div[c["cid"]] = f"CID {c['cid']} {c.get('nome')} calculada={info['total']} pubchem={pub} ({dif:.2f} %)"
                ctx.avisos.append("massa molar divergente: " + div[c["cid"]])
            ctx.stats["massa_molar_divergente_do_pubchem"] = len(div)
    return info


def _fontes_massas(ctx):
    return fontes_do_registro(ctx.pac.elementos[0], 1)


def _fonte_const(ctx, c):
    return fontes_do_registro(c, 1) if c else []


def _unidade_msg(r):
    return f"Resultado com {r.defin('4', 'algarismos_significativos')} algarismos significativos."


QUATRO = "quatro algarismos significativos"


def _r_final(r, x, tipo, sig=4):
    q = arred_sig(x, sig)
    return q, r.calc(x, tipo, sig)


def _gerar_massa_molar(ctx: Ctx):
    pac, rng = ctx.pac, ctx.rng
    for c in pac.compostos:
        formula = pac.formula_exibicao(c)
        if not formula:
            continue
        info = mm_composto(ctx, c)
        if not info:
            continue
        for i in range(2):
            r = Resp()
            pend = pac.comp_pendente(c)
            nome = pac.nome_composto(c)
            de = com_artigo(nome, "de", pendente=pend)
            if re.search(r"\d", nome):
                r.lit(nome_em_frase(nome))
            linhas = [f"Massa molar {de} ({formula}):"]
            for el, n, m, parc in info["passos"]:
                caminho_el = "elementos.json#" + el + ".massaAtomica"
                linhas.append(f"- {el}: {r.calc(n, 'contagem_atomos', texto=str(n))} × {r.pkg(m, caminho_el)} = "
                              f"{r.calc(parc, 'massa_parcial', texto=fmt_plano(parc))}")
            total = info["total"]
            exato4 = arred_sig(total, 4) == total
            soma = f"Soma: {r.calc(total, 'massa_molar', texto=fmt_plano(total.normalize() if exato4 else total))} g/mol"
            if not exato4:
                soma += f" ≈ {r.calc(total, 'massa_molar', 4)} g/mol (arredondado para {QUATRO})"
            soma += "."
            linhas.append(soma)
            resultado = fmt_sig(total, 4)
            if info["usa_pubchem"]:
                caminho_mm = "compostos#" + str(c["cid"]) + ".massaMolar"
                resultado = fmt_sig(c["massaMolar"], 4)
                linhas.append(f"Atenção: o valor registrado no PubChem, {r.pkg(c['massaMolar'], caminho_mm)} g/mol, difere do calculado em mais de meio por cento; "
                              f"por isso a resposta usa o valor do PubChem: M ≈ {r.pkg_sig(c['massaMolar'], caminho_mm, 4)} g/mol.")
            linhas.append(f"Fonte: massas atômicas do PubChem Periodic Table (cálculo local).")
            if i == 0:
                modelo = rng.choice(["Calcule a massa molar {c_de}.", "Como calcular a massa molar {c_de}?", "Qual a massa molar {c_de}? Mostre a conta."])
                c_txt, _ = sup_composto(ctx, c, "de")
                pergunta = renderizar(modelo, {"c_de": c_txt}, rng)
            else:
                modelo = rng.choice(["Calcule a massa molar de {f} a partir das massas atômicas.", "Qual a massa molar de {f}? Mostre os cálculos.",
                                     "Some as massas atômicas e dê a massa molar de {f}."])
                pergunta = renderizar(modelo, {"f": formula}, rng)
            ctx.add(f"ca-mm-{c['cid']}-{i + 1}", pergunta, "\n".join(linhas), r, "calculo", "medio", {"compostos": [c["cid"]]},
                    _fontes_massas(ctx) + fontes_do_registro(c, 1), "calculo:massa_molar", FAM,
                    {"calculo": {"tipo": "massa_molar", "entrada": {"formula": formula}, "resultado": resultado}})


# ---------------------------------------------------------------------------------------------------------
# Balanceamento
# ---------------------------------------------------------------------------------------------------------
SETAS = ["->", "→", "=", "=>", "→", "->"]


def _equacoes_validas(ctx: Ctx):
    out, descartadas = [], 0
    for tipo, eq in lista_equacoes():
        try:
            reag, prod = parse_equacao(eq)
            coefs = balancear(reag, prod, SIMBOLOS)
        except FormulaInvalida:
            coefs = None
        if not coefs or not conserva(reag, prod, coefs, SIMBOLOS):
            descartadas += 1
            continue
        out.append((tipo, eq, reag, prod, coefs))
    ctx.stats["equacoes_validas"] = len(out)
    ctx.stats["equacoes_descartadas"] = descartadas
    return out


def _gerar_balanceamento(ctx: Ctx, equacoes):
    rng = ctx.rng
    for k, (tipo, eq, reag, prod, coefs) in enumerate(equacoes):
        for i in range(2):
            r = Resp()
            seta = rng.choice(SETAS)
            eq_txt = f"{' + '.join(reag)} {seta} {' + '.join(prod)}"
            modelo = rng.choice(["Balanceie a equação: {eq}", "Faça o balanceamento de {eq}", "Acerte os coeficientes: {eq}", "Como balancear {eq}?",
                                 "Qual é a equação {eq} balanceada?", "Balanceamento: {eq}"])
            pergunta = renderizar(modelo, {"eq": eq_txt}, rng)
            cs = [r.calc(c, "balanceamento", texto=str(c)) for c in coefs]
            bal = equacao_texto(reag, prod, coefs)
            a = contagem_lado(reag, coefs[:len(reag)], SIMBOLOS)
            b = contagem_lado(prod, coefs[len(reag):], SIMBOLOS)
            conf = "; ".join(f"{el}: {r.calc(a[el], 'contagem_atomos', texto=str(a[el]))} | {r.calc(b[el], 'contagem_atomos', texto=str(b[el]))}" for el in a)
            coef_txt = lista_pt(cs)
            linhas = [f"Equação balanceada: {bal}",
                      "Método: igualei o número de átomos de cada elemento nos dois lados, com os menores coeficientes inteiros.",
                      f"Conferência (átomos nos reagentes | nos produtos): {conf}.",
                      f"Coeficientes, na ordem: {coef_txt}" + (f" (o coeficiente {r.defin('1', 'coeficiente_omitido')} não se escreve)." if 1 in coefs else "."),
                      f"Tipo de reação: {TIPO_PT[tipo]}."]
            texto = "\n".join(linhas)
            ctx.add(f"ca-bal-{k}-{i + 1}", pergunta, texto, r, "calculo", "medio" if len(reag) + len(prod) <= 4 else "superior", {"equacao": eq_txt},
                    [FONTE_DEFINICOES], "calculo:balanceamento", FAM,
                    {"calculo": {"tipo": "balanceamento", "entrada": {"reagentes": reag, "produtos": prod}, "resultado": coefs}})


# ---------------------------------------------------------------------------------------------------------
# Estequiometria
# ---------------------------------------------------------------------------------------------------------
def _nome_por_formula(ctx: Ctx):
    cache = ctx.__dict__.get("_nome_formula")
    if cache is None:
        cache, cont = {}, Counter()
        for c in ctx.pac.compostos:
            if ctx.pac.comp_pendente(c):
                continue
            f = ctx.pac.formula_exibicao(c)
            if not f:
                continue
            try:
                chave = tuple(sorted(parse_formula(f, SIMBOLOS).items()))
            except FormulaInvalida:
                continue
            cont[chave] += 1
            cache[chave] = ctx.pac.nome_composto(c)
        for chave, n in cont.items():
            if n > 1:
                cache.pop(chave, None)
        for e in ctx.pac.elementos:
            pass
        ctx.__dict__["_nome_formula"] = cache
    return cache


def _chaves_gasosas(ctx: Ctx):
    """Composições (tuplas ordenadas) dos compostos do pacote com a classe 'gas' (calculado uma vez)."""
    ch = ctx.__dict__.get("_chaves_gas")
    if ch is None:
        ch = set()
        for c in ctx.pac.compostos:
            f = ctx.pac.formula_exibicao(c)
            if f and "gas" in (c.get("classes") or []):
                try:
                    ch.add(tuple(sorted(parse_formula(f, SIMBOLOS).items())))
                except FormulaInvalida:
                    pass
        ctx.__dict__["_chaves_gas"] = ch
    return ch


def _gas_nas_cntp(ctx: Ctx, formula: str) -> bool:
    """Espécie gasosa nas condições padrão segundo o PACOTE (elemento com estadoPadrao=gas, ou composto com classe 'gas')."""
    try:
        cont = parse_formula(formula, SIMBOLOS)
    except FormulaInvalida:
        return False
    if len(cont) == 1:
        el = next(iter(cont))
        e = ctx.pac.el_simbolo.get(el)
        return bool(e) and e.get("estadoPadrao") == "gas"
    return tuple(sorted(cont.items())) in _chaves_gasosas(ctx)


def _esp(ctx, formula):
    nm = _nome_por_formula(ctx)
    try:
        chave = tuple(sorted(parse_formula(formula, SIMBOLOS).items()))
    except FormulaInvalida:
        return formula
    n = nm.get(chave)
    return f"{formula} ({nome_em_frase(n)})" if n else formula


def _linha_eq(r, reag, prod, coefs):
    # registra cada coeficiente
    for c in coefs:
        if c != 1:  # o coeficiente 1 não é escrito na equação
            r.calc(c, "balanceamento", texto=str(c))
    return equacao_texto(reag, prod, coefs)


def _R(ctx):
    c = ctx.pac.const("gases", "constante molar", "R")
    if not c:
        return None
    v = c.get("valor", c.get("value"))
    return (c, v) if v is not None else None


def _NA(ctx):
    c = ctx.pac.const("avogadro")
    if not c:
        return None
    v = c.get("valor", c.get("value"))
    return (c, v) if v is not None else None


def _est_massa_para_massa(ctx, rng, reag, prod, coefs, eq_txt):
    todos = reag + prod
    infos = {f: mm_info(ctx, f) for f in todos}
    if any(i is None for i in infos.values()):
        return None
    ia = rng.choice(range(len(reag)))
    ib = rng.choice(range(len(reag), len(todos)))
    A, B = todos[ia], todos[ib]
    ca, cb = coefs[ia], coefs[ib]
    mA = rng.choice(MASSAS_G)
    r = Resp()
    a_txt = _esp(ctx, A)
    b_txt = _esp(ctx, B)
    modelo = rng.choice([
        "Na reação {eq}, quantos gramas de {B} são produzidos a partir de {m} g de {A}?",
        "Na equação {eq}, qual a massa de {B} formada quando {m} g de {A} reagem completamente?",
        "Quantos gramas de {B} se obtêm de {m} g de {A} segundo {eq}?"])
    pergunta = renderizar(modelo, {"eq": eq_txt, "A": a_txt, "B": b_txt, "m": mA}, rng)
    r.ent(mA)
    bal = _linha_eq(r, reag, prod, coefs)
    MA, sMA = inter(infos[A]["M2"], 5)
    MB, sMB = inter(infos[B]["M2"], 5)
    r.calc(MA, "massa_molar", texto=sMA)
    r.calc(MB, "massa_molar", texto=sMB)
    m = D(mA)
    nA, snA = inter(m / MA)
    nB, snB = inter(nA * cb / ca)
    mB = nB * MB
    q, sq = _r_final(r, mB, "estequiometria_massa")
    ra = lambda x, t: r.calc(x, t, texto=str(x))
    linhas = [
        f"a) Equação balanceada: {bal}.",
        f"b) Massas molares: M({A}) = {sMA} g/mol; M({B}) = {sMB} g/mol.",
        f"c) Mols de {A}: n = m ÷ M = {mA} g ÷ {sMA} g/mol = {r.calc(nA, 'mol', texto=snA)} mol.",
        f"d) Proporção {A} : {B} = {ra(ca, 'balanceamento')} : {ra(cb, 'balanceamento')}, logo n({B}) = {snA} × {ra(cb, 'balanceamento')} ÷ {ra(ca, 'balanceamento')} = {r.calc(nB, 'mol', texto=snB)} mol.",
        f"e) Massa de {B}: m = n × M = {snB} mol × {sMB} g/mol = {sq} g.",
        f"Resposta: cerca de {sq} g de {B} ({QUATRO}).",
    ]
    ents = {"equacao": eq_txt}
    return pergunta, "\n".join(linhas), r, ents, "estequiometria_massa_massa", {"tipo": "estequiometria", "entrada": {"reagentes": reag, "produtos": prod, "de": A, "para": B, "massa_g": mA}, "resultado": sq}


def _est_limitante(ctx, rng, reag, prod, coefs, eq_txt):
    if len(reag) != 2:
        return None
    todos = reag + prod
    infos = {f: mm_info(ctx, f) for f in todos}
    if any(i is None for i in infos.values()):
        return None
    A, B = reag
    ca, cb = coefs[0], coefs[1]
    P = prod[0]
    cp = coefs[len(reag)]
    mA, mB = rng.choice(MASSAS_G), rng.choice(MASSAS_G)
    r = Resp()
    modelo = rng.choice([
        "Na reação {eq}, misturam-se {a} g de {A} com {b} g de {B}. Qual é o reagente limitante e quantos gramas de {P} se formam?",
        "Para {eq}, há {a} g de {A} e {b} g de {B}. Identifique o reagente limitante e a massa de {P} produzida.",
        "Reagem {a} g de {A} e {b} g de {B} segundo {eq}. Qual reagente limita a reação e quanto de {P} é obtido?"])
    pergunta = renderizar(modelo, {"eq": eq_txt, "a": mA, "b": mB, "A": A, "B": B, "P": P}, rng)
    r.ent(mA)
    r.ent(mB)
    bal = _linha_eq(r, reag, prod, coefs)
    MA, sMA = inter(infos[A]["M2"], 5)
    MB, sMB = inter(infos[B]["M2"], 5)
    MP, sMP = inter(infos[P]["M2"], 5)
    for x, s in ((MA, sMA), (MB, sMB), (MP, sMP)):
        r.calc(x, "massa_molar", texto=s)
    nA, snA = inter(D(mA) / MA)
    nB, snB = inter(D(mB) / MB)
    rA, srA = inter(nA / ca)
    rB, srB = inter(nB / cb)
    ra = lambda x: r.calc(x, "balanceamento", texto=str(x))
    if rA == rB:
        lim, exc = None, None
    elif rA < rB:
        lim, exc = A, B
    else:
        lim, exc = B, A
    rl = min(rA, rB)
    nP, snP = inter(rl * cp)
    mP = nP * MP
    q, sq = _r_final(r, mP, "estequiometria_limitante")
    linhas = [
        f"a) Equação balanceada: {bal}.",
        f"b) Massas molares: M({A}) = {sMA} g/mol; M({B}) = {sMB} g/mol; M({P}) = {sMP} g/mol.",
        f"c) Mols disponíveis: n({A}) = {mA} ÷ {sMA} = {r.calc(nA, 'mol', texto=snA)} mol; n({B}) = {mB} ÷ {sMB} = {r.calc(nB, 'mol', texto=snB)} mol.",
        f"d) Razão mol/coeficiente: {A}: {snA} ÷ {ra(ca)} = {r.calc(rA, 'razao', texto=srA)}; {B}: {snB} ÷ {ra(cb)} = {r.calc(rB, 'razao', texto=srB)}.",
    ]
    if lim:
        linhas.append(f"e) O menor valor indica o reagente limitante: {lim}. O outro reagente ({exc}) está em excesso.")
    else:
        linhas.append("e) As razões são iguais: os dois reagentes são consumidos por completo (não há excesso).")
    srl = srA if rA <= rB else srB
    linhas.append(f"f) Mols de {P}: {srl} × {ra(cp)} = {r.calc(nP, 'mol', texto=snP)} mol; massa: {snP} mol × {sMP} g/mol = {sq} g.")
    linhas.append(f"Resposta: {('o reagente limitante é ' + lim) if lim else 'não há reagente limitante'}, e se formam cerca de {sq} g de {P} ({QUATRO}).")
    return pergunta, "\n".join(linhas), r, {"equacao": eq_txt}, "estequiometria_limitante", {"tipo": "estequiometria_limitante", "entrada": {"reagentes": reag, "produtos": prod, "massas_g": [mA, mB]}, "resultado": sq}


def _est_rendimento(ctx, rng, reag, prod, coefs, eq_txt):
    todos = reag + prod
    infos = {f: mm_info(ctx, f) for f in todos}
    if any(i is None for i in infos.values()):
        return None
    A = rng.choice(reag)
    ia = reag.index(A)
    P = rng.choice(prod)
    ip = len(reag) + prod.index(P)
    ca, cp = coefs[ia], coefs[ip]
    mA = rng.choice(MASSAS_G)
    r = Resp()
    MA, sMA = inter(infos[A]["M2"], 5)
    MP, sMP = inter(infos[P]["M2"], 5)
    nA, snA = inter(D(mA) / MA)
    nP, snP = inter(nA * cp / ca)
    mt, smt = inter(nP * MP)
    # massa obtida = 60–95 % da teórica, com 3 algarismos significativos
    frac = Decimal(rng.choice([60, 65, 70, 75, 80, 85, 90, 95])) / 100
    obtida = arred_sig(mt * frac, 3)
    s_ob = fmt_sig(obtida, 3)
    modelo = rng.choice([
        "Na reação {eq}, a partir de {a} g de {A} obtiveram-se {o} g de {P}. Qual foi o rendimento percentual?",
        "Segundo {eq}, {a} g de {A} produziram na prática {o} g de {P}. Calcule o rendimento da reação."])
    pergunta = renderizar(modelo, {"eq": eq_txt, "a": mA, "o": s_ob, "A": A, "P": P}, rng)
    r.ent(mA)
    r.ent(s_ob)
    bal = _linha_eq(r, reag, prod, coefs)
    for x, s in ((MA, sMA), (MP, sMP)):
        r.calc(x, "massa_molar", texto=s)
    pct = obtida / mt * 100
    q, sq = _r_final(r, pct, "rendimento_percentual")
    ra = lambda x: r.calc(x, "balanceamento", texto=str(x))
    cem = r.defin(100, "percentual")
    linhas = [
        f"a) Equação balanceada: {bal}.",
        f"b) Mols de {A}: {mA} g ÷ {sMA} g/mol = {r.calc(nA, 'mol', texto=snA)} mol.",
        f"c) Rendimento teórico de {P}: {snA} mol × {ra(cp)} ÷ {ra(ca)} = {r.calc(nP, 'mol', texto=snP)} mol; massa teórica = {snP} mol × {sMP} g/mol = {r.calc(mt, 'massa_teorica', texto=smt)} g.",
        f"d) Rendimento percentual = massa obtida ÷ massa teórica × {cem} = {s_ob} ÷ {smt} × {cem} = {sq} %.",
        f"Resposta: o rendimento foi de cerca de {sq} % ({QUATRO}).",
    ]
    return pergunta, "\n".join(linhas), r, {"equacao": eq_txt}, "estequiometria_rendimento", {"tipo": "rendimento", "entrada": {"reagentes": reag, "produtos": prod, "de": A, "para": P, "massa_g": mA, "obtida_g": s_ob}, "resultado": sq}


def _gerar_estequiometria_equacoes(ctx: Ctx, equacoes):
    rng = ctx.rng
    elegiveis = [e for e in equacoes if all(mm_info(ctx, f) for f in e[2] + e[3])]
    ctx.stats["equacoes_estequiometria_elegiveis"] = len(elegiveis)
    funcs = [(_est_massa_para_massa, 2), (_est_limitante, 1), (_est_rendimento, 1)]
    for k, (tipo, eq, reag, prod, coefs) in enumerate(elegiveis):
        eq_txt = equacao_texto(reag, prod, coefs)
        for fn, vezes in funcs:
            for j in range(vezes):
                res = fn(ctx, rng, reag, prod, coefs, eq_txt)
                if res is None:
                    continue
                pergunta, texto, r, ents, tag, calc = res
                ctx.add(f"ca-est-{k}-{tag}-{j + 1}", pergunta, texto, r, "calculo", "superior" if "limitante" in tag or "rendimento" in tag else "medio",
                        ents, _fontes_massas(ctx) + [FONTE_DEFINICOES], f"calculo:{tag}", FAM, {"calculo": calc})


def _amostra_compostos(ctx: Ctx, maximo: int = 700):
    pac, rng = ctx.pac, ctx.rng
    cands = []
    for c in pac.compostos:
        f = pac.formula_exibicao(c)
        if not f or pac.comp_pendente(c):
            continue
        info = mm_composto(ctx, c)
        if info and not info.get("usa_pubchem") and Decimal(5) < info["M2"] < Decimal(1000):
            cands.append((c, info))
    rng.shuffle(cands)
    return cands[:maximo]


def _gerar_estequiometria_compostos(ctx: Ctx):
    rng, pac = ctx.rng, ctx.pac
    NA = _NA(ctx)
    R = _R(ctx)
    tipos = ["massa_para_mol", "mol_para_massa"] + (["mol_para_particulas", "particulas_para_mol"] if NA else []) + (["volume_cntp"] if R else [])
    for k, (c, info) in enumerate(_amostra_compostos(ctx)):
        tipo = tipos[k % len(tipos)]
        f = pac.formula_exibicao(c)
        nome = pac.nome_composto(c)
        gas = _gas_nas_cntp(ctx, f)
        if tipo == "volume_cntp" and not gas:
            tipo = "massa_para_mol"
        r = Resp()
        M, sM = inter(info["M2"], 5)
        c_txt = sup_composto_sem_artigo(ctx, c)
        art_de = com_artigo(nome, "de")
        art_o = com_artigo(nome, "")
        ents = {"compostos": [c["cid"]]}
        fontes = _fontes_massas(ctx) + fontes_do_registro(c, 1)
        mm_line = f"Massa molar de {f}: M = {sM} g/mol."
        extra = None
        if tipo in ("massa_para_mol", "mol_para_massa"):
            r.calc(M, "massa_molar", texto=sM)
        if tipo == "massa_para_mol":
            m = rng.choice(MASSAS_G)
            pergunta = renderizar(rng.choice(["Quantos mols há em {m} g de {c}?", "Quantos mols existem em {m} g de {c}?", "Converta {m} g de {c} em mol."]),
                                  {"m": m, "c": c_txt}, rng)
            r.ent(m)
            n, sn = inter(D(m) / M)
            q, sq = _r_final(r, n, "mol_de_massa")
            texto = "\n".join([mm_line, f"Mols: n = m ÷ M = {m} g ÷ {sM} g/mol = {sq} mol.", f"Resposta: {sq} mol {art_de} ({QUATRO})."])
            extra = {"tipo": "massa_para_mol", "entrada": {"formula": f, "massa_g": m}, "resultado": sq}
        elif tipo == "mol_para_massa":
            n_s = rng.choice(MOLS)
            pergunta = renderizar(rng.choice(["Qual a massa de {n} mol de {c}?", "Quantos gramas pesam {n} mol de {c}?", "Converta {n} mol de {c} em gramas."]),
                                  {"n": n_s, "c": c_txt}, rng)
            r.ent(n_s)
            m = D(n_s) * M
            q, sq = _r_final(r, m, "massa_de_mol")
            texto = "\n".join([mm_line, f"Massa: m = n × M = {n_s} mol × {sM} g/mol = {sq} g.", f"Resposta: {sq} g ({QUATRO})."])
            extra = {"tipo": "mol_para_massa", "entrada": {"formula": f, "mol": n_s}, "resultado": sq}
        elif tipo == "mol_para_particulas":
            ce, vna = NA
            n_s = rng.choice(MOLS)
            ionico = "." in (c.get("smiles") or "")
            part = "unidades de fórmula" if ionico else "moléculas"
            pergunta = renderizar(rng.choice(["Quantas {p} há em {n} mol de {c}?", "Quantas {p} existem em {n} mol de {c}?"]),
                                  {"p": part, "n": n_s, "c": c_txt}, rng)
            r.ent(n_s)
            NAq, sNA = inter(vna, 5)
            r.pkg_sig(vna, f"constantes#{const_id(ce)}.valor", 5)
            N = D(n_s) * NAq
            q, sq = _r_final(r, N, "particulas_de_mol")
            texto = "\n".join([f"Constante de Avogadro: N_A = {sNA} mol⁻¹ (CODATA).",
                               f"Número de {part}: N = n × N_A = {n_s} mol × {sNA} mol⁻¹ = {sq}.",
                               f"Resposta: cerca de {sq} {part} ({QUATRO})."])
            extra = {"tipo": "mol_para_particulas", "entrada": {"mol": n_s}, "resultado": sq}
            fontes = fontes + _fonte_const(ctx, ce)
        elif tipo == "particulas_para_mol":
            ce, vna = NA
            mant = rng.choice(["1,0", "2,0", "3,0", "6,0", "1,5", "4,5", "9,0"])
            expo = rng.choice([22, 23, 24])
            N_txt = f"{mant} × 10{sup_expoente(expo)}"
            part = "unidades de fórmula" if "." in (c.get("smiles") or "") else "moléculas"
            pergunta = renderizar(rng.choice(["Quantos mols correspondem a {N} {p} de {c}?", "{N} {p} de {c} equivalem a quantos mols?"]),
                                  {"N": N_txt, "p": part, "c": c_txt}, rng)
            r.ent(N_txt)
            NAq, sNA = inter(vna, 5)
            r.pkg_sig(vna, f"constantes#{const_id(ce)}.valor", 5)
            n = D(mant) * (Decimal(10) ** expo) / NAq
            q, sq = _r_final(r, n, "mol_de_particulas")
            texto = "\n".join([f"Constante de Avogadro: N_A = {sNA} mol⁻¹ (CODATA).",
                               f"Mols: n = N ÷ N_A = {N_txt} ÷ {sNA} mol⁻¹ = {sq} mol.", f"Resposta: {sq} mol ({QUATRO})."])
            extra = {"tipo": "particulas_para_mol", "entrada": {"N": N_txt}, "resultado": sq}
            fontes = fontes + _fonte_const(ctx, ce)
        else:  # volume_cntp
            ce, vR = R
            n_s = rng.choice(MOLS)
            pergunta = renderizar(rng.choice(["Qual o volume de {n} mol de {c} nas CNTP?", "Que volume ocupam {n} mol de {c} nas condições normais de temperatura e pressão (CNTP)?"]),
                                  {"n": n_s, "c": c_txt}, rng)
            r.ent(n_s)
            T = r.defin("273,15", "CNTP_temperatura")
            P = r.defin("101.325", "atm_em_Pa")
            um = r.defin("1", "CNTP_pressao_atm")
            vmc = ctx.pac.const("V_m_273_101325")
            vm_val = (vmc.get("valor", vmc.get("value")) if vmc else None)
            if vm_val is not None:  # volume molar do próprio CODATA (m³/mol -> L/mol)
                Vm, sVm = inter(dec(vm_val) * 1000, 5)
                r.calc(Vm, "volume_molar_codata", texto=sVm)
                l1 = f"Nas CNTP, T = {T} K e P = {um} atm = {P} Pa. O volume molar de um gás ideal nessas condições é V_m = {sVm} L/mol (CODATA)."
                fontes_vm = _fonte_const(ctx, vmc)
            else:
                Rq, sR = inter(vR, 5)
                r.pkg_sig(vR, f"constantes#{const_id(ce)}.valor", 5)
                mil = r.defin("1000", "L_por_m3")
                Vm, sVm = inter(Rq * D("273.15") / D("101325") * 1000, 5)
                l1 = (f"Nas CNTP, T = {T} K e P = {um} atm = {P} Pa (gás ideal). Volume molar: V_m = R·T ÷ P = {sR} J/(mol·K) × {T} K ÷ {P} Pa × {mil} L/m³ "
                      f"= {r.calc(Vm, 'volume_molar', texto=sVm)} L/mol.")
                fontes_vm = _fonte_const(ctx, ce)
            V = D(n_s) * Vm
            q, sq = _r_final(r, V, "volume_cntp")
            texto = "\n".join([l1, f"Volume: V = n × V_m = {n_s} mol × {sVm} L/mol = {sq} L.", f"Resposta: {sq} L ({QUATRO})."])
            extra = {"tipo": "volume_cntp", "entrada": {"mol": n_s}, "resultado": sq}
            fontes = fontes + fontes_vm + [FONTE_DEFINICOES]
        ctx.add(f"ca-comp-{c['cid']}-{tipo}", pergunta, texto, r, "calculo", "medio", ents, fontes, f"calculo:{tipo}", FAM, {"calculo": extra})


# ---------------------------------------------------------------------------------------------------------
# Soluções: molaridade, preparo, diluição
# ---------------------------------------------------------------------------------------------------------
def _compostos_soluto(ctx: Ctx):
    nm = {}
    for f in SOLUTOS:
        try:
            chave = tuple(sorted(parse_formula(f, SIMBOLOS).items()))
        except FormulaInvalida:
            continue
        nm[chave] = f
    out = []
    for c in ctx.pac.compostos:
        pf = ctx.pac.formula_exibicao(c)
        if not pf or ctx.pac.comp_pendente(c):
            continue
        try:
            chave = tuple(sorted(parse_formula(pf, SIMBOLOS).items()))
        except FormulaInvalida:
            continue
        if chave in nm:
            info = mm_composto(ctx, c)
            if info:
                out.append((c, nm[chave], info))
    return out


def _gerar_solucoes(ctx: Ctx):
    rng = ctx.rng
    solutos = _compostos_soluto(ctx)
    ctx.stats["solutos_disponiveis"] = len(solutos)
    fontes_base = _fontes_massas(ctx) + [FONTE_DEFINICOES]
    mil = None
    for rep in range(14):
        for c, fsol, info in solutos:
            tipo = rng.choice(["molaridade", "massa_preparo", "g_por_litro", "mol_para_g_l", "diluicao_v2", "diluicao_v1", "diluicao_c2"])
            r = Resp()
            nome = ctx.pac.nome_composto(c)
            f = ctx.pac.formula_exibicao(c)
            M, sM = inter(info["M2"], 5)
            ents = {"compostos": [c["cid"]]}
            if tipo in ("molaridade", "massa_preparo", "mol_para_g_l"):
                r.calc(M, "massa_molar", texto=sM)
            c_txt = sup_composto_sem_artigo(ctx, c)
            if tipo == "molaridade":
                for _ in range(30):
                    m = rng.choice(["2,0", "4,0", "5,0", "10", "20", "40", "58,5", "100"])
                    v = rng.choice(VOL_ML)
                    if Decimal("0.01") <= D(m) / info["M2"] / (D(v) / 1000) <= 6:
                        break
                else:
                    continue
                pergunta = renderizar(rng.choice(["Qual a molaridade de uma solução com {m} g de {c} dissolvidos em água até completar {v} mL?",
                                                  "Dissolveram-se {m} g de {c} em {v} mL de solução. Qual a concentração em mol/L?"]), {"m": m, "c": c_txt, "v": v}, rng)
                r.ent(m); r.ent(v)
                n, sn = inter(D(m) / M)
                mil = r.defin("1000", "mL_por_L")
                VL, sVL = inter(D(v) / 1000)
                C = n / VL
                q, sq = _r_final(r, C, "molaridade")
                texto = "\n".join([f"Massa molar de {f}: M = {sM} g/mol.", f"a) Mols do soluto: n = m ÷ M = {m} g ÷ {sM} g/mol = {r.calc(n, 'mol', texto=sn)} mol.",
                                   f"b) Volume em litros: V = {v} mL ÷ {mil} mL/L = {r.calc(VL, 'volume_L', texto=sVL)} L.",
                                   f"c) Molaridade: C = n ÷ V = {sn} mol ÷ {sVL} L = {sq} mol/L.", f"Resposta: {sq} mol/L ({QUATRO})."])
                calc = {"tipo": "molaridade", "entrada": {"formula": f, "massa_g": m, "volume_mL": v}, "resultado": sq}
            elif tipo == "massa_preparo":
                cc = rng.choice(CONC)
                v = rng.choice(VOL_ML)
                pergunta = renderizar(rng.choice(["Quantos gramas de {c} são necessários para preparar {v} mL de solução {cc} mol/L?",
                                                  "Que massa de {c} devo pesar para fazer {v} mL de uma solução {cc} mol/L?"]), {"c": c_txt, "v": v, "cc": cc}, rng)
                r.ent(cc); r.ent(v)
                mil = r.defin("1000", "mL_por_L")
                VL, sVL = inter(D(v) / 1000)
                n, sn = inter(D(cc) * VL)
                m = n * M
                q, sq = _r_final(r, m, "massa_preparo")
                texto = "\n".join([f"Massa molar de {f}: M = {sM} g/mol.", f"a) Volume em litros: V = {v} mL ÷ {mil} mL/L = {r.calc(VL, 'volume_L', texto=sVL)} L.",
                                   f"b) Mols necessários: n = C × V = {cc} mol/L × {sVL} L = {r.calc(n, 'mol', texto=sn)} mol.",
                                   f"c) Massa: m = n × M = {sn} mol × {sM} g/mol = {sq} g.", f"Resposta: {sq} g ({QUATRO})."])
                calc = {"tipo": "massa_preparo", "entrada": {"formula": f, "mol_L": cc, "volume_mL": v}, "resultado": sq}
            elif tipo == "g_por_litro":
                for _ in range(30):
                    m = rng.choice(["2,0", "5,0", "10", "20", "25", "50"])
                    v = rng.choice(VOL_ML)
                    if D(m) / (D(v) / 1000) <= 300:
                        break
                else:
                    continue
                pergunta = renderizar(rng.choice(["Qual a concentração comum (g/L) de uma solução com {m} g de {c} em {v} mL?",
                                                  "Uma solução tem {m} g de {c} em {v} mL. Qual a concentração em g/L?"]), {"m": m, "c": c_txt, "v": v}, rng)
                r.ent(m); r.ent(v)
                mil = r.defin("1000", "mL_por_L")
                VL, sVL = inter(D(v) / 1000)
                C = D(m) / VL
                q, sq = _r_final(r, C, "concentracao_comum")
                texto = "\n".join([f"a) Volume em litros: V = {v} mL ÷ {mil} mL/L = {r.calc(VL, 'volume_L', texto=sVL)} L.",
                                   f"b) Concentração comum: C = m ÷ V = {m} g ÷ {sVL} L = {sq} g/L.", f"Resposta: {sq} g/L ({QUATRO})."])
                calc = {"tipo": "concentracao_comum", "entrada": {"massa_g": m, "volume_mL": v}, "resultado": sq}
            elif tipo == "mol_para_g_l":
                cc = rng.choice(CONC)
                pergunta = renderizar(rng.choice(["Qual a concentração em g/L de uma solução {cc} mol/L de {c}?", "Converta {cc} mol/L de {c} em g/L."]), {"cc": cc, "c": c_txt}, rng)
                r.ent(cc)
                C = D(cc) * M
                q, sq = _r_final(r, C, "mol_L_para_g_L")
                texto = "\n".join([f"Massa molar de {f}: M = {sM} g/mol.", f"Concentração em g/L = concentração em mol/L × M = {cc} mol/L × {sM} g/mol = {sq} g/L.",
                                   f"Resposta: {sq} g/L ({QUATRO})."])
                calc = {"tipo": "mol_L_para_g_L", "entrada": {"formula": f, "mol_L": cc}, "resultado": sq}
            elif tipo == "diluicao_v2":
                c1 = rng.choice(["1,0", "2,0", "4,0", "6,0", "0,50"])
                c2 = rng.choice([x for x in ["0,10", "0,20", "0,25", "0,50", "1,0"] if D(x) < D(c1)] or ["0,10"])
                v1 = rng.choice(["25", "50", "100", "200"])
                pergunta = renderizar(rng.choice(["Diluem-se {v1} mL de solução de {c} {c1} mol/L até a concentração {c2} mol/L. Qual o volume final?",
                                                  "Que volume final se obtém ao diluir {v1} mL de {c} {c1} mol/L para {c2} mol/L?"]), {"v1": v1, "c1": c1, "c2": c2, "c": c_txt}, rng)
                r.ent(v1); r.ent(c1); r.ent(c2)
                V2 = D(c1) * D(v1) / D(c2)
                q, sq = _r_final(r, V2, "diluicao_v2")
                add = V2 - D(v1)
                texto = "\n".join(["Na diluição o número de mols do soluto não muda: C₁·V₁ = C₂·V₂.",
                                   f"V₂ = C₁·V₁ ÷ C₂ = {c1} mol/L × {v1} mL ÷ {c2} mol/L = {sq} mL.",
                                   f"Volume de água a acrescentar: V₂ − V₁ = {sq} mL − {v1} mL = {r.calc(add, 'volume_agua', 4)} mL.",
                                   f"Resposta: volume final de {sq} mL ({QUATRO})."])
                calc = {"tipo": "diluicao_v2", "entrada": {"c1": c1, "v1": v1, "c2": c2}, "resultado": sq}
            elif tipo == "diluicao_v1":
                c1 = rng.choice(["2,0", "4,0", "6,0", "12"])
                c2 = rng.choice(["0,10", "0,20", "0,25", "0,50", "1,0"])
                v2 = rng.choice(["250", "500", "1000"])
                pergunta = renderizar(rng.choice(["Quantos mL de {c} {c1} mol/L são necessários para preparar {v2} mL de solução {c2} mol/L?",
                                                  "Que volume de solução estoque de {c} {c1} mol/L devo medir para obter {v2} mL a {c2} mol/L?"]),
                                      {"c1": c1, "c2": c2, "v2": v2, "c": c_txt}, rng)
                r.ent(c1); r.ent(c2); r.ent(v2)
                V1 = D(c2) * D(v2) / D(c1)
                q, sq = _r_final(r, V1, "diluicao_v1")
                texto = "\n".join(["Na diluição o número de mols do soluto não muda: C₁·V₁ = C₂·V₂.",
                                   f"V₁ = C₂·V₂ ÷ C₁ = {c2} mol/L × {v2} mL ÷ {c1} mol/L = {sq} mL.",
                                   f"Resposta: medir {sq} mL da solução concentrada e completar com água até {v2} mL ({QUATRO})."])
                calc = {"tipo": "diluicao_v1", "entrada": {"c1": c1, "c2": c2, "v2": v2}, "resultado": sq}
            else:
                c1 = rng.choice(["1,0", "2,0", "5,0"])
                v1 = rng.choice(["50", "100", "200"])
                v2 = rng.choice(["250", "500", "1000"])
                pergunta = renderizar(rng.choice(["Qual a concentração final ao diluir {v1} mL de {c} {c1} mol/L até {v2} mL?",
                                                  "Tomam-se {v1} mL de solução {c1} mol/L de {c} e completa-se com água até {v2} mL. Qual a nova concentração?"]),
                                      {"v1": v1, "c1": c1, "v2": v2, "c": c_txt}, rng)
                r.ent(v1); r.ent(c1); r.ent(v2)
                C2 = D(c1) * D(v1) / D(v2)
                q, sq = _r_final(r, C2, "diluicao_c2")
                texto = "\n".join(["Na diluição o número de mols do soluto não muda: C₁·V₁ = C₂·V₂.",
                                   f"C₂ = C₁·V₁ ÷ V₂ = {c1} mol/L × {v1} mL ÷ {v2} mL = {sq} mol/L.", f"Resposta: {sq} mol/L ({QUATRO})."])
                calc = {"tipo": "diluicao_c2", "entrada": {"c1": c1, "v1": v1, "v2": v2}, "resultado": sq}
            ctx.add(f"ca-sol-{c['cid']}-{tipo}-{rep}", pergunta, texto, r, "calculo", "medio", ents, fontes_base + fontes_do_registro(c, 1),
                    f"calculo:{tipo}", FAM, {"calculo": calc})


# ---------------------------------------------------------------------------------------------------------
# pH de ácidos e bases fortes
# ---------------------------------------------------------------------------------------------------------
CONC_PH = ["1,0", "0,10", "0,010", "0,0010", "0,050", "0,020", "0,0050", "0,25", "0,0025", "0,15", "0,00010", "0,030", "0,075", "0,40"]


def arred_decimais(x, casas):
    return dec(x).quantize(Decimal(1).scaleb(-casas), ROUND_HALF_UP)


def listas_fortes(ctx: Ctx):
    """({fórmula: nº de H+ liberados}, {fórmula: (nº de OH- por fórmula, limite de concentração em mol/L)}) de regras.json (`acidosFortes`,
    `basesFortes`); sem o arquivo, as listas embutidas. Ácidos com `nota` (ex.: H2SO4, forte só na 1ª ionização) ficam de fora."""
    regras = ctx.pac.regras or {}
    acidos, bases = {}, {}
    for a in regras.get("acidosFortes") or []:
        try:
            cont = parse_formula(a["formula"], SIMBOLOS)
        except (FormulaInvalida, KeyError):
            continue
        if not a.get("nota") and cont.get("H") == 1:
            acidos[a["formula"]] = 1
    for b in regras.get("basesFortes") or []:
        try:
            cont = parse_formula(b["formula"], SIMBOLOS)
        except (FormulaInvalida, KeyError):
            continue
        if cont.get("O") and cont.get("O") == cont.get("H"):
            bases[b["formula"]] = (cont["O"], Decimal("0.02") if "pouco solúvel" in (b.get("nota") or "") else Decimal(1))
    if not acidos:
        acidos = dict(ACIDOS_FORTES)
    if not bases:
        bases = {f: (n, Decimal("0.02") if f == "Ca(OH)2" else Decimal(1)) for f, n in BASES_FORTES.items()}
    ctx.stats["ph_listas_fortes_de"] = "regras.json" if regras.get("acidosFortes") else "embutidas"
    return acidos, bases


def _fortes_disponiveis(ctx: Ctx):
    achados = {}
    acidos, bases = listas_fortes(ctx)
    for c in ctx.pac.compostos:
        f = ctx.pac.formula_exibicao(c)
        if not f or ctx.pac.comp_pendente(c):
            continue
        try:
            chave = tuple(sorted(parse_formula(f, SIMBOLOS).items()))
        except FormulaInvalida:
            continue
        for forte, n in acidos.items():
            if tuple(sorted(parse_formula(forte, SIMBOLOS).items())) == chave:
                achados[forte] = (c, "acido", n, Decimal(1))
        for forte, (n, lim) in bases.items():
            if tuple(sorted(parse_formula(forte, SIMBOLOS).items())) == chave:
                achados[forte] = (c, "base", n, lim)
    return achados


def _gerar_ph(ctx: Ctx):
    rng = ctx.rng
    achados = _fortes_disponiveis(ctx)
    ctx.stats["ph_fortes_disponiveis"] = len(achados)
    for rep in range(10):
        for forte, (c, tipo, n_oh, limite) in achados.items():
            r = Resp()
            nome = ctx.pac.nome_composto(c)
            sujeito = cap(com_artigo(nome, "", pendente=ctx.pac.comp_pendente(c)))
            c_txt = sup_composto_sem_artigo(ctx, c)
            ents = {"compostos": [c["cid"]]}
            inverso = rng.random() < 0.35
            if not inverso:
                conc = rng.choice([x for x in CONC_PH if D(x) * (n_oh if tipo == "base" else 1) <= 1 and (tipo == "acido" or D(x) <= limite)] or ["0,010"])
                casas = sf(conc)
                pergunta = renderizar(rng.choice(["Qual o pH de uma solução {conc} mol/L de {c}?", "Calcule o pH de {c} {conc} mol/L.",
                                                  "Qual é o pH de {c} a {conc} mol/L?"]), {"conc": conc, "c": c_txt}, rng)
                r.ent(conc)
                scasas = r.calc(casas, "casas_pH", texto=str(casas))
                if tipo == "acido":
                    ph = -log10(D(conc))
                    sph = r.calc_casas(ph, "ph", casas)
                    linhas = [f"{sujeito} ({forte}) é um ácido forte: com ionização total, [H⁺] = {conc} mol/L.",
                              f"pH = −log10[H⁺] = −log10({conc}) = {sph}.",
                              f"Resposta: pH = {sph} (o número de casas decimais do pH é igual ao de algarismos significativos da concentração: {scasas})."]
                else:
                    catorze, vint = r.defin("14", "pKw_25C"), r.defin("25", "temperatura_pKw")
                    if n_oh == 1:
                        oh_q, oh_s = D(conc), conc
                        l1 = f"{sujeito} ({forte}) é uma base forte: com dissociação total, [OH⁻] = {conc} mol/L."
                    else:
                        oh_q, oh_s = inter(D(conc) * n_oh)
                        r.calc(oh_q, "oh_conc", texto=oh_s)
                        nn = r.calc(n_oh, "ohs", texto=str(n_oh))
                        l1 = (f"{sujeito} ({forte}) é uma base forte e libera {nn} OH⁻ por fórmula: "
                              f"[OH⁻] = {nn} × {conc} mol/L = {oh_s} mol/L.")
                    poh = -log10(oh_q)
                    ph = D(14) - arred_decimais(poh, casas)
                    spoh = r.calc_casas(poh, "pOH", casas)
                    sph = r.calc_casas(ph, "ph", casas)
                    linhas = [l1, f"pOH = −log10[OH⁻] = −log10({oh_s}) = {spoh}.",
                              f"A {vint} °C, pH + pOH = {catorze}, então pH = {catorze} − {spoh} = {sph}.",
                              f"Resposta: pH = {sph} (o número de casas decimais do pH é igual ao de algarismos significativos da concentração: {scasas})."]
                resultado = fmt_casas(ph, casas)
                calc = {"tipo": "ph", "entrada": {"formula": forte, "mol_L": conc}, "resultado": resultado}
            else:
                ph_v = rng.choice(["1,0", "2,0", "3,0", "2,5", "1,5", "4,0"] if tipo == "acido" else ["11,0", "12,0", "13,0", "10,0", "12,5"])
                dec_ph = len(ph_v.split(",")[1])
                if tipo == "base" and Decimal(10) ** (-(14 - D(ph_v))) / n_oh > limite:
                    continue  # acima da solubilidade (ex.: Ca(OH)2)
                pergunta = renderizar(rng.choice(["Qual a concentração de {c} numa solução de pH {ph}?", "Uma solução de {c} tem pH {ph}. Qual a sua concentração em mol/L?"]),
                                      {"ph": ph_v, "c": c_txt}, rng)
                r.ent(ph_v)
                sfv = r.calc(dec_ph, "sig_ph", texto=str(dec_ph))
                dez = r.defin("10", "base_log")
                if tipo == "acido":
                    h = h_de_ph(D(ph_v))
                    q, sq = _r_final(r, h, "h_de_ph", dec_ph)
                    linhas = [f"{sujeito} ({forte}) é um ácido forte (ionização total): [H⁺] = {dez}^(−pH).",
                              f"[H⁺] = {dez}^(−{ph_v}) = {sq} mol/L, que é também a concentração do ácido.",
                              f"Resposta: {sq} mol/L (algarismos significativos = casas decimais do pH: {sfv})."]
                else:
                    catorze, vint = r.defin("14", "pKw_25C"), r.defin("25", "temperatura_pKw")
                    poh = D(14) - D(ph_v)
                    spoh = r.calc_casas(poh, "pOH", dec_ph)
                    oh = h_de_ph(arred_decimais(poh, dec_ph))
                    soh = r.calc(oh, "oh_conc", dec_ph)
                    base_c = oh / n_oh
                    q, sq = _r_final(r, base_c, "conc_base_de_ph", dec_ph)
                    div = ""
                    if n_oh != 1:
                        nn = r.calc(n_oh, "ohs", texto=str(n_oh))
                        div = f" Como cada fórmula libera {nn} OH⁻, a concentração da base é [OH⁻] ÷ {nn}."
                    linhas = [f"{sujeito} ({forte}) é uma base forte (dissociação total). A {vint} °C, pH + pOH = {catorze}.",
                              f"pOH = {catorze} − {ph_v} = {spoh}; [OH⁻] = {dez}^(−{spoh}) = {soh} mol/L.{div}",
                              f"Resposta: {sq} mol/L (algarismos significativos = casas decimais do pH: {sfv})."]
                calc = {"tipo": "ph_inverso", "entrada": {"formula": forte, "ph": ph_v}, "resultado": sq}
            ctx.add(f"ca-ph-{c['cid']}-{rep}-{'inv' if inverso else 'dir'}", pergunta, "\n".join(linhas), r, "calculo", "medio", ents,
                    [FONTE_DEFINICOES] + fontes_do_registro(c, 1), "calculo:ph", FAM, {"calculo": calc})


# ---------------------------------------------------------------------------------------------------------
# Gás ideal
# ---------------------------------------------------------------------------------------------------------
P_UN = {"atm": ["0,50", "1,0", "1,5", "2,0", "3,0", "0,80"], "kPa": ["50", "100", "150", "200", "250"], "mmHg": ["380", "760", "500", "900"]}
T_UN = {"K": ["273", "298", "300", "350", "400", "500"], "°C": ["0", "20", "25", "27", "37", "100"]}
V_UN = {"L": ["1,0", "2,0", "5,0", "10", "20", "0,50"], "mL": ["250", "500", "1000"]}
N_LIST = ["0,10", "0,25", "0,50", "1,0", "2,0", "3,0", "5,0"]


def _gerar_gas(ctx: Ctx, n_total: int = 260):
    rng = ctx.rng
    R = _R(ctx)
    if not R:
        ctx.stats["gas_ideal_sem_R"] = 1
        return
    ce, vR = R
    fontes = _fonte_const(ctx, ce) + [FONTE_DEFINICOES]
    feitos = tentativas = 0
    while feitos < n_total and tentativas < n_total * 10:
        tentativas += 1
        incognita = rng.choice(["V", "V", "P", "n", "T"])
        pu, tu, vu = rng.choice(list(P_UN)), rng.choice(list(T_UN)), rng.choice(list(V_UN))
        dados_all = {"P": (rng.choice(P_UN[pu]), pu), "V": (rng.choice(V_UN[vu]), vu), "T": (rng.choice(T_UN[tu]), tu), "n": (rng.choice(N_LIST), "mol")}
        dados = {k: v for k, v in dados_all.items() if k != incognita}
        partes = [f"{dados['n'][0]} mol de gás" if k == "n" else f"{dados[k][0]} {dados[k][1]}" for k in ("n", "T", "P", "V") if k in dados]
        alvo = {"V": "o volume (em litros)", "P": "a pressão (em atm)", "n": "a quantidade de gás (em mol)", "T": "a temperatura (em kelvin)"}[incognita]
        pergunta = renderizar(rng.choice(["Num gás ideal ({d}), qual é {alvo}?", "Considere um gás ideal com {d}. Determine {alvo}.", "Calcule {alvo} de um gás ideal com {d}."]),
                              {"d": ", ".join(partes), "alvo": alvo}, rng)
        r = Resp()
        for v, u in dados.values():
            r.ent(v)
        Rq, sR = inter(vR, 5)
        r.pkg_sig(vR, f"constantes#{const_id(ce)}.valor", 5)
        et1, vals, shown = [], {}, {}
        if "P" in dados:
            v, u = dados["P"]
            fr = tabela(ctx)["pressao"][1][u]
            fq, fs = inter(Decimal(fr.numerator) / Decimal(fr.denominator), 7)
            r.defin(fs, f"fator_{u}_Pa")
            valor, s = inter(D(v) * fq, 6)
            et1.append(f"P = {v} {u} × {fs} Pa/{u} = {r.calc(valor, 'P_Pa', texto=s)} Pa")
            vals["P"], shown["P"] = valor, s
        if "V" in dados:
            v, u = dados["V"]
            fr = tabela(ctx)["volume"][1][u]
            fq, fs = inter(Decimal(fr.numerator) / Decimal(fr.denominator), 7)
            r.defin(fs, f"fator_{u}_m3")
            valor, s = inter(D(v) * fq, 6)
            et1.append(f"V = {v} {u} × {fs} m³/{u} = {r.calc(valor, 'V_m3', texto=s)} m³")
            vals["V"], shown["V"] = valor, s
        if "T" in dados:
            v, u = dados["T"]
            if u == "°C":
                valor, s = inter(D(v) + D("273.15"))
                et1.append(f"T = {v} °C + {r.defin('273,15', 'zero_celsius')} = {r.calc(valor, 'T_K', texto=s)} K")
            else:
                valor, s = D(v), v
                et1.append(f"T = {v} K")
            vals["T"], shown["T"] = valor, s
        if "n" in dados:
            vals["n"], shown["n"] = D(dados["n"][0]), dados["n"][0]
            et1.append(f"n = {dados['n'][0]} mol")
        linhas = ["a) Converter os dados para o SI: " + "; ".join(et1) + ".", f"b) Usar PV = nRT, com R = {sR} J/(mol·K)."]
        if incognita == "V":
            Vm3, sVm3 = inter(vals["n"] * Rq * vals["T"] / vals["P"], 5)
            mil = r.defin("1000", "L_por_m3")
            q, sq = _r_final(r, Vm3 * 1000, "gas_volume")
            linhas += [f"c) V = n·R·T ÷ P = {shown['n']} × {sR} × {shown['T']} ÷ {shown['P']} = {r.calc(Vm3, 'V_m3', texto=sVm3)} m³.",
                       f"d) Em litros: V = {sVm3} m³ × {mil} L/m³ = {sq} L.", f"Resposta: V ≈ {sq} L ({QUATRO})."]
        elif incognita == "P":
            Pa, sPa = inter(vals["n"] * Rq * vals["T"] / vals["V"], 5)
            q, sq = _r_final(r, Pa / Decimal(101325), "gas_pressao_atm")
            linhas += [f"c) P = n·R·T ÷ V = {shown['n']} × {sR} × {shown['T']} ÷ {shown['V']} = {r.calc(Pa, 'P_Pa', texto=sPa)} Pa.",
                       f"d) Em atm: P = {sPa} Pa ÷ {r.defin('101.325', 'atm_em_Pa')} Pa/atm = {sq} atm.", f"Resposta: P ≈ {sq} atm ({QUATRO})."]
        elif incognita == "n":
            q, sq = _r_final(r, vals["P"] * vals["V"] / (Rq * vals["T"]), "gas_mol")
            linhas += [f"c) n = P·V ÷ (R·T) = {shown['P']} × {shown['V']} ÷ ({sR} × {shown['T']}) = {sq} mol.", f"Resposta: n ≈ {sq} mol ({QUATRO})."]
        else:
            q, sq = _r_final(r, vals["P"] * vals["V"] / (vals["n"] * Rq), "gas_temperatura")
            linhas += [f"c) T = P·V ÷ (n·R) = {shown['P']} × {shown['V']} ÷ ({shown['n']} × {sR}) = {sq} K.", f"Resposta: T ≈ {sq} K ({QUATRO})."]
        faixa = {"V": (Decimal("0.05"), Decimal(500)), "P": (Decimal("0.05"), Decimal(30)), "n": (Decimal("0.005"), Decimal(30)), "T": (Decimal(150), Decimal(1500))}[incognita]
        if not (faixa[0] <= q <= faixa[1]):
            continue  # cenário fisicamente implausível: descarta
        ok = ctx.add(f"ca-gas-{feitos}-{incognita}", pergunta, "\n".join(linhas), r, "calculo", "superior", {}, fontes, "calculo:gas_ideal", FAM,
                     {"calculo": {"tipo": "gas_ideal", "entrada": {"incognita": incognita, "dados": {k: list(v) for k, v in dados.items()}}, "resultado": sq}})
        feitos += 1 if ok else 0


# ---------------------------------------------------------------------------------------------------------
# Conversão de unidades
# ---------------------------------------------------------------------------------------------------------
NOMES_UN = {"mg": "miligramas", "g": "gramas", "kg": "quilogramas", "mL": "mililitros", "L": "litros", "m³": "metros cúbicos", "cm³": "centímetros cúbicos",
            "atm": "atmosferas", "Pa": "pascais", "kPa": "quilopascais", "bar": "bar", "mmHg": "milímetros de mercúrio", "J": "joules", "kJ": "quilojoules",
            "cal": "calorias", "kcal": "quilocalorias", "nm": "nanômetros", "pm": "picômetros", "Å": "ångströms", "mm": "milímetros", "cm": "centímetros",
            "m": "metros", "km": "quilômetros", "mol": "mols", "mmol": "milimols", "min": "minutos", "h": "horas", "s": "segundos", "°C": "graus Celsius",
            "K": "kelvin", "°F": "graus Fahrenheit", "mol/L": "mols por litro", "mmol/L": "milimols por litro", "dm³": "decímetros cúbicos",
            "MPa": "megapascais", "t": "toneladas", "µg": "microgramas", "µL": "microlitros", "µm": "micrômetros", "kmol": "quilomols", "µmol": "micromols",
            "torr": "torr", "µmol/L": "micromols por litro"}
VALORES_CONV = ["1", "2", "2,5", "5", "10", "25", "100", "0,5", "250", "1000", "0,25", "750", "3,5", "12"]
VALORES_TEMP = {"°C": ["0", "25", "37", "100", "20", "−40", "−10"], "K": ["0", "273,15", "298,15", "300", "373,15", "77"], "°F": ["32", "50", "68", "98,6", "212", "−4"]}


def _resultado_conversao(r, x, tipo):
    """Resultado exato (até 10 algarismos significativos) ou arredondado para 4 algarismos significativos."""
    d = dec(x)
    if arred_sig(d, 10) == d:
        q, s = inter(d, 10)
        return r.calc(q, tipo, texto=s), True
    return r.calc(d, tipo, 4), False


def _gerar_conversoes(ctx: Ctx, n_total: int = 420):
    rng = ctx.rng
    feitos = tentativas = 0
    pares = []
    for g, (base, us) in tabela(ctx).items():
        for a in us:
            for b in us:
                if a != b:
                    pares.append((g, a, b))
    for a in ("°C", "K", "°F"):
        for b in ("°C", "K", "°F"):
            if a != b:
                pares.append(("temperatura", a, b))
    rng.shuffle(pares)
    while feitos < n_total and tentativas < n_total * 8:
        g, a, b = pares[tentativas % len(pares)]
        tentativas += 1
        r = Resp()
        if g == "temperatura":
            v = rng.choice(VALORES_TEMP[a])
        else:
            v = rng.choice(VALORES_CONV)
        vd = D(v.replace("−", "-"))
        modelo = rng.choice(["Converta {v} {a} para {b}.", "Quantos {nb} são {v} {a}?", "{v} {a} em {b}", "Quanto é {v} {a} em {b}?", "Passe {v} {a} para {b}."])
        pergunta = renderizar(modelo, {"v": v, "a": a, "b": b, "nb": NOMES_UN.get(b, b)}, rng)
        r.ent(v.lstrip("−"))
        res, passos = converter(vd, a, b, tabela(ctx))
        if g == "temperatura":
            zero = "273,15"
            z = lambda: r.defin(zero, "zero_celsius")
            n9, n5, n32 = (lambda: r.defin(9, "conv_F")), (lambda: r.defin(5, "conv_F")), (lambda: r.defin(32, "conv_F"))
            if (a, b) == ("°C", "K"):
                f1, f2 = f"K = °C + {z()}.", f"{v} + {zero} = RES K."
            elif (a, b) == ("K", "°C"):
                f1, f2 = f"°C = K − {z()}.", f"{v} − {zero} = RES °C."
            elif (a, b) == ("°C", "°F"):
                f1, f2 = f"°F = °C × {n9()} ÷ {n5()} + {n32()}.", f"{v} × 9 ÷ 5 + 32 = RES °F."
            elif (a, b) == ("°F", "°C"):
                f1, f2 = f"°C = (°F − {n32()}) × {n5()} ÷ {n9()}.", f"({v} − 32) × 5 ÷ 9 = RES °C."
            elif (a, b) == ("K", "°F"):
                f1, f2 = f"°F = (K − {z()}) × {n9()} ÷ {n5()} + {n32()}.", f"({v} − {zero}) × 9 ÷ 5 + 32 = RES °F."
            else:
                f1, f2 = f"K = (°F − {n32()}) × {n5()} ÷ {n9()} + {z()}.", f"({v} − 32) × 5 ÷ 9 + {zero} = RES K."
            sres, exato = _resultado_conversao(r, res, "conversao_temperatura")
            linhas = [f1, f2.replace("RES", sres)]
        else:
            _, fd, fp, base, em_base = passos[0]
            ffd = Decimal(fd.numerator) / Decimal(fd.denominator)
            ffp = Decimal(fp.numerator) / Decimal(fp.denominator)
            um = r.defin("1", "unidade")
            if fd == 1:
                fps = r.defin(inter(ffp, 7)[1], f"fator_{b}")
                sres, exato = _resultado_conversao(r, vd / ffp, "conversao_unidade")
                linhas = [f"{um} {b} equivale a {fps} {base}.", f"{v} {a} ÷ {fps} {base}/{b} = {sres} {b}."]
            elif fp == 1:
                fds = r.defin(inter(ffd, 7)[1], f"fator_{a}")
                sres, exato = _resultado_conversao(r, vd * ffd, "conversao_unidade")
                linhas = [f"{um} {a} equivale a {fds} {base}.", f"{v} {a} × {fds} {base}/{a} = {sres} {b}."]
            else:
                fds = r.defin(inter(ffd, 7)[1], f"fator_{a}")
                fps = r.defin(inter(ffp, 7)[1], f"fator_{b}")
                vb, svb = inter(vd * ffd, 7)
                sres, exato = _resultado_conversao(r, vb / ffp, "conversao_unidade")
                r.calc(vb, "valor_na_base", texto=svb)
                linhas = [f"{um} {a} equivale a {fds} {base}, e {um} {b} equivale a {fps} {base}.",
                          f"Primeiro: {v} {a} × {fds} {base}/{a} = {svb} {base}.", f"Depois: {svb} {base} ÷ {fps} {base}/{b} = {sres} {b}."]
        linhas.append(f"Resposta: {sres} {b}" + ("." if exato else f" ({QUATRO})."))
        ok = ctx.add(f"ca-conv-{feitos}", pergunta, "\n".join(linhas), r, "calculo", "fundamental" if g != "temperatura" else "medio",
                     {"quantidades": [{"valor": v, "unidade": a}], "unidadeDestino": b}, [FONTE_DEFINICOES], "calculo:conversao_unidade", FAM,
                     {"calculo": {"tipo": "conversao", "entrada": {"valor": v, "de": a, "para": b}, "resultado": sres}})
        feitos += 1 if ok else 0


def gerar(ctx: Ctx):
    _gerar_massa_molar(ctx)
    eqs = _equacoes_validas(ctx)
    _gerar_balanceamento(ctx, eqs)
    _gerar_estequiometria_equacoes(ctx, eqs)
    _gerar_estequiometria_compostos(ctx)
    _gerar_solucoes(ctx)
    _gerar_ph(ctx)
    _gerar_gas(ctx)
    _gerar_conversoes(ctx)
