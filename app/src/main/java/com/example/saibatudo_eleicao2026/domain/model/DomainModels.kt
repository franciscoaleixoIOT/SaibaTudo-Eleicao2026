package com.example.saibatudo_eleicao2026.domain.model

/**
 * Macro-regiões do Brasil (base para filtros geográficos dinâmicos).
 */
enum class MacroRegiao(val nomeExibicao: String, val ufs: List<String>) {
    SUDESTE("Sudeste", listOf("SP", "RJ", "MG", "ES")),
    SUL("Sul", listOf("PR", "SC", "RS")),
    NORDESTE("Nordeste", listOf("BA", "PE", "CE", "MA", "PB", "RN", "AL", "SE", "PI")),
    CENTRO_OESTE("Centro-Oeste", listOf("DF", "GO", "MT", "MS")),
    NORTE("Norte", listOf("AM", "PA", "AC", "RO", "RR", "AP", "TO"))
}

/**
 * Cargos das Eleições Gerais 2026 com regras oficiais do TSE.
 * Fonte: Resoluções do TSE e dados abertos (consulta_cand_2026 / consulta_vagas_2026).
 */
enum class TseCargo(
    val codigo: String,
    val titulo: String,
    val digitos: Int,
    val ordemVotacaoNaUrna: Int,
    val descricaoTse: String
) {
    DEPUTADO_FEDERAL(
        codigo = "DEPUTADO_FEDERAL",
        titulo = "Deputado Federal",
        digitos = 4,
        ordemVotacaoNaUrna = 1,
        descricaoTse = "4 dígitos: os 2 primeiros identificam o partido e os 2 últimos o candidato. Sistema proporcional."
    ),
    DEPUTADO_ESTADUAL(
        codigo = "DEPUTADO_ESTADUAL",
        titulo = "Dep. Estadual / Distrital",
        digitos = 5,
        ordemVotacaoNaUrna = 2,
        descricaoTse = "5 dígitos (ou Distrital no DF): os 2 primeiros para a legenda e os 3 seguintes para o candidato."
    ),
    SENADOR(
        codigo = "SENADOR",
        titulo = "Senador",
        digitos = 3,
        ordemVotacaoNaUrna = 3,
        descricaoTse = "3 dígitos. Em 2026 cada eleitor vota em DOIS senadores diferentes (renovação de 2/3 do Senado)."
    ),
    GOVERNADOR(
        codigo = "GOVERNADOR",
        titulo = "Governador",
        digitos = 2,
        ordemVotacaoNaUrna = 5,
        descricaoTse = "2 dígitos: número da legenda partidária. Majoritário absoluto, sujeito a 2º turno."
    ),
    PRESIDENTE(
        codigo = "PRESIDENTE",
        titulo = "Presidente da República",
        digitos = 2,
        ordemVotacaoNaUrna = 6,
        descricaoTse = "2 dígitos: número da legenda partidária. Votação nacional, majoritário absoluto."
    );

    companion object {
        fun fromCodigo(codigo: String?): TseCargo? = entries.firstOrNull { it.codigo.equals(codigo, ignoreCase = true) }
    }
}

/**
 * Candidato OFICIAL registrado no TSE (Eleições Gerais 2026).
 * Todos os campos derivam dos arquivos oficiais:
 *  - consulta_cand_2026 (dados básicos)
 *  - consulta_cand_complementar_2026 (situação de julgamento, idade, reeleição)
 *  - historico_candidatura_2026 (mandatos anteriores e reeleição)
 *  - motivo_cassacao_2026 (fundamentos legais / processos)
 *  - rede_social_candidato_2026
 *  - proposta_governo_2026 (planos de governo oficiais - PDF)
 */
data class Candidate(
    val id: String,
    val numero: String,
    val nomeUrna: String,
    val nomeCompleto: String,
    val cargo: String,
    val cargoCodigo: String,
    val partido: String,
    val coligacao: String? = null,
    val federacao: String? = null,
    val estadoUf: String,
    val regiao: String,
    val digitosUrna: Int,
    val ordemVotacao: Int = 0,
    val fotoLocal: String? = null,
    val processosAdministrativos: Int = 0,
    val motivosCassacao: List<String> = emptyList(),
    val fichaLimpa: Boolean = true,
    val mandatosAnteriores: Int = 0,
    val totalEleicoesDisputadas: Int = 0,
    val reeleicao: Boolean = false,
    val propostasResumo: List<String> = emptyList(),
    val temPlanoGoverno: Boolean = false,
    val situacaoCandidatura: String = "PENDENTE",
    val idade: Int? = null,
    val genero: String? = null,
    val corRaca: String? = null,
    val grauInstrucao: String? = null,
    val ocupacao: String? = null,
    val municipioNascimento: String? = null,
    val ufNascimento: String? = null,
    val redesSociais: List<String> = emptyList(),
    val cidadesAtuacao: List<String> = emptyList()
)

