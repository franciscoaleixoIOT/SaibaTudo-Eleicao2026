package net.saibatudo.eleicoes2026.data.bundle

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import net.saibatudo.eleicoes2026.SaibaTudoApp
import net.saibatudo.eleicoes2026.data.prefs.PreferencesStore
import net.saibatudo.eleicoes2026.data.repository.ElectionDataStore
import java.util.concurrent.TimeUnit

/** Estado da atualização exibido na tela "Sobre os dados". */
sealed interface EstadoAtualizacao {
    data object Ociosa : EstadoAtualizacao
    data object Verificando : EstadoAtualizacao
    data class Concluida(val resultado: UpdateResult, val quando: Long) : EstadoAtualizacao
}

/**
 * Orquestra as atualizações de dados: respeita a economia de dados, limita a frequência de verificação
 * (intervalo vem do manifesto: 6 h normalmente, 15 min em dias de votação/apuração) e recarrega a base ao ativar.
 */
class UpdateCoordinator(
    private val context: Context,
    private val updater: DataUpdater,
    private val dados: ElectionDataStore,
    private val prefs: PreferencesStore,
    private val agora: () -> Long = System::currentTimeMillis
) {
    private val _estado = MutableStateFlow<EstadoAtualizacao>(EstadoAtualizacao.Ociosa)
    val estado: StateFlow<EstadoAtualizacao> = _estado.asStateFlow()

    /** @param forcar ignora o intervalo mínimo e a economia de dados (botão "Atualizar agora"). */
    suspend fun verificar(forcar: Boolean = false): UpdateResult {
        val p = prefs.atual()
        if (p.economiaDeDados && redeComFranquia() && !forcar) {
            return UpdateResult.Skipped("economia de dados: aguardando Wi-Fi")
        }
        val intervaloMs = intervaloMinutos() * 60_000L
        if (!forcar && agora() - p.ultimaVerificacaoDados < intervaloMs) {
            return UpdateResult.Skipped("verificado há pouco")
        }
        _estado.value = EstadoAtualizacao.Verificando
        val r = updater.atualizar()
        if (r is UpdateResult.Updated) dados.carregar(forcar = true)
        prefs.atualizar {
            it.copy(
                ultimaVerificacaoDados = agora(),
                ultimaVersaoDados = if (r is UpdateResult.Updated) r.dataVersion else it.ultimaVersaoDados
            )
        }
        _estado.value = EstadoAtualizacao.Concluida(r, agora())
        return r
    }

    private suspend fun intervaloMinutos(): Int = try {
        dados.dados().manifest.pollIntervalMinutes
    } catch (_: Exception) {
        360
    }

    private fun redeComFranquia(): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
    }
}

/** Agenda a verificação periódica em segundo plano (WorkManager). */
object DataUpdateScheduler {
    private const val NOME = "atualizacao_dados_oficiais"

    fun agendar(context: Context, economiaDeDados: Boolean) {
        val restricoes = Constraints.Builder()
            .setRequiredNetworkType(if (economiaDeDados) NetworkType.UNMETERED else NetworkType.CONNECTED)
            .build()
        val req = PeriodicWorkRequestBuilder<DataUpdateWorker>(3, TimeUnit.HOURS)
            .setConstraints(restricoes)
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(NOME, ExistingPeriodicWorkPolicy.UPDATE, req)
    }
}

class DataUpdateWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext as SaibaTudoApp
        return when (app.container.atualizacoes.verificar(forcar = false)) {
            is UpdateResult.Failed -> if (runAttemptCount < 3) Result.retry() else Result.success()
            else -> Result.success()
        }
    }
}
