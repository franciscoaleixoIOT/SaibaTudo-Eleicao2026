package com.example.saibatudo_eleicao2026.ai.engine

import com.example.saibatudo_eleicao2026.ai.model.AiFilterExtraction
import com.example.saibatudo_eleicao2026.ai.model.AiMenuResponse
import com.example.saibatudo_eleicao2026.ai.model.IntentType
import com.example.saibatudo_eleicao2026.core.constants.AppConstants
import com.example.saibatudo_eleicao2026.domain.model.Candidate
import com.example.saibatudo_eleicao2026.domain.model.PesquisaEleitoral
import com.example.saibatudo_eleicao2026.domain.model.TseRegras
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Contexto de conhecimento OFICIAL TSE injetado no motor local
 * (mesma fonte de dados do repositório - zero dados simulados).
 */
data class TseKnowledgeContext(
    val candidatos: List<Candidate> = emptyList(),
    val pesquisas: List<PesquisaEleitoral> = emptyList(),
    val regras: TseRegras? = null
)

/**
 * Motor de IA LOCAL determinístico, 100% alimentado pelos dados oficiais do TSE
 * (mesmos assets do repositório). Não inventa propostas nem dados: apenas consulta
 * os registros oficiais (candidatos, situações, pesquisas e regras do TSE 2026).
 *
 * Responsável por:
 *  - Extração rápida de intenção + filtros (cargo, UF, partido, nome, tema)
 *  - Respostas factuais oficiais (perfil de candidato, contagens, pesquisas, regras)
 *  - Fallback offline do motor híbrido (latência zero no dispositivo)
 */
