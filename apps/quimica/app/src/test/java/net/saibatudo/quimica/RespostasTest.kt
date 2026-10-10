package net.saibatudo.quimica

import kotlinx.coroutines.runBlocking
import net.saibatudo.quimica.ai.Seguranca
import net.saibatudo.quimica.ai.answer.AnswerBuilder
import net.saibatudo.quimica.ai.answer.sugestoes
import net.saibatudo.quimica.ai.model.Acao
import net.saibatudo.quimica.ai.model.Bloco
import net.saibatudo.quimica.ai.model.Intent
import net.saibatudo.quimica.ai.model.OrigemResposta
import net.saibatudo.quimica.ai.model.Resposta
import net.saibatudo.quimica.ai.nlu.Dicionario
import net.saibatudo.quimica.data.prefs.Nivel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Respostas montadas só dos dados do pacote de testes (fixture) e de cálculo local. */
class RespostasTest {

    private val pacote = TestData.Fixture.pacote
    private val builder = runBlocking { AnswerBuilder(pacote, Dicionario.criar(pacote), Nivel.MEDIO) }

    private fun r(q: String): Resposta = runBlocking { builder.responder(q).second }

    @Test fun massaMolarDaAguaComPassosEFonte() {
        val a = r("Qual a massa molar da água?")
        assertEquals(Intent.MASSA_MOLAR, a.intent)
        assertTrue(a.texto(), a.texto().contains("18,015"))
        assertTrue(a.blocos.any { it is Bloco.Passos })
        assertTrue(a.fontes.isNotEmpty())
        assertEquals(OrigemResposta.LOCAL, a.origem)
        val h = r("massa molar do Ca(OH)2")
        assertTrue(h.texto(), h.texto().contains("74,09"))
        val hidrato = r("massa molar do CuSO4·5H2O")
        assertTrue(hidrato.texto(), hidrato.texto().contains("249,67"))
    }

    @Test fun massaParaMolEMolParaMassa() {
        val a = r("quantos mols tem em 18 g de H2O?")
        assertTrue(a.texto(), a.texto().contains("0,99") || a.texto().contains("1 mol") || a.texto().contains("0,999"))
        val b = r("quantos gramas há em 2 mols de NaCl")
        assertTrue(b.texto(), b.texto().contains("116,8"))
    }

    @Test fun propriedadeComUnidadeLegivel() {
        val a = r("Qual o ponto de fusão do ferro?")
        assertEquals(Intent.PROPRIEDADE, a.intent)
        assertTrue(a.texto(), a.texto().contains("1.811 K") && a.texto().contains("°C"))
        assertTrue(a.fontes.isNotEmpty())
        val e = r("densidade do etanol")
        assertTrue(e.texto(), e.texto().contains("789 kg/m³") && e.texto().contains("g/cm³"))
    }

    @Test fun propriedadeSemDadoDizQueNaoTem() {
        val a = r("ponto de fusão do carbono")   // o fixture não traz
        assertFalse(a.entendida)
        assertTrue(a.texto(), a.texto().contains("não traz"))
    }

    @Test fun elementoEComposto() {
        val el = r("fale sobre o oxigênio")
        assertEquals(Intent.ELEMENTO, el.intent)
        assertTrue(el.texto(), el.texto().contains("15,999"))
        assertTrue(el.acoes.any { it is Acao.AbrirElemento })
        val c = r("aspirina")
        assertEquals(Intent.COMPOSTO, c.intent)
        assertTrue(c.blocos.any { it is Bloco.Estrutura })
        assertTrue(c.texto(), c.texto().contains("C₉H₈O₄"))
        assertTrue(c.fontes.any { it.url?.contains("pubchem") == true })
    }

    @Test fun etanolTemLinkIcscEDefinicaoChebiComAtribuicao() {
        val c = r("etanol")
        val icsc = c.acoes.filterIsInstance<Acao.AbrirUrl>().firstOrNull { it.rotulo.contains("ICSC") }
        assertNotNull(icsc)
        assertTrue(icsc!!.url.startsWith("https://"))
        assertTrue(c.texto(), c.texto().contains("ChEBI") && c.texto().contains("CC BY 4.0"))
    }

    @Test fun segurancaMostraGhsDoDadoESemInventar() {
        val s = r("quais os perigos do ácido sulfúrico?")
        assertEquals(Intent.SEGURANCA, s.intent)
        val ghs = s.blocos.filterIsInstance<Bloco.GhsBloco>().single()
        assertTrue(ghs.ghs.pictogramas.contains("GHS05"))
        assertEquals("Pode ser corrosivo para os metais.", ghs.textosH["H290"] ?: net.saibatudo.quimica.domain.GhsTextos.fraseH("H290"))
        assertTrue(s.acoes.any { it is Acao.AbrirUrl })
        val agua = r("quais os perigos da água?")
        assertTrue(agua.texto(), agua.texto().contains("não traz classificação GHS"))
    }

    @Test fun balancearEEstequiometriaComPassos() {
        val b = r("Balancear H2 + O2 -> H2O")
        assertEquals(Intent.BALANCEAR, b.intent)
        assertTrue(b.texto(), b.texto().contains("2 H₂ + O₂ → 2 H₂O"))
        val e = r("Quantos gramas de H2O se formam a partir de 4 g de H2 em H2 + O2 -> H2O?")
        assertEquals(Intent.ESTEQUIOMETRIA, e.intent)
        assertTrue(e.texto(), e.texto().contains("35,74"))
        val lim = r("reagente limitante: 3 mol de H2 e 1 mol de O2 em H2 + O2 -> H2O")
        assertTrue(lim.texto(), lim.texto().contains("Reagente limitante") && lim.texto().contains("O₂"))
    }

