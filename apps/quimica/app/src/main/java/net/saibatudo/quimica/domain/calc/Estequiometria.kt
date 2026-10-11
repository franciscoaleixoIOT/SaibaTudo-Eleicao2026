package net.saibatudo.quimica.domain.calc

import net.saibatudo.quimica.data.model.Elemento
import net.saibatudo.quimica.domain.Texto

/** Quantidade conhecida de uma espécie da equação: [indice] (0 = primeira espécie), valor em g ou mol. */
data class QuantidadeConhecida(val indice: Int, val valor: Double, val emMols: Boolean)

/** Linha do resultado para uma espécie. */
data class LinhaEstequiometria(
    val especie: String,
    val coeficiente: Int,
    val reagente: Boolean,
    val massaMolar: Double,
    val mols: Double,
    val massa: Double,
    /** Reagente: o que sobra (mol) quando a quantidade inicial é conhecida. */
    val sobraMols: Double?
)

data class ResultadoEstequiometria(
    val equacao: EquacaoBalanceada,
    val limitante: String?,
    val extensao: Double,
    val linhas: List<LinhaEstequiometria>,
    val passos: List<String>
) {
    fun comoResultado(rendimentoPercentual: Double? = null): ResultadoCalculo {
        val l = linhas.map {
            val verbo = if (it.reagente) "consumido" else "formado"
            val valor = "${Texto.significativos(it.mols, 5)} mol = ${Texto.significativos(it.massa, 5)} g"
            LinhaResultado("${Texto.formulaUnicode(it.especie)} ($verbo)", valor, destaque = !it.reagente)
        }.toMutableList()
        if (rendimentoPercentual != null) {
            linhas.filter { !it.reagente }.forEach {
                val f = rendimentoPercentual / 100.0
                l += LinhaResultado("${Texto.formulaUnicode(it.especie)} com rendimento de ${Texto.significativos(rendimentoPercentual, 4)} %",
                    "${Texto.significativos(it.mols * f, 5)} mol = ${Texto.significativos(it.massa * f, 5)} g")
            }
        }
        return ResultadoCalculo("Estequiometria", l, passos, listOf("Equação balanceada: ${equacao.texto()}"))
    }
}

/**
 * Estequiometria a partir de uma equação balanceada: converte massa ↔ mol pela massa molar, usa a proporção dos
 * coeficientes e identifica o reagente limitante quando mais de um reagente tem quantidade conhecida.
 */
object Estequiometria {

    fun calcular(eq: EquacaoBalanceada, conhecidas: List<QuantidadeConhecida>, elementos: Map<String, Elemento>): ResultadoEstequiometria {
        val especies = eq.equacao.todas
        val nr = eq.equacao.reagentes.size
        if (conhecidas.isEmpty()) throw CalculoInvalido("Informe a quantidade de pelo menos uma espécie.")
        if (conhecidas.map { it.indice }.distinct().size != conhecidas.size) throw CalculoInvalido("Há a mesma espécie informada duas vezes.")
        for (q in conhecidas) {
            if (q.indice !in especies.indices) throw CalculoInvalido("Espécie inexistente na equação.")
            if (!q.valor.isFinite() || q.valor <= 0) throw CalculoInvalido("As quantidades devem ser números positivos.")
        }
        val massas = especies.map { MassaMolar.calcular(it.formula, elementos).massaMolar }
        val passos = mutableListOf<String>()
        passos += "Equação balanceada: ${eq.texto()}"
        passos += "Massas molares: " + especies.indices.joinToString("; ") { "${Texto.formulaUnicode(especies[it].rotulo)} = ${Texto.fixo(massas[it], 3)} g/mol" } + "."

        // mols conhecidos
        val molsConhecidos = conhecidas.associate { q ->
            val mols = if (q.emMols) q.valor else q.valor / massas[q.indice]
            passos += if (q.emMols) "${Texto.formulaUnicode(especies[q.indice].rotulo)}: ${Texto.significativos(q.valor, 5)} mol (informado)."
            else "${Texto.formulaUnicode(especies[q.indice].rotulo)}: n = m / MM = ${Texto.significativos(q.valor, 5)} g ÷ ${Texto.fixo(massas[q.indice], 3)} g/mol = ${Texto.significativos(mols, 5)} mol."
            q.indice to mols
        }
        val reagentesConhecidos = molsConhecidos.keys.filter { it < nr }
        val extensao: Double
        var limitante: String? = null
        if (reagentesConhecidos.size >= 2 && reagentesConhecidos.size == molsConhecidos.size) {
            // reagente limitante: menor n/coeficiente
            val razoes = reagentesConhecidos.associateWith { molsConhecidos.getValue(it) / eq.coeficientes[it] }
            passos += "Razão n ÷ coeficiente: " + razoes.entries.joinToString("; ") { "${Texto.formulaUnicode(especies[it.key].rotulo)} = ${Texto.significativos(it.value, 5)}" } + "."
            val lim = razoes.minByOrNull { it.value }!!
            extensao = lim.value
            limitante = especies[lim.key].rotulo
            passos += "Reagente limitante: ${Texto.formulaUnicode(limitante)} (menor razão). Ele determina o quanto a reação avança: ξ = ${Texto.significativos(extensao, 5)} mol."
        } else if (molsConhecidos.size == 1) {
            val (i, n) = molsConhecidos.entries.first()
            extensao = n / eq.coeficientes[i]
            passos += "Com uma só espécie conhecida: ξ = n ÷ coeficiente = ${Texto.significativos(n, 5)} ÷ ${eq.coeficientes[i]} = ${Texto.significativos(extensao, 5)} mol."
        } else {
            throw CalculoInvalido("Informe somente reagentes (para achar o limitante) ou uma única espécie.")
        }

        val linhas = especies.indices.map { i ->
            val mols = eq.coeficientes[i] * extensao
            val sobra = if (i < nr && molsConhecidos.containsKey(i)) molsConhecidos.getValue(i) - mols else null
            LinhaEstequiometria(especies[i].rotulo, eq.coeficientes[i], i < nr, massas[i], mols, mols * massas[i], sobra?.let { if (kotlin.math.abs(it) < 1e-12) 0.0 else it })
        }
        passos += "Cada espécie: n = coeficiente × ξ; massa = n × MM."
        linhas.filter { it.sobraMols != null && it.sobraMols > 0.0 }.forEach {
            passos += "Sobra de ${Texto.formulaUnicode(it.especie)}: ${Texto.significativos(it.sobraMols!!, 5)} mol (${Texto.significativos(it.sobraMols * it.massaMolar, 5)} g)."
        }
        return ResultadoEstequiometria(eq, limitante, extensao, linhas, passos)
    }
}
