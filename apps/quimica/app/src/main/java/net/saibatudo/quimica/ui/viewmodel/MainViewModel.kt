package net.saibatudo.quimica.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import net.saibatudo.quimica.ai.answer.AnswerBuilder
import net.saibatudo.quimica.ai.answer.sugestoes
import net.saibatudo.quimica.ai.model.Acao
import net.saibatudo.quimica.ai.model.Intent
import net.saibatudo.quimica.ai.model.ParsedQuery
import net.saibatudo.quimica.ai.model.Resposta
import net.saibatudo.quimica.ai.model.TipoCalculadora
import net.saibatudo.quimica.ai.nlu.Dicionario
import net.saibatudo.quimica.ai.nlu.ResultadoBusca
import net.saibatudo.quimica.data.bundle.EstadoAtualizacao
import net.saibatudo.quimica.data.bundle.UpdateCoordinator
import net.saibatudo.quimica.data.bundle.UpdateResult
import net.saibatudo.quimica.data.model.Composto
import net.saibatudo.quimica.data.prefs.Nivel
import net.saibatudo.quimica.data.prefs.PreferencesStore
import net.saibatudo.quimica.data.prefs.TamanhoFonte
import net.saibatudo.quimica.data.prefs.TemaApp
import net.saibatudo.quimica.data.prefs.UserPreferences
import net.saibatudo.quimica.data.repository.EstadoDados
import net.saibatudo.quimica.data.repository.Pacote
import net.saibatudo.quimica.data.repository.QuimicaDataStore

/** Telas do app. As cinco primeiras são as abas; as demais são empilhadas por cima. */
sealed interface Tela {
    data object Inicio : Tela
    data object Tabela : Tela
    data object Busca : Tela
    data object Calculadoras : Tela
    data object Mais : Tela
    data object Seguranca : Tela
    data object Sobre : Tela
    data object Privacidade : Tela
    data object Configuracoes : Tela
    data class Elemento(val z: Int) : Tela
    data class Composto(val cid: Long) : Tela
    data class Calculadora(val tipo: TipoCalculadora, val preenchimento: Map<String, String> = emptyMap()) : Tela
}

/** A aba (raiz) a que a tela pertence, para marcar a barra de navegação. */
fun Tela.aba(): Tela = when (this) {
    Tela.Inicio, Tela.Tabela, Tela.Busca, Tela.Calculadoras, Tela.Mais -> this
    is Tela.Elemento -> Tela.Tabela
    is Tela.Composto -> Tela.Busca
    is Tela.Calculadora -> Tela.Calculadoras
    Tela.Seguranca, Tela.Sobre, Tela.Privacidade, Tela.Configuracoes -> Tela.Mais
}

data class RespostaUi(val pergunta: String, val resposta: Resposta)

data class UiState(
    val dados: EstadoDados = EstadoDados.Carregando,
    val prefs: UserPreferences = UserPreferences(),
    val atualizacao: EstadoAtualizacao = EstadoAtualizacao.Ociosa,
    val resposta: RespostaUi? = null,
    val pensando: Boolean = false,
    val sugestoes: List<String> = emptyList()
)

