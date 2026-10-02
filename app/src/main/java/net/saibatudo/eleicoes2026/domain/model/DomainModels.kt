package net.saibatudo.eleicoes2026.domain.model

/** Macro-regiões do Brasil (base para filtros geográficos). */
enum class MacroRegiao(val nomeExibicao: String, val ufs: List<String>) {
    SUDESTE("Sudeste", listOf("SP", "RJ", "MG", "ES")),
    SUL("Sul", listOf("PR", "SC", "RS")),
    NORDESTE("Nordeste", listOf("BA", "PE", "CE", "MA", "PB", "RN", "AL", "SE", "PI")),
    CENTRO_OESTE("Centro-Oeste", listOf("DF", "GO", "MT", "MS")),
    NORTE("Norte", listOf("AM", "PA", "AC", "RO", "RR", "AP", "TO"))
}

/** Unidades da Federação (siglas oficiais) com nome por extenso. */
object Ufs {
    val NOMES: Map<String, String> = linkedMapOf(
        "AC" to "Acre", "AL" to "Alagoas", "AP" to "Amapá", "AM" to "Amazonas", "BA" to "Bahia",
        "CE" to "Ceará", "DF" to "Distrito Federal", "ES" to "Espírito Santo", "GO" to "Goiás",
        "MA" to "Maranhão", "MT" to "Mato Grosso", "MS" to "Mato Grosso do Sul", "MG" to "Minas Gerais",
        "PA" to "Pará", "PB" to "Paraíba", "PR" to "Paraná", "PE" to "Pernambuco", "PI" to "Piauí",
        "RJ" to "Rio de Janeiro", "RN" to "Rio Grande do Norte", "RS" to "Rio Grande do Sul",
        "RO" to "Rondônia", "RR" to "Roraima", "SC" to "Santa Catarina", "SP" to "São Paulo",
        "SE" to "Sergipe", "TO" to "Tocantins"
    )
    val SIGLAS: Set<String> = NOMES.keys
    fun regiaoDe(uf: String): String? = MacroRegiao.entries.firstOrNull { uf in it.ufs }?.nomeExibicao

    /** Artigo usado com o nome do estado ("no Acre", "na Bahia", "em São Paulo"). */
    private val ARTIGO = mapOf(
        "AC" to "o", "AP" to "o", "AM" to "o", "BA" to "a", "CE" to "o", "DF" to "o", "ES" to "o", "MA" to "o",
        "PA" to "o", "PB" to "a", "PR" to "o", "PI" to "o", "RJ" to "o", "RN" to "o", "RS" to "o", "TO" to "o"
    )

    /** "em São Paulo", "na Bahia", "no Rio de Janeiro"; "BR" = "no Brasil". */
    fun em(uf: String): String {
        if (uf == "BR") return "no Brasil"
        val nome = NOMES[uf] ?: return "em $uf"
        return when (ARTIGO[uf]) { "o" -> "no $nome"; "a" -> "na $nome"; else -> "em $nome" }
    }

    /** "por São Paulo", "pela Bahia", "pelo Distrito Federal". */
    fun por(uf: String): String {
        val nome = NOMES[uf] ?: return "por $uf"
        return when (ARTIGO[uf]) { "o" -> "pelo $nome"; "a" -> "pela $nome"; else -> "por $nome" }
    }
}

/**
 * Cargos das Eleições Gerais 2026 e regras oficiais de urna (Resoluções do TSE / consulta_vagas).
 */
enum class TseCargo(
    val codigo: String,
    val titulo: String,
    val digitos: Int,
    val ordemVotacaoNaUrna: Int,
    val descricaoTse: String
) {
    DEPUTADO_FEDERAL("DEPUTADO_FEDERAL", "Deputado Federal", 4, 1,
        "4 dígitos: os 2 primeiros identificam o partido e os 2 últimos o candidato. Sistema proporcional."),
    DEPUTADO_ESTADUAL("DEPUTADO_ESTADUAL", "Dep. Estadual / Distrital", 5, 2,
        "5 dígitos: os 2 primeiros identificam o partido e os 3 últimos o candidato. Sistema proporcional."),
    SENADOR("SENADOR", "Senador", 3, 3,
        "3 dígitos. Em 2026 cada eleitor vota em DOIS senadores diferentes (renovação de 2/3 do Senado)."),
    GOVERNADOR("GOVERNADOR", "Governador", 2, 5,
        "2 dígitos: número do partido. Majoritário absoluto, sujeito a 2º turno."),
    PRESIDENTE("PRESIDENTE", "Presidente da República", 2, 6,
        "2 dígitos: número do partido. Votação nacional, majoritário absoluto.");

    companion object {
        fun fromCodigo(codigo: String?): TseCargo? = entries.firstOrNull { it.codigo.equals(codigo, ignoreCase = true) }
    }
}

