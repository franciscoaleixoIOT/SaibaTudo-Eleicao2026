package net.saibatudo.eleicoes2026.ai.engine

import net.saibatudo.eleicoes2026.ai.model.AiMenuResponse

/**
 * Contrato do motor de IA do app: recebe a pergunta do usuário e devolve a resposta estruturada
 * (texto factual + filtros/rotas sugeridos para a interface).
 */
interface AiInferenceEngine {
    suspend fun parseUserQuery(query: String): AiMenuResponse

    /**
     * Pedido EXPLÍCITO do usuário ("Perguntar à IA na nuvem") para uma pergunta que o NLU local não entendeu.
     * Devolve a resposta (sempre montada dos dados oficiais) ou `null` se a nuvem não ajudou / não respondeu.
     */
    suspend fun perguntarNaNuvem(query: String): AiMenuResponse? = null
}
