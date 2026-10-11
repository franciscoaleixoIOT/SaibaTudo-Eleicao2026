package net.saibatudo.quimica.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import net.saibatudo.quimica.data.model.CategoriaElemento
import net.saibatudo.quimica.data.prefs.Nivel
import net.saibatudo.quimica.data.repository.Pacote
import net.saibatudo.quimica.domain.Propriedades
import net.saibatudo.quimica.domain.Texto
import net.saibatudo.quimica.domain.calc.Unidades
import net.saibatudo.quimica.ui.components.AvisoBox
import net.saibatudo.quimica.ui.components.Cartao
import net.saibatudo.quimica.ui.components.FontesView
import net.saibatudo.quimica.ui.components.LinhaCampo
import net.saibatudo.quimica.ui.components.TituloSecao
import net.saibatudo.quimica.ui.theme.LocalTemaEscuro

/** Ficha do elemento: símbolo, categoria e propriedades com unidades legíveis (K também em °C), conforme o nível escolhido. */
@Composable
fun ElementoScreen(z: Int, pacote: Pacote?, nivel: Nivel, onAbrirElemento: (Int) -> Unit, onAbrirUrl: (String) -> Unit, modifier: Modifier = Modifier) {
    val e = pacote?.porZ?.get(z)
    if (pacote == null || e == null) {
        Text("Elemento não encontrado no pacote de dados.", modifier.padding(16.dp))
        return
    }
    val un = Unidades.de(pacote.regras)
    val tabela = Propriedades.tabela(pacote.regras)
    val linhas = Propriedades.fichaElemento(e, tabela, un, nivel)
    val escuro = LocalTemaEscuro.current
    val corFundo = if (escuro) Color(0xFF134E4A) else Color(0xFFE0F2F1)
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(
            Modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = "${e.nome}, símbolo ${e.simbolo}, número atômico ${e.z}, ${Propriedades.rotuloCategoria(e.categoria)}" },
            horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically
        ) {
            Box(Modifier.size(92.dp).clip(RoundedCornerShape(14.dp)).background(corFundo), contentAlignment = Alignment.Center) {
                Text("${e.z}", Modifier.align(Alignment.TopStart).padding(8.dp), fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurface)
                Text(e.simbolo, fontSize = 38.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface, textAlign = TextAlign.Center)
            }
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(e.nome, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                e.nomeEn?.takeIf { !it.equals(e.nome, true) }?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                Text(
                    Propriedades.rotuloCategoria(e.categoria).replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.primary
                )
            }
        }
        Cartao {
            TituloSecao("Propriedades")
            if (linhas.isEmpty()) Text("O pacote de dados ainda não traz propriedades deste elemento.", style = MaterialTheme.typography.bodyMedium)
            linhas.forEach { LinhaCampo(it.rotulo, it.valor) }
            e.massaAtomicaIncerteza?.let { LinhaCampo("Incerteza da massa atômica", "± ${Texto.significativos(it, 3)} u") }
            if (nivel != Nivel.SUPERIOR) {
                Text("Para ver todas as propriedades, mude o nível para Superior em Configurações.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (e.categoria == CategoriaElemento.DESCONHECIDA) AvisoBox("A categoria deste elemento ainda é desconhecida nos dados.")
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            val anterior = pacote.elementos.lastOrNull { it.z < e.z }
            val proximo = pacote.elementos.firstOrNull { it.z > e.z }
            OutlinedButton(onClick = { anterior?.let { onAbrirElemento(it.z) } }, enabled = anterior != null, modifier = Modifier.weight(1f)) {
                Text(anterior?.let { "← ${it.nome}" } ?: "Anterior", maxLines = 1)
            }
            OutlinedButton(onClick = { proximo?.let { onAbrirElemento(it.z) } }, enabled = proximo != null, modifier = Modifier.weight(1f)) {
                Text(proximo?.let { "${it.nome} →" } ?: "Próximo", maxLines = 1)
            }
        }
        Cartao { FontesView(e.fontes.ifEmpty { pacote.fontesExibicao.take(2) }, onAbrirUrl) }
    }
}
