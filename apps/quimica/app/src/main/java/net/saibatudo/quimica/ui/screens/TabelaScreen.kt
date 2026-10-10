package net.saibatudo.quimica.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import net.saibatudo.quimica.data.model.CategoriaElemento
import net.saibatudo.quimica.data.model.Elemento
import net.saibatudo.quimica.data.model.EstadoFisico
import net.saibatudo.quimica.data.repository.Pacote
import net.saibatudo.quimica.domain.Propriedades
import net.saibatudo.quimica.ui.theme.LocalTemaEscuro

private enum class ModoCor(val rotulo: String) { CATEGORIA("Categoria"), ESTADO("Estado"), BLOCO("Bloco") }

private data class CorCelula(val fundo: Color, val texto: Color)

private fun cor(claro: Long, escuro: Long, usaEscuro: Boolean) =
    if (usaEscuro) CorCelula(Color(escuro), Color(0xFFF8FAFC)) else CorCelula(Color(claro), Color(0xFF111827))

private fun corCategoria(c: CategoriaElemento, e: Boolean) = when (c) {
    CategoriaElemento.METAL_ALCALINO -> cor(0xFFF8B4B4, 0xFF7F1D1D, e)
    CategoriaElemento.METAL_ALCALINO_TERROSO -> cor(0xFFFDBA74, 0xFF7C2D12, e)
    CategoriaElemento.METAL_TRANSICAO -> cor(0xFFFDE68A, 0xFF713F12, e)
    CategoriaElemento.METAL_POS_TRANSICAO -> cor(0xFFBEF264, 0xFF365314, e)
    CategoriaElemento.SEMIMETAL -> cor(0xFF6EE7B7, 0xFF064E3B, e)
    CategoriaElemento.NAO_METAL -> cor(0xFF7DD3FC, 0xFF0C4A6E, e)
    CategoriaElemento.HALOGENIO -> cor(0xFFA5B4FC, 0xFF312E81, e)
    CategoriaElemento.GAS_NOBRE -> cor(0xFFD8B4FE, 0xFF581C87, e)
    CategoriaElemento.LANTANIDEO -> cor(0xFFF9A8D4, 0xFF831843, e)
    CategoriaElemento.ACTINIDEO -> cor(0xFFFDA4AF, 0xFF881337, e)
    CategoriaElemento.DESCONHECIDA -> cor(0xFFE5E7EB, 0xFF374151, e)
}

private fun corEstado(s: EstadoFisico, e: Boolean) = when (s) {
    EstadoFisico.SOLIDO -> cor(0xFFFDE68A, 0xFF713F12, e)
    EstadoFisico.LIQUIDO -> cor(0xFF7DD3FC, 0xFF0C4A6E, e)
    EstadoFisico.GAS -> cor(0xFFFDA4AF, 0xFF881337, e)
    EstadoFisico.DESCONHECIDO -> cor(0xFFE5E7EB, 0xFF374151, e)
}

private fun corBloco(b: String?, e: Boolean) = when (b) {
    "s" -> cor(0xFFF8B4B4, 0xFF7F1D1D, e)
    "p" -> cor(0xFF7DD3FC, 0xFF0C4A6E, e)
    "d" -> cor(0xFFFDE68A, 0xFF713F12, e)
    "f" -> cor(0xFFD8B4FE, 0xFF581C87, e)
    else -> cor(0xFFE5E7EB, 0xFF374151, e)
}

private fun chaveDe(modo: ModoCor, el: Elemento): String = when (modo) {
    ModoCor.CATEGORIA -> el.categoria.id
    ModoCor.ESTADO -> el.estadoPadrao.id
    ModoCor.BLOCO -> el.bloco ?: "?"
}

private fun corDe(modo: ModoCor, el: Elemento, escuro: Boolean) = when (modo) {
    ModoCor.CATEGORIA -> corCategoria(el.categoria, escuro)
    ModoCor.ESTADO -> corEstado(el.estadoPadrao, escuro)
    ModoCor.BLOCO -> corBloco(el.bloco, escuro)
}

