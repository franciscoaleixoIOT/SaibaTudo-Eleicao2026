package net.saibatudo.eleicoes2026

import kotlinx.coroutines.runBlocking
import net.saibatudo.eleicoes2026.ai.answer.AnswerBuilder
import net.saibatudo.eleicoes2026.ai.model.AiMenuResponse
import net.saibatudo.eleicoes2026.ai.model.Intent
import net.saibatudo.eleicoes2026.ai.model.OrigemResposta
import net.saibatudo.eleicoes2026.ai.nlu.LocalNlu
import net.saibatudo.eleicoes2026.domain.model.Elegibilidade
import net.saibatudo.eleicoes2026.domain.model.FichaLimpa
import net.saibatudo.eleicoes2026.ui.viewmodel.MainUiState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Perguntas como as pessoas digitam no celular (minúsculas, sem acento, curtas) e todas as SUGESTÕES que a tela
 * oferece: nenhuma pode ficar sem resposta, e toda resposta segue o formato em linhas (título, itens, campos).
 */
class PerguntasReaisTest {

    private fun responder(q: String, uf: String? = "SP", hoje: String = "2026-10-01"): AiMenuResponse = runBlocking {
        val gaz = TestData.gazetteer
        AnswerBuilder(TestData.dados, gaz, hoje, uf, null, OrigemResposta.LOCAL).construir(LocalNlu.parse(q, gaz))
    }

    private val esperadas = mapOf(
        "candidatos a governador" to Intent.LISTAR_CANDIDATOS, "governador sp" to Intent.LISTAR_CANDIDATOS,
        "presidente" to Intent.LISTAR_CANDIDATOS, "senado rj" to Intent.LISTAR_CANDIDATOS, "rio de janeiro" to Intent.LISTAR_CANDIDATOS,
        "minas" to Intent.LISTAR_CANDIDATOS, "dep federal mg pl" to Intent.LISTAR_CANDIDATOS, "estreantes" to Intent.LISTAR_CANDIDATOS,
        "candidatas mulheres a governador" to Intent.LISTAR_CANDIDATOS,
        "lula" to Intent.PERFIL_CANDIDATO, "quem é o tarcisio" to Intent.PERFIL_CANDIDATO, "nikolas ferreira" to Intent.PERFIL_CANDIDATO,
        "quem é o 22" to Intent.PERFIL_CANDIDATO, "numero 13" to Intent.PERFIL_CANDIDATO, "vice do lula" to Intent.PERFIL_CANDIDATO,
        "haddad é ficha limpa?" to Intent.ELEGIBILIDADE, "o lula é ficha limpa" to Intent.ELEGIBILIDADE, "ficha limpa" to Intent.ELEGIBILIDADE,
        "candidatos ficha limpa a governador em sp" to Intent.ELEGIBILIDADE, "quais candidatos são ficha suja" to Intent.ELEGIBILIDADE,
        "candidatos inelegíveis" to Intent.ELEGIBILIDADE, "o que significa indeferido" to Intent.ELEGIBILIDADE,
        "qual o patrimônio do lula" to Intent.PATRIMONIO, "bens do tarcisio" to Intent.PATRIMONIO,
        "quanto o haddad gastou na campanha" to Intent.CONTAS_CAMPANHA, "plano de governo do lula" to Intent.PLANO_GOVERNO,
        "propostas do haddad" to Intent.PLANO_GOVERNO, "candidatos com propostas de educação em SP" to Intent.LISTAR_CANDIDATOS,
        "quando é a eleição" to Intent.CALENDARIO, "dia da eleição" to Intent.CALENDARIO, "que horas abre a votação" to Intent.CALENDARIO,
        "que horas fecha a urna" to Intent.CALENDARIO, "onde eu voto" to Intent.LOCAL_VOTACAO, "como justificar o voto" to Intent.LOCAL_VOTACAO,
        "como votar" to Intent.REGRAS_URNA, "quantos números tem o voto para senador" to Intent.REGRAS_URNA,
        "em quantos senadores eu voto" to Intent.SENADO_DOIS_VOTOS, "voto nulo" to Intent.REGRAS_VOTO, "voto em branco" to Intent.REGRAS_VOTO,
        "o que acontece se eu votar nulo" to Intent.REGRAS_VOTO, "voto é obrigatório?" to Intent.REGRAS_VOTO,
        "pesquisas" to Intent.PESQUISAS, "quem está na frente nas pesquisas" to Intent.PESQUISAS,
        "quem vai ganhar" to Intent.RECOMENDACAO, "em quem votar" to Intent.RECOMENDACAO,
        "resultado" to Intent.RESULTADOS, "segundo turno" to Intent.SEGUNDO_TURNO, "quantos candidatos" to Intent.CONTAR,
        "quantas mulheres candidatas" to Intent.CONTAR, "simular voto" to Intent.SIMULADOR, "simulador" to Intent.SIMULADOR,
        "oi" to Intent.AJUDA, "bom dia" to Intent.AJUDA, "obrigado" to Intent.AJUDA, "ajuda" to Intent.AJUDA, "sobre o app" to Intent.AJUDA,
        "de onde vem os dados" to Intent.SOBRE_DADOS
    )

