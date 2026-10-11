package net.saibatudo.eleicoes2026

import kotlinx.coroutines.runBlocking
import net.saibatudo.eleicoes2026.ai.engine.HybridAiInferenceEngine
import net.saibatudo.eleicoes2026.ai.engine.LocalOfficialAiEngine
import net.saibatudo.eleicoes2026.ai.model.AiMenuResponse
import net.saibatudo.eleicoes2026.ai.model.Intent
import net.saibatudo.eleicoes2026.ai.model.OrigemResposta
import net.saibatudo.eleicoes2026.ai.nlu.CloudAskClient
import net.saibatudo.eleicoes2026.ai.nlu.CloudNluClient
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.QueueDispatcher
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Caminho GENERATIVO do motor híbrido (texto gerado por modelo, /api/ask): só existe se o pacote assinado o liga (cliente.ask.enabled),
 * nunca para pedidos de recomendação, sempre rotulado como texto gerado, e qualquer falha cai de volta sem derrubar a resposta local.
 * O servidor também barra (422), mas o app não deve nem gastar a ida de rede.
 */
class HybridAskTest {

    private class Cenario(askLigado: Boolean) {
        // sem resposta enfileirada o MockWebServer BLOQUEIA a conexão (timeout de 10 s): o padrão aqui é falhar rápido com 503
        private fun rapido() = MockWebServer().apply {
            (dispatcher as QueueDispatcher).setFailFast(MockResponse().setResponseCode(503).setBody("""{"ok":false,"error":"disabled"}"""))
            start()
        }
        val ask = rapido()
        val nlu = rapido()
        val motor = HybridAiInferenceEngine(
            local = LocalOfficialAiEngine(dados = { TestData.dados }, hoje = { "2026-10-01" }),
            nuvem = CloudNluClient(OkHttpClient(), nlu.url("/api/nlu").toString()),
            nuvemHabilitada = { true },
            idInstalacao = { "iid-teste" },
            askClient = CloudAskClient(OkHttpClient(), ask.url("/api/ask").toString()),
            askLigado = { askLigado },
            timeoutMs = 3000,
            timeoutExplicitoMs = 3000
        )

        fun enfileirarAsk(corpo: String, codigo: Int = 200) = ask.enqueue(MockResponse().setResponseCode(codigo).setBody(corpo))
        fun fechar() { ask.shutdown(); nlu.shutdown() }
    }

    private fun resolvida(c: Cenario, pergunta: String): AiMenuResponse = runBlocking { c.motor.parseUserQuery(pergunta) }

    @Test
    fun comOAskDesligadoNoPacoteNuncaVaiAoServidorGenerativo() = runBlocking {
        val c = Cenario(askLigado = false)
        try {
            val local = resolvida(c, "Quem disputa a Presidência?")
            assertTrue(local.resolvida)
            val r = c.motor.perguntarNaNuvem("Quem disputa a Presidência?", local)
            assertNull("sem ask e sem NLU na nuvem enfileirado, nada é devolvido", r)
            assertEquals("o servidor generativo não recebeu nenhuma requisição", 0, c.ask.requestCount)
        } finally { c.fechar() }
    }

    @Test
    fun comOAskDesligadoOBotaoDepoisDeUmaRespostaCertaPedeSegundaInterpretacaoSemChamarOGenerativo() = runBlocking {
        val c = Cenario(askLigado = false)
        try {
            c.nlu.enqueue(MockResponse().setResponseCode(200).setBody("""{"ok":true,"nlu":{"intent":"LISTAR_CANDIDATOS","cargo":"GOVERNADOR","uf":"RJ"}}"""))
            val local = resolvida(c, "Quem disputa a Presidência?")
            assertTrue(local.resolvida)
            val r = c.motor.perguntarNaNuvem("Quem disputa a Presidência?", local)
            assertNotNull("a IA na nuvem reinterpreta mesmo depois de uma resposta local correta", r)
            assertEquals(OrigemResposta.NUVEM, r!!.origem)
            assertEquals("dados oficiais, não texto gerado", 0, c.ask.requestCount)
            assertEquals(1, c.nlu.requestCount)
        } finally { c.fechar() }
    }

