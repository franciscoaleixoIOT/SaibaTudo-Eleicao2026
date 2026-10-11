package net.saibatudo.quimica.data.remote

import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

/**
 * Cliente HTTP único do app. Nesta versão (v0) o app NÃO envia nada do usuário: a rede serve apenas para baixar a
 * atualização assinada do pacote de dados. A IA na nuvem e a captura opt-in de perguntas não entendidas (como no app de
 * eleições) ficam para uma versão futura e dependem de consentimento explícito.
 */
object HttpClientFactory {
    fun criar(versao: String): OkHttpClient =
        OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .callTimeout(120, TimeUnit.SECONDS)
            .addInterceptor { chain ->
                chain.proceed(
                    chain.request().newBuilder()
                        .header("User-Agent", "SaibaTudo-Quimica/$versao (Android)")
                        .build()
                )
            }
            .build()
}
