package net.saibatudo.quimica.data.bundle

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
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import net.saibatudo.quimica.SaibaTudoApp
import net.saibatudo.quimica.data.prefs.PreferencesStore
import net.saibatudo.quimica.data.repository.QuimicaDataStore
import java.util.concurrent.TimeUnit

/** Estado da atualização exibido na tela "Sobre os dados". */
sealed interface EstadoAtualizacao {
    data object Ociosa : EstadoAtualizacao
    data object Verificando : EstadoAtualizacao
    data class Concluida(val resultado: UpdateResult, val quando: Long) : EstadoAtualizacao
}

/**
 * Orquestra as atualizações do pacote de dados: respeita a economia de dados, limita a frequência de verificação
 * (o intervalo vem do manifesto assinado: `cliente.pollIntervalMinutes`, 7 dias) e recarrega a base ao ativar.
 */
class UpdateCoordinator(
    private val context: Context,
    private val updater: DataUpdater,
    private val dados: QuimicaDataStore,
    private val prefs: PreferencesStore,
    private val agora: () -> Long = System::currentTimeMillis
) {
    private val _estado = MutableStateFlow<EstadoAtualizacao>(EstadoAtualizacao.Ociosa)
    val estado: StateFlow<EstadoAtualizacao> = _estado.asStateFlow()

    /** Serializa verificações (WorkManager e primeiro plano) para não disputarem a mesma área de preparo. */
    private val trava = Mutex()

    /** Instante da última falha de rede: sem forçar, não tenta de novo antes de 1 hora (evita bater no servidor a cada abertura). */
    @Volatile private var ultimaFalha = 0L

    /** @param forcar ignora o intervalo mínimo e a economia de dados (botão "Atualizar agora"). */
    suspend fun verificar(forcar: Boolean = false): UpdateResult = trava.withLock { verificarSerializado(forcar) }

    private suspend fun verificarSerializado(forcar: Boolean): UpdateResult {
        val p = prefs.atual()
        if (p.economiaDeDados && redeComFranquia() && !forcar) {
            return UpdateResult.Skipped("economia de dados: aguardando Wi-Fi")
        }
        // 90% do intervalo: o WorkManager periódico pode disparar um pouco antes do prazo exato
        val intervaloMs = (intervaloMinutos() * 60_000L * 9) / 10
        if (!forcar && agora() - p.ultimaVerificacaoDados < intervaloMs) {
            return UpdateResult.Skipped("verificado há pouco")
        }
        if (!forcar && agora() - ultimaFalha < 60 * 60_000L) return UpdateResult.Skipped("nova tentativa em breve")
        _estado.value = EstadoAtualizacao.Verificando
        val r = updater.atualizar()
        if (r is UpdateResult.Failed) ultimaFalha = agora()
        if (r is UpdateResult.Updated) dados.carregar(forcar = true)
        // só uma tentativa que chegou ao servidor conta como "verificação"; falha de rede tenta de novo no próximo ciclo
        if (r !is UpdateResult.Failed) {
            prefs.atualizar {
                it.copy(
                    ultimaVerificacaoDados = agora(),
                    ultimaVersaoDados = if (r is UpdateResult.Updated) r.dataVersion else it.ultimaVersaoDados
                )
            }
        }
        _estado.value = EstadoAtualizacao.Concluida(r, agora())
        return r
    }

    suspend fun intervaloMinutos(): Int = try {
        dados.pacote().manifest.pollIntervalMinutes
    } catch (_: Exception) {
        BundleManifest.PADRAO_MINUTOS
    }

    private fun redeComFranquia(): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
    }
}

/** Agenda a verificação periódica em segundo plano (WorkManager), no intervalo do manifesto (semanal). */
object DataUpdateScheduler {
    private const val NOME = "atualizacao_pacote_quimica"

    fun agendar(context: Context, intervaloMinutos: Int, economiaDeDados: Boolean) {
        val restricoes = Constraints.Builder()
            .setRequiredNetworkType(if (economiaDeDados) NetworkType.UNMETERED else NetworkType.CONNECTED)
            .setRequiresBatteryNotLow(true)
            .build()
        val req = PeriodicWorkRequestBuilder<DataUpdateWorker>(intervaloMinutos.toLong(), TimeUnit.MINUTES)
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
