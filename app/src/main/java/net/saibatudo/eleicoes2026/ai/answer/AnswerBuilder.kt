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
    internal val data: ElectionData,
    internal val gaz: Gazetteer,
    internal val hoje: String,
    internal val ufPadrao: String? = null,
    internal val apuracao: ApuracaoProvider? = null,
    internal val origem: OrigemResposta = OrigemResposta.LOCAL
) {
    internal val regras = data.regras
    internal val fase = FaseEleitoral.de(hoje, regras.turno1, regras.turno2)
    internal val fonte: String = buildString {
        append("Fonte: TSE – dados abertos (CC BY)")
        if (regras.extracaoTse.isNotBlank()) append(", extração ${regras.extracaoTse}")
        append(". App independente.")
    }
    internal val moeda = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("pt-BR"))
    internal val inteiro = NumberFormat.getIntegerInstance(Locale.forLanguageTag("pt-BR"))
    internal fun n(v: Int) = inteiro.format(v)

    /** Cargos que dependem do estado: sem UF na pergunta, vale o "Meu estado" do usuário (se ligado). */
    internal val cargosEstaduais = setOf("GOVERNADOR", "VICE_GOVERNADOR", "SENADOR", "DEPUTADO_FEDERAL", "DEPUTADO_ESTADUAL", "DEPUTADO_DISTRITAL")

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
        Intent.LOCAL_VOTACAO -> localVotacao(p)
        Intent.REGRAS_URNA -> regrasUrna(p)
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

    // ------------------------------------------------------------------ helpers

    internal fun dataBr(iso: String) = Datas.formatarBr(iso)
    internal fun dataCurta(s: String) = if (s.length >= 10 && s[4] == '-') Datas.formatarBr(s.take(10)) else s
    internal fun plural(qtd: Int) = if (qtd == 1) "" else "s"
    internal fun titulo(s: String) = s.lowercase().split(' ').joinToString(" ") { it.replaceFirstChar(Char::uppercase) }
    internal fun localDe(c: Candidate) = if (c.estadoUf == "BR") "" else " ${c.estadoUf}"

    /** Item de lista padronizado: número primeiro (como na urna), nome, partido e opcionalmente vice/chapa. */
    internal fun item(c: Candidate, mostrarCargo: Boolean, mostrarUf: Boolean, chapa: List<Candidate> = emptyList()): String = buildString {
        append("• ${c.numero} — ${c.nomeUrna} (${c.partido})")
        val extras = listOfNotNull(c.cargo.takeIf { mostrarCargo }, c.estadoUf.takeIf { mostrarUf && it != "BR" })
        if (extras.isNotEmpty()) append(" · ${extras.joinToString(" ")}")
        if (chapa.isNotEmpty()) {
            val rotulo = when (c.cargoCodigo) {
                "SENADOR" -> "Suplentes"
                "PRESIDENTE", "GOVERNADOR" -> "Vice"
                "VICE_PRESIDENTE", "VICE_GOVERNADOR" -> "Titular"
                else -> "Chapa"
            }
            append(" · $rotulo: " + chapa.joinToString("; ") { "${it.nomeUrna} (${it.partido})" })
        }
        if (!c.naUrna) append(" — fora da urna")
    }

    internal fun montarTitulo(cargo: String?, p: ParsedQuery): String = buildString {
        if (cargo != null) append("a ${tituloCargo(cargo)}")
        else append("em todos os cargos")
        if (p.vice) append(" (com respectivos vices/suplentes da chapa)")
        p.partido?.let { append(" do partido $it") }
        p.uf?.let { append(" ${Ufs.em(it)}") }
        p.genero?.let { append(if (it == "FEMININO") " (mulheres)" else " (homens)") }
        p.historico?.takeIf { it != HistoricoOpcao.TODOS }?.let { append(" (${it.label.lowercase()})") }
    }

    internal fun tituloCargoDe(codigo: String) = when (codigo) {
        "PRESIDENTE", "VICE_PRESIDENTE" -> "a Presidência"
        "GOVERNADOR", "VICE_GOVERNADOR" -> "o Governo"
        "SENADOR", "SUPLENTE_1", "SUPLENTE_2" -> "o Senado"
        else -> tituloCargo(codigo)
    }

    internal fun sugestoesLista(cargo: String?, uf: String?) = listOfNotNull(
        "Quantos candidatos ${cargo?.let { "a ${tituloCargo(it)}" } ?: "no total"}${uf?.let { " em $it" } ?: ""}?",
        cargo?.let { "Ficha Limpa dos candidatos a ${tituloCargo(it)}${uf?.let { u -> " em $u" } ?: ""}" },
        "Simular voto na urna",
        "Pesquisas registradas${uf?.let { " em $it" } ?: ""}"
    )

    internal fun rotaCargo(c: String?) = when (c) {
        "PRESIDENTE", "VICE_PRESIDENTE" -> "candidates/presidente"
        "GOVERNADOR", "VICE_GOVERNADOR" -> "candidates/governador"
        "SENADOR", "SUPLENTE_1", "SUPLENTE_2" -> "candidates/senador"
        "DEPUTADO_FEDERAL" -> "candidates/deputado_federal"
        "DEPUTADO_ESTADUAL", "DEPUTADO_DISTRITAL" -> "candidates/deputado_estadual"
        else -> "candidates/todos"
    }

    internal fun menuCargo(c: String?) = when (c) {
        "PRESIDENTE", "VICE_PRESIDENTE" -> AppConstants.MENU_PRESIDENTE
        "GOVERNADOR", "VICE_GOVERNADOR" -> AppConstants.MENU_GOVERNADOR
        "SENADOR", "SUPLENTE_1", "SUPLENTE_2" -> AppConstants.MENU_SENADOR
        "DEPUTADO_FEDERAL" -> AppConstants.MENU_DEPUTADO_FEDERAL
        "DEPUTADO_ESTADUAL", "DEPUTADO_DISTRITAL" -> AppConstants.MENU_DEPUTADO_ESTADUAL
        else -> AppConstants.MENU_HOME
    }
}
