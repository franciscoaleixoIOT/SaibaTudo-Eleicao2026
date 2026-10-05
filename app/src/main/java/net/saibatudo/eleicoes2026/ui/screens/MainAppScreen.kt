package net.saibatudo.eleicoes2026.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.HowToVote
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import net.saibatudo.eleicoes2026.core.constants.AppConstants
import net.saibatudo.eleicoes2026.ai.model.OrigemResposta
import net.saibatudo.eleicoes2026.domain.model.Datas
import net.saibatudo.eleicoes2026.domain.model.FaseEleitoral
import net.saibatudo.eleicoes2026.ui.components.CandidateDetailDialog
import net.saibatudo.eleicoes2026.ui.components.CandidateItemCard
import net.saibatudo.eleicoes2026.ui.components.DynamicMenuGrid
import net.saibatudo.eleicoes2026.ui.components.EscolherUfDialog
import net.saibatudo.eleicoes2026.ui.components.FilterChipsRow
import net.saibatudo.eleicoes2026.ui.components.FontesOficiaisDialog
import net.saibatudo.eleicoes2026.ui.components.PesquisasOficiaisDialog
import net.saibatudo.eleicoes2026.ui.components.RelatarRespostaDialog
import net.saibatudo.eleicoes2026.ui.components.ResultadosDialog
import net.saibatudo.eleicoes2026.ui.components.SearchBarAi
import net.saibatudo.eleicoes2026.ui.components.TextoResposta
import net.saibatudo.eleicoes2026.ui.components.UrnaSimulatorDialog
import net.saibatudo.eleicoes2026.ui.theme.GoldSecondary
import net.saibatudo.eleicoes2026.ui.theme.NavyAccent
import net.saibatudo.eleicoes2026.ui.viewmodel.Dialogo
import net.saibatudo.eleicoes2026.ui.viewmodel.MainViewModel
import net.saibatudo.eleicoes2026.ui.viewmodel.Tela
import androidx.compose.runtime.collectAsState

