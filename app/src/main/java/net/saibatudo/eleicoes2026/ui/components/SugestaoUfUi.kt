package net.saibatudo.eleicoes2026.ui.components

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import net.saibatudo.eleicoes2026.SaibaTudoApp
import net.saibatudo.eleicoes2026.domain.model.Ufs

sealed interface EstadoSugestaoUf {
    data object Ocioso : EstadoSugestaoUf
    data object Procurando : EstadoSugestaoUf
    data class Sugerida(val uf: String) : EstadoSugestaoUf
    data object SemPermissao : EstadoSugestaoUf
    data object NaoEncontrada : EstadoSugestaoUf
}

class ControleSugestaoUf(val estado: EstadoSugestaoUf, val iniciar: () -> Unit)

/**
 * Sugestão de UF pela localização aproximada. Pede a permissão (se ainda não foi dada) e calcula a UF no aparelho.
 * [automatico] = tenta assim que a tela aparece (primeira execução). [onSugerida] recebe a UF encontrada.
 */
@Composable
fun rememberSugestaoUf(automatico: Boolean, onSugerida: (String) -> Unit): ControleSugestaoUf {
    val ctx = LocalContext.current
    val sugestao = remember { (ctx.applicationContext as SaibaTudoApp).container.sugestaoUf }
    val escopo = rememberCoroutineScope()
    var estado by remember { mutableStateOf<EstadoSugestaoUf>(EstadoSugestaoUf.Ocioso) }
    val aoSugerir by rememberUpdatedState(onSugerida)

    fun detectar() {
        estado = EstadoSugestaoUf.Procurando
        escopo.launch {
            val uf = runCatching { sugestao.sugerir() }.getOrNull()
            estado = if (uf != null) EstadoSugestaoUf.Sugerida(uf) else EstadoSugestaoUf.NaoEncontrada
            if (uf != null) aoSugerir(uf)
        }
    }

    val pedirPermissao = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { concedida ->
        if (concedida) detectar() else estado = EstadoSugestaoUf.SemPermissao
    }
    val iniciar: () -> Unit = {
        if (sugestao.temPermissao()) detectar() else pedirPermissao.launch(Manifest.permission.ACCESS_COARSE_LOCATION)
    }
    if (automatico) LaunchedEffect(Unit) { iniciar() }
    return ControleSugestaoUf(estado, iniciar)
}

/** Linha de status + botão "Usar minha localização". */
@Composable
fun StatusSugestaoUf(controle: ControleSugestaoUf, modifier: Modifier = Modifier) {
    val texto = when (val e = controle.estado) {
        EstadoSugestaoUf.Ocioso -> null
        EstadoSugestaoUf.Procurando -> "Procurando seu estado pela localização aproximada…"
        is EstadoSugestaoUf.Sugerida -> "Sugerido pela sua localização aproximada: ${Ufs.NOMES[e.uf] ?: e.uf}. Toque em outro estado para trocar."
        EstadoSugestaoUf.SemPermissao -> "Sem permissão de localização: escolha o estado na lista."
        EstadoSugestaoUf.NaoEncontrada -> "Não deu para descobrir o estado agora (localização desligada, sem sinal ou fora do Brasil). Escolha na lista."
    }
    Row(modifier = modifier.semantics { liveRegion = LiveRegionMode.Polite }, verticalAlignment = Alignment.CenterVertically) {
        if (controle.estado == EstadoSugestaoUf.Procurando) {
            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
            Spacer(Modifier.width(8.dp))
        }
        if (texto != null) {
            Text(texto, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
        } else {
            Spacer(Modifier.weight(1f))
        }
        if (controle.estado != EstadoSugestaoUf.Procurando) {
            TextButton(onClick = controle.iniciar) {
                Icon(Icons.Default.MyLocation, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(4.dp))
                Text("Usar minha localização", fontSize = 12.sp)
            }
        }
    }
}
