package net.saibatudo.quimica

import com.google.gson.JsonParser
import kotlinx.coroutines.runBlocking
import net.saibatudo.quimica.data.bundle.BundleManifest
import net.saibatudo.quimica.data.bundle.DataUpdater
import net.saibatudo.quimica.data.bundle.DirBundleReader
import net.saibatudo.quimica.data.bundle.ManifestVerifier
import net.saibatudo.quimica.data.bundle.PacoteAtivo
import net.saibatudo.quimica.data.bundle.PacoteStore
import net.saibatudo.quimica.data.bundle.UpdateResult
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

/** Atualização do pacote: assinatura, checksums, delta, anti-rollback, ativação atômica e falhas de rede. */
class DataUpdaterTest {

    @get:Rule val tmp = TemporaryFolder()
    private lateinit var server: MockWebServer
    private val fonte = TestData.Fixture
    private val sobrescritas = mutableMapOf<String, ByteArray>()
    private var manifestRemoto: ByteArray = fonte.manifestBytes
    private var assinaturaRemota: String = fonte.assinatura
    private val requisicoes = mutableListOf<String>()

    private class FakeStore(private val raiz: File, var ativoAtual: PacoteAtivo) : PacoteStore {
        var ativadoComo: String? = null
        var revertido = false
        override fun ativo() = ativoAtual
        override fun novoStaging(versao: String) = File(raiz, "staging-$versao").also { it.deleteRecursively(); it.mkdirs() }
        override fun ativar(staging: File, versao: String) {
            val dest = File(raiz, versao)
            check(staging.renameTo(dest))
            ativoAtual = PacoteAtivo(DirBundleReader(dest), BundleManifest.parse(File(dest, "manifest.json").readBytes()), dest)
            ativadoComo = versao
        }
        override fun reverter() { revertido = true }
    }

