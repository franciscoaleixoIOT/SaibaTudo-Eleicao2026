package net.saibatudo.eleicoes2026.data.repository

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import net.saibatudo.eleicoes2026.data.bundle.BundleStore
import net.saibatudo.eleicoes2026.data.datasource.BundleLoader
import net.saibatudo.eleicoes2026.data.datasource.ElectionData

sealed interface EstadoDados {
    data object Carregando : EstadoDados
    data class Pronto(val dados: ElectionData) : EstadoDados
    data class Erro(val mensagem: String) : EstadoDados
}

/**
 * Mantém em memória os dados oficiais ativos (snapshot embutido ou atualização baixada) e os recarrega
 * quando uma atualização é ativada. Se a versão baixada estiver corrompida, volta ao snapshot embutido.
 */
class ElectionDataStore(private val bundles: BundleStore) {
    private val _estado = MutableStateFlow<EstadoDados>(EstadoDados.Carregando)
    val estado: StateFlow<EstadoDados> = _estado.asStateFlow()
    private val mutex = Mutex()

    suspend fun carregar(forcar: Boolean = false) = mutex.withLock {
        if (!forcar && _estado.value is EstadoDados.Pronto) return@withLock
        if (_estado.value !is EstadoDados.Pronto) _estado.value = EstadoDados.Carregando
        try {
            _estado.value = EstadoDados.Pronto(carregarAtivo())
        } catch (e: Exception) {
            // atualização baixada ilegível: descarta e usa o snapshot embutido
            bundles.invalidarBaixado()
            try {
                _estado.value = EstadoDados.Pronto(carregarAtivo())
            } catch (e2: Exception) {
                _estado.value = EstadoDados.Erro(e2.message ?: e.message ?: "falha ao carregar os dados oficiais")
            }
        }
    }

    private suspend fun carregarAtivo(): ElectionData {
        val ativo = bundles.ativo()
        return BundleLoader.carregar(ativo.reader, ativo.manifest)
    }

    /** Aguarda os dados ficarem prontos (carregando se necessário). */
    suspend fun dados(): ElectionData {
        carregar()
        return estado.filterIsInstance<EstadoDados.Pronto>().first().dados
    }
}
