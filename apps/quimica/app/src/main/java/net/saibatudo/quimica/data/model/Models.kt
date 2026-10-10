package net.saibatudo.quimica.data.model

/** Fonte de um dado (nome, endereço, licença e data de acesso), exibida em toda resposta e em "Sobre os dados". */
data class Fonte(
    val nome: String,
    val url: String? = null,
    val licenca: String? = null,
    val acessadoEm: String? = null,
    val uso: String? = null,
    val id: String? = null
) {
    /** "PubChem CID 2244 – domínio público (NIH)". */
    fun rotulo(): String = buildString {
        append(nome)
        if (!licenca.isNullOrBlank()) append(" – ").append(licenca)
    }
}

/** Categorias de elemento do contrato (docs/DATA_CONTRACT.md §2). */
enum class CategoriaElemento(val id: String, val rotulo: String, val letra: String) {
    METAL_ALCALINO("metal_alcalino", "Metal alcalino", "A"),
    METAL_ALCALINO_TERROSO("metal_alcalino_terroso", "Metal alcalino-terroso", "T"),
    METAL_TRANSICAO("metal_transicao", "Metal de transição", "M"),
    METAL_POS_TRANSICAO("metal_pos_transicao", "Metal pós-transição", "P"),
    SEMIMETAL("semimetal", "Semimetal", "S"),
    NAO_METAL("nao_metal", "Não metal", "N"),
    HALOGENIO("halogenio", "Halogênio", "H"),
    GAS_NOBRE("gas_nobre", "Gás nobre", "G"),
    LANTANIDEO("lantanideo", "Lantanídeo", "L"),
    ACTINIDEO("actinideo", "Actinídeo", "C"),
    DESCONHECIDA("desconhecida", "Categoria desconhecida", "?");

    companion object {
        fun de(id: String?): CategoriaElemento = entries.firstOrNull { it.id == id } ?: DESCONHECIDA
    }
}

enum class EstadoFisico(val id: String, val rotulo: String) {
    SOLIDO("solido", "Sólido"), LIQUIDO("liquido", "Líquido"), GAS("gas", "Gás"), DESCONHECIDO("desconhecido", "Desconhecido");

    companion object {
        fun de(id: String?): EstadoFisico = entries.firstOrNull { it.id == id } ?: DESCONHECIDO
    }
}

/** Elemento químico (118 no pacote real). Campo ausente no JSON = null aqui (nunca inventamos valor). */
data class Elemento(
    val z: Int,
    val simbolo: String,
    val nome: String,
    val nomeEn: String? = null,
    val massaAtomica: Double? = null,
    val massaAtomicaIncerteza: Double? = null,
    val grupo: Int? = null,
    val periodo: Int? = null,
    val bloco: String? = null,
    val categoria: CategoriaElemento = CategoriaElemento.DESCONHECIDA,
    val configuracaoEletronica: String? = null,
    val eletronegatividade: Double? = null,
    val raioAtomicoPm: Double? = null,
    val afinidadeEletronicaKJmol: Double? = null,
    val energiaIonizacaoKJmol: Double? = null,
    val pontoFusaoK: Double? = null,
    val pontoEbulicaoK: Double? = null,
    val densidadeKgm3: Double? = null,
    val estadoPadrao: EstadoFisico = EstadoFisico.DESCONHECIDO,
    val estadosOxidacao: List<Int> = emptyList(),
    val descobertaAno: Int? = null,
    val descobertaPor: String? = null,
    val fontes: List<Fonte> = emptyList()
)

/** Classificação GHS harmonizada (CLP/UE, Anexo VI) do composto, quando existe no dado. */
data class Ghs(
    val pictogramas: List<String> = emptyList(),
    val palavraSinal: String? = null,
    val frasesH: List<String> = emptyList(),
    /** Texto das frases H em português, se o pacote trouxer (código → texto). */
    val textosH: Map<String, String> = emptyMap(),
    val fonte: String? = null
)

/** Definição do composto no ChEBI (CC BY 4.0): sempre exibida com a atribuição. */
data class DefinicaoChebi(val texto: String, val id: String? = null, val url: String? = null, val licenca: String = "CC BY 4.0")

