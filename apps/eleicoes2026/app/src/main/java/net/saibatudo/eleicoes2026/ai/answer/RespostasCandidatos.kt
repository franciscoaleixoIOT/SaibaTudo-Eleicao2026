package net.saibatudo.eleicoes2026.ai.answer

import net.saibatudo.eleicoes2026.ai.model.AiFilterExtraction
import net.saibatudo.eleicoes2026.ai.model.AiMenuResponse
import net.saibatudo.eleicoes2026.ai.model.Intent
import net.saibatudo.eleicoes2026.ai.model.ParsedQuery
import net.saibatudo.eleicoes2026.ai.nlu.ModeloCargo
import net.saibatudo.eleicoes2026.core.constants.AppConstants
import net.saibatudo.eleicoes2026.domain.model.Candidate
import net.saibatudo.eleicoes2026.domain.model.ElectoralFilter
import net.saibatudo.eleicoes2026.domain.model.HistoricoOpcao
import net.saibatudo.eleicoes2026.domain.model.Texto
import net.saibatudo.eleicoes2026.domain.model.Ufs
import net.saibatudo.eleicoes2026.domain.model.tituloCargo
import net.saibatudo.eleicoes2026.domain.usecase.CandidateQuery
import java.util.Locale

// Listagem, contagem, localização de candidato (nome ou número) e perfil.
// Funções de extensão de [AnswerBuilder] (estado e helpers são `internal` na classe); o despacho por intenção fica em AnswerBuilder.kt.

// ------------------------------------------------------------------ listagem e contagem

internal fun AnswerBuilder.listar(p: ParsedQuery): AiMenuResponse {
    val cargo = p.cargo
    val filtros = AiFilterExtraction(
        cargo = cargo, estadoUf = p.uf, partido = p.partido, tema = p.tema,
        apenasDeferidas = p.apenasDeferidas, historico = p.historico, genero = p.genero, resetar = true
    )
    val lista = CandidateQuery.filtrar(
        data.candidatos,
        ElectoralFilter(
            estadoUf = p.uf, cargo = cargo, apenasNaUrna = true, apenasDeferidas = p.apenasDeferidas == true,
            historico = p.historico ?: HistoricoOpcao.TODOS, partido = p.partido, tema = p.tema, genero = p.genero
        )
    ).filter { cargo != null || p.uf == null || it.estadoUf == p.uf } // sem cargo: só a UF pedida (sem nacionais)
    // Em listas por cargo (sem partido/tema) citamos só os titulares; vices/suplentes aparecem nos cartões
    val citados = if (cargo != null && p.partido == null && p.tema == null) lista.filter { it.cargoCodigo == cargo } else lista
    val titulo = montarTitulo(cargo, p)
    val texto = buildString {
        if (citados.isEmpty()) {
            append("Não encontrei candidaturas na urna $titulo nos dados oficiais do TSE.")
        } else {
            val total = citados.size
            append("O TSE registra ${n(total)} candidatura${plural(total)} na urna $titulo")
            if (total <= 30) {
                append(":")
                val variosCargos = citados.map { it.cargoCodigo }.distinct().size > 1
                val variasUfs = citados.map { it.estadoUf }.filter { it != "BR" }.distinct().size > 1
                citados.forEach { append("\n").append(item(it, mostrarCargo = variosCargos, mostrarUf = variasUfs, chapa = if (p.vice) chapa(it) else emptyList())) }
            } else {
                append(".")
                if (cargo == null) {
                    if (p.uf != null) {
                        val majoritarios = citados.filter { it.cargoCodigo in setOf("GOVERNADOR", "SENADOR") }
                        val govs = majoritarios.filter { it.cargoCodigo == "GOVERNADOR" }
                        val sens = majoritarios.filter { it.cargoCodigo == "SENADOR" }
                        if (govs.isNotEmpty() || sens.isNotEmpty()) {
                            append("\n\nPrincipais disputas no estado (${Ufs.em(p.uf)}):")
                            if (govs.isNotEmpty()) {
                                append("\nGovernador:")
                                govs.forEach { append("\n").append(item(it, false, false, if (p.vice) chapa(it) else emptyList())) }
                            }
                            if (sens.isNotEmpty()) {
                                append("\nSenador:")
                                sens.forEach { append("\n").append(item(it, false, false, if (p.vice) chapa(it) else emptyList())) }
                            }
                        }
                    } else {
                        val pres = citados.filter { it.cargoCodigo == "PRESIDENTE" }
                        if (pres.isNotEmpty() && pres.size <= 25) {
                            append("\n\nCandidaturas à Presidência da República:")
                            pres.forEach { append("\n").append(item(it, false, false, if (p.vice) chapa(it) else emptyList())) }
                        }
                    }
                    append("\n\nPor cargo:")
                    citados.groupingBy { it.cargoCodigo }.eachCount().entries
                        .sortedBy { ModeloCargo.ordem(it.key) }
                        .forEach { (c, qtd) -> append("\n• ${tituloCargo(c)}: ${n(qtd)}") }
                }
                append("\nA lista completa está nos cartões abaixo, em ordem fixa por cargo, estado e número.")
            }
            if (p.tema != null) {
                append("\nTema \"${regras.temas[p.tema] ?: p.tema}\": inclui só candidatos com plano de governo registrado " +
                    "(${n(regras.estatisticas.candidatosComPlanoGoverno)} no total) cujo texto cita o tema com frequência.")
            }
            if (p.apenasDeferidas == true) append("\nFicha Limpa: só registros deferidos pela Justiça Eleitoral (sem impedimento reconhecido; não é certidão).")
            if (p.genero != null) append("\nGênero conforme declarado ao TSE no registro.")
        }
        val fora = cargo?.let { c ->
            data.candidatos.count { it.cargoCodigo == c && !it.naUrna && (p.uf == null || it.estadoUf == p.uf) }
        } ?: 0
        if (fora > 0 && p.partido == null && p.tema == null && p.genero == null) {
            append("\nHá ainda ${n(fora)} registro${plural(fora)} fora da urna (renúncia, indeferimento etc.).")
        }
    }
    return AiMenuResponse(
        targetRoute = rotaCargo(cargo), menuId = menuCargo(cargo),
        submenuId = p.uf?.let { "sub_${it.lowercase()}" }, intent = p.intent, filters = filtros,
        directAnswer = texto,
        candidateIds = citados.flatMap { listOf(it) + if (p.vice) chapa(it) else emptyList() }.take(20).map { it.id },
        suggestedQuestions = sugestoesLista(cargo, p.uf), fonte = fonte, origem = origem
    )
}

