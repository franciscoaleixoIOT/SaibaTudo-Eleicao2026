package com.example.saibatudo_eleicao2026.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.saibatudo_eleicao2026.ui.theme.GoldSecondary
import com.example.saibatudo_eleicao2026.ui.theme.GreenLight
import com.example.saibatudo_eleicao2026.ui.theme.GreenPrimary
import com.example.saibatudo_eleicao2026.ui.theme.NavyAccent

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchBarAi(
    query: String,
    onQueryChange: (String) -> Unit,
    onSearchSubmit: (String) -> Unit,
    suggestedQuestions: List<String> = emptyList(),
    onSuggestionClick: (String) -> Unit = {},
    isAiLoading: Boolean = false,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(16.dp)
    ) {
        // AI status badge
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .clip(CircleShape)
                .background(GreenLight)
                .padding(horizontal = 10.dp, vertical = 4.dp)
        ) {
            Icon(
                imageVector = Icons.Default.AutoAwesome,
                contentDescription = "IA Ativa",
                tint = GreenPrimary,
                modifier = Modifier.size(16.dp)
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = if (isAiLoading) "IA SaibaTudo-Eleicao2026 analisando..." else "IA SaibaTudo-Eleicao2026 Pronta",
                color = GreenPrimary,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold
            )
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Search text field
        OutlinedTextField(
            value = query,
            onValueChange = onQueryChange,
            modifier = Modifier.fillMaxWidth(),
            placeholder = {
                Text(
                    "Ex: Quem são os candidatos ao Senado em MG?",
                    fontSize = 14.sp,
                    color = Color.Gray
                )
            },
            leadingIcon = {
                Icon(Icons.Default.Search, contentDescription = "Buscar", tint = GreenPrimary)
            },
            trailingIcon = {
                if (query.isNotEmpty()) {
                    IconButton(onClick = { onQueryChange("") }) {
                        Icon(Icons.Default.Clear, contentDescription = "Limpar")
                    }
                } else {
                    IconButton(onClick = { if (query.isNotBlank()) onSearchSubmit(query) }) {
                        Icon(
                            Icons.Default.AutoAwesome,
                            contentDescription = "Consultar IA",
                            tint = GoldSecondary
                        )
                    }
                }
            },
            singleLine = true,
            shape = RoundedCornerShape(16.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = GreenPrimary,
                unfocusedBorderColor = Color(0xFFE2E8F0),
                focusedContainerColor = Color.White,
                unfocusedContainerColor = Color.White
            )
        )

        // Suggestion Chips
        if (suggestedQuestions.isNotEmpty()) {
            Spacer(modifier = Modifier.height(10.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                suggestedQuestions.forEach { suggestion ->
                    SuggestionChip(
                        onClick = { onSuggestionClick(suggestion) },
                        label = {
                            Text(
                                text = suggestion,
                                fontSize = 12.sp,
                                color = NavyAccent
                            )
                        },
                        icon = {
                            Icon(
                                Icons.Default.AutoAwesome,
                                contentDescription = null,
                                tint = GoldSecondary,
                                modifier = Modifier.size(14.dp)
                            )
                        },
                        shape = RoundedCornerShape(20.dp)
                    )
                }
            }
        }
    }
}
