package com.example.saibatudo_eleicao2026.domain.model

data class Candidate(
    val id: String,
    val numero: String,
    val nomeUrna: String,
    val nomeCompleto: String,
    val cargo: String,
    val partido: String,
    val coligacao: String?,
    val estadoUf: String,
    val fotoUrl: String?,
    val propostasResumo: List<String> = emptyList(),
    val situacaoCandidatura: String = "Deferido"
)

data class MenuItem(
    val id: String,
    val title: String,
    val description: String,
    val iconName: String,
    val route: String,
    val submenus: List<MenuItem> = emptyList(),
    val defaultFilters: Map<String, String> = emptyMap()
)

data class ElectoralFilter(
    val cargo: String? = null,
    val estadoUf: String? = null,
    val partido: String? = null,
    val tema: String? = null,
    val buscaTexto: String? = null
)
