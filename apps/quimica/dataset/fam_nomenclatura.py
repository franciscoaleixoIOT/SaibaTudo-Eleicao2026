# -*- coding: utf-8 -*-
"""Família NOMENCLATURA: nome ↔ fórmula dos compostos do núcleo e de compostos inorgânicos simples gerados por REGRAS.

As regras (cátions, ânions, cargas, prefixos) são aplicadas por código; cada composto gerado só entra no dataset se for
VALIDADO por uma fórmula conhecida: a tabela CONHECIDAS (escrita à mão, independente do gerador), ou um composto do pacote com
a mesma composição e o mesmo nome. A carga dos cátions é conferida com `estadosOxidacao` do elemento no pacote quando existir.
"""
from collections import Counter
from math import gcd

from calculo import FormulaInvalida, parse_formula
from comum import Resp, cap, fold, renderizar
from pacote import fontes_do_registro
from qa_base import FONTE_AUTORIA, Ctx, sup_composto_sem_artigo

FAM = "nomenclatura"

# (símbolo/fórmula do cátion, nome, cargas possíveis)
CATIONS = [("Li", "lítio", [1]), ("Na", "sódio", [1]), ("K", "potássio", [1]), ("Rb", "rubídio", [1]), ("Cs", "césio", [1]), ("Ag", "prata", [1]),
           ("Be", "berílio", [2]), ("Mg", "magnésio", [2]), ("Ca", "cálcio", [2]), ("Sr", "estrôncio", [2]), ("Ba", "bário", [2]), ("Zn", "zinco", [2]),
           ("Cd", "cádmio", [2]), ("Al", "alumínio", [3]), ("Fe", "ferro", [2, 3]), ("Cu", "cobre", [1, 2]), ("Sn", "estanho", [2, 4]),
           ("Pb", "chumbo", [2, 4]), ("Co", "cobalto", [2, 3]), ("Ni", "níquel", [2]), ("Mn", "manganês", [2, 4]), ("Cr", "cromo", [3]),
           ("Hg", "mercúrio", [2]), ("NH4", "amônio", [1])]
# (fórmula do ânion, nome, carga em módulo)
ANIONS = [("F", "fluoreto", 1), ("Cl", "cloreto", 1), ("Br", "brometo", 1), ("I", "iodeto", 1), ("O", "óxido", 2), ("S", "sulfeto", 2), ("N", "nitreto", 3),
          ("P", "fosfeto", 3), ("H", "hidreto", 1), ("OH", "hidróxido", 1), ("NO3", "nitrato", 1), ("NO2", "nitrito", 1), ("SO4", "sulfato", 2),
          ("SO3", "sulfito", 2), ("CO3", "carbonato", 2), ("HCO3", "hidrogenocarbonato", 1), ("PO4", "fosfato", 3), ("ClO", "hipoclorito", 1),
          ("ClO2", "clorito", 1), ("ClO3", "clorato", 1), ("ClO4", "perclorato", 1), ("CN", "cianeto", 1), ("MnO4", "permanganato", 1),
          ("Cr2O7", "dicromato", 2), ("CrO4", "cromato", 2), ("C2O4", "oxalato", 2), ("S2O3", "tiossulfato", 2), ("SiO3", "silicato", 2),
          ("CH3COO", "acetato", 1)]
ANION_ACIDO = {"F": "fluorídrico", "Cl": "clorídrico", "Br": "bromídrico", "I": "iodídrico", "S": "sulfídrico", "CN": "cianídrico", "NO3": "nítrico",
               "NO2": "nitroso", "SO4": "sulfúrico", "SO3": "sulfuroso", "CO3": "carbônico", "PO4": "fosfórico", "ClO": "hipocloroso", "ClO2": "cloroso",
               "ClO3": "clórico", "ClO4": "perclórico", "MnO4": "permangânico", "Cr2O7": "dicrômico", "CrO4": "crômico", "C2O4": "oxálico",
               "S2O3": "tiossulfúrico", "SiO3": "silícico", "CH3COO": "acético"}

