package net.saibatudo.eleicoes2026.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import net.saibatudo.eleicoes2026.BuildConfig
import net.saibatudo.eleicoes2026.core.constants.AppConstants
import net.saibatudo.eleicoes2026.data.prefs.TamanhoFonte
import net.saibatudo.eleicoes2026.data.prefs.TemaApp
import net.saibatudo.eleicoes2026.data.prefs.UserPreferences
import net.saibatudo.eleicoes2026.domain.model.Ufs
import net.saibatudo.eleicoes2026.ui.theme.NavyAccent

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    prefs: UserPreferences,
    onAtualizar: ((UserPreferences) -> UserPreferences) -> Unit,
    onEscolherUf: () -> Unit,
    onSobreDados: () -> Unit,
    onLimparHistorico: () -> Unit = {},
    onVoltar: () -> Unit
) {
    val context = LocalContext.current
    fun abrir(url: String) {
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (_: Exception) { /* sem navegador */ }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Configurações", color = androidx.compose.ui.graphics.Color.White, fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onVoltar) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Voltar", tint = androidx.compose.ui.graphics.Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = NavyAccent)
            )
        }
    ) { inner ->
        Column(
            modifier = Modifier.fillMaxSize().padding(inner).verticalScroll(rememberScrollState()).padding(16.dp)
        ) {
            Grupo("Aparência")
            Opcao("Tema") {
                TemaApp.entries.forEach { t ->
                    Radio(t.rotulo, prefs.tema == t) { onAtualizar { it.copy(tema = t) } }
                }
            }
            Opcao("Tamanho do texto") {
                TamanhoFonte.entries.forEach { f ->
                    Radio(f.rotulo, prefs.tamanhoFonte == f) { onAtualizar { it.copy(tamanhoFonte = f) } }
                }
            }

            Grupo("Consulta")
            Linha(
                titulo = "Meu estado",
                detalhe = prefs.ufPadrao?.let { "${Ufs.NOMES[it] ?: it} — toque para alterar" } ?: "Nenhum — toque para escolher ou usar a localização aproximada",
                onClick = onEscolherUf
            )
            Chave("Começar filtrado pelo meu estado", "Mostra seu estado e as candidaturas nacionais ao abrir.", prefs.filtrarPorMinhaUf && prefs.ufPadrao != null, prefs.ufPadrao != null) { v ->
                onAtualizar { it.copy(filtrarPorMinhaUf = v) }
            }
            Chave("Mostrar apenas candidaturas na urna", "Oculta renúncias, indeferimentos e outros registros fora da urna.", prefs.mostrarApenasNaUrna) { v ->
                onAtualizar { it.copy(mostrarApenasNaUrna = v) }
            }
            Text("Pergunta inicial padrão", fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.padding(top = 8.dp))
            // Estado local: o DataStore grava em segundo plano e não devolve o texto ao campo (evita o cursor "pular")
            var perguntaInicial by rememberSaveable { mutableStateOf(prefs.perguntaInicial) }
            val foco = LocalFocusManager.current
            // Quebra linha e cresce até 4 linhas (texto longo fica todo visível); "Enter" do teclado conclui em vez de pular linha
            OutlinedTextField(
                value = perguntaInicial,
                onValueChange = { v ->
                    if ('\n' in v && v.replace("\n", "") == perguntaInicial) { foco.clearFocus(); return@OutlinedTextField }
                    val texto = v.replace('\n', ' ').take(120)
                    perguntaInicial = texto
                    onAtualizar { it.copy(perguntaInicial = texto) }
                },
                placeholder = { Text(AppConstants.PERGUNTA_INICIAL_PADRAO, fontSize = 13.sp) },
                supportingText = { Text("${perguntaInicial.length}/120", fontSize = 11.sp) },
                modifier = Modifier.fillMaxWidth(), singleLine = false, minLines = 1, maxLines = 4,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done, capitalization = KeyboardCapitalization.Sentences),
                keyboardActions = KeyboardActions(onDone = { foco.clearFocus() })
            )
            Chave("Fazer essa pergunta ao abrir o app", "A resposta aparece assim que os dados carregam.",
                prefs.executarPerguntaAoAbrir && perguntaInicial.isNotBlank(), perguntaInicial.isNotBlank()) { v ->
                onAtualizar { it.copy(executarPerguntaAoAbrir = v) }
            }

            Grupo("Dados e privacidade")
            Chave("Economia de dados", "Atualiza os dados só em Wi-Fi e não baixa fotos pela rede móvel.", prefs.economiaDeDados) { v ->
                onAtualizar { it.copy(economiaDeDados = v) }
            }
            Chave(
                "IA na nuvem automática",
                "Desligada por padrão: quando o app não entende uma pergunta, aparece o botão \"Perguntar à IA na nuvem\" para enviar só aquela. " +
                    "Ligada, isso acontece automaticamente. Vai só o texto da pergunta, com um código aleatório da instalação; as respostas vêm sempre dos dados oficiais.",
                prefs.iaNuvem
            ) { v -> onAtualizar { it.copy(iaNuvem = v) } }
            val qtdHist = prefs.historicoPerguntas.size
            Linha(
                "Limpar histórico de perguntas",
                if (qtdHist > 0) "$qtdHist pergunta(s) salva(s) no aparelho — toque para apagar" else "Nenhuma pergunta salva no aparelho",
                onClick = onLimparHistorico
            )
            Linha("Sobre os dados", "Fontes, versão, atualização e limitações", onSobreDados)
            Linha("Política de privacidade", AppConstants.URL_PRIVACIDADE) { abrir(AppConstants.URL_PRIVACIDADE) }

            Grupo("Sobre o app")
            Linha("Código-fonte (MIT) e canal de correções", AppConstants.URL_CODIGO_FONTE) { abrir(AppConstants.URL_ISSUES) }
            Text(AppConstants.AVISO_NEUTRALIDADE, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 8.dp))
            Text(
                "Dados: TSE – Dados Abertos (${AppConstants.LICENCA_DADOS}). Versão ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE}).",
                fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun Grupo(titulo: String) {
    Spacer(Modifier.height(14.dp))
    Text(titulo, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
    HorizontalDivider(modifier = Modifier.padding(vertical = 6.dp))
}

@Composable
private fun Opcao(titulo: String, conteudo: @Composable () -> Unit) {
    Text(titulo, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = MaterialTheme.colorScheme.onBackground, modifier = Modifier.padding(top = 4.dp))
    conteudo()
}

@Composable
private fun Radio(rotulo: String, selecionado: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().selectable(selected = selecionado, onClick = onClick, role = Role.RadioButton).padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RadioButton(selected = selecionado, onClick = null)
        Spacer(Modifier.width(8.dp))
        Text(rotulo, fontSize = 14.sp, color = MaterialTheme.colorScheme.onBackground)
    }
}

@Composable
private fun Chave(titulo: String, detalhe: String, ligado: Boolean, habilitado: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = Modifier.weight(1f)) {
            Text(titulo, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = MaterialTheme.colorScheme.onBackground)
            Text(detalhe, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.width(12.dp))
        Switch(checked = ligado, onCheckedChange = onChange, enabled = habilitado)
    }
}

@Composable
private fun Linha(titulo: String, detalhe: String, onClick: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 10.dp)) {
        Text(titulo, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = MaterialTheme.colorScheme.onBackground)
        Text(detalhe, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
