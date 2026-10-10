package net.saibatudo.quimica.domain.calc

import net.saibatudo.quimica.data.model.Constante
import net.saibatudo.quimica.domain.Texto
import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.pow
import kotlin.math.sqrt

enum class TipoForte(val rotulo: String) { ACIDO("Ácido forte"), BASE("Base forte") }

/** Concentração (molaridade), diluição e pH de ácidos e bases fortes. Tudo calculado localmente, com passos. */
object Solucoes {

    private fun positivo(valor: Double, nome: String) {
        if (!valor.isFinite() || valor <= 0.0) throw CalculoInvalido("$nome deve ser um número positivo.")
    }

    private fun paraBase(q: Qtd, unidades: Unidades, grandeza: String, nome: String): Pair<Double, String> {
        if (q.unidade.grandeza != grandeza) throw CalculoInvalido("Unidade ${q.unidade.simbolo} não serve para $nome.")
        val base = unidades.base(grandeza) ?: throw CalculoInvalido("Falta a unidade-base de $grandeza nos dados.")
        val (v, passo) = unidades.converterComPasso(q.valor, q.unidade, base)
        return v to passo
    }

    /** Molaridade M = n / V, com n = m / MM. */
    fun molaridade(massa: Qtd, massaMolar: Double, volume: Qtd, unidades: Unidades, formula: String? = null): ResultadoCalculo {
        positivo(massa.valor, "A massa"); positivo(volume.valor, "O volume"); positivo(massaMolar, "A massa molar")
        val g = unidades.porSimbolo("g", "massa") ?: throw CalculoInvalido("Falta a unidade grama nos dados.")
        val l = unidades.porSimbolo("L", "volume") ?: throw CalculoInvalido("Falta a unidade litro nos dados.")
        val massaG = unidades.converter(massa.valor, massa.unidade, g)
        val volumeL = unidades.converter(volume.valor, volume.unidade, l)
        val mols = massaG / massaMolar
        val m = mols / volumeL
        val passos = listOf(
            "Massa: ${unidades.converterComPasso(massa.valor, massa.unidade, g).second}.",
            "Volume: ${unidades.converterComPasso(volume.valor, volume.unidade, l).second}.",
            "Quantidade de matéria: n = m / MM = ${Texto.significativos(massaG, 5)} g ÷ ${Texto.significativos(massaMolar, 5)} g/mol = ${Texto.significativos(mols, 5)} mol.",
            "Molaridade: M = n / V = ${Texto.significativos(mols, 5)} mol ÷ ${Texto.significativos(volumeL, 5)} L = ${Texto.significativos(m, 5)} mol/L."
        )
        return ResultadoCalculo(
            titulo = "Molaridade" + (formula?.let { " de $it" } ?: ""),
            linhas = listOf(
                LinhaResultado("Quantidade de matéria", "${Texto.significativos(mols, 5)} mol"),
                LinhaResultado("Molaridade", "${Texto.significativos(m, 5)} mol/L", destaque = true)
            ),
            passos = passos
        )
    }

    /** Massa de soluto para preparar [volume] de solução na concentração [conc]: m = C · V · MM. */
    fun massaParaPreparar(conc: Qtd, volume: Qtd, massaMolar: Double, unidades: Unidades, formula: String? = null): ResultadoCalculo {
        positivo(conc.valor, "A concentração"); positivo(volume.valor, "O volume"); positivo(massaMolar, "A massa molar")
        val molL = unidades.porSimbolo("mol/L", "concentracao") ?: throw CalculoInvalido("Falta a unidade mol/L nos dados.")
        val l = unidades.porSimbolo("L", "volume") ?: throw CalculoInvalido("Falta a unidade litro nos dados.")
        val c = unidades.converter(conc.valor, conc.unidade, molL)
        val v = unidades.converter(volume.valor, volume.unidade, l)
        val mols = c * v
        val massa = mols * massaMolar
        val passos = listOf(
            "Concentração: ${unidades.converterComPasso(conc.valor, conc.unidade, molL).second}.",
            "Volume: ${unidades.converterComPasso(volume.valor, volume.unidade, l).second}.",
            "Quantidade de matéria: n = C · V = ${Texto.significativos(c, 5)} mol/L × ${Texto.significativos(v, 5)} L = ${Texto.significativos(mols, 5)} mol.",
            "Massa: m = n · MM = ${Texto.significativos(mols, 5)} mol × ${Texto.significativos(massaMolar, 5)} g/mol = ${Texto.significativos(massa, 5)} g."
        )
        return ResultadoCalculo(
            titulo = "Massa para preparar a solução" + (formula?.let { " de $it" } ?: ""),
            linhas = listOf(LinhaResultado("Massa de soluto", "${Texto.significativos(massa, 5)} g", destaque = true)),
            passos = passos,
            notas = listOf("Dissolva o soluto em parte do solvente e complete até o volume final.")
        )
    }