# Fórmulas conhecidas (validação independente do gerador). nome -> fórmula
CONHECIDAS = {
    # óxidos
    "óxido de sódio": "Na2O", "óxido de potássio": "K2O", "óxido de lítio": "Li2O", "óxido de magnésio": "MgO", "óxido de cálcio": "CaO",
    "óxido de bário": "BaO", "óxido de alumínio": "Al2O3", "óxido de zinco": "ZnO", "óxido de prata": "Ag2O", "óxido de ferro(II)": "FeO",
    "óxido de ferro(III)": "Fe2O3", "óxido de cobre(I)": "Cu2O", "óxido de cobre(II)": "CuO", "óxido de chumbo(II)": "PbO", "óxido de estanho(IV)": "SnO2",
    "óxido de berílio": "BeO", "óxido de estrôncio": "SrO", "óxido de cromo(III)": "Cr2O3", "óxido de manganês(IV)": "MnO2", "óxido de níquel(II)": "NiO",
    "óxido de cobalto(II)": "CoO", "óxido de mercúrio(II)": "HgO", "óxido de cádmio": "CdO", "óxido de rubídio": "Rb2O",
    # cloretos
    "cloreto de sódio": "NaCl", "cloreto de potássio": "KCl", "cloreto de lítio": "LiCl", "cloreto de magnésio": "MgCl2", "cloreto de cálcio": "CaCl2",
    "cloreto de bário": "BaCl2", "cloreto de alumínio": "AlCl3", "cloreto de zinco": "ZnCl2", "cloreto de prata": "AgCl", "cloreto de ferro(II)": "FeCl2",
    "cloreto de ferro(III)": "FeCl3", "cloreto de cobre(I)": "CuCl", "cloreto de cobre(II)": "CuCl2", "cloreto de estanho(II)": "SnCl2",
    "cloreto de chumbo(II)": "PbCl2", "cloreto de amônio": "NH4Cl", "cloreto de estrôncio": "SrCl2", "cloreto de cobalto(II)": "CoCl2",
    "cloreto de níquel(II)": "NiCl2", "cloreto de manganês(II)": "MnCl2", "cloreto de cromo(III)": "CrCl3", "cloreto de cádmio": "CdCl2",
    "cloreto de mercúrio(II)": "HgCl2", "cloreto de berílio": "BeCl2", "cloreto de césio": "CsCl", "cloreto de rubídio": "RbCl",
    # brometos, iodetos, fluoretos
    "brometo de sódio": "NaBr", "brometo de potássio": "KBr", "brometo de magnésio": "MgBr2", "brometo de cálcio": "CaBr2", "brometo de prata": "AgBr",
    "brometo de alumínio": "AlBr3", "brometo de zinco": "ZnBr2", "brometo de lítio": "LiBr", "brometo de bário": "BaBr2",
    "iodeto de sódio": "NaI", "iodeto de potássio": "KI", "iodeto de prata": "AgI", "iodeto de chumbo(II)": "PbI2", "iodeto de magnésio": "MgI2",
    "iodeto de cálcio": "CaI2", "iodeto de zinco": "ZnI2", "iodeto de alumínio": "AlI3",
    "fluoreto de sódio": "NaF", "fluoreto de potássio": "KF", "fluoreto de cálcio": "CaF2", "fluoreto de magnésio": "MgF2", "fluoreto de alumínio": "AlF3",
    "fluoreto de lítio": "LiF", "fluoreto de bário": "BaF2", "fluoreto de prata": "AgF",
    # sulfetos, nitretos, fosfetos, hidretos
    "sulfeto de sódio": "Na2S", "sulfeto de potássio": "K2S", "sulfeto de magnésio": "MgS", "sulfeto de cálcio": "CaS", "sulfeto de zinco": "ZnS",
    "sulfeto de ferro(II)": "FeS", "sulfeto de ferro(III)": "Fe2S3", "sulfeto de cobre(II)": "CuS", "sulfeto de cobre(I)": "Cu2S",
    "sulfeto de chumbo(II)": "PbS", "sulfeto de prata": "Ag2S", "sulfeto de alumínio": "Al2S3", "sulfeto de mercúrio(II)": "HgS",
    "sulfeto de cádmio": "CdS", "sulfeto de estanho(II)": "SnS", "sulfeto de bário": "BaS",
    "nitreto de lítio": "Li3N", "nitreto de magnésio": "Mg3N2", "nitreto de cálcio": "Ca3N2", "nitreto de alumínio": "AlN", "nitreto de zinco": "Zn3N2",
    "fosfeto de cálcio": "Ca3P2", "fosfeto de alumínio": "AlP", "fosfeto de magnésio": "Mg3P2",
    "hidreto de sódio": "NaH", "hidreto de potássio": "KH", "hidreto de lítio": "LiH", "hidreto de cálcio": "CaH2", "hidreto de magnésio": "MgH2",
    "hidreto de alumínio": "AlH3",
    # hidróxidos
    "hidróxido de sódio": "NaOH", "hidróxido de potássio": "KOH", "hidróxido de lítio": "LiOH", "hidróxido de magnésio": "Mg(OH)2",
    "hidróxido de cálcio": "Ca(OH)2", "hidróxido de bário": "Ba(OH)2", "hidróxido de alumínio": "Al(OH)3", "hidróxido de zinco": "Zn(OH)2",
    "hidróxido de ferro(II)": "Fe(OH)2", "hidróxido de ferro(III)": "Fe(OH)3", "hidróxido de cobre(II)": "Cu(OH)2", "hidróxido de amônio": "NH4OH",
    "hidróxido de estrôncio": "Sr(OH)2", "hidróxido de níquel(II)": "Ni(OH)2",
    # nitratos e nitritos
    "nitrato de sódio": "NaNO3", "nitrato de potássio": "KNO3", "nitrato de prata": "AgNO3", "nitrato de cálcio": "Ca(NO3)2",
    "nitrato de magnésio": "Mg(NO3)2", "nitrato de bário": "Ba(NO3)2", "nitrato de alumínio": "Al(NO3)3", "nitrato de zinco": "Zn(NO3)2",
    "nitrato de cobre(II)": "Cu(NO3)2", "nitrato de ferro(III)": "Fe(NO3)3", "nitrato de chumbo(II)": "Pb(NO3)2", "nitrato de amônio": "NH4NO3",
    "nitrato de lítio": "LiNO3", "nitrito de sódio": "NaNO2", "nitrito de potássio": "KNO2",
    # sulfatos e sulfitos
    "sulfato de sódio": "Na2SO4", "sulfato de potássio": "K2SO4", "sulfato de magnésio": "MgSO4", "sulfato de cálcio": "CaSO4",
    "sulfato de bário": "BaSO4", "sulfato de alumínio": "Al2(SO4)3", "sulfato de zinco": "ZnSO4", "sulfato de cobre(II)": "CuSO4",
    "sulfato de ferro(II)": "FeSO4", "sulfato de ferro(III)": "Fe2(SO4)3", "sulfato de amônio": "(NH4)2SO4", "sulfato de chumbo(II)": "PbSO4",
    "sulfato de prata": "Ag2SO4", "sulfato de lítio": "Li2SO4", "sulfato de níquel(II)": "NiSO4", "sulfato de manganês(II)": "MnSO4",
    "sulfito de sódio": "Na2SO3", "sulfito de potássio": "K2SO3", "sulfito de cálcio": "CaSO3",
    # carbonatos e hidrogenocarbonatos
    "carbonato de sódio": "Na2CO3", "carbonato de potássio": "K2CO3", "carbonato de cálcio": "CaCO3", "carbonato de magnésio": "MgCO3",
    "carbonato de bário": "BaCO3", "carbonato de zinco": "ZnCO3", "carbonato de ferro(II)": "FeCO3", "carbonato de cobre(II)": "CuCO3",
    "carbonato de amônio": "(NH4)2CO3", "carbonato de lítio": "Li2CO3", "carbonato de prata": "Ag2CO3", "carbonato de chumbo(II)": "PbCO3",
    "hidrogenocarbonato de sódio": "NaHCO3", "hidrogenocarbonato de potássio": "KHCO3", "hidrogenocarbonato de cálcio": "Ca(HCO3)2",
    "hidrogenocarbonato de amônio": "NH4HCO3", "hidrogenocarbonato de magnésio": "Mg(HCO3)2",
    # fosfatos
    "fosfato de sódio": "Na3PO4", "fosfato de potássio": "K3PO4", "fosfato de cálcio": "Ca3(PO4)2", "fosfato de magnésio": "Mg3(PO4)2",
    "fosfato de alumínio": "AlPO4", "fosfato de amônio": "(NH4)3PO4", "fosfato de zinco": "Zn3(PO4)2", "fosfato de prata": "Ag3PO4",
    "fosfato de ferro(III)": "FePO4",
    # cloratos etc.
    "hipoclorito de sódio": "NaClO", "hipoclorito de potássio": "KClO", "hipoclorito de cálcio": "Ca(ClO)2", "clorito de sódio": "NaClO2",
    "clorato de potássio": "KClO3", "clorato de sódio": "NaClO3", "perclorato de potássio": "KClO4", "perclorato de sódio": "NaClO4",
    "perclorato de amônio": "NH4ClO4",
    # outros ânions
    "acetato de sódio": "CH3COONa", "acetato de potássio": "CH3COOK", "acetato de cálcio": "(CH3COO)2Ca", "acetato de chumbo(II)": "(CH3COO)2Pb",
    "cianeto de sódio": "NaCN", "cianeto de potássio": "KCN", "permanganato de potássio": "KMnO4", "permanganato de sódio": "NaMnO4",
    "dicromato de potássio": "K2Cr2O7", "dicromato de sódio": "Na2Cr2O7", "dicromato de amônio": "(NH4)2Cr2O7",
    "cromato de potássio": "K2CrO4", "cromato de sódio": "Na2CrO4", "cromato de bário": "BaCrO4", "cromato de chumbo(II)": "PbCrO4",
    "oxalato de sódio": "Na2C2O4", "oxalato de cálcio": "CaC2O4", "oxalato de potássio": "K2C2O4", "tiossulfato de sódio": "Na2S2O3",
    "silicato de sódio": "Na2SiO3", "silicato de cálcio": "CaSiO3",
}
ACIDOS_CONHECIDOS = {
    "ácido fluorídrico": "HF", "ácido clorídrico": "HCl", "ácido bromídrico": "HBr", "ácido iodídrico": "HI", "ácido sulfídrico": "H2S",
    "ácido cianídrico": "HCN", "ácido nítrico": "HNO3", "ácido nitroso": "HNO2", "ácido sulfúrico": "H2SO4", "ácido sulfuroso": "H2SO3",
    "ácido carbônico": "H2CO3", "ácido fosfórico": "H3PO4", "ácido hipocloroso": "HClO", "ácido cloroso": "HClO2", "ácido clórico": "HClO3",
    "ácido perclórico": "HClO4", "ácido permangânico": "HMnO4", "ácido dicrômico": "H2Cr2O7", "ácido crômico": "H2CrO4", "ácido oxálico": "H2C2O4",
    "ácido tiossulfúrico": "H2S2O3", "ácido silícico": "H2SiO3", "ácido acético": "CH3COOH",
}
PREFIXOS = {1: "mono", 2: "di", 3: "tri", 4: "tetra", 5: "penta", 6: "hexa", 7: "hepta", 8: "octa"}
ELEMENTOS_COVALENTES = {"C": "carbono", "N": "nitrogênio", "S": "enxofre", "P": "fósforo", "Si": "silício", "Cl": "cloro", "B": "boro", "O": "oxigênio",
                        "F": "flúor"}
