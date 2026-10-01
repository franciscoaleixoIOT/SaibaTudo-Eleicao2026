package net.saibatudo.eleicoes2026.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.LocationOff
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import net.saibatudo.eleicoes2026.domain.model.ElectoralFilter
import net.saibatudo.eleicoes2026.domain.model.FaseEleitoral
import net.saibatudo.eleicoes2026.domain.model.HistoricoOpcao
import net.saibatudo.eleicoes2026.domain.model.MacroRegiao
import net.saibatudo.eleicoes2026.domain.model.TseCargo
import net.saibatudo.eleicoes2026.domain.model.Ufs

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FilterChipsRow(
    filtro: ElectoralFilter,
    onFiltroChange: (ElectoralFilter) -> Unit,
    ufPadrao: String?,
    fase: FaseEleitoral,
    partidos: List<String>,
    temas: Map<String, String>,
    onAlternarMeuEstado: (Boolean) -> Unit,
    onEscolherUf: () -> Unit,
    onLimpar: () -> Unit,
    modifier: Modifier = Modifier
) {
    var avancado by remember { mutableStateOf(false) }
    val meuEstadoLigado = filtro.estadoUf != null && filtro.estadoUf == ufPadrao
    val cores = FilterChipDefaults.filterChipColors(
        selectedContainerColor = MaterialTheme.colorScheme.primary,
        selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
        selectedLeadingIconColor = MaterialTheme.colorScheme.onPrimary,
        containerColor = MaterialTheme.colorScheme.surfaceVariant,
        labelColor = MaterialTheme.colorScheme.onSurface
    )

    Column(modifier = modifier.fillMaxWidth()) {
        // Meu estado (a UF é escolhida pelo usuário; o app NÃO usa GPS)
        Card(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(
                containerColor = if (meuEstadoLigado) MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)
                else MaterialTheme.colorScheme.surfaceVariant
            )
        ) {
            Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = if (meuEstadoLigado) Icons.Default.LocationOn else Icons.Default.LocationOff,
                    contentDescription = null,
                    tint = if (meuEstadoLigado) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = when {
                            filtro.estadoUf != null -> "Estado: ${Ufs.NOMES[filtro.estadoUf] ?: filtro.estadoUf}"
                            else -> "Brasil: todos os estados"
                        },
                        fontSize = 13.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = if (ufPadrao == null) "Escolha seu estado para começar já filtrado" else
                            if (meuEstadoLigado) "Seu estado e candidaturas nacionais" else "Ligue para ver só o seu estado ($ufPadrao)",
                        fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                TextButton(onClick = onEscolherUf, contentPadding = PaddingValues(horizontal = 8.dp)) {
                    Text(if (ufPadrao == null) "Escolher" else "Alterar", fontSize = 12.sp)
                }
                Switch(
                    checked = meuEstadoLigado,
                    onCheckedChange = onAlternarMeuEstado,
                    modifier = Modifier.semantics { contentDescription = "Filtrar pelo meu estado" },
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = MaterialTheme.colorScheme.onPrimary,
                        checkedTrackColor = MaterialTheme.colorScheme.primary,
                        uncheckedThumbColor = MaterialTheme.colorScheme.outline,
                        uncheckedTrackColor = MaterialTheme.colorScheme.surfaceVariant
                    )
                )
            }
        }

        // Cabeçalho dos filtros
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)
        ) {
            Icon(Icons.Default.FilterList, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(6.dp))
            Text("Filtros", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onBackground)
            Spacer(modifier = Modifier.weight(1f))
            TextButton(onClick = { avancado = !avancado }, contentPadding = PaddingValues(horizontal = 6.dp, vertical = 2.dp)) {
                Icon(if (avancado) Icons.Default.ExpandLess else Icons.Default.Tune, contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text(if (avancado) "Menos" else "Mais filtros", fontSize = 12.sp, color = MaterialTheme.colorScheme.primary)
            }
            TextButton(onClick = onLimpar, contentPadding = PaddingValues(horizontal = 6.dp, vertical = 2.dp)) {
                Text("Limpar", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.error, maxLines = 1)
            }
        }

        // Cargos com dígitos oficiais da urna
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 2.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            TseCargo.entries.forEach { c ->
                val sel = filtro.cargo.equals(c.codigo, ignoreCase = true)
                FilterChip(
                    selected = sel,
                    onClick = { onFiltroChange(filtro.copy(cargo = if (sel) null else c.codigo)) },
                    label = { Text("${c.titulo} (${c.digitos} dígitos)", fontSize = 12.sp) },
                    shape = RoundedCornerShape(16.dp),
                    colors = cores
                )
            }
        }

        AnimatedVisibility(visible = avancado) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)
                    .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(12.dp)).padding(10.dp)
            ) {
                Rotulo("Situação da candidatura")
                LinhaChips {
                    FilterChip(
                        selected = filtro.apenasDeferidas,
                        onClick = { onFiltroChange(filtro.copy(apenasDeferidas = !filtro.apenasDeferidas)) },
                        label = { Text("Apenas deferidas pelo TSE", fontSize = 11.sp) },
                        leadingIcon = { if (filtro.apenasDeferidas) Icon(Icons.Default.Check, null, Modifier.size(14.dp)) },
                        colors = cores
                    )
                    FilterChip(
                        selected = filtro.apenasNaUrna,
                        onClick = { onFiltroChange(filtro.copy(apenasNaUrna = !filtro.apenasNaUrna)) },
                        label = { Text("Apenas na urna", fontSize = 11.sp) },
                        leadingIcon = { if (filtro.apenasNaUrna) Icon(Icons.Default.Check, null, Modifier.size(14.dp)) },
                        colors = cores
                    )
                    if (fase.mostraResultados) {
                        FilterChip(
                            selected = filtro.apenasEleitos,
                            onClick = { onFiltroChange(filtro.copy(apenasEleitos = !filtro.apenasEleitos)) },
                            label = { Text("Apenas eleitos", fontSize = 11.sp) },
                            colors = cores
                        )
                    }
                }
                Texto11("\"Deferida\" não é certidão de Ficha Limpa: é o julgamento do registro (pode caber recurso).")

                Spacer(Modifier.height(6.dp))
                Rotulo("Histórico no TSE")
                LinhaChips {
                    HistoricoOpcao.entries.forEach { op ->
                        FilterChip(
                            selected = filtro.historico == op,
                            onClick = { onFiltroChange(filtro.copy(historico = op)) },
                            label = { Text(op.label, fontSize = 11.sp) },
                            colors = cores
                        )
                    }
                }

                Spacer(Modifier.height(6.dp))
                Rotulo("Região")
                LinhaChips {
                    MacroRegiao.entries.forEach { m ->
                        val sel = filtro.regiao == m.nomeExibicao
                        FilterChip(
                            selected = sel,
                            onClick = { onFiltroChange(filtro.copy(regiao = if (sel) null else m.nomeExibicao)) },
                            label = { Text(m.nomeExibicao, fontSize = 11.sp) },
                            colors = cores
                        )
                    }
                }

                if (partidos.isNotEmpty()) {
                    Spacer(Modifier.height(6.dp))
                    Rotulo("Partido")
                    LinhaChips {
                        partidos.forEach { p ->
                            val sel = filtro.partido.equals(p, true)
                            FilterChip(
                                selected = sel,
                                onClick = { onFiltroChange(filtro.copy(partido = if (sel) null else p)) },
                                label = { Text(p, fontSize = 11.sp) },
                                colors = cores
                            )
                        }
                    }
                }

                if (temas.isNotEmpty()) {
                    Spacer(Modifier.height(6.dp))
                    Rotulo("Tema citado no plano de governo")
                    LinhaChips {
                        temas.forEach { (id, rotulo) ->
                            val sel = filtro.tema == id
                            FilterChip(
                                selected = sel,
                                onClick = { onFiltroChange(filtro.copy(tema = if (sel) null else id)) },
                                label = { Text(rotulo, fontSize = 11.sp) },
                                colors = cores
                            )
                        }
                    }
                    Texto11("Só candidatos com plano de governo registrado (principalmente Presidente e Governador). Detecção automática por palavras-chave.")
                }
            }
        }
    }
}

@Composable
private fun Rotulo(texto: String) {
    Text(texto, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
}

@Composable
private fun Texto11(texto: String) {
    Text(texto, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp))
}

@Composable
private fun LinhaChips(conteudo: @Composable () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) { conteudo() }
}
