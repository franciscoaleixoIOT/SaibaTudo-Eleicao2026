package net.saibatudo.eleicoes2026

import kotlinx.coroutines.runBlocking
import net.saibatudo.eleicoes2026.ai.answer.AnswerBuilder
import net.saibatudo.eleicoes2026.ai.model.Intent
import net.saibatudo.eleicoes2026.ai.model.OrigemResposta
import net.saibatudo.eleicoes2026.ai.nlu.LocalNlu
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
}
