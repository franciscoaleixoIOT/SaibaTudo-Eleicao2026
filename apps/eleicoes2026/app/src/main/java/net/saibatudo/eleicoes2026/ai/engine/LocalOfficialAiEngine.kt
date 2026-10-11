package net.saibatudo.eleicoes2026.ai.engine

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import net.saibatudo.eleicoes2026.ai.answer.AnswerBuilder
import net.saibatudo.eleicoes2026.ai.model.AiMenuResponse
import net.saibatudo.eleicoes2026.ai.model.OrigemResposta
import net.saibatudo.eleicoes2026.ai.model.ParsedQuery
import net.saibatudo.eleicoes2026.ai.nlu.Gazetteer
import net.saibatudo.eleicoes2026.ai.nlu.LocalNlu
import net.saibatudo.eleicoes2026.data.datasource.ElectionData
import net.saibatudo.eleicoes2026.domain.model.ApuracaoProvider
import net.saibatudo.eleicoes2026.domain.model.Datas

/**
 * Motor de IA LOCAL e DETERMINÍSTICO: NLU por regras + respostas montadas dos dados oficiais do TSE.
 * Funciona 100% offline, sem custo e sem alucinação. É o caminho padrão do app.
 */
class LocalOfficialAiEngine(
    private val dados: suspend () -> ElectionData,
    private val ufPadrao: () -> String? = { null },
    private val apuracao: ApuracaoProvider? = null,
    private val hoje: () -> String = { Datas.hojeBrasilia() }
) : AiInferenceEngine {

    @Volatile private var cache: Pair<ElectionData, Gazetteer>? = null
    @Volatile private var ultimoParsed: ParsedQuery? = null

    /** Contexto que valia quando a ÚLTIMA pergunta foi feita: serve para a nuvem seguir a conversa (a resposta atual ainda não conta). */
    @Volatile private var contextoDaPergunta: ParsedQuery? = null

    /** Dicionário (partidos/nomes) derivado dos dados; reconstruído quando o pacote de dados muda. */
    suspend fun gazetteer(): Pair<ElectionData, Gazetteer> {
        val d = dados()
        cache?.takeIf { it.first === d }?.let { return it }
        return withContext(Dispatchers.Default) { (d to Gazetteer(d.candidatos)).also { cache = it } }
    }

    override suspend fun parseUserQuery(query: String): AiMenuResponse = withContext(Dispatchers.Default) {
        val (data, gaz) = gazetteer()
        contextoDaPergunta = ultimoParsed
        val parsed = LocalNlu.parse(query, gaz, ultimoParsed)
        val resposta = responder(parsed, data, gaz, OrigemResposta.LOCAL)
        if (resposta.resolvida) {
            ultimoParsed = parsed
        }
        resposta
    }

    override fun limparContexto() {
        ultimoParsed = null
        contextoDaPergunta = null
    }

    /**
     * Completa, com o contexto das perguntas anteriores, uma interpretação vinda da NUVEM (a regra de elipses é a do NLU local).
     * A nuvem só recebe o texto da pergunta atual, então "e de SP?" chega sem o cargo; quem o completa é o aparelho.
     */
    fun comContexto(parsed: ParsedQuery, query: String, gaz: Gazetteer): ParsedQuery =
        contextoDaPergunta?.let { LocalNlu.resolverContinuacao(parsed, query, gaz, it) } ?: parsed

    /** Registra a interpretação da resposta que a pessoa está vendo, para a próxima pergunta continuar a partir dela. */
    fun lembrar(parsed: ParsedQuery) {
        ultimoParsed = parsed
    }

    /** Monta a resposta para uma interpretação já pronta (do NLU local ou, validada, da nuvem). */
    suspend fun responder(
        parsed: ParsedQuery, data: ElectionData, gaz: Gazetteer, origem: OrigemResposta
    ): AiMenuResponse =
        AnswerBuilder(data, gaz, hoje(), ufPadrao(), apuracao, origem).construir(parsed)
}
