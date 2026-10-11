package net.saibatudo.eleicoes2026

import com.google.gson.JsonParser
import net.saibatudo.eleicoes2026.ai.nlu.LocalNlu
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Casos de referência compartilhados com o site (contracts/nlu_golden_cases.json): garantem que Android e Web
 * interpretam as perguntas da mesma forma. Chave ausente = não verificada; chave null = deve estar ausente.
 */
class NluGoldenCasesTest {

    @Test
    fun todosOsCasosDeReferencia() {
        val raiz = JsonParser.parseString(File("../contracts/nlu_golden_cases.json").readText()).asJsonObject
        val casos = raiz.getAsJsonArray("cases")
        assertTrue("casos esperados", casos.size() >= 40)
        val falhas = casos.flatMap { el ->
            val c = el.asJsonObject
            ContratoNlu.falhasDoCaso(c).map { "\"${c.get("q").asString}\": $it" }
        }
        assertTrue("Falhas de NLU:\n" + falhas.joinToString("\n"), falhas.isEmpty())
    }

    @Test
    fun perguntaVaziaEDesconhecida() {
        assertEquals("DESCONHECIDA", LocalNlu.parse("   ", TestData.gazetteer).intent.name)
        assertNull(LocalNlu.parse("???", TestData.gazetteer).cargo)
    }

    @Test
    fun entradaGrandeNaoQuebra() {
        val longa = "candidatos a governador ".repeat(500)
        val r = LocalNlu.parse(longa, TestData.gazetteer)
        assertEquals("GOVERNADOR", r.cargo)
    }
}
