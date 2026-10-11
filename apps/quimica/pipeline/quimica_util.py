# -*- coding: utf-8 -*-
"""Utilitários de química compartilhados pelos coletores (somente biblioteca padrão)."""
import os
import re
from datetime import datetime, timezone

from common import norm, strip_accents  # noqa: F401  (norm: minúsculo, sem acento; strip_accents: só tira acentos)

# ---------------------------------------------------------------------------------------------------------------
# 118 elementos: (Z, símbolo, nome em português do Brasil na grafia da SBQ)
# ---------------------------------------------------------------------------------------------------------------
ELEMENTOS_PT = [
    (1, "H", "Hidrogênio"), (2, "He", "Hélio"), (3, "Li", "Lítio"), (4, "Be", "Berílio"), (5, "B", "Boro"),
    (6, "C", "Carbono"), (7, "N", "Nitrogênio"), (8, "O", "Oxigênio"), (9, "F", "Flúor"), (10, "Ne", "Neônio"),
    (11, "Na", "Sódio"), (12, "Mg", "Magnésio"), (13, "Al", "Alumínio"), (14, "Si", "Silício"),
    (15, "P", "Fósforo"), (16, "S", "Enxofre"), (17, "Cl", "Cloro"), (18, "Ar", "Argônio"),
    (19, "K", "Potássio"), (20, "Ca", "Cálcio"), (21, "Sc", "Escândio"), (22, "Ti", "Titânio"),
    (23, "V", "Vanádio"), (24, "Cr", "Cromo"), (25, "Mn", "Manganês"), (26, "Fe", "Ferro"),
    (27, "Co", "Cobalto"), (28, "Ni", "Níquel"), (29, "Cu", "Cobre"), (30, "Zn", "Zinco"),
    (31, "Ga", "Gálio"), (32, "Ge", "Germânio"), (33, "As", "Arsênio"), (34, "Se", "Selênio"),
    (35, "Br", "Bromo"), (36, "Kr", "Criptônio"), (37, "Rb", "Rubídio"), (38, "Sr", "Estrôncio"),
    (39, "Y", "Ítrio"), (40, "Zr", "Zircônio"), (41, "Nb", "Nióbio"), (42, "Mo", "Molibdênio"),
    (43, "Tc", "Tecnécio"), (44, "Ru", "Rutênio"), (45, "Rh", "Ródio"), (46, "Pd", "Paládio"),
    (47, "Ag", "Prata"), (48, "Cd", "Cádmio"), (49, "In", "Índio"), (50, "Sn", "Estanho"),
    (51, "Sb", "Antimônio"), (52, "Te", "Telúrio"), (53, "I", "Iodo"), (54, "Xe", "Xenônio"),
    (55, "Cs", "Césio"), (56, "Ba", "Bário"), (57, "La", "Lantânio"), (58, "Ce", "Cério"),
    (59, "Pr", "Praseodímio"), (60, "Nd", "Neodímio"), (61, "Pm", "Promécio"), (62, "Sm", "Samário"),
    (63, "Eu", "Európio"), (64, "Gd", "Gadolínio"), (65, "Tb", "Térbio"), (66, "Dy", "Disprósio"),
    (67, "Ho", "Hólmio"), (68, "Er", "Érbio"), (69, "Tm", "Túlio"), (70, "Yb", "Itérbio"),
    (71, "Lu", "Lutécio"), (72, "Hf", "Háfnio"), (73, "Ta", "Tântalo"), (74, "W", "Tungstênio"),
    (75, "Re", "Rênio"), (76, "Os", "Ósmio"), (77, "Ir", "Irídio"), (78, "Pt", "Platina"),
    (79, "Au", "Ouro"), (80, "Hg", "Mercúrio"), (81, "Tl", "Tálio"), (82, "Pb", "Chumbo"),
    (83, "Bi", "Bismuto"), (84, "Po", "Polônio"), (85, "At", "Astato"), (86, "Rn", "Radônio"),
    (87, "Fr", "Frâncio"), (88, "Ra", "Rádio"), (89, "Ac", "Actínio"), (90, "Th", "Tório"),
    (91, "Pa", "Protactínio"), (92, "U", "Urânio"), (93, "Np", "Neptúnio"), (94, "Pu", "Plutônio"),
    (95, "Am", "Amerício"), (96, "Cm", "Cúrio"), (97, "Bk", "Berquélio"), (98, "Cf", "Califórnio"),
    (99, "Es", "Einstênio"), (100, "Fm", "Férmio"), (101, "Md", "Mendelévio"), (102, "No", "Nobélio"),
    (103, "Lr", "Laurêncio"), (104, "Rf", "Rutherfórdio"), (105, "Db", "Dúbnio"), (106, "Sg", "Seabórgio"),
    (107, "Bh", "Bóhrio"), (108, "Hs", "Hássio"), (109, "Mt", "Meitnério"), (110, "Ds", "Darmstácio"),
    (111, "Rg", "Roentgênio"), (112, "Cn", "Copernício"), (113, "Nh", "Nihônio"), (114, "Fl", "Fleróvio"),
    (115, "Mc", "Moscóvio"), (116, "Lv", "Livermório"), (117, "Ts", "Tenessino"), (118, "Og", "Oganessônio"),
]
SIMBOLOS = {s for _, s, _ in ELEMENTOS_PT}
NOME_PT_POR_Z = {z: n for z, _, n in ELEMENTOS_PT}
SIMBOLO_POR_Z = {z: s for z, s, _ in ELEMENTOS_PT}

