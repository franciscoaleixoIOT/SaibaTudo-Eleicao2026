package com.example.saibatudo_eleicao2026.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Person
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
fun CandidateItemCard(
    candidate: Candidate,
    onCandidateClick: (Candidate) -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                // Avatar / Photo placeholder
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(NavyAccent),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = candidate.numero,
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp
                    )
                }

                Spacer(modifier = Modifier.width(12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = candidate.nomeUrna,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            color = NavyAccent
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Icon(
                            imageVector = Icons.Default.CheckCircle,
                            contentDescription = "Candidatura Deferida",
                            tint = StatusApproved,
                            modifier = Modifier.size(16.dp)
                        )
                    }

                    Text(
                        text = "${candidate.cargo} • ${candidate.partido} (${candidate.estadoUf})",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            if (candidate.coligacao != null) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Coligação: ${candidate.coligacao}",
                    fontSize = 11.sp,
                    color = Color.Gray
                )
            }

            // Proposals / Topics chips
            if (candidate.propostasResumo.isNotEmpty()) {
                Spacer(modifier = Modifier.height(10.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    candidate.propostasResumo.take(2).forEach { proposta ->
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(GreenLight)
                                .padding(horizontal = 8.dp, vertical = 4.dp)
                        ) {
                            Text(
                                text = proposta,
                                fontSize = 11.sp,
                                color = GreenPrimary,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }
                }
            }
        }
    }
}
