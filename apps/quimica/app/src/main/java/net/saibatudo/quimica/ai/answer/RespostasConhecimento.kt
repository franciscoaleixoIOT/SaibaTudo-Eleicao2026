package net.saibatudo.quimica.ai.answer

import net.saibatudo.quimica.ai.model.Acao
import net.saibatudo.quimica.ai.model.Bloco
import net.saibatudo.quimica.ai.model.Intent
import net.saibatudo.quimica.ai.model.ParsedQuery
import net.saibatudo.quimica.ai.model.Resposta
import net.saibatudo.quimica.ai.nlu.LocalNlu
import net.saibatudo.quimica.data.model.CategoriaElemento
import net.saibatudo.quimica.data.model.Elemento
import net.saibatudo.quimica.data.model.Fonte
import net.saibatudo.quimica.data.model.PropriedadeDef
import net.saibatudo.quimica.data.model.Trecho
import net.saibatudo.quimica.domain.Propriedades
import net.saibatudo.quimica.domain.Texto

// ---- tabela periódica ------------------------------------------------------------------------------------------------------------

private fun AnswerBuilder.numerico(def: PropriedadeDef, e: Elemento): Double? = (Propriedades.bruto(def, e) as? Number)?.toDouble()

private fun rotuloElemento(e: Elemento) = "${e.nome} (${e.simbolo})"

private val CATEGORIAS_METAL = setOf(
    CategoriaElemento.METAL_ALCALINO, CategoriaElemento.METAL_ALCALINO_TERROSO, CategoriaElemento.METAL_TRANSICAO,
    CategoriaElemento.METAL_POS_TRANSICAO, CategoriaElemento.LANTANIDEO, CategoriaElemento.ACTINIDEO
)

