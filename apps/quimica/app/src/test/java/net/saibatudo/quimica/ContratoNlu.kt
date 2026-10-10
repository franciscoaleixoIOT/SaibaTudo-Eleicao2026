package net.saibatudo.quimica

import com.google.gson.JsonObject
import net.saibatudo.quimica.ai.model.ParsedQuery
import net.saibatudo.quimica.ai.nlu.Dicionario
import net.saibatudo.quimica.ai.nlu.LocalNlu

/**
 * Comparação dos casos do contrato (contracts/nlu_golden_cases.json) com o NLU local do Android.
 * Mesma semântica de web/test: chave ausente = não verificada; chave com null = deve estar ausente.
 */
object ContratoNlu {

    fun valorAtual(chave: String, r: ParsedQuery): Any? = when (chave) {
        "intent" -> r.intent.name
        "elemento" -> r.elemento
        "composto" -> r.composto
        "propriedade" -> r.propriedade
        "equacao" -> r.equacao
        "unidadeDestino" -> r.unidadeDestino
        "grupo" -> r.grupo
        "periodo" -> r.periodo
        "bloco" -> r.bloco
        "categoria" -> r.categoria
        "estado" -> r.estado
        "formula" -> r.formula
        else -> null
    }

    val CHAVES = listOf("intent", "elemento", "composto", "propriedade", "equacao", "unidadeDestino", "grupo", "periodo", "bloco", "categoria", "estado", "formula")

    /** Falhas de UM caso (lista de textos; vazia = passou). */
    fun falhasDoCaso(c: JsonObject, d: Dicionario): List<String> {
        val q = c.get("q").asString
        val r = LocalNlu.parse(q, d)
        val falhas = mutableListOf<String>()
        for (chave in CHAVES) {
            if (!c.has(chave)) continue
            val esperado = c.get(chave)
            val atual = valorAtual(chave, r)
            val ok = when {
                esperado.isJsonNull -> atual == null
                esperado.asJsonPrimitive.isNumber -> atual?.toString() == esperado.asBigDecimal.toBigInteger().toString()
                else -> atual?.toString() == esperado.asString
            }
            if (!ok) falhas += "$chave esperado=$esperado atual=$atual"
        }
        return falhas
    }

    /**
     * O caso só depende de entidades que existem no pacote em uso? Com o fixture (10 elementos, 20 compostos) vários casos citam
     * elementos e compostos ausentes; eles só valem com o pacote real.
     */
    fun elegivel(c: JsonObject, d: Dicionario): Boolean {
        val pacote = d.pacote
        if (c.has("elemento") && !c.get("elemento").isJsonNull && pacote.porSimbolo[c.get("elemento").asString] == null) return false
        if (c.has("composto") && !c.get("composto").isJsonNull && pacote.indice.entrada(c.get("composto").asLong) == null) return false
        val intent = c.get("intent").asString
        // intenção que depende de uma entidade não declarada no caso (ex.: "o que é o fosgênio?" -> COMPOSTO): não dá para saber se o pacote a tem
        if (intent == "COMPOSTO" && !c.has("composto") && !c.has("formula")) return false
        if (intent == "ELEMENTO" && !c.has("elemento")) return false
        // a pergunta usa fórmulas/íons de elementos que o fixture não tem
        val q = c.get("q").asString
        val simbolosCitados = Regex("""[A-Z][a-z]?""").findAll(q).map { it.value }.filter { it in net.saibatudo.quimica.domain.calc.FormulaQuimica.SIMBOLOS && it.length == 2 }.toSet()
        if (pacote.elementos.size < 50 && simbolosCitados.any { pacote.porSimbolo[it] == null } && c.has("equacao")) return false
        return true
    }
}
