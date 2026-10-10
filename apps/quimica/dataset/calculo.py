# -*- coding: utf-8 -*-
"""Cálculos químicos determinísticos usados pelo dataset (e conferidos pelos testes).

Nada aqui depende de modelo: fórmula -> contagem de átomos, massa molar, balanceamento por álgebra linear racional
(Fraction), estequiometria, concentração/diluição, pH de ácido/base forte, gás ideal e conversão de unidades.
Aritmética em Decimal/Fraction; o arredondamento é decidido por quem formata (comum.fmt_sig).
"""
import re
from collections import OrderedDict
from decimal import Decimal, getcontext
from fractions import Fraction
from math import gcd

from comum import dec

getcontext().prec = 50


class FormulaInvalida(ValueError):
    pass


# ---------------------------------------------------------------------------------------------------------
# Fórmulas
# ---------------------------------------------------------------------------------------------------------
_SEP_HIDRATO = "·•*"


def parse_formula(formula: str, validos=None) -> "OrderedDict[str, int]":
    """'Ca(OH)2' -> {'Ca':1,'O':2,'H':2}. Aceita parênteses/colchetes aninhados e hidratos ('CuSO4·5H2O').
    Mantém a ordem da primeira aparição. `validos`: conjunto de símbolos aceitos (senão qualquer 'Xx')."""
    s = formula.strip().replace(" ", "").replace("·", "·")
    if not s:
        raise FormulaInvalida("fórmula vazia")
    s = re.sub(r"(?<=[A-Za-z0-9)\]])\.(?=\d*[A-Z(])", "·", s)  # 'CuSO4.5H2O'
    total = OrderedDict()
    for parte in re.split(f"[{_SEP_HIDRATO}]", s):
        if not parte:
            raise FormulaInvalida(f"fórmula inválida: {formula!r}")
        m = re.match(r"^(\d+)(.*)$", parte)
        mult, corpo = (int(m.group(1)), m.group(2)) if m else (1, parte)
        for el, n in _parse_corpo(corpo, formula, validos).items():
            total[el] = total.get(el, 0) + n * mult
    if not total:
        raise FormulaInvalida(f"fórmula sem elementos: {formula!r}")
    return total


def _parse_corpo(s: str, original: str, validos) -> "OrderedDict[str, int]":
    pilha = [OrderedDict()]
    i = 0
    while i < len(s):
        c = s[i]
        if c in "([":
            pilha.append(OrderedDict())
            i += 1
        elif c in ")]":
            if len(pilha) == 1:
                raise FormulaInvalida(f"parêntese sem par em {original!r}")
            grupo = pilha.pop()
            j = i + 1
            while j < len(s) and s[j].isdigit():
                j += 1
            n = int(s[i + 1:j]) if j > i + 1 else 1
            if n == 0:
                raise FormulaInvalida("subscrito 0")
            for el, q in grupo.items():
                pilha[-1][el] = pilha[-1].get(el, 0) + q * n
            i = j
        elif c.isupper():
            j = i + 1
            if j < len(s) and s[j].islower():
                j += 1
            simbolo = s[i:j]
            if validos is not None and simbolo not in validos:
                raise FormulaInvalida(f"símbolo desconhecido {simbolo!r} em {original!r}")
            k = j
            while k < len(s) and s[k].isdigit():
                k += 1
            n = int(s[j:k]) if k > j else 1
            if n == 0:
                raise FormulaInvalida("subscrito 0")
            pilha[-1][simbolo] = pilha[-1].get(simbolo, 0) + n
            i = k
        else:
            raise FormulaInvalida(f"caractere inesperado {c!r} em {original!r}")
    if len(pilha) != 1:
        raise FormulaInvalida(f"parêntese sem fechar em {original!r}")
    return pilha[0]


def formula_hill(contagem) -> str:
    """Ordem de Hill: C, H e depois alfabética (sem C: tudo alfabético)."""
    els = list(contagem)
    if "C" in contagem:
        ordem = ["C"] + (["H"] if "H" in contagem else []) + sorted(e for e in els if e not in ("C", "H"))
    else:
        ordem = sorted(els)
    return "".join(e + (str(contagem[e]) if contagem[e] != 1 else "") for e in ordem)