/**
 * Pesquisa eleitoral OFICIAL registrada no TSE (pesquisa_eleitoral_2026).
 */
data class PesquisaEleitoral(
    val protocolo: String?,
    val uf: String?,
    val municipio: String?,
    val cargo: String?,
    val empresa: String?,
    val cnpj: String?,
    val pesquisaPropria: Boolean,
    val dataRegistro: String?,
    val dataInicio: String?,
    val dataFim: String?,
    val dataDivulgacao: String?,
    val entrevistados: String?,
    val estatistico: String?,
    val conre: String?,
    val valor: String?,
    val metodologia: String?
)

/**
 * Regras e estatísticas oficiais TSE 2026 (tse_regras_2026.json).
 */
data class TseRegras(
    val fonte: String,
    val dataGeracaoDados: String,
    val dataPrimeiroTurno: String,
    val dataSegundoTurno: String,
    val horarioVotacao: String,
    val ordemVotacaoUrna: List<UrnaEtapa>,
    val estatisticas: EstatisticasOficiais
) {
    data class UrnaEtapa(
        val ordem: Int,
        val cargo: String,
        val codigo: String,
        val digitos: Int,
        val regra: String,
        val sistema: String
    )

    data class EstatisticasOficiais(
        val totalCandidatos: Int,
        val porCargo: Map<String, Int>,
        val porUf: Map<String, Int>,
        val porPartido: Map<String, Int>,
        val porGenero: Map<String, Int>,
        val porSituacaoJulgamento: Map<String, Int>,
        val fichaLimpaTotal: Int,
        val tentandoReeleicao: Int,
        val pesquisasRegistradas: Int,
        val planosDeGovernoDisponiveis: Int
    )
}

/**
 * Fontes oficiais complementares (TREs estaduais e órgãos de acompanhamento/fiscalização).
 * Derivado dos sites oficiais de cada órgão (tse_fontes_oficiais_2026.json).
 */
data class TreOficial(
    val uf: String,
    val estado: String,
    val tribunal: String,
    val url: String,
    val titulo: String,
    val resumo: String,
    val secoes: List<SecaoOficial> = emptyList()
) {
    data class SecaoOficial(val titulo: String, val url: String)
}

data class OrgaoOficial(
    val orgao: String,
    val url: String,
    val utilidade: String,
    val resumo: String
)

data class FontesOficiais(
    val nota: String,
    val sistemasNacionais: List<SistemaNacional>,
    val tres: List<TreOficial>,
    val orgaos: List<OrgaoOficial>
) {
    data class SistemaNacional(val nome: String, val url: String, val utilidade: String)
}

data class MenuItem(
    val id: String,
    val title: String,
    val description: String,
    val iconName: String,
    val route: String,
    val submenus: List<MenuItem> = emptyList(),
    val defaultFilters: Map<String, String> = emptyMap()
)

data class ElectoralFilter(
    val localizacaoAtiva: Boolean = true,
    val regiao: String? = "Sudeste",
    val estadoUf: String? = "SP",
    val cargo: String? = null,
    val apenasFichaLimpa: Boolean = false,
    val apenasDefinidos: Boolean = false,
    val maxProcessosAdministrativos: Int? = null,
    val mandatosAnterioresOpcao: MandatosOpcao = MandatosOpcao.TODOS,
    val apenasReeleicao: Boolean = false,
    val partido: String? = null,
    val tema: String? = null,
    val buscaTexto: String? = null
)

enum class MandatosOpcao(val label: String) {
    TODOS("Todos os Históricos"),
    PRIMEIRA_VEZ("1º Mandato (Nunca eleito)"),
    REELEICAO("Tentando Reeleição"),
    VETERANO("Veterano (2+ mandatos)")
}
