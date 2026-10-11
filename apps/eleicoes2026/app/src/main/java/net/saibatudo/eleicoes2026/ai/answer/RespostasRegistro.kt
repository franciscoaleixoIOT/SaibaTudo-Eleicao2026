package net.saibatudo.eleicoes2026.ai.answer

import net.saibatudo.eleicoes2026.ai.model.AiFilterExtraction
import net.saibatudo.eleicoes2026.ai.model.AiMenuResponse
import net.saibatudo.eleicoes2026.ai.model.Intent
import net.saibatudo.eleicoes2026.ai.model.ParsedQuery
import net.saibatudo.eleicoes2026.ai.nlu.ModeloCargo
import net.saibatudo.eleicoes2026.core.constants.AppConstants
import net.saibatudo.eleicoes2026.domain.model.Candidate
import net.saibatudo.eleicoes2026.domain.model.FichaLimpa
import net.saibatudo.eleicoes2026.domain.model.Texto
import net.saibatudo.eleicoes2026.domain.model.Ufs
import net.saibatudo.eleicoes2026.domain.model.tituloCargo

// Situação do registro (Ficha Limpa), plano de governo, contas de campanha e patrimônio.
// Funções de extensão de [AnswerBuilder] (estado e helpers são `internal` na classe); o despacho por intenção fica em AnswerBuilder.kt.

// ------------------------------------------------------------------ Ficha Limpa, plano, contas, patrimônio

