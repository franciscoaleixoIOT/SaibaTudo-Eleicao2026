package net.saibatudo.eleicoes2026.ai.engine

import kotlinx.coroutines.withTimeoutOrNull
import net.saibatudo.eleicoes2026.ai.model.AiFilterExtraction
import net.saibatudo.eleicoes2026.ai.model.AiMenuResponse
import net.saibatudo.eleicoes2026.ai.model.Intent
import net.saibatudo.eleicoes2026.ai.model.OrigemResposta
import net.saibatudo.eleicoes2026.ai.nlu.CloudAskClient
import net.saibatudo.eleicoes2026.ai.nlu.CloudNluClient

/**
 * Motor HÍBRIDO: LOCAL primeiro, nuvem como apoio de interpretação e IA Generativa (Qwen 7B).
 *
 *  1. O NLU local responde quase tudo (grátis, offline, determinístico).
 *  2. Se a pergunta já foi entendida e o usuário quer aprofundar na nuvem, chama a IA Generativa (Qwen 7B no Modal).
 *  3. Se NÃO entendeu E o usuário consentiu, a pergunta é enviada ao NLU na nuvem para reinterpretação.
 */
class HybridAiInferenceEngine(
    private val local: LocalOfficialAiEngine,
    private val nuvem: CloudNluClient?,
    private val nuvemHabilitada: () -> Boolean,
    private val idInstalacao: suspend () -> String,
    private val askClient: CloudAskClient? = null,
    /** IA generativa ligada no manifesto assinado (cliente.ask.enabled)? Padrão: desligada. */
    private val askLigado: suspend () -> Boolean = { false },
    private val timeoutMs: Long = 14_000,
    /** Tempo maior quando o próprio usuário pediu a nuvem e aceitou esperar (botão "Perguntar à IA na nuvem"). */
    private val timeoutExplicitoMs: Long = 25_000
) : AiInferenceEngine {

    @Volatile override var nuvemNaoEntendeu: Boolean = false
        private set

    override suspend fun perguntarNaNuvem(query: String, respostaAtual: AiMenuResponse?): AiMenuResponse? {
        nuvemNaoEntendeu = false
        if (respostaAtual?.resolvida == true && respostaAtual.intent != Intent.RECOMENDACAO && askClient != null && askLigado()) {
            val (data, _) = local.gazetteer()
            val dadosCandidatos = respostaAtual.candidateIds.take(15)
                .mapNotNull { data.porId[it] }
                .joinToString("\n") { c ->
                    val bens = if (c.patrimonioDeclarado != null && c.patrimonioDeclarado > 0)
                        "Bens: R$ ${String.format(java.util.Locale.forLanguageTag("pt-BR"), "%,.2f", c.patrimonioDeclarado)}"
                    else if (c.declaraBens == false) "Não declarou bens" else "Sem dados de bens"
                    "• ${c.nomeUrna} (nº ${c.numero}, ${c.partido}/${if (c.estadoUf != "BR") c.estadoUf else "BR"}) — Cargo: ${c.cargo}. Situação: ${c.situacao}. $bens."
                }
            val baseContexto = respostaAtual.directAnswer?.take(1000)?.let { "Dados apurados no sistema:\n$it\n\n" }.orEmpty()
            val contexto = if (dadosCandidatos.isNotBlank()) {
                baseContexto + "Candidaturas oficiais do TSE no escopo da consulta:\n$dadosCandidatos"
            } else {
                baseContexto
            }
            val gerada = withTimeoutOrNull(timeoutExplicitoMs) {
                askClient.responder(query, contexto, idInstalacao())
            }
            if (!gerada.isNullOrBlank()) {
                return AiMenuResponse(
                    targetRoute = respostaAtual.targetRoute,
                    menuId = respostaAtual.menuId,
                    submenuId = respostaAtual.submenuId,
                    intent = respostaAtual.intent,
                    filters = respostaAtual.filters,
                    directAnswer = gerada,
                    suggestedQuestions = respostaAtual.suggestedQuestions,
                    candidateIds = respostaAtual.candidateIds,
                    fonte = FONTE_GERADA,
                    origem = OrigemResposta.GENERATIVA,
                    resolvida = true
                )
            }
        }
        if (nuvem != null) {
            val (data, gaz) = local.gazetteer()
            val parsed = withTimeoutOrNull(timeoutExplicitoMs) { nuvem.interpretar(query, idInstalacao(), gaz) }
            if (parsed != null) {
                val comContexto = local.comContexto(parsed, query, gaz)
                val resp = local.responder(comContexto, data, gaz, OrigemResposta.NUVEM)
                if (resp.resolvida) {
                    local.lembrar(comContexto)
                    return resp
                }
                nuvemNaoEntendeu = true   // interpretou, mas a interpretação não resolve a pergunta
            } else {
                nuvemNaoEntendeu = nuvem.ultimoResultado == CloudNluClient.Resultado.NAO_ENTENDEU
            }
        }
        if (askClient != null && respostaAtual?.intent != Intent.RECOMENDACAO && askLigado()) {
            val contexto = buildString {
                respostaAtual?.directAnswer?.let {
                    append("Dados oficiais apurados:\n").append(it.take(1000)).append("\n\n")
                }
                append("Regras Eleições 2026: 2º turno em 25/10/2026 exclusivamente para Presidente e Governador se o primeiro colocado não alcançar mais de 50% dos votos válidos no 1º turno (04/10/2026). Senadores e Deputados são eleitos em turno único no 1º turno.")
            }
            val gerada = withTimeoutOrNull(timeoutExplicitoMs) {
                askClient.responder(query, contexto, idInstalacao())
            }
            if (!gerada.isNullOrBlank()) {
                return AiMenuResponse(
                    targetRoute = respostaAtual?.targetRoute ?: "menu/home",
                    menuId = respostaAtual?.menuId ?: "home",
                    submenuId = respostaAtual?.submenuId,
                    intent = respostaAtual?.intent ?: Intent.DESCONHECIDA,
                    filters = respostaAtual?.filters ?: AiFilterExtraction(),
                    directAnswer = gerada,
                    suggestedQuestions = respostaAtual?.suggestedQuestions ?: listOf("Quem disputa a Presidência?", "Calendário eleitoral 2026"),
                    candidateIds = emptyList(),
                    fonte = FONTE_GERADA,
                    origem = OrigemResposta.GENERATIVA,
                    resolvida = true
                )
            }
        }
        return null
    }

    override suspend fun parseUserQuery(query: String): AiMenuResponse {
        val respostaLocal = local.parseUserQuery(query)
        if (respostaLocal.resolvida || nuvem == null || !nuvemHabilitada()) return respostaLocal

        val (data, gaz) = local.gazetteer()
        val parsed = withTimeoutOrNull(timeoutMs) { nuvem.interpretar(query, idInstalacao(), gaz) }
            ?: return respostaLocal
        val comContexto = local.comContexto(parsed, query, gaz)
        val resposta = local.responder(comContexto, data, gaz, OrigemResposta.NUVEM)
        if (!resposta.resolvida) return respostaLocal
        local.lembrar(comContexto)
        return resposta
    }

    override fun limparContexto() {
        local.limparContexto()
    }

    companion object {
        /** Rótulo honesto: é texto de modelo, não dado oficial. A neutralidade (Res. TSE 23.755/2026) é reforçada no proxy. */
        const val FONTE_GERADA = "Texto gerado por IA (Qwen2.5-7B) • pode conter erros; confira nos dados oficiais e no site do TSE"
    }
}