class MainViewModel(
    private val dados: QuimicaDataStore,
    private val prefs: PreferencesStore,
    private val atualizacoes: UpdateCoordinator
) : ViewModel() {

    private val _pilha = MutableStateFlow<List<Tela>>(listOf(Tela.Inicio))
    val pilha: StateFlow<List<Tela>> = _pilha

    private val _resposta = MutableStateFlow<RespostaUi?>(null)
    private val _pensando = MutableStateFlow(false)
    private val _sugestoes = MutableStateFlow<List<String>>(emptyList())
    private var contexto: ParsedQuery? = null

    /** Dicionário e montador de respostas do pacote em uso; reconstruídos quando o pacote ou o nível mudam. */
    @Volatile private var dicionarioAtual: Pair<Pacote, Dicionario>? = null
    @Volatile private var construtor: AnswerBuilder? = null
    @Volatile private var nivelDoConstrutor: Nivel? = null

    private val base = combine(dados.estado, prefs.preferencias, atualizacoes.estado, _resposta, _pensando) { d, p, a, r, pe ->
        UiState(dados = d, prefs = p, atualizacao = a, resposta = r, pensando = pe)
    }

    val estado: StateFlow<UiState> = combine(base, _sugestoes) { b, s -> b.copy(sugestoes = s) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), UiState())

    init {
        viewModelScope.launch { dados.carregar() }
        // quando o pacote muda (atualização ativada), descarta o que dependia do anterior
        viewModelScope.launch {
            dados.estado.collect { e ->
                if (e is EstadoDados.Pronto && dicionarioAtual?.first !== e.pacote) {
                    dicionarioAtual = null
                    construtor = null
                    _sugestoes.value = emptyList()
                    prepararSugestoes()
                }
            }
        }
    }

    // ---- navegação ---------------------------------------------------------------------------------------------------------------

    fun abrir(tela: Tela) = _pilha.update { it + tela }

    /** Troca de aba: a pilha volta a ter só a raiz escolhida. */
    fun irParaAba(aba: Tela) { _pilha.value = listOf(aba) }

    /** Volta uma tela; false se já estava na raiz. */
    fun voltar(): Boolean {
        if (_pilha.value.size <= 1) return false
        _pilha.update { it.dropLast(1) }
        return true
    }

    fun executar(acao: Acao, abrirUrl: (String) -> Unit) {
        when (acao) {
            is Acao.AbrirElemento -> abrir(Tela.Elemento(acao.z))
            is Acao.AbrirComposto -> abrir(Tela.Composto(acao.cid))
            is Acao.AbrirCalculadora -> abrir(Tela.Calculadora(acao.tipo, acao.preenchimento))
            is Acao.AbrirTabela -> irParaAba(Tela.Tabela)
            is Acao.AbrirSobreDados -> abrir(Tela.Sobre)
            is Acao.AbrirSeguranca -> abrir(Tela.Seguranca)
            is Acao.AbrirUrl -> abrirUrl(acao.url)
        }
    }

    // ---- perguntas ---------------------------------------------------------------------------------------------------------------

    private suspend fun montador(): AnswerBuilder? {
        val pacote = (dados.estado.value as? EstadoDados.Pronto)?.pacote ?: return null
        val nivel = prefs.atual().nivel
        construtor?.let { if (nivelDoConstrutor == nivel && dicionarioAtual?.first === pacote) return it }
        val dic = dicionarioAtual?.takeIf { it.first === pacote }?.second
            ?: withContext(Dispatchers.Default) { Dicionario.criar(pacote) }.also { dicionarioAtual = pacote to it }
        return AnswerBuilder(pacote, dic, nivel).also { construtor = it; nivelDoConstrutor = nivel }
    }

    private fun prepararSugestoes() {
        viewModelScope.launch {
            val b = withContext(Dispatchers.Default) { montador() } ?: return@launch
            _sugestoes.value = withContext(Dispatchers.Default) { runCatching { b.sugestoes(8) }.getOrDefault(emptyList()) }
        }
    }

    fun perguntar(texto: String) {
        val pergunta = texto.trim()
        if (pergunta.isEmpty()) return
        viewModelScope.launch {
            _pensando.value = true
            try {
                val b = withContext(Dispatchers.Default) { montador() }
                if (b == null) {
                    _resposta.value = null
                    return@launch
                }
                val (q, r) = withContext(Dispatchers.Default) { b.responder(pergunta, contexto) }
                if (r.entendida && q.intent !in META) contexto = q
                _resposta.value = RespostaUi(pergunta, r)
                prefs.atualizar { p -> p.copy(historicoPerguntas = (p.historicoPerguntas.filter { it != pergunta } + pergunta).takeLast(30)) }
            } finally {
                _pensando.value = false
            }
        }
    }

    fun limparResposta() { _resposta.value = null }

    fun limparHistorico() { viewModelScope.launch { prefs.atualizar { it.copy(historicoPerguntas = emptyList()) } } }

    // ---- consultas para as telas --------------------------------------------------------------------------------------------------

    fun pacote(): Pacote? = (dados.estado.value as? EstadoDados.Pronto)?.pacote

    suspend fun composto(cid: Long): Composto? = withContext(Dispatchers.Default) { pacote()?.composto(cid) }

    suspend fun buscar(consulta: String): List<ResultadoBusca> = withContext(Dispatchers.Default) {
        montador()
        dicionarioAtual?.second?.buscar(consulta).orEmpty()
    }

    // ---- preferências e atualização ----------------------------------------------------------------------------------------------

    fun definirTema(t: TemaApp) { viewModelScope.launch { prefs.atualizar { it.copy(tema = t) } } }
    fun definirFonte(f: TamanhoFonte) { viewModelScope.launch { prefs.atualizar { it.copy(tamanhoFonte = f) } } }
    fun definirNivel(n: Nivel) { viewModelScope.launch { prefs.atualizar { it.copy(nivel = n) }; _resposta.value = null } }
    fun definirEconomia(v: Boolean) { viewModelScope.launch { prefs.atualizar { it.copy(economiaDeDados = v) } } }

    fun atualizarAgora() { viewModelScope.launch { atualizacoes.verificar(forcar = true) } }

    /** Ao voltar para o app, confere se há dados novos (respeita o intervalo do manifesto e a economia de dados). */
    fun verificarAtualizacaoAoRetomar() { viewModelScope.launch { atualizacoes.verificar(forcar = false) } }

    companion object {
        private val META = setOf(Intent.AJUDA, Intent.SOBRE_DADOS, Intent.FONTES, Intent.RECUSA_PERIGO, Intent.DESCONHECIDA)

        fun descreverResultado(r: UpdateResult): String = when (r) {
            UpdateResult.UpToDate -> "Os dados já estão na versão mais recente."
            is UpdateResult.Updated -> "Dados atualizados para a versão ${r.dataVersion}."
            is UpdateResult.Skipped -> "Nada a fazer agora: ${r.motivo}."
            is UpdateResult.Failed -> "Não foi possível atualizar: ${r.erro}."
        }
    }
}
