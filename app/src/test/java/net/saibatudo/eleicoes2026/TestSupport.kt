package net.saibatudo.eleicoes2026

import kotlinx.coroutines.runBlocking
import net.saibatudo.eleicoes2026.ai.nlu.Gazetteer
import net.saibatudo.eleicoes2026.data.bundle.BundleManifest
import net.saibatudo.eleicoes2026.data.bundle.DirBundleReader
import net.saibatudo.eleicoes2026.data.datasource.BundleLoader
import net.saibatudo.eleicoes2026.data.datasource.ElectionData
import java.io.File

/** Dados REAIS do snapshot oficial (data/eleicoes2026) usados pelos testes — nada fictício. */
object TestData {
    val dir: File = File("../data/eleicoes2026").canonicalFile
    val chavePublica: String by lazy { File("../pipeline/data_signing_public.b64").readText().trim() }
    val manifestBytes: ByteArray by lazy { File(dir, "manifest.json").readBytes() }
    val assinatura: String by lazy { File(dir, "manifest.sig").readText().trim() }
    val manifest: BundleManifest by lazy { BundleManifest.parse(manifestBytes).also { it.validar() } }
    val dados: ElectionData by lazy { runBlocking { BundleLoader.carregar(DirBundleReader(dir), manifest) } }
    val gazetteer: Gazetteer by lazy { Gazetteer(dados.candidatos) }
}
