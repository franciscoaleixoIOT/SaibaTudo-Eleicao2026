package net.saibatudo.quimica.domain.calc

import net.saibatudo.quimica.data.model.Elemento
import net.saibatudo.quimica.domain.Texto

/** Linha da soma da massa molar: [quantidade] átomos de [simbolo] × [massaAtomica] = [subtotal]. */
data class LinhaMassa(val simbolo: String, val nome: String, val quantidade: Int, val massaAtomica: Double, val subtotal: Double)

data class ResultadoMassaMolar(
    val formula: FormulaAnalisada,
    val linhas: List<LinhaMassa>,
    /** g/mol */
    val massaMolar: Double
) {
    fun comoResultado(): ResultadoCalculo = ResultadoCalculo(
        titulo = "Massa molar de ${formula.exibicao()}",
        linhas = listOf(LinhaResultado("Massa molar", "${Texto.fixo(massaMolar, 3)} g/mol", destaque = true)),
        passos = linhas.map { "${it.simbolo} (${it.nome}): ${it.quantidade} × ${Texto.numero(it.massaAtomica, 4)} = ${Texto.numero(it.subtotal, 4)}" } +
            "Soma: ${Texto.numero(massaMolar, 4)} g/mol, ou seja, 1 mol de ${formula.exibicao()} tem ${Texto.fixo(massaMolar, 3)} g.",
        notas = if (formula.carga != 0) listOf("A carga (${formula.carga}) não altera a massa molar: a massa dos elétrons é desprezível neste cálculo.") else emptyList()
    )
}

/** Massa molar a partir da fórmula e das massas atômicas do pacote de dados. */
object MassaMolar {
    fun calcular(formula: String, elementos: Map<String, Elemento>): ResultadoMassaMolar {
        val f = FormulaQuimica.analisar(formula, elementos.keys)
        return calcular(f, elementos)
    }

    fun calcular(f: FormulaAnalisada, elementos: Map<String, Elemento>): ResultadoMassaMolar {
        val linhas = f.contagem.map { (simbolo, n) ->
            val e = elementos[simbolo] ?: throw CalculoInvalido("\"$simbolo\" não é um elemento do pacote de dados.")
            val m = e.massaAtomica ?: throw CalculoInvalido("O pacote de dados não tem a massa atômica de ${e.nome}.")
            LinhaMassa(simbolo, e.nome, n, m, n * m)
        }
        return ResultadoMassaMolar(f, linhas, linhas.sumOf { it.subtotal })
    }
}
