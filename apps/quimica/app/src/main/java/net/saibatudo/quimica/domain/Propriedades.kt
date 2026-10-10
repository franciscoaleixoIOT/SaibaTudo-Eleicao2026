package net.saibatudo.quimica.domain

import net.saibatudo.quimica.data.model.CategoriaElemento
import net.saibatudo.quimica.data.model.Composto
import net.saibatudo.quimica.data.model.Elemento
import net.saibatudo.quimica.data.model.PropriedadeDef
import net.saibatudo.quimica.data.model.Regras
import net.saibatudo.quimica.data.prefs.Nivel
import net.saibatudo.quimica.domain.calc.Unidades

/** Valor formatado de uma propriedade, com os números exibidos (para conferência) e a unidade. */
data class ValorFormatado(val texto: String, val curto: String)

/** Linha de uma ficha: rótulo e valor legíveis. */
data class LinhaFicha(val rotulo: String, val valor: String)

/**
 * Propriedades consultáveis de elementos e compostos. Os ids são os do NLU (`regras.propriedades`); a lista padrão só nomeia
 * os campos do contrato (docs/DATA_CONTRACT.md §2 e §3) e é a mesma do site (web/src/quimica/js/propriedades.js). O pacote
 * pode complementar ou substituir cada id.
 */
object Propriedades {

    private fun p(id: String, rotulo: String, alvo: String, campo: String, tipo: String, unidade: String? = null, vararg sinonimos: String) =
        PropriedadeDef(id, rotulo, campo, alvo, tipo, unidade, sinonimos.toList())

    val PADRAO: List<PropriedadeDef> = listOf(
        p("numeroAtomico", "número atômico", "elemento", "z", "inteiro", null, "numero atomico", "z"),
        p("massaAtomica", "massa atômica", "elemento", "massaAtomica", "massaAtomica", "u", "massa atomica", "peso atomico", "massa do atomo"),
        p("simbolo", "símbolo", "elemento", "simbolo", "texto", null, "simbolo"),
        p("grupo", "grupo (família)", "elemento", "grupo", "inteiro", null, "grupo", "familia"),
        p("periodo", "período", "elemento", "periodo", "inteiro", null, "periodo"),
        p("bloco", "bloco", "elemento", "bloco", "texto", null, "bloco"),
        p("categoria", "categoria", "elemento", "categoria", "categoria", null, "categoria", "classificacao", "tipo de elemento", "classe do elemento"),
        p("configuracaoEletronica", "configuração eletrônica", "elemento", "configuracaoEletronica", "texto", null, "configuracao eletronica", "distribuicao eletronica"),
        p("eletronegatividade", "eletronegatividade (Pauling)", "elemento", "eletronegatividade", "numero", null, "eletronegatividade"),
        p("raioAtomico", "raio atômico", "elemento", "raioAtomicoPm", "numero", "pm", "raio atomico", "tamanho do atomo"),
        p("afinidadeEletronica", "afinidade eletrônica", "elemento", "afinidadeEletronicaKJmol", "numero", "kJ/mol", "afinidade eletronica", "eletroafinidade"),
        p("energiaIonizacao", "energia de ionização", "elemento", "energiaIonizacaoKJmol", "numero", "kJ/mol", "energia de ionizacao", "potencial de ionizacao", "primeira energia de ionizacao"),
        p("pontoFusao", "ponto de fusão", "elemento", "pontoFusaoK", "temperatura", null, "ponto de fusao", "temperatura de fusao", "fusao", "derrete", "funde"),
        p("pontoEbulicao", "ponto de ebulição", "elemento", "pontoEbulicaoK", "temperatura", null, "ponto de ebulicao", "temperatura de ebulicao", "ebulicao", "ferve"),
        p("densidade", "densidade", "elemento", "densidadeKgm3", "densidade", null, "densidade", "massa especifica"),
        p("estadoPadrao", "estado físico (condições padrão)", "elemento", "estadoPadrao", "estado", null, "estado fisico", "estado padrao", "estado da materia", "e solido", "e liquido", "e gasoso"),
        p("estadosOxidacao", "estados de oxidação", "elemento", "estadosOxidacao", "lista", null, "estados de oxidacao", "numeros de oxidacao", "nox", "estado de oxidacao", "valencia"),
        p("descoberta", "descoberta", "elemento", "descoberta", "descoberta", null, "descoberta", "descobriu", "descobridor", "quem descobriu", "ano da descoberta", "quando foi descoberto"),

        p("massaMolar", "massa molar", "composto", "massaMolar", "massaMolar", "g/mol", "massa molar", "massa molecular", "peso molecular", "peso molar", "massa formula"),
        p("massaExata", "massa exata (monoisotópica)", "composto", "massaExata", "numero", "u", "massa exata", "massa monoisotopica"),
        p("formula", "fórmula", "composto", "formula", "formula", null, "formula", "formula molecular", "formula quimica"),
        p("cas", "número CAS", "composto", "cas", "texto", null, "numero cas", "cas"),
        p("cid", "CID no PubChem", "composto", "cid", "inteiro", null, "cid", "pubchem"),
        p("smiles", "SMILES", "composto", "smiles", "texto", null, "smiles"),
        p("inchiKey", "InChIKey", "composto", "inchiKey", "texto", null, "inchikey", "inchi key"),
        p("nomeIupac", "nome IUPAC", "composto", "nomeIupac", "texto", null, "nome iupac", "nome sistematico", "iupac"),
        p("xlogp", "XLogP (lipofilicidade calculada)", "composto", "xlogp", "numero", null, "xlogp", "logp", "lipofilicidade", "coeficiente de particao"),
        p("doadoresH", "doadores de ligação de hidrogênio", "composto", "doadoresH", "inteiro", null, "doadores de hidrogenio", "doadores de ligacao de hidrogenio"),
        p("aceptoresH", "aceptores de ligação de hidrogênio", "composto", "aceptoresH", "inteiro", null, "aceptores de hidrogenio", "aceptores de ligacao de hidrogenio"),
        p("ligacoesRotaveis", "ligações rotáveis", "composto", "ligacoesRotaveis", "inteiro", null, "ligacoes rotaveis"),
        p("carga", "carga elétrica", "composto", "carga", "inteiro", null, "carga eletrica", "carga formal"),
        p("tpsa", "área de superfície polar (TPSA)", "composto", "tpsa", "numero", "Å²", "tpsa", "area de superficie polar")
    )

