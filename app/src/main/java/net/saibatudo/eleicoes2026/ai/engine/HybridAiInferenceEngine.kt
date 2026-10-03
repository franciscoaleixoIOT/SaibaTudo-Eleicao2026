package net.saibatudo.eleicoes2026.ai.engine

import kotlinx.coroutines.withTimeoutOrNull
import net.saibatudo.eleicoes2026.ai.model.AiMenuResponse
import net.saibatudo.eleicoes2026.ai.model.OrigemResposta
import net.saibatudo.eleicoes2026.ai.nlu.CloudAskClient
import net.saibatudo.eleicoes2026.ai.nlu.CloudNluClient

/**
 * Motor HÍBRIDO: LOCAL primeiro, nuvem como apoio de interpretação e IA Generativa (Qwen 7B).
 *
 *  1. O NLU local responde quase tudo (grátis, offline, determinístico).
 *  2. Se a pergunta já foi entendida e o usuário quer aprofundar na nuvem, chama a IA Generativa (Qwen 7B no Modal).
 *  3. Se NÃO entendeu E o usuário consentiu, a pergunta é enviada ao NLU na nuvem para reinterpretação.
 */
class HybridAiInferenceEngine(
    private val local: LocalOfficialAiEngine,
    private val nuvem: CloudNluClient?,
    private val nuvemHabilitada: () -> Boolean,
    private val idInstalacao: suspend () -> String,
    private val askClient: CloudAskClient? = null,
    private val timeoutMs: Long = 14_000,
    /** Tempo maior quando o próprio usuário pediu a nuvem e aceitou esperar (botão "Perguntar à IA na nuvem"). */
    private val timeoutExplicitoMs: Long = 25_000
) : AiInferenceEngine {

    override suspend fun perguntarNaNuvem(query: String, respostaAtual: AiMenuResponse?): AiMenuResponse? {
        if (respostaAtual?.resolvida == true && askClient != null) {
            val contexto = respostaAtual.directAnswer?.take(1500)?.let { "Dados oficiais apurados no TSE:\n$it" }.orEmpty()
            val gerada = withTimeoutOrNull(timeoutExplicitoMs) {
                askClient.responder(query, contexto, idInstalacao())
            }
            if (!gerada.isNullOrBlank()) {
                return AiMenuResponse(
                    targetRoute = respostaAtual.targetRoute,
                    menuId = respostaAtual.menuId,
                    submenuId = respostaAtual.submenuId,
                    intent = respostaAtual.intent,
                    filters = respostaAtual.filters,
                    directAnswer = gerada,
                    suggestedQuestions = respostaAtual.suggestedQuestions,
                    candidateIds = respostaAtual.candidateIds,
                    fonte = "IA Generativa (Qwen2.5-7B) • Fundamentada nas normas e dados públicos do TSE",
                    origem = OrigemResposta.GENERATIVA,
                    resolvida = true
                )
            }
        }
        if (nuvem == null) return null
        val (data, gaz) = local.gazetteer()
        val parsed = withTimeoutOrNull(timeoutExplicitoMs) { nuvem.interpretar(query, idInstalacao(), gaz) } ?: return null
        return local.responder(parsed, data, gaz, OrigemResposta.NUVEM).takeIf { it.resolvida }
    }

    override suspend fun parseUserQuery(query: String): AiMenuResponse {
        val respostaLocal = local.parseUserQuery(query)
        if (respostaLocal.resolvida || nuvem == null || !nuvemHabilitada()) return respostaLocal

        val (data, gaz) = local.gazetteer()
        val parsed = withTimeoutOrNull(timeoutMs) { nuvem.interpretar(query, idInstalacao(), gaz) }
            ?: return respostaLocal
        val resposta = local.responder(parsed, data, gaz, OrigemResposta.NUVEM)
        return if (resposta.resolvida) resposta else respostaLocal
    }

    override fun limparContexto() {
        local.limparContexto()
    }
}
