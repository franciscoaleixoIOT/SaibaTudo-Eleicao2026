package net.saibatudo.quimica.data.repository

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import net.saibatudo.quimica.data.bundle.BundleLoader
import net.saibatudo.quimica.data.bundle.PacoteStore

sealed interface EstadoDados {
    data object Carregando : EstadoDados
    data class Pronto(val pacote: Pacote) : EstadoDados
    data class Erro(val mensagem: String) : EstadoDados
}

/**
 * Mantém em memória o pacote de dados ativo (embutido ou atualização baixada) e o recarrega quando uma atualização é
 * ativada. Se a versão baixada estiver ilegível, volta (rollback) à versão anterior ou ao pacote embutido.
 */
class QuimicaDataStore(private val store: PacoteStore) {
    private val _estado = MutableStateFlow<EstadoDados>(EstadoDados.Carregando)
    val estado: StateFlow<EstadoDados> = _estado.asStateFlow()
    private val mutex = Mutex()

    suspend fun carregar(forcar: Boolean = false) = mutex.withLock {
        if (!forcar && _estado.value is EstadoDados.Pronto) return@withLock
        if (_estado.value !is EstadoDados.Pronto) _estado.value = EstadoDados.Carregando
        var ultimoErro: Exception? = null
        // até 3 tentativas: ativa, anterior (rollback), pacote embutido
        repeat(3) { tentativa ->
            try {
                _estado.value = EstadoDados.Pronto(carregarAtivo())
                return@withLock
            } catch (e: Exception) {
                ultimoErro = e
                if (tentativa < 2) store.reverter()
            }
        }
        if (_estado.value !is EstadoDados.Pronto) {
            _estado.value = EstadoDados.Erro(ultimoErro?.message ?: "falha ao carregar o pacote de dados")
        }
    }

    private suspend fun carregarAtivo(): Pacote {
        val ativo = store.ativo()
        return BundleLoader.carregar(ativo.reader, ativo.manifest)
    }

    /** Aguarda o pacote ficar pronto (carregando se necessário). */
    suspend fun pacote(): Pacote {
        carregar()
        return when (val e = estado.first { it !is EstadoDados.Carregando }) {
            is EstadoDados.Pronto -> e.pacote
            is EstadoDados.Erro -> throw IllegalStateException(e.mensagem)
            EstadoDados.Carregando -> throw IllegalStateException("pacote ainda carregando")
        }
    }
}
