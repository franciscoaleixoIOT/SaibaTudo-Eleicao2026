package net.saibatudo.eleicoes2026

import net.saibatudo.eleicoes2026.data.bundle.ManifestVerifier
import net.saibatudo.eleicoes2026.domain.model.Elegibilidade
import net.saibatudo.eleicoes2026.domain.model.Ufs
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** Valida o snapshot oficial empacotado no app: estrutura, checksums, assinatura e coerência dos registros. */
class DataBundleIntegrityTest {

    @Test
    fun manifestoAssinadoComChavePublicaDoApp() {
        val v = ManifestVerifier(TestData.chavePublica)
        assertTrue("assinatura do snapshot deve ser válida", v.verify(TestData.manifestBytes, TestData.assinatura))
    }

    @Test
    fun assinaturaAdulteradaOuSemChaveERejeitada() {
        val v = ManifestVerifier(TestData.chavePublica)
        val adulterado = TestData.manifestBytes.copyOf().also { it[10] = (it[10] + 1).toByte() }
        assertFalse(v.verify(adulterado, TestData.assinatura))
        assertFalse(ManifestVerifier("").verify(TestData.manifestBytes, TestData.assinatura))
        assertFalse(v.verify(TestData.manifestBytes, "AAAA"))
    }

    @Test
    fun checksumsEPresencaDeTodosOsArquivosDoManifesto() {
        for (a in TestData.manifest.arquivos.orEmpty()) {
            val f = File(TestData.dir, a.path!!)
            assertTrue("arquivo ausente: ${a.path}", f.isFile)
            assertEquals("tamanho: ${a.path}", a.bytes, f.length())
            assertEquals("sha256: ${a.path}", a.sha256, ManifestVerifier.sha256Hex(f.readBytes()))
        }
    }

    @Test
    fun candidaturasCoerentesComOManifesto() {
        val d = TestData.dados
        assertEquals(TestData.manifest.contagens!!["candidaturas"], d.candidatos.size)
        assertTrue("esperado > 15.000 candidaturas", d.candidatos.size > 15_000)
        assertEquals("ids únicos", d.candidatos.size, d.candidatos.map { it.id }.toSet().size)
        assertEquals(TestData.manifest.contagens!!["naUrna"], d.candidatos.count { it.naUrna })
        // 27 UFs + "BR"
        val ufs = d.candidatos.map { it.estadoUf }.toSet()
        assertTrue(ufs.containsAll(Ufs.SIGLAS))
        assertTrue("BR" in ufs)
        d.candidatos.forEach { c ->
            assertTrue("número vazio em ${c.id}", c.numero.isNotBlank())
            assertTrue("nome vazio em ${c.id}", c.nomeUrna.isNotBlank())
            assertTrue("partido vazio em ${c.id}", c.partido.isNotBlank())
            assertTrue("dígitos coerentes em ${c.id}", c.numero.length == c.digitosUrna || c.digitosUrna == 0 || c.cargoCodigo.startsWith("SUPLENTE") || c.cargoCodigo.startsWith("VICE"))
        }
    }

    @Test
    fun situacaoOficialNuncaEInferidaComoFichaLimpa() {
        val d = TestData.dados.candidatos
        // renunciados/falecidos NÃO podem aparecer como "com inelegibilidade": mantêm a situação oficial
        assertTrue(d.filter { it.elegibilidade == Elegibilidade.RENUNCIA }.all { it.elegibilidade.apta == false })
        assertTrue(d.count { it.elegibilidade == Elegibilidade.DEFERIDA } > 15_000)
        // quase nenhuma situação deve ficar desconhecida
        assertTrue(d.count { it.elegibilidade == Elegibilidade.DESCONHECIDA } < 50)
    }

    @Test
    fun presidenciaveisOficiaisEstaoNoPacote() {
        val pres = TestData.dados.candidatos.filter { it.cargoCodigo == "PRESIDENTE" }
        assertTrue(pres.size >= 13)
        assertNotNull(pres.firstOrNull { it.nomeUrna == "LULA" && it.partido == "PT" && it.numero == "13" })
        // candidato com registro indeferido não pode constar como "na urna"
        val indeferidos = pres.filter { it.elegibilidade == Elegibilidade.INDEFERIDA }
        assertTrue(indeferidos.none { it.naUrna })
    }

    @Test
    fun fotosEmpacotadasExistemEPertencemAMajoritarios() {
        TestData.dados.candidatos.filter { it.foto != null }.forEach { c ->
            assertTrue("majoritário esperado: ${c.cargoCodigo}", c.ehMajoritario)
            assertTrue("foto ausente: ${c.foto}", File(TestData.dir, c.foto!!).isFile)
        }
    }

    @Test
    fun regrasEFontesCarregam() {
        val r = TestData.dados.regras
        assertEquals("2026-10-04", r.turno1)
        assertEquals("2026-10-25", r.turno2)
        assertEquals(6, r.ordemVotacaoUrna.size)
        assertNotNull(TestData.dados.fontes)
        assertEquals(27, TestData.dados.fontes!!.tres.size)
        assertNotNull(TestData.dados.resultadosTse)
        assertTrue(TestData.dados.pesquisas.size > 3000)
    }
}
