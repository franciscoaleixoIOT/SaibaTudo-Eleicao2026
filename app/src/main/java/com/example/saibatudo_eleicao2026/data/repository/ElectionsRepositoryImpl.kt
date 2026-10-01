package com.example.saibatudo_eleicao2026.data.repository

import com.example.saibatudo_eleicao2026.core.constants.AppConstants
import com.example.saibatudo_eleicao2026.data.datasource.OfficialElectionDataSource
import com.example.saibatudo_eleicao2026.domain.model.Candidate
import com.example.saibatudo_eleicao2026.domain.model.ElectoralFilter
import com.example.saibatudo_eleicao2026.domain.model.FontesOficiais
import com.example.saibatudo_eleicao2026.domain.model.MandatosOpcao
import com.example.saibatudo_eleicao2026.domain.model.MenuItem
import com.example.saibatudo_eleicao2026.domain.model.PesquisaEleitoral
import com.example.saibatudo_eleicao2026.domain.model.TseCargo
import com.example.saibatudo_eleicao2026.domain.model.TseRegras
import com.example.saibatudo_eleicao2026.domain.repository.ElectionsRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Repositório de dados OFICIAIS do TSE (Eleições Gerais 2026).
 * Todas as consultas rodam sobre os 20.988 candidatos oficiais registrados
 * no TSE, carregados dos assets gerados pelo pipeline de dados abertos do TSE.
 */
