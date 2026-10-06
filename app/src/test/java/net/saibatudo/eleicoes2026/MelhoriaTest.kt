package net.saibatudo.eleicoes2026

import kotlinx.coroutines.test.runTest
import net.saibatudo.eleicoes2026.data.bundle.BundleManifest
import net.saibatudo.eleicoes2026.data.prefs.InMemoryPreferences
import net.saibatudo.eleicoes2026.data.prefs.UserPreferences
import net.saibatudo.eleicoes2026.data.remote.EnvioMelhoria
import net.saibatudo.eleicoes2026.data.remote.Melhoria
import net.saibatudo.eleicoes2026.data.remote.MelhoriaFila
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** "Ajudar a melhorar o app": captura opcional das perguntas não entendidas (paridade com web/test/melhoria.test.mjs). */
class MelhoriaTest {

    private class Cenario(noPacote: Boolean = true, melhoria: Boolean = true, var resposta: EnvioMelhoria = EnvioMelhoria.Aceito) {
        val prefs = InMemoryPreferences(UserPreferences(melhoria = melhoria, idInstalacao = "iid-teste"))
        val envios = mutableListOf<Pair<List<String>, String>>()
        var noPacote = noPacote
        val fila = MelhoriaFila(
            prefs = prefs,
            noPacote = { this.noPacote },
            enviarLote = { itens, iid -> envios += itens to iid; resposta }
        )
    }

    @Test
    fun pacoteSoLigaComEnabledTrue() {
        assertFalse(BundleManifest().melhoriaLigada)
        assertFalse(BundleManifest(cliente = BundleManifest.Cliente()).melhoriaLigada)
        assertFalse(BundleManifest(cliente = BundleManifest.Cliente(melhoria = BundleManifest.Cliente.Melhoria())).melhoriaLigada)
        assertFalse(BundleManifest(cliente = BundleManifest.Cliente(melhoria = BundleManifest.Cliente.Melhoria(false))).melhoriaLigada)
        assertTrue(BundleManifest(cliente = BundleManifest.Cliente(melhoria = BundleManifest.Cliente.Melhoria(true))).melhoriaLigada)
    }

    @Test
    fun preferenciaEOptInDesligadaPorPadrao() {
        assertFalse(UserPreferences().melhoria)
        assertTrue(UserPreferences().filaMelhoria.isEmpty())
    }

    @Test
    fun textoEnfileiravelRespeitaLimitesEDadosPessoais() {
        assertEquals("quando é a eleição", Melhoria.textoEnfileiravel("  quando   é a eleição "))
        assertNull(Melhoria.textoEnfileiravel("oi"))
        assertNull(Melhoria.textoEnfileiravel("x".repeat(301)))
        assertNull(Melhoria.textoEnfileiravel("meu cpf é 123.456.789-09"))
        assertNull(Melhoria.textoEnfileiravel("fale com joao@exemplo.com"))
        assertNull(Melhoria.textoEnfileiravel("me liga 11 98765-4321"))
        assertNull(Melhoria.textoEnfileiravel("título 123456789012"))
        assertEquals("candidato 2222", Melhoria.textoEnfileiravel("candidato 2222")) // número de urna é curto: permitido
    }

    @Test
    fun textoDeConsentimentoAvisaDeOpiniaoPolitica() {
        assertTrue(Melhoria.TEXTO_DESCRICAO.contains("Desligado por padrão"))
        assertTrue(Melhoria.TEXTO_DESCRICAO.contains("opinião política"))
        assertTrue(Melhoria.TEXTO_DESCRICAO.contains("e-mail, CPF ou telefone"))
        assertTrue(Melhoria.TEXTO_DESCRICAO.contains("apagado"))
    }

    @Test
    fun semOPacoteLigandoOuSemAPessoaLigarNadaEntraNemSai() = runTest {
        for ((noPacote, melhoria) in listOf(false to true, true to false, false to false)) {
            val c = Cenario(noPacote = noPacote, melhoria = melhoria)
            assertFalse(c.fila.enfileirar("quando é a eleição"))
            assertTrue(c.prefs.atual().filaMelhoria.isEmpty())
            assertNull(c.fila.enviarSePreciso(forcar = true))
            assertTrue(c.envios.isEmpty())
        }
    }

