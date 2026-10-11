# -*- coding: utf-8 -*-
"""Biblioteca de cálculo: fórmulas, massa molar (confere com o PubChem), balanceador (conservação de átomos em todas as equações)."""
import unittest
from decimal import Decimal

from tests import _base  # noqa: F401  (ajusta sys.path)
import calculo as C
import equacoes
import fam_calculos
from comum import dec, fmt_sig


class TestFormulas(unittest.TestCase):
    def test_parse(self):
        casos = {"H2O": {"H": 2, "O": 1}, "Ca(OH)2": {"Ca": 1, "O": 2, "H": 2}, "(NH4)2SO4": {"N": 2, "H": 8, "S": 1, "O": 4},
                 "CuSO4·5H2O": {"Cu": 1, "S": 1, "O": 9, "H": 10}, "Al2(SO4)3": {"Al": 2, "S": 3, "O": 12}, "K4[Fe(CN)6]": {"K": 4, "Fe": 1, "C": 6, "N": 6},
                 "CH3COOH": {"C": 2, "H": 4, "O": 2}, "Fe2O3": {"Fe": 2, "O": 3}}
        for f, esperado in casos.items():
            self.assertEqual(dict(C.parse_formula(f)), esperado, f)

    def test_invalidas(self):
        for f in ("", "Ca(OH", "H2O)", "Xx2", "h2o2", "2"):
            with self.assertRaises(C.FormulaInvalida):
                C.parse_formula(f, validos=fam_calculos.SIMBOLOS)

    def test_hill(self):
        self.assertEqual(C.formula_hill(C.parse_formula("C6H12O6")), "C6H12O6")
        self.assertEqual(C.formula_hill(C.parse_formula("H2SO4")), "H2O4S")
        self.assertEqual(C.formula_hill(C.parse_formula("NaCl")), "ClNa")


