package net.saibatudo.eleicoes2026.data.location

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.core.location.LocationListenerCompat
import androidx.core.location.LocationManagerCompat
import androidx.core.location.LocationRequestCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import net.saibatudo.eleicoes2026.domain.geo.MalhaUfs
import kotlin.coroutines.resume

/**
 * Sugere a UF do usuário pela localização APROXIMADA do aparelho (permissão ACCESS_COARSE_LOCATION).
 * A coordenada é usada só aqui, em memória, para achar a UF na malha do IBGE embutida no app: nunca é enviada nem gravada.
 * Sem permissão, com a localização desligada, sem resposta em [TEMPO_MAXIMO_MS] ou fora do Brasil ⇒ `null` (escolha manual).
 */
class SugestaoUf(private val context: Context) {

    @Volatile private var malha: MalhaUfs? = null

    fun temPermissao(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    suspend fun sugerir(): String? {
        if (!temPermissao()) return null
        val local = obterLocalizacao() ?: return null
        val m = malha ?: withContext(Dispatchers.IO) {
            MalhaUfs.parse(context.assets.open(ARQUIVO_MALHA).bufferedReader().use { it.readText() })
        }.also { malha = it }
        return withContext(Dispatchers.Default) { m.ufDe(local.latitude, local.longitude) }
    }

    private suspend fun obterLocalizacao(): Location? {
        val lm = context.getSystemService(LocationManager::class.java) ?: return null
        if (!LocationManagerCompat.isLocationEnabled(lm)) return null
        val provedores = buildList {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) add(LocationManager.FUSED_PROVIDER)
            add(LocationManager.NETWORK_PROVIDER)
            add(LocationManager.PASSIVE_PROVIDER)
            add(LocationManager.GPS_PROVIDER)
        }.filter { p -> runCatching { lm.isProviderEnabled(p) }.getOrDefault(false) }

        // 1) última posição conhecida recente (instantâneo, não liga o GPS)
        val ultima = provedores.mapNotNull { p ->
            try { lm.getLastKnownLocation(p) } catch (_: SecurityException) { null } catch (_: IllegalArgumentException) { null }
        }.maxByOrNull { it.time }
        if (ultima != null && System.currentTimeMillis() - ultima.time <= IDADE_MAXIMA_MS) return ultima

        // 2) UMA posição atual: pede ao mesmo tempo aos provedores ativos (combinado, rede, GPS — com permissão aproximada o
        //    sistema entrega a posição já arredondada) e fica com a primeira que chegar; desliga todos em seguida.
        val ativos = provedores.filter { it != LocationManager.PASSIVE_PROVIDER }
        if (ativos.isEmpty()) return ultima
        return primeiraPosicao(lm, ativos) ?: ultima
    }

    private suspend fun primeiraPosicao(lm: LocationManager, provedores: List<String>): Location? = withTimeoutOrNull(TEMPO_MAXIMO_MS) {
        suspendCancellableCoroutine { cont ->
            val executor = ContextCompat.getMainExecutor(context)
            val ouvintes = mutableListOf<LocationListenerCompat>()
            fun parar() = ouvintes.forEach {
                try { LocationManagerCompat.removeUpdates(lm, it) } catch (_: SecurityException) { } catch (_: IllegalArgumentException) { }
            }
            val pedido = LocationRequestCompat.Builder(0L)
                .setQuality(LocationRequestCompat.QUALITY_BALANCED_POWER_ACCURACY)
                .setMaxUpdates(1)
                .build()
            for (p in provedores) {
                val ouvinte = LocationListenerCompat { loc -> if (cont.isActive) { parar(); cont.resume(loc) } }
                try {
                    LocationManagerCompat.requestLocationUpdates(lm, p, pedido, executor, ouvinte)
                    ouvintes += ouvinte
                } catch (_: SecurityException) {
                } catch (_: IllegalArgumentException) {
                }
            }
            if (ouvintes.isEmpty()) cont.resume(null)
            cont.invokeOnCancellation { executor.execute { parar() } }
        }
    }

    companion object {
        const val ARQUIVO_MALHA = "geo/ufs.json"
        private const val TEMPO_MAXIMO_MS = 10_000L
        private const val IDADE_MAXIMA_MS = 30 * 60 * 1000L
    }
}
