package net.saibatudo.quimica.data.bundle

import java.security.KeyFactory
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi

/**
 * Verifica a assinatura ECDSA P-256 / SHA-256 (DER, Base64) do manifesto de dados.
 * A chave pública (X.509, Base64) é embutida no app (BuildConfig.DATA_PUBLIC_KEY, vinda de pipeline/data_signing_public.b64);
 * a privada fica somente com o mantenedor/CI. Sem chave configurada (ou chave ilegível), NUNCA aceita.
 */
@OptIn(ExperimentalEncodingApi::class)
class ManifestVerifier(publicKeyBase64: String) {

    private val publicKey = publicKeyBase64.trim().takeIf { it.isNotEmpty() }?.let {
        try {
            KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(Base64.decode(it)))
        } catch (_: Exception) {
            null
        }
    }

    /** Retorna true somente se a assinatura for válida. */
    fun verify(manifest: ByteArray, signatureBase64: String): Boolean {
        val key = publicKey ?: return false
        return try {
            val sig = Signature.getInstance("SHA256withECDSA")
            sig.initVerify(key)
            sig.update(manifest)
            sig.verify(Base64.decode(signatureBase64.trim()))
        } catch (_: Exception) {
            false
        }
    }

    companion object {
        fun sha256Hex(bytes: ByteArray): String =
            MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    }
}