class TestMassaMolar(unittest.TestCase):
    def test_agua_com_massas_do_pacote(self):
        pac = _base.pacote()
        if "H" not in pac.massas or "O" not in pac.massas:
            self.skipTest("pacote sem H/O")
        total = C.massa_molar(C.parse_formula("H2O"), pac.massas)
        self.assertEqual(total, 2 * dec(pac.massas["H"]) + dec(pac.massas["O"]))
        self.assertAlmostEqual(float(total), 18.015, delta=0.02)

    def test_bate_com_pubchem(self):
        """massa molar calculada pelas massas atômicas difere < 0,5 % do `massaMolar` do PubChem em todo composto analisável."""
        pac = _base.pacote()
        ctx = _base.qa()
        n, ruins = 0, []
        for c in pac.compostos:
            info = fam_calculos.mm_composto(ctx, c)
            if not info or c.get("massaMolar") is None:
                continue
            n += 1
            dif = abs(info["total"] - dec(c["massaMolar"])) / dec(c["massaMolar"]) * 100
            if dif > Decimal("0.5"):
                ruins.append((c["cid"], c.get("nome"), float(dif)))
        self.assertGreater(n, 0)
        # divergências > 0,5 % só são aceitas quando REGISTRADAS em stats (e a resposta passa a usar o valor do PubChem)
        self.assertEqual(len(ruins), ctx.stats.get("massa_molar_divergente_do_pubchem", 0), ruins[:5])
        self.assertLessEqual(len(ruins), max(1, n // 50), f"divergências demais: {ruins[:10]}")


class TestBalanceador(unittest.TestCase):
    def test_conservacao_em_todas_as_equacoes(self):
        eqs = equacoes.lista_equacoes()
        self.assertGreaterEqual(len(eqs), 150)
        validas, falhas = 0, []
        for tipo, eq in eqs:
            reag, prod = C.parse_equacao(eq)
            coefs = C.balancear(reag, prod, fam_calculos.SIMBOLOS)
            if coefs is None:
                falhas.append(eq)
                continue
            self.assertTrue(all(isinstance(c, int) and c > 0 for c in coefs), eq)
            self.assertTrue(C.conserva(reag, prod, coefs, fam_calculos.SIMBOLOS), eq)
            from math import gcd
            g = 0
            for c in coefs:
                g = gcd(g, c)
            self.assertEqual(g, 1, f"coeficientes não mínimos em {eq}")
            validas += 1
        self.assertGreaterEqual(validas, 150, falhas)

    def test_conhecidos(self):
        casos = {"H2 + O2 -> H2O": [2, 1, 2], "C3H8 + O2 -> CO2 + H2O": [1, 5, 3, 4], "Fe2O3 + CO -> Fe + CO2": [1, 3, 2, 3],
                 "Al + H2SO4 -> Al2(SO4)3 + H2": [2, 3, 1, 3], "KMnO4 + HCl -> KCl + MnCl2 + Cl2 + H2O": [2, 16, 2, 2, 5, 8]}
        for eq, esperado in casos.items():
            r, p = C.parse_equacao(eq)
            self.assertEqual(C.balancear(r, p), esperado, eq)

    def test_indeterminada_e_impossivel(self):
        r, p = C.parse_equacao("C + O2 -> CO2 + CO")
        self.assertIsNone(C.balancear(r, p))  # dois graus de liberdade
        r, p = C.parse_equacao("H2 -> O2")
        self.assertIsNone(C.balancear(r, p))

    def test_setas_e_estados(self):
        for txt in ("H2 + O2 -> H2O", "H2 + O2 → H2O", "H2 + O2 = H2O", "H2(g) + O2(g) => H2O(l)", "2H2 + O2 -> 2H2O"):
            r, p = C.parse_equacao(txt)
            self.assertEqual(C.balancear(r, p), [2, 1, 2], txt)


class TestConversoesEFisica(unittest.TestCase):
    def test_unidades(self):
        self.assertEqual(C.converter(5, "atm", "kPa")[0], Decimal("506.625"))
        self.assertEqual(C.converter(25, "°C", "K")[0], Decimal("298.15"))
        self.assertEqual(C.converter(100, "°C", "°F")[0], Decimal("212"))
        self.assertEqual(C.converter(2.5, "L", "mL")[0], Decimal("2500"))
        self.assertEqual(C.converter(1, "Å", "pm")[0], Decimal("100"))
        with self.assertRaises(ValueError):
            C.converter(1, "g", "L")

    def test_volume_molar_cntp(self):
        vm = C.volume_molar(Decimal("8.314462618"))
        self.assertAlmostEqual(float(vm), 22.414, places=3)

    def test_ph(self):
        self.assertAlmostEqual(float(C.ph_de_h(Decimal("0.010"))), 2.0, places=9)
        self.assertAlmostEqual(float(C.h_de_ph(Decimal("3"))), 0.001, places=12)

    def test_gas_ideal(self):
        v = C.gas_ideal(8.314462618, P=101325, n=1, T=273.15)
        self.assertAlmostEqual(float(v) * 1000, 22.414, places=3)
        with self.assertRaises(ValueError):
            C.gas_ideal(8.3, P=1, V=1, n=1, T=1)


class TestFormatacao(unittest.TestCase):
    def test_sig(self):
        self.assertEqual(fmt_sig(18.0153, 4), "18,02")
        self.assertEqual(fmt_sig(100.0, 4), "100,0")
        self.assertEqual(fmt_sig(9.9996, 4), "10,00")
        self.assertEqual(fmt_sig(6.02214076e23, 4), "6,022 × 10²³")
        self.assertEqual(fmt_sig(-195.8, 4), "−195,8")


if __name__ == "__main__":
    unittest.main()


class TestDivergenciaComPubChem(unittest.TestCase):
    def test_divergencia_maior_que_meio_por_cento_usa_o_pubchem_e_e_registrada(self):
        from comum import FIXTURE_DIR
        from pacote import Pacote
        from qa_base import Ctx
        pac = Pacote(FIXTURE_DIR)
        pac.comp_cid[962]["massaMolar"] = 18.9  # 4,9 % acima do calculado (18,015)
        ctx = Ctx(pac)
        fam_calculos._gerar_massa_molar(ctx)
        regs = [r for r in ctx.registros if r["id"].startswith("ca-mm-962")]
        self.assertTrue(regs)
        for r in regs:
            self.assertIn("Atenção", r["resposta"])
            self.assertEqual(r["calculo"]["resultado"], fmt_sig(18.9, 4))
            self.assertIn("18,9", r["resposta"])
        self.assertEqual(ctx.stats["massa_molar_divergente_do_pubchem"], 1)
        self.assertTrue(any("962" in a for a in ctx.avisos))


class TestRegrasDeEnsino(unittest.TestCase):
    def test_solubilidade_por_regras(self):
        import fam_regras
        regras = _base.pacote().regras.get("solubilidade", {}).get("regras")
        if not regras:
            self.skipTest("pacote sem regras de solubilidade")
        c = fam_regras.classificar
        self.assertEqual(c(regras, "Na+", "Cl-")[0], "soluvel")
        self.assertEqual(c(regras, "Ag+", "Cl-")[0], "insoluvel")
        self.assertEqual(c(regras, "Ba2+", "SO4 2-")[0], "insoluvel")
        self.assertEqual(c(regras, "Ca2+", "CO3 2-")[0], "insoluvel")
        self.assertEqual(c(regras, "K+", "CO3 2-")[0], "soluvel")
        self.assertEqual(c(regras, "Cu2+", "OH-")[0], "insoluvel")
        self.assertEqual(c(regras, "Na+", "O2-")[0], "reage")
        self.assertEqual(c(regras, "Ca2+", "NO3-")[0], "soluvel")
        self.assertIsNone(c(regras, "Fe3+", "F-"))
