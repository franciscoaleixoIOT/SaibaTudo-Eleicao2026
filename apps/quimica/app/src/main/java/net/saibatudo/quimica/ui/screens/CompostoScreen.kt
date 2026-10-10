package net.saibatudo.quimica.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import net.saibatudo.quimica.data.model.Composto
import net.saibatudo.quimica.data.prefs.Nivel
import net.saibatudo.quimica.data.repository.Pacote
import net.saibatudo.quimica.domain.GhsTextos
import net.saibatudo.quimica.domain.Propriedades
import net.saibatudo.quimica.domain.calc.Unidades
import net.saibatudo.quimica.ui.components.AvisoBox
import net.saibatudo.quimica.ui.components.Cartao
import net.saibatudo.quimica.ui.components.FontesView
import net.saibatudo.quimica.ui.components.FormulaTexto
import net.saibatudo.quimica.ui.components.GhsView
import net.saibatudo.quimica.ui.components.LinhaCampo
import net.saibatudo.quimica.ui.components.MoleculaView
import net.saibatudo.quimica.ui.components.TituloSecao

/** Ficha do composto: fórmula, estrutura 2D, propriedades, GHS harmonizado (do dado), ficha ICSC (link) e fontes. */
@Composable
fun CompostoScreen(
    cid: Long,
    pacote: Pacote?,
    nivel: Nivel,
    carregar: suspend (Long) -> Composto?,
    onAbrirUrl: (String) -> Unit,
    onAbrirSeguranca: () -> Unit,
    modifier: Modifier = Modifier
) {
    val composto by produceState<Composto?>(null, cid) { value = runCatching { carregar(cid) }.getOrNull() }
    if (pacote == null) {
        Text("Carregando os dados…", modifier.padding(16.dp))
        return
    }
    val c = composto
    if (c == null) {
        Column(modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (pacote.indice.entrada(cid) == null) Text("Este composto não está no pacote de dados.", style = MaterialTheme.typography.bodyLarge)
            else CircularProgressIndicator()
        }
        return
    }
    val un = Unidades.de(pacote.regras)
    val tabela = Propriedades.tabela(pacote.regras)
    val linhas = Propriedades.fichaComposto(c, tabela, un, nivel)
    val textosH = pacote.regras.frasesH + (c.ghs?.textosH.orEmpty())

    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(c.nomeExibicao, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            c.nomePopular?.takeIf { !it.equals(c.nome, true) }?.let { Text("Também conhecido como $it", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            c.formula?.let { FormulaTexto(it, estilo = MaterialTheme.typography.headlineMedium) }
        }
        if (c.nomePtPendente) AvisoBox("O nome em português deste composto ainda não foi revisado; mostro o nome IUPAC.")

        c.smiles?.let { smiles ->
            Cartao {
                TituloSecao("Estrutura 2D")
                MoleculaView(smiles, "${c.nomeExibicao}${c.formula?.let { ", fórmula $it" } ?: ""}")
                Text("Desenhada no aparelho a partir do SMILES do pacote (SmilesDrawer, licença MIT).", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        Cartao {
            TituloSecao("Propriedades")
            if (linhas.isEmpty()) Text("O pacote de dados ainda não traz propriedades deste composto.", style = MaterialTheme.typography.bodyMedium)
            linhas.forEach { LinhaCampo(it.rotulo, it.valor) }
            c.massaExata?.takeIf { nivel == Nivel.SUPERIOR && linhas.none { l -> l.rotulo.contains("exata", true) } }?.let { LinhaCampo("Massa exata", "${net.saibatudo.quimica.domain.Texto.numero(it, 5)} u") }
            if (c.classes.isNotEmpty()) LinhaCampo("Classes", c.classes.joinToString(", ") { GhsTextos.classePt(it) })
        }

        Cartao {
            TituloSecao("Segurança (GHS)")
            val g = c.ghs
            if (g != null && (g.pictogramas.isNotEmpty() || g.frasesH.isNotEmpty() || g.palavraSinal != null)) {
                GhsView(g, textosH)
            } else {
                Text(
                    "O pacote de dados não traz classificação GHS harmonizada para este composto. Isso não significa que ele seja seguro.",
                    style = MaterialTheme.typography.bodyMedium
                )
            }
            c.icscBuscaUrl?.let { url ->
                Button(onClick = { onAbrirUrl(url) }, modifier = Modifier.fillMaxWidth()) { Text("Ficha ICSC no site da OIT") }
                Text("Abre o site da OIT no navegador; o app não copia as fichas.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            AssistChip(onClick = onAbrirSeguranca, label = { Text("Entender o GHS e os pictogramas") })
        }

        c.definicaoChebi?.let { d ->
            Cartao {
                TituloSecao("Definição (ChEBI)")
                Text(d.texto, style = MaterialTheme.typography.bodyMedium)
                Text(
                    "ChEBI${d.id?.let { " ($it)" } ?: ""}, EMBL-EBI, licença ${d.licenca}. Texto original em inglês.",
                    style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                d.url?.let { u -> androidx.compose.material3.TextButton(onClick = { onAbrirUrl(u) }) { Text("Ver no ChEBI") } }
            }
        }

        Cartao {
            TituloSecao("Identificadores")
            c.cas?.let { LinhaCampo("Número CAS", it) }
            LinhaCampo("CID no PubChem", c.cid.toString())
            c.nomeIupac?.let { LinhaCampo("Nome IUPAC", it) }
            c.inchiKey?.let { LinhaCampo("InChIKey", it) }
            c.smiles?.let { s ->
                SelectionContainer { LinhaCampo("SMILES", s) }
            }
        }

        Cartao { FontesView(c.fontes.ifEmpty { pacote.fontesExibicao.take(2) }, onAbrirUrl) }
    }
}
