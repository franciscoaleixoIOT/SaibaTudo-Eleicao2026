package net.saibatudo.eleicoes2026.ai.answer

import net.saibatudo.eleicoes2026.ai.model.AiFilterExtraction
import net.saibatudo.eleicoes2026.ai.model.AiMenuResponse
import net.saibatudo.eleicoes2026.ai.model.Intent
import net.saibatudo.eleicoes2026.ai.model.OrigemResposta
import net.saibatudo.eleicoes2026.ai.model.ParsedQuery
import net.saibatudo.eleicoes2026.core.constants.AppConstants
import net.saibatudo.eleicoes2026.domain.model.Texto

// Simulador, ajuda, recusa de recomendação e pergunta desconhecida.
// Funções de extensão de [AnswerBuilder] (estado e helpers são `internal` na classe); o despacho por intenção fica em AnswerBuilder.kt.

// ------------------------------------------------------------------ simulador, ajuda, recomendação, desconhecida

internal fun AnswerBuilder.simulador(p: ParsedQuery): AiMenuResponse {
    val c = if (p.nome != null || p.numero != null) escolher(localizar(p), p.nome) else null
    val etapas = regras.ordemVotacaoUrna.sortedBy { it.ordem }.joinToString(" → ") { "${it.cargo} (${it.digitos})" }
    return AiMenuResponse(
        targetRoute = "urna/simulador", menuId = AppConstants.MENU_HOME, intent = Intent.SIMULADOR, abrirSimulador = true,
        directAnswer = "Abrindo o simulador educativo da urna${c?.let { " com ${it.nomeUrna} (${it.numero})" } ?: ""}.\n" +
            "Ordem na urna: $etapas\n" +
            "O simulador não é a urna oficial e não registra votos.",
        candidateIds = listOfNotNull(c?.id),
        suggestedQuestions = listOf("Ordem de votação na urna", "Regra dos dois senadores"), fonte = fonte, origem = origem
    )
}

internal fun AnswerBuilder.ajuda(p: ParsedQuery): AiMenuResponse {
    val agradecimento = Regex("""obrigad|valeu|vlw|brigad""").containsMatchIn(Texto.normalizar(p.textoOriginal))
    val uf = ufPadrao ?: "SP"
    val texto = (if (agradecimento) "De nada! Quando quiser, é só perguntar.\n" else "Olá! Sou o assistente do SaibaTudo Eleições 2026 e respondo só com dados oficiais do TSE.\n") +
        "Você pode perguntar, por exemplo:\n" +
        "• \"Candidatos a governador em $uf\"\n" +
        "• \"Quem é o 13?\" ou \"Quem é Tarcísio?\"\n" +
        "• \"Lula é ficha limpa?\"\n" +
        "• \"Patrimônio do Haddad\" · \"Plano de governo do Lula\"\n" +
        "• \"Quando é a eleição?\" · \"Voto nulo anula a eleição?\"\n" +
        "• \"Simular voto na urna\"\n" +
        "Não recomendo nem comparo candidatos: a decisão do voto é sua."
    return AiMenuResponse(
        targetRoute = "menu/home", menuId = AppConstants.MENU_HOME, intent = Intent.AJUDA, directAnswer = texto,
        suggestedQuestions = listOf("Quem disputa a Presidência?", "Candidatos a Governador em $uf", "Simular voto na urna"),
        fonte = fonte, origem = origem
    )
}

internal fun AnswerBuilder.recomendacao() = AiMenuResponse(
    targetRoute = "menu/home", menuId = AppConstants.MENU_HOME, intent = Intent.RECOMENDACAO, origem = OrigemResposta.AVISO,
    directAnswer = "Não indico, recomendo, comparo nem prevejo candidatos: a decisão do voto é sua.\n" +
        "Com dados oficiais do TSE, posso mostrar:\n" +
        "• quem disputa cada cargo e o número na urna\n" +
        "• perfil, Ficha Limpa e situação da candidatura\n" +
        "• bens declarados, contas de campanha e plano de governo registrado\n" +
        "• pesquisas registradas e resultados oficiais",
    suggestedQuestions = listOf("Quem disputa a Presidência?", "Candidatos a Governador em ${ufPadrao ?: "SP"}", "Pesquisas registradas"),
    fonte = fonte
)

internal fun AnswerBuilder.desconhecida(p: ParsedQuery) = AiMenuResponse(
    targetRoute = "menu/home", menuId = AppConstants.MENU_HOME, intent = Intent.DESCONHECIDA, resolvida = false, origem = origem,
    filters = AiFilterExtraction(buscaTexto = p.textoOriginal.takeIf { it.length in 3..60 }, resetar = true),
    directAnswer = "Não entendi bem a pergunta.\n" +
        "Experimente citar um cargo, um estado, um partido, o nome ou o número de um candidato:\n" +
        "• \"Candidatos a governador em ${ufPadrao ?: "SP"}\"\n" +
        "• \"Quem é o 13?\"\n" +
        "• \"Lula é ficha limpa?\"\n" +
        "Há ${n(regras.estatisticas.totalNaUrna)} candidaturas na urna nos dados oficiais do TSE.",
    suggestedQuestions = listOf("Quem disputa a Presidência?", "Candidatos a Governador em ${ufPadrao ?: "SP"}", "Quantos candidatos foram registrados?", "Calendário eleitoral 2026"),
    fonte = fonte
)
