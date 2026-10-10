package net.saibatudo.quimica.data.bundle

import com.google.gson.JsonObject
import net.saibatudo.quimica.data.model.Fonte
import net.saibatudo.quimica.data.model.PacoteJson

/**
 * Manifesto do PACOTE DE DADOS (docs/DATA_CONTRACT.md §1), assinado com ECDSA P-256:
 * `{ version, generatedAt, schemaVersion, files: { "<caminho>": { bytes, sha256 } }, sources, licencas, cliente }`.
 * Aceita também a forma `arquivos: [{ path, bytes, sha256 }]` do app irmão.
 */
class BundleManifest(
    val schemaVersion: Int?,
    val version: String?,
    val generatedAt: String?,
    val arquivos: List<Arquivo>,
    val sources: List<Fonte>,
    val licencas: List<Fonte>,
    val cliente: Cliente
) {
    data class Arquivo(val path: String, val bytes: Long, val sha256: String)

    class Cliente(
        val pollIntervalMinutes: Int?,
        val baseUrl: String?,
        val minAppVersionCode: Int?,
        val nluEndpoint: String?,
        val askLigado: Boolean,
        val melhoriaLigada: Boolean,
        val aviso: String?
    )

    val minAppVersionCode: Int get() = cliente.minAppVersionCode ?: 0

    /** Intervalo de verificação: o do manifesto (semanal por padrão), limitado a [1 hora, 30 dias]. */
    val pollIntervalMinutes: Int get() = (cliente.pollIntervalMinutes ?: PADRAO_MINUTOS).coerceIn(60, 30 * 24 * 60)

    /** Todos os arquivos que o app baixa/lê (o pacote inteiro é pequeno; lotes de compostos entram). */
    val arquivosDeDados: List<Arquivo> get() = arquivos

    fun arquivo(path: String): Arquivo? = arquivos.firstOrNull { it.path == path }

    /** Caminhos do pacote que começam com [prefixo] (ex.: "textos/"), em ordem alfabética. */
    fun caminhos(prefixo: String): List<String> = arquivos.map { it.path }.filter { it.startsWith(prefixo) }.sorted()

    /** Valida estrutura básica e proteção contra caminhos maliciosos. Lança IllegalArgumentException. */
    fun validar() {
        require(schemaVersion != null && schemaVersion in 1..SCHEMA_SUPORTADO) { "schema não suportado: $schemaVersion" }
        require(!version.isNullOrBlank()) { "version ausente" }
        require(!generatedAt.isNullOrBlank()) { "generatedAt ausente" }
        require(arquivos.isNotEmpty()) { "manifesto sem arquivos" }
        for (a in arquivos) {
            val p = a.path
            require(p.isNotBlank() && !p.startsWith("/") && !p.contains("..") && !p.contains("\\") && !p.contains(":")) { "caminho inválido: $p" }
            require(a.sha256.length == 64 && a.sha256.all { it in '0'..'9' || it in 'a'..'f' }) { "sha256 inválido em $p" }
            require(a.bytes >= 0) { "tamanho inválido em $p" }
        }
        require(arquivos.any { it.path == "elementos.json" }) { "elementos.json ausente" }
    }

    companion object {
        const val SCHEMA_SUPORTADO = 1
        const val PADRAO_MINUTOS = 7 * 24 * 60

        fun parse(json: ByteArray): BundleManifest {
            val raiz = PacoteJson.parse(json)
            require(raiz.isJsonObject) { "manifesto vazio" }
            return de(raiz.asJsonObject)
        }

        private fun str(x: JsonObject?, k: String): String? = x?.get(k)?.takeIf { it.isJsonPrimitive }?.asString
        private fun int(x: JsonObject?, k: String): Int? = x?.get(k)?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isNumber }?.asInt
        private fun flag(x: JsonObject?, k: String): Boolean =
            x?.get(k)?.takeIf { it.isJsonObject }?.asJsonObject?.get("enabled")?.takeIf { it.isJsonPrimitive }?.asBoolean == true

        private fun de(o: JsonObject): BundleManifest {
            val arquivos = mutableListOf<Arquivo>()
            val files = o.get("files")
            if (files != null && files.isJsonObject) {
                for ((caminho, v) in files.asJsonObject.entrySet()) {
                    val f = if (v.isJsonObject) v.asJsonObject else continue
                    arquivos += Arquivo(caminho, f.get("bytes")?.takeIf { it.isJsonPrimitive }?.asLong ?: -1, str(f, "sha256").orEmpty())
                }
            }
            val lista = o.get("arquivos")
            if (arquivos.isEmpty() && lista != null && lista.isJsonArray) {
                for (el in lista.asJsonArray) {
                    val f = if (el.isJsonObject) el.asJsonObject else continue
                    arquivos += Arquivo(str(f, "path").orEmpty(), f.get("bytes")?.takeIf { it.isJsonPrimitive }?.asLong ?: -1, str(f, "sha256").orEmpty())
                }
            }
            val c = o.get("cliente")?.takeIf { it.isJsonObject }?.asJsonObject
            return BundleManifest(
                schemaVersion = int(o, "schemaVersion"),
                version = str(o, "version") ?: str(o, "dataVersion"),
                generatedAt = str(o, "generatedAt"),
                arquivos = arquivos,
                sources = PacoteJson.fontes(o.get("sources") ?: o.get("fontes")),
                licencas = PacoteJson.fontes(o.get("licencas")),
                cliente = Cliente(
                    pollIntervalMinutes = int(c, "pollIntervalMinutes"),
                    baseUrl = str(c, "baseUrl"),
                    minAppVersionCode = int(c, "minAppVersionCode"),
                    nluEndpoint = c?.get("nlu")?.takeIf { it.isJsonObject }?.asJsonObject?.let { str(it, "endpoint") },
                    askLigado = flag(c, "ask"),
                    melhoriaLigada = flag(c, "melhoria"),
                    aviso = str(c, "aviso")
                )
            )
        }
    }
}
