package net.saibatudo.eleicoes2026.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import net.saibatudo.eleicoes2026.R
import net.saibatudo.eleicoes2026.core.constants.AppConstants
import net.saibatudo.eleicoes2026.domain.model.Ufs

/** Primeira execução: neutralidade, escolha de estado (opcional) e consentimento de IA na nuvem (opt-in). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun OnboardingScreen(onConcluir: (uf: String?, iaNuvem: Boolean) -> Unit) {
    var uf by remember { mutableStateOf<String?>(null) }
    var iaNuvem by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding()
            .navigationBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 16.dp)
    ) {
        Box(
            modifier = Modifier.size(84.dp).clip(RoundedCornerShape(20.dp)).background(Color(0xFF0C2340)),
            contentAlignment = Alignment.Center
        ) {
            Image(painterResource(R.drawable.ic_launcher_foreground), contentDescription = "Logotipo SaibaTudo", modifier = Modifier.size(84.dp))
        }
        Spacer(Modifier.height(16.dp))
        Text("Bem-vindo ao SaibaTudo Eleições 2026", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
        Spacer(Modifier.height(6.dp))
        Text(
            "Consulte candidaturas, pesquisas registradas, regras e resultados com dados abertos do TSE.",
            fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.height(16.dp))

        Ponto("Dados oficiais: tudo vem dos arquivos abertos do TSE, com fonte e data em cada resposta.")
        Ponto("Independente e apartidário: sem vínculo com o TSE, governo ou partidos.")
        Ponto("Não recomendamos candidatos: a decisão do voto é sua.")
        Ponto("Funciona offline e se atualiza sozinho com dados verificados por assinatura digital.")

        Spacer(Modifier.height(18.dp))
        Text("Qual é o seu estado? (opcional)", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
        Text(
            "Usamos só para começar a lista filtrada. Não usamos GPS: a escolha fica neste aparelho e você muda quando quiser.",
            fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.height(8.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Ufs.NOMES.keys.forEach { sigla ->
                FilterChip(selected = uf == sigla, onClick = { uf = if (uf == sigla) null else sigla }, label = { Text(sigla) })
            }
        }

        Spacer(Modifier.height(18.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Ajuda da IA na nuvem", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
                Text(
                    "Desligado por padrão. Se ligar, só o TEXTO de perguntas que o app não entendeu é enviado ao nosso servidor " +
                        "para interpretar a intenção, junto com um código aleatório da instalação (não identifica você). " +
                        "As respostas continuam vindo dos dados oficiais. Você pode mudar em Configurações.",
                    fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Spacer(Modifier.width(12.dp))
            Switch(checked = iaNuvem, onCheckedChange = { iaNuvem = it }, modifier = Modifier.semantics { contentDescription = "Usar IA na nuvem" })
        }

        Spacer(Modifier.height(18.dp))
        Text(AppConstants.AVISO_NEUTRALIDADE, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(14.dp))
        Button(onClick = { onConcluir(uf, iaNuvem) }, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(14.dp)) {
            Text("Começar", fontSize = 16.sp, fontWeight = FontWeight.Bold)
        }
        TextButton(onClick = { onConcluir(null, false) }, modifier = Modifier.align(Alignment.CenterHorizontally)) {
            Text("Pular e usar as configurações padrão")
        }
    }
}

@Composable
private fun Ponto(texto: String) {
    Row(modifier = Modifier.padding(vertical = 3.dp), verticalAlignment = Alignment.Top) {
        Icon(Icons.Default.CheckCircle, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp).padding(top = 2.dp))
        Spacer(Modifier.width(8.dp))
        Text(texto, fontSize = 14.sp, color = MaterialTheme.colorScheme.onBackground)
    }
}
