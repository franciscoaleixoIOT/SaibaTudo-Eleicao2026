package net.saibatudo.eleicoes2026

import com.google.gson.JsonParser
import net.saibatudo.eleicoes2026.ai.model.Intent
import net.saibatudo.eleicoes2026.ai.nlu.Gazetteer
import net.saibatudo.eleicoes2026.ai.nlu.LocalNlu
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * "quem é o candidato a deputado CABO MACIEL": o NLU local tem de achar o candidato mesmo com "candidato a CARGO" na frase e com nomes que
 * contêm palavras de outras regras. Contrato compartilhado com o site (contracts/nlu_nome_cases.json, web/test/nlu-nome.test.mjs).
 */
class NomeCandidatoTest {

    @Test
    fun contratoDeNomesIntencaoENomeDeTodosOsCasosInclusiveAsListagens() {
        val casos = JsonParser.parseString(File("../contracts/nlu_nome_cases.json").readText()).asJsonObject.getAsJsonArray("cases")
        assertTrue(casos.size() >= 30)
        val falhas = casos.map { it.asJsonObject }.mapNotNull { c ->
            val q = c.get("q").asString
            val p = LocalNlu.parse(q, TestData.gazetteer)
            val intent = c.get("intent").asString
            val nome = c.get("nome").takeIf { !it.isJsonNull }?.asString
            when {
                p.intent.name != intent -> "$q: intenção ${p.intent}, esperada $intent"
                p.nome != nome -> "$q: nome ${p.nome}, esperado $nome"
                else -> null
            }
        }
        assertEquals(emptyList<String>(), falhas)
    }

    @Test
    fun buscaDeNomeIgnoraAPontuacao() {
        val gaz = TestData.gazetteer
        assertEquals("prof roger", Gazetteer.semPontuacao("prof. roger"))
        assertEquals("dr luisinho", Gazetteer.semPontuacao("dr.luisinho"))
        assertTrue(gaz.buscarPorNome("prof roger").any { it.nomeUrna == "PROF. ROGER" })
        assertTrue(gaz.buscarPorNome("dr luisinho").any { it.nomeUrna == "DR.LUISINHO" })
        assertTrue("digitado com ponto também acha", gaz.buscarPorNome("dr. luisinho").any { it.nomeUrna == "DR.LUISINHO" })
        // a busca manual da interface usa chaveBusca (com pontuação) e não muda
        assertTrue(gaz.buscarPorNome("prof roger").first().chaveBusca.contains("prof. roger"))
    }

    @Test
    fun nomeCompletoDentroDaFraseSaiDoTextoAntesDaIntencao() {
        val gaz = TestData.gazetteer
        val achado = LocalNlu.acharNomeExato("quem e maria gato", gaz)
        assertNotNull(achado)
        assertEquals("maria gato", achado!!.termo)
        assertEquals("quem e", achado.resto)
        assertNull(LocalNlu.acharNomeExato("candidatos a governador em sp", gaz))
        assertNull(LocalNlu.acharNomeExato("voto em branco e voto nulo", gaz))
        val p = LocalNlu.parse("quem é Nai da Bahia", gaz)
        assertEquals(Intent.PERFIL_CANDIDATO, p.intent)
        assertNull("a UF do nome não vira filtro", p.uf)
        val f = LocalNlu.parse("maria gato é ficha limpa?", gaz)
        assertEquals(Intent.ELEGIBILIDADE, f.intent)
        assertEquals("maria gato", f.nome)
    }

    @Test
    fun perguntasQueJaFuncionavamContinuamIguais() {
        val gaz = TestData.gazetteer
        assertEquals(Intent.LISTAR_CANDIDATOS, LocalNlu.parse("candidatos a governador do PT em SP", gaz).intent)
        assertEquals(Intent.CONTAR, LocalNlu.parse("quantos candidatos a governador em SP", gaz).intent)
        assertEquals(Intent.RESULTADOS, LocalNlu.parse("Quem foi eleito governador em SP?", gaz).intent)
        for (q in listOf("quem vai pro segundo turno?", "haverá 2º turno para presidente?")) assertFalse(q, LocalNlu.parse(q, gaz).intent == Intent.PERFIL_CANDIDATO)
        assertEquals("13", LocalNlu.parse("quem é o 13?", gaz).numero)
    }
}
