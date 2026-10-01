package com.example.saibatudo_eleicao2026.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.HistoryEdu
import androidx.compose.material.icons.filled.Policy
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.example.saibatudo_eleicao2026.domain.model.Candidate
import com.example.saibatudo_eleicao2026.ui.theme.StatusApproved

@Composable
fun CandidateItemCard(
    candidate: Candidate,
    onCandidateClick: (Candidate) -> Unit,
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
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            // Foto oficial (CDN TSE) ou badge com número na urna
            if (candidate.fotoLocal != null) {
                AsyncImage(
                    model = "file:///android_asset/${candidate.fotoLocal}",
                    contentDescription = "Foto oficial do candidato ${candidate.nomeUrna}",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(54.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                )
            } else {
                Box(
                    modifier = Modifier
                        .size(54.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primaryContainer),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = candidate.numero,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                        fontWeight = FontWeight.Bold,
                        fontSize = if (candidate.numero.length >= 4) 14.sp else 17.sp
                    )
                }
            }

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
                    Spacer(modifier = Modifier.width(6.dp))
                    if (candidate.situacaoCandidatura.startsWith("DEFERIDO", ignoreCase = true)) {
                        Icon(
                            imageVector = Icons.Default.CheckCircle,
                            contentDescription = "Candidatura deferida pelo TSE",
                            tint = StatusApproved,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                    Text(
                        text = "Nº ${candidate.numero}",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                }

                Text(
                    text = "${candidate.cargo.replaceFirstChar { it.uppercase() }} • ${candidate.partido}" +
                        " (${candidate.estadoUf}${if (candidate.regiao.isNotBlank()) " - ${candidate.regiao}" else ""})",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (candidate.ocupacao != null || candidate.idade != null) {
                    Text(
                        text = listOfNotNull(
                            candidate.ocupacao?.lowercase()?.replaceFirstChar { it.uppercase() },
                            candidate.idade?.let { "$it anos" }
                        ).joinToString(" • "),
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                if (!candidate.fichaLimpa) {
                    Text(
                        text = "⚠ Com fundamentos legais registrados no TSE",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }
        }

        Column(modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 14.dp)) {
            Spacer(modifier = Modifier.height(2.dp))

            // Badges: Situação oficial / Fundamentos legais / Mandatos e Reeleição
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                val procColor = if (candidate.processosAdministrativos == 0) {
                    MaterialTheme.colorScheme.onPrimaryContainer
                } else {
                    MaterialTheme.colorScheme.onSecondaryContainer
                }
                val procBg = if (candidate.processosAdministrativos == 0) {
                    MaterialTheme.colorScheme.primaryContainer
                } else {
                    MaterialTheme.colorScheme.secondaryContainer
                }
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(procBg)
                        .padding(horizontal = 8.dp, vertical = 3.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Default.Policy,
                            contentDescription = null,
                            tint = procColor,
                            modifier = Modifier.size(12.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = if (candidate.processosAdministrativos == 0) "Zero Processos Adm." else "${candidate.processosAdministrativos} Fundamento(s) legal(is)",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium,
                            color = procColor
                        )
                    }
                }

                // Mandatos Anteriores (histórico oficial de candidaturas do TSE)
                val mandatoLabel = when {
                    candidate.reeleicao -> "Tentando Reeleição"
                    candidate.mandatosAnteriores == 0 -> "1º Mandato (Estreante)"
                    else -> "${candidate.mandatosAnteriores} Mandato(s) Anterior(es)"
                }
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .padding(horizontal = 8.dp, vertical = 3.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Default.HistoryEdu,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(12.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = mandatoLabel,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }

            if (candidate.coligacao != null || candidate.federacao != null) {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = listOfNotNull(
                        candidate.federacao?.let { "Federação: $it" },
                        candidate.coligacao?.let { "Coligação: $it" }
                    ).joinToString(" • "),
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }

            // Resumo do PLANO DE GOVERNO OFICIAL (apenas quando registrado no TSE)
            if (candidate.propostasResumo.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    candidate.propostasResumo.take(2).forEach { proposta ->
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.15f))
                                .padding(horizontal = 8.dp, vertical = 3.dp)
                        ) {
                            Text(
                                text = proposta,
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.primary,
                                fontWeight = FontWeight.Medium,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }
            }
        }
    }
}
