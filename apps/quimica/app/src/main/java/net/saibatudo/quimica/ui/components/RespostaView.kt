package net.saibatudo.quimica.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import net.saibatudo.quimica.ai.model.Acao
import net.saibatudo.quimica.ai.model.Bloco
import net.saibatudo.quimica.ai.model.OrigemResposta
import net.saibatudo.quimica.ai.model.Resposta

/** Uma resposta do motor local: título, blocos, fontes, atalhos e perguntas sugeridas. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun RespostaView(
    resposta: Resposta,
    onAcao: (Acao) -> Unit,
    onSugestao: (String) -> Unit,
    onAbrirUrl: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val area = LocalClipboardManager.current
    Cartao(modifier) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                resposta.titulo, Modifier.weight(1f).semantics { heading() }, style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = if (resposta.recusa) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
            )
            IconButton(onClick = { area.setText(AnnotatedString(resposta.texto())) }) {
                Icon(Icons.Filled.ContentCopy, contentDescription = "Copiar a resposta")
            }
        }
        resposta.blocos.forEach { BlocoView(it, onAbrirUrl) }
        FontesView(resposta.fontes, onAbrirUrl)
        Text(
            if (resposta.origem == OrigemResposta.LOCAL) "Calculado no aparelho a partir do pacote de dados assinado. Nenhuma IA gerou estes números." else resposta.origem.rotulo,
            style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        if (resposta.acoes.isNotEmpty()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                resposta.acoes.forEach { a -> AssistChip(onClick = { onAcao(a) }, label = { Text(a.rotulo) }) }
            }
        }
        if (resposta.sugestoes.isNotEmpty()) {
            Text("Experimente perguntar:", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                resposta.sugestoes.forEach { s -> SuggestionChip(onClick = { onSugestao(s) }, label = { Text(s) }) }
            }
        }
    }
}

@Composable
fun BlocoView(bloco: Bloco, onAbrirUrl: (String) -> Unit) {
    when (bloco) {
        is Bloco.Paragrafo -> if (bloco.texto.isNotBlank()) Text(bloco.texto, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
        is Bloco.Campo -> if (bloco.valor.isNotBlank()) LinhaCampo(bloco.rotulo, bloco.valor)
        is Bloco.Lista -> Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            bloco.itens.forEach { item ->
                Row {
                    Text("•", Modifier.width(16.dp), color = MaterialTheme.colorScheme.primary)
                    Text(item, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
                }
            }
        }
        is Bloco.Passos -> PassosView(bloco.titulo, bloco.passos)
        is Bloco.Destaque -> Text(
            bloco.texto, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(vertical = 2.dp)
        )
        is Bloco.Estrutura -> MoleculaView(bloco.smiles, bloco.descricao)
        is Bloco.Aviso -> AvisoBox(bloco.texto)
        is Bloco.GhsBloco -> GhsView(bloco.ghs, bloco.textosH)
    }
}

/** Passo a passo recolhível: começa aberto, para a pessoa ver a conta. */
@Composable
fun PassosView(titulo: String, passos: List<String>) {
    var aberto by rememberSaveable { mutableStateOf(true) }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Text(titulo, Modifier.semantics { heading() }, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            TextButton(onClick = { aberto = !aberto }) {
                Text(if (aberto) "Recolher" else "Mostrar")
                Icon(if (aberto) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore, contentDescription = null)
            }
        }
        if (aberto) {
            passos.forEachIndexed { i, p ->
                Row {
                    Text("${i + 1}.", Modifier.width(24.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                    Text(p, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
                }
            }
        }
    }
}
