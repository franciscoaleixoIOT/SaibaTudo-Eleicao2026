package net.saibatudo.eleicoes2026.data.bundle

import com.google.gson.Gson
import com.google.gson.annotations.SerializedName

/**
 * Manifesto do PACOTE DE DADOS oficial (gerado por pipeline/build.py e assinado com ECDSA).
 * Contrato documentado em docs/DATA_CONTRACT.md.
 */
data class BundleManifest(
    @SerializedName("schemaVersion") val schemaVersion: Int? = null,
    @SerializedName("id") val id: String? = null,
    @SerializedName("dataVersion") val dataVersion: String? = null,
    @SerializedName("generatedAt") val generatedAt: String? = null,
    @SerializedName("extracaoTse") val extracaoTse: String? = null,
    @SerializedName("faseEleitoral") val faseEleitoral: String? = null,
    @SerializedName("resultadosDisponiveis") val resultadosDisponiveis: Boolean? = null,
    @SerializedName("contagens") val contagens: Map<String, Int>? = null,
    @SerializedName("atribuicao") val atribuicao: String? = null,
    @SerializedName("cliente") val cliente: Cliente? = null,
    @SerializedName("fontes") val fontes: List<Fonte>? = null,
    @SerializedName("arquivos") val arquivos: List<Arquivo>? = null
) {
    data class Cliente(
        @SerializedName("pollIntervalMinutes") val pollIntervalMinutes: Int? = null,
        @SerializedName("baseUrl") val baseUrl: String? = null,
        @SerializedName("minAppVersionCode") val minAppVersionCode: Int? = null,
        @SerializedName("nlu") val nlu: Nlu? = null,
        @SerializedName("aviso") val aviso: String? = null
    ) {
        data class Nlu(@SerializedName("endpoint") val endpoint: String? = null)
    }

    data class Fonte(
        @SerializedName("id") val id: String? = null,
        @SerializedName("descricao") val descricao: String? = null,
        @SerializedName("url") val url: String? = null,
        @SerializedName("licenca") val licenca: String? = null,
        @SerializedName("etag") val etag: String? = null,
        @SerializedName("lastModified") val lastModified: String? = null,
        @SerializedName("coletadoEm") val coletadoEm: String? = null
    )

    data class Arquivo(
        @SerializedName("path") val path: String? = null,
        @SerializedName("bytes") val bytes: Long? = null,
        @SerializedName("sha256") val sha256: String? = null,
        @SerializedName("records") val records: Int? = null
    )

    val minAppVersionCode: Int get() = cliente?.minAppVersionCode ?: 0
    val pollIntervalMinutes: Int get() = (cliente?.pollIntervalMinutes ?: 360).coerceIn(5, 24 * 60)

    /** Arquivos que o app baixa (as fotos são carregadas sob demanda pelo cache de imagens). */
    val arquivosDeDados: List<Arquivo>
        get() = arquivos.orEmpty().filter { !it.path.isNullOrBlank() && !it.path.startsWith("fotos/") }

    companion object {
        const val SCHEMA_SUPORTADO = 1
        private val gson = Gson()

        fun parse(json: ByteArray): BundleManifest =
            gson.fromJson(String(json, Charsets.UTF_8), BundleManifest::class.java)
                ?: throw IllegalArgumentException("manifesto vazio")
    }

    /** Valida estrutura básica e proteção contra caminhos maliciosos. Lança IllegalArgumentException. */
    fun validar() {
        require(schemaVersion != null && schemaVersion <= SCHEMA_SUPORTADO) { "schema não suportado: $schemaVersion" }
        require(!dataVersion.isNullOrBlank()) { "dataVersion ausente" }
        require(!generatedAt.isNullOrBlank()) { "generatedAt ausente" }
        val lista = arquivos.orEmpty()
        require(lista.isNotEmpty()) { "manifesto sem arquivos" }
        for (a in lista) {
            val p = a.path.orEmpty()
            require(p.isNotBlank() && !p.startsWith("/") && !p.contains("..") && !p.contains("\\")) { "caminho inválido: $p" }
            require(!a.sha256.isNullOrBlank() && a.sha256.length == 64) { "sha256 inválido em $p" }
            require((a.bytes ?: -1) >= 0) { "tamanho inválido em $p" }
        }
        require(lista.any { it.path == "regras.json" }) { "regras.json ausente" }
        require(lista.any { it.path?.startsWith("candidatos/") == true }) { "candidatos ausentes" }
    }
}