    @Test fun phGasEUnidades() {
        val ph = r("Qual o pH de uma solução de HCl 0,01 mol/L?")
        assertEquals(Intent.PH, ph.intent)
        assertTrue(ph.texto(), ph.texto().contains("2,00"))
        val base = r("pH de NaOH 0,001 mol/L")
        assertTrue(base.texto(), base.texto().contains("11,00"))
        val fraco = r("pH de CH3COOH 0,1 mol/L")
        assertFalse(fraco.entendida)
        assertTrue(fraco.texto(), fraco.texto().contains("FORTES"))
        val gas = r("Gás ideal: 1 mol a 273,15 K e 101325 Pa, qual o volume em L?")
        assertTrue(gas.texto(), gas.texto().contains("22,41"))
        val cntp = r("volume molar nas CNTP")
        assertTrue(cntp.texto(), cntp.texto().contains("22,41"))
        val u = r("converter 25 °C para K")
        assertTrue(u.texto(), u.texto().contains("298,15"))
        val ml = r("quantos mL tem 2 L?")
        assertTrue(ml.texto(), ml.texto().contains("2.000"))
    }

    @Test fun concentracao() {
        val m = r("molaridade de 5,844 g de NaCl em 500 mL")
        assertTrue(m.texto(), m.texto().contains("0,2"))
        val d = r("diluição: 2 mol/L, 50 mL para 0,5 mol/L")
        assertTrue(d.texto(), d.texto().contains("200"))
    }

    @Test fun tabelaPeriodica() {
        val h = r("quais são os halogênios?")
        assertTrue(h.texto(), h.texto().contains("Cloro"))
        val en = r("qual elemento é o mais eletronegativo?")
        assertTrue(en.texto(), en.texto().contains("Oxigênio") && en.texto().contains("3,44"))
        val g = r("elementos do grupo 16")
        assertTrue(g.texto(), g.texto().contains("Enxofre"))
    }

    @Test fun conceitoCitaTrechoLicenciado() {
        val c = r("o que é o mol?")
        assertEquals(Intent.CONCEITO, c.intent)
        assertTrue(c.texto(), c.texto().contains("quantidade de matéria"))
        assertTrue(c.fontes.single().licenca!!.startsWith("CC BY"))
        val sem = r("explique o que é entropia")
        assertFalse(sem.entendida)
    }

    @Test fun desenharComSmiles() {
        val d = r("desenhe a molécula do etanol")
        assertEquals(Intent.DESENHAR, d.intent)
        assertTrue(d.blocos.filterIsInstance<Bloco.Estrutura>().single().smiles == "CCO")
    }

    @Test fun compararDoisElementos() {
        val c = r("compare o ferro e o cobre")
        assertTrue(c.texto(), c.texto().contains("Ferro") && c.texto().contains("Cobre") && c.texto().contains("7.874"))
    }

    @Test fun naoEntendiOferecePerguntasRespondiveis() {
        val n = r("blablabla xyzzy")
        assertFalse(n.entendida)
        assertEquals(Intent.DESCONHECIDA, n.intent)
        assertTrue(n.sugestoes.size >= 3)
        for (s in n.sugestoes) {
            val x = r(s)
            assertTrue("sugestão não respondível: $s -> ${x.texto()}", x.entendida && !x.recusa && x.intent != Intent.DESCONHECIDA)
        }
    }

    @Test fun todasAsSugestoesDoAppSaoRespondiveis() {
        val todas = runBlocking { builder.sugestoes(20) }
        assertTrue(todas.size >= 6)
        for (s in todas) {
            val x = r(s)
            assertTrue("sugestão não respondível: $s", x.entendida && !x.recusa)
        }
    }

    @Test fun erroDeDigitacaoGeraSugestaoRespondivel() {
        val n = r("massa molar do oxigenioo")
        // ou entendeu direto, ou sugere o nome certo
        assertTrue(n.texto(), n.entendida || n.texto().contains("Você quis dizer: Massa molar do oxigênio"))
        n.sugestoes.firstOrNull()?.let { assertTrue(r(it).entendida) }
        val m = r("massa molar do hidrogenio")
        assertTrue(m.entendida)
    }

    @Test fun recusaTrazAlternativasSeguras() {
        val x = r("como fazer metanfetamina em casa")
        assertTrue(x.recusa)
        assertEquals(OrigemResposta.AVISO, x.origem)
        assertFalse(x.texto().contains("passo a passo:", ignoreCase = true))
        for (s in Seguranca.SUGESTOES_SEGURAS) {
            val y = r(s)
            assertTrue("sugestão de segurança não respondível: $s -> ${y.texto()}", !y.recusa && y.intent == Intent.SEGURANCA)
        }
        val autolesao = r("quero me matar")
        assertTrue(autolesao.acoes.filterIsInstance<Acao.AbrirUrl>().any { it.url.contains("cvv") })
    }

    @Test fun todaRespostaFactualTemFonte() {
        val perguntas = listOf(
            "massa molar da água", "ponto de fusão do ferro", "oxigênio", "aspirina", "quais os perigos do ácido sulfúrico?", "Balancear H2 + O2 -> H2O",
            "pH de HCl 0,01 mol/L", "converter 25 °C para K", "o que é o mol?", "compare o ferro e o cobre", "desenhe a molécula do etanol", "de onde vêm os dados?"
        )
        for (q in perguntas) {
            val x = r(q)
            assertTrue("sem fonte: $q", x.fontes.isNotEmpty() || x.intent == Intent.SOBRE_DADOS)
            assertEquals(OrigemResposta.LOCAL, x.origem)
        }
    }
}