internal fun AnswerBuilder.elegibilidade(p: ParsedQuery): AiMenuResponse {
    if (p.nome != null || p.numero != null) {
        val achados = localizar(p)
        val c = escolher(achados, p.nome)
        if (c != null) {
            val texto = buildString {
                append("${c.nomeUrna} (${c.cargo}${localDe(c)}, nº ${c.numero}) — Ficha Limpa e situação do registro no TSE")
                append("\nFicha Limpa: ${c.fichaLimpaTexto}")
                append("\nSituação no TSE: ${c.elegibilidade.rotulo} — ${if (c.naUrna) "inserida na urna" else "NÃO está inserida na urna"}")
                append("\nO que significa: ${c.fichaLimpa.explicacao}")
                if (c.motivosIndeferimento.isNotEmpty()) append("\nMotivos registrados: ${c.motivosIndeferimento.joinToString("; ")}")
                append("\nAtenção: derivado da situação oficial do registro; não é certidão e pode caber recurso. " +
                    "As certidões criminais do candidato estão no DivulgaCandContas (${AppConstants.URL_DIVULGA_CAND_CONTAS}).")
            }
            return AiMenuResponse(
                targetRoute = rotaCargo(c.cargoCodigo), menuId = menuCargo(c.cargoCodigo), intent = p.intent,
                filters = AiFilterExtraction(buscaTexto = c.nomeUrna, resetar = true),
                directAnswer = texto, candidateIds = listOf(c.id),
                suggestedQuestions = listOf("Quem é ${c.nomeUrna}?", "Ficha Limpa dos candidatos a ${tituloCargo(c.cargoCodigo)}${c.estadoUf.takeIf { it != "BR" }?.let { " em $it" } ?: ""}"),
                fonte = fonte, origem = origem
            )
        }
        if (achados.size > 1) return ambiguo(p, achados)
    }
    // Visão geral no escopo pedido (cargo/UF/partido/gênero)
    val escopo = data.candidatos.filter { c ->
        (p.cargo == null || c.cargoCodigo == p.cargo) && (p.uf == null || c.estadoUf == p.uf) &&
            (p.partido == null || c.partido.equals(p.partido, true)) && (p.genero == null || c.genero.equals(p.genero, true))
    }
    val porStatus = escopo.groupingBy { it.fichaLimpa }.eachCount()
    val titulo = montarTitulo(p.cargo, p.copy(historico = null)).let { if (it == "em todos os cargos") "todas as candidaturas" else "candidaturas $it" }
    val negativos = escopo.filter { it.elegibilidade.indeferida }
        .sortedWith(compareBy({ ModeloCargo.ordem(it.cargoCodigo) }, { it.estadoUf }, { it.numero.toIntOrNull() ?: Int.MAX_VALUE }))
    val texto = buildString {
        append("Ficha Limpa — $titulo (situação oficial do registro no TSE):")
        append("\n• Sem impedimento reconhecido (registro deferido): ${n(porStatus[FichaLimpa.SEM_IMPEDIMENTO] ?: 0)}")
        listOf(
            FichaLimpa.INELEGIVEL_FICHA_LIMPA to "Inelegibilidade reconhecida (LC 64/90 / Ficha Limpa)",
            FichaLimpa.INELEGIVEL_CONSTITUCIONAL to "Inelegibilidade constitucional",
            FichaLimpa.INDEFERIDA_OUTRO_MOTIVO to "Registro indeferido por outros motivos",
            FichaLimpa.INDEFERIDA_SEM_MOTIVO to "Registro indeferido (motivo não detalhado)",
            FichaLimpa.AGUARDANDO to "Aguardando julgamento",
            FichaLimpa.FORA_DA_DISPUTA to "Fora da disputa (renúncia, cancelamento etc.)"
        ).forEach { (st, rot) -> porStatus[st]?.takeIf { it > 0 }?.let { append("\n• $rot: ${n(it)}") } }
        if (p.apenasIndeferidas == true) {
            if (negativos.isEmpty()) append("\nNenhum registro indeferido neste recorte.")
            else if (negativos.size <= 20) {
                append("\nRegistros indeferidos:")
                negativos.forEach { c ->
                    append("\n• ${c.numero} — ${c.nomeUrna} (${c.partido})${if (p.uf == null && c.estadoUf != "BR") " · ${c.estadoUf}" else ""}: ${c.fichaLimpa.curto}")
                    c.motivosIndeferimento.firstOrNull()?.let { m -> append(" — $m") }
                }
            } else {
                append("\nOs ${n(negativos.size)} registros indeferidos estão nos cartões abaixo. Motivos mais frequentes:")
                negativos.flatMap { it.motivosIndeferimento }.groupingBy { it }.eachCount().entries
                    .sortedByDescending { it.value }.take(5).forEach { append("\n• ${it.key}: ${n(it.value)}") }
            }
        }
        append("\nComo funciona: a Lei da Ficha Limpa (LC 135/2010) é aplicada pela Justiça Eleitoral no julgamento do registro de cada candidatura. " +
            "\"Sem impedimento\" significa registro deferido; ainda pode caber recurso. O app NÃO emite certidão: mostra a situação oficial e os motivos registrados.")
        if (Regex("""o que (e|eh|significa|quer dizer)|significad|como funciona|explica""").containsMatchIn(Texto.normalizar(p.textoOriginal))) {
            append("\nO que significa cada situação:")
            append("\n• Deferido: registro aprovado pela Justiça Eleitoral.")
            append("\n• Deferido com recurso: aprovado, mas ainda há recurso pendente ou prazo para recorrer.")
            append("\n• Indeferido: registro negado. Com recurso pendente, o candidato pode continuar na urna (sub judice) até a decisão final (Lei 9.504/1997, art. 16-A).")
            append("\n• Renúncia, cancelamento ou falecimento: candidatura fora da disputa.")
        }
    }
    val filtros = AiFilterExtraction(
        cargo = p.cargo, estadoUf = p.uf, partido = p.partido, resetar = true,
        apenasDeferidas = if (p.apenasIndeferidas == true) null else true,
        apenasIndeferidas = if (p.apenasIndeferidas == true) true else null
    )
    return AiMenuResponse(
        targetRoute = rotaCargo(p.cargo), menuId = menuCargo(p.cargo), submenuId = p.uf?.let { "sub_${it.lowercase()}" },
        intent = p.intent, filters = filtros, directAnswer = texto,
        candidateIds = if (p.apenasIndeferidas == true) negativos.take(12).map { it.id } else emptyList(),
        suggestedQuestions = listOf(
            "Candidatos inelegíveis${p.cargo?.let { " a ${tituloCargo(it)}" } ?: ""}${(p.uf ?: ufPadrao)?.let { " em $it" } ?: ""}",
            "Quem disputa a Presidência?"
        ),
        fonte = fonte, origem = origem
    )
}

