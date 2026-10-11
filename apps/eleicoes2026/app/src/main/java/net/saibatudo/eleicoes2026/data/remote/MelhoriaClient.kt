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
import java.text.Normalizer

/**
 * "Ajudar a melhorar o app": envio OPCIONAL, com consentimento próprio, das perguntas que o app NÃO entendeu (POST /api/melhoria).
 *
 * Diferente da "IA na nuvem" (que só interpreta uma pergunta e a descarta), aqui o texto é GUARDADO no servidor para uma pessoa revisar
 * e melhorar o NLU. Por isso: só existe se o pacote de dados ASSINADO liga cliente.melhoria.enabled (padrão desligado) E a pessoa liga a
 * opção (padrão desligada); só entram perguntas não entendidas; dado pessoal derruba a pergunta ANTES da fila (o servidor refaz a checagem);
 * perguntas que revelam a OPINIÃO/PREFERÊNCIA política de quem perguntou (ex.: "quero que fulano ganhe") também não entram; a fila fica só no
 * aparelho, limitada, e é apagada ao desligar a opção; o envio leva só o texto (sem resposta, intenção ou horário).
 * O filtro de opinião é heurístico: o texto de consentimento na tela de Configurações diz que ele pode falhar.
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
            "Perguntas que possam revelar sua opinião ou preferência política (por exemplo, quem você quer que ganhe ou como ajudar um candidato) também não são enviadas. " +
            "Como nenhum filtro é perfeito, ligue só se estiver de acordo e evite escrever dados pessoais ou sua opinião política nas perguntas. " +
            "Você pode desligar a qualquer momento; o que ainda não foi enviado é apagado."

    // Mesmas regras de api/_lib/sanitize.js (redactPii): o servidor DESCARTA o que mascararia; aqui nem entra na fila.
    private val RX_PII = listOf(
        Regex("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}"),
        Regex("\\b\\d{3}\\.?\\d{3}\\.?\\d{3}-?\\d{2}\\b"),
        Regex("(?:\\+?55[\\s-]?)?(?:\\(?\\d{2}\\)?[\\s-]?)?9?\\d{4}[\\s-]\\d{4}\\b"),
        Regex("\\b\\d{9,}\\b")
    )
    private val RX_CONTROLES = Regex("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\uFEFF]")

    // Mesmos padrões de api/_lib/opiniao.js (sobre o texto sem acento, minúsculo e sem pontuação); contracts/opiniao_cases.json confere os três filtros.
    private val RX_OPINIAO = listOf(
        Regex("\\bquero que\\b"),
        Regex("\\bgostaria que\\b"),
        Regex("\\bespero que\\b.{0,40}\\b(ganh\\w+|venc\\w+|elej\\w+|perd\\w+)"),
        Regex("\\btorc\\w* (por|pra|para|pelo|pela)\\b"),
        Regex("\\b(apoio|apoiar|apoiando|apoiador\\w*|apoiadora\\w*)\\b"),
        Regex("\\b(vou votar|votei|votarei)\\b"),
        Regex("\\b(meu candidato|minha candidata|meu partido|meu presidente|meu governador)\\b"),
        Regex("\\bestrategi\\w*\\b"),
        Regex("\\baument\\w* (as |a )?chances?\\b"),
        Regex("\\b(ajudar|fazer|conseguir|garantir)\\b.{0,50}\\b(ganhar|vencer|eleger|eleito|vitoria)\\b"),
        Regex("\\b(fazer|minha|nossa) (campanha|propaganda)\\b"),
        Regex("\\b(conseguir votos?|pedir votos? (para|pra|pro|pela|pelo))\\b"),
        Regex("\\bcabo eleitoral\\b"),
        Regex("\\b(odeio|detesto|adoro|amo|ladrao|corrupt\\w*|bandid\\w*|vagabund\\w*|golpist\\w*|fascist\\w*|comunist\\w*|petralh\\w*|bolsominion\\w*|incompetente|safado|canalha)\\b"),
        Regex("\\bsou (de )?(direita|esquerda|centro|bolsonarista|lulista|petista|tucano|conservador\\w*|progressista|liberal|evangelic\\w*|catolic\\w*|ateu)\\b"),
        Regex("\\b(minha opiniao|na minha opiniao)\\b"),
        Regex("\\b(eu )?(acho|acredito|penso) que\\b")
    )
    private val RX_MARCAS = Regex("\\p{M}+")
    private val RX_NAO_ALFANUM = Regex("[^a-z0-9 ]+")
    private val RX_ESPACOS = Regex("\\s+")

    /** A pergunta revela opinião, preferência ou estratégia eleitoral de quem a fez? Heurística conservadora: na dúvida, descarta. */
    fun revelaOpiniao(q: String): Boolean {
        val t = Normalizer.normalize(q, Normalizer.Form.NFD).replace(RX_MARCAS, "").lowercase()
            .replace(RX_NAO_ALFANUM, " ").replace(RX_ESPACOS, " ").trim()
        return RX_OPINIAO.any { it.containsMatchIn(t) }
    }

    /** Texto limpo se puder ir para a fila; null se for curto, longo, tiver dado pessoal ou revelar opinião política. */
    fun textoEnfileiravel(q: String): String? {
        val t = q.replace(RX_CONTROLES, " ").replace(Regex("\\s+"), " ").trim()
        if (t.length < MIN_Q || t.length > MAX_Q) return null
        if (RX_PII.any { it.containsMatchIn(t) }) return null
        if (revelaOpiniao(t)) return null
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
