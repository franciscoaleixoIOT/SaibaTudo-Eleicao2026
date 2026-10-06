package net.saibatudo.eleicoes2026

import kotlinx.coroutines.runBlocking
import net.saibatudo.eleicoes2026.ai.answer.AnswerBuilder
import net.saibatudo.eleicoes2026.ai.answer.TipoSegundoTurno
import net.saibatudo.eleicoes2026.ai.answer.leituraSegundoTurno
import net.saibatudo.eleicoes2026.ai.model.Intent
import net.saibatudo.eleicoes2026.ai.model.OrigemResposta
import net.saibatudo.eleicoes2026.ai.nlu.LocalNlu
import net.saibatudo.eleicoes2026.data.live.TseApuracaoParser
import net.saibatudo.eleicoes2026.domain.model.ApuracaoCargo
import net.saibatudo.eleicoes2026.domain.model.ApuracaoProvider
import net.saibatudo.eleicoes2026.domain.model.LinhaApuracao
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AnswerBuilderTest {

    private fun responder(
        pergunta: String, hoje: String = "2026-10-01", uf: String? = null, apuracao: ApuracaoProvider? = null
    ) = runBlocking {
        val gaz = TestData.gazetteer
        AnswerBuilder(TestData.dados, gaz, hoje, uf, apuracao, OrigemResposta.LOCAL).construir(LocalNlu.parse(pergunta, gaz))
    }

    @Test
    fun presidenciaveisNaUrnaSaoListadosEPabloMarcalNaoAparece() {
        val r = responder("Quem disputa a Presidência em 2026?")
        val texto = r.directAnswer!!
        assertTrue(texto, texto.contains("13 candidaturas na urna"))
        assertTrue(texto, texto.contains("• 13 — LULA (PT)"))
        assertFalse("candidato com registro indeferido e fora da urna não deve ser listado: $texto", texto.contains("PABLO MARÇAL"))
        assertTrue(texto.contains("fora da urna"))
        assertTrue(r.fonte!!.contains("TSE"))
        assertEquals("PRESIDENTE", r.filters.cargo)
    }

    @Test
    fun perfilMostraSituacaoOficialENuncaFichaLimpaInferida() {
        val r = responder("Quem é Pablo Marçal?")
        val t = r.directAnswer!!
        assertTrue(t, t.contains("Candidatura indeferida"))
        assertTrue(t, t.contains("NÃO está inserida na urna"))
        assertFalse(t.lowercase().contains("ficha limpa sem pend"))
    }

    @Test
    fun pedidoDeRecomendacaoERecusadoComNeutralidade() {
        val r = responder("Em quem devo votar para presidente?")
        assertEquals(Intent.RECOMENDACAO, r.intent)
        assertTrue(r.directAnswer!!.contains("Não indico, recomendo"))
        assertTrue(r.candidateIds.isEmpty())
        assertEquals(OrigemResposta.AVISO, r.origem)
    }

    @Test
    fun resultadosAntesDaEleicaoExplicamQueAVotacaoNaoOcorreu() {
        val r = responder("Quem foi eleito presidente?", hoje = "2026-10-01")
        assertTrue(r.directAnswer!!.contains("ainda não ocorreu"))
    }

    @Test
    fun resultadosAoVivoUsamNumerosDoTseSemAlterar() {
        val ap = ApuracaoProvider { cargo, uf, turno ->
            ApuracaoCargo(
                cargo, uf, turno, "04/10/2026 19:45:10", "50,00", false,
                listOf(
                    LinhaApuracao("280002542548", "13", "LULA", "PT", 1234567, "46,10", false),
                    LinhaApuracao("280002551544", "22", "FLAVIO BOLSONARO", "PL", 1100000, "41,07", false)
                )
            )
        }
        val r = responder("Resultado para presidente", hoje = "2026-10-04", apuracao = ap)
        val t = r.directAnswer!!
        assertTrue(t, t.contains("• 13 — LULA (PT): 1.234.567 votos (46,10%)"))
        assertTrue(t.contains("Apuração em andamento (50,00% das seções totalizadas)"))
        assertTrue(r.abrirResultados)
        assertEquals("280002542548", r.candidateIds.first())
    }

    @Test
    fun calendarioMudaComAFaseEleitoral() {
        assertTrue(responder("Quando é a eleição?", hoje = "2026-10-01").directAnswer!!.contains("daqui a 3 dias"))
        assertTrue(responder("Quando é a eleição?", hoje = "2026-10-04").directAnswer!!.contains("Hoje é o 1º turno"))
        assertTrue(responder("Quando é a eleição?", hoje = "2026-10-10").directAnswer!!.contains("O 1º turno foi em 04/10/2026"))
        assertTrue(responder("Quando é a eleição?", hoje = "2026-11-02").directAnswer!!.contains("As votações ocorreram"))
    }

    @Test
    fun elegibilidadeNaoEmiteCertidaoDeFichaLimpa() {
        val r = responder("O que é ficha limpa?")
        assertTrue(r.directAnswer!!.contains("NÃO emite certidão"))
        assertEquals(true, r.filters.apenasDeferidas)
    }

    @Test
    fun perguntaDesconhecidaFicaNaoResolvidaParaPossivelApoioDaNuvem() {
        val r = responder("asdkjh qwerty")
        assertFalse(r.resolvida)
        assertNotNull(r.suggestedQuestions.firstOrNull())
    }

    @Test
    fun contagemPorCargoEUf() {
        val r = responder("Quantos candidatos a governador em SP?")
        assertTrue(r.directAnswer!!, r.directAnswer!!.contains("sendo"))
        assertEquals("SP", r.filters.estadoUf)
    }

    @Test
    fun meuEstadoValeParaCargosEstaduaisSemUfNaPergunta() {
        val r = responder("Candidatos a governador", uf = "SP")
        assertEquals("SP", r.filters.estadoUf)
        assertTrue(r.directAnswer!!, r.directAnswer!!.contains("Filtrado pelo seu estado (SP)"))
        // cargo nacional não é afetado; UF explícita na pergunta prevalece
        assertFalse(responder("Quem disputa a Presidência?", uf = "SP").directAnswer!!.contains("Filtrado"))
        assertEquals("RJ", responder("Candidatos a governador em RJ", uf = "SP").filters.estadoUf)
        // sem "Meu estado" (uf nula) a pergunta continua nacional
        assertEquals(null, responder("Candidatos a governador").filters.estadoUf)
    }

    @Test
    fun pedidoDeBrasilTodoAfastaOMeuEstado() {
        val r = responder("Candidatos a governador em todo o Brasil", uf = "SP")
        assertEquals(null, r.filters.estadoUf)
        assertFalse(r.directAnswer!!.contains("Filtrado pelo seu estado"))
    }

    // ---- 2º turno com a apuração REAL do TSE (05/10/2026): ninguém passou de 50% e o TSE marca os dois primeiros com "e":"s" ----
    private val apReal = ApuracaoProvider { cargo, uf, turno ->
        if (cargo == "PRESIDENTE" && turno == 1) {
            TseApuracaoParser.parse(javaClass.getResourceAsStream("/tse_apuracao_presidente_1t_final.json")!!.bufferedReader().readText(), cargo, uf, turno)
        } else null
    }

    @Test
    fun regressaoGraveCom47PorCentoOAppNuncaDizEleitoEmPrimeiroTurnoParaPresidente() {
        for (q in listOf("haverá 2a turno para presidente", "haverá 2º turno para presidente?", "vai ter segundo turno para presidente", "tem 2 turno pra presidente?")) {
            val r = responder(q, hoje = "2026-10-06", apuracao = apReal)
            assertEquals(q, Intent.SEGUNDO_TURNO, r.intent)
            val t = r.directAnswer!!
            assertTrue("$q: $t", t.startsWith("Sim, haverá 2º turno para Presidente da República."))
            assertFalse("$q: $t", t.contains("Não haverá 2º turno") || t.contains("foi eleito") || t.contains("a eleição foi liquidada"))
            assertTrue(t, t.contains("1º: FLAVIO BOLSONARO (PL) — 47,03% (56.104.503 votos)"))
            assertTrue(t, t.contains("2º: LULA (PT) — 45,16% (53.879.538 votos)"))
            assertTrue(t, t.contains("25/10/2026"))
        }
    }

    @Test
    fun visaoGeralEResultadosComAApuracaoRealNinguemEleito() {
        val geral = responder("Quem vai pro segundo turno?", hoje = "2026-10-06", apuracao = apReal).directAnswer!!
        assertTrue(geral, geral.contains("Presidente da República: Sim, haverá 2º turno entre FLAVIO BOLSONARO (47,03%) e LULA (45,16%)"))
        assertFalse(geral, geral.contains("Presidente da República: Não haverá"))
        val res = responder("Resultado para presidente", hoje = "2026-10-06", apuracao = apReal).directAnswer!!
        assertTrue(res, res.contains("47,03%) — 2º TURNO"))
        assertTrue(res, res.contains("45,16%) — 2º TURNO"))
        assertFalse(res, res.contains("— ELEITO"))
    }

    @Test
    fun leituraSegundoTurnoNuncaEleitoAbaixoDe50ComDoisMarcados() {
        fun l(nome: String, votos: Long, pct: String, eleito: Boolean = false, segundo: Boolean = false) =
            LinhaApuracao(null, "0", nome, "P", votos, pct, eleito, null, segundo)
        fun ap(vararg linhas: LinhaApuracao, fim: Boolean = true, pst: String = "100,00") =
            ApuracaoCargo("PRESIDENTE", "BR", 1, "05/10/2026 12:00:00", pst, fim, linhas.toList())
        // formato defensivo: dois "eleitos" sem a situação e o primeiro com menos de 50%
        assertEquals(TipoSegundoTurno.SEGUNDO, leituraSegundoTurno(ap(l("A", 47, "47,03", eleito = true), l("B", 45, "45,16", eleito = true))).tipo)
        assertEquals(TipoSegundoTurno.SEGUNDO, leituraSegundoTurno(ap(l("A", 47, "47,03", segundo = true), l("B", 45, "45,16", segundo = true), l("C", 8, "7,81"))).tipo)
        val eleito = leituraSegundoTurno(ap(l("A", 62, "62,65", eleito = true), l("B", 36, "36,42")))
        assertEquals(TipoSegundoTurno.ELEITO, eleito.tipo)
        assertTrue(eleito.maioria)
        assertEquals(TipoSegundoTurno.SEGUNDO, leituraSegundoTurno(ap(l("A", 49, "49,99"), l("B", 34, "34,51"))).tipo)
        assertEquals(TipoSegundoTurno.ANDAMENTO, leituraSegundoTurno(ap(l("A", 49, "49,99"), l("B", 34, "34,51"), fim = false, pst = "60,00")).tipo)
        assertEquals(TipoSegundoTurno.INDEFINIDO, leituraSegundoTurno(ap()).tipo)
    }

    @Test
    fun semApuracaoAoVivoDepoisDoPrimeiroTurnoUsaOPacoteENaoFalaComoSeAVotacaoNaoTivesseOcorrido() {
        val off = ApuracaoProvider { _, _, _ -> null }
        val pres = responder("haverá 2º turno para presidente?", hoje = "2026-10-06", apuracao = off).directAnswer!!
        assertFalse(pres, pres.contains("depende da apuração do 1º turno"))
        assertFalse(pres, pres.contains("Não haverá 2º turno"))
        if (TestData.dados.manifest.resultadosDisponiveis == true) {
            val ac = responder("vai ter segundo turno para governador do acre?", hoje = "2026-10-06", apuracao = off).directAnswer!!
            assertTrue(ac, ac.startsWith("Sim, haverá 2º turno para Governador no Acre."))
            assertTrue(ac, ac.contains("segundo a totalização oficial do TSE"))
            val sp = responder("tem 2ª turno pra governador em sp?", hoje = "2026-10-06", apuracao = off).directAnswer!!
            assertTrue(sp, sp.startsWith("Não haverá 2º turno para Governador em São Paulo."))
        }
    }
}