/** Composto (ficha completa, carregada sob demanda a partir do lote). */
data class Composto(
    val cid: Long,
    val nome: String,
    val nomePopular: String? = null,
    val nomeIupac: String? = null,
    val nomePtPendente: Boolean = false,
    val sinonimos: List<String> = emptyList(),
    val formula: String? = null,
    val formulaHill: String? = null,
    val massaMolar: Double? = null,
    val massaExata: Double? = null,
    val smiles: String? = null,
    val inchiKey: String? = null,
    val cas: String? = null,
    /** Propriedades numéricas em SI (chave do contrato → valor). */
    val propriedades: Map<String, Double> = emptyMap(),
    /** Propriedades textuais, se houver. */
    val propriedadesTexto: Map<String, String> = emptyMap(),
    val ghs: Ghs? = null,
    val classes: List<String> = emptyList(),
    val wikidata: String? = null,
    /** Busca desta substância (por CAS) no site da OIT/ICSC: o app só abre o link; nenhuma ficha é copiada. */
    val icscBuscaUrl: String? = null,
    val definicaoChebi: DefinicaoChebi? = null,
    val fontes: List<Fonte> = emptyList()
) {
    /** Nome a exibir: o nome em português; se pendente, o nome IUPAC (a interface avisa). */
    val nomeExibicao: String get() = if (nomePtPendente && !nomeIupac.isNullOrBlank()) nomeIupac else nome
}

data class Constante(
    val id: String,
    val nome: String,
    val simbolo: String? = null,
    val valor: Double,
    val unidade: String? = null,
    val incerteza: Double? = null,
    val fontes: List<Fonte> = emptyList()
)

/** Trecho licenciado de texto (explicações, retrieval). */
data class Trecho(
    val id: String,
    val fonte: String,
    val licenca: String,
    val url: String? = null,
    val capitulo: String? = null,
    val secao: String? = null,
    val titulo: String? = null,
    val textoOriginal: String? = null,
    val textoPt: String? = null,
    val traducao: String? = null,
    val palavrasChave: List<String> = emptyList()
)

/** Definição de propriedade pesquisável (regras.propriedades). `alvo`: elemento ou composto; `tipo` define a formatação. */
data class PropriedadeDef(
    val id: String,
    val rotulo: String,
    val campo: String?,
    val alvo: String = "elemento",
    val tipo: String = "texto",
    val unidade: String? = null,
    val sinonimos: List<String> = emptyList()
)

/** Unidade de medida: base = valor × fator + offset (unidade-base da grandeza). */
data class UnidadeDef(
    val grandeza: String,
    val simbolo: String,
    val nome: String? = null,
    val fator: Double,
    val offset: Double = 0.0,
    val apelidos: List<String> = emptyList(),
    /** Aceita prefixos SI (k, m, µ…): "kPa", "mmol", "nm". */
    val prefixavel: Boolean = false
)

data class PrefixoSi(val simbolo: String, val nome: String, val fator: Double)

/** Regras de autoria própria do pacote (propriedades, unidades, prefixos SI, reatividade…). */
data class Regras(
    val propriedades: List<PropriedadeDef> = emptyList(),
    val unidades: List<UnidadeDef> = emptyList(),
    val prefixos: List<PrefixoSi> = emptyList(),
    val serieReatividade: List<String> = emptyList(),
    /** Texto livre de regras de solubilidade e nomenclatura, se vierem no pacote. */
    val solubilidade: List<String> = emptyList(),
    val nomenclatura: List<String> = emptyList(),
    /** Frases H (código → texto em português), se o pacote trouxer. */
    val frasesH: Map<String, String> = emptyMap()
)

/** Entrada do índice de compostos (cid → lote) com os dados necessários para a busca. */
data class EntradaIndice(
    val cid: Long,
    val lote: String,
    val nomes: List<String> = emptyList(),
    val formula: String? = null,
    val cas: String? = null,
    val nomePtPendente: Boolean = false
)

class CompostoIndice(val entradas: List<EntradaIndice>) {
    private val porCid: Map<Long, EntradaIndice> = entradas.associateBy { it.cid }
    val tamanho: Int get() = entradas.size
    fun entrada(cid: Long): EntradaIndice? = porCid[cid]

    /** O índice traz nomes para busca? Senão a busca precisa carregar os lotes. */
    val temNomes: Boolean get() = entradas.any { it.nomes.isNotEmpty() }
}
