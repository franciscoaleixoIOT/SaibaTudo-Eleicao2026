# -*- coding: utf-8 -*-
"""Elementos (normalização de unidades, categoria, estado, configuração, massa) e constantes CODATA (parser)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import coleta_constantes as CC  # noqa: E402
import coleta_elementos as CE  # noqa: E402

LINHA_O = {"AtomicNumber": "8", "Symbol": "O", "Name": "Oxygen", "AtomicMass": "15.999", "ElectronConfiguration": "[He]2s2 2p4",
           "Electronegativity": "3.44", "AtomicRadius": "152", "IonizationEnergy": "13.618", "ElectronAffinity": "1.461",
           "OxidationStates": "-2", "StandardState": "Gas", "MeltingPoint": "54.36", "BoilingPoint": "90.2",
           "Density": "0.001429", "GroupBlock": "Nonmetal", "YearDiscovered": "1774"}
LINHA_OG = {"AtomicNumber": "118", "Symbol": "Og", "Name": "Oganesson", "AtomicMass": "295.216",
            "ElectronConfiguration": "[Rn]7s2 7p6 5f14 6d10 (predicted)", "Electronegativity": "", "AtomicRadius": "",
            "IonizationEnergy": "", "ElectronAffinity": "", "OxidationStates": "+6, +4, +2, +1, 0, -1",
            "StandardState": "Expected to be a Gas", "MeltingPoint": "", "BoilingPoint": "", "Density": "",
            "GroupBlock": "Noble gas", "YearDiscovered": "2006"}


class UnidadesTest(unittest.TestCase):
    def test_ev_para_kj_mol(self):
        self.assertEqual(CE.ev_para_kj_mol("13.618"), 1313.9)  # energia de ionização do O
        self.assertEqual(CE.ev_para_kj_mol("1.461"), 141.0)    # afinidade eletrônica do O
        self.assertIsNone(CE.ev_para_kj_mol(""))

    def test_densidade_g_cm3_para_kg_m3(self):
        self.assertEqual(CE.g_cm3_para_kg_m3("0.001429"), 1.429)
        self.assertEqual(CE.g_cm3_para_kg_m3("7.874"), 7874)
        self.assertIsInstance(CE.g_cm3_para_kg_m3("2.70"), int)
        self.assertIsNone(CE.g_cm3_para_kg_m3(""))

    def test_categoria(self):
        casos = {"Alkali metal": "metal_alcalino", "Alkaline earth metal": "metal_alcalino_terroso",
                 "Transition metal": "metal_transicao", "Post-transition metal": "metal_pos_transicao",
                 "Metalloid": "semimetal", "Nonmetal": "nao_metal", "Halogen": "halogenio", "Noble gas": "gas_nobre",
                 "Lanthanide": "lantanideo", "Actinide": "actinideo", "": "desconhecida", "Coisa": "desconhecida"}
        for en, pt in casos.items():
            self.assertEqual(CE.categoria(en), pt)

    def test_estado_e_oxidacao_e_configuracao(self):
        self.assertEqual(CE.estado_padrao("Solid"), "solido")
        self.assertIsNone(CE.estado_padrao("Expected to be a Solid"))
        self.assertEqual(CE.estados_oxidacao("+5, +4,+2, -1, 0"), [-1, 0, 2, 4, 5])
        self.assertEqual(CE.configuracao("[He]2s2 2p4"), "[He] 2s2 2p4")
        self.assertEqual(CE.configuracao("[Rn]7s2 7p6 (predicted)"), "[Rn] 7s2 7p6 (prevista)")

    def test_massa_wikidata_refina_so_quando_cabe(self):
        self.assertEqual(CE.escolher_massa("7.0", "6.94"), (6.94, "wikidata"))
        self.assertEqual(CE.escolher_massa("55.84", "55.845"), (55.845, "wikidata"))
        self.assertEqual(CE.escolher_massa("1.0080", "1.008"), (1.008, "pubchem"))
        self.assertEqual(CE.escolher_massa("295.216", "294.21392")[1], "pubchem")  # outro isótopo
        self.assertEqual(CE.escolher_massa("96.90636", "97.907")[1], "pubchem")


class ElementoTest(unittest.TestCase):
    def test_oxigenio_segue_o_contrato(self):
        e = CE.montar_elemento(LINHA_O, None, "2026-10-10")
        for k, v in {"z": 8, "simbolo": "O", "nome": "Oxigênio", "nomeEn": "Oxygen", "massaAtomica": 15.999, "grupo": 16,
                     "periodo": 2, "bloco": "p", "categoria": "nao_metal", "configuracaoEletronica": "[He] 2s2 2p4",
                     "eletronegatividade": 3.44, "raioAtomicoPm": 152, "afinidadeEletronicaKJmol": 141.0,
                     "energiaIonizacaoKJmol": 1313.9, "pontoFusaoK": 54.36, "pontoEbulicaoK": 90.2, "densidadeKgm3": 1.429,
                     "estadoPadrao": "gas", "estadosOxidacao": [-2], "descoberta": {"ano": 1774}}.items():
            self.assertEqual(e[k], v, k)
        self.assertEqual(e["fontes"][0]["nome"], "PubChem Periodic Table")
        self.assertNotIn("cas", e)

    def test_superpesado_ausencia_de_dado_e_ausencia_de_campo(self):
        e = CE.montar_elemento(LINHA_OG, None, "2026-10-10")
        for k in ("eletronegatividade", "raioAtomicoPm", "pontoFusaoK", "densidadeKgm3", "estadoPadrao", "afinidadeEletronicaKJmol"):
            self.assertNotIn(k, e)
        self.assertEqual(e["configuracaoEletronica"], "[Rn] 7s2 7p6 5f14 6d10 (prevista)")
        self.assertEqual(e["grupo"], 18)

    def test_simbolo_divergente_levanta(self):
        with self.assertRaises(ValueError):
            CE.montar_elemento(dict(LINHA_O, Symbol="X"), None, "2026-10-10")

    def test_descobridor_so_quando_o_ano_confere(self):
        wd = {"itens": {"Q629"}, "sym": "O", "cas": set(), "massas": set(), "anos": {"1774"}, "por": ["Carl Wilhelm Scheele"],
              "pt": set(), "ptbr": set(), "en": set()}
        self.assertEqual(CE.montar_elemento(LINHA_O, wd, "2026-10-10")["descoberta"]["por"], "Carl Wilhelm Scheele")
        wd["anos"] = {"1800"}
        self.assertNotIn("por", CE.montar_elemento(LINHA_O, wd, "2026-10-10")["descoberta"])


AMOSTRA_CODATA = """\
             Fundamental Physical Constants --- Complete Listing

  Quantity                                                       Value                 Uncertainty           Unit
