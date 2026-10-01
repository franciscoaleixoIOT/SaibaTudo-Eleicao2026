package net.saibatudo.eleicoes2026.ui.components

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import net.saibatudo.eleicoes2026.core.constants.AppConstants
import net.saibatudo.eleicoes2026.domain.model.FontesOficiais

/**
 * Diretório de FONTES OFICIAIS: sistemas nacionais do TSE, TRE do estado e órgãos de acompanhamento.
 * O app apenas indica o caminho; o conteúdo pertence a cada órgão.
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
                    Icon(Icons.Default.AccountBalance, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Fontes oficiais", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                        Text("Links para os sites oficiais", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    IconButton(onClick = onDismiss, modifier = Modifier.size(36.dp)) {
                        Icon(Icons.Default.Close, contentDescription = "Fechar", modifier = Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                Spacer(modifier = Modifier.height(10.dp))

                LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 480.dp)) {
                    item { Titulo("Sistemas nacionais do TSE") }
                    item { Nota(fontes?.nota ?: "Os TREs integram suas consultas aos sistemas nacionais do TSE.") }
                    val sistemas = fontes?.sistemasNacionais.orEmpty()
                    if (sistemas.isNotEmpty()) {
                        items(sistemas.size) { i -> val s = sistemas[i]; FonteItem(s.nome, s.url, s.utilidade) { abrir(s.url) } }
                    } else {
                        items(AppConstants.SISTEMAS_OFICIAIS_TSE.size) { i ->
                            val (nome, url) = AppConstants.SISTEMAS_OFICIAIS_TSE[i]
                            FonteItem(nome, url, null) { abrir(url) }
                        }
                    }

                    item { Spacer(Modifier.height(10.dp)); Titulo("TRE" + (estadoUf?.takeIf { it != "BR" }?.let { " — $it" } ?: " (27 UFs)")) }
                    val tres = fontes?.tres.orEmpty()
                    if (estadoUf != null && estadoUf != "BR") {
                        val tre = tres.firstOrNull { it.uf.equals(estadoUf, true) }
                        item { FonteItem(tre?.tribunal ?: "TRE $estadoUf — Eleições", tre?.url ?: AppConstants.treUrl(estadoUf), null) { abrir(tre?.url ?: AppConstants.treUrl(estadoUf)) } }
                        tre?.secoes?.take(12)?.let { secoes ->
                            items(secoes.size) { i -> val s = secoes[i]; FonteItem(s.titulo, s.url, null) { abrir(s.url) } }
                        }
                    } else {
                        items(tres.size) { i -> val t = tres[i]; FonteItem(t.tribunal, t.url, null) { abrir(t.url) } }
                    }

                    val orgaos = fontes?.orgaos.orEmpty()
                    if (orgaos.isNotEmpty()) {
                        item { Spacer(Modifier.height(10.dp)); Titulo("Acompanhamento, legislação e fiscalização") }
                        items(orgaos.size) { i -> val o = orgaos[i]; FonteItem(o.orgao, o.url, o.utilidade) { abrir(o.url) } }
                    }

                    item {
                        Spacer(Modifier.height(12.dp))
                        Nota("Base de dados do app: Portal de Dados Abertos do TSE (dadosabertos.tse.jus.br), licença CC BY. " +
                            "Aplicativo independente, sem vínculo com o TSE ou outros órgãos.")
                    }
                }
            }
        }
    }
}

@Composable
private fun Titulo(texto: String) {
    Text(texto, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
}

@Composable
private fun Nota(texto: String) {
    Text(texto, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 4.dp))
}

@Composable
private fun FonteItem(nome: String, url: String, utilidade: String?, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 8.dp, horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = null, tint = MaterialTheme.colorScheme.secondary, modifier = Modifier.size(16.dp))
        Spacer(modifier = Modifier.width(8.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(nome, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
            if (!utilidade.isNullOrBlank()) {
                Text(utilidade, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 3)
            }
            Text(url, fontSize = 10.sp, color = MaterialTheme.colorScheme.primary, maxLines = 1)
        }
    }
}
