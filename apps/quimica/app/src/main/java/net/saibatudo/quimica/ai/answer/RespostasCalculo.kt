package net.saibatudo.quimica.ai.answer

import net.saibatudo.quimica.ai.model.Acao
import net.saibatudo.quimica.ai.model.Bloco
import net.saibatudo.quimica.ai.model.Intent
import net.saibatudo.quimica.ai.model.ParsedQuery
import net.saibatudo.quimica.ai.model.Resposta
import net.saibatudo.quimica.ai.model.TipoCalculadora
import net.saibatudo.quimica.ai.nlu.LocalNlu
import net.saibatudo.quimica.ai.nlu.Quantidades
import net.saibatudo.quimica.data.model.Fonte
import net.saibatudo.quimica.data.model.UnidadeDef
import net.saibatudo.quimica.domain.Texto
import net.saibatudo.quimica.domain.calc.Balanceador
import net.saibatudo.quimica.domain.calc.CalculoInvalido
import net.saibatudo.quimica.domain.calc.CampoQtd
import net.saibatudo.quimica.domain.calc.EquacaoBalanceada
import net.saibatudo.quimica.domain.calc.Estequiometria
import net.saibatudo.quimica.domain.calc.FormulaQuimica
import net.saibatudo.quimica.domain.calc.GasIdeal
import net.saibatudo.quimica.domain.calc.MassaMolar
import net.saibatudo.quimica.domain.calc.Qtd
import net.saibatudo.quimica.domain.calc.QuantidadeConhecida
import net.saibatudo.quimica.domain.calc.ResultadoCalculo
import net.saibatudo.quimica.domain.calc.Solucoes
import net.saibatudo.quimica.domain.calc.TipoForte
import net.saibatudo.quimica.domain.calc.VariavelGas

/** Respostas de cálculo: tudo vem de cálculo local testado (com os passos) e dos dados do pacote. */

internal fun fonteCalculo() = Fonte("Cálculo feito no aparelho", licenca = "sem dados de terceiros além das massas e constantes do pacote")

private fun fonteDe(vararg extras: List<Fonte>): List<Fonte> = listOf(fonteCalculo()) + extras.flatMap { it }.distinctBy { it.nome }.take(3)

private fun AnswerBuilder.unidadeDe(simbolo: String): UnidadeDef? = un.buscar(simbolo)

private val RX_ESTADO_FISICO = Regex("""\((?:s|l|g|aq)\)$""")

// ---- massa molar ------------------------------------------------------------------------------------------------------------------

internal suspend fun AnswerBuilder.massaMolar(q: ParsedQuery): Resposta {
    val c = compostoDe(q)
    val e = if (q.formula == null && c == null) elementoDe(q) else null
    val formula = q.formula ?: c?.formula ?: e?.simbolo
    if (formula == null) {
        return Resposta(
            Intent.MASSA_MOLAR, "Massa molar", listOf(Bloco.Paragrafo("De qual substância? Digite a fórmula (por exemplo, Ca(OH)2 ou CuSO4·5H2O) ou o nome.")),
            acoes = listOf(Acao.AbrirCalculadora(TipoCalculadora.MASSA_MOLAR, "Abrir a calculadora de massa molar")),
            sugestoes = listOf("Qual a massa molar da água?", "Massa molar do Ca(OH)2"), entendida = false
        )
    }
    val mm = MassaMolar.calcular(formula, pacote.porSimbolo)
    val res = mm.comoResultado()
    val nome = e?.let { "${it.nome} (${it.simbolo})" } ?: c?.nomeExibicao ?: mm.formula.exibicao()
    val blocos = mutableListOf<Bloco>(Bloco.Destaque("${Texto.fixo(mm.massaMolar, 3)} g/mol"))
    if (c != null && c.massaMolar != null && kotlin.math.abs(c.massaMolar - mm.massaMolar) > 0.005) {
        blocos += Bloco.Campo("Valor do pacote (PubChem)", "${Texto.numero(c.massaMolar, 4)} g/mol")
    }
    // massa <-> mol de uma quantidade citada na pergunta
    val gUn = un.porSimbolo("g", "massa")
    val molUn = un.porSimbolo("mol", "quantidade")
    val extras = mutableListOf<String>()
    for (qt in q.quantidades) {
        val u = unidadeDe(qt.unidade) ?: continue
        if (u.grandeza == "massa" && gUn != null && molUn != null) {
            val massaG = un.converter(qt.valor, u, gUn)
            val mols = massaG / mm.massaMolar
            blocos += Bloco.Campo("${Texto.significativos(qt.valor, 5)} ${u.simbolo} de $nome", "${Texto.significativos(mols, 5)} mol")
            extras += "n = m / MM = ${Texto.significativos(massaG, 5)} g ÷ ${Texto.fixo(mm.massaMolar, 3)} g/mol = ${Texto.significativos(mols, 5)} mol"
        } else if (u.grandeza == "quantidade" && gUn != null && molUn != null) {
            val mols = un.converter(qt.valor, u, molUn)
            val massa = mols * mm.massaMolar
            blocos += Bloco.Campo("${Texto.significativos(qt.valor, 5)} ${u.simbolo} de $nome", "${Texto.significativos(massa, 5)} g")
            extras += "m = n × MM = ${Texto.significativos(mols, 5)} mol × ${Texto.fixo(mm.massaMolar, 3)} g/mol = ${Texto.significativos(massa, 5)} g"
        }
    }
    blocos += Bloco.Passos("Como calculei", res.passos + extras)
    res.notas.forEach { blocos += Bloco.Aviso(it) }
    return Resposta(
        Intent.MASSA_MOLAR, "Massa molar: $nome", blocos,
        fontes = fonteDe(fontesDeElementos(mm.formula.contagem.keys)),
        acoes = listOf(Acao.AbrirCalculadora(TipoCalculadora.MASSA_MOLAR, "Abrir a calculadora de massa molar", mapOf("formula" to formula)))
    )
}

