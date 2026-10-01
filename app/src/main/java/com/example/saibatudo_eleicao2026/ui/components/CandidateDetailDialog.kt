package com.example.saibatudo_eleicao2026.ui.components

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.example.saibatudo_eleicao2026.core.constants.AppConstants
import com.example.saibatudo_eleicao2026.domain.model.Candidate
import com.example.saibatudo_eleicao2026.ui.theme.StatusApproved

@Composable
fun CandidateDetailDialog(
    candidate: Candidate,
    onDismiss: () -> Unit,
    onSimularVoto: (Candidate) -> Unit
) {
    val context = LocalContext.current

    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            Button(
                onClick = { onSimularVoto(candidate) },
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary
                ),
                shape = RoundedCornerShape(12.dp)
            ) {
                Icon(Icons.Default.HowToVote, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("Simular Voto na Urna")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(
                    "Fechar",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.SemiBold
                )
            }
        },
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (candidate.fotoLocal != null) {
                    AsyncImage(
                        model = "file:///android_asset/${candidate.fotoLocal}",
                        contentDescription = "Foto oficial ${candidate.nomeUrna}",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .size(46.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.surfaceVariant)
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .size(46.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.primaryContainer),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = candidate.numero,
                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp
                        )
                    }
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                    Text(
                        text = candidate.nomeUrna,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = "${candidate.cargo.replaceFirstChar { it.uppercase() }} (Nº ${candidate.numero} • ${candidate.digitosUrna} dígitos)",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
            ) {
                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

                // Dados oficiais do TSE
                Text("Dados Oficiais TSE:", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurface)
                Text("Nome Completo: ${candidate.nomeCompleto}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("Partido: ${candidate.partido}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                candidate.federacao?.let {
                    Text("Federação: $it", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                candidate.coligacao?.let {
                    Text("Coligação: $it", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(
                    "UF / Região: ${candidate.estadoUf}" +
                        (if (candidate.regiao.isNotBlank()) " (${candidate.regiao})" else ""),
                    fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                candidate.municipioNascimento?.let {
                    Text(
                        "Município de Nascimento: $it${candidate.ufNascimento?.let { u -> "/$u" } ?: ""}",
                        fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                candidate.idade?.let { Text("Idade na posse: $it anos", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                candidate.ocupacao?.let {
                    Text("Ocupação: ${it.lowercase().replaceFirstChar { c -> c.uppercase() }}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                candidate.genero?.let { Text("Gênero: ${it.lowercase().replaceFirstChar { c -> c.uppercase() }}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                candidate.grauInstrucao?.let { Text("Escolaridade: ${it.lowercase().replaceFirstChar { c -> c.uppercase() }}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }

                Text(
                    text = "Situação: ${candidate.situacaoCandidatura}",
                    fontSize = 12.sp,
                    color = if (candidate.situacaoCandidatura.startsWith("DEFERIDO", ignoreCase = true)) StatusApproved else MaterialTheme.colorScheme.error,
                    fontWeight = FontWeight.SemiBold
                )

                Spacer(modifier = Modifier.height(12.dp))

                // Transparência: fundamentos legais e Ficha Limpa (dados oficiais motivo_cassacao)
                Text("Transparência & Conduta:", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurface)
                Row(modifier = Modifier.padding(top = 4.dp)) {
                    val procColor = if (candidate.processosAdministrativos == 0) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.secondary
                    }
                    Icon(Icons.Default.Policy, contentDescription = null, tint = procColor, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = if (candidate.processosAdministrativos == 0) "Zero fundamentos legais de julgamento registrados no TSE" else "${candidate.processosAdministrativos} fundamento(s) legal(is) de julgamento (LC 64/90, Lei 9.504/97)",
                        fontSize = 12.sp,
                        color = procColor,
                        fontWeight = FontWeight.Medium
                    )
                }
                candidate.motivosCassacao.forEach { motivo ->
                    Text(
                        text = "• $motivo",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(start = 22.dp, top = 2.dp)
                    )
                }

                Row(modifier = Modifier.padding(top = 4.dp)) {
                    val fichaColor = if (candidate.fichaLimpa) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
                    Icon(Icons.Default.Verified, contentDescription = null, tint = fichaColor, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = if (candidate.fichaLimpa) "Ficha Limpa (LC 135/2010): deferido, sem inelegibilidade registrada" else "Fundamentos de inelegibilidade registrados no TSE",
                        fontSize = 12.sp,
                        color = fichaColor,
                        fontWeight = FontWeight.Medium
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Histórico eleitoral (dados oficiais historico_candidatura)
                Text("Histórico Eleitoral (TSE):", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurface)
                Text(
                    text = when {
                        candidate.reeleicao -> "Disputa a reeleição • ${candidate.mandatosAnteriores} mandato(s) eletivo(s) anterior(es)"
                        candidate.mandatosAnteriores == 0 -> "Candidato Estreante • Nunca exerceu mandato eletivo"
                        else -> "Experiente • ${candidate.mandatosAnteriores} mandato(s) eletivo(s) anterior(es)"
                    },
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (candidate.totalEleicoesDisputadas > 0) {
                    Text(
                        text = "${candidate.totalEleicoesDisputadas} eleição(ões) disputada(s) no histórico oficial",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                // Propostas / Plano de Governo OFICIAL (documento registrado no TSE)
                if (candidate.propostasResumo.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Text("Plano de Governo Oficial (registrado no TSE):", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurface)
                    candidate.propostasResumo.forEach { proposta ->
                        Row(modifier = Modifier.padding(vertical = 2.dp)) {
                            Text("• ", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                            Text(proposta, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }

                // Redes sociais oficiais
                if (candidate.redesSociais.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Text("Redes Sociais Oficiais:", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurface)
                    candidate.redesSociais.take(4).forEach { url ->
                        Text(
                            text = "🔗 $url",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier
                                .padding(top = 2.dp)
                                .clickable {
                                    try {
                                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                                    } catch (_: Exception) { }
                                }
                        )
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "Candidaturas e contas: ${AppConstants.URL_DIVULGA_CAND_CONTAS}",
                    fontSize = 10.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        },
        shape = RoundedCornerShape(16.dp)
    )
}
