package net.saibatudo.quimica

import net.saibatudo.quimica.data.model.PacoteJson
import net.saibatudo.quimica.domain.Texto
import net.saibatudo.quimica.domain.calc.Balanceador
import net.saibatudo.quimica.domain.calc.CalculoInvalido
import net.saibatudo.quimica.domain.calc.CampoQtd
import net.saibatudo.quimica.domain.calc.Estequiometria
import net.saibatudo.quimica.domain.calc.FormulaQuimica
import net.saibatudo.quimica.domain.calc.GasIdeal
import net.saibatudo.quimica.domain.calc.MassaMolar
import net.saibatudo.quimica.domain.calc.QuantidadeConhecida
import net.saibatudo.quimica.domain.calc.Qtd
import net.saibatudo.quimica.domain.calc.Racional
import net.saibatudo.quimica.domain.calc.Solucoes
import net.saibatudo.quimica.domain.calc.TipoForte
import net.saibatudo.quimica.domain.calc.Unidades
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/** Parser de fórmulas, massa molar, balanceamento, estequiometria, concentração, pH, gás ideal e unidades. */
class CalculosTest {

    private val pacote = TestData.Fixture.pacote
    private val el = pacote.porSimbolo
    private val un = Unidades.de(pacote.regras)
    private fun u(s: String) = un.porSimbolo(s)!!

    // ---- fórmulas e massa molar ---------------------------------------------------------------------------------

    @Test fun parserContaAtomos() {
        assertEquals(mapOf("H" to 2, "O" to 1), FormulaQuimica.analisar("H2O").contagem)
        assertEquals(mapOf("Ca" to 1, "O" to 2, "H" to 2), FormulaQuimica.analisar("Ca(OH)2").contagem)
        assertEquals(mapOf("Cu" to 1, "S" to 1, "O" to 9, "H" to 10), FormulaQuimica.analisar("CuSO4·5H2O").contagem)
        assertEquals(mapOf("Cu" to 1, "S" to 1, "O" to 9, "H" to 10), FormulaQuimica.analisar("CuSO4.5H2O").contagem)
        assertEquals(mapOf("Fe" to 2, "S" to 3, "O" to 12), FormulaQuimica.analisar("Fe2(SO4)3").contagem)
        assertEquals(mapOf("Fe" to 7, "C" to 18, "N" to 18), FormulaQuimica.analisar("Fe4[Fe(CN)6]3").contagem)
        assertEquals(mapOf("H" to 2, "O" to 1), FormulaQuimica.analisar("H₂O").contagem)
        val alume = FormulaQuimica.analisar("Al2(SO4)3·18H2O").contagem
        assertEquals(mapOf("Al" to 2, "S" to 3, "O" to 30, "H" to 36), alume)
    }

    @Test fun parserTrataCarga() {
        assertEquals(3, FormulaQuimica.analisar("Fe3+").carga)
        assertEquals(mapOf("Fe" to 1), FormulaQuimica.analisar("Fe3+").contagem)
        assertEquals(-1, FormulaQuimica.analisar("OH-").carga)
        assertEquals(-2, FormulaQuimica.analisar("SO4^2-").carga)
        assertEquals(mapOf("S" to 1, "O" to 4), FormulaQuimica.analisar("SO4^2-").contagem)
        assertEquals(-2, FormulaQuimica.analisar("SO42-").carga)
        assertEquals(mapOf("S" to 1, "O" to 4), FormulaQuimica.analisar("SO42-").contagem)
        assertEquals(1, FormulaQuimica.analisar("Na+").carga)
    }

    @Test fun parserRecusaEntradaInvalida() {
        for (ruim in listOf("", "   ", "h2o", "Xx2", "Ca(OH2", "Ca)OH(2", "H2O?", "(OH)2)", "2")) {
            try {
                FormulaQuimica.analisar(ruim, el.keys)
                fail("deveria recusar: \"$ruim\"")
            } catch (_: CalculoInvalido) {
            }
        }
    }

    @Test fun massaMolarDeCompostosComuns() {
        assertEquals(18.015, MassaMolar.calcular("H2O", el).massaMolar, 0.002)
        assertEquals(74.092, MassaMolar.calcular("Ca(OH)2", el).massaMolar, 0.002)
        assertEquals(249.677, MassaMolar.calcular("CuSO4·5H2O", el).massaMolar, 0.01)
        assertEquals(399.858, MassaMolar.calcular("Fe2(SO4)3", el).massaMolar, 0.01)
        assertEquals(58.44, MassaMolar.calcular("NaCl", el).massaMolar, 0.01)
        assertEquals(180.156, MassaMolar.calcular("C6H12O6", el).massaMolar, 0.01)
    }