    /** Diluição C₁V₁ = C₂V₂: deixe exatamente um dos quatro campos vazio. */
    fun diluicao(c1: CampoQtd, v1: CampoQtd, c2: CampoQtd, v2: CampoQtd, unidades: Unidades): ResultadoCalculo {
        val campos = listOf("C₁" to c1, "V₁" to v1, "C₂" to c2, "V₂" to v2)
        val vazios = campos.filter { it.second.valor == null }
        if (vazios.size != 1) throw CalculoInvalido("Deixe exatamente um campo vazio: é o que será calculado.")
        for ((nome, c) in campos) {
            val esperado = if (nome.startsWith("C")) "concentracao" else "volume"
            if (c.unidade.grandeza != esperado) throw CalculoInvalido("Unidade ${c.unidade.simbolo} não serve para $nome.")
            c.valor?.let { positivo(it, nome) }
        }
        val molL = unidades.porSimbolo("mol/L", "concentracao") ?: throw CalculoInvalido("Falta a unidade mol/L nos dados.")
        val l = unidades.porSimbolo("L", "volume") ?: throw CalculoInvalido("Falta a unidade litro nos dados.")
        fun si(c: CampoQtd) = c.valor?.let { unidades.converter(it, c.unidade, if (c.unidade.grandeza == "volume") l else molL) }
        val a = si(c1); val b = si(v1); val c = si(c2); val d = si(v2)
        val (nome, resultadoBase, unidadeBase) = when (vazios[0].first) {
            "C₁" -> Triple("C₁", c!! * d!! / b!!, molL)
            "V₁" -> Triple("V₁", c!! * d!! / a!!, l)
            "C₂" -> Triple("C₂", a!! * b!! / d!!, molL)
            else -> Triple("V₂", a!! * b!! / c!!, l)
        }
        val alvo = campos.first { it.first == nome }.second
        val final = unidades.converter(resultadoBase, unidadeBase, alvo.unidade)
        val formula = when (nome) {
            "C₁" -> "C₁ = C₂·V₂ / V₁"; "V₁" -> "V₁ = C₂·V₂ / C₁"; "C₂" -> "C₂ = C₁·V₁ / V₂"; else -> "V₂ = C₁·V₁ / C₂"
        }
        val passos = mutableListOf("Na diluição a quantidade de soluto não muda: n = C·V, logo C₁·V₁ = C₂·V₂.")
        passos += "Valores em mol/L e L: " + campos.filter { it.second.valor != null }
            .joinToString("; ") { (n, q) -> "$n = ${Texto.significativos(si(q)!!, 5)} ${if (q.unidade.grandeza == "volume") "L" else "mol/L"}" } + "."
        passos += "$formula = ${Texto.significativos(resultadoBase, 5)} ${unidadeBase.simbolo}."
        if (alvo.unidade.simbolo != unidadeBase.simbolo) passos += "Convertendo: ${Texto.significativos(resultadoBase, 5)} ${unidadeBase.simbolo} = ${Texto.significativos(final, 5)} ${alvo.unidade.simbolo}."
        val notas = mutableListOf<String>()
        val c1v = if (nome == "C₁") resultadoBase else a!!
        val c2v = if (nome == "C₂") resultadoBase else c!!
        if (c2v > c1v * 1.000000001) notas += "Atenção: uma diluição reduz a concentração; confira se C₂ não ficou maior que C₁."
        return ResultadoCalculo(
            titulo = "Diluição",
            linhas = listOf(LinhaResultado(nome, "${Texto.significativos(final, 5)} ${alvo.unidade.simbolo}", destaque = true)),
            passos = passos,
            notas = notas
        )
    }