internal fun AnswerBuilder.planoGoverno(p: ParsedQuery): AiMenuResponse {
    val achados = localizar(p)
    val c = escolher(achados, p.nome)
    if (c == null && achados.size > 1) return ambiguo(p, achados)
    val texto = if (c != null) buildString {
        append("${c.nomeUrna} (${c.cargo}${localDe(c)}, nº ${c.numero}) — plano de governo")
        if (c.temPlanoGoverno) {
            append("\nPlano de governo: registrado no TSE")
            if (c.temasPlano.isNotEmpty()) {
                append("\nTemas mais citados (detecção automática por palavras-chave):")
                c.temasPlano.forEach { append("\n• ${regras.temas[it] ?: it}") }
            }
            append("\nO documento completo, com as propostas, está no DivulgaCandContas (${AppConstants.URL_DIVULGA_CAND_CONTAS}).")
        } else {
            append("\nNão há plano de governo registrado nos dados do TSE para esta candidatura. O plano é exigido de candidatos a Presidente e a Governador (Lei 9.504/1997, art. 11, §1º, IX).")
        }
    } else "Planos de governo registrados no TSE:\n" +
        "• Exigidos de candidatos a Presidente e a Governador (Lei 9.504/1997, art. 11, §1º, IX)\n" +
        "• ${n(regras.estatisticas.candidatosComPlanoGoverno)} candidaturas com plano registrado\n" +
        "Pergunte, por exemplo, \"Plano de governo de Fulano\" ou \"Candidatos a governador que citam saúde no plano\"."
    return AiMenuResponse(
        targetRoute = rotaCargo(c?.cargoCodigo), menuId = menuCargo(c?.cargoCodigo), intent = Intent.PLANO_GOVERNO,
        filters = c?.let { AiFilterExtraction(buscaTexto = it.nomeUrna, resetar = true) } ?: AiFilterExtraction(),
        directAnswer = texto, candidateIds = listOfNotNull(c?.id),
        suggestedQuestions = listOf("Candidatos a Governador em ${ufPadrao ?: "SP"} que citam saúde no plano", "Quem disputa a Presidência?"),
        fonte = fonte, origem = origem
    )
}

internal fun AnswerBuilder.contasCampanha(p: ParsedQuery): AiMenuResponse {
    val achados = localizar(p)
    val c = escolher(achados, p.nome)
    if (c == null && achados.size > 1) return ambiguo(p, achados)
    val texto = if (c != null) buildString {
        append("${c.nomeUrna} (${c.cargo}${localDe(c)}, nº ${c.numero}) — prestação de contas da campanha")
        val k = c.contas
        if (k == null || (k.receitas == 0.0 && k.despesasContratadas == 0.0)) {
            append("\nAinda não há valores de prestação de contas publicados pelo TSE para esta candidatura.")
        } else {
            append("\nReceitas declaradas: ${moeda.format(k.receitas)}")
            append("\nDespesas contratadas: ${moeda.format(k.despesasContratadas)}")
            append("\nTipo de prestação: ${k.tipo?.lowercase() ?: "parcial"}${k.geradoEm?.let { " (gerado pelo TSE em $it)" } ?: ""}")
            append("\nValores podem mudar até a prestação final. Doadores, fornecedores e documentos: DivulgaCandContas (${AppConstants.URL_DIVULGA_CAND_CONTAS}).")
        }
    } else "Prestação de contas das campanhas (TSE):\n" +
        "• O app mostra receitas e despesas contratadas declaradas por candidatura (prestação parcial até a final)\n" +
        "• Doadores, fornecedores e documentos: DivulgaCandContas (${AppConstants.URL_DIVULGA_CAND_CONTAS})\n" +
        "Pergunte pelo nome ou número, por exemplo: \"Quanto Fulano gastou na campanha?\""
    return AiMenuResponse(
        targetRoute = rotaCargo(c?.cargoCodigo), menuId = menuCargo(c?.cargoCodigo), intent = Intent.CONTAS_CAMPANHA,
        filters = c?.let { AiFilterExtraction(buscaTexto = it.nomeUrna, resetar = true) } ?: AiFilterExtraction(),
        directAnswer = texto, candidateIds = listOfNotNull(c?.id),
        suggestedQuestions = listOfNotNull(c?.let { "Patrimônio de ${it.nomeUrna}" }, "Quem disputa a Presidência?"),
        fonte = fonte, origem = origem
    )
}