internal fun AnswerBuilder.contar(p: ParsedQuery): AiMenuResponse {
    val cargo = p.cargo
    fun noEscopo(c: Candidate) = (cargo == null || c.cargoCodigo == cargo) && (p.uf == null || c.estadoUf == p.uf) &&
        (p.partido == null || c.partido.equals(p.partido, true))
    val escopo = data.candidatos.filter(::noEscopo)
    val doGenero = if (p.genero != null) escopo.filter { it.genero.equals(p.genero, true) } else escopo
    val registros = doGenero.size
    val naUrna = doGenero.count { it.naUrna }
    val titulo = montarTitulo(cargo, p.copy(genero = null))
    val texto = buildString {
        if (p.genero != null) {
            val quem = if (p.genero == "FEMININO") "mulheres" else "homens"
            append("O TSE registra ${n(registros)} candidaturas de $quem $titulo, sendo ${n(naUrna)} na urna.")
            if (escopo.isNotEmpty()) {
                val pct = registros * 100.0 / escopo.size
                append("\nParticipação: ${"%.1f".format(Locale.forLanguageTag("pt-BR"), pct)}% de ${n(escopo.size)} candidaturas registradas.")
            }
            append("\nGênero conforme declarado ao TSE no registro.")
        } else {
            append("O TSE registra ${n(registros)} candidatura${plural(registros)} $titulo, sendo ${n(naUrna)} inserida${plural(naUrna)} na urna.")
            if (cargo == null && p.uf == null && p.partido == null) {
                append("\nNa urna, por cargo:")
                regras.estatisticas.porCargoNaUrna.entries.sortedByDescending { it.value }
                    .forEach { append("\n• ${it.key.lowercase().replaceFirstChar(Char::uppercase)}: ${n(it.value)}") }
            }
        }
    }
    return AiMenuResponse(
        targetRoute = rotaCargo(cargo), menuId = menuCargo(cargo), intent = p.intent,
        filters = AiFilterExtraction(cargo = cargo, estadoUf = p.uf, partido = p.partido, genero = p.genero, resetar = true),
        directAnswer = texto, suggestedQuestions = sugestoesLista(cargo, p.uf), fonte = fonte, origem = origem
    )
}

