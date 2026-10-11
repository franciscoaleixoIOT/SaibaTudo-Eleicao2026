package net.saibatudo.eleicoes2026

import kotlinx.coroutines.runBlocking
import net.saibatudo.eleicoes2026.data.datasource.ResultadosTseConfig
import net.saibatudo.eleicoes2026.data.live.TseApuracaoClient
import net.saibatudo.eleicoes2026.data.live.TseApuracaoParser
import net.saibatudo.eleicoes2026.domain.model.Datas
import net.saibatudo.eleicoes2026.domain.model.FaseEleitoral
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LiveResultsAndPhaseTest {

    private val amostra: String by lazy {
        javaClass.getResourceAsStream("/tse_apuracao_presidente.json")!!.bufferedReader().readText()
    }

    @Test
    fun parserLeApuracaoDoTseExatamenteComoPublicada() {
        val ap = TseApuracaoParser.parse(amostra, "PRESIDENTE", "BR", 1)!!
        assertEquals(3, ap.linhas.size)
        assertEquals("04/10/2026 19:45:10", ap.geradoEm)
        assertEquals("50,00", ap.secoesTotalizadasPct)
        assertFalse(ap.totalizacaoFinal)
        assertTrue(ap.temVotos)
        val lula = ap.linhas.first { it.numero == "13" }
        assertEquals(1_234_567L, lula.votos)
        assertEquals("46,10", lula.percentual)
        assertEquals("280002542548", lula.sqCandidato)
    }

    @Test
    fun parserRejeitaJsonInvalido() {
        assertNull(TseApuracaoParser.parse("{nao-json", "PRESIDENTE", "BR", 1))
        assertNull(TseApuracaoParser.parse("{\"carg\":[]}", "PRESIDENTE", "BR", 1))
    }

    @Test
    fun clienteMontaUrlOficialUsaCacheNegativoENaoRepeteErros() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody(amostra).setHeader("ETag", "\"abc\""))
        server.enqueue(MockResponse().setResponseCode(404))
        server.start()
        var agora = 1_000_000L
        val cfg = ResultadosTseConfig(server.url("/oficial/ele2026").toString().trimEnd('/'), 6257, 6258, 6259, 6260,
            mapOf("PRESIDENTE" to 1, "GOVERNADOR" to 3))
        val cliente = TseApuracaoClient(OkHttpClient(), { cfg }, { agora })

        val a = cliente.obter("PRESIDENTE", "BR", 1)!!
        assertEquals(3, a.linhas.size)
        assertEquals("/oficial/ele2026/6257/dados/br/br-c0001-e006257-u.json", server.takeRequest().path)

        // dentro do TTL: sem nova requisição
        agora += 30_000
        cliente.obter("PRESIDENTE", "BR", 1)
        assertEquals(1, server.requestCount)

        // governador de SP: 404 => null e cache negativo (não repete por 5 min)
        assertNull(cliente.obter("GOVERNADOR", "SP", 1))
        assertEquals("/oficial/ele2026/6259/dados/sp/sp-c0003-e006259-u.json", server.takeRequest().path)
        agora += 60_000
        assertNull(cliente.obter("GOVERNADOR", "SP", 1))
        assertEquals(2, server.requestCount)
        server.shutdown()
    }

    @Test
    fun faseEleitoralAcompanhaCalendario() {
        val t1 = "2026-10-04"
        val t2 = "2026-10-25"
        assertEquals(FaseEleitoral.PRE_ELEICAO, FaseEleitoral.de("2026-10-03", t1, t2))
        assertEquals(FaseEleitoral.DIA_1T, FaseEleitoral.de("2026-10-04", t1, t2))
        assertEquals(FaseEleitoral.ENTRE_TURNOS, FaseEleitoral.de("2026-10-05", t1, t2))
        assertEquals(FaseEleitoral.ENTRE_TURNOS, FaseEleitoral.de("2026-10-24", t1, t2))
        assertEquals(FaseEleitoral.DIA_2T, FaseEleitoral.de("2026-10-25", t1, t2))
        assertEquals(FaseEleitoral.POS_ELEICAO, FaseEleitoral.de("2026-10-26", t1, t2))
        assertFalse(FaseEleitoral.PRE_ELEICAO.mostraResultados)
        assertTrue(FaseEleitoral.POS_ELEICAO.mostraResultados)
    }

    @Test
    fun datasEmBrasiliaEDiferencaDeDias() {
        // 2026-10-04 02:30 UTC ainda é 03/10 em Brasília (UTC-3)
        assertEquals("2026-10-03", Datas.hojeBrasilia(java.time.Instant.parse("2026-10-04T02:30:00Z").toEpochMilli()))
        assertEquals("2026-10-04", Datas.hojeBrasilia(java.time.Instant.parse("2026-10-04T03:00:00Z").toEpochMilli()))
        assertEquals(3, Datas.diasEntre("2026-10-01", "2026-10-04"))
        assertEquals(31, Datas.diasEntre("2026-10-25", "2026-11-25"))
        assertEquals(366, Datas.diasEntre("2027-02-28", "2028-02-29"))
    }

    // ---- JSON REAL do 1º turno (05/10/2026): o TSE envia "e":"s" para os dois classificados ao 2º turno, com st = "2º turno" ----
    private val real1t: String by lazy {
        javaClass.getResourceAsStream("/tse_apuracao_presidente_1t_final.json")!!.bufferedReader().readText()
    }

    @Test
    fun apuracaoRealDoPrimeiroTurnoQuemVaiAoSegundoTurnoNaoEEleito() {
        assertEquals("a amostra precisa reproduzir o caso: dois candidatos com \"e\":\"s\"", 2, Regex("\"e\"\\s*:\\s*\"s\"").findAll(real1t).count())
        val ap = TseApuracaoParser.parse(real1t, "PRESIDENTE", "BR", 1)!!
        assertTrue(ap.totalizacaoFinal)
        assertEquals("ninguém foi eleito no 1º turno", 0, ap.linhas.count { it.eleito })
        val classificados = ap.linhas.filter { it.segundoTurno }
        assertEquals(listOf("13", "22"), classificados.map { it.numero }.sorted())
        assertTrue(classificados.all { it.situacao == "2º turno" })
        assertTrue(ap.linhas.filter { !it.segundoTurno }.all { it.situacao == "Não eleito" && !it.eleito })
    }

    @Test
    fun situacaoEleitoContinuaValendoESemOCampoStValeOE() {
        val json = """{"dg":"05/10/2026","hg":"10:00:00","tf":"s","s":{"pst":"100,00"},"carg":[{"agr":[{"par":[{"sg":"X","cand":[
            {"n":"10","nmu":"A","e":"s","st":"Eleito","vap":"60","pvap":"60,00"},
            {"n":"20","nmu":"B","e":"n","st":"Não eleito","vap":"40","pvap":"40,00"},
            {"n":"30","nmu":"C","e":"s","vap":"0","pvap":"0,00"}]}]}]}]}"""
        val ap = TseApuracaoParser.parse(json, "GOVERNADOR", "SP", 1)!!
        assertEquals(listOf(Triple("10", true, false), Triple("20", false, false), Triple("30", true, false)), ap.linhas.map { Triple(it.numero, it.eleito, it.segundoTurno) })
    }
}
