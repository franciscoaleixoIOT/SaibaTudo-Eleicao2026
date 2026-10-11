package net.saibatudo.quimica

import com.google.gson.JsonParser
import kotlinx.coroutines.runBlocking
import net.saibatudo.quimica.ai.nlu.Dicionario
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File

/**
 * Casos de referência compartilhados com o site (contracts/nlu_golden_cases.json): garantem que Android e Web interpretam as
 * perguntas da mesma forma. Com o pacote real (data/quimica) todos os casos valem; com o fixture de testes valem só os casos
 * cujas entidades existem nele.
 */
class NluGoldenCasesTest {

    private val arquivo = File(TestData.contratos, "nlu_golden_cases.json")

    @Test
    fun todosOsCasosDeReferencia() {
        assumeTrue("contracts/nlu_golden_cases.json ainda não existe", arquivo.isFile)
        val d = runBlocking { Dicionario.criar(TestData.Melhor.pacote) }
        val casos = JsonParser.parseString(arquivo.readText()).asJsonObject.getAsJsonArray("cases")
        val usandoReal = TestData.Real != null
        val validos = casos.map { it.asJsonObject }.filter { usandoReal || ContratoNlu.elegivel(it, d) }
        val falhas = validos.flatMap { c -> ContratoNlu.falhasDoCaso(c, d).map { "\"${c.get("q").asString}\": $it" } }
        println("NLU golden: ${validos.size} de ${casos.size()} casos verificados (${if (usandoReal) "pacote real" else "fixture"}); falhas: ${falhas.size}")
        assertTrue("Falhas de NLU (${falhas.size}):\n" + falhas.joinToString("\n"), falhas.isEmpty())
        assertTrue("casos esperados", validos.size >= if (usandoReal) 90 else 50)
    }
}
