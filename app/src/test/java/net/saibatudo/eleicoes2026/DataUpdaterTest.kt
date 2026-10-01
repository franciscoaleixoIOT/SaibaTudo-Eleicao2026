package net.saibatudo.eleicoes2026

import kotlinx.coroutines.runBlocking
import net.saibatudo.eleicoes2026.data.bundle.BundleManifest
import net.saibatudo.eleicoes2026.data.bundle.DataUpdater
import net.saibatudo.eleicoes2026.data.bundle.DirBundleReader
import net.saibatudo.eleicoes2026.data.bundle.ManifestVerifier
import net.saibatudo.eleicoes2026.data.bundle.PacoteAtivo
import net.saibatudo.eleicoes2026.data.bundle.PacoteStore
import net.saibatudo.eleicoes2026.data.bundle.UpdateResult
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/** Atualização de dados: assinatura, checksums, delta, anti-rollback e ativação atômica. */
class DataUpdaterTest {

    @get:Rule val tmp = TemporaryFolder()
    private lateinit var server: MockWebServer
    private val overrides = mutableMapOf<String, ByteArray>()
    private var manifestRemoto: ByteArray = TestData.manifestBytes
    private var assinaturaRemota: String = TestData.assinatura

    /** Armazenamento em disco temporário com um pacote "ativo" derivado do snapshot real. */
    private class FakeStore(private val raiz: File, var ativoAtual: PacoteAtivo) : PacoteStore {
        var ativadoComo: String? = null
        override fun ativo() = ativoAtual
        override fun novoStaging(versao: String) = File(raiz, "staging-$versao").also { it.deleteRecursively(); it.mkdirs() }
        override fun ativar(staging: File, versao: String) {
            val dest = File(raiz, versao)
            check(staging.renameTo(dest))
            val m = BundleManifest.parse(File(dest, "manifest.json").readBytes())
            ativoAtual = PacoteAtivo(DirBundleReader(dest), m, dest)
            ativadoComo = versao
        }
    }

    @Before
    fun subir() {
        server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val path = request.path!!.removePrefix("/data/")
                val corpo: ByteArray? = when (path) {
                    "manifest.json" -> manifestRemoto
                    "manifest.sig" -> assinaturaRemota.toByteArray()
                    else -> overrides[path] ?: File(TestData.dir, path).takeIf { it.isFile }?.readBytes()
                }
                return if (corpo == null) MockResponse().setResponseCode(404)
                else MockResponse().setBody(Buffer().write(corpo))
            }
        }
        server.start()
    }

    @After fun derrubar() = server.shutdown()

    /** Cria pacote ativo = cópia do snapshot (sem fotos) com manifesto alterado por [ajuste]. */
    private fun pacoteAtivo(ajuste: (BundleManifest) -> BundleManifest): FakeStore {
        val dir = tmp.newFolder("ativo")
        TestData.manifest.arquivosDeDados.forEach { a ->
            File(dir, a.path!!).also { it.parentFile!!.mkdirs() }.writeBytes(File(TestData.dir, a.path!!).readBytes())
        }
        val m = ajuste(TestData.manifest)
        File(dir, "manifest.json").writeText(com.google.gson.Gson().toJson(m))
        return FakeStore(tmp.newFolder("raiz"), PacoteAtivo(DirBundleReader(dir), m, dir))
    }

    private fun atualizador(store: PacoteStore) = DataUpdater(
        store, OkHttpClient(), server.url("/data/").toString(), ManifestVerifier(TestData.chavePublica), appVersionCode = 1
    )

    @Test
    fun mesmaVersaoRetornaUpToDate() = runBlocking {
        val store = pacoteAtivo { it }
        assertEquals(UpdateResult.UpToDate, atualizador(store).atualizar())
        assertNull(store.ativadoComo)
    }

    @Test
    fun atualizacaoValidaBaixaSomenteOQueMudou() = runBlocking {
        // ativo: mais antigo, e com checksum divergente em um único shard => apenas ele é baixado
        val store = pacoteAtivo { m ->
            m.copy(
                dataVersion = "antiga", generatedAt = "2026-01-01T00:00:00Z",
                arquivos = m.arquivos!!.map { a -> if (a.path == "candidatos/AC.json") a.copy(sha256 = "0".repeat(64)) else a }
            )
        }
        val r = atualizador(store).atualizar()
        assertTrue(r.toString(), r is UpdateResult.Updated)
        r as UpdateResult.Updated
        assertEquals(1, r.arquivosBaixados)
        assertEquals(TestData.manifest.dataVersion, store.ativadoComo)
        // pacote ativado contém todos os arquivos com os checksums do manifesto assinado
        store.ativoAtual.manifest.arquivosDeDados.forEach { a ->
            assertEquals(a.sha256, ManifestVerifier.sha256Hex(File(store.ativoAtual.dir!!, a.path!!).readBytes()))
        }
    }

    @Test
    fun arquivoAdulteradoNoServidorEntraEmFalhaESemAtivacao() = runBlocking {
        val store = pacoteAtivo { m ->
            m.copy(dataVersion = "antiga", generatedAt = "2026-01-01T00:00:00Z",
                arquivos = m.arquivos!!.map { a -> if (a.path == "candidatos/SP.json") a.copy(sha256 = "1".repeat(64)) else a })
        }
        overrides["candidatos/SP.json"] = "[]".toByteArray()
        val r = atualizador(store).atualizar()
        assertTrue(r.toString(), r is UpdateResult.Failed)
        assertNull(store.ativadoComo)
    }

    @Test
    fun assinaturaInvalidaERejeitada() = runBlocking {
        val store = pacoteAtivo { it.copy(dataVersion = "antiga", generatedAt = "2026-01-01T00:00:00Z") }
        manifestRemoto = TestData.manifestBytes.copyOf().also { it[20] = (it[20] + 1).toByte() }
        val r = atualizador(store).atualizar()
        assertTrue(r.toString(), r is UpdateResult.Failed && (r as UpdateResult.Failed).erro.contains("INVÁLIDA"))
        assertNull(store.ativadoComo)
    }

    @Test
    fun pacoteMaisAntigoQueOAtivoERejeitadoAntiRollback() = runBlocking {
        val store = pacoteAtivo { it.copy(dataVersion = "futura", generatedAt = "2099-01-01T00:00:00Z") }
        val r = atualizador(store).atualizar()
        assertTrue(r.toString(), r is UpdateResult.Skipped)
        assertNull(store.ativadoComo)
    }

    @Test
    fun servidorForaDoArFalhaSemDanificarOPacoteAtual() = runBlocking {
        val store = pacoteAtivo { it.copy(dataVersion = "antiga", generatedAt = "2026-01-01T00:00:00Z") }
        server.shutdown()
        val r = atualizador(store).atualizar()
        assertTrue(r.toString(), r is UpdateResult.Failed)
        assertEquals("antiga", store.ativoAtual.manifest.dataVersion)
    }
}