// ---- balanceamento --------------------------------------------------------------------------------------------------------------------

internal suspend fun AnswerBuilder.balancear(q: ParsedQuery): Resposta {
    val eq = q.equacao
    if (eq == null) {
        return Resposta(
            Intent.BALANCEAR, "Balanceamento de equações",
            listOf(Bloco.Paragrafo("Escreva a equação com uma seta, por exemplo: H2 + O2 -> H2O. Eu acho os menores coeficientes inteiros e mostro os passos.")),
            acoes = listOf(Acao.AbrirCalculadora(TipoCalculadora.BALANCEAMENTO, "Abrir a calculadora de balanceamento")),
            sugestoes = listOf("Balancear Fe + O2 -> Fe2O3"), entendida = false
        )
    }
    val r = Balanceador.balancear(eq)
    return Resposta(
        Intent.BALANCEAR, "Equação balanceada",
        listOf(Bloco.Destaque(r.balanceada.texto()), Bloco.Passos("Passo a passo", r.passos)),
        fontes = listOf(fonteCalculo()),
        acoes = listOf(Acao.AbrirCalculadora(TipoCalculadora.BALANCEAMENTO, "Abrir a calculadora de balanceamento", mapOf("equacao" to eq)))
    )
}

// ---- estequiometria ---------------------------------------------------------------------------------------------------------------------

