package net.saibatudo.eleicoes2026.ui.viewmodel

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import net.saibatudo.eleicoes2026.BuildConfig
import net.saibatudo.eleicoes2026.ai.engine.AiInferenceEngine
import net.saibatudo.eleicoes2026.ai.model.AiMenuResponse
import net.saibatudo.eleicoes2026.ai.model.OrigemResposta
import net.saibatudo.eleicoes2026.core.constants.AppConstants
import net.saibatudo.eleicoes2026.data.bundle.EstadoAtualizacao
import net.saibatudo.eleicoes2026.data.bundle.UpdateCoordinator
import net.saibatudo.eleicoes2026.data.datasource.ElectionData
import net.saibatudo.eleicoes2026.data.prefs.PreferencesStore
import net.saibatudo.eleicoes2026.data.prefs.UserPreferences
import net.saibatudo.eleicoes2026.data.remote.MelhoriaFila
import net.saibatudo.eleicoes2026.data.remote.RelatoResposta
import net.saibatudo.eleicoes2026.data.remote.ReportClient
import net.saibatudo.eleicoes2026.data.repository.ElectionDataStore
import net.saibatudo.eleicoes2026.data.repository.EstadoDados
import net.saibatudo.eleicoes2026.domain.model.ApuracaoCargo
import net.saibatudo.eleicoes2026.domain.model.ApuracaoProvider
import net.saibatudo.eleicoes2026.domain.model.Candidate
import net.saibatudo.eleicoes2026.domain.model.Datas
import net.saibatudo.eleicoes2026.domain.model.ElectoralFilter
import net.saibatudo.eleicoes2026.domain.model.FaseEleitoral
import net.saibatudo.eleicoes2026.domain.model.MenuItem
import net.saibatudo.eleicoes2026.domain.usecase.CandidateQuery
import net.saibatudo.eleicoes2026.domain.usecase.MenuFactory

enum class Tela { PRINCIPAL, CONFIGURACOES, SOBRE_DADOS }

sealed interface Dialogo {
    data class Candidato(val candidato: Candidate) : Dialogo
    data class Urna(val inicial: Candidate?) : Dialogo
    data object Pesquisas : Dialogo
    data object Fontes : Dialogo
    data object EscolherUf : Dialogo
    data object RelatarResposta : Dialogo
    data object Resultados : Dialogo
}

/** Estado da tela de resultados/apuração (consulta direta ao TSE; números exibidos como publicados). */
data class ResultadosUi(
    val cargo: String = "PRESIDENTE",
    val uf: String? = null,
    val turno: Int = 1,
    val carregando: Boolean = false,
    val apuracao: ApuracaoCargo? = null,
    val indisponivel: Boolean = false
)

data class MainUiState(
    val carregando: Boolean = true,
    val erro: String? = null,
    val dados: ElectionData? = null,
    val fase: FaseEleitoral = FaseEleitoral.PRE_ELEICAO,
    val menu: List<MenuItem> = emptyList(),
    val filtro: ElectoralFilter = ElectoralFilter(),
    val candidatos: List<Candidate> = emptyList(),
    val iaProcessando: Boolean = false,
    /** Pedido explícito à IA na nuvem em andamento / que falhou (para a resposta atual). */
    val nuvemConsultando: Boolean = false,
    val nuvemFalhou: Boolean = false,
    val resposta: AiMenuResponse? = null,
    val perguntaDaResposta: String = "",
    val sugestoes: List<String> = SUGESTOES_PADRAO,
    val menuAtivo: String? = null,
    val prefs: UserPreferences = UserPreferences(),
    val tela: Tela = Tela.PRINCIPAL,
    val dialogo: Dialogo? = null,
    val atualizacao: EstadoAtualizacao = EstadoAtualizacao.Ociosa,
    val relatoEnviado: Boolean? = null,
    val resultados: ResultadosUi = ResultadosUi()
) {
    val prefsCarregadas: Boolean get() = dados != null
    companion object {
        val SUGESTOES_PADRAO = listOf(
            "Quem disputa a Presidência?",
            "Candidatos a Governador",
            "Quantos candidatos foram registrados?",
            "Pesquisas registradas"
        )
    }
}

/**
 * Estado e lógica da tela principal (MVVM/StateFlow). A UI só observa [estado] e dispara ações.
 */