# ---------------------------------------------------------------------------------------------------------------
# Datas
# ---------------------------------------------------------------------------------------------------------------


def hoje_iso():
    """Data de acesso (UTC). `QUIMICA_DATA_ACESSO` (AAAA-MM-DD) fixa o valor, para builds reprodutíveis e testes."""
    return os.environ.get("QUIMICA_DATA_ACESSO") or datetime.now(timezone.utc).strftime("%Y-%m-%d")


def agora_utc():
    return datetime.now(timezone.utc)


def fonte(nome, url, licenca, acessado):
    return {"nome": nome, "url": url, "licenca": licenca, "acessadoEm": acessado}


# ---------------------------------------------------------------------------------------------------------------
# Texto: sub/sobrescritos Unicode
# ---------------------------------------------------------------------------------------------------------------
_SUB = str.maketrans("0123456789+-=()aeoxhklmnpst", "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₒₓₕₖₗₘₙₚₛₜ")
_SUP = str.maketrans("0123456789+-=()ni", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ")
_DESSUB = str.maketrans("₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₒₓₕₖₗₘₙₚₛₜ", "0123456789+-=()aeoxhklmnpst")
_DESSUP = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ", "0123456789+-=()ni")


def subscrito(s):
    """'2' -> '₂'. Se algum caractere não tem forma Unicode, devolve '_(s)' (legível e sem perda)."""
    s = s.strip().replace("−", "-")
    if s and all(c in "0123456789+-=()aeoxhklmnpst" for c in s):
        return s.translate(_SUB)
    return f"_({s})" if s else ""


def sobrescrito(s):
    s = s.strip().replace("−", "-")
    if s and all(c in "0123456789+-=()ni" for c in s):
        return s.translate(_SUP)
    return f"^({s})" if s else ""


def sem_subscritos(s):
    """Converte ₂ e ² de volta para dígitos comuns (fórmulas do Wikidata usam Unicode)."""
    return s.translate(_DESSUB).translate(_DESSUP)


def capitalizar(nome):
    """Primeira letra maiúscula, sem mexer no resto (nomes químicos têm maiúsculas internas legítimas)."""
    nome = (nome or "").strip()
    return nome[:1].upper() + nome[1:] if nome else nome


# ---------------------------------------------------------------------------------------------------------------
# Fórmulas
# ---------------------------------------------------------------------------------------------------------------
_TOKEN = re.compile(r"([A-Z][a-z]?)(\d*)|([(\[{])|([)\]}])(\d*)|(\d+)")


def _contar(formula):
    """Conta átomos de uma fórmula convencional (parênteses, hidratos com ·). Levanta ValueError se inválida."""
    f = sem_subscritos(formula or "")
    f = re.sub(r"\s+", "", f)
    f = re.sub(r"\^?\d*[+-]$", "", f)  # carga final (Na+, SO4^2-)
    if not f:
        raise ValueError("fórmula vazia")
    total = {}
    for parte in re.split(r"[·•.*]", f):
        if not parte:
            continue
        m = re.match(r"^(\d+)(.*)$", parte)
        mult, resto = (int(m.group(1)), m.group(2)) if m else (1, parte)
        for el, n in _contar_grupo(resto).items():
            total[el] = total.get(el, 0) + n * mult
    return total


def _contar_grupo(f):
    pilha = [{}]
    pos = 0
    while pos < len(f):
        m = _TOKEN.match(f, pos)
        if not m or m.end() == pos:
            raise ValueError(f"fórmula inválida: {f!r}")
        pos = m.end()
        if m.group(1):
            if m.group(1) not in SIMBOLOS:
                raise ValueError(f"símbolo desconhecido: {m.group(1)}")
            n = int(m.group(2) or 1)
            pilha[-1][m.group(1)] = pilha[-1].get(m.group(1), 0) + n
        elif m.group(3):
            pilha.append({})
        elif m.group(4):
            if len(pilha) < 2:
                raise ValueError("parênteses desbalanceados")
            topo = pilha.pop()
            n = int(m.group(5) or 1)
            for el, c in topo.items():
                pilha[-1][el] = pilha[-1].get(el, 0) + c * n
        else:
            raise ValueError("número solto na fórmula")
    if len(pilha) != 1:
        raise ValueError("parênteses desbalanceados")
    return pilha[0]


def contagem_atomos(formula):
    return _contar(formula)


def formula_hill(formula):
    """Fórmula no sistema de Hill (C, H, depois ordem alfabética; sem carbono, tudo em ordem alfabética)."""
    c = _contar(formula) if isinstance(formula, str) else dict(formula)
    if "C" in c:
        ordem = ["C"] + (["H"] if "H" in c else []) + sorted(k for k in c if k not in ("C", "H"))
    else:
        ordem = sorted(c)
    return "".join(el + (str(c[el]) if c[el] != 1 else "") for el in ordem)


def hill_igual(formula_a, formula_b):
    """True se as duas fórmulas (convencional ou Hill) têm a mesma composição."""
    try:
        return _contar(formula_a) == _contar(formula_b)
    except ValueError:
        return False


# ---------------------------------------------------------------------------------------------------------------
# CAS
# ---------------------------------------------------------------------------------------------------------------
_CAS = re.compile(r"^(\d{2,7})-(\d{2})-(\d)$")


def cas_valido(s):
    """Formato e dígito verificador do número CAS."""
    m = _CAS.match((s or "").strip())
    if not m or m.group(1).startswith("0"):  # o primeiro bloco do CAS RN não começa por zero
        return False
    digitos = (m.group(1) + m.group(2))[::-1]
    soma = sum(int(d) * (i + 1) for i, d in enumerate(digitos))
    return soma % 10 == int(m.group(3))


# ---------------------------------------------------------------------------------------------------------------
# Posição na tabela periódica (fato estrutural; PubChem não entrega grupo/período)
# ---------------------------------------------------------------------------------------------------------------
_PERIODOS = [(1, 2, 1), (3, 10, 2), (11, 18, 3), (19, 36, 4), (37, 54, 5), (55, 86, 6), (87, 118, 7)]


def e_f_bloco(z):
    return 57 <= z <= 71 or 89 <= z <= 103


def periodo(z):
    for a, b, p in _PERIODOS:
        if a <= z <= b:
            return p
    raise ValueError(f"Z fora de 1..118: {z}")


def grupo(z):
    """Grupo IUPAC (1-18). Lantanídeos (57-71) e actinídeos (89-103) ficam sem grupo (None)."""
    if e_f_bloco(z):
        return None
    if z == 1:
        return 1
    if z == 2:
        return 18
    if 3 <= z <= 4 or 11 <= z <= 12 or z in (55, 56, 87, 88):
        return {3: 1, 4: 2, 11: 1, 12: 2, 55: 1, 56: 2, 87: 1, 88: 2}[z]
    if 5 <= z <= 10:
        return z + 8
    if 13 <= z <= 18:
        return z
    if 19 <= z <= 36:
        return z - 18
    if 37 <= z <= 54:
        return z - 36
    if 72 <= z <= 86:
        return z - 68
    if 104 <= z <= 118:
        return z - 100
    raise ValueError(f"Z fora de 1..118: {z}")


def bloco(z):
    """s, p, d ou f (lantanídeos e actinídeos de 15 elementos, como na categoria do PubChem, são f)."""
    if e_f_bloco(z):
        return "f"
    g = grupo(z)
    if z == 2 or g in (1, 2):
        return "s"
    if 13 <= g <= 18:
        return "p"
    return "d"
