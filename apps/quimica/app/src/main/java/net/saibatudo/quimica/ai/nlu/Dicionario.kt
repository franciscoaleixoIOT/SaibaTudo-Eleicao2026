package net.saibatudo.quimica.ai.nlu

import net.saibatudo.quimica.data.model.Composto
import net.saibatudo.quimica.data.model.PropriedadeDef
import net.saibatudo.quimica.data.repository.Pacote
import net.saibatudo.quimica.domain.Propriedades
import net.saibatudo.quimica.domain.Texto
import net.saibatudo.quimica.domain.calc.FormulaQuimica
import net.saibatudo.quimica.domain.calc.Unidades

/** Entidade achada na pergunta. [via]: nome, simbolo, formula, cas, cid ou aproximado (erro de digitação). */
data class Achado(
    val tipo: Tipo,
    val via: String,
    val pos: Double,
    val simbolo: String? = null,
    val cid: Long? = null,
    val nome: String? = null,
    /** Fórmula na grafia normalizada (para tipo FORMULA e para composto achado por fórmula). */
    val texto: String? = null
) {
    enum class Tipo { ELEMENTO, COMPOSTO, FORMULA }
}

/** Entidades da pergunta, na ordem em que aparecem. */
data class Entidades(
    val elementos: List<Achado> = emptyList(),
    val compostos: List<Achado> = emptyList(),
    val formulas: List<Achado> = emptyList()
)

data class PropriedadeAchada(val id: String, val alvo: String, val pos: Int)

/** Resultado da busca por nome, símbolo, fórmula, CAS ou CID. */
data class ResultadoBusca(val ehElemento: Boolean, val titulo: String, val detalhe: String, val z: Int? = null, val cid: Long? = null, val pontos: Int = 0)

/**
 * Dicionário do NLU, derivado dos DADOS do pacote: nomes de elementos e compostos (PT, EN, IUPAC, populares, sinônimos),
 * fórmulas, CAS e sinônimos de propriedades. Nada é embutido por elemento ou composto. Espelha
 * web/src/quimica/js/dicionario.js.
 */
