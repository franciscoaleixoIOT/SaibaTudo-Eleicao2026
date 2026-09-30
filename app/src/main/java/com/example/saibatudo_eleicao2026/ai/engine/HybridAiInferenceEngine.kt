package com.example.saibatudo_eleicao2026.ai.engine

import android.util.Log
import com.example.saibatudo_eleicao2026.ai.model.AiFilterExtraction
import com.example.saibatudo_eleicao2026.ai.model.AiMenuResponse
import com.example.saibatudo_eleicao2026.ai.model.IntentType

/**
 * Hybrid AI Inference Engine combining cloud-based Hugging Face inference
 * with on-device / local fallback execution for reliable offline resilience.
 */
class HybridAiInferenceEngine(
    private val cloudEngine: HuggingFaceInferenceEngine = HuggingFaceInferenceEngine(),
    private val localEngine: LocalMockAiInferenceEngine = LocalMockAiInferenceEngine()
) : AiInferenceEngine {

    companion object {
        private const val TAG = "HybridAiEngine"
    }

    override suspend fun parseUserQuery(query: String): AiMenuResponse {
        return try {
            cloudEngine.parseUserQuery(query)
        } catch (e: Exception) {
            Log.w(TAG, "Falha ou timeout na inferência Hugging Face Cloud. Ativando fallback on-device: ${e.message}")
            localEngine.parseUserQuery(query)
        }
    }

    override suspend fun extractFilters(query: String): AiFilterExtraction {
        return try {
            cloudEngine.extractFilters(query)
        } catch (e: Exception) {
            Log.w(TAG, "Fallback local para extração de filtros: ${e.message}")
            localEngine.extractFilters(query)
        }
    }

    override suspend fun predictMenuIntent(query: String): IntentType {
        return try {
            cloudEngine.predictMenuIntent(query)
        } catch (e: Exception) {
            Log.w(TAG, "Fallback local para classificação de intenção: ${e.message}")
            localEngine.predictMenuIntent(query)
        }
    }
}
