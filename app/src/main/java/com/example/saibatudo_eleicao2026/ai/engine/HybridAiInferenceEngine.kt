package com.example.saibatudo_eleicao2026.ai.engine

import android.util.Log
import com.example.saibatudo_eleicao2026.ai.model.AiFilterExtraction
import com.example.saibatudo_eleicao2026.ai.model.AiMenuResponse
import com.example.saibatudo_eleicao2026.ai.model.IntentType

/**
 * Motor HÍBRIDO de inferência:
 *  1. Prioriza o modelo OFICIAL publicado no Hugging Face
 *     (franciscoaleixo/SaibaTudo-Eleicao2026 - fine-tuned com dados oficiais do TSE).
 *  2. Em caso de falha/timeout/offline, cai para o motor local determinístico
 *     (LocalOfficialAiEngine), que responde com os MESMOS dados oficiais do TSE
 *     carregados no repositório (sem alucinações, latência zero).
 *
 * A listagem de candidatos/filtros SEMPRE vem do repositório local de dados
 * oficiais do TSE - o modelo é usado para NLU (intenção, rota, filtros e resumo).
 */
class HybridAiInferenceEngine(
    private val cloudEngine: HuggingFaceInferenceEngine = HuggingFaceInferenceEngine(),
    private val localEngine: LocalOfficialAiEngine
) : AiInferenceEngine {

    companion object {
        private const val TAG = "HybridAiEngine"
        private const val CLOUD_TIMEOUT_MS = 9000L
    }

    override suspend fun parseUserQuery(query: String): AiMenuResponse {
        return try {
            val cloud = withTimeoutOrNull(CLOUD_TIMEOUT_MS) { cloudEngine.parseUserQuery(query) }
            if (cloud != null && cloud.directAnswer != null && !cloud.directAnswer.isNullOrBlank()) {
                cloud
            } else {
                localEngine.parseUserQuery(query)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Inferência Hugging Face indisponível, usando motor local oficial: ${e.message}")
            localEngine.parseUserQuery(query)
        }
    }

    override suspend fun extractFilters(query: String): AiFilterExtraction {
        return try {
            val cloud = withTimeoutOrNull(CLOUD_TIMEOUT_MS) { cloudEngine.extractFilters(query) }
            cloud ?: localEngine.extractFilters(query)
        } catch (e: Exception) {
            Log.w(TAG, "Fallback local para extração de filtros: ${e.message}")
            localEngine.extractFilters(query)
        }
    }

    override suspend fun predictMenuIntent(query: String): IntentType {
        return try {
            val cloud = withTimeoutOrNull(CLOUD_TIMEOUT_MS) { cloudEngine.predictMenuIntent(query) }
            cloud ?: localEngine.predictMenuIntent(query)
        } catch (e: Exception) {
            localEngine.predictMenuIntent(query)
        }
    }

    private suspend fun <T> withTimeoutOrNull(timeoutMs: Long, block: suspend () -> T): T? =
        kotlinx.coroutines.withTimeoutOrNull(timeoutMs) { block() }
}
