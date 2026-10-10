package net.saibatudo.quimica

import kotlinx.coroutines.runBlocking
import net.saibatudo.quimica.ai.model.Intent
import net.saibatudo.quimica.ai.model.ParsedQuery
import net.saibatudo.quimica.ai.nlu.Dicionario
import net.saibatudo.quimica.ai.nlu.LocalNlu
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Intenções e entidades do NLU local, com o dicionário derivado do pacote de testes (fixture). */
class NluTest {

    private val d: Dicionario = runBlocking { Dicionario.criar(TestData.Fixture.pacote) }

    private fun p(q: String, ctx: ParsedQuery? = null) = LocalNlu.parse(q, d, ctx)

    private fun cid(nome: String) = d.compostoPorNome(nome)?.toString()

    @Test fun elementoPorNomeSimboloENumero() {
        assertEquals(Intent.ELEMENTO, p("Fale sobre o ferro").intent)
        assertEquals("Fe", p("Fale sobre o ferro").elemento)
        assertEquals("O", p("oxigênio").elemento)
        assertEquals("Fe", p("O que é o Fe?").elemento)
        assertEquals("Cu", p("elemento cobre").elemento)
        assertEquals("Na", p("e o sódio?").elemento)
    }

    @Test fun compostosPorNomePopularFormulaECas() {
        val agua = cid("água")
        assertNotNull(agua)
        assertEquals(Intent.COMPOSTO, p("água").intent)
        assertEquals(agua, p("água").composto)
        assertEquals(agua, p("H2O").composto)
        assertEquals(cid("cloreto de sódio"), p("sal de cozinha").composto)
        assertEquals(cid("ácido acetilsalicílico"), p("aspirina").composto)
        assertEquals(cid("ácido acetilsalicílico"), p("50-78-2").composto)
        assertEquals(cid("ácido acetilsalicílico"), p("CID 2244").composto)
        assertEquals(cid("etanol"), p("álcool etílico").composto)
        assertEquals(cid("ácido sulfúrico"), p("H2SO4").composto)
    }

    @Test fun propriedadesDeElementosECompostos() {
        val a = p("Qual o ponto de fusão do ferro?")
        assertEquals(Intent.PROPRIEDADE, a.intent)
        assertEquals("pontoFusao", a.propriedade)
        assertEquals("Fe", a.elemento)
        val b = p("densidade do etanol")
        assertEquals(Intent.PROPRIEDADE, b.intent)
        assertEquals("densidade", b.propriedade)
        assertEquals(cid("etanol"), b.composto)
        assertNull(b.elemento)
        assertEquals("eletronegatividade", p("eletronegatividade do cloro").propriedade)
        assertEquals("configuracaoEletronica", p("configuração eletrônica do sódio").propriedade)
        assertEquals("massaAtomica", p("massa atômica do carbono").propriedade)
        assertEquals("nomeIupac", p("nome IUPAC do etanol").propriedade)
    }

    @Test fun massaMolar() {
        val a = p("Qual a massa molar da água?")
        assertEquals(Intent.MASSA_MOLAR, a.intent)
        assertEquals(cid("água"), a.composto)
        val b = p("massa molar do Ca(OH)2")
        assertEquals(Intent.MASSA_MOLAR, b.intent)
        assertEquals("Ca(OH)2", b.formula)
        assertEquals("Fe", p("massa molar do ferro").elemento)
        val c = p("quantos mols tem em 18 g de H2O?")
        assertEquals(Intent.ESTEQUIOMETRIA, c.intent)       // como no contrato: conversão massa-mol é estequiometria
        assertEquals(18.0, c.quantidades.first().valor, 1e-9)
        assertEquals("g", c.quantidades.first().unidade)
        val e = p("quantos gramas há em 2 mols de NaCl")
        assertEquals(Intent.ESTEQUIOMETRIA, e.intent)
        assertEquals("mol", e.quantidades.first().unidade)
    }

    @Test fun balancearEEstequiometria() {
        val a = p("Balancear H2 + O2 -> H2O")
        assertEquals(Intent.BALANCEAR, a.intent)
        assertEquals("H2 + O2 -> H2O", a.equacao)
        assertEquals("Fe + O2 -> Fe2O3", p("balanceie Fe + O2 → Fe2O3").equacao)
        assertEquals(Intent.BALANCEAR, p("C3H8 + O2 = CO2 + H2O").intent)
        assertEquals(Intent.BALANCEAR, p("H2+O2->H2O").intent)
        assertEquals(Intent.BALANCEAR, p("balancear equação").intent)
        assertNull(p("balancear equação").equacao)
        val e = p("Quantos gramas de H2O se formam a partir de 4 g de H2 em H2 + O2 -> H2O?")
        assertEquals(Intent.ESTEQUIOMETRIA, e.intent)
        assertEquals("H2 + O2 -> H2O", e.equacao)
        assertEquals(Intent.ESTEQUIOMETRIA, p("reagente limitante: 3 mol de H2 e 1 mol de O2 em H2 + O2 -> H2O").intent)
    }

