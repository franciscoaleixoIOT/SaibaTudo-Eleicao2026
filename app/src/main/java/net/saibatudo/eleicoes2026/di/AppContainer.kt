package net.saibatudo.eleicoes2026.di

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import net.saibatudo.eleicoes2026.BuildConfig
import net.saibatudo.eleicoes2026.ai.engine.AiInferenceEngine
import net.saibatudo.eleicoes2026.ai.engine.HybridAiInferenceEngine
import net.saibatudo.eleicoes2026.ai.engine.LocalOfficialAiEngine
import net.saibatudo.eleicoes2026.ai.nlu.CloudNluClient
import net.saibatudo.eleicoes2026.data.bundle.BundleStore
import net.saibatudo.eleicoes2026.data.bundle.DataUpdateScheduler
import net.saibatudo.eleicoes2026.data.bundle.DataUpdater
import net.saibatudo.eleicoes2026.data.bundle.ManifestVerifier
import net.saibatudo.eleicoes2026.data.bundle.UpdateCoordinator
import net.saibatudo.eleicoes2026.data.live.TseApuracaoClient
import net.saibatudo.eleicoes2026.data.prefs.DataStorePreferences
import net.saibatudo.eleicoes2026.data.prefs.PreferencesStore
import net.saibatudo.eleicoes2026.data.remote.ReportClient
import net.saibatudo.eleicoes2026.data.repository.ElectionDataStore
import net.saibatudo.eleicoes2026.data.repository.EstadoDados
import net.saibatudo.eleicoes2026.domain.model.ApuracaoProvider
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

/** Contêiner de dependências do app (injeção manual). */
class AppContainer(private val app: Context) {
    private val escopo = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    val http: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .callTimeout(60, TimeUnit.SECONDS)
            .addInterceptor { chain ->
                chain.proceed(
                    chain.request().newBuilder()
                        .header("User-Agent", "SaibaTudo-Eleicoes2026/${BuildConfig.VERSION_NAME} (Android)")
                        .build()
                )
            }
            .build()
    }

    val preferencias: PreferencesStore by lazy { DataStorePreferences(app) }
    val pacotes: BundleStore by lazy { BundleStore(app) }
    val dados: ElectionDataStore by lazy { ElectionDataStore(pacotes) }

    private val atualizador: DataUpdater by lazy {
        DataUpdater(pacotes, http, BuildConfig.DATA_BASE_URL, ManifestVerifier(BuildConfig.DATA_PUBLIC_KEY), BuildConfig.VERSION_CODE)
    }
    val atualizacoes: UpdateCoordinator by lazy { UpdateCoordinator(app, atualizador, dados, preferencias) }

    /** Apuração oficial ao vivo (JSON público do TSE), usando os códigos de eleição do pacote de dados. */
    val apuracao: ApuracaoProvider by lazy {
        TseApuracaoClient(http, config = { (dados.estado.value as? EstadoDados.Pronto)?.dados?.resultadosTse })
    }

    @Volatile private var ufPadraoAtual: String? = null
    @Volatile private var iaNuvemAtiva: Boolean = false

    private val motorLocal: LocalOfficialAiEngine by lazy {
        LocalOfficialAiEngine(dados = { dados.dados() }, ufPadrao = { ufPadraoAtual }, apuracao = apuracao)
    }

    val relatorios: ReportClient by lazy { ReportClient(http, BuildConfig.API_BASE_URL + "report") }

    val motorIa: AiInferenceEngine by lazy {
        HybridAiInferenceEngine(
            local = motorLocal,
            nuvem = CloudNluClient(http, BuildConfig.API_BASE_URL + "nlu"),
            nuvemHabilitada = { iaNuvemAtiva },
            idInstalacao = { preferencias.idInstalacao() }
        )
    }

    /** Chamado em Application.onCreate: acompanha preferências e agenda atualizações em segundo plano. */
    fun iniciar() {
        escopo.launch {
            preferencias.preferencias.collect { p ->
                ufPadraoAtual = p.ufPadrao?.takeIf { p.filtrarPorMinhaUf }   // só vale se "Meu estado" estiver ligado
                iaNuvemAtiva = p.iaNuvem
            }
        }
        escopo.launch { DataUpdateScheduler.agendar(app, preferencias.atual().economiaDeDados) }
    }
}
