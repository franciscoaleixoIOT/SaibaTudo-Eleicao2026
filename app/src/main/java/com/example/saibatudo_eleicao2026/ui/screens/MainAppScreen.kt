package com.example.saibatudo_eleicao2026.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.HowToVote
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.saibatudo_eleicao2026.ai.engine.AiInferenceEngine
import com.example.saibatudo_eleicao2026.ai.engine.LocalMockAiInferenceEngine
import com.example.saibatudo_eleicao2026.data.repository.ElectionsRepositoryImpl
import com.example.saibatudo_eleicao2026.domain.model.Candidate
import com.example.saibatudo_eleicao2026.domain.model.ElectoralFilter
import com.example.saibatudo_eleicao2026.domain.model.MenuItem
import com.example.saibatudo_eleicao2026.domain.repository.ElectionsRepository
import com.example.saibatudo_eleicao2026.ui.components.*
import com.example.saibatudo_eleicao2026.ui.theme.GoldSecondary
import com.example.saibatudo_eleicao2026.ui.theme.GreenLight
import com.example.saibatudo_eleicao2026.ui.theme.GreenPrimary
import com.example.saibatudo_eleicao2026.ui.theme.NavyAccent
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainAppScreen(
    repository: ElectionsRepository = remember { ElectionsRepositoryImpl() },
    aiEngine: AiInferenceEngine = remember { com.example.saibatudo_eleicao2026.ai.engine.HybridAiInferenceEngine() }
) {
    val coroutineScope = rememberCoroutineScope()

    var searchQuery by remember { mutableStateOf("") }
    var isAiLoading by remember { mutableStateOf(false) }
    var aiAnswer by remember { mutableStateOf<String?>(null) }
    var suggestedQuestions by remember {
        mutableStateOf(
            listOf(
                "Quem disputa a Presidência em 2026?",
                "Candidatos a Governador em SP",
                "Como funciona o voto para dois senadores?",
                "Onde consultar meu local de votação?"
            )
        )
    }

    var menuItems by remember { mutableStateOf<List<MenuItem>>(emptyList()) }
    var activeMenuId by remember { mutableStateOf<String?>(null) }
    var currentFilter by remember { mutableStateOf(ElectoralFilter()) }
    var candidates by remember { mutableStateOf<List<Candidate>>(emptyList()) }

    var selectedCandidateForDetail by remember { mutableStateOf<Candidate?>(null) }
    var showUrnaSimulator by remember { mutableStateOf(false) }
    var urnaInitialCandidate by remember { mutableStateOf<Candidate?>(null) }

    // Load initial data
    LaunchedEffect(Unit) {
        menuItems = repository.getMainMenuItems()
        candidates = repository.getCandidates(currentFilter)
    }

    // Function to execute AI parsing & filter updates
    val onExecuteAiQuery: (String) -> Unit = { queryText ->
        coroutineScope.launch {
            isAiLoading = true
            val response = aiEngine.parseUserQuery(queryText)
            isAiLoading = false

            aiAnswer = response.directAnswer
            activeMenuId = response.menuId

            val updatedFilter = currentFilter.copy(
                cargo = response.filters.cargo ?: if (response.filters.buscaTexto != null) null else currentFilter.cargo,
                estadoUf = response.filters.estadoUf ?: currentFilter.estadoUf,
                tema = response.filters.tema ?: currentFilter.tema,
                partido = response.filters.partido ?: currentFilter.partido,
                buscaTexto = response.filters.buscaTexto ?: response.filters.nomeCandidato ?: response.filters.cidade,
                apenasFichaLimpa = response.filters.apenasFichaLimpa ?: currentFilter.apenasFichaLimpa,
                maxProcessosAdministrativos = response.filters.maxProcessosAdministrativos ?: currentFilter.maxProcessosAdministrativos
            )
            currentFilter = updatedFilter
            candidates = repository.getCandidates(updatedFilter)

            if (response.suggestedQuestions.isNotEmpty()) {
                suggestedQuestions = response.suggestedQuestions
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.HowToVote,
                            contentDescription = null,
                            tint = GoldSecondary,
                            modifier = Modifier.size(28.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Column {
                            Text(
                                text = "SaibaTudo",
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                            Text(
                                text = "Eleição 2026 • IA Oficial",
                                fontSize = 11.sp,
                                color = GoldSecondary
                            )
                        }
                    }
                },
                actions = {
                    FilledTonalButton(
                        onClick = {
                            urnaInitialCandidate = null
                            showUrnaSimulator = true
                        },
                        colors = ButtonDefaults.filledTonalButtonColors(
                            containerColor = MaterialTheme.colorScheme.secondary,
                            contentColor = Color(0xFF0F172A)
                        ),
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                        modifier = Modifier.padding(end = 8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.HowToVote,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "Simular Urna",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = NavyAccent)
            )
        }
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .background(MaterialTheme.colorScheme.background)
        ) {
            // 1. AI Search and Suggestions
            item {
                SearchBarAi(
                    query = searchQuery,
                    onQueryChange = { searchQuery = it },
                    onSearchSubmit = { onExecuteAiQuery(it) },
                    suggestedQuestions = suggestedQuestions,
                    onSuggestionClick = { selected ->
                        searchQuery = selected
                        onExecuteAiQuery(selected)
                    },
                    isAiLoading = isAiLoading
                )
            }

            // 2. AI Direct Answer Card
            item {
                AnimatedVisibility(visible = aiAnswer != null) {
                    aiAnswer?.let { answer ->
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 6.dp),
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)),
                            border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.primary)
                        ) {
                            Column(modifier = Modifier.padding(14.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.Top
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.AutoAwesome,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.size(20.dp)
                                    )
                                    Spacer(modifier = Modifier.width(10.dp))
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = "Resposta Inteligente (TSE / Modelo SaibaTudo)",
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = MaterialTheme.colorScheme.primary
                                        )
                                        Spacer(modifier = Modifier.height(4.dp))
                                        Text(
                                            text = answer,
                                            fontSize = 13.sp,
                                            color = MaterialTheme.colorScheme.onSurface,
                                            lineHeight = 18.sp
                                        )
                                    }
                                    IconButton(
                                        onClick = { aiAnswer = null },
                                        modifier = Modifier.size(24.dp)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Close,
                                            contentDescription = "Fechar resposta",
                                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier.size(16.dp)
                                        )
                                    }
                                }

                                // Botões Dinâmicos gerados a partir da resposta da IA
                                Spacer(modifier = Modifier.height(10.dp))
                                HorizontalDivider(
                                    modifier = Modifier.padding(vertical = 4.dp),
                                    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.2f)
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = "Botões Dinâmicos da IA:",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.primary
                                )
                                Spacer(modifier = Modifier.height(6.dp))

                                // 1. Botões de candidatos retornados pela resposta da IA
                                if (candidates.isNotEmpty()) {
                                    Text(
                                        text = "Candidatos encontrados pela resposta:",
                                        fontSize = 10.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .horizontalScroll(rememberScrollState()),
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        candidates.take(4).forEach { cand ->
                                            FilledTonalButton(
                                                onClick = { selectedCandidateForDetail = cand },
                                                shape = RoundedCornerShape(8.dp),
                                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp),
                                                colors = ButtonDefaults.filledTonalButtonColors(
                                                    containerColor = MaterialTheme.colorScheme.surface,
                                                    contentColor = MaterialTheme.colorScheme.onSurface
                                                )
                                            ) {
                                                Icon(
                                                    Icons.Default.Person,
                                                    contentDescription = null,
                                                    modifier = Modifier.size(13.dp),
                                                    tint = MaterialTheme.colorScheme.primary
                                                )
                                                Spacer(modifier = Modifier.width(4.dp))
                                                Text(
                                                    text = "${cand.nomeUrna} (${cand.numero})",
                                                    fontSize = 11.sp,
                                                    fontWeight = FontWeight.SemiBold
                                                )
                                            }
                                        }
                                    }
                                    Spacer(modifier = Modifier.height(6.dp))
                                }

                                // 2. Botão de Simulação direta do Voto na Urna e Perguntas Sugeridas
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .horizontalScroll(rememberScrollState()),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Button(
                                        onClick = {
                                            urnaInitialCandidate = candidates.firstOrNull()
                                            showUrnaSimulator = true
                                        },
                                        shape = RoundedCornerShape(8.dp),
                                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp),
                                        colors = ButtonDefaults.buttonColors(
                                            containerColor = MaterialTheme.colorScheme.secondary,
                                            contentColor = Color(0xFF0F172A)
                                        )
                                    ) {
                                        Icon(
                                            Icons.Default.HowToVote,
                                            contentDescription = null,
                                            modifier = Modifier.size(13.dp)
                                        )
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text(
                                            text = "Simular na Urna",
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }

                                    suggestedQuestions.forEach { suggestion ->
                                        OutlinedButton(
                                            onClick = {
                                                searchQuery = suggestion
                                                onExecuteAiQuery(suggestion)
                                            },
                                            shape = RoundedCornerShape(8.dp),
                                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp),
                                            border = androidx.compose.foundation.BorderStroke(
                                                1.dp,
                                                MaterialTheme.colorScheme.primary.copy(alpha = 0.5f)
                                            )
                                        ) {
                                            Icon(
                                                Icons.Default.AutoAwesome,
                                                contentDescription = null,
                                                modifier = Modifier.size(12.dp),
                                                tint = MaterialTheme.colorScheme.secondary
                                            )
                                            Spacer(modifier = Modifier.width(4.dp))
                                            Text(
                                                text = suggestion,
                                                fontSize = 11.sp,
                                                color = MaterialTheme.colorScheme.onSurface
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 3. Dynamic Filter Chips Row (with Location Toggle & Advanced Filters)
            item {
                FilterChipsRow(
                    currentFilter = currentFilter,
                    onFilterChange = { updated ->
                        currentFilter = updated
                        coroutineScope.launch {
                            candidates = repository.getCandidates(updated)
                        }
                    }
                )
            }

            // 4. Dynamic Menus & Submenus
            item {
                Spacer(modifier = Modifier.height(12.dp))
                DynamicMenuGrid(
                    menuItems = menuItems,
                    activeMenuId = activeMenuId,
                    onMenuClick = { menu ->
                        activeMenuId = menu.id
                        val defaultCargo = menu.defaultFilters["cargo"]
                        currentFilter = currentFilter.copy(cargo = defaultCargo)
                        coroutineScope.launch { candidates = repository.getCandidates(currentFilter) }
                    }
                )
            }

            // 5. Candidates Section Header
            item {
                Spacer(modifier = Modifier.height(16.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 6.dp)
                ) {
                    Text(
                        text = "Candidatos e Informações",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onBackground
                    )
                    Spacer(modifier = Modifier.weight(1f))
                    Text(
                        text = "${candidates.size} encontrados",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            // 6. Candidates Cards List
            if (candidates.isEmpty()) {
                item {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(32.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "Nenhum candidato localizado com os filtros selecionados.",
                            color = Color.Gray,
                            fontSize = 14.sp
                        )
                    }
                }
            } else {
                items(candidates) { candidate ->
                    CandidateItemCard(
                        candidate = candidate,
                        onCandidateClick = { selectedCandidateForDetail = it }
                    )
                }
            }

            item {
                Spacer(modifier = Modifier.height(24.dp))
            }
        }
    }

    // Modal de Detalhes do Candidato com Ficha Limpa e Propostas
    selectedCandidateForDetail?.let { candidate ->
        CandidateDetailDialog(
            candidate = candidate,
            onDismiss = { selectedCandidateForDetail = null },
            onSimularVoto = { cand ->
                selectedCandidateForDetail = null
                urnaInitialCandidate = cand
                showUrnaSimulator = true
            }
        )
    }

    // Modal de Simulação de Voto na Urna Eletrônica Oficial TSE
    if (showUrnaSimulator) {
        UrnaSimulatorDialog(
            allCandidates = candidates,
            initialCandidate = urnaInitialCandidate,
            onDismiss = {
                showUrnaSimulator = false
                urnaInitialCandidate = null
            }
        )
    }
}
