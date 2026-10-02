package net.saibatudo.eleicoes2026.ui.components

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.GppBad
import androidx.compose.material.icons.filled.HelpOutline
import androidx.compose.material.icons.filled.HowToVote
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import net.saibatudo.eleicoes2026.core.constants.AppConstants
import net.saibatudo.eleicoes2026.domain.model.Candidate
import net.saibatudo.eleicoes2026.domain.model.TseRegras
import net.saibatudo.eleicoes2026.domain.model.Ufs
import java.text.NumberFormat
import java.util.Locale

@Composable
fun CandidateDetailDialog(
    candidate: Candidate,
    regras: TseRegras?,
    permitirFotoRemota: Boolean,
    onDismiss: () -> Unit,
    onSimularVoto: (Candidate) -> Unit
) {
    val context = LocalContext.current
    val moeda = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("pt-BR"))
    val inteiro = NumberFormat.getIntegerInstance(Locale.forLanguageTag("pt-BR"))

    fun abrir(url: String) {
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (_: Exception) { /* sem navegador */ }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            Button(onClick = { onSimularVoto(candidate) }, shape = RoundedCornerShape(12.dp)) {
                Icon(Icons.Default.HowToVote, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("Simulador educativo")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Fechar", color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
            }
        },
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                FotoCandidato(candidate, 46.dp, permitirFotoRemota)
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                    Text(candidate.nomeUrna, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                    Text(
                        "${candidate.cargo} • Nº ${candidate.numero} • ${candidate.partido}",
                        fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        },
        text = {
            Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState())) {
                HorizontalDivider(modifier = Modifier.padding(bottom = 8.dp))

                // Ficha Limpa (derivada da situação oficial do registro; ver FichaLimpa)
                val ficha = candidate.fichaLimpa
                val (fundoFicha, corFicha) = CoresFichaLimpa.de(ficha)
                Secao("Ficha Limpa (Lei Complementar 135/2010)")
                Row(
                    modifier = Modifier.fillMaxWidth().background(fundoFicha, RoundedCornerShape(10.dp)).padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        when (ficha.impedimento) { false -> Icons.Default.VerifiedUser; true -> Icons.Default.GppBad; null -> Icons.Default.HelpOutline },
                        contentDescription = null, tint = corFicha, modifier = Modifier.size(22.dp)
                    )
                    Spacer(Modifier.width(8.dp))
                    Column {
                        Text(candidate.fichaLimpaTexto, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = corFicha)
                        Text(ficha.explicacao, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurface)
                    }
                }
                Nota("Derivado da situação oficial do registro no TSE: não é certidão e pode caber recurso. " +
                    "Certidões criminais do candidato: DivulgaCandContas.")

                Spacer(Modifier.height(10.dp))
                Secao("Situação da candidatura (TSE)")
                Linha("Situação", candidate.elegibilidade.rotulo)
                candidate.situacao?.let { Linha("Texto oficial", it.lowercase().replaceFirstChar(Char::uppercase)) }
                Linha("Inserida na urna", if (candidate.naUrna) "Sim" else "Não")
                if (candidate.substituido) Linha("Substituição", "Candidatura substituída")
                if (candidate.motivosIndeferimento.isNotEmpty()) {
                    Texto("Motivos registrados no julgamento:")
                    candidate.motivosIndeferimento.forEach { Texto("• $it", Modifier.padding(start = 8.dp)) }
                }
                Nota("Situação do julgamento do registro de candidatura pela Justiça Eleitoral (texto oficial do TSE).")

                candidate.resultado?.let { r ->
                    Spacer(Modifier.height(10.dp))
                    Secao("Resultado oficial")
                    r.situacaoTotalizacao?.let { Linha("Totalização", it.lowercase().replaceFirstChar(Char::uppercase)) }
                    r.turnos.entries.sortedBy { it.key }.forEach { (t, v) ->
                        Linha(
                            "${t}º turno",
                            (v.votos?.let { "${inteiro.format(it)} votos" } ?: "—") +
                                (v.percentual?.let { " (${"%.2f".format(Locale.forLanguageTag("pt-BR"), it)}%)" } ?: "")
                        )
                    }
                }

                Spacer(Modifier.height(10.dp))
                Secao("Dados cadastrais")
                Linha("Nome completo", candidate.nomeCompleto.lowercase().split(' ').joinToString(" ") { it.replaceFirstChar(Char::uppercase) })
                candidate.federacao?.let { Linha("Federação", it) }
                candidate.coligacao?.let { Linha("Coligação", it) }
                Linha("Estado", if (candidate.estadoUf == "BR") "Nacional" else (Ufs.NOMES[candidate.estadoUf] ?: candidate.estadoUf))
                candidate.municipioNascimento?.let { Linha("Naturalidade", "${it.lowercase().replaceFirstChar(Char::uppercase)}${candidate.ufNascimento?.let { u -> "/$u" } ?: ""}") }
                candidate.idade?.let { Linha("Idade na posse", "$it anos") }
                candidate.ocupacao?.let { Linha("Ocupação declarada", it.lowercase().replaceFirstChar(Char::uppercase)) }
                candidate.grauInstrucao?.let { Linha("Escolaridade", it.lowercase().replaceFirstChar(Char::uppercase)) }
                candidate.genero?.let { Linha("Gênero", it.lowercase().replaceFirstChar(Char::uppercase)) }

                Spacer(Modifier.height(10.dp))
                Secao("Bens declarados ao TSE")
                when {
                    candidate.patrimonioDeclarado != null ->
                        Linha("Total declarado", "${moeda.format(candidate.patrimonioDeclarado)} (${candidate.qtdBens ?: "?"} bens)")
                    candidate.declaraBens == false -> Texto("O candidato informou não possuir bens a declarar.")
                    else -> Texto("Sem bens declarados nos dados do TSE.")
                }
                Nota(regras?.glossario?.get("patrimonioDeclarado") ?: "Valor declarado pelo próprio candidato.")

                candidate.contas?.let { c ->
                    Spacer(Modifier.height(10.dp))
                    Secao("Prestação de contas da campanha")
                    Linha("Receitas declaradas", moeda.format(c.receitas))
                    Linha("Despesas contratadas", moeda.format(c.despesasContratadas))
                    Nota("Dados da prestação de contas (${c.tipo?.lowercase() ?: "parcial"}), geração do TSE em ${c.geradoEm ?: "—"}. " +
                        "Valores podem mudar até a prestação final; confira no DivulgaCandContas.")
                }

                Spacer(Modifier.height(10.dp))
                Secao("Histórico eleitoral (derivado do histórico do TSE)")
                Linha("Eleições disputadas", candidate.eleicoesDisputadas.toString())
                Linha("Vezes eleito", candidate.vezesEleito.toString())
                if (candidate.eleitoMesmoCargo) Texto("Já foi eleito para este mesmo cargo em eleição anterior.")

                if (candidate.temPlanoGoverno) {
                    Spacer(Modifier.height(10.dp))
                    Secao("Plano de governo registrado")
                    if (candidate.temasPlano.isNotEmpty()) {
                        Texto("Temas mais citados (detecção automática): " +
                            candidate.temasPlano.joinToString(", ") { regras?.temas?.get(it) ?: it })
                        Nota(regras?.glossario?.get("temasPlano") ?: "Indica conteúdo citado, não avaliação do plano.")
                    }
                    Texto("O documento completo está no DivulgaCandContas.")
                }

                if (candidate.redesSociais.isNotEmpty()) {
                    Spacer(Modifier.height(10.dp))
                    Secao("Redes sociais informadas ao TSE")
                    candidate.redesSociais.take(4).forEach { url ->
                        Text(
                            text = url.removePrefix("https://").removePrefix("http://"),
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.padding(top = 2.dp).clickable { abrir(url) }
                        )
                    }
                }

                Spacer(Modifier.height(12.dp))
                Text(
                    text = "Fonte: Dados Abertos do TSE (CC BY). Confirme no DivulgaCandContas.",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.clickable { abrir(AppConstants.URL_DIVULGA_CAND_CONTAS) }
                )
            }
        },
        shape = RoundedCornerShape(16.dp)
    )
}

@Composable
private fun Secao(titulo: String) {
    Text(titulo, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurface,
        modifier = Modifier.padding(bottom = 2.dp))
}

@Composable
private fun Linha(rotulo: String, valor: String) {
    Row(modifier = Modifier.padding(vertical = 1.dp)) {
        Text("$rotulo: ", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
        Text(valor, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun Texto(texto: String, modifier: Modifier = Modifier) {
    Text(texto, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = modifier.padding(vertical = 1.dp))
}

@Composable
private fun Nota(texto: String) {
    Text(texto, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 3.dp))
}
