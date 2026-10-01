package net.saibatudo.eleicoes2026.data.dto

import com.google.gson.annotations.SerializedName

/**
 * DTOs do pacote de dados (JSON -> objetos). Todos os campos são anuláveis e SEM padrões "convenientes":
 * ausência de dado permanece ausência (nunca assumimos valores como "ficha limpa = true").
 * Mantidos por regra do R8 (ver app/src/main/keepRules/rules.keep).
 */
data class CandidateDto(
    @SerializedName("id") val id: String? = null,
    @SerializedName("numero") val numero: String? = null,
    @SerializedName("nomeUrna") val nomeUrna: String? = null,
    @SerializedName("nomeCompleto") val nomeCompleto: String? = null,
    @SerializedName("cargo") val cargo: String? = null,
    @SerializedName("digitosUrna") val digitosUrna: Int? = null,
    @SerializedName("ordemVotacao") val ordemVotacao: Int? = null,
    @SerializedName("partido") val partido: String? = null,
    @SerializedName("nomePartido") val nomePartido: String? = null,
    @SerializedName("federacao") val federacao: String? = null,
    @SerializedName("siglaFederacao") val siglaFederacao: String? = null,
    @SerializedName("coligacao") val coligacao: String? = null,
    @SerializedName("estadoUf") val estadoUf: String? = null,
    @SerializedName("regiao") val regiao: String? = null,
    @SerializedName("municipioNascimento") val municipioNascimento: String? = null,
    @SerializedName("ufNascimento") val ufNascimento: String? = null,
    @SerializedName("idade") val idade: Int? = null,
    @SerializedName("genero") val genero: String? = null,
    @SerializedName("corRaca") val corRaca: String? = null,
    @SerializedName("grauInstrucao") val grauInstrucao: String? = null,
    @SerializedName("estadoCivil") val estadoCivil: String? = null,
    @SerializedName("ocupacao") val ocupacao: String? = null,
    @SerializedName("situacao") val situacao: String? = null,
    @SerializedName("elegibilidade") val elegibilidade: String? = null,
    @SerializedName("naUrna") val naUrna: Boolean? = null,
    @SerializedName("motivosIndeferimento") val motivosIndeferimento: List<String>? = null,
    @SerializedName("vezesEleito") val vezesEleito: Int? = null,
    @SerializedName("eleicoesDisputadas") val eleicoesDisputadas: Int? = null,
    @SerializedName("eleitoMesmoCargo") val eleitoMesmoCargo: Boolean? = null,
    @SerializedName("redesSociais") val redesSociais: List<String>? = null,
    @SerializedName("temPlanoGoverno") val temPlanoGoverno: Boolean? = null,
    @SerializedName("temasPlano") val temasPlano: List<String>? = null,
    @SerializedName("patrimonioDeclarado") val patrimonioDeclarado: Double? = null,
    @SerializedName("qtdBens") val qtdBens: Int? = null,
    @SerializedName("declaraBens") val declaraBens: Boolean? = null,
    @SerializedName("prestouContas") val prestouContas: Boolean? = null,
    @SerializedName("substituido") val substituido: Boolean? = null,
    @SerializedName("foto") val foto: String? = null,
    @SerializedName("temFoto") val temFoto: Boolean? = null
)

data class PesquisaDto(
    @SerializedName("protocolo") val protocolo: String? = null,
    @SerializedName("uf") val uf: String? = null,
    @SerializedName("municipio") val municipio: String? = null,
    @SerializedName("cargo") val cargo: String? = null,
    @SerializedName("empresa") val empresa: String? = null,
    @SerializedName("cnpj") val cnpj: String? = null,
    @SerializedName("pesquisaPropria") val pesquisaPropria: Boolean? = null,
    @SerializedName("dataRegistro") val dataRegistro: String? = null,
    @SerializedName("dataInicio") val dataInicio: String? = null,
    @SerializedName("dataFim") val dataFim: String? = null,
    @SerializedName("dataDivulgacao") val dataDivulgacao: String? = null,
    @SerializedName("entrevistados") val entrevistados: String? = null,
    @SerializedName("estatistico") val estatistico: String? = null,
    @SerializedName("conre") val conre: String? = null,
    @SerializedName("valor") val valor: String? = null,
    @SerializedName("metodologia") val metodologia: String? = null
)

