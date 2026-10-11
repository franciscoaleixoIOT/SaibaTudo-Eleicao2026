package net.saibatudo.quimica

import kotlinx.coroutines.runBlocking
import net.saibatudo.quimica.data.bundle.BundleLoader
import net.saibatudo.quimica.data.bundle.BundleManifest
import net.saibatudo.quimica.data.bundle.DirBundleReader
import net.saibatudo.quimica.data.repository.Pacote
import java.io.File

/**
 * Dados dos testes. [Fixture] é o pacote mínimo e assinado de app/src/test/resources/data-quimica (10 elementos,
 * 20 compostos): determinístico, usado nos testes de cálculo. [Real] é data/quimica (pacote do pipeline), usado
 * nos testes de integridade e de contrato quando existe.
 */
class PacoteDeTeste(val dir: File) {
    val manifestBytes: ByteArray by lazy { File(dir, "manifest.json").readBytes() }
    val assinatura: String by lazy { File(dir, "manifest.sig").readText().trim() }
    val manifest: BundleManifest by lazy { BundleManifest.parse(manifestBytes).also { it.validar() } }
    val pacote: Pacote by lazy { runBlocking { BundleLoader.carregar(DirBundleReader(dir), manifest, verificarHash = true) } }
}

object TestData {
    val chavePublica: String by lazy { File("../pipeline/data_signing_public.b64").readText().trim() }

    val Fixture = PacoteDeTeste(File("src/test/resources/data-quimica").canonicalFile)

    private val dirReal = File("../data/quimica").canonicalFile
    val Real: PacoteDeTeste? = if (File(dirReal, "manifest.json").isFile && File(dirReal, "manifest.sig").isFile) PacoteDeTeste(dirReal) else null

    /** Pacote usado onde só importa ter dados (NLU, respostas): o real, se existir; senão o fixture. */
    val Melhor: PacoteDeTeste get() = Real ?: Fixture

    /** Pasta de contratos compartilhados com o site (contracts/). */
    val contratos = File("../contracts").canonicalFile
}
