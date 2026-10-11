package net.saibatudo.quimica.domain.calc

import net.saibatudo.quimica.data.model.PrefixoSi
import net.saibatudo.quimica.data.model.Regras
import net.saibatudo.quimica.data.model.UnidadeDef
import net.saibatudo.quimica.domain.Texto

/** Valor com unidade (usado pelas calculadoras). */
data class Qtd(val valor: Double, val unidade: UnidadeDef)

/** Campo opcional de uma calculadora: [valor] nulo = é a incógnita. */
data class CampoQtd(val valor: Double?, val unidade: UnidadeDef)

/**
 * Conversão de unidades: base = valor × fator + offset (unidade-base da grandeza). As unidades e os prefixos vêm de
 * `regras.json` do pacote; o que o pacote não trouxer é completado com [PADRAO] e [PREFIXOS_PADRAO]: definições exatas do
 * SI e unidades legais/convencionais (atm, caloria termoquímica, mmHg convencional), isto é, convenções, não medições.
 */
class Unidades(lista: List<UnidadeDef>, val prefixos: List<PrefixoSi> = PREFIXOS_PADRAO) {
    val todas: List<UnidadeDef> = lista

    fun grandezas(): List<String> = todas.map { it.grandeza }.distinct()
    fun daGrandeza(grandeza: String): List<UnidadeDef> = todas.filter { it.grandeza == grandeza }
    fun porSimbolo(simbolo: String, grandeza: String? = null): UnidadeDef? =
        todas.firstOrNull { it.simbolo == simbolo && (grandeza == null || it.grandeza == grandeza) }

    /**
     * Procura por símbolo exato, apelido exato, depois símbolo/nome/apelido sem acento nem caixa e, por fim, símbolo com
     * prefixo SI ("nm", "µL", "kPa") sobre unidades prefixáveis.
     */
    fun buscar(texto: String, grandeza: String? = null): UnidadeDef? {
        val t = texto.trim().replace('μ', 'µ')
        if (t.isEmpty()) return null
        val pool = if (grandeza == null) todas else daGrandeza(grandeza)
        pool.firstOrNull { it.simbolo == t }?.let { return it }
        pool.firstOrNull { u -> u.apelidos.any { it == t } }?.let { return it }
        val n = Texto.normalizar(t)
        pool.firstOrNull { Texto.normalizar(it.simbolo) == n }?.let { return it }
        pool.firstOrNull { Texto.normalizar(it.nome) == n }?.let { return it }
        pool.firstOrNull { u -> u.apelidos.any { Texto.normalizar(it) == n } }?.let { return it }
        for (p in prefixos.sortedByDescending { it.simbolo.length }) {
            val prefixo = if (t.startsWith(p.simbolo)) p.simbolo else if (p.simbolo == "µ" && t.startsWith("u")) "u" else continue
            val resto = t.substring(prefixo.length)
            if (resto.isEmpty()) continue
            val base = pool.firstOrNull { it.prefixavel && it.offset == 0.0 && (it.simbolo == resto || it.apelidos.contains(resto)) } ?: continue
            return UnidadeDef(base.grandeza, t, "${p.nome}${base.nome ?: base.simbolo}", base.fator * p.fator, 0.0, emptyList(), prefixavel = false)
        }
        return null
    }

    fun paraBase(valor: Double, u: UnidadeDef): Double = valor * u.fator + u.offset
    fun deBase(base: Double, u: UnidadeDef): Double = (base - u.offset) / u.fator

    fun converter(valor: Double, de: UnidadeDef, para: UnidadeDef): Double {
        if (de.grandeza != para.grandeza) throw CalculoInvalido("Não é possível converter ${de.simbolo} (${de.grandeza}) em ${para.simbolo} (${para.grandeza}).")
        return deBase(paraBase(valor, de), para)
    }

    /** Valor convertido de [de] para [para], com o passo explicado em texto. */
    fun converterComPasso(valor: Double, de: UnidadeDef, para: UnidadeDef): Pair<Double, String> {
        val r = converter(valor, de, para)
        val passo = if (de.simbolo == para.simbolo) "${Texto.significativos(valor, 6)} ${de.simbolo}"
        else "${Texto.significativos(valor, 6)} ${de.simbolo} = ${Texto.significativos(r, 6)} ${para.simbolo}"
        return r to passo
    }

    /** Unidade-base (fator 1 e offset 0) da grandeza, se houver. */
    fun base(grandeza: String): UnidadeDef? = daGrandeza(grandeza).firstOrNull { it.fator == 1.0 && it.offset == 0.0 }

