package net.saibatudo.eleicoes2026.ui.viewmodel

/**
 * Histórico das perguntas feitas ao assistente, navegável pelas setas ▲/▼ da caixa de pergunta
 * (como o histórico de um terminal). Imutável: cada operação devolve um novo histórico, o que permite
 * guardá-lo em estado do Compose.
 *
 * - [posicao] == `itens.size` significa "caixa livre" (rascunho); menos que isso é uma pergunta antiga recuperada.
 * - [rascunho] guarda o que o usuário estava digitando ao subir pela 1ª vez, para voltar a ele (ou ao vazio)
 *   ao descer até o fim.
 */
data class HistoricoPerguntas(
    val itens: List<String> = emptyList(),
    val posicao: Int = 0,
    val rascunho: String = ""
) {
    /** Última pergunta enviada (exibida acima da caixa). */
    val ultima: String? get() = itens.lastOrNull()
    val podeSubir: Boolean get() = posicao > 0
    val podeDescer: Boolean get() = posicao < itens.size

    /** Registra uma pergunta enviada e devolve a caixa ao modo livre. Repetição imediata não duplica. */
    fun registrar(pergunta: String): HistoricoPerguntas {
        val p = pergunta.trim()
        if (p.isEmpty()) return this
        val novos = if (itens.lastOrNull() == p) itens else (itens + p).takeLast(LIMITE)
        return HistoricoPerguntas(novos, novos.size, "")
    }

    /** Seta ▲: pergunta anterior. [atual] é o texto da caixa (guardado como rascunho se estava livre). */
    fun subir(atual: String): Pair<HistoricoPerguntas, String>? {
        if (!podeSubir) return null
        val rasc = if (posicao == itens.size) atual else rascunho
        val nova = posicao - 1
        return copy(posicao = nova, rascunho = rasc) to itens[nova]
    }

    /** Seta ▼: pergunta seguinte; ao passar da última, volta ao rascunho (vazio se nada foi escrito). */
    fun descer(): Pair<HistoricoPerguntas, String>? {
        if (!podeDescer) return null
        val nova = posicao + 1
        return if (nova == itens.size) copy(posicao = nova) to rascunho else copy(posicao = nova) to itens[nova]
    }

    companion object {
        const val LIMITE = 50
    }
}
