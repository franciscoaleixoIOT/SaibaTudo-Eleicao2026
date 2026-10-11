package net.saibatudo.quimica.domain.calc

import net.saibatudo.quimica.data.model.Constante
import net.saibatudo.quimica.domain.Texto

/** Variáveis da equação dos gases ideais PV = nRT. */
enum class VariavelGas(val simbolo: String, val nome: String, val grandeza: String) {
    P("P", "Pressão", "pressao"), V("V", "Volume", "volume"), N("n", "Quantidade de matéria", "quantidade"), T("T", "Temperatura", "temperatura")
}

/** Gás ideal: resolve a variável que falta em PV = nRT, com R vindo das constantes do pacote (CODATA). */
object GasIdeal {

    fun resolver(
        p: CampoQtd, v: CampoQtd, n: CampoQtd, t: CampoQtd,
        r: Constante?, unidades: Unidades
    ): ResultadoCalculo {
        if (r == null) throw CalculoInvalido("O pacote de dados não traz a constante dos gases (R).")
        val campos = mapOf(VariavelGas.P to p, VariavelGas.V to v, VariavelGas.N to n, VariavelGas.T to t)
        for ((variavel, c) in campos) {
            if (c.unidade.grandeza != variavel.grandeza) throw CalculoInvalido("Unidade ${c.unidade.simbolo} não serve para ${variavel.nome.lowercase()}.")
        }
        val faltando = campos.filter { it.value.valor == null }.keys
        if (faltando.size != 1) throw CalculoInvalido("Deixe exatamente um campo vazio: é o que será calculado (faltam ${faltando.size}).")
        val alvo = faltando.first()

        val passos = mutableListOf<String>()
        passos += "Equação dos gases ideais: P·V = n·R·T, com R = ${Texto.significativos(r.valor, 10)} ${r.unidade ?: "J mol-1 K-1"} (${r.fontes.firstOrNull()?.nome ?: "constantes do pacote"})."
        passos += "Convertendo para o SI (Pa, m³, mol, K):"
        val si = mutableMapOf<VariavelGas, Double>()
        for ((variavel, c) in campos) {
            val valor = c.valor ?: continue
            val base = unidades.base(variavel.grandeza) ?: throw CalculoInvalido("Falta a unidade-base de ${variavel.grandeza} nos dados.")
            val (conv, passo) = unidades.converterComPasso(valor, c.unidade, base)
            si[variavel] = conv
            passos += "${variavel.simbolo}: $passo"
            if (conv <= 0) throw CalculoInvalido("${variavel.nome} deve ser positiva (em ${base.simbolo}).")
        }
        val rv = r.valor
        val resultadoSi = when (alvo) {
            VariavelGas.P -> si[VariavelGas.N]!! * rv * si[VariavelGas.T]!! / si[VariavelGas.V]!!
            VariavelGas.V -> si[VariavelGas.N]!! * rv * si[VariavelGas.T]!! / si[VariavelGas.P]!!
            VariavelGas.N -> si[VariavelGas.P]!! * si[VariavelGas.V]!! / (rv * si[VariavelGas.T]!!)
            VariavelGas.T -> si[VariavelGas.P]!! * si[VariavelGas.V]!! / (si[VariavelGas.N]!! * rv)
        }
        val formula = when (alvo) {
            VariavelGas.P -> "P = nRT / V"; VariavelGas.V -> "V = nRT / P"; VariavelGas.N -> "n = PV / RT"; VariavelGas.T -> "T = PV / nR"
        }
        val baseAlvo = unidades.base(alvo.grandeza)!!
        passos += "Isolando ${alvo.simbolo}: $formula = ${Texto.significativos(resultadoSi, 6)} ${baseAlvo.simbolo}."
        val unAlvo = campos[alvo]!!.unidade
        val final = unidades.converter(resultadoSi, baseAlvo, unAlvo)
        if (unAlvo.simbolo != baseAlvo.simbolo) {
            passos += "Convertendo para ${unAlvo.simbolo}: ${Texto.significativos(resultadoSi, 6)} ${baseAlvo.simbolo} = ${Texto.significativos(final, 6)} ${unAlvo.simbolo}."
        }
        val notas = listOf("Modelo de gás ideal: boa aproximação a baixa pressão e alta temperatura.")
        return ResultadoCalculo(
            titulo = "Gás ideal: ${alvo.nome.lowercase()}",
            linhas = listOf(LinhaResultado("${alvo.nome} (${alvo.simbolo})", "${Texto.significativos(final, 5)} ${unAlvo.simbolo}", destaque = true)),
            passos = passos,
            notas = notas
        )
    }
}
