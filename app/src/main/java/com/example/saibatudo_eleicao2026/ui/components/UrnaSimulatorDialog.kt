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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.example.saibatudo_eleicao2026.domain.model.Candidate
import com.example.saibatudo_eleicao2026.domain.model.TseCargo

@Composable
fun UrnaSimulatorDialog(
    allCandidates: List<Candidate>,
    initialCandidate: Candidate? = null,
    onDismiss: () -> Unit
) {
    val votingStages = listOf(
        TseCargo.DEPUTADO_FEDERAL,
        TseCargo.DEPUTADO_ESTADUAL,
        TseCargo.SENADOR_PRIMEIRA_VAGA,
        TseCargo.SENADOR_SEGUNDA_VAGA,
        TseCargo.GOVERNADOR,
        TseCargo.PRESIDENTE
    )

    var currentStageIndex by remember {
        mutableStateOf(
            if (initialCandidate != null) {
                val found = votingStages.indexOfFirst { it.codigo == initialCandidate.cargo }
                if (found != -1) found else 0
            } else 0
        )
    }

    val currentCargo = votingStages[currentStageIndex]
    var enteredDigits by remember {
        mutableStateOf(
            if (initialCandidate != null && initialCandidate.cargo == currentCargo.codigo) initialCandidate.numero else ""
        )
    }
    var isBranco by remember { mutableStateOf(false) }
    var isFim by remember { mutableStateOf(false) }
    var primeiroSenadorNumero by remember { mutableStateOf<String?>(null) }
    var alertaVotoRepetido by remember { mutableStateOf<String?>(null) }

    // Resolve matching candidate
    val matchedCandidate = remember(enteredDigits, currentCargo) {
        if (enteredDigits.length == currentCargo.digitos) {
            allCandidates.find { it.cargo == currentCargo.codigo && it.numero == enteredDigits }
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
                        text = "JUSTIÇA ELEITORAL • URNA 2026",
                        fontSize = 13.sp,
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
                        .height(210.dp),
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

                                // Candidate feedback
                                if (enteredDigits.length == currentCargo.digitos) {
                                    if (matchedCandidate != null) {
                                        Text("Nome: ${matchedCandidate.nomeUrna}", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color.Black)
                                        Text("Partido: ${matchedCandidate.partido}", fontSize = 12.sp, color = Color.DarkGray)
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
                        // Rows 1-3, 4-6, 7-9, 0
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
                            // BRANCO
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

                            // CORRIGE
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

                            // CONFIRMA
                            Button(
                                onClick = {
                                    val canConfirm = isBranco || enteredDigits.length == currentCargo.digitos

                                    if (canConfirm) {
                                        // Validação especial de Senador 2ª vaga: Não pode repetir o mesmo candidato da 1ª vaga!
                                        if (currentCargo == TseCargo.SENADOR_PRIMEIRA_VAGA) {
                                            primeiroSenadorNumero = enteredDigits
                                        } else if (currentCargo == TseCargo.SENADOR_SEGUNDA_VAGA && enteredDigits == primeiroSenadorNumero && !isBranco) {
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
