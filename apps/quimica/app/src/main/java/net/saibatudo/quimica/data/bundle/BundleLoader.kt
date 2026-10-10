package net.saibatudo.quimica.data.bundle

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import net.saibatudo.quimica.data.model.CompostoIndice
import net.saibatudo.quimica.data.model.PacoteJson
import net.saibatudo.quimica.data.model.Regras
import net.saibatudo.quimica.data.repository.Pacote

/**
 * Carrega o NÚCLEO do pacote (elementos, constantes, regras, fontes e índice de compostos) a partir de um [BundleReader].
 * Lotes de compostos, fichas ICSC e textos ficam para depois (sob demanda, em [Pacote]).
 *
 * Os arquivos do núcleo são conferidos contra o sha256 do manifesto sempre que [verificarHash] for verdadeiro
 * (pacote baixado); o pacote embutido faz parte do APK assinado.
 */
object BundleLoader {

    suspend fun carregar(reader: BundleReader, manifest: BundleManifest, verificarHash: Boolean = reader !is AssetBundleReader): Pacote =
        withContext(Dispatchers.IO) {
            fun ler(path: String): ByteArray {
                val dados = reader.open(path).use { it.readBytes() }
                if (verificarHash) {
                    val esperado = manifest.arquivo(path) ?: throw IllegalStateException("arquivo fora do manifesto: $path")
                    check(ManifestVerifier.sha256Hex(dados) == esperado.sha256) { "checksum divergente em $path" }
                }
                return dados
            }

            fun opcional(path: String): ByteArray? = if (manifest.arquivo(path) != null) ler(path) else null

            val elementos = PacoteJson.elementos(PacoteJson.parse(ler("elementos.json")))
            check(elementos.isNotEmpty()) { "elementos.json sem elementos" }
            val constantes = opcional("constantes.json")?.let { PacoteJson.constantes(PacoteJson.parse(it)) }.orEmpty()
            var regras = opcional("regras.json")?.let { PacoteJson.regras(PacoteJson.parse(it)) } ?: Regras()
            // frases H em português: arquivo opcional do pacote (complementa regras.frasesH)
            for (caminho in listOf("ghs_frases.json", "seguranca/ghs_frases.json", "ghs/frases.json")) {
                val bytes = opcional(caminho) ?: continue
                val frases = runCatching { PacoteJson.frasesH(PacoteJson.parse(bytes)) }.getOrDefault(emptyMap())
                if (frases.isNotEmpty()) { regras = regras.copy(frasesH = frases + regras.frasesH); break }
            }
            val fontes = opcional("fontes.json")?.let { PacoteJson.fontesDeArquivo(PacoteJson.parse(it)) }.orEmpty()
            val indice = opcional("compostos/index.json")?.let { PacoteJson.indiceCompostos(PacoteJson.parse(it)) } ?: CompostoIndice(emptyList())

            Pacote(
                manifest = manifest,
                origem = reader.origem,
                elementos = elementos,
                constantes = constantes,
                regras = regras,
                fontes = fontes,
                indice = indice,
                reader = reader,
                verificarHash = verificarHash
            )
        }
}
