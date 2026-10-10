package net.saibatudo.quimica

import com.google.gson.JsonParser
import kotlinx.coroutines.runBlocking
import net.saibatudo.quimica.data.bundle.BundleLoader
import net.saibatudo.quimica.data.bundle.BundleManifest
import net.saibatudo.quimica.data.bundle.BundleStore
import net.saibatudo.quimica.data.bundle.DirBundleReader
import net.saibatudo.quimica.data.bundle.ManifestVerifier
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.security.KeyPairGenerator
import java.security.spec.ECGenParameterSpec
import java.util.Base64

/** Carga e assinatura do pacote (válido, adulterado, chave errada), checksums, lotes sob demanda, troca atômica e rollback. */
class BundleTest {

    @get:Rule val tmp = TemporaryFolder()

    private val fixture = TestData.Fixture

    private fun pacotes(): List<PacoteDeTeste> = listOfNotNull(TestData.Fixture, TestData.Real)

    // ---- assinatura -----------------------------------------------------------------------------------------------------------

    @Test fun manifestoAssinadoComAChavePublicaDoApp() {
        val v = ManifestVerifier(TestData.chavePublica)
        for (p in pacotes()) assertTrue("assinatura válida: ${p.dir}", v.verify(p.manifestBytes, p.assinatura))
    }

    @Test fun manifestoAdulteradoAssinaturaLixoOuSemChaveSaoRejeitados() {
        val v = ManifestVerifier(TestData.chavePublica)
        val adulterado = fixture.manifestBytes.copyOf().also { it[10] = (it[10] + 1).toByte() }
        assertFalse(v.verify(adulterado, fixture.assinatura))
        assertFalse(v.verify(fixture.manifestBytes, "AAAA"))
        assertFalse(v.verify(fixture.manifestBytes, ""))
        assertFalse(ManifestVerifier("").verify(fixture.manifestBytes, fixture.assinatura))
        assertFalse(ManifestVerifier("isto-nao-e-uma-chave").verify(fixture.manifestBytes, fixture.assinatura))
    }

    @Test fun assinaturaDeOutraChaveEhRejeitada() {
        // chave P-256 qualquer, que NÃO é a do projeto: não pode validar o manifesto do projeto nem assinar um manifesto aceito
        val par = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
        val outraPublica = Base64.getEncoder().encodeToString(par.public.encoded)
        assertFalse(ManifestVerifier(outraPublica).verify(fixture.manifestBytes, fixture.assinatura))
        val assinador = java.security.Signature.getInstance("SHA256withECDSA").apply { initSign(par.private); update(fixture.manifestBytes) }
        val assinaturaFalsa = Base64.getEncoder().encodeToString(assinador.sign())
        assertTrue("a assinatura falsa é válida para a chave dela", ManifestVerifier(outraPublica).verify(fixture.manifestBytes, assinaturaFalsa))
        assertFalse("mas não para a chave do app", ManifestVerifier(TestData.chavePublica).verify(fixture.manifestBytes, assinaturaFalsa))
    }

    // ---- integridade ------------------------------------------------------------------------------------------------------------

    @Test fun checksumsETamanhosDeTodosOsArquivosDoManifesto() {
        for (p in pacotes()) {
            assertTrue(p.manifest.arquivos.isNotEmpty())
            for (a in p.manifest.arquivos) {
                val f = File(p.dir, a.path)
                assertTrue("arquivo ausente: ${a.path}", f.isFile)
                assertEquals("tamanho: ${a.path}", a.bytes, f.length())
                assertEquals("sha256: ${a.path}", a.sha256, ManifestVerifier.sha256Hex(f.readBytes()))
            }
        }
    }