/** Código de cargo do pacote de dados -> título legível. */
fun tituloCargo(codigo: String): String = when (codigo) {
    "PRESIDENTE" -> "Presidente da República"
    "VICE_PRESIDENTE" -> "Vice-Presidente"
    "GOVERNADOR" -> "Governador"
    "VICE_GOVERNADOR" -> "Vice-Governador"
    "SENADOR" -> "Senador"
    "SUPLENTE_1" -> "1º Suplente de Senador"
    "SUPLENTE_2" -> "2º Suplente de Senador"
    "DEPUTADO_FEDERAL" -> "Deputado Federal"
    "DEPUTADO_ESTADUAL" -> "Deputado Estadual"
    "DEPUTADO_DISTRITAL" -> "Deputado Distrital"
    else -> codigo.replace('_', ' ').lowercase().replaceFirstChar { it.uppercase() }
}

/**
 * Situação do julgamento do registro de candidatura (texto oficial do TSE normalizado em enumeração estável).
 * NÃO é certidão de "Ficha Limpa": o app exibe a situação oficial e os motivos de indeferimento registrados.
 */
enum class Elegibilidade(val rotulo: String, val apta: Boolean?) {
    DEFERIDA("Candidatura deferida", true),
    DEFERIDA_COM_RECURSO("Deferida (em prazo recursal ou com recurso)", true),
    INDEFERIDA("Candidatura indeferida", false),
    INDEFERIDA_COM_RECURSO("Indeferida (em prazo recursal ou com recurso)", false),
    RENUNCIA("Renúncia", false),
    FALECIDO("Falecimento", false),
    CANCELADA("Candidatura cancelada", false),
    PENDENTE("Aguardando julgamento", null),
    NAO_CONHECIDO("Pedido não conhecido", false),
    DESCONHECIDA("Situação não informada", null);

    val indeferida: Boolean get() = this == INDEFERIDA || this == INDEFERIDA_COM_RECURSO
    val comRecurso: Boolean get() = this == DEFERIDA_COM_RECURSO || this == INDEFERIDA_COM_RECURSO

    companion object {
        fun fromWire(s: String?): Elegibilidade = entries.firstOrNull { it.name == s } ?: DESCONHECIDA
    }
}

/**
 * "Ficha Limpa" (LC 135/2010) DERIVADA da situação oficial do registro e dos motivos de indeferimento publicados
 * pelo TSE (regra determinística, documentada em docs/DATA_CONTRACT.md). A Lei da Ficha Limpa é aplicada pela
 * Justiça Eleitoral justamente no julgamento do registro: registro deferido = nenhuma inelegibilidade reconhecida.
 * NÃO é certidão: pode caber recurso, e o app mostra sempre a situação e os motivos oficiais junto.
 */
enum class FichaLimpa(val rotulo: String, val curto: String, val explicacao: String, val impedimento: Boolean?) {
    SEM_IMPEDIMENTO(
        "Sem impedimento reconhecido", "Ficha Limpa: sem impedimento",
        "Registro deferido: a Justiça Eleitoral não reconheceu inelegibilidade, inclusive as da Lei da Ficha Limpa.", false
    ),
    INELEGIVEL_FICHA_LIMPA(
        "Inelegibilidade reconhecida (LC 64/90, alterada pela Lei da Ficha Limpa)", "Ficha Limpa: inelegível",
        "Registro indeferido por inelegibilidade da LC 64/90 — a lei que reúne as hipóteses da Ficha Limpa (LC 135/2010).", true
    ),
    INELEGIVEL_CONSTITUCIONAL(
        "Inelegibilidade constitucional reconhecida (CF, art. 14)", "Inelegível (Constituição)",
        "Registro indeferido por inelegibilidade prevista na Constituição (art. 14), não pela Lei da Ficha Limpa.", true
    ),
    INDEFERIDA_OUTRO_MOTIVO(
        "Registro indeferido por outro motivo (não pela Ficha Limpa)", "Registro indeferido",
        "O registro foi indeferido, mas os motivos publicados não são inelegibilidade da Ficha Limpa.", null
    ),
    INDEFERIDA_SEM_MOTIVO(
        "Registro indeferido (motivo não detalhado nos dados abertos)", "Registro indeferido",
        "O TSE publicou o indeferimento, mas não o motivo; consulte o processo no DivulgaCandContas.", null
    ),
    AGUARDANDO(
        "Aguardando julgamento do registro", "Aguardando julgamento",
        "A Justiça Eleitoral ainda não julgou o registro desta candidatura.", null
    ),
    FORA_DA_DISPUTA(
        "Não se aplica (candidatura fora da disputa)", "Fora da disputa",
        "Renúncia, cancelamento, falecimento ou pedido não conhecido.", null
    ),
    NAO_INFORMADO("Não informado pelo TSE", "Situação não informada", "Situação do registro não publicada.", null);

