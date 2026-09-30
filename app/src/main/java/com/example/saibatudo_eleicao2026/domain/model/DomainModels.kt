package com.example.saibatudo_eleicao2026.domain.model

enum class MacroRegiao(val nomeExibicao: String, val ufs: List<String>) {
    SUDESTE("Sudeste", listOf("SP", "RJ", "MG", "ES")),
    SUL("Sul", listOf("PR", "SC", "RS")),
    NORDESTE("Nordeste", listOf("BA", "PE", "CE", "MA", "PB", "RN", "AL", "SE", "PI")),
    CENTRO_OESTE("Centro-Oeste", listOf("DF", "GO", "MT", "MS")),
    NORTE("Norte", listOf("AM", "PA", "AC", "RO", "RR", "AP", "TO"))
}

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
        descricaoTse = "4 dígitos: Os dois primeiros identificam o partido e os dois seguintes o candidato."
    ),
    DEPUTADO_ESTADUAL(
        codigo = "DEPUTADO_ESTADUAL",
        titulo = "Deputado Estadual / Distrital",
        digitos = 5,
        ordemVotacaoNaUrna = 2,
        descricaoTse = "5 dígitos (ou Distrital no DF): Os dois primeiros para o partido e os três seguintes para o candidato."
    ),
    SENADOR_PRIMEIRA_VAGA(
        codigo = "SENADOR_1",
        titulo = "Senador – 1ª vaga",
        digitos = 3,
        ordemVotacaoNaUrna = 3,
        descricaoTse = "3 dígitos: Os dois primeiros para o partido e o terceiro para o candidato. Renovação de 2/3."
    ),
    SENADOR_SEGUNDA_VAGA(
        codigo = "SENADOR_2",
        titulo = "Senador – 2ª vaga",
        digitos = 3,
        ordemVotacaoNaUrna = 4,
        descricaoTse = "3 dígitos: Segundo voto ao Senado. Não pode ser no mesmo candidato da 1ª vaga."
    ),
    GOVERNADOR(
        codigo = "GOVERNADOR",
        titulo = "Governador",
        digitos = 2,
        ordemVotacaoNaUrna = 5,
        descricaoTse = "2 dígitos: O número corresponde ao número da legenda partidária."
    ),
    PRESIDENTE(
        codigo = "PRESIDENTE",
        titulo = "Presidente da República",
        digitos = 2,
        ordemVotacaoNaUrna = 6,
        descricaoTse = "2 dígitos: Votação em âmbito nacional. O número corresponde à legenda do partido."
    )
}

data class Candidate(
    val id: String,
    val numero: String,
    val nomeUrna: String,
    val nomeCompleto: String,
    val cargo: String,
    val partido: String,
    val coligacao: String?,
    val estadoUf: String,
    val regiao: String,
    val digitosUrna: Int,
    val fotoUrl: String?,
    val processosAdministrativos: Int = 0,
    val fichaLimpa: Boolean = true,
    val mandatosAnteriores: Int = 0,
    val reeleicao: Boolean = false,
    val propostasResumo: List<String> = emptyList(),
    val situacaoCandidatura: String = "Deferido pelo TSE",
    val cidadesAtuacao: List<String> = emptyList()
)

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
    val vagaSenado: Int? = null,
    val apenasFichaLimpa: Boolean = false,
    val maxProcessosAdministrativos: Int? = null,
    val mandatosAnterioresOpcao: MandatosOpcao = MandatosOpcao.TODOS,
    val partido: String? = null,
    val tema: String? = null,
    val buscaTexto: String? = null
)

enum class MandatosOpcao(val label: String) {
    TODOS("Todos os Históricos"),
    PRIMEIRA_VEZ("1º Mandato (Nunca eleito)"),
    REELEICAO("Tentando Reeleição (1 mandato)"),
    VETERANO("Veterano (2+ mandatos)")
}
