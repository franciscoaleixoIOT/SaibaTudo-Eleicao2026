package net.saibatudo.eleicoes2026

import kotlinx.coroutines.runBlocking
import net.saibatudo.eleicoes2026.ai.engine.LocalOfficialAiEngine
import net.saibatudo.eleicoes2026.ai.model.Intent
import net.saibatudo.eleicoes2026.ai.nlu.LocalNlu
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ContextCarryoverTest {

    @Test
    fun continuidadeDeContextoResolveElipses() {
        val gaz = TestData.gazetteer

        // 1. "quais sao os governadores de sao paulo" seguido por "e do acre"
        val p1 = LocalNlu.parse("quais sao os governadores de sao paulo", gaz)
        assertEquals(Intent.LISTAR_CANDIDATOS, p1.intent)
        assertEquals("GOVERNADOR", p1.cargo)
        assertEquals("SP", p1.uf)

        val p2 = LocalNlu.parse("e do acre", gaz, p1)
        assertEquals(Intent.LISTAR_CANDIDATOS, p2.intent)
        assertEquals("GOVERNADOR", p2.cargo)
        assertEquals("AC", p2.uf)

        // 2. "candidatos a governador de sp" seguido por "e para senador?"
        val p3 = LocalNlu.parse("e para senador?", gaz, p1)
        assertEquals("SENADOR", p3.cargo)
        assertEquals("SP", p3.uf)

        // 3. "quem disputa a presidencia?" seguido por "e os vices?"
        val pres1 = LocalNlu.parse("quem disputa a presidencia?", gaz)
        assertEquals("PRESIDENTE", pres1.cargo)
        val pres2 = LocalNlu.parse("e os vices?", gaz, pres1)
        assertEquals("PRESIDENTE", pres2.cargo)
        assertTrue(pres2.vice)

        // 4. "candidatos a governador do pt em sp" seguido por "e do pl?"
        val pt1 = LocalNlu.parse("candidatos a governador do pt em sp", gaz)
        assertEquals("PT", pt1.partido)
        val pl2 = LocalNlu.parse("e do pl?", gaz, pt1)
        assertEquals("GOVERNADOR", pl2.cargo)
        assertEquals("SP", pl2.uf)
        assertEquals("PL", pl2.partido)

        // 5. "quantos candidatos tem em sp?" seguido por "e no acre?"
        val count1 = LocalNlu.parse("quantos candidatos tem em sp?", gaz)
        assertEquals(Intent.CONTAR, count1.intent)
        val count2 = LocalNlu.parse("e no acre?", gaz, count1)
        assertEquals(Intent.CONTAR, count2.intent)
        assertEquals("AC", count2.uf)

        // 6. Pergunta independente NÃO herda contexto
        val indep = LocalNlu.parse("onde eu voto?", gaz, p1)
        assertEquals(Intent.LOCAL_VOTACAO, indep.intent)
        assertNull(indep.cargo)
        assertNull(indep.uf)
    }

    @Test
    fun engineLocalMantemContextoConversacional() = runBlocking {
        val engine = LocalOfficialAiEngine(
            dados = { TestData.dados },
            ufPadrao = { null }
        )

        // 1ª pergunta: governadores de são paulo
        val r1 = engine.parseUserQuery("quais sao os governadores de sao paulo")
        assertTrue(r1.resolvida)
        assertEquals("GOVERNADOR", r1.filters.cargo)
        assertEquals("SP", r1.filters.estadoUf)

        // 2ª pergunta: "e do acre"
        val r2 = engine.parseUserQuery("e do acre")
        assertTrue(r2.resolvida)
        assertEquals("GOVERNADOR", r2.filters.cargo)
        assertEquals("AC", r2.filters.estadoUf)
        assertTrue(r2.directAnswer?.contains("Governador no Acre") == true || r2.directAnswer?.contains("Acre") == true)

        // Limpar contexto
        engine.limparContexto()

        // 3ª pergunta: "e do acre" após limpar contexto não tem mais cargo de governador
        val r3 = engine.parseUserQuery("e do acre")
        assertNull(r3.filters.cargo)
        assertEquals("AC", r3.filters.estadoUf)
    }

    @Test
    fun noRioEDoRioValemRioDeJaneiroOsOutrosRioNao() {
        val gaz = TestData.gazetteer
        for (q in listOf("quem ganhou para governador no rio?", "candidatos a governador do rio", "resultado no Rio", "senadores pelo rio")) {
            assertEquals(q, "RJ", LocalNlu.parse(q, gaz).uf)
        }
        assertEquals("RS", LocalNlu.parse("governador do rio grande do sul", gaz).uf)
        assertEquals("RN", LocalNlu.parse("candidatos no rio grande do norte", gaz).uf)
        assertEquals("RJ", LocalNlu.parse("governador do rio de janeiro", gaz).uf)
        for (q in listOf("prefeito do rio branco", "poluição do rio doce", "rio")) assertNull(q, LocalNlu.parse(q, gaz).uf)
    }
}