// ------------------------------------------------------------------ localizar candidato (nome ou número)

/** Candidatos citados pela pergunta: por nome (dicionário dos dados) ou pelo número de urna. */
internal fun AnswerBuilder.localizar(p: ParsedQuery): List<Candidate> = when {
    p.nome != null -> gaz.buscarPorNome(p.nome, if (p.vice) null else p.cargo, p.uf).ifEmpty {
        if (p.cargo != null || p.uf != null) gaz.buscarPorNome(p.nome) else emptyList()
    }
    p.numero != null -> porNumero(p.numero, p.uf ?: ufPadrao.takeUnless { p.nacional })
        .filter { p.cargo == null || ModeloCargo.mesmaFamilia(p.cargo, it) }
    else -> emptyList()
}

/** Um único candidato quando a correspondência é inequívoca (nome de urna exato ou majoritário com nome único). */
internal fun AnswerBuilder.escolher(achados: List<Candidate>, termo: String?): Candidate? {
    if (achados.size == 1) return achados.first()
    if (achados.isEmpty()) return null
    val alvo = termo?.let { Texto.normalizar(it) }
    val exatos = achados.filter { Texto.normalizar(it.nomeUrna) == alvo }
    if (exatos.size == 1) return exatos.first()
    val melhor = achados.first()
    return melhor.takeIf { m -> m.ehMajoritario && achados.count { it.nomeUrna.equals(m.nomeUrna, true) } == 1 && termo != null }
}

/** Número de urna -> cargos possíveis pelo total de dígitos (regra oficial da urna). */
internal fun AnswerBuilder.porNumero(numero: String, uf: String?): List<Candidate> {
    val cargos = when (numero.length) {
        2 -> setOf("PRESIDENTE", "GOVERNADOR")
        3 -> setOf("SENADOR")
        4 -> setOf("DEPUTADO_FEDERAL")
        5 -> setOf("DEPUTADO_ESTADUAL", "DEPUTADO_DISTRITAL")
        else -> emptySet()
    }
    val todos = data.candidatos.filter { it.numero == numero && it.cargoCodigo in cargos && (it.estadoUf == "BR" || uf == null || it.estadoUf == uf) }
    // havendo substituição, prefere a candidatura que está na urna
    return todos.groupBy { it.cargoCodigo to it.estadoUf }.values
        .flatMap { g -> g.filter { it.naUrna }.ifEmpty { g } }
        .sortedWith(compareBy({ ModeloCargo.ordem(it.cargoCodigo) }, { it.estadoUf }))
}

/** Vice (Presidente/Governador) ou suplentes (Senador) da mesma chapa, e o titular para vices/suplentes. */
internal fun AnswerBuilder.chapa(c: Candidate): List<Candidate> {
    val par = when (c.cargoCodigo) {
        "PRESIDENTE" -> setOf("VICE_PRESIDENTE")
        "VICE_PRESIDENTE" -> setOf("PRESIDENTE")
        "GOVERNADOR" -> setOf("VICE_GOVERNADOR")
        "VICE_GOVERNADOR" -> setOf("GOVERNADOR")
        "SENADOR" -> setOf("SUPLENTE_1", "SUPLENTE_2")
        "SUPLENTE_1", "SUPLENTE_2" -> setOf("SENADOR", "SUPLENTE_1", "SUPLENTE_2") - c.cargoCodigo
        else -> return emptyList()
    }
    return data.candidatos.filter { it.id != c.id && it.numero == c.numero && it.estadoUf == c.estadoUf && it.cargoCodigo in par }
        .groupBy { it.cargoCodigo }.values.flatMap { g -> g.filter { it.naUrna }.ifEmpty { g } }
        .sortedBy { ModeloCargo.ordem(it.cargoCodigo) }
}

