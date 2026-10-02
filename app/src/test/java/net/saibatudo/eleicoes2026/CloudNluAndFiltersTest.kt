package net.saibatudo.eleicoes2026

import com.google.gson.JsonParser
import kotlinx.coroutines.runBlocking
import net.saibatudo.eleicoes2026.ai.engine.HybridAiInferenceEngine
import net.saibatudo.eleicoes2026.ai.engine.LocalOfficialAiEngine
import net.saibatudo.eleicoes2026.ai.model.Intent
import net.saibatudo.eleicoes2026.ai.model.OrigemResposta
import net.saibatudo.eleicoes2026.ai.nlu.CloudNluClient
import net.saibatudo.eleicoes2026.ai.nlu.NluValidator
import net.saibatudo.eleicoes2026.domain.model.ElectoralFilter
import net.saibatudo.eleicoes2026.domain.model.HistoricoOpcao
import net.saibatudo.eleicoes2026.domain.usecase.CandidateQuery
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CloudNluAndFiltersTest {

    private fun json(s: String) = JsonParser.parseString(s).asJsonObject

    // ------------------------------------------------------------------ validação da saída da nuvem

    @Test
    fun validadorAceitaEntidadesDoVocabularioEDescartaAlucinacoes() {
        val ok = NluValidator.validar(
            json("""{"intent":"LISTAR_CANDIDATOS","cargo":"governador","uf":"sp","partido":"pt"}"""),
            TestData.gazetteer, "x"
        )!!
        assertEquals("GOVERNADOR", ok.cargo)
        assertEquals("SP", ok.uf)
        assertEquals("PT", ok.partido)

        // cargo/UF/partido inventados são descartados; sem entidade, a listagem não é confiável
        val ruim = NluValidator.validar(json("""{"intent":"LISTAR_CANDIDATOS","cargo":"IMPERADOR","uf":"XX","partido":"PARTIDO_FANTASMA"}"""), TestData.gazetteer, "x")
        assertNull(ruim)
    }

    @Test
    fun validadorExigeNomeExistenteNosDadosOficiais() {
        val inexistente = NluValidator.validar(json("""{"intent":"PERFIL_CANDIDATO","nome":"Fulano Inexistente da Silva"}"""), TestData.gazetteer, "x")
        assertNull(inexistente)
        val existente = NluValidator.validar(json("""{"intent":"PERFIL_CANDIDATO","nome":"Lula"}"""), TestData.gazetteer, "x")
        assertNotNull(existente)
        assertEquals(Intent.PERFIL_CANDIDATO, existente!!.intent)
    }

    @Test
    fun validadorRejeitaIntencaoDesconhecidaOuInvalida() {
        assertNull(NluValidator.validar(json("""{"intent":"DESCONHECIDA"}"""), TestData.gazetteer, "x"))
        assertNull(NluValidator.validar(json("""{"intent":"HACKEAR"}"""), TestData.gazetteer, "x"))
        assertNull(NluValidator.validar(json("""{"cargo":"SENADOR"}"""), TestData.gazetteer, "x"))
    }

    // ------------------------------------------------------------------ motor híbrido (local primeiro, nuvem como apoio)

    private fun motor(server: MockWebServer, nuvemLigada: Boolean): HybridAiInferenceEngine {
        val local = LocalOfficialAiEngine(dados = { TestData.dados }, hoje = { "2026-10-01" })
        val cliente = CloudNluClient(OkHttpClient(), server.url("/api/nlu").toString())
        return HybridAiInferenceEngine(local, cliente, { nuvemLigada }, { "iid-teste" }, timeoutMs = 3000)
    }

    @Test
    fun perguntaEntendidaLocalmenteNuncaVaiAaNuvem() = runBlocking {
        val server = MockWebServer().apply { start() }
        val r = motor(server, nuvemLigada = true).parseUserQuery("Quem disputa a Presidência?")
        assertEquals(OrigemResposta.LOCAL, r.origem)
        assertEquals(0, server.requestCount)
        server.shutdown()
    }

    @Test
    fun perguntaNaoEntendidaUsaNuvemSomenteComConsentimento() = runBlocking {
        val server = MockWebServer().apply { start() }
        server.enqueue(MockResponse().setBody("""{"ok":true,"nlu":{"intent":"LISTAR_CANDIDATOS","cargo":"GOVERNADOR","uf":"RJ"}}"""))
        val sem = motor(server, nuvemLigada = false).parseUserQuery("asdkjh qwerty")
        assertFalse(sem.resolvida)
        assertEquals(0, server.requestCount)

        val com = motor(server, nuvemLigada = true).parseUserQuery("asdkjh qwerty")
        assertEquals(1, server.requestCount)
        assertEquals(OrigemResposta.NUVEM, com.origem)
        assertTrue(com.resolvida)
        assertEquals("RJ", com.filters.estadoUf)
        // a resposta factual vem dos dados locais (ex.: contagem real de governadores do RJ), não do modelo
        assertTrue(com.directAnswer!!.contains("candidaturas na urna") || com.directAnswer!!.contains("candidatura na urna"))
        val req = server.takeRequest()
        assertTrue(req.body.readUtf8().contains("\"iid\":\"iid-teste\""))
        server.shutdown()
    }

    @Test
    fun botaoPerguntarANuvemEnviaSoAquelaPerguntaMesmoComModoAutomaticoDesligado() = runBlocking {
        val server = MockWebServer().apply { start() }
        server.enqueue(MockResponse().setBody("""{"ok":true,"nlu":{"intent":"LISTAR_CANDIDATOS","cargo":"SENADOR","uf":"MG"}}"""))
        val m = motor(server, nuvemLigada = false)
        assertFalse(m.parseUserQuery("mostra os canditatos a senadr de mnas").resolvida)
        assertEquals(0, server.requestCount)                       // automático desligado: nada foi enviado
        val r = m.perguntarNaNuvem("mostra os canditatos a senadr de mnas")!!   // toque no botão = consentimento só desta pergunta
        assertEquals(1, server.requestCount)
        assertEquals(OrigemResposta.NUVEM, r.origem)
        assertEquals("SENADOR", r.filters.cargo)
        assertEquals("MG", r.filters.estadoUf)
        assertTrue(server.takeRequest().body.readUtf8().contains("canditatos a senadr"))
        server.shutdown()
    }

    @Test
    fun botaoPerguntarANuvemSemAjudaDevolveNulo() = runBlocking {
        val server = MockWebServer().apply { start() }
        server.enqueue(MockResponse().setResponseCode(503).setBody("""{"ok":false,"error":"disabled"}"""))
        server.enqueue(MockResponse().setBody("""{"ok":true,"nlu":{"intent":"DESCONHECIDA"}}"""))
        server.enqueue(MockResponse().setBody("""{"ok":true,"nlu":{"intent":"PERFIL_CANDIDATO","nome":"Fulano Inexistente"}}"""))
        val m = motor(server, nuvemLigada = false)
        assertNull(m.perguntarNaNuvem("asdkjh qwerty"))   // 503 (nuvem desligada no servidor)
        assertNull(m.perguntarNaNuvem("asdkjh qwerty"))   // a nuvem também não entendeu
        assertNull(m.perguntarNaNuvem("asdkjh qwerty"))   // nome que não existe nos dados oficiais é descartado
        server.shutdown()
    }

    @Test
    fun falhasDaNuvemCaemParaRespostaLocal() = runBlocking {
        val server = MockWebServer().apply { start() }
        server.enqueue(MockResponse().setResponseCode(503))
        val r1 = motor(server, true).parseUserQuery("asdkjh qwerty")
        assertEquals(OrigemResposta.LOCAL, r1.origem)
        assertFalse(r1.resolvida)

        server.enqueue(MockResponse().setBody("isto não é json"))
        assertEquals(OrigemResposta.LOCAL, motor(server, true).parseUserQuery("asdkjh qwerty").origem)

        // nuvem "alucina" um candidato inexistente: descartado
        server.enqueue(MockResponse().setBody("""{"ok":true,"nlu":{"intent":"PERFIL_CANDIDATO","nome":"Nome Que Nao Existe"}}"""))
        assertEquals(OrigemResposta.LOCAL, motor(server, true).parseUserQuery("asdkjh qwerty").origem)
        server.shutdown()
    }

    // ------------------------------------------------------------------ filtros

    @Test
    fun filtroPorUfIncluiNacionaisEOrdemEFixa() {
        val d = TestData.dados.candidatos
        val sp = CandidateQuery.filtrar(d, ElectoralFilter(estadoUf = "SP", apenasNaUrna = true))
        assertTrue(sp.any { it.estadoUf == "BR" })
        assertTrue(sp.all { it.estadoUf == "SP" || it.estadoUf == "BR" })
        // presidente antes de governador, antes de deputado (ordem fixa por cargo)
        val ordem = sp.map { it.cargoCodigo }
        assertTrue(ordem.indexOf("PRESIDENTE") < ordem.indexOf("GOVERNADOR"))
        assertTrue(ordem.indexOf("GOVERNADOR") < ordem.indexOf("DEPUTADO_FEDERAL"))
        // mesma chamada, mesmo resultado (determinismo)
        assertEquals(sp.map { it.id }, CandidateQuery.filtrar(d, ElectoralFilter(estadoUf = "SP", apenasNaUrna = true)).map { it.id })
    }

    @Test
    fun filtrosDeSituacaoEHistorico() {
        val d = TestData.dados.candidatos
        val deferidas = CandidateQuery.filtrar(d, ElectoralFilter(apenasDeferidas = true, apenasNaUrna = false))
        assertTrue(deferidas.all { it.elegibilidade.apta == true })
        val estreantes = CandidateQuery.filtrar(d, ElectoralFilter(historico = HistoricoOpcao.NUNCA_ELEITO))
        assertTrue(estreantes.all { it.vezesEleito == 0 })
        val comTema = CandidateQuery.filtrar(d, ElectoralFilter(tema = "saude"))
        assertTrue(comTema.isNotEmpty() && comTema.all { "saude" in it.temasPlano })
        val busca = CandidateQuery.filtrar(d, ElectoralFilter(buscaTexto = "tarcísio"))
        assertTrue(busca.any { it.nomeUrna.contains("TARC") })
    }
}
