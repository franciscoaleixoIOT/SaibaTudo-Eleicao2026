package com.example.saibatudo_eleicao2026.ai.engine

import com.example.saibatudo_eleicao2026.ai.model.AiFilterExtraction
import com.example.saibatudo_eleicao2026.ai.model.AiMenuResponse
import com.example.saibatudo_eleicao2026.ai.model.IntentType
import com.example.saibatudo_eleicao2026.ai.prompt.ElectionPromptTemplates
import com.example.saibatudo_eleicao2026.core.constants.AppConstants
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * Cliente do modelo OFICIAL SaibaTudo-Eleicao2026 no Hugging Face Hub.
 *
 * Suporta dois endpoints:
 *  - Inference Providers/Router (router.huggingface.co) quando há token
 *  - Endpoint serverless clássico (api-inference.huggingface.co)
 *
 * O modelo foi fine-tunado exclusivamente com dados oficiais do TSE 2026.
 */
class HuggingFaceInferenceEngine(
    private val modelRepoId: String = AppConstants.HF_MODEL_REPO_ID,
    private val apiToken: String? = null
) : AiInferenceEngine {

    // Rotas tentadas em ordem (provider router com token; serverless como fallback)
    private val endpointUrls: List<String>
        get() = buildList {
            if (!apiToken.isNullOrBlank()) {
                add("https://router.huggingface.co/hf-inference/models/$modelRepoId")
            }
            add("https://api-inference.huggingface.co/models/$modelRepoId")
        }

    override suspend fun parseUserQuery(query: String): AiMenuResponse = withContext(Dispatchers.IO) {
        val prompt = ElectionPromptTemplates.buildIntentAndFilterExtractionPrompt(query)
        val payload = JSONObject().apply {
            put("inputs", prompt)
            put("parameters", JSONObject().apply {
                put("max_new_tokens", 300)
                put("temperature", 0.1)
                put("do_sample", false)
                put("return_full_text", false)
            })
        }

        var lastError: Exception? = null
        for (endpoint in endpointUrls) {
            try {
                val responseString = executePostRequest(endpoint, payload.toString())
                return@withContext parseJsonResponse(responseString, query)
            } catch (e: Exception) {
                lastError = e
            }
        }
        throw (lastError ?: IllegalStateException("Endpoint do modelo indisponível"))
    }

    override suspend fun extractFilters(query: String): AiFilterExtraction = parseUserQuery(query).filters

    override suspend fun predictMenuIntent(query: String): IntentType {
        val response = parseUserQuery(query)
        return try {
            IntentType.valueOf(response.menuId.uppercase())
        } catch (_: Exception) {
            IntentType.NAVIGATE_MENU
        }
    }

    private fun executePostRequest(urlString: String, jsonBody: String): String {
        val url = URL(urlString)
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("Content-Type", "application/json")
        conn.connectTimeout = 6000
        conn.readTimeout = 12000
        conn.doOutput = true

        apiToken?.let { token ->
            if (token.isNotBlank()) {
                conn.setRequestProperty("Authorization", "Bearer $token")
            }
        }

        OutputStreamWriter(conn.outputStream).use { writer ->
            writer.write(jsonBody)
            writer.flush()
        }

        val responseCode = conn.responseCode
        val inputStream = if (responseCode in 200..299) conn.inputStream else conn.errorStream
        val response = BufferedReader(InputStreamReader(inputStream)).use { it.readText() }

        if (responseCode !in 200..299) {
            throw IllegalStateException("Hugging Face API retornou status $responseCode: $response")
        }

        return response
    }

    private fun parseJsonResponse(rawResponse: String, originalQuery: String): AiMenuResponse {
        val generatedText = try {
            val jsonArray = JSONArray(rawResponse)
            jsonArray.getJSONObject(0).optString("generated_text", "")
        } catch (_: Exception) {
            rawResponse
        }

        val jsonStartIndex = generatedText.indexOf("{")
        val jsonEndIndex = generatedText.lastIndexOf("}")

        if (jsonStartIndex != -1 && jsonEndIndex > jsonStartIndex) {
            val jsonSub = generatedText.substring(jsonStartIndex, jsonEndIndex + 1)
            val json = try {
                JSONObject(jsonSub)
            } catch (_: Exception) {
                null
            }

            if (json != null) {
                val filtersObj = json.optJSONObject("filters")
                val filters = AiFilterExtraction(
                    cargo = filtersObj?.optNullableString("cargo"),
                    estadoUf = filtersObj?.optNullableString("estado_uf"),
                    partido = filtersObj?.optNullableString("partido"),
                    tema = filtersObj?.optNullableString("tema"),
                    nomeCandidato = filtersObj?.optNullableString("nome_candidato"),
                    apenasFichaLimpa = filtersObj?.optBooleanOrNull("apenas_ficha_limpa"),
                    maxProcessosAdministrativos = filtersObj?.optIntOrNull("max_processos_administrativos")
                )

                val suggestedList = mutableListOf<String>()
                json.optJSONArray("suggested_questions")?.let { arr ->
                    for (i in 0 until arr.length()) suggestedList.add(arr.optString(i))
                }

                return AiMenuResponse(
                    targetRoute = json.optString("target_route", "menu/home"),
                    menuId = json.optString("menu_id", "menu_home"),
                    submenuId = json.optNullableString("submenu_id"),
                    filters = filters,
                    directAnswer = json.optNullableString("direct_answer") ?: generatedText.trim(),
                    suggestedQuestions = suggestedList
                )
            }
        }

        // Fallback: usa o texto gerado como resposta direta
        return AiMenuResponse(
            targetRoute = "menu/home",
            menuId = "menu_home",
            directAnswer = generatedText.takeIf { it.isNotBlank() } ?: "Consultando dados oficiais do TSE.",
            suggestedQuestions = listOf("Ver candidatos a Presidente", "Consultar prazos e calendário")
        )
    }

    private fun JSONObject.optNullableString(key: String): String? {
        return if (has(key) && !isNull(key)) optString(key).takeIf { it.isNotBlank() && it != "null" } else null
    }

    private fun JSONObject.optBooleanOrNull(key: String): Boolean? {
        return if (has(key) && !isNull(key)) optBoolean(key) else null
    }

    private fun JSONObject.optIntOrNull(key: String): Int? {
        return if (has(key) && !isNull(key)) optInt(key) else null
    }
}
