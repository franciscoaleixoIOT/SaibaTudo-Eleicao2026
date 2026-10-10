package net.saibatudo.quimica.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import net.saibatudo.quimica.ai.nlu.ResultadoBusca

/** Busca de elementos e compostos por nome (PT, EN, IUPAC), símbolo, fórmula, CAS ou CID. */
@Composable
fun BuscaScreen(
    buscar: suspend (String) -> List<ResultadoBusca>,
    pronto: Boolean,
    onAbrirElemento: (Int) -> Unit,
    onAbrirComposto: (Long) -> Unit,
    modifier: Modifier = Modifier
) {
    var consulta by rememberSaveable { mutableStateOf("") }
    var resultados by remember { mutableStateOf<List<ResultadoBusca>>(emptyList()) }
    LaunchedEffect(consulta, pronto) {
        if (consulta.isBlank() || !pronto) { resultados = emptyList(); return@LaunchedEffect }
        delay(150)
        resultados = buscar(consulta)
    }
    Column(modifier.fillMaxSize()) {
        OutlinedTextField(
            value = consulta, onValueChange = { consulta = it.take(80) }, singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            label = { Text("Nome, símbolo, fórmula, CAS ou CID") }, placeholder = { Text("Ex.: etanol, Fe, H2SO4, 64-17-5") },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            trailingIcon = { if (consulta.isNotEmpty()) IconButton(onClick = { consulta = "" }) { Icon(Icons.Filled.Clear, contentDescription = "Limpar a busca") } }
        )
        when {
            !pronto -> Text("Carregando os dados…", Modifier.padding(16.dp))
            consulta.isBlank() -> Text(
                "Digite para procurar entre os elementos e os compostos do pacote de dados. Funciona sem internet.",
                Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            resultados.isEmpty() -> Text("Nada encontrado para \"$consulta\". Tente o nome em inglês, a fórmula ou o número CAS.", Modifier.padding(horizontal = 16.dp))
            else -> LazyColumn(Modifier.fillMaxSize()) {
                items(resultados, key = { (if (it.ehElemento) "e" else "c") + (it.z ?: it.cid) }) { r ->
                    Column(
                        Modifier.fillMaxWidth().clickable { if (r.ehElemento) onAbrirElemento(r.z!!) else onAbrirComposto(r.cid!!) }
                            .semantics(mergeDescendants = true) { contentDescription = "${if (r.ehElemento) "Elemento" else "Composto"} ${r.titulo}, ${r.detalhe}" }
                            .padding(horizontal = 16.dp, vertical = 10.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(if (r.ehElemento) "Elemento" else "Composto", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                            Text(r.titulo, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                        }
                        Text(r.detalhe, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                }
            }
        }
    }
}
