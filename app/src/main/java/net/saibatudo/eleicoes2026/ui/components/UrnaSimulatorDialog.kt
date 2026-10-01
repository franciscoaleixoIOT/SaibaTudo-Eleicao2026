package net.saibatudo.eleicoes2026.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import net.saibatudo.eleicoes2026.domain.model.Candidate
import net.saibatudo.eleicoes2026.domain.model.Ufs

/**
 * Etapas na ordem de votação da urna em 2026:
 * 1º Dep. Federal (4) → 2º Dep. Estadual/Distrital (5) → 3º Senador 1ª vaga (3) → 4º Senador 2ª vaga (3) →
 * 5º Governador (2) → 6º Presidente (2).
 */
private data class EtapaUrna(
    val cargoCodigo: String,
    val titulo: String,
    val digitos: Int,
    val primeiraVagaSenador: Boolean = false,
    val segundaVagaSenador: Boolean = false
)

private val ETAPAS = listOf(
    EtapaUrna("DEPUTADO_FEDERAL", "Deputado Federal", 4),
    EtapaUrna("DEPUTADO_ESTADUAL", "Deputado Estadual / Distrital", 5),
    EtapaUrna("SENADOR", "Senador – 1ª vaga", 3, primeiraVagaSenador = true),
    EtapaUrna("SENADOR", "Senador – 2ª vaga", 3, segundaVagaSenador = true),
    EtapaUrna("GOVERNADOR", "Governador", 2),
    EtapaUrna("PRESIDENTE", "Presidente da República", 2)
)

/**
 * SIMULADOR EDUCATIVO. Não é a urna eletrônica oficial, não registra votos e não tem vínculo com a Justiça Eleitoral.
 * Os candidatos são os registrados no TSE para a UF escolhida (números iguais existem em UFs diferentes).
 */
