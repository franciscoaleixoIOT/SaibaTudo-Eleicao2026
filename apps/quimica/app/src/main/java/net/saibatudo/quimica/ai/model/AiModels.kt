package net.saibatudo.quimica.ai.model

import net.saibatudo.quimica.data.model.Fonte
import net.saibatudo.quimica.data.model.Ghs

/**
 * Intenções reconhecidas (docs/DATA_CONTRACT.md §8). O NLU só produz uma [ParsedQuery]; TODA resposta factual é montada
 * pelo AnswerBuilder a partir dos dados do pacote ou de cálculo local.
 */
enum class Intent {
    ELEMENTO,
    COMPOSTO,
    PROPRIEDADE,
    MASSA_MOLAR,
    BALANCEAR,
    ESTEQUIOMETRIA,
    CONCENTRACAO,
    PH,
    GAS_IDEAL,
    CONVERSAO_UNIDADE,
    NOMENCLATURA,
    DESENHAR,
    COMPARAR,
    TABELA_PERIODICA,
    SEGURANCA,
    CONCEITO,
    RECUSA_PERIGO,
    SOBRE_DADOS,
    FONTES,
    AJUDA,
    DESCONHECIDA
}

/** Quantidade lida da pergunta: valor, unidade (símbolo) e o trecho original ("25 °C"). */
data class Quantidade(val valor: Double, val unidade: String, val texto: String = "")

/** Interpretação estruturada de uma pergunta (entidades do contrato §8 e campos auxiliares; mesmos nomes do site). */
data class ParsedQuery(
    val intent: Intent,
    val textoOriginal: String = "",
    /** Símbolo do elemento (ex.: "Fe") e todos os elementos citados, na ordem. */
    val elemento: String? = null,
    val elementos: List<String> = emptyList(),
    /** Composto: CID (como texto) quando está no índice; [compostos] traz todos os citados. */
    val composto: String? = null,
    val compostoNome: String? = null,
    val compostos: List<String> = emptyList(),
    /** Fórmula digitada fora do índice (ex.: "Ca(OH)2") e todas as fórmulas citadas. */
    val formula: String? = null,
    val formulas: List<String> = emptyList(),
    /** Id de `regras.propriedades` (ex.: "pontoFusao") e todos os ids citados. */
    val propriedade: String? = null,
    val propriedades: List<String> = emptyList(),
    val quantidades: List<Quantidade> = emptyList(),
    val equacao: String? = null,
    val nivel: String? = null,
    val unidadeDestino: String? = null,
    /** Assunto de CONCEITO. */
    val conceito: String? = null,
    // ---- tabela periódica ----
    val grupo: Int? = null,
    val periodo: Int? = null,
    val bloco: String? = null,
    val categoria: String? = null,
    val estado: String? = null,
    /** Extremo pedido: (propriedade, "max" ou "min"). */
    val extremo: Pair<String, String>? = null,
    val tendencia: Boolean = false,
    // ---- outros ----
    val mistura: Boolean = false,
    /** Ka, Kb, pKa e pKb citados na pergunta. */
    val constantes: Map<String, Double> = emptyMap(),
    val alvoPropriedade: String? = null,
    /** A entidade veio da pergunta anterior ("e o ponto de ebulição?"). */
    val herdado: Boolean = false
)

enum class OrigemResposta(val rotulo: String) {
    LOCAL("Resposta local • dados do pacote"),
    AVISO("Aviso")
}

/** Calculadoras do app, para os atalhos "Abrir calculadora". */
enum class TipoCalculadora(val rotulo: String) {
    MASSA_MOLAR("Massa molar"),
    BALANCEAMENTO("Balanceamento"),
    ESTEQUIOMETRIA("Estequiometria"),
    CONCENTRACAO("Concentração e diluição"),
    PH("pH de ácidos e bases"),
    GAS_IDEAL("Gás ideal"),
    UNIDADES("Conversão de unidades")
}

sealed interface Bloco {
    data class Paragrafo(val texto: String) : Bloco
    data class Campo(val rotulo: String, val valor: String) : Bloco
    data class Lista(val itens: List<String>) : Bloco
    data class Passos(val titulo: String, val passos: List<String>) : Bloco
    /** Equação ou fórmula em destaque (já em Unicode). */
    data class Destaque(val texto: String) : Bloco
    data class Estrutura(val smiles: String, val descricao: String) : Bloco
    data class Aviso(val texto: String) : Bloco
    data class GhsBloco(val ghs: Ghs, val textosH: Map<String, String>) : Bloco
}

sealed interface Acao {
    val rotulo: String
    data class AbrirElemento(val z: Int, override val rotulo: String) : Acao
    data class AbrirComposto(val cid: Long, override val rotulo: String) : Acao
    data class AbrirCalculadora(val tipo: TipoCalculadora, override val rotulo: String, val preenchimento: Map<String, String> = emptyMap()) : Acao
    data class AbrirTabela(override val rotulo: String = "Abrir a tabela periódica") : Acao
    data class AbrirSobreDados(override val rotulo: String = "Abrir \"Sobre os dados\"") : Acao
    data class AbrirSeguranca(override val rotulo: String = "Entender o GHS e os pictogramas") : Acao
    data class AbrirUrl(val url: String, override val rotulo: String) : Acao
}

/** Resposta pronta para exibir: texto estruturado, fontes e atalhos. Nenhum número aqui vem de modelo de linguagem. */
data class Resposta(
    val intent: Intent,
    val titulo: String,
    val blocos: List<Bloco>,
    val fontes: List<Fonte> = emptyList(),
    val origem: OrigemResposta = OrigemResposta.LOCAL,
    val acoes: List<Acao> = emptyList(),
    /** Perguntas que o app sabe responder (no fluxo de "não entendi" e nas respostas parciais). */
    val sugestoes: List<String> = emptyList(),
    val recusa: Boolean = false,
    /** false = o app não entendeu ou não tem o dado. */
    val entendida: Boolean = true
) {
    /** Texto simples (testes, acessibilidade e compartilhamento): título, blocos e fontes. */
    fun texto(): String = buildString {
        append(titulo)
        for (b in blocos) {
            append('\n')
            when (b) {
                is Bloco.Paragrafo -> append(b.texto)
                is Bloco.Campo -> append(b.rotulo).append(": ").append(b.valor)
                is Bloco.Lista -> append(b.itens.joinToString("\n") { "• $it" })
                is Bloco.Passos -> append(b.titulo).append('\n').append(b.passos.joinToString("\n") { "• $it" })
                is Bloco.Destaque -> append(b.texto)
                is Bloco.Estrutura -> append("Estrutura 2D: ").append(b.descricao)
                is Bloco.Aviso -> append(b.texto)
                is Bloco.GhsBloco -> {
                    append("GHS: ").append(b.ghs.pictogramas.joinToString(", "))
                    b.ghs.palavraSinal?.let { append(" – ").append(it) }
                    if (b.ghs.frasesH.isNotEmpty()) append('\n').append(b.ghs.frasesH.joinToString("; ") { c -> c + (b.textosH[c]?.let { t -> " ($t)" } ?: "") })
                }
            }
        }
        if (fontes.isNotEmpty()) append("\nFonte: ").append(fontes.joinToString("; ") { it.rotulo() })
    }
}
