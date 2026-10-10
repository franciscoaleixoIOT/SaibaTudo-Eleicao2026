package net.saibatudo.quimica.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Calculate
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import net.saibatudo.quimica.ai.model.Acao
import net.saibatudo.quimica.data.repository.EstadoDados
import net.saibatudo.quimica.ui.components.AvisoBox
import net.saibatudo.quimica.ui.components.Cartao
import net.saibatudo.quimica.ui.components.RespostaView
import net.saibatudo.quimica.ui.viewmodel.Tela
import net.saibatudo.quimica.ui.viewmodel.UiState

/** Início: campo de pergunta, resposta, atalhos e perguntas sugeridas (todas respondíveis pelos dados). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun InicioScreen(
    estado: UiState,
    onPerguntar: (String) -> Unit,
    onLimpar: () -> Unit,
    onAcao: (Acao) -> Unit,
    onAbrir: (Tela) -> Unit,
    onAba: (Tela) -> Unit,
    onAbrirUrl: (String) -> Unit,
    onLimparHistorico: () -> Unit,
    modifier: Modifier = Modifier
) {
    var texto by rememberSaveable { mutableStateOf("") }
    val pronto = estado.dados is EstadoDados.Pronto
    val enviar = { if (texto.isNotBlank() && pronto) { onPerguntar(texto) } }

    LazyColumn(modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("SaibaTudo Química", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
                Text(
                    "Elementos, compostos, cálculos e segurança química, com fonte em cada resposta.",
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        item {
            OutlinedTextField(
                value = texto, onValueChange = { texto = it.take(300) }, modifier = Modifier.fillMaxWidth(),
                label = { Text("Pergunte sobre um elemento, composto ou cálculo") },
                placeholder = { Text("Ex.: massa molar da água") },
                trailingIcon = {
                    IconButton(onClick = enviar, enabled = pronto && texto.isNotBlank()) {
                        Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Enviar pergunta")
                    }
                },
                singleLine = false, maxLines = 3,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { enviar() })
            )
        }
        when (val d = estado.dados) {
            EstadoDados.Carregando -> item { Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) { CircularProgressIndicator(Modifier.padding(4.dp)); Text("Carregando os dados…") } }
            is EstadoDados.Erro -> item { AvisoBox("Não foi possível carregar o pacote de dados: ${d.mensagem}. Tente atualizar em Mais > Sobre os dados.") }
            is EstadoDados.Pronto -> Unit
        }
        if (estado.pensando) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
        estado.resposta?.let { r ->
            item(key = "resposta-" + r.pergunta) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Você perguntou: ${r.pergunta}", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    RespostaView(r.resposta, onAcao = onAcao, onSugestao = { s -> texto = s; onPerguntar(s) }, onAbrirUrl = onAbrirUrl)
                    TextButton(onClick = { onLimpar(); texto = "" }) { Text("Nova pergunta") }
                }
            }
        }
        if (estado.resposta == null) {
            item {
                Text("Atalhos", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.semantics { heading() })
            }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Atalho("Tabela periódica", Icons.Filled.GridView, Modifier.weight(1f)) { onAba(Tela.Tabela) }
                        Atalho("Buscar", Icons.Filled.Search, Modifier.weight(1f)) { onAba(Tela.Busca) }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Atalho("Calculadoras", Icons.Filled.Calculate, Modifier.weight(1f)) { onAba(Tela.Calculadoras) }
                        Atalho("Segurança e GHS", Icons.Filled.Security, Modifier.weight(1f)) { onAbrir(Tela.Seguranca) }
                    }
                }
            }
            if (estado.sugestoes.isNotEmpty()) {
                item { Text("Experimente perguntar", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.semantics { heading() }) }
                item {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        estado.sugestoes.forEach { s -> SuggestionChip(onClick = { texto = s; onPerguntar(s) }, label = { Text(s) }) }
                    }
                }
            }
            val historico = estado.prefs.historicoPerguntas.reversed().take(6)
            if (historico.isNotEmpty()) {
                item {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Perguntas recentes", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.semantics { heading() })
                        TextButton(onClick = onLimparHistorico) { Text("Limpar") }
                    }
                }
                items(historico, key = { "h-$it" }) { h ->
                    Text(
                        h, Modifier.fillMaxWidth().clickable { texto = h; onPerguntar(h) }.padding(vertical = 10.dp),
                        style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary
                    )
                }
            }
            item {
                AvisoBox("Privacidade: suas perguntas são respondidas neste aparelho e não são enviadas a ninguém. A internet só serve para baixar atualizações assinadas dos dados.")
            }
        }
    }
}

@Composable
private fun Atalho(rotulo: String, icone: ImageVector, modifier: Modifier, onClick: () -> Unit) {
    Card(
        onClick = onClick, modifier = modifier, shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
    ) {
        Row(Modifier.padding(14.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Icon(icone, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimaryContainer)
            Text(rotulo, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onPrimaryContainer, fontWeight = FontWeight.SemiBold)
        }
    }
}
