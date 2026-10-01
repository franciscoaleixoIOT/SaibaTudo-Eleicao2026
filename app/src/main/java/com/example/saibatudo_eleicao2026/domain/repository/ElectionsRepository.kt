package com.example.saibatudo_eleicao2026.domain.repository

import com.example.saibatudo_eleicao2026.domain.model.Candidate
import com.example.saibatudo_eleicao2026.domain.model.ElectoralFilter
import com.example.saibatudo_eleicao2026.domain.model.FontesOficiais
import com.example.saibatudo_eleicao2026.domain.model.MenuItem
import com.example.saibatudo_eleicao2026.domain.model.PesquisaEleitoral
import com.example.saibatudo_eleicao2026.domain.model.TseRegras

interface ElectionsRepository {
    suspend fun getMainMenuItems(): List<MenuItem>
    suspend fun getSubmenuItems(menuId: String): List<MenuItem>
    suspend fun getCandidates(filter: ElectoralFilter): List<Candidate>
    suspend fun getCandidateDetails(candidateId: String): Candidate?
    suspend fun getElectionInformation(topicId: String): String
    suspend fun getPesquisasRegistradas(): List<PesquisaEleitoral>
    suspend fun getRegrasOficiais(): TseRegras?
    suspend fun getPartidosDisponiveis(): List<String>
    suspend fun getFontesOficiais(): FontesOficiais?
    suspend fun isDadosCarregados(): Boolean
}
