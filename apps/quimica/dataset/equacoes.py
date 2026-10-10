# -*- coding: utf-8 -*-
"""Equações químicas clássicas (SEM coeficientes) para balanceamento e estequiometria.

Os coeficientes NUNCA vêm daqui: são calculados por `calculo.balancear` (álgebra linear racional) e conferidos pelos testes.
Cada linha: "tipo|reagentes -> produtos". Equações indeterminadas ou impossíveis são descartadas pelo gerador (e contadas).
"""

_CLASSICAS = """
sintese|H2 + O2 -> H2O
sintese|N2 + H2 -> NH3
sintese|H2 + Cl2 -> HCl
sintese|H2 + F2 -> HF
sintese|H2 + Br2 -> HBr
sintese|H2 + I2 -> HI
sintese|Na + Cl2 -> NaCl
sintese|Al + Cl2 -> AlCl3
sintese|Fe + Cl2 -> FeCl3
sintese|Mg + N2 -> Mg3N2
sintese|Ca + N2 -> Ca3N2
sintese|Al + S -> Al2S3
sintese|Fe + S -> FeS
sintese|Na + O2 -> Na2O
sintese|Mg + O2 -> MgO
sintese|Al + O2 -> Al2O3
sintese|Fe + O2 -> Fe2O3
sintese|Fe + O2 -> Fe3O4
sintese|Ca + O2 -> CaO
sintese|K + O2 -> K2O
sintese|Li + O2 -> Li2O
sintese|Zn + O2 -> ZnO
sintese|Cu + O2 -> CuO
sintese|Cu + O2 -> Cu2O
sintese|Ba + O2 -> BaO
sintese|Sn + O2 -> SnO2
sintese|S + O2 -> SO2
sintese|SO2 + O2 -> SO3
sintese|P4 + O2 -> P4O10
sintese|P + O2 -> P2O5
sintese|C + O2 -> CO2
sintese|N2 + O2 -> NO
sintese|NO + O2 -> NO2
sintese|CO + O2 -> CO2
sintese|NH3 + HCl -> NH4Cl
sintese|NH3 + H2SO4 -> (NH4)2SO4
sintese|NH3 + HNO3 -> NH4NO3
sintese|NH3 + H3PO4 -> (NH4)3PO4
biologica|CO2 + H2O -> C6H12O6 + O2
oxido_agua|SO3 + H2O -> H2SO4
oxido_agua|SO2 + H2O -> H2SO3
oxido_agua|CO2 + H2O -> H2CO3
oxido_agua|N2O5 + H2O -> HNO3
oxido_agua|P4O10 + H2O -> H3PO4
oxido_agua|Cl2O7 + H2O -> HClO4
oxido_agua|Na2O + H2O -> NaOH
oxido_agua|K2O + H2O -> KOH
oxido_agua|Li2O + H2O -> LiOH
oxido_agua|CaO + H2O -> Ca(OH)2
oxido_agua|BaO + H2O -> Ba(OH)2
oxido_agua|CaO + CO2 -> CaCO3
oxido_agua|CaO + SiO2 -> CaSiO3
decomposicao|H2O2 -> H2O + O2
decomposicao|H2O -> H2 + O2
decomposicao|KClO3 -> KCl + O2
decomposicao|CaCO3 -> CaO + CO2
decomposicao|MgCO3 -> MgO + CO2
decomposicao|CuCO3 -> CuO + CO2
decomposicao|NaHCO3 -> Na2CO3 + H2O + CO2
decomposicao|HgO -> Hg + O2
decomposicao|Ag2O -> Ag + O2
decomposicao|NH4NO3 -> N2O + H2O
decomposicao|NH4NO2 -> N2 + H2O
decomposicao|(NH4)2Cr2O7 -> Cr2O3 + N2 + H2O
decomposicao|Cu(OH)2 -> CuO + H2O
decomposicao|Mg(OH)2 -> MgO + H2O
decomposicao|Al(OH)3 -> Al2O3 + H2O
decomposicao|Fe(OH)3 -> Fe2O3 + H2O
decomposicao|H2CO3 -> H2O + CO2
decomposicao|NaN3 -> Na + N2
decomposicao|KNO3 -> KNO2 + O2
decomposicao|NH3 -> N2 + H2
decomposicao|PCl5 -> PCl3 + Cl2
decomposicao|N2O5 -> NO2 + O2
organica|C2H5OH -> C2H4 + H2O
decomposicao|Zn(NO3)2 -> ZnO + NO2 + O2
decomposicao|Pb(NO3)2 -> PbO + NO2 + O2
decomposicao|KMnO4 -> K2MnO4 + MnO2 + O2
simples_troca|Zn + HCl -> ZnCl2 + H2
simples_troca|Mg + HCl -> MgCl2 + H2
simples_troca|Al + HCl -> AlCl3 + H2
simples_troca|Fe + HCl -> FeCl2 + H2
simples_troca|Zn + H2SO4 -> ZnSO4 + H2
simples_troca|Mg + H2SO4 -> MgSO4 + H2
simples_troca|Al + H2SO4 -> Al2(SO4)3 + H2
simples_troca|Fe + H2SO4 -> FeSO4 + H2
simples_troca|Na + H2O -> NaOH + H2
simples_troca|K + H2O -> KOH + H2
simples_troca|Ca + H2O -> Ca(OH)2 + H2
simples_troca|Li + H2O -> LiOH + H2
simples_troca|Ba + H2O -> Ba(OH)2 + H2
simples_troca|Mg + H2O -> Mg(OH)2 + H2
simples_troca|Fe + H2O -> Fe3O4 + H2
simples_troca|Fe + CuSO4 -> FeSO4 + Cu
simples_troca|Zn + CuSO4 -> ZnSO4 + Cu
simples_troca|Al + CuSO4 -> Al2(SO4)3 + Cu
simples_troca|Zn + AgNO3 -> Zn(NO3)2 + Ag
simples_troca|Cu + AgNO3 -> Cu(NO3)2 + Ag
simples_troca|Al + CuCl2 -> AlCl3 + Cu
simples_troca|Zn + Pb(NO3)2 -> Zn(NO3)2 + Pb
simples_troca|Al + Fe2O3 -> Al2O3 + Fe
simples_troca|Mg + Fe2O3 -> MgO + Fe
simples_troca|Cl2 + NaBr -> NaCl + Br2
simples_troca|Cl2 + KI -> KCl + I2
simples_troca|Br2 + KI -> KBr + I2
dupla_troca|AgNO3 + NaCl -> AgCl + NaNO3
dupla_troca|CaCl2 + AgNO3 -> AgCl + Ca(NO3)2
dupla_troca|BaCl2 + Na2SO4 -> BaSO4 + NaCl
dupla_troca|Na2SO4 + Ba(NO3)2 -> BaSO4 + NaNO3
dupla_troca|Al2(SO4)3 + BaCl2 -> BaSO4 + AlCl3
dupla_troca|Pb(NO3)2 + KI -> PbI2 + KNO3
dupla_troca|Pb(NO3)2 + Na2SO4 -> PbSO4 + NaNO3
dupla_troca|CaCl2 + Na2CO3 -> CaCO3 + NaCl
dupla_troca|K2CrO4 + BaCl2 -> BaCrO4 + KCl
dupla_troca|Na3PO4 + CaCl2 -> Ca3(PO4)2 + NaCl
dupla_troca|CuSO4 + NaOH -> Cu(OH)2 + Na2SO4
dupla_troca|FeCl3 + NaOH -> Fe(OH)3 + NaCl
dupla_troca|Fe2(SO4)3 + NaOH -> Fe(OH)3 + Na2SO4
dupla_troca|AlCl3 + NaOH -> Al(OH)3 + NaCl
dupla_troca|MgCl2 + NaOH -> Mg(OH)2 + NaCl
dupla_troca|Ca(OH)2 + CO2 -> CaCO3 + H2O
dupla_troca|Ba(OH)2 + H2SO4 -> BaSO4 + H2O
dupla_troca|NH4Cl + NaOH -> NaCl + NH3 + H2O
dupla_troca|(NH4)2SO4 + NaOH -> Na2SO4 + NH3 + H2O
dupla_troca|Na2CO3 + HCl -> NaCl + H2O + CO2
dupla_troca|CaCO3 + HCl -> CaCl2 + H2O + CO2
dupla_troca|NaHCO3 + HCl -> NaCl + H2O + CO2
dupla_troca|NaHCO3 + CH3COOH -> CH3COONa + H2O + CO2
dupla_troca|Na2S + HCl -> NaCl + H2S
dupla_troca|FeS + HCl -> FeCl2 + H2S
dupla_troca|Ca3(PO4)2 + H2SO4 -> CaSO4 + H3PO4
dupla_troca|MgO + HCl -> MgCl2 + H2O
dupla_troca|Al2O3 + HCl -> AlCl3 + H2O
dupla_troca|Fe2O3 + HCl -> FeCl3 + H2O
dupla_troca|CuO + H2SO4 -> CuSO4 + H2O
dupla_troca|Al2O3 + H2SO4 -> Al2(SO4)3 + H2O
dupla_troca|Fe2O3 + H2SO4 -> Fe2(SO4)3 + H2O
neutralizacao|HCl + NaOH -> NaCl + H2O
neutralizacao|HCl + KOH -> KCl + H2O
neutralizacao|HCl + Ca(OH)2 -> CaCl2 + H2O
neutralizacao|HCl + Al(OH)3 -> AlCl3 + H2O
neutralizacao|HCl + Mg(OH)2 -> MgCl2 + H2O
neutralizacao|H2SO4 + NaOH -> Na2SO4 + H2O
neutralizacao|H2SO4 + KOH -> K2SO4 + H2O
neutralizacao|H2SO4 + Ca(OH)2 -> CaSO4 + H2O
neutralizacao|H2SO4 + Al(OH)3 -> Al2(SO4)3 + H2O
neutralizacao|H3PO4 + NaOH -> Na3PO4 + H2O
neutralizacao|H3PO4 + Ca(OH)2 -> Ca3(PO4)2 + H2O
neutralizacao|HNO3 + NaOH -> NaNO3 + H2O
neutralizacao|HNO3 + Ca(OH)2 -> Ca(NO3)2 + H2O
neutralizacao|HNO3 + Al(OH)3 -> Al(NO3)3 + H2O
neutralizacao|CH3COOH + NaOH -> CH3COONa + H2O
neutralizacao|H2CO3 + NaOH -> Na2CO3 + H2O
redox|KMnO4 + HCl -> KCl + MnCl2 + Cl2 + H2O
redox|K2Cr2O7 + HCl -> KCl + CrCl3 + Cl2 + H2O
redox|MnO2 + HCl -> MnCl2 + Cl2 + H2O
redox|Cu + HNO3 -> Cu(NO3)2 + NO + H2O
redox|Cu + HNO3 -> Cu(NO3)2 + NO2 + H2O
redox|Zn + HNO3 -> Zn(NO3)2 + NH4NO3 + H2O
redox|Fe2O3 + CO -> Fe + CO2
redox|Fe3O4 + CO -> Fe + CO2
redox|Fe2O3 + C -> Fe + CO
redox|CuO + H2 -> Cu + H2O
redox|CuO + NH3 -> Cu + N2 + H2O
redox|NH3 + O2 -> NO + H2O
redox|NH3 + O2 -> N2 + H2O
redox|NO2 + H2O -> HNO3 + NO
redox|Cl2 + NaOH -> NaCl + NaClO + H2O
redox|Cl2 + NaOH -> NaCl + NaClO3 + H2O
redox|H2S + O2 -> S + H2O
redox|H2S + O2 -> SO2 + H2O
redox|SO2 + H2S -> S + H2O
redox|C + H2SO4 -> CO2 + SO2 + H2O
redox|Cu + H2SO4 -> CuSO4 + SO2 + H2O
redox|H2O2 + KMnO4 + H2SO4 -> K2SO4 + MnSO4 + O2 + H2O
redox|FeSO4 + KMnO4 + H2SO4 -> Fe2(SO4)3 + K2SO4 + MnSO4 + H2O
redox|Na2S2O3 + I2 -> Na2S4O6 + NaI
redox|Na2O2 + H2O -> NaOH + O2
redox|Na2O2 + CO2 -> Na2CO3 + O2
redox|CaC2 + H2O -> Ca(OH)2 + C2H2
redox|Al4C3 + H2O -> Al(OH)3 + CH4
redox|Mg3N2 + H2O -> Mg(OH)2 + NH3
redox|SiO2 + C -> Si + CO
redox|SiO2 + HF -> SiF4 + H2O
redox|SiCl4 + H2O -> SiO2 + HCl
redox|PCl3 + H2O -> H3PO3 + HCl
redox|ZnS + O2 -> ZnO + SO2
redox|CuS + O2 -> CuO + SO2
redox|PbS + O2 -> PbO + SO2
redox|FeS2 + O2 -> Fe2O3 + SO2
redox|Ca3(PO4)2 + SiO2 + C -> CaSiO3 + CO + P4
combustao|C6H12O6 + O2 -> CO2 + H2O
combustao|C12H22O11 + O2 -> CO2 + H2O
biologica|C6H12O6 -> C2H5OH + CO2
combustao|C2H5OH + O2 -> CO2 + H2O
combustao|CH3COOH + O2 -> CO2 + H2O
combustao|HCOOH + O2 -> CO2 + H2O
combustao|C3H6O + O2 -> CO2 + H2O
combustao|C6H6 + O2 -> CO2 + H2O
combustao|C7H8 + O2 -> CO2 + H2O
combustao|C2H2 + O2 -> CO2 + H2O
organica|CH4 + Cl2 -> CH3Cl + HCl
organica|C2H4 + H2O -> C2H5OH
combustao|CH3OH + O2 -> CO2 + H2O
"""

