package com.example.saibatudo_eleicao2026.ai.engine

import com.example.saibatudo_eleicao2026.ai.model.AiFilterExtraction
import com.example.saibatudo_eleicao2026.ai.model.AiMenuResponse
import com.example.saibatudo_eleicao2026.ai.model.IntentType
import com.example.saibatudo_eleicao2026.core.constants.AppConstants

/**
 * Default intelligent rule/mock engine used when offline or before the remote
 * Hugging Face model endpoint is connected. It parses election intents and routes
 * queries to the proper menus, submenus, and filter configurations.
 */
class LocalMockAiInferenceEngine : AiInferenceEngine {

    override suspend fun parseUserQuery(query: String): AiMenuResponse {
        val lower = query.lowercase()

        return when {
            lower.contains("presidente") || lower.contains("presidência") -> {
                AiMenuResponse(
                    targetRoute = "candidates/presidente",
                    menuId = AppConstants.MENU_PRESIDENTE,
                    filters = AiFilterExtraction(cargo = "PRESIDENTE"),
                    directAnswer = "Exibindo os candidatos à Presidência da República de 2026.",
                    suggestedQuestions = listOf("Quais as propostas para educação?", "Ver plano de governo")
                )
            }
            lower.contains("governador") || lower.contains("governo") -> {
                val uf = extractUf(lower)
                AiMenuResponse(
                    targetRoute = "candidates/governador",
                    menuId = AppConstants.MENU_GOVERNADOR,
                    filters = AiFilterExtraction(cargo = "GOVERNADOR", estadoUf = uf),
                    directAnswer = if (uf != null) "Filtrando candidatos ao Governo no estado $uf." else "Selecione o estado para ver os candidatos a Governador.",
                    suggestedQuestions = listOf("Candidatos a governador em SP", "Candidatos a governador no RJ")
                )
            }
            lower.contains("senador") || lower.contains("senado") -> {
                val uf = extractUf(lower)
                AiMenuResponse(
                    targetRoute = "candidates/senador",
                    menuId = AppConstants.MENU_SENADOR,
                    filters = AiFilterExtraction(cargo = "SENADOR", estadoUf = uf),
                    directAnswer = "Em 2026 serão renovadas 2 vagas de Senador por estado.",
                    suggestedQuestions = listOf("Como funciona a eleição de dois senadores?", "Candidatos ao Senado")
                )
            }
            lower.contains("onde votar") || lower.contains("seção") || lower.contains("local") -> {
                AiMenuResponse(
                    targetRoute = "info/locais",
                    menuId = AppConstants.MENU_LOCAIS_VOTACAO,
                    directAnswer = "Você pode consultar seu local de votação e seção cadastrada no TSE ou emitir o e-Título.",
                    suggestedQuestions = listOf("Como justificar meu voto?", "Como baixar o e-Título?")
                )
            }
            lower.contains("quando") || lower.contains("data") || lower.contains("calendário") || lower.contains("turno") -> {
                AiMenuResponse(
                    targetRoute = "info/calendario",
                    menuId = AppConstants.MENU_CALENDARIO,
                    directAnswer = "O primeiro turno das Eleições Gerais de 2026 ocorre no primeiro domingo de outubro de 2026.",
                    suggestedQuestions = listOf("Quando é o segundo turno?", "Até quando posso transferir o título?")
                )
            }
            else -> {
                AiMenuResponse(
                    targetRoute = "menu/home",
                    menuId = "menu_home",
                    directAnswer = "Aqui estão as opções de navegação e filtros para a sua pesquisa sobre as Eleições 2026.",
                    suggestedQuestions = listOf("Ver candidatos a Presidente", "Consultar prazos e calendário", "Candidatos a Governador")
                )
            }
        }
    }

    override suspend fun extractFilters(query: String): AiFilterExtraction {
        val lower = query.lowercase()
        val cargo = when {
            lower.contains("presidente") -> "PRESIDENTE"
            lower.contains("governador") -> "GOVERNADOR"
            lower.contains("senador") -> "SENADOR"
            lower.contains("deputado federal") -> "DEPUTADO_FEDERAL"
            lower.contains("deputado estadual") -> "DEPUTADO_ESTADUAL"
            else -> null
        }
        val uf = extractUf(lower)
        return AiFilterExtraction(cargo = cargo, estadoUf = uf)
    }

    override suspend fun predictMenuIntent(query: String): IntentType {
        val lower = query.lowercase()
        return when {
            lower.contains("onde votar") || lower.contains("seção") -> IntentType.VOTING_LOCATION_QUERY
            lower.contains("quando") || lower.contains("data") || lower.contains("calendário") -> IntentType.CALENDAR_QUERY
            lower.contains("candidato") || lower.contains("partido") -> IntentType.FILTER_CANDIDATES
            else -> IntentType.NAVIGATE_MENU
        }
    }

    private fun extractUf(text: String): String? {
        val ufs = listOf("ac","al","ap","am","ba","ce","df","es","go","ma","mt","ms","mg","pa","pb","pr","pe","pi","rj","rn","rs","ro","rr","sc","sp","se","to")
        for (uf in ufs) {
            if (Regex("\\b$uf\\b", RegexOption.IGNORE_CASE).containsMatchIn(text)) {
                return uf.uppercase()
            }
        }
        return null
    }
}
