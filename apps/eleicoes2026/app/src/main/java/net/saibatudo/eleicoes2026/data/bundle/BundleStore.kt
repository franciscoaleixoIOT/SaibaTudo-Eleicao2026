package net.saibatudo.eleicoes2026.data.bundle

import android.content.Context
import java.io.File

/** Pacote de dados ativo (leitor + manifesto + diretório quando baixado). */
data class PacoteAtivo(val reader: BundleReader, val manifest: BundleManifest, val dir: File?)

/** Contrato de armazenamento de pacotes (permite testes de atualização sem Android). */
interface PacoteStore {
    fun ativo(): PacoteAtivo
    fun novoStaging(versao: String): File
    fun ativar(staging: File, versao: String)
}

/**
 * Gerencia qual pacote de dados está ATIVO:
 *   1. a versão baixada mais recente e válida em  filesDir/bundles/<versão>/  (apontada por current.txt), ou
 *   2. o snapshot embutido nos assets (sempre disponível — funciona offline desde a 1ª execução).
 *
 * A troca é atômica (current.txt é gravado via arquivo temporário + rename). Versões antigas são removidas,
 * mantendo apenas a ativa e a anterior (para reverter se a ativa estiver corrompida).
 */
class BundleStore(private val context: Context) : PacoteStore {

    private val root = File(context.filesDir, "bundles")
    private val pointer = File(root, "current.txt")
    private val assetReader = AssetBundleReader(context.assets)

    /** Pacote ativo: atualização baixada (se íntegra e mais nova que o snapshot) ou snapshot embutido. */
    override fun ativo(): PacoteAtivo {
        val snapshot = lerManifesto(assetReader)
        val baixado = versaoBaixadaAtiva()
        if (baixado != null && (snapshot == null || baixado.manifest.generatedAt.orEmpty() >= snapshot.generatedAt.orEmpty())) {
            return baixado
        }
        return PacoteAtivo(assetReader, snapshot ?: throw IllegalStateException("snapshot de dados ausente nos assets"), null)
    }

    fun assets(): AssetBundleReader = assetReader

    private fun versaoBaixadaAtiva(): PacoteAtivo? {
        val nome = runCatching { pointer.readText().trim() }.getOrNull()?.takeIf { it.isNotBlank() } ?: return null
        val dir = File(root, nome)
        if (!dir.isDirectory) return null
        val reader = DirBundleReader(dir)
        val manifest = lerManifesto(reader) ?: return null
        // validação barata: todos os arquivos existem com o tamanho declarado
        val completo = manifest.arquivosDeDados.all { a ->
            val f = File(dir, a.path!!)
            f.isFile && f.length() == a.bytes
        }
        return if (completo) PacoteAtivo(reader, manifest, dir) else null
    }

    private fun lerManifesto(reader: BundleReader): BundleManifest? = try {
        val m = reader.open("manifest.json").use { BundleManifest.parse(it.readBytes()) }
        m.validar()
        m
    } catch (_: Exception) {
        null
    }

    /** Descarta a atualização baixada (ex.: corrompida) e volta ao snapshot embutido. */
    fun invalidarBaixado() {
        pointer.delete()
    }

    /** Diretório de preparo para uma nova versão (limpo). */
    override fun novoStaging(versao: String): File {
        root.mkdirs()
        val dir = File(root, "staging-" + versao.sanitizar())
        if (dir.exists()) dir.deleteRecursively()
        dir.mkdirs()
        return dir
    }

    /** Ativa o staging: renomeia para o nome final e aponta current.txt (atômico). */
    override fun ativar(staging: File, versao: String) {
        val destino = File(root, versao.sanitizar())
        if (destino.exists()) destino.deleteRecursively()
        check(staging.renameTo(destino)) { "falha ao ativar pacote" }
        val tmp = File(root, "current.txt.tmp")
        tmp.writeText(destino.name)
        check(tmp.renameTo(pointer) || run { pointer.delete(); tmp.renameTo(pointer) }) { "falha ao gravar ponteiro" }
        limparAntigas(manter = setOf(destino.name, versaoAnterior(destino.name)))
    }

    private fun versaoAnterior(atual: String): String? =
        root.listFiles { f -> f.isDirectory && !f.name.startsWith("staging-") && f.name != atual }
            ?.maxByOrNull { it.lastModified() }?.name

    private fun limparAntigas(manter: Set<String?>) {
        root.listFiles()?.forEach { f ->
            if (f.isDirectory && f.name !in manter) f.deleteRecursively()
        }
    }

    private fun String.sanitizar() = replace(Regex("[^A-Za-z0-9._-]"), "_")
}