@Composable
fun UrnaSimulatorDialog(
    todos: List<Candidate>,
    ufInicial: String?,
    candidatoInicial: Candidate? = null,
    permitirFotoRemota: Boolean = true,
    onDismiss: () -> Unit
) {
    var uf by remember { mutableStateOf(candidatoInicial?.estadoUf?.takeIf { it != "BR" } ?: ufInicial) }
    var etapa by remember {
        mutableStateOf(
            candidatoInicial?.let { c ->
                ETAPAS.indexOfFirst { it.cargoCodigo == c.cargoCodigo || (it.cargoCodigo == "DEPUTADO_ESTADUAL" && c.cargoCodigo == "DEPUTADO_DISTRITAL") }
            }?.takeIf { it >= 0 } ?: 0
        )
    }
    val atual = ETAPAS[etapa]
    var digitos by remember { mutableStateOf(if (candidatoInicial != null && candidatoInicial.cargoCodigo == atual.cargoCodigo) candidatoInicial.numero else "") }
    var branco by remember { mutableStateOf(false) }
    var fim by remember { mutableStateOf(false) }
    var primeiroSenador by remember { mutableStateOf<String?>(null) }

    // candidato oficial pelo número digitado, na UF escolhida (Presidente é nacional)
    val encontrado = remember(digitos, etapa, uf) {
        if (digitos.length == atual.digitos) {
            todos.firstOrNull {
                it.naUrna && it.numero == digitos &&
                    (it.cargoCodigo == atual.cargoCodigo || (atual.cargoCodigo == "DEPUTADO_ESTADUAL" && it.cargoCodigo == "DEPUTADO_DISTRITAL")) &&
                    (atual.cargoCodigo == "PRESIDENTE" || it.estadoUf == uf)
            }
        } else null
    }
    val repetido = atual.segundaVagaSenador && digitos.length == atual.digitos && digitos == primeiroSenador && !branco

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Card(
            modifier = Modifier.fillMaxWidth(0.95f).padding(12.dp),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B))
        ) {
            Column(modifier = Modifier.fillMaxWidth().padding(16.dp).verticalScroll(rememberScrollState())) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("SIMULADOR EDUCATIVO", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color(0xFFFFB81C))
                        Text("Não é a urna oficial • não registra votos", fontSize = 11.sp, color = Color(0xFFCBD5E1))
                    }
                    IconButton(onClick = onDismiss) { Icon(Icons.Default.Close, contentDescription = "Fechar simulador", tint = Color.White) }
                }

                Spacer(Modifier.height(8.dp))
                Text("Estado da simulação:", fontSize = 11.sp, color = Color(0xFFCBD5E1))
                Row(modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Ufs.SIGLAS.forEach { sigla ->
                        FilterChip(
                            selected = uf == sigla,
                            onClick = { uf = sigla; digitos = ""; branco = false },
                            label = { Text(sigla, fontSize = 11.sp) },
                            colors = FilterChipDefaults.filterChipColors(
                                containerColor = Color(0xFF334155), labelColor = Color.White,
                                selectedContainerColor = Color(0xFF15803D), selectedLabelColor = Color.White
                            )
                        )
                    }
                }

                Spacer(Modifier.height(10.dp))
                Card(
                    modifier = Modifier.fillMaxWidth().height(250.dp),
                    shape = RoundedCornerShape(8.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFC)),
                    border = BorderStroke(2.dp, Color(0xFF0F172A))
                ) {
                    if (fim) {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("F I M", fontSize = 44.sp, fontWeight = FontWeight.Black, color = Color(0xFF0F172A))
                                Text("Simulação concluída. Nenhum voto foi registrado.", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFF166534))
                            }
                        }
                    } else if (uf == null && atual.cargoCodigo != "PRESIDENTE") {
                        Box(modifier = Modifier.fillMaxSize().padding(12.dp), contentAlignment = Alignment.Center) {
                            Text("Escolha o estado acima para simular a votação.", fontSize = 14.sp, color = Color(0xFF0F172A))
                        }
                    } else {
                        Column(modifier = Modifier.fillMaxSize().padding(12.dp)) {
                            Text("SEU VOTO PARA", fontSize = 11.sp, color = Color(0xFF475569))
                            Text(atual.titulo.uppercase(), fontSize = 15.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0F172A))
                            Spacer(Modifier.height(8.dp))
                            if (branco) {
                                Box(Modifier.fillMaxWidth().padding(vertical = 12.dp), contentAlignment = Alignment.Center) {
                                    Text("VOTO EM BRANCO", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Color(0xFF334155))
                                }
                            } else {
                                Row(modifier = Modifier.padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    for (i in 0 until atual.digitos) {
                                        val d = digitos.getOrNull(i)?.toString() ?: ""
                                        val corrente = i == digitos.length
                                        Box(
                                            modifier = Modifier.size(34.dp, 42.dp).border(
                                                width = if (corrente) 2.dp else 1.dp,
                                                color = if (corrente) Color(0xFF007A3D) else Color(0xFF334155)
                                            ),
                                            contentAlignment = Alignment.Center
                                        ) { Text(d, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color.Black) }
                                    }
                                }
                                if (digitos.length == atual.digitos) {
                                    if (encontrado != null) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            FotoCandidato(encontrado, 48.dp, permitirFotoRemota)
                                            Spacer(Modifier.width(10.dp))
                                            Column {
                                                Text("Nome: ${encontrado.nomeUrna}", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color.Black)
                                                Text("Partido: ${encontrado.partido}", fontSize = 12.sp, color = Color(0xFF334155))
                                                Text("Situação no TSE: ${encontrado.elegibilidade.rotulo}", fontSize = 10.sp, color = Color(0xFF166534))
                                            }
                                        }
                                    } else {
                                        Text("NÚMERO ERRADO", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Color(0xFFB91C1C))
                                        Text("VOTO NULO", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFFB91C1C))
                                    }
                                }
                                if (repetido) {
                                    Text("ATENÇÃO: mesmo número da 1ª vaga — o 2º voto no mesmo candidato é ANULADO.",
                                        fontSize = 11.sp, color = Color(0xFFB91C1C), fontWeight = FontWeight.Bold)
                                }
                            }
                            Spacer(Modifier.weight(1f))
                            Text("CONFIRMA para votar • CORRIGE para recomeçar o cargo", fontSize = 10.sp, color = Color(0xFF475569))
                        }
                    }
                }

                Spacer(Modifier.height(12.dp))
                if (!fim) {
                    Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                        listOf(listOf("1", "2", "3"), listOf("4", "5", "6"), listOf("7", "8", "9"), listOf("0")).forEach { linha ->
                            Row(Modifier.padding(vertical = 3.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                linha.forEach { n ->
                                    Button(
                                        onClick = { if (digitos.length < atual.digitos && !branco) digitos += n },
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF334155)),
                                        shape = RoundedCornerShape(8.dp),
                                        modifier = Modifier.size(58.dp, 44.dp).semantics { contentDescription = "Tecla $n" }
                                    ) { Text(n, fontSize = 17.sp, fontWeight = FontWeight.Bold, color = Color.White) }
                                }
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                        Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(
                                onClick = { branco = true; digitos = "" },
                                colors = ButtonDefaults.buttonColors(containerColor = Color.White),
                                shape = RoundedCornerShape(8.dp), contentPadding = PaddingValues(horizontal = 4.dp),
                                modifier = Modifier.weight(1f).height(48.dp)
                            ) { Text("BRANCO", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.Black) }
                            Button(
                                onClick = { branco = false; digitos = "" },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFC2410C)),
                                shape = RoundedCornerShape(8.dp), contentPadding = PaddingValues(horizontal = 4.dp),
                                modifier = Modifier.weight(1f).height(48.dp)
                            ) { Text("CORRIGE", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.White) }
                            Button(
                                onClick = {
                                    val pode = branco || digitos.length == atual.digitos
                                    if (pode) {
                                        if (atual.primeiraVagaSenador) primeiroSenador = if (branco) null else digitos
                                        if (etapa < ETAPAS.size - 1) {
                                            etapa++
                                            digitos = ""
                                            branco = false
                                        } else fim = true
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF15803D)),
                                shape = RoundedCornerShape(8.dp), contentPadding = PaddingValues(horizontal = 4.dp),
                                modifier = Modifier.weight(1.2f).height(48.dp)
                            ) { Text("CONFIRMA", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.White) }
                        }
                    }
                } else {
                    Button(
                        onClick = { fim = false; etapa = 0; digitos = ""; branco = false; primeiroSenador = null },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF007A3D)),
                        modifier = Modifier.fillMaxWidth().padding(top = 10.dp)
                    ) { Text("Simular novamente") }
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    "Os candidatos exibidos são os registrados no TSE (dados abertos). Este simulador é apenas para treino e " +
                        "não representa a urna eletrônica nem a Justiça Eleitoral.",
                    fontSize = 10.sp, color = Color(0xFF94A3B8)
                )
            }
        }
    }
}