class Dicionario private constructor(
    val pacote: Pacote,
    private val entradas: List<EntradaDic>,
    private val nomesPorCid: Map<Long, String>
) {
    class EntradaDic(val cid: Long, val nomes: List<String>, val formula: String?, val cas: String?)

    val unidades: Unidades = Unidades.de(pacote.regras)
    val propriedades: List<PropriedadeDef> = Propriedades.tabela(pacote.regras)
    private val propPorId: Map<String, PropriedadeDef> = propriedades.associateBy { it.id }

    private val nomesElemento: List<Pair<String, String>>
    private val nomesComposto: List<Pair<String, Long>>
    private val formulaParaCid = HashMap<String, Long>()
    private val casParaCid = HashMap<String, Long>()
    private val sinonimosPropriedade: List<Triple<String, String, String>>
    val totalCompostos: Int = entradas.size

    init {
        val el = LinkedHashMap<String, String>()
        for (e in pacote.elementos) {
            for (n in listOfNotNull(e.nome, e.nomeEn)) {
                val k = Texto.nlu(n)
                if (k.length >= 3 && !el.containsKey(k)) el[k] = e.simbolo
            }
        }
        nomesElemento = el.map { (k, s) -> k to s }.sortedByDescending { it.first.length }

        val co = LinkedHashMap<String, Long>()
        // prioridade: o primeiro nome de cada composto (nome em português), depois os demais
        for (passo in 0..1) {
            for (e in entradas) {
                val nomes = if (passo == 0) e.nomes.take(1) else e.nomes.drop(1)
                for (n in nomes) {
                    val k = Texto.nlu(n)
                    // um termo que é, ele mesmo, nome de ELEMENTO (ex.: "oxigênio" = O2) fica para o matcher de elementos; "gás oxigênio", "O2" seguem casando
                    if (k.length >= 3 && !k.all { it.isDigit() } && !co.containsKey(k) && !el.containsKey(k)) co[k] = e.cid
                }
            }
        }
        nomesComposto = co.map { (k, c) -> k to c }.sortedByDescending { it.first.length }

        for (e in entradas) {
            e.formula?.let { f -> formulaParaCid.putIfAbsent(chaveFormula(f), e.cid) }
            e.cas?.let { casParaCid[it] = e.cid }
        }
        sinonimosPropriedade = propriedades.flatMap { p -> (listOf(p.rotulo) + p.sinonimos).map { Triple(Texto.nlu(it), p.id, p.alvo) } }
            .filter { it.first.isNotEmpty() }.sortedByDescending { it.first.length }
    }

    fun propriedade(id: String): PropriedadeDef? = propPorId[id]
    fun nomeDoComposto(cid: Long): String? = nomesPorCid[cid]
    fun nomeDoElemento(simbolo: String): String = pacote.porSimbolo[simbolo]?.nome ?: simbolo
    /** Nomes (sem acento, minúsculos, com a pontuação original dos nomes simples) e fórmula do composto, para casar com o texto. */
    fun nomesEFormulaDe(cid: Long): List<String> {
        val nomes = nomesComposto.filter { it.second == cid }.map { it.first }
        val formula = formulaParaCid.entries.firstOrNull { it.value == cid }?.key
        return (nomes + listOfNotNull(formula)).sortedByDescending { it.length }
    }

    fun compostoPorFormula(formula: String): Long? = formulaParaCid[chaveFormula(formula)]
    fun compostoPorNome(nome: String): Long? = nomesComposto.firstOrNull { it.first == Texto.nlu(nome) }?.second
    fun elementoPorNome(nome: String): String? = nomesElemento.firstOrNull { it.first == Texto.nlu(nome) }?.second
    fun categoriaOuNull(): Nothing? = null

    // ---- fórmulas digitadas ------------------------------------------------------------------------------------------------------------

    private val SIMBOLOS_MIN: Map<String, String> = FormulaQuimica.SIMBOLOS.associateBy { it.lowercase() }

    /** "nacl" → "NaCl" (única segmentação válida em símbolos); null se não houver uma só. */
    fun recuperarCaixa(token: String): String? {
        val t = token.lowercase()
        if (!Regex("^[a-z0-9()]+$").matches(t) || !t.any { it in 'a'..'z' }) return null
        val resultados = mutableListOf<String>()
        fun dfs(i: Int, acc: String) {
            if (resultados.size > 2) return
            if (i == t.length) { resultados += acc; return }
            val c = t[i]
            if (c.isDigit() || c == '(' || c == ')') { dfs(i + 1, acc + c); return }
            if (i + 2 <= t.length) {
                val dois = t.substring(i, i + 2)
                if (dois.all { it in 'a'..'z' }) SIMBOLOS_MIN[dois]?.let { dfs(i + 2, acc + it) }
            }
            SIMBOLOS_MIN[c.toString()]?.let { dfs(i + 1, acc + it) }
        }
        dfs(0, "")
        val validos = resultados.filter { FormulaQuimica.tentar(it) != null }.distinct()
        return if (validos.size == 1) validos[0] else null
    }

    // ---- entidades ---------------------------------------------------------------------------------------------------------------------

    private val RX_CID = Regex("""\bCID\s*[:#]?\s*(\d{1,9})\b""", RegexOption.IGNORE_CASE)
    private val RX_CAS = Regex("""\b(\d{2,7}-\d{2}-\d)\b""")
    private val RX_TOKEN_FORMULA = Regex("""^[A-Za-z0-9()·.*+^\-−₀-₉⁰-⁹⁺⁻]+$""")
    private val RX_CUE_ELEMENTO = Regex("""\b(elemento|s[ií]mbolo|s[ií]mbolo qu[ií]mico)\b""", RegexOption.IGNORE_CASE)

    fun cueElemento(texto: String) = RX_CUE_ELEMENTO.containsMatchIn(texto)

    fun entidades(original: String): Entidades {
        val texto = original
        val n = Texto.nlu(texto)
        val usado = BooleanArray(n.length)
        val achados = mutableListOf<Achado>()
        fun livre(i: Int, j: Int): Boolean { for (k in i until j) if (usado[k]) return false; return true }
        fun marcar(i: Int, j: Int) { for (k in i until j) usado[k] = true }
        fun limite(i: Int, j: Int) = (i == 0 || n[i - 1] == ' ') && (j == n.length || n[j] == ' ')
        fun procurar(chave: String, fn: (Int) -> Unit) {
            var i = n.indexOf(chave)
            while (i != -1) {
                val j = i + chave.length
                if (limite(i, j) && livre(i, j)) { marcar(i, j); fn(i) }
                i = n.indexOf(chave, i + 1)
            }
        }
        val tam = maxOf(texto.length, 1).toDouble()
        val tamN = maxOf(n.length, 1).toDouble()

        // 1) CID e CAS explícitos
        for (m in RX_CID.findAll(texto)) {
            val cid = m.groupValues[1].toLongOrNull() ?: continue
            if (pacote.indice.entrada(cid) != null) achados += Achado(Achado.Tipo.COMPOSTO, "cid", m.range.first / tam, cid = cid, nome = nomesPorCid[cid])
        }
        for (m in RX_CAS.findAll(texto)) {
            casParaCid[m.groupValues[1]]?.let { cid -> achados += Achado(Achado.Tipo.COMPOSTO, "cas", m.range.first / tam, cid = cid, nome = nomesPorCid[cid]) }
        }

        // 2) nomes de compostos (mais longos primeiro) e de elementos
        for ((chave, cid) in nomesComposto) procurar(chave) { i -> achados += Achado(Achado.Tipo.COMPOSTO, "nome", i / tamN, cid = cid, nome = nomesPorCid[cid]) }
        for ((chave, simbolo) in nomesElemento) procurar(chave) { i -> achados += Achado(Achado.Tipo.ELEMENTO, "nome", i / tamN, simbolo = simbolo, nome = nomeDoElemento(simbolo)) }

        // 3) fórmulas e símbolos digitados (na caixa original)
        val toks = tokensOriginais(texto)
        val total = maxOf(toks.size, 1).toDouble()
        val unico = toks.size == 1
        for ((idx, t) in toks.withIndex()) {
            val pos = idx / total
            if (!RX_TOKEN_FORMULA.matches(t) || !t.any { it in 'A'..'Z' || it in 'a'..'z' }) continue
            if (t.uppercase() in NAO_FORMULAS) continue
            val temDigito = t.any { it.isDigit() }
            val properCase = t.first() in 'A'..'Z' || t.first() == '('
            val f = if (properCase) FormulaQuimica.tentar(t) else null
            val nEl = f?.contagem?.size ?: 0
            val cid = formulaParaCid[chaveFormula(t)]
            // A) fórmula conhecida do índice
            if (cid != null) {
                val minuscula = Regex("^[a-z0-9()]+$").matches(t)
                val aceita = temDigito || (f != null && nEl >= 2) || (minuscula && t.length >= 3 && t !in STOP_PALAVRAS && recuperarCaixa(t) != null)
                if (aceita) { achados += Achado(Achado.Tipo.COMPOSTO, "formula", pos, cid = cid, nome = nomesPorCid[cid], texto = t); continue }
            }
            // B) fórmula bem escrita fora do índice; C) símbolo de um elemento
            if (f != null) {
                if (!f.ehSimboloSimples) {
                    val palavraComum = !temDigito && !Regex("[()·+^-]").containsMatchIn(t) && t.count { it in 'A'..'Z' } < 2
                    if (!palavraComum && (nEl >= 2 || temDigito || f.carga != 0)) {
                        achados += Achado(Achado.Tipo.FORMULA, "formula", pos, texto = f.texto)
                        continue
                    }
                } else {
                    val s = f.contagem.keys.first()
                    val ambiguo = s.length == 2 && s in SIMBOLOS_AMBIGUOS && idx == 0 && !unico
                    if (!ambiguo && (s.length == 2 || unico || cueElemento(texto))) {
                        achados += Achado(Achado.Tipo.ELEMENTO, "simbolo", pos, simbolo = s, nome = nomeDoElemento(s))
                        continue
                    }
                }
            }
            // D) minúsculas com dígito ("h2so4", "c2h5oh") fora do índice
            if (!properCase && temDigito && Regex("^[a-z0-9()]+$").matches(t)) {
                val rec = recuperarCaixa(t)
                val ff = rec?.let { FormulaQuimica.tentar(it) }
                if (ff != null) achados += Achado(Achado.Tipo.FORMULA, "formula", pos, texto = ff.texto)
            }
        }

        // 4) aproximação por erro de digitação (só se nada foi achado)
        if (achados.isEmpty()) aproximar(n)?.let { achados += it }

        // saída organizada, sem repetir a mesma entidade
        achados.sortBy { it.pos }
        val vistosEl = HashSet<String>()
        val vistosCo = HashSet<Long>()
        val elementos = mutableListOf<Achado>()
        val compostos = mutableListOf<Achado>()
        val formulas = mutableListOf<Achado>()
        for (a in achados) {
            when (a.tipo) {
                Achado.Tipo.ELEMENTO -> if (vistosEl.add(a.simbolo!!)) elementos += a
                Achado.Tipo.COMPOSTO -> if (vistosCo.add(a.cid!!)) compostos += a else if (a.texto != null) {
                    // o mesmo composto citado por nome e por fórmula digitada: guarda a fórmula como o usuário a escreveu
                    val i = compostos.indexOfFirst { it.cid == a.cid }
                    if (i >= 0 && compostos[i].texto == null) compostos[i] = a.copy(pos = compostos[i].pos)
                }
                Achado.Tipo.FORMULA -> if (formulas.none { it.texto == a.texto }) formulas += a
            }
        }
        // uma fórmula que o índice conhece é o composto (sem duplicar)
        for (f in formulas.toList()) {
            val cid = formulaParaCid[chaveFormula(f.texto!!)] ?: continue
            if (vistosCo.add(cid)) compostos += Achado(Achado.Tipo.COMPOSTO, "formula", f.pos, cid = cid, nome = nomesPorCid[cid], texto = f.texto)
            formulas.remove(f)
        }
        return Entidades(elementos, compostos, formulas)
    }

    /** Erro de digitação em nomes (distância de edição 1 ou 2): "oxigenioo" → oxigênio, "acido sulfuico". */
    fun aproximar(n: String): Achado? {
        val palavras = n.split(' ').filter { it.isNotEmpty() }
        var melhor: Triple<Int, Achado, Double>? = null
        for (tam in 3 downTo 1) {
            var i = 0
            while (i + tam <= palavras.size) {
                val janela = palavras.subList(i, i + tam)
                val frase = janela.joinToString(" ")
                i++
                if (frase.length < 5 || janela.all { it in PALAVRAS_FUNCIONAIS }) continue
                // frases com mais de uma palavra só aproximam com 1 edição (evita "ácido fraco" → "ácido úrico")
                val lim = if (frase.length >= 10 && tam == 1) 2 else 1
                for ((chave, simbolo) in nomesElemento) {
                    if (kotlin.math.abs(chave.length - frase.length) > lim) continue
                    val d = Texto.distancia(frase, chave, lim)
                    if (d <= lim && (melhor == null || d < melhor.first)) {
                        melhor = Triple(d, Achado(Achado.Tipo.ELEMENTO, "aproximado", (i - 1).toDouble() / maxOf(palavras.size, 1), simbolo = simbolo, nome = nomeDoElemento(simbolo)), 0.0)
                    }
                }
                for ((chave, cid) in nomesComposto) {
                    if (kotlin.math.abs(chave.length - frase.length) > lim || chave.count { it == ' ' } + 1 != tam) continue
                    val d = Texto.distancia(frase, chave, lim)
                    if (d <= lim && (melhor == null || d < melhor.first)) {
                        melhor = Triple(d, Achado(Achado.Tipo.COMPOSTO, "aproximado", (i - 1).toDouble() / maxOf(palavras.size, 1), cid = cid, nome = nomesPorCid[cid]), 0.0)
                    }
                }
                if (melhor != null) return melhor.second
            }
        }
        return null
    }

    /** Nomes parecidos com a pergunta (para "Você quis dizer…"), com o nome em português. */
    fun nomesProximos(palavra: String, max: Int = 3): List<String> {
        if (palavra.length < 5) return emptyList()
        val lim = if (palavra.length >= 10) 2 else 1
        val achados = mutableListOf<Pair<Int, String>>()
        for ((chave, simbolo) in nomesElemento) {
            if (chave == palavra) return emptyList()
            if (kotlin.math.abs(chave.length - palavra.length) > lim) continue
            val d = Texto.distancia(palavra, chave, lim)
            if (d <= lim) achados += d to nomeDoElemento(simbolo)
        }
        for ((chave, cid) in nomesComposto) {
            if (chave == palavra) return emptyList()
            if (chave.contains(' ') || kotlin.math.abs(chave.length - palavra.length) > lim) continue
            val d = Texto.distancia(palavra, chave, lim)
            if (d <= lim) achados += d to (nomesPorCid[cid] ?: chave)
        }
        return achados.sortedBy { it.first }.map { it.second }.distinct().take(max)
    }

    /**
     * Busca de elementos e compostos por nome (PT, EN, IUPAC, populares, sinônimos), símbolo, número atômico, fórmula, CAS ou
     * CID. Quanto mais exata a correspondência, mais alto o resultado.
     */
    fun buscar(consulta: String, limite: Int = 40): List<ResultadoBusca> {
        val bruta = consulta.trim()
        val q = Texto.nlu(bruta)
        if (q.isEmpty() && bruta.isEmpty()) return emptyList()
        val formulaQ = chaveFormula(bruta)
        val saida = mutableListOf<ResultadoBusca>()
        fun pontosDe(candidato: String): Int = when {
            candidato == q -> 100
            candidato.startsWith("$q ") || candidato.startsWith(q) -> 80
            candidato.contains(" $q") -> 60
            q.length >= 3 && candidato.contains(q) -> 40
            else -> 0
        }
        for (e in pacote.elementos) {
            var p = 0
            val z = bruta.toIntOrNull()
            if (z != null && z == e.z) p = 95
            if (bruta.equals(e.simbolo, ignoreCase = true)) p = maxOf(p, if (bruta == e.simbolo) 98 else 90)
            for (n in listOfNotNull(e.nome, e.nomeEn)) p = maxOf(p, pontosDe(Texto.nlu(n)))
            if (p > 0) saida += ResultadoBusca(true, "${e.nome} (${e.simbolo})", "Elemento ${e.z}" + (e.massaAtomica?.let { " · " + Texto.numero(it, 4) + " u" } ?: ""), z = e.z, pontos = p)
        }
        for (en in entradas) {
            var p = 0
            for (n in en.nomes) p = maxOf(p, pontosDe(Texto.nlu(n)))
            en.formula?.let { f ->
                val kf = chaveFormula(f)
                if (kf == formulaQ) p = maxOf(p, 92) else if (formulaQ.length >= 2 && kf.startsWith(formulaQ)) p = maxOf(p, 50)
            }
            en.cas?.let { c -> if (c == bruta) p = maxOf(p, 96) else if (bruta.length >= 4 && bruta.all { it.isDigit() || it == '-' } && c.contains(bruta)) p = maxOf(p, 30) }
            if (bruta.all { it.isDigit() } && bruta.toLongOrNull() == en.cid) p = maxOf(p, 90)
            if (p > 0) {
                val nome = nomesPorCid[en.cid] ?: en.nomes.firstOrNull() ?: "CID ${en.cid}"
                saida += ResultadoBusca(false, nome, listOfNotNull(en.formula?.let { Texto.formulaUnicode(it) }, en.cas?.let { "CAS $it" }, "CID ${en.cid}").joinToString(" · "), cid = en.cid, pontos = p)
            }
        }
        return saida.sortedWith(compareByDescending<ResultadoBusca> { it.pontos }.thenBy { it.titulo.length }.thenBy { it.titulo }).take(limite)
    }

    /** Propriedades citadas no texto normalizado, na ordem em que aparecem. */
    fun propriedadesEm(n: String): List<PropriedadeAchada> {
        val usado = BooleanArray(n.length)
        val out = mutableListOf<PropriedadeAchada>()
        for ((chave, id, alvo) in sinonimosPropriedade) {
            var i = n.indexOf(chave)
            while (i != -1) {
                val j = i + chave.length
                val ok = (i == 0 || n[i - 1] == ' ') && (j == n.length || n[j] == ' ')
                if (ok && (i until j).none { usado[it] }) {
                    for (k in i until j) usado[k] = true
                    out += PropriedadeAchada(id, alvo, i)
                }
                i = n.indexOf(chave, i + 1)
            }
        }
        out.sortBy { it.pos }
        val vistos = HashSet<String>()
        return out.filter { vistos.add(it.id) }
    }

    /** Categoria de elemento citada (halogênios, gases nobres…): a primeira que casar, como no site. */
    companion object {
        private val SIMBOLOS_AMBIGUOS = setOf("Na", "No", "Os", "As", "Se", "Ar", "Si", "In", "At", "Be", "Am", "Ta", "Re", "Ge", "Pa", "Mo", "Ho", "Er", "Ra", "Ca", "Co", "Ir", "La", "Li", "Lu", "Mi", "Y")
        private val NAO_FORMULAS = setOf("OK", "SOS", "PH", "HOHO", "IN", "AS", "BIS", "PIS", "SP", "CIP", "OH")
        private val STOP_PALAVRAS = setOf("de", "da", "do", "dos", "das", "e", "o", "a", "os", "as", "um", "uma", "em", "no", "na", "que", "para", "por", "com", "ao", "se")
        /** Palavras funcionais que NÃO valem aproximação por erro de digitação (ex.: "sobre" não é "cobre"; "fontes" não é "Fontex"). */
        private val PALAVRAS_FUNCIONAIS = STOP_PALAVRAS + setOf(
            "sobre", "entre", "como", "onde", "quando", "qual", "quais", "mais", "menos", "muito", "pouco", "tudo", "nada",
            "tambem", "porque", "entao", "assim", "ainda", "depois", "antes", "agora", "sempre", "nunca", "seja", "foi", "ser",
            "sao", "esta", "estao", "tem", "ter", "fale", "fala", "diga", "mostre", "explique", "explica", "quimica", "favor",
            "gostaria", "queria", "poderia", "pode", "quero", "preciso",
            "fontes", "fonte", "dados", "ajuda", "licenca", "licencas", "informacao", "informacoes", "versao", "referencia",
            "referencias", "offline", "gratis", "gratuito")

        fun chaveFormula(texto: String): String = FormulaQuimica.normalizarEntrada(texto).replace("^", "").lowercase()

        /** Tokens do texto original separados por espaço, sem pontuação final (preserva parênteses internos). */
        fun tokensOriginais(texto: String): List<String> = texto.split(Regex("""\s+""")).map { t ->
            var s = t.trim().trimStart('"', '\'', '“', '‘', '¿', '¡', ' ').trimEnd('"', '\'', '”', '’', '?', '!', ',', ';', ':', ' ')
            s = s.trimEnd('.')
            if (s.startsWith("(") && s.endsWith(")") && s.count { it == '(' } == 1) s = s.substring(1, s.length - 1)
            if (s.endsWith(")") && !s.contains("(")) s = s.dropLast(1)
            s
        }.filter { it.isNotEmpty() }

        fun nomesDe(c: Composto): List<String> = listOfNotNull(c.nome, c.nomePopular, c.nomeIupac) + c.sinonimos

        /** Cria o dicionário; se o índice não traz nomes, lê os lotes de compostos uma vez. */
        suspend fun criar(pacote: Pacote): Dicionario {
            val entradas = mutableListOf<EntradaDic>()
            val principais = LinkedHashMap<Long, String>()
            if (pacote.indice.temNomes) {
                for (e in pacote.indice.entradas) {
                    entradas += EntradaDic(e.cid, e.nomes, e.formula, e.cas)
                    e.nomes.firstOrNull()?.let { principais[e.cid] = it }
                }
            }
            val precisaLotes = !pacote.indice.temNomes || pacote.indice.entradas.none { it.formula != null }
            if (precisaLotes && pacote.indice.tamanho <= LIMITE_LEITURA_LOTES) {
                val todos = pacote.todosOsCompostos()
                if (!pacote.indice.temNomes) {
                    for (c in todos) {
                        entradas += EntradaDic(c.cid, nomesDe(c), c.formula, c.cas)
                        principais[c.cid] = c.nomeExibicao
                    }
                } else {
                    // o índice tem nomes, mas não fórmulas/CAS: completa a partir dos lotes
                    val porCid = todos.associateBy { it.cid }
                    for (i in entradas.indices) {
                        val e = entradas[i]
                        val c = porCid[e.cid] ?: continue
                        entradas[i] = EntradaDic(e.cid, e.nomes, e.formula ?: c.formula, e.cas ?: c.cas)
                    }
                }
            }
            return Dicionario(pacote, entradas, principais)
        }

        private const val LIMITE_LEITURA_LOTES = 4000
    }
}
