package net.saibatudo.eleicoes2026.data.remote

import com.google.gson.JsonObject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

/** Dados de um relato de resposta incorreta/inadequada (enviado SOMENTE após ação explícita do usuário). */
data class RelatoResposta(
    val pergunta: String,
    val resposta: String,
    val intencao: String,
    val origem: String,
    val versaoDados: String?,
    val versaoApp: String,
    val comentario: String
)

/**
 * Cliente do canal de correções e relatos (política de IA da Google Play: reporte dentro do app).
 * O servidor (saibatudo.net/api/report) cria uma issue pública no GitHub, sem dados pessoais.
 */
class ReportClient(private val http: OkHttpClient, private val endpoint: String) {
    private val json = "application/json; charset=utf-8".toMediaType()

    suspend fun enviar(r: RelatoResposta): Boolean = withContext(Dispatchers.IO) {
        val corpo = JsonObject().apply {
            addProperty("q", r.pergunta.take(300))
            addProperty("a", r.resposta.take(1500))
            addProperty("intent", r.intencao)
            addProperty("origem", r.origem)
            addProperty("dataVersion", r.versaoDados.orEmpty())
            addProperty("app", r.versaoApp)
            addProperty("note", r.comentario.take(500))
            addProperty("client", "android")
        }.toString()
        try {
            http.newCall(Request.Builder().url(endpoint).post(corpo.toRequestBody(json)).build()).execute()
                .use { it.isSuccessful }
        } catch (_: IOException) {
            false
        }
    }
}