internal fun AnswerBuilder.naoEncontrado(p: ParsedQuery): AiMenuResponse {
    val texto = if (p.numero != null && p.nome == null)
        "Não encontrei candidatura com o número ${p.numero}${(p.uf ?: ufPadrao.takeUnless { p.nacional })?.let { " (${Ufs.em(it)} ou nacional)" } ?: ""} nos registros oficiais do TSE." +
            "\nNúmeros de urna: 2 dígitos = Presidente e Governador; 3 = Senador; 4 = Deputado Federal; 5 = Deputado Estadual/Distrital."
    else "Nenhum candidato com nome semelhante a \"${p.nome}\" nos registros oficiais do TSE (${n(data.candidatos.size)} candidaturas)." +
        "\nVerifique a grafia ou pesquise por cargo, estado ou número."
    return AiMenuResponse(
        targetRoute = "candidates/todos", menuId = AppConstants.MENU_HOME, intent = p.intent,
        filters = AiFilterExtraction(buscaTexto = p.nome ?: p.numero, resetar = true),
        directAnswer = texto,
        suggestedQuestions = listOf("Quem disputa a Presidência?", "Candidatos a Governador em ${ufPadrao ?: "SP"}"),
        fonte = fonte, origem = origem
    )
}

/** Vários candidatos possíveis: lista para o usuário escolher (ordem fixa). */
internal fun AnswerBuilder.ambiguo(p: ParsedQuery, achados: List<Candidate>): AiMenuResponse {
    val rotulo = p.nome?.let { "\"$it\"" } ?: "o número ${p.numero}"
    val texto = buildString {
        append("Encontrei ${n(achados.size)} candidaturas com $rotulo:")
        achados.take(10).forEach { append("\n").append(item(it, mostrarCargo = true, mostrarUf = true)) }
        if (achados.size > 10) append("\n…e outras ${n(achados.size - 10)}.")
        append("\nInforme o cargo ou o estado para refinar.")
    }
    val melhor = achados.first()
    return AiMenuResponse(
        targetRoute = "candidates/todos", menuId = AppConstants.MENU_HOME, intent = p.intent,
        filters = AiFilterExtraction(buscaTexto = p.nome ?: p.numero, resetar = true),
        directAnswer = texto, candidateIds = achados.take(12).map { it.id },
        suggestedQuestions = listOf("Candidatos a ${melhor.cargo}${melhor.estadoUf.takeIf { it != "BR" }?.let { " em $it" } ?: ""}", "Quantos candidatos no total?"),
        fonte = fonte, origem = origem
    )
}

// ------------------------------------------------------------------ perfil

internal fun AnswerBuilder.perfil(p: ParsedQuery): AiMenuResponse {
    val achados = localizar(p)
    if (achados.isEmpty()) return naoEncontrado(p)
    val c = escolher(achados, p.nome) ?: return ambiguo(p, achados)
    if (p.vice) {
        val chapa = chapa(c)
        if (chapa.isNotEmpty() && c.cargoCodigo in setOf("PRESIDENTE", "GOVERNADOR", "SENADOR")) {
            val texto = buildString {
                append("Chapa de ${c.nomeUrna} (${c.cargo}${localDe(c)}, nº ${c.numero}):")
                chapa.forEach { v -> append("\n• ${v.cargo}: ${v.nomeUrna} (${v.partido}) — ${v.elegibilidade.rotulo.lowercase()}") }
            }
            return AiMenuResponse(
                targetRoute = rotaCargo(c.cargoCodigo), menuId = menuCargo(c.cargoCodigo), intent = p.intent,
                filters = AiFilterExtraction(buscaTexto = c.nomeUrna, resetar = true),
                directAnswer = texto, candidateIds = (listOf(c) + chapa).map { it.id },
                suggestedQuestions = listOf("${c.nomeUrna} é ficha limpa?", "Simular voto em ${c.nomeUrna} (${c.numero})"),
                fonte = fonte, origem = origem
            )
        }
    }
    return AiMenuResponse(
        targetRoute = rotaCargo(c.cargoCodigo), menuId = menuCargo(c.cargoCodigo),
        submenuId = c.estadoUf.takeIf { it != "BR" }?.let { "sub_${it.lowercase()}" }, intent = Intent.PERFIL_CANDIDATO,
        filters = AiFilterExtraction(buscaTexto = c.nomeUrna, resetar = true),
        directAnswer = descricaoPerfil(c), candidateIds = (listOf(c) + chapa(c)).map { it.id },
        suggestedQuestions = listOfNotNull(
            "Simular voto em ${c.nomeUrna} (${c.numero})",
            "${c.nomeUrna} é ficha limpa?",
            "Plano de governo de ${c.nomeUrna}".takeIf { c.temPlanoGoverno },
            "Quem disputa ${tituloCargoDe(c.cargoCodigo)}${if (c.estadoUf != "BR") " em ${c.estadoUf}" else ""}?"
        ),
        fonte = fonte, origem = origem
    )
}

