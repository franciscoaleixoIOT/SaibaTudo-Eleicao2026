package com.example.saibatudo_eleicao2026.ai.engine

import com.example.saibatudo_eleicao2026.ai.model.AiFilterExtraction
import com.example.saibatudo_eleicao2026.ai.model.AiMenuResponse
import com.example.saibatudo_eleicao2026.ai.model.IntentType

/**
 * Interface contract for AI inference engine.
 * Supports on-device execution (LiteRT/ONNX/GGUF) or cloud-hosted
 * Hugging Face Inference API for the SaibaTudo-Eleicao2026 model.
 */
interface AiInferenceEngine {
    suspend fun parseUserQuery(query: String): AiMenuResponse
    suspend fun extractFilters(query: String): AiFilterExtraction
    suspend fun predictMenuIntent(query: String): IntentType
}
