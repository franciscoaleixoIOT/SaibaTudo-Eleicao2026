package net.saibatudo.eleicoes2026.domain.model

import java.util.Calendar
import java.util.TimeZone

/**
 * Fase do calendário eleitoral (determinada pelas datas oficiais de regras.json e pelo relógio, em Brasília).
 * Define o que o app destaca: pré-eleição (candidaturas), dia da votação, apuração e pós-eleição (resultados).
 */
enum class FaseEleitoral(val rotulo: String) {
    PRE_ELEICAO("Pré-eleição"),
    DIA_1T("Dia da votação (1º turno)"),
    ENTRE_TURNOS("Entre os turnos"),
    DIA_2T("Dia da votação (2º turno)"),
    POS_ELEICAO("Pós-eleição");

    /** Resultados oficiais passam a fazer sentido a partir do dia da votação. */
    val mostraResultados: Boolean get() = this != PRE_ELEICAO

    companion object {
        /** Datas no formato ISO (yyyy-MM-dd); a comparação lexicográfica equivale à cronológica. */
        fun de(hoje: String, turno1: String, turno2: String): FaseEleitoral = when {
            hoje < turno1 -> PRE_ELEICAO
            hoje == turno1 -> DIA_1T
            hoje < turno2 -> ENTRE_TURNOS
            hoje == turno2 -> DIA_2T
            else -> POS_ELEICAO
        }
    }
}

/** Utilidades de data sem java.time (minSdk 24). Todas em ISO yyyy-MM-dd. */
object Datas {
    private const val FUSO_BRASILIA = "America/Sao_Paulo"

    fun hojeBrasilia(agoraMillis: Long = System.currentTimeMillis()): String {
        val c = Calendar.getInstance(TimeZone.getTimeZone(FUSO_BRASILIA))
        c.timeInMillis = agoraMillis
        return "%04d-%02d-%02d".format(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
    }

    /** Dias desde 1970-01-01 (algoritmo de dias civis, proleptic gregoriano). */
    fun diaEpoca(iso: String): Long {
        val (y0, m, d) = iso.split('-').map { it.toInt() }
        val y = if (m <= 2) y0 - 1 else y0
        val era = (if (y >= 0) y else y - 399) / 400
        val yoe = y - era * 400
        val doy = (153 * (m + (if (m > 2) -3 else 9)) + 2) / 5 + d - 1
        val doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era * 146097L + doe - 719468L
    }

    fun diasEntre(deIso: String, ateIso: String): Long = diaEpoca(ateIso) - diaEpoca(deIso)

    /** "2026-10-04" -> "04/10/2026" */
    fun formatarBr(iso: String): String = iso.split('-').let { "${it[2]}/${it[1]}/${it[0]}" }
}
