package net.saibatudo.eleicoes2026

import net.saibatudo.eleicoes2026.ui.viewmodel.HistoricoPerguntas
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HistoricoPerguntasTest {

    private fun com(vararg perguntas: String) = perguntas.fold(HistoricoPerguntas()) { h, p -> h.registrar(p) }

    @Test
    fun `vazio nao navega e nao tem ultima`() {
        val h = HistoricoPerguntas()
        assertNull(h.ultima)
        assertFalse(h.podeSubir)
        assertFalse(h.podeDescer)
        assertNull(h.subir(""))
        assertNull(h.descer())
    }

    @Test
    fun `registrar guarda a ultima e volta ao modo livre`() {
        val h = com("a", "b")
        assertEquals("b", h.ultima)
        assertTrue(h.podeSubir)
        assertFalse(h.podeDescer)
    }

    @Test
    fun `repeticao imediata e texto em branco nao duplicam`() {
        assertEquals(listOf("a"), com("a", "a", "  ").itens)
        assertEquals(listOf("a", "b", "a"), com("a", "b", "a").itens)
    }

    @Test
    fun `seta para cima percorre as perguntas e para na primeira`() {
        var h = com("a", "b", "c")
        val (h1, t1) = h.subir("")!!; h = h1
        assertEquals("c", t1)
        val (h2, t2) = h.subir("c")!!; h = h2
        assertEquals("b", t2)
        val (h3, t3) = h.subir("b")!!; h = h3
        assertEquals("a", t3)
        assertFalse(h.podeSubir)
        assertNull(h.subir("a"))
    }

    @Test
    fun `descer ate o fim volta em branco quando nada foi escrito`() {
        var h = com("a", "b")
        h = h.subir("")!!.first      // b
        h = h.subir("b")!!.first     // a
        val (h1, t1) = h.descer()!!; h = h1
        assertEquals("b", t1)
        val (h2, t2) = h.descer()!!; h = h2
        assertEquals("", t2)
        assertFalse(h.podeDescer)
        assertNull(h.descer())
    }

    @Test
    fun `descer ate o fim devolve o rascunho que estava sendo digitado`() {
        var h = com("a", "b")
        h = h.subir("quem disputa")!!.first     // b (guarda o rascunho)
        h = h.subir("b")!!.first                // a (rascunho continua o original)
        h = h.descer()!!.first                  // b
        val (_, t) = h.descer()!!
        assertEquals("quem disputa", t)
    }

    @Test
    fun `nova pergunta apos navegar zera o rascunho e vai ao fim`() {
        var h = com("a", "b")
        h = h.subir("rascunho")!!.first
        h = h.registrar("c")
        assertEquals("c", h.ultima)
        assertFalse(h.podeDescer)
        assertEquals("", h.copy().rascunho)
    }

    @Test
    fun `limite de itens descarta as mais antigas`() {
        val h = (1..HistoricoPerguntas.LIMITE + 5).fold(HistoricoPerguntas()) { acc, i -> acc.registrar("p$i") }
        assertEquals(HistoricoPerguntas.LIMITE, h.itens.size)
        assertEquals("p6", h.itens.first())
        assertEquals("p${HistoricoPerguntas.LIMITE + 5}", h.ultima)
    }

    @Test
    fun `inicializar a partir de lista salva e limpar`() {
        var h = HistoricoPerguntas(listOf("x", "y"), 2, "")
        assertEquals("y", h.ultima)
        assertTrue(h.podeSubir)
        assertFalse(h.podeDescer)
        h = HistoricoPerguntas()
        assertNull(h.ultima)
        assertFalse(h.podeSubir)
    }
}