internal suspend fun AnswerBuilder.estequiometria(q: ParsedQuery): Resposta {
    val eq = q.equacao ?: return conversaoMolar(q)
    val aviso: (String) -> Resposta = { msg ->
        Resposta(
            Intent.ESTEQUIOMETRIA, "Estequiometria", listOf(Bloco.Aviso(msg)),
            acoes = listOf(Acao.AbrirCalculadora(TipoCalculadora.ESTEQUIOMETRIA, "Abrir a calculadora de estequiometria", mapOf("equacao" to eq))),
            sugestoes = emptyList(), entendida = false
        )
    }
    val bal = Balanceador.balancear(eq).balanceada
    if (bal.equacao.todas.any { it.eletron }) return aviso("A estequiometria por massa não trata elétrons livres. Use uma equação sem elétrons.")
    val posEq = LocalNlu.extrairEquacaoComPosicao(q.textoOriginal)?.second
    val texto = if (posEq != null) q.textoOriginal.replaceRange(posEq.first, minOf(posEq.last + 1, q.textoOriginal.length), " ".repeat((posEq.last - posEq.first + 1).coerceAtLeast(0))) else q.textoOriginal
    val gUn = un.porSimbolo("g", "massa") ?: return aviso("Faltam as unidades de massa nos dados.")
    val molUn = un.porSimbolo("mol", "quantidade") ?: return aviso("Faltam as unidades de quantidade nos dados.")
    val conhecidas = mutableListOf<QuantidadeConhecida>()
    val usadas = mutableSetOf<Int>()
    val rotulos = bal.equacao.todas.map { it.rotulo }
    for (ql in Quantidades.ler(texto, un)) {
        val u = ql.unidade?.let { unidadeDe(it) } ?: continue
        if (u.grandeza != "massa" && u.grandeza != "quantidade") continue
        val indice = especieMaisProxima(texto, ql.faixa, rotulos) ?: continue
        if (!usadas.add(indice)) continue
        val valor = if (u.grandeza == "massa") un.converter(ql.valor, u, gUn) else un.converter(ql.valor, u, molUn)
        conhecidas += QuantidadeConhecida(indice, valor, emMols = u.grandeza == "quantidade")
    }
    if (conhecidas.isEmpty()) return aviso("Diga a que substância cada quantidade se refere, por exemplo: 4 g de H2 ou 0,5 mol de O2.")
    val r = Estequiometria.calcular(bal, conhecidas, pacote.porSimbolo)
    val res = r.comoResultado()
    val blocos = mutableListOf<Bloco>(Bloco.Destaque(bal.texto()))
    r.limitante?.let { blocos += Bloco.Campo("Reagente limitante", Texto.formulaUnicode(it)) }
    res.linhas.forEach { blocos += Bloco.Campo(it.rotulo, it.valor) }
    blocos += Bloco.Passos("Passo a passo", r.passos)
    val simbolos = bal.equacao.todas.flatMap { it.formula.contagem.keys }.toSet()
    return Resposta(
        Intent.ESTEQUIOMETRIA, "Estequiometria", blocos, fontes = fonteDe(fontesDeElementos(simbolos)),
        acoes = listOf(Acao.AbrirCalculadora(TipoCalculadora.ESTEQUIOMETRIA, "Abrir a calculadora de estequiometria", mapOf("equacao" to eq)))
    )
}

/** Espécie da equação citada mais perto da quantidade (depois dela, "4 g de H2"; senão antes, "H2: 4 g"). */
private fun especieMaisProxima(texto: String, faixa: IntRange, rotulos: List<String>): Int? {
    var melhor: Int? = null
    var distancia = Int.MAX_VALUE
    for ((i, rot) in rotulos.withIndex()) {
        val rx = Regex("""(?<![A-Za-z0-9(])${Regex.escape(RX_ESTADO_FISICO.replace(rot, ""))}(?![a-z0-9(])""")
        for (m in rx.findAll(texto)) {
            val d = if (m.range.first > faixa.last) m.range.first - faixa.last else (faixa.first - m.range.last) + 25
            if (d < distancia && d < 60) { distancia = d; melhor = i }
        }
    }
    return melhor
}

/**
 * Estequiometria sem equação: conversões entre massa, quantidade de matéria (mol), número de entidades (constante de Avogadro
 * do pacote) e, nas CNTP, volume de gás ideal. Ex.: "quantos mols tem em 18 g de água?", "quantas moléculas há em 2 mol de CO2?".
 */