RADICAL_BINARIO = {"O": "óxido", "Cl": "cloreto", "F": "fluoreto", "S": "sulfeto"}
# (elemento central, n, elemento eletronegativo, m)
COVALENTES = [("C", 1, "O", 1), ("C", 1, "O", 2), ("S", 1, "O", 2), ("S", 1, "O", 3), ("N", 1, "O", 1), ("N", 1, "O", 2), ("N", 2, "O", 1), ("N", 2, "O", 3),
              ("N", 2, "O", 4), ("N", 2, "O", 5), ("Cl", 2, "O", 1), ("Cl", 2, "O", 7), ("P", 2, "O", 5), ("Si", 1, "O", 2), ("C", 1, "S", 2),
              ("C", 1, "Cl", 4), ("P", 1, "Cl", 3), ("P", 1, "Cl", 5), ("S", 1, "F", 6), ("B", 1, "F", 3), ("Si", 1, "Cl", 4), ("N", 1, "F", 3),
              ("O", 1, "F", 2)]
COVALENTES_CONHECIDOS = {
    "monóxido de carbono": "CO", "dióxido de carbono": "CO2", "dióxido de enxofre": "SO2", "trióxido de enxofre": "SO3", "monóxido de nitrogênio": "NO",
    "dióxido de nitrogênio": "NO2", "monóxido de dinitrogênio": "N2O", "trióxido de dinitrogênio": "N2O3", "tetróxido de dinitrogênio": "N2O4",
    "pentóxido de dinitrogênio": "N2O5", "monóxido de dicloro": "Cl2O", "heptóxido de dicloro": "Cl2O7", "pentóxido de difósforo": "P2O5",
    "dióxido de silício": "SiO2", "dissulfeto de carbono": "CS2", "tetracloreto de carbono": "CCl4", "tricloreto de fósforo": "PCl3",
    "pentacloreto de fósforo": "PCl5", "hexafluoreto de enxofre": "SF6", "trifluoreto de boro": "BF3", "tetracloreto de silício": "SiCl4",
    "trifluoreto de nitrogênio": "NF3", "difluoreto de oxigênio": "OF2",
}