    @Test fun massaMolarMostraPassosEElementoDesconhecido() {
        val r = MassaMolar.calcular("Ca(OH)2", el).comoResultado()
        assertTrue(r.passos.any { it.startsWith("Ca") })
        assertTrue(r.passos.last().startsWith("Soma"))
        try { MassaMolar.calcular("Uuo", el); fail() } catch (_: CalculoInvalido) { }
        try { MassaMolar.calcular("Au", el); fail() } catch (_: CalculoInvalido) { } // ouro não está no fixture
    }

    // ---- balanceamento -------------------------------------------------------------------------------------------

    private fun bal(eq: String) = Balanceador.balancear(eq, el.keys + setOf("K", "Mn", "Al", "P", "Cr", "Zn", "Mg", "Ag")).balanceada.coeficientes

    @Test fun balanceiaDezEquacoes() {
        assertEquals(listOf(2, 1, 2), bal("H2 + O2 -> H2O"))
        assertEquals(listOf(1, 3, 2), bal("N2 + H2 -> NH3"))
        assertEquals(listOf(1, 2, 1, 2), bal("CH4 + O2 -> CO2 + H2O"))
        assertEquals(listOf(1, 5, 3, 4), bal("C3H8 + O2 -> CO2 + H2O"))
        assertEquals(listOf(4, 3, 2), bal("Fe + O2 -> Fe2O3"))
        assertEquals(listOf(2, 6, 2, 3), bal("Al + HCl -> AlCl3 + H2"))
        assertEquals(listOf(1, 6, 6, 6), bal("C6H12O6 + O2 -> CO2 + H2O"))
        assertEquals(listOf(2, 16, 2, 2, 8, 5), bal("KMnO4 + HCl -> KCl + MnCl2 + H2O + Cl2"))
        assertEquals(listOf(3, 2, 1, 6), bal("Ca(OH)2 + H3PO4 -> Ca3(PO4)2 + H2O"))
        assertEquals(listOf(3, 8, 3, 2, 4), bal("Cu + HNO3 -> Cu(NO3)2 + NO + H2O"))
    }

    @Test fun balanceiaVariantesDeEscrita() {
        assertEquals(listOf(1, 3, 2, 3), bal("C2H6O + O2 → CO2 + H2O"))
        assertEquals(listOf(2, 2, 2, 1), bal("Na + H2O = NaOH + H2"))
        assertEquals(listOf(2, 1, 2), bal("2H2(g) + O2(g) --> 2H2O(l)"))          // coeficientes digitados são ignorados
        assertEquals(listOf(1, 1, 1, 1), bal("NaCl + AgNO3 -> AgCl + NaNO3"))
        assertEquals(listOf(1, 1, 1), bal("CaCO3 → CaO + CO2"))
        assertEquals(listOf(2, 1, 2), bal("H₂ + O₂ → H₂O"))
        assertEquals(listOf(1, 1, 5), bal("CuSO4·5H2O -> CuSO4 + H2O"))
    }

    @Test fun balanceiaEquacaoIonicaComCarga() {
        val r = Balanceador.balancear("Fe3+ + OH- -> Fe(OH)3", el.keys + "Fe")
        assertEquals(listOf(1, 3, 1), r.balanceada.coeficientes)
        assertTrue(r.passos.any { it.startsWith("Carga:") })
        val r2 = Balanceador.balancear("Cu2+ + Fe -> Cu + Fe2+", el.keys)
        assertEquals(listOf(1, 1, 1, 1), r2.balanceada.coeficientes)
    }

    @Test fun balanceadorMostraPassosETextoFinal() {
        val r = Balanceador.balancear("H2 + O2 -> H2O", el.keys)
        assertEquals("2 H₂ + O₂ → 2 H₂O", r.balanceada.texto())
        assertEquals("2 H2 + O2 -> 2 H2O", r.balanceada.texto(unicode = false))
        assertTrue(r.passos.any { it.contains("Gauss") })
        assertTrue(r.passos.any { it.startsWith("Verificação") })
    }

