package com.example.saibatudo_eleicao2026.data.repository

import com.example.saibatudo_eleicao2026.data.datasource.LocalElectionDataSource
import com.example.saibatudo_eleicao2026.domain.model.Candidate
import com.example.saibatudo_eleicao2026.domain.model.ElectoralFilter
import com.example.saibatudo_eleicao2026.domain.model.MenuItem
import com.example.saibatudo_eleicao2026.domain.repository.ElectionsRepository

class ElectionsRepositoryImpl(
    private val localDataSource: LocalElectionDataSource = LocalElectionDataSource()
) : ElectionsRepository {

    override suspend fun getMainMenuItems(): List<MenuItem> {
        return localDataSource.getInitialMenus()
    }

    override suspend fun getSubmenuItems(menuId: String): List<MenuItem> {
        val menu = localDataSource.getInitialMenus().find { it.id == menuId }
        return menu?.submenus ?: emptyList()
    }

    override suspend fun getCandidates(filter: ElectoralFilter): List<Candidate> {
        var list = localDataSource.getSampleCandidates()

        filter.cargo?.let { cargo ->
            list = list.filter { it.cargo.equals(cargo, ignoreCase = true) }
        }
        filter.estadoUf?.let { uf ->
            list = list.filter { it.estadoUf.equals(uf, ignoreCase = true) }
        }
        filter.partido?.let { partido ->
            list = list.filter { it.partido.contains(partido, ignoreCase = true) }
        }
        filter.buscaTexto?.let { query ->
            list = list.filter {
                it.nomeUrna.contains(query, ignoreCase = true) ||
                it.numero.contains(query)
            }
        }
        return list
    }

    override suspend fun getCandidateDetails(candidateId: String): Candidate? {
        return localDataSource.getSampleCandidates().find { it.id == candidateId }
    }

    override suspend fun getElectionInformation(topicId: String): String {
        return "Informações e diretrizes oficiais do TSE referentes ao tópico $topicId nas Eleições 2026."
    }
}
