package net.saibatudo.eleicoes2026

import com.google.gson.JsonParser
import net.saibatudo.eleicoes2026.ai.nlu.LocalNlu
import net.saibatudo.eleicoes2026.domain.model.Texto
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
        val falhas = mutableListOf<String>()
        for (el in casos) {
            val c = el.asJsonObject
            val q = c.get("q").asString
            val r = LocalNlu.parse(q, TestData.gazetteer)
            fun checar(chave: String, atual: Any?) {
                if (!c.has(chave)) return
                val esperado = c.get(chave)
                val ok = if (esperado.isJsonNull) atual == null else when {
                    esperado.asJsonPrimitive.isBoolean -> atual == esperado.asBoolean
                    esperado.asJsonPrimitive.isNumber -> atual == esperado.asInt
                    else -> {
                        val e = esperado.asString
                        (atual?.toString() ?: "").let { a -> if (chave == "nome") Texto.normalizar(a) == Texto.normalizar(e) else a == e }
                    }
                }
                if (!ok) falhas += "\"$q\": $chave esperado=$esperado atual=$atual"
            }
            checar("intent", r.intent.name)
            checar("cargo", r.cargo)
            checar("uf", r.uf)
            checar("partido", r.partido)
            checar("nome", r.nome)
            checar("tema", r.tema)
            checar("apenasDeferidas", r.apenasDeferidas)
            checar("historico", r.historico?.name)
            checar("turno", r.turno)
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