class LocalOfficialAiEngine(
    private val knowledge: suspend () -> TseKnowledgeContext
) : AiInferenceEngine {

    companion object {
        private val CARGO_KEYWORDS = linkedMapOf(
            "deputado federal" to "DEPUTADO_FEDERAL",
            "dep federal" to "DEPUTADO_FEDERAL",
            "deputado estadual" to "DEPUTADO_ESTADUAL",
            "deputado distrital" to "DEPUTADO_DISTRITAL",
            "dep estadual" to "DEPUTADO_ESTADUAL",
            "senador" to "SENADOR",
            "senado" to "SENADOR",
            "governador" to "GOVERNADOR",
            "governo de" to "GOVERNADOR",
            "presidente" to "PRESIDENTE",
            "presidência" to "PRESIDENTE",
            "presidencia" to "PRESIDENTE"
        )
        private val UFS = setOf(
            "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
            "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
            "SP", "SE", "TO"
        )
        private val NOMES_UF = mapOf(
            "são paulo" to "SP", "sao paulo" to "SP", "rio de janeiro" to "RJ", "minas gerais" to "MG",
            "espírito santo" to "ES", "espirito santo" to "ES", "paraná" to "PR", "parana" to "PR",
            "santa catarina" to "SC", "rio grande do sul" to "RS", "bahia" to "BA",
            "pernambuco" to "PE", "ceará" to "CE", "ceara" to "CE", "maranhão" to "MA", "maranhao" to "MA",
            "paraíba" to "PB", "paraiba" to "PB", "rio grande do norte" to "RN", "alagoas" to "AL",
            "sergipe" to "SE", "piauí" to "PI", "piaui" to "PI", "distrito federal" to "DF",
            "goiás" to "GO", "goias" to "GO", "mato grosso" to "MT", "mato grosso do sul" to "MS",
            "amazonas" to "AM", "pará" to "PA", "para" to "PA", "acre" to "AC", "rondônia" to "RO",
            "rondonia" to "RO", "roraima" to "RR", "amapá" to "AP", "amapa" to "AP", "tocantins" to "TO"
        )
    }

    override suspend fun parseUserQuery(query: String): AiMenuResponse = withContext(Dispatchers.Default) {
        val ctx = knowledge()
        val lower = normalize(query)
        val uf = extractUf(lower)
        val cargo = extractCargo(lower)
        val nome = extractNomeCandidato(lower, ctx.candidatos)
        val partido = extractPartido(lower, ctx.candidatos)

        // 1. Regras oficiais / calendário / local de votação
        ruleAnswer(lower, ctx)?.let { return@withContext it }

        // 2. Pesquisas eleitorais oficiais registradas no TSE
        if (lower.contains("pesquisa")) {
            return@withContext pesquisasAnswer(lower, ctx, uf, cargo)
        }

        // 3. Contagens agregadas reais
        if (lower.contains("quantos") || lower.contains("quantas") || lower.contains("número de candidatos")) {
            aggregateAnswer(lower, ctx, uf, cargo)?.let { return@withContext it }
        }

        // 3.5 Listagem de candidaturas: "Quem disputa a Presidência?", "Candidatos a Senador em SP"
        if (cargo != null && isListingIntent(lower)) {
            return@withContext listCandidatesAnswer(ctx, cargo, uf)
        }

        // 4. Perfil oficial de candidato específico
        if (nome != null) {
            return@withContext candidateProfileAnswer(ctx, nome, cargo, uf)
        }

        // 5. Navegação / listagem por cargo e UF
        when {
            cargo != null -> navigateAnswer(cargo, uf, partido)
            partido != null -> AiMenuResponse(
                targetRoute = "candidates/todos",
                menuId = AppConstants.MENU_DEPUTADO_FEDERAL,
                filters = AiFilterExtraction(partido = partido, estadoUf = uf),
                directAnswer = "Exibindo os ${countBy(ctx, partido = partido, uf = uf)} candidatos oficiais " +
                    "do partido ${partido.uppercase()} registrados no TSE para 2026" + (uf?.let { " em $it" } ?: "") + ".",
                suggestedQuestions = listOf(
                    "Candidatos a Presidente",
                    "Candidatos com Ficha Limpa",
                    "Quantos candidatos por estado?"
                )
            )
            else -> AiMenuResponse(
                targetRoute = "menu/home",
                menuId = "menu_home",
                filters = AiFilterExtraction(buscaTexto = query.trim()),
                directAnswer = "Consultando os dados oficiais do TSE (Eleições Gerais 2026) para: \"$query\". " +
                    "Total de candidatos registrados: ${ctx.regras?.estatisticas?.totalCandidatos ?: ctx.candidatos.size}.",
                suggestedQuestions = listOf(
                    "Quem disputa a Presidência em 2026?",
                    "Quantos candidatos foram registrados?",
                    "Candidatos a Senador em SP",
                    "Simular na Urna Eletrônica"
                )
            )
        }
    }

    // ============================ Respostas oficiais ============================

    private fun isListingIntent(lower: String): Boolean =
        Regex("\\bquem\\s+(disputa|concorre|sao|são)\\b").containsMatchIn(lower) ||
            Regex("\\bcandidatos?\\s+(a|ao|à)\\b").containsMatchIn(lower) ||
            lower.contains("lista de candidatos")

    private fun listCandidatesAnswer(
        ctx: TseKnowledgeContext, cargo: String, uf: String?
    ): AiMenuResponse {
        val display = cargoDisplay(cargo)
        val filtrados = candidatosDe(ctx, cargo, uf)
        val resposta = buildString {
            append("O TSE registra oficialmente ${filtrados.size} candidatura(s) a $display")
            uf?.let { append(" em $it") }
            append(" nas Eleições Gerais 2026")
            if (filtrados.isNotEmpty() && filtrados.size <= 30) {
                append(": ")
                append(
                    filtrados.sortedBy { it.nomeUrna }.joinToString("; ") {
                        "${it.nomeUrna} (${it.partido}" +
                            (if (it.estadoUf != "BR") "-${it.estadoUf}" else "") +
                            ", nº ${it.numero})"
                    }
                )
            } else if (filtrados.isNotEmpty()) {
                append(". A listagem completa oficial está carregada abaixo")
            }
            append(". Fonte: dados oficiais do TSE (dadosabertos.tse.jus.br).")
        }
        return AiMenuResponse(
            targetRoute = routeForCargo(cargo),
            menuId = menuForCargo(cargo),
            submenuId = uf?.let { "sub_${it.lowercase()}" },
            filters = AiFilterExtraction(cargo = cargo, estadoUf = uf),
            directAnswer = resposta,
            suggestedQuestions = listOf(
                "Quantos candidatos a $display?",
                if (cargo == "SENADOR") "Regra dos dois senadores em 2026" else "Candidatos a $display em SP",
                "Simular voto na Urna 2026"
            )
        )
    }

    private fun ruleAnswer(lower: String, ctx: TseKnowledgeContext): AiMenuResponse? {
        val regras = ctx.regras
        return when {
            lower.contains("ordem de votação") || lower.contains("ordem de votacao") ||
                (lower.contains("urna") && lower.contains("ordem")) -> {
                val etapas = regras?.ordemVotacaoUrna?.sortedBy { it.ordem }
                    ?.joinToString("; ") { "${it.ordem}º) ${it.cargo} (${it.digitos} dígitos)" }
                AiMenuResponse(
                    targetRoute = "urna/simulador",
                    menuId = AppConstants.MENU_REGRAS_ELEITORAIS,
                    directAnswer = "Ordem oficial de votação na urna do TSE 2026: $etapas. " +
                        "Toque em 'Simular na Urna' para treinar com o simulador.",
                    suggestedQuestions = listOf("Simular voto na Urna 2026", "Regras dos dois senadores")
                )
            }
            lower.contains("dois senadores") || lower.contains("2 senadores") ||
                lower.contains("mesmo senador") || lower.contains("renovação de 2/3") -> {
                AiMenuResponse(
                    targetRoute = "candidates/senador",
                    menuId = AppConstants.MENU_SENADOR,
                    filters = AiFilterExtraction(cargo = "SENADOR"),
                    directAnswer = "Em 2026 ocorre a renovação de 2/3 do Senado: cada eleitor vota em DOIS senadores " +
                        "diferentes (3 dígitos cada). Atenção à regra oficial do TSE: se digitar o mesmo número " +
                        "nas duas vagas, o segundo voto é ANULADO pela urna eletrônica.",
                    suggestedQuestions = listOf("Candidatos ao Senado em SP", "Simular votação completa na Urna")
                )
            }
            lower.contains("calendário") || lower.contains("calendario") || lower.contains("quando") ||
                lower.contains("data") || lower.contains("turno") || lower.contains("prazo") -> {
                val r = regras
                AiMenuResponse(
                    targetRoute = "info/calendario",
                    menuId = AppConstants.MENU_CALENDARIO,
                    directAnswer = "Calendário oficial do TSE 2026: 1º turno em ${r?.dataPrimeiroTurno ?: "04/10/2026"}; " +
                        "2º turno (Presidente e Governador) em ${r?.dataSegundoTurno ?: "25/10/2026"}. " +
                        "Votação das ${r?.horarioVotacao ?: "8h às 17h"} (horário de Brasília).",
                    suggestedQuestions = listOf("Como justificar o voto?", "Onde consultar meu local de votação?")
                )
            }
            lower.contains("onde votar") || lower.contains("local de votação") || lower.contains("título") -> {
                AiMenuResponse(
                    targetRoute = "info/locais",
                    menuId = AppConstants.MENU_LOCAIS_VOTACAO,
                    directAnswer = "Sistemas oficiais para o eleitor: consulte local de votação e título no " +
                        "Autoatendimento do Eleitor (${AppConstants.URL_AUTOATENDIMENTO_ELEITOR}) ou no e-Título; " +
                        "candidaturas e contas no DivulgaCandContas (${AppConstants.URL_DIVULGA_CAND_CONTAS}); " +
                        "apuração em tempo real em ${AppConstants.URL_RESULTADOS_TSE}. Leve documento oficial com foto.",
                    suggestedQuestions = listOf("Quais documentos aceitos?", "Calendário eleitoral 2026")
                )
            }
            lower.contains("ficha limpa") -> {
                val total = ctx.regras?.estatisticas?.fichaLimpaTotal
                AiMenuResponse(
                    targetRoute = "candidates/fichalimpa",
                    menuId = AppConstants.MENU_PRESIDENTE,
                    filters = AiFilterExtraction(apenasFichaLimpa = true),
                    directAnswer = "Ficha Limpa (LC 135/2010): o filtro exibe candidatos com situação de julgamento " +
                        "DEFERIDO e sem fundamento legal de inelegibilidade registrado no TSE" +
                        (total?.let { ". Total oficial de candidatos em condição de Ficha Limpa: $it" } ?: "") + ".",
                    suggestedQuestions = listOf("Candidatos com Zero Processos", "Ver candidatos a Presidente")
                )
            }
            lower.contains("zero processo") || lower.contains("processo") -> {
                AiMenuResponse(
                    targetRoute = "candidates/processos",
                    menuId = AppConstants.MENU_PRESIDENTE,
                    filters = AiFilterExtraction(maxProcessosAdministrativos = 0),
                    directAnswer = "Exibindo candidatos sem nenhum fundamento legal de julgamento (LC 64/90, Lei 9.504/97) " +
                        "registrado no TSE — 'Zero Processos Adm.'.",
                    suggestedQuestions = listOf("Ficha Limpa 100%", "Candidatos a Deputado Federal")
                )
            }
            else -> null
        }
    }

    private fun pesquisasAnswer(
        lower: String, ctx: TseKnowledgeContext, uf: String?, cargo: String?
    ): AiMenuResponse {
        val regras = ctx.regras
        val todas = ctx.pesquisas
        val filtradas = todas.filter { p ->
            (uf == null || p.uf.equals(uf, true)) && (cargo == null || p.cargo?.contains(cargo, true) == true)
        }
        val empresas = filtradas.mapNotNull { it.empresa }.distinct().take(8)
        val maisRecente = filtradas.firstOrNull()
        val resposta = StringBuilder()
        resposta.append("Pesquisas eleitorais OFICIALMENTE registradas no TSE 2026: ")
        resposta.append(if (filtradas.isEmpty()) regras?.estatisticas?.pesquisasRegistradas ?: todas.size else filtradas.size)
        resposta.append(if (uf != null) " para $uf" else " no total nacional")
        if (cargo != null) resposta.append(" (cargo: ${cargo.replace('_', ' ').lowercase()})")
        resposta.append(". ")
        maisRecente?.let {
            resposta.append("Mais recente: ${it.empresa ?: "empresa não informada"}")
            it.cargo?.let { c -> resposta.append(" ($c)") }
            it.dataDivulgacao?.let { d -> resposta.append(", divulgada em ${d.take(10)}") }
            it.entrevistados?.let { n -> resposta.append(" com $n entrevistados") }
            resposta.append(". ")
        }
        if (empresas.isNotEmpty()) resposta.append("Institutos registrados: ${empresas.joinToString(", ")}.")
        return AiMenuResponse(
            targetRoute = "info/pesquisas",
            menuId = AppConstants.MENU_PESQUISAS,
            filters = AiFilterExtraction(estadoUf = uf, cargo = cargo),
            directAnswer = resposta.toString(),
            suggestedQuestions = listOf(
                "Quantos candidatos a Presidente?",
                "Candidatos a Governador em SP",
                "Calendário eleitoral 2026"
            )
        )
    }

    private fun aggregateAnswer(
        lower: String, ctx: TseKnowledgeContext, uf: String?, cargo: String?
    ): AiMenuResponse? {
        val regras = ctx.regras ?: return null
        val stats = regras.estatisticas
        val total = stats.totalCandidatos

        return when {
            cargo != null && uf != null -> {
                val displayCargo = cargoDisplay(cargo)
                val count = countCargo(ctx, cargo, uf)
                AiMenuResponse(
                    targetRoute = "candidates/todos",
                    menuId = menuForCargo(cargo),
                    submenuId = "sub_${uf.lowercase()}",
                    filters = AiFilterExtraction(cargo = cargo, estadoUf = uf),
                    directAnswer = "O TSE registra oficialmente $count candidatos a $displayCargo em $uf " +
                        "nas Eleições Gerais 2026 (base oficial de ${regras.dataGeracaoDados}).",
                    suggestedQuestions = listOf("Lista de candidatos a $displayCargo em $uf", "Pesquisas eleitorais para $uf")
                )
            }
            cargo != null -> {
                val displayCargo = cargoDisplay(cargo)
                val count = countCargo(ctx, cargo, null)
                AiMenuResponse(
                    targetRoute = "candidates/todos",
                    menuId = menuForCargo(cargo),
                    filters = AiFilterExtraction(cargo = cargo),
                    directAnswer = "O TSE registra oficialmente $count candidatos a $displayCargo nas Eleições Gerais 2026 " +
                        "(total nacional: $total candidatos em todos os cargos).",
                    suggestedQuestions = listOf("Lista de candidatos a $displayCargo", "Quantos candidatos por estado?")
                )
            }
            uf != null -> {
                val count = ctx.candidatos.count { it.estadoUf == uf }
                AiMenuResponse(
                    targetRoute = "candidates/todos",
                    menuId = "menu_home",
                    submenuId = "sub_${uf.lowercase()}",
                    filters = AiFilterExtraction(estadoUf = uf),
                    directAnswer = "O TSE registra $count candidatos em $uf para as Eleições 2026 " +
                        "(todos os cargos em disputa no estado).",
                    suggestedQuestions = listOf("Candidatos a Governador em $uf", "Candidatos a Senador em $uf")
                )
            }
            else -> AiMenuResponse(
                targetRoute = "info/estatisticas",
                menuId = AppConstants.MENU_REGRAS_ELEITORAIS,
                directAnswer = "Total OFICIAL de candidatos registrados no TSE para as Eleições Gerais 2026: $total. " +
                    "Por cargo: " + stats.porCargo.entries.sortedByDescending { it.value }
                    .joinToString(", ") { "${it.key}: ${it.value}" } + ".",
                suggestedQuestions = listOf("Quantos candidatos a Presidente?", "Ver candidatos por estado")
            )
        }
    }

    private fun candidateProfileAnswer(
        ctx: TseKnowledgeContext, nome: String, cargo: String?, uf: String?
    ): AiMenuResponse {
        val alvo = normalize(nome)
        var matches = ctx.candidatos.filter { normalize(it.nomeUrna).contains(alvo) || normalize(it.nomeCompleto).contains(alvo) }
        if (cargo != null) matches = matches.filter { matchesCargoFamily(it.cargoCodigo, cargo) }
        if (uf != null) matches = matches.filter { it.estadoUf == uf }

        val melhor = matches.minByOrNull { normalize(it.nomeUrna).length }
        return if (melhor != null) {
            val perfil = buildPerfilOficial(melhor)
            AiMenuResponse(
                targetRoute = routeForCargo(melhor.cargoCodigo),
                menuId = menuForCargo(melhor.cargoCodigo),
                submenuId = if (melhor.estadoUf != "BR") "sub_${melhor.estadoUf.lowercase()}" else null,
                filters = AiFilterExtraction(
                    cargo = melhor.cargoCodigo.takeIf { it.isNotBlank() },
                    estadoUf = melhor.estadoUf.takeIf { it != "BR" },
                    partido = melhor.partido.takeIf { it.isNotBlank() },
                    nomeCandidato = melhor.nomeUrna,
                    buscaTexto = melhor.nomeUrna
                ),
                directAnswer = perfil,
                suggestedQuestions = listOf(
                    "Simular voto em ${melhor.nomeUrna} (${melhor.numero})",
                    "Outros candidatos a ${melhor.cargo.ifEmpty { "cargo" }}" +
                        (if (melhor.estadoUf != "BR") " em ${melhor.estadoUf}" else "")
                )
            )
        } else {
            AiMenuResponse(
                targetRoute = "candidates/todos",
                menuId = "menu_home",
                filters = AiFilterExtraction(buscaTexto = nome),
                directAnswer = "Nenhum candidato com nome semelhante a \"$nome\" foi localizado nos registros oficiais " +
                    "do TSE 2026 (${ctx.candidatos.size} candidatos consultados). Verifique a grafia ou busque por cargo/UF.",
                suggestedQuestions = listOf("Quem disputa a Presidência em 2026?", "Candidatos a Deputado Federal em SP")
            )
        }
    }

    private fun buildPerfilOficial(c: Candidate): String {
        val sb = StringBuilder()
        sb.append("${c.nomeUrna} (número ${c.numero}, ${c.partido}) concorre ao cargo de ${c.cargo.ifEmpty { c.cargoCodigo }}")
        sb.append(if (c.estadoUf == "BR") " no âmbito nacional" else " por ${c.estadoUf}")
        sb.append(". ")
        val extras = mutableListOf<String>()
        c.idade?.let { extras.add("$it anos") }
        c.ocupacao?.let { extras.add("ocupação: ${it.lowercase()}") }
        c.municipioNascimento?.let { extras.add("natural de ${it.lowercase()}${c.ufNascimento?.let { u -> "/$u" } ?: ""}") }
        extras.add("situação da candidatura: ${c.situacaoCandidatura}")
        if (c.fichaLimpa) extras.add("Ficha Limpa sem pendências de inelegibilidade") else extras.add("com fundamentos legais de inelegibilidade no TSE")
        if (c.reeleicao) extras.add("disputa a reeleição")
        if (c.mandatosAnteriores > 0) extras.add("${c.mandatosAnteriores} mandato(s) eletivo(s) anterior(es)")
        sb.append(extras.joinToString("; "))
        sb.append(". Fonte: dados oficiais do TSE (dadosabertos.tse.jus.br).")
        return sb.toString()
    }

    private fun navigateAnswer(cargo: String, uf: String?, partido: String?): AiMenuResponse {
        val display = cargoDisplay(cargo)
        val dig = when (cargo) {
            "PRESIDENTE", "GOVERNADOR" -> 2
            "SENADOR" -> 3
            "DEPUTADO_FEDERAL" -> 4
            else -> 5
        }
        val texto = buildString {
            append("Exibindo candidatos a $display ($dig ")
            append(if (dig == 1) "dígito" else "dígitos")
            append(" na urna)")
            uf?.let { append(" em $it") }
            partido?.let { append(" do partido ${partido.uppercase()}") }
            append(", com dados oficiais do TSE 2026.")
        }
        return AiMenuResponse(
            targetRoute = routeForCargo(cargo),
            menuId = menuForCargo(cargo),
            submenuId = uf?.let { "sub_${it.lowercase()}" },
            filters = AiFilterExtraction(cargo = cargo, estadoUf = uf, partido = partido),
            directAnswer = texto,
            suggestedQuestions = listOf(
                "Candidatos com Ficha Limpa",
                "Quantos candidatos a $display?",
                "Simular voto na Urna 2026"
            )
        )
    }

    // ============================ Helpers ============================

    private fun countBy(ctx: TseKnowledgeContext, partido: String?, uf: String?): Int =
        ctx.candidatos.count { c ->
            (partido == null || c.partido.equals(partido, true)) && (uf == null || c.estadoUf == uf)
        }

    /** Lista de candidatos por cargo: match exato primeiro (titulares), família só como fallback (ex.: DF/Distrital). */
    private fun candidatosDe(ctx: TseKnowledgeContext, cargo: String, uf: String?): List<Candidate> {
        val exatos = ctx.candidatos.filter { it.cargoCodigo == cargo && (uf == null || it.estadoUf == uf) }
        if (exatos.isNotEmpty()) return exatos
        return ctx.candidatos.filter { matchesCargoFamily(it.cargoCodigo, cargo) && (uf == null || it.estadoUf == uf) }
    }

    private fun countCargo(ctx: TseKnowledgeContext, cargo: String, uf: String?): Int =
        candidatosDe(ctx, cargo, uf).size

    private fun cargoDisplay(codigo: String): String = when (codigo) {
        "PRESIDENTE" -> "Presidente da República"
        "GOVERNADOR" -> "Governador"
        "SENADOR" -> "Senador"
        "DEPUTADO_FEDERAL" -> "Deputado Federal"
        "DEPUTADO_ESTADUAL" -> "Deputado Estadual"
        "DEPUTADO_DISTRITAL" -> "Deputado Distrital"
        else -> codigo.replace('_', ' ').lowercase().replaceFirstChar { it.uppercase() }
    }

    private fun matchesCargoFamily(codigoCandidato: String, cargoFiltro: String): Boolean = when (cargoFiltro) {
        "DEPUTADO_ESTADUAL" -> codigoCandidato == "DEPUTADO_ESTADUAL" || codigoCandidato == "DEPUTADO_DISTRITAL"
        "PRESIDENTE" -> codigoCandidato == "PRESIDENTE" || codigoCandidato == "VICE_PRESIDENTE"
        "GOVERNADOR" -> codigoCandidato == "GOVERNADOR" || codigoCandidato == "VICE_GOVERNADOR"
        "SENADOR" -> codigoCandidato == "SENADOR" || codigoCandidato.startsWith("SUPLENTE")
        else -> codigoCandidato == cargoFiltro
    }

    private fun menuForCargo(codigo: String): String = when (codigo) {
        "PRESIDENTE" -> AppConstants.MENU_PRESIDENTE
        "GOVERNADOR" -> AppConstants.MENU_GOVERNADOR
        "SENADOR" -> AppConstants.MENU_SENADOR
        "DEPUTADO_FEDERAL" -> AppConstants.MENU_DEPUTADO_FEDERAL
        "DEPUTADO_ESTADUAL", "DEPUTADO_DISTRITAL" -> AppConstants.MENU_DEPUTADO_ESTADUAL
        else -> "menu_home"
    }

    private fun routeForCargo(codigo: String): String = when (codigo) {
        "PRESIDENTE" -> "candidates/presidente"
        "GOVERNADOR" -> "candidates/governador"
        "SENADOR" -> "candidates/senador"
        "DEPUTADO_FEDERAL" -> "candidates/deputado_federal"
        "DEPUTADO_ESTADUAL", "DEPUTADO_DISTRITAL" -> "candidates/deputado_estadual"
        else -> "candidates/todos"
    }

    private fun extractCargo(lower: String): String? {
        for ((kw, code) in CARGO_KEYWORDS) {
            if (lower.contains(kw)) {
                return if (code == "SENADOR" && lower.contains("senador") && lower.contains("suplente")) "SENADOR" else code
            }
        }
        return null
    }

    private fun extractUf(lower: String): String? {
        // nome completo do estado
        for ((nome, uf) in NOMES_UF) {
            if (Regex("\\b${Regex.escape(nome)}\\b").containsMatchIn(lower)) return uf
        }
        // sigla isolada
        for (uf in UFS) {
            if (Regex("\\b${uf.lowercase()}\\b").containsMatchIn(lower)) return uf
        }
        return null
    }

    private fun extractPartido(lower: String, candidatos: List<Candidate>): String? {
        val siglas = candidatos.map { it.partido }.filter { it.length in 2..12 }.distinct()
        for (sigla in siglas) {
            if (Regex("\\b${Regex.escape(sigla.lowercase())}\\b").containsMatchIn(lower)) return sigla
        }
        // padrão "partido X", "do PT", "do MDB"
        val m = Regex("partido\\s+([a-zà-ú0-9]+)|do\\s+([a-z]{2,12})\\b").find(lower)
        return m?.groupValues?.get(1)?.uppercase()?.takeIf { it in siglas }
            ?: m?.groupValues?.get(2)?.uppercase()?.takeIf { it in siglas }
    }

    private fun extractNomeCandidato(lower: String, candidatos: List<Candidate>): String? {
        // Perguntas de listagem ("quem disputa...", "candidatos a...") não são busca por nome
        if (isListingIntent(lower)) return null
        val stop = setOf("quem", "é", "e", "o", "a", "de", "do", "da", "em", "no", "na", "para", "qual", "candidato",
            "candidata", "informações", "informacoes", "sobre", "número", "numero", "situação", "situacao",
            "candidatura", "mostra", "lista", "ver", "quero", "disputa", "disputam", "concorre",
            "presidente", "presidência", "presidencia", "governador", "senador", "senado", "deputado",
            "federal", "estadual", "distrital", "eleição", "eleicao", "eleições", "eleicoes", "2026", "urna")
        val tokensLixo = stop + setOf("vice", "suplente", "br")
        // Busca por sequência de palavras que coincide com nome de urna oficial
        val palavras = lower.split(Regex("[^a-z0-9áàâãéêíóôõúüç]+")).filter { it.isNotBlank() }
        var melhor: Pair<Int, String>? = null
        for (c in candidatos) {
            val nome = normalize(c.nomeUrna)
            val tokens = nome.split(" ")
            if (tokens.isEmpty()) continue
            // tenta casar o maior prefixo de palavras do nome no texto da query
            // (size 1 exige token >= 4 letras: "LULA", "BOULOS"; rejeita "A", "DA")
            for (size in minOf(tokens.size, 4) downTo 1) {
                val candidatoSeq = tokens.take(size).joinToString(" ")
                val seqTokens = candidatoSeq.split(" ")
                // rejeita sequências genéricas/lixo do TSE: tokens de 1 letra, palavras de cargo, anos
                if (seqTokens.any { it.length < 2 || it in tokensLixo }) continue
                if (candidatoSeq.length < 4) continue
                if (lower.contains(candidatoSeq)) {
                    val score = size
                    if (melhor == null || score > melhor!!.first) melhor = score to candidatoSeq
                    break
                }
            }
        }
        // fallback: "quem é X", "número de X"
        if (melhor != null) return melhor.second
        val regexNome = Regex("(?:quem (?:é|e)|informações sobre|sobre)\\s+(.+)")
        val m = regexNome.find(lower)
        if (m != null) {
            val resto = m.groupValues[1].trim().split(Regex("[?.!]"))[0].trim()
            if (resto.split(" ").size >= 2 && resto.split(" ").none { it in stop } && resto.length in 6..60) return resto
        }
        return null
    }

    private fun normalize(s: String): String = s.trim()
        .lowercase()
        .replace(Regex("[àáâãäå]"), "a")
        .replace(Regex("[èéêë]"), "e")
        .replace(Regex("[ìíîï]"), "i")
        .replace(Regex("[òóôõö]"), "o")
        .replace(Regex("[ùúûü]"), "u")
        .replace("ç", "c")
        .replace(Regex("\\s+"), " ")

    override suspend fun extractFilters(query: String): AiFilterExtraction = parseUserQuery(query).filters

    override suspend fun predictMenuIntent(query: String): IntentType {
        val lower = query.lowercase()
        return when {
            lower.contains("onde votar") || lower.contains("seção") -> IntentType.VOTING_LOCATION_QUERY
            lower.contains("quando") || lower.contains("calendário") -> IntentType.CALENDAR_QUERY
            lower.contains("pesquisa") -> IntentType.EXPLAIN_TOPIC
            lower.contains("candidato") || lower.contains("quem") -> IntentType.FILTER_CANDIDATES
            else -> IntentType.NAVIGATE_MENU
        }
    }
}