def _fmt_ion(formula: str, n: int) -> str:
    if n == 1:
        return formula
    multi = len(parse_formula(formula)) > 1 or sum(parse_formula(formula).values()) > 1
    return f"({formula}){n}" if multi else f"{formula}{n}"


def _nome_cation(nome: str, carga: int, cargas) -> str:
    romanos = {1: "I", 2: "II", 3: "III", 4: "IV"}
    return nome + (f"({romanos[carga]})" if len(cargas) > 1 else "")


def gerar_ionicos():
    """[(nome, formula, info)] por regra: cátion × ânion, com contagens eletricamente neutras."""
    out = []
    for cs, cn, cargas in CATIONS:
        for q in cargas:
            for af, an, qa in ANIONS:
                g = gcd(q, qa)
                n_cat, n_an = qa // g, q // g
                formula = _fmt_ion(cs, n_cat) + _fmt_ion(af, n_an)
                nome = f"{an} de {_nome_cation(cn, q, cargas)}"
                out.append((nome, formula, {"cation": cs, "q": q, "anion": af, "qa": qa, "n_cat": n_cat, "n_an": n_an, "nome_cation": cn, "nome_anion": an}))
    return out


def gerar_acidos():
    out = []
    ans = {a: (n, q) for a, n, q in ANIONS}
    for af, adj in ANION_ACIDO.items():
        q = ans[af][1]
        formula = ("H" + (str(q) if q > 1 else "")) + (af if af != "CH3COO" else "")
        if af == "CH3COO":
            formula = "CH3COOH"
        out.append((f"ácido {adj}", formula, {"anion": af, "q": q}))
    return out


