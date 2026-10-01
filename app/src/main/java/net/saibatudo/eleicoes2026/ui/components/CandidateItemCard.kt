package net.saibatudo.eleicoes2026.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.HistoryEdu
import androidx.compose.material.icons.filled.Policy
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import net.saibatudo.eleicoes2026.domain.model.Candidate

/** Cartão de candidatura. Exibe fatos oficiais com rótulos neutros; nunca ranqueia nem qualifica o candidato. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CandidateItemCard(
    candidate: Candidate,
    onCandidateClick: (Candidate) -> Unit,
    permitirFotoRemota: Boolean = true,
    modifier: Modifier = Modifier
) {
    Card(
        onClick = { onCandidateClick(candidate) },
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                FotoCandidato(candidate, 54.dp, permitirFotoRemota)
                Spacer(modifier = Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = candidate.nomeUrna,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Nº ${candidate.numero}",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                    Text(
                        text = "${candidate.cargo} • ${candidate.partido}" +
                            (if (candidate.estadoUf != "BR") " (${candidate.estadoUf})" else " (nacional)"),
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    val sub = listOfNotNull(
                        candidate.ocupacao?.lowercase()?.replaceFirstChar { it.uppercase() },
                        candidate.idade?.let { "$it anos" }
                    ).joinToString(" • ")
                    if (sub.isNotEmpty()) {
                        Text(sub, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }

            Spacer(modifier = Modifier.size(8.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                val apta = candidate.elegibilidade.apta
                val corSituacao = when (apta) {
                    true -> MaterialTheme.colorScheme.primaryContainer to MaterialTheme.colorScheme.onPrimaryContainer
                    false -> MaterialTheme.colorScheme.error.copy(alpha = 0.16f) to MaterialTheme.colorScheme.onSurface
                    null -> MaterialTheme.colorScheme.surfaceVariant to MaterialTheme.colorScheme.onSurface
                }
                Etiqueta(candidate.elegibilidade.rotulo, corSituacao.first, corSituacao.second) {
                    Icon(Icons.Default.Policy, contentDescription = null, tint = corSituacao.second, modifier = Modifier.size(12.dp))
                }
                if (!candidate.naUrna) {
                    Etiqueta("Fora da urna", MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.colorScheme.onSurface)
                }
                if (candidate.resultado?.eleito == true) {
                    Etiqueta("Eleito", MaterialTheme.colorScheme.secondaryContainer, MaterialTheme.colorScheme.onSecondaryContainer) {
                        Icon(Icons.Default.EmojiEvents, contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSecondaryContainer, modifier = Modifier.size(12.dp))
                    }
                }
                if (candidate.eleitoMesmoCargo) {
                    Etiqueta("Já eleito para este cargo (histórico TSE)", MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.colorScheme.onSurface) {
                        Icon(Icons.Default.HistoryEdu, contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(12.dp))
                    }
                } else if (candidate.vezesEleito == 0 && candidate.eleicoesDisputadas > 0) {
                    Etiqueta("Nunca eleito (histórico TSE)", MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.colorScheme.onSurface)
                }
                if (candidate.temPlanoGoverno) {
                    Etiqueta("Plano de governo registrado", MaterialTheme.colorScheme.primary.copy(alpha = 0.14f), MaterialTheme.colorScheme.primary)
                }
            }
        }
    }
}

@Composable
internal fun Etiqueta(
    texto: String,
    fundo: Color,
    conteudo: Color,
    icone: (@Composable () -> Unit)? = null
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(fundo)
            .padding(horizontal = 8.dp, vertical = 3.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (icone != null) {
                icone()
                Spacer(modifier = Modifier.width(4.dp))
            }
            Text(text = texto, fontSize = 11.sp, fontWeight = FontWeight.Medium, color = conteudo)
        }
    }
}
