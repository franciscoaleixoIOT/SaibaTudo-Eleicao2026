package com.example.saibatudo_eleicao2026

import com.example.saibatudo_eleicao2026.ai.engine.LocalMockAiInferenceEngine
import com.example.saibatudo_eleicao2026.core.constants.AppConstants
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class AiInferenceEngineTest {

    private lateinit var aiEngine: LocalMockAiInferenceEngine

    @Before
    fun setup() {
        aiEngine = LocalMockAiInferenceEngine()
    }

    @Test
    fun parseUserQuery_presidentialQuery_routesToPresidentMenu() = runBlocking {
        val result = aiEngine.parseUserQuery("Quero ver os candidatos a presidente do Brasil")

        assertEquals(AppConstants.MENU_PRESIDENTE, result.menuId)
        assertEquals("candidates/presidente", result.targetRoute)
        assertEquals("PRESIDENTE", result.filters.cargo)
        assertNotNull(result.directAnswer)
        assertTrue(result.suggestedQuestions.isNotEmpty())
    }

    @Test
    fun parseUserQuery_governorWithState_extractsUfAndFilters() = runBlocking {
        val result = aiEngine.parseUserQuery("Quem são os candidatos a governador em sp?")

        assertEquals(AppConstants.MENU_GOVERNADOR, result.menuId)
        assertEquals("GOVERNADOR", result.filters.cargo)
        assertEquals("SP", result.filters.estadoUf)
    }

    @Test
    fun parseUserQuery_votingLocationQuery_routesToLocationInfo() = runBlocking {
        val result = aiEngine.parseUserQuery("Onde posso consultar meu local de votação?")

        assertEquals(AppConstants.MENU_LOCAIS_VOTACAO, result.menuId)
        assertEquals("info/locais", result.targetRoute)
        assertTrue(result.directAnswer!!.contains("e-Título", ignoreCase = true))
    }
}
