package net.saibatudo.quimica.ui.screens

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Calculate
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.core.net.toUri
import net.saibatudo.quimica.data.repository.EstadoDados
import net.saibatudo.quimica.ui.viewmodel.MainViewModel
import net.saibatudo.quimica.ui.viewmodel.Tela
import net.saibatudo.quimica.ui.viewmodel.aba

private data class ItemAba(val tela: Tela, val rotulo: String, val icone: ImageVector)

private val ABAS = listOf(
    ItemAba(Tela.Inicio, "Início", Icons.Filled.Home),
    ItemAba(Tela.Tabela, "Tabela", Icons.Filled.GridView),
    ItemAba(Tela.Busca, "Buscar", Icons.Filled.Search),
    ItemAba(Tela.Calculadoras, "Calcular", Icons.Filled.Calculate),
    ItemAba(Tela.Mais, "Mais", Icons.Filled.MoreHoriz)
)

/** Abre um endereço https no navegador (nunca outro esquema). */
fun abrirUrl(contexto: Context, url: String) {
    if (!url.startsWith("https://")) return
    try {
        contexto.startActivity(Intent(Intent.ACTION_VIEW, url.toUri()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: ActivityNotFoundException) {
        // sem navegador instalado: nada a fazer
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainAppScreen(vm: MainViewModel) {
    val estado by vm.estado.collectAsState()
    val pilha by vm.pilha.collectAsState()
    val contexto = LocalContext.current
    val tela = pilha.last()
    val pacote = (estado.dados as? EstadoDados.Pronto)?.pacote
    val aberto: (String) -> Unit = { abrirUrl(contexto, it) }

    BackHandler(enabled = pilha.size > 1 || tela != Tela.Inicio) {
        if (!vm.voltar()) vm.irParaAba(Tela.Inicio)
    }

    Scaffold(
        topBar = {
            if (pilha.size > 1) {
                TopAppBar(
                    title = {
                        Text(
                            when (tela) {
                                is Tela.Elemento -> pacote?.porZ?.get(tela.z)?.nome ?: "Elemento"
                                is Tela.Composto -> pacote?.indice?.entrada(tela.cid)?.nomes?.firstOrNull() ?: "Composto"
                                is Tela.Calculadora -> tela.tipo.rotulo
                                Tela.Seguranca -> "Segurança e GHS"
                                Tela.Sobre -> "Sobre os dados"
                                Tela.Privacidade -> "Privacidade"
                                Tela.Configuracoes -> "Configurações"
                                else -> "SaibaTudo Química"
                            }
                        )
                    },
                    navigationIcon = { IconButton(onClick = { vm.voltar() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Voltar") } }
                )
            }
        },
        bottomBar = {
            NavigationBar {
                ABAS.forEach { item ->
                    NavigationBarItem(
                        selected = tela.aba() == item.tela,
                        onClick = { vm.irParaAba(item.tela) },
                        icon = { Icon(item.icone, contentDescription = null) },
                        label = { Text(item.rotulo) }
                    )
                }
            }
        }
    ) { padding ->
        val m = Modifier.padding(padding)
        when (tela) {
            Tela.Inicio -> InicioScreen(
                estado = estado, onPerguntar = vm::perguntar, onLimpar = vm::limparResposta, onAcao = { vm.executar(it, aberto) }, onAbrir = vm::abrir,
                onAba = vm::irParaAba, onAbrirUrl = aberto, onLimparHistorico = vm::limparHistorico, modifier = m
            )
            Tela.Tabela -> TabelaScreen(pacote, onAbrirElemento = { vm.abrir(Tela.Elemento(it)) }, modifier = m)
            Tela.Busca -> BuscaScreen(
                buscar = vm::buscar, pronto = pacote != null, onAbrirElemento = { vm.abrir(Tela.Elemento(it)) },
                onAbrirComposto = { vm.abrir(Tela.Composto(it)) }, modifier = m
            )
            Tela.Calculadoras -> CalculadorasScreen(onAbrir = { vm.abrir(Tela.Calculadora(it)) }, modifier = m)
            Tela.Mais -> MaisScreen(onAbrir = vm::abrir, modifier = m)
            is Tela.Elemento -> ElementoScreen(tela.z, pacote, estado.prefs.nivel, onAbrirElemento = { vm.abrir(Tela.Elemento(it)) }, onAbrirUrl = aberto, modifier = m)
            is Tela.Composto -> CompostoScreen(
                tela.cid, pacote, estado.prefs.nivel, carregar = vm::composto, onAbrirUrl = aberto, onAbrirSeguranca = { vm.abrir(Tela.Seguranca) }, modifier = m
            )
            is Tela.Calculadora -> CalculadoraTela(tela.tipo, tela.preenchimento, pacote, m)
            Tela.Seguranca -> SegurancaScreen(pacote, onAbrirUrl = aberto, modifier = m)
            Tela.Sobre -> SobreDadosScreen(pacote, estado.prefs, estado.atualizacao, onAtualizar = vm::atualizarAgora, onAbrirUrl = aberto, modifier = m)
            Tela.Privacidade -> PrivacidadeScreen(onAbrirUrl = aberto, onLimparHistorico = vm::limparHistorico, modifier = m)
            Tela.Configuracoes -> ConfiguracoesScreen(
                estado.prefs, onTema = vm::definirTema, onFonte = vm::definirFonte, onNivel = vm::definirNivel, onEconomia = vm::definirEconomia, modifier = m
            )
        }
    }
}
