# -*- coding: utf-8 -*-
"""
Constantes físicas e químicas: CODATA 2022 (NIST, domínio público) -> constantes.json.

Lê `allascii.txt` (colunas de largura fixa: Quantity | Value | Uncertainty | Unit) e extrai as constantes mais usadas
em química, com símbolo, valor, incerteza, unidade e nome em português. O texto do valor é preservado em `valorTexto`
(sem os espaços de agrupamento de dígitos do NIST) para que respostas possam citar os mesmos algarismos.
"""
import re
from decimal import Decimal, InvalidOperation

import quimica_util as Q

URL = "https://physics.nist.gov/cuu/Constants/Table/allascii.txt"
URL_PAGINA = "https://physics.nist.gov/cuu/Constants/"
LICENCA = "domínio público (NIST)"

# (nome CODATA, id, símbolo, nome em português)
SELECAO = [
    ("molar gas constant", "R", "R", "Constante universal dos gases"),
    ("Avogadro constant", "N_A", "N_A", "Constante de Avogadro"),
    ("Boltzmann constant", "k_B", "k_B", "Constante de Boltzmann"),
    ("Boltzmann constant in eV/K", "k_B_eV", "k_B", "Constante de Boltzmann em eV/K"),
    ("Planck constant", "h", "h", "Constante de Planck"),
    ("reduced Planck constant", "hbar", "ħ", "Constante de Planck reduzida"),
    ("molar Planck constant", "N_A_h", "N_A·h", "Constante molar de Planck"),
    ("speed of light in vacuum", "c", "c", "Velocidade da luz no vácuo"),
    ("elementary charge", "e", "e", "Carga elementar"),
    ("Faraday constant", "F", "F", "Constante de Faraday"),
    ("electron mass", "m_e", "m_e", "Massa do elétron"),
    ("proton mass", "m_p", "m_p", "Massa do próton"),
    ("neutron mass", "m_n", "m_n", "Massa do nêutron"),
    ("deuteron mass", "m_d", "m_d", "Massa do dêuteron"),
    ("alpha particle mass", "m_alfa", "m_α", "Massa da partícula alfa"),
    ("muon mass", "m_mu", "m_μ", "Massa do múon"),
    ("atomic mass constant", "u", "u", "Unidade de massa atômica unificada (constante de massa atômica)"),
    ("electron mass in u", "m_e_u", "m_e", "Massa do elétron em u"),
    ("proton mass in u", "m_p_u", "m_p", "Massa do próton em u"),
    ("neutron mass in u", "m_n_u", "m_n", "Massa do nêutron em u"),
    ("proton-electron mass ratio", "m_p_sobre_m_e", "m_p/m_e", "Razão entre as massas do próton e do elétron"),
    ("electron charge to mass quotient", "e_sobre_m_e", "−e/m_e", "Razão carga/massa do elétron"),
    ("molar mass constant", "M_u", "M_u", "Constante de massa molar"),
    ("molar mass of carbon-12", "M_C12", "M(¹²C)", "Massa molar do carbono-12"),
    ("molar volume of ideal gas (273.15 K, 101.325 kPa)", "V_m_273_101325", "V_m",
     "Volume molar de gás ideal a 273,15 K e 101,325 kPa"),
    ("molar volume of ideal gas (273.15 K, 100 kPa)", "V_m_273_100000", "V_m",
     "Volume molar de gás ideal a 273,15 K e 100 kPa (CNTP da IUPAC)"),
    ("Loschmidt constant (273.15 K, 101.325 kPa)", "n_0_101325", "n_0",
     "Constante de Loschmidt a 273,15 K e 101,325 kPa"),
    ("Loschmidt constant (273.15 K, 100 kPa)", "n_0_100000", "n_0", "Constante de Loschmidt a 273,15 K e 100 kPa"),
    ("vacuum electric permittivity", "epsilon_0", "ε₀", "Permissividade elétrica do vácuo"),
    ("vacuum mag. permeability", "mu_0", "μ₀", "Permeabilidade magnética do vácuo"),
    ("Rydberg constant", "R_inf", "R∞", "Constante de Rydberg"),
    ("Rydberg constant times hc in eV", "Ry_eV", "Ry", "Energia de Rydberg em eV"),
    ("Rydberg constant times hc in J", "Ry_J", "Ry", "Energia de Rydberg em J"),
    ("Bohr radius", "a_0", "a₀", "Raio de Bohr"),
    ("Bohr magneton", "mu_B", "μ_B", "Magnéton de Bohr"),
    ("nuclear magneton", "mu_N", "μ_N", "Magnéton nuclear"),
    ("Hartree energy", "E_h", "E_h", "Energia de Hartree"),
    ("Hartree energy in eV", "E_h_eV", "E_h", "Energia de Hartree em eV"),
    ("electron volt", "eV", "eV", "Elétron-volt (em joules)"),
    ("fine-structure constant", "alfa", "α", "Constante de estrutura fina"),
    ("inverse fine-structure constant", "alfa_inv", "α⁻¹", "Inverso da constante de estrutura fina"),
    ("Compton wavelength", "lambda_C", "λ_C", "Comprimento de onda de Compton"),
    ("classical electron radius", "r_e", "r_e", "Raio clássico do elétron"),
    ("electron g factor", "g_e", "g_e", "Fator g do elétron"),
    ("Thomson cross section", "sigma_e", "σ_e", "Seção de choque de Thomson"),
    ("Stefan-Boltzmann constant", "sigma", "σ", "Constante de Stefan-Boltzmann"),
    ("Wien wavelength displacement law constant", "b", "b", "Constante de deslocamento de Wien (comprimento de onda)"),
    ("Wien frequency displacement law constant", "b_freq", "b′", "Constante de deslocamento de Wien (frequência)"),
    ("first radiation constant", "c_1", "c₁", "Primeira constante de radiação"),
    ("second radiation constant", "c_2", "c₂", "Segunda constante de radiação"),
    ("Newtonian constant of gravitation", "G", "G", "Constante gravitacional"),
    ("standard acceleration of gravity", "g_n", "g_n", "Aceleração padrão da gravidade"),
    ("standard atmosphere", "atm", "atm", "Atmosfera padrão"),
    ("standard-state pressure", "p_padrao", "p°", "Pressão do estado padrão"),
    ("Josephson constant", "K_J", "K_J", "Constante de Josephson"),
    ("von Klitzing constant", "R_K", "R_K", "Constante de von Klitzing"),
    ("conductance quantum", "G_0", "G₀", "Quantum de condutância"),
    ("Sackur-Tetrode constant (1 K, 101.325 kPa)", "S0_R_101325", "S₀/R",
     "Constante de Sackur-Tetrode a 1 K e 101,325 kPa"),
    ("Sackur-Tetrode constant (1 K, 100 kPa)", "S0_R_100000", "S₀/R", "Constante de Sackur-Tetrode a 1 K e 100 kPa"),
]