NOMES_ALCANO = {1: "metano", 2: "etano", 3: "propano", 4: "butano", 5: "pentano", 6: "hexano", 7: "heptano", 8: "octano", 9: "nonano", 10: "decano"}


def _formula_alcano(n):
    return f"C{n}H{2 * n + 2}" if n > 1 else "CH4"


def _series_combustao():
    out = []
    for n in range(1, 11):
        out.append(("combustao", f"{_formula_alcano(n)} + O2 -> CO2 + H2O"))
    for n in range(2, 7):
        out.append(("combustao", f"C{n}H{2 * n} + O2 -> CO2 + H2O"))
    for n in range(2, 6):
        out.append(("combustao", f"C{n}H{2 * n - 2} + O2 -> CO2 + H2O"))
    for n in range(2, 7):
        out.append(("combustao", f"C{n}H{2 * n + 1}OH + O2 -> CO2 + H2O"))
    return out


def lista_equacoes():
    """[(tipo, 'A + B -> C + D')], sem repetição."""
    vistos, out = set(), []
    brutas = [tuple(l.split("|", 1)) for l in _CLASSICAS.strip().splitlines() if l.strip()] + _series_combustao()
    for tipo, eq in brutas:
        if eq not in vistos:
            vistos.add(eq)
            out.append((tipo, eq))
    return out


TIPO_PT = {
    "sintese": "síntese", "oxido_agua": "reação de óxido", "decomposicao": "decomposição", "simples_troca": "simples troca (deslocamento)",
    "dupla_troca": "dupla troca", "organica": "reação orgânica", "biologica": "processo biológico", "neutralizacao": "neutralização", "redox": "oxirredução", "combustao": "combustão",
}