    /** Lista efetiva: a do pacote (regras.propriedades) complementa ou substitui a padrão por id. */
    fun tabela(regras: Regras): List<PropriedadeDef> {
        val mapa = LinkedHashMap<String, PropriedadeDef>()
        PADRAO.forEach { mapa[it.id] = it }
        for (r in regras.propriedades) {
            val base = mapa[r.id]
            mapa[r.id] = if (base == null) r.copy(alvo = r.alvo.ifEmpty { "elemento" }, tipo = r.tipo.ifEmpty { "texto" }) else r.copy(
                campo = r.campo ?: base.campo,
                alvo = r.alvo.ifEmpty { base.alvo },
                tipo = r.tipo.ifEmpty { base.tipo },
                unidade = r.unidade ?: base.unidade,
                sinonimos = (base.sinonimos + r.sinonimos).distinct()
            )
        }
        return mapa.values.toList()
    }

    fun rotuloCategoria(c: CategoriaElemento): String = when (c) {
        CategoriaElemento.SEMIMETAL -> "semimetal (metaloide)"
        CategoriaElemento.DESCONHECIDA -> "propriedades químicas desconhecidas"
        else -> c.rotulo.replaceFirstChar { it.lowercase() }
    }

    // ---- valores ---------------------------------------------------------------------------------------------------------------

