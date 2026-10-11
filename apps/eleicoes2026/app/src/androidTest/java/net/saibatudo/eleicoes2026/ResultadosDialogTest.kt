package net.saibatudo.eleicoes2026

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import net.saibatudo.eleicoes2026.domain.model.ApuracaoCargo
import net.saibatudo.eleicoes2026.domain.model.FaseEleitoral
import net.saibatudo.eleicoes2026.domain.model.LinhaApuracao
import net.saibatudo.eleicoes2026.ui.components.ResultadosDialog
import net.saibatudo.eleicoes2026.ui.theme.SaibaTudoTheme
import net.saibatudo.eleicoes2026.ui.viewmodel.ResultadosUi
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Renderização da tela de apuração com números como o TSE publica (ordem por votos, eleito, % de seções). */
@RunWith(AndroidJUnit4::class)
class ResultadosDialogTest {
    @get:Rule val compose = createComposeRule()

    private val apuracao = ApuracaoCargo(
        "PRESIDENTE", "BR", 1, "04/10/2026 19:45:10", "50,00", false,
        listOf(
            LinhaApuracao("2", "22", "FLAVIO BOLSONARO", "PL", 1_100_000, "41,07", false),
            LinhaApuracao("1", "13", "LULA", "PT", 1_234_567, "46,10", false),
            LinhaApuracao("3", "30", "ZEMA", "NOVO", 343_000, "12,83", false)
        )
    )

    @Test
    fun mostraApuracaoEmAndamentoComVotosEPercentuais() {
        compose.setContent {
            SaibaTudoTheme {
                ResultadosDialog(ResultadosUi(apuracao = apuracao), FaseEleitoral.DIA_1T, "SP", { _, _, _ -> }, {})
            }
        }
        compose.onNodeWithText("Resultados e apuração").assertIsDisplayed()
        compose.onNodeWithText("1.234.567 votos").assertIsDisplayed()
        compose.onNodeWithText("46,10%").assertIsDisplayed()
        compose.onNodeWithText("Apuração em andamento", substring = true).assertIsDisplayed()
        compose.onNodeWithText("Publicado pelo TSE em 04/10/2026 19:45:10", substring = true).assertIsDisplayed()
    }

    @Test
    fun antesDaApuracaoMostraAguardandoSemVotos() {
        val zerada = apuracao.copy(linhas = apuracao.linhas.map { it.copy(votos = 0, percentual = "0,00") })
        compose.setContent {
            SaibaTudoTheme { ResultadosDialog(ResultadosUi(apuracao = zerada), FaseEleitoral.DIA_1T, null, { _, _, _ -> }, {}) }
        }
        compose.onNodeWithText("Aguardando o início da apuração", substring = true).assertIsDisplayed()
    }
}
