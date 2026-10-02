package net.saibatudo.eleicoes2026.ai.answer

import net.saibatudo.eleicoes2026.ai.model.AiFilterExtraction
import net.saibatudo.eleicoes2026.ai.model.AiMenuResponse
import net.saibatudo.eleicoes2026.ai.model.Intent
import net.saibatudo.eleicoes2026.ai.model.OrigemResposta
import net.saibatudo.eleicoes2026.ai.model.ParsedQuery
import net.saibatudo.eleicoes2026.ai.nlu.Gazetteer
import net.saibatudo.eleicoes2026.ai.nlu.ModeloCargo
import net.saibatudo.eleicoes2026.core.constants.AppConstants
import net.saibatudo.eleicoes2026.data.datasource.ElectionData
import net.saibatudo.eleicoes2026.domain.model.ApuracaoCargo
import net.saibatudo.eleicoes2026.domain.model.ApuracaoProvider
import net.saibatudo.eleicoes2026.domain.model.Candidate
import net.saibatudo.eleicoes2026.domain.model.Datas
import net.saibatudo.eleicoes2026.domain.model.ElectoralFilter
import net.saibatudo.eleicoes2026.domain.model.FaseEleitoral
import net.saibatudo.eleicoes2026.domain.model.FichaLimpa
import net.saibatudo.eleicoes2026.domain.model.HistoricoOpcao
import net.saibatudo.eleicoes2026.domain.model.Texto
import net.saibatudo.eleicoes2026.domain.model.Ufs
import net.saibatudo.eleicoes2026.domain.model.tituloCargo
import net.saibatudo.eleicoes2026.domain.usecase.CandidateQuery
import java.text.NumberFormat
import java.util.Locale

/**
 * Monta a RESPOSTA a partir de uma [ParsedQuery] usando SOMENTE os dados oficiais carregados
 * (e, para apuração ao vivo, o JSON público do TSE). Nenhum texto gerado por modelo de linguagem é exibido
 * como fato: a nuvem ajuda apenas a entender a pergunta.
 *
 * Formato do texto (ver [AiMenuResponse.directAnswer]): 1ª linha = título; "• " = item; "Rótulo: valor" = campo.
 * Princípios: neutralidade (ordem fixa), fonte e data em toda resposta, sem recomendação/previsão de voto,
 * Ficha Limpa = derivação rotulada da situação oficial do registro (não é certidão).
 */