    companion object {
        fun de(regras: Regras): Unidades {
            val conhecidas = regras.unidades.map { it.simbolo to it.grandeza }.toSet()
            val prefixos = regras.prefixos.ifEmpty { PREFIXOS_PADRAO }
            return Unidades(regras.unidades + PADRAO.filter { (it.simbolo to it.grandeza) !in conhecidas }, prefixos)
        }

        private fun u(g: String, s: String, n: String, f: Double, o: Double = 0.0, pref: Boolean = false, vararg ap: String) =
            UnidadeDef(g, s, n, f, o, ap.toList(), pref)

        /** Prefixos SI (BIPM). */
        val PREFIXOS_PADRAO: List<PrefixoSi> = listOf(
            "G" to ("giga" to 1e9), "M" to ("mega" to 1e6), "k" to ("quilo" to 1e3), "h" to ("hecto" to 1e2), "da" to ("deca" to 1e1),
            "d" to ("deci" to 1e-1), "c" to ("centi" to 1e-2), "m" to ("mili" to 1e-3), "µ" to ("micro" to 1e-6), "n" to ("nano" to 1e-9),
            "p" to ("pico" to 1e-12), "f" to ("femto" to 1e-15)
        ).map { (s, nf) -> PrefixoSi(s, nf.first, nf.second) }

        /** Definições exatas/convencionais (nenhum valor medido). */
        val PADRAO: List<UnidadeDef> = listOf(
            u("temperatura", "K", "kelvin", 1.0, 0.0, false, "k"),
            u("temperatura", "°C", "grau Celsius", 1.0, 273.15, false, "c", "ºc", "graus celsius", "celsius", "°c", "ºC", "oC"),
            u("temperatura", "°F", "grau Fahrenheit", 5.0 / 9.0, 459.67 * 5.0 / 9.0, false, "f", "ºf", "fahrenheit", "°f", "ºF", "oF"),
            u("pressao", "Pa", "pascal", 1.0, 0.0, true, "pa"),
            u("pressao", "kPa", "quilopascal", 1000.0, 0.0, false, "kpa"),
            u("pressao", "bar", "bar", 100000.0, 0.0, true),
            u("pressao", "atm", "atmosfera padrão", 101325.0, 0.0, false, "atmosfera", "atmosferas"),
            u("pressao", "mmHg", "milímetro de mercúrio", 101325.0 / 760.0, 0.0, false, "torr", "Torr"),
            u("pressao", "psi", "libra-força por polegada quadrada", 6894.757293168),
            u("volume", "m³", "metro cúbico", 1.0, 0.0, false, "m3", "metro cubico", "metros cubicos"),
            u("volume", "L", "litro", 0.001, 0.0, true, "l", "litro", "litros"),
            u("volume", "mL", "mililitro", 1e-6, 0.0, false, "ml", "mililitro", "mililitros"),
            u("volume", "cm³", "centímetro cúbico", 1e-6, 0.0, false, "cm3", "cc"),
            u("volume", "dm³", "decímetro cúbico", 1e-3, 0.0, false, "dm3"),
            u("massa", "kg", "quilograma", 1.0, 0.0, false, "quilo", "quilos", "quilograma", "quilogramas"),
            u("massa", "g", "grama", 0.001, 0.0, true, "grama", "gramas"),
            u("massa", "mg", "miligrama", 1e-6, 0.0, false, "miligrama", "miligramas"),
            u("massa", "t", "tonelada", 1000.0, 0.0, false, "tonelada", "toneladas"),
            u("massa", "lb", "libra", 0.45359237, 0.0, false, "libra", "libras"),
            u("massa", "oz", "onça", 0.028349523125, 0.0, false, "onca", "oncas"),
            u("energia", "J", "joule", 1.0, 0.0, true, "joule", "joules"),
            u("energia", "kJ", "quilojoule", 1000.0, 0.0, false, "quilojoule", "quilojoules"),
            u("energia", "cal", "caloria termoquímica", 4.184, 0.0, true, "caloria", "calorias"),
            u("energia", "kcal", "quilocaloria", 4184.0, 0.0, false, "quilocaloria", "quilocalorias", "Cal"),
            u("energia", "eV", "elétron-volt", 1.602176634e-19, 0.0, true, "ev"),
            u("energia", "kWh", "quilowatt-hora", 3.6e6, 0.0, false, "kwh"),
            u("quantidade", "mol", "mol", 1.0, 0.0, true, "mols", "mole"),
            u("quantidade", "mmol", "milimol", 0.001, 0.0, false, "milimol", "milimols"),
            u("concentracao", "mol/L", "mol por litro", 1.0, 0.0, false, "M", "m", "molar", "mol/l", "mol por litro", "mol.L-1"),
            u("concentracao", "mmol/L", "milimol por litro", 0.001, 0.0, false, "mM", "mmol/l"),
            u("concentracao", "µmol/L", "micromol por litro", 1e-6, 0.0, false, "µM", "umol/L", "uM"),
            u("densidade", "kg/m³", "quilograma por metro cúbico", 1.0, 0.0, false, "kg/m3"),
            u("densidade", "g/cm³", "grama por centímetro cúbico", 1000.0, 0.0, false, "g/cm3", "g/mL", "g/ml"),
            u("comprimento", "m", "metro", 1.0, 0.0, true, "metro", "metros"),
            u("comprimento", "cm", "centímetro", 0.01, 0.0, false, "centimetro", "centimetros"),
            u("comprimento", "mm", "milímetro", 0.001, 0.0, false, "milimetro", "milimetros"),
            u("comprimento", "nm", "nanômetro", 1e-9, 0.0, false, "nanometro", "nanometros"),
            u("comprimento", "pm", "picômetro", 1e-12, 0.0, false, "picometro", "picometros"),
            u("comprimento", "Å", "ångström", 1e-10, 0.0, false, "angstrom", "angstroms", "A°"),
            u("comprimento", "in", "polegada", 0.0254, 0.0, false, "pol", "polegada", "polegadas"),
            u("comprimento", "ft", "pé", 0.3048, 0.0, false, "pe", "pes"),
            u("comprimento", "mi", "milha", 1609.344, 0.0, false, "milha", "milhas"),
            u("tempo", "s", "segundo", 1.0, 0.0, true, "segundo", "segundos"),
            u("tempo", "min", "minuto", 60.0, 0.0, false, "minuto", "minutos"),
            u("tempo", "h", "hora", 3600.0, 0.0, false, "hora", "horas"),
            u("tempo", "d", "dia", 86400.0, 0.0, false, "dia", "dias")
        )
    }
}
