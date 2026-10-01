package net.saibatudo.eleicoes2026.ai.model

import net.saibatudo.eleicoes2026.domain.model.HistoricoOpcao

/**
 * Intenções reconhecidas. O NLU (regras locais ou modelo na nuvem) só produz uma [ParsedQuery];
 * TODA resposta factual é montada pelo AnswerBuilder a partir dos dados oficiais carregados.
 */
enum class Intent {
    LISTAR_CANDIDATOS,
    PERFIL_CANDIDATO,
    CONTAR,
    PESQUISAS,
    CALENDARIO,
    LOCAL_VOTACAO,
    REGRAS_URNA,
    SENADO_DOIS_VOTOS,
    ELEGIBILIDADE,
    RESULTADOS,
    SEGUNDO_TURNO,
    PATRIMONIO,
    FONTES,
    SOBRE_DADOS,
    RECOMENDACAO,          // pedido de recomendação/previsão de voto: o app recusa com neutralidade
    DESCONHECIDA
}

/** Interpretação estruturada de uma pergunta. */
data class ParsedQuery(
    val intent: Intent,
    val cargo: String? = null,
    val uf: String? = null,
    val partido: String? = null,
    val nome: String? = null,
    val tema: String? = null,
    val apenasDeferidas: Boolean? = null,
    val historico: HistoricoOpcao? = null,
    val turno: Int? = null,
    val textoOriginal: String = ""
)

/** Alterações de filtro sugeridas pela resposta (aplicadas pela interface sobre o filtro atual). */
data class AiFilterExtraction(
    val cargo: String? = null,
    val estadoUf: String? = null,
    val partido: String? = null,
    val tema: String? = null,
    val buscaTexto: String? = null,
    val apenasDeferidas: Boolean? = null,
    val apenasEleitos: Boolean? = null,
    val historico: HistoricoOpcao? = null,
    /** true = descartar filtros anteriores (consulta nova); false = refinar o filtro atual. */
    val resetar: Boolean = false
)

enum class OrigemResposta(val rotulo: String) {
    LOCAL("IA local • dados oficiais"),
    NUVEM("IA na nuvem + dados oficiais"),
    AVISO("Aviso")
}

data class AiMenuResponse(
    val targetRoute: String,
    val menuId: String,
    val submenuId: String? = null,
    val intent: Intent = Intent.DESCONHECIDA,
    val filters: AiFilterExtraction = AiFilterExtraction(),
    val directAnswer: String? = null,
    val suggestedQuestions: List<String> = emptyList(),
    /** Candidatos citados na resposta (para botões de acesso rápido). Ordem fixa e determinística. */
    val candidateIds: List<String> = emptyList(),
    /** Descrição da fonte exibida abaixo da resposta (inclui data da extração do TSE). */
    val fonte: String? = null,
    val origem: OrigemResposta = OrigemResposta.LOCAL,
    /** false quando o NLU local não entendeu e a pergunta pode ser enviada ao NLU na nuvem (com consentimento). */
    val resolvida: Boolean = true,
    /** Se verdadeiro, a interface deve abrir a apuração/resultados (ex.: intenção RESULTADOS). */
    val abrirResultados: Boolean = false
)
