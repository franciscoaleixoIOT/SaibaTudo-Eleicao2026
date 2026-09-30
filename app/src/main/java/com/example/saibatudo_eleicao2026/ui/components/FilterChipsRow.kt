package com.example.saibatudo_eleicao2026.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.saibatudo_eleicao2026.domain.model.ElectoralFilter
import com.example.saibatudo_eleicao2026.domain.model.MacroRegiao
import com.example.saibatudo_eleicao2026.domain.model.MandatosOpcao
import com.example.saibatudo_eleicao2026.domain.model.TseCargo
import com.example.saibatudo_eleicao2026.ui.theme.GoldSecondary
import com.example.saibatudo_eleicao2026.ui.theme.GreenLight
import com.example.saibatudo_eleicao2026.ui.theme.GreenPrimary
import com.example.saibatudo_eleicao2026.ui.theme.NavyAccent

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FilterChipsRow(
    currentFilter: ElectoralFilter,
    onFilterChange: (ElectoralFilter) -> Unit,
    modifier: Modifier = Modifier
) {
    var showAdvancedFilters by remember { mutableStateOf(false) }

    Column(modifier = modifier.fillMaxWidth()) {
        // 1. Location Banner with toggle (ON/OFF at any time!)
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp),
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(
                containerColor = if (currentFilter.localizacaoAtiva) GreenLight else Color(0xFFF1F5F9)
            )
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = if (currentFilter.localizacaoAtiva) Icons.Default.LocationOn else Icons.Default.LocationOff,
                    contentDescription = null,
                    tint = if (currentFilter.localizacaoAtiva) GreenPrimary else Color.Gray,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = if (currentFilter.localizacaoAtiva) "Filtro por Localização Ativo: ${currentFilter.estadoUf ?: "Nacional"}" else "Modo Brasil: Todos os estados visíveis",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (currentFilter.localizacaoAtiva) GreenPrimary else Color.DarkGray
                    )
                    Text(
                        text = if (currentFilter.localizacaoAtiva) "Exibindo apenas candidatos e cargos da sua região" else "Toque no botão para ligar a localização",
                        fontSize = 10.sp,
                        color = Color.Gray
                    )
                }

                Switch(
                    checked = currentFilter.localizacaoAtiva,
                    onCheckedChange = { isChecked ->
                        onFilterChange(currentFilter.copy(localizacaoAtiva = isChecked))
                    },
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = Color.White,
                        checkedTrackColor = GreenPrimary
                    )
                )
            }
        }

        // 2. Bar with Filter count and Advanced Toggle
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp)
        ) {
            Icon(
                imageVector = Icons.Default.FilterList,
                contentDescription = null,
                tint = GreenPrimary,
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = "Filtros Oficiais TSE 2026",
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = NavyAccent
            )

            Spacer(modifier = Modifier.weight(1f))

            TextButton(
                onClick = { showAdvancedFilters = !showAdvancedFilters },
                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
            ) {
                Icon(
                    imageVector = if (showAdvancedFilters) Icons.Default.ExpandLess else Icons.Default.Tune,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    if (showAdvancedFilters) "Menos filtros" else "Mais filtros",
                    fontSize = 12.sp
                )
            }

            TextButton(
                onClick = {
                    onFilterChange(
                        ElectoralFilter(
                            localizacaoAtiva = false,
                            estadoUf = null,
                            regiao = null,
                            cargo = null
                        )
                    )
                },
                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
            ) {
                Text("Limpar", fontSize = 12.sp, color = Color.Red)
            }
        }

        // 3. Horizontal Scrollable Cargos with Official TSE Digits!
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 2.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            TseCargo.values().forEach { tseCargo ->
                val isSelected = currentFilter.cargo.equals(tseCargo.codigo, ignoreCase = true)
                FilterChip(
                    selected = isSelected,
                    onClick = {
                        val newCargo = if (isSelected) null else tseCargo.codigo
                        onFilterChange(currentFilter.copy(cargo = newCargo))
                    },
                    label = {
                        Text("${tseCargo.titulo} (${tseCargo.digitos} dígitos)", fontSize = 12.sp)
                    },
                    shape = RoundedCornerShape(16.dp),
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = GreenPrimary,
                        selectedLabelColor = Color.White
                    )
                )
            }
        }

        // 4. Advanced Filters Panel (Processos Administrativos, Reeleição, Regiões)
        AnimatedVisibility(visible = showAdvancedFilters) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 6.dp)
                    .background(Color(0xFFF8FAFC), RoundedCornerShape(12.dp))
                    .padding(10.dp)
            ) {
                // A. Processos Administrativos e Ficha Limpa
                Text(
                    text = "⚖️ Processos e Conduta Administrativa:",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = NavyAccent
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    FilterChip(
                        selected = currentFilter.apenasFichaLimpa,
                        onClick = {
                            onFilterChange(currentFilter.copy(apenasFichaLimpa = !currentFilter.apenasFichaLimpa))
                        },
                        label = { Text("Ficha Limpa 100%", fontSize = 11.sp) },
                        leadingIcon = {
                            if (currentFilter.apenasFichaLimpa) {
                                Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(14.dp))
                            }
                        }
                    )

                    FilterChip(
                        selected = currentFilter.maxProcessosAdministrativos == 0,
                        onClick = {
                            val newMax = if (currentFilter.maxProcessosAdministrativos == 0) null else 0
                            onFilterChange(currentFilter.copy(maxProcessosAdministrativos = newMax))
                        },
                        label = { Text("Zero Processos Adm.", fontSize = 11.sp) }
                    )
                }

                Spacer(modifier = Modifier.height(6.dp))

                // B. Quantas vezes já foi eleito (Histórico de Mandatos)
                Text(
                    text = "🏛️ Histórico de Eleições e Mandatos:",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = NavyAccent
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    MandatosOpcao.values().forEach { opcao ->
                        val isSelected = currentFilter.mandatosAnterioresOpcao == opcao
                        FilterChip(
                            selected = isSelected,
                            onClick = {
                                onFilterChange(currentFilter.copy(mandatosAnterioresOpcao = opcao))
                            },
                            label = { Text(opcao.label, fontSize = 11.sp) }
                        )
                    }
                }

                Spacer(modifier = Modifier.height(6.dp))

                // C. Regiões e Estados
                Text(
                    text = "🗺️ Filtrar por Região Macro:",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = NavyAccent
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    MacroRegiao.values().forEach { macro ->
                        val isSelected = currentFilter.regiao.equals(macro.nomeExibicao, ignoreCase = true)
                        FilterChip(
                            selected = isSelected,
                            onClick = {
                                val newReg = if (isSelected) null else macro.nomeExibicao
                                onFilterChange(currentFilter.copy(regiao = newReg))
                            },
                            label = { Text(macro.nomeExibicao, fontSize = 11.sp) }
                        )
                    }
                }
            }
        }
    }
}