def _prefixo(n, base):
    p = PREFIXOS[n]
    if base.startswith("ó") and p.endswith("a"):
        p = p[:-1]
    return p


def gerar_covalentes():
    out = []
    for cen, n, neg, m in COVALENTES:
        radical = RADICAL_BINARIO[neg]
        pre = _prefixo(m, radical) + radical
        nome_cen = ELEMENTOS_COVALENTES[cen]
        cen_txt = (PREFIXOS[n] if n > 1 else "") + nome_cen
        if neg == "O" and cen == "P":  # P2O5 (nome tradicional: pentóxido de difósforo)
            pass
        nome = f"{pre} de {cen_txt}"
        formula = (cen + (str(n) if n > 1 else "")) + (neg + (str(m) if m > 1 else ""))
        # fórmula conforme convenção (O2F -> OF2 já informada nos dados)
        if cen == "O" and neg == "F":
            formula = "OF2"
        out.append((nome, formula, {"cen": cen, "n": n, "neg": neg, "m": m}))
    return out


def _mesma_composicao(f1, f2) -> bool:
    try:
        return dict(parse_formula(f1)) == dict(parse_formula(f2))
    except FormulaInvalida:
        return False


def _carga_valida(pac, simbolo: str, carga: int) -> bool:
    e = pac.el_simbolo.get(simbolo)
    if e is None or not e.get("estadosOxidacao"):
        return True  # sem dado no pacote: a validação é a tabela CONHECIDAS
    return carga in e["estadosOxidacao"]


