package net.saibatudo.eleicoes2026.ai.answer

import net.saibatudo.eleicoes2026.ai.model.AiFilterExtraction
import net.saibatudo.eleicoes2026.ai.model.AiMenuResponse
import net.saibatudo.eleicoes2026.ai.model.Intent
import net.saibatudo.eleicoes2026.ai.model.OrigemResposta
import net.saibatudo.eleicoes2026.ai.model.ParsedQuery
import net.saibatudo.eleicoes2026.ai.nlu.Gazetteer
import net.saibatudo.eleicoes2026.core.constants.AppConstants
import net.saibatudo.eleicoes2026.data.datasource.ElectionData
import net.saibatudo.eleicoes2026.domain.model.ApuracaoCargo
import net.saibatudo.eleicoes2026.domain.model.ApuracaoProvider
import net.saibatudo.eleicoes2026.domain.model.Candidate
import net.saibatudo.eleicoes2026.domain.model.Datas
import net.saibatudo.eleicoes2026.domain.model.Elegibilidade
import net.saibatudo.eleicoes2026.domain.model.ElectoralFilter
import net.saibatudo.eleicoes2026.domain.model.FaseEleitoral
import net.saibatudo.eleicoes2026.domain.model.HistoricoOpcao
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
 * Princípios: neutralidade (ordem fixa), fonte e data em toda resposta, sem recomendação/previsão de voto,
 * elegibilidade = situação oficial do TSE (não é certidão de "Ficha Limpa").
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

    /** Cargos que dependem do estado: sem UF na pergunta, vale o "Meu estado" do usuário (se ligado). */
    private val cargosEstaduais = setOf("GOVERNADOR", "VICE_GOVERNADOR", "SENADOR", "DEPUTADO_FEDERAL", "DEPUTADO_ESTADUAL", "DEPUTADO_DISTRITAL")

    suspend fun construir(consulta: ParsedQuery): AiMenuResponse {
        val usaMeuEstado = consulta.uf == null && ufPadrao != null && consulta.cargo in cargosEstaduais &&
            consulta.intent in setOf(Intent.LISTAR_CANDIDATOS, Intent.CONTAR)
        val p = if (usaMeuEstado) consulta.copy(uf = ufPadrao) else consulta
        val r = responder(p)
        return if (usaMeuEstado && r.directAnswer != null)
            r.copy(directAnswer = r.directAnswer + " (Filtrado pelo seu estado, $ufPadrao; para ver o Brasil todo, peça \"em todo o Brasil\" ou desligue \"Meu estado\".)")
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
        Intent.SENADO_DOIS_VOTOS -> senadoDoisVotos()
        Intent.ELEGIBILIDADE -> elegibilidade(p)
        Intent.RESULTADOS -> resultados(p)
        Intent.SEGUNDO_TURNO -> segundoTurno(p)
        Intent.PATRIMONIO -> patrimonio(p)
        Intent.FONTES -> fontes(p)
        Intent.SOBRE_DADOS -> sobreDados()
        Intent.DESCONHECIDA -> desconhecida(p)
    }

    // ------------------------------------------------------------------ listagem e contagem

    private fun listar(p: ParsedQuery): AiMenuResponse {
        val cargo = p.cargo
        val filtros = AiFilterExtraction(
            cargo = cargo, estadoUf = p.uf, partido = p.partido, tema = p.tema,
            apenasDeferidas = p.apenasDeferidas, historico = p.historico, resetar = true
        )
        val lista = CandidateQuery.filtrar(
            data.candidatos,
            ElectoralFilter(
                estadoUf = p.uf, cargo = cargo, apenasNaUrna = true, apenasDeferidas = p.apenasDeferidas == true,
                historico = p.historico ?: HistoricoOpcao.TODOS, partido = p.partido, tema = p.tema
            )
        ).filter { cargo != null || p.uf == null || it.estadoUf == p.uf } // sem cargo: só a UF pedida (sem nacionais)
        // Em listas por cargo (sem partido/tema) citamos só os titulares; vices/suplentes aparecem nos cartões
        val citados = if (cargo != null && p.partido == null && p.tema == null) lista.filter { it.cargoCodigo == cargo } else lista
        val titulo = montarTitulo(cargo, p)
        val texto = buildString {
            if (citados.isEmpty()) {
                append("Não encontrei candidaturas na urna $titulo nos dados oficiais do TSE.")
            } else {
                val n = citados.size
                append("O TSE registra $n candidatura${if (n == 1) "" else "s"} na urna $titulo")
                if (n <= 30) {
                    append(": ")
                    append(citados.joinToString("; ") {
                        "${it.nomeUrna} (${it.partido}${if (it.estadoUf != "BR" && p.uf == null) "-${it.estadoUf}" else ""}, nº ${it.numero})"
                    })
                    append(".")
                } else {
                    append(". A lista completa está nos cartões abaixo, em ordem fixa por cargo, estado e número.")
                }
                if (p.tema != null) {
                    append(" Tema \"${regras.temas[p.tema] ?: p.tema}\": inclui apenas candidatos com plano de governo registrado " +
                        "(${regras.estatisticas.candidatosComPlanoGoverno} no total) cujo texto cita o tema com frequência.")
                }
                if (p.apenasDeferidas == true) {
                    append(" Filtro: candidaturas deferidas pelo TSE (não é certidão de Ficha Limpa).")
                }
            }
            val fora = cargo?.let { c ->
                data.candidatos.count { it.cargoCodigo == c && !it.naUrna && (p.uf == null || it.estadoUf == p.uf) }
            } ?: 0
            if (fora > 0 && p.partido == null && p.tema == null) {
                append(" Há ainda $fora registro${if (fora == 1) "" else "s"} fora da urna (renúncia, indeferimento etc.).")
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
        val total = data.candidatos.count { c ->
            (cargo == null || c.cargoCodigo == cargo) && (p.uf == null || c.estadoUf == p.uf) &&
                (p.partido == null || c.partido.equals(p.partido, true)) && c.naUrna
        }
        val registros = data.candidatos.count { c ->
            (cargo == null || c.cargoCodigo == cargo) && (p.uf == null || c.estadoUf == p.uf) &&
                (p.partido == null || c.partido.equals(p.partido, true))
        }
        val titulo = montarTitulo(cargo, p)
        val texto = "O TSE registra $registros candidatura${if (registros == 1) "" else "s"} $titulo, " +
            "sendo $total inserida${if (total == 1) "" else "s"} na urna." +
            if (cargo == null && p.uf == null && p.partido == null)
                " Por cargo (na urna): " + regras.estatisticas.porCargoNaUrna.entries.sortedByDescending { it.value }
                    .joinToString(", ") { "${it.key.lowercase().replaceFirstChar(Char::uppercase)}: ${inteiro.format(it.value)}" } + "."
            else ""
        return AiMenuResponse(
            targetRoute = rotaCargo(cargo), menuId = menuCargo(cargo), intent = p.intent,
            filters = AiFilterExtraction(cargo = cargo, estadoUf = p.uf, partido = p.partido, resetar = true),
            directAnswer = texto, suggestedQuestions = sugestoesLista(cargo, p.uf), fonte = fonte, origem = origem
        )
    }

    // ------------------------------------------------------------------ perfil

    private fun perfil(p: ParsedQuery): AiMenuResponse {
        val achados = gaz.buscarPorNome(p.nome.orEmpty(), p.cargo, p.uf)
        if (achados.isEmpty()) return naoEncontrado(p)
        return montarPerfil(p, achados)
    }

    private fun montarPerfil(p: ParsedQuery, achados: List<Candidate>): AiMenuResponse {
        val melhor = achados.first()
        val unico = achados.size == 1 ||
            (achados.count { it.nomeUrna.equals(melhor.nomeUrna, true) } == 1 && melhor.ehMajoritario)
        if (!unico) {
            val lista = achados.take(8).joinToString("; ") {
                "${it.nomeUrna} (${it.cargo} ${if (it.estadoUf == "BR") "nacional" else it.estadoUf}, ${it.partido}, nº ${it.numero})"
            }
            return AiMenuResponse(
                targetRoute = "candidates/todos", menuId = AppConstants.MENU_HOME, intent = p.intent,
                filters = AiFilterExtraction(buscaTexto = p.nome, resetar = true),
                directAnswer = "Encontrei ${achados.size} candidaturas com \"${p.nome}\": $lista" +
                    (if (achados.size > 8) " e outras" else "") + ". Informe o cargo ou o estado para refinar.",
                candidateIds = achados.take(12).map { it.id },
                suggestedQuestions = listOf("Candidatos a ${melhor.cargo}", "Quantos candidatos no total?"),
                fonte = fonte, origem = origem
            )
        }
        return AiMenuResponse(
            targetRoute = rotaCargo(melhor.cargoCodigo), menuId = menuCargo(melhor.cargoCodigo),
            submenuId = melhor.estadoUf.takeIf { it != "BR" }?.let { "sub_${it.lowercase()}" }, intent = p.intent,
            filters = AiFilterExtraction(buscaTexto = melhor.nomeUrna, resetar = true),
            directAnswer = descricaoPerfil(melhor), candidateIds = listOf(melhor.id),
            suggestedQuestions = listOf("Simular voto em ${melhor.nomeUrna} (${melhor.numero})",
                "Quem disputa ${tituloCargoDe(melhor.cargoCodigo)}${if (melhor.estadoUf != "BR") " em ${melhor.estadoUf}" else ""}?"),
            fonte = fonte, origem = origem
        )
    }

    private fun naoEncontrado(p: ParsedQuery) = AiMenuResponse(
        targetRoute = "candidates/todos", menuId = AppConstants.MENU_HOME, intent = p.intent,
        filters = AiFilterExtraction(buscaTexto = p.nome, resetar = true),
        directAnswer = "Nenhum candidato com nome semelhante a \"${p.nome}\" nos registros oficiais do TSE " +
            "(${inteiro.format(data.candidatos.size)} candidaturas). Verifique a grafia ou busque por cargo/UF.",
        suggestedQuestions = listOf("Quem disputa a Presidência?", "Candidatos a Governador em ${ufPadrao ?: "SP"}"),
        fonte = fonte, origem = origem
    )

    fun descricaoPerfil(c: Candidate): String = buildString {
        append("${c.nomeUrna} (${c.nomeCompleto.lowercase().split(' ').joinToString(" ") { it.replaceFirstChar(Char::uppercase) }}), ")
        append("número ${c.numero}, ${c.partido}")
        append(" — ${c.cargo}")
        append(if (c.estadoUf == "BR") " (nacional)" else " por ${Ufs.NOMES[c.estadoUf] ?: c.estadoUf}")
        append(". ")
        val partes = mutableListOf<String>()
        c.idade?.let { partes += "$it anos" }
        c.ocupacao?.let { partes += "ocupação declarada: ${it.lowercase()}" }
        c.municipioNascimento?.let { partes += "natural de ${it.lowercase().split(' ').joinToString(" ") { w -> w.replaceFirstChar(Char::uppercase) }}${c.ufNascimento?.let { u -> "/$u" } ?: ""}" }
        if (partes.isNotEmpty()) append(partes.joinToString("; ")).append(". ")
        append("Situação da candidatura no TSE: ${c.elegibilidade.rotulo}")
        c.situacao?.let { if (!it.equals(c.elegibilidade.rotulo, true)) append(" (\"$it\")") }
        append(if (c.naUrna) "; inserida na urna." else "; NÃO está inserida na urna.")
        if (c.motivosIndeferimento.isNotEmpty()) {
            append(" Motivos registrados: ${c.motivosIndeferimento.joinToString("; ")}.")
        }
        if (c.vezesEleito > 0) {
            append(" Eleito ${c.vezesEleito} vez${if (c.vezesEleito == 1) "" else "es"} em eleições anteriores (histórico do TSE)")
            if (c.eleitoMesmoCargo) append(", inclusive para este mesmo cargo")
            append(".")
        }
        c.patrimonioDeclarado?.let { append(" Patrimônio declarado ao TSE: ${moeda.format(it)} (${c.qtdBens ?: "?"} bens).") }
        c.contas?.takeIf { it.receitas > 0 || it.despesasContratadas > 0 }?.let {
            append(" Prestação de contas (${it.tipo?.lowercase() ?: "parcial"}): receitas ${moeda.format(it.receitas)}, despesas contratadas ${moeda.format(it.despesasContratadas)}.")
        }
        if (c.temPlanoGoverno) append(" Possui plano de governo registrado no TSE.")
        c.resultado?.takeIf { it.turnos.isNotEmpty() || it.situacaoTotalizacao != null }?.let { r ->
            append(" Resultado oficial: ")
            append(r.situacaoTotalizacao ?: "")
            r.turnos.entries.sortedBy { it.key }.forEach { (t, v) ->
                append(" ${t}º turno: ${v.votos?.let { inteiro.format(it) } ?: "—"} votos")
                v.percentual?.let { pc -> append(" (${"%.2f".format(Locale.forLanguageTag("pt-BR"), pc)}%)") }
                append(";")
            }
        }
    }

    // ------------------------------------------------------------------ pesquisas, calendário, regras, fontes

    private fun pesquisas(p: ParsedQuery): AiMenuResponse {
        val filtro = data.pesquisas.filter { x ->
            (p.uf == null || x.uf.equals(p.uf, true)) && (p.cargo == null || x.cargo.orEmpty().uppercase().replace(' ', '_').startsWith(p.cargo.take(8)))
        }
        val texto = buildString {
            append("O TSE tem ${inteiro.format(filtro.size)} pesquisa${if (filtro.size == 1) "" else "s"} eleitoral${if (filtro.size == 1) "" else "is"} registrada${if (filtro.size == 1) "" else "s"}")
            if (p.uf != null) append(" para ${p.uf}")
            if (p.cargo != null) append(" (${tituloCargo(p.cargo)})")
            append(".")
            filtro.firstOrNull()?.let {
                append(" Mais recente: ${it.empresa ?: "empresa não informada"}")
                it.dataDivulgacao?.let { d -> append(", divulgação em ${d.take(10)}") }
                it.entrevistados?.let { n -> append(", $n entrevistados") }
                append(".")
            }
            val inst = filtro.mapNotNull { it.empresa }.distinct().take(6)
            if (inst.isNotEmpty()) append(" Institutos: ${inst.joinToString(", ")}.")
            append(" Atenção: o registro no TSE não informa os resultados da pesquisa; consulte o relatório divulgado pelo instituto.")
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
            FaseEleitoral.PRE_ELEICAO -> "O 1º turno será em $d1 (${if (dias1 == 1L) "amanhã" else "daqui a $dias1 dias"}); " +
                "o 2º turno, se houver (Presidente e Governador), em $d2."
            FaseEleitoral.DIA_1T -> "Hoje é o 1º turno ($d1). O 2º turno, se houver, será em $d2."
            FaseEleitoral.ENTRE_TURNOS -> "O 1º turno foi em $d1. O 2º turno, para os cargos sem maioria absoluta, será em $d2."
            FaseEleitoral.DIA_2T -> "Hoje é o 2º turno ($d2)."
            FaseEleitoral.POS_ELEICAO -> "As votações ocorreram em $d1 (1º turno) e $d2 (2º turno)."
        }
        val texto = "$situacao Votação: ${regras.horarioVotacao}. " +
            "Posse (EC 111/2021): Presidente em 05/01/2027 e Governadores em 06/01/2027. " +
            "Demais prazos (prestação de contas, diplomação etc.): consulte o calendário oficial do TSE (${AppConstants.URL_CALENDARIO_TSE})."
        return AiMenuResponse(
            targetRoute = "info/calendario", menuId = AppConstants.MENU_CALENDARIO, intent = Intent.CALENDARIO,
            directAnswer = texto, suggestedQuestions = listOf("Onde consultar meu local de votação?", "Quem disputa a Presidência?"),
            fonte = fonte, origem = origem
        )
    }

    private fun localVotacao() = AiMenuResponse(
        targetRoute = "info/locais", menuId = AppConstants.MENU_LOCAIS_VOTACAO, intent = Intent.LOCAL_VOTACAO,
        directAnswer = "Para saber onde votar e a situação do título, use os sistemas oficiais: " +
            "Autoatendimento do Eleitor (${AppConstants.URL_AUTOATENDIMENTO_ELEITOR}) ou o app e-Título. " +
            "Para justificar a ausência, use o Justifica ou o e-Título. Leve documento oficial com foto. " +
            "O app não consulta dados pessoais do eleitor.",
        suggestedQuestions = listOf("Calendário eleitoral 2026", "Ordem de votação na urna"), fonte = fonte, origem = origem
    )

    private fun regrasUrna(): AiMenuResponse {
        val etapas = regras.ordemVotacaoUrna.sortedBy { it.ordem }
            .joinToString("; ") { "${it.ordem}º) ${it.cargo} (${it.digitos} dígitos)" }
        return AiMenuResponse(
            targetRoute = "urna/simulador", menuId = AppConstants.MENU_REGRAS_ELEITORAIS, intent = Intent.REGRAS_URNA,
            directAnswer = "Ordem de votação na urna eletrônica em 2026: $etapas. O simulador do app é apenas educativo " +
                "e não é a urna oficial nem registra votos.",
            suggestedQuestions = listOf("Regra dos dois senadores", "Simular voto na urna"), fonte = fonte, origem = origem
        )
    }

    private fun senadoDoisVotos() = AiMenuResponse(
        targetRoute = "candidates/senador", menuId = AppConstants.MENU_SENADOR, intent = Intent.SENADO_DOIS_VOTOS,
        filters = AiFilterExtraction(cargo = "SENADOR", resetar = true),
        directAnswer = "Em 2026 há renovação de 2/3 do Senado: cada eleitor vota em DOIS senadores diferentes (1ª e 2ª vaga, " +
            "3 dígitos cada). Se o mesmo candidato for digitado nas duas vagas, o segundo voto é anulado pela urna.",
        suggestedQuestions = listOf("Candidatos ao Senado em ${ufPadrao ?: "SP"}", "Ordem de votação na urna"), fonte = fonte, origem = origem
    )

    private fun fontes(p: ParsedQuery): AiMenuResponse {
        val tre = p.uf?.let { u -> data.fontes?.tres?.firstOrNull { it.uf == u } }
        val texto = buildString {
            append("Fontes oficiais: ")
            append(AppConstants.SISTEMAS_OFICIAIS_TSE.joinToString("; ") { "${it.first} (${it.second})" })
            tre?.let { append("; ${it.tribunal}: ${it.url}") }
            append(".")
        }
        return AiMenuResponse(
            targetRoute = "info/fontes", menuId = AppConstants.MENU_REGRAS_ELEITORAIS, intent = Intent.FONTES,
            directAnswer = texto, suggestedQuestions = listOf("De onde vêm os dados?"), fonte = fonte, origem = origem
        )
    }

    private fun sobreDados(): AiMenuResponse {
        val m = data.manifest
        val texto = "Os dados vêm dos arquivos abertos do TSE (${AppConstants.URL_DADOS_ABERTOS_TSE}), licença CC BY. " +
            "Pacote ${m.dataVersion}, extração do TSE em ${regras.extracaoTse.ifBlank { "—" }}, origem: ${data.origem}. " +
            "${inteiro.format(regras.estatisticas.totalRegistros)} candidaturas, ${inteiro.format(regras.estatisticas.pesquisasRegistradas)} pesquisas registradas. " +
            "O app verifica atualizações automaticamente e confere a assinatura digital dos dados."
        return AiMenuResponse(
            targetRoute = "info/sobre", menuId = AppConstants.MENU_REGRAS_ELEITORAIS, intent = Intent.SOBRE_DADOS,
            directAnswer = texto, suggestedQuestions = listOf("Quem disputa a Presidência?"), fonte = fonte, origem = origem
        )
    }

    // ------------------------------------------------------------------ elegibilidade, patrimônio

    private fun elegibilidade(p: ParsedQuery): AiMenuResponse {
        if (p.nome != null) {
            val achados = gaz.buscarPorNome(p.nome, p.cargo, p.uf)
            if (achados.size == 1) {
                val c = achados.first()
                return AiMenuResponse(
                    targetRoute = rotaCargo(c.cargoCodigo), menuId = menuCargo(c.cargoCodigo), intent = p.intent,
                    filters = AiFilterExtraction(buscaTexto = c.nomeUrna, resetar = true),
                    directAnswer = "Situação oficial da candidatura de ${c.nomeUrna} no TSE: ${c.elegibilidade.rotulo}." +
                        (if (c.motivosIndeferimento.isNotEmpty()) " Motivos registrados: ${c.motivosIndeferimento.joinToString("; ")}." else "") +
                        " O app não emite certidão de Ficha Limpa; consulte o DivulgaCandContas para as certidões do candidato.",
                    candidateIds = listOf(c.id), fonte = fonte, origem = origem
                )
            }
        }
        val e = regras.estatisticas.porElegibilidade
        fun n(vararg k: Elegibilidade) = k.sumOf { e[it.name] ?: 0 }
        val resumo = "Deferidas: ${inteiro.format(n(Elegibilidade.DEFERIDA, Elegibilidade.DEFERIDA_COM_RECURSO))}; " +
            "indeferidas: ${inteiro.format(n(Elegibilidade.INDEFERIDA, Elegibilidade.INDEFERIDA_COM_RECURSO))}; " +
            "renúncias: ${inteiro.format(n(Elegibilidade.RENUNCIA))}; aguardando julgamento: ${inteiro.format(n(Elegibilidade.PENDENTE))}."
        val filtros = AiFilterExtraction(cargo = p.cargo, estadoUf = p.uf, apenasDeferidas = true, resetar = true)
        return AiMenuResponse(
            targetRoute = rotaCargo(p.cargo), menuId = menuCargo(p.cargo), submenuId = p.uf?.let { "sub_${it.lowercase()}" },
            intent = p.intent, filters = filtros,
            directAnswer = "A Lei da Ficha Limpa (LC 135/2010) é aplicada pela Justiça Eleitoral no julgamento do registro de cada " +
                "candidatura. O app NÃO emite certidão de \"Ficha Limpa\": exibe a situação oficial do julgamento e os motivos de " +
                "indeferimento registrados. $resumo Filtrei as candidaturas deferidas${p.cargo?.let { " a ${tituloCargo(it)}" } ?: ""}" +
                "${p.uf?.let { " em $it" } ?: ""}. Deferida pode ainda caber recurso; confirme no DivulgaCandContas.",
            suggestedQuestions = listOf("Quem disputa a Presidência?", "Como funciona a elegibilidade?"), fonte = fonte, origem = origem
        )
    }

    private fun patrimonio(p: ParsedQuery): AiMenuResponse {
        if (p.nome != null) {
            val achados = gaz.buscarPorNome(p.nome, p.cargo, p.uf)
            if (achados.size == 1) {
                val c = achados.first()
                val v = c.patrimonioDeclarado
                return AiMenuResponse(
                    targetRoute = rotaCargo(c.cargoCodigo), menuId = menuCargo(c.cargoCodigo), intent = p.intent,
                    filters = AiFilterExtraction(buscaTexto = c.nomeUrna, resetar = true),
                    directAnswer = if (v != null)
                        "${c.nomeUrna} declarou ao TSE ${c.qtdBens ?: "?"} bem(ns), somando ${moeda.format(v)} (valor declarado pelo próprio candidato no registro)."
                    else if (c.declaraBens == false) "${c.nomeUrna} não declarou bens no registro de candidatura."
                    else "Não há bens declarados disponíveis nos dados do TSE para ${c.nomeUrna}.",
                    candidateIds = listOf(c.id), fonte = fonte, origem = origem
                )
            }
        }
        return AiMenuResponse(
            targetRoute = "candidates/todos", menuId = AppConstants.MENU_HOME, intent = p.intent,
            directAnswer = "O patrimônio é o total de bens que cada candidato declarou ao TSE no registro. " +
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
                directAnswer = "A votação ainda não ocorreu: o 1º turno é em ${dataBr(regras.turno1)}, das 8h às 17h (Brasília). " +
                    "Os resultados oficiais são divulgados pelo TSE em ${AppConstants.URL_RESULTADOS_TSE} e aparecerão aqui durante a apuração.",
                suggestedQuestions = listOf("Calendário eleitoral 2026", "Quem disputa a Presidência?"), fonte = fonte, origem = origem
            )
        }
        if (cargo == null || cargo !in setOf("PRESIDENTE", "GOVERNADOR", "SENADOR")) {
            return AiMenuResponse(
                targetRoute = "info/resultados", menuId = AppConstants.MENU_RESULTADOS, intent = p.intent, filters = abrir,
                abrirResultados = true,
                directAnswer = "De qual cargo você quer ver os resultados? Posso mostrar a apuração de Presidente, Governador e Senador " +
                    "(informe o estado para Governador e Senador). Deputados: resultados oficiais completos em ${AppConstants.URL_RESULTADOS_TSE}.",
                suggestedQuestions = listOf("Resultado para Presidente", "Resultado para Governador em ${ufPadrao ?: "SP"}", "Resultado para Senador em ${ufPadrao ?: "SP"}"),
                fonte = fonte, origem = origem
            )
        }
        val uf = if (cargo == "PRESIDENTE") "BR" else (p.uf ?: ufPadrao)
        if (uf == null) {
            return AiMenuResponse(
                targetRoute = "info/resultados", menuId = AppConstants.MENU_RESULTADOS, intent = p.intent, filters = abrir,
                directAnswer = "De qual estado? Informe a UF (ex.: \"Resultado para ${tituloCargo(cargo)} em SP\").",
                suggestedQuestions = listOf("Resultado para $cargo em SP"), fonte = fonte, origem = origem
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
        val corpo = ordenadas.take(max).joinToString("; ") {
            "${it.nome} (${it.partido}, nº ${it.numero}): ${inteiro.format(it.votos)} votos" +
                (it.percentual?.let { pc -> " (${pc}%)" } ?: "") + if (it.eleito) " — ELEITO" else ""
        }
        val andamento = if (ap.totalizacaoFinal) "Totalização final." else
            "Apuração em andamento" + (ap.secoesTotalizadasPct?.let { " (${it}% das seções totalizadas)" } ?: "") + "."
        val texto = "${tituloCargo(ap.cargo)}${if (ap.uf != "BR") " — ${ap.uf}" else ""}, ${ap.turno}º turno. $andamento " +
            "$corpo. Dados divulgados pelo TSE em ${ap.geradoEm}; os números são exibidos como publicados pelo TSE " +
            "(${AppConstants.URL_RESULTADOS_TSE})."
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
        val texto = when {
            eleitos.isNotEmpty() -> "Eleito${if (eleitos.size > 1) "s" else ""} para ${tituloCargo(cargo)}${if (uf != "BR") " em $uf" else ""} " +
                "segundo o TSE: ${eleitos.joinToString("; ") { "${it.nomeUrna} (${it.partido}, nº ${it.numero})" }}."
            daqui.isNotEmpty() -> "O TSE já publicou a situação de totalização, mas ainda não há eleito definido para ${tituloCargo(cargo)}${if (uf != "BR") " em $uf" else ""}. " +
                daqui.filter { it.resultado?.situacaoTotalizacao != null }.take(6).joinToString("; ") { "${it.nomeUrna}: ${it.resultado?.situacaoTotalizacao}" }
            else -> "Ainda não há resultado oficial publicado para ${tituloCargo(cargo)}${if (uf != "BR") " em $uf" else ""} (${turno}º turno). " +
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
                directAnswer = "O 2º turno (${dataBr(regras.turno2)}) ocorre somente para Presidente e Governador quando nenhum candidato " +
                    "alcança mais de 50% dos votos válidos no 1º turno. Os candidatos ao 2º turno só são conhecidos após a apuração de ${dataBr(regras.turno1)}.",
                suggestedQuestions = listOf("Calendário eleitoral 2026"), fonte = fonte, origem = origem
            )
        }
        val resp = resultados(p.copy(intent = Intent.RESULTADOS, turno = p.turno ?: 1))
        return resp.copy(intent = Intent.SEGUNDO_TURNO)
    }

    // ------------------------------------------------------------------ recomendação / desconhecida

    private fun recomendacao() = AiMenuResponse(
        targetRoute = "menu/home", menuId = AppConstants.MENU_HOME, intent = Intent.RECOMENDACAO, origem = OrigemResposta.AVISO,
        directAnswer = "Não indico, recomendo, comparo nem prevejo candidatos: a decisão do voto é sua. " +
            "Posso mostrar, com dados oficiais do TSE, quem disputa cada cargo, o perfil e a situação da candidatura, " +
            "bens declarados, planos de governo registrados, pesquisas registradas e os resultados oficiais.",
        suggestedQuestions = listOf("Quem disputa a Presidência?", "Candidatos a Governador em ${ufPadrao ?: "SP"}", "Pesquisas registradas"),
        fonte = fonte
    )

    private fun desconhecida(p: ParsedQuery) = AiMenuResponse(
        targetRoute = "menu/home", menuId = AppConstants.MENU_HOME, intent = Intent.DESCONHECIDA, resolvida = false, origem = origem,
        filters = AiFilterExtraction(buscaTexto = p.textoOriginal.takeIf { it.length in 3..60 }, resetar = true),
        directAnswer = "Não consegui entender bem a pergunta. Experimente citar um cargo, um estado, um partido ou o nome de um candidato. " +
            "Há ${inteiro.format(regras.estatisticas.totalNaUrna)} candidaturas na urna nos dados oficiais do TSE.",
        suggestedQuestions = listOf("Quem disputa a Presidência?", "Candidatos a Governador em ${ufPadrao ?: "SP"}", "Quantos candidatos foram registrados?", "Calendário eleitoral 2026"),
        fonte = fonte
    )

    // ------------------------------------------------------------------ helpers

    private fun dataBr(iso: String) = Datas.formatarBr(iso)

    private fun montarTitulo(cargo: String?, p: ParsedQuery): String = buildString {
        if (cargo != null) append("a ${tituloCargo(cargo)}")
        else append("em todos os cargos")
        p.partido?.let { append(" do partido $it") }
        p.uf?.let { append(" em ${Ufs.NOMES[it] ?: it}") }
        p.historico?.takeIf { it != HistoricoOpcao.TODOS }?.let { append(" (${it.label.lowercase()})") }
    }

    private fun tituloCargoDe(codigo: String) = when (codigo) {
        "PRESIDENTE", "VICE_PRESIDENTE" -> "a Presidência"
        "GOVERNADOR", "VICE_GOVERNADOR" -> "o Governo"
        "SENADOR", "SUPLENTE_1", "SUPLENTE_2" -> "o Senado"
        else -> tituloCargo(codigo)
    }

    private fun sugestoesLista(cargo: String?, uf: String?) = listOf(
        "Quantos candidatos ${cargo?.let { "a ${tituloCargo(it)}" } ?: "no total"}${uf?.let { " em $it" } ?: ""}?",
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
