package net.saibatudo.quimica.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import net.saibatudo.quimica.R
import net.saibatudo.quimica.data.model.Ghs
import net.saibatudo.quimica.domain.GhsTextos

/** Nomes dos pictogramas GHS em português (iguais aos do site). */
object GhsUi {
    val NOMES = mapOf(
        "GHS01" to "Explosivo", "GHS02" to "Inflamável", "GHS03" to "Comburente (oxidante)", "GHS04" to "Gás sob pressão", "GHS05" to "Corrosivo",
        "GHS06" to "Toxicidade aguda (tóxico ou fatal)", "GHS07" to "Nocivo, irritante ou sensibilizante", "GHS08" to "Perigo grave à saúde", "GHS09" to "Perigoso ao ambiente aquático"
    )

    fun recurso(codigo: String): Int? = when (codigo.uppercase()) {
        "GHS01" -> R.drawable.ic_ghs01
        "GHS02" -> R.drawable.ic_ghs02
        "GHS03" -> R.drawable.ic_ghs03
        "GHS04" -> R.drawable.ic_ghs04
        "GHS05" -> R.drawable.ic_ghs05
        "GHS06" -> R.drawable.ic_ghs06
        "GHS07" -> R.drawable.ic_ghs07
        "GHS08" -> R.drawable.ic_ghs08
        "GHS09" -> R.drawable.ic_ghs09
        else -> null
    }

    fun descricao(codigo: String): String {
        val c = codigo.uppercase()
        val desenho = GhsTextos.PICTOGRAMAS[c]?.first
        return "Pictograma $c: ${NOMES[c] ?: "perigo"}" + (desenho?.let { " (desenho: $it)" } ?: "")
    }
}

/** Um pictograma GHS (vetor simplificado) com texto alternativo e legenda opcional. */
@Composable
fun PictogramaGhs(codigo: String, tamanho: Dp = 72.dp, legenda: Boolean = true) {
    val recurso = GhsUi.recurso(codigo) ?: return
    Column(Modifier.width(tamanho + 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Image(painterResource(recurso), contentDescription = GhsUi.descricao(codigo), modifier = Modifier.size(tamanho))
        if (legenda) {
            Text(
                GhsUi.NOMES[codigo.uppercase()] ?: codigo, style = MaterialTheme.typography.labelSmall, textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.semantics { contentDescription = "" }
            )
        }
    }
}

/** Classificação GHS de um composto: pictogramas, palavra de sinal e frases H em português. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun GhsView(ghs: Ghs, textosH: Map<String, String>, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (ghs.pictogramas.isNotEmpty()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                ghs.pictogramas.forEach { PictogramaGhs(it) }
            }
        }
        ghs.palavraSinal?.let { sinal ->
            Row(Modifier.semantics(mergeDescendants = true) { contentDescription = "Palavra de sinal: $sinal" }) {
                Text("Palavra de sinal: ", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(sinal, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, color = if (sinal.equals("Perigo", true)) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface)
            }
        }
        if (ghs.frasesH.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                ghs.frasesH.forEach { codigo ->
                    val texto = textosH[codigo] ?: GhsTextos.fraseH(codigo)
                    Text(
                        if (texto != null) "$codigo: $texto" else codigo, style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
            }
        }
        ghs.fonte?.let { Text("Classificação: $it", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}
