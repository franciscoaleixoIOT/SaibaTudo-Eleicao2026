package net.saibatudo.quimica.domain.calc

import net.saibatudo.quimica.domain.Texto
import java.math.BigInteger

/**
 * Espécie de uma equação: [rotulo] normalizado (sem coeficiente nem estado físico) e a fórmula interpretada.
 * O elétron livre ("e-") tem [eletron] verdadeiro, nenhum átomo e carga -1.
 */
data class Especie(val rotulo: String, val formula: FormulaAnalisada, val eletron: Boolean = false)

data class Equacao(val reagentes: List<Especie>, val produtos: List<Especie>) {
    val todas: List<Especie> get() = reagentes + produtos
}

data class EquacaoBalanceada(val equacao: Equacao, val coeficientes: List<Int>) {
    fun coeficienteDe(indice: Int) = coeficientes[indice]

    /** "2 H₂ + O₂ → 2 H₂O" (unicode) ou "2 H2 + O2 -> 2 H2O". */
    fun texto(unicode: Boolean = true): String {
        val nr = equacao.reagentes.size
        fun nome(e: Especie) = if (e.eletron) (if (unicode) "e⁻" else "e-") else if (unicode) Texto.formulaUnicode(e.rotulo) else e.rotulo
        fun lado(especies: List<Especie>, desde: Int) = especies.mapIndexed { i, e ->
            val c = coeficientes[desde + i]
            (if (c == 1) "" else "$c ") + nome(e)
        }.joinToString(" + ")
        return lado(equacao.reagentes, 0) + (if (unicode) " → " else " -> ") + lado(equacao.produtos, nr)
    }
}

data class ResultadoBalanceamento(val balanceada: EquacaoBalanceada, val passos: List<String>) {
    fun comoResultado(): ResultadoCalculo = ResultadoCalculo(
        titulo = "Equação balanceada",
        linhas = listOf(LinhaResultado("Equação", balanceada.texto(), destaque = true)),
        passos = passos
    )
}

/**
 * Balanceamento por álgebra linear exata (mesma ideia de web/src/quimica/js/calc/balancear.js): cada elemento (e a carga, se
 * houver íons ou elétrons) vira uma equação linear homogênea sobre os coeficientes; a solução é o espaço nulo da matriz
 * (eliminação de Gauss–Jordan com frações), escalado para os menores inteiros positivos. Equações sem solução única ou sem
 * solução positiva são recusadas com explicação.
 */
object Balanceador {

    private val RX_SETA = Regex("""\s*(?:<=>|<->|<-->|⇌|⇄|-->|->|→|⟶|⇒|=>|==|=)\s*""")
    private val RX_ELETRON = Regex("""^e(?:\^?[-−]|⁻)$""")
    private val RX_COEF = Regex("""^(\d+)\s*(?=[A-Za-z(\[])(.*)$""")

    fun interpretar(texto: String, simbolosValidos: Set<String>? = null): Equacao {
        val bruto = java.text.Normalizer.normalize(texto, java.text.Normalizer.Form.NFC).replace(Regex("[−–—]"), "-").trim()
        if (bruto.isEmpty()) throw CalculoInvalido("Digite a equação, por exemplo: Fe + O2 -> Fe2O3")
        val m = RX_SETA.find(bruto) ?: throw CalculoInvalido("Não encontrei a seta da reação. Escreva reagentes -> produtos, por exemplo: H2 + O2 -> H2O")
        val esquerda = bruto.substring(0, m.range.first)
        val direita = bruto.substring(m.range.last + 1)
        if (RX_SETA.containsMatchIn(direita)) throw CalculoInvalido("A equação tem mais de uma seta. Digite uma reação por vez.")
        fun lado(l: String, nome: String): List<Especie> {
            val itens = dividirEspecies(l)
            if (itens.isEmpty()) throw CalculoInvalido("Faltam os $nome da equação.")
            return itens.map { item ->
                val c = RX_COEF.find(item.trim())
                val corpo = c?.groupValues?.get(2)?.trim() ?: item.trim()
                val limpo = corpo.replace(Regex("""\s+"""), "")
                if (RX_ELETRON.matches(limpo)) return@map Especie("e-", FormulaAnalisada(emptyMap(), -1, "e-"), eletron = true)
                try {
                    val f = FormulaQuimica.analisar(corpo, simbolosValidos)
                    Especie(f.texto, f)
                } catch (e: CalculoInvalido) {
                    throw CalculoInvalido("Substância \"$corpo\": ${e.message}")
                }
            }
        }
        return Equacao(lado(esquerda, "reagentes"), lado(direita, "produtos"))
    }