    @Test fun balanceadorRecusaEquacoesImpossiveis() {
        for (ruim in listOf("H2 -> O2", "H2O -> H2O2 + O", "NaCl -> Na", "H2 + O2", "->", "", "H2 + O2 -> H2O -> H2")) {
            try {
                Balanceador.balancear(ruim, el.keys)
                fail("deveria recusar: \"$ruim\"")
            } catch (_: CalculoInvalido) {
            }
        }
    }

    @Test fun racionalReduzEOperaExato() {
        assertEquals(Racional.de(1, 2), Racional.de(2, 4))
        assertEquals(Racional.de(5, 6), Racional.de(1, 2) + Racional.de(1, 3))
        assertEquals(Racional.de(-1, 6), Racional.de(1, 3) - Racional.de(1, 2))
        assertEquals("-3/4", Racional.de(3, -4).toString())
    }

    // ---- estequiometria -------------------------------------------------------------------------------------------

    @Test fun estequiometriaMassaDeProduto() {
        // 2 H2 + O2 -> 2 H2O: 4,032 g de H2 (2 mol) produzem 2 mol de água = 36,03 g
        val eq = Balanceador.balancear("H2 + O2 -> H2O", el.keys).balanceada
        val r = Estequiometria.calcular(eq, listOf(QuantidadeConhecida(0, 4.0, emMols = false)), el)
        val agua = r.linhas.first { it.especie == "H2O" }
        assertEquals(4.0 / (2 * 1.008) * 18.015, agua.massa, 0.05)
        assertEquals(4.0 / (2 * 1.008), agua.mols, 1e-9)
        assertEquals(4.0 / (2 * 1.008) / 2, r.linhas.first { it.especie == "O2" }.mols, 1e-9)
    }

    @Test fun estequiometriaReagenteLimitante() {
        // 2 H2 + O2 -> 2 H2O com 3 mol de H2 e 1 mol de O2: limitante O2 (1 < 1,5); formam 2 mol de H2O; sobra 1 mol de H2
        val eq = Balanceador.balancear("H2 + O2 -> H2O", el.keys).balanceada
        val r = Estequiometria.calcular(eq, listOf(QuantidadeConhecida(0, 3.0, true), QuantidadeConhecida(1, 1.0, true)), el)
        assertEquals("O2", r.limitante)
        assertEquals(2.0, r.linhas.first { it.especie == "H2O" }.mols, 1e-9)
        assertEquals(1.0, r.linhas.first { it.especie == "H2" }.sobraMols!!, 1e-9)
        assertEquals(0.0, r.linhas.first { it.especie == "O2" }.sobraMols!!, 1e-9)
    }

    @Test fun estequiometriaRecusaEntradasRuins() {
        val eq = Balanceador.balancear("H2 + O2 -> H2O", el.keys).balanceada
        try { Estequiometria.calcular(eq, emptyList(), el); fail() } catch (_: CalculoInvalido) { }
        try { Estequiometria.calcular(eq, listOf(QuantidadeConhecida(0, -1.0, true)), el); fail() } catch (_: CalculoInvalido) { }
        try { Estequiometria.calcular(eq, listOf(QuantidadeConhecida(0, 1.0, true), QuantidadeConhecida(2, 1.0, true)), el); fail() } catch (_: CalculoInvalido) { }
    }

    // ---- gás ideal -------------------------------------------------------------------------------------------------

    @Test fun gasIdealVolumeMolarNasCNTP() {
        val r = pacote.constante("R")
        val res = GasIdeal.resolver(CampoQtd(101325.0, u("Pa")), CampoQtd(null, u("L")), CampoQtd(1.0, u("mol")), CampoQtd(273.15, u("K")), r, un)
        val litros = res.linhas.first().valor.replace(" L", "").replace(",", ".").toDouble()
        assertEquals(22.414, litros, 0.002)
    }

    @Test fun gasIdealComUnidadesMistas() {
        val r = pacote.constante("R")
        // 1 atm, 0 °C, 1 mol -> 22,41 L
        val a = GasIdeal.resolver(CampoQtd(1.0, u("atm")), CampoQtd(null, u("L")), CampoQtd(1.0, u("mol")), CampoQtd(0.0, u("°C")), r, un)
        assertEquals(22.41, a.linhas.first().valor.replace(" L", "").replace(",", ".").toDouble(), 0.01)
        // temperatura: 2 atm, 10 L, 0,8 mol  ->  T = PV/(nR)
        val t = GasIdeal.resolver(CampoQtd(2.0, u("atm")), CampoQtd(10.0, u("L")), CampoQtd(0.8, u("mol")), CampoQtd(null, u("K")), r, un)
        val esperado = 2 * 101325.0 * 0.010 / (0.8 * 8.314462618)
        assertEquals(esperado, t.linhas.first().valor.replace(" K", "").replace(".", "").replace(",", ".").toDouble(), 0.05)
        assertTrue(t.passos.first().contains("P·V = n·R·T"))
    }