    @Test
    fun perguntasDoDiaADiaSaoEntendidasERespondidas() {
        val falhas = mutableListOf<String>()
        for ((q, intent) in esperadas) {
            val r = responder(q)
            if (r.intent != intent) falhas += "\"$q\": intenção ${r.intent}, esperada $intent"
            if (!r.resolvida || r.directAnswer.isNullOrBlank()) falhas += "\"$q\": sem resposta"
            formatoValido(q, r)?.let { falhas += it }
        }
        assertTrue("Falhas:\n" + falhas.joinToString("\n"), falhas.isEmpty())
    }

    /** Listas sempre em itens ("• "), nunca em parágrafo corrido; linhas curtas o bastante para ler no celular. */
    private fun formatoValido(q: String, r: AiMenuResponse): String? {
        val linhas = r.directAnswer.orEmpty().split('\n')
        linhas.firstOrNull { it.length > 420 }?.let { return "\"$q\": linha longa demais (${it.length}): ${it.take(80)}…" }
        linhas.firstOrNull { it.count { ch -> ch == ';' } > 3 }?.let { return "\"$q\": lista em parágrafo corrido: ${it.take(80)}…" }
        return null
    }

    @Test
    fun todasAsSugestoesDaTelaTemResposta() {
        val sementes = MainUiState.SUGESTOES_PADRAO + listOf(
            "lula", "quem é o tarcisio", "marina silva", "candidatos a governador", "governador sp", "ficha limpa",
            "haddad é ficha limpa?", "oi", "pesquisas", "resultado", "voto nulo", "numero 13", "plano de governo do lula",
            "quanto o haddad gastou na campanha", "bens do tarcisio", "candidatos inelegíveis", "rio de janeiro"
        )
        val vistas = HashSet<String>()
        var fronteira = sementes
        val falhas = mutableListOf<String>()
        repeat(2) {
            val proxima = mutableListOf<String>()
            for (q in fronteira) {
                if (!vistas.add(q)) continue
                for (uf in listOf("SP", null)) {
                    val r = responder(q, uf)
                    if (r.intent == Intent.DESCONHECIDA || !r.resolvida) falhas += "\"$q\" (uf=$uf) não foi entendida"
                    proxima += r.suggestedQuestions
                }
            }
            fronteira = proxima.distinct()
        }
        // a última fronteira também precisa ser entendida
        fronteira.filter { it !in vistas }.forEach { q ->
            val r = responder(q)
            if (r.intent == Intent.DESCONHECIDA || !r.resolvida) falhas += "\"$q\" não foi entendida"
        }
        assertTrue("Sugestões sem resposta:\n" + falhas.distinct().joinToString("\n"), falhas.isEmpty())
    }

