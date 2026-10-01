package net.saibatudo.eleicoes2026.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import net.saibatudo.eleicoes2026.domain.model.Ufs

/** Seletor de UF ("Meu estado"). A UF nunca é detectada automaticamente: é uma escolha do usuário. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun EscolherUfDialog(
    atual: String?,
    permitirNenhuma: Boolean = true,
    onEscolher: (String?) -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Escolha seu estado", fontWeight = FontWeight.Bold) },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                Text(
                    "O app começa mostrando as candidaturas do seu estado. Você pode mudar a qualquer momento e a escolha fica só neste aparelho.",
                    fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(10.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Ufs.NOMES.forEach { (sigla, nome) ->
                        FilterChip(
                            selected = sigla == atual,
                            onClick = { onEscolher(sigla) },
                            label = { Text("$sigla · $nome", fontSize = 12.sp) }
                        )
                    }
                }
            }
        },
        confirmButton = {
            if (permitirNenhuma) TextButton(onClick = { onEscolher(null) }) { Text("Ver o Brasil todo") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } }
    )
}

/** Relato de resposta incorreta ou inadequada (exigência de transparência para respostas geradas por IA). */
@Composable
fun RelatarRespostaDialog(
    enviado: Boolean?,
    onEnviar: (String) -> Unit,
    onDismiss: () -> Unit
) {
    var comentario by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Relatar problema na resposta", fontWeight = FontWeight.Bold) },
        text = {
            Column {
                Text(
                    "Será enviada à equipe a sua pergunta, a resposta exibida, a versão do app e a dos dados — sem nome, " +
                        "e-mail ou localização. O relato fica em um registro público de correções no GitHub.",
                    fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = comentario, onValueChange = { comentario = it.take(500) },
                    label = { Text("O que está errado? (opcional)") },
                    modifier = Modifier.fillMaxWidth(), minLines = 2, maxLines = 4
                )
                if (enviado == false) {
                    Spacer(Modifier.height(6.dp))
                    Text("Não foi possível enviar agora. Verifique a conexão e tente novamente.", fontSize = 12.sp, color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = { Button(onClick = { onEnviar(comentario) }) { Text("Enviar relato") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } }
    )
}
