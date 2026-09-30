package com.example.saibatudo_eleicao2026.ai.model

enum class IntentType {
    NAVIGATE_MENU,
    FILTER_CANDIDATES,
    EXPLAIN_TOPIC,
    CALENDAR_QUERY,
    VOTING_LOCATION_QUERY,
    GENERAL_QUERY
}

data class AiIntent(
    val type: IntentType,
    val confidence: Float,
    val rawQuery: String
)

data class AiFilterExtraction(
    val cargo: String? = null,
    val estadoUf: String? = null,
    val partido: String? = null,
    val tema: String? = null,
    val nomeCandidato: String? = null,
    val numeroCandidato: String? = null
)

data class AiMenuResponse(
    val targetRoute: String,
    val menuId: String,
    val submenuId: String? = null,
    val filters: AiFilterExtraction = AiFilterExtraction(),
    val directAnswer: String? = null,
    val suggestedQuestions: List<String> = emptyList()
)
