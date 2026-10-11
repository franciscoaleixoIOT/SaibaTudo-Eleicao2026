package net.saibatudo.quimica.data.bundle

import android.content.Context
import java.io.File

/** Pacote de dados ativo (leitor + manifesto + diretório quando baixado). */
data class PacoteAtivo(val reader: BundleReader, val manifest: BundleManifest, val dir: File?)

/** Contrato de armazenamento de pacotes (permite testes de atualização sem Android). */
interface PacoteStore {
    fun ativo(): PacoteAtivo
    fun novoStaging(versao: String): File
    fun ativar(staging: File, versao: String)

    /** Volta para a versão anterior (ou para o pacote embutido) quando a ativa não pode ser lida. */
    fun reverter()
}

/**
 * Gerencia qual pacote de dados está ATIVO:
 *   1. a versão baixada mais recente, íntegra e com assinatura válida em  filesDir/bundles/<versão>/  (apontada por current.txt), ou
 *   2. o pacote embutido nos assets (sempre disponível: funciona offline desde a 1ª execução).
 *
 * A troca é atômica (current.txt é gravado via arquivo temporário + rename). Mantém a versão ativa e a anterior;
 * se a ativa não puder ser lida, [reverter] volta para a anterior e, não havendo, para o pacote embutido.
 */
class BundleStore(
    private val root: File,
    private val assetReader: BundleReader,
    private val verifier: ManifestVerifier? = null
) : PacoteStore {

    constructor(context: Context, verifier: ManifestVerifier? = null) :
        this(File(context.filesDir, "bundles"), AssetBundleReader(context.assets), verifier)

    private val pointer = File(root, "current.txt")
    private val previousPointer = File(root, "previous.txt")

    /** Pacote ativo: atualização baixada (se íntegra e não mais antiga que a embutida) ou o pacote embutido. */
    override fun ativo(): PacoteAtivo {
        val embutido = lerManifesto(assetReader)
        val baixado = versaoBaixada(pointer)
        if (baixado != null && (embutido == null || baixado.manifest.generatedAt.orEmpty() >= embutido.generatedAt.orEmpty())) {
            return baixado
        }
        return PacoteAtivo(assetReader, embutido ?: throw IllegalStateException("pacote de dados ausente nos assets"), null)
    }

    private fun versaoBaixada(ponteiro: File): PacoteAtivo? {
        val nome = runCatching { ponteiro.readText().trim() }.getOrNull()?.takeIf { it.isNotBlank() } ?: return null
        val dir = File(root, nome)
        if (!dir.isDirectory) return null
        val reader = DirBundleReader(dir)
        val manifest = lerManifesto(reader) ?: return null
        // assinatura do manifesto gravado em disco (o disco não é confiável) + todos os arquivos com o tamanho declarado
        val v = verifier
        if (v != null) {
            val ok = runCatching {
                v.verify(File(dir, "manifest.json").readBytes(), File(dir, "manifest.sig").readText())
            }.getOrDefault(false)
            if (!ok) return null
        }
        val completo = manifest.arquivosDeDados.all { a ->
            val f = File(dir, a.path)
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

    /** Descarta a atualização ativa (ex.: corrompida): volta à versão anterior, se íntegra, ou ao pacote embutido. */
    override fun reverter() {
        val anterior = versaoBaixada(previousPointer)
        if (anterior != null && anterior.dir != null) {
            gravarPonteiro(pointer, anterior.dir.name)
            previousPointer.delete()
        } else {
            pointer.delete()
        }
        limparAntigas(manter = setOfNotNull(runCatching { pointer.readText().trim() }.getOrNull()))
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
        root.mkdirs()
        val destino = File(root, versao.sanitizar())
        val atualAntes = runCatching { pointer.readText().trim() }.getOrNull()?.takeIf { it.isNotBlank() && it != destino.name }
        if (destino.exists()) destino.deleteRecursively()
        check(staging.renameTo(destino)) { "falha ao ativar pacote" }
        if (atualAntes != null) gravarPonteiro(previousPointer, atualAntes)
        gravarPonteiro(pointer, destino.name)
        limparAntigas(manter = setOfNotNull(destino.name, atualAntes))
    }

    private fun gravarPonteiro(alvo: File, nome: String) {
        val tmp = File(root, alvo.name + ".tmp")
        tmp.writeText(nome)
        check(tmp.renameTo(alvo) || run { alvo.delete(); tmp.renameTo(alvo) }) { "falha ao gravar ponteiro" }
    }

    private fun limparAntigas(manter: Set<String>) {
        root.listFiles()?.forEach { f ->
            if (f.isDirectory && f.name !in manter) f.deleteRecursively()
        }
    }

    private fun String.sanitizar() = replace(Regex("[^A-Za-z0-9._-]"), "_")
}