private suspend fun AnswerBuilder.conversaoMolar(q: ParsedQuery): Resposta {
    val n = Texto.nlu(q.textoOriginal)
    val acoes = listOf(Acao.AbrirCalculadora(TipoCalculadora.ESTEQUIOMETRIA, "Abrir a calculadora de estequiometria"))
    val molUn = un.porSimbolo("mol", "quantidade")!!
    val gUn = un.porSimbolo("g", "massa")!!
    val cntp = Regex("""\b(?:cntp|condicoes normais|ntp)\b""").containsMatchIn(n)
    if (cntp) {
        val mols = q.quantidades.firstNotNullOfOrNull { qt -> unidadeDe(qt.unidade)?.takeIf { it.grandeza == "quantidade" }?.let { un.converter(qt.valor, it, molUn) } } ?: 1.0
        val r = pacote.constante("R") ?: throw CalculoInvalido("O pacote de dados não traz a constante dos gases (R).")
        val res = GasIdeal.resolver(
            CampoQtd(1.0, un.porSimbolo("atm", "pressao")!!), CampoQtd(null, un.porSimbolo("L", "volume")!!),
            CampoQtd(mols, molUn), CampoQtd(0.0, un.porSimbolo("°C", "temperatura")!!), r, un
        )
        return Resposta(
            Intent.ESTEQUIOMETRIA, "Volume de gás nas CNTP",
            listOf(Bloco.Paragrafo("CNTP adotadas aqui: 0 °C e 1 atm.")) + resultadoComoBlocos(res), fontes = fonteDe(r.fontes), acoes = acoes
        )
    }
    val c = compostoDe(q)
    val formula = q.formula ?: c?.formula ?: elementoDe(q)?.simbolo
        ?: return Resposta(
            Intent.ESTEQUIOMETRIA, "Estequiometria",
            listOf(Bloco.Paragrafo("Diga a substância e a quantidade, por exemplo: 18 g de H2O, ou escreva a reação com uma seta (H2 + O2 -> H2O) e as quantidades.")),
            acoes = acoes, sugestoes = listOf("Quantos mols tem em 18 g de água?"), entendida = false
        )
    val mm = MassaMolar.calcular(formula, pacote.porSimbolo)
    val avogadro = pacote.constante("NA")
    val nome = c?.nomeExibicao ?: mm.formula.exibicao()
    var mols: Double? = null
    var origem = ""
    for (qt in q.quantidades) {
        val u = unidadeDe(qt.unidade)
        if (qt.unidade == "particulas" && avogadro != null) {
            mols = qt.valor / avogadro.valor; origem = "N / N_A = ${Texto.significativos(qt.valor, 5)} ÷ ${Texto.cientifica(avogadro.valor, 4)} = "
            break
        }
        if (u?.grandeza == "massa") { val g = un.converter(qt.valor, u, gUn); mols = g / mm.massaMolar; origem = "n = m / MM = ${Texto.significativos(g, 5)} g ÷ ${Texto.fixo(mm.massaMolar, 3)} g/mol = "; break }
        if (u?.grandeza == "quantidade") { mols = un.converter(qt.valor, u, molUn); origem = "n informado = "; break }
    }
    if (mols == null) {
        return Resposta(
            Intent.ESTEQUIOMETRIA, "Estequiometria: $nome", listOf(Bloco.Paragrafo("Informe a quantidade (massa em g, mol ou número de moléculas) de $nome.")),
            acoes = acoes, sugestoes = listOf("Quantos mols tem em 18 g de água?"), entendida = false
        )
    }
    val blocos = mutableListOf<Bloco>(
        Bloco.Campo("Massa molar de $nome", "${Texto.fixo(mm.massaMolar, 3)} g/mol"),
        Bloco.Campo("Quantidade de matéria", "${Texto.significativos(mols, 5)} mol"),
        Bloco.Campo("Massa", "${Texto.significativos(mols * mm.massaMolar, 5)} g")
    )
    val passos = mutableListOf(mm.comoResultado().passos.last(), "$origem${Texto.significativos(mols, 5)} mol.", "m = n × MM = ${Texto.significativos(mols, 5)} mol × ${Texto.fixo(mm.massaMolar, 3)} g/mol = ${Texto.significativos(mols * mm.massaMolar, 5)} g.")
    if (avogadro != null) {
        blocos += Bloco.Campo("Número de entidades (n × N_A)", Texto.cientifica(mols * avogadro.valor, 4))
        passos += "N = n × N_A = ${Texto.significativos(mols, 5)} mol × ${Texto.cientifica(avogadro.valor, 4)} mol⁻¹ = ${Texto.cientifica(mols * avogadro.valor, 4)}."
    }
    blocos += Bloco.Passos("Como calculei", passos)
    return Resposta(
        Intent.ESTEQUIOMETRIA, "Estequiometria: $nome", blocos,
        fontes = fonteDe(fontesDeElementos(mm.formula.contagem.keys), avogadro?.fontes.orEmpty()), acoes = acoes
    )
}

// ---- concentração e diluição -------------------------------------------------------------------------------------------------------------

