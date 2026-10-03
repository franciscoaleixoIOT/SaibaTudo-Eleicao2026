package net.saibatudo.eleicoes2026.ai.engine

import net.saibatudo.eleicoes2026.ai.model.AiMenuResponse

/**
 * Contrato do motor de IA do app: recebe a pergunta do usuário e devolve a resposta estruturada
 * (texto factual + filtros/rotas sugeridos para a interface).
 */
interface AiInferenceEngine {
    suspend fun parseUserQuery(query: String): AiMenuResponse

    /**
     * Pedido EXPLÍCITO do usuário ("Perguntar à IA na nuvem").
     * Prioridade: resposta generativa com Qwen 7B ancorada no TSE se a pergunta já foi entendida,
     * ou interpretação estruturada via NLU na nuvem se não foi entendida.
     */
    suspend fun perguntarNaNuvem(query: String, respostaAtual: AiMenuResponse? = null): AiMenuResponse? = null

    /** Limpa o contexto conversacional armazenado da última pergunta. */
    fun limparContexto() {}
}
