package net.saibatudo.eleicoes2026.ai.nlu

import net.saibatudo.eleicoes2026.domain.model.Candidate
import net.saibatudo.eleicoes2026.domain.model.Texto

/**
 * Dicionário derivado dos DADOS oficiais carregados (partidos e nomes de candidatos).
 * É reconstruído a cada atualização de dados: a IA "aprende" novos partidos/candidatos sem retreino.
 */
class Gazetteer(candidatos: List<Candidate>) {

    /** Siglas de partido existentes nos dados (normalizadas -> sigla oficial). */
    val partidos: Map<String, String> = candidatos.asSequence()
        .map { it.partido }.filter { it.length in 2..14 }.distinct()
        .associateBy { Texto.normalizar(it) }

    /** Candidatos por token de nome (nomeUrna + nomeCompleto), para busca por nome em O(tokens). */
    private val porToken: Map<String, List<Candidate>> by lazy {
        val m = HashMap<String, MutableList<Candidate>>(candidatos.size * 2)
        for (c in candidatos) {
            for (t in c.chaveBusca.split(' ').toSet()) {
                if (t.length >= 3) m.getOrPut(t) { ArrayList(4) }.add(c)
            }
        }
        m
    }

    /**
     * Busca candidatos cujo nome contenha TODAS as palavras de [termo] (palavras inteiras).
     * Ordenação determinística: qualidade da correspondência, depois ordem oficial de cargo/UF/número
     * (nunca por preferência).
     */
    fun buscarPorNome(termo: String, cargo: String? = null, uf: String? = null, limite: Int = 50): List<Candidate> {
        val tokens = Texto.normalizar(termo).split(' ').filter { it.length >= 3 && it !in STOP_NOME }
        if (tokens.isEmpty()) return emptyList()
        // começa pela palavra mais rara (menos candidatos) e filtra pelas demais
        val base = tokens.map { porToken[it] ?: return emptyList() }.minByOrNull { it.size } ?: return emptyList()
        val frase = tokens.joinToString(" ")
        return base.asSequence()
            .filter { c ->
                val palavras = c.chaveBusca.split(' ').toSet()
                tokens.all { it in palavras }
            }
            .filter { c -> cargo == null || ModeloCargo.mesmaFamilia(cargo, c) }
            .filter { c -> uf == null || c.estadoUf == uf }
            .sortedWith(
                compareBy<Candidate>({ pontuacao(it, frase) }, { ModeloCargo.ordem(it.cargoCodigo) }, { it.estadoUf },
                    { it.numero.toIntOrNull() ?: Int.MAX_VALUE })
            )
            .take(limite).toList()
    }

    /** Menor = melhor: nome de urna idêntico > nome de urna começa com > demais. */
    private fun pontuacao(c: Candidate, frase: String): Int {
        val urna = Texto.normalizar(c.nomeUrna)
        return when {
            urna == frase -> 0
            urna.startsWith("$frase ") -> 1
            urna.contains(frase) -> 2
            else -> 3
        }
    }

    companion object {
        val STOP_NOME = setOf(
            "quem", "que", "qual", "quais", "sobre", "para", "por", "com", "dos", "das", "uma", "uns", "foi", "era",
            "esta", "est", "numero", "candidato", "candidata", "candidatos", "informacoes", "informacao", "dados",
            "perfil", "presidente", "presidencia", "governador", "governadora", "senador", "senadora", "senado",
            "deputado", "deputada", "federal", "estadual", "distrital", "vice", "suplente", "eleicao", "eleicoes",
            "urna", "partido", "votos", "voto", "mostra", "mostrar", "quero", "ver", "fala", "falar", "conta", "tem",
            "teve", "ficha", "limpa", "bens", "patrimonio", "resultado", "resultados", "pesquisa", "pesquisas"
        )
    }
}

/** Regras sobre cargos (famílias de cargos majoritários/proporcionais). */
object ModeloCargo {
    private val ORDEM = listOf(
        "PRESIDENTE", "VICE_PRESIDENTE", "GOVERNADOR", "VICE_GOVERNADOR", "SENADOR", "SUPLENTE_1", "SUPLENTE_2",
        "DEPUTADO_FEDERAL", "DEPUTADO_ESTADUAL", "DEPUTADO_DISTRITAL"
    )

    fun ordem(codigo: String): Int = ORDEM.indexOf(codigo).let { if (it < 0) ORDEM.size else it }

    /** Um filtro por cargo "SENADOR" inclui suplentes; "DEPUTADO_ESTADUAL" inclui distritais; etc. */
    fun mesmaFamilia(filtro: String, c: Candidate): Boolean = mesmaFamilia(filtro, c.cargoCodigo)

    fun mesmaFamilia(filtro: String, codigoCandidato: String): Boolean = when (filtro) {
        "DEPUTADO_ESTADUAL" -> codigoCandidato == "DEPUTADO_ESTADUAL" || codigoCandidato == "DEPUTADO_DISTRITAL"
        "PRESIDENTE" -> codigoCandidato == "PRESIDENTE" || codigoCandidato == "VICE_PRESIDENTE"
        "GOVERNADOR" -> codigoCandidato == "GOVERNADOR" || codigoCandidato == "VICE_GOVERNADOR"
        "SENADOR" -> codigoCandidato == "SENADOR" || codigoCandidato.startsWith("SUPLENTE")
        else -> codigoCandidato == filtro
    }
}
