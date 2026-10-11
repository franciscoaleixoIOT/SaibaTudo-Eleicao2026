package net.saibatudo.quimica.di

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import net.saibatudo.quimica.BuildConfig
import net.saibatudo.quimica.data.bundle.BundleStore
import net.saibatudo.quimica.data.bundle.DataUpdateScheduler
import net.saibatudo.quimica.data.bundle.DataUpdater
import net.saibatudo.quimica.data.bundle.ManifestVerifier
import net.saibatudo.quimica.data.bundle.UpdateCoordinator
import net.saibatudo.quimica.data.prefs.DataStorePreferences
import net.saibatudo.quimica.data.prefs.PreferencesStore
import net.saibatudo.quimica.data.remote.HttpClientFactory
import net.saibatudo.quimica.data.repository.QuimicaDataStore
import okhttp3.OkHttpClient

/** Contêiner de dependências do app (injeção manual). */
class AppContainer(private val app: Context) {
    private val escopo = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    /** Único cliente HTTP do app: usado só pela atualização assinada do pacote de dados. */
    val http: OkHttpClient by lazy { HttpClientFactory.criar(BuildConfig.VERSION_NAME) }

    val preferencias: PreferencesStore by lazy { DataStorePreferences(app) }
    private val verificador: ManifestVerifier by lazy { ManifestVerifier(BuildConfig.DATA_PUBLIC_KEY) }
    val pacotes: BundleStore by lazy { BundleStore(app, verificador) }
    val dados: QuimicaDataStore by lazy { QuimicaDataStore(pacotes) }

    private val atualizador: DataUpdater by lazy {
        DataUpdater(pacotes, http, BuildConfig.DATA_BASE_URL, verificador, BuildConfig.VERSION_CODE)
    }
    val atualizacoes: UpdateCoordinator by lazy { UpdateCoordinator(app, atualizador, dados, preferencias) }

    /** Chamado em Application.onCreate: carrega o pacote e agenda a atualização semanal em segundo plano. */
    fun iniciar() {
        escopo.launch { dados.carregar() }
        escopo.launch {
            val economia = preferencias.atual().economiaDeDados
            DataUpdateScheduler.agendar(app, atualizacoes.intervaloMinutos(), economia)
        }
    }
}
