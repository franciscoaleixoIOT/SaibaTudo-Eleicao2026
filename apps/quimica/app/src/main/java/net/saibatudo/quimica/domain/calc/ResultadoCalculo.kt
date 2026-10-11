package net.saibatudo.quimica.domain.calc

/** Linha de resultado: "Massa molar" → "18,015 g/mol". [destaque] marca o resultado principal. */
data class LinhaResultado(val rotulo: String, val valor: String, val destaque: Boolean = false)

/**
 * Resultado uniforme de uma calculadora: resultados, passos (mostrados ao usuário) e notas/avisos.
 * Todos os números vêm de cálculo local ou dos dados do pacote; nada vem de modelo.
 */
data class ResultadoCalculo(
    val titulo: String,
    val linhas: List<LinhaResultado>,
    val passos: List<String> = emptyList(),
    val notas: List<String> = emptyList()
) {
    /** Texto simples (para respostas da pergunta livre e testes): título, resultados e passos. */
    fun comoTexto(): String = buildString {
        append(titulo)
        linhas.forEach { append('\n').append(it.rotulo).append(": ").append(it.valor) }
        if (passos.isNotEmpty()) {
            append("\nPassos:")
            passos.forEach { append("\n• ").append(it) }
        }
        notas.forEach { append('\n').append(it) }
    }
}
