package net.saibatudo.eleicoes2026.data.remote

import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import net.saibatudo.eleicoes2026.data.prefs.PreferencesStore
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

/**
 * "Ajudar a melhorar o app": envio OPCIONAL, com consentimento próprio, das perguntas que o app NÃO entendeu (POST /api/melhoria).
 *
 * Diferente da "IA na nuvem" (que só interpreta uma pergunta e a descarta), aqui o texto é GUARDADO no servidor para uma pessoa revisar
 * e melhorar o NLU. Por isso: só existe se o pacote de dados ASSINADO liga cliente.melhoria.enabled (padrão desligado) E a pessoa liga a
 * opção (padrão desligada); só entram perguntas não entendidas; dado pessoal derruba a pergunta ANTES da fila (o servidor refaz a checagem);
 * a fila fica só no aparelho, limitada, e é apagada ao desligar a opção; o envio leva só o texto (sem resposta, intenção ou horário).
 * Uma pergunta livre pode revelar opinião política: o texto de consentimento na tela de Configurações diz isso.
 */
object Melhoria {
    const val LIMITE_FILA = 30
    const val LOTE = 10
    const val MIN_PARA_ENVIAR = 3
    const val MIN_Q = 3
    const val MAX_Q = 300

    val TEXTO_CHAVE = "Ajudar a melhorar o app"
    val TEXTO_DESCRICAO =
        "Desligado por padrão. Se ligar, as perguntas que o app não entendeu são enviadas ao nosso servidor, sem seu nome e sem identificar você, " +
            "para uma pessoa revisar e ensinar o app a entendê-las. Perguntas com e-mail, CPF ou telefone nunca são enviadas. " +
            "Atenção: o texto de uma pergunta pode revelar sua opinião política; ligue só se estiver de acordo e evite escrever dados pessoais. " +
            "Você pode desligar a qualquer momento; o que ainda não foi enviado é apagado."

    // Mesmas regras de api/_lib/sanitize.js (redactPii): o servidor DESCARTA o que mascararia; aqui nem entra na fila.
    private val RX_PII = listOf(
        Regex("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}"),
        Regex("\\b\\d{3}\\.?\\d{3}\\.?\\d{3}-?\\d{2}\\b"),
        Regex("(?:\\+?55[\\s-]?)?(?:\\(?\\d{2}\\)?[\\s-]?)?9?\\d{4}[\\s-]\\d{4}\\b"),
        Regex("\\b\\d{9,}\\b")
    )
    private val RX_CONTROLES = Regex("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\uFEFF]")

    /** Texto limpo se puder ir para a fila; null se for curto, longo ou tiver dado pessoal. */
    fun textoEnfileiravel(q: String): String? {
        val t = q.replace(RX_CONTROLES, " ").replace(Regex("\\s+"), " ").trim()
        if (t.length < MIN_Q || t.length > MAX_Q) return null
        if (RX_PII.any { it.containsMatchIn(t) }) return null
        return t
    }
}

/** Resultado de um envio ao servidor. */
sealed interface EnvioMelhoria {
    data object Aceito : EnvioMelhoria
    /** O servidor recusou o lote por inválido (HTTP 400): nunca será aceito, então é descartado para não travar a fila. */
    data object Invalido : EnvioMelhoria
    /** Desligado no servidor, limite, rede ou erro: mantém a fila e tenta depois. */
    data object Falhou : EnvioMelhoria
}

class MelhoriaClient(private val http: OkHttpClient, private val endpoint: String) {
    private val json = "application/json; charset=utf-8".toMediaType()

    suspend fun enviar(itens: List<String>, installId: String): EnvioMelhoria = withContext(Dispatchers.IO) {
        val lista = JsonArray().apply { itens.forEach { add(JsonObject().apply { addProperty("q", it) }) } }
        val corpo = JsonObject().apply {
            addProperty("v", 1)
            addProperty("client", "android")
            addProperty("iid", installId)
            add("itens", lista)
        }.toString()
        try {
            http.newCall(Request.Builder().url(endpoint).post(corpo.toRequestBody(json)).build()).execute().use { r ->
                when {
                    r.code == 400 -> EnvioMelhoria.Invalido
                    !r.isSuccessful -> EnvioMelhoria.Falhou
                    else -> {
                        val ok = try {
                            JsonParser.parseString(r.body?.string().orEmpty()).asJsonObject.get("ok")?.asBoolean == true
                        } catch (_: Exception) { false }
                        if (ok) EnvioMelhoria.Aceito else EnvioMelhoria.Falhou
                    }
                }
            }
        } catch (_: IOException) {
            EnvioMelhoria.Falhou
        } catch (_: RuntimeException) {
            EnvioMelhoria.Falhou
        }
    }
}

/**
 * Fila local das perguntas não entendidas. A fila é persistida nas preferências ([PreferencesStore]); o envio é injetável (testes).
 * @param noPacote o pacote de dados assinado liga cliente.melhoria.enabled?
 */
class MelhoriaFila(
    private val prefs: PreferencesStore,
    private val noPacote: suspend () -> Boolean,
    private val enviarLote: suspend (itens: List<String>, installId: String) -> EnvioMelhoria
) {
    private val trava = Mutex()

    private suspend fun ativa(): Boolean = noPacote() && prefs.atual().melhoria

    /** Põe a pergunta na fila (só se a captura estiver ativa e o texto puder ser guardado). Devolve se entrou. */
    suspend fun enfileirar(q: String): Boolean = trava.withLock {
        if (!ativa()) return@withLock false
        val t = Melhoria.textoEnfileiravel(q) ?: return@withLock false
        val atual = prefs.atual().filaMelhoria
        if (atual.any { it.equals(t, ignoreCase = true) }) return@withLock false
        prefs.atualizar { it.copy(filaMelhoria = (it.filaMelhoria + t).takeLast(Melhoria.LIMITE_FILA)) }
        true
    }

    /** Envia um lote se houver perguntas suficientes (ou [forcar]). Nunca lança; só remove da fila o que o servidor confirmou. */
    suspend fun enviarSePreciso(forcar: Boolean = false): EnvioMelhoria? = trava.withLock {
        if (!ativa()) return@withLock null
        val fila = prefs.atual().filaMelhoria
        if (fila.isEmpty() || (!forcar && fila.size < Melhoria.MIN_PARA_ENVIAR)) return@withLock null
        val lote = fila.take(Melhoria.LOTE)
        val resultado = try {
            enviarLote(lote, prefs.idInstalacao())
        } catch (_: Exception) {
            EnvioMelhoria.Falhou
        }
        if (resultado != EnvioMelhoria.Falhou) {
            prefs.atualizar { it.copy(filaMelhoria = it.filaMelhoria.drop(lote.size)) }
        }
        resultado
    }
}
