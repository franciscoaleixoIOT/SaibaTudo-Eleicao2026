package net.saibatudo.quimica.data.repository

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import net.saibatudo.quimica.data.bundle.BundleManifest
import net.saibatudo.quimica.data.bundle.BundleReader
import net.saibatudo.quimica.data.bundle.ManifestVerifier
import net.saibatudo.quimica.data.model.CompostoIndice
import net.saibatudo.quimica.data.model.Composto
import net.saibatudo.quimica.data.model.Constante
import net.saibatudo.quimica.data.model.Elemento
import net.saibatudo.quimica.data.model.Fonte
import net.saibatudo.quimica.data.model.PacoteJson
import net.saibatudo.quimica.data.model.Regras
import net.saibatudo.quimica.data.model.Trecho
import net.saibatudo.quimica.domain.Texto

/**
 * Pacote de dados carregado: o núcleo (elementos, constantes, regras, fontes, índice de compostos) fica em memória e o
 * resto (lotes de compostos, fichas ICSC, textos) é lido sob demanda do mesmo leitor (assets ou pasta baixada).
 * Quando [verificarHash] é verdadeiro, cada arquivo lido é conferido com o sha256 do manifesto assinado.
 */
class Pacote(
    val manifest: BundleManifest,
    val origem: String,
    val elementos: List<Elemento>,
    val constantes: List<Constante>,
    val regras: Regras,
    val fontes: List<Fonte>,
    val indice: CompostoIndice,
    private val reader: BundleReader,
    private val verificarHash: Boolean
) {
    val porSimbolo: Map<String, Elemento> = elementos.associateBy { it.simbolo }
    val porZ: Map<Int, Elemento> = elementos.associateBy { it.z }

    fun elemento(simbolo: String): Elemento? = porSimbolo[simbolo]
    fun constante(id: String): Constante? = constantes.firstOrNull { it.id.equals(id, ignoreCase = true) }

    private val trava = Mutex()
    private val lotes = HashMap<String, List<Composto>>()
    private var trechosCache: List<Trecho>? = null
    private var todos: List<Composto>? = null

    /** Lê um arquivo do pacote conferindo o sha256 (se exigido) contra o manifesto assinado. */
    suspend fun bytes(path: String): ByteArray = withContext(Dispatchers.IO) {
        val dados = reader.open(path).use { it.readBytes() }
        if (verificarHash) {
            val esperado = manifest.arquivo(path) ?: throw IllegalStateException("arquivo fora do manifesto: $path")
            check(ManifestVerifier.sha256Hex(dados) == esperado.sha256) { "checksum divergente em $path" }
        }
        dados
    }

    fun existe(path: String): Boolean = manifest.arquivo(path) != null

    /** Lote de compostos (cacheado). */
    suspend fun lote(lote: String): List<Composto> = trava.withLock {
        lotes[lote] ?: run {
            val caminho = PacoteJson.caminhoDoLote(lote)
            val lista = PacoteJson.compostos(PacoteJson.parse(bytes(caminho)))
            if (lotes.size >= MAX_LOTES_EM_MEMORIA) lotes.remove(lotes.keys.first())
            lotes[lote] = lista
            lista
        }
    }

    /** Ficha completa de um composto, carregando só o lote que o contém. */
    suspend fun composto(cid: Long): Composto? {
        val entrada = indice.entrada(cid) ?: return null
        return lote(entrada.lote).firstOrNull { it.cid == cid }
    }

    /** Todos os compostos do pacote (carrega todos os lotes; usado só quando o índice não traz nomes). */
    suspend fun todosOsCompostos(): List<Composto> {
        todos?.let { return it }
        val lista = indice.entradas.map { it.lote }.distinct().flatMap { lote(it) }
        trava.withLock { todos = lista }
        return lista
    }

    /** Trechos licenciados de texto (pasta textos/ do pacote), lidos uma vez. */
    suspend fun trechos(): List<Trecho> {
        trechosCache?.let { return it }
        val lista = manifest.caminhos("textos/").filter { it.endsWith(".json") }.mapNotNull { c ->
            runCatching { PacoteJson.trecho(PacoteJson.parse(bytes(c))) }.getOrNull()
        }
        trava.withLock { trechosCache = lista }
        return lista
    }

    /** Fontes para "Sobre os dados": `fontes.json` e, se faltar, as do manifesto. */
    val fontesExibicao: List<Fonte> get() = fontes.ifEmpty { manifest.sources }

    /** Chave normalizada de nome → CID (apenas nomes do índice) para a pergunta/busca. */
    fun nomeNormalizado(s: String): String = Texto.chaveNome(s)

    companion object {
        private const val MAX_LOTES_EM_MEMORIA = 12
    }
}
