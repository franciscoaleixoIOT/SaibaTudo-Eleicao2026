package com.example.saibatudo_eleicao2026.data.datasource

import com.example.saibatudo_eleicao2026.core.constants.AppConstants
import com.example.saibatudo_eleicao2026.domain.model.Candidate
import com.example.saibatudo_eleicao2026.domain.model.MenuItem
import com.example.saibatudo_eleicao2026.domain.model.TseCargo

class LocalElectionDataSource {

    fun getInitialMenus(): List<MenuItem> {
        return listOf(
            MenuItem(
                id = AppConstants.MENU_PRESIDENTE,
                title = "Presidente (2 dígitos)",
                description = "Eleição nacional majoritária • 2 dígitos na urna",
                iconName = "ic_presidencia",
                route = "candidates/presidente",
                submenus = listOf(
                    MenuItem("sub_pres_todos", "Todos os Presidenciáveis", "Lista nacional", "ic_list", "candidates/presidente"),
                    MenuItem("sub_pres_debates", "Debates e Propostas", "Calendário e planos", "ic_event", "info/debates")
                ),
                defaultFilters = mapOf("cargo" to TseCargo.PRESIDENTE.codigo)
            ),
            MenuItem(
                id = AppConstants.MENU_GOVERNADOR,
                title = "Governador (2 dígitos)",
                description = "Governo Estadual • 2 dígitos na urna",
                iconName = "ic_governador",
                route = "candidates/governador",
                defaultFilters = mapOf("cargo" to TseCargo.GOVERNADOR.codigo)
            ),
            MenuItem(
                id = AppConstants.MENU_SENADOR,
                title = "Senadores (3 dígitos)",
                description = "Renovação de 2/3: 1ª vaga e 2ª vaga",
                iconName = "ic_senado",
                route = "candidates/senador",
                submenus = listOf(
                    MenuItem("sub_sen_vaga1", "Senador – 1ª Vaga", "3 dígitos", "ic_vote", "candidates/senador?vaga=1"),
                    MenuItem("sub_sen_vaga2", "Senador – 2ª Vaga", "3 dígitos", "ic_vote", "candidates/senador?vaga=2")
                ),
                defaultFilters = mapOf("cargo" to TseCargo.SENADOR_PRIMEIRA_VAGA.codigo)
            ),
            MenuItem(
                id = AppConstants.MENU_DEPUTADO_FEDERAL,
                title = "Deputado Federal (4 dígitos)",
                description = "Câmara dos Deputados • 4 dígitos na urna",
                iconName = "ic_deputado",
                route = "candidates/deputado_federal",
                defaultFilters = mapOf("cargo" to TseCargo.DEPUTADO_FEDERAL.codigo)
            ),
            MenuItem(
                id = AppConstants.MENU_DEPUTADO_ESTADUAL,
                title = "Dep. Estadual / Distrital (5 dígitos)",
                description = "Assembleias e Câmara DF • 5 dígitos na urna",
                iconName = "ic_deputado_est",
                route = "candidates/deputado_estadual",
                defaultFilters = mapOf("cargo" to TseCargo.DEPUTADO_ESTADUAL.codigo)
            ),
            MenuItem(
                id = AppConstants.MENU_CALENDARIO,
                title = "Calendário & Prazos TSE",
                description = "1º e 2º turnos em outubro de 2026",
                iconName = "ic_calendar",
                route = "info/calendario"
            )
        )
    }

