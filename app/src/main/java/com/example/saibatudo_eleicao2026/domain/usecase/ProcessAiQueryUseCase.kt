package com.example.saibatudo_eleicao2026.domain.usecase

import com.example.saibatudo_eleicao2026.ai.engine.AiInferenceEngine
import com.example.saibatudo_eleicao2026.ai.model.AiMenuResponse

class ProcessAiQueryUseCase(
    private val aiInferenceEngine: AiInferenceEngine
) {
    suspend operator fun invoke(userQuery: String): AiMenuResponse {
        return aiInferenceEngine.parseUserQuery(userQuery)
    }
}