    /** Divide um lado da equação em substâncias, separando pelo "+" que não é carga elétrica ("Fe3+ + Cl-" tem duas substâncias). */
    internal fun dividirEspecies(lado: String): List<String> {
        val partes = mutableListOf<String>()
        var ini = 0
        for (i in lado.indices) {
            if (lado[i] != '+' || i == 0) continue
            val antes = lado[i - 1]
            val depois = lado.substring(i + 1)
            val prox = depois.trimStart().firstOrNull()
            val colado = antes != ' ' && depois.firstOrNull() != ' '
            val separador = when {
                prox == null -> false   // "+" no fim: carga
                colado && depois[0].isDigit() && (antes.isLetterOrDigit() && antes.code < 128 || antes == ')' || antes == ']') -> {
                    // "Fe+3": carga quando os dígitos terminam a substância; "H2+3O2": coeficiente
                    val fim = depois.takeWhile { it.isDigit() }.length
                    !(depois.length == fim || depois[fim].isWhitespace() || depois[fim] == '+' || RX_SETA.containsMatchIn(depois.substring(fim, minOf(fim + 3, depois.length))))
                }
                else -> prox.isDigit() || prox in 'A'..'Z' || prox == '(' || prox == '[' || Regex("""^e\^?[-−⁻]""").containsMatchIn(depois.trimStart())
            }
            if (separador) {
                partes += lado.substring(ini, i)
                ini = i + 1
            }
        }
        partes += lado.substring(ini)
        return partes.map { it.trim() }.filter { it.isNotEmpty() }
    }

    fun balancear(texto: String, simbolosValidos: Set<String>? = null): ResultadoBalanceamento =
        balancear(interpretar(texto, simbolosValidos))