/** Tabela periódica interativa: grade por grupo (colunas) e período (linhas), cores por categoria, estado ou bloco, com filtro pela legenda. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TabelaScreen(pacote: Pacote?, onAbrirElemento: (Int) -> Unit, modifier: Modifier = Modifier) {
    val escuro = LocalTemaEscuro.current
    var modo by rememberSaveable { mutableStateOf(ModoCor.CATEGORIA) }
    var filtro by rememberSaveable { mutableStateOf<String?>(null) }

    if (pacote == null) {
        Text("Carregando os dados…", modifier.padding(16.dp))
        return
    }
    val elementos = pacote.elementos
    val principais = remember(elementos) { elementos.filter { it.categoria != CategoriaElemento.LANTANIDEO && it.categoria != CategoriaElemento.ACTINIDEO && it.periodo != null && it.grupo != null } }
    val porPosicao = remember(principais) { principais.associateBy { (it.periodo!!) to (it.grupo!!) } }
    val lantanideos = remember(elementos) { elementos.filter { it.categoria == CategoriaElemento.LANTANIDEO }.sortedBy { it.z } }
    val actinideos = remember(elementos) { elementos.filter { it.categoria == CategoriaElemento.ACTINIDEO }.sortedBy { it.z } }
    val sem = remember(elementos) { elementos.filter { it !in principais && it !in lantanideos && it !in actinideos } }
    val maxPeriodo = (principais.maxOfOrNull { it.periodo!! } ?: 7).coerceAtLeast(1)
    val maxGrupo = (principais.maxOfOrNull { it.grupo!! } ?: 18).coerceAtLeast(1)

    // legenda = filtro: só aparece o que existe nos dados
    val legenda: List<Pair<String, String>> = remember(modo, elementos) {
        when (modo) {
            ModoCor.CATEGORIA -> CategoriaElemento.entries.filter { c -> elementos.any { it.categoria == c } }.map { it.id to it.rotulo }
            ModoCor.ESTADO -> EstadoFisico.entries.filter { s -> elementos.any { it.estadoPadrao == s } }.map { it.id to it.rotulo }
            ModoCor.BLOCO -> listOf("s", "p", "d", "f").filter { b -> elementos.any { it.bloco == b } }.map { it to "Bloco $it" }
        }
    }

    Column(modifier.fillMaxSize()) {
        Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Tabela periódica", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
            Text("Toque num elemento para abrir a ficha. Toque na legenda para destacar um grupo.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Colorir por", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                ModoCor.entries.forEach { m ->
                    FilterChip(selected = m == modo, onClick = { modo = m; filtro = null }, label = { Text(m.rotulo) })
                }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                legenda.forEach { (chave, rotulo) ->
                    val amostra = when (modo) {
                        ModoCor.CATEGORIA -> corCategoria(CategoriaElemento.de(chave), escuro)
                        ModoCor.ESTADO -> corEstado(EstadoFisico.de(chave), escuro)
                        ModoCor.BLOCO -> corBloco(chave, escuro)
                    }
                    FilterChip(
                        selected = filtro == chave, onClick = { filtro = if (filtro == chave) null else chave },
                        leadingIcon = { Box(Modifier.size(14.dp).clip(RoundedCornerShape(3.dp)).background(amostra.fundo)) },
                        label = { Text(rotulo, style = MaterialTheme.typography.labelMedium) }
                    )
                }
            }
        }
        // a grade rola nos dois sentidos
        Box(Modifier.weight(1f).fillMaxWidth().horizontalScroll(rememberScrollState()).verticalScroll(rememberScrollState())) {
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(CELULA_ESPACO)) {
                Row(horizontalArrangement = Arrangement.spacedBy(CELULA_ESPACO)) {
                    Box(Modifier.width(RotuloLargura))
                    for (g in 1..maxGrupo) {
                        Box(Modifier.width(CELULA_W).semantics { contentDescription = "Grupo $g" }, contentAlignment = Alignment.Center) {
                            Text("$g", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                for (p in 1..maxPeriodo) {
                    Row(horizontalArrangement = Arrangement.spacedBy(CELULA_ESPACO), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.width(RotuloLargura).semantics { contentDescription = "Período $p" }, contentAlignment = Alignment.Center) {
                            Text("$p", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        for (g in 1..maxGrupo) {
                            val e = porPosicao[p to g]
                            if (e != null) Celula(e, modo, filtro, escuro, onAbrirElemento)
                            else if (g == 3 && p in 6..7 && (if (p == 6) lantanideos else actinideos).isNotEmpty()) MarcadorSerie(if (p == 6) lantanideos else actinideos, escuro)
                            else Box(Modifier.size(CELULA_W, CELULA_H))
                        }
                    }
                }
                if (lantanideos.isNotEmpty() || actinideos.isNotEmpty()) {
                    Box(Modifier.height(8.dp))
                    if (lantanideos.isNotEmpty()) LinhaSerie("Lantanídeos", lantanideos, modo, filtro, escuro, onAbrirElemento)
                    if (actinideos.isNotEmpty()) LinhaSerie("Actinídeos", actinideos, modo, filtro, escuro, onAbrirElemento)
                }
                if (sem.isNotEmpty()) LinhaSerie("Outros", sem, modo, filtro, escuro, onAbrirElemento)
            }
        }
    }
}

private val CELULA_W = 50.dp
private val CELULA_H = 58.dp
private val CELULA_ESPACO = 3.dp
private val RotuloLargura = 28.dp

@Composable
private fun LinhaSerie(titulo: String, lista: List<Elemento>, modo: ModoCor, filtro: String?, escuro: Boolean, onAbrir: (Int) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(titulo, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.semantics { heading() })
        Row(horizontalArrangement = Arrangement.spacedBy(CELULA_ESPACO)) {
            Box(Modifier.width(RotuloLargura))
            lista.forEach { Celula(it, modo, filtro, escuro, onAbrir) }
        }
    }
}

@Composable
private fun MarcadorSerie(lista: List<Elemento>, escuro: Boolean) {
    val c = corCategoria(lista.first().categoria, escuro)
    Box(
        Modifier.size(CELULA_W, CELULA_H).clip(RoundedCornerShape(6.dp)).background(c.fundo.copy(alpha = 0.45f))
            .semantics { contentDescription = "${lista.first().categoria.rotulo}s, elementos ${lista.first().z} a ${lista.last().z}, mostrados abaixo da tabela" },
        contentAlignment = Alignment.Center
    ) {
        Text("${lista.first().z}–${lista.last().z}", fontSize = 10.sp, color = c.texto, textAlign = TextAlign.Center)
    }
}

@Composable
private fun Celula(e: Elemento, modo: ModoCor, filtro: String?, escuro: Boolean, onAbrir: (Int) -> Unit) {
    val c = corDe(modo, e, escuro)
    val destacado = filtro == null || chaveDe(modo, e) == filtro
    val descricao = buildString {
        append("${e.nome}, símbolo ${e.simbolo}, número atômico ${e.z}, ${Propriedades.rotuloCategoria(e.categoria)}")
        if (e.estadoPadrao != EstadoFisico.DESCONHECIDO) append(", ${e.estadoPadrao.rotulo.lowercase()}")
        e.massaAtomica?.let { append(", massa atômica ${net.saibatudo.quimica.domain.Texto.numero(it, 4)}") }
    }
    Box(
        Modifier.size(CELULA_W, CELULA_H).alpha(if (destacado) 1f else 0.25f).clip(RoundedCornerShape(6.dp)).background(c.fundo)
            .clickable(role = Role.Button, onClickLabel = "Abrir a ficha de ${e.nome}") { onAbrir(e.z) }
            .semantics(mergeDescendants = true) { contentDescription = descricao; role = Role.Button }
    ) {
        Text("${e.z}", Modifier.align(Alignment.TopStart).padding(start = 3.dp, top = 2.dp), fontSize = 9.sp, color = c.texto)
        Text(e.simbolo, Modifier.align(Alignment.Center), fontSize = 16.sp, fontWeight = FontWeight.Bold, color = c.texto)
        Text(
            abreviar(e.nome), Modifier.align(Alignment.BottomCenter).padding(bottom = 2.dp), fontSize = 8.sp, color = c.texto, maxLines = 1, textAlign = TextAlign.Center
        )
        if (modo == ModoCor.CATEGORIA) {
            Text(e.categoria.letra, Modifier.align(Alignment.TopEnd).padding(end = 3.dp, top = 2.dp), fontSize = 8.sp, color = c.texto)
        }
    }
}

private fun abreviar(nome: String) = if (nome.length <= 9) nome else nome.take(8) + "."