    @Test fun manifestoRecusaCaminhosPerigososEEsquemasNovos() {
        fun com(ajuste: (com.google.gson.JsonObject) -> Unit): BundleManifest {
            val o = JsonParser.parseString(String(fixture.manifestBytes)).asJsonObject
            ajuste(o)
            return BundleManifest.parse(o.toString().toByteArray())
        }
        val validos = com { }
        validos.validar()
        for (caminho in listOf("../fora.json", "/absoluto.json", "a\\\\b.json", "c:/x.json")) {
            val m = com { o -> o.getAsJsonObject("files").add(caminho, o.getAsJsonObject("files").get("elementos.json")) }
            try { m.validar(); fail("deveria recusar $caminho") } catch (_: IllegalArgumentException) { }
        }
        try { com { it.addProperty("schemaVersion", 99) }.validar(); fail() } catch (_: IllegalArgumentException) { }
        try { com { it.remove("generatedAt") }.validar(); fail() } catch (_: IllegalArgumentException) { }
        try { com { o -> o.getAsJsonObject("files").remove("elementos.json") }.validar(); fail() } catch (_: IllegalArgumentException) { }
    }

    // ---- carga --------------------------------------------------------------------------------------------------------------------

    @Test fun cargaDoFixtureCoerenteComOContrato() {
        val p = fixture.pacote
        assertEquals(10, p.elementos.size)
        assertEquals(20, p.indice.tamanho)
        assertNotNull(p.constante("R"))
        assertEquals(8.314462618, p.constante("R")!!.valor, 1e-12)
        assertTrue(p.regras.unidades.any { it.simbolo == "°C" && it.offset == 273.15 })
        assertTrue(p.regras.propriedades.any { it.id == "pontoFusao" })
        assertTrue(p.fontesExibicao.isNotEmpty())
        val o = p.porSimbolo.getValue("O")
        assertEquals(8, o.z)
        assertEquals(15.999, o.massaAtomica!!, 1e-9)
        assertEquals("1774", o.descobertaAno.toString())
        assertNull(p.porSimbolo.getValue("C").pontoFusaoK)         // ausência de dado = ausência de campo
    }

    @Test fun lotesDeCompostosSaoCarregadosSobDemandaEVerificados() = runBlocking {
        val p = fixture.pacote
        val aspirina = p.composto(2244)
        assertNotNull(aspirina)
        assertEquals("Ácido acetilsalicílico", aspirina!!.nome)
        assertEquals("CC(=O)OC1=CC=CC=C1C(=O)O", aspirina.smiles)
        assertEquals(listOf("GHS07"), aspirina.ghs!!.pictogramas)
        assertNull(p.composto(1))                                    // fora do índice
        val etanol = p.composto(702)!!
        assertTrue(etanol.icscBuscaUrl!!.startsWith("https://"))
        assertEquals("CHEBI:16236", etanol.definicaoChebi!!.id)
        assertEquals(3, p.trechos().size)
    }

    @Test fun arquivoAdulteradoNoDiscoEhDetectadoNaCargaEmLote() {
        val dir = tmp.newFolder("copia")
        fixture.dir.copyRecursively(dir, overwrite = true)
        val lote = File(dir, "compostos/lote-001.json")
        lote.writeText(lote.readText().replace("Aspirina", "Aspirinx"))
        val p = runBlocking { BundleLoader.carregar(DirBundleReader(dir), fixture.manifest, verificarHash = true) }
        try {
            runBlocking { p.composto(2244) }
            fail("deveria detectar o checksum divergente")
        } catch (e: IllegalStateException) {
            assertTrue(e.message!!.contains("checksum"))
        }
        // arquivo-base adulterado: a própria carga falha
        File(dir, "elementos.json").writeText("[]")
        try {
            runBlocking { BundleLoader.carregar(DirBundleReader(dir), fixture.manifest, verificarHash = true) }
            fail()
        } catch (e: IllegalStateException) {
            assertTrue(e.message!!.contains("checksum"))
        }
    }

    @Test fun pacoteRealQuandoExisteTem118ElementosECompostos() {
        val real = TestData.Real ?: return
        val p = real.pacote
        assertEquals(118, p.elementos.size)
        assertTrue("núcleo de compostos esperado", p.indice.tamanho >= 100)
        assertTrue(p.constante("R") != null || (p.constante("NA") != null && p.constante("kB") != null))
        runBlocking {
            val amostra = p.indice.entradas.take(25).mapNotNull { p.composto(it.cid) }
            assertEquals(25, amostra.size)
            assertTrue(amostra.all { it.nome.isNotBlank() })
        }
    }

