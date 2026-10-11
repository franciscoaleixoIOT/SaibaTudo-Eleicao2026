package net.saibatudo.eleicoes2026.core.constants

import net.saibatudo.eleicoes2026.BuildConfig

object AppConstants {
    const val APP_NAME = "SaibaTudo Eleições 2026"
    const val ELECTION_YEAR = 2026

    /** Pergunta inicial neutra exibida na barra de busca. */
    const val PERGUNTA_INICIAL_PADRAO = "O que você deseja consultar sobre as Eleições 2026?"

    // Dados oficiais TSE
    const val FONTE_DADOS = "Tribunal Superior Eleitoral - Dados Abertos (dadosabertos.tse.jus.br)"
    const val LICENCA_DADOS = "Creative Commons Atribuição (CC BY)"

    // Sistemas oficiais nacionais do TSE
    const val URL_DIVULGA_CAND_CONTAS = "https://divulgacandcontas.tse.jus.br/divulga/#/"
    const val URL_AUTOATENDIMENTO_ELEITOR = "https://autoatendimento.tse.jus.br/"
    const val URL_RESULTADOS_TSE = "https://resultados.tse.jus.br/"
    const val URL_DADOS_ABERTOS_TSE = "https://dadosabertos.tse.jus.br/"
    const val URL_PORTAL_TSE_2026 = "https://www.tse.jus.br/eleicoes/eleicoes-2026"
    const val URL_CALENDARIO_TSE = "https://www.tse.jus.br/eleicoes/calendario-eleitoral"

    /** Canal público de correções e feedback (código aberto). */
    val URL_ISSUES = BuildConfig.SOURCE_URL + "/issues"
    val URL_PRIVACIDADE = BuildConfig.PRIVACY_URL
    val URL_CODIGO_FONTE = BuildConfig.SOURCE_URL

    /** Aviso de neutralidade exibido no app. */
    const val AVISO_NEUTRALIDADE =
        "Aplicativo independente, de código aberto e apartidário. Não tem vínculo com o TSE, com o governo " +
            "ou com partidos. Não recomenda candidatos."

    /** Sistemas oficiais para consulta do eleitor. */
    val SISTEMAS_OFICIAIS_TSE = listOf(
        "DivulgaCandContas (candidaturas e contas)" to URL_DIVULGA_CAND_CONTAS,
        "Autoatendimento do Eleitor (título e local de votação)" to URL_AUTOATENDIMENTO_ELEITOR,
        "Resultados TSE (acompanhamento da apuração)" to URL_RESULTADOS_TSE,
        "Dados Abertos do TSE (bases oficiais)" to URL_DADOS_ABERTOS_TSE,
        "Portal Eleições 2026" to URL_PORTAL_TSE_2026
    )

    /** TRE estadual por UF. */
    fun treUrl(uf: String): String = "https://tre-${uf.lowercase()}.jus.br/eleicoes"

    // Menu IDs
    const val MENU_PRESIDENTE = "menu_presidente"
    const val MENU_GOVERNADOR = "menu_governador"
    const val MENU_SENADOR = "menu_senador"
    const val MENU_DEPUTADO_FEDERAL = "menu_deputado_federal"
    const val MENU_DEPUTADO_ESTADUAL = "menu_deputado_estadual"
    const val MENU_CALENDARIO = "menu_calendario"
    const val MENU_PESQUISAS = "menu_pesquisas"
    const val MENU_RESULTADOS = "menu_resultados"
    const val MENU_LOCAIS_VOTACAO = "menu_locais_votacao"
    const val MENU_REGRAS_ELEITORAIS = "menu_regras_eleitorais"
    const val MENU_HOME = "menu_home"
}