    /** Valor bruto de [def] num elemento; null se ausente. */
    fun bruto(def: PropriedadeDef, e: Elemento): Any? = when (def.campo) {
        "z" -> e.z
        "simbolo" -> e.simbolo
        "massaAtomica" -> e.massaAtomica
        "grupo" -> e.grupo
        "periodo" -> e.periodo
        "bloco" -> e.bloco
        "categoria" -> e.categoria.takeIf { it != CategoriaElemento.DESCONHECIDA }
        "configuracaoEletronica" -> e.configuracaoEletronica
        "eletronegatividade" -> e.eletronegatividade
        "raioAtomicoPm" -> e.raioAtomicoPm
        "afinidadeEletronicaKJmol" -> e.afinidadeEletronicaKJmol
        "energiaIonizacaoKJmol" -> e.energiaIonizacaoKJmol
        "pontoFusaoK" -> e.pontoFusaoK
        "pontoEbulicaoK" -> e.pontoEbulicaoK
        "densidadeKgm3" -> e.densidadeKgm3
        "estadoPadrao" -> e.estadoPadrao.takeIf { it.id != "desconhecido" }
        "estadosOxidacao" -> e.estadosOxidacao.takeIf { it.isNotEmpty() }
        "descoberta" -> e.descobertaAno?.let { it to e.descobertaPor } ?: e.descobertaPor?.let { null to it }
        else -> null
    }

    /** Valor bruto de [def] num composto; null se ausente. */
    fun bruto(def: PropriedadeDef, c: Composto): Any? {
        val campo = def.campo ?: return null
        return when (campo) {
            "massaMolar" -> c.massaMolar
            "massaExata" -> c.massaExata
            "formula" -> c.formula
            "cas" -> c.cas
            "cid" -> c.cid
            "smiles" -> c.smiles
            "inchiKey" -> c.inchiKey
            "nomeIupac" -> c.nomeIupac
            else -> c.propriedades[campo] ?: c.propriedades[def.id] ?: c.propriedadesTexto[campo]
        }
    }

    fun formatar(def: PropriedadeDef, valor: Any?, un: Unidades, nivel: Nivel = Nivel.MEDIO): ValorFormatado? {
        if (valor == null) return null
        fun num(d: Double, sig: Int = 7) = Texto.significativos(d, sig)
        return when (def.tipo) {
            "temperatura" -> {
                val k = (valor as? Number)?.toDouble() ?: return null
                val kTxt = "${num(k)} K"
                val c = un.buscar("°C", "temperatura")?.let { un.converter(k, un.porSimbolo("K", "temperatura") ?: return@let null, it) }
                val txt = if (c == null) kTxt else "$kTxt (${num(c)} °C)"
                ValorFormatado(txt, kTxt)
            }
            "densidade" -> {
                val d = (valor as? Number)?.toDouble() ?: return null
                val base = "${num(d)} kg/m³"
                val g = un.porSimbolo("g/cm³", "densidade")?.let { un.converter(d, un.porSimbolo("kg/m³", "densidade") ?: return@let null, it) }
                ValorFormatado(if (g == null) base else "$base (${num(g)} g/cm³)", base)
            }
            "massaAtomica" -> (valor as? Number)?.toDouble()?.let { ValorFormatado("${num(it, 9)} u (g/mol)", "${num(it, 9)} u") }
            "massaMolar" -> (valor as? Number)?.toDouble()?.let { ValorFormatado("${num(it, 9)} g/mol", "${num(it, 9)} g/mol") }
            "numero" -> (valor as? Number)?.toDouble()?.let {
                val t = num(it) + (def.unidade?.let { u -> " $u" } ?: "")
                ValorFormatado(t, t)
            }
            "inteiro" -> (valor as? Number)?.let { ValorFormatado(it.toLong().toString(), it.toLong().toString()) }
            "categoria" -> (valor as? CategoriaElemento)?.let { ValorFormatado(rotuloCategoria(it), rotuloCategoria(it)) }
            "estado" -> (valor as? net.saibatudo.quimica.data.model.EstadoFisico)?.let { ValorFormatado(it.rotulo.lowercase(), it.rotulo.lowercase()) }
            "lista" -> (valor as? List<*>)?.let { l -> l.joinToString(", ") { x -> (x as? Number)?.toInt()?.let { n -> if (n > 0) "+$n" else "$n" } ?: x.toString() } }?.let { ValorFormatado(it, it) }
            "formula" -> (valor as? String)?.let { ValorFormatado(Texto.formulaUnicode(it), Texto.formulaUnicode(it)) }
            "descoberta" -> (valor as? Pair<*, *>)?.let { (ano, por) ->
                val t = listOfNotNull((ano as? Int)?.toString(), (por as? String)?.takeIf { it.isNotBlank() }?.let { "por $it" }).joinToString(" ")
                t.takeIf { it.isNotBlank() }?.let { ValorFormatado(it, it) }
            }
            else -> valor.toString().takeIf { it.isNotBlank() }?.let { ValorFormatado(it, it) }
        }
    }