    fun getSampleCandidates(): List<Candidate> {
        return listOf(
            // Presidente (2 dígitos)
            Candidate(
                id = "cand_pres_1",
                numero = "10",
                nomeUrna = "Candidato Presidencial A",
                nomeCompleto = "Candidato Presidencial Alfa Silva",
                cargo = TseCargo.PRESIDENTE.codigo,
                partido = "REPUBLICANOS",
                coligacao = "Coligação Brasil Forte",
                estadoUf = "BR",
                regiao = "Nacional",
                digitosUrna = 2,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 2,
                reeleicao = false,
                propostasResumo = listOf("Reforma tributária", "Educação técnica integrada")
            ),
            Candidate(
                id = "cand_pres_2",
                numero = "22",
                nomeUrna = "Candidato Presidencial B",
                nomeCompleto = "Candidato Presidencial Beta Souza",
                cargo = TseCargo.PRESIDENTE.codigo,
                partido = "PL",
                coligacao = "Aliança pela Liberdade",
                estadoUf = "BR",
                regiao = "Nacional",
                digitosUrna = 2,
                fotoUrl = null,
                processosAdministrativos = 1,
                fichaLimpa = true,
                mandatosAnteriores = 3,
                reeleicao = false,
                propostasResumo = listOf("Desregulamentação econômica", "Segurança pública ostensiva")
            ),

            // Governador (2 dígitos) - SP
            Candidate(
                id = "cand_gov_sp_1",
                numero = "15",
                nomeUrna = "Maria Governadora SP",
                nomeCompleto = "Maria Aparecida dos Santos",
                cargo = TseCargo.GOVERNADOR.codigo,
                partido = "MDB",
                coligacao = "São Paulo Unida",
                estadoUf = "SP",
                regiao = "Sudeste",
                digitosUrna = 2,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 1,
                reeleicao = true,
                propostasResumo = listOf("Expansão do metrô e trens", "Hospital regional digital")
            ),
            Candidate(
                id = "cand_gov_sp_2",
                numero = "20",
                nomeUrna = "Carlos do Povo SP",
                nomeCompleto = "Carlos Eduardo Rodrigues",
                cargo = TseCargo.GOVERNADOR.codigo,
                partido = "PODEMOS",
                coligacao = "Renova São Paulo",
                estadoUf = "SP",
                regiao = "Sudeste",
                digitosUrna = 2,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 0,
                reeleicao = false,
                propostasResumo = listOf("Incentivo a startups", "Ensino integral em todas as escolas")
            ),

            // Senador 1ª Vaga (3 dígitos) - SP
            Candidate(
                id = "cand_sen_sp_1",
                numero = "151",
                nomeUrna = "Doutor Paulo Senador (1ª Vaga)",
                nomeCompleto = "Paulo Roberto Ferreira",
                cargo = TseCargo.SENADOR_PRIMEIRA_VAGA.codigo,
                partido = "MDB",
                coligacao = "São Paulo Unida",
                estadoUf = "SP",
                regiao = "Sudeste",
                digitosUrna = 3,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 0,
                reeleicao = false,
                propostasResumo = listOf("Fortalecimento do SUS", "Pacto federativo")
            ),
            // Senador 2ª Vaga (3 dígitos) - SP
            Candidate(
                id = "cand_sen_sp_2",
                numero = "202",
                nomeUrna = "Professora Lúcia (2ª Vaga)",
                nomeCompleto = "Lúcia Helena Guimarães",
                cargo = TseCargo.SENADOR_SEGUNDA_VAGA.codigo,
                partido = "PODEMOS",
                coligacao = "Renova São Paulo",
                estadoUf = "SP",
                regiao = "Sudeste",
                digitosUrna = 3,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 1,
                reeleicao = false,
                propostasResumo = listOf("Marco legal da inteligência artificial", "Proteção de bacias hídricas")
            ),

            // Deputado Federal (4 dígitos) - SP
            Candidate(
                id = "cand_dep_fed_sp_1",
                numero = "1510",
                nomeUrna = "Ana Federal",
                nomeCompleto = "Ana Cristina Moreira",
                cargo = TseCargo.DEPUTADO_FEDERAL.codigo,
                partido = "MDB",
                coligacao = null,
                estadoUf = "SP",
                regiao = "Sudeste",
                digitosUrna = 4,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 0,
                reeleicao = false,
                propostasResumo = listOf("Empreendedorismo feminino", "Energia solar comunitária")
            ),
            Candidate(
                id = "cand_dep_fed_sp_2",
                numero = "2222",
                nomeUrna = "Roberto Federal",
                nomeCompleto = "Roberto Cavalcante",
                cargo = TseCargo.DEPUTADO_FEDERAL.codigo,
                partido = "PL",
                coligacao = null,
                estadoUf = "SP",
                regiao = "Sudeste",
                digitosUrna = 4,
                fotoUrl = null,
                processosAdministrativos = 2,
                fichaLimpa = true,
                mandatosAnteriores = 3,
                reeleicao = true,
                propostasResumo = listOf("Redução de tributos", "Endurecimento penal")
            ),

            // Deputado Estadual (5 dígitos) - SP
            Candidate(
                id = "cand_dep_est_sp_1",
                numero = "15100",
                nomeUrna = "Marcos Estadual",
                nomeCompleto = "Marcos Vinicius de Lima",
                cargo = TseCargo.DEPUTADO_ESTADUAL.codigo,
                partido = "MDB",
                coligacao = null,
                estadoUf = "SP",
                regiao = "Sudeste",
                digitosUrna = 5,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 0,
                reeleicao = false,
                propostasResumo = listOf("Fiscalização da merenda escolar", "Apoio a hospitais filantrópicos")
            ),

            // Candidato Nordeste (BA) - Governador
            Candidate(
                id = "cand_gov_ba_1",
                numero = "13",
                nomeUrna = "Antônio Governador BA",
                nomeCompleto = "Antônio Carlos Bahia",
                cargo = TseCargo.GOVERNADOR.codigo,
                partido = "PT",
                coligacao = "Bahia do Futuro",
                estadoUf = "BA",
                regiao = "Nordeste",
                digitosUrna = 2,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 1,
                reeleicao = true,
                propostasResumo = listOf("Agricultura familiar", "Saneamento básico no semiárido")
            )
        )
    }
}