internal suspend fun AnswerBuilder.concentracao(q: ParsedQuery): Resposta {
    val n = Texto.nlu(q.textoOriginal)
    val qtds = q.quantidades.mapNotNull { qt -> unidadeDe(qt.unidade)?.let { Qtd(qt.valor, it) } }
    val massas = qtds.filter { it.unidade.grandeza == "massa" }
    val volumes = qtds.filter { it.unidade.grandeza == "volume" }
    val concs = qtds.filter { it.unidade.grandeza == "concentracao" }
    val c = compostoDe(q)
    val formula = q.formula ?: c?.formula
    val acoes = listOf(Acao.AbrirCalculadora(TipoCalculadora.CONCENTRACAO, "Abrir a calculadora de concentração"))
    val emDiluicao = Regex("""\b(?:diluic\w+|dilui\w*|diluid\w+|c ?1 ?v ?1)\b""").containsMatchIn(n)

    fun pronta(r: ResultadoCalculo, fontes: List<Fonte> = emptyList()) = Resposta(
        Intent.CONCENTRACAO, r.titulo, resultadoComoBlocos(r), fontes = fonteDe(fontes), acoes = acoes
    )

    if (emDiluicao && concs.isNotEmpty()) {
        val lc = concs[0].unidade                                   // a incógnita sai na unidade que a pessoa usou
        val lv = volumes.firstOrNull()?.unidade ?: un.porSimbolo("L", "volume")!!
        val final = Regex("""\b(?:final|total|desejad\w+|obter|chegar|ficar)\b""").containsMatchIn(n)
        val (c1, v1, c2, v2) = when {
            concs.size == 2 && volumes.size == 1 ->
                if (final) listOf(CampoQtd(concs[0].valor, concs[0].unidade), CampoQtd(null, lv), CampoQtd(concs[1].valor, concs[1].unidade), CampoQtd(volumes[0].valor, volumes[0].unidade))
                else listOf(CampoQtd(concs[0].valor, concs[0].unidade), CampoQtd(volumes[0].valor, volumes[0].unidade), CampoQtd(concs[1].valor, concs[1].unidade), CampoQtd(null, lv))
            concs.size == 1 && volumes.size == 2 ->
                listOf(CampoQtd(concs[0].valor, concs[0].unidade), CampoQtd(volumes[0].valor, volumes[0].unidade), CampoQtd(null, lc), CampoQtd(volumes[1].valor, volumes[1].unidade))
            else -> throw CalculoInvalido("Para a diluição informe três valores: por exemplo, 2 mol/L, 50 mL e 0,5 mol/L (calculo o volume final).")
        }
        return pronta(Solucoes.diluicao(c1, v1, c2, v2, un))
    }
    if (massas.size == 1 && volumes.size == 1) {
        val f = formula ?: throw CalculoInvalido("Diga a substância (fórmula ou nome) para eu achar a massa molar.")
        val mm = MassaMolar.calcular(f, pacote.porSimbolo)
        return pronta(Solucoes.molaridade(massas[0], mm.massaMolar, volumes[0], un, mm.formula.exibicao()), fontesDeElementos(mm.formula.contagem.keys))
    }
    if (concs.size == 1 && volumes.size == 1) {
        val f = formula ?: throw CalculoInvalido("Diga a substância (fórmula ou nome) para eu achar a massa molar.")
        val mm = MassaMolar.calcular(f, pacote.porSimbolo)
        return pronta(Solucoes.massaParaPreparar(concs[0], volumes[0], mm.massaMolar, un, mm.formula.exibicao()), fontesDeElementos(mm.formula.contagem.keys))
    }
    throw CalculoInvalido(
        "Para molaridade informe a massa e o volume (5,844 g de NaCl em 500 mL); para preparar uma solução, a concentração e o volume (250 mL de NaOH 0,1 mol/L); para diluir, três valores de C₁V₁ = C₂V₂."
    )
}

// ---- pH ----------------------------------------------------------------------------------------------------------------------------------------

/** Ácidos fortes de uso comum (classificação química, não medida): ionização completa em água diluída. */
private val ACIDOS_FORTES = mapOf("HCl" to 1, "HBr" to 1, "HI" to 1, "HNO3" to 1, "HClO4" to 1, "HClO3" to 1, "H2SO4" to 2)
private val RX_BASE_FORTE = Regex("""^(Li|Na|K|Rb|Cs)OH$|^(Ca|Sr|Ba)\(OH\)2$""")

