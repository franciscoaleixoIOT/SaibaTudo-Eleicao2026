package net.saibatudo.eleicoes2026.ui.components

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Analytics
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import net.saibatudo.eleicoes2026.domain.model.PesquisaEleitoral

/**
 * Painel de Pesquisas Eleitorais OFICIALMENTE registradas no TSE
 * (fonte: pesquisa_eleitoral_2026 - Dados Abertos do TSE).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PesquisasOficiaisDialog(
    pesquisas: List<PesquisaEleitoral>,
    onDismiss: () -> Unit
) {
    var filtroUf by remember { mutableStateOf<String?>(null) }
    var filtroCargo by remember { mutableStateOf<String?>(null) }

    val ufs = remember(pesquisas) {
        pesquisas.mapNotNull { it.uf }.filter { it.isNotBlank() }.distinct().sorted()
    }
    val cargos = remember(pesquisas) {
        pesquisas.mapNotNull { it.cargo }.filter { it.isNotBlank() }.distinct().sorted()
    }

    val filtradas = remember(pesquisas, filtroUf, filtroCargo) {
        pesquisas.filter { p ->
            (filtroUf == null || p.uf.equals(filtroUf, true)) &&
                (filtroCargo == null || p.cargo.equals(filtroCargo, true))
        }
    }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(
            modifier = Modifier.fillMaxWidth(0.96f).padding(8.dp),
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Default.Analytics,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            "Pesquisas Eleitorais Registradas",
                            fontSize = 16.sp, fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            "Registro oficial no TSE • ${pesquisas.size} pesquisas",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    IconButton(onClick = onDismiss, modifier = Modifier.size(28.dp)) {
                        Icon(Icons.Default.Close, contentDescription = "Fechar",
                            modifier = Modifier.size(18.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Filtros por UF
                Row(modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    AssistChip(
                        onClick = { filtroUf = null },
                        label = { Text(if (filtroUf == null) "Todas as UFs" else "Todas as UFs", fontSize = 11.sp) },
                        border = null,
                        colors = AssistChipDefaults.assistChipColors(
                            containerColor = if (filtroUf == null) MaterialTheme.colorScheme.primaryContainer
                            else MaterialTheme.colorScheme.surfaceVariant
                        )
                    )
                    ufs.forEach { uf ->
                        AssistChip(
                            onClick = { filtroUf = if (filtroUf == uf) null else uf },
                            label = { Text(uf, fontSize = 11.sp) },
                            colors = AssistChipDefaults.assistChipColors(
                                containerColor = if (filtroUf == uf) MaterialTheme.colorScheme.primaryContainer
                                else MaterialTheme.colorScheme.surfaceVariant
                            )
                        )
                    }
                }
                Spacer(modifier = Modifier.height(6.dp))
                Row(modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    AssistChip(
                        onClick = { filtroCargo = null },
                        label = { Text("Todos os cargos", fontSize = 11.sp) },
                        colors = AssistChipDefaults.assistChipColors(
                            containerColor = if (filtroCargo == null) MaterialTheme.colorScheme.secondaryContainer
                            else MaterialTheme.colorScheme.surfaceVariant
                        )
                    )
                    cargos.forEach { cargo ->
                        AssistChip(
                            onClick = { filtroCargo = if (filtroCargo == cargo) null else cargo },
                            label = { Text(cargo, fontSize = 11.sp) },
                            colors = AssistChipDefaults.assistChipColors(
                                containerColor = if (filtroCargo == cargo) MaterialTheme.colorScheme.secondaryContainer
                                else MaterialTheme.colorScheme.surfaceVariant
                            )
                        )
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))
                HorizontalDivider()
                Spacer(modifier = Modifier.height(4.dp))

                Text(
                    text = "${filtradas.size} pesquisas exibidas (dados oficiais TSE)",
                    fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 420.dp)) {
                    items(filtradas.take(120)) { p ->
                        PesquisaItem(p)
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))
                    }
                }
            }
        }
    }
}

@Composable
private fun PesquisaItem(p: PesquisaEleitoral) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = p.empresa ?: "Empresa não informada",
                fontSize = 13.sp, fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f)
            )
            if (p.pesquisaPropria) {
                AssistChip(
                    onClick = {},
                    label = { Text("PESQUISA PRÓPRIA", fontSize = 9.sp) },
                    colors = AssistChipDefaults.assistChipColors(
                        containerColor = MaterialTheme.colorScheme.secondaryContainer
                    )
                )
            }
        }
        Text(
            text = buildString {
                p.cargo?.let { append("$it") }
                p.uf?.let { append(" • $it") }
                p.municipio?.let { append(" • $it") }
            },
            fontSize = 11.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = buildString {
                p.protocolo?.let { append("Protocolo $it") }
                p.dataRegistro?.let { append(" • registrado em ${it.take(10)}") }
            },
            fontSize = 10.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = buildString {
                p.dataInicio?.let { append("Campo: ${it.take(10)}") }
                p.dataFim?.let { append(" a ${it.take(10)}") }
                p.dataDivulgacao?.let { append(" • Divulgação: ${it.take(10)}") }
            },
            fontSize = 10.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Row(modifier = Modifier.padding(top = 2.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            p.entrevistados?.let {
                Text("Entrevistados: $it", fontSize = 10.sp, color = MaterialTheme.colorScheme.primary)
            }
            p.valor?.let {
                Text("Valor: R$ $it", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        p.estatistico?.let {
            Text("Estatístico responsável: $it", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
