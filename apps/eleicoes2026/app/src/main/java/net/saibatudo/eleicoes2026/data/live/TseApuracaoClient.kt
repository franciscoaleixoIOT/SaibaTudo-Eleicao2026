package net.saibatudo.eleicoes2026.data.live

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import net.saibatudo.eleicoes2026.data.datasource.ResultadosTseConfig
import net.saibatudo.eleicoes2026.domain.model.ApuracaoCargo
import net.saibatudo.eleicoes2026.domain.model.ApuracaoProvider
import net.saibatudo.eleicoes2026.domain.model.LinhaApuracao
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException

/**
 * Parser do JSON público de apuração do TSE (resultados.tse.jus.br/oficial/ele2026/<eleição>/dados/<uf>/<uf>-c<cargo>-e<eleição>-u.json).
 * Os valores são repassados como publicados (o TSE exige que resultados não sejam alterados).
 */
object TseApuracaoParser {
    fun parse(json: String, cargo: String, uf: String, turno: Int): ApuracaoCargo? {
        val raiz = try { JsonParser.parseString(json).asJsonObject } catch (_: RuntimeException) { return null }
        val carg = raiz.getAsJsonArray("carg")?.firstOrNull()?.asJsonObject ?: return null
        val linhas = ArrayList<LinhaApuracao>()
        for (agr in carg.getAsJsonArray("agr").orEmpty()) {
            for (par in agr.asJsonObject.getAsJsonArray("par").orEmpty()) {
                val partido = par.asJsonObject.str("sg").orEmpty()
                for (c in par.asJsonObject.getAsJsonArray("cand").orEmpty()) {
                    val o = c.asJsonObject
                    // O TSE envia "e":"s" também para quem PASSA ao 2º turno (st = "2º turno"): a situação é que decide quem é eleito.
                    val situacao = o.str("st")
                    val segundoTurno = situacao != null && RX_TURNO.containsMatchIn(situacao)
                    linhas += LinhaApuracao(
                        sqCandidato = o.str("sqcand"),
                        numero = o.str("n").orEmpty(),
                        nome = o.str("nmu") ?: o.str("nm").orEmpty(),
                        partido = partido,
                        votos = o.str("vap")?.toLongOrNull() ?: 0L,
                        percentual = o.str("pvap")?.takeIf { it.isNotBlank() },
                        eleito = o.str("e") == "s" && !segundoTurno,
                        situacao = situacao,
                        segundoTurno = segundoTurno
                    )
                }
            }
        }
        return ApuracaoCargo(
            cargo = cargo, uf = uf, turno = turno,
            geradoEm = "${raiz.str("dg").orEmpty()} ${raiz.str("hg").orEmpty()}".trim(),
            secoesTotalizadasPct = raiz.getAsJsonObject("s")?.str("pst"),
            totalizacaoFinal = raiz.str("tf") == "s",
            linhas = linhas
        )
    }

    private val RX_TURNO = Regex("""\bturno\b""", RegexOption.IGNORE_CASE)
    private fun JsonObject.str(k: String): String? = get(k)?.takeIf { it.isJsonPrimitive }?.asString
    private fun com.google.gson.JsonArray?.orEmpty(): List<com.google.gson.JsonElement> = this?.toList() ?: emptyList()
}

/**
 * Cliente da apuração oficial ao vivo. Respeita os limites publicados pelo TSE: cache curto (≈60 s, igual ao do
 * servidor), requisição condicional (If-None-Match), espaçamento mínimo entre chamadas e cache negativo para
 * erros (404 repetidos podem causar bloqueio temporário do IP).
 */
class TseApuracaoClient(
    private val http: OkHttpClient,
    private val config: () -> ResultadosTseConfig?,
    private val agora: () -> Long = System::currentTimeMillis
) : ApuracaoProvider {

    private data class Entrada(val quando: Long, val etag: String?, val valor: ApuracaoCargo?, val corpoOk: Boolean)

    private val cache = HashMap<String, Entrada>()
    private val mutex = Mutex()
    private var ultimaRequisicao = 0L

    override suspend fun obter(cargo: String, uf: String, turno: Int): ApuracaoCargo? = withContext(Dispatchers.IO) {
        val cfg = config() ?: return@withContext null
        val codigoCargo = cfg.cargos[cargo] ?: return@withContext null
        val federal = cargo == "PRESIDENTE"
        val cd = when {
            federal && turno == 1 -> cfg.federalTurno1
            federal -> cfg.federalTurno2
            turno == 1 -> cfg.estadualTurno1
            else -> cfg.estadualTurno2
        }
        val ufLower = uf.lowercase()
        val url = "${cfg.base}/$cd/dados/$ufLower/$ufLower-c${codigoCargo.toString().padStart(4, '0')}-e${cd.toString().padStart(6, '0')}-u.json"

        mutex.withLock {
            val chave = url
            val atual = cache[chave]
            val agoraMs = agora()
            val ttl = if (atual?.corpoOk == false) TTL_NEGATIVO_MS else TTL_MS
            if (atual != null && agoraMs - atual.quando < ttl) return@withLock atual.valor
            val espera = MIN_INTERVALO_MS - (agoraMs - ultimaRequisicao)
            if (espera > 0) delay(espera)
            ultimaRequisicao = agora()

            val req = Request.Builder().url(url).apply { atual?.etag?.let { header("If-None-Match", it) } }.build()
            try {
                http.newCall(req).execute().use { r ->
                    when {
                        r.code == 304 && atual != null -> {
                            cache[chave] = atual.copy(quando = agora())
                            atual.valor
                        }
                        r.isSuccessful -> {
                            val corpo = r.body?.string().orEmpty()
                            val ap = TseApuracaoParser.parse(corpo, cargo, uf, turno)
                            cache[chave] = Entrada(agora(), r.header("ETag"), ap, ap != null)
                            ap
                        }
                        else -> {
                            cache[chave] = Entrada(agora(), null, null, false)
                            null
                        }
                    }
                }
            } catch (_: IOException) {
                cache[chave] = Entrada(agora(), null, atual?.valor, false)
                atual?.valor
            }
        }
    }

    companion object {
        const val TTL_MS = 60_000L
        const val TTL_NEGATIVO_MS = 300_000L
        const val MIN_INTERVALO_MS = 500L
    }
}
