package net.saibatudo.eleicoes2026

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.disk.DiskCache
import coil.memory.MemoryCache
import net.saibatudo.eleicoes2026.di.AppContainer

/** Application: cria o contêiner de dependências (injeção manual, sem frameworks). */
class SaibaTudoApp : Application(), ImageLoaderFactory {
    val container: AppContainer by lazy { AppContainer(this) }

    override fun onCreate() {
        super.onCreate()
        container.iniciar()
    }

    /** Cache de imagens: fotos oficiais remotas ficam em disco (até 50 MB) para uso offline posterior. */
    override fun newImageLoader(): ImageLoader =
        ImageLoader.Builder(this)
            .okHttpClient { container.http }
            .memoryCache { MemoryCache.Builder(this).maxSizePercent(0.15).build() }
            .diskCache { DiskCache.Builder().directory(cacheDir.resolve("fotos")).maxSizeBytes(50L * 1024 * 1024).build() }
            .crossfade(true)
            .build()
}
