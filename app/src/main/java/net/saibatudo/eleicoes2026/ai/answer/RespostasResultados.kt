package net.saibatudo.eleicoes2026.ai.answer

import net.saibatudo.eleicoes2026.ai.model.AiFilterExtraction
import net.saibatudo.eleicoes2026.ai.model.AiMenuResponse
import net.saibatudo.eleicoes2026.ai.model.Intent
import net.saibatudo.eleicoes2026.ai.model.ParsedQuery
import net.saibatudo.eleicoes2026.core.constants.AppConstants
import net.saibatudo.eleicoes2026.domain.model.ApuracaoCargo
import net.saibatudo.eleicoes2026.domain.model.FaseEleitoral
import net.saibatudo.eleicoes2026.domain.model.LinhaApuracao
import net.saibatudo.eleicoes2026.domain.model.Texto
import net.saibatudo.eleicoes2026.domain.model.Ufs
import net.saibatudo.eleicoes2026.domain.model.tituloCargo

// Resultados (apuração ao vivo e CSV oficiais) e segundo turno.
// Funções de extensão de [AnswerBuilder] (estado e helpers são `internal` na classe); o despacho por intenção fica em AnswerBuilder.kt.

// ------------------------------------------------------------------ resultados

internal suspend fun AnswerBuilder.resultados(p: ParsedQuery): AiMenuResponse {
    val cargo = p.cargo
    val abrir = AiFilterExtraction(cargo = cargo, estadoUf = p.uf, resetar = true)
    if (!fase.mostraResultados) {
        return AiMenuResponse(
            targetRoute = "info/resultados", menuId = AppConstants.MENU_RESULTADOS, intent = p.intent, filters = abrir,
            directAnswer = "A votação ainda não ocorreu.\n" +
                "1º turno: ${dataBr(regras.turno1)}, das 8h às 17h (Brasília)\n" +
                "Os resultados oficiais são divulgados pelo TSE em ${AppConstants.URL_RESULTADOS_TSE} e aparecerão aqui durante a apuração.",
            suggestedQuestions = listOf("Calendário eleitoral 2026", "Quem disputa a Presidência?"), fonte = fonte, origem = origem
        )
    }
    val cargosValidos = setOf("PRESIDENTE", "GOVERNADOR", "SENADOR", "DEPUTADO_FEDERAL", "DEPUTADO_ESTADUAL", "DEPUTADO_DISTRITAL")
    if (cargo == null || cargo !in cargosValidos) {
        return AiMenuResponse(
            targetRoute = "info/resultados", menuId = AppConstants.MENU_RESULTADOS, intent = p.intent, filters = abrir,
            abrirResultados = true,
            directAnswer = "De qual cargo você quer ver os resultados?\n" +
                "• Presidente, Governador, Senador, Deputado Federal e Deputado Estadual/Distrital\n" +
                "• Para cargos estaduais, informe também o estado (ex.: \"Resultado para Deputado Federal em SP\")",
            suggestedQuestions = listOf("Resultado para Presidente", "Resultado para Governador em ${ufPadrao ?: "SP"}", "Resultado para Deputado Federal em ${ufPadrao ?: "SP"}"),
            fonte = fonte, origem = origem
        )
    }
    var cargoConsulta = cargo
    val uf = if (cargo == "PRESIDENTE") "BR" else (p.uf ?: ufPadrao)
    if (uf == "DF" && cargoConsulta == "DEPUTADO_ESTADUAL") {
        cargoConsulta = "DEPUTADO_DISTRITAL"
    }
    if (uf == null) {
        return AiMenuResponse(
            targetRoute = "info/resultados", menuId = AppConstants.MENU_RESULTADOS, intent = p.intent, filters = abrir,
            directAnswer = "De qual estado? Informe a UF (ex.: \"Resultado para ${tituloCargo(cargoConsulta)} em SP\").",
            suggestedQuestions = listOf("Resultado para ${tituloCargo(cargoConsulta)} em SP"), fonte = fonte, origem = origem
        )
    }
    val ehLegislativo = cargoConsulta in setOf("SENADOR", "DEPUTADO_FEDERAL", "DEPUTADO_ESTADUAL", "DEPUTADO_DISTRITAL")
    val turno = if (ehLegislativo) 1 else (p.turno ?: if (fase == FaseEleitoral.ENTRE_TURNOS || fase == FaseEleitoral.DIA_2T || fase == FaseEleitoral.POS_ELEICAO) 2 else 1)
    val ap = obterApuracao(cargoConsulta, uf, turno) ?: (if (turno == 2) obterApuracao(cargoConsulta, uf, 1) else null)
    return if (ap != null && ap.temVotos) respostaApuracao(p, ap, abrir)
    else respostaResultadosCsv(p, cargoConsulta, uf, turno, abrir)
}

