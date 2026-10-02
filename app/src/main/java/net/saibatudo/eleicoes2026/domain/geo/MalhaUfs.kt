package net.saibatudo.eleicoes2026.domain.geo

import com.google.gson.JsonParser
import kotlin.math.cos
import kotlin.math.hypot

/**
 * Contorno simplificado das 27 UFs (malha oficial do IBGE, `data/geo/ufs.json`) para SUGERIR o estado a partir de uma
 * coordenada. Tudo é calculado no aparelho: a coordenada nunca sai dele nem é guardada.
 *
 * Regra (a mesma do site; casos de referência em contracts/geo_cases.json): a UF cujo polígono contém o ponto (anel
 * externo, fora dos buracos); se nenhum contém (litoral/ilhas na malha simplificada), a UF de contorno mais próximo,
 * desde que a até [LIMITE_KM]; senão, nenhuma (fora do Brasil).
 */
class MalhaUfs private constructor(private val ufs: Map<String, List<Poligono>>) {

    /** Anel = coordenadas intercaladas [lon0, lat0, lon1, lat1, ...]. */
    private class Poligono(val aneis: List<DoubleArray>) {
        val minLon = aneis[0].filterIndexed { i, _ -> i % 2 == 0 }.min()
        val maxLon = aneis[0].filterIndexed { i, _ -> i % 2 == 0 }.max()
        val minLat = aneis[0].filterIndexed { i, _ -> i % 2 == 1 }.min()
        val maxLat = aneis[0].filterIndexed { i, _ -> i % 2 == 1 }.max()
    }

    fun ufDe(lat: Double, lon: Double, limiteKm: Double = LIMITE_KM): String? {
        if (lat.isNaN() || lon.isNaN()) return null
        for ((uf, poligonos) in ufs) {
            if (poligonos.any { contem(it, lon, lat) }) return uf
        }
        var melhor: String? = null
        var menor = Double.MAX_VALUE
        for ((uf, poligonos) in ufs) {
            val d = poligonos.minOf { p -> p.aneis.minOf { distanciaKm(it, lat, lon) } }
            if (d < menor) { menor = d; melhor = uf }
        }
        return melhor.takeIf { menor <= limiteKm }
    }

    private fun contem(p: Poligono, lon: Double, lat: Double): Boolean {
        if (lon < p.minLon || lon > p.maxLon || lat < p.minLat || lat > p.maxLat) return false
        return dentro(p.aneis[0], lon, lat) && p.aneis.drop(1).none { dentro(it, lon, lat) }
    }

    /** Ray casting. */
    private fun dentro(anel: DoubleArray, lon: Double, lat: Double): Boolean {
        var d = false
        val n = anel.size / 2
        var j = n - 1
        for (i in 0 until n) {
            val xi = anel[2 * i]; val yi = anel[2 * i + 1]
            val xj = anel[2 * j]; val yj = anel[2 * j + 1]
            if ((yi > lat) != (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) d = !d
            j = i
        }
        return d
    }

    /** Distância ponto-contorno em km (projeção equiretangular local; precisão de sobra para 30 km). */
    private fun distanciaKm(anel: DoubleArray, lat: Double, lon: Double): Double {
        val kx = 111.32 * cos(Math.toRadians(lat))
        val ky = 110.57
        var melhor = Double.MAX_VALUE
        val n = anel.size / 2
        for (i in 0 until n - 1) {
            val ax = (anel[2 * i] - lon) * kx; val ay = (anel[2 * i + 1] - lat) * ky
            val bx = (anel[2 * i + 2] - lon) * kx; val by = (anel[2 * i + 3] - lat) * ky
            val dx = bx - ax; val dy = by - ay
            val l2 = dx * dx + dy * dy
            val t = if (l2 == 0.0) 0.0 else (-(ax * dx + ay * dy) / l2).coerceIn(0.0, 1.0)
            melhor = minOf(melhor, hypot(ax + t * dx, ay + t * dy))
        }
        return melhor
    }

    companion object {
        const val LIMITE_KM = 30.0

        /** Lê o formato de `data/geo/ufs.json`: ufs[SIGLA] = [poligono], poligono = [anel...], anel = [[lon, lat]...]. */
        fun parse(json: String): MalhaUfs {
            val ufs = JsonParser.parseString(json).asJsonObject.getAsJsonObject("ufs")
            val mapa = LinkedHashMap<String, List<Poligono>>()
            for ((sigla, poligonos) in ufs.entrySet()) {
                mapa[sigla] = poligonos.asJsonArray.map { pol ->
                    Poligono(pol.asJsonArray.map { anel ->
                        val pts = anel.asJsonArray
                        DoubleArray(pts.size() * 2) { k -> pts[k / 2].asJsonArray[k % 2].asDouble }
                    })
                }
            }
            require(mapa.size == 27) { "malha de UFs incompleta: ${mapa.size}" }
            return MalhaUfs(mapa)
        }
    }
}