    @Test
    fun aNuvemSegueAConversaOContextoDasPerguntasAnterioresVaiNoAparelhoENaoParaOServidor() = runBlocking {
        val c = Cenario(askLigado = false)
        try {
            // a nuvem só viu "e de sp?": devolve a interpretação genérica, sem o cargo da pergunta anterior
            c.nlu.enqueue(MockResponse().setResponseCode(200).setBody("""{"ok":true,"nlu":{"intent":"LISTAR_CANDIDATOS","uf":"SP"}}"""))
            val a = c.motor.parseUserQuery("candidatos a governador do rj")
            assertTrue(a.resolvida)
            val b = c.motor.parseUserQuery("e de sp?")
            assertTrue(b.resolvida)
            assertEquals("GOVERNADOR", b.filters.cargo)
            val r = c.motor.perguntarNaNuvem("e de sp?", b)
            assertNotNull(r)
            assertEquals(OrigemResposta.NUVEM, r!!.origem)
            assertEquals("SP", r.filters.estadoUf)
            assertEquals("a resposta da nuvem também herda o cargo da pergunta anterior", "GOVERNADOR", r.filters.cargo)
            val corpo = c.nlu.takeRequest().body.readUtf8()
            assertTrue("só o texto da pergunta atual é enviado", corpo.contains("e de sp?") && !corpo.contains("rj", ignoreCase = true))
            // a conversa continua a partir da resposta da nuvem
            val d = c.motor.parseUserQuery("e para senador?")
            assertEquals("SENADOR", d.filters.cargo)
            assertEquals("SP", d.filters.estadoUf)
        } finally { c.fechar() }
    }

    @Test
    fun comOAskLigadoDevolveTextoGeradoRotuladoESemTratarComoDadoOficial() = runBlocking {
        val c = Cenario(askLigado = true)
        try {
            c.enfileirarAsk("""{"ok":true,"answer":"Explicação gerada pelo modelo.","model":"Qwen2.5-7B"}""")
            val local = resolvida(c, "Quem disputa a Presidência?")
            val r = c.motor.perguntarNaNuvem("Quem disputa a Presidência?", local)
            assertNotNull(r)
            assertEquals(OrigemResposta.GENERATIVA, r!!.origem)
            assertEquals("Explicação gerada pelo modelo.", r.directAnswer)
            assertEquals(HybridAiInferenceEngine.FONTE_GERADA, r.fonte)
            assertTrue("o rótulo diz que pode conter erros", r.fonte!!.contains("pode conter erros"))
            assertFalse("nunca se apresenta como fundamentada no TSE", r.fonte!!.contains("Fundamentada"))
            assertEquals(1, c.ask.requestCount)
        } finally { c.fechar() }
    }

    @Test
    fun pedidoDeRecomendacaoNuncaChegaAoModeloGenerativo() = runBlocking {
        val c = Cenario(askLigado = true)
        try {
            c.enfileirarAsk("""{"ok":true,"answer":"Vote no candidato X.","model":"m"}""")
            val local = resolvida(c, "Em quem devo votar para presidente?")
            assertEquals(Intent.RECOMENDACAO, local.intent)
            val r = c.motor.perguntarNaNuvem("Em quem devo votar para presidente?", local)
            assertTrue("não é texto gerado", r == null || r.origem != OrigemResposta.GENERATIVA)
            assertEquals("o servidor generativo não foi consultado", 0, c.ask.requestCount)
        } finally { c.fechar() }
    }

    @Test
    fun enviaSoPerguntaContextoVersaoClienteEIidAleatorio() = runBlocking {
        val c = Cenario(askLigado = true)
        try {
            c.enfileirarAsk("""{"ok":true,"answer":"ok","model":"m"}""")
            val local = resolvida(c, "Quem disputa a Presidência?")
            c.motor.perguntarNaNuvem("Quem disputa a Presidência?", local)
            val corpo = c.ask.takeRequest().body.readUtf8()
            val j = com.google.gson.JsonParser.parseString(corpo).asJsonObject
            assertEquals(setOf("q", "context", "v", "client", "iid"), j.keySet())
            assertEquals("android", j.get("client").asString)
            assertEquals("iid-teste", j.get("iid").asString)
            assertTrue("o contexto resume a resposta local (até 3.000 caracteres)", j.get("context").asString.length in 1..3000)
        } finally { c.fechar() }
    }

    @Test
    fun servidorRejeitouOuFalhouNaoDerrubaAResposta() = runBlocking {
        for (codigo in listOf(422, 503, 502)) {
            val c = Cenario(askLigado = true)
            try {
                c.enfileirarAsk("""{"ok":false,"error":"rejected"}""", codigo)
                val local = resolvida(c, "Quem disputa a Presidência?")
                val r = c.motor.perguntarNaNuvem("Quem disputa a Presidência?", local)
                assertTrue("HTTP $codigo: nunca vira texto gerado", r == null || r.origem != OrigemResposta.GENERATIVA)
            } finally { c.fechar() }
        }
    }

    @Test
    fun respostaVaziaOuOkFalsoNaoViraTextoGerado() = runBlocking {
        for (corpo in listOf("""{"ok":true,"answer":"   ","model":"m"}""", """{"ok":false,"answer":"x"}""", "isto nao e json", """{"ok":true}""")) {
            val c = Cenario(askLigado = true)
            try {
                c.enfileirarAsk(corpo)
                val local = resolvida(c, "Quem disputa a Presidência?")
                val r = c.motor.perguntarNaNuvem("Quem disputa a Presidência?", local)
                assertTrue("corpo '$corpo' não pode virar resposta gerada", r == null || r.origem != OrigemResposta.GENERATIVA)
            } finally { c.fechar() }
        }
    }

