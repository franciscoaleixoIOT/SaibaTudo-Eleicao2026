package net.saibatudo.quimica.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.BaselineShift
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import net.saibatudo.quimica.data.model.Fonte
import net.saibatudo.quimica.data.model.UnidadeDef
import net.saibatudo.quimica.domain.Texto

/** Cartão padrão do app: superfície com borda fina. */
@Composable
fun Cartao(modifier: Modifier = Modifier, conteudo: @Composable () -> Unit) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { conteudo() }
    }
}

/** Título de seção, anunciado como cabeçalho pelos leitores de tela. */
@Composable
fun TituloSecao(texto: String, modifier: Modifier = Modifier) {
    Text(
        texto, modifier = modifier.semantics { heading() }, style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface
    )
}

/** "Rótulo: valor" em duas colunas; o leitor de tela lê "rótulo: valor" de uma vez. */
@Composable
fun LinhaCampo(rotulo: String, valor: String, modifier: Modifier = Modifier) {
    Row(
        modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = "$rotulo: $valor" },
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(rotulo, modifier = Modifier.weight(0.42f), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(valor, modifier = Modifier.weight(0.58f), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurface)
    }
}

@Composable
fun AvisoBox(texto: String, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier.fillMaxWidth(), shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)
    ) {
        Text(texto, Modifier.padding(10.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSecondaryContainer)
    }
}

/**
 * Fórmula química com índices subscritos e cargas sobrescritas (H₂O, Ca(OH)₂, Fe³⁺), por deslocamento de linha de base
 * (assim funciona em qualquer fonte). A leitura em voz alta usa a fórmula como foi escrita.
 */
fun formulaAnotada(formula: String): AnnotatedString {
    val f = Texto.paraAscii(formula).trim()
    return buildAnnotatedString {
        fun fimDeToken(j: Int) = j >= f.length || f[j] == ' ' || f[j] == '·'
        fun sub(t: String) = withStyle(SpanStyle(baselineShift = BaselineShift.Subscript, fontSize = 0.72.em)) { append(t) }
        fun sup(t: String) = withStyle(SpanStyle(baselineShift = BaselineShift.Superscript, fontSize = 0.72.em)) { append(t) }
        var i = 0
        while (i < f.length) {
            val c = f[i]
            val prev = if (i > 0) f[i - 1] else ' '
            val apos = prev.isLetter() || prev == ')' || prev == ']'
            if (c == '^') {
                var j = i + 1
                while (j < f.length && (f[j].isDigit() || f[j] == '+' || f[j] == '-')) j++
                sup(f.substring(i + 1, j).replace('-', '−'))
                i = j
            } else if (c.isDigit() && apos) {
                var j = i
                while (j < f.length && f[j].isDigit()) j++
                val num = f.substring(i, j)
                if (j < f.length && (f[j] == '+' || f[j] == '-') && fimDeToken(j + 1)) {
                    sup(num + if (f[j] == '-') "−" else "+")
                    i = j + 1
                } else {
                    sub(num)
                    i = j
                }
            } else if ((c == '+' || c == '-') && apos && fimDeToken(i + 1)) {
                sup(if (c == '-') "−" else "+")
                i++
            } else {
                append(c)
                i++
            }
        }
    }
}

@Composable
fun FormulaTexto(formula: String, modifier: Modifier = Modifier, estilo: TextStyle = MaterialTheme.typography.titleLarge) {
    Text(
        formulaAnotada(formula), modifier = modifier.semantics { contentDescription = "Fórmula $formula" }, style = estilo,
        color = MaterialTheme.colorScheme.onSurface
    )
}

/** Linha de chips que quebra de linha; [selecionado] marca o ativo. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ChipsLinha(itens: List<String>, selecionado: String?, onClick: (String) -> Unit, modifier: Modifier = Modifier) {
    FlowRow(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        itens.forEach { item ->
            FilterChip(selected = item == selecionado, onClick = { onClick(item) }, label = { Text(item, style = MaterialTheme.typography.labelLarge) })
        }
    }
}

/** Lista de fontes com licença; o endereço é um botão que abre no navegador. */
@Composable
fun FontesView(fontes: List<Fonte>, onAbrirUrl: (String) -> Unit, modifier: Modifier = Modifier) {
    if (fontes.isEmpty()) return
    Column(modifier, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text("Fonte" + if (fontes.size > 1) "s" else "", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        fontes.forEach { f ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(f.rotulo(), Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                val url = f.url
                if (url != null && url.startsWith("https://")) {
                    TextButton(onClick = { onAbrirUrl(url) }) { Text("Abrir", style = MaterialTheme.typography.labelMedium) }
                }
            }
        }
    }
}

/** Campo numérico que aceita vírgula ou ponto decimal e notação científica (1,8e-5). */
@Composable
fun CampoNumero(
    valor: String, onValor: (String) -> Unit, rotulo: String, modifier: Modifier = Modifier, sufixo: String? = null,
    dica: String? = null, erro: Boolean = false
) {
    OutlinedTextField(
        value = valor, onValueChange = { onValor(it.take(40)) }, label = { Text(rotulo) }, singleLine = true, modifier = modifier,
        suffix = sufixo?.let { { Text(it) } }, supportingText = dica?.let { { Text(it) } }, isError = erro,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text)
    )
}

/** Seletor de unidade (lista suspensa) entre as unidades de uma grandeza. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DropdownUnidade(opcoes: List<UnidadeDef>, selecionada: UnidadeDef, onSelecionar: (UnidadeDef) -> Unit, modifier: Modifier = Modifier, rotulo: String = "Unidade") {
    var aberto by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = aberto, onExpandedChange = { aberto = it }, modifier = modifier) {
        OutlinedTextField(
            value = selecionada.simbolo, onValueChange = {}, readOnly = true, label = { Text(rotulo) }, singleLine = true,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = aberto) },
            modifier = Modifier.menuAnchor(androidx.compose.material3.MenuAnchorType.PrimaryNotEditable).fillMaxWidth()
        )
        ExposedDropdownMenu(expanded = aberto, onDismissRequest = { aberto = false }) {
            opcoes.forEach { u ->
                DropdownMenuItem(
                    text = { Text(if (u.nome.isNullOrBlank()) u.simbolo else "${u.simbolo} — ${u.nome}") },
                    onClick = { onSelecionar(u); aberto = false }
                )
            }
        }
    }
}

@Composable
fun EspacoV(altura: Int = 8) = Spacer(Modifier.height(altura.dp))

@Composable
fun EspacoH(largura: Int = 8) = Spacer(Modifier.width(largura.dp))

/** Texto decorativo escondido dos leitores de tela. */
fun Modifier.semLeitura(): Modifier = this.clearAndSetSemantics { }