internal suspend fun AnswerBuilder.ph(q: ParsedQuery): Resposta {
    val n = Texto.nlu(q.textoOriginal)
    val c = compostoDe(q)
    val formula = q.formula ?: c?.formula
    val conc = q.quantidades.mapNotNull { qt -> unidadeDe(qt.unidade)?.takeIf { it.grandeza == "concentracao" }?.let { Qtd(qt.valor, it) } }.firstOrNull()
        ?: throw CalculoInvalido("Informe a concentração em mol/L, por exemplo: pH de HCl 0,01 mol/L.")
    val pKw = Solucoes.pKwDoPacote(pacote.constantes)
    val acoes = listOf(Acao.AbrirCalculadora(TipoCalculadora.PH, "Abrir a calculadora de pH"))
    val nome = c?.nomeExibicao ?: formula?.let { FormulaQuimica.tentar(it)?.exibicao() ?: it }

    // ácido ou base FRACOS: a pessoa informa Ka/Kb (ou pKa/pKb)
    val k = q.constantes
    val ka = k["Ka"] ?: k["pKa"]?.let { Math.pow(10.0, -it) }
    val kb = k["Kb"] ?: k["pKb"]?.let { Math.pow(10.0, -it) }
    if (ka != null || kb != null) {
        val tipo = if (ka != null) TipoForte.ACIDO else TipoForte.BASE
        val r = Solucoes.phFraco(tipo, conc, ka ?: kb!!, if (ka != null) "Ka" else "Kb", un, pKw.first, pKw.second)
        val titulo = (nome?.let { "pH de $it ${Texto.significativos(conc.valor, 4)} ${conc.unidade.simbolo}" } ?: r.titulo)
        return Resposta(Intent.PH, titulo, resultadoComoBlocos(r), fontes = fonteDe(emptyList()), acoes = acoes)
    }

    val tipo: TipoForte
    val ionizaveis: Int
    when {
        formula != null && ACIDOS_FORTES.containsKey(formula) -> { tipo = TipoForte.ACIDO; ionizaveis = ACIDOS_FORTES.getValue(formula) }
        formula != null && RX_BASE_FORTE.matches(formula) -> {
            tipo = TipoForte.BASE
            ionizaveis = FormulaQuimica.analisar(formula).contagem["O"] ?: 1
        }
        Regex("""\bbases? fortes?\b""").containsMatchIn(n) -> { tipo = TipoForte.BASE; ionizaveis = 1 }
        Regex("""\bacidos? fortes?\b""").containsMatchIn(n) -> { tipo = TipoForte.ACIDO; ionizaveis = 1 }
        formula != null -> throw CalculoInvalido(
            "Para ${Texto.formulaUnicode(formula)} informe a constante de equilíbrio, por exemplo: pH de ${Texto.formulaUnicode(formula)} 0,1 mol/L com Ka 1,8e-5 (ácido fraco) ou Kb (base fraca). " +
                "Sem constante, só trato ácidos e bases FORTES (HCl, HBr, HI, HNO₃, HClO₄, H₂SO₄ e hidróxidos dos grupos 1 e 2)."
        )
        else -> throw CalculoInvalido("Diga qual é o ácido ou a base forte (por exemplo, HCl ou NaOH), escreva \"ácido forte\" / \"base forte\" ou informe o Ka/Kb.")
    }
    val r = Solucoes.phForte(tipo, conc, ionizaveis, un, pKw.first, pKw.second)
    val titulo = if (nome != null) "pH de $nome ${Texto.significativos(conc.valor, 4)} ${conc.unidade.simbolo}" else r.titulo
    return Resposta(
        Intent.PH, titulo, resultadoComoBlocos(r),
        fontes = fonteDe(pacote.constantes.filter { it.id.equals("Kw", true) || it.id.equals("pKw", true) }.flatMap { it.fontes }),
        acoes = acoes
    )
}

// ---- gás ideal ----------------------------------------------------------------------------------------------------------------------------------