    companion object {
        const val MOTIVO_FICHA_LIMPA = "inelegibilidade infraconstitucional"
        const val MOTIVO_CONSTITUCIONAL = "inelegibilidade constitucional"

        fun de(e: Elegibilidade, motivos: List<String>): FichaLimpa {
            val m = motivos.map { Texto.normalizar(it) }
            return when {
                e == Elegibilidade.DEFERIDA || e == Elegibilidade.DEFERIDA_COM_RECURSO -> SEM_IMPEDIMENTO
                e.indeferida && m.any { it.contains(MOTIVO_FICHA_LIMPA) } -> INELEGIVEL_FICHA_LIMPA
                e.indeferida && m.any { it.contains(MOTIVO_CONSTITUCIONAL) } -> INELEGIVEL_CONSTITUCIONAL
                e.indeferida && m.isNotEmpty() -> INDEFERIDA_OUTRO_MOTIVO
                e.indeferida -> INDEFERIDA_SEM_MOTIVO
                e == Elegibilidade.PENDENTE -> AGUARDANDO
                e == Elegibilidade.DESCONHECIDA -> NAO_INFORMADO
                else -> FORA_DA_DISPUTA
            }
        }
    }
}

/** Prestação de contas da campanha (arquivos abertos do TSE; "parcial"/"relatório financeiro" até a prestação final). */
data class ContasCampanha(
    val receitas: Double,
    val despesasContratadas: Double,
    val tipo: String?,
    val geradoEm: String?
)

/** Resultado oficial de um turno (somente após a publicação pelo TSE). */
data class ResultadoTurno(val votos: Long?, val percentual: Double?, val situacao: String?)

data class ResultadoCandidato(
    val situacaoTotalizacao: String? = null,
    val turnos: Map<Int, ResultadoTurno> = emptyMap()
) {
    /** Eleito conforme a totalização oficial (qualquer turno). */
    val eleito: Boolean
        get() = (listOfNotNull(situacaoTotalizacao) + turnos.values.mapNotNull { it.situacao })
            .any { it.startsWith("Eleito", ignoreCase = true) }
}

/**
 * Candidatura OFICIAL registrada no TSE (Eleições Gerais 2026).
 * Campos derivados (vezesEleito, eleitoMesmoCargo, temasPlano) são rotulados como tal na interface.
 */
data class Candidate(
    val id: String,
    val numero: String,
    val nomeUrna: String,
    val nomeCompleto: String,
    val cargoCodigo: String,
    val partido: String,
    val nomePartido: String? = null,
    val coligacao: String? = null,
    val federacao: String? = null,
    val estadoUf: String,
    val regiao: String,
    val digitosUrna: Int,
    val ordemVotacao: Int = 0,
    val foto: String? = null,
    val temFoto: Boolean = false,
    val situacao: String? = null,
    val elegibilidade: Elegibilidade = Elegibilidade.DESCONHECIDA,
    val naUrna: Boolean = true,
    val motivosIndeferimento: List<String> = emptyList(),
    val vezesEleito: Int = 0,
    val eleicoesDisputadas: Int = 0,
    val eleitoMesmoCargo: Boolean = false,
    val redesSociais: List<String> = emptyList(),
    val temPlanoGoverno: Boolean = false,
    val temasPlano: List<String> = emptyList(),
    val patrimonioDeclarado: Double? = null,
    val qtdBens: Int? = null,
    val declaraBens: Boolean? = null,
    val prestouContas: Boolean? = null,
    val substituido: Boolean = false,
    val idade: Int? = null,
    val genero: String? = null,
    val corRaca: String? = null,
    val grauInstrucao: String? = null,
    val estadoCivil: String? = null,
    val ocupacao: String? = null,
    val municipioNascimento: String? = null,
    val ufNascimento: String? = null,
    val contas: ContasCampanha? = null,
    val resultado: ResultadoCandidato? = null
) {
    val cargo: String get() = tituloCargo(cargoCodigo)

    /** Chave normalizada (sem acentos, minúscula) para busca textual rápida. */
    val chaveBusca: String = Texto.normalizar("$nomeUrna $nomeCompleto")

    val ehMajoritario: Boolean
        get() = cargoCodigo in setOf("PRESIDENTE", "VICE_PRESIDENTE", "GOVERNADOR", "VICE_GOVERNADOR", "SENADOR")

    /** Ficha Limpa derivada da situação oficial do registro (ver [FichaLimpa]). */
    val fichaLimpa: FichaLimpa get() = FichaLimpa.de(elegibilidade, motivosIndeferimento)

    /** Texto de exibição da Ficha Limpa, com a ressalva de recurso quando houver. */
    val fichaLimpaTexto: String
        get() = fichaLimpa.rotulo + if (elegibilidade.comRecurso) " — com recurso pendente" else ""
}

