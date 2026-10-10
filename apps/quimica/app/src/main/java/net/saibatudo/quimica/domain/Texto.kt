package net.saibatudo.quimica.domain

import java.text.Normalizer
import java.util.Locale

/** Utilitários de texto: normalização para busca/NLU, formatação pt-BR de números e fórmulas com sub/sobrescrito. */
object Texto {
    private val RX_COMBINANTES = Regex("\\p{Mn}+")
    private val RX_ESPACOS = Regex("\\s+")
    private val RX_NAO_ALNUM = Regex("[^a-z0-9+\\-()\\[\\]./,%°]+")

    /** Minúsculas, sem acentos, símbolos unicode de sub/sobrescrito convertidos, espaços colapsados. */
    fun normalizar(s: String?): String {
        if (s.isNullOrEmpty()) return ""
        val baixo = paraAscii(s).lowercase(Locale.ROOT)
        val semAcento = RX_COMBINANTES.replace(Normalizer.normalize(baixo, Normalizer.Form.NFD), "")
        return RX_ESPACOS.replace(semAcento, " ").trim()
    }

    /** Normaliza para comparação de nomes: só letras/dígitos e separadores simples; pontuação vira espaço. */
    fun chaveNome(s: String?): String {
        val n = normalizar(s)
        return RX_ESPACOS.replace(n.replace(Regex("[^a-z0-9]+"), " "), " ").trim()
    }

    /** Remove os acentos mantendo a caixa e o comprimento do texto (para casar com expressões escritas sem acento). */
    fun semAcentos(s: String): String = RX_COMBINANTES.replace(Normalizer.normalize(s, Normalizer.Form.NFD), "")

    private val RX_NAO_NLU = Regex("[^a-z0-9+\\-]+")
    private val RX_SINAL_SOLTO = Regex("(^|\\s)[+-]+(?=\\s|$)")

    /**
     * Normalização do NLU, idêntica à do site (web/src/quimica/js/texto.js): sem acentos, minúsculas, só [a-z0-9+-]
     * separados por um espaço; sinais soltos são descartados. "Ácido  Sulfúrico!" vira "acido sulfurico".
     */
    fun nlu(s: String?): String {
        val sem = RX_COMBINANTES.replace(Normalizer.normalize(s ?: "", Normalizer.Form.NFD), "").lowercase()
        return RX_ESPACOS.replace(RX_SINAL_SOLTO.replace(RX_NAO_NLU.replace(sem, " "), " "), " ").trim()
    }

    private val SUBSCRITOS = "₀₁₂₃₄₅₆₇₈₉"
    private val SOBRESCRITOS = mapOf('⁰' to '0', '¹' to '1', '²' to '2', '³' to '3', '⁴' to '4', '⁵' to '5', '⁶' to '6', '⁷' to '7', '⁸' to '8', '⁹' to '9', '⁺' to '+', '⁻' to '-')

    /** Converte ₂ → 2, ² → 2 (mantém o resto). Usado antes de interpretar fórmulas digitadas com Unicode. */
    fun paraAscii(s: String): String {
        val sb = StringBuilder(s.length)
        for (c in s) {
            val i = SUBSCRITOS.indexOf(c)
            when {
                i >= 0 -> sb.append(('0' + i))
                SOBRESCRITOS.containsKey(c) -> sb.append(SOBRESCRITOS[c])
                c == '−' || c == '–' -> sb.append('-')
                c == '·' || c == '•' || c == '∙' -> sb.append('·')
                else -> sb.append(c)
            }
        }
        return sb.toString()
    }

    // ---- números pt-BR ---------------------------------------------------------------------------------------------

    private val PT_BR: Locale = Locale.forLanguageTag("pt-BR")

    /** 1234.5 → "1.234,5" com [casas] casas decimais no máximo (zeros à direita removidos). */
    fun numero(v: Double, casas: Int = 3): String {
        if (v.isNaN() || v.isInfinite()) return "—"
        val fmt = java.text.NumberFormat.getNumberInstance(PT_BR).apply {
            maximumFractionDigits = casas
            minimumFractionDigits = 0
            isGroupingUsed = true
        }
        val s = fmt.format(v)
        return if (s == "-0") "0" else s
    }

    /** Casas decimais fixas: 18.0153 com 3 → "18,015". */
    fun fixo(v: Double, casas: Int): String {
        if (v.isNaN() || v.isInfinite()) return "—"
        val fmt = java.text.NumberFormat.getNumberInstance(PT_BR).apply {
            maximumFractionDigits = casas
            minimumFractionDigits = casas
            isGroupingUsed = true
        }
        return fmt.format(v)
    }