private const val PAGINA = 60

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainAppScreen(vm: MainViewModel) {
    val s by vm.estado.collectAsState()

    BackHandler(enabled = s.dialogo != null || s.tela != Tela.PRINCIPAL) { vm.voltar() }

    when (s.tela) {
        Tela.CONFIGURACOES -> {
            SettingsScreen(
                prefs = s.prefs,
                onAtualizar = vm::atualizarPreferencias,
                onEscolherUf = { vm.abrirDialogo(Dialogo.EscolherUf) },
                onSobreDados = { vm.abrirTela(Tela.SOBRE_DADOS) },
                onVoltar = { vm.abrirTela(Tela.PRINCIPAL) }
            )
            DialogosGlobais(vm)
            return
        }
        Tela.SOBRE_DADOS -> {
            AboutDataScreen(
                dados = s.dados, fase = s.fase, atualizacao = s.atualizacao, ultimaVerificacao = s.prefs.ultimaVerificacaoDados,
                onAtualizar = vm::atualizarDadosAgora, onVoltar = { vm.abrirTela(Tela.CONFIGURACOES) }
            )
            return
        }
        Tela.PRINCIPAL -> Unit
    }

    var limite by remember(s.filtro) { mutableIntStateOf(PAGINA) }
    val permitirFotoRemota = !s.prefs.economiaDeDados

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.HowToVote, contentDescription = null, tint = GoldSecondary, modifier = Modifier.size(28.dp))
                        Spacer(Modifier.width(8.dp))
                        Column {
                            Text("SaibaTudo", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Color.White)
                            Text("Eleições 2026", fontSize = 12.sp, color = GoldSecondary)
                        }
                    }
                },
                actions = {
                    IconButton(onClick = { vm.abrirDialogo(Dialogo.Fontes) }) {
                        Icon(Icons.Default.Verified, contentDescription = "Fontes oficiais", tint = GoldSecondary, modifier = Modifier.size(22.dp))
                    }
                    FilledTonalButton(
                        onClick = { vm.abrirDialogo(Dialogo.Urna(null)) },
                        colors = ButtonDefaults.filledTonalButtonColors(containerColor = MaterialTheme.colorScheme.secondary, contentColor = Color(0xFF0F172A)),
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp)
                    ) {
                        Icon(Icons.Default.HowToVote, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Simulador", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                    IconButton(onClick = { vm.abrirTela(Tela.CONFIGURACOES) }) {
                        Icon(Icons.Default.Settings, contentDescription = "Configurações", tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = NavyAccent)
            )
        }
    ) { inner ->
        LazyColumn(modifier = Modifier.fillMaxSize().padding(inner).background(MaterialTheme.colorScheme.background)) {
            when {
                s.carregando && s.dados == null -> item {
                    Column(modifier = Modifier.fillMaxWidth().padding(40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.height(14.dp))
                        Text("Carregando dados oficiais do TSE…", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                s.erro != null && s.dados == null -> item {
                    Column(modifier = Modifier.fillMaxWidth().padding(24.dp)) {
                        Text("Não foi possível carregar os dados oficiais.", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.error)
                        Text(s.erro.orEmpty(), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Button(onClick = vm::atualizarDadosAgora, modifier = Modifier.padding(top = 12.dp)) { Text("Tentar novamente") }
                    }
                }
                else -> {
                    val dados = s.dados!!
                    item { FaixaDeFase(s.fase, dados.regras.turno1, dados.regras.turno2) }

                    item {
                        SearchBarAi(
                            query = vm.consulta,
                            onQueryChange = vm::alterarConsulta,
                            onSearchSubmit = vm::perguntar,
                            suggestedQuestions = s.sugestoes,
                            onSuggestionClick = vm::perguntar,
                            isAiLoading = s.iaProcessando,
                            placeholder = s.prefs.perguntaInicial.ifBlank { AppConstants.PERGUNTA_INICIAL_PADRAO },
                            ultimaPergunta = vm.historico.ultima,
                            podeSubir = vm.historico.podeSubir,
                            podeDescer = vm.historico.podeDescer,
                            onPerguntaAnterior = vm::perguntaAnterior,
                            onPerguntaSeguinte = vm::perguntaSeguinte
                        )
                    }

                    item {
                        val r = s.resposta
                        AnimatedVisibility(visible = r != null) {
                            if (r != null) {
                                CartaoResposta(
                                    texto = r.directAnswer.orEmpty(), fonte = r.fonte, origem = r.origem,
                                    candidatos = r.candidateIds.mapNotNull { dados.porId[it] }.take(6),
                                    sugestoes = r.suggestedQuestions,
                                    onFechar = vm::fecharResposta,
                                    onRelatar = { vm.abrirDialogo(Dialogo.RelatarResposta) },
                                    onCandidato = { vm.abrirDialogo(Dialogo.Candidato(it)) },
                                    onSimular = { vm.abrirDialogo(Dialogo.Urna(r.candidateIds.firstNotNullOfOrNull { id -> dados.porId[id] })) },
                                    mostrarApuracao = r.abrirResultados,
                                    onApuracao = { vm.abrirResultados(r.filters.cargo, r.filters.estadoUf) },
                                    onSugestao = vm::perguntar,
                                    // sempre oferece a IA na nuvem quando a resposta veio da IA local, permitindo maior precisão
                                    oferecerNuvem = r.origem != OrigemResposta.NUVEM && r.origem != OrigemResposta.GENERATIVA,
                                    resolvida = r.resolvida,
                                    consultandoNuvem = s.nuvemConsultando,
                                    nuvemFalhou = s.nuvemFalhou,
                                    onPerguntarNuvem = vm::perguntarNaNuvem
                                )
                            }
                        }
                    }

                    item {
                        FilterChipsRow(
                            filtro = s.filtro,
                            onFiltroChange = vm::atualizarFiltro,
                            ufPadrao = s.prefs.ufPadrao,
                            fase = s.fase,
                            partidos = dados.regras.estatisticas.porPartido.keys.sorted(),
                            temas = dados.regras.temas,
                            onAlternarMeuEstado = vm::alternarMeuEstado,
                            onEscolherUf = { vm.abrirDialogo(Dialogo.EscolherUf) },
                            onLimpar = vm::limparFiltros
                        )
                    }

                    item {
                        Spacer(Modifier.height(12.dp))
                        DynamicMenuGrid(menuItems = s.menu, activeMenuId = s.menuAtivo, onMenuClick = vm::selecionarMenu)
                    }

                    item {
                        Spacer(Modifier.height(16.dp))
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
                            Text("Candidaturas (TSE)", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
                            Spacer(Modifier.weight(1f))
                            Text("${s.candidatos.size} encontradas", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Text(
                            "Ordem fixa: cargo, estado e número. Fonte: TSE (dados abertos), extração ${dados.regras.extracaoTse.ifBlank { "—" }}",
                            fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 16.dp)
                        )
                    }

                    if (s.candidatos.isEmpty()) {
                        item {
                            Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                                Text("Nenhuma candidatura encontrada com os filtros selecionados.", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
                            }
                        }
                    } else {
                        items(s.candidatos.take(limite), key = { it.id }) { c ->
                            CandidateItemCard(candidate = c, onCandidateClick = { vm.abrirDialogo(Dialogo.Candidato(it)) }, permitirFotoRemota = permitirFotoRemota)
                        }
                        if (s.candidatos.size > limite) {
                            item {
                                Column(modifier = Modifier.fillMaxWidth().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text("Exibindo $limite de ${s.candidatos.size}.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    OutlinedButton(onClick = { limite += PAGINA }) { Text("Mostrar mais") }
                                }
                            }
                        }
                    }

                    item {
                        Spacer(Modifier.height(12.dp))
                        Row(modifier = Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.Top) {
                            Icon(Icons.Default.Info, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(14.dp).padding(top = 2.dp))
                            Spacer(Modifier.width(6.dp))
                            Text(AppConstants.AVISO_NEUTRALIDADE, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Spacer(Modifier.height(24.dp))
                    }
                }
            }
        }
    }

    DialogosGlobais(vm)
}

/** Diálogos compartilhados entre telas (candidato, urna, pesquisas, fontes, UF, relato). */
@Composable
private fun DialogosGlobais(vm: MainViewModel) {
    val s by vm.estado.collectAsState()
    val dados = s.dados
    when (val d = s.dialogo) {
        is Dialogo.Candidato -> {
            val c = d.candidato
            val chapaVices = if (dados != null) {
                when (c.cargoCodigo) {
                    "PRESIDENTE" -> dados.candidatos.filter { it.cargoCodigo == "VICE_PRESIDENTE" && it.numero == c.numero }
                    "GOVERNADOR" -> dados.candidatos.filter { it.cargoCodigo == "VICE_GOVERNADOR" && it.estadoUf == c.estadoUf && it.numero == c.numero }
                    "SENADOR" -> dados.candidatos.filter { (it.cargoCodigo == "PRIMEIRO_SUPLENTE" || it.cargoCodigo == "SEGUNDO_SUPLENTE") && it.estadoUf == c.estadoUf && it.numero == c.numero }.sortedBy { it.cargoCodigo }
                    else -> emptyList()
                }
            } else emptyList()

            val chapaTitular = if (dados != null) {
                when (c.cargoCodigo) {
                    "VICE_PRESIDENTE" -> dados.candidatos.firstOrNull { it.cargoCodigo == "PRESIDENTE" && it.numero == c.numero }
                    "VICE_GOVERNADOR" -> dados.candidatos.firstOrNull { it.cargoCodigo == "GOVERNADOR" && it.estadoUf == c.estadoUf && it.numero == c.numero }
                    "PRIMEIRO_SUPLENTE", "SEGUNDO_SUPLENTE" -> dados.candidatos.firstOrNull { it.cargoCodigo == "SENADOR" && it.estadoUf == c.estadoUf && it.numero == c.numero }
                    else -> null
                }
            } else null

            CandidateDetailDialog(
                candidate = c,
                regras = dados?.regras,
                permitirFotoRemota = !s.prefs.economiaDeDados,
                chapaVices = chapaVices,
                chapaTitular = chapaTitular,
                onVerCandidatoChapa = { vm.abrirDialogo(Dialogo.Candidato(it)) },
                onDismiss = vm::fecharDialogo,
                onSimularVoto = { vm.abrirDialogo(Dialogo.Urna(it)) }
            )
        }
        is Dialogo.Urna -> if (dados != null) UrnaSimulatorDialog(
            todos = dados.candidatos, ufInicial = s.prefs.ufPadrao ?: s.filtro.estadoUf, candidatoInicial = d.inicial,
            permitirFotoRemota = !s.prefs.economiaDeDados, onDismiss = vm::fecharDialogo
        )
        Dialogo.Pesquisas -> if (dados != null) PesquisasOficiaisDialog(pesquisas = dados.pesquisas, onDismiss = vm::fecharDialogo)
        Dialogo.Fontes -> FontesOficiaisDialog(estadoUf = s.filtro.estadoUf ?: s.prefs.ufPadrao, fontes = dados?.fontes, onDismiss = vm::fecharDialogo)
        Dialogo.EscolherUf -> EscolherUfDialog(
            atual = s.prefs.ufPadrao,
            onEscolher = vm::escolherUfPadrao,
            onDismiss = vm::fecharDialogo
        )
        Dialogo.RelatarResposta -> RelatarRespostaDialog(enviado = s.relatoEnviado, onEnviar = vm::relatarResposta, onDismiss = vm::fecharDialogo)
        Dialogo.Resultados -> ResultadosDialog(
            estado = s.resultados, fase = s.fase, ufPadrao = s.prefs.ufPadrao,
            onSelecionar = { cargo, uf, turno -> vm.selecionarResultados(cargo, uf, turno) },
            onDismiss = vm::fecharDialogo
        )
        null -> Unit
    }
}

@Composable
private fun FaixaDeFase(fase: FaseEleitoral, turno1: String, turno2: String) {
    val (texto, destaque) = when (fase) {
        FaseEleitoral.PRE_ELEICAO -> "1º turno em ${Datas.formatarBr(turno1)} • 2º turno em ${Datas.formatarBr(turno2)}" to false
        FaseEleitoral.DIA_1T -> "Hoje é dia de votação (1º turno): 8h às 17h, horário de Brasília. Apuração em tempo real: pergunte \"Resultado para Presidente\"." to true
        FaseEleitoral.ENTRE_TURNOS -> "2º turno em ${Datas.formatarBr(turno2)}. Resultados do 1º turno disponíveis no menu." to true
        FaseEleitoral.DIA_2T -> "Hoje é dia de votação (2º turno): 8h às 17h, horário de Brasília." to true
        FaseEleitoral.POS_ELEICAO -> "Eleições encerradas. Consulte os resultados e eleitos no menu." to true
    }
    Row(
        modifier = Modifier.fillMaxWidth().background(if (destaque) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Default.Flag, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(8.dp))
        Text(texto, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurface)
    }
}

@Composable
private fun CartaoResposta(
    texto: String,
    fonte: String?,
    origem: OrigemResposta,
    candidatos: List<net.saibatudo.eleicoes2026.domain.model.Candidate>,
    sugestoes: List<String>,
    onFechar: () -> Unit,
    onRelatar: () -> Unit,
    onCandidato: (net.saibatudo.eleicoes2026.domain.model.Candidate) -> Unit,
    onSimular: () -> Unit,
    mostrarApuracao: Boolean,
    onApuracao: () -> Unit,
    onSugestao: (String) -> Unit,
    oferecerNuvem: Boolean = false,
    resolvida: Boolean = true,
    consultandoNuvem: Boolean = false,
    nuvemFalhou: Boolean = false,
    onPerguntarNuvem: () -> Unit = {}
) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary)
    ) {
        Column(modifier = Modifier.padding(14.dp).semantics { liveRegion = LiveRegionMode.Polite }) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                Icon(Icons.Default.AutoAwesome, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "Resposta da IA • ${origem.rotulo}", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary
                    )
                    Spacer(Modifier.height(6.dp))
                    TextoResposta(texto)
                    if (!fonte.isNullOrBlank()) {
                        Spacer(Modifier.height(8.dp))
                        Text(fonte, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, lineHeight = 14.sp)
                    }
                }
                IconButton(onClick = onFechar, modifier = Modifier.size(36.dp)) {
                    Icon(Icons.Default.Close, contentDescription = "Fechar resposta", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
                }
            }

            if (oferecerNuvem || consultandoNuvem || nuvemFalhou) {
                Spacer(Modifier.height(8.dp))
                when {
                    consultandoNuvem -> Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(8.dp))
                        Text("Consultando modelo de IA na nuvem (Qwen2.5)…", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    oferecerNuvem -> Column {
                        OutlinedButton(onClick = onPerguntarNuvem, shape = RoundedCornerShape(10.dp)) {
                            Icon(Icons.Default.Cloud, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text(
                                if (resolvida) "Consultar resposta mais precisa na nuvem" else "Perguntar à IA na nuvem",
                                fontSize = 13.sp, fontWeight = FontWeight.SemiBold
                            )
                        }
                        Text(
                            if (resolvida) "Consulta o modelo na nuvem (Qwen2.5) para uma interpretação mais precisa ancorada nos dados oficiais do TSE."
                            else "Envia só o texto desta pergunta ao nosso servidor para interpretar; a resposta continua vindo dos dados oficiais. Pode levar até 20 s.",
                            fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, lineHeight = 14.sp
                        )
                    }
                }
                if (nuvemFalhou && !consultandoNuvem) {
                    Text(
                        "A IA na nuvem não conseguiu interpretar agora (indisponível ou demorou demais). Tente reformular citando cargo, estado, partido, nome ou número do candidato.",
                        fontSize = 12.sp, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 4.dp)
                    )
                }
            }

            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp), color = MaterialTheme.colorScheme.primary.copy(alpha = 0.2f))

            if (candidatos.isNotEmpty()) {
                Text("Candidaturas citadas:", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                Row(modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    candidatos.forEach { c ->
                        FilledTonalButton(
                            onClick = { onCandidato(c) }, shape = RoundedCornerShape(8.dp),
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp),
                            colors = ButtonDefaults.filledTonalButtonColors(containerColor = MaterialTheme.colorScheme.surface, contentColor = MaterialTheme.colorScheme.onSurface)
                        ) {
                            Icon(Icons.Default.Person, contentDescription = null, modifier = Modifier.size(13.dp), tint = MaterialTheme.colorScheme.primary)
                            Spacer(Modifier.width(4.dp))
                            Text("${c.nomeUrna} (${c.numero})", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }

            Row(modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (mostrarApuracao) {
                    Button(
                        onClick = onApuracao, shape = RoundedCornerShape(8.dp), contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp)
                    ) { Text("Ver apuração ao vivo", fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                }
                Button(
                    onClick = onSimular, shape = RoundedCornerShape(8.dp), contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary, contentColor = Color(0xFF0F172A))
                ) {
                    Icon(Icons.Default.HowToVote, contentDescription = null, modifier = Modifier.size(13.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Simulador educativo", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
                sugestoes.forEach { sug ->
                    OutlinedButton(
                        onClick = { onSugestao(sug) }, shape = RoundedCornerShape(8.dp), contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.5f))
                    ) { Text(sug, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurface) }
                }
            }
            TextButton(onClick = onRelatar, contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp)) {
                Icon(Icons.Default.Flag, contentDescription = null, modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.width(4.dp))
                Text("Relatar problema nesta resposta", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
