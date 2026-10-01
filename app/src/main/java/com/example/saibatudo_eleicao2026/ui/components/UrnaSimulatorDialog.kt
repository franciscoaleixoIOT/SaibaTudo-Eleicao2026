package com.example.saibatudo_eleicao2026.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import com.example.saibatudo_eleicao2026.domain.model.Candidate

/**
 * Etapas da urna eletrônica (ordem oficial TSE 2026):
 * 1º Deputado Federal (4) → 2º Dep. Estadual/Distrital (5) → 3º Senador 1ª vaga (3) →
 * 4º Senador 2ª vaga (3) → 5º Governador (2) → 6º Presidente (2).
 */
private data class UrnaStage(
    val cargoCodigo: String,
    val titulo: String,
    val digitos: Int,
    val isSegundaVagaSenador: Boolean = false,
    val isPrimeiraVagaSenador: Boolean = false
)

@Composable
fun UrnaSimulatorDialog(
    allCandidates: List<Candidate>,
    initialCandidate: Candidate? = null,
    onDismiss: () -> Unit
) {
    val votingStages = listOf(
        UrnaStage("DEPUTADO_FEDERAL", "Deputado Federal", 4),
        UrnaStage("DEPUTADO_ESTADUAL", "Deputado Estadual / Distrital", 5),
        UrnaStage("SENADOR", "Senador – 1ª Vaga", 3, isPrimeiraVagaSenador = true),
        UrnaStage("SENADOR", "Senador – 2ª Vaga", 3, isSegundaVagaSenador = true),
        UrnaStage("GOVERNADOR", "Governador", 2),
        UrnaStage("PRESIDENTE", "Presidente da República", 2)
    )

    var currentStageIndex by remember {
        mutableStateOf(
            if (initialCandidate != null) {
                val found = votingStages.indexOfFirst { it.cargoCodigo == initialCandidate.cargoCodigo }
                if (found != -1) found else 0
            } else 0
        )
    }

    val currentCargo = votingStages[currentStageIndex]
    var enteredDigits by remember {
        mutableStateOf(
            if (initialCandidate != null && initialCandidate.cargoCodigo == currentCargo.cargoCodigo) initialCandidate.numero else ""
        )
    }
    var isBranco by remember { mutableStateOf(false) }
    var isFim by remember { mutableStateOf(false) }
    var primeiroSenadorNumero by remember { mutableStateOf<String?>(null) }
    var alertaVotoRepetido by remember { mutableStateOf<String?>(null) }

    // Resolve o candidato OFICIAL registrado no TSE pelo número digitado
    val matchedCandidate = remember(enteredDigits, currentCargo) {
        if (enteredDigits.length == currentCargo.digitos) {
            allCandidates.find {
                (it.cargoCodigo == currentCargo.cargoCodigo ||
                    (currentCargo.cargoCodigo == "DEPUTADO_ESTADUAL" && it.cargoCodigo == "DEPUTADO_DISTRITAL")) &&
                    it.numero == enteredDigits
            }
        } else null
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth(0.95f)
                .padding(12.dp),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B))
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
            ) {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "JUSTIÇA ELEITORAL • URNA 2026 • DADOS OFICIAIS TSE",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFFFFB81C)
                    )
                    IconButton(onClick = onDismiss, modifier = Modifier.size(24.dp)) {
                        Icon(Icons.Default.Close, contentDescription = "Fechar", tint = Color.White)
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                // VIRTUAL DISPLAY SCREEN
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(230.dp),
                    shape = RoundedCornerShape(8.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFC)),
                    border = BorderStroke(2.dp, Color(0xFF0F172A))
                ) {
                    if (isFim) {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(
                                    text = "F I M",
                                    fontSize = 44.sp,
                                    fontWeight = FontWeight.Black,
                                    color = Color(0xFF0F172A)
                                )
                                Text(
                                    text = "VOTAÇÃO CONCLUÍDA COM SUCESSO!",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF16A34A)
                                )
                            }
                        }
                    } else {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(12.dp)
                        ) {
                            Text("SEU VOTO PARA", fontSize = 11.sp, color = Color.Gray)
                            Text(
                                text = currentCargo.titulo.uppercase(),
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF0F172A)
                            )

                            Spacer(modifier = Modifier.height(8.dp))

                            // Digits boxes
                            if (isBranco) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 12.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text("VOTO EM BRANCO", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Color.DarkGray)
                                }
                            } else {
                                Row(
                                    modifier = Modifier.padding(vertical = 6.dp),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    for (i in 0 until currentCargo.digitos) {
                                        val digit = enteredDigits.getOrNull(i)?.toString() ?: ""
                                        val isCurrent = i == enteredDigits.length
                                        Box(
                                            modifier = Modifier
                                                .size(34.dp, 42.dp)
                                                .border(
                                                    width = if (isCurrent) 2.dp else 1.dp,
                                                    color = if (isCurrent) Color(0xFF007A3D) else Color.DarkGray
                                                ),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Text(
                                                text = digit,
                                                fontSize = 20.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = Color.Black
                                            )
                                        }
                                    }
                                }

                                // Candidato oficial registrado no TSE
                                if (enteredDigits.length == currentCargo.digitos) {
                                    if (matchedCandidate != null) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            if (matchedCandidate.fotoLocal != null) {
                                                AsyncImage(
                                                    model = "file:///android_asset/${matchedCandidate.fotoLocal}",
                                                    contentDescription = "Foto oficial ${matchedCandidate.nomeUrna}",
                                                    contentScale = ContentScale.Crop,
                                                    modifier = Modifier.size(44.dp).background(Color(0xFFE2E8F0))
                                                )
                                            }
                                            Spacer(modifier = Modifier.width(10.dp))
                                            Column {
                                                Text("Nome: ${matchedCandidate.nomeUrna}", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color.Black)
                                                Text("Partido: ${matchedCandidate.partido}", fontSize = 12.sp, color = Color.DarkGray)
                                                Text("Situação TSE: ${matchedCandidate.situacaoCandidatura}", fontSize = 10.sp, color = Color(0xFF16A34A))
                                            }
                                        }
                                    } else {
                                        Text("NÚMERO ERRADO", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Color.Red)
                                        Text("VOTO NULO", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Color.Red)
                                    }
                                }

                                alertaVotoRepetido?.let {
                                    Text(it, fontSize = 11.sp, color = Color.Red, fontWeight = FontWeight.Bold)
                                }
                            }

                            Spacer(modifier = Modifier.weight(1f))
                            Text(
                                text = "Aperte: CONFIRMA para votar • CORRIGE para recomeçar",
                                fontSize = 9.sp,
                                color = Color.Gray
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // VIRTUAL KEYPAD
                if (!isFim) {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        val numberRows = listOf(
                            listOf("1", "2", "3"),
                            listOf("4", "5", "6"),
                            listOf("7", "8", "9"),
                            listOf("0")
                        )

                        numberRows.forEach { row ->
                            Row(
                                modifier = Modifier.padding(vertical = 3.dp),
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                row.forEach { num ->
                                    Button(
                                        onClick = {
                                            if (enteredDigits.length < currentCargo.digitos && !isBranco) {
                                                enteredDigits += num
                                                alertaVotoRepetido = null
                                            }
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF334155)),
                                        shape = RoundedCornerShape(8.dp),
                                        modifier = Modifier.size(54.dp, 40.dp)
                                    ) {
                                        Text(num, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Color.White)
                                    }
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        // Action buttons: BRANCO, CORRIGE, CONFIRMA
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Button(
                                onClick = {
                                    isBranco = true
                                    enteredDigits = ""
                                    alertaVotoRepetido = null
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color.White),
                                shape = RoundedCornerShape(8.dp),
                                contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp),
                                modifier = Modifier.weight(1f).height(46.dp)
                            ) {
                                Text("BRANCO", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.Black)
                            }

                            Button(
                                onClick = {
                                    isBranco = false
                                    enteredDigits = ""
                                    alertaVotoRepetido = null
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFF97316)),
                                shape = RoundedCornerShape(8.dp),
                                contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp),
                                modifier = Modifier.weight(1f).height(46.dp)
                            ) {
                                Text("CORRIGE", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.White)
                            }

                            Button(
                                onClick = {
                                    val canConfirm = isBranco || enteredDigits.length == currentCargo.digitos

                                    if (canConfirm) {
                                        // Regra oficial TSE 2026: renovação de 2/3 do Senado.
                                        // O segundo voto no MESMO senador é anulado pela urna.
                                        if (currentCargo.isPrimeiraVagaSenador) {
                                            primeiroSenadorNumero = enteredDigits
                                        } else if (currentCargo.isSegundaVagaSenador && enteredDigits == primeiroSenadorNumero && !isBranco) {
                                            alertaVotoRepetido = "AVISO TSE: Segundo voto no mesmo senador é anulado!"
                                        }

                                        if (currentStageIndex < votingStages.size - 1) {
                                            currentStageIndex++
                                            enteredDigits = ""
                                            isBranco = false
                                            alertaVotoRepetido = null
                                        } else {
                                            isFim = true
                                        }
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF16A34A)),
                                shape = RoundedCornerShape(8.dp),
                                contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp),
                                modifier = Modifier.weight(1.2f).height(46.dp)
                            ) {
                                Text("CONFIRMA", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.White)
                            }
                        }
                    }
                } else {
                    Button(
                        onClick = {
                            isFim = false
                            currentStageIndex = 0
                            enteredDigits = ""
                            isBranco = false
                            primeiroSenadorNumero = null
                            alertaVotoRepetido = null
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF007A3D)),
                        modifier = Modifier.fillMaxWidth().padding(top = 10.dp)
                    ) {
                        Text("Simular Novamente")
                    }
                }
            }
        }
    }
}
