package net.saibatudo.eleicoes2026.domain.model

/** Linha de apuração exatamente como divulgada pelo TSE (valores não são alterados pelo app). */
data class LinhaApuracao(
    val sqCandidato: String?,
    val numero: String,
    val nome: String,
    val partido: String,
    val votos: Long,
    val percentual: String?,   // texto do TSE (ex.: "45,21")
    val eleito: Boolean
)

/** Apuração de um cargo/UF/turno (JSON público de resultados.tse.jus.br). */
data class ApuracaoCargo(
    val cargo: String,
    val uf: String,
    val turno: Int,
    val geradoEm: String,                 // "dd/MM/yyyy HH:mm:ss" (campos dg/hg do TSE)
    val secoesTotalizadasPct: String?,    // % de seções totalizadas (texto do TSE)
    val totalizacaoFinal: Boolean,
    val linhas: List<LinhaApuracao>
) {
    val temVotos: Boolean get() = linhas.any { it.votos > 0 }
}

/** Fonte de apuração oficial (ao vivo). A implementação de rede fica em data/live. */
fun interface ApuracaoProvider {
    suspend fun obter(cargo: String, uf: String, turno: Int): ApuracaoCargo?
}