internal suspend fun AnswerBuilder.tabelaPeriodica(q: ParsedQuery): Resposta {
    val acoes = listOf<Acao>(Acao.AbrirTabela())
    var escopo: List<Elemento> = pacote.elementos
    val partes = mutableListOf<String>()
    q.grupo?.let { g -> escopo = escopo.filter { it.grupo == g }; partes += "grupo $g" }
    q.periodo?.let { p -> escopo = escopo.filter { it.periodo == p }; partes += "período $p" }
    q.bloco?.let { b -> escopo = escopo.filter { it.bloco == b }; partes += "bloco $b" }
    q.categoria?.let { id ->
        if (id == "metal") { escopo = escopo.filter { it.categoria in CATEGORIAS_METAL }; partes += "metais" }
        else { val c = CategoriaElemento.de(id); escopo = escopo.filter { it.categoria == c }; partes += c.rotulo.lowercase() }
    }
    q.estado?.let { s -> escopo = escopo.filter { it.estadoPadrao.id == s }; partes += "estado ${pacote.elementos.firstOrNull { it.estadoPadrao.id == s }?.estadoPadrao?.rotulo?.lowercase() ?: s}" }
    val def = (q.extremo?.first ?: q.propriedade)?.let { dic.propriedade(it) }
    val temEscopo = partes.isNotEmpty()
    val fontes = escopo.flatMap { it.fontes }.distinctBy { it.nome }.take(2)

    // extremos: "elemento mais eletronegativo"
    if (q.extremo != null && def != null) {
        val menor = q.extremo.second == "min"
        val ordenados = escopo.mapNotNull { e -> numerico(def, e)?.let { e to it } }.sortedBy { if (menor) it.second else -it.second }
        if (ordenados.isEmpty()) return semDado(q, "O pacote de dados não traz ${def.rotulo} para esses elementos.")
        val topo = ordenados.take(3)
        val onde = if (temEscopo) " (${partes.joinToString(", ")})" else ""
        val primeiro = topo[0].first
        val blocos = listOf<Bloco>(
            Bloco.Paragrafo("Entre os elementos do pacote com esse dado$onde, ${if (menor) "o menor" else "o maior"} valor de ${def.rotulo} é de ${rotuloElemento(primeiro)}: ${Propriedades.formatar(def, Propriedades.bruto(def, primeiro), un, nivel)?.curto}."),
            Bloco.Lista(topo.map { (e, _) -> "${rotuloElemento(e)}: ${Propriedades.formatar(def, Propriedades.bruto(def, e), un, nivel)?.curto}" })
        )
        return Resposta(
            Intent.TABELA_PERIODICA, "${if (menor) "Menor" else "Maior"} ${def.rotulo}", blocos,
            fontes = topo.flatMap { it.first.fontes }.distinctBy { it.nome }.take(2).ifEmpty { fontesDoPacote() }, acoes = acoes + Acao.AbrirElemento(primeiro.z, "Abrir ${primeiro.nome}")
        )
    }

    // tendências ao longo de um período e de um grupo, lidas dos próprios dados
    if (q.tendencia) {
        if (def == null) {
            return Resposta(
                Intent.TABELA_PERIODICA, "Tendências periódicas",
                listOf(Bloco.Paragrafo("De qual propriedade? Por exemplo: eletronegatividade, raio atômico ou energia de ionização.")),
                acoes = acoes, sugestoes = listOf("Tendência da eletronegatividade ao longo do período 2"), entendida = false
            )
        }
        val blocos = mutableListOf<Bloco>()
        val comValor = pacote.elementos.filter { it.periodo != null && it.grupo != null && numerico(def, it) != null }
        val periodos = comValor.groupBy { it.periodo!! }
        val grupos = comValor.groupBy { it.grupo!! }
        val p = q.periodo ?: periodos.maxByOrNull { it.value.size }?.key
        val g = q.grupo ?: grupos.maxByOrNull { it.value.size }?.key
        if (p != null) {
            val seq = periodos[p].orEmpty().sortedBy { it.grupo }
            if (seq.size >= 2) blocos += Bloco.Paragrafo("Ao longo do período $p (da esquerda para a direita), segundo os dados: " + descrever(def, seq))
        }
        if (g != null && q.periodo == null) {
            val seq = grupos[g].orEmpty().sortedBy { it.periodo }
            if (seq.size >= 2) blocos += Bloco.Paragrafo("Descendo no grupo $g, segundo os dados: " + descrever(def, seq))
        }
        if (blocos.isEmpty()) return semDado(q, "O pacote de dados não traz elementos suficientes com ${def.rotulo} para mostrar a tendência.")
        return Resposta(Intent.TABELA_PERIODICA, "Tendência: ${def.rotulo}", blocos, fontes = fontes.ifEmpty { fontesDoPacote() }, acoes = acoes)
    }

    if (temEscopo) {
        if (escopo.isEmpty()) return semDado(q, "Não há elementos do pacote de dados para ${partes.joinToString(", ")}.")
        val titulo = "Elementos: ${partes.joinToString(", ")}"
        val linhas = escopo.sortedBy { it.z }.map { e ->
            val extra = def?.let { d -> Propriedades.formatar(d, Propriedades.bruto(d, e), un, nivel)?.curto?.let { " – $it" } }.orEmpty()
            "${rotuloElemento(e)}, Z = ${e.z}$extra"
        }
        return Resposta(
            Intent.TABELA_PERIODICA, titulo, listOf(Bloco.Paragrafo("${escopo.size} elemento(s) no pacote de dados."), Bloco.Lista(linhas)),
            fontes = fontes.ifEmpty { fontesDoPacote() }, acoes = acoes + escopo.take(3).map { Acao.AbrirElemento(it.z, "Abrir ${it.nome}") }
        )
    }

    val porCategoria = pacote.elementos.groupBy { it.categoria }.entries.sortedBy { it.key.ordinal }
    return Resposta(
        Intent.TABELA_PERIODICA, "Tabela periódica",
        listOf(
            Bloco.Paragrafo("A tabela do app tem ${pacote.elementos.size} elementos, organizados por grupo (colunas) e período (linhas), com cores por categoria."),
            Bloco.Lista(porCategoria.map { (c, l) -> "${c.rotulo}: ${l.size}" })
        ),
        fontes = fontesDoPacote(), acoes = acoes, sugestoes = listOf("Quais são os halogênios?", "Qual elemento é o mais eletronegativo?")
    )
}