    // ---- troca atômica e rollback -----------------------------------------------------------------------------------------------

    /** Copia o fixture para uma pasta de pacote "baixado", opcionalmente com [ajuste] no manifesto (assinatura continua a do fixture). */
    private fun pacoteBaixado(nome: String, versao: String, geradoEm: String): File {
        val staging = File(tmp.root, "staging-$nome")
        fixture.dir.copyRecursively(staging, overwrite = true)
        val o = JsonParser.parseString(String(fixture.manifestBytes)).asJsonObject
        o.addProperty("version", versao)
        o.addProperty("generatedAt", geradoEm)
        File(staging, "manifest.json").writeText(o.toString())
        return staging
    }

    private fun armazenamento(verificador: ManifestVerifier? = null) =
        BundleStore(File(tmp.root, "bundles"), DirBundleReader(fixture.dir, "Pacote embutido (teste)"), verificador)

    @Test fun semAtualizacaoUsaOPacoteEmbutido() {
        val a = armazenamento().ativo()
        assertNull(a.dir)
        assertEquals(fixture.manifest.version, a.manifest.version)
    }

    @Test fun ativarTrocaDeFormaAtomicaEMantemAAnterior() {
        val s = armazenamento()
        s.ativar(pacoteBaixado("v1", "v1", "2026-10-11T00:00:00Z"), "v1")
        assertEquals("v1", s.ativo().manifest.version)
        s.ativar(pacoteBaixado("v2", "v2", "2026-10-12T00:00:00Z"), "v2")
        assertEquals("v2", s.ativo().manifest.version)
        assertTrue(File(tmp.root, "bundles/v1").isDirectory)     // a anterior fica, para o rollback
        s.reverter()
        assertEquals("v1", s.ativo().manifest.version)
        s.reverter()
        assertNull(s.ativo().dir)                                 // sem anterior: volta ao embutido
        assertEquals(fixture.manifest.version, s.ativo().manifest.version)
    }

    @Test fun atualizacaoMaisAntigaQueAEmbutidaNaoVale() {
        val s = armazenamento()
        s.ativar(pacoteBaixado("velha", "velha", "2020-01-01T00:00:00Z"), "velha")
        assertEquals(fixture.manifest.version, s.ativo().manifest.version)
    }

    @Test fun pacoteBaixadoCorrompidoOuComAssinaturaInvalidaCaiParaOEmbutido() {
        val verificador = ManifestVerifier(TestData.chavePublica)
        val s = armazenamento(verificador)
        // manifesto adulterado depois de assinado: a assinatura gravada no disco não confere
        val adulterado = pacoteBaixado("x", "x", "2026-10-11T00:00:00Z")
        File(adulterado, "manifest.sig").writeText(fixture.assinatura)
        s.ativar(adulterado, "x")
        assertNull("assinatura não confere: ignora a atualização", s.ativo().dir)
        // arquivo truncado: tamanho diferente do manifesto
        val s2 = BundleStore(File(tmp.root, "bundles2"), DirBundleReader(fixture.dir), null)
        val truncado = pacoteBaixado("y", "y", "2026-10-11T00:00:00Z")
        File(truncado, "elementos.json").writeText("[]")
        s2.ativar(truncado, "y")
        assertNull(s2.ativo().dir)
    }

    @Test fun nomesDeVersaoPerigososSaoSanitizados() {
        val s = armazenamento()
        s.ativar(pacoteBaixado("z", "../../fora", "2026-10-11T00:00:00Z"), "../../fora")
        assertTrue(File(tmp.root, "bundles").listFiles()!!.all { it.canonicalPath.startsWith(File(tmp.root, "bundles").canonicalPath) })
    }
}
