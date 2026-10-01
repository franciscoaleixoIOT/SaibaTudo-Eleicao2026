package com.example.saibatudo_eleicao2026.core.constants

object AppConstants {
    const val APP_NAME = "SaibaTudo Eleição 2026"
    const val HF_MODEL_REPO_ID = "franciscoaleixo/SaibaTudo-Eleicao2026"
    const val ELECTION_YEAR = 2026

    // Dados oficiais TSE
    const val FONTE_DADOS = "Tribunal Superior Eleitoral - Dados Abertos (dadosabertos.tse.jus.br)"

    // Sistemas oficiais nacionais do TSE (os TREs integram suas consultas a estes sistemas
    // para as Eleições Gerais: Presidente, Governador, Senador, Deputado Federal e Estadual/Distrital)
    const val URL_DIVULGA_CAND_CONTAS = "https://divulgacandcontas.tse.jus.br/divulga/#/"
    const val URL_AUTOATENDIMENTO_ELEITOR = "https://autoatendimento.tse.jus.br/"
    const val URL_RESULTADOS_TSE = "https://resultados.tse.jus.br/"
    const val URL_DADOS_ABERTOS_TSE = "https://dadosabertos.tse.jus.br/"
    const val URL_PORTAL_TSE_2026 = "https://www.tse.jus.br/eleicoes/eleicoes-2026"

    /** Sistemas oficiais para consulta do eleitor (exibidos no app e usados pela IA). */
    val SISTEMAS_OFICIAIS_TSE = listOf(
        "DivulgaCandContas (candidaturas e contas)" to URL_DIVULGA_CAND_CONTAS,
        "Autoatendimento do Eleitor (título e local de votação)" to URL_AUTOATENDIMENTO_ELEITOR,
        "Resultados TSE (acompanhamento da apuração)" to URL_RESULTADOS_TSE,
        "Dados Abertos do TSE (bases oficiais)" to URL_DADOS_ABERTOS_TSE,
        "Portal Eleições 2026" to URL_PORTAL_TSE_2026
    )

    // Órgãos do Poder Legislativo (cobertura oficial das Eleições 2026)
    const val URL_SENADO_ELEICOES = "https://www12.senado.leg.br/noticias/temas/eleicoes"
    const val URL_CAMARA_ELEICOES = "https://www.camara.leg.br/tv/eleicoes-2026"
    const val URL_CONGRESSO_NACIONAL = "https://www.congressonacional.leg.br/"

    // Fiscalização e Ministério Público Eleitoral
    const val URL_MPF_PGR_ELEITORAL = "https://www.mpf.mp.br/pgr/eleitoral"
    const val URL_MPF_SERVICOS = "https://www.mpf.mp.br/mpfservicos"

    // Controle externo e Poder Executivo (Ficha Limpa e Condutas Vedadas)
    const val URL_TCU_CONTAS_IRREGULARES = "https://sites.tcu.gov.br/contas-julgadas-irregulares"
    const val URL_AGU_CONDUTAS_VEDADAS = "https://www.gov.br/agu/condutas-vedadas"
    const val URL_CGU_FALABR = "https://falabr.cgu.gov.br/"

    // Judiciário e Poder Executivo federal (regras eleitorais e combate a crimes eleitorais)
    const val URL_STF = "https://portal.stf.jus.br/"
    const val URL_MJSP = "https://www.gov.br/mj/pt-br"

    /** Órgãos oficiais de acompanhamento, legislação e fiscalização das Eleições 2026. */
    val ORGAOS_OFICIAIS_ELEICOES = listOf(
        "Senado Federal - Eleições 2026 (54 cadeiras, perfis e guias de votação)" to URL_SENADO_ELEICOES,
        "Câmara dos Deputados - TV Eleições 2026 (bancadas e quociente partidário)" to URL_CAMARA_ELEICOES,
        "Congresso Nacional - Legislação eleitoral consolidada" to URL_CONGRESSO_NACIONAL,
        "Ministério Público Eleitoral (PGR) - Fiscalização de abusos de poder" to URL_MPF_PGR_ELEITORAL,
        "MPF Serviços - Canal oficial de denúncias de irregularidades" to URL_MPF_SERVICOS,
        "TCU - Contas julgadas irregulares (lista enviada ao TSE p/ Ficha Limpa)" to URL_TCU_CONTAS_IRREGULARES,
        "AGU - Manual de condutas vedadas aos agentes públicos" to URL_AGU_CONDUTAS_VEDADAS,
        "CGU - Fala.BR (denúncias de uso da máquina pública)" to URL_CGU_FALABR,
        "STF - Julgamentos de ADIs sobre federações, fundo eleitoral e cláusula de barreira" to URL_STF,
        "Ministério da Justiça (MJSP) - Operações da Polícia Federal contra crimes eleitorais" to URL_MJSP
    )

    /** TRE estadual por UF (cada TRE integra suas consultas aos sistemas nacionais do TSE). */
    fun treUrl(uf: String): String = "https://tre-${uf.lowercase()}.jus.br/eleicoes"

    // Menu IDs
    const val MENU_PRESIDENTE = "menu_presidente"
    const val MENU_GOVERNADOR = "menu_governador"
    const val MENU_SENADOR = "menu_senador"
    const val MENU_DEPUTADO_FEDERAL = "menu_deputado_federal"
    const val MENU_DEPUTADO_ESTADUAL = "menu_deputado_estadual"
    const val MENU_CALENDARIO = "menu_calendario"
    const val MENU_PESQUISAS = "menu_pesquisas"
    const val MENU_LOCAIS_VOTACAO = "menu_locais_votacao"
    const val MENU_REGRAS_ELEITORAIS = "menu_regras_eleitorais"
}