def mesma_composicao(f1: str, f2: str) -> bool:
    try:
        return dict(parse_formula(f1)) == dict(parse_formula(f2))
    except FormulaInvalida:
        return False


def massa_molar(contagem, massas) -> Decimal:
    """Soma n × massa atômica (Decimal)."""
    return sum((dec(massas[el]) * n for el, n in contagem.items()), Decimal(0))


def massa_molar_passos(contagem, massas):
    """[(símbolo, n, massa atômica, parcial)] e total, na ordem da fórmula."""
    passos, total = [], Decimal(0)
    for el, n in contagem.items():
        m = dec(massas[el])
        parcial = m * n
        passos.append((el, n, m, parcial))
        total += parcial
    return passos, total


# ---------------------------------------------------------------------------------------------------------
# Equações e balanceamento
# ---------------------------------------------------------------------------------------------------------
_SETA = re.compile(r"\s*(?:->|=>|-->|→|⟶|⇒|=)\s*")


def _limpar_especie(e: str) -> str:
    e = e.strip()
    e = re.sub(r"\((?:s|l|g|aq)\)\s*$", "", e).strip()
    e = re.sub(r"^\d+\s*(?=[A-Z(\[])", "", e).strip()  # coeficiente digitado
    return e


def parse_equacao(texto: str):
    """'H2 + O2 -> H2O' -> (['H2','O2'], ['H2O']). Remove estados físicos e coeficientes digitados."""
    partes = _SETA.split(texto.strip(), maxsplit=1)
    if len(partes) != 2 or not partes[0] or not partes[1]:
        raise FormulaInvalida(f"equação sem seta: {texto!r}")
    lados = []
    for lado in partes:
        especies = [_limpar_especie(x) for x in re.split(r"\s+\+\s+|\s*\+\s*(?=[A-Z0-9(\[])", lado.strip())]
        if not all(especies):
            raise FormulaInvalida(f"espécie vazia em {texto!r}")
        lados.append(especies)
    return lados[0], lados[1]


def _nullspace(matriz, ncols):
    """Base do espaço nulo de uma matriz de Fractions (por RREF)."""
    m = [row[:] for row in matriz]
    pivs, r = [], 0
    for c in range(ncols):
        p = next((i for i in range(r, len(m)) if m[i][c] != 0), None)
        if p is None:
            continue
        m[r], m[p] = m[p], m[r]
        pv = m[r][c]
        m[r] = [x / pv for x in m[r]]
        for i in range(len(m)):
            if i != r and m[i][c] != 0:
                f = m[i][c]
                m[i] = [a - f * b for a, b in zip(m[i], m[r])]
        pivs.append(c)
        r += 1
        if r == len(m):
            break
    livres = [c for c in range(ncols) if c not in pivs]
    base = []
    for lv in livres:
        v = [Fraction(0)] * ncols
        v[lv] = Fraction(1)
        for i, pc in enumerate(pivs):
            v[pc] = -m[i][lv]
        base.append(v)
    return base


