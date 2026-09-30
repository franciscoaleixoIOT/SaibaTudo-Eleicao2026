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
 * Hugging Face Inference API client for the SaibaTudo-Eleicao2026 model.
 * Connects directly to Hugging Face Hub serverless endpoints.
 */
class HuggingFaceInferenceEngine(
    private val modelRepoId: String = AppConstants.HF_MODEL_REPO_ID,
    private val apiToken: String? = null
) : AiInferenceEngine {

    private val endpointUrl = "https://api-inference.huggingface.co/models/$modelRepoId"

    override suspend fun parseUserQuery(query: String): AiMenuResponse = withContext(Dispatchers.IO) {
        val prompt = ElectionPromptTemplates.buildIntentAndFilterExtractionPrompt(query)
        val payload = JSONObject().apply {
            put("inputs", prompt)
            put("parameters", JSONObject().apply {
                put("max_new_tokens", 256)
                put("temperature", 0.1)
                put("return_full_text", false)
            })
        }

        val responseString = executePostRequest(endpointUrl, payload.toString())
        parseJsonResponse(responseString, query)
    }

    override suspend fun extractFilters(query: String): AiFilterExtraction {
        val response = parseUserQuery(query)
        return response.filters
    }

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
        conn.connectTimeout = 8000
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
            jsonArray.getJSONObject(0).getString("generated_text")
        } catch (_: Exception) {
            rawResponse
        }

        val jsonStartIndex = generatedText.indexOf("{")
        val jsonEndIndex = generatedText.lastIndexOf("}")

        if (jsonStartIndex != -1 && jsonEndIndex > jsonStartIndex) {
            val jsonSub = generatedText.substring(jsonStartIndex, jsonEndIndex + 1)
            val json = JSONObject(jsonSub)

            val filtersObj = json.optJSONObject("filters")
            val filters = AiFilterExtraction(
                cargo = filtersObj?.optNullableString("cargo"),
                estadoUf = filtersObj?.optNullableString("estado_uf"),
                partido = filtersObj?.optNullableString("partido"),
                tema = filtersObj?.optNullableString("tema"),
                nomeCandidato = filtersObj?.optNullableString("nome_candidato")
            )

            val suggestedList = mutableListOf<String>()
            val suggestedArr = json.optJSONArray("suggested_questions")
            if (suggestedArr != null) {
                for (i in 0 until suggestedArr.length()) {
                    suggestedList.add(suggestedArr.getString(i))
                }
            }

            return AiMenuResponse(
                targetRoute = json.optString("target_route", "menu/home"),
                menuId = json.optString("menu_id", "menu_home"),
                submenuId = json.optNullableString("submenu_id"),
                filters = filters,
                directAnswer = json.optNullableString("direct_answer"),
                suggestedQuestions = suggestedList
            )
        }

        // Fallback default response if JSON parsing fails
        return AiMenuResponse(
            targetRoute = "menu/home",
            menuId = "menu_home",
            directAnswer = generatedText,
            suggestedQuestions = listOf("Ver candidatos a Presidente", "Consultar prazos e calendário")
        )
    }

    private fun JSONObject.optNullableString(key: String): String? {
        return if (has(key) && !isNull(key)) optString(key) else null
    }
}