internal fun AnswerBuilder.descricaoPerfil(c: Candidate): String = buildString {
    append("${c.nomeUrna} — ${c.cargo}${if (c.estadoUf == "BR") " (nacional)" else " ${Ufs.por(c.estadoUf)}"}")
    append("\nNúmero na urna: ${c.numero} · Partido: ${c.partido}")
    val chapa = chapa(c)
    if (chapa.isNotEmpty()) {
        val rotulo = when (c.cargoCodigo) { "SENADOR" -> "Suplentes"; "PRESIDENTE", "GOVERNADOR" -> "Vice"; else -> "Chapa" }
        append("\n$rotulo: ${chapa.joinToString("; ") { "${it.nomeUrna} (${it.partido})" + if (rotulo == "Chapa") " – ${it.cargo}" else "" }}")
    }
    append("\nNome completo: ${titulo(c.nomeCompleto)}")
    val pessoais = listOfNotNull(c.idade?.let { "$it anos" }, c.ocupacao?.let { "ocupação declarada: ${it.lowercase()}" })
    if (pessoais.isNotEmpty()) append("\nPerfil: ${pessoais.joinToString(" · ")}")
    c.municipioNascimento?.let { append("\nNaturalidade: ${titulo(it)}${c.ufNascimento?.let { u -> "/$u" } ?: ""}") }
    append("\nSituação no TSE: ${c.elegibilidade.rotulo} — ${if (c.naUrna) "inserida na urna" else "NÃO está inserida na urna"}")
    append("\nFicha Limpa: ${c.fichaLimpaTexto}")
    if (c.motivosIndeferimento.isNotEmpty()) append("\nMotivos registrados: ${c.motivosIndeferimento.joinToString("; ")}")
    if (c.vezesEleito > 0) {
        append("\nHistórico: eleito ${c.vezesEleito} vez${if (c.vezesEleito == 1) "" else "es"} em eleições anteriores")
        if (c.eleitoMesmoCargo) append(", inclusive para este cargo")
        append(" (histórico do TSE)")
    }
    when {
        c.patrimonioDeclarado != null -> append("\nPatrimônio declarado: ${moeda.format(c.patrimonioDeclarado)} (${c.qtdBens ?: "?"} bens)")
        c.declaraBens == false -> append("\nPatrimônio declarado: não declarou bens")
    }
    c.contas?.takeIf { it.receitas > 0 || it.despesasContratadas > 0 }?.let {
        append("\nContas de campanha (${it.tipo?.lowercase() ?: "parcial"}): receitas ${moeda.format(it.receitas)} · despesas contratadas ${moeda.format(it.despesasContratadas)}")
    }
    if (c.temPlanoGoverno) {
        append("\nPlano de governo: registrado no TSE")
        if (c.temasPlano.isNotEmpty()) append(" (temas mais citados: ${c.temasPlano.take(5).joinToString(", ") { regras.temas[it] ?: it }})")
    }
    c.resultado?.takeIf { it.turnos.isNotEmpty() || it.situacaoTotalizacao != null }?.let { r ->
        append("\nResultado oficial: ${r.situacaoTotalizacao ?: "—"}")
        r.turnos.entries.sortedBy { it.key }.forEach { (t, v) ->
            append("\n• ${t}º turno: ${v.votos?.let { inteiro.format(it) } ?: "—"} votos")
            v.percentual?.let { pc -> append(" (${"%.2f".format(Locale.forLanguageTag("pt-BR"), pc)}%)") }
        }
    }
}