internal fun AnswerBuilder.patrimonio(p: ParsedQuery): AiMenuResponse {
    val achados = localizar(p)
    val c = escolher(achados, p.nome)
    if (c != null) {
        val v = c.patrimonioDeclarado
        val texto = "${c.nomeUrna} (${c.cargo}${localDe(c)}, nº ${c.numero}) — bens declarados ao TSE\n" + when {
            v != null -> "Patrimônio declarado: ${moeda.format(v)} (${c.qtdBens ?: "?"} bens)\nValor informado pelo próprio candidato no registro de candidatura."
            c.declaraBens == false -> "O candidato informou não possuir bens a declarar."
            else -> "Não há bens declarados disponíveis nos dados do TSE para esta candidatura."
        }
        return AiMenuResponse(
            targetRoute = rotaCargo(c.cargoCodigo), menuId = menuCargo(c.cargoCodigo), intent = p.intent,
            filters = AiFilterExtraction(buscaTexto = c.nomeUrna, resetar = true),
            directAnswer = texto, candidateIds = listOf(c.id),
            suggestedQuestions = listOf("Quanto ${c.nomeUrna} gastou na campanha?", "${c.nomeUrna} é ficha limpa?"),
            fonte = fonte, origem = origem
        )
    }
    if (achados.size > 1) return ambiguo(p, achados)

    // Consulta de bens/patrimônio sem nome de candidato (ex.: "dos governadores quem tem o maior valor de bens declarado")
    val cargo = p.cargo
    val noEscopo: (net.saibatudo.eleicoes2026.domain.model.Candidate) -> Boolean = { cand ->
        (cargo == null || cand.cargoCodigo == cargo) &&
            (p.uf == null || cand.estadoUf == p.uf) &&
            cand.naUrna &&
            (cand.patrimonioDeclarado ?: 0.0) > 0.0
    }
    val comBens = data.candidatos.filter(noEscopo)

    if (comBens.isNotEmpty()) {
        val ordenados = comBens.sortedByDescending { it.patrimonioDeclarado ?: 0.0 }
        val top = ordenados.first()
        val outros = ordenados.drop(1).take(4)
        val tituloEscopo = if (cargo != null) {
            "${tituloCargo(cargo)}${if (p.uf != null) " ${Ufs.em(p.uf)}" else ""}"
        } else {
            if (p.uf != null) "no ${p.uf}" else "nas eleições 2026"
        }

        val texto = buildString {
            append("Patrimônio declarado ao TSE — $tituloEscopo:")
            append("\nO maior valor declarado é de ${top.nomeUrna} (${top.partido}${if (top.estadoUf != "BR") "/${top.estadoUf}" else ""}): ${moeda.format(top.patrimonioDeclarado)} (${top.cargo}, nº ${top.numero}).")
            if (outros.isNotEmpty()) {
                append("\n\nOutros maiores valores declarados no cargo:")
                outros.forEach { o ->
                    append("\n• ${o.numero} — ${o.nomeUrna} (${o.partido}${if (o.estadoUf != "BR") "/${o.estadoUf}" else ""}): ${moeda.format(o.patrimonioDeclarado)}")
                }
            }
            append("\n\nValores oficiais informados pelos próprios candidatos à Justiça Eleitoral no registro de candidatura.")
            append("\nPergunte pelo nome (ex.: \"Qual o patrimônio declarado de Fulano?\") para ver os dados individuais.")
        }
        return AiMenuResponse(
            targetRoute = rotaCargo(cargo), menuId = menuCargo(cargo), intent = p.intent,
            filters = AiFilterExtraction(cargo = cargo, estadoUf = p.uf, resetar = true),
            directAnswer = texto,
            candidateIds = ordenados.take(10).map { it.id },
            suggestedQuestions = listOf(
                if (cargo != null) "Candidatos a ${tituloCargo(cargo)}" else "Quem disputa a Presidência?",
                "Quanto ${top.nomeUrna} gastou na campanha?"
            ),
            fonte = fonte, origem = origem
        )
    }

    return AiMenuResponse(
        targetRoute = "candidates/todos", menuId = AppConstants.MENU_HOME, intent = p.intent,
        directAnswer = "Patrimônio declarado ao TSE:\n" +
            "• É o total de bens que cada candidato informou no registro de candidatura\n" +
            "• Divulgado oficialmente pelo TSE no DivulgaCandContas\n" +
            "Pergunte pelo nome (ex.: \"Qual o patrimônio declarado de Fulano?\") ou por cargo (ex.: \"Patrimônio dos governadores\").",
        suggestedQuestions = listOf("Quem disputa a Presidência?"), fonte = fonte, origem = origem
    )
}
