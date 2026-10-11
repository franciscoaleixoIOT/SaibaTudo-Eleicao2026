package net.saibatudo.quimica.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import net.saibatudo.quimica.ai.model.TipoCalculadora
import net.saibatudo.quimica.ai.nlu.Quantidades
import net.saibatudo.quimica.data.model.UnidadeDef
import net.saibatudo.quimica.data.repository.Pacote
import net.saibatudo.quimica.domain.Texto
import net.saibatudo.quimica.domain.calc.Balanceador
import net.saibatudo.quimica.domain.calc.CalculoInvalido
import net.saibatudo.quimica.domain.calc.CampoQtd
import net.saibatudo.quimica.domain.calc.Estequiometria
import net.saibatudo.quimica.domain.calc.GasIdeal
import net.saibatudo.quimica.domain.calc.MassaMolar
import net.saibatudo.quimica.domain.calc.QuantidadeConhecida
import net.saibatudo.quimica.domain.calc.Qtd
import net.saibatudo.quimica.domain.calc.ResultadoCalculo
import net.saibatudo.quimica.domain.calc.Solucoes
import net.saibatudo.quimica.domain.calc.TipoForte
import net.saibatudo.quimica.domain.calc.Unidades
import net.saibatudo.quimica.domain.calc.VariavelGas
import net.saibatudo.quimica.ui.components.AvisoBox
import net.saibatudo.quimica.ui.components.CampoNumero
import net.saibatudo.quimica.ui.components.Cartao
import net.saibatudo.quimica.ui.components.ChipsLinha
import net.saibatudo.quimica.ui.components.DropdownUnidade
import net.saibatudo.quimica.ui.components.FormulaTexto
import net.saibatudo.quimica.ui.components.LinhaCampo
import net.saibatudo.quimica.ui.components.PassosView
import net.saibatudo.quimica.ui.components.TituloSecao