def balancear(reagentes, produtos, validos=None):
    """Coeficientes inteiros mínimos [reagentes..., produtos...] ou None (impossível/indeterminada).
    Também devolve None se houver mais de um grau de liberdade (várias equações balanceadas independentes)."""
    esp = list(reagentes) + list(produtos)
    contagens = [parse_formula(e, validos) for e in esp]
    elementos = sorted({el for c in contagens for el in c})
    nr = len(reagentes)
    matriz = []
    for el in elementos:
        matriz.append([Fraction(c.get(el, 0) * (1 if j < nr else -1)) for j, c in enumerate(contagens)])
    base = _nullspace(matriz, len(esp))
    if len(base) != 1:
        return None
    v = base[0]
    if all(x <= 0 for x in v):
        v = [-x for x in v]
    if any(x <= 0 for x in v):
        return None
    mmc = 1
    for x in v:
        mmc = mmc * x.denominator // gcd(mmc, x.denominator)
    inteiros = [int(x * mmc) for x in v]
    g = 0
    for x in inteiros:
        g = gcd(g, x)
    return [x // g for x in inteiros]


def contagem_lado(especies, coefs, validos=None):
    """Átomos de cada elemento num lado: {el: total}."""
    tot = OrderedDict()
    for e, k in zip(especies, coefs):
        for el, n in parse_formula(e, validos).items():
            tot[el] = tot.get(el, 0) + n * k
    return tot


def equacao_texto(reagentes, produtos, coefs=None, seta="→") -> str:
    nr = len(reagentes)

    def lado(esp, cs):
        return " + ".join((f"{c} " if c != 1 else "") + e for e, c in zip(esp, cs))
    if coefs is None:
        coefs = [1] * (nr + len(produtos))
    return f"{lado(reagentes, coefs[:nr])} {seta} {lado(produtos, coefs[nr:])}"


def conserva(reagentes, produtos, coefs, validos=None) -> bool:
    a = contagem_lado(reagentes, coefs[:len(reagentes)], validos)
    b = contagem_lado(produtos, coefs[len(reagentes):], validos)
    return dict(a) == dict(b)


# ---------------------------------------------------------------------------------------------------------
# Estequiometria, soluções, pH, gás ideal
# ---------------------------------------------------------------------------------------------------------
def mol_de_massa(m, M):
    return dec(m) / dec(M)


def massa_de_mol(n, M):
    return dec(n) * dec(M)


def particulas_de_mol(n, na):
    return dec(n) * dec(na)


def mol_de_particulas(N, na):
    return dec(N) / dec(na)


def volume_molar(R, T=Decimal("273.15"), P=Decimal("101325")):
    """V_m = R·T/P em L/mol (R em J/(mol·K), T em K, P em Pa)."""
    return dec(R) * dec(T) / dec(P) * 1000


def molaridade(n, V_L):
    return dec(n) / dec(V_L)


def diluicao_v2(c1, v1, c2):
    return dec(c1) * dec(v1) / dec(c2)


def diluicao_c2(c1, v1, v2):
    return dec(c1) * dec(v1) / dec(v2)


def diluicao_v1(c2, v2, c1):
    return dec(c2) * dec(v2) / dec(c1)


def log10(x) -> Decimal:
    return dec(x).log10()


def ph_de_h(h):
    return -log10(h)


def h_de_ph(ph):
    return Decimal(10) ** (-dec(ph))


def casas_decimais_de(x) -> int:
    """Algarismos significativos de uma concentração dada (para a regra 'casas do pH = alg. signif. de [H+]')."""
    d = dec(x).normalize()
    digitos = len(d.as_tuple().digits)
    return max(1, digitos)


def gas_ideal(R, P=None, V=None, n=None, T=None):
    """PV = nRT em SI (Pa, m³, mol, K, R em J/(mol·K)). Exatamente uma grandeza deve ser None."""
    R = dec(R)
    faltam = [k for k, v in (("P", P), ("V", V), ("n", n), ("T", T)) if v is None]
    if len(faltam) != 1:
        raise ValueError("informe exatamente 3 grandezas")
    falta = faltam[0]
    if falta == "P":
        return dec(n) * R * dec(T) / dec(V)
    if falta == "V":
        return dec(n) * R * dec(T) / dec(P)
    if falta == "n":
        return dec(P) * dec(V) / (R * dec(T))
    return dec(P) * dec(V) / (dec(n) * R)


# ---------------------------------------------------------------------------------------------------------
# Unidades (definições exatas do SI/convenções; `regras.json` pode complementar/substituir)
# ---------------------------------------------------------------------------------------------------------
# grandeza -> {símbolo: fator para a unidade-base da grandeza (Fraction/Decimal exatos)}
UNIDADES_BASE = {
    "massa": ("kg", {"µg": Fraction(1, 10**9), "mg": Fraction(1, 10**6), "g": Fraction(1, 1000), "kg": Fraction(1), "t": Fraction(1000)}),
    "volume": ("m³", {"µL": Fraction(1, 10**9), "mL": Fraction(1, 10**6), "cm³": Fraction(1, 10**6), "L": Fraction(1, 1000), "dm³": Fraction(1, 1000), "m³": Fraction(1)}),
    "pressao": ("Pa", {"Pa": Fraction(1), "kPa": Fraction(1000), "MPa": Fraction(10**6), "bar": Fraction(10**5), "atm": Fraction(101325),
                       "mmHg": Fraction(101325, 760), "torr": Fraction(101325, 760)}),
    "energia": ("J", {"J": Fraction(1), "kJ": Fraction(1000), "cal": Fraction(4184, 1000), "kcal": Fraction(4184)}),
    "comprimento": ("m", {"pm": Fraction(1, 10**12), "Å": Fraction(1, 10**10), "nm": Fraction(1, 10**9), "µm": Fraction(1, 10**6),
                          "mm": Fraction(1, 1000), "cm": Fraction(1, 100), "m": Fraction(1), "km": Fraction(1000)}),
    "quantidade": ("mol", {"µmol": Fraction(1, 10**6), "mmol": Fraction(1, 1000), "mol": Fraction(1), "kmol": Fraction(1000)}),
    "concentracao": ("mol/L", {"mmol/L": Fraction(1, 1000), "mol/L": Fraction(1), "µmol/L": Fraction(1, 10**6)}),
    "tempo": ("s", {"s": Fraction(1), "min": Fraction(60), "h": Fraction(3600)}),
}
TEMPERATURAS = ("K", "°C", "°F")
ZERO_CELSIUS_K = Decimal("273.15")  # definição: 0 °C ≡ 273,15 K


def grandeza_da_unidade(u: str, tabela=UNIDADES_BASE):
    for g, (_, us) in tabela.items():
        if u in us:
            return g
    if u in TEMPERATURAS:
        return "temperatura"
    return None


def fator(u: str, tabela=UNIDADES_BASE) -> Fraction:
    g = grandeza_da_unidade(u, tabela)
    return tabela[g][1][u]


def converter(valor, de: str, para: str, tabela=UNIDADES_BASE):
    """Converte `valor` de `de` para `para`. Devolve (resultado Decimal, passos) onde passos descreve a conta:
       ('fator', f_de, f_para, base) ou ('temperatura', ...)."""
    gd, gp = grandeza_da_unidade(de, tabela), grandeza_da_unidade(para, tabela)
    if gd is None or gd != gp:
        raise ValueError(f"unidades incompatíveis: {de} -> {para}")
    v = dec(valor)
    if gd == "temperatura":
        if de == para:
            return v, [("temperatura", de, para)]
        # via Celsius
        if de == "K":
            c = v - ZERO_CELSIUS_K
        elif de == "°F":
            c = (v - 32) * Decimal(5) / Decimal(9)
        else:
            c = v
        if para == "°C":
            r = c
        elif para == "K":
            r = c + ZERO_CELSIUS_K
        else:
            r = c * Decimal(9) / Decimal(5) + 32
        return r, [("temperatura", de, para)]
    base, _ = tabela[gd]
    fd, fp = tabela[gd][1][de], tabela[gd][1][para]
    em_base = v * dec(fd)
    r = em_base / dec(fp)
    return r, [("fator", fd, fp, base, em_base)]


def fracao_para_decimal(fr: Fraction) -> Decimal:
    return Decimal(fr.numerator) / Decimal(fr.denominator)


_ALIAS_REGRAS = {"m³": "m3", "dm³": "dm3", "cm³": "cm3", "torr": "Torr"}
_GRANDEZAS_REGRAS = ("massa", "volume", "pressao", "energia", "comprimento", "quantidade", "tempo")


def tabela_de_regras(regras):
    """Tabela de unidades no formato de UNIDADES_BASE, com os fatores de `regras.json` (`unidades.<grandeza>.fatores`) onde existirem
    e os fatores embutidos (definições exatas) nos demais casos. Devolve (tabela, quantas_unidades_vieram_de_regras, total)."""
    from decimal import Decimal as _D
    un = (regras or {}).get("unidades") or {}
    tab, vieram, total = {}, 0, 0
    for g, (base, us) in UNIDADES_BASE.items():
        fatores = ((un.get(g) or {}).get("fatores") or {}) if g in _GRANDEZAS_REGRAS else {}
        novos = {}
        for u, f in us.items():
            total += 1
            v = fatores.get(_ALIAS_REGRAS.get(u, u))
            if isinstance(v, (int, float)) and not isinstance(v, bool) and v > 0:
                novos[u] = Fraction(_D(repr(v)))
                vieram += 1
            else:
                novos[u] = f
        tab[g] = (base, novos)
    return tab, vieram, total