    @Test fun gasIdealExigeUmCampoVazioEValoresPositivos() {
        val r = pacote.constante("R")
        try { GasIdeal.resolver(CampoQtd(1.0, u("atm")), CampoQtd(1.0, u("L")), CampoQtd(1.0, u("mol")), CampoQtd(300.0, u("K")), r, un); fail() } catch (_: CalculoInvalido) { }
        try { GasIdeal.resolver(CampoQtd(1.0, u("atm")), CampoQtd(null, u("L")), CampoQtd(1.0, u("mol")), CampoQtd(-5.0, u("K")), r, un); fail() } catch (_: CalculoInvalido) { }
        try { GasIdeal.resolver(CampoQtd(1.0, u("L")), CampoQtd(null, u("L")), CampoQtd(1.0, u("mol")), CampoQtd(300.0, u("K")), r, un); fail() } catch (_: CalculoInvalido) { }
        try { GasIdeal.resolver(CampoQtd(1.0, u("atm")), CampoQtd(null, u("L")), CampoQtd(1.0, u("mol")), CampoQtd(300.0, u("K")), null, un); fail() } catch (_: CalculoInvalido) { }
    }

    // ---- pH ---------------------------------------------------------------------------------------------------------

    private fun ph(r: net.saibatudo.quimica.domain.calc.ResultadoCalculo) = r.linhas.first { it.rotulo == "pH" }.valor.replace(",", ".").toDouble()

    @Test fun phDeAcidosEBasesFortes() {
        assertEquals(2.0, ph(Solucoes.phForte(TipoForte.ACIDO, Qtd(0.01, u("mol/L")), 1, un)), 0.005)
        assertEquals(11.0, ph(Solucoes.phForte(TipoForte.BASE, Qtd(0.001, u("mol/L")), 1, un)), 0.005)
        assertEquals(12.0, ph(Solucoes.phForte(TipoForte.BASE, Qtd(0.005, u("mol/L")), 2, un)), 0.005)   // Ca(OH)2
        assertEquals(2.0, ph(Solucoes.phForte(TipoForte.ACIDO, Qtd(0.005, u("mol/L")), 2, un)), 0.005)   // H2SO4 (2 H+)
        assertEquals(0.0, ph(Solucoes.phForte(TipoForte.ACIDO, Qtd(1.0, u("mol/L")), 1, un)), 0.005)
        assertEquals(3.0, ph(Solucoes.phForte(TipoForte.ACIDO, Qtd(1.0, u("mmol/L")), 1, un)), 0.005)
    }

    @Test fun phMuitoDiluidoConsideraAAgua() {
        val r = Solucoes.phForte(TipoForte.ACIDO, Qtd(1e-8, u("mol/L")), 1, un)
        assertEquals(6.98, ph(r), 0.005)       // e não 8
        assertTrue(r.notas.any { it.contains("autoionização") })
    }

    @Test fun phUsaKwDoPacoteQuandoExiste() {
        assertEquals(14.0, Solucoes.pKwDoPacote(pacote.constantes).first, 1e-12)
        assertFalse(Solucoes.pKwDoPacote(pacote.constantes).second)   // o fixture não traz Kw: a nota informa 25 °C
    }

    // ---- concentração e diluição ---------------------------------------------------------------------------------------

    @Test fun molaridadeEMassaParaPreparar() {
        // 5,844 g de NaCl (58,44 g/mol) em 500 mL -> 0,2 mol/L
        val r = Solucoes.molaridade(Qtd(5.844, u("g")), 58.44, Qtd(500.0, u("mL")), un)
        assertEquals(0.2, r.linhas.first { it.destaque }.valor.replace(" mol/L", "").replace(",", ".").toDouble(), 1e-4)
        // 250 mL de NaOH 0,1 mol/L (39,997 g/mol) -> 1,0 g
        val m = Solucoes.massaParaPreparar(Qtd(0.1, u("mol/L")), Qtd(250.0, u("mL")), 39.997, un)
        assertEquals(1.0, m.linhas.first().valor.replace(" g", "").replace(",", ".").toDouble(), 0.001)
    }