def gerar(ctx: Ctx):
    pac, rng = ctx.pac, ctx.rng
    # --- compostos do pacote: nome ↔ fórmula ---------------------------------------------------------------
    cont_nome = Counter(fold(pac.nome_composto(c)) for c in pac.compostos)
    cont_form = Counter(pac.formula_exibicao(c) for c in pac.compostos)
    pacote_por_comp = {}
    for c in pac.compostos:
        f = pac.formula_exibicao(c)
        if not f or pac.comp_pendente(c) or cont_nome[fold(pac.nome_composto(c))] != 1:
            continue
        try:
            chave = tuple(sorted(parse_formula(f).items()))
        except FormulaInvalida:
            continue
        pacote_por_comp.setdefault(chave, []).append(c)
        nome = pac.nome_composto(c)
        nm = nome[:1].lower() + nome[1:] if not nome[:2].isupper() else nome
        ents = {"compostos": [c["cid"]]}
        r = Resp()
        pergunta = renderizar(rng.choice(["Escreva a fórmula química do composto chamado {n}.", "Como se escreve {n} em fórmula química?",
                                          "Qual é a fórmula do composto {n}?", "Traduza {n} para fórmula."]), {"n": sup_composto_sem_artigo(ctx, c, False, True)}, rng)
        ctx.add(f"no-{c['cid']}-nome-formula", pergunta, f"O composto {nm} tem fórmula {f}.", r, "nomenclatura", "fundamental", ents,
                fontes_do_registro(c, 1), "template:nomenclatura.nome_formula", FAM)
        if cont_form[f] == 1:
            r = Resp()
            pergunta = renderizar(rng.choice(["Qual o nome do composto {f}?", "Dê o nome de {f}.", "Como se chama {f}?", "Nomeie o composto {f}."]), {"f": f}, rng)
            ctx.add(f"no-{c['cid']}-formula-nome", pergunta, f"O composto de fórmula {f} chama-se {nm}.", r, "nomenclatura", "fundamental", ents,
                    fontes_do_registro(c, 1), "template:nomenclatura.formula_nome", FAM)

    # --- compostos gerados por regras e validados -----------------------------------------------------------
    gerados = gerar_ionicos() + gerar_acidos() + gerar_covalentes()
    conhecidas = {**CONHECIDAS, **ACIDOS_CONHECIDOS, **COVALENTES_CONHECIDOS}
    usados = set()
    for nome, formula, info in gerados:
        if nome not in conhecidas:
            ctx.stats["nomenclatura_sem_validacao"] += 1
            continue
        if not _mesma_composicao(formula, conhecidas[nome]):
            ctx.stats["nomenclatura_rejeitada_formula_diverge"] += 1
            ctx.avisos.append(f"nomenclatura: {nome}: regra deu {formula}, conhecida {conhecidas[nome]}")
            continue
        if "cation" in info and info["cation"] in pac.el_simbolo and not _carga_valida(pac, info["cation"], info["q"]):
            ctx.stats["nomenclatura_rejeitada_carga_fora_do_pacote"] += 1
            continue
        if nome in usados:
            continue
        usados.add(nome)
        conv = conhecidas[nome]  # grafia convencional da fórmula
        ents = {"formula": conv, "nome": nome}
        r = Resp()
        expl = _explicar(nome, conv, info, r)
        pe = pergunta_nome_formula(ctx, nome)
        ctx.add(f"no-reg-{len(usados)}-nome-formula", pe, f"A fórmula do {nome} é {conv}. {expl}", r, "nomenclatura", "medio", ents, [FONTE_AUTORIA],
                "regra:nomenclatura.nome_formula", FAM)
        r2 = Resp()
        expl2 = _explicar(nome, conv, info, r2)
        pf = renderizar(rng.choice(["Qual o nome do composto {f}?", "Dê o nome de {f}.", "Como se chama {f}?", "Nomeie o composto {f}.", "Dê a nomenclatura oficial de {f}."]),
                        {"f": conv}, rng)
        ctx.add(f"no-reg-{len(usados)}-formula-nome", pf, f"O composto {conv} chama-se {nome}. {expl2}", r2, "nomenclatura", "medio", ents, [FONTE_AUTORIA],
                "regra:nomenclatura.formula_nome", FAM)
    ctx.stats["nomenclatura_regras_validadas"] = len(usados)


