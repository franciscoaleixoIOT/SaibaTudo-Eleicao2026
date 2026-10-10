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

    /** Palavras do nome de cada candidato SEM pontuação ("prof. roger" = "prof roger"); a busca usa a mesma forma. */
    private val palavrasDe: java.util.IdentityHashMap<Candidate, Set<String>> by lazy {
        val m = java.util.IdentityHashMap<Candidate, Set<String>>(candidatos.size * 2)
        for (c in candidatos) m[c] = semPontuacao(c.chaveBusca).split(' ').toSet()
        m
    }

    /** Candidatos por token de nome (nomeUrna + nomeCompleto), para busca por nome em O(tokens). */
    private val porToken: Map<String, List<Candidate>> by lazy {
        val m = HashMap<String, MutableList<Candidate>>(candidatos.size * 2)
        for (c in candidatos) {
            for (t in palavrasDe[c].orEmpty()) {
                if (t.length >= 3) m.getOrPut(t) { ArrayList(4) }.add(c)
            }
        }
        m
    }

    /** Nomes COMPLETOS (nome de urna e nome civil, 2+ palavras, sem pontuação): "a frase inteira é o nome de um candidato". */
    private val nomesExatos: Set<String> by lazy {
        val s = HashSet<String>(candidatos.size * 2)
        for (c in candidatos) for (nome in listOf(c.nomeUrna, c.nomeCompleto)) {
            val n = semPontuacao(Texto.normalizar(nome))
            if (' ' in n) s += n
        }
        s
    }

    /** Nomes de urna de UMA palavra de 3 letras ("JHC", "BEL"): só valem quando a pergunta pede um perfil. */
    private val nomesCurtos: Set<String> by lazy {
        candidatos.asSequence().map { semPontuacao(Texto.normalizar(it.nomeUrna)) }.filter { it.length == 3 && ' ' !in it }.toSet()
    }

    fun ehNomeExato(t: String): Boolean = t in nomesExatos

    fun ehNomeCurto(t: String): Boolean = t in nomesCurtos

    /**
     * Busca candidatos cujo nome contenha TODAS as palavras de [termo] (palavras inteiras).
     * Ordenação determinística: qualidade da correspondência, depois ordem oficial de cargo/UF/número
     * (nunca por preferência).
     */
    fun buscarPorNome(termo: String, cargo: String? = null, uf: String? = null, limite: Int = 50): List<Candidate> {
        val tokens = semPontuacao(Texto.normalizar(termo)).split(' ').filter { it.length >= 3 && it !in STOP_NOME }
        if (tokens.isEmpty()) return emptyList()
        // começa pela palavra mais rara (menos candidatos) e filtra pelas demais
        val base = tokens.map { porToken[it] ?: return emptyList() }.minByOrNull { it.size } ?: return emptyList()
        val frase = tokens.joinToString(" ")
        return base.asSequence()
            .filter { c ->
                val palavras = palavrasDe[c] ?: semPontuacao(c.chaveBusca).split(' ').toSet()
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
        private val RX_NAO_ALNUM = Regex("[^\\p{L}\\p{N}]+")

        /** Palavras de um nome sem pontuação: "prof. roger" e "dr.luisinho" viram "prof roger" e "dr luisinho" (o campo chaveBusca, usado também
         *  pela busca manual da interface, mantém a pontuação original). */
        fun semPontuacao(s: String): String = s.replace(RX_NAO_ALNUM, " ").trim()

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
