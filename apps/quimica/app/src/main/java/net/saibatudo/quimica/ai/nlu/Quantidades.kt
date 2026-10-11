package net.saibatudo.quimica.ai.nlu

import net.saibatudo.quimica.domain.Texto
import net.saibatudo.quimica.domain.calc.Unidades

/** Quantidade "valor + unidade" lida de uma pergunta; [unidade] é nula quando o texto depois do número não é uma unidade. */
data class QuantidadeLida(val valor: Double, val unidade: String?, val texto: String, val faixa: IntRange)

/** Leitura de números em pt-BR e de quantidades com unidade (espelha lerNumero/lerQuantidades/lerUnidade do site). */
object Quantidades {

    private val UNIDADE_PALAVRAS: List<Pair<Regex, String>> = listOf(
        """^graus? (?:celsius|centigrados?)$|^celsius$""" to "°C", """^graus? fahrenheit$|^fahrenheit$""" to "°F", """^kelvins?$""" to "K",
        """^atmosferas?$""" to "atm", """^pascais$|^pascal$""" to "Pa", """^quilopascais$|^quilopascal$""" to "kPa", """^milimetros? de mercurio$""" to "mmHg",
        """^litros?$""" to "L", """^mililitros?$""" to "mL", """^microlitros?$""" to "µL", """^gramas?$""" to "g", """^miligramas?$""" to "mg", """^quilogramas?$|^quilos?$""" to "kg",
        """^toneladas?$""" to "t", """^mols?$""" to "mol", """^milimols?$""" to "mmol", """^kilomols?$|^quilomols?$""" to "kmol", """^joules?$""" to "J", """^calorias?$""" to "cal",
        """^quilocalorias?$""" to "kcal", """^quilojoules?$""" to "kJ", """^molar(?:es)?$""" to "mol/L", """^mol por litro$|^mols por litro$""" to "mol/L", """^gramas? por litro$""" to "g/L",
        """^(?:moleculas?|atomos?|particulas?|ions?|unidades|entidades)$""" to "particulas", """^metros?$""" to "m", """^centimetros?$""" to "cm", """^milimetros?$""" to "mm",
        """^nanometros?$""" to "nm", """^quilometros?$""" to "km", """^por ?cento$""" to "%", """^bars?$""" to "bar", """^torr$""" to "mmHg", """^horas?$""" to "h", """^minutos?$""" to "min", """^segundos?$""" to "s"
    ).map { (rx, s) -> Regex(rx) to s }

    private val RX_SO_SIMBOLO = Regex("""^[A-Za-zµμ°º/³²⁻¹·.-]+$""")

    /** Interpreta uma unidade escrita (símbolo ou nome em português): devolve o símbolo ou null. */
    fun lerUnidade(texto: String?, un: Unidades?): String? {
        val bruto = (texto ?: "").trim().trimEnd('.', ',', ';', ':', '!', '?')
        if (bruto.isEmpty()) return null
        if (bruto == "%") return "%"
        val n = Texto.nlu(bruto)
        for ((rx, sim) in UNIDADE_PALAVRAS) if (rx.containsMatchIn(n)) return sim
        if (RX_SO_SIMBOLO.matches(bruto) && un != null) {
            val limpo = bruto.replace('·', '/').replace(Regex("/+"), "/")
            un.buscar(limpo)?.let { return it.simbolo }
        }
        return null
    }

    /** Número em pt-BR ("1.234,5", "0,01", "6,02 x 10^23", "1,8e-5"); null se não for número. */
    fun lerNumero(entrada: String?): Double? {
        var s = (entrada ?: "").trim().replace(Regex("""\s+"""), " ").replace('−', '-')
        if (s.isEmpty()) return null
        s = Regex("""\s*[x×*·]\s*10\s*\^?\s*\{?(-?\d+)\}?""", RegexOption.IGNORE_CASE).replace(s) { "e" + it.groupValues[1] }
        s = Regex("""^10\s*\^\s*\{?(-?\d+)\}?$""").replace(s) { "1e" + it.groupValues[1] }
        s = s.replace(Regex("""\s"""), "")
        s = when {
            Regex("""^[+-]?\d{1,3}(\.\d{3})+(,\d+)?(e[+-]?\d+)?$""", RegexOption.IGNORE_CASE).matches(s) -> s.replace(".", "").replace(',', '.')
            Regex("""^[+-]?\d+(,\d+)?(e[+-]?\d+)?$""", RegexOption.IGNORE_CASE).matches(s) -> s.replace(',', '.')
            Regex("""^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$""", RegexOption.IGNORE_CASE).matches(s) -> s
            else -> return null
        }
        return s.toDoubleOrNull()?.takeIf { it.isFinite() }
    }

    private const val NUM = """(\d+(?:[.,]\d+)?(?:\s*(?:[x×*]\s*10\s*\^?\s*\{?-?\d+\}?|e[+-]?\d+))?)"""
    private val RX_QUANT = Regex(
        """(?<![A-Za-z(\[)\]^_\-.,\d])$NUM\s*(°\s*[CF]|º\s*[CF]|%|[A-Za-zµμ°º][A-Za-zµμ°º/³²⁻¹·.-]*(?:\s+(?:de|por)\s+[A-Za-zçãéêíóú]+)?(?:\s+[A-Za-zçãéêíóú]+)?)?"""
    )

    /** Quantidades com unidade encontradas no texto, na ordem; [unidade] nula quando não reconhecida. */
    fun ler(texto: String, un: Unidades?): List<QuantidadeLida> {
        val out = mutableListOf<QuantidadeLida>()
        for (m in RX_QUANT.findAll(texto)) {
            val valor = lerNumero(m.groupValues[1]) ?: continue
            var unidade: String? = null
            var usado = ""
            var fim = m.groups[1]!!.range.last + 1
            val g2 = m.groups[2]
            if (g2 != null && g2.value.isNotBlank()) {
                val tokens = Regex("""\S+""").findAll(g2.value).toList()
                var k = minOf(tokens.size, 3)
                while (k >= 1 && unidade == null) {
                    val frase = tokens.take(k).joinToString(" ") { it.value }
                    unidade = lerUnidade(frase.replace(Regex("""^°\s*"""), "°"), un)
                    if (unidade != null) {
                        usado = frase
                        fim = g2.range.first + tokens[k - 1].range.last + 1
                    }
                    k--
                }
            }
            out += QuantidadeLida(valor, unidade, ("${m.groupValues[1]}${if (usado.isNotEmpty()) " $usado" else ""}").trim(), m.range.first until maxOf(fim, m.range.first + 1))
        }
        return out
    }

    private val RX_CONSTANTE = Regex(
        """\b(pka|pkb|ka|kb)\s*(?:=|:|de|igual a|vale)?\s*([0-9][0-9.,]*(?:\s*(?:[x×*]\s*10\s*\^?\s*\{?-?\d+\}?|e-?\d+))?)""",
        RegexOption.IGNORE_CASE
    )

    /** Constantes de equilíbrio citadas ("Ka 1,8e-5", "pKa = 4,76"). */
    fun lerConstantes(original: String): Map<String, Double> {
        val out = LinkedHashMap<String, Double>()
        for (m in RX_CONSTANTE.findAll(original)) {
            val v = lerNumero(m.groupValues[2]) ?: continue
            val nome = when (m.groupValues[1].lowercase()) { "pka" -> "pKa"; "pkb" -> "pKb"; "ka" -> "Ka"; else -> "Kb" }
            out[nome] = v
        }
        return out
    }
}