internal suspend fun AnswerBuilder.obterApuracao(cargo: String, uf: String, turno: Int): ApuracaoCargo? =
    try { apuracao?.obter(cargo, uf, turno) } catch (_: Exception) { null }

internal fun AnswerBuilder.respostaApuracao(p: ParsedQuery, ap: ApuracaoCargo, filtros: AiFilterExtraction): AiMenuResponse {
    val ordenadas = ap.linhas.sortedByDescending { it.votos }
    val eleitos = ordenadas.filter { it.eleito }
    val ehProporcional = ap.cargo in setOf("DEPUTADO_FEDERAL", "DEPUTADO_ESTADUAL", "DEPUTADO_DISTRITAL")
    val max = if (ap.cargo == "PRESIDENTE" || ap.linhas.size <= 12) ordenadas.size else if (ehProporcional) 15 else 10
    val andamento = if (ap.totalizacaoFinal) "Totalização final." else
        "Apuração em andamento" + (ap.secoesTotalizadasPct?.let { " (${it}% das seções totalizadas)" } ?: "") + "."
    val texto = buildString {
        append("${tituloCargo(ap.cargo)}${if (ap.uf != "BR") " — ${ap.uf}" else ""}, ${ap.turno}º turno. $andamento")
        if (ehProporcional && eleitos.isNotEmpty()) {
            append("\n\nDeputados eleitos (${eleitos.size}):")
            eleitos.forEach {
                append("\n• ${it.numero} — ${it.nome} (${it.partido}): ${inteiro.format(it.votos)} votos — ELEITO")
            }
            append("\n\nMais votados na apuração geral:")
        }
        ordenadas.take(max).forEach {
            append("\n• ${it.numero} — ${it.nome} (${it.partido}): ${inteiro.format(it.votos)} votos")
            it.percentual?.let { pc -> append(" ($pc%)") }
            if (it.eleito && (!ehProporcional || eleitos.isEmpty())) append(" — ELEITO")
            else if (it.segundoTurno) append(" — 2º TURNO")
        }
        if (ordenadas.size > max) append("\n…e outros ${ordenadas.size - max}.")
        append("\nDados divulgados pelo TSE em ${ap.geradoEm}; números exibidos como publicados (${AppConstants.URL_RESULTADOS_TSE}).")
    }
    return AiMenuResponse(
        targetRoute = "info/resultados", menuId = AppConstants.MENU_RESULTADOS, intent = p.intent, filters = filtros,
        directAnswer = texto, abrirResultados = true, candidateIds = ordenadas.take(10).mapNotNull { it.sqCandidato }
            .filter { data.porId.containsKey(it) },
        suggestedQuestions = listOf("Resultado para Governador em ${ap.uf.takeIf { it != "BR" } ?: ufPadrao ?: "SP"}", "Resultado para Presidente"),
        fonte = "Fonte: TSE – resultados.tse.jus.br (ao vivo), consultado agora.", origem = origem
    )
}

