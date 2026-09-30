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
            // ==========================================
            // PRESIDENTE DA REPÚBLICA (2 DÍGITOS - BR)
            // ==========================================
            Candidate(
                id = "cand_pres_lula",
                numero = "13",
                nomeUrna = "Lula",
                nomeCompleto = "Luiz Inácio Lula da Silva",
                cargo = TseCargo.PRESIDENTE.codigo,
                partido = "PT",
                coligacao = "Federação Brasil da Esperança (PT / PCdoB / PV)",
                estadoUf = "BR",
                regiao = "Nacional",
                digitosUrna = 2,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 3,
                reeleicao = true,
                propostasResumo = listOf(
                    "Reindustrialização e transição energética verde",
                    "Isenção de Imposto de Renda para rendas até R$ 5.000",
                    "Expansão de Institutos Federais e ensino em tempo integral",
                    "Fortalecimento do SUS e Farmácia Popular"
                ),
                cidadesAtuacao = listOf("Brasil", "São Paulo", "Nordeste")
            ),
            Candidate(
                id = "cand_pres_tarcisio",
                numero = "10",
                nomeUrna = "Tarcísio de Freitas",
                nomeCompleto = "Tarcísio Gomes de Freitas",
                cargo = TseCargo.PRESIDENTE.codigo,
                partido = "REPUBLICANOS",
                coligacao = "Aliança pelo Brasil Produtivo",
                estadoUf = "BR",
                regiao = "Nacional",
                digitosUrna = 2,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 1,
                reeleicao = false,
                propostasResumo = listOf(
                    "Grandes concessões e atração maciça de investimento privado",
                    "Expansão de ferrovias, hidrovias e rodovias federais",
                    "Tolerância zero ao crime organizado e policiamento integrado",
                    "Reforma administrativa com digitalização de serviços"
                ),
                cidadesAtuacao = listOf("São Paulo", "Brasil", "Interior Paulista")
            ),
            Candidate(
                id = "cand_pres_caiado",
                numero = "44",
                nomeUrna = "Ronaldo Caiado",
                nomeCompleto = "Ronaldo Ramos Caiado",
                cargo = TseCargo.PRESIDENTE.codigo,
                partido = "UNIÃO",
                coligacao = "União e Ordem Nacional",
                estadoUf = "BR",
                regiao = "Nacional",
                digitosUrna = 2,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 4,
                reeleicao = false,
                propostasResumo = listOf(
                    "Modelo integrado de inteligência em segurança pública",
                    "Defesa irrestrita do agronegócio e abertura de novos mercados",
                    "Saúde pública regionalizada e descentralizada nos estados"
                ),
                cidadesAtuacao = listOf("Goiás", "Centro-Oeste", "Brasil")
            ),
            Candidate(
                id = "cand_pres_zema",
                numero = "30",
                nomeUrna = "Romeu Zema",
                nomeCompleto = "Romeu Zema Neto",
                cargo = TseCargo.PRESIDENTE.codigo,
                partido = "NOVO",
                coligacao = "Brasil Eficiente",
                estadoUf = "BR",
                regiao = "Nacional",
                digitosUrna = 2,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 2,
                reeleicao = false,
                propostasResumo = listOf(
                    "Corte radical de privilégios e enxugamento da máquina pública",
                    "Desregulamentação econômica para aceleração de empregos",
                    "Pacto federativo com maior autonomia fiscal para estados e municípios"
                ),
                cidadesAtuacao = listOf("Minas Gerais", "Sudeste", "Brasil")
            ),
            Candidate(
                id = "cand_pres_ratinho",
                numero = "55",
                nomeUrna = "Ratinho Júnior",
                nomeCompleto = "Carlos Roberto Massa Júnior",
                cargo = TseCargo.PRESIDENTE.codigo,
                partido = "PSD",
                coligacao = "Inovação e Desenvolvimento",
                estadoUf = "BR",
                regiao = "Nacional",
                digitosUrna = 2,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 3,
                reeleicao = false,
                propostasResumo = listOf(
                    "Governo 100% digital e modernização de portos e aeroportos",
                    "Ensino técnico profissionalizante integrado à tecnologia",
                    "Sustentabilidade com matriz energética renovável"
                ),
                cidadesAtuacao = listOf("Paraná", "Sul", "Brasil")
            ),
            Candidate(
                id = "cand_pres_ciro",
                numero = "12",
                nomeUrna = "Ciro Gomes",
                nomeCompleto = "Ciro Ferreira Gomes",
                cargo = TseCargo.PRESIDENTE.codigo,
                partido = "PDT",
                coligacao = "Frente Trabalhista e Soberana",
                estadoUf = "BR",
                regiao = "Nacional",
                digitosUrna = 2,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 4,
                reeleicao = false,
                propostasResumo = listOf(
                    "Projeto Nacional de Desenvolvimento (PND)",
                    "Escola pública em tempo integral com metodologia de ponta",
                    "Reforma tributária progressiva e refinanciamento do endividamento familiar"
                ),
                cidadesAtuacao = listOf("Ceará", "Nordeste", "Brasil")
            ),
            Candidate(
                id = "cand_pres_tebet",
                numero = "15",
                nomeUrna = "Simone Tebet",
                nomeCompleto = "Simone Nassar Tebet",
                cargo = TseCargo.PRESIDENTE.codigo,
                partido = "MDB",
                coligacao = "Centro Democrático e Social",
                estadoUf = "BR",
                regiao = "Nacional",
                digitosUrna = 2,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 3,
                reeleicao = false,
                propostasResumo = listOf(
                    "Planejamento orçamentário plurianual com metas socioambientais",
                    "Igualdade salarial e incentivo ao empreendedorismo feminino",
                    "Prioridade absoluta na primeira infância e creches públicas"
                ),
                cidadesAtuacao = listOf("Mato Grosso do Sul", "Brasil")
            ),
            Candidate(
                id = "cand_pres_leite",
                numero = "45",
                nomeUrna = "Eduardo Leite",
                nomeCompleto = "Eduardo Figueiredo Cavalheiro Leite",
                cargo = TseCargo.PRESIDENTE.codigo,
                partido = "PSDB",
                coligacao = "Futuro Sustentável",
                estadoUf = "BR",
                regiao = "Nacional",
                digitosUrna = 2,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 2,
                reeleicao = false,
                propostasResumo = listOf(
                    "Gestão pública baseada em evidências científicas",
                    "Reestruturação de finanças públicas e previdência",
                    "Incentivo à ciência, inovação e transição climática"
                ),
                cidadesAtuacao = listOf("Rio Grande do Sul", "Brasil")
            ),

            // ==========================================
            // GOVERNADOR DO ESTADO DE SÃO PAULO (2 DÍGITOS - SP)
            // ==========================================
            Candidate(
                id = "cand_gov_sp_tarcisio",
                numero = "10",
                nomeUrna = "Tarcísio de Freitas",
                nomeCompleto = "Tarcísio Gomes de Freitas",
                cargo = TseCargo.GOVERNADOR.codigo,
                partido = "REPUBLICANOS",
                coligacao = "São Paulo São Paulo",
                estadoUf = "SP",
                regiao = "Sudeste",
                digitosUrna = 2,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 1,
                reeleicao = true,
                propostasResumo = listOf(
                    "Trem Intercidades (TIC) e modernização de rodovias do interior",
                    "Expansão do ensino técnico (ETECs e FATECs) e escolas cívico-militares",
                    "Muralha Paulista: videomonitoramento e combate ao crime no estado"
                ),
                cidadesAtuacao = listOf("São Paulo", "Ribeirão Preto", "Campinas", "Brodowski", "Santos")
            ),
            Candidate(
                id = "cand_gov_sp_boulos",
                numero = "50",
                nomeUrna = "Guilherme Boulos",
                nomeCompleto = "Guilherme Castro Boulos",
                cargo = TseCargo.GOVERNADOR.codigo,
                partido = "PSOL",
                coligacao = "São Paulo da Esperança (PSOL / PT / REDE)",
                estadoUf = "SP",
                regiao = "Sudeste",
                digitosUrna = 2,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 1,
                reeleicao = false,
                propostasResumo = listOf(
                    "Programa estadual de moradia digna e urbanização",
                    "Tarifa zero progressiva nos trens e metrô",
                    "Valorização do salário dos professores e servidores da saúde pública"
                ),
                cidadesAtuacao = listOf("São Paulo", "Região Metropolitana", "Interior Paulista")
            ),
            Candidate(
                id = "cand_gov_sp_franca",
                numero = "40",
                nomeUrna = "Márcio França",
                nomeCompleto = "Márcio Luiz França Gomes",
                cargo = TseCargo.GOVERNADOR.codigo,
                partido = "PSB",
                coligacao = "Frente Paulista Popular",
                estadoUf = "SP",
                regiao = "Sudeste",
                digitosUrna = 2,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 3,
                reeleicao = false,
                propostasResumo = listOf(
                    "Crédito a juro zero para micro e pequenas empresas paulistas",
                    "Abertura de novos cursos profissionalizantes no interior",
                    "Pacto estadual de apoio aos municípios do interior"
                ),
                cidadesAtuacao = listOf("São Paulo", "Baixada Santista", "Interior Paulista")
            ),
            Candidate(
                id = "cand_gov_sp_nunes",
                numero = "15",
                nomeUrna = "Ricardo Nunes",
                nomeCompleto = "Ricardo Luís Reis Nunes",
                cargo = TseCargo.GOVERNADOR.codigo,
                partido = "MDB",
                coligacao = "Trabalho por São Paulo",
                estadoUf = "SP",
                regiao = "Sudeste",
                digitosUrna = 2,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 2,
                reeleicao = false,
                propostasResumo = listOf(
                    "Mutirões de saúde e zeramento de filas de exames especializados",
                    "Apoio logístico ao agronegócio e cadeias produtivas",
                    "Infraestrutura hídrica e prevenção a desastres climáticos"
                ),
                cidadesAtuacao = listOf("São Paulo", "Região Metropolitana", "Vale do Paraíba")
            ),

            // ==========================================
            // SENADORES POR SÃO PAULO (3 DÍGITOS - 2 VAGAS - SP)
            // ==========================================
            Candidate(
                id = "cand_sen_sp_eduardo",
                numero = "222",
                nomeUrna = "Eduardo Bolsonaro",
                nomeCompleto = "Eduardo Nantes Bolsonaro",
                cargo = TseCargo.SENADOR_PRIMEIRA_VAGA.codigo,
                partido = "PL",
                coligacao = "Aliança Paulista da Liberdade",
                estadoUf = "SP",
                regiao = "Sudeste",
                digitosUrna = 3,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 3,
                reeleicao = false,
                propostasResumo = listOf(
                    "Defesa das liberdades individuais e livre mercado no Senado",
                    "Endurecimento penal contra reincidentes e facções criminosas",
                    "Redução de impostos federais e defesa da propriedade privada"
                ),
                cidadesAtuacao = listOf("São Paulo", "Ribeirão Preto", "Campinas", "Interior")
            ),
            Candidate(
                id = "cand_sen_sp_padilha",
                numero = "131",
                nomeUrna = "Alexandre Padilha",
                nomeCompleto = "Alexandre Rocha Santos Padilha",
                cargo = TseCargo.SENADOR_PRIMEIRA_VAGA.codigo,
                partido = "PT",
                coligacao = "Federação Brasil da Esperança",
                estadoUf = "SP",
                regiao = "Sudeste",
                digitosUrna = 3,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 2,
                reeleicao = false,
                propostasResumo = listOf(
                    "Financiamento constitucional permanente e ampliação do SUS",
                    "Mais médicos especialistas para o interior de São Paulo",
                    "Apoio orçamentário à pesquisa nas universidades paulistas (USP, UNICAMP, UNESP)"
                ),
                cidadesAtuacao = listOf("São Paulo", "Ribeirão Preto", "Interior de SP")
            ),
            Candidate(
                id = "cand_sen_sp_skaf",
                numero = "100",
                nomeUrna = "Paulo Skaf",
                nomeCompleto = "Paulo Skaf",
                cargo = TseCargo.SENADOR_SEGUNDA_VAGA.codigo,
                partido = "REPUBLICANOS",
                coligacao = "São Paulo Forte",
                estadoUf = "SP",
                regiao = "Sudeste",
                digitosUrna = 3,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 0,
                reeleicao = false,
                propostasResumo = listOf(
                    "Defesa intransigente da indústria nacional e geração de empregos",
                    "Expansão do ensino técnico SESI/SENAI para jovens de todo o país",
                    "Redução do Custo Brasil e desoneração da folha de pagamento"
                ),
                cidadesAtuacao = listOf("São Paulo", "Ribeirão Preto", "Franca", "Brodowski", "Campinas")
            ),
            Candidate(
                id = "cand_sen_sp_marina",
                numero = "180",
                nomeUrna = "Marina Silva",
                nomeCompleto = "Maria Osmarina Marina Silva Vaz de Lima",
                cargo = TseCargo.SENADOR_SEGUNDA_VAGA.codigo,
                partido = "REDE",
                coligacao = "Federação REDE / PSOL",
                estadoUf = "SP",
                regiao = "Sudeste",
                digitosUrna = 3,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 3,
                reeleicao = false,
                propostasResumo = listOf(
                    "Pacto federativo pelo clima e preservação dos mananciais de SP",
                    "Economia circular e estímulo a créditos de carbono para produtores",
                    "Transição ecológica na matriz industrial paulista"
                ),
                cidadesAtuacao = listOf("São Paulo", "Vale do Paraíba", "Interior")
            ),

            // =========================================================================
            // DEPUTADO FEDERAL POR SÃO PAULO (4 DÍGITOS - SP / REGIÃO DE BRODOWSKI)
            // =========================================================================
            Candidate(
                id = "cand_dep_fed_sp_baleia",
                numero = "1515",
                nomeUrna = "Baleia Rossi",
                nomeCompleto = "Luiz Carlos Motta Rossi",
                cargo = TseCargo.DEPUTADO_FEDERAL.codigo,
                partido = "MDB",
                coligacao = null,
                estadoUf = "SP",
                regiao = "Sudeste",
                digitosUrna = 4,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 3,
                reeleicao = true,
                propostasResumo = listOf(
                    "Autor da Reforma Tributária (PEC 45) que simplifica impostos e impulsiona o país",
                    "Destinação contínua de recursos federais para a Santa Casa e postos de saúde de Brodowski e Ribeirão Preto",
                    "Apoio ao agronegócio regional, café, cana-de-açúcar e tecnologia no campo"
                ),
                cidadesAtuacao = listOf("Brodowski", "Ribeirão Preto", "Sertãozinho", "Batatais", "Franca", "São Paulo")
            ),
            Candidate(
                id = "cand_dep_fed_sp_ricardo_silva",
                numero = "5555",
                nomeUrna = "Ricardo Silva",
                nomeCompleto = "Ricardo Silva",
                cargo = TseCargo.DEPUTADO_FEDERAL.codigo,
                partido = "PSD",
                coligacao = null,
                estadoUf = "SP",
                regiao = "Sudeste",
                digitosUrna = 4,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 2,
                reeleicao = true,
                propostasResumo = listOf(
                    "Forte atuação na defesa do consumidor contra abusos tarifários e bancários",
                    "Verbas diretas para unidades básicas de saúde de Brodowski e região metropolitana",
                    "Fiscalização rigorosa de serviços públicos e direitos dos aposentados"
                ),
                cidadesAtuacao = listOf("Brodowski", "Ribeirão Preto", "Jardinópolis", "Cravinhos", "Serrana")
            ),
            Candidate(
                id = "cand_dep_fed_sp_arnaldo",
                numero = "2323",
                nomeUrna = "Arnaldo Jardim",
                nomeCompleto = "Arnaldo Calil Pereira Jardim",
                cargo = TseCargo.DEPUTADO_FEDERAL.codigo,
                partido = "CIDADANIA",
                coligacao = null,
                estadoUf = "SP",
                regiao = "Sudeste",
                digitosUrna = 4,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 4,
                reeleicao = true,
                propostasResumo = listOf(
                    "Marco legal dos biocombustíveis e bioenergia na região de Ribeirão Preto e Franca",
                    "Fortalecimento da infraestrutura de estradas vicinais para escoamento agrícola",
                    "Incentivo à geração de energia solar comunitária e sustentabilidade"
                ),
                cidadesAtuacao = listOf("Brodowski", "Ribeirão Preto", "Franca", "Barretos", "São Paulo")
            ),
            Candidate(
                id = "cand_dep_fed_sp_bruno_lima",
                numero = "1100",
                nomeUrna = "Delegado Bruno Lima",
                nomeCompleto = "Bruno Lima",
                cargo = TseCargo.DEPUTADO_FEDERAL.codigo,
                partido = "PP",
                coligacao = null,
                estadoUf = "SP",
                regiao = "Sudeste",
                digitosUrna = 4,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 1,
                reeleicao = true,
                propostasResumo = listOf(
                    "Endurecimento das leis penais contra maus-tratos aos animais",
                    "Criação de hospitais públicos veterinários em cidades do interior de SP",
                    "Fortalecimento da segurança pública preventiva nas cidades"
                ),
                cidadesAtuacao = listOf("São Paulo", "Ribeirão Preto", "Campinas", "Interior de SP")
            ),
            Candidate(
                id = "cand_dep_fed_sp_boulos",
                numero = "5010",
                nomeUrna = "Guilherme Boulos",
                nomeCompleto = "Guilherme Castro Boulos",
                cargo = TseCargo.DEPUTADO_FEDERAL.codigo,
                partido = "PSOL",
                coligacao = null,
                estadoUf = "SP",
                regiao = "Sudeste",
                digitosUrna = 4,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 1,
                reeleicao = false,
                propostasResumo = listOf(
                    "Defesa intransigente do salário mínimo acima da inflação",
                    "Criação do Fundo Nacional de Habitação Social para moradores de rua e periferias",
                    "Apoio a cozinhas comunitárias e combate à fome"
                ),
                cidadesAtuacao = listOf("São Paulo", "Região Metropolitana", "Interior")
            ),
            Candidate(
                id = "cand_dep_fed_sp_rosangela",
                numero = "4444",
                nomeUrna = "Rosângela Moro",
                nomeCompleto = "Rosângela Wolff de Quadros Moro",
                cargo = TseCargo.DEPUTADO_FEDERAL.codigo,
                partido = "UNIÃO",
                coligacao = null,
                estadoUf = "SP",
                regiao = "Sudeste",
                digitosUrna = 4,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 1,
                reeleicao = true,
                propostasResumo = listOf(
                    "Projetos de lei de proteção integral e direitos das pessoas com autismo e doenças raras",
                    "Transparência em gastos governamentais e combate à corrupção",
                    "Incentivo ao terceiro setor e instituições filantrópicas"
                ),
                cidadesAtuacao = listOf("São Paulo", "Interior de SP", "Região Metropolitana")
            ),

            // =========================================================================
            // DEPUTADO ESTADUAL POR SÃO PAULO (5 DÍGITOS - SP / REGIÃO DE BRODOWSKI)
            // =========================================================================
            Candidate(
                id = "cand_dep_est_sp_leo",
                numero = "15100",
                nomeUrna = "Léo Oliveira",
                nomeCompleto = "Léo Oliveira",
                cargo = TseCargo.DEPUTADO_ESTADUAL.codigo,
                partido = "MDB",
                coligacao = null,
                estadoUf = "SP",
                regiao = "Sudeste",
                digitosUrna = 5,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 2,
                reeleicao = true,
                propostasResumo = listOf(
                    "Histórico de emendas e verbas estaduais destinadas diretamente ao município de Brodowski",
                    "Melhorias contínuas na Rodovia Cândido Portinari (SP-334) ligando Brodowski a Ribeirão Preto e Batatais",
                    "Apoio à APAE, asilos e entidades assistenciais de Brodowski e região",
                    "Valorização do turismo cultural da Terra de Portinari em Brodowski"
                ),
                cidadesAtuacao = listOf("Brodowski", "Ribeirão Preto", "Batatais", "Altinópolis", "Sertãozinho", "Cravinhos")
            ),
            Candidate(
                id = "cand_dep_est_sp_rafael",
                numero = "55123",
                nomeUrna = "Rafael Silva",
                nomeCompleto = "Rafael Silva",
                cargo = TseCargo.DEPUTADO_ESTADUAL.codigo,
                partido = "PSD",
                coligacao = null,
                estadoUf = "SP",
                regiao = "Sudeste",
                digitosUrna = 5,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 6,
                reeleicao = true,
                propostasResumo = listOf(
                    "Pioneiro na defesa dos direitos das pessoas com deficiência e acessibilidade em SP",
                    "Fiscalização constante dos hospitais estaduais de Ribeirão Preto e cidades vizinhas",
                    "Luta contra abusos nos pedágios das rodovias do interior de São Paulo"
                ),
                cidadesAtuacao = listOf("Brodowski", "Ribeirão Preto", "Jardinópolis", "Serrana", "Santa Rita do Passa Quatro")
            ),
            Candidate(
                id = "cand_dep_est_sp_lucas_bove",
                numero = "22000",
                nomeUrna = "Lucas Bove",
                nomeCompleto = "Lucas Bove",
                cargo = TseCargo.DEPUTADO_ESTADUAL.codigo,
                partido = "PL",
                coligacao = null,
                estadoUf = "SP",
                regiao = "Sudeste",
                digitosUrna = 5,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 1,
                reeleicao = true,
                propostasResumo = listOf(
                    "Incentivo ao empreendedorismo jovem e desregulamentação de alvarás comerciais",
                    "Apoio às escolas cívico-militares no interior paulista",
                    "Fiscalização rígida dos recursos estaduais e combate a desperdícios"
                ),
                cidadesAtuacao = listOf("São Paulo", "Ribeirão Preto", "Campinas", "Interior de SP")
            ),
            Candidate(
                id = "cand_dep_est_sp_suplicy",
                numero = "13100",
                nomeUrna = "Eduardo Suplicy",
                nomeCompleto = "Eduardo Matarazzo Suplicy",
                cargo = TseCargo.DEPUTADO_ESTADUAL.codigo,
                partido = "PT",
                coligacao = null,
                estadoUf = "SP",
                regiao = "Sudeste",
                digitosUrna = 5,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 5,
                reeleicao = true,
                propostasResumo = listOf(
                    "Implementação da Renda Básica de Cidadania no Estado de São Paulo",
                    "Defesa dos direitos humanos e combate à pobreza extrema",
                    "Apoio a cooperativas e pequenos agricultores familiares"
                ),
                cidadesAtuacao = listOf("São Paulo", "Região Metropolitana", "Interior Paulista")
            ),
            Candidate(
                id = "cand_dep_est_sp_giannazi",
                numero = "50123",
                nomeUrna = "Carlos Giannazi",
                nomeCompleto = "Carlos Alberto Giannazi",
                cargo = TseCargo.DEPUTADO_ESTADUAL.codigo,
                partido = "PSOL",
                coligacao = null,
                estadoUf = "SP",
                regiao = "Sudeste",
                digitosUrna = 5,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 4,
                reeleicao = true,
                propostasResumo = listOf(
                    "Defesa intransigente do magistério e dos professores estaduais de SP",
                    "Revogação das taxas confiscatórias sobre aposentados e pensionistas do Estado",
                    "Proteção ao patrimônio público contra privatizações sem plebiscito"
                ),
                cidadesAtuacao = listOf("São Paulo", "Campinas", "Ribeirão Preto", "Interior")
            ),

            // ==========================================
            // GOVERNADORES DE OUTROS ESTADOS (COBERTURA NACIONAL)
            // ==========================================
            Candidate(
                id = "cand_gov_mg_mateus",
                numero = "30",
                nomeUrna = "Mateus Simões",
                nomeCompleto = "Mateus Simões de Almeida",
                cargo = TseCargo.GOVERNADOR.codigo,
                partido = "NOVO",
                coligacao = "Minas nos Trilhos",
                estadoUf = "MG",
                regiao = "Sudeste",
                digitosUrna = 2,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 1,
                reeleicao = false,
                propostasResumo = listOf(
                    "Continuidade da disciplina fiscal e atração de investimentos privados em MG",
                    "Recuperação da malha rodoviária mineira e concessões eficientes",
                    "Incentivo à geração solar no norte de Minas"
                ),
                cidadesAtuacao = listOf("Belo Horizonte", "Triângulo Mineiro", "Minas Gerais")
            ),
            Candidate(
                id = "cand_gov_ba_acm",
                numero = "44",
                nomeUrna = "ACM Neto",
                nomeCompleto = "Antônio Carlos Magalhães Neto",
                cargo = TseCargo.GOVERNADOR.codigo,
                partido = "UNIÃO",
                coligacao = "Muda Bahia",
                estadoUf = "BA",
                regiao = "Nordeste",
                digitosUrna = 2,
                fotoUrl = null,
                processosAdministrativos = 0,
                fichaLimpa = true,
                mandatosAnteriores = 2,
                reeleicao = false,
                propostasResumo = listOf(
                    "Recuperação dos índices educacionais e reforço escolar integral na Bahia",
                    "Combate incisivo às facções criminosas e reforço policial em todo o estado",
                    "Atração de indústrias automotivas e de energias renováveis"
                ),
                cidadesAtuacao = listOf("Salvador", "Feira de Santana", "Bahia")
            )
        )
    }
}
