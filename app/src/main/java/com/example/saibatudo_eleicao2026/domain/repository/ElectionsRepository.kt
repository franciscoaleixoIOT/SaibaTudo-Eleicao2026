package com.example.saibatudo_eleicao2026.domain.repository

import com.example.saibatudo_eleicao2026.domain.model.Candidate
import com.example.saibatudo_eleicao2026.domain.model.ElectoralFilter
import com.example.saibatudo_eleicao2026.domain.model.MenuItem

interface ElectionsRepository {
    suspend fun getMainMenuItems(): List<MenuItem>
    suspend fun getSubmenuItems(menuId: String): List<MenuItem>
    suspend fun getCandidates(filter: ElectoralFilter): List<Candidate>
    suspend fun getCandidateDetails(candidateId: String): Candidate?
    suspend fun getElectionInformation(topicId: String): String
}
