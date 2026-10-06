package net.saibatudo.eleicoes2026.ai.nlu

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import net.saibatudo.eleicoes2026.ai.model.Intent
import net.saibatudo.eleicoes2026.ai.model.ParsedQuery
import net.saibatudo.eleicoes2026.domain.model.HistoricoOpcao
import net.saibatudo.eleicoes2026.domain.model.Ufs
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

/**
 * Valida a saída do NLU da nuvem. A nuvem NUNCA fornece fatos: só entidades que serão checadas contra os
 * dados oficiais locais. Qualquer valor fora do vocabulário é descartado (defesa contra alucinação).
 */
object NluValidator {
    private val CARGOS_VALIDOS = setOf(
        "PRESIDENTE", "VICE_PRESIDENTE", "GOVERNADOR", "VICE_GOVERNADOR", "SENADOR",
        "DEPUTADO_FEDERAL", "DEPUTADO_ESTADUAL", "DEPUTADO_DISTRITAL"
    )

    fun validar(json: JsonObject, gaz: Gazetteer, textoOriginal: String): ParsedQuery? {
        val intent = json.str("intent")?.let { n -> Intent.entries.firstOrNull { it.name == n.uppercase() } } ?: return null
        if (intent == Intent.DESCONHECIDA) return null
        val cargo = json.str("cargo")?.uppercase()?.takeIf { it in CARGOS_VALIDOS }
        val uf = json.str("uf")?.uppercase()?.takeIf { it in Ufs.SIGLAS }
        val partido = json.str("partido")?.let { gaz.partidos[net.saibatudo.eleicoes2026.domain.model.Texto.normalizar(it)] }
        val nome = json.str("nome")?.takeIf { it.length in 3..60 && gaz.buscarPorNome(it, limite = 1).isNotEmpty() }
        val turno = json.get("turno")?.takeIf { it.isJsonPrimitive }?.asInt?.takeIf { it in 1..2 }
        val historico = json.str("historico")?.let { h -> HistoricoOpcao.entries.firstOrNull { it.name == h.uppercase() } }
        fun bool(k: String) = json.get(k)?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isBoolean }?.asBoolean
        val parsed = ParsedQuery(
            intent = intent, cargo = cargo, uf = uf, partido = partido, nome = nome,
            tema = json.str("tema")?.takeIf { it.matches(Regex("[a-z_]{3,20}")) },
            apenasDeferidas = bool("apenasDeferidas"), apenasIndeferidas = bool("apenasIndeferidas"),
            historico = historico, turno = turno,
            numero = json.str("numero")?.takeIf { it.matches(Regex("\\d{2,5}")) },
            genero = json.str("genero")?.uppercase()?.takeIf { it == "FEMININO" || it == "MASCULINO" },
            vice = bool("vice") == true,
            nacional = uf == null && Regex("brasil todo|todo o (brasil|pais)|pais todo|todos os estados")
                .containsMatchIn(net.saibatudo.eleicoes2026.domain.model.Texto.normalizar(textoOriginal)),
            textoOriginal = textoOriginal
        )
        // Intenções que dependem de entidade: se a entidade foi descartada, a interpretação não é confiável
        if (intent == Intent.PERFIL_CANDIDATO && nome == null && parsed.numero == null) return null
        if (intent == Intent.LISTAR_CANDIDATOS && cargo == null && uf == null && partido == null && parsed.tema == null) return null
        return parsed
    }

    private fun JsonObject.str(k: String): String? =
        get(k)?.takeIf { it.isJsonPrimitive }?.asString?.trim()?.takeIf { it.isNotEmpty() && it != "null" }
}

/**
 * Cliente do NLU na nuvem (API própria saibatudo.net/api/nlu → Modal). Só é chamado quando o usuário consentiu
 * e o NLU local não entendeu a pergunta. Envia apenas o texto da pergunta e um identificador aleatório de instalação.
 */
class CloudNluClient(
    private val http: OkHttpClient,
    private val endpoint: String,
    private val clientName: String = "android"
) {
    private val json = "application/json; charset=utf-8".toMediaType()

    /** Desfecho da última chamada: o serviço respondeu mas o MODELO não achou interpretação útil × o serviço não respondeu. */
    enum class Resultado { OK, NAO_ENTENDEU, INDISPONIVEL }

    @Volatile var ultimoResultado: Resultado = Resultado.OK
        private set

    suspend fun interpretar(pergunta: String, installId: String, gaz: Gazetteer): ParsedQuery? = withContext(Dispatchers.IO) {
        val corpo = JsonObject().apply {
            addProperty("q", pergunta.take(300))
            addProperty("v", 1)
            addProperty("client", clientName)
            addProperty("iid", installId)
        }.toString()
        val req = Request.Builder().url(endpoint).post(corpo.toRequestBody(json)).build()
        ultimoResultado = Resultado.INDISPONIVEL   // até prova em contrário (rede, tempo esgotado, erro HTTP, JSON inválido)
        try {
            http.newCall(req).execute().use { r ->
                if (!r.isSuccessful) return@withContext null
                val txt = r.body?.string().orEmpty()
                if (txt.length > 20_000) return@withContext null
                val raiz = JsonParser.parseString(txt).asJsonObject
                if (raiz.get("ok")?.asBoolean != true) return@withContext null
                val nlu = raiz.getAsJsonObject("nlu") ?: return@withContext null
                // o servidor respondeu: se a interpretação não serve, foi o MODELO que não entendeu (não é indisponibilidade)
                NluValidator.validar(nlu, gaz, pergunta).also { ultimoResultado = if (it != null) Resultado.OK else Resultado.NAO_ENTENDEU }
            }
        } catch (_: IOException) {
            null
        } catch (_: RuntimeException) {
            null // JSON malformado / campos inesperados: ignora e usa a resposta local
        }
    }
}

/**
 * Cliente da IA Generativa na nuvem (API própria saibatudo.net/api/ask → Modal Qwen2.5-7B).
 * Envia a pergunta do usuário e o contexto dos dados oficiais do TSE para gerar respostas detalhadas e fundamentadas.
 */
class CloudAskClient(
    private val http: OkHttpClient,
    private val endpoint: String,
    private val clientName: String = "android"
) {
    private val json = "application/json; charset=utf-8".toMediaType()

    suspend fun responder(pergunta: String, contexto: String = "", installId: String): String? = withContext(Dispatchers.IO) {
        val corpo = JsonObject().apply {
            addProperty("q", pergunta.take(300))
            addProperty("context", contexto.take(3000))
            addProperty("v", 1)
            addProperty("client", clientName)
            addProperty("iid", installId)
        }.toString()
        val req = Request.Builder().url(endpoint).post(corpo.toRequestBody(json)).build()
        try {
            http.newCall(req).execute().use { r ->
                if (!r.isSuccessful) return@withContext null
                val txt = r.body?.string().orEmpty()
                if (txt.length > 50_000) return@withContext null
                val raiz = JsonParser.parseString(txt).asJsonObject
                if (raiz.get("ok")?.asBoolean != true) return@withContext null
                raiz.get("answer")?.takeIf { it.isJsonPrimitive }?.asString?.trim()?.takeIf { it.isNotEmpty() }
            }
        } catch (_: IOException) {
            null
        } catch (_: RuntimeException) {
            null
        }
    }
}