    // ---- fichas ----------------------------------------------------------------------------------------------------------------

    private val ELEMENTO_BASICAS = listOf("numeroAtomico", "massaAtomica", "categoria", "grupo", "periodo", "estadoPadrao")
    private val ELEMENTO_MEDIO = ELEMENTO_BASICAS + listOf("bloco", "configuracaoEletronica", "eletronegatividade", "pontoFusao", "pontoEbulicao", "densidade", "estadosOxidacao", "descoberta")

    /** Linhas da ficha do elemento; o nível controla quantas propriedades aparecem. */
    fun fichaElemento(e: Elemento, tabela: List<PropriedadeDef>, un: Unidades, nivel: Nivel): List<LinhaFicha> {
        val defs = tabela.filter { it.alvo == "elemento" || it.alvo == "ambos" }
        val ids: List<String> = when (nivel) {
            Nivel.FUNDAMENTAL -> ELEMENTO_BASICAS
            Nivel.MEDIO -> ELEMENTO_MEDIO
            Nivel.SUPERIOR -> defs.map { it.id }
        }
        return ids.mapNotNull { id ->
            val d = defs.firstOrNull { it.id == id } ?: return@mapNotNull null
            if (id == "simbolo") return@mapNotNull null
            val v = formatar(d, bruto(d, e), un, nivel) ?: return@mapNotNull null
            LinhaFicha(d.rotulo.replaceFirstChar { it.uppercase() }, v.texto)
        }
    }

    private val COMPOSTO_BASICAS = listOf("formula", "massaMolar", "cas", "pontoFusao", "pontoEbulicao", "densidade")

    /** Linhas de propriedades do composto (identificadores ficam em bloco próprio na tela). */
    fun fichaComposto(c: Composto, tabela: List<PropriedadeDef>, un: Unidades, nivel: Nivel): List<LinhaFicha> {
        val defs = tabela.filter { it.alvo == "composto" || it.alvo == "ambos" || it.campo?.let { campo -> c.propriedades.containsKey(campo) } == true }
        val usados = mutableSetOf<String>()
        val linhas = mutableListOf<LinhaFicha>()
        val ordem: List<PropriedadeDef> = when (nivel) {
            Nivel.FUNDAMENTAL -> COMPOSTO_BASICAS.mapNotNull { id -> tabela.firstOrNull { it.id == id } }
            else -> defs
        }
        for (d in ordem) {
            if (d.id in setOf("cid", "smiles", "inchiKey", "nomeIupac", "cas")) continue
            val v = formatar(d, bruto(d, c), un, nivel) ?: continue
            if (usados.add(d.id)) linhas += LinhaFicha(d.rotulo.replaceFirstChar { it.uppercase() }, v.texto)
        }
        // propriedades numéricas do pacote que a tabela não nomeia: rótulo derivado da chave
        if (nivel == Nivel.SUPERIOR) {
            val conhecidos = tabela.mapNotNull { it.campo }.toSet()
            for ((chave, valor) in c.propriedades) {
                if (chave in conhecidos) continue
                linhas += LinhaFicha(rotuloDeChave(chave), Texto.significativos(valor, 7) + sufixoPorChave(chave))
            }
        }
        return linhas
    }

    private fun rotuloDeChave(chave: String): String =
        chave.replace(Regex("([a-z])([A-Z])"), "$1 $2").replace(Regex("(K|Pa|Kgm3|Pm|KJmol)$"), "").trim().replaceFirstChar { it.uppercase() }

    private fun sufixoPorChave(chave: String): String = when {
        chave.endsWith("Kgm3") -> " kg/m³"
        chave.endsWith("KJmol") -> " kJ/mol"
        chave.endsWith("Pm") -> " pm"
        chave.endsWith("K") -> " K"
        chave.endsWith("Pa") -> " Pa"
        else -> ""
    }
}
