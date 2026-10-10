package net.saibatudo.quimica.ui.components

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import net.saibatudo.quimica.ui.theme.LocalTemaEscuro
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.IOException

/** Estado interno da WebView da molécula: o que já foi desenhado e se a página terminou de carregar. */
private class EstadoMolecula {
    var paginaPronta = false
    var desenhado: String? = null
    var pedido: String? = null
}

/**
 * Estrutura 2D de uma molécula, desenhada por uma WebView LOCAL com o SmilesDrawer vendorizado (assets/vendor).
 * A página só enxerga os dois arquivos embutidos (molecula.html e vendor/smiles-drawer.min.js) por um endereço reservado
 * (".invalid", que nunca resolve na rede); qualquer outro pedido recebe 403. O SMILES vai como string JSON escapada.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun MoleculaView(smiles: String, descricao: String, modifier: Modifier = Modifier, altura: Dp = 240.dp) {
    val contexto = LocalContext.current
    val escuro = LocalTemaEscuro.current
    val estado = remember { EstadoMolecula() }
    val webView = remember { criarWebView(contexto, estado) }

    DisposableEffect(webView) {
        onDispose {
            webView.stopLoading()
            webView.destroy()
        }
    }

    AndroidView(
        factory = { webView },
        update = { wv ->
            wv.contentDescription = descricao
            val pedido = "$smiles|$escuro"
            estado.pedido = pedido
            if (estado.paginaPronta && estado.desenhado != pedido) {
                desenhar(wv, smiles, escuro)
                estado.desenhado = pedido
            }
        },
        modifier = modifier.fillMaxWidth().height(altura).semantics { contentDescription = "Estrutura 2D de $descricao" }
    )
}

private fun desenhar(wv: WebView, smiles: String, escuro: Boolean) {
    // JSONObject.quote devolve uma string JavaScript válida e escapada ("..."), evitando injeção de código pelo SMILES
    wv.evaluateJavascript("desenhar(${JSONObject.quote(smiles)}, $escuro);", null)
}

private const val HOST_LOCAL = "appassets.saibatudo.invalid"

@SuppressLint("SetJavaScriptEnabled")
private fun criarWebView(contexto: Context, estado: EstadoMolecula): WebView {
    val wv = WebView(contexto)
    wv.setBackgroundColor(Color.TRANSPARENT)
    wv.isVerticalScrollBarEnabled = false
    wv.isHorizontalScrollBarEnabled = false
    wv.settings.apply {
        javaScriptEnabled = true            // necessário para o SmilesDrawer; a página é local e só recebe o SMILES do pacote
        allowFileAccess = false
        allowContentAccess = false
        domStorageEnabled = false
        setSupportZoom(false)
        builtInZoomControls = false
        cacheMode = WebSettings.LOAD_NO_CACHE
        mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
    }
    val assets = contexto.applicationContext.assets
    wv.webViewClient = object : WebViewClient() {
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
            val url = request.url
            if (url.scheme == "https" && url.host == HOST_LOCAL) {
                val caminho = url.path.orEmpty().removePrefix("/")
                val tipo = when (caminho) {
                    "molecula.html" -> "text/html"
                    "vendor/smiles-drawer.min.js" -> "application/javascript"
                    else -> null
                }
                if (tipo != null) {
                    return try {
                        WebResourceResponse(tipo, "utf-8", assets.open(caminho))
                    } catch (_: IOException) {
                        bloqueado()
                    }
                }
            }
            return bloqueado()
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: android.webkit.WebResourceError) {
            if (net.saibatudo.quimica.BuildConfig.DEBUG) android.util.Log.d("MoleculaView", "erro ${error.errorCode} ${error.description} em ${request.url}")
        }

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = true

        override fun onPageFinished(view: WebView, url: String?) {
            estado.paginaPronta = true
            val pedido = estado.pedido ?: return
            val separador = pedido.lastIndexOf('|')
            desenhar(view, pedido.substring(0, separador), pedido.substring(separador + 1).toBoolean())
            estado.desenhado = pedido
        }
    }
    if (net.saibatudo.quimica.BuildConfig.DEBUG) {
        wv.webChromeClient = object : android.webkit.WebChromeClient() {
            override fun onConsoleMessage(m: android.webkit.ConsoleMessage): Boolean {
                android.util.Log.d("MoleculaView", "${m.messageLevel()}: ${m.message()} (${m.sourceId()}:${m.lineNumber()})")
                return true
            }
        }
    }
    wv.loadUrl("https://$HOST_LOCAL/molecula.html")
    return wv
}

private fun bloqueado() = WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", emptyMap(), ByteArrayInputStream(ByteArray(0)))