    @Test
    fun simuladorAbrePelaPerguntaEComCandidato() {
        assertTrue(responder("Simular voto na urna").abrirSimulador)
        val r = responder("Simular voto em LULA (13)")
        assertTrue(r.abrirSimulador)
        assertEquals("LULA", TestData.dados.porId[r.candidateIds.first()]?.nomeUrna)
    }

    @Test
    fun numeroDeUrnaEncontraOCandidato() {
        val r = responder("quem é o 22", uf = null)
        assertEquals("FLAVIO BOLSONARO", TestData.dados.porId[r.candidateIds.first()]?.nomeUrna)
        // número de 2 dígitos com "Meu estado": Presidente e Governador do estado
        val dois = responder("numero 13", uf = "SP").directAnswer!!
        assertTrue(dois, dois.contains("LULA") && dois.contains("FERNANDO HADDAD"))
        // ano não é número de candidato
        assertEquals(null, LocalNlu.parse("Quem disputa a Presidência em 2026?", TestData.gazetteer).numero)
    }

    @Test
    fun fichaLimpaAparecePorCandidatoENaVisaoGeral() {
        val haddad = responder("haddad é ficha limpa?").directAnswer!!
        assertTrue(haddad, haddad.contains("Ficha Limpa: Sem impedimento reconhecido"))
        assertTrue(haddad, haddad.contains("não é certidão"))
        val perfil = responder("lula").directAnswer!!
        assertTrue(perfil, perfil.contains("\nFicha Limpa: "))
        assertTrue(perfil, perfil.contains("\nVice: GERALDO ALCKMIN (PSB)"))
        val geral = responder("candidatos inelegíveis", uf = null)
        assertEquals(true, geral.filters.apenasIndeferidas)
        assertTrue(geral.directAnswer!!, geral.directAnswer!!.contains("Inelegibilidade reconhecida (LC 64/90 / Ficha Limpa)"))
    }

    @Test
    fun derivacaoDaFichaLimpaSegueOsMotivosOficiais() {
        val fl = "Inelegibilidade infraconstitucional(LC 64/90)"
        assertEquals(FichaLimpa.SEM_IMPEDIMENTO, FichaLimpa.de(Elegibilidade.DEFERIDA, emptyList()))
        assertEquals(FichaLimpa.SEM_IMPEDIMENTO, FichaLimpa.de(Elegibilidade.DEFERIDA_COM_RECURSO, emptyList()))
        assertEquals(FichaLimpa.INELEGIVEL_FICHA_LIMPA, FichaLimpa.de(Elegibilidade.INDEFERIDA_COM_RECURSO, listOf("Outros", fl)))
        assertEquals(FichaLimpa.INELEGIVEL_CONSTITUCIONAL, FichaLimpa.de(Elegibilidade.INDEFERIDA, listOf("Inelegibilidade constitucional")))
        assertEquals(FichaLimpa.INDEFERIDA_OUTRO_MOTIVO, FichaLimpa.de(Elegibilidade.INDEFERIDA, listOf("Ausência de quitação eleitoral (Lei 9.504/97)")))
        assertEquals(FichaLimpa.INDEFERIDA_SEM_MOTIVO, FichaLimpa.de(Elegibilidade.INDEFERIDA, emptyList()))
        assertEquals(FichaLimpa.AGUARDANDO, FichaLimpa.de(Elegibilidade.PENDENTE, emptyList()))
        assertEquals(FichaLimpa.FORA_DA_DISPUTA, FichaLimpa.de(Elegibilidade.RENUNCIA, emptyList()))
        // nos dados reais, todo indeferimento com motivo "infraconstitucional" vira inelegível pela Ficha Limpa
        val reais = TestData.dados.candidatos.filter { c -> c.motivosIndeferimento.any { it.contains("infraconstitucional") } && c.elegibilidade.indeferida }
        assertTrue(reais.isNotEmpty())
        assertTrue(reais.all { it.fichaLimpa == FichaLimpa.INELEGIVEL_FICHA_LIMPA })
    }
}
