package net.saibatudo.eleicoes2026

import com.google.gson.JsonParser
import net.saibatudo.eleicoes2026.domain.geo.MalhaUfs
import net.saibatudo.eleicoes2026.domain.model.Ufs
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** Sugestão de UF pela localização: casos de referência compartilhados com o site (contracts/geo_cases.json). */
class SugestaoUfTest {

    private val malha = MalhaUfs.parse(File("../data/geo/ufs.json").readText())

    @Test
    fun casosDeReferencia() {
        val casos = JsonParser.parseString(File("../contracts/geo_cases.json").readText()).asJsonObject.getAsJsonArray("cases")
        assertTrue(casos.size() >= 30)
        val falhas = casos.mapNotNull { el ->
            val c = el.asJsonObject
            val esperado = c.get("uf").takeIf { !it.isJsonNull }?.asString
            val obtido = malha.ufDe(c.get("lat").asDouble, c.get("lon").asDouble)
            if (obtido != esperado) "${c.get("nome").asString}: esperado $esperado, obtido $obtido" else null
        }
        assertTrue("Falhas:\n" + falhas.joinToString("\n"), falhas.isEmpty())
    }

    @Test
    fun todasAsUfsTemContornoEEntradaInvalidaNaoQuebra() {
        // cada capital acerta a própria UF (cobertura das 27 UFs no arquivo de casos)
        val ufsNosCasos = JsonParser.parseString(File("../contracts/geo_cases.json").readText()).asJsonObject
            .getAsJsonArray("cases").mapNotNull { it.asJsonObject.get("uf").takeIf { u -> !u.isJsonNull }?.asString }.toSet()
        assertEquals(Ufs.SIGLAS, ufsNosCasos)
        assertNull(malha.ufDe(Double.NaN, Double.NaN))
        assertNull(malha.ufDe(90.0, 0.0))
    }
}
