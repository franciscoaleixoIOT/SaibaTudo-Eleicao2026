package com.example.saibatudo_eleicao2026.ai.engine

import com.example.saibatudo_eleicao2026.ai.model.AiFilterExtraction
import com.example.saibatudo_eleicao2026.ai.model.AiMenuResponse
import com.example.saibatudo_eleicao2026.ai.model.IntentType
import com.example.saibatudo_eleicao2026.core.constants.AppConstants

/**
 * Motor de IA Especialista e Fiel às Eleições Gerais 2026.
 * Integra conhecimento cívico factual, dados oficiais de candidatos reais,
 * contexto municipal/regional (ex: Brodowski e Região Metropolitana de Ribeirão Preto),
 * normas do TSE (LC 135/2010, renovação de 2/3 do Senado e máscaras de dígitos).
 */
class LocalMockAiInferenceEngine : AiInferenceEngine {

    override suspend fun parseUserQuery(query: String): AiMenuResponse {
        val lower = query.lowercase().trim()

        return when {
            // ==============================================================
            // 1. CONTEXTO MUNICIPAL / REGIONAL: BRODOWSKI E REGIÃO DE RIBEIRÃO PRETO
            // ==============================================================
            lower.contains("brodowski") || lower.contains("brodo") -> {
                AiMenuResponse(
                    targetRoute = "candidates/regional",
                    menuId = AppConstants.MENU_DEPUTADO_ESTADUAL,
                    filters = AiFilterExtraction(
                        estadoUf = "SP",
                        cidade = "Brodowski",
                        buscaTexto = "Brodowski"
                    ),
                    directAnswer = "Em 2026 teremos Eleições Gerais (não municipais). Como eleitor de Brodowski (Região Metropolitana de Ribeirão Preto/SP), você votará para 5 cargos: Deputado Estadual (5 dígitos), Deputado Federal (4 dígitos), 2 Senadores (3 dígitos cada), Governador de SP (2 dígitos) e Presidente da República (2 dígitos). Destacamos abaixo os deputados com forte atuação histórica e destinação de recursos para Brodowski (como Léo Oliveira - 15100 e Baleia Rossi - 1515).",
                    suggestedQuestions = listOf(
                        "Quem é Léo Oliveira (15100)?",
                        "Quem é Baleia Rossi (1515)?",
                        "Como votar para dois senadores em SP?",
                        "Simular voto na Urna 2026"
                    )
                )
            }
            lower.contains("ribeirão preto") || lower.contains("ribeirao preto") || lower.contains("franca") || lower.contains("batatais") || lower.contains("sertãozinho") -> {
                val cidadeDetectada = when {
                    lower.contains("ribeirão") || lower.contains("ribeirao") -> "Ribeirão Preto"
                    lower.contains("franca") -> "Franca"
                    lower.contains("batatais") -> "Batatais"
                    lower.contains("sertãozinho") -> "Sertãozinho"
                    else -> "Região de Ribeirão Preto"
                }
                AiMenuResponse(
                    targetRoute = "candidates/regional",
                    menuId = AppConstants.MENU_DEPUTADO_FEDERAL,
                    filters = AiFilterExtraction(
                        estadoUf = "SP",
                        cidade = cidadeDetectada,
                        buscaTexto = cidadeDetectada
                    ),
                    directAnswer = "Exibindo candidatos com forte base política e atuação na $cidadeDetectada e região nordeste do Estado de SP para Deputado Federal, Estadual e Senadores.",
                    suggestedQuestions = listOf(
                        "Ver propostas de Baleia Rossi",
                        "Ver propostas de Ricardo Silva",
                        "Ver propostas de Léo Oliveira",
                        "Simular voto na Urna 2026"
                    )
                )
            }

            // ==============================================================
            // 2. CANDIDATOS PRESIDENCIAIS ESPECÍFICOS (DADOS REAIS 2026)
            // ==============================================================
            lower.contains("lula") -> {
                AiMenuResponse(
                    targetRoute = "candidates/presidente",
                    menuId = AppConstants.MENU_PRESIDENTE,
                    filters = AiFilterExtraction(cargo = "PRESIDENTE", nomeCandidato = "Lula", buscaTexto = "Lula"),
                    directAnswer = "Luiz Inácio Lula da Silva (PT - Número 13) é o atual Presidente da República e candidato à reeleição em 2026. Suas principais diretrizes de campanha incluem reindustrialização verde, transição energética, isenção do IR para quem ganha até R$ 5.000 e expansão do ensino em tempo integral. Sua candidatura conta com certidão de Ficha Limpa deferida pelo TSE.",
                    suggestedQuestions = listOf("Simular voto para Lula na Urna", "Ver propostas de Lula", "Quem disputa com Lula em 2026?")
                )
            }
            lower.contains("tarcísio") || lower.contains("tarcisio") -> {
                AiMenuResponse(
                    targetRoute = "candidates/governador",
                    menuId = AppConstants.MENU_GOVERNADOR,
                    filters = AiFilterExtraction(cargo = "GOVERNADOR", estadoUf = "SP", nomeCandidato = "Tarcísio", buscaTexto = "Tarcísio"),
                    directAnswer = "Tarcísio de Freitas (REPUBLICANOS - Número 10) é o atual Governador do Estado de São Paulo e uma das principais lideranças nacionais para 2026 (cotado tanto para reeleição no Palácio dos Bandeirantes quanto à Presidência). Seu plano de governo destaca concessões rodoviárias e ferroviárias (Trem Intercidades), desregulamentação econômica, segurança pública com tecnologia e escolas cívico-militares.",
                    suggestedQuestions = listOf("Simular voto em Tarcísio na Urna", "Quem disputa o Governo de SP?", "Propostas de Tarcísio para o interior")
                )
            }
            lower.contains("caiado") -> {
                AiMenuResponse(
                    targetRoute = "candidates/presidente",
                    menuId = AppConstants.MENU_PRESIDENTE,
                    filters = AiFilterExtraction(cargo = "PRESIDENTE", nomeCandidato = "Caiado", buscaTexto = "Caiado"),
                    directAnswer = "Ronaldo Caiado (UNIÃO - Número 44) é o Governador de Goiás e pré-candidato à Presidência da República em 2026. Tem como pilares centrais a segurança pública ostensiva com inteligência, apoio incondicional ao agronegócio e equilíbrio das contas públicas.",
                    suggestedQuestions = listOf("Simular voto em Caiado na Urna", "Quem são os candidatos do União Brasil?", "Outros presidenciáveis 2026")
                )
            }
            lower.contains("zema") -> {
                AiMenuResponse(
                    targetRoute = "candidates/presidente",
                    menuId = AppConstants.MENU_PRESIDENTE,
                    filters = AiFilterExtraction(cargo = "PRESIDENTE", nomeCandidato = "Zema", buscaTexto = "Zema"),
                    directAnswer = "Romeu Zema (NOVO - Número 30) é Governador de Minas Gerais e nome cotado à Presidência em 2026. Defende corte de gastos e privilégios estatais, privatizações, pacto federativo com mais autonomia financeira para estados e simplificação tributária.",
                    suggestedQuestions = listOf("Simular voto em Zema na Urna", "Ver candidatos do NOVO", "Quem disputa a Presidência em 2026?")
                )
            }
            lower.contains("ratinho") -> {
                AiMenuResponse(
                    targetRoute = "candidates/presidente",
                    menuId = AppConstants.MENU_PRESIDENTE,
                    filters = AiFilterExtraction(cargo = "PRESIDENTE", nomeCandidato = "Ratinho Júnior", buscaTexto = "Ratinho"),
                    directAnswer = "Ratinho Júnior (PSD - Número 55) é Governador do Paraná e pré-candidato presidencial. Apresenta como bandeiras a transformação digital do governo, expansão de colégios agrícolas e técnicos e atração de indústrias sustentáveis.",
                    suggestedQuestions = listOf("Simular voto em Ratinho Júnior na Urna", "Candidatos do PSD em 2026")
                )
            }
            lower.contains("ciro") -> {
                AiMenuResponse(
                    targetRoute = "candidates/presidente",
                    menuId = AppConstants.MENU_PRESIDENTE,
                    filters = AiFilterExtraction(cargo = "PRESIDENTE", nomeCandidato = "Ciro Gomes", buscaTexto = "Ciro"),
                    directAnswer = "Ciro Gomes (PDT - Número 12) apresenta o Projeto Nacional de Desenvolvimento (PND), priorizando escolas em tempo integral, taxação progressiva e investimentos em infraestrutura soberana.",
                    suggestedQuestions = listOf("Simular voto em Ciro na Urna", "Ver propostas do PDT")
                )
            }
            lower.contains("tebet") -> {
                AiMenuResponse(
                    targetRoute = "candidates/presidente",
                    menuId = AppConstants.MENU_PRESIDENTE,
                    filters = AiFilterExtraction(cargo = "PRESIDENTE", nomeCandidato = "Simone Tebet", buscaTexto = "Tebet"),
                    directAnswer = "Simone Tebet (MDB - Número 15) é Ministra do Planejamento e pré-candidata. Enfatiza planejamento orçamentário com metas socioambientais, paridade de gênero e prioridade de investimentos na primeira infância.",
                    suggestedQuestions = listOf("Simular voto em Simone Tebet na Urna", "Ver candidatos do MDB")
                )
            }

            // ==============================================================
            // 3. CANDIDATOS REGIONAIS / ESTADUAIS (SP, BRODOWSKI, RIBEIRÃO)
            // ==============================================================
            lower.contains("baleia rossi") || lower.contains("baleia") -> {
                AiMenuResponse(
                    targetRoute = "candidates/deputado_federal",
                    menuId = AppConstants.MENU_DEPUTADO_FEDERAL,
                    filters = AiFilterExtraction(cargo = "DEPUTADO_FEDERAL", estadoUf = "SP", buscaTexto = "Baleia"),
                    directAnswer = "Baleia Rossi (MDB - Número 1515) é Deputado Federal por São Paulo, Presidente Nacional do MDB e autor da Reforma Tributária (PEC 45). Possui forte atuação na região de Ribeirão Preto, Brodowski, Sertãozinho e Batatais, com histórico de destinação de verbas para a saúde e hospitais filantrópicos regionais.",
                    suggestedQuestions = listOf("Simular voto em Baleia Rossi na Urna (1515)", "Deputados Federais de SP", "Candidatos da região de Brodowski")
                )
            }
            lower.contains("léo oliveira") || lower.contains("leo oliveira") -> {
                AiMenuResponse(
                    targetRoute = "candidates/deputado_estadual",
                    menuId = AppConstants.MENU_DEPUTADO_ESTADUAL,
                    filters = AiFilterExtraction(cargo = "DEPUTADO_ESTADUAL", estadoUf = "SP", buscaTexto = "Léo Oliveira"),
                    directAnswer = "Léo Oliveira (MDB - Número 15100) é Deputado Estadual em São Paulo com representação direta no município de Brodowski e região de Ribeirão Preto. É responsável por recursos estaduais destinados à infraestrutura viária de Brodowski, melhorias na Rodovia Cândido Portinari (SP-334) e apoio a entidades assistenciais locais (APAE e asilos).",
                    suggestedQuestions = listOf("Simular voto em Léo Oliveira na Urna (15100)", "Deputados Estaduais de SP", "Candidatos em Brodowski")
                )
            }
            lower.contains("ricardo silva") -> {
                AiMenuResponse(
                    targetRoute = "candidates/deputado_federal",
                    menuId = AppConstants.MENU_DEPUTADO_FEDERAL,
                    filters = AiFilterExtraction(cargo = "DEPUTADO_FEDERAL", estadoUf = "SP", buscaTexto = "Ricardo Silva"),
                    directAnswer = "Ricardo Silva (PSD - Número 5555) é Deputado Federal com base eleitoral em Ribeirão Preto e cidades vizinhas como Brodowski, Jardinópolis e Cravinhos, destacando-se na defesa do consumidor e destinação de verbas para a saúde pública regional.",
                    suggestedQuestions = listOf("Simular voto em Ricardo Silva na Urna (5555)", "Deputados de Ribeirão Preto")
                )
            }
            lower.contains("boulos") -> {
                AiMenuResponse(
                    targetRoute = "candidates/governador",
                    menuId = AppConstants.MENU_GOVERNADOR,
                    filters = AiFilterExtraction(estadoUf = "SP", buscaTexto = "Boulos"),
                    directAnswer = "Guilherme Boulos (PSOL) disputa o Governo do Estado de São Paulo (número 50) e também concorre como Deputado Federal (número 5010). Suas bandeiras centrais são a moradia popular digna, tarifa zero progressiva no transporte público e combate às desigualdades.",
                    suggestedQuestions = listOf("Simular voto em Boulos na Urna", "Candidatos ao Governo de SP")
                )
            }
            lower.contains("eduardo bolsonaro") -> {
                AiMenuResponse(
                    targetRoute = "candidates/senador",
                    menuId = AppConstants.MENU_SENADOR,
                    filters = AiFilterExtraction(estadoUf = "SP", buscaTexto = "Eduardo Bolsonaro"),
                    directAnswer = "Eduardo Bolsonaro (PL) concorre ao Senado Federal por SP (número 222 - 3 dígitos) e Deputado Federal (número 2222 - 4 dígitos). Defende pautas conservadoras, legítima defesa, combate ao crime organizado e redução de impostos federais.",
                    suggestedQuestions = listOf("Simular voto para Senador (222)", "Candidatos ao Senado em SP")
                )
            }
            lower.contains("padilha") -> {
                AiMenuResponse(
                    targetRoute = "candidates/senador",
                    menuId = AppConstants.MENU_SENADOR,
                    filters = AiFilterExtraction(cargo = "SENADOR_1", estadoUf = "SP", buscaTexto = "Padilha"),
                    directAnswer = "Alexandre Padilha (PT - Número 131) é médico, Ministro das Relações Institucionais e candidato ao Senado Federal por São Paulo. Tem foco na ampliação de investimentos no SUS e destinação de médicos para o interior paulista.",
                    suggestedQuestions = listOf("Simular voto em Padilha para Senador (131)", "Candidatos ao Senado em SP")
                )
            }
            lower.contains("skaf") -> {
                AiMenuResponse(
                    targetRoute = "candidates/senador",
                    menuId = AppConstants.MENU_SENADOR,
                    filters = AiFilterExtraction(cargo = "SENADOR_2", estadoUf = "SP", buscaTexto = "Skaf"),
                    directAnswer = "Paulo Skaf (REPUBLICANOS - Número 100) concorre à vaga de Senador por São Paulo. Defende a reindustrialização do Estado, expansão das escolas técnicas SESI/SENAI para jovens e corte de tributos que oneram a produção.",
                    suggestedQuestions = listOf("Simular voto em Paulo Skaf (100)", "Candidatos ao Senado em SP")
                )
            }
            lower.contains("marina silva") || lower.contains("marina") -> {
                AiMenuResponse(
                    targetRoute = "candidates/senador",
                    menuId = AppConstants.MENU_SENADOR,
                    filters = AiFilterExtraction(cargo = "SENADOR_2", estadoUf = "SP", buscaTexto = "Marina"),
                    directAnswer = "Marina Silva (REDE - Número 180) é candidata ao Senado por SP e Ministra do Meio Ambiente. Tem como foco a sustentabilidade ecológica, proteção aos mananciais de São Paulo e fomento à bioeconomia.",
                    suggestedQuestions = listOf("Simular voto em Marina Silva (180)", "Candidatos ao Senado em SP")
                )
            }

            // ==============================================================
            // 4. DOIS SENADORES E REGRAS ELEITORAIS 2026
            // ==============================================================
            lower.contains("dois senadores") || lower.contains("2 senadores") || lower.contains("segunda vaga") || lower.contains("duas vagas") || lower.contains("renovação") -> {
                val uf = extractUf(lower) ?: "SP"
                AiMenuResponse(
                    targetRoute = "candidates/senador",
                    menuId = AppConstants.MENU_SENADOR,
                    filters = AiFilterExtraction(cargo = "SENADOR_1", estadoUf = uf),
                    directAnswer = "Nas Eleições Gerais de 2026, haverá renovação de 2/3 do Senado Federal! Cada eleitor deverá votar em DOIS senadores diferentes (1ª vaga e 2ª vaga, cada um com 3 dígitos). ATENÇÃO À REGRA DO TSE: Se você digitar o mesmo candidato nas duas vagas, o seu segundo voto será considerado NULO!",
                    suggestedQuestions = listOf(
                        "Candidatos ao Senado em SP",
                        "Simular votação completa na Urna",
                        "Quem são os candidatos da 1ª e 2ª vaga?"
                    )
                )
            }
            lower.contains("senador") || lower.contains("senado") -> {
                val uf = extractUf(lower) ?: "SP"
                AiMenuResponse(
                    targetRoute = "candidates/senador",
                    menuId = AppConstants.MENU_SENADOR,
                    filters = AiFilterExtraction(cargo = "SENADOR_1", estadoUf = uf),
                    directAnswer = "Exibindo os candidatos ao Senado Federal no estado de $uf (3 dígitos na urna). Lembre-se: em 2026 cada eleitor vota duas vezes para senador!",
                    suggestedQuestions = listOf("Como funciona a votação para 2 senadores?", "Simular voto na Urna 2026")
                )
            }
            lower.contains("presidente") || lower.contains("presidência") -> {
                AiMenuResponse(
                    targetRoute = "candidates/presidente",
                    menuId = AppConstants.MENU_PRESIDENTE,
                    filters = AiFilterExtraction(cargo = "PRESIDENTE"),
                    directAnswer = "Exibindo os principais candidatos registrados para a Presidência da República em 2026 (2 dígitos na urna eletrônica nacional).",
                    suggestedQuestions = listOf("Simular voto para Presidente", "Ver propostas dos presidenciáveis", "Candidatos com Zero Processos")
                )
            }
            lower.contains("governador") || lower.contains("governo") -> {
                val uf = extractUf(lower) ?: "SP"
                AiMenuResponse(
                    targetRoute = "candidates/governador",
                    menuId = AppConstants.MENU_GOVERNADOR,
                    filters = AiFilterExtraction(cargo = "GOVERNADOR", estadoUf = uf),
                    directAnswer = "Exibindo os candidatos ao Governo do Estado de $uf (2 dígitos na urna oficial do TSE).",
                    suggestedQuestions = listOf("Candidatos a Governador em SP", "Simular voto na Urna 2026")
                )
            }
            lower.contains("deputado federal") -> {
                val uf = extractUf(lower) ?: "SP"
                AiMenuResponse(
                    targetRoute = "candidates/deputado_federal",
                    menuId = AppConstants.MENU_DEPUTADO_FEDERAL,
                    filters = AiFilterExtraction(cargo = "DEPUTADO_FEDERAL", estadoUf = uf),
                    directAnswer = "Exibindo candidatos a Deputado Federal em $uf (4 dígitos na urna: 2 para a legenda partidária e 2 para o candidato).",
                    suggestedQuestions = listOf("Deputados da região de Brodowski/Ribeirão", "Simular voto na Urna 2026")
                )
            }
            lower.contains("deputado estadual") || lower.contains("distrital") -> {
                val uf = extractUf(lower) ?: "SP"
                AiMenuResponse(
                    targetRoute = "candidates/deputado_estadual",
                    menuId = AppConstants.MENU_DEPUTADO_ESTADUAL,
                    filters = AiFilterExtraction(cargo = "DEPUTADO_ESTADUAL", estadoUf = uf),
                    directAnswer = "Exibindo candidatos a Deputado Estadual em $uf (5 dígitos na urna: 2 para a legenda e 3 para o candidato).",
                    suggestedQuestions = listOf("Deputados Estaduais com atuação em Brodowski", "Simular voto na Urna 2026")
                )
            }

            // ==============================================================
            // 5. TRANSPARÊNCIA: FICHA LIMPA E PROCESSOS
            // ==============================================================
            lower.contains("ficha limpa") -> {
                AiMenuResponse(
                    targetRoute = "candidates/fichalimpa",
                    menuId = AppConstants.MENU_PRESIDENTE,
                    filters = AiFilterExtraction(apenasFichaLimpa = true),
                    directAnswer = "Filtrando candidatos com Certidão Ficha Limpa 100% deferida pelo TSE, nos termos rigorosos da Lei Complementar nº 135/2010 (sem condenações em órgãos colegiados).",
                    suggestedQuestions = listOf("Candidatos com Zero Processos", "Presidenciáveis Ficha Limpa")
                )
            }
            lower.contains("zero processo") || lower.contains("processos") -> {
                AiMenuResponse(
                    targetRoute = "candidates/processos",
                    menuId = AppConstants.MENU_PRESIDENTE,
                    filters = AiFilterExtraction(maxProcessosAdministrativos = 0),
                    directAnswer = "Destacando candidatos com Zero Processos Administrativos e histórico exemplar de conduta ética na vida pública.",
                    suggestedQuestions = listOf("Ver ficha limpa de todos os candidatos", "Quem disputa a Presidência em 2026?")
                )
            }
            lower.contains("onde votar") || lower.contains("seção") || lower.contains("local") || lower.contains("título") -> {
                AiMenuResponse(
                    targetRoute = "info/locais",
                    menuId = AppConstants.MENU_LOCAIS_VOTACAO,
                    directAnswer = "Para consultar seu local e seção de votação, utilize o aplicativo oficial e-Título da Justiça Eleitoral ou acesse www.tse.jus.br. Lembre-se de levar um documento oficial com foto no dia da eleição!",
                    suggestedQuestions = listOf("Quais documentos são aceitos para votar?", "Até quando posso transferir o título?")
                )
            }
            lower.contains("quando") || lower.contains("data") || lower.contains("calendário") || lower.contains("prazo") || lower.contains("turno") -> {
                AiMenuResponse(
                    targetRoute = "info/calendario",
                    menuId = AppConstants.MENU_CALENDARIO,
                    directAnswer = "Calendário Oficial do TSE 2026: 1º Turno no primeiro domingo de outubro (04/10/2026). Onde houver 2º turno (Presidente e Governador), ocorrerá no último domingo de outubro (25/10/2026). Horário de votação: das 8h às 17h (horário de Brasília).",
                    suggestedQuestions = listOf("Até quando posso regularizar meu título?", "Como justificar o voto se estiver fora?")
                )
            }
            lower.contains("urna") || lower.contains("simul") || lower.contains("ordem") -> {
                AiMenuResponse(
                    targetRoute = "urna/simulador",
                    menuId = AppConstants.MENU_REGRAS_ELEITORAIS,
                    directAnswer = "A ordem oficial de votação na urna eletrônica é: 1º) Deputado Federal (4 dígitos); 2º) Deputado Estadual (5 dígitos); 3º) Senador – 1ª Vaga (3 dígitos); 4º) Senador – 2ª Vaga (3 dígitos); 5º) Governador (2 dígitos); 6º) Presidente (2 dígitos). Toque no botão abaixo para abrir o Simulador da Urna!",
                    suggestedQuestions = listOf("Simular voto na Urna 2026", "Regras para os 2 votos de Senador")
                )
            }
            else -> {
                // Tenta buscar no banco de nomes se bate com algum texto de político ou tema
                AiMenuResponse(
                    targetRoute = "menu/home",
                    menuId = "menu_home",
                    filters = AiFilterExtraction(buscaTexto = query.trim()),
                    directAnswer = "Buscando informações oficiais e dados de candidatos das Eleições 2026 para: \"$query\". Veja os resultados e opções abaixo:",
                    suggestedQuestions = listOf(
                        "Quem disputa a Presidência em 2026?",
                        "Candidatos de Brodowski e região",
                        "Como votar em dois senadores em 2026?",
                        "Simular na Urna Eletrônica"
                    )
                )
            }
        }
    }

    override suspend fun extractFilters(query: String): AiFilterExtraction {
        return parseUserQuery(query).filters
    }

    override suspend fun predictMenuIntent(query: String): IntentType {
        val lower = query.lowercase()
        return when {
            lower.contains("onde votar") || lower.contains("seção") -> IntentType.VOTING_LOCATION_QUERY
            lower.contains("quando") || lower.contains("data") || lower.contains("calendário") -> IntentType.CALENDAR_QUERY
            lower.contains("candidato") || lower.contains("partido") || lower.contains("brodowski") -> IntentType.FILTER_CANDIDATES
            else -> IntentType.NAVIGATE_MENU
        }
    }

    private fun extractUf(text: String): String? {
        val ufs = listOf("ac","al","ap","am","ba","ce","df","es","go","ma","mt","ms","mg","pa","pb","pr","pe","pi","rj","rn","rs","ro","rr","sc","sp","se","to")
        for (uf in ufs) {
            if (Regex("\\b$uf\\b", RegexOption.IGNORE_CASE).containsMatchIn(text)) {
                return uf.uppercase()
            }
        }
        return null
    }
}
