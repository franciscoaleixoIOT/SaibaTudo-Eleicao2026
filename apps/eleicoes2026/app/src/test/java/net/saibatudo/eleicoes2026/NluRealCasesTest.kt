package net.saibatudo.eleicoes2026

import com.google.gson.JsonParser
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Perguntas REAIS revisadas por uma pessoa (contracts/nlu_real_cases.json): o NLU local do Android também deve entendê-las, como o site
 * (web/test/real-cases.test.mjs). Uma pergunta real que o app não entendia entra no contrato e esta suíte fica vermelha até alguém ensinar a
 * regra no site (nlu.js) E no Android (LocalNlu.kt). Enquanto isso o caso pode levar `"lacuna": true` (lacuna conhecida): não derruba o CI e
 * aparece no relatório de lacunas; a marca DEVE sair quando o NLU passar a entender (marca esquecida também falha).
 */
class NluRealCasesTest {
    private val casos = JsonParser.parseString(File("../contracts/nlu_real_cases.json").readText()).asJsonObject.getAsJsonArray("cases")

    @Test
    fun contratoSoTemCasosRevisadosEComChavesConhecidas() {
        val conhecidas = setOf(
            "q", "intent", "cargo", "uf", "partido", "nome", "tema", "apenasDeferidas", "apenasIndeferidas", "historico", "turno",
            "numero", "genero", "vice", "origem", "revisor", "revisadoEm", "lacuna"
        )
        val golden = JsonParser.parseString(File("../contracts/nlu_golden_cases.json").readText()).asJsonObject.getAsJsonArray("cases")
            .map { it.asJsonObject.get("q").asString.trim().lowercase() }.toSet()
        val vistas = mutableSetOf<String>()
        for (el in casos) {
            val c = el.asJsonObject
            val q = c.get("q").asString
            assertTrue("$q: chave inesperada", c.keySet().all { it in conhecidas })
            assertTrue("$q: caso sem revisor/data (só entra o que uma pessoa revisou)", c.has("revisor") && c.has("revisadoEm"))
            assertTrue("$q: já está no contrato golden", q.trim().lowercase() !in golden)
            assertTrue("$q: repetida", vistas.add(q.trim().lowercase()))
        }
    }

    @Test
    fun nluLocalEntendeTodasAsPerguntasReaisExcetoLacunasConhecidas() {
        val novas = mutableListOf<String>()
        val marcaEsquecida = mutableListOf<String>()
        for (el in casos) {
            val c = el.asJsonObject
            val falhas = ContratoNlu.falhasDoCaso(c)
            val lacuna = c.has("lacuna") && c.get("lacuna").asBoolean
            if (falhas.isNotEmpty() && !lacuna) novas += "\"${c.get("q").asString}\": ${falhas.joinToString("; ")}"
            if (falhas.isEmpty() && lacuna) marcaEsquecida += "\"${c.get("q").asString}\""
        }
        assertTrue("Perguntas reais que o NLU local NÃO entende (ensine a regra no site e no Android, ou marque \"lacuna\": true):\n" + novas.joinToString("\n"), novas.isEmpty())
        assertTrue("O NLU já entende; remova \"lacuna\": true de:\n" + marcaEsquecida.joinToString("\n"), marcaEsquecida.isEmpty())
    }
}