internal fun AnswerBuilder.respostaResultadosCsv(p: ParsedQuery, cargo: String, uf: String, turno: Int, filtros: AiFilterExtraction): AiMenuResponse {
    val daqui = data.candidatos.filter { it.cargoCodigo == cargo && it.estadoUf == uf && it.resultado != null }
    val eleitos = daqui.filter { it.resultado?.eleito == true }
    val onde = if (uf != "BR") " ${Ufs.em(uf)}" else ""
    val texto = when {
        eleitos.isNotEmpty() -> "Eleito${if (eleitos.size > 1) "s" else ""} para ${tituloCargo(cargo)}$onde segundo o TSE:" +
            eleitos.joinToString("") { "\n• ${it.numero} — ${it.nomeUrna} (${it.partido})" }
        daqui.isNotEmpty() -> "O TSE já publicou a situação de totalização, mas ainda não há eleito definido para ${tituloCargo(cargo)}$onde:" +
            daqui.filter { it.resultado?.situacaoTotalizacao != null }.take(6).joinToString("") { "\n• ${it.nomeUrna}: ${it.resultado?.situacaoTotalizacao}" }
        else -> "Ainda não há resultado oficial publicado para ${tituloCargo(cargo)}$onde (${turno}º turno).\n" +
            "A apuração do TSE é divulgada em ${AppConstants.URL_RESULTADOS_TSE}; assim que estiver disponível, aparece aqui."
    }
    return AiMenuResponse(
        targetRoute = "info/resultados", menuId = AppConstants.MENU_RESULTADOS, intent = p.intent, filters = filtros,
        abrirResultados = true, directAnswer = texto, candidateIds = eleitos.take(6).map { it.id },
        suggestedQuestions = listOf("Calendário eleitoral 2026", "Quem disputa a Presidência?"), fonte = fonte, origem = origem
    )
}

