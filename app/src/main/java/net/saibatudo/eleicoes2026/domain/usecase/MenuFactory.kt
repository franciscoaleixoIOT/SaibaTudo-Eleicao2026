package net.saibatudo.eleicoes2026.domain.usecase

import net.saibatudo.eleicoes2026.core.constants.AppConstants
import net.saibatudo.eleicoes2026.domain.model.FaseEleitoral
import net.saibatudo.eleicoes2026.domain.model.MenuItem
import net.saibatudo.eleicoes2026.domain.model.TseCargo
import net.saibatudo.eleicoes2026.domain.model.TseRegras
import net.saibatudo.eleicoes2026.domain.model.Datas

/** Monta o menu principal a partir dos dados oficiais e da fase do calendário (muda após a eleição). */
object MenuFactory {

    fun principal(regras: TseRegras, fase: FaseEleitoral, hoje: String): List<MenuItem> {
        val st = regras.estatisticas
        fun n(cargo: String) = st.porCargoNaUrna[cargo]?.toString() ?: "—"
        val itens = mutableListOf<MenuItem>()
        if (fase.mostraResultados) {
            itens += MenuItem(
                id = AppConstants.MENU_RESULTADOS, title = "Resultados e apuração",
                description = if (fase == FaseEleitoral.POS_ELEICAO) "Resultados oficiais e eleitos" else "Apuração oficial do TSE",
                iconName = "ic_resultados", route = "info/resultados"
            )
        }
        itens += listOf(
            MenuItem(AppConstants.MENU_PRESIDENTE, "Presidente (2 dígitos)", "${n("PRESIDENTE")} candidaturas na urna • nacional",
                "ic_presidencia", "candidates/presidente", defaultFilters = mapOf("cargo" to TseCargo.PRESIDENTE.codigo)),
            MenuItem(AppConstants.MENU_GOVERNADOR, "Governador (2 dígitos)", "${n("GOVERNADOR")} candidaturas • 27 UFs",
                "ic_governador", "candidates/governador", defaultFilters = mapOf("cargo" to TseCargo.GOVERNADOR.codigo)),
            MenuItem(AppConstants.MENU_SENADOR, "Senador (3 dígitos)", "${n("SENADOR")} candidaturas • 2 vagas por UF",
                "ic_senado", "candidates/senador", defaultFilters = mapOf("cargo" to TseCargo.SENADOR.codigo)),
            MenuItem(AppConstants.MENU_DEPUTADO_FEDERAL, "Deputado Federal (4 dígitos)", "${n("DEPUTADO FEDERAL")} candidaturas • 513 vagas",
                "ic_deputado", "candidates/deputado_federal", defaultFilters = mapOf("cargo" to TseCargo.DEPUTADO_FEDERAL.codigo)),
            MenuItem(AppConstants.MENU_DEPUTADO_ESTADUAL, "Dep. Estadual/Distrital (5 dígitos)",
                "${(st.porCargoNaUrna["DEPUTADO ESTADUAL"] ?: 0) + (st.porCargoNaUrna["DEPUTADO DISTRITAL"] ?: 0)} candidaturas",
                "ic_deputado_est", "candidates/deputado_estadual", defaultFilters = mapOf("cargo" to TseCargo.DEPUTADO_ESTADUAL.codigo)),
            MenuItem(AppConstants.MENU_PESQUISAS, "Pesquisas registradas", "${st.pesquisasRegistradas} registros no TSE",
                "ic_pesquisas", "info/pesquisas"),
            MenuItem(AppConstants.MENU_CALENDARIO, "Calendário e prazos", calendarioResumo(regras, fase, hoje),
                "ic_calendar", "info/calendario")
        )
        return itens
    }

    private fun calendarioResumo(r: TseRegras, fase: FaseEleitoral, hoje: String): String = when (fase) {
        FaseEleitoral.PRE_ELEICAO -> "1º turno ${Datas.formatarBr(r.turno1)} • 2º turno ${Datas.formatarBr(r.turno2)}"
        FaseEleitoral.DIA_1T -> "Hoje: 1º turno • votação 8h às 17h"
        FaseEleitoral.ENTRE_TURNOS -> "2º turno em ${Datas.formatarBr(r.turno2)}"
        FaseEleitoral.DIA_2T -> "Hoje: 2º turno • votação 8h às 17h"
        FaseEleitoral.POS_ELEICAO -> "Eleições realizadas em ${Datas.formatarBr(r.turno1)} e ${Datas.formatarBr(r.turno2)}"
    }
}
