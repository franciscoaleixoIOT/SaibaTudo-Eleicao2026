package net.saibatudo.eleicoes2026.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Exibe o texto de uma resposta da IA seguindo o formato do AnswerBuilder:
 * 1ª linha = título (negrito); "• " = item com recuo; "Rótulo: valor" = rótulo em negrito; links clicáveis.
 * Só formata — nunca altera o conteúdo.
 */
@Composable
fun TextoResposta(texto: String, modifier: Modifier = Modifier) {
    val corTexto = MaterialTheme.colorScheme.onSurface
    val corLink = MaterialTheme.colorScheme.primary
    val linhas = remember(texto) { texto.split('\n').filter { it.isNotBlank() } }
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        linhas.forEachIndexed { i, linha ->
            when {
                linha.startsWith("• ") -> Row {
                    Text("•", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = corLink, modifier = Modifier.width(14.dp))
                    Text(
                        remember(linha, corLink) { anotarLinhaResposta(linha.removePrefix("• "), corLink, negritoNoRotulo = false) },
                        fontSize = 14.sp, lineHeight = 20.sp, color = corTexto, modifier = Modifier.weight(1f)
                    )
                }
                i == 0 -> Text(
                    remember(linha, corLink) { anotarLinhaResposta(linha, corLink, negritoNoRotulo = false) },
                    fontSize = 15.sp, lineHeight = 21.sp, fontWeight = FontWeight.SemiBold, color = corTexto
                )
                else -> Text(
                    remember(linha, corLink) { anotarLinhaResposta(linha, corLink, negritoNoRotulo = true) },
                    fontSize = 14.sp, lineHeight = 20.sp, color = corTexto
                )
            }
        }
    }
}

private val RX_CAMPO = Regex("""^([^:•]{2,40}): (.+)$""")
private val RX_URL = Regex("""https?://[^\s)]+""")

/** Rótulo "Campo:" em negrito (até 6 palavras) e URLs como links. */
fun anotarLinhaResposta(linha: String, corLink: Color, negritoNoRotulo: Boolean): AnnotatedString = buildAnnotatedString {
    var corpo = linha
    if (negritoNoRotulo) {
        RX_CAMPO.matchEntire(linha)
            ?.takeIf { m -> !m.groupValues[1].contains("http") && m.groupValues[1].trim().split(' ').size <= 6 }
            ?.let { m ->
                withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(m.groupValues[1] + ": ") }
                corpo = m.groupValues[2]
            }
    }
    var inicio = 0
    for (m in RX_URL.findAll(corpo)) {
        val url = m.value.trimEnd('.', ',', ';', ':')
        append(corpo.substring(inicio, m.range.first))
        withLink(LinkAnnotation.Url(url, TextLinkStyles(SpanStyle(color = corLink, textDecoration = TextDecoration.Underline)))) {
            append(url)
        }
        inicio = m.range.first + url.length
    }
    append(corpo.substring(inicio))
}
