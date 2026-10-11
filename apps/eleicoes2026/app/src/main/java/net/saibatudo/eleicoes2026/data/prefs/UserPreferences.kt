package net.saibatudo.eleicoes2026.data.prefs

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.util.UUID

enum class TemaApp(val rotulo: String) { SISTEMA("Seguir o sistema"), CLARO("Claro"), ESCURO("Escuro") }

enum class TamanhoFonte(val rotulo: String, val fator: Float) {
    PEQUENA("Pequena", 0.9f), NORMAL("Normal", 1f), GRANDE("Grande", 1.15f), MUITO_GRANDE("Muito grande", 1.3f)
}

/**
 * Preferências do usuário (armazenadas apenas no aparelho).
 * Nada aqui é enviado a servidores, exceto o consentimento [iaNuvem] que habilita o envio do TEXTO das perguntas
 * ao NLU na nuvem; o [idInstalacao] é aleatório (não identifica a pessoa) e só acompanha essas chamadas.
 */
data class UserPreferences(
    val onboardingConcluido: Boolean = false,
    val tema: TemaApp = TemaApp.SISTEMA,
    val tamanhoFonte: TamanhoFonte = TamanhoFonte.NORMAL,
    /** UF escolhida pelo usuário ("meu estado"); pode ter sido sugerida pela localização aproximada (só a sigla é guardada). */
    val ufPadrao: String? = null,
    /** Chave "Meu estado": quando ligada e [ufPadrao] definida, as listas começam filtradas pela UF. */
    val filtrarPorMinhaUf: Boolean = true,
    /** Pergunta inicial padrão (opcional). Vazio = nenhuma. */
    val perguntaInicial: String = "",
    val executarPerguntaAoAbrir: Boolean = false,
    val mostrarApenasNaUrna: Boolean = true,
    /** Economia de dados: atualiza dados só em Wi-Fi/rede sem franquia e não baixa fotos pela rede móvel. */
    val economiaDeDados: Boolean = false,
    /** Consentimento para enviar o texto de perguntas não compreendidas ao NLU na nuvem. */
    val iaNuvem: Boolean = false,
    /**
     * "Ajudar a melhorar o app": OPT-IN, desligado por padrão e só oferecido quando o pacote de dados assinado liga
     * cliente.melhoria.enabled. Envia as perguntas que o app não entendeu (ver data/remote/MelhoriaClient.kt).
     */
    val melhoria: Boolean = false,
    /** Perguntas não entendidas aguardando envio (só se [melhoria] estiver ligada; apagadas ao desligar). */
    val filaMelhoria: List<String> = emptyList(),
    val idInstalacao: String? = null,
    val ultimaVerificacaoDados: Long = 0L,
    val ultimaVersaoDados: String? = null,
    val historicoPerguntas: List<String> = emptyList()
)

/** Armazenamento de preferências (interface para permitir testes sem Android). */
interface PreferencesStore {
    val preferencias: Flow<UserPreferences>
    suspend fun atual(): UserPreferences = preferencias.first()
    suspend fun atualizar(transformacao: (UserPreferences) -> UserPreferences)
    /** ID aleatório de instalação, criado sob demanda. */
    suspend fun idInstalacao(): String {
        atual().idInstalacao?.let { return it }
        val novo = UUID.randomUUID().toString()
        atualizar { it.copy(idInstalacao = it.idInstalacao ?: novo) }
        return atual().idInstalacao ?: novo
    }
}

private val Context.preferenciasDataStore by preferencesDataStore(name = "preferencias_saibatudo")

class DataStorePreferences(private val context: Context) : PreferencesStore {
    private object K {
        val onboarding = booleanPreferencesKey("onboarding_concluido")
        val tema = stringPreferencesKey("tema")
        val fonte = stringPreferencesKey("tamanho_fonte")
        val uf = stringPreferencesKey("uf_padrao")
        val filtrarUf = booleanPreferencesKey("filtrar_minha_uf")
        val pergunta = stringPreferencesKey("pergunta_inicial")
        val executar = booleanPreferencesKey("executar_pergunta_ao_abrir")
        val naUrna = booleanPreferencesKey("apenas_na_urna")
        val economia = booleanPreferencesKey("economia_de_dados")
        val ia = booleanPreferencesKey("ia_nuvem")
        val melhoria = booleanPreferencesKey("melhoria")
        val filaMelhoria = stringPreferencesKey("fila_melhoria")
        val iid = stringPreferencesKey("id_instalacao")
        val verif = longPreferencesKey("ultima_verificacao_dados")
        val versao = stringPreferencesKey("ultima_versao_dados")
        val historico = stringPreferencesKey("historico_perguntas")
    }