internal suspend fun AnswerBuilder.segundoTurno(p: ParsedQuery): AiMenuResponse {
    val cargo = p.cargo
    val textoNorm = Texto.normalizar(p.textoOriginal)
    val ehLegislativo = (cargo != null && listOf("SENADOR", "DEPUTADO_FEDERAL", "DEPUTADO_ESTADUAL", "DEPUTADO_DISTRITAL").contains(cargo)) ||
        Regex("""\b(senad\w*|deputad\w*)\b""").containsMatchIn(textoNorm)

    val dataTurno1 = dataBr(regras.turno1)
    val dataTurno2 = dataBr(regras.turno2)

    // 1. Cargo legislativo: não tem segundo turno
    if (ehLegislativo) {
        val nomeCargo = if (cargo != null) tituloCargo(cargo) else if (textoNorm.contains("senad")) "Senador" else "Deputado"
        return AiMenuResponse(
            targetRoute = "info/calendario", menuId = AppConstants.MENU_CALENDARIO, intent = Intent.SEGUNDO_TURNO,
            directAnswer = "Não há 2º turno para $nomeCargo.\n" +
                "• A eleição para o Poder Legislativo (Senadores e Deputados) é decidida em turno único no 1º turno ($dataTurno1)\n" +
                "• O 2º turno existe apenas para cargos do Poder Executivo: Presidente da República e Governador de Estado/DF quando nenhum candidato alcança mais de 50% dos votos válidos",
            suggestedQuestions = listOfNotNull("Segundo turno para Presidente", ufPadrao?.let { "Segundo turno para Governador em $it" } ?: "Segundo turno para Governador", "Calendário eleitoral 2026"),
            fonte = fonte, origem = origem
        )
    }

    // 2. Cargo do Executivo especificado (Presidente ou Governador)
    if (cargo == "PRESIDENTE" || cargo == "GOVERNADOR") {
        val uf = if (cargo == "PRESIDENTE") "BR" else (p.uf ?: ufPadrao)
        val onde = if (uf != null && uf != "BR") " ${Ufs.em(uf)}" else ""
        val rotuloCargo = if (cargo == "PRESIDENTE") "Presidente da República" else "Governador$onde"

        val ap = obterApuracao(cargo, uf ?: "BR", 1)
        val daqui = data.candidatos.filter { it.cargoCodigo == cargo && it.estadoUf == (uf ?: "BR") && it.resultado != null }
        val eleitos = daqui.filter { it.resultado?.eleitoNoPrimeiroTurno == true }

        if (ap != null && ap.temVotos) {
            val lt = leituraSegundoTurno(ap)
            val l1 = lt.l1
            val l2 = lt.l2

            if (l1 != null && lt.tipo == TipoSegundoTurno.ELEITO) {
                return AiMenuResponse(
                    targetRoute = "info/resultados", menuId = AppConstants.MENU_RESULTADOS, intent = Intent.SEGUNDO_TURNO, abrirResultados = true,
                    directAnswer = "Não haverá 2º turno para $rotuloCargo.\n" +
                        "• ${l1.nome} (${l1.partido}) foi eleito(a) em 1º turno com ${l1.percentual}% dos votos válidos (${inteiro.format(l1.votos)} votos)\n" +
                        (if (lt.maioria) "• Como obteve a maioria absoluta dos votos válidos (mais de 50%), a eleição foi liquidada em turno único"
                        else "• Situação informada pela apuração oficial do TSE"),
                    candidateIds = listOfNotNull(l1.sqCandidato).filter { data.porId.containsKey(it) },
                    suggestedQuestions = listOf("Quem foi eleito Governador?", "Resultado para Senador"), fonte = fonte, origem = origem
                )
            }

            if (l1 != null && l2 != null && lt.tipo == TipoSegundoTurno.SEGUNDO) {
                return AiMenuResponse(
                    targetRoute = "info/resultados", menuId = AppConstants.MENU_RESULTADOS, intent = Intent.SEGUNDO_TURNO, abrirResultados = true,
                    directAnswer = "Sim, haverá 2º turno para $rotuloCargo.\n" +
                        "• Nenhum candidato alcançou mais de 50% dos votos válidos no 1º turno\n" +
                        "• Disputam o 2º turno os dois candidatos mais votados:\n" +
                        "  1º: ${l1.nome} (${l1.partido}) — ${l1.percentual}% (${inteiro.format(l1.votos)} votos)\n" +
                        "  2º: ${l2.nome} (${l2.partido}) — ${l2.percentual}% (${inteiro.format(l2.votos)} votos)\n" +
                        "• Votação do 2º turno: $dataTurno2, das 8h às 17h (horário de Brasília)",
                    candidateIds = listOfNotNull(l1.sqCandidato, l2.sqCandidato).filter { data.porId.containsKey(it) },
                    suggestedQuestions = listOf("Pesquisas para ${tituloCargo(cargo)}", "Calendário eleitoral 2026"), fonte = fonte, origem = origem
                )
            }

            if (l1 != null && l2 != null && lt.tipo == TipoSegundoTurno.ANDAMENTO) {
                return AiMenuResponse(
                    targetRoute = "info/resultados", menuId = AppConstants.MENU_RESULTADOS, intent = Intent.SEGUNDO_TURNO, abrirResultados = true,
                    directAnswer = "Definição de 2º turno para $rotuloCargo em andamento (${ap.secoesTotalizadasPct ?: "0"}% apurado):\n" +
                        "• Até o momento, nenhum candidato atingiu mais de 50% dos votos válidos\n" +
                        "• Liderança parcial:\n" +
                        "  1º: ${l1.nome} (${l1.partido}) — ${l1.percentual}%\n" +
                        "  2º: ${l2.nome} (${l2.partido}) — ${l2.percentual}%\n" +
                        "• Se a apuração terminar sem que o primeiro alcance mais de 50%, haverá 2º turno em $dataTurno2",
                    candidateIds = listOfNotNull(l1.sqCandidato, l2.sqCandidato).filter { data.porId.containsKey(it) },
                    suggestedQuestions = listOf("Resultado para ${tituloCargo(cargo)}", "Calendário eleitoral 2026"), fonte = fonte, origem = origem
                )
            }
        }

        if (eleitos.isNotEmpty()) {
            val el = eleitos.first()
            return AiMenuResponse(
                targetRoute = "info/resultados", menuId = AppConstants.MENU_RESULTADOS, intent = Intent.SEGUNDO_TURNO, abrirResultados = true,
                directAnswer = "Não haverá 2º turno para $rotuloCargo.\n" +
                    "• ${el.nomeUrna} (${el.partido}) foi eleito(a) em 1º turno segundo os dados oficiais do TSE\n" +
                    "• A eleição está definida sem necessidade de 2º turno",
                candidateIds = listOf(el.id),
                suggestedQuestions = listOf("Quem foi eleito Governador?", "Resultado para Senador"), fonte = fonte, origem = origem
            )
        }

        // Sem apuração ao vivo: o PACOTE (CSV oficial do TSE) pode trazer os classificados com a situação "2º TURNO"
        val classificados = daqui.filter { it.resultado?.segundoTurno == true }.sortedByDescending { it.resultado?.turnos?.get(1)?.votos ?: 0L }
        if (classificados.size >= 2) {
            fun linha(c: net.saibatudo.eleicoes2026.domain.model.Candidate): String {
                val t1 = c.resultado?.turnos?.get(1)
                val numeros = t1?.votos?.let { v -> " — ${t1?.percentual?.let { pc -> "${String.format(java.util.Locale.forLanguageTag("pt-BR"), "%.2f", pc)}% " } ?: ""}(${inteiro.format(v)} votos)" } ?: ""
                return "${c.nomeUrna} (${c.partido})$numeros"
            }
            return AiMenuResponse(
                targetRoute = "info/resultados", menuId = AppConstants.MENU_RESULTADOS, intent = Intent.SEGUNDO_TURNO, abrirResultados = true,
                directAnswer = "Sim, haverá 2º turno para $rotuloCargo.\n" +
                    "• Nenhum candidato alcançou mais de 50% dos votos válidos no 1º turno\n" +
                    "• Disputam o 2º turno, segundo a totalização oficial do TSE:\n" +
                    "  1º: ${linha(classificados[0])}\n" +
                    "  2º: ${linha(classificados[1])}\n" +
                    "• Votação do 2º turno: $dataTurno2, das 8h às 17h (horário de Brasília)",
                candidateIds = classificados.take(2).map { it.id },
                suggestedQuestions = listOf("Pesquisas para ${tituloCargo(cargo)}", "Calendário eleitoral 2026"), fonte = fonte, origem = origem
            )
        }

        // O 1º turno já passou e nem a apuração ao vivo nem o pacote definem: não repete "depende da apuração" como se ela não tivesse ocorrido
        if (fase in setOf(FaseEleitoral.ENTRE_TURNOS, FaseEleitoral.DIA_2T, FaseEleitoral.POS_ELEICAO)) {
            return AiMenuResponse(
                targetRoute = "info/resultados", menuId = AppConstants.MENU_RESULTADOS, intent = Intent.SEGUNDO_TURNO, abrirResultados = true,
                directAnswer = "Segundo turno para $rotuloCargo:\n" +
                    "• O 1º turno foi em $dataTurno1, mas não foi possível consultar agora a apuração oficial do TSE para confirmar o resultado\n" +
                    "• Há 2º turno quando nenhum candidato obtém mais de 50% dos votos válidos; se houver, a votação é em $dataTurno2\n" +
                    "• Confira em ${AppConstants.URL_RESULTADOS_TSE} ou tente de novo em instantes",
                suggestedQuestions = listOf("Resultado para ${tituloCargo(cargo)}${if (cargo == "GOVERNADOR" && uf != null) " em $uf" else ""}", "Calendário eleitoral 2026"),
                fonte = fonte, origem = origem
            )
        }

        return AiMenuResponse(
            targetRoute = "info/calendario", menuId = AppConstants.MENU_CALENDARIO, intent = Intent.SEGUNDO_TURNO,
            directAnswer = "Segundo turno para $rotuloCargo:\n" +
                "• A realização de 2º turno depende da apuração do 1º turno ($dataTurno1)\n" +
                "• Só haverá 2º turno se nenhum candidato obtiver a maioria absoluta (mais de 50% dos votos válidos, desconsiderando brancos e nulos)\n" +
                "• Se houver 2º turno, a votação será no dia $dataTurno2, entre os dois candidatos mais votados",
            suggestedQuestions = listOfNotNull(
                if (cargo == "PRESIDENTE") "Quem disputa a Presidência?" else "Candidatos a Governador$onde",
                "Calendário eleitoral 2026"
            ),
            fonte = fonte, origem = origem
        )
    }

    // 3. Pergunta genérica (sem cargo): overview completo para a localização do usuário
    val jaVotou = fase in setOf(FaseEleitoral.ENTRE_TURNOS, FaseEleitoral.DIA_2T, FaseEleitoral.POS_ELEICAO)
    val uf = p.uf ?: ufPadrao
    var statusPresidente: String? = null
    var statusGov: String? = null

    val apPres = obterApuracao("PRESIDENTE", "BR", 1)
    if (apPres != null && apPres.temVotos) {
        val lt = leituraSegundoTurno(apPres)
        val l1 = lt.l1
        val l2 = lt.l2
        if (l1 != null && lt.tipo == TipoSegundoTurno.ELEITO) {
            statusPresidente = "Não haverá 2º turno — ${l1.nome} (${l1.partido}) foi eleito(a) em 1º turno (${l1.percentual}%)"
        } else if (l1 != null && l2 != null && lt.tipo == TipoSegundoTurno.SEGUNDO) {
            statusPresidente = "Sim, haverá 2º turno entre ${l1.nome} (${l1.percentual}%) e ${l2.nome} (${l2.percentual}%)"
        } else if (l1 != null && l2 != null && lt.tipo == TipoSegundoTurno.ANDAMENTO) {
            statusPresidente = "Apuração em andamento (${apPres.secoesTotalizadasPct ?: "0"}%) — liderança de ${l1.nome} (${l1.percentual}%) e ${l2.nome} (${l2.percentual}%)"
        }
    }
    if (statusPresidente == null) statusPresidente = statusSegundoTurnoPacote("PRESIDENTE", "BR")
    if (statusPresidente == null) {
        statusPresidente = if (jaVotou) "não foi possível consultar agora a apuração oficial do 1º turno ($dataTurno1); confira em ${AppConstants.URL_RESULTADOS_TSE}"
        else "Só haverá se nenhum candidato atingir mais de 50% dos votos válidos no 1º turno ($dataTurno1)"
    }

    if (uf != null) {
        val apGov = obterApuracao("GOVERNADOR", uf, 1)
        if (apGov != null && apGov.temVotos) {
            val lt = leituraSegundoTurno(apGov)
            val l1 = lt.l1
            val l2 = lt.l2
            if (l1 != null && lt.tipo == TipoSegundoTurno.ELEITO) {
                statusGov = "Não haverá 2º turno — ${l1.nome} (${l1.partido}) foi eleito(a) em 1º turno (${l1.percentual}%)"
            } else if (l1 != null && l2 != null && lt.tipo == TipoSegundoTurno.SEGUNDO) {
                statusGov = "Sim, haverá 2º turno entre ${l1.nome} (${l1.percentual}%) e ${l2.nome} (${l2.percentual}%)"
            } else if (l1 != null && l2 != null && lt.tipo == TipoSegundoTurno.ANDAMENTO) {
                statusGov = "Apuração em andamento (${apGov.secoesTotalizadasPct ?: "0"}%) — parcial: ${l1.nome} (${l1.percentual}%) e ${l2.nome} (${l2.percentual}%)"
            }
        }
        if (statusGov == null) statusGov = statusSegundoTurnoPacote("GOVERNADOR", uf)
        if (statusGov == null) {
            statusGov = if (jaVotou) "não foi possível consultar agora a apuração oficial do 1º turno; confira em ${AppConstants.URL_RESULTADOS_TSE}"
            else "Segue a mesma regra no seu estado — haverá 2º turno se nenhum candidato alcançar mais de 50% dos votos válidos"
        }
    }

    val texto = buildString {
        append("Segundo turno nas Eleições 2026:\n")
        append("• Só para Presidente e Governador, quando nenhum candidato alcança mais de 50% dos votos válidos no 1º turno ($dataTurno1). Senadores e Deputados são eleitos em turno único\n")
        append("• Presidente da República: $statusPresidente\n")
        if (uf != null) {
            append("• Governador ($uf): $statusGov\n")
        } else {
            append("• Governador: cada estado define individualmente se haverá 2º turno de acordo com os votos válidos locais\n")
        }
        append("• Data da votação do 2º turno (onde houver): $dataTurno2, das 8h às 17h (horário de Brasília).")
    }

    return AiMenuResponse(
        targetRoute = "info/calendario", menuId = AppConstants.MENU_CALENDARIO, intent = Intent.SEGUNDO_TURNO,
        directAnswer = texto,
        suggestedQuestions = listOfNotNull(
            "Segundo turno para Presidente",
            uf?.let { "Segundo turno para Governador em $it" } ?: "Segundo turno para Governador",
            "Calendário eleitoral 2026"
        ),
        fonte = fonte, origem = origem
    )
}

