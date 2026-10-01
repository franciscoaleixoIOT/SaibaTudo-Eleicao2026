package net.saibatudo.eleicoes2026.ai.engine

import net.saibatudo.eleicoes2026.ai.model.AiMenuResponse

/**
 * Contrato do motor de IA do app: recebe a pergunta do usuário e devolve a resposta estruturada
 * (texto factual + filtros/rotas sugeridos para a interface).
 */
interface AiInferenceEngine {
    suspend fun parseUserQuery(query: String): AiMenuResponse
}