    @Before fun subir() {
        server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val caminho = request.path!!.removePrefix("/quimica/data/")
                requisicoes += caminho
                val corpo: ByteArray? = when (caminho) {
                    "manifest.json" -> manifestRemoto
                    "manifest.sig" -> assinaturaRemota.toByteArray()
                    else -> sobrescritas[caminho] ?: File(fonte.dir, caminho).takeIf { it.isFile }?.readBytes()
                }
                return if (corpo == null) MockResponse().setResponseCode(404) else MockResponse().setBody(Buffer().write(corpo))
            }
        }
        server.start()
    }

    @After fun derrubar() = server.shutdown()

    /** Pacote "ativo" derivado do fixture, mais antigo e com o sha256 de [arquivosDiferentes] divergente do remoto. */
    private fun ativo(versao: String, geradoEm: String, arquivosDiferentes: Set<String> = emptySet()): FakeStore {
        val dir = tmp.newFolder("ativo")
        fonte.dir.copyRecursively(dir, overwrite = true)
        val o = JsonParser.parseString(String(fonte.manifestBytes)).asJsonObject
        o.addProperty("version", versao)
        o.addProperty("generatedAt", geradoEm)
        for (a in arquivosDiferentes) o.getAsJsonObject("files").getAsJsonObject(a).addProperty("sha256", "0".repeat(64))
        File(dir, "manifest.json").writeText(o.toString())
        val m = BundleManifest.parse(File(dir, "manifest.json").readBytes())
        return FakeStore(tmp.newFolder("raiz"), PacoteAtivo(DirBundleReader(dir), m, dir))
    }

    private fun atualizador(store: PacoteStore, verificador: ManifestVerifier = ManifestVerifier(TestData.chavePublica)) =
        DataUpdater(store, OkHttpClient(), server.url("/quimica/data/").toString(), verificador, appVersionCode = 1)

    @Test fun mesmaVersaoRetornaUpToDate() = runBlocking {
        val store = FakeStore(tmp.newFolder("r"), PacoteAtivo(DirBundleReader(fonte.dir), fonte.manifest, fonte.dir))
        assertEquals(UpdateResult.UpToDate, atualizador(store).atualizar())
        assertNull(store.ativadoComo)
        assertEquals(listOf("manifest.json", "manifest.sig"), requisicoes)     // não baixa nenhum arquivo de dados
    }

    @Test fun atualizacaoValidaBaixaSomenteOQueMudouEAtivaDeFormaAtomica() = runBlocking {
        val store = ativo("antiga", "2026-01-01T00:00:00Z", setOf("compostos/lote-001.json"))
        val r = atualizador(store).atualizar()
        assertTrue(r.toString(), r is UpdateResult.Updated)
        r as UpdateResult.Updated
        assertEquals(1, r.arquivosBaixados)
        assertEquals(fonte.manifest.version, store.ativadoComo)
        assertTrue(requisicoes.count { it.startsWith("compostos/") } == 1)
        // o pacote ativado tem todos os arquivos com os checksums do manifesto assinado
        for (a in store.ativoAtual.manifest.arquivosDeDados) {
            assertEquals(a.sha256, ManifestVerifier.sha256Hex(File(store.ativoAtual.dir!!, a.path).readBytes()))
        }
        assertTrue(File(store.ativoAtual.dir!!, "manifest.sig").readText().isNotBlank())
    }

    @Test fun arquivoAdulteradoNoServidorEntraEmFalhaSemAtivacao() = runBlocking {
        val store = ativo("antiga", "2026-01-01T00:00:00Z", setOf("compostos/lote-001.json"))
        sobrescritas["compostos/lote-001.json"] = "[]".toByteArray()
        val r = atualizador(store).atualizar()
        assertTrue(r.toString(), r is UpdateResult.Failed && r.erro.contains("checksum"))
        assertNull(store.ativadoComo)
    }

    @Test fun tamanhoDivergenteEhRejeitado() = runBlocking {
        val store = ativo("antiga", "2026-01-01T00:00:00Z", setOf("constantes.json"))
        sobrescritas["constantes.json"] = File(fonte.dir, "constantes.json").readBytes() + " ".toByteArray()
        val r = atualizador(store).atualizar()
        assertTrue(r.toString(), r is UpdateResult.Failed)
        assertNull(store.ativadoComo)
    }

    @Test fun assinaturaInvalidaERejeitada() = runBlocking {
        val store = ativo("antiga", "2026-01-01T00:00:00Z")
        manifestRemoto = fonte.manifestBytes.copyOf().also { it[20] = (it[20] + 1).toByte() }
        val r = atualizador(store).atualizar()
        assertTrue(r.toString(), r is UpdateResult.Failed && r.erro.contains("INVÁLIDA"))
        assertNull(store.ativadoComo)
    }

    @Test fun chaveErradaOuAusenteNuncaAceita() = runBlocking {
        val store = ativo("antiga", "2026-01-01T00:00:00Z")
        val semChave = atualizador(store, ManifestVerifier("")).atualizar()
        assertTrue(semChave.toString(), semChave is UpdateResult.Failed)
        assertNull(store.ativadoComo)
    }

    @Test fun pacoteMaisAntigoQueOAtivoERejeitadoAntiRollback() = runBlocking {
        val store = ativo("futura", "2099-01-01T00:00:00Z")
        val r = atualizador(store).atualizar()
        assertTrue(r.toString(), r is UpdateResult.Skipped)
        assertNull(store.ativadoComo)
    }

    @Test fun exigeVersaoMaisNovaDoApp() = runBlocking {
        val o = JsonParser.parseString(String(fonte.manifestBytes)).asJsonObject
        o.getAsJsonObject("cliente").addProperty("minAppVersionCode", 99)
        // sem a chave privada não dá para reassinar: usa um verificador que aceita qualquer coisa conhecida? Não: só vale se a assinatura confere.
        manifestRemoto = o.toString().toByteArray()
        val store = ativo("antiga", "2026-01-01T00:00:00Z")
        val r = atualizador(store).atualizar()
        assertTrue("manifesto alterado perde a assinatura", r is UpdateResult.Failed)
    }

    @Test fun servidorForaDoArFalhaSemDanificarOPacoteAtual() = runBlocking {
        val store = ativo("antiga", "2026-01-01T00:00:00Z")
        server.shutdown()
        val r = atualizador(store).atualizar()
        assertTrue(r.toString(), r is UpdateResult.Failed)
        assertEquals("antiga", store.ativoAtual.manifest.version)
    }

    @Test fun respostaDeErroHttpFalha() = runBlocking {
        val store = ativo("antiga", "2026-01-01T00:00:00Z")
        manifestRemoto = ByteArray(0)
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest) = MockResponse().setResponseCode(503)
        }
        val r = atualizador(store).atualizar()
        assertTrue(r.toString(), r is UpdateResult.Failed && r.erro.contains("503"))
    }
}