    /** [algarismos] algarismos significativos; usa notação científica "6,022 × 10²³" fora de 1e-3 ≤ |v| < 1e6. */
    fun significativos(v: Double, algarismos: Int = 4): String {
        if (v.isNaN() || v.isInfinite()) return "—"
        if (v == 0.0) return "0"
        val a = kotlin.math.abs(v)
        if (a >= 1e-3 && a < 1e6) {
            val ordem = kotlin.math.floor(kotlin.math.log10(a)).toInt()
            val casas = (algarismos - 1 - ordem).coerceIn(0, 10)
            val bd = java.math.BigDecimal(v).setScale(casas, java.math.RoundingMode.HALF_UP)
            return numero(bd.toDouble(), casas)
        }
        return cientifica(v, algarismos - 1)
    }

    /** "6,022 × 10²³" (mantissa com [casas] casas). */
    fun cientifica(v: Double, casas: Int = 3): String {
        if (v == 0.0) return "0"
        val exp = kotlin.math.floor(kotlin.math.log10(kotlin.math.abs(v))).toInt()
        var mant = v / Math.pow(10.0, exp.toDouble())
        var e = exp
        val arred = java.math.BigDecimal(mant).setScale(casas, java.math.RoundingMode.HALF_UP).toDouble()
        if (kotlin.math.abs(arred) >= 10.0) {
            mant = arred / 10.0
            e += 1
        } else {
            mant = arred
        }
        return fixo(mant, casas) + " × 10" + sobrescrito(e.toString())
    }

    /** Distância de Damerau-Levenshtein com corte: devolve max+1 se passar de [max]. */
    fun distancia(a: String, b: String, max: Int = 2): Int {
        if (a == b) return 0
        if (kotlin.math.abs(a.length - b.length) > max) return max + 1
        var p2: IntArray? = null
        var p1 = IntArray(b.length + 1) { it }
        for (i in 1..a.length) {
            val cur = IntArray(b.length + 1)
            cur[0] = i
            var minimo = i
            for (j in 1..b.length) {
                val custo = if (a[i - 1] == b[j - 1]) 0 else 1
                var v = minOf(p1[j] + 1, cur[j - 1] + 1, p1[j - 1] + custo)
                if (p2 != null && i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1]) v = minOf(v, p2[j - 2] + 1)
                cur[j] = v
                if (v < minimo) minimo = v
            }
            if (minimo > max) return max + 1
            p2 = p1
            p1 = cur
        }
        return p1[b.length]
    }

    fun sobrescrito(s: String): String = s.map { c ->
        when (c) {
            '0' -> '⁰'; '1' -> '¹'; '2' -> '²'; '3' -> '³'; '4' -> '⁴'; '5' -> '⁵'; '6' -> '⁶'; '7' -> '⁷'; '8' -> '⁸'; '9' -> '⁹'
            '-' -> '⁻'; '+' -> '⁺'; else -> c
        }
    }.joinToString("")

    fun subscrito(s: String): String = s.map { c -> if (c in '0'..'9') SUBSCRITOS[c - '0'] else c }.joinToString("")

    /** "H2O" → "H₂O"; "Ca(OH)2" → "Ca(OH)₂"; "Fe3+" → "Fe³⁺"; "SO4^2-" → "SO₄²⁻"; "CuSO4·5H2O" → "CuSO₄·5H₂O". */
    fun formulaUnicode(formula: String): String {
        val f = paraAscii(formula).trim()
        val sb = StringBuilder()
        fun fimDeToken(j: Int) = j >= f.length || f[j] == ' ' || f[j] == '·'
        var i = 0
        while (i < f.length) {
            val c = f[i]
            val prev = if (i > 0) f[i - 1] else ' '
            val apos = prev.isLetter() || prev == ')' || prev == ']'
            if (c == '^') {
                var j = i + 1
                while (j < f.length && (f[j].isDigit() || f[j] == '+' || f[j] == '-')) j++
                sb.append(sobrescrito(f.substring(i + 1, j)))
                i = j
            } else if (c.isDigit() && apos) {
                var j = i
                while (j < f.length && f[j].isDigit()) j++
                val numero = f.substring(i, j)
                if (j < f.length && (f[j] == '+' || f[j] == '-') && fimDeToken(j + 1)) {
                    sb.append(sobrescrito(numero + f[j]))
                    i = j + 1
                } else {
                    sb.append(subscrito(numero))
                    i = j
                }
            } else if ((c == '+' || c == '-') && apos && fimDeToken(i + 1)) {
                sb.append(sobrescrito(c.toString()))
                i++
            } else {
                sb.append(c)
                i++
            }
        }
        return sb.toString()
    }
}
