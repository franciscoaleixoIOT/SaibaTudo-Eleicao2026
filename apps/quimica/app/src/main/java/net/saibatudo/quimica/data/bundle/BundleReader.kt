package net.saibatudo.quimica.data.bundle

import android.content.res.AssetManager
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException
import java.io.InputStream

/** Acesso de leitura a um pacote de dados (snapshot embutido nos assets ou versão baixada em disco). */
interface BundleReader {
    /** Rótulo para exibição ("Pacote embutido no app" ou "Atualização baixada"). */
    val origem: String
    fun open(path: String): InputStream
    fun exists(path: String): Boolean
}

class AssetBundleReader(
    private val assets: AssetManager,
    private val base: String = ASSET_BASE
) : BundleReader {
    override val origem: String = "Pacote embutido no app"

    override fun open(path: String): InputStream = assets.open("$base/$path")

    override fun exists(path: String): Boolean = try {
        assets.open("$base/$path").use { true }
    } catch (_: FileNotFoundException) {
        false
    } catch (_: IOException) {
        false
    }

    companion object {
        /** Pasta dos assets onde o pacote é embutido (data/quimica/ vira assets/quimica/). */
        const val ASSET_BASE = "quimica"
    }
}

class DirBundleReader(private val dir: File, override val origem: String = "Atualização baixada") : BundleReader {

    private fun resolve(path: String): File {
        val f = File(dir, path).canonicalFile
        require(f.path.startsWith(dir.canonicalPath)) { "caminho fora do pacote: $path" }
        return f
    }

    override fun open(path: String): InputStream = resolve(path).inputStream().buffered()
    override fun exists(path: String): Boolean = resolve(path).isFile
}