    @Test fun diluicaoResolveQualquerIncognita() {
        // 2 mol/L, 50 mL -> 0,5 mol/L: V2 = 200 mL
        val v2 = Solucoes.diluicao(CampoQtd(2.0, u("mol/L")), CampoQtd(50.0, u("mL")), CampoQtd(0.5, u("mol/L")), CampoQtd(null, u("mL")), un)
        assertEquals(200.0, v2.linhas.first().valor.replace(" mL", "").replace(",", ".").toDouble(), 1e-6)
        val c2 = Solucoes.diluicao(CampoQtd(2.0, u("mol/L")), CampoQtd(0.05, u("L")), CampoQtd(null, u("mmol/L")), CampoQtd(200.0, u("mL")), un)
        assertEquals(500.0, c2.linhas.first().valor.replace(" mmol/L", "").replace(",", ".").toDouble(), 1e-6)
        val v1 = Solucoes.diluicao(CampoQtd(1.0, u("mol/L")), CampoQtd(null, u("mL")), CampoQtd(0.1, u("mol/L")), CampoQtd(100.0, u("mL")), un)
        assertEquals(10.0, v1.linhas.first().valor.replace(" mL", "").replace(",", ".").toDouble(), 1e-6)
        try { Solucoes.diluicao(CampoQtd(1.0, u("mol/L")), CampoQtd(1.0, u("mL")), CampoQtd(1.0, u("mol/L")), CampoQtd(1.0, u("mL")), un); fail() } catch (_: CalculoInvalido) { }
    }

    // ---- unidades ---------------------------------------------------------------------------------------------------------

    @Test fun conversaoDeUnidades() {
        assertEquals(298.15, un.converter(25.0, u("°C"), u("K")), 1e-9)
        assertEquals(-40.0, un.converter(-40.0, u("°C"), u("°F")), 1e-9)
        assertEquals(212.0, un.converter(100.0, u("°C"), u("°F")), 1e-9)
        assertEquals(101.325, un.converter(1.0, u("atm"), u("kPa")), 1e-9)
        assertEquals(1000.0, un.converter(1.0, u("L"), u("mL")), 1e-9)
        assertEquals(4184.0, un.converter(1.0, u("kcal"), u("J")), 1e-9)
        try { un.converter(1.0, u("L"), u("g")); fail() } catch (_: CalculoInvalido) { }
        assertNotNull(un.buscar("graus celsius"))
        assertEquals("mL", un.buscar("ml", "volume")?.simbolo)
        assertEquals("mol/L", un.buscar("molar", "concentracao")?.simbolo)
    }

    @Test fun formatacaoPtBr() {
        assertEquals("18,015", Texto.fixo(18.0149, 3))
        assertEquals("1.234,5", Texto.numero(1234.5))
        assertEquals("6,022 × 10²³", Texto.cientifica(6.02214076e23, 3))
        assertEquals("H₂O", Texto.formulaUnicode("H2O"))
        assertEquals("Ca(OH)₂", Texto.formulaUnicode("Ca(OH)2"))
        assertEquals("CuSO₄·5H₂O", Texto.formulaUnicode("CuSO4·5H2O"))
        assertEquals("Fe³⁺", Texto.formulaUnicode("Fe3+"))
        assertEquals("SO₄²⁻", Texto.formulaUnicode("SO4^2-"))
        assertEquals("2 H₂ + O₂ → 2 H₂O", Texto.formulaUnicode("2 H2 + O2 → 2 H2O"))
        assertEquals("agua oxigenada", Texto.normalizar("  Água   Oxigenada "))
    }

    @Test fun parseTolerantePacoteJson() {
        val idx = PacoteJson.indiceCompostos(PacoteJson.parse("""[{"cid": 1, "lote": "lote-001", "nome": "Água"}, {"cid": 2, "lote": "lote-002"}]""".toByteArray()))
        assertEquals(2, idx.tamanho)
        assertEquals("lote-002", idx.entrada(2)!!.lote)
        val idx2 = PacoteJson.indiceCompostos(PacoteJson.parse("""{"7": "lote-009", "8": {"lote": "lote-010", "nomes": ["x"]}}""".toByteArray()))
        assertEquals("lote-010", idx2.entrada(8)!!.lote)
        assertEquals("compostos/lote-009.json", PacoteJson.caminhoDoLote("lote-009"))
        assertEquals("compostos/lote-009.json", PacoteJson.caminhoDoLote("compostos/lote-009.json"))
    }
}
