package net.saibatudo.eleicoes2026.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import net.saibatudo.eleicoes2026.core.constants.AppConstants
import net.saibatudo.eleicoes2026.data.bundle.EstadoAtualizacao
import net.saibatudo.eleicoes2026.data.bundle.UpdateResult
import net.saibatudo.eleicoes2026.data.datasource.ElectionData
import net.saibatudo.eleicoes2026.domain.model.Datas
import net.saibatudo.eleicoes2026.domain.model.FaseEleitoral
import net.saibatudo.eleicoes2026.ui.theme.NavyAccent
import java.text.DateFormat
import java.text.NumberFormat
import java.util.Date
import java.util.Locale

/** "Sobre os dados": proveniência, versão, atualização, metodologia e limitações (transparência). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AboutDataScreen(
    dados: ElectionData?,
    fase: FaseEleitoral,
    atualizacao: EstadoAtualizacao,
    ultimaVerificacao: Long,
    onAtualizar: () -> Unit,
    onVoltar: () -> Unit
) {
    val context = LocalContext.current
    val inteiro = NumberFormat.getIntegerInstance(Locale.forLanguageTag("pt-BR"))
    fun abrir(url: String) {
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (_: Exception) { /* sem navegador */ }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Sobre os dados", color = Color.White, fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onVoltar) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Voltar", tint = Color.White) }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = NavyAccent)
            )
        }
    ) { inner ->
        Column(modifier = Modifier.fillMaxSize().padding(inner).verticalScroll(rememberScrollState()).padding(16.dp)) {
            if (dados == null) {
                Text("Dados ainda não carregados.", color = MaterialTheme.colorScheme.onBackground)
                return@Column
            }
            val m = dados.manifest
            val r = dados.regras

            Titulo("Versão dos dados")
            Item("Pacote", m.dataVersion ?: "—")
            Item("Origem em uso", dados.origem)
            Item("Extração do TSE", r.extracaoTse.ifBlank { "—" })
            Item("Gerado em (UTC)", m.generatedAt ?: "—")
            Item("Fase do calendário", fase.rotulo)
            Item("Candidaturas", "${inteiro.format(r.estatisticas.totalRegistros)} (${inteiro.format(r.estatisticas.totalNaUrna)} na urna)")
            Item("Pesquisas registradas", inteiro.format(r.estatisticas.pesquisasRegistradas))
            Item("Eleição", "1º turno ${Datas.formatarBr(r.turno1)} • 2º turno ${Datas.formatarBr(r.turno2)}")
            if (ultimaVerificacao > 0) {
                Item("Última verificação", DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT, Locale.forLanguageTag("pt-BR")).format(Date(ultimaVerificacao)))
            }

            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Button(onClick = onAtualizar, enabled = atualizacao !is EstadoAtualizacao.Verificando) {
                    if (atualizacao is EstadoAtualizacao.Verificando) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                    } else {
                        Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                    }
                    Spacer(Modifier.width(8.dp))
                    Text("Atualizar agora")
                }
                Spacer(Modifier.width(12.dp))
                val msg = when (val a = atualizacao) {
                    is EstadoAtualizacao.Concluida -> when (val x = a.resultado) {
                        is UpdateResult.UpToDate -> "Você já tem a versão mais recente."
                        is UpdateResult.Updated -> "Atualizado: ${x.arquivosBaixados} arquivo(s) baixado(s)."
                        is UpdateResult.Skipped -> "Não verificado: ${x.motivo}."
                        is UpdateResult.Failed -> "Não foi possível atualizar agora (${x.erro.take(60)}). O app segue usando o pacote atual."
                    }
                    else -> ""
                }
                Text(msg, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
            }
            Text(
                "O app confere atualizações automaticamente (a cada poucas horas; a cada 15 min nos dias de votação). Cada pacote é " +
                    "aceito somente se a assinatura digital e os checksums forem válidos.",
                fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp)
            )

            Spacer(Modifier.height(14.dp))
            Titulo("Fontes e licença")
            Text(m.atribuicao ?: AppConstants.FONTE_DADOS, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            m.fontes.orEmpty().forEach { f ->
                Column(modifier = Modifier.padding(top = 8.dp)) {
                    Text(f.descricao ?: f.id.orEmpty(), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onBackground)
                    Text(f.url.orEmpty(), fontSize = 10.sp, color = MaterialTheme.colorScheme.primary)
                    Text(
                        listOfNotNull(f.lastModified?.let { "Modificado no TSE: $it" }, f.coletadoEm?.let { "coletado em $it" }).joinToString(" • "),
                        fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            Spacer(Modifier.height(6.dp))
            TextButton(onClick = { abrir(AppConstants.URL_DADOS_ABERTOS_TSE) }) { Text("Abrir o Portal de Dados Abertos do TSE") }

            Spacer(Modifier.height(10.dp))
            Titulo("Metodologia e limitações")
            r.glossario.forEach { (chave, texto) ->
                Text("• ${rotuloGlossario(chave)}: $texto", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 3.dp))
            }
            Limitacao("Fotos: as de Presidente, Governador e Senador acompanham o app; as demais vêm do CDN oficial do TSE quando há conexão.")
            Limitacao("Planos de governo: o TSE registra o documento principalmente para Presidente e Governador; os temas exibidos são detectados automaticamente.")
            Limitacao("Resultados: durante a apuração, o app mostra os números do TSE (resultados.tse.jus.br) exatamente como publicados; resultados definitivos vêm dos arquivos abertos do TSE após a totalização.")
            Limitacao("Não há avaliação, ranking ou recomendação de candidatos. A ordem das listas é fixa (cargo, estado e número).")
            Limitacao("Em caso de divergência, vale sempre o site oficial do TSE. Encontrou um erro? Use o botão \"Relatar\" na resposta da IA ou abra uma issue no GitHub.")
            Spacer(Modifier.height(20.dp))
        }
    }
}

private fun rotuloGlossario(k: String) = when (k) {
    "elegibilidade" -> "Situação da candidatura"
    "naUrna" -> "Na urna"
    "eleitoMesmoCargo" -> "Já eleito para o cargo"
    "temasPlano" -> "Temas do plano de governo"
    "patrimonioDeclarado" -> "Patrimônio declarado"
    else -> k
}

@Composable
private fun Titulo(texto: String) {
    Text(texto, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
    HorizontalDivider(modifier = Modifier.padding(vertical = 6.dp))
}

@Composable
private fun Item(rotulo: String, valor: String) {
    Row(modifier = Modifier.padding(vertical = 2.dp)) {
        Text("$rotulo: ", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onBackground)
        Text(valor, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun Limitacao(texto: String) {
    Text("• $texto", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 3.dp))
}
