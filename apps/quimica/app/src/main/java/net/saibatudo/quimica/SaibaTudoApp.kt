package net.saibatudo.quimica

import android.app.Application
import net.saibatudo.quimica.di.AppContainer

/** Application: cria o contêiner de dependências (injeção manual, sem frameworks). */
class SaibaTudoApp : Application() {
    val container: AppContainer by lazy { AppContainer(this) }

    override fun onCreate() {
        super.onCreate()
        container.iniciar()
    }
}
