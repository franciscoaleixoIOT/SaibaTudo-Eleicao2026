package net.saibatudo.eleicoes2026.data.bundle

import android.content.res.AssetManager
import java.io.File
import java.io.FileNotFoundException
import java.io.InputStream

/** Acesso de leitura a um pacote de dados (snapshot embutido nos assets ou versão baixada em disco). */
interface BundleReader {
    /** Rótulo para exibição ("Snapshot do app" ou "Atualização baixada"). */
    val origem: String
    fun open(path: String): InputStream
    fun exists(path: String): Boolean
}

class AssetBundleReader(
    private val assets: AssetManager,
    private val base: String = ASSET_BASE
) : BundleReader {
    override val origem: String = "Snapshot embutido no app"

    override fun open(path: String): InputStream = assets.open("$base/$path")

    override fun exists(path: String): Boolean = try {
        assets.open("$base/$path").use { true }
    } catch (_: FileNotFoundException) {
        false
    } catch (_: java.io.IOException) {
        false
    }

    fun fotosEmpacotadas(): Set<String> =
        assets.list("$base/fotos")?.toSet().orEmpty()

    companion object {
        const val ASSET_BASE = "eleicoes2026"
    }
}

class DirBundleReader(private val dir: File) : BundleReader {
    override val origem: String = "Atualização baixada"

    private fun resolve(path: String): File {
        val f = File(dir, path).canonicalFile
        require(f.path.startsWith(dir.canonicalPath)) { "caminho fora do pacote: $path" }
        return f
    }

    override fun open(path: String): InputStream = resolve(path).inputStream().buffered()
    override fun exists(path: String): Boolean = resolve(path).isFile
}
