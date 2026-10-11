package net.saibatudo.quimica.data.prefs

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.google.gson.Gson
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

enum class TemaApp(val rotulo: String) { SISTEMA("Seguir o sistema"), CLARO("Claro"), ESCURO("Escuro") }

enum class TamanhoFonte(val rotulo: String, val fator: Float) {
    PEQUENA("Pequeno", 0.9f), NORMAL("Normal", 1f), GRANDE("Grande", 1.15f), MUITO_GRANDE("Muito grande", 1.3f)
}

/** Nível de detalhe das explicações e fichas: fundamental, médio ou superior. */
enum class Nivel(val id: String, val rotulo: String, val descricao: String) {
    FUNDAMENTAL("fundamental", "Fundamental", "Fichas enxutas e passos explicados com calma"),
    MEDIO("medio", "Médio", "O conjunto usual de propriedades e passos"),
    SUPERIOR("superior", "Superior", "Todas as propriedades, notas e detalhes dos cálculos");

    companion object {
        fun de(id: String?): Nivel = entries.firstOrNull { it.id == id } ?: MEDIO
    }
}

/**
 * Preferências do usuário (armazenadas apenas no aparelho).
 * Nada aqui é enviado a servidores: nesta versão o único tráfego de rede é a atualização assinada do pacote de dados.
 */
data class UserPreferences(
    val tema: TemaApp = TemaApp.SISTEMA,
    val tamanhoFonte: TamanhoFonte = TamanhoFonte.NORMAL,
    val nivel: Nivel = Nivel.MEDIO,
    /** Economia de dados: atualiza o pacote só em Wi-Fi/rede sem franquia. */
    val economiaDeDados: Boolean = false,
    val ultimaVerificacaoDados: Long = 0L,
    val ultimaVersaoDados: String? = null,
    val historicoPerguntas: List<String> = emptyList()
)

/** Armazenamento de preferências (interface para permitir testes sem Android). */
interface PreferencesStore {
    val preferencias: Flow<UserPreferences>
    suspend fun atual(): UserPreferences = preferencias.first()
    suspend fun atualizar(transformacao: (UserPreferences) -> UserPreferences)
}

private val Context.preferenciasDataStore by preferencesDataStore(name = "preferencias_saibatudo_quimica")

class DataStorePreferences(private val context: Context) : PreferencesStore {
    private object K {
        val tema = stringPreferencesKey("tema")
        val fonte = stringPreferencesKey("tamanho_fonte")
        val nivel = stringPreferencesKey("nivel")
        val economia = booleanPreferencesKey("economia_de_dados")
        val verif = longPreferencesKey("ultima_verificacao_dados")
        val versao = stringPreferencesKey("ultima_versao_dados")
        val historico = stringPreferencesKey("historico_perguntas")
    }

    private val gson = Gson()

    override val preferencias: Flow<UserPreferences> = context.preferenciasDataStore.data.map { p -> ler(p) }

    private fun ler(p: Preferences) = UserPreferences(
        tema = p[K.tema]?.let { n -> TemaApp.entries.firstOrNull { it.name == n } } ?: TemaApp.SISTEMA,
        tamanhoFonte = p[K.fonte]?.let { n -> TamanhoFonte.entries.firstOrNull { it.name == n } } ?: TamanhoFonte.NORMAL,
        nivel = Nivel.de(p[K.nivel]),
        economiaDeDados = p[K.economia] ?: false,
        ultimaVerificacaoDados = p[K.verif] ?: 0L,
        ultimaVersaoDados = p[K.versao],
        historicoPerguntas = p[K.historico]?.let { raw ->
            try {
                gson.fromJson(raw, Array<String>::class.java)?.toList()
            } catch (_: Exception) {
                null
            }
        } ?: emptyList()
    )

    override suspend fun atualizar(transformacao: (UserPreferences) -> UserPreferences) {
        context.preferenciasDataStore.edit { p ->
            val novo = transformacao(ler(p))
            p[K.tema] = novo.tema.name
            p[K.fonte] = novo.tamanhoFonte.name
            p[K.nivel] = novo.nivel.id
            p[K.economia] = novo.economiaDeDados
            p[K.verif] = novo.ultimaVerificacaoDados
            if (novo.ultimaVersaoDados != null) p[K.versao] = novo.ultimaVersaoDados else p.remove(K.versao)
            if (novo.historicoPerguntas.isNotEmpty()) {
                p[K.historico] = gson.toJson(novo.historicoPerguntas.takeLast(30))
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