/** Pesquisa eleitoral registrada no TSE (PesqEle). */
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

/** Regras, calendário e estatísticas oficiais (regras.json do pacote de dados). */
data class TseRegras(
    val fonte: String,
    val licenca: String,
    val extracaoTse: String,
    val turno1: String,
    val turno2: String,
    val horarioVotacao: String,
    val ordemVotacaoUrna: List<UrnaEtapa>,
    val estatisticas: Estatisticas,
    val temas: Map<String, String>,
    val glossario: Map<String, String>
) {
    data class UrnaEtapa(
        val ordem: Int, val cargo: String, val codigo: String, val digitos: Int, val regra: String, val sistema: String
    )

    data class Estatisticas(
        val totalRegistros: Int,
        val totalNaUrna: Int,
        val porCargo: Map<String, Int>,
        val porCargoNaUrna: Map<String, Int>,
        val porUf: Map<String, Int>,
        val porPartido: Map<String, Int>,
        val porGenero: Map<String, Int>,
        val porElegibilidade: Map<String, Int>,
        val eleitosMesmoCargoAntes: Int,
        val pesquisasRegistradas: Int,
        val candidatosComPlanoGoverno: Int
    )
}

/** Fontes oficiais complementares (TREs estaduais e órgãos de acompanhamento/fiscalização). */
data class TreOficial(
    val uf: String, val estado: String, val tribunal: String, val url: String,
    val secoes: List<SecaoOficial> = emptyList()
) {
    data class SecaoOficial(val titulo: String, val url: String)
}

data class OrgaoOficial(val orgao: String, val url: String, val utilidade: String)

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

/**
 * Filtro de candidaturas. Padrão NEUTRO: sem UF presumida — a UF vem das preferências do usuário.
 * Quando [estadoUf] está definido, inclui também candidaturas nacionais (Presidente/Vice, UF "BR").
 */
data class ElectoralFilter(
    val regiao: String? = null,
    val estadoUf: String? = null,
    val cargo: String? = null,
    val apenasDeferidas: Boolean = false,
    /** Registros indeferidos (inclui inelegíveis pela Ficha Limpa); ignora "apenas na urna". */
    val apenasIndeferidas: Boolean = false,
    val apenasNaUrna: Boolean = true,
    /** Gênero declarado ao TSE ("FEMININO"/"MASCULINO"). */
    val genero: String? = null,
    val apenasEleitos: Boolean = false,
    val historico: HistoricoOpcao = HistoricoOpcao.TODOS,
    val partido: String? = null,
    val tema: String? = null,
    val buscaTexto: String? = null
)

enum class HistoricoOpcao(val label: String) {
    TODOS("Todos"),
    NUNCA_ELEITO("Nunca eleito (histórico TSE)"),
    ELEITO_MESMO_CARGO("Já eleito para este cargo"),
    ELEITO_2_OU_MAIS("Eleito 2+ vezes")
}

/** Utilidades de texto (sem dependência de Android; testáveis em JVM). */
object Texto {
    private val ACENTOS = mapOf(
        'à' to 'a', 'á' to 'a', 'â' to 'a', 'ã' to 'a', 'ä' to 'a', 'å' to 'a',
        'è' to 'e', 'é' to 'e', 'ê' to 'e', 'ë' to 'e',
        'ì' to 'i', 'í' to 'i', 'î' to 'i', 'ï' to 'i',
        'ò' to 'o', 'ó' to 'o', 'ô' to 'o', 'õ' to 'o', 'ö' to 'o',
        'ù' to 'u', 'ú' to 'u', 'û' to 'u', 'ü' to 'u', 'ç' to 'c', 'ñ' to 'n'
    )

    fun normalizar(s: String): String {
        val sb = StringBuilder(s.length)
        var ultimoEspaco = true
        for (ch in s.lowercase()) {
            val c = ACENTOS[ch] ?: ch
            if (c.isWhitespace()) {
                if (!ultimoEspaco) sb.append(' ')
                ultimoEspaco = true
            } else {
                sb.append(c)
                ultimoEspaco = false
            }
        }
        return sb.toString().trimEnd()
    }
}
