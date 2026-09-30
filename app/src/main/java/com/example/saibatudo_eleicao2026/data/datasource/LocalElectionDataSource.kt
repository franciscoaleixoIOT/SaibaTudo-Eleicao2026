package com.example.saibatudo_eleicao2026.data.datasource

import com.example.saibatudo_eleicao2026.core.constants.AppConstants
import com.example.saibatudo_eleicao2026.domain.model.Candidate
import com.example.saibatudo_eleicao2026.domain.model.ElectoralFilter
import com.example.saibatudo_eleicao2026.domain.model.MenuItem

class LocalElectionDataSource {

    fun getInitialMenus(): List<MenuItem> {
        return listOf(
            MenuItem(
                id = AppConstants.MENU_PRESIDENTE,
                title = "Presidente da República",
                description = "Planos de governo, chapas e candidatos presidenciais",
                iconName = "ic_presidencia",
                route = "candidates/presidente",
                submenus = listOf(
                    MenuItem("sub_pres_todos", "Todos os Candidatos", "Lista geral", "ic_list", "candidates/presidente"),
                    MenuItem("sub_pres_debates", "Debates e Calendário", "Datas e regras", "ic_event", "info/debates")
                ),
                defaultFilters = mapOf("cargo" to "PRESIDENTE")
            ),
            MenuItem(
                id = AppConstants.MENU_GOVERNADOR,
                title = "Governadores",
                description = "Candidatos aos governos estaduais por UF",
                iconName = "ic_governador",
                route = "candidates/governador",
                defaultFilters = mapOf("cargo" to "GOVERNADOR")
            ),
            MenuItem(
                id = AppConstants.MENU_SENADOR,
                title = "Senadores",
                description = "Renovação de 2/3 das cadeiras do Senado em 2026",
                iconName = "ic_senado",
                route = "candidates/senador",
                defaultFilters = mapOf("cargo" to "SENADOR")
            ),
            MenuItem(
                id = AppConstants.MENU_DEPUTADO_FEDERAL,
                title = "Deputados Federais",
                description = "Candidatos à Câmara dos Deputados por estado",
                iconName = "ic_deputado",
                route = "candidates/deputado_federal",
                defaultFilters = mapOf("cargo" to "DEPUTADO_FEDERAL")
            ),
            MenuItem(
                id = AppConstants.MENU_CALENDARIO,
                title = "Calendário & Prazos",
                description = "1º e 2º turno, biometria e transferência de domicílio",
                iconName = "ic_calendar",
                route = "info/calendario"
            ),
            MenuItem(
                id = AppConstants.MENU_LOCAIS_VOTACAO,
                title = "Onde Votar & Justificativa",
                description = "Consulte sua seção eleitoral e locais de justificativa",
                iconName = "ic_location",
                route = "info/locais"
            )
        )
    }

    fun getSampleCandidates(): List<Candidate> {
        return listOf(
            Candidate(
                id = "cand_1",
                numero = "10",
                nomeUrna = "Candidato Exemplo A",
                nomeCompleto = "Candidato Exemplo A Silva",
                cargo = "PRESIDENTE",
                partido = "PARTIDO A",
                coligacao = "Coligação Brasil Futuro",
                estadoUf = "BR",
                fotoUrl = null,
                propostasResumo = listOf("Educação integral e técnica", "Transição energética", "Reforma tributária simplificada")
            ),
            Candidate(
                id = "cand_2",
                numero = "20",
                nomeUrna = "Candidato Exemplo B",
                nomeCompleto = "Candidato Exemplo B Santos",
                cargo = "GOVERNADOR",
                partido = "PARTIDO B",
                coligacao = "Avança Estado",
                estadoUf = "SP",
                fotoUrl = null,
                propostasResumo = listOf("Segurança pública integrada", "Modernização da saúde digital", "Incentivo a startups")
            )
        )
    }
}