def pergunta_nome_formula(ctx, nome):
    return renderizar(ctx.rng.choice(["Qual é a fórmula do {n}?", "Escreva a fórmula do {n}.", "Como se escreve {n} em fórmula química?",
                                      "Qual a fórmula química do {n}?", "Dê a fórmula de {n}."]), {"n": nome}, ctx.rng)


def _explicar(nome, conv, info, r):
    """Explicação por regra (registra os números no Resp `r`)."""
    if "cation" in info:
        q, qa = r.regra(info["q"], "carga_cation"), r.regra(info["qa"], "carga_anion")
        ra, rb, zero = r.regra(info["n_cat"], "indice_cation"), r.regra(info["n_an"], "indice_anion"), r.regra(0, "neutralidade")
        cargas = next(c[2] for c in CATIONS if c[0] == info["cation"])
        return (f"Ele é formado pelo cátion {_nome_cation(info['nome_cation'], info['q'], cargas)} ({info['cation']}, carga {q}+) e pelo ânion "
                f"{info['nome_anion']} ({info['anion']}, carga {qa}−). Para a carga total ser zero: {ra} × (+{q}) + {rb} × (−{qa}) = {zero}, "
                f"o que dá a fórmula {conv}.")
    if "anion" in info:
        nome_an = next(a[1] for a in ANIONS if a[0] == info["anion"])
        if info["q"] > 1:
            q = r.regra(info["q"], "carga_anion")
            return (f"Ele deriva do ânion {nome_an} ({info['anion']}, carga {q}−): o ácido recebe tantos H⁺ quantos forem necessários "
                    f"para neutralizar a carga, o que dá {conv}.")
        return (f"Ele deriva do ânion {nome_an} ({info['anion']}): o ácido recebe o H⁺ que neutraliza a carga do ânion, o que dá {conv}.")
    return ("Em compostos covalentes binários, prefixos indicam as quantidades de átomos (mono, di, tri, tetra, penta, hexa, hepta...); "
            f"aqui a fórmula é {conv}.")