class MainViewModel(
    private val dados: ElectionDataStore,
    private val prefs: PreferencesStore,
    private val motorIa: AiInferenceEngine,
    private val atualizacoes: UpdateCoordinator,
    private val relatorios: ReportClient,
    private val apuracao: ApuracaoProvider,
    private val hoje: () -> String = { Datas.hojeBrasilia() },
    /** Captura opcional das perguntas não entendidas (null = indisponível, ex.: testes). */
    private val melhoria: MelhoriaFila? = null
) : ViewModel() {

    private val _estado = MutableStateFlow(MainUiState())
    val estado: StateFlow<MainUiState> = _estado.asStateFlow()

    /**
     * Texto da caixa de pergunta. Fica em estado do Compose (síncrono) e não no StateFlow: um campo de texto
     * alimentado por fluxo assíncrono perde a sincronia com o teclado (cursor volta, letras fora de ordem).
     */
    var consulta by mutableStateOf("")
        private set

    /** Perguntas já feitas (setas ▲/▼ da caixa). Estado do Compose, como [consulta]. */
    var historico by mutableStateOf(HistoricoPerguntas())
        private set

    private var perguntaInicialExecutada = false
    private var jobFiltro: Job? = null

    init {
        // Preferências (tema, UF padrão, etc.)
        viewModelScope.launch {
            prefs.preferencias.collectLatest { p ->
                val anterior = _estado.value.prefs
                _estado.update { it.copy(prefs = p) }
                if (historico.itens.isEmpty() && p.historicoPerguntas.isNotEmpty()) {
                    historico = HistoricoPerguntas(p.historicoPerguntas, p.historicoPerguntas.size, "")
                }
                if (_estado.value.dados != null &&
                    (anterior.ufPadrao != p.ufPadrao || anterior.filtrarPorMinhaUf != p.filtrarPorMinhaUf ||
                        anterior.mostrarApenasNaUrna != p.mostrarApenasNaUrna)
                ) {
                    aplicarFiltroPadrao(p)
                }
            }
        }
        // Dados oficiais (snapshot embutido ou atualização baixada)
        viewModelScope.launch {
            dados.estado.collectLatest { e ->
                when (e) {
                    is EstadoDados.Carregando -> _estado.update { it.copy(carregando = true, erro = null) }
                    is EstadoDados.Erro -> _estado.update { it.copy(carregando = false, erro = e.mensagem) }
                    is EstadoDados.Pronto -> aoCarregarDados(e.dados)
                }
            }
        }
        viewModelScope.launch { dados.carregar() }
        viewModelScope.launch { atualizacoes.estado.collectLatest { a -> _estado.update { it.copy(atualizacao = a) } } }
        // Verifica atualizações logo após abrir (respeita intervalo e economia de dados)
        viewModelScope.launch {
            delay(1_500)
            atualizacoes.verificar(forcar = false)
        }
    }

    // ------------------------------------------------------------------ carga de dados

    private suspend fun aoCarregarDados(d: ElectionData) {
        val p = _estado.value.prefs
        val fase = FaseEleitoral.de(hoje(), d.regras.turno1, d.regras.turno2)
        // 1ª carga: filtro padrão das preferências; recargas (atualização de dados) preservam o filtro atual
        val filtroBase = if (_estado.value.dados == null) filtroInicial(p, _estado.value.filtro) else _estado.value.filtro
        _estado.update {
            it.copy(
                carregando = false, erro = null, dados = d, fase = fase,
                menu = MenuFactory.principal(d.regras, fase, hoje()),
                filtro = filtroBase,
                candidatos = CandidateQuery.filtrar(d.candidatos, filtroBase)
            )
        }
        if (!perguntaInicialExecutada && p.onboardingConcluido && p.executarPerguntaAoAbrir && p.perguntaInicial.isNotBlank()) {
            perguntaInicialExecutada = true
            perguntar(p.perguntaInicial)
        }
    }

    private fun filtroInicial(p: UserPreferences, atual: ElectoralFilter): ElectoralFilter =
        atual.copy(estadoUf = if (p.filtrarPorMinhaUf) p.ufPadrao else null, apenasNaUrna = p.mostrarApenasNaUrna)

    private fun aplicarFiltroPadrao(p: UserPreferences) {
        val d = _estado.value.dados ?: return
        val f = filtroInicial(p, _estado.value.filtro)
        _estado.update { it.copy(filtro = f, candidatos = CandidateQuery.filtrar(d.candidatos, f)) }
    }

    // ------------------------------------------------------------------ filtros e navegação

    fun atualizarFiltro(novo: ElectoralFilter) {
        val d = _estado.value.dados ?: return
        _estado.update { it.copy(filtro = novo) }
        jobFiltro?.cancel()
        jobFiltro = viewModelScope.launch {
            val lista = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Default) { CandidateQuery.filtrar(d.candidatos, novo) }
            _estado.update { it.copy(candidatos = lista) }
        }
    }

    fun limparFiltros() {
        motorIa.limparContexto()
        val p = _estado.value.prefs
        atualizarFiltro(ElectoralFilter(apenasNaUrna = p.mostrarApenasNaUrna))
    }

    /** Chave "Meu estado": liga/desliga o recorte pela UF escolhida e persiste a preferência. */
    fun alternarMeuEstado(ligado: Boolean) {
        val uf = _estado.value.prefs.ufPadrao
        if (ligado && uf == null) {
            _estado.update { it.copy(dialogo = Dialogo.EscolherUf) }
            return
        }
        viewModelScope.launch { prefs.atualizar { it.copy(filtrarPorMinhaUf = ligado) } }
        atualizarFiltro(_estado.value.filtro.copy(estadoUf = if (ligado) uf else null))
    }

    fun escolherUfPadrao(uf: String?) {
        viewModelScope.launch { prefs.atualizar { it.copy(ufPadrao = uf, filtrarPorMinhaUf = uf != null) } }
        _estado.update { it.copy(dialogo = null) }
    }

    fun selecionarMenu(item: MenuItem) {
        motorIa.limparContexto()
        when (item.id) {
            AppConstants.MENU_PESQUISAS -> _estado.update { it.copy(menuAtivo = item.id, dialogo = Dialogo.Pesquisas) }
            AppConstants.MENU_CALENDARIO -> perguntar("Calendário eleitoral 2026")
            AppConstants.MENU_RESULTADOS -> abrirResultados()
            else -> {
                _estado.update { it.copy(menuAtivo = item.id) }
                atualizarFiltro(_estado.value.filtro.copy(cargo = item.defaultFilters["cargo"], buscaTexto = null))
            }
        }
    }

    fun abrirTela(tela: Tela) = _estado.update { it.copy(tela = tela) }
    fun voltar(): Boolean {
        val s = _estado.value
        return when {
            s.dialogo != null -> { fecharDialogo(); true }
            s.tela != Tela.PRINCIPAL -> { _estado.update { it.copy(tela = Tela.PRINCIPAL) }; true }
            else -> false
        }
    }

    fun abrirDialogo(d: Dialogo) = _estado.update { it.copy(dialogo = d) }
    fun fecharDialogo() {
        if (_estado.value.dialogo == Dialogo.Resultados) pararResultados()
        _estado.update { it.copy(dialogo = null) }
    }
    fun alterarConsulta(texto: String) {
        consulta = texto
    }

    /** Seta ▲: traz a pergunta anterior para a caixa (guarda o que estava sendo digitado). */
    fun perguntaAnterior() {
        historico.subir(consulta)?.let { (h, texto) -> historico = h; consulta = texto }
    }

    /** Seta ▼: pergunta seguinte; depois da última, volta ao que estava digitado (vazio se nada foi escrito). */
    fun perguntaSeguinte() {
        historico.descer()?.let { (h, texto) -> historico = h; consulta = texto }
    }

    /** Limpa o histórico de perguntas salvas no aparelho. */
    fun limparHistorico() {
        historico = HistoricoPerguntas()
        viewModelScope.launch {
            prefs.atualizar { it.copy(historicoPerguntas = emptyList()) }
        }
    }

    fun fecharResposta() {
        motorIa.limparContexto()
        _estado.update { it.copy(resposta = null) }
    }

    // ------------------------------------------------------------------ IA

    fun perguntar(texto: String) {
        val pergunta = texto.trim()
        if (pergunta.isEmpty() || _estado.value.iaProcessando) return
        // A pergunta sobe para o histórico e a caixa fica livre para a próxima (o contexto da conversa já é mantido).
        // Se veio de sugestão/menu, o que o usuário estava digitando é preservado.
        if (consulta.trim() == pergunta) consulta = ""
        val novoHist = historico.registrar(pergunta)
        historico = novoHist
        viewModelScope.launch {
            prefs.atualizar { it.copy(historicoPerguntas = novoHist.itens) }
        }
        _estado.update { it.copy(iaProcessando = true) }
        viewModelScope.launch {
            val resposta = try {
                motorIa.parseUserQuery(pergunta)
            } catch (e: Exception) {
                AiMenuResponse(
                    targetRoute = "menu/home", menuId = AppConstants.MENU_HOME,
                    directAnswer = "Não foi possível responder agora. Tente novamente ou use os filtros abaixo.",
                    resolvida = false
                )
            }
            aplicarResposta(pergunta, resposta)
            // captura opcional (consentimento próprio): só perguntas que o app NÃO entendeu, nunca as respondidas
            if (!resposta.resolvida && melhoria != null) {
                try {
                    if (melhoria.enfileirar(pergunta)) melhoria.enviarSePreciso()
                } catch (_: Exception) { /* a captura nunca pode atrapalhar a resposta */ }
            }
        }
    }

    /**
     * Botão "Perguntar à IA na nuvem" (consentimento só para esta pergunta): envia a pergunta que o NLU local não
     * entendeu. Sucesso ⇒ substitui a resposta; falha/timeout ⇒ mantém a resposta e avisa.
     */
    fun perguntarNaNuvem() {
        val s = _estado.value
        val r = s.resposta ?: return
        if (s.nuvemConsultando || r.origem == OrigemResposta.NUVEM || r.origem == OrigemResposta.GENERATIVA) return
        val pergunta = s.perguntaDaResposta
        _estado.update { it.copy(nuvemConsultando = true, nuvemFalhou = false) }
        viewModelScope.launch {
            val nova = try { motorIa.perguntarNaNuvem(pergunta, r) } catch (_: Exception) { null }
            if (nova == null) _estado.update { it.copy(nuvemConsultando = false, nuvemFalhou = true) }
            else aplicarResposta(pergunta, nova)
        }
    }

    private suspend fun aplicarResposta(pergunta: String, resposta: AiMenuResponse) {
        run {
            val d = _estado.value.dados
            val base = if (resposta.filters.resetar) ElectoralFilter(apenasNaUrna = _estado.value.prefs.mostrarApenasNaUrna)
            else _estado.value.filtro
            val f = base.copy(
                cargo = resposta.filters.cargo ?: if (resposta.filters.resetar) null else base.cargo,
                estadoUf = resposta.filters.estadoUf ?: if (resposta.filters.resetar) null else base.estadoUf,
                partido = resposta.filters.partido ?: if (resposta.filters.resetar) null else base.partido,
                tema = resposta.filters.tema ?: if (resposta.filters.resetar) null else base.tema,
                buscaTexto = resposta.filters.buscaTexto ?: if (resposta.filters.resetar) null else base.buscaTexto,
                apenasDeferidas = resposta.filters.apenasDeferidas ?: base.apenasDeferidas,
                apenasIndeferidas = resposta.filters.apenasIndeferidas ?: base.apenasIndeferidas,
                apenasEleitos = resposta.filters.apenasEleitos ?: base.apenasEleitos,
                historico = resposta.filters.historico ?: base.historico,
                genero = resposta.filters.genero ?: if (resposta.filters.resetar) null else base.genero
            ).let { x ->
                // "deferidas" e "indeferidas" são excludentes: vale o que a resposta pediu
                when {
                    resposta.filters.apenasIndeferidas == true -> x.copy(apenasDeferidas = false)
                    resposta.filters.apenasDeferidas == true -> x.copy(apenasIndeferidas = false)
                    else -> x
                }
            }
            val lista = if (d != null) kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Default) {
                CandidateQuery.filtrar(d.candidatos, f)
            } else emptyList()
            val simulador = if (resposta.abrirSimulador && d != null)
                Dialogo.Urna(resposta.candidateIds.firstNotNullOfOrNull { id -> d.porId[id] }) else null
            _estado.update {
                it.copy(
                    iaProcessando = false, nuvemConsultando = false, nuvemFalhou = false,
                    resposta = resposta, perguntaDaResposta = pergunta, menuAtivo = resposta.menuId,
                    filtro = f, candidatos = lista,
                    sugestoes = resposta.suggestedQuestions.ifEmpty { MainUiState.SUGESTOES_PADRAO },
                    relatoEnviado = null,
                    dialogo = simulador ?: it.dialogo
                )
            }
        }
    }

    fun relatarResposta(comentario: String) {
        val s = _estado.value
        val r = s.resposta ?: return
        viewModelScope.launch {
            val ok = relatorios.enviar(
                RelatoResposta(
                    pergunta = s.perguntaDaResposta, resposta = r.directAnswer.orEmpty(), intencao = r.intent.name,
                    origem = r.origem.name, versaoDados = s.dados?.manifest?.dataVersion,
                    versaoApp = BuildConfig.VERSION_NAME, comentario = comentario
                )
            )
            _estado.update { it.copy(relatoEnviado = ok, dialogo = if (ok) null else it.dialogo) }
        }
    }

    // ------------------------------------------------------------------ resultados / apuração (ao vivo)

    private var jobResultados: Job? = null

    fun abrirResultados(cargo: String? = null, uf: String? = null) {
        val c = cargo ?: _estado.value.resultados.cargo
        val ufEscolhida = if (c == "PRESIDENTE") "BR" else (uf ?: _estado.value.resultados.uf?.takeIf { it != "BR" }
            ?: _estado.value.prefs.ufPadrao ?: "SP")
        val cargoFinal = if (ufEscolhida == "DF" && c == "DEPUTADO_ESTADUAL") "DEPUTADO_DISTRITAL"
        else if (ufEscolhida != "DF" && c == "DEPUTADO_DISTRITAL") "DEPUTADO_ESTADUAL"
        else c
        val ehLegislativo = cargoFinal in setOf("SENADOR", "DEPUTADO_FEDERAL", "DEPUTADO_ESTADUAL", "DEPUTADO_DISTRITAL")
        val turno = if (ehLegislativo || _estado.value.fase == FaseEleitoral.PRE_ELEICAO || _estado.value.fase == FaseEleitoral.DIA_1T) 1
        else _estado.value.resultados.turno
        _estado.update { it.copy(dialogo = Dialogo.Resultados, resultados = it.resultados.copy(cargo = cargoFinal, uf = ufEscolhida, turno = turno)) }
        iniciarResultados()
    }

    fun selecionarResultados(cargo: String = _estado.value.resultados.cargo, uf: String? = _estado.value.resultados.uf, turno: Int = _estado.value.resultados.turno) {
        val ufFinal = if (cargo == "PRESIDENTE") "BR" else (uf?.takeIf { it != "BR" } ?: _estado.value.prefs.ufPadrao ?: "SP")
        val cargoFinal = if (ufFinal == "DF" && cargo == "DEPUTADO_ESTADUAL") "DEPUTADO_DISTRITAL"
        else if (ufFinal != "DF" && cargo == "DEPUTADO_DISTRITAL") "DEPUTADO_ESTADUAL"
        else cargo
        val ehLegislativo = cargoFinal in setOf("SENADOR", "DEPUTADO_FEDERAL", "DEPUTADO_ESTADUAL", "DEPUTADO_DISTRITAL")
        val turnoFinal = if (ehLegislativo) 1 else turno
        _estado.update { it.copy(resultados = it.resultados.copy(cargo = cargoFinal, uf = ufFinal, turno = turnoFinal, apuracao = null, indisponivel = false)) }
        iniciarResultados()
    }

    private fun iniciarResultados() {
        jobResultados?.cancel()
        jobResultados = viewModelScope.launch {
            while (true) {
                val r = _estado.value.resultados
                _estado.update { it.copy(resultados = it.resultados.copy(carregando = true)) }
                val ap = try { apuracao.obter(r.cargo, r.uf ?: "BR", r.turno) } catch (_: Exception) { null }
                _estado.update { it.copy(resultados = it.resultados.copy(carregando = false, apuracao = ap ?: it.resultados.apuracao, indisponivel = ap == null)) }
                delay(60_000) // o servidor do TSE atualiza em ~1 a 3 min; respeitamos o cache de 60 s
            }
        }
    }

    private fun pararResultados() {
        jobResultados?.cancel()
        jobResultados = null
    }

    // ------------------------------------------------------------------ preferências e atualização

    fun atualizarPreferencias(transformacao: (UserPreferences) -> UserPreferences) {
        viewModelScope.launch { prefs.atualizar(transformacao) }
    }

    fun concluirOnboarding(uf: String?, iaNuvem: Boolean) {
        viewModelScope.launch {
            prefs.atualizar {
                it.copy(onboardingConcluido = true, ufPadrao = uf, filtrarPorMinhaUf = uf != null, iaNuvem = iaNuvem)
            }
        }
    }

    fun atualizarDadosAgora() {
        viewModelScope.launch { atualizacoes.verificar(forcar = true) }
    }

    fun verificarAtualizacaoAoRetomar() {
        viewModelScope.launch { atualizacoes.verificar(forcar = false) }
    }

    // ------------------------------------------------------------------ utilidades

    val onboardingConcluido: StateFlow<Boolean?> get() = _onboarding
    private val _onboarding = MutableStateFlow<Boolean?>(null)

    init {
        viewModelScope.launch {
            prefs.preferencias.map { it.onboardingConcluido }.distinctUntilChanged().collectLatest { _onboarding.value = it }
        }
    }
}
