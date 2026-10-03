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
    REGRAS_VOTO,           // voto branco/nulo, obrigatoriedade, justificativa
    SENADO_DOIS_VOTOS,
    ELEGIBILIDADE,         // situação do registro e Ficha Limpa
    PLANO_GOVERNO,
    CONTAS_CAMPANHA,
    RESULTADOS,
    SEGUNDO_TURNO,
    PATRIMONIO,
    FONTES,
    SOBRE_DADOS,
    SIMULADOR,             // abre o simulador educativo da urna
    AJUDA,                 // saudações, agradecimentos e "o que você faz"
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
    /** Pedido por registros indeferidos/inelegíveis ("ficha suja", "inelegíveis", "indeferidos"). */
    val apenasIndeferidas: Boolean? = null,
    val historico: HistoricoOpcao? = null,
    val turno: Int? = null,
    /** Número de urna citado ("quem é o 13", "candidato 1234"). */
    val numero: String? = null,
    /** Gênero declarado ao TSE ("FEMININO"/"MASCULINO"). */
    val genero: String? = null,
    /** Pergunta sobre o vice/suplentes da chapa ("vice do Lula"). */
    val vice: Boolean = false,
    /** O usuário pediu explicitamente o país todo ("em todo o Brasil"): não aplicar o "Meu estado". */
    val nacional: Boolean = false,
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
    val apenasIndeferidas: Boolean? = null,
    val apenasEleitos: Boolean? = null,
    val historico: HistoricoOpcao? = null,
    val genero: String? = null,
    /** true = descartar filtros anteriores (consulta nova); false = refinar o filtro atual. */
    val resetar: Boolean = false
)

enum class OrigemResposta(val rotulo: String) {
    LOCAL("IA local • dados oficiais"),
    NUVEM("IA na nuvem + dados oficiais"),
    GENERATIVA("IA Generativa (Qwen 7B) • Nuvem"),
    AVISO("Aviso")
}

data class AiMenuResponse(
    val targetRoute: String,
    val menuId: String,
    val submenuId: String? = null,
    val intent: Intent = Intent.DESCONHECIDA,
    val filters: AiFilterExtraction = AiFilterExtraction(),
    /**
     * Texto da resposta, em linhas: a 1ª é o título; linhas "• " são itens de lista; linhas "Rótulo: valor"
     * são campos. A interface formata cada tipo (negrito, recuo) sem alterar o conteúdo.
     */
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
    val abrirResultados: Boolean = false,
    /** Se verdadeiro, a interface abre o simulador da urna (com o 1º candidato citado, se houver). */
    val abrirSimulador: Boolean = false
)