    /**
     * pH de ácido ou base FRACO com a constante de equilíbrio informada ([k] = Ka do ácido ou Kb da base): resolve a equação do
     * segundo grau x² + K·x − K·C = 0 para [H⁺] (ácido) ou [OH⁻] (base), sem aproximações.
     */
    fun phFraco(tipo: TipoForte, conc: Qtd, k: Double, nomeK: String, unidades: Unidades, pKw: Double = 14.0, pKwDoPacote: Boolean = false): ResultadoCalculo {
        positivo(conc.valor, "A concentração")
        positivo(k, "A constante $nomeK")
        val molL = unidades.porSimbolo("mol/L", "concentracao") ?: throw CalculoInvalido("Falta a unidade mol/L nos dados.")
        val c = unidades.converter(conc.valor, conc.unidade, molL)
        val x = (-k + sqrt(k * k + 4 * k * c)) / 2
        val passos = mutableListOf<String>()
        val ph: Double
        val poh: Double
        if (tipo == TipoForte.ACIDO) {
            passos += "Ácido fraco HA ⇌ H⁺ + A⁻: $nomeK = [H⁺][A⁻] / [HA] = x² / (C − x), com C = ${Texto.significativos(c, 5)} mol/L e $nomeK = ${Texto.significativos(k, 5)}."
            passos += "Resolvendo x² + $nomeK·x − $nomeK·C = 0: x = [H⁺] = ${Texto.significativos(x, 5)} mol/L."
            ph = -log10(x); poh = pKw - ph
            passos += "pH = −log₁₀[H⁺] = ${Texto.fixo(ph, 2)}; pOH = pKw − pH = ${Texto.fixo(poh, 2)}."
        } else {
            passos += "Base fraca B + H₂O ⇌ BH⁺ + OH⁻: $nomeK = [BH⁺][OH⁻] / [B] = x² / (C − x), com C = ${Texto.significativos(c, 5)} mol/L e $nomeK = ${Texto.significativos(k, 5)}."
            passos += "Resolvendo x² + $nomeK·x − $nomeK·C = 0: x = [OH⁻] = ${Texto.significativos(x, 5)} mol/L."
            poh = -log10(x); ph = pKw - poh
            passos += "pOH = −log₁₀[OH⁻] = ${Texto.fixo(poh, 2)}; pH = pKw − pOH = ${Texto.fixo(ph, 2)}."
        }
        val grau = x / c
        passos += "Grau de ionização: α = x / C = ${Texto.significativos(grau * 100, 3)} %."
        val notas = mutableListOf(
            if (pKwDoPacote) "Constante da água: pKw = ${Texto.fixo(pKw, 2)} (dados do pacote)." else "Considera Kw = 1,0 × 10⁻¹⁴ (pKw = 14,00) a 25 °C.",
            "A constante $nomeK foi informada por você; este app não a tem nos dados."
        )
        return ResultadoCalculo(
            titulo = "pH de ${if (tipo == TipoForte.ACIDO) "ácido" else "base"} fraco(a)",
            linhas = listOf(LinhaResultado("pH", Texto.fixo(ph, 2), destaque = true), LinhaResultado("pOH", Texto.fixo(poh, 2)), LinhaResultado("Grau de ionização", "${Texto.significativos(grau * 100, 3)} %")),
            passos = passos, notas = notas
        )
    }