    fun balancear(eq: Equacao): ResultadoBalanceamento {
        val especies = eq.todas
        val n = especies.size
        if (n > 26) throw CalculoInvalido("Equação grande demais (máximo de 26 espécies).")
        val nr = eq.reagentes.size
        val elementos = LinkedHashSet<String>()
        especies.forEach { elementos += it.formula.contagem.keys }
        val temCarga = especies.any { it.formula.carga != 0 }
        val linhasNome = elementos.toMutableList().also { if (temCarga) it += "carga" }

        // matriz: reagentes positivos, produtos negativos => A·x = 0
        val m = Array(linhasNome.size) { r ->
            Array(n) { c ->
                val sp = especies[c]
                val v = if (linhasNome[r] == "carga") sp.formula.carga else sp.formula.contagem[linhasNome[r]] ?: 0
                Racional.de(if (c < nr) v.toLong() else -v.toLong())
            }
        }
        val original = m.map { it.copyOf() }

        // Gauss–Jordan
        val pivotes = mutableListOf<Int>()
        var linha = 0
        for (col in 0 until n) {
            if (linha >= m.size) break
            val p = (linha until m.size).firstOrNull { !m[it][col].ehZero } ?: continue
            val tmp = m[linha]; m[linha] = m[p]; m[p] = tmp
            val div = m[linha][col]
            for (k in 0 until n) m[linha][k] = m[linha][k] / div
            for (r in m.indices) {
                if (r == linha || m[r][col].ehZero) continue
                val f = m[r][col]
                for (k in 0 until n) m[r][k] = m[r][k] - f * m[linha][k]
            }
            pivotes += col
            linha++
        }
        val livres = (0 until n).filter { it !in pivotes }
        val letras = ('a'..'z').toList()
        fun nomeEsp(i: Int) = if (especies[i].eletron) "e⁻" else Texto.formulaUnicode(especies[i].rotulo)

        val passos = mutableListOf<String>()
        passos += "Espécies: " + especies.indices.joinToString(", ") { "${letras[it]} = ${nomeEsp(it)}" } + "."
        passos += "Cada letra é o coeficiente da espécie. Conservar cada elemento" + (if (temCarga) " e a carga" else "") + " dá uma equação (átomos nos reagentes = átomos nos produtos):"
        for ((r, nome) in linhasNome.withIndex()) {
            if (nome == "carga") {
                // cargas podem ser negativas: escreve a soma com sinais (reagentes − produtos = 0)
                val termos = (0 until n).filter { !original[r][it].ehZero }.map { original[r][it].num.toInt() to letras[it] }
                passos += "Carga: " + termos.mapIndexed { i, (k, l) ->
                    val abs = kotlin.math.abs(k)
                    val corpo = if (abs == 1) "$l" else "$abs$l"
                    if (i == 0) (if (k < 0) "−$corpo" else corpo) else (if (k < 0) " − $corpo" else " + $corpo")
                }.joinToString("") + " = 0"
                continue
            }
            val esq = (0 until nr).filter { !original[r][it].ehZero }.joinToString(" + ") { termo(original[r][it], letras[it]) }
            val dir = (nr until n).filter { !original[r][it].ehZero }.joinToString(" + ") { termo(-original[r][it], letras[it]) }
            passos += "$nome: ${esq.ifEmpty { "0" }} = ${dir.ifEmpty { "0" }}"
        }

        if (livres.isEmpty()) {
            throw CalculoInvalido("Não existe combinação de coeficientes que conserve os átomos${if (temCarga) " e a carga" else ""}. Confira as fórmulas: todo elemento precisa aparecer nos dois lados.")
        }
        if (livres.size > 1) {
            throw CalculoInvalido("Esta equação admite mais de uma solução independente (parece misturar duas ou mais reações). Separe-a em reações menores e balanceie uma de cada vez.")
        }
        val f = livres[0]
        val x = Array(n) { Racional.ZERO }
        x[f] = Racional.UM
        for ((i, pc) in pivotes.withIndex()) x[pc] = -m[i][f]

        passos += "Resolvendo o sistema por eliminação de Gauss–Jordan (com frações exatas), ${letras[f]} fica livre: ${letras[f]} = 1 e " +
            pivotes.joinToString(", ") { "${letras[it]} = ${x[it]}" } + "."

        // menores inteiros
        var mmc = BigInteger.ONE
        for (v in x) mmc = mmc / mmc.gcd(v.den) * v.den
        var inteiros = x.map { (it.num * (mmc / it.den)) }
        val g = inteiros.fold(BigInteger.ZERO) { acc, v -> acc.gcd(v) }
        if (g.signum() != 0) inteiros = inteiros.map { it / g }
        if (inteiros.all { it.signum() <= 0 }) inteiros = inteiros.map { it.negate() }
        if (inteiros.any { it.signum() <= 0 }) {
            val ruins = inteiros.indices.filter { inteiros[it].signum() <= 0 }.joinToString(", ") { nomeEsp(it) }
            throw CalculoInvalido("Não há coeficientes positivos que balanceiem esta equação (problema em: $ruins). Verifique se as espécies estão do lado certo e se nenhuma está sobrando.")
        }
        if (inteiros.any { it > BigInteger.valueOf(100_000) }) throw CalculoInvalido("Os coeficientes resultantes são grandes demais.")
        val coef = inteiros.map { it.toInt() }
        passos += "Multiplicando pelo menor número que elimina as frações e simplificando: " +
            coef.indices.joinToString(", ") { "${letras[it]} = ${coef[it]}" } + "."
        val bal = EquacaoBalanceada(eq, coef)
        passos += "Equação balanceada: ${bal.texto()}"
        // verificação
        for ((r, nome) in linhasNome.withIndex()) {
            val esq = (0 until nr).sumOf { (original[r][it].num.toLong() * coef[it]) }
            val dir = (nr until n).sumOf { (-original[r][it].num.toLong() * coef[it]) }
            passos += "Verificação – ${if (nome == "carga") "carga" else nome}: $esq nos reagentes e $dir nos produtos" + if (esq == dir) " (conservado)." else " (ERRO)."
            check(esq == dir) { "falha interna na conservação de $nome" }
        }
        return ResultadoBalanceamento(bal, passos)
    }

    private fun termo(c: Racional, letra: Char): String {
        val k = c.num.toInt()
        return if (k == 1) "$letra" else "$k$letra"
    }
}