/** Sequência "A v1 → B v2 → …" com os valores formatados, e a direção calculada dos próprios números. */
private fun AnswerBuilder.descrever(def: PropriedadeDef, seq: List<Elemento>): String {
    val sequencia = seq.joinToString(" → ") { "${it.simbolo} ${Propriedades.formatar(def, Propriedades.bruto(def, it), un, nivel)?.curto}" }
    val v = seq.mapNotNull { numerico(def, it) }
    if (v.size < 2) return sequencia
    val sobe = v.zipWithNext().count { (a, b) -> b > a }
    val desce = v.zipWithNext().count { (a, b) -> b < a }
    val passos = v.size - 1
    val resumo = when {
        sobe == passos -> "O valor aumenta em todos os $passos passos."
        desce == passos -> "O valor diminui em todos os $passos passos."
        sobe > desce -> "O valor aumenta em $sobe dos $passos passos."
        desce > sobe -> "O valor diminui em $desce dos $passos passos."
        else -> "Não há tendência única nesta sequência."
    }
    return "$sequencia. $resumo"
}

// ---- conceito (textos licenciados) -------------------------------------------------------------------------------------------------

internal suspend fun AnswerBuilder.buscarConceito(q: ParsedQuery): Resposta {
    val tema = Texto.nlu(q.conceito.orEmpty())
    val palavras = LocalNlu.termosDeBusca(tema).filter { it.length >= 3 }
    val trechos = pacote.trechos()
    fun pontos(t: Trecho): Int {
        var s = 0
        val chaves = t.palavrasChave.map { Texto.nlu(it) }
        val titulo = Texto.nlu(t.titulo.orEmpty() + " " + t.secao.orEmpty())
        val corpo = Texto.nlu(t.textoPt ?: t.textoOriginal.orEmpty())
        if (tema.isNotBlank()) {
            if (chaves.any { it == tema }) s += 10
            if (titulo.contains(tema)) s += 6
        }
        for (p in palavras) {
            if (chaves.any { it == p || it.split(' ').contains(p) }) s += 3
            if (titulo.split(' ').contains(p)) s += 2
            if (corpo.split(' ').contains(p)) s += 1
        }
        return s
    }
    val melhor = trechos.map { it to pontos(it) }.filter { it.second >= 3 }.maxByOrNull { it.second }?.first
    if (melhor == null) {
        return Resposta(
            Intent.CONCEITO, "Ainda não tenho um texto sobre isso",
            listOf(Bloco.Paragrafo("Os textos de explicação do app vêm de fontes abertas e licenciadas, e ainda não há um trecho sobre${if (tema.isBlank()) " esse assunto" else " \"$tema\""}. Não vou responder de memória.")),
            sugestoes = sugestoes(4), entendida = false
        )
    }
    val texto = melhor.textoPt ?: melhor.textoOriginal.orEmpty()
    val blocos = mutableListOf<Bloco>(Bloco.Paragrafo(texto))
    if (melhor.traducao?.contains("automática", true) == true) blocos += Bloco.Aviso("Tradução automática, ainda não revisada por uma pessoa.")
    val fonte = Fonte(
        nome = buildString { append(melhor.fonte); melhor.secao?.let { append(", ").append(it) } },
        url = melhor.url, licenca = melhor.licenca
    )
    return Resposta(Intent.CONCEITO, melhor.titulo ?: tema.replaceFirstChar { it.uppercase() }, blocos, fontes = listOf(fonte))
}

// ---- não entendi + sugestões ---------------------------------------------------------------------------------------------------------

/** Perguntas corrigidas por erro de digitação (cada uma conferida: é compreendida e respondida). */
internal suspend fun AnswerBuilder.correcoes(original: String): List<String> {
    val saida = mutableListOf<String>()
    val chave = Texto.nlu(original)
    for (p in chave.split(' ')) {
        for (nome in dic.nomesProximos(p, 2)) {
            val nova = Regex("""(?i)\b${Regex.escape(p)}\b""").replace(chave) { nome.lowercase() }
            val (_, resp) = responderSemRecursao(nova)
            if (resp != null) saida += nova.replaceFirstChar { it.uppercase() } + if (original.trimEnd().endsWith("?")) "?" else ""
        }
    }
    return saida.distinct()
}

internal suspend fun AnswerBuilder.respostaNaoEntendi(q: ParsedQuery): Resposta {
    val blocos = mutableListOf<Bloco>(Bloco.Paragrafo("Não entendi a pergunta. Tente citar um elemento, um composto ou uma fórmula, e o que você quer saber (propriedade, massa molar, estrutura, perigos ou um cálculo)."))
    val sugeridas = correcoes(q.textoOriginal)
    if (sugeridas.isNotEmpty()) blocos += Bloco.Paragrafo("Você quis dizer: ${sugeridas.first()}")
    val outras = sugestoes(6).filter { it !in sugeridas }
    return Resposta(Intent.DESCONHECIDA, "Não entendi", blocos, sugestoes = (sugeridas.take(2) + outras).take(6), entendida = false)
}

/** Interpreta e responde sem gerar o fluxo de "não entendi" (usado para validar sugestões). */
internal suspend fun AnswerBuilder.responderSemRecursao(pergunta: String): Pair<ParsedQuery, Resposta?> {
    val q = LocalNlu.parse(pergunta, dic)
    if (q.intent == Intent.DESCONHECIDA || q.intent == Intent.RECUSA_PERIGO) return q to null
    val r = try { construir(q, corrigir = false) } catch (_: Exception) { null }
    return q to r?.takeIf { it.entendida }
}

/**
 * Perguntas que o app SABE responder, montadas dos dados do pacote e conferidas (cada uma é interpretada e respondida
 * antes de ser oferecida). Nunca sugere pergunta que cairia em "não entendi" ou em "sem dado".
 */
suspend fun AnswerBuilder.sugestoes(max: Int = 6): List<String> {
    sugestoesCache?.let { return it.take(max) }
    val candidatas = mutableListOf<String>()
    val elementos = pacote.elementos
    elementos.firstOrNull { it.pontoFusaoK != null }?.let { candidatas += "Qual o ponto de fusão de ${it.nome}?" }
    candidatas += "Converter 25 °C para K"
    val h = pacote.elemento("H")
    val o = pacote.elemento("O")
    if (h != null && o != null) candidatas += "Balancear H2 + O2 -> H2O"
    if (pacote.elemento("Ca") != null && h != null && o != null) candidatas += "Massa molar do Ca(OH)2"
    elementos.firstOrNull { it.eletronegatividade != null && it.z > 8 }?.let { candidatas += "Qual a eletronegatividade de ${it.nome}?" }
    // compostos do índice
    for (e in pacote.indice.entradas.take(60)) {
        val c = pacote.composto(e.cid) ?: continue
        val nome = c.nomeExibicao
        if (c.smiles != null && candidatas.none { it.startsWith("Desenhe") }) candidatas += "Desenhe a estrutura de $nome"
        val g = c.ghs
        if (g != null && g.pictogramas.isNotEmpty() && candidatas.none { it.startsWith("Quais os perigos") }) candidatas += "Quais os perigos de $nome?"
        if (c.massaMolar != null && candidatas.none { it.startsWith("Qual a massa molar de") }) candidatas += "Qual a massa molar de $nome?"
        if (candidatas.size >= 14) break
    }
    pacote.trechos().firstOrNull { !it.titulo.isNullOrBlank() }?.let { candidatas += "O que é ${it.titulo!!.lowercase()}?" }
    if (pacote.elemento("Cl") != null && h != null) candidatas += "Qual o pH de HCl 0,01 mol/L?"
    candidatas += "Quais são os halogênios?"
    val validas = mutableListOf<String>()
    for (c in candidatas.distinct()) {
        val (_, r) = responderSemRecursao(c)
        if (r != null && !r.recusa && r.intent != Intent.AJUDA) validas += c
        if (validas.size >= 12) break
    }
    sugestoesCache = validas
    return validas.take(max)
}
