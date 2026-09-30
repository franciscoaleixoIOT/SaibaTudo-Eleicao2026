package com.example.saibatudo_eleicao2026.data.repository

import com.example.saibatudo_eleicao2026.data.datasource.LocalElectionDataSource
import com.example.saibatudo_eleicao2026.domain.model.Candidate
import com.example.saibatudo_eleicao2026.domain.model.ElectoralFilter
import com.example.saibatudo_eleicao2026.domain.model.MandatosOpcao
import com.example.saibatudo_eleicao2026.domain.model.MenuItem
import com.example.saibatudo_eleicao2026.domain.model.TseCargo
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

        // 1. Filtro de Localização (Ligado/Desligado)
        if (filter.localizacaoAtiva && filter.estadoUf != null) {
            list = list.filter {
                it.estadoUf.equals(filter.estadoUf, ignoreCase = true) ||
                it.cargo.equals(TseCargo.PRESIDENTE.codigo, ignoreCase = true)
            }
        }

        // 2. Filtro por Região macro
        filter.regiao?.let { reg ->
            list = list.filter {
                it.regiao.equals(reg, ignoreCase = true) ||
                it.cargo.equals(TseCargo.PRESIDENTE.codigo, ignoreCase = true)
            }
        }

        // 3. Filtro por Cargo
        filter.cargo?.let { cargo ->
            list = list.filter { it.cargo.equals(cargo, ignoreCase = true) }
        }

        // 4. Filtro por Vaga do Senado (1ª ou 2ª vaga)
        filter.vagaSenado?.let { vaga ->
            val codigoVaga = if (vaga == 1) TseCargo.SENADOR_PRIMEIRA_VAGA.codigo else TseCargo.SENADOR_SEGUNDA_VAGA.codigo
            list = list.filter { it.cargo == codigoVaga }
        }

        // 5. Filtro Ficha Limpa
        if (filter.apenasFichaLimpa) {
            list = list.filter { it.fichaLimpa }
        }

        // 6. Filtro por Processos Administrativos
        filter.maxProcessosAdministrativos?.let { max ->
            list = list.filter { it.processosAdministrativos <= max }
        }

        // 7. Filtro por Histórico de Mandatos (Quantas vezes já foi eleito)
        when (filter.mandatosAnterioresOpcao) {
            MandatosOpcao.PRIMEIRA_VEZ -> list = list.filter { it.mandatosAnteriores == 0 }
            MandatosOpcao.REELEICAO -> list = list.filter { it.reeleicao }
            MandatosOpcao.VETERANO -> list = list.filter { it.mandatosAnteriores >= 2 }
            MandatosOpcao.TODOS -> { /* sem filtro */ }
        }

        // 8. Filtro por Partido
        filter.partido?.let { partido ->
            list = list.filter { it.partido.contains(partido, ignoreCase = true) }
        }

        // 9. Filtro por Tema
        filter.tema?.let { tema ->
            list = list.filter { cand ->
                cand.propostasResumo.any { it.contains(tema, ignoreCase = true) }
            }
        }

        // 10. Busca por texto (nome, número na urna, partido ou cidades de atuação)
        filter.buscaTexto?.let { query ->
            val cleanQuery = query.trim()
            if (cleanQuery.isNotEmpty()) {
                list = list.filter { cand ->
                    cand.nomeUrna.contains(cleanQuery, ignoreCase = true) ||
                    cand.nomeCompleto.contains(cleanQuery, ignoreCase = true) ||
                    cand.numero.contains(cleanQuery) ||
                    cand.partido.contains(cleanQuery, ignoreCase = true) ||
                    cand.cidadesAtuacao.any { cidade -> cidade.contains(cleanQuery, ignoreCase = true) } ||
                    cand.propostasResumo.any { prop -> prop.contains(cleanQuery, ignoreCase = true) }
                }
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