    override val preferencias: Flow<UserPreferences> = context.preferenciasDataStore.data.map { p -> ler(p) }

    private fun ler(p: Preferences) = UserPreferences(
        onboardingConcluido = p[K.onboarding] ?: false,
        tema = p[K.tema]?.let { n -> TemaApp.entries.firstOrNull { it.name == n } } ?: TemaApp.SISTEMA,
        tamanhoFonte = p[K.fonte]?.let { n -> TamanhoFonte.entries.firstOrNull { it.name == n } } ?: TamanhoFonte.NORMAL,
        ufPadrao = p[K.uf],
        filtrarPorMinhaUf = p[K.filtrarUf] ?: true,
        perguntaInicial = p[K.pergunta].orEmpty(),
        executarPerguntaAoAbrir = p[K.executar] ?: false,
        mostrarApenasNaUrna = p[K.naUrna] ?: true,
        economiaDeDados = p[K.economia] ?: false,
        iaNuvem = p[K.ia] ?: false,
        melhoria = p[K.melhoria] ?: false,
        filaMelhoria = p[K.filaMelhoria]?.let { raw ->
            try {
                com.google.gson.Gson().fromJson(raw, Array<String>::class.java)?.toList()
            } catch (_: Exception) { null }
        } ?: emptyList(),
        idInstalacao = p[K.iid],
        ultimaVerificacaoDados = p[K.verif] ?: 0L,
        ultimaVersaoDados = p[K.versao],
        historicoPerguntas = p[K.historico]?.let { raw ->
            try {
                com.google.gson.Gson().fromJson(raw, Array<String>::class.java)?.toList()
            } catch (_: Exception) { null }
        } ?: emptyList()
    )

    override suspend fun atualizar(transformacao: (UserPreferences) -> UserPreferences) {
        context.preferenciasDataStore.edit { p ->
            val novo = transformacao(ler(p))
            p[K.onboarding] = novo.onboardingConcluido
            p[K.tema] = novo.tema.name
            p[K.fonte] = novo.tamanhoFonte.name
            if (novo.ufPadrao != null) p[K.uf] = novo.ufPadrao else p.remove(K.uf)
            p[K.filtrarUf] = novo.filtrarPorMinhaUf
            p[K.pergunta] = novo.perguntaInicial
            p[K.executar] = novo.executarPerguntaAoAbrir
            p[K.naUrna] = novo.mostrarApenasNaUrna
            p[K.economia] = novo.economiaDeDados
            p[K.ia] = novo.iaNuvem
            p[K.melhoria] = novo.melhoria
            // a fila só existe com a opção ligada: desligar apaga o que não foi enviado
            if (novo.melhoria && novo.filaMelhoria.isNotEmpty()) {
                p[K.filaMelhoria] = com.google.gson.Gson().toJson(novo.filaMelhoria.takeLast(30))
            } else {
                p.remove(K.filaMelhoria)
            }
            if (novo.idInstalacao != null) p[K.iid] = novo.idInstalacao else p.remove(K.iid)
            p[K.verif] = novo.ultimaVerificacaoDados
            if (novo.ultimaVersaoDados != null) p[K.versao] = novo.ultimaVersaoDados else p.remove(K.versao)
            if (novo.historicoPerguntas.isNotEmpty()) {
                p[K.historico] = com.google.gson.Gson().toJson(novo.historicoPerguntas.takeLast(50))
            } else {
                p.remove(K.historico)
            }
        }
    }
}

/** Implementação em memória (testes unitários e pré-visualizações). */
class InMemoryPreferences(inicial: UserPreferences = UserPreferences()) : PreferencesStore {
    private val estado = MutableStateFlow(inicial)
    override val preferencias: Flow<UserPreferences> = estado
    override suspend fun atualizar(transformacao: (UserPreferences) -> UserPreferences) {
        estado.value = transformacao(estado.value)
    }
}