    @Test
    fun perguntaNaoEntendidaComAskLigadoUsaOGenerativoSoComoUltimoRecurso() = runBlocking {
        val c = Cenario(askLigado = true)
        try {
            c.nlu.enqueue(MockResponse().setResponseCode(503).setBody("""{"ok":false,"error":"disabled"}"""))
            c.enfileirarAsk("""{"ok":true,"answer":"Resposta de último recurso.","model":"m"}""")
            val local = resolvida(c, "asdkjh qwerty zzz")
            assertFalse(local.resolvida)
            val r = c.motor.perguntarNaNuvem("asdkjh qwerty zzz", local)
            assertNotNull(r)
            assertEquals(OrigemResposta.GENERATIVA, r!!.origem)
            // o modo automático (consentido) já tentou o NLU na nuvem ao receber a pergunta, e o pedido explícito tentou de novo antes do generativo
            assertEquals("a interpretação na nuvem foi tentada antes do generativo", 2, c.nlu.requestCount)
        } finally { c.fechar() }
    }

    // ---- "o modelo não entendeu" não é o mesmo que "o serviço está fora" ----
    @Test
    fun motivoDaFalhaSeparaModeloQueNaoEntendeuDeServicoIndisponivel() = runBlocking {
        val c = Cenario(askLigado = false)
        try {
            val local = resolvida(c, "Quem disputa a Presidência?")
            // 1) serviço fora (503 é o padrão do servidor simulado)
            assertNull(c.motor.perguntarNaNuvem("Quem disputa a Presidência?", local))
            assertFalse("503 é indisponibilidade, não 'não entendeu'", c.motor.nuvemNaoEntendeu)
            // 2) o servidor respondeu, mas o modelo devolveu DESCONHECIDA
            c.nlu.enqueue(MockResponse().setResponseCode(200).setBody("""{"ok":true,"nlu":{"intent":"DESCONHECIDA"}}"""))
            assertNull(c.motor.perguntarNaNuvem("Quem disputa a Presidência?", local))
            assertTrue(c.motor.nuvemNaoEntendeu)
            // 3) sucesso limpa o motivo
            c.nlu.enqueue(MockResponse().setResponseCode(200).setBody("""{"ok":true,"nlu":{"intent":"LISTAR_CANDIDATOS","cargo":"GOVERNADOR","uf":"RJ"}}"""))
            assertNotNull(c.motor.perguntarNaNuvem("Quem disputa a Presidência?", local))
            assertFalse(c.motor.nuvemNaoEntendeu)
        } finally { c.fechar() }
    }

    @Test
    fun textosDaFalhaSaoOsMesmosDoSite() {
        assertEquals("A IA na nuvem não encontrou outra forma de entender esta pergunta. A resposta acima continua valendo.", net.saibatudo.eleicoes2026.ui.screens.textoFalhaNuvem(entendida = true, naoEntendeu = true))
        assertEquals("A IA na nuvem está indisponível agora ou demorou demais. A resposta acima continua valendo; tente de novo em instantes.", net.saibatudo.eleicoes2026.ui.screens.textoFalhaNuvem(entendida = true, naoEntendeu = false))
        assertEquals("A IA na nuvem também não entendeu esta pergunta. Tente reformular citando cargo, estado, partido, nome ou número do candidato.", net.saibatudo.eleicoes2026.ui.screens.textoFalhaNuvem(entendida = false, naoEntendeu = true))
        assertEquals("A IA na nuvem está indisponível agora ou demorou demais. Tente de novo em instantes ou reformule citando cargo, estado, partido, nome ou número do candidato.", net.saibatudo.eleicoes2026.ui.screens.textoFalhaNuvem(entendida = false, naoEntendeu = false))
    }

    @Test
    fun contextoDoTextoGeradoNaoCortaNoMeioDaLinhaEAvisaQuandoAListaEstaIncompleta() {
        assertEquals("curto", HybridAiInferenceEngine.resumoParaContexto("curto"))
        val lista = "O TSE registra 40 candidaturas:\n" + (0 until 40).joinToString("\n") { "• ${10 + it} — CANDIDATO NUMERO $it (PARTIDO)" }
        val r = HybridAiInferenceEngine.resumoParaContexto(lista, 600)
        assertTrue(r.length < 800)
        assertTrue(r.startsWith("O TSE registra 40 candidaturas:"))
        assertTrue(r.endsWith("(Texto cortado: a lista acima está INCOMPLETA. Não conte os itens nem informe totais que não estejam escritos.)"))
        val linhas = r.split("\n")
        assertTrue("nenhuma linha cortada pela metade", linhas.drop(1).dropLast(1).all { it.endsWith("(PARTIDO)") })
    }
}
