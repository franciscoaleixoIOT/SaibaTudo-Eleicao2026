package net.saibatudo.eleicoes2026.ui.components

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import net.saibatudo.eleicoes2026.core.constants.AppConstants
import net.saibatudo.eleicoes2026.domain.model.FaseEleitoral
import net.saibatudo.eleicoes2026.domain.model.Ufs
import net.saibatudo.eleicoes2026.domain.model.tituloCargo
import net.saibatudo.eleicoes2026.ui.viewmodel.ResultadosUi
import java.text.NumberFormat
import java.util.Locale

/**
 * Resultados e apuração: números do JSON público do TSE (resultados.tse.jus.br), EXATAMENTE como publicados.
 * Atualiza a cada 60 s enquanto aberto. Ordem = votos (ordem oficial de totalização); antes da apuração, ordem por número.
 */
@Composable
fun ResultadosDialog(
    estado: ResultadosUi,
    fase: FaseEleitoral,
    ufPadrao: String?,
    onSelecionar: (cargo: String, uf: String?, turno: Int) -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val inteiro = NumberFormat.getIntegerInstance(Locale.forLanguageTag("pt-BR"))

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(modifier = Modifier.fillMaxWidth(0.97f).padding(8.dp), shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.EmojiEvents, contentDescription = null, tint = MaterialTheme.colorScheme.secondary, modifier = Modifier.size(22.dp))
                    Spacer(Modifier.width(8.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Resultados e apuração", fontSize = 17.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                        Text("Dados do TSE, como divulgados", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    IconButton(onClick = onDismiss) { Icon(Icons.Default.Close, contentDescription = "Fechar resultados") }
                }
                Spacer(Modifier.height(8.dp))

                // Cargo
                val cargosDisponiveis = if (estado.uf == "DF") {
                    listOf("PRESIDENTE", "GOVERNADOR", "SENADOR", "DEPUTADO_FEDERAL", "DEPUTADO_DISTRITAL")
                } else {
                    listOf("PRESIDENTE", "GOVERNADOR", "SENADOR", "DEPUTADO_FEDERAL", "DEPUTADO_ESTADUAL")
                }
                Row(modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    cargosDisponiveis.forEach { c ->
                        FilterChip(selected = estado.cargo == c, onClick = { onSelecionar(c, estado.uf, estado.turno) }, label = { Text(tituloCargo(c)) })
                    }
                }
                // Turno
                val temSegundoTurno = estado.cargo in setOf("PRESIDENTE", "GOVERNADOR")
                Row(modifier = Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = estado.turno == 1, onClick = { onSelecionar(estado.cargo, estado.uf, 1) }, label = { Text("1º turno") })
                    FilterChip(
                        selected = estado.turno == 2, onClick = { onSelecionar(estado.cargo, estado.uf, 2) }, label = { Text("2º turno") },
                        enabled = temSegundoTurno && fase != FaseEleitoral.PRE_ELEICAO && fase != FaseEleitoral.DIA_1T
                    )
                }
                // UF (Governador/Senador)
                if (estado.cargo != "PRESIDENTE") {
                    Row(modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Ufs.SIGLAS.forEach { uf ->
                            FilterChip(selected = estado.uf == uf, onClick = { onSelecionar(estado.cargo, uf, estado.turno) }, label = { Text(uf, fontSize = 12.sp) })
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
                HorizontalDivider()

                val ap = estado.apuracao
                when {
                    ap == null && estado.carregando -> Row(Modifier.fillMaxWidth().padding(24.dp), horizontalArrangement = Arrangement.Center) { CircularProgressIndicator() }
                    ap == null -> Text(
                        if (estado.indisponivel) "Apuração ainda não disponível para esta seleção no TSE (ou sem conexão). Tente novamente em instantes."
                        else "Selecione o cargo.",
                        fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 16.dp)
                    )
                    else -> {
                        val linhas = if (ap.temVotos) ap.linhas.sortedByDescending { it.votos } else ap.linhas.sortedBy { it.numero.toIntOrNull() ?: Int.MAX_VALUE }
                        Text(
                            buildString {
                                append(if (ap.totalizacaoFinal) "Totalização final" else if (ap.temVotos) "Apuração em andamento" else "Aguardando o início da apuração")
                                ap.secoesTotalizadasPct?.takeIf { ap.temVotos }?.let { append(" • $it% das seções totalizadas") }
                                append("\nPublicado pelo TSE em ${ap.geradoEm}")
                            },
                            fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 8.dp)
                        )
                        LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 380.dp)) {
                            items(linhas, key = { (it.sqCandidato ?: it.numero) + it.nome }) { l ->
                                Row(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Text(l.nome, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                                            if (l.eleito || l.segundoTurno) {
                                                Spacer(Modifier.width(6.dp))
                                                Etiqueta(if (l.eleito) "Eleito" else "2º turno", MaterialTheme.colorScheme.secondaryContainer, MaterialTheme.colorScheme.onSecondaryContainer)
                                            }
                                        }
                                        Text("${l.partido} • nº ${l.numero}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    Column(horizontalAlignment = Alignment.End) {
                                        Text(if (ap.temVotos) "${inteiro.format(l.votos)} votos" else "—", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
                                        l.percentual?.takeIf { ap.temVotos }?.let { Text("$it%", fontSize = 11.sp, color = MaterialTheme.colorScheme.primary) }
                                    }
                                }
                                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
                            }
                        }
                    }
                }
                if (estado.carregando && estado.apuracao != null) {
                    Text("Atualizando…", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    "Os números são exibidos como publicados pelo TSE e atualizados a cada ~1 minuto. Resultado definitivo: site do TSE.",
                    fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                TextButton(onClick = {
                    try { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(AppConstants.URL_RESULTADOS_TSE))) } catch (_: Exception) { /* sem navegador */ }
                }) { Text("Abrir resultados.tse.jus.br", fontSize = 12.sp) }
            }
        }
    }
}
