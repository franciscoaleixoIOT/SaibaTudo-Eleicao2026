package net.saibatudo.eleicoes2026

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performScrollTo
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import net.saibatudo.eleicoes2026.data.prefs.UserPreferences
import net.saibatudo.eleicoes2026.ui.MainActivity
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Fumaça em dispositivo: onboarding, carga dos dados oficiais reais e respostas da IA local. */
@RunWith(AndroidJUnit4::class)
class SmokeTest {

    @get:Rule val compose = createEmptyComposeRule()
    private var scenario: ActivityScenario<MainActivity>? = null

    private fun preferencias(p: UserPreferences) = runBlocking {
        val app = ApplicationProvider.getApplicationContext<SaibaTudoApp>()
        app.container.preferencias.atualizar { p }
    }

    @Before fun limpar() {
        // a primeira execução pede a localização aproximada para sugerir o estado: concede antes para o diálogo do
        // sistema não cobrir a tela (no emulador a posição padrão fica fora do Brasil ⇒ escolha manual)
        InstrumentationRegistry.getInstrumentation().uiAutomation.grantRuntimePermission(
            ApplicationProvider.getApplicationContext<SaibaTudoApp>().packageName, android.Manifest.permission.ACCESS_COARSE_LOCATION
        )
        preferencias(UserPreferences(onboardingConcluido = false))
    }

    @After fun fechar() { scenario?.close() }

    @Test
    fun onboardingCarregaDadosOficiaisERespondeComIaLocal() {
        scenario = ActivityScenario.launch(MainActivity::class.java)
        compose.onNodeWithText("Bem-vindo ao SaibaTudo Eleições 2026").assertIsDisplayed()
        compose.onNodeWithText("Começar").performScrollTo().performClick()

        compose.waitUntil(30_000) { compose.onAllNodes(hasText("Quem disputa a Presidência?")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Quem disputa a Presidência?").performClick()

        compose.waitUntil(15_000) { compose.onAllNodes(hasText("13 candidaturas na urna", substring = true)).fetchSemanticsNodes().isNotEmpty() }
        // resposta em tópicos: um item por candidatura (formato em linhas)
        compose.onNodeWithText("LULA (PT)", substring = true).assertIsDisplayed()
        compose.onNodeWithText("Relatar problema nesta resposta").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun pedidoDeRecomendacaoEhRecusado() {
        preferencias(UserPreferences(onboardingConcluido = true))
        scenario = ActivityScenario.launch(MainActivity::class.java)
        compose.waitUntil(30_000) { compose.onAllNodes(hasText("O que você deseja consultar sobre as Eleições 2026?")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("O que você deseja consultar sobre as Eleições 2026?").performTextInput("Em quem devo votar para presidente?")
        compose.onNodeWithContentDescription("Enviar Pergunta à IA").performClick()
        compose.waitUntil(15_000) { compose.onAllNodes(hasText("Não indico, recomendo", substring = true)).fetchSemanticsNodes().isNotEmpty() }
    }
}