    /** pKw usado nos cálculos: da constante Kw/pKw do pacote, se existir; senão 14 a 25 °C (indicado nas notas). */
    fun pKwDoPacote(constantes: List<Constante>): Pair<Double, Boolean> {
        constantes.firstOrNull { it.id.equals("pKw", true) }?.let { return it.valor to true }
        constantes.firstOrNull { it.id.equals("Kw", true) && it.valor > 0 }?.let { return -log10(it.valor) to true }
        return 14.0 to false
    }

    /**
     * pH de ácido ou base forte, totalmente dissociado: [H⁺] (ou [OH⁻]) = n·C, com a correção da autoionização da água
     * (equação do segundo grau), que só importa em soluções muito diluídas.
     */
    fun phForte(tipo: TipoForte, conc: Qtd, ionizaveis: Int, unidades: Unidades, pKw: Double = 14.0, pKwDoPacote: Boolean = false): ResultadoCalculo {
        positivo(conc.valor, "A concentração")
        if (ionizaveis < 1 || ionizaveis > 4) throw CalculoInvalido("O número de H⁺ (ou OH⁻) liberados por fórmula deve estar entre 1 e 4.")
        val molL = unidades.porSimbolo("mol/L", "concentracao") ?: throw CalculoInvalido("Falta a unidade mol/L nos dados.")
        val c = unidades.converter(conc.valor, conc.unidade, molL)
        val total = c * ionizaveis
        val kw = 10.0.pow(-pKw)
        val ion = (total + sqrt(total * total + 4 * kw)) / 2   // [H+] (ácido) ou [OH-] (base) incluindo a água
        val passos = mutableListOf<String>()
        passos += "${tipo.rotulo} está totalmente ionizado(a): " + if (tipo == TipoForte.ACIDO) "[H⁺] ≈ n·C = $ionizaveis × ${Texto.significativos(c, 5)} = ${Texto.significativos(total, 5)} mol/L."
        else "[OH⁻] ≈ n·C = $ionizaveis × ${Texto.significativos(c, 5)} = ${Texto.significativos(total, 5)} mol/L."
        val ph: Double
        val poh: Double
        if (tipo == TipoForte.ACIDO) {
            ph = -log10(ion); poh = pKw - ph
            passos += "pH = −log₁₀[H⁺] = −log₁₀(${Texto.significativos(ion, 5)}) = ${Texto.fixo(ph, 2)}."
            passos += "pOH = pKw − pH = ${Texto.fixo(pKw, 2)} − ${Texto.fixo(ph, 2)} = ${Texto.fixo(poh, 2)}."
        } else {
            poh = -log10(ion); ph = pKw - poh
            passos += "pOH = −log₁₀[OH⁻] = −log₁₀(${Texto.significativos(ion, 5)}) = ${Texto.fixo(poh, 2)}."
            passos += "pH = pKw − pOH = ${Texto.fixo(pKw, 2)} − ${Texto.fixo(poh, 2)} = ${Texto.fixo(ph, 2)}."
        }
        val notas = mutableListOf<String>()
        notas += if (pKwDoPacote) "Constante da água: pKw = ${Texto.fixo(pKw, 2)} (dados do pacote)."
        else "Considera Kw = 1,0 × 10⁻¹⁴ (pKw = 14,00) a 25 °C."
        if (abs(ion - total) / total > 0.01) notas += "Solução muito diluída: foi incluída a autoionização da água (a conta simples daria outro valor)."
        notas += "Vale para ácidos e bases fortes. Ácidos e bases fracas exigem a constante de equilíbrio (Ka ou Kb)."
        val classe = when {
            ph < 7 - 0.005 -> "ácida"
            ph > 7 + 0.005 -> "básica"
            else -> "neutra"
        }
        return ResultadoCalculo(
            titulo = "pH de ${tipo.rotulo.lowercase()}",
            linhas = listOf(
                LinhaResultado("pH", Texto.fixo(ph, 2), destaque = true),
                LinhaResultado("pOH", Texto.fixo(poh, 2)),
                LinhaResultado("Solução", classe)
            ),
            passos = passos,
            notas = notas
        )
    }
}
