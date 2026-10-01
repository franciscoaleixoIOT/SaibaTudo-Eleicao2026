package net.saibatudo.eleicoes2026.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import kotlinx.coroutines.launch
import net.saibatudo.eleicoes2026.SaibaTudoApp
import net.saibatudo.eleicoes2026.ui.screens.MainAppScreen
import net.saibatudo.eleicoes2026.ui.screens.OnboardingScreen
import net.saibatudo.eleicoes2026.ui.theme.SaibaTudoTheme
import net.saibatudo.eleicoes2026.ui.viewmodel.MainViewModel

class MainActivity : ComponentActivity() {

    private var vmRef: MainViewModel? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = (application as SaibaTudoApp).container

        setContent {
            val vm: MainViewModel = viewModel(
                factory = viewModelFactory {
                    initializer {
                        MainViewModel(
                            dados = container.dados,
                            prefs = container.preferencias,
                            motorIa = container.motorIa,
                            atualizacoes = container.atualizacoes,
                            relatorios = container.relatorios
                        )
                    }
                }
            )
            vmRef = vm
            val estado by vm.estado.collectAsState()
            val onboarding by vm.onboardingConcluido.collectAsState()

            SaibaTudoTheme(tema = estado.prefs.tema, escalaFonte = estado.prefs.tamanhoFonte.fator) {
                when (onboarding) {
                    null -> Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                    }
                    false -> OnboardingScreen(onConcluir = vm::concluirOnboarding)
                    true -> MainAppScreen(vm)
                }
            }
        }

        // Ao voltar para o app, confere se há dados novos (respeita intervalo mínimo e economia de dados)
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.RESUMED) { vmRef?.verificarAtualizacaoAoRetomar() }
        }
    }
}