-----------------------------------------------------------------------------------------------------------------------------
Avogadro constant                                           6.022 140 76 e23         (exact)                  mol^-1
electron mass                                               9.109 383 7139 e-31      0.000 000 0028 e-31      kg
molar gas constant                                          8.314 462 618...         (exact)                  J mol^-1 K^-1
fine-structure constant                                     7.297 352 5643 e-3       0.000 000 0011 e-3
speed of light in vacuum                                    299 792 458              (exact)                  m s^-1
von Klitzing constant                                       25 812.807 45...         (exact)                  ohm
"""


class ConstantesTest(unittest.TestCase):
    def setUp(self):
        self.t = CC.parse_allascii(AMOSTRA_CODATA)

    def test_valores(self):
        self.assertEqual(self.t["Avogadro constant"]["valor"], 6.02214076e23)
        self.assertTrue(self.t["Avogadro constant"]["exata"])
        self.assertEqual(self.t["Avogadro constant"]["valorTexto"], "6.02214076e23")
        self.assertEqual(self.t["speed of light in vacuum"]["valor"], 299792458)
        self.assertIsInstance(self.t["speed of light in vacuum"]["valor"], int)
        self.assertEqual(self.t["electron mass"]["incerteza"], 2.8e-40)

    def test_valor_truncado_e_adimensional(self):
        self.assertEqual(self.t["molar gas constant"]["valor"], 8.314462618)
        self.assertEqual(self.t["molar gas constant"]["valorTexto"], "8.314462618...")
        self.assertEqual(self.t["fine-structure constant"]["unidadeCodata"], "")

    def test_unidades_legiveis(self):
        self.assertEqual(CC.unidade_legivel("J mol^-1 K^-1"), "J·mol⁻¹·K⁻¹")
        self.assertEqual(CC.unidade_legivel("m^3 mol^-1"), "m³·mol⁻¹")
        self.assertEqual(CC.unidade_legivel("ohm"), "Ω")
        self.assertIsNone(CC.unidade_legivel(""))

    def test_formato_desconhecido_levanta(self):
        with self.assertRaises(ValueError):
            CC.parse_allascii("nada a ver")

    def test_selecao_tem_ids_unicos(self):
        ids = [s[1] for s in CC.SELECAO]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertGreaterEqual(len(ids), 50)


if __name__ == "__main__":
    unittest.main()
