package com.example.saibatudo_eleicao2026.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.HowToVote
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
                cargo = response.filters.cargo ?: currentFilter.cargo,
                estadoUf = response.filters.estadoUf ?: currentFilter.estadoUf,
                tema = response.filters.tema ?: currentFilter.tema
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
                            colors = CardDefaults.cardColors(containerColor = GreenLight),
                            border = androidx.compose.foundation.BorderStroke(1.dp, GreenPrimary)
                        ) {
                            Row(
                                modifier = Modifier.padding(14.dp),
                                verticalAlignment = Alignment.Top
                            ) {
                                Icon(
                                    imageVector = Icons.Default.AutoAwesome,
                                    contentDescription = null,
                                    tint = GreenPrimary,
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(modifier = Modifier.width(10.dp))
                                Column {
                                    Text(
                                        text = "Resposta Inteligente (TSE / Modelo SaibaTudo)",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = GreenPrimary
                                    )
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Text(
                                        text = answer,
                                        fontSize = 13.sp,
                                        color = NavyAccent,
                                        lineHeight = 18.sp
                                    )
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
                        color = NavyAccent
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
                        onCandidateClick = { /* Detalhes do candidato */ }
                    )
                }
            }

            item {
                Spacer(modifier = Modifier.height(24.dp))
            }
        }
    }
}
