package net.saibatudo.eleicoes2026

import com.google.gson.JsonParser
import kotlinx.coroutines.runBlocking
import net.saibatudo.eleicoes2026.ai.engine.LocalOfficialAiEngine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Paridade das RESPOSTAS com o site: contracts/answers_parity.json (gerado por web/tools/gerar_paridade.mjs) traz o texto que o site monta para perguntas que
 * não dependem de candidatos. O Android tem de produzir exatamente o mesmo (espaços colapsados). Se um texto mudar de propósito: altere os DOIS AnswerBuilders
 * (answers.js e AnswerBuilder.kt) e regere o contrato (`node web/tools/gerar_paridade.mjs`).
 */
class AnswersParityTest {
    private val casos = JsonParser.parseString(File("../contracts/answers_parity.json").readText()).asJsonObject.getAsJsonArray("cases")

    private fun normalizar(s: String?) = (s ?: "").replace(Regex("\\s+"), " ").trim()

    @Test
    fun androidMontaOsMesmosTextosQueOSite() = runBlocking {
        assertTrue("contrato de paridade vazio", casos.size() >= 40)
        val divergencias = mutableListOf<String>()
        for (el in casos) {
            val c = el.asJsonObject
            val q = c.get("q").asString
            val motor = LocalOfficialAiEngine(dados = { TestData.dados }, hoje = { c.get("hoje").asString })
            val r = motor.parseUserQuery(q)
            if (r.intent.name != c.get("intent").asString) divergencias += "\"$q\": intenção esperada=${c.get("intent").asString} atual=${r.intent.name}"
            if (r.resolvida != c.get("resolvida").asBoolean) divergencias += "\"$q\": resolvida esperada=${c.get("resolvida").asBoolean} atual=${r.resolvida}"
            val esperado = c.get("texto").asString
            val atual = normalizar(r.directAnswer)
            if (atual != esperado) {
                val i = (0 until minOf(esperado.length, atual.length)).firstOrNull { esperado[it] != atual[it] } ?: minOf(esperado.length, atual.length)
                divergencias += "\"$q\": texto diverge a partir do caractere $i\n    site:    …${esperado.substring(maxOf(0, i - 20), minOf(esperado.length, i + 60))}\n    android: …${atual.substring(maxOf(0, i - 20), minOf(atual.length, i + 60))}"
            }
        }
        assertTrue("${divergencias.size} resposta(s) diferem do site:\n" + divergencias.joinToString("\n"), divergencias.isEmpty())
        assertEquals(true, casos.size() > 0)
    }
}
