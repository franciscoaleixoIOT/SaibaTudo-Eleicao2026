package com.example.saibatudo_eleicao2026.ui.components

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FilterAlt
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.saibatudo_eleicao2026.domain.model.ElectoralFilter
import com.example.saibatudo_eleicao2026.ui.theme.GreenLight
import com.example.saibatudo_eleicao2026.ui.theme.GreenPrimary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FilterChipsRow(
    currentFilter: ElectoralFilter,
    onCargoSelected: (String?) -> Unit,
    onUfSelected: (String?) -> Unit,
    onTemaSelected: (String?) -> Unit,
    onClearAll: () -> Unit,
    modifier: Modifier = Modifier
) {
    val cargos = listOf("PRESIDENTE", "GOVERNADOR", "SENADOR", "DEPUTADO_FEDERAL", "DEPUTADO_ESTADUAL")
    val ufs = listOf("SP", "RJ", "MG", "BA", "PR", "RS", "PE", "CE", "DF")
    val temas = listOf("educacao", "saude", "seguranca", "economia", "meio_ambiente")

    val hasActiveFilter = currentFilter.cargo != null || currentFilter.estadoUf != null || currentFilter.tema != null || currentFilter.partido != null

    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp)
        ) {
            Icon(
                imageVector = Icons.Default.FilterAlt,
                contentDescription = null,
                tint = GreenPrimary,
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = "Filtros Ativos",
                fontSize = 13.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.weight(1f))

            if (hasActiveFilter) {
                TextButton(
                    onClick = onClearAll,
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
                ) {
                    Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(14.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Limpar", fontSize = 12.sp)
                }
            }
        }

        // Horizontal scrollable filter chips
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // Cargos
            cargos.forEach { cargo ->
                val selected = currentFilter.cargo.equals(cargo, ignoreCase = true)
                FilterChip(
                    selected = selected,
                    onClick = { onCargoSelected(if (selected) null else cargo) },
                    label = { Text(cargo.replace("_", " "), fontSize = 12.sp) },
                    shape = RoundedCornerShape(16.dp),
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = GreenPrimary,
                        selectedLabelColor = MaterialTheme.colorScheme.onPrimary
                    )
                )
            }

            // UFs
            ufs.forEach { uf ->
                val selected = currentFilter.estadoUf.equals(uf, ignoreCase = true)
                FilterChip(
                    selected = selected,
                    onClick = { onUfSelected(if (selected) null else uf) },
                    label = { Text("UF: $uf", fontSize = 12.sp) },
                    shape = RoundedCornerShape(16.dp),
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = GreenPrimary,
                        selectedLabelColor = MaterialTheme.colorScheme.onPrimary
                    )
                )
            }

            // Temas
            temas.forEach { tema ->
                val selected = currentFilter.tema.equals(tema, ignoreCase = true)
                FilterChip(
                    selected = selected,
                    onClick = { onTemaSelected(if (selected) null else tema) },
                    label = { Text(tema.replace("_", " ").replaceFirstChar { it.uppercase() }, fontSize = 12.sp) },
                    shape = RoundedCornerShape(16.dp),
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = GreenPrimary,
                        selectedLabelColor = MaterialTheme.colorScheme.onPrimary
                    )
                )
            }
        }
    }
}
