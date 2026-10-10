package net.saibatudo.quimica

import kotlinx.coroutines.runBlocking
import net.saibatudo.quimica.ai.nlu.Dicionario
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Busca de elementos e compostos por nome (PT/EN/IUPAC), símbolo, número atômico, fórmula, CAS e CID. */
class BuscaTest {

    private val d = runBlocking { Dicionario.criar(TestData.Fixture.pacote) }

    private fun primeiro(q: String) = d.buscar(q).firstOrNull()

    @Test fun porNomeComOuSemAcento() {
        assertEquals(702L, primeiro("etanol")?.cid)
        assertEquals(2244L, primeiro("ácido acetilsalicílico")?.cid)
        assertEquals(2244L, primeiro("acido acetilsalicilico")?.cid)
        assertEquals(2244L, primeiro("aspirina")?.cid)
        assertEquals(702L, primeiro("ethanol")?.cid)                 // nome em inglês (sinônimo)
        assertEquals(2244L, primeiro("2-acetyloxybenzoic")?.cid)     // nome IUPAC
    }

    @Test fun porSimboloNumeroEFormula() {
        assertEquals(26, primeiro("Fe")?.z)
        assertEquals(26, primeiro("fe")?.z)
        assertEquals(8, primeiro("8")?.z)
        assertEquals("Oxigênio (O)", primeiro("oxygen")?.titulo)
        assertEquals(1118L, primeiro("H2SO4")?.cid)
        assertEquals(1118L, primeiro("h2so4")?.cid)
        assertEquals(14777L, primeiro("Ca(OH)2")?.cid)
    }

    @Test fun porCasECid() {
        assertEquals(702L, primeiro("64-17-5")?.cid)
        assertEquals(962L, primeiro("962")?.cid)
    }

    @Test fun resultadosOrdenadosPorRelevanciaELimitados() {
        val r = d.buscar("acido")
        assertTrue(r.size >= 3)
        assertTrue(r.zipWithNext().all { (a, b) -> a.pontos >= b.pontos })
        assertTrue(d.buscar("a", limite = 5).size <= 5)
        assertTrue(d.buscar("   ").isEmpty())
        assertTrue(d.buscar("zzzzzz").isEmpty())
    }
}