/** Lista das calculadoras (todas rodam no aparelho e mostram os passos). */
@Composable
fun CalculadorasScreen(onAbrir: (TipoCalculadora) -> Unit, modifier: Modifier = Modifier) {
    val itens = listOf(
        TipoCalculadora.MASSA_MOLAR to "Soma as massas atômicas do pacote de dados, com parênteses e hidratos (CuSO₄·5H₂O).",
        TipoCalculadora.BALANCEAMENTO to "Acha os menores coeficientes inteiros por álgebra linear exata, inclusive com íons.",
        TipoCalculadora.ESTEQUIOMETRIA to "Massa e mol de reagentes e produtos, reagente limitante e rendimento.",
        TipoCalculadora.CONCENTRACAO to "Molaridade, massa para preparar uma solução e diluição (C₁V₁ = C₂V₂).",
        TipoCalculadora.PH to "pH e pOH de ácidos e bases fortes ou fracos (com Ka ou Kb).",
        TipoCalculadora.GAS_IDEAL to "PV = nRT com a constante R do pacote; escolha as unidades.",
        TipoCalculadora.UNIDADES to "Temperatura, pressão, volume, massa, energia e mais, a partir das regras do pacote."
    )
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Calculadoras", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
        Text("Os cálculos são feitos no aparelho, com os números do pacote de dados. Nada vem de modelo de IA.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        itens.forEach { (tipo, desc) ->
            Card(
                onClick = { onAbrir(tipo) }, modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
            ) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(tipo.rotulo, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(desc, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

// ---- peças comuns -----------------------------------------------------------------------------------------------------------------

/** Resultado de uma calculadora: linhas, passos e notas; ou a mensagem de erro de entrada. */
@Composable
private fun ResultadoCalcView(resultado: Result<ResultadoCalculo>?) {
    if (resultado == null) return
    resultado.fold(
        onSuccess = { r ->
            Cartao {
                TituloSecao(r.titulo)
                r.linhas.forEach { l ->
                    if (l.destaque) Text("${l.rotulo}: ${l.valor}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                    else LinhaCampo(l.rotulo, l.valor)
                }
                if (r.passos.isNotEmpty()) PassosView("Passo a passo", r.passos)
                r.notas.forEach { AvisoBox(it) }
            }
        },
        onFailure = { e -> AvisoBox(if (e is CalculoInvalido) e.message.orEmpty() else "Não foi possível calcular com estes valores.") }
    )
}

private fun <T> tentar(bloco: () -> T): Result<T> = try {
    Result.success(bloco())
} catch (e: CalculoInvalido) {
    Result.failure(e)
} catch (e: Exception) {
    Result.failure(CalculoInvalido("Confira os valores digitados."))
}

private fun numero(txt: String): Double? = Quantidades.lerNumero(txt)

/** Linha "valor + unidade" de uma grandeza. A unidade escolhida é guardada pelo símbolo. */
@Composable
private fun CampoComUnidade(
    rotulo: String, valor: String, onValor: (String) -> Unit, opcoes: List<UnidadeDef>, simbolo: String, onSimbolo: (String) -> Unit,
    dica: String? = null
) {
    val sel = opcoes.firstOrNull { it.simbolo == simbolo } ?: opcoes.first()
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = androidx.compose.ui.Alignment.Top) {
        CampoNumero(valor, onValor, rotulo, Modifier.weight(0.58f), dica = dica)
        DropdownUnidade(opcoes, sel, { onSimbolo(it.simbolo) }, Modifier.weight(0.42f))
    }
}

private fun unidadesDe(un: Unidades, grandeza: String): List<UnidadeDef> = un.daGrandeza(grandeza)

@Composable
private fun ColunaCalculadora(titulo: String, descricao: String, conteudo: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        // o título já está na barra superior (a tela só abre por ela); o texto abaixo é o enunciado
        Text(descricao, modifier = Modifier.semantics { contentDescription = "$titulo. $descricao" }, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        conteudo()
    }
}

/** Despacha para a calculadora escolhida. */
@Composable
fun CalculadoraTela(tipo: TipoCalculadora, preenchimento: Map<String, String>, pacote: Pacote?, modifier: Modifier = Modifier) {
    if (pacote == null) {
        Text("Carregando os dados…", modifier.padding(16.dp))
        return
    }
    val un = remember(pacote) { Unidades.de(pacote.regras) }
    Column(modifier.fillMaxSize()) {
        when (tipo) {
            TipoCalculadora.MASSA_MOLAR -> MassaMolarCalc(pacote, preenchimento["formula"].orEmpty())
            TipoCalculadora.BALANCEAMENTO -> BalanceamentoCalc(preenchimento["equacao"].orEmpty())
            TipoCalculadora.ESTEQUIOMETRIA -> EstequiometriaCalc(pacote, un, preenchimento["equacao"].orEmpty())
            TipoCalculadora.CONCENTRACAO -> ConcentracaoCalc(pacote, un, preenchimento["formula"].orEmpty())
            TipoCalculadora.PH -> PhCalc(pacote, un)
            TipoCalculadora.GAS_IDEAL -> GasIdealCalc(pacote, un)
            TipoCalculadora.UNIDADES -> UnidadesCalc(un)
        }
    }
}

// ---- massa molar ------------------------------------------------------------------------------------------------------------------

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MassaMolarCalc(pacote: Pacote, inicial: String) {
    var formula by rememberSaveable { mutableStateOf(inicial) }
    var massa by rememberSaveable { mutableStateOf("") }
    var mols by rememberSaveable { mutableStateOf("") }
    val resultado = remember(formula, pacote) { if (formula.isBlank()) null else tentar { MassaMolar.calcular(formula, pacote.porSimbolo) } }
    ColunaCalculadora("Massa molar", "Digite a fórmula: Ca(OH)2, Fe2(SO4)3, CuSO4·5H2O. A soma usa as massas atômicas do pacote de dados.") {
        OutlinedTextField(formula, { formula = it.take(80) }, label = { Text("Fórmula") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("(", ")", "·", "+", "-").forEach { s -> AssistChip(onClick = { formula += s }, label = { Text(s) }) }
        }
        resultado?.fold(
            onSuccess = { mm ->
                Cartao {
                    FormulaTexto(mm.formula.texto)
                    Text("${Texto.fixo(mm.massaMolar, 3)} g/mol", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                    mm.linhas.forEach { l ->
                        LinhaCampo("${l.simbolo} (${l.nome})", "${l.quantidade} × ${Texto.numero(l.massaAtomica, 4)} = ${Texto.numero(l.subtotal, 4)}")
                    }
                    if (mm.formula.carga != 0) AvisoBox("A carga não altera a massa molar neste cálculo.")
                }
                Cartao {
                    TituloSecao("Massa e quantidade de matéria")
                    CampoNumero(massa, { massa = it }, "Massa (g) → mol", Modifier.fillMaxWidth())
                    numero(massa)?.let { m -> Text("${Texto.significativos(m, 5)} g ÷ ${Texto.fixo(mm.massaMolar, 3)} g/mol = ${Texto.significativos(m / mm.massaMolar, 5)} mol", style = MaterialTheme.typography.bodyMedium) }
                    CampoNumero(mols, { mols = it }, "Quantidade (mol) → g", Modifier.fillMaxWidth())
                    numero(mols)?.let { n -> Text("${Texto.significativos(n, 5)} mol × ${Texto.fixo(mm.massaMolar, 3)} g/mol = ${Texto.significativos(n * mm.massaMolar, 5)} g", style = MaterialTheme.typography.bodyMedium) }
                }
            },
            onFailure = { e -> AvisoBox(if (e is CalculoInvalido) e.message.orEmpty() else "Fórmula inválida.") }
        )
    }
}

// ---- balanceamento ---------------------------------------------------------------------------------------------------------------

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BalanceamentoCalc(inicial: String) {
    var equacao by rememberSaveable { mutableStateOf(inicial) }
    val resultado = remember(equacao) { if (equacao.isBlank()) null else tentar { Balanceador.balancear(equacao).comoResultado() } }
    ColunaCalculadora("Balanceamento", "Escreva reagentes e produtos com uma seta: Fe + O2 -> Fe2O3. Íons também valem: Zn + Cu2+ -> Zn2+ + Cu.") {
        OutlinedTextField(equacao, { equacao = it.take(200) }, label = { Text("Equação") }, modifier = Modifier.fillMaxWidth(), minLines = 2, maxLines = 4)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(" -> ", " + ", "(", ")", "^").forEach { s -> AssistChip(onClick = { equacao += s }, label = { Text(s.trim().ifEmpty { s }) }) }
        }
        ResultadoCalcView(resultado)
    }
}

// ---- estequiometria ---------------------------------------------------------------------------------------------------------------

@Composable
private fun EstequiometriaCalc(pacote: Pacote, un: Unidades, inicial: String) {
    var equacao by rememberSaveable { mutableStateOf(inicial) }
    var rendimento by rememberSaveable { mutableStateOf("") }
    val quantidades = remember { mutableStateMapOf<Int, String>() }
    val unidadesQtd = remember { mutableStateMapOf<Int, String>() }
    val balanceada = remember(equacao) { if (equacao.isBlank()) null else tentar { Balanceador.balancear(equacao) } }
    ColunaCalculadora("Estequiometria", "Informe a reação, as quantidades conhecidas (em gramas ou mols) e veja o que se forma, o que sobra e o reagente limitante.") {
        OutlinedTextField(equacao, { equacao = it.take(200) }, label = { Text("Equação") }, modifier = Modifier.fillMaxWidth(), minLines = 2, maxLines = 4)
        balanceada?.fold(
            onSuccess = { bal ->
                val eq = bal.balanceada
                Cartao {
                    TituloSecao("Equação balanceada")
                    Text(eq.texto(), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                    Text("Preencha a quantidade de uma ou mais espécies (deixe as outras em branco).", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                val opcoes = listOfNotNull(un.porSimbolo("g", "massa"), un.porSimbolo("mol", "quantidade"))
                eq.equacao.todas.forEachIndexed { i, esp ->
                    if (esp.eletron) return@forEachIndexed
                    CampoComUnidade(
                        "Quantidade de ${Texto.formulaUnicode(esp.rotulo)}", quantidades[i].orEmpty(), { quantidades[i] = it }, opcoes,
                        unidadesQtd[i] ?: "g", { unidadesQtd[i] = it }
                    )
                }
                CampoNumero(rendimento, { rendimento = it }, "Rendimento real (%) — opcional", Modifier.fillMaxWidth())
                val conhecidas = eq.equacao.todas.indices.mapNotNull { i ->
                    val v = numero(quantidades[i].orEmpty()) ?: return@mapNotNull null
                    QuantidadeConhecida(i, v, emMols = (unidadesQtd[i] ?: "g") == "mol")
                }
                if (conhecidas.isNotEmpty()) {
                    val r = tentar { Estequiometria.calcular(eq, conhecidas, pacote.porSimbolo).let { it.comoResultado(numero(rendimento)) } }
                    ResultadoCalcView(r)
                } else {
                    Text("Aguardando as quantidades.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Cartao { PassosView("Como balanceei", bal.passos) }
            },
            onFailure = { e -> AvisoBox(if (e is CalculoInvalido) e.message.orEmpty() else "Equação inválida.") }
        )
    }
}

// ---- concentração e diluição ---------------------------------------------------------------------------------------------------------

@Composable
private fun ConcentracaoCalc(pacote: Pacote, un: Unidades, inicial: String) {
    val modos = listOf("Molaridade", "Preparar solução", "Diluição")
    var modo by rememberSaveable { mutableStateOf(modos[0]) }
    var formula by rememberSaveable { mutableStateOf(inicial) }
    var a by rememberSaveable { mutableStateOf("") }   // massa | concentração | C1
    var b by rememberSaveable { mutableStateOf("") }   // volume | volume | V1
    var c by rememberSaveable { mutableStateOf("") }   // - | - | C2
    var d by rememberSaveable { mutableStateOf("") }   // - | - | V2
    var ua by rememberSaveable { mutableStateOf("g") }
    var ub by rememberSaveable { mutableStateOf("mL") }
    var uc by rememberSaveable { mutableStateOf("mol/L") }
    var uc2 by rememberSaveable { mutableStateOf("mol/L") }
    var ud by rememberSaveable { mutableStateOf("mL") }
    val massas = unidadesDe(un, "massa")
    val volumes = unidadesDe(un, "volume")
    val concs = unidadesDe(un, "concentracao")
    fun u(l: List<UnidadeDef>, s: String) = l.firstOrNull { it.simbolo == s } ?: l.first()

    ColunaCalculadora("Concentração e diluição", "Escolha o que quer calcular. Os campos aceitam vírgula ou ponto decimal e notação científica (1,8e-5).") {
        ChipsLinha(modos, modo, { modo = it; a = ""; b = ""; c = ""; d = "" })
        if (modo != "Diluição") {
            OutlinedTextField(formula, { formula = it.take(80) }, label = { Text("Substância (fórmula)") }, singleLine = true, modifier = Modifier.fillMaxWidth(), placeholder = { Text("Ex.: NaCl") })
        }
        val resultado: Result<ResultadoCalculo>? = when (modo) {
            "Molaridade" -> {
                CampoComUnidade("Massa do soluto", a, { a = it }, massas, ua, { ua = it })
                CampoComUnidade("Volume da solução", b, { b = it }, volumes, ub, { ub = it })
                val m = numero(a); val v = numero(b)
                if (m != null && v != null && formula.isNotBlank()) tentar {
                    val mm = MassaMolar.calcular(formula, pacote.porSimbolo)
                    Solucoes.molaridade(Qtd(m, u(massas, ua)), mm.massaMolar, Qtd(v, u(volumes, ub)), un, mm.formula.exibicao())
                } else null
            }
            "Preparar solução" -> {
                CampoComUnidade("Concentração desejada", a, { a = it }, concs, uc, { uc = it })
                CampoComUnidade("Volume de solução", b, { b = it }, volumes, ub, { ub = it })
                val cv = numero(a); val v = numero(b)
                if (cv != null && v != null && formula.isNotBlank()) tentar {
                    val mm = MassaMolar.calcular(formula, pacote.porSimbolo)
                    Solucoes.massaParaPreparar(Qtd(cv, u(concs, uc)), Qtd(v, u(volumes, ub)), mm.massaMolar, un, mm.formula.exibicao())
                } else null
            }
            else -> {
                Text("C₁·V₁ = C₂·V₂. Deixe em branco o campo que quer descobrir.", style = MaterialTheme.typography.bodySmall)
                CampoComUnidade("C₁ (concentração inicial)", a, { a = it }, concs, uc, { uc = it })
                CampoComUnidade("V₁ (volume inicial)", b, { b = it }, volumes, ub, { ub = it })
                CampoComUnidade("C₂ (concentração final)", c, { c = it }, concs, uc2, { uc2 = it })
                CampoComUnidade("V₂ (volume final)", d, { d = it }, volumes, ud, { ud = it })
                val campos = listOf(a, b, c, d)
                if (campos.count { it.isBlank() } == 1 && campos.filter { it.isNotBlank() }.all { numero(it) != null }) tentar {
                    Solucoes.diluicao(
                        CampoQtd(numero(a), u(concs, uc)), CampoQtd(numero(b), u(volumes, ub)),
                        CampoQtd(numero(c), u(concs, uc2)), CampoQtd(numero(d), u(volumes, ud)), un
                    )
                } else null
            }
        }
        ResultadoCalcView(resultado)
    }
}

// ---- pH ----------------------------------------------------------------------------------------------------------------------------------

@Composable
private fun PhCalc(pacote: Pacote, un: Unidades) {
    val modos = listOf("Ácido forte", "Base forte", "Ácido fraco", "Base fraca")
    var modo by rememberSaveable { mutableStateOf(modos[0]) }
    var conc by rememberSaveable { mutableStateOf("") }
    var uConc by rememberSaveable { mutableStateOf("mol/L") }
    var k by rememberSaveable { mutableStateOf("") }
    var n by rememberSaveable { mutableStateOf("1") }
    val concs = unidadesDe(un, "concentracao")
    ColunaCalculadora("pH de ácidos e bases", "Ácidos e bases fortes ionizam por completo. Para os fracos, informe a constante de equilíbrio (Ka ou Kb), que o app não tem nos dados.") {
        ChipsLinha(modos, modo, { modo = it })
        CampoComUnidade("Concentração do ${if (modo.startsWith("Ácido")) "ácido" else "base"}", conc, { conc = it }, concs, uConc, { uConc = it })
        val forte = modo.endsWith("forte")
        if (forte) {
            Text("Quantos ${if (modo.startsWith("Ácido")) "H⁺" else "OH⁻"} cada fórmula libera?", style = MaterialTheme.typography.bodyMedium)
            ChipsLinha(listOf("1", "2", "3"), n, { n = it })
            Text("Exemplos: HCl e NaOH = 1; H₂SO₄ e Ca(OH)₂ = 2.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            CampoNumero(k, { k = it }, if (modo.startsWith("Ácido")) "Ka" else "Kb", Modifier.fillMaxWidth(), dica = "Ex.: 1,8e-5 (ácido acético)")
        }
        val c = numero(conc)
        val kv = numero(k)
        val pKw = Solucoes.pKwDoPacote(pacote.constantes)
        val resultado = if (c == null) null else tentar {
            val q = Qtd(c, concs.firstOrNull { it.simbolo == uConc } ?: concs.first())
            val tipo = if (modo.startsWith("Ácido")) TipoForte.ACIDO else TipoForte.BASE
            if (forte) Solucoes.phForte(tipo, q, n.toIntOrNull() ?: 1, un, pKw.first, pKw.second)
            else if (kv == null) throw CalculoInvalido("Informe a constante ${if (tipo == TipoForte.ACIDO) "Ka" else "Kb"}.")
            else Solucoes.phFraco(tipo, q, kv, if (tipo == TipoForte.ACIDO) "Ka" else "Kb", un, pKw.first, pKw.second)
        }
        ResultadoCalcView(resultado)
    }
}

// ---- gás ideal ----------------------------------------------------------------------------------------------------------------------------

@Composable
private fun GasIdealCalc(pacote: Pacote, un: Unidades) {
    var p by rememberSaveable { mutableStateOf("") }
    var v by rememberSaveable { mutableStateOf("") }
    var n by rememberSaveable { mutableStateOf("") }
    var t by rememberSaveable { mutableStateOf("") }
    var up by rememberSaveable { mutableStateOf("atm") }
    var uv by rememberSaveable { mutableStateOf("L") }
    var un2 by rememberSaveable { mutableStateOf("mol") }
    var ut by rememberSaveable { mutableStateOf("K") }
    val ps = unidadesDe(un, "pressao"); val vs = unidadesDe(un, "volume"); val ns = unidadesDe(un, "quantidade"); val ts = unidadesDe(un, "temperatura")
    fun u(l: List<UnidadeDef>, s: String) = l.firstOrNull { it.simbolo == s } ?: l.first()
    ColunaCalculadora("Gás ideal", "PV = nRT. Preencha três campos e deixe em branco o que quer calcular. R vem das constantes do pacote.") {
        AssistChip(onClick = { n = "1"; un2 = "mol"; t = "0"; ut = "°C"; p = "1"; up = "atm"; v = "" }, label = { Text("CNTP: 1 mol, 0 °C, 1 atm") })
        CampoComUnidade("Pressão (P)", p, { p = it }, ps, up, { up = it })
        CampoComUnidade("Volume (V)", v, { v = it }, vs, uv, { uv = it })
        CampoComUnidade("Quantidade de matéria (n)", n, { n = it }, ns, un2, { un2 = it })
        CampoComUnidade("Temperatura (T)", t, { t = it }, ts, ut, { ut = it })
        val campos = listOf(p, v, n, t)
        val resultado = if (campos.count { it.isBlank() } == 1 && campos.filter { it.isNotBlank() }.all { numero(it) != null }) tentar {
            GasIdeal.resolver(
                CampoQtd(numero(p), u(ps, up)), CampoQtd(numero(v), u(vs, uv)), CampoQtd(numero(n), u(ns, un2)), CampoQtd(numero(t), u(ts, ut)),
                pacote.constante("R"), un
            )
        } else null
        ResultadoCalcView(resultado)
    }
}

// ---- unidades ------------------------------------------------------------------------------------------------------------------------------

@Composable
private fun UnidadesCalc(un: Unidades) {
    val rotulos = mapOf(
        "temperatura" to "Temperatura", "pressao" to "Pressão", "volume" to "Volume", "massa" to "Massa", "energia" to "Energia", "quantidade" to "Quantidade de matéria",
        "concentracao" to "Concentração", "densidade" to "Densidade", "comprimento" to "Comprimento", "tempo" to "Tempo"
    )
    val grandezas = un.grandezas()
    var grandeza by rememberSaveable { mutableStateOf(grandezas.firstOrNull() ?: "") }
    var valor by rememberSaveable { mutableStateOf("") }
    var de by rememberSaveable { mutableStateOf("") }
    var para by rememberSaveable { mutableStateOf("") }
    val lista = un.daGrandeza(grandeza)
    val ud = lista.firstOrNull { it.simbolo == de } ?: lista.firstOrNull()
    val up = lista.firstOrNull { it.simbolo == para } ?: lista.getOrNull(1) ?: lista.firstOrNull()
    ColunaCalculadora("Conversão de unidades", "As unidades vêm das regras do pacote de dados (com definições exatas do SI quando faltam).") {
        ChipsLinha(grandezas.map { rotulos[it] ?: it }, rotulos[grandeza] ?: grandeza, { r -> grandeza = rotulos.entries.firstOrNull { it.value == r }?.key ?: r; de = ""; para = "" })
        if (lista.isNotEmpty() && ud != null && up != null) {
            CampoNumero(valor, { valor = it }, "Valor", Modifier.fillMaxWidth())
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DropdownUnidade(lista, ud, { de = it.simbolo }, Modifier.weight(1f), rotulo = "De")
                DropdownUnidade(lista, up, { para = it.simbolo }, Modifier.weight(1f), rotulo = "Para")
            }
            val v = numero(valor)
            if (v != null) {
                val r = tentar {
                    val (res, passo) = un.converterComPasso(v, ud, up)
                    val base = un.base(grandeza)
                    val passos = mutableListOf<String>()
                    if (base != null && (ud.offset != 0.0 || up.offset != 0.0)) {
                        val emBase = un.paraBase(v, ud)
                        passos += "Para a base (${base.simbolo}): valor × fator + deslocamento = ${Texto.significativos(v, 6)} × ${Texto.significativos(ud.fator, 7)} + ${Texto.significativos(ud.offset, 7)} = ${Texto.significativos(emBase, 7)} ${base.simbolo}."
                        passos += "Da base para ${up.simbolo}: (valor − deslocamento) ÷ fator = ${Texto.significativos(res, 7)} ${up.simbolo}."
                    } else {
                        passos += "1 ${ud.simbolo} = ${Texto.significativos(ud.fator, 7)} ${base?.simbolo ?: "base"}; 1 ${up.simbolo} = ${Texto.significativos(up.fator, 7)} ${base?.simbolo ?: "base"}."
                        passos += "$passo."
                    }
                    ResultadoCalculo(
                        "Resultado", listOf(net.saibatudo.quimica.domain.calc.LinhaResultado("${Texto.significativos(v, 6)} ${ud.simbolo}", "${Texto.significativos(res, 7)} ${up.simbolo}", destaque = true)), passos
                    )
                }
                ResultadoCalcView(r)
            }
        } else {
            AvisoBox("O pacote de dados não traz unidades para esta grandeza.")
        }
    }
}
