package com.example.saibatudo_eleicao2026.ui.components

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.example.saibatudo_eleicao2026.core.constants.AppConstants
import com.example.saibatudo_eleicao2026.domain.model.FontesOficiais
import com.example.saibatudo_eleicao2026.domain.model.TreOficial

/**
 * Diretório de FONTES OFICIAIS integradas ao app (dados dinâmicos de
 * tse_fontes_oficiais_2026.json, com fallback para as URLs estáticas):
 *  - Sistemas nacionais do TSE (DivulgaCandContas, Autoatendimento, Resultados)
 *  - TRE estadual de cada UF (página oficial /eleicoes)
 *  - Poder Legislativo (Senado, Câmara, Congresso Nacional)
 *  - Fiscalização e controle externo (MPF/PGR, TCU, AGU, CGU, STF, MJSP)
 */
@Composable
fun FontesOficiaisDialog(
    estadoUf: String?,
    fontes: FontesOficiais?,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current

    fun abrir(url: String) {
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (_: Exception) { /* sem navegador */ }
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
                        Icons.Default.AccountBalance,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            "Fontes Oficiais Integradas",
                            fontSize = 16.sp, fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            "100% dados oficiais • Dados Abertos do TSE",
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

                Spacer(modifier = Modifier.height(10.dp))

                LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 460.dp)) {
                    item {
                        Text(
                            "🏛️ Sistemas Nacionais do TSE",
                            fontSize = 13.sp, fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Text(
                            fontes?.nota ?: "Para Eleições Gerais (Presidente, Governador, Senador e Deputados), " +
                                "os TREs integram suas consultas aos sistemas nacionais do TSE:",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(vertical = 4.dp)
                        )
                    }
                    val sistemas = fontes?.sistemasNacionais
                    if (!sistemas.isNullOrEmpty()) {
                        items(sistemas.size) { i ->
                            val s = sistemas[i]
                            FonteItem(s.nome, s.url, s.utilidade) { abrir(s.url) }
                        }
                    } else {
                        items(AppConstants.SISTEMAS_OFICIAIS_TSE.size) { i ->
                            val (nome, url) = AppConstants.SISTEMAS_OFICIAIS_TSE[i]
                            FonteItem(nome, url, null) { abrir(url) }
                        }
                    }

                    item {
                        Spacer(modifier = Modifier.height(10.dp))
                        Text(
                            "⚖️ TRE Estadual" + (estadoUf?.let { " — $it" } ?: " (27 UFs)"),
                            fontSize = 13.sp, fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                    val tres: List<TreOficial> = fontes?.tres ?: emptyList()
                    if (estadoUf != null && estadoUf != "BR") {
                        val tre = tres.firstOrNull { it.uf.equals(estadoUf, true) }
                        item {
                            if (tre != null) {
                                TreCard(tre) { abrir(tre.url) }
                            } else {
                                FonteItem(
                                    "TRE $estadoUf — Eleições 2026 (página oficial)",
                                    AppConstants.treUrl(estadoUf), null
                                ) { abrir(AppConstants.treUrl(estadoUf)) }
                            }
                        }
                    } else {
                        items(tres.size) { i ->
                            val tre = tres[i]
                            FonteItem(tre.tribunal, tre.url, null) { abrir(tre.url) }
                        }
                    }

                    item {
                        Spacer(modifier = Modifier.height(10.dp))
                        Text(
                            "📊 Acompanhamento, Legislação, Controle e Fiscalização",
                            fontSize = 13.sp, fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Text(
                            "Senado (54 cadeiras), Câmara (bancadas e quociente partidário), Congresso " +
                                "(Código Eleitoral e Lei das Eleições), MPF/PGR (fiscalização), TCU (contas " +
                                "irregulares p/ Ficha Limpa), AGU (condutas vedadas), CGU (Fala.BR), STF e MJSP:",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(vertical = 4.dp)
                        )
                    }
                    val orgaos = fontes?.orgaos
                    if (!orgaos.isNullOrEmpty()) {
                        items(orgaos.size) { i ->
                            val o = orgaos[i]
                            FonteItem(o.orgao, o.url, o.utilidade) { abrir(o.url) }
                        }
                    } else {
                        items(AppConstants.ORGAOS_OFICIAIS_ELEICOES.size) { i ->
                            val (nome, url) = AppConstants.ORGAOS_OFICIAIS_ELEICOES[i]
                            FonteItem(nome, url, null) { abrir(url) }
                        }
                    }

                    item {
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            "Base de dados do app: consulta_cand_2026, consulta_cand_complementar, historico_" +
                                "candidatura, motivo_cassacao, rede_social_candidato, pesquisa_eleitoral, proposta_" +
                                "governo e fotos oficiais — todos do Portal de Dados Abertos do TSE " +
                                "(dadosabertos.tse.jus.br) e CDN oficial (cdn.tse.jus.br).",
                            fontSize = 10.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun TreCard(tre: TreOficial, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 4.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
    ) {
        Column(modifier = Modifier.padding(10.dp)) {
            Text(tre.tribunal, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
            Text(tre.titulo, fontSize = 11.sp, color = MaterialTheme.colorScheme.primary)
            if (tre.resumo.isNotBlank()) {
                Text(
                    tre.resumo.take(280),
                    fontSize = 10.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 5
                )
            }
            if (tre.secoes.isNotEmpty()) {
                Text(
                    text = "Seções: " + tre.secoes.take(5).joinToString(" • ") { it.titulo },
                    fontSize = 10.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 3
                )
            }
        }
    }
}

@Composable
private fun FonteItem(nome: String, url: String, utilidade: String?, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 6.dp, horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            Icons.Default.OpenInNew,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.secondary,
            modifier = Modifier.size(14.dp)
        )
        Spacer(modifier = Modifier.width(8.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(nome, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface)
            if (!utilidade.isNullOrBlank()) {
                Text(utilidade, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
            }
            Text(url, fontSize = 10.sp, color = MaterialTheme.colorScheme.primary)
        }
    }
}
