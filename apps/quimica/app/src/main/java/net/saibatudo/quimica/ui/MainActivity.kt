package net.saibatudo.quimica.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import kotlinx.coroutines.launch
import net.saibatudo.quimica.SaibaTudoApp
import net.saibatudo.quimica.ui.screens.MainAppScreen
import net.saibatudo.quimica.ui.theme.SaibaTudoTheme
import net.saibatudo.quimica.ui.viewmodel.MainViewModel

class MainActivity : ComponentActivity() {

    private var vmRef: MainViewModel? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = (application as SaibaTudoApp).container

        setContent {
            val vm: MainViewModel = viewModel(
                factory = viewModelFactory {
                    initializer { MainViewModel(dados = container.dados, prefs = container.preferencias, atualizacoes = container.atualizacoes) }
                }
            )
            vmRef = vm
            val estado by vm.estado.collectAsState()
            SaibaTudoTheme(tema = estado.prefs.tema, escalaFonte = estado.prefs.tamanhoFonte.fator) {
                MainAppScreen(vm)
            }
        }

        // Ao voltar para o app, confere se há dados novos (respeita o intervalo do manifesto e a economia de dados)
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.RESUMED) { vmRef?.verificarAtualizacaoAoRetomar() }
        }
    }
}
