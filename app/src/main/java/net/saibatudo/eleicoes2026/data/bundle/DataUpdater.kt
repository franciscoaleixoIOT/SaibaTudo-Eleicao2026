package net.saibatudo.eleicoes2026.data.bundle

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.CacheControl
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.IOException
import java.security.MessageDigest

/** Resultado de uma tentativa de atualização dos dados oficiais. */
sealed interface UpdateResult {
    data object UpToDate : UpdateResult
    data class Updated(val dataVersion: String, val arquivosBaixados: Int, val bytesBaixados: Long) : UpdateResult
    data class Skipped(val motivo: String) : UpdateResult
    data class Failed(val erro: String) : UpdateResult
}

/**
 * Atualiza o pacote de dados oficial a partir de https://saibatudo.net/data/eleicoes2026/ :
 *
 *  1. baixa manifest.json + manifest.sig e verifica a ASSINATURA (ECDSA) com a chave pública embutida;
 *  2. rejeita pacotes de schema/versão do app incompatíveis e pacotes MAIS ANTIGOS que o ativo (anti-rollback);
 *  3. baixa SOMENTE os arquivos cujo sha256 mudou (os demais são copiados do pacote ativo);
 *  4. confere o sha256 de cada arquivo, monta tudo em staging e ativa de forma atômica.
 *
 * Qualquer falha mantém o pacote atual intacto.
 */
class DataUpdater(
    private val store: PacoteStore,
    private val http: OkHttpClient,
    private val baseUrl: String,
    private val verifier: ManifestVerifier,
    private val appVersionCode: Int
) {

    suspend fun atualizar(): UpdateResult = withContext(Dispatchers.IO) {
        try {
            executar()
        } catch (e: IOException) {
            UpdateResult.Failed("rede: ${e.message}")
        } catch (e: IllegalArgumentException) {
            UpdateResult.Failed("manifesto inválido: ${e.message}")
        } catch (e: Exception) {
            UpdateResult.Failed(e.message ?: e.javaClass.simpleName)
        }
    }

    private fun executar(): UpdateResult {
        val base = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"
        val manifestBytes = baixarBytes(base + "manifest.json")
        val assinatura = String(baixarBytes(base + "manifest.sig"), Charsets.UTF_8)
        if (!verifier.verify(manifestBytes, assinatura)) {
            return UpdateResult.Failed("assinatura do manifesto INVÁLIDA — atualização rejeitada")
        }
        val novo = BundleManifest.parse(manifestBytes).also { it.validar() }
        if (novo.minAppVersionCode > appVersionCode) {
            return UpdateResult.Skipped("requer versão mais nova do app (>= ${novo.minAppVersionCode})")
        }
        val ativo = store.ativo()
        val gerAtivo = ativo.manifest.generatedAt.orEmpty()
        val gerNovo = novo.generatedAt.orEmpty()
        if (gerNovo < gerAtivo) return UpdateResult.Skipped("pacote remoto é mais antigo que o ativo (anti-rollback)")
        if (novo.dataVersion == ativo.manifest.dataVersion) return UpdateResult.UpToDate

        val hashesAtivos = ativo.manifest.arquivos.orEmpty().associate { it.path to it.sha256 }
        val staging = store.novoStaging(novo.dataVersion!!)
        var baixados = 0
        var bytes = 0L
        try {
            for (arq in novo.arquivosDeDados) {
                val destino = File(staging, arq.path!!)
                destino.parentFile?.mkdirs()
                val reaproveitavel = hashesAtivos[arq.path] == arq.sha256 && ativo.reader.exists(arq.path)
                if (reaproveitavel && copiarVerificando(ativo.reader, arq, destino)) continue
                val dados = baixarBytes(base + arq.path)
                require(MessageDigest.isEqual(hex(sha(dados)).toByteArray(), arq.sha256!!.toByteArray())) {
                    "checksum divergente em ${arq.path}"
                }
                require(dados.size.toLong() == arq.bytes) { "tamanho divergente em ${arq.path}" }
                destino.writeBytes(dados)
                baixados++
                bytes += dados.size
            }
            File(staging, "manifest.json").writeBytes(manifestBytes)
            File(staging, "manifest.sig").writeText(assinatura)
            store.ativar(staging, novo.dataVersion)
        } catch (e: Exception) {
            staging.deleteRecursively()
            throw e
        }
        return UpdateResult.Updated(novo.dataVersion, baixados, bytes)
    }

    private fun copiarVerificando(reader: BundleReader, arq: BundleManifest.Arquivo, destino: File): Boolean = try {
        val dados = reader.open(arq.path!!).use { it.readBytes() }
        if (hex(sha(dados)) == arq.sha256) {
            destino.writeBytes(dados)
            true
        } else false
    } catch (_: Exception) {
        false
    }

    private fun baixarBytes(url: String): ByteArray {
        val req = Request.Builder().url(url).cacheControl(CacheControl.FORCE_NETWORK)
            .header("Accept", "application/json,*/*").build()
        http.newCall(req).execute().use { r ->
            if (!r.isSuccessful) throw IOException("HTTP ${r.code} em $url")
            return r.body?.bytes() ?: throw IOException("resposta vazia em $url")
        }
    }

    private fun sha(b: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(b)
    private fun hex(b: ByteArray): String = b.joinToString("") { "%02x".format(it) }
}