class ElectionsRepositoryImpl(
    private val dataSource: OfficialElectionDataSource
) : ElectionsRepository {

    override suspend fun isDadosCarregados(): Boolean = dataSource.getCandidatos().isNotEmpty()

    override suspend fun getMainMenuItems(): List<MenuItem> {
        val regras = dataSource.getRegras()
        val stat = regras?.estatisticas
        val fmt = { cargo: String -> stat?.porCargo?.get(cargo)?.toString() ?: "" }

        return listOf(
            MenuItem(
                id = AppConstants.MENU_PRESIDENTE,
                title = "Presidente (2 dígitos)",
                description = "Candidatos registrados: ${fmt("PRESIDENTE")} • âmbito nacional",
                iconName = "ic_presidencia",
                route = "candidates/presidente",
                submenus = listOf(
                    MenuItem("sub_pres_todos", "Todos os Presidenciáveis", "Lista nacional oficial", "ic_list", "candidates/presidente"),
                    MenuItem("sub_pres_planos", "Planos de Governo", "Documentos oficiais registrados no TSE", "ic_event", "info/planos")
                ),
                defaultFilters = mapOf("cargo" to TseCargo.PRESIDENTE.codigo)
            ),
            MenuItem(
                id = AppConstants.MENU_GOVERNADOR,
                title = "Governador (2 dígitos)",
                description = "Candidatos registrados: ${fmt("GOVERNADOR")} • 27 unidades federativas",
                iconName = "ic_governador",
                route = "candidates/governador",
                defaultFilters = mapOf("cargo" to TseCargo.GOVERNADOR.codigo)
            ),
            MenuItem(
                id = AppConstants.MENU_SENADOR,
                title = "Senadores (3 dígitos)",
                description = "Candidatos registrados: ${fmt("SENADOR")} • renovação de 2/3 (2 vagas por UF)",
                iconName = "ic_senado",
                route = "candidates/senador",
                defaultFilters = mapOf("cargo" to TseCargo.SENADOR.codigo)
            ),
            MenuItem(
                id = AppConstants.MENU_DEPUTADO_FEDERAL,
                title = "Deputado Federal (4 dígitos)",
                description = "Candidatos registrados: ${fmt("DEPUTADO FEDERAL")} • 513 vagas na Câmara",
                iconName = "ic_deputado",
                route = "candidates/deputado_federal",
                defaultFilters = mapOf("cargo" to TseCargo.DEPUTADO_FEDERAL.codigo)
            ),
            MenuItem(
                id = AppConstants.MENU_DEPUTADO_ESTADUAL,
                title = "Dep. Estadual / Distrital (5 dígitos)",
                description = "Candidatos registrados: ${fmt("DEPUTADO ESTADUAL")} + ${fmt("DEPUTADO DISTRITAL")} (distritais)",
                iconName = "ic_deputado_est",
                route = "candidates/deputado_estadual",
                defaultFilters = mapOf("cargo" to TseCargo.DEPUTADO_ESTADUAL.codigo)
            ),
            MenuItem(
                id = AppConstants.MENU_PESQUISAS,
                title = "Pesquisas Registradas",
                description = "${regras?.estatisticas?.pesquisasRegistradas ?: ""} pesquisas eleitorais registradas no TSE",
                iconName = "ic_pesquisas",
                route = "info/pesquisas"
            ),
            MenuItem(
                id = AppConstants.MENU_CALENDARIO,
                title = "Calendário & Prazos TSE",
                description = "1º turno ${regras?.dataPrimeiroTurno ?: "04/10/2026"} • 2º turno ${regras?.dataSegundoTurno ?: "25/10/2026"}",
                iconName = "ic_calendar",
                route = "info/calendario"
            )
        )
    }

    override suspend fun getSubmenuItems(menuId: String): List<MenuItem> {
        return getMainMenuItems().find { it.id == menuId }?.submenus ?: emptyList()
    }

    override suspend fun getCandidates(filter: ElectoralFilter): List<Candidate> =
        withContext(Dispatchers.Default) {
            var list = dataSource.getCandidatos()

            // 1. Filtro de Localização (ligado/desligado): mantém candidatos nacionais (Presidência)
            if (filter.localizacaoAtiva && filter.estadoUf != null) {
                val uf = filter.estadoUf!!
                list = list.filter { it.estadoUf == uf || it.estadoUf == "BR" }
            }

            // 2. Filtro por macro-região
            filter.regiao?.let { regiao ->
                list = list.filter { it.regiao == regiao || it.estadoUf == "BR" }
            }

            // 3. Filtro por cargo (inclui deputado distrital no cargo estadual e vices/suplentes)
            filter.cargo?.let { cargo ->
                when (cargo) {
                    TseCargo.DEPUTADO_ESTADUAL.codigo -> list = list.filter {
                        it.cargoCodigo == cargo || it.cargoCodigo == "DEPUTADO_DISTRITAL"
                    }
                    TseCargo.PRESIDENTE.codigo -> list = list.filter {
                        it.cargoCodigo == cargo || it.cargoCodigo == "VICE_PRESIDENTE"
                    }
                    TseCargo.GOVERNADOR.codigo -> list = list.filter {
                        it.cargoCodigo == cargo || it.cargoCodigo == "VICE_GOVERNADOR"
                    }
                    TseCargo.SENADOR.codigo -> list = list.filter {
                        it.cargoCodigo == cargo || it.cargoCodigo.startsWith("SUPLENTE")
                    }
                    else -> list = list.filter { it.cargoCodigo == cargo }
                }
            }

            // 4. Filtro de Ficha Limpa (LC 135/2010 sobre a situação de julgamento oficial)
            if (filter.apenasFichaLimpa) {
                list = list.filter { it.fichaLimpa }
            }

            // 5. Apenas candidaturas DEFERIDAS
            if (filter.apenasDefinidos) {
                list = list.filter { it.situacaoCandidatura.startsWith("DEFERIDO", ignoreCase = true) }
            }

            // 6. Fundamentos legais de julgamento (processos administrativos oficiais)
            filter.maxProcessosAdministrativos?.let { max ->
                list = list.filter { it.processosAdministrativos <= max }
            }

            // 7. Histórico de mandatos (baseado no histórico oficial de candidaturas do TSE)
            when (filter.mandatosAnterioresOpcao) {
                MandatosOpcao.PRIMEIRA_VEZ -> list = list.filter { it.mandatosAnteriores == 0 }
                MandatosOpcao.REELEICAO -> list = list.filter { it.reeleicao }
                MandatosOpcao.VETERANO -> list = list.filter { it.mandatosAnteriores >= 2 }
                MandatosOpcao.TODOS -> { /* sem filtro */ }
            }

            if (filter.apenasReeleicao) {
                list = list.filter { it.reeleicao }
            }

            // 8. Filtro por partido (sigla oficial)
            filter.partido?.let { partido ->
                list = list.filter { it.partido.equals(partido, ignoreCase = true) }
            }

            // 9. Filtro por tema (somente a partir de planos de governo OFICIAIS registrados no TSE)
            filter.tema?.let { tema ->
                val termo = tema.lowercase()
                list = list.filter { cand ->
                    cand.propostasResumo.any { it.lowercase().contains(termo) }
                }
            }

            // 10. Busca textual (nome, número, partido, município de nascimento)
            filter.buscaTexto?.let { query ->
                val q = normalize(query.trim())
                if (q.isNotEmpty()) {
                    list = list.filter { cand ->
                        normalize(cand.nomeUrna).contains(q) ||
                            normalize(cand.nomeCompleto).contains(q) ||
                            cand.numero == q ||
                            normalize(cand.partido).contains(q) ||
                            cand.municipioNascimento?.let { normalize(it).contains(q) } == true
                    }
                }
            }

            // Ordena: majoritários primeiro (ordem oficial de votação), depois por número
            list.sortedWith(compareBy({ it.ordemVotacao }, { it.estadoUf }, { it.numero.toIntOrNull() ?: Int.MAX_VALUE }))
        }

    override suspend fun getCandidateDetails(candidateId: String): Candidate? {
        return dataSource.getCandidatos().find { it.id == candidateId }
    }

    override suspend fun getElectionInformation(topicId: String): String {
        val regras = dataSource.getRegras()
        return when (topicId) {
            "calendario" -> "Calendário Oficial TSE 2026: 1º turno em ${regras?.dataPrimeiroTurno ?: "04/10/2026"} " +
                "e 2º turno em ${regras?.dataSegundoTurno ?: "25/10/2026"} (${regras?.horarioVotacao ?: "8h às 17h"}, horário de Brasília)."
            "pesquisas" -> "O TSE registra ${regras?.estatisticas?.pesquisasRegistradas ?: 0} pesquisas eleitorais oficiais para 2026. " +
                "Use o menu 'Pesquisas Registradas' para consultar."
            "planos" -> "Planos de governo oficiais registrados no TSE: ${regras?.estatisticas?.planosDeGovernoDisponiveis ?: 0} documentos disponíveis."
            else -> "Informações oficiais do TSE referentes ao tópico $topicId (Eleições Gerais 2026)."
        }
    }

    override suspend fun getPesquisasRegistradas(): List<PesquisaEleitoral> = dataSource.getPesquisas()

    override suspend fun getRegrasOficiais(): TseRegras? = dataSource.getRegras()

    override suspend fun getFontesOficiais(): FontesOficiais? = dataSource.getFontesOficiais()

    override suspend fun getPartidosDisponiveis(): List<String> =
        dataSource.getCandidatos().map { it.partido }.filter { it.isNotBlank() }.distinct().sorted()

    private fun normalize(s: String): String = s
        .trim()
        .lowercase()
        .replace(Regex("[àáâãäå]"), "a")
        .replace(Regex("[èéêë]"), "e")
        .replace(Regex("[ìíîï]"), "i")
        .replace(Regex("[òóôõö]"), "o")
        .replace(Regex("[ùúûü]"), "u")
        .replace("ç", "c")
        .replace(Regex("\\s+"), " ")
}
