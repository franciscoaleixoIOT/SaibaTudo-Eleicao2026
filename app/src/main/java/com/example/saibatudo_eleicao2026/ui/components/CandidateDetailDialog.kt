package com.example.saibatudo_eleicao2026.ui.components

import androidx.compose.foundation.background
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.saibatudo_eleicao2026.domain.model.Candidate
import com.example.saibatudo_eleicao2026.ui.theme.GoldSecondary
import com.example.saibatudo_eleicao2026.ui.theme.GreenLight
import com.example.saibatudo_eleicao2026.ui.theme.GreenPrimary
import com.example.saibatudo_eleicao2026.ui.theme.NavyAccent
import com.example.saibatudo_eleicao2026.ui.theme.StatusApproved

@Composable
fun CandidateDetailDialog(
    candidate: Candidate,
    onDismiss: () -> Unit,
    onSimularVoto: (Candidate) -> Unit
) {
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
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                    Text(
                        text = candidate.nomeUrna,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = "${candidate.cargo} (${candidate.digitosUrna} dígitos)",
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

                // Nome completo e partido
                Text("Dados Oficiais TSE:", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurface)
                Text("Nome Completo: ${candidate.nomeCompleto}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("Partido: ${candidate.partido}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                candidate.coligacao?.let {
                    Text("Coligação: $it", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text("UF / Região: ${candidate.estadoUf} (${candidate.regiao})", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (candidate.cidadesAtuacao.isNotEmpty()) {
                    Text("Bases & Regiões de Atuação: ${candidate.cidadesAtuacao.joinToString(", ")}", fontSize = 12.sp, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Medium)
                }
                Text("Situação: ${candidate.situacaoCandidatura}", fontSize = 12.sp, color = StatusApproved, fontWeight = FontWeight.SemiBold)

                Spacer(modifier = Modifier.height(12.dp))

                // Conduta e Processos
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
                        text = if (candidate.processosAdministrativos == 0) "Zero Processos Administrativos registrados" else "${candidate.processosAdministrativos} Processo(s) Administrativo(s)",
                        fontSize = 12.sp,
                        color = procColor,
                        fontWeight = FontWeight.Medium
                    )
                }

                Row(modifier = Modifier.padding(top = 4.dp)) {
                    val fichaColor = if (candidate.fichaLimpa) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
                    Icon(Icons.Default.Verified, contentDescription = null, tint = fichaColor, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = if (candidate.fichaLimpa) "Certidão Ficha Limpa (LC 135/2010)" else "Com Pendências Judiciais",
                        fontSize = 12.sp,
                        color = fichaColor,
                        fontWeight = FontWeight.Medium
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Histórico de Mandatos
                Text("Histórico Eleitoral:", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurface)
                Text(
                    text = when {
                        candidate.reeleicao -> "Atualmente no cargo • Tentando Reeleição"
                        candidate.mandatosAnteriores == 0 -> "Candidato Estreante • Nunca exerceu mandato eletivo"
                        else -> "Experiente • Já exerceu ${candidate.mandatosAnteriores} mandatos anteriores"
                    },
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Spacer(modifier = Modifier.height(12.dp))

                // Propostas
                if (candidate.propostasResumo.isNotEmpty()) {
                    Text("Propostas & Plano de Governo:", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurface)
                    candidate.propostasResumo.forEach { proposta ->
                        Row(modifier = Modifier.padding(vertical = 2.dp)) {
                            Text("• ", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                            Text(proposta, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        },
        shape = RoundedCornerShape(16.dp)
    )
}