internal suspend fun AnswerBuilder.gasIdeal(q: ParsedQuery): Resposta {
    val n = Texto.nlu(q.textoOriginal)
    val r = pacote.constante("R") ?: throw CalculoInvalido("O pacote de dados não traz a constante dos gases (R).")
    val porGrandeza = HashMap<String, Qtd>()
    for (qt in q.quantidades) {
        val u = unidadeDe(qt.unidade) ?: continue
        if (u.grandeza in setOf("pressao", "volume", "temperatura", "quantidade") && porGrandeza.put(u.grandeza, Qtd(qt.valor, u)) != null) {
            throw CalculoInvalido("Há dois valores para a mesma grandeza (${u.grandeza}). Informe cada um uma vez só.")
        }
    }
    if (Regex("""\b(?:volume molar|cntp|ntp|condicoes (?:normais|padrao))\b""").containsMatchIn(n) && porGrandeza.size < 3) {
        // CNTP adotadas: 1 mol, 0 °C e 1 atm (convenção declarada; os números vêm das unidades e de R)
        porGrandeza.putIfAbsent("quantidade", Qtd(1.0, un.porSimbolo("mol", "quantidade")!!))
        porGrandeza.putIfAbsent("temperatura", Qtd(0.0, un.porSimbolo("°C", "temperatura")!!))
        porGrandeza.putIfAbsent("pressao", Qtd(1.0, un.porSimbolo("atm", "pressao")!!))
    }
    if (porGrandeza.size != 3) {
        throw CalculoInvalido("Para o gás ideal informe três das quatro grandezas (pressão, volume, quantidade de matéria e temperatura), por exemplo: 2 mol de gás a 300 K e 1 atm; eu calculo a que falta.")
    }
    val destino = q.unidadeDestino?.let { un.buscar(it) }
    fun campo(v: VariavelGas, padrao: String): CampoQtd {
        val dado = porGrandeza[v.grandeza]
        if (dado != null) return CampoQtd(dado.valor, dado.unidade)
        val alvo = destino?.takeIf { it.grandeza == v.grandeza } ?: un.porSimbolo(padrao, v.grandeza) ?: un.base(v.grandeza)!!
        return CampoQtd(null, alvo)
    }
    val res = GasIdeal.resolver(campo(VariavelGas.P, "atm"), campo(VariavelGas.V, "L"), campo(VariavelGas.N, "mol"), campo(VariavelGas.T, "K"), r, un)
    return Resposta(
        Intent.GAS_IDEAL, res.titulo, resultadoComoBlocos(res), fontes = fonteDe(r.fontes.ifEmpty { listOf(Fonte("Constantes do pacote de dados")) }),
        acoes = listOf(Acao.AbrirCalculadora(TipoCalculadora.GAS_IDEAL, "Abrir a calculadora de gás ideal"))
    )
}

// ---- conversão de unidades ------------------------------------------------------------------------------------------------------------------------

internal suspend fun AnswerBuilder.conversao(q: ParsedQuery): Resposta {
    val qt = q.quantidades.firstOrNull() ?: throw CalculoInvalido("Informe o valor e a unidade, por exemplo: 25 °C para K.")
    val de = unidadeDe(qt.unidade) ?: throw CalculoInvalido("Não conheço a unidade \"${qt.unidade}\".")
    val destino = q.unidadeDestino?.let { un.buscar(it) } ?: throw CalculoInvalido("Para qual unidade converter? Por exemplo: ${Texto.significativos(qt.valor, 4)} ${de.simbolo} para ${un.daGrandeza(de.grandeza).firstOrNull { it.simbolo != de.simbolo }?.simbolo ?: "outra unidade"}.")
    val (valor, passo) = un.converterComPasso(qt.valor, de, destino)
    val base = un.base(de.grandeza)
    val passos = mutableListOf<String>()
    if (base != null && (de.offset != 0.0 || destino.offset != 0.0)) {
        val emBase = un.paraBase(qt.valor, de)
        passos += "Para a unidade-base (${base.simbolo}): valor × fator + deslocamento = ${Texto.significativos(qt.valor, 6)} × ${Texto.significativos(de.fator, 7)} + ${Texto.significativos(de.offset, 7)} = ${Texto.significativos(emBase, 7)} ${base.simbolo}."
        passos += "Da base para ${destino.simbolo}: (valor − deslocamento) ÷ fator = (${Texto.significativos(emBase, 7)} − ${Texto.significativos(destino.offset, 7)}) ÷ ${Texto.significativos(destino.fator, 7)} = ${Texto.significativos(valor, 7)} ${destino.simbolo}."
    } else {
        passos += "1 ${de.simbolo} = ${Texto.significativos(de.fator, 7)} ${base?.simbolo ?: "unidade-base"} e 1 ${destino.simbolo} = ${Texto.significativos(destino.fator, 7)} ${base?.simbolo ?: "unidade-base"}."
        passos += "$passo."
    }
    return Resposta(
        Intent.CONVERSAO_UNIDADE, "Conversão de unidades",
        listOf(Bloco.Destaque("${Texto.significativos(qt.valor, 6)} ${de.simbolo} = ${Texto.significativos(valor, 7)} ${destino.simbolo}"), Bloco.Passos("Como converti", passos)),
        fontes = fonteDe(emptyList()), acoes = listOf(Acao.AbrirCalculadora(TipoCalculadora.UNIDADES, "Abrir a conversão de unidades"))
    )
}