internal enum class TipoSegundoTurno { ELEITO, SEGUNDO, ANDAMENTO, INDEFINIDO }

/** Ver [leituraSegundoTurno]. [maioria] = o primeiro colocado passou de 50% dos votos válidos. */
internal data class LeituraSegundoTurno(val tipo: TipoSegundoTurno, val l1: LinhaApuracao?, val l2: LinhaApuracao?, val maioria: Boolean = false)

/**
 * Lê a apuração do 1º turno de um cargo do Executivo e diz em que pé está o 2º turno:
 *  - SEGUNDO: há 2º turno (o TSE marcou os classificados com a situação "2º turno", ou a totalização terminou sem ninguém acima de 50%);
 *  - ELEITO: o primeiro colocado foi eleito no 1º turno;  ANDAMENTO: apuração parcial;  INDEFINIDO: não dá para dizer.
 * NUNCA devolve ELEITO quando dois candidatos aparecem como classificados/eleitos com o primeiro abaixo de 50%.
 */
internal fun leituraSegundoTurno(ap: ApuracaoCargo): LeituraSegundoTurno {
    val ord = ap.linhas.sortedByDescending { it.votos }
    val l1 = ord.getOrNull(0)
    val l2 = ord.getOrNull(1)
    val pct1 = l1?.percentual?.replace(',', '.')?.toDoubleOrNull() ?: 0.0
    val totalizado = ap.totalizacaoFinal || (ap.secoesTotalizadasPct?.replace(',', '.')?.toDoubleOrNull() ?: 0.0) >= 100.0
    val classificados = ord.filter { it.segundoTurno }
    return when {
        classificados.size >= 2 -> LeituraSegundoTurno(TipoSegundoTurno.SEGUNDO, classificados[0], classificados[1])
        // defesa: dois "eleitos" num cargo de uma vaga, com o primeiro sem maioria, só pode ser 2º turno
        ord.count { it.eleito } >= 2 && pct1 <= 50.0 -> LeituraSegundoTurno(TipoSegundoTurno.SEGUNDO, l1, l2)
        l1 != null && (l1.eleito || pct1 > 50.0) -> LeituraSegundoTurno(TipoSegundoTurno.ELEITO, l1, l2, maioria = pct1 > 50.0)
        l1 != null && l2 != null && totalizado -> LeituraSegundoTurno(TipoSegundoTurno.SEGUNDO, l1, l2)
        l1 != null && l2 != null -> LeituraSegundoTurno(TipoSegundoTurno.ANDAMENTO, l1, l2)
        else -> LeituraSegundoTurno(TipoSegundoTurno.INDEFINIDO, l1, l2)
    }
}

/** Situação do 2º turno segundo o PACOTE (CSV oficial do TSE), para quando a apuração ao vivo não respondeu; null se o pacote não define. */
internal fun AnswerBuilder.statusSegundoTurnoPacote(cargo: String, uf: String): String? {
    val daqui = data.candidatos.filter { it.cargoCodigo == cargo && it.estadoUf == uf && it.resultado != null }
    daqui.firstOrNull { it.resultado?.eleitoNoPrimeiroTurno == true }?.let {
        return "Não haverá 2º turno — ${it.nomeUrna} (${it.partido}) foi eleito(a) em 1º turno"
    }
    val cl = daqui.filter { it.resultado?.segundoTurno == true }.sortedByDescending { it.resultado?.turnos?.get(1)?.votos ?: 0L }
    return if (cl.size >= 2) "Sim, haverá 2º turno entre ${cl[0].nomeUrna} (${cl[0].partido}) e ${cl[1].nomeUrna} (${cl[1].partido})" else null
}