class AnswerBuilder(
    private val data: ElectionData,
    private val gaz: Gazetteer,
    private val hoje: String,
    private val ufPadrao: String? = null,
    private val apuracao: ApuracaoProvider? = null,
    private val origem: OrigemResposta = OrigemResposta.LOCAL
) {
    private val regras = data.regras
    private val fase = FaseEleitoral.de(hoje, regras.turno1, regras.turno2)
    private val fonte: String = buildString {
        append("Fonte: TSE – dados abertos (CC BY)")
        if (regras.extracaoTse.isNotBlank()) append(", extração ${regras.extracaoTse}")
        append(". App independente.")
    }
    private val moeda = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("pt-BR"))
    private val inteiro = NumberFormat.getIntegerInstance(Locale.forLanguageTag("pt-BR"))
    private fun n(v: Int) = inteiro.format(v)

    /** Cargos que dependem do estado: sem UF na pergunta, vale o "Meu estado" do usuário (se ligado). */
    private val cargosEstaduais = setOf("GOVERNADOR", "VICE_GOVERNADOR", "SENADOR", "DEPUTADO_FEDERAL", "DEPUTADO_ESTADUAL", "DEPUTADO_DISTRITAL")

    suspend fun construir(consulta: ParsedQuery): AiMenuResponse {
        val usaMeuEstado = consulta.uf == null && !consulta.nacional && ufPadrao != null && consulta.cargo in cargosEstaduais &&
            consulta.nome == null && consulta.numero == null &&
            consulta.intent in setOf(Intent.LISTAR_CANDIDATOS, Intent.CONTAR, Intent.ELEGIBILIDADE)
        val p = if (usaMeuEstado) consulta.copy(uf = ufPadrao) else consulta
        val r = responder(p)
        return if (usaMeuEstado && r.directAnswer != null)
            r.copy(directAnswer = r.directAnswer + "\nFiltrado pelo seu estado ($ufPadrao). Para ver o Brasil todo, peça \"em todo o Brasil\" ou desligue \"Meu estado\".")
        else r
    }

    private suspend fun responder(p: ParsedQuery): AiMenuResponse = when (p.intent) {
        Intent.RECOMENDACAO -> recomendacao()
        Intent.LISTAR_CANDIDATOS -> listar(p)
        Intent.PERFIL_CANDIDATO -> perfil(p)
        Intent.CONTAR -> contar(p)
        Intent.PESQUISAS -> pesquisas(p)
        Intent.CALENDARIO -> calendario()
        Intent.LOCAL_VOTACAO -> localVotacao()
        Intent.REGRAS_URNA -> regrasUrna()
        Intent.REGRAS_VOTO -> regrasVoto(p)
        Intent.SENADO_DOIS_VOTOS -> senadoDoisVotos()
        Intent.ELEGIBILIDADE -> elegibilidade(p)
        Intent.PLANO_GOVERNO -> planoGoverno(p)
        Intent.CONTAS_CAMPANHA -> contasCampanha(p)
        Intent.RESULTADOS -> resultados(p)
        Intent.SEGUNDO_TURNO -> segundoTurno(p)
        Intent.PATRIMONIO -> patrimonio(p)
        Intent.FONTES -> fontes(p)
        Intent.SOBRE_DADOS -> sobreDados()
        Intent.SIMULADOR -> simulador(p)
        Intent.AJUDA -> ajuda(p)
        Intent.DESCONHECIDA -> desconhecida(p)
    }

    // ------------------------------------------------------------------ listagem e contagem

    private fun listar(p: ParsedQuery): AiMenuResponse {
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
                    citados.forEach { append("\n").append(item(it, mostrarCargo = variosCargos, mostrarUf = variasUfs)) }
                } else {
                    append(".")
                    if (cargo == null) {
                        append("\nPor cargo:")
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
            directAnswer = texto, candidateIds = citados.take(12).map { it.id },
            suggestedQuestions = sugestoesLista(cargo, p.uf), fonte = fonte, origem = origem
        )
    }

    private fun contar(p: ParsedQuery): AiMenuResponse {
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
    private fun localizar(p: ParsedQuery): List<Candidate> = when {
        p.nome != null -> gaz.buscarPorNome(p.nome, if (p.vice) null else p.cargo, p.uf).ifEmpty {
            if (p.cargo != null || p.uf != null) gaz.buscarPorNome(p.nome) else emptyList()
        }
        p.numero != null -> porNumero(p.numero, p.uf ?: ufPadrao.takeUnless { p.nacional })
            .filter { p.cargo == null || ModeloCargo.mesmaFamilia(p.cargo, it) }
        else -> emptyList()
    }

    /** Um único candidato quando a correspondência é inequívoca (nome de urna exato ou majoritário com nome único). */
    private fun escolher(achados: List<Candidate>, termo: String?): Candidate? {
        if (achados.size == 1) return achados.first()
        if (achados.isEmpty()) return null
        val alvo = termo?.let { Texto.normalizar(it) }
        val exatos = achados.filter { Texto.normalizar(it.nomeUrna) == alvo }
        if (exatos.size == 1) return exatos.first()
        val melhor = achados.first()
        return melhor.takeIf { m -> m.ehMajoritario && achados.count { it.nomeUrna.equals(m.nomeUrna, true) } == 1 && termo != null }
    }

    /** Número de urna -> cargos possíveis pelo total de dígitos (regra oficial da urna). */
    private fun porNumero(numero: String, uf: String?): List<Candidate> {
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
    private fun chapa(c: Candidate): List<Candidate> {
        val par = when (c.cargoCodigo) {
            "PRESIDENTE" -> setOf("VICE_PRESIDENTE")
            "VICE_PRESIDENTE" -> setOf("PRESIDENTE")
            "GOVERNADOR" -> setOf("VICE_GOVERNADOR")
            "VICE_GOVERNADOR" -> setOf("GOVERNADOR")
            "SENADOR" -> setOf("SUPLENTE_1", "SUPLENTE_2")
            "SUPLENTE_1", "SUPLENTE_2" -> setOf("SENADOR", "SUPLENTE_1", "SUPLENTE_2") - c.cargoCodigo
            else -> return emptyList()
        }
        return data.candidatos.filter { it.numero == c.numero && it.estadoUf == c.estadoUf && it.cargoCodigo in par }
            .groupBy { it.cargoCodigo }.values.flatMap { g -> g.filter { it.naUrna }.ifEmpty { g } }
            .sortedBy { ModeloCargo.ordem(it.cargoCodigo) }
    }

    private fun naoEncontrado(p: ParsedQuery): AiMenuResponse {
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
    private fun ambiguo(p: ParsedQuery, achados: List<Candidate>): AiMenuResponse {
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

    private fun perfil(p: ParsedQuery): AiMenuResponse {
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

    fun descricaoPerfil(c: Candidate): String = buildString {
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

    // ------------------------------------------------------------------ pesquisas, calendário, regras, fontes

    private fun pesquisas(p: ParsedQuery): AiMenuResponse {
        val filtro = data.pesquisas.filter { x ->
            (p.uf == null || x.uf.equals(p.uf, true)) &&
                (p.cargo == null || x.cargo.orEmpty().split(',').any { c -> ModeloCargo.mesmaFamilia(p.cargo, c.trim().uppercase().replace(' ', '_')) })
        }.sortedByDescending { it.dataRegistro.orEmpty() }
        val qtd = filtro.size
        val texto = buildString {
            append("O TSE tem ${n(qtd)} pesquisa${plural(qtd)} eleitora${if (qtd == 1) "l" else "is"} registrada${plural(qtd)}")
            if (p.uf != null) append(" ${Ufs.em(p.uf)}")
            if (p.cargo != null) append(" (${tituloCargo(p.cargo)})")
            append(".")
            filtro.firstOrNull()?.let {
                append("\nRegistro mais recente: ${it.empresa ?: "empresa não informada"}")
                val det = listOfNotNull(
                    it.dataRegistro?.let { d -> "registrada em ${dataCurta(d)}" },
                    it.dataDivulgacao?.let { d -> "divulgação a partir de ${dataCurta(d)}" },
                    it.entrevistados?.let { e -> "$e entrevistados" }
                )
                if (det.isNotEmpty()) append(" (${det.joinToString("; ")})")
            }
            val inst = filtro.mapNotNull { it.empresa }.distinct().take(6)
            if (inst.isNotEmpty()) append("\nInstitutos com registros recentes: ${inst.joinToString(", ")}")
            append("\nAtenção: o registro no TSE não traz os resultados da pesquisa; consulte o relatório divulgado pelo instituto.")
        }
        return AiMenuResponse(
            targetRoute = "info/pesquisas", menuId = AppConstants.MENU_PESQUISAS, intent = p.intent,
            filters = AiFilterExtraction(estadoUf = p.uf, cargo = p.cargo),
            directAnswer = texto, suggestedQuestions = listOf("Quem disputa a Presidência?", "Calendário eleitoral 2026"),
            fonte = fonte, origem = origem
        )
    }

    private fun calendario(): AiMenuResponse {
        val d1 = dataBr(regras.turno1)
        val d2 = dataBr(regras.turno2)
        val dias1 = Datas.diasEntre(hoje, regras.turno1)
        val situacao = when (fase) {
            FaseEleitoral.PRE_ELEICAO -> "O 1º turno será em $d1 (${if (dias1 == 1L) "amanhã" else "daqui a $dias1 dias"})."
            FaseEleitoral.DIA_1T -> "Hoje é o 1º turno ($d1)."
            FaseEleitoral.ENTRE_TURNOS -> "O 1º turno foi em $d1; o 2º turno, onde houver, será em $d2."
            FaseEleitoral.DIA_2T -> "Hoje é o 2º turno ($d2)."
            FaseEleitoral.POS_ELEICAO -> "As votações ocorreram em $d1 (1º turno) e $d2 (2º turno)."
        }
        val texto = "$situacao\n" +
            "1º turno: $d1\n" +
            "2º turno: $d2 — só onde houver (Presidente e Governador)\n" +
            "Horário de votação: ${regras.horarioVotacao}\n" +
            "Posse: Presidente em 05/01/2027; Governadores em 06/01/2027 (EC 111/2021)\n" +
            "Demais prazos (prestação de contas, diplomação etc.): calendário oficial do TSE — ${AppConstants.URL_CALENDARIO_TSE}"
        return AiMenuResponse(
            targetRoute = "info/calendario", menuId = AppConstants.MENU_CALENDARIO, intent = Intent.CALENDARIO,
            directAnswer = texto, suggestedQuestions = listOf("Onde consultar meu local de votação?", "Quem disputa a Presidência?"),
            fonte = fonte, origem = origem
        )
    }

    private fun localVotacao() = AiMenuResponse(
        targetRoute = "info/locais", menuId = AppConstants.MENU_LOCAIS_VOTACAO, intent = Intent.LOCAL_VOTACAO,
        directAnswer = "Onde votar e situação do título (sistemas oficiais):\n" +
            "• Local de votação e título: Autoatendimento do Eleitor (${AppConstants.URL_AUTOATENDIMENTO_ELEITOR}) ou app e-Título\n" +
            "• Justificar a ausência: app e-Título ou sistema Justifica\n" +
            "• No dia: leve documento oficial com foto (o e-Título com foto também vale)\n" +
            "O app não consulta dados pessoais do eleitor.",
        suggestedQuestions = listOf("Calendário eleitoral 2026", "Ordem de votação na urna"), fonte = fonte, origem = origem
    )

    private fun regrasUrna(): AiMenuResponse {
        val etapas = regras.ordemVotacaoUrna.sortedBy { it.ordem }.joinToString("\n") { "• ${it.ordem}º) ${it.cargo} — ${it.digitos} dígitos" }
        return AiMenuResponse(
            targetRoute = "urna/simulador", menuId = AppConstants.MENU_REGRAS_ELEITORAIS, intent = Intent.REGRAS_URNA,
            directAnswer = "Ordem de votação na urna eletrônica em 2026:\n$etapas\n" +
                "Como votar: digite o número, confira foto, nome e partido e aperte CONFIRMA (CORRIGE apaga; BRANCO vota em branco).\n" +
                "O simulador do app é educativo: não é a urna oficial e não registra votos.",
            suggestedQuestions = listOf("Regra dos dois senadores", "Simular voto na urna"), fonte = fonte, origem = origem
        )
    }

    private fun regrasVoto(p: ParsedQuery): AiMenuResponse {
        val t = Texto.normalizar(p.textoOriginal)
        val obrigatoriedade = Regex("""obrigat|facultativ|multa|nao votar|obrigad""").containsMatchIn(t)
        val brancoNulo = Regex("""nul|branco|validos|anular""").containsMatchIn(t) || !obrigatoriedade
        val texto = buildString {
            if (brancoNulo) {
                append("Voto em branco e voto nulo (regras oficiais):")
                append("\n• Nenhum dos dois conta como voto válido: só contam os votos dados a candidatos e, nas eleições proporcionais, às legendas (Constituição, art. 77, §2º; Lei 9.504/1997, arts. 2º e 5º).")
                append("\n• Na urna: para votar em branco, aperte BRANCO e CONFIRMA; voto nulo é digitar um número que não corresponde a candidato nem a partido e confirmar.")
                append("\n• Mesmo que a maioria vote nulo, a eleição NÃO é anulada: a anulação do Código Eleitoral (art. 224) trata de votos anulados pela Justiça Eleitoral, por exemplo por fraude, e não do voto nulo do eleitor.")
            }
            if (obrigatoriedade) {
                if (isNotEmpty()) append("\n")
                append("Quem deve votar (Constituição, art. 14, §1º):")
                append("\n• Obrigatório: eleitores de 18 a 70 anos.")
                append("\n• Facultativo: jovens de 16 e 17 anos, maiores de 70 anos e analfabetos.")
                append("\n• Quem não votar deve justificar no dia da eleição ou em até 60 dias após cada turno (app e-Título ou sistema Justifica); sem justificativa, há multa e restrições até a regularização.")
            }
        }
        return AiMenuResponse(
            targetRoute = "info/regras", menuId = AppConstants.MENU_REGRAS_ELEITORAIS, intent = Intent.REGRAS_VOTO,
            directAnswer = texto, suggestedQuestions = listOf("Ordem de votação na urna", "Onde consultar meu local de votação?"),
            fonte = "Fonte: Constituição Federal, Lei 9.504/1997 e Código Eleitoral; orientações do TSE (${AppConstants.URL_PORTAL_TSE_2026}).",
            origem = origem
        )
    }

    private fun senadoDoisVotos() = AiMenuResponse(
        targetRoute = "candidates/senador", menuId = AppConstants.MENU_SENADOR, intent = Intent.SENADO_DOIS_VOTOS,
        filters = AiFilterExtraction(cargo = "SENADOR", resetar = true),
        directAnswer = "Em 2026 cada eleitor vota em DOIS senadores (renovação de 2/3 do Senado):\n" +
            "• 1ª vaga e 2ª vaga: 3 dígitos cada\n" +
            "• Os dois votos devem ser para candidatos diferentes: se o mesmo número for digitado nas duas vagas, o segundo voto é anulado pela urna.",
        suggestedQuestions = listOf("Candidatos ao Senado em ${ufPadrao ?: "SP"}", "Ordem de votação na urna"), fonte = fonte, origem = origem
    )

    private fun fontes(p: ParsedQuery): AiMenuResponse {
        val tre = p.uf?.let { u -> data.fontes?.tres?.firstOrNull { it.uf == u } }
        val texto = buildString {
            append("Fontes oficiais:")
            AppConstants.SISTEMAS_OFICIAIS_TSE.forEach { append("\n• ${it.first}: ${it.second}") }
            tre?.let { append("\n• ${it.tribunal}: ${it.url}") }
        }
        return AiMenuResponse(
            targetRoute = "info/fontes", menuId = AppConstants.MENU_REGRAS_ELEITORAIS, intent = Intent.FONTES,
            directAnswer = texto, suggestedQuestions = listOf("De onde vêm os dados?"), fonte = fonte, origem = origem
        )
    }

    private fun sobreDados(): AiMenuResponse {
        val m = data.manifest
        val texto = "Sobre os dados do app:\n" +
            "Fonte: arquivos abertos do TSE (${AppConstants.URL_DADOS_ABERTOS_TSE}), licença CC BY\n" +
            "Extração do TSE: ${regras.extracaoTse.ifBlank { "—" }}\n" +
            "Pacote: ${m.dataVersion} (${data.origem})\n" +
            "Conteúdo: ${n(regras.estatisticas.totalRegistros)} candidaturas · ${n(regras.estatisticas.pesquisasRegistradas)} pesquisas registradas\n" +
            "O app verifica atualizações automaticamente e confere a assinatura digital dos dados."
        return AiMenuResponse(
            targetRoute = "info/sobre", menuId = AppConstants.MENU_REGRAS_ELEITORAIS, intent = Intent.SOBRE_DADOS,
            directAnswer = texto, suggestedQuestions = listOf("Quem disputa a Presidência?"), fonte = fonte, origem = origem
        )
    }

    // ------------------------------------------------------------------ Ficha Limpa, plano, contas, patrimônio

    private fun elegibilidade(p: ParsedQuery): AiMenuResponse {
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

    private fun planoGoverno(p: ParsedQuery): AiMenuResponse {
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

    private fun contasCampanha(p: ParsedQuery): AiMenuResponse {
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

    private fun patrimonio(p: ParsedQuery): AiMenuResponse {
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
        return AiMenuResponse(
            targetRoute = "candidates/todos", menuId = AppConstants.MENU_HOME, intent = p.intent,
            directAnswer = "Patrimônio declarado ao TSE:\n" +
                "• É o total de bens que cada candidato informou no registro de candidatura\n" +
                "• O app não ordena candidatos por patrimônio (ordem sempre fixa)\n" +
                "Pergunte pelo nome (ex.: \"Qual o patrimônio declarado de Fulano?\") ou abra a ficha do candidato.",
            suggestedQuestions = listOf("Quem disputa a Presidência?"), fonte = fonte, origem = origem
        )
    }

    // ------------------------------------------------------------------ resultados

    private suspend fun resultados(p: ParsedQuery): AiMenuResponse {
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
        if (cargo == null || cargo !in setOf("PRESIDENTE", "GOVERNADOR", "SENADOR")) {
            return AiMenuResponse(
                targetRoute = "info/resultados", menuId = AppConstants.MENU_RESULTADOS, intent = p.intent, filters = abrir,
                abrirResultados = true,
                directAnswer = "De qual cargo você quer ver os resultados?\n" +
                    "• Presidente, Governador e Senador: apuração aqui no app (informe o estado para Governador e Senador)\n" +
                    "• Deputados: resultados oficiais completos em ${AppConstants.URL_RESULTADOS_TSE}",
                suggestedQuestions = listOf("Resultado para Presidente", "Resultado para Governador em ${ufPadrao ?: "SP"}", "Resultado para Senador em ${ufPadrao ?: "SP"}"),
                fonte = fonte, origem = origem
            )
        }
        val uf = if (cargo == "PRESIDENTE") "BR" else (p.uf ?: ufPadrao)
        if (uf == null) {
            return AiMenuResponse(
                targetRoute = "info/resultados", menuId = AppConstants.MENU_RESULTADOS, intent = p.intent, filters = abrir,
                directAnswer = "De qual estado? Informe a UF (ex.: \"Resultado para ${tituloCargo(cargo)} em SP\").",
                suggestedQuestions = listOf("Resultado para ${tituloCargo(cargo)} em SP"), fonte = fonte, origem = origem
            )
        }
        val turno = p.turno ?: if (fase == FaseEleitoral.ENTRE_TURNOS || fase == FaseEleitoral.DIA_2T || fase == FaseEleitoral.POS_ELEICAO) 2 else 1
        val ap = obterApuracao(cargo, uf, turno) ?: obterApuracao(cargo, uf, 1)?.takeIf { turno == 2 }
        return if (ap != null && ap.temVotos) respostaApuracao(p, ap, abrir)
        else respostaResultadosCsv(p, cargo, uf, turno, abrir)
    }

    private suspend fun obterApuracao(cargo: String, uf: String, turno: Int): ApuracaoCargo? =
        try { apuracao?.obter(cargo, uf, turno) } catch (_: Exception) { null }

    private fun respostaApuracao(p: ParsedQuery, ap: ApuracaoCargo, filtros: AiFilterExtraction): AiMenuResponse {
        val ordenadas = ap.linhas.sortedByDescending { it.votos }
        val max = if (ap.cargo == "PRESIDENTE" || ap.linhas.size <= 12) ordenadas.size else 10
        val andamento = if (ap.totalizacaoFinal) "Totalização final." else
            "Apuração em andamento" + (ap.secoesTotalizadasPct?.let { " (${it}% das seções totalizadas)" } ?: "") + "."
        val texto = buildString {
            append("${tituloCargo(ap.cargo)}${if (ap.uf != "BR") " — ${ap.uf}" else ""}, ${ap.turno}º turno. $andamento")
            ordenadas.take(max).forEach {
                append("\n• ${it.numero} — ${it.nome} (${it.partido}): ${inteiro.format(it.votos)} votos")
                it.percentual?.let { pc -> append(" ($pc%)") }
                if (it.eleito) append(" — ELEITO")
            }
            if (ordenadas.size > max) append("\n…e outros ${ordenadas.size - max}.")
            append("\nDados divulgados pelo TSE em ${ap.geradoEm}; números exibidos como publicados (${AppConstants.URL_RESULTADOS_TSE}).")
        }
        return AiMenuResponse(
            targetRoute = "info/resultados", menuId = AppConstants.MENU_RESULTADOS, intent = p.intent, filters = filtros,
            directAnswer = texto, abrirResultados = true, candidateIds = ordenadas.take(6).mapNotNull { it.sqCandidato }
                .filter { data.porId.containsKey(it) },
            suggestedQuestions = listOf("Quem foi eleito Governador em ${ap.uf.takeIf { it != "BR" } ?: ufPadrao ?: "SP"}?", "Candidatos ao segundo turno"),
            fonte = "Fonte: TSE – resultados.tse.jus.br (ao vivo), consultado agora.", origem = origem
        )
    }

    private fun respostaResultadosCsv(p: ParsedQuery, cargo: String, uf: String, turno: Int, filtros: AiFilterExtraction): AiMenuResponse {
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

    private suspend fun segundoTurno(p: ParsedQuery): AiMenuResponse {
        if (fase == FaseEleitoral.PRE_ELEICAO || fase == FaseEleitoral.DIA_1T) {
            return AiMenuResponse(
                targetRoute = "info/calendario", menuId = AppConstants.MENU_CALENDARIO, intent = p.intent,
                directAnswer = "Segundo turno: ${dataBr(regras.turno2)}\n" +
                    "• Só para Presidente e Governador, quando nenhum candidato alcança mais de 50% dos votos válidos no 1º turno\n" +
                    "• Os candidatos do 2º turno só são conhecidos após a apuração de ${dataBr(regras.turno1)}",
                suggestedQuestions = listOf("Calendário eleitoral 2026"), fonte = fonte, origem = origem
            )
        }
        val resp = resultados(p.copy(intent = Intent.RESULTADOS, turno = p.turno ?: 1))
        return resp.copy(intent = Intent.SEGUNDO_TURNO)
    }

    // ------------------------------------------------------------------ simulador, ajuda, recomendação, desconhecida

    private fun simulador(p: ParsedQuery): AiMenuResponse {
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

    private fun ajuda(p: ParsedQuery): AiMenuResponse {
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

    private fun recomendacao() = AiMenuResponse(
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

    private fun desconhecida(p: ParsedQuery) = AiMenuResponse(
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

    // ------------------------------------------------------------------ helpers

    private fun dataBr(iso: String) = Datas.formatarBr(iso)
    private fun dataCurta(s: String) = if (s.length >= 10 && s[4] == '-') Datas.formatarBr(s.take(10)) else s
    private fun plural(qtd: Int) = if (qtd == 1) "" else "s"
    private fun titulo(s: String) = s.lowercase().split(' ').joinToString(" ") { it.replaceFirstChar(Char::uppercase) }
    private fun localDe(c: Candidate) = if (c.estadoUf == "BR") "" else " ${c.estadoUf}"

    /** Item de lista padronizado: número primeiro (como na urna), nome e partido. */
    private fun item(c: Candidate, mostrarCargo: Boolean, mostrarUf: Boolean): String = buildString {
        append("• ${c.numero} — ${c.nomeUrna} (${c.partido})")
        val extras = listOfNotNull(c.cargo.takeIf { mostrarCargo }, c.estadoUf.takeIf { mostrarUf && it != "BR" })
        if (extras.isNotEmpty()) append(" · ${extras.joinToString(" ")}")
        if (!c.naUrna) append(" — fora da urna")
    }

    private fun montarTitulo(cargo: String?, p: ParsedQuery): String = buildString {
        if (cargo != null) append("a ${tituloCargo(cargo)}")
        else append("em todos os cargos")
        p.partido?.let { append(" do partido $it") }
        p.uf?.let { append(" ${Ufs.em(it)}") }
        p.genero?.let { append(if (it == "FEMININO") " (mulheres)" else " (homens)") }
        p.historico?.takeIf { it != HistoricoOpcao.TODOS }?.let { append(" (${it.label.lowercase()})") }
    }

    private fun tituloCargoDe(codigo: String) = when (codigo) {
        "PRESIDENTE", "VICE_PRESIDENTE" -> "a Presidência"
        "GOVERNADOR", "VICE_GOVERNADOR" -> "o Governo"
        "SENADOR", "SUPLENTE_1", "SUPLENTE_2" -> "o Senado"
        else -> tituloCargo(codigo)
    }

    private fun sugestoesLista(cargo: String?, uf: String?) = listOfNotNull(
        "Quantos candidatos ${cargo?.let { "a ${tituloCargo(it)}" } ?: "no total"}${uf?.let { " em $it" } ?: ""}?",
        cargo?.let { "Ficha Limpa dos candidatos a ${tituloCargo(it)}${uf?.let { u -> " em $u" } ?: ""}" },
        "Simular voto na urna",
        "Pesquisas registradas${uf?.let { " em $it" } ?: ""}"
    )

    private fun rotaCargo(c: String?) = when (c) {
        "PRESIDENTE", "VICE_PRESIDENTE" -> "candidates/presidente"
        "GOVERNADOR", "VICE_GOVERNADOR" -> "candidates/governador"
        "SENADOR", "SUPLENTE_1", "SUPLENTE_2" -> "candidates/senador"
        "DEPUTADO_FEDERAL" -> "candidates/deputado_federal"
        "DEPUTADO_ESTADUAL", "DEPUTADO_DISTRITAL" -> "candidates/deputado_estadual"
        else -> "candidates/todos"
    }

    private fun menuCargo(c: String?) = when (c) {
        "PRESIDENTE", "VICE_PRESIDENTE" -> AppConstants.MENU_PRESIDENTE
        "GOVERNADOR", "VICE_GOVERNADOR" -> AppConstants.MENU_GOVERNADOR
        "SENADOR", "SUPLENTE_1", "SUPLENTE_2" -> AppConstants.MENU_SENADOR
        "DEPUTADO_FEDERAL" -> AppConstants.MENU_DEPUTADO_FEDERAL
        "DEPUTADO_ESTADUAL", "DEPUTADO_DISTRITAL" -> AppConstants.MENU_DEPUTADO_ESTADUAL
        else -> AppConstants.MENU_HOME
    }
}