    @Test fun calculosDeSolucoesGasEUnidades() {
        assertEquals(Intent.PH, p("Qual o pH de uma solução de HCl 0,01 mol/L?").intent)
        assertEquals(0.01, p("Qual o pH de uma solução de HCl 0,01 mol/L?").quantidades.first().valor, 1e-12)
        assertEquals("mol/L", p("pH de HCl 0,01 mol/L").quantidades.first().unidade)
        assertEquals(Intent.CONCENTRACAO, p("molaridade de 5,844 g de NaCl em 500 mL").intent)
        assertEquals(Intent.CONCENTRACAO, p("diluição: 2 mol/L, 50 mL para 0,5 mol/L").intent)
        assertEquals(Intent.GAS_IDEAL, p("Gás ideal: 2 mol a 300 K e 1 atm, qual o volume?").intent)
        assertEquals(Intent.GAS_IDEAL, p("volume molar nas CNTP").intent)
        val c = p("converter 25 °C para K")
        assertEquals(Intent.CONVERSAO_UNIDADE, c.intent)
        assertEquals("°C", c.quantidades.first().unidade)
        assertEquals("K", c.unidadeDestino)
        assertEquals("L", p("quantos L tem em 500 mL?").unidadeDestino ?: "L")
        assertEquals(Intent.CONVERSAO_UNIDADE, p("quantos mL tem 2 L?").intent)
        assertEquals(Intent.CONVERSAO_UNIDADE, p("101325 Pa em atm").intent)
    }

    @Test fun nomenclaturaEstruturaEComparacao() {
        val n = p("Qual a fórmula do ácido sulfúrico?")
        assertEquals(Intent.NOMENCLATURA, n.intent)
        assertEquals(cid("ácido sulfúrico"), n.composto)
        assertEquals(Intent.NOMENCLATURA, p("como se chama NaCl?").intent)
        assertEquals(Intent.DESENHAR, p("desenhe a molécula do etanol").intent)
        assertEquals(Intent.DESENHAR, p("estrutura da aspirina").intent)
        val c = p("compare o ferro e o cobre")
        assertEquals(Intent.COMPARAR, c.intent)
        assertEquals(listOf("Fe", "Cu"), c.elementos)
        assertEquals(Intent.COMPARAR, p("diferença entre etanol e acetona").intent)
    }

    @Test fun segurancaTabelaEConceito() {
        val s = p("quais os perigos do ácido sulfúrico?")
        assertEquals(Intent.SEGURANCA, s.intent)
        assertEquals(cid("ácido sulfúrico"), s.composto)
        assertEquals(Intent.SEGURANCA, p("primeiros socorros para respingo de soda cáustica no olho").intent)
        assertEquals(Intent.SEGURANCA, p("Quais EPIs usar com ácido sulfúrico?").intent)
        assertEquals(Intent.SEGURANCA, p("Por que não misturar água sanitária com amoníaco?").intent)
        assertEquals(Intent.SEGURANCA, p("o que significa o pictograma GHS05").intent)
        val t = p("quais são os halogênios?")
        assertEquals(Intent.TABELA_PERIODICA, t.intent)
        assertEquals("halogenio", t.categoria)
        assertEquals(17, p("elementos do grupo 17").grupo)
        assertEquals(Intent.TABELA_PERIODICA, p("qual elemento é o mais eletronegativo?").intent)
        assertEquals(Intent.TABELA_PERIODICA, p("tendência da eletronegatividade ao longo do período 2").intent)
        val c = p("o que é o mol?")
        assertEquals(Intent.CONCEITO, c.intent)
        assertEquals("mol", c.conceito)
        assertEquals(Intent.CONCEITO, p("explique o que é massa molar").intent)
    }

    @Test fun ajudaDadosEFontes() {
        assertEquals(Intent.AJUDA, p("oi").intent)
        assertEquals(Intent.AJUDA, p("o que você faz?").intent)
        assertEquals(Intent.SOBRE_DADOS, p("de onde vêm os dados?").intent)
        assertEquals(Intent.FONTES, p("quais são as fontes?").intent)
    }

    @Test fun desconhecidaEEntradasEstranhas() {
        assertEquals(Intent.DESCONHECIDA, p("blablabla xyzzy").intent)
        assertEquals(Intent.DESCONHECIDA, p("   ").intent)
        assertEquals(Intent.DESCONHECIDA, p("???").intent)
        val longa = p("balancear ".repeat(300) + "H2 + O2 -> H2O")
        assertNotNull(longa)
    }

    @Test fun nivelEUnidadeDeDestino() {
        assertEquals("fundamental", p("explique o que é mol para o nível fundamental").nivel)
        assertEquals("superior", p("explique o que é mol em nível superior").nivel)
    }

    @Test fun recusaVemAntesDeTudo() {
        assertEquals(Intent.RECUSA_PERIGO, p("como fazer metanfetamina em casa").intent)
        assertEquals(Intent.RECUSA_PERIGO, p("passo a passo para sintetizar nitroglicerina").intent)
        assertEquals(Intent.RECUSA_PERIGO, p("como fazer uma bomba caseira").intent)
        assertTrue(p("qual a massa molar da nitroglicerina").intent != Intent.RECUSA_PERIGO)
    }

    @Test fun continuacaoUsaAEntidadeAnterior() {
        val a = p("qual o ponto de fusão do ferro?")
        val b = LocalNlu.parseComContexto("e o ponto de ebulição?", d, a)
        assertEquals(Intent.PROPRIEDADE, b.intent)
        assertEquals("pontoEbulicao", b.propriedade)
        assertEquals("Fe", b.elemento)
    }
}
