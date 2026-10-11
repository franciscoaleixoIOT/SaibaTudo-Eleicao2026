package net.saibatudo.eleicoes2026

import com.google.gson.JsonObject
import net.saibatudo.eleicoes2026.ai.nlu.LocalNlu
import net.saibatudo.eleicoes2026.domain.model.Texto

/**
 * Comparação dos casos do contrato de NLU (contracts/nlu_golden_cases.json e contracts/nlu_real_cases.json) com o NLU local do Android.
 * Mesma semântica de web/test/contrato.mjs: chave ausente = não verificada; chave com null = deve estar ausente.
 */
object ContratoNlu {
    /** Falhas de UM caso: lista de textos (vazia = passou). */
    fun falhasDoCaso(c: JsonObject): List<String> {
        val q = c.get("q").asString
        val r = LocalNlu.parse(q, TestData.gazetteer)
        val falhas = mutableListOf<String>()
        fun checar(chave: String, atual: Any?) {
            if (!c.has(chave)) return
            val esperado = c.get(chave)
            val ok = if (esperado.isJsonNull) atual == null else when {
                esperado.asJsonPrimitive.isBoolean -> atual == esperado.asBoolean
                esperado.asJsonPrimitive.isNumber -> atual == esperado.asInt
                else -> {
                    val e = esperado.asString
                    (atual?.toString() ?: "").let { a -> if (chave == "nome") Texto.normalizar(a) == Texto.normalizar(e) else a == e }
                }
            }
            if (!ok) falhas += "$chave esperado=$esperado atual=$atual"
        }
        checar("intent", r.intent.name)
        checar("cargo", r.cargo)
        checar("uf", r.uf)
        checar("partido", r.partido)
        checar("nome", r.nome)
        checar("tema", r.tema)
        checar("apenasDeferidas", r.apenasDeferidas)
        checar("apenasIndeferidas", r.apenasIndeferidas)
        checar("historico", r.historico?.name)
        checar("turno", r.turno)
        checar("numero", r.numero)
        checar("genero", r.genero)
        checar("vice", r.vice.takeIf { it })
        return falhas
    }
}