_UNIDADES_TXT = {"ohm": "Ω"}


def unidade_legivel(u):
    """'J mol^-1 K^-1' -> 'J·mol⁻¹·K⁻¹'. Retorna None para grandeza adimensional."""
    u = (u or "").strip()
    if not u:
        return None
    partes = []
    for tok in u.split():
        if "^" in tok and "(" not in tok:
            base, exp = tok.split("^", 1)
            partes.append(_UNIDADES_TXT.get(base, base) + Q.sobrescrito(exp))
        else:
            partes.append(_UNIDADES_TXT.get(tok, tok))
    return "·".join(partes)


def _limpar(valor_txt):
    """'22.413 969 54... e-3' -> ('22.41396954e-3', '22.41396954...e-3'); None se vazio."""
    t = re.sub(r"\s+", "", valor_txt or "")
    if not t or t == "(exact)":
        return None, None
    return t.replace("...", ""), t


def _decimal(txt):
    try:
        return Decimal(txt)
    except (InvalidOperation, TypeError):
        return None


def _nu(d):
    """Decimal -> int quando é um inteiro sem expoente (299792458), senão float."""
    if d == d.to_integral_value() and "E" not in str(d).upper():
        return int(d)
    return float(d)


_LINHA = re.compile(r"^(?P<nome>\S.*?)\s{2,}(?P<valor>\S(?:.*?\S)?)\s{2,}(?P<inc>\(exact\)|\S(?:.*?\S)?)(?:\s{2,}(?P<unid>\S.*?))?\s*$")


def parse_allascii(texto):
    """Devolve {nome CODATA: {valorTexto, valor, incerteza | exata, unidadeCodata}}.

    O cabeçalho do NIST não está alinhado com as colunas dos dados, então a divisão usa o separador de 2+ espaços
    (nomes, números agrupados em trios e unidades só têm espaços simples)."""
    linhas = texto.splitlines()
    inicio = next((i for i, l in enumerate(linhas) if l.lstrip().startswith("Quantity") and "Uncertainty" in l), None)
    if inicio is None:
        raise ValueError("cabeçalho do allascii.txt não encontrado (formato mudou?)")
    saida = {}
    for l in linhas[inicio + 1:]:
        if not l.strip() or set(l.strip()) == {"-"}:
            continue
        m = _LINHA.match(l)
        if not m:
            continue
        sem, texto_v = _limpar(m.group("valor"))
        if sem is None or _decimal(sem) is None:
            continue
        reg = {"valorTexto": texto_v, "valor": _nu(_decimal(sem)), "unidadeCodata": (m.group("unid") or "").strip()}
        inc = m.group("inc")
        if inc == "(exact)":
            reg["exata"] = True
        else:
            isem, _ = _limpar(inc)
            if isem is not None and _decimal(isem) is not None:
                reg["incerteza"] = float(_decimal(isem))
        saida[m.group("nome").strip()] = reg
    return saida


def coletar(http, hoje):
    r = http.get(URL)
    if r.status != 200:
        raise RuntimeError(f"CODATA devolveu HTTP {r.status}")
    tabela = parse_allascii(r.texto("utf-8"))
    fonte_ = Q.fonte("CODATA 2022 (NIST)", URL_PAGINA, LICENCA, hoje)
    constantes, ausentes = [], []
    for nome_en, cid, simbolo, nome_pt in SELECAO:
        reg = tabela.get(nome_en)
        if reg is None:
            ausentes.append(nome_en)
            continue
        c = {"id": cid, "simbolo": simbolo, "nome": nome_pt, "nomeEn": nome_en, "valor": reg["valor"],
             "valorTexto": reg["valorTexto"]}
        if reg.get("exata"):
            c["exata"] = True
        elif "incerteza" in reg:
            c["incerteza"] = reg["incerteza"]
        u = unidade_legivel(reg["unidadeCodata"])
        if u:
            c["unidade"] = u
        c["fontes"] = [fonte_]
        constantes.append(c)
    return constantes, {"constantes": len(constantes), "linhasCodata": len(tabela), "ausentesNoCodata": ausentes}