    @Test
    fun enfileiraSemRepetirEComLimite() = runTest {
        val c = Cenario()
        assertTrue(c.fila.enfileirar("Quando é a eleição"))
        assertFalse(c.fila.enfileirar("quando é a eleição"))
        repeat(Melhoria.LIMITE_FILA + 10) { c.fila.enfileirar("pergunta numero $it") }
        val fila = c.prefs.atual().filaMelhoria
        assertEquals(Melhoria.LIMITE_FILA, fila.size)
        assertEquals("pergunta numero ${Melhoria.LIMITE_FILA + 9}", fila.last())
    }

    @Test
    fun soEnviaComPerguntasSuficientesEmLotes() = runTest {
        val c = Cenario()
        c.fila.enfileirar("pergunta um"); c.fila.enfileirar("pergunta dois")
        assertNull(c.fila.enviarSePreciso())
        assertTrue(c.envios.isEmpty())
        c.fila.enfileirar("pergunta tres")
        assertEquals(EnvioMelhoria.Aceito, c.fila.enviarSePreciso())
        assertEquals(1, c.envios.size)
        assertTrue(c.prefs.atual().filaMelhoria.isEmpty())

        val g = Cenario()
        repeat(Melhoria.LOTE + 5) { g.fila.enfileirar("pergunta lote $it") }
        g.fila.enviarSePreciso()
        assertEquals(Melhoria.LOTE, g.envios[0].first.size)
        assertEquals(5, g.prefs.atual().filaMelhoria.size)
    }

    @Test
    fun envioLevaSoOTextoEOIdAleatorio() = runTest {
        val c = Cenario()
        listOf("que dia é o pleito", "onde fica a seção", "posso votar de bermuda").forEach { c.fila.enfileirar(it) }
        c.fila.enviarSePreciso()
        assertEquals(listOf("que dia é o pleito", "onde fica a seção", "posso votar de bermuda"), c.envios[0].first)
        assertEquals("iid-teste", c.envios[0].second)
    }

    @Test
    fun falhasMantemAFilaEApenasInvalidoDescartaOLote() = runTest {
        val c = Cenario(resposta = EnvioMelhoria.Falhou)
        listOf("um dois", "tres quatro", "cinco seis").forEach { c.fila.enfileirar(it) }
        assertEquals(EnvioMelhoria.Falhou, c.fila.enviarSePreciso())
        assertEquals(3, c.prefs.atual().filaMelhoria.size) // mantida para tentar depois

        c.resposta = EnvioMelhoria.Invalido
        assertEquals(EnvioMelhoria.Invalido, c.fila.enviarSePreciso())
        assertTrue(c.prefs.atual().filaMelhoria.isEmpty()) // lote que o servidor nunca aceitará não trava a fila
    }

    @Test
    fun excecaoNoEnvioViraFalhaESeguraAFila() = runTest {
        val prefs = InMemoryPreferences(UserPreferences(melhoria = true, idInstalacao = "i", filaMelhoria = listOf("um dois", "tres quatro", "cinco seis")))
        val fila = MelhoriaFila(prefs, { true }) { _, _ -> throw IllegalStateException("rede") }
        assertEquals(EnvioMelhoria.Falhou, fila.enviarSePreciso())
        assertEquals(3, prefs.atual().filaMelhoria.size)
    }

    @Test
    fun desligarAOpcaoApagaAFilaNaUi() = runTest {
        val c = Cenario()
        c.fila.enfileirar("pergunta um"); c.fila.enfileirar("pergunta dois")
        // a tela faz exatamente isto ao desligar:
        c.prefs.atualizar { it.copy(melhoria = false, filaMelhoria = emptyList()) }
        assertTrue(c.prefs.atual().filaMelhoria.isEmpty())
        assertFalse(c.fila.enfileirar("pergunta tres"))
    }
}
