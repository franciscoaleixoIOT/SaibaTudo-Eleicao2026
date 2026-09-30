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
            lower.contains("dois senadores") || lower.contains("2 senadores") || lower.contains("segunda vaga") || lower.contains("duas vagas") -> {
                val uf = extractUf(lower)
                AiMenuResponse(
                    targetRoute = "candidates/senador",
                    menuId = AppConstants.MENU_SENADOR,
                    filters = AiFilterExtraction(cargo = "SENADOR_PRIMEIRA_VAGA", estadoUf = uf),
                    directAnswer = "Nas Eleições 2026, você escolherá DOIS senadores (renovação de 2/3). O voto é duplo: 1ª vaga (3 dígitos) e 2ª vaga (3 dígitos). Importante: se votar no mesmo número nas duas vagas, o segundo voto é anulado pelo TSE!",
                    suggestedQuestions = listOf("Simular voto na Urna 2026", "Candidatos ao Senado em SP", "Candidatos ao Senado em MG")
                )
            }
            lower.contains("senador") || lower.contains("senado") -> {
                val uf = extractUf(lower)
                AiMenuResponse(
                    targetRoute = "candidates/senador",
                    menuId = AppConstants.MENU_SENADOR,
                    filters = AiFilterExtraction(cargo = "SENADOR_PRIMEIRA_VAGA", estadoUf = uf),
                    directAnswer = if (uf != null) "Filtrando candidatos ao Senado no estado de $uf (3 dígitos na urna)." else "Em 2026 serão renovadas 2 vagas de Senador por estado (3 dígitos).",
                    suggestedQuestions = listOf("Como funciona o voto para dois senadores?", "Simular voto na Urna 2026", "Candidatos ao Senado em SP")
                )
            }
            lower.contains("presidente") || lower.contains("presidência") -> {
                AiMenuResponse(
                    targetRoute = "candidates/presidente",
                    menuId = AppConstants.MENU_PRESIDENTE,
                    filters = AiFilterExtraction(cargo = "PRESIDENTE"),
                    directAnswer = "Exibindo os candidatos à Presidência da República de 2026 (2 dígitos na urna).",
                    suggestedQuestions = listOf("Simular voto para Presidente", "Ver propostas para educação", "Candidatos com Zero Processos")
                )
            }
            lower.contains("governador") || lower.contains("governo") -> {
                val uf = extractUf(lower)
                AiMenuResponse(
                    targetRoute = "candidates/governador",
                    menuId = AppConstants.MENU_GOVERNADOR,
                    filters = AiFilterExtraction(cargo = "GOVERNADOR", estadoUf = uf),
                    directAnswer = if (uf != null) "Filtrando candidatos ao Governo no estado $uf (2 dígitos na urna)." else "Selecione o estado para ver os candidatos a Governador (2 dígitos na urna).",
                    suggestedQuestions = listOf("Candidatos a governador em SP", "Candidatos a governador em MG", "Simular voto na Urna 2026")
                )
            }
            lower.contains("deputado federal") -> {
                val uf = extractUf(lower)
                AiMenuResponse(
                    targetRoute = "candidates/deputado_federal",
                    menuId = AppConstants.MENU_DEPUTADO_FEDERAL,
                    filters = AiFilterExtraction(cargo = "DEPUTADO_FEDERAL", estadoUf = uf),
                    directAnswer = "Exibindo candidatos a Deputado Federal (4 dígitos na urna oficial do TSE).",
                    suggestedQuestions = listOf("Candidatos Ficha Limpa", "Simular voto na Urna 2026")
                )
            }
            lower.contains("deputado estadual") || lower.contains("distrital") -> {
                val uf = extractUf(lower)
                AiMenuResponse(
                    targetRoute = "candidates/deputado_estadual",
                    menuId = AppConstants.MENU_DEPUTADO_ESTADUAL,
                    filters = AiFilterExtraction(cargo = "DEPUTADO_ESTADUAL", estadoUf = uf),
                    directAnswer = "Exibindo candidatos a Deputado Estadual ou Distrital (5 dígitos na urna oficial do TSE).",
                    suggestedQuestions = listOf("Candidatos com Zero Processos", "Simular voto na Urna 2026")
                )
            }
            lower.contains("ficha limpa") -> {
                AiMenuResponse(
                    targetRoute = "candidates/fichalimpa",
                    menuId = AppConstants.MENU_PRESIDENTE,
                    directAnswer = "Exibindo candidatos com Certidão Ficha Limpa 100% deferida pelo TSE, sem condenações em órgãos colegiados (LC 135/2010).",
                    suggestedQuestions = listOf("Candidatos com Zero Processos", "Candidatos à Presidência", "Candidatos ao Senado")
                )
            }
            lower.contains("zero processo") || lower.contains("processos") -> {
                AiMenuResponse(
                    targetRoute = "candidates/processos",
                    menuId = AppConstants.MENU_PRESIDENTE,
                    directAnswer = "Destacando candidatos com Zero Processos Administrativos registrados no histórico de conduta ética.",
                    suggestedQuestions = listOf("Candidatos Ficha Limpa", "Quem disputa a Presidência em 2026?")
                )
            }
            lower.contains("onde votar") || lower.contains("seção") || lower.contains("local") -> {
                AiMenuResponse(
                    targetRoute = "info/locais",
                    menuId = AppConstants.MENU_LOCAIS_VOTACAO,
                    directAnswer = "Você pode consultar seu local de votação e seção cadastrada no aplicativo e-Título ou no portal oficial do TSE.",
                    suggestedQuestions = listOf("Como justificar meu voto?", "Quais documentos levar para votar?")
                )
            }
            lower.contains("quando") || lower.contains("data") || lower.contains("calendário") || lower.contains("prazo") || lower.contains("turno") -> {
                AiMenuResponse(
                    targetRoute = "info/calendario",
                    menuId = AppConstants.MENU_CALENDARIO,
                    directAnswer = "O 1º turno das Eleições Gerais de 2026 ocorre no primeiro domingo de outubro (04/10/2026). O 2º turno ocorrerá no último domingo de outubro (25/10/2026).",
                    suggestedQuestions = listOf("Quando é o segundo turno?", "Até quando posso transferir o título?")
                )
            }
            else -> {
                AiMenuResponse(
                    targetRoute = "menu/home",
                    menuId = "menu_home",
                    directAnswer = "Aqui estão as opções de navegação e filtros para a sua pesquisa sobre as Eleições 2026.",
                    suggestedQuestions = listOf("Quem disputa a Presidência em 2026?", "Como funciona o voto para dois senadores?", "Candidatos a Governador em SP")
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
