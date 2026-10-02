package net.saibatudo.eleicoes2026.ai.engine

import kotlinx.coroutines.withTimeoutOrNull
import net.saibatudo.eleicoes2026.ai.model.AiMenuResponse
import net.saibatudo.eleicoes2026.ai.model.OrigemResposta
import net.saibatudo.eleicoes2026.ai.nlu.CloudNluClient

/**
 * Motor HÍBRIDO: LOCAL primeiro, nuvem só como apoio de interpretação.
 *
 *  1. O NLU local responde quase tudo (grátis, offline, determinístico).
 *  2. Se NÃO entendeu E o usuário consentiu no uso da IA na nuvem, a pergunta é enviada ao NLU na nuvem
 *     (modelo SaibaTudo no Modal, atrás de API própria). A nuvem devolve apenas intenção/entidades, validadas
 *     contra os dados locais; a RESPOSTA continua sendo montada dos dados oficiais. Falha/timeout => resposta local.
 *
 * Benefícios: custo mínimo (só perguntas ambíguas vão à nuvem), privacidade (opt-in) e nenhuma alucinação factual.
 */
class HybridAiInferenceEngine(
    private val local: LocalOfficialAiEngine,
    private val nuvem: CloudNluClient?,
    private val nuvemHabilitada: () -> Boolean,
    private val idInstalacao: suspend () -> String,
    private val timeoutMs: Long = 14_000,
    /** Tempo maior quando o próprio usuário pediu a nuvem e aceitou esperar (botão "Perguntar à IA na nuvem"). */
    private val timeoutExplicitoMs: Long = 25_000
) : AiInferenceEngine {

    override suspend fun perguntarNaNuvem(query: String): AiMenuResponse? {
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
}
