package net.saibatudo.eleicoes2026.domain.usecase

import net.saibatudo.eleicoes2026.ai.nlu.ModeloCargo
import net.saibatudo.eleicoes2026.domain.model.Candidate
import net.saibatudo.eleicoes2026.domain.model.ElectoralFilter
import net.saibatudo.eleicoes2026.domain.model.HistoricoOpcao
import net.saibatudo.eleicoes2026.domain.model.Texto

/**
 * Filtragem determinística de candidaturas. A ORDEM da lista é fixa (cargo, UF, número do candidato):
 * o app nunca ranqueia nem prioriza candidaturas.
 */
object CandidateQuery {

    private val ORDEM = compareBy<Candidate>(
        { ModeloCargo.ordem(it.cargoCodigo) },
        { it.estadoUf },
        { it.numero.toIntOrNull() ?: Int.MAX_VALUE },
        { it.nomeUrna }
    )

    fun filtrar(todos: List<Candidate>, f: ElectoralFilter): List<Candidate> {
        val busca = f.buscaTexto?.let { Texto.normalizar(it) }?.takeIf { it.isNotEmpty() }
        return todos.asSequence()
            .filter { c -> f.estadoUf == null || c.estadoUf == f.estadoUf || c.estadoUf == "BR" }
            .filter { c -> f.regiao == null || c.regiao == f.regiao || c.estadoUf == "BR" }
            .filter { c -> f.cargo == null || ModeloCargo.mesmaFamilia(f.cargo, c) }
            .filter { c -> !f.apenasNaUrna || c.naUrna }
            .filter { c -> !f.apenasDeferidas || c.elegibilidade.apta == true }
            .filter { c -> !f.apenasEleitos || c.resultado?.eleito == true }
            .filter { c ->
                when (f.historico) {
                    HistoricoOpcao.TODOS -> true
                    HistoricoOpcao.NUNCA_ELEITO -> c.vezesEleito == 0
                    HistoricoOpcao.ELEITO_MESMO_CARGO -> c.eleitoMesmoCargo
                    HistoricoOpcao.ELEITO_2_OU_MAIS -> c.vezesEleito >= 2
                }
            }
            .filter { c -> f.partido == null || c.partido.equals(f.partido, ignoreCase = true) }
            .filter { c -> f.tema == null || f.tema in c.temasPlano }
            .filter { c ->
                busca == null || c.chaveBusca.contains(busca) || c.numero == busca ||
                    Texto.normalizar(c.partido).contains(busca) ||
                    c.municipioNascimento?.let { Texto.normalizar(it).contains(busca) } == true
            }
            .sortedWith(ORDEM)
            .toList()
    }

    /** Apenas titulares do cargo (sem vices/suplentes) — usado em contagens e listas de resposta. */
    fun titulares(todos: List<Candidate>, cargo: String, uf: String?, somenteNaUrna: Boolean = true): List<Candidate> =
        todos.asSequence()
            .filter { it.cargoCodigo == cargo && (uf == null || it.estadoUf == uf) && (!somenteNaUrna || it.naUrna) }
            .sortedWith(ORDEM).toList()
}
