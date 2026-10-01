package net.saibatudo.eleicoes2026.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import net.saibatudo.eleicoes2026.data.bundle.AssetBundleReader
import net.saibatudo.eleicoes2026.domain.model.Candidate

/** Código da eleição no sistema de divulgação do TSE: 6257 = federal (Presidente); 6259 = estadual. */
private fun codigoEleicaoFoto(c: Candidate) = if (c.estadoUf == "BR") 6257 else 6259

/** Foto oficial publicada pelo TSE (somente para candidaturas com foto cadastrada, para evitar erros 404). */
fun urlFotoRemota(c: Candidate): String? =
    if (c.temFoto) "https://resultados.tse.jus.br/oficial/ele2026/${codigoEleicaoFoto(c)}/fotos/${c.estadoUf.lowercase()}/${c.id}.jpeg"
    else null

/**
 * Foto oficial do candidato: usa a imagem empacotada (offline) quando existe; senão, a do CDN oficial do TSE
 * (cache em disco); sem foto, mostra o número do candidato. Em economia de dados, não busca fotos remotas.
 */
@Composable
fun FotoCandidato(
    candidato: Candidate,
    tamanho: Dp,
    permitirRemota: Boolean = true,
    modifier: Modifier = Modifier
) {
    var asset by remember(candidato.id) { mutableStateOf(candidato.foto != null) }
    val modelo: Any? = when {
        asset && candidato.foto != null -> "file:///android_asset/${AssetBundleReader.ASSET_BASE}/${candidato.foto}"
        permitirRemota -> urlFotoRemota(candidato)
        else -> null
    }
    if (modelo != null) {
        AsyncImage(
            model = modelo,
            contentDescription = "Foto oficial de ${candidato.nomeUrna}",
            contentScale = ContentScale.Crop,
            onError = { if (asset) asset = false },
            modifier = modifier
                .size(tamanho)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.surfaceVariant)
        )
    } else {
        Box(
            modifier = modifier
                .size(tamanho)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primaryContainer),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = candidato.numero,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
                fontWeight = FontWeight.Bold,
                fontSize = if (candidato.numero.length >= 4) 14.sp else 17.sp
            )
        }
    }
}