data class RegrasDto(
    @SerializedName("fonte") val fonte: String? = null,
    @SerializedName("licenca") val licenca: String? = null,
    @SerializedName("extracaoTse") val extracaoTse: String? = null,
    @SerializedName("turno1") val turno1: String? = null,
    @SerializedName("turno2") val turno2: String? = null,
    @SerializedName("horarioVotacao") val horarioVotacao: String? = null,
    @SerializedName("ordemVotacaoUrna") val ordemVotacaoUrna: List<UrnaEtapaDto>? = null,
    @SerializedName("estatisticas") val estatisticas: EstatisticasDto? = null,
    @SerializedName("temas") val temas: Map<String, String>? = null,
    @SerializedName("glossario") val glossario: Map<String, String>? = null,
    @SerializedName("resultadosTse") val resultadosTse: ResultadosTseDto? = null
) {
    data class UrnaEtapaDto(
        @SerializedName("ordem") val ordem: Int? = null,
        @SerializedName("cargo") val cargo: String? = null,
        @SerializedName("codigo") val codigo: String? = null,
        @SerializedName("digitos") val digitos: Int? = null,
        @SerializedName("regra") val regra: String? = null,
        @SerializedName("sistema") val sistema: String? = null
    )

    data class EstatisticasDto(
        @SerializedName("totalRegistros") val totalRegistros: Int? = null,
        @SerializedName("totalNaUrna") val totalNaUrna: Int? = null,
        @SerializedName("porCargo") val porCargo: Map<String, Int>? = null,
        @SerializedName("porCargoNaUrna") val porCargoNaUrna: Map<String, Int>? = null,
        @SerializedName("porUf") val porUf: Map<String, Int>? = null,
        @SerializedName("porPartido") val porPartido: Map<String, Int>? = null,
        @SerializedName("porGenero") val porGenero: Map<String, Int>? = null,
        @SerializedName("porElegibilidade") val porElegibilidade: Map<String, Int>? = null,
        @SerializedName("eleitosMesmoCargoAntes") val eleitosMesmoCargoAntes: Int? = null,
        @SerializedName("pesquisasRegistradas") val pesquisasRegistradas: Int? = null,
        @SerializedName("candidatosComPlanoGoverno") val candidatosComPlanoGoverno: Int? = null
    )

    data class ResultadosTseDto(
        @SerializedName("base") val base: String? = null,
        @SerializedName("federal") val federal: Turnos? = null,
        @SerializedName("estadual") val estadual: Turnos? = null,
        @SerializedName("cargos") val cargos: Map<String, Int>? = null
    ) {
        data class Turnos(
            @SerializedName("turno1") val turno1: Int? = null,
            @SerializedName("turno2") val turno2: Int? = null
        )
    }
}

data class FontesDto(
    @SerializedName("nota") val nota: String? = null,
    @SerializedName("sistemasNacionais") val sistemasNacionais: List<SistemaDto>? = null,
    @SerializedName("tres") val tres: List<TreDto>? = null,
    @SerializedName("orgaos") val orgaos: List<OrgaoDto>? = null
) {
    data class SistemaDto(
        @SerializedName("nome") val nome: String? = null,
        @SerializedName("url") val url: String? = null,
        @SerializedName("utilidade") val utilidade: String? = null
    )

    data class TreDto(
        @SerializedName("uf") val uf: String? = null,
        @SerializedName("estado") val estado: String? = null,
        @SerializedName("tribunal") val tribunal: String? = null,
        @SerializedName("url") val url: String? = null,
        @SerializedName("secoes") val secoes: List<SecaoDto>? = null
    ) {
        data class SecaoDto(
            @SerializedName("titulo") val titulo: String? = null,
            @SerializedName("url") val url: String? = null
        )
    }

    data class OrgaoDto(
        @SerializedName("orgao") val orgao: String? = null,
        @SerializedName("url") val url: String? = null,
        @SerializedName("utilidade") val utilidade: String? = null
    )
}
