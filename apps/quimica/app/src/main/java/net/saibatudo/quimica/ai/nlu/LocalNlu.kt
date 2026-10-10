package net.saibatudo.quimica.ai.nlu

import net.saibatudo.quimica.ai.Seguranca
import net.saibatudo.quimica.ai.model.Intent
import net.saibatudo.quimica.ai.model.ParsedQuery
import net.saibatudo.quimica.ai.model.Quantidade
import net.saibatudo.quimica.domain.Texto
import net.saibatudo.quimica.domain.calc.Balanceador
import net.saibatudo.quimica.domain.calc.FormulaQuimica

/**
 * NLU LOCAL determinístico (regras + dicionário derivado dos dados): converte uma pergunta em [ParsedQuery] (intenção +
 * entidades). Não consulta nem produz fatos. É o espelho de web/src/quimica/js/nlu.js, com a MESMA ORDEM de regras; os casos
 * de referência de contracts/nlu_golden_cases.json validam os dois.
 *
 * Ordem (a primeira regra que casa vence):
 *  1. segurança química (RECUSA_PERIGO), antes de qualquer outra coisa;
 *  2. conversa e meta: AJUDA (saudação), SOBRE_DADOS, FONTES, AJUDA ("o que você faz");
 *  3. equação química: ESTEQUIOMETRIA (com quantidades) ou BALANCEAR;
 *  4. CONVERSAO_UNIDADE (duas unidades da mesma grandeza);
 *  5. cálculos: PH, GAS_IDEAL, CONCENTRACAO, ESTEQUIOMETRIA, MASSA_MOLAR;
 *  6. COMPARAR, DESENHAR, SEGURANCA, NOMENCLATURA;
 *  7. TABELA_PERIODICA;
 *  8. PROPRIEDADE, ELEMENTO, COMPOSTO;
 *  9. CONCEITO e, por fim, DESCONHECIDA.
 */
object LocalNlu {

    const val TAMANHO_MAXIMO = 300

    private val RX_SETA = Regex("""\s*(?:<=>|<->|⇌|⇄|-->|->|→|⟶|⇒|=>|==|=)\s*""")

    // ---- expressões (sobre o texto normalizado pelo NLU) -----------------------------------------------------------------
    private val RX_SAUDACAO = Regex("""^(oi+|ola|opa|bom dia|boa tarde|boa noite|e ai|eai|hey|hello|hi|obrigad[oa]|muito obrigad[oa]|valeu|vlw|brigad[oa]|ajuda|help|socorro|menu|inicio|comecar|teste|testando)( tudo bem| td bem| tudo bom| como vai| assistente| ia| amigo| pessoal)*$""")
    private val RX_AJUDA = Regex("""\b(?:o que (?:voce|vc|o app|o aplicativo|esse app|este app|a ia) (?:faz|sabe|responde|pode)|como (?:usar|uso|funciona) (?:o |este |esse )?(?:app|aplicativo|assistente)|o que (?:posso|eu posso|da para|da pra) perguntar|preciso de ajuda|quem (?:fez|criou|desenvolveu) (?:o |este |esse )?(?:app|aplicativo))\b""")
    private val RX_SOBRE_DADOS = Regex("""\b(?:sobre os dados|de onde (?:vem|vêm|veem) os dados|origem dos dados|fonte dos dados|atualizacao dos dados|dados (?:sao )?atualizados|versao dos dados|quando foi atualizado|licenca dos dados|assinatura dos dados)\b""")
    private val RX_FONTES = Regex("""\b(?:quais (?:sao )?as (?:fontes|licencas)|licencas? (?:das? )?(?:informac\w+|respostas?)|qual (?:e )?a fonte|fontes? (?:das? )?(?:informac\w+|respostas?)|de onde (?:tirou|vem) (?:essa|esta|a) (?:informacao|resposta)|referencias?)\b""")
    private val RX_BALANCEAR = Regex("""\bbalanc\w*|\bequilibr\w+ (?:a |uma )?equacao\b|\bacert\w+ (?:os )?coeficientes\b""")
    private val RX_CONVERSAO = Regex("""\b(?:convert\w+|converta|transform\w+|passar|passe|equivale\w*|quantos? \S+ (?:tem|ha|sao|equivalem|existem|correspondem)|quantas? \S+ (?:tem|ha|sao|equivalem|existem|correspondem)|em quantos?)\b""")
    private val RX_PH = Regex("""\b(?:ph|poh)\b|\bacidez de\b|\bbasicidade\b""")
    private val RX_GAS = Regex("""\b(?:gas(?:es)? ideais?|gas ideal|pv ?= ?nrt|pvnrt|lei dos gases|equacao (?:de clapeyron|dos gases|geral dos gases)|clapeyron|volume (?:molar|de um gas|de gas)|pressao (?:de um gas|do gas)|lei de boyle|lei de charles|gay lussac)\b""")
    private val RX_GAS_VAR = Regex("""\bgas(?:es)?\b""")
    private val RX_CONCENTRACAO = Regex("""\b(?:molaridade|concentracao|concentrad[ao]|diluic\w*|diluir|dilua|diluido|c1 ?v1|c1v1|titulo (?:em massa|da solucao)|percentual (?:em )?massa|porcentagem em massa|partes por milhao|ppm|normalidade|molalidade|solucao de|gramas por litro|mol l|mol por litro|g l)\b""")
    private val RX_ESTEQ = Regex("""\b(?:estequiometri\w*|reagente (?:limitante|em excesso)|limitante|excesso de reagente|rendimento|quantos? (?:mols?|gramas?|moleculas?|atomos?|litros?|ions?|particulas?|quilos?|mg|miligramas?)\b|quantas? (?:moleculas|particulas|atomos|gramas|mols|litros)|numero de (?:mols?|moleculas|atomos|particulas|ions)|cntp|condicoes normais|volume ocupado|constante de avogadro|numero de avogadro)\b""")
    private val RX_MASSA_MOLAR = Regex("""\b(?:massa molar|massa molecular|massa formula|peso molecular|peso molar|quanto pesa (?:um )?mol|quanto vale (?:a )?massa molar)\b|\bg mol\b""")
    private val RX_DESENHAR = Regex("""\b(?:desenh\w+|estrutura (?:2d|molecular|quimica|plana|de lewis|do|da|de)|estrutura|mostr\w+ (?:a )?(?:estrutura|molecula)|molecula (?:do|da|de)|como (?:e|eh) (?:a )?(?:molecula|estrutura)|formula estrutural|geometria molecular|visualizar|esqueleto)\b""")
    private val RX_COMPARAR = Regex("""\b(?:compar\w+|diferenca (?:s )?entre|diferencas? entre|\bversus\b|\bvs\b|qual (?:a )?diferenca|semelhanca\w*|igual a|parecid\w+)\b""")
    private val RX_SEGURANCA = Regex("""\b(?:perig\w+|toxic\w+|segur\w+|epis?\b|equipamentos? de protecao|primeiros? socorros|derram\w+|vazament\w+|armazen\w+|incendi\w+|inflamav\w+|corrosiv\w+|irritant\w+|irrita\w*|ghs|pictogramas?|frases? h\b|ficha de seguranca|icsc|fispq|mistur\w+|incompativ\w+|descart\w+|manusear|manuseio|inala\w+|ingest\w+|queimadur\w+|venenos\w+|veneno|faz mal|fazem mal|neutraliz\w+|luvas|oculos de protecao|palavra de sinal|classificacao de perigo|e seguro|e perigoso|cancerigen\w+|explosiv\w+|reage com agua|reativ\w+ com)\b""")
    private val RX_NOMENCLATURA = Regex("""\b(?:qual (?:e )?(?:o )?nome|como (?:se )?chama|nome (?:quimico|iupac|sistematico|cientifico|oficial)|nomenclatura|como (?:se )?escreve|qual (?:e )?a? ?formula(?: quimica| molecular)?|formula (?:do|da|de|quimica do|quimica da|molecular do|molecular da)|nome do composto)\b""")
    private val RX_TABELA = Regex("""\b(?:tabela periodica|periodicidade|tendencia\w*|grupo \d{1,2}|familia \d{1,2}|periodo \d|bloco [spdf]|elementos? (?:do|da|dos|das) (?:grupo|periodo|bloco|familia)|quais (?:sao )?(?:os )?elementos|quantos elementos|elementos (?:gasosos|liquidos|solidos)|metais|nao metais|ametais|semimetais|metaloides|halogenios?|gases? nobres?|alcalino terrosos?|alcalinos?|lantanideos?|lantanidios?|actinideos?|actinidios?|elemento mais|elementos mais|ordem crescente|ordem decrescente|maior (?:raio|eletronegatividade|energia|ponto|massa|densidade)|menor (?:raio|eletronegatividade|energia|ponto|massa|densidade))\b""")
    private val RX_CONCEITO_CUE = Regex("""^(?:o que (?:e|eh|sao|significa|quer dizer|seria)|oque e|expli(?:c|qu)\w*|defin\w+|conceito de|definicao de|me explica\w*|como funciona\w*|por que|por qu[eê]|porque|para que serve|qual (?:e )?a? ?(?:definicao|diferenca|importancia|funcao)|diferenca entre|ensin\w+|resum\w+)\b""")
    private val RX_INICIO_CONCEITO = Regex("""^(?:o que|oque|expli\w*|defin\w*|conceito|como funciona|por que)""")
    private val RX_INICIO_CONCEITO2 = Regex("""^(?:o que|oque|expli\w*|defin\w*|conceito)\b""")
    private val RX_INICIO_CONCEITO3 = Regex("""^(?:o que|oque|expli\w*|defin\w*|conceito|como funciona|por que)\b""")

    private val CATEGORIAS: List<Pair<Regex, String>> = listOf(
        """\balcalino terros\w*|\balcalinos terros\w*""" to "metal_alcalino_terroso", """\bmetais? alcalinos?|\balcalinos\b""" to "metal_alcalino",
        """\bmetais? de transicao|\bmetal de transicao|\belementos? de transicao""" to "metal_transicao", """\bpos transicao|\bmetais? representativos?""" to "metal_pos_transicao",
        """\bsemimetais?|\bmetaloides?""" to "semimetal", """\bnao metais?|\bametais?""" to "nao_metal", """\bhalogenios?""" to "halogenio",
        """\bgas(?:es)? nobres?|\bnobres\b""" to "gas_nobre", """\blantanideos?|\blantanidios?|\bterras raras""" to "lantanideo",
        """\bactinideos?|\bactinidios?|\bactinoides?|\bactinios\b""" to "actinideo", """\bmetais\b|\bmetal\b""" to "metal"
    ).map { (r, c) -> Regex(r) to c }
    private val ESTADOS: List<Pair<Regex, String>> = listOf(
        """\b(?:gasosos?|gases|no estado gasoso)\b""" to "gas", """\bliquidos?\b""" to "liquido", """\bsolidos?\b""" to "solido"
    ).map { (r, c) -> Regex(r) to c }
    private val EXTREMOS: List<Pair<Regex, Pair<String, String>>> = listOf(
        """\bmais eletronegativ\w+|\bmaior eletronegatividade""" to ("eletronegatividade" to "max"), """\bmenos eletronegativ\w+|\bmenor eletronegatividade""" to ("eletronegatividade" to "min"),
        """\bmais densos?\b|\bmaior densidade""" to ("densidade" to "max"), """\bmenos densos?\b|\bmenor densidade|\bmais leves?\b""" to ("densidade" to "min"),
        """\bmaior raio|\bmais volumos\w+""" to ("raioAtomico" to "max"), """\bmenor raio""" to ("raioAtomico" to "min"),
        """\bmaior ponto de fusao""" to ("pontoFusao" to "max"), """\bmenor ponto de fusao""" to ("pontoFusao" to "min"),
        """\bmaior ponto de ebulicao""" to ("pontoEbulicao" to "max"), """\bmenor ponto de ebulicao""" to ("pontoEbulicao" to "min"),
        """\bmaior energia de ionizacao""" to ("energiaIonizacao" to "max"), """\bmenor energia de ionizacao""" to ("energiaIonizacao" to "min"),
        """\bmais pesad\w+|\bmaior massa atomica""" to ("massaAtomica" to "max"), """\bmenor massa atomica""" to ("massaAtomica" to "min")
    ).map { (r, c) -> Regex(r) to c }

    private fun nivelDe(n: String): String? = when {
        Regex("""\b(?:ensino fundamental|fundamental|crianca|simples|bem simples|facil de entender|para leigos)\b""").containsMatchIn(n) -> "fundamental"
        Regex("""\b(?:ensino medio|medio|enem|vestibular)\b""").containsMatchIn(n) -> "medio"
        Regex("""\b(?:faculdade|universidade|superior|avancado|graduacao|aprofundad\w+|detalhad\w+)\b""").containsMatchIn(n) -> "superior"
        else -> null
    }

    // ---- equação -----------------------------------------------------------------------------------------------------------------

    private val RX_ELETRON = Regex("""^e(?:\^?[-−]|⁻)$""")

    private fun ehEspecie(tok: String): Boolean {
        val t = tok.trimEnd('.', ',', ';', ':', '!', '?')
        if (t.isEmpty()) return false
        if (t == "+" || t.all { it.isDigit() }) return true
        val partes = Balanceador.dividirEspecies(t)
        if (partes.isEmpty()) return false
        return partes.all { p ->
            val corpo = p.replace(Regex("""^\d+\s*"""), "")
            RX_ELETRON.matches(corpo) || (corpo.isNotEmpty() && (corpo[0] in 'A'..'Z' || corpo[0] == '(' || corpo[0] == '[') && FormulaQuimica.tentar(corpo) != null)
        }
    }

    /** Extrai "Fe + O2 -> Fe2O3" de uma frase; null se não houver equação. */
    fun extrairEquacao(original: String): String? = extrairEquacaoComPosicao(original)?.first

    /** A equação normalizada e o trecho (índices do texto original) que ela ocupa. */
    fun extrairEquacaoComPosicao(original: String): Pair<String, IntRange>? {
        val m = RX_SETA.find(original) ?: return null
        val tok = Regex("""\S+""")
        val esq = tok.findAll(original.substring(0, m.range.first)).toList()
        val dirOffset = m.range.last + 1
        val dir = tok.findAll(original.substring(dirOffset)).toList()
        val l = ArrayDeque<MatchResult>()
        for (i in esq.indices.reversed()) { if (ehEspecie(esq[i].value)) l.addFirst(esq[i]) else break }
        val r = mutableListOf<Pair<String, IntRange>>()
        for (x in dir) {
            if (!ehEspecie(x.value)) break
            val limpo = x.value.trimEnd('.', ',', ';', ':', '!', '?')
            r += limpo to ((dirOffset + x.range.first)..(dirOffset + x.range.first + limpo.length - 1))
        }
        val lista = l.map { it.value to it.range }.toMutableList()
        while (lista.isNotEmpty() && lista.last().first == "+") lista.removeAt(lista.lastIndex)
        while (r.isNotEmpty() && r.last().first == "+") r.removeAt(r.lastIndex)
        fun soNumerosOuMais(x: List<Pair<String, IntRange>>) = x.all { it.first.all { c -> c.isDigit() } || it.first == "+" }
        if (lista.isEmpty() || r.isEmpty() || soNumerosOuMais(lista) || soNumerosOuMais(r)) return null
        val equacao = lista.joinToString(" ") { it.first } + " -> " + r.joinToString(" ") { it.first }
        return equacao to (lista.first().second.first..r.last().second.last)
    }

    // ---- unidade de destino ------------------------------------------------------------------------------------------------------

    private val RX_PARA_UNIDADE = Regex("""\b(?:para|em|a|pra|ate)\s+(?:o |a |os |as )?([A-Za-zµμ°º/³²·.]+(?: celsius| fahrenheit| por litro| de mercurio)?)\s*[?!.]*$""", RegexOption.IGNORE_CASE)
    private val RX_QUANTOS_UNIDADE = Regex("""^\s*(?:quantos?|quantas?)\s+([A-Za-zµμ°º/³²·.]+(?: celsius| fahrenheit)?)\s+(?:tem|ha|sao|equivalem|existem|correspondem|vale|valem)\b""", RegexOption.IGNORE_CASE)

    // ---- parse -------------------------------------------------------------------------------------------------------------------------

    fun parse(pergunta: String, d: Dicionario, contexto: ParsedQuery? = null): ParsedQuery {
        val original = Regex("""\s+""").replace(pergunta, " ").trim().take(TAMANHO_MAXIMO)
        val n = Texto.nlu(original)
        var p = ParsedQuery(Intent.DESCONHECIDA, textoOriginal = original)
        if (n.isEmpty() && !RX_SETA.containsMatchIn(original)) return p

        // 1) segurança: antes de tudo
        if (Seguranca.avaliar(original).recusar) return p.copy(intent = Intent.RECUSA_PERIGO)

        val unidades = d.unidades
        val ents = d.entidades(original)
        val props = d.propriedadesEm(n)
        val quant = Quantidades.ler(original, unidades)
        val temQuant = quant.any { it.unidade != null && it.unidade != "%" }
        val equacao = extrairEquacao(original)
        val nivel = nivelDe(n)
        val constantes = Quantidades.lerConstantes(original)
        val quantidadesPublicas = quant.mapNotNull { q -> q.unidade?.let { Quantidade(q.valor, it, q.texto) } }

        // entidades: um nome de elemento que também é de composto prefere o elemento, salvo "gás"/fórmula digitada
        val els = ents.elementos
        val comps = ents.compostos
        var compostos = comps
        if (els.isNotEmpty() && comps.isNotEmpty()) {
            val nomesEl = els.map { Texto.nlu(it.nome) }.toSet()
            compostos = comps.filter { it.via != "nome" || Texto.nlu(it.nome) !in nomesEl || Regex("""\bgas\b""").containsMatchIn(n) }
        }
        val elementos = els.filter { e -> !(compostos.isNotEmpty() && compostos.any { it.via == "formula" && it.texto == e.simbolo }) }
        val formulasTexto = ents.formulas.map { it.texto!! }
        p = p.copy(
            nivel = nivel, quantidades = quantidadesPublicas, constantes = constantes,
            elementos = elementos.map { it.simbolo!! }, elemento = elementos.firstOrNull()?.simbolo,
            compostos = compostos.map { it.cid.toString() }, composto = compostos.firstOrNull()?.cid?.toString(), compostoNome = compostos.firstOrNull()?.nome,
            formulas = formulasTexto, formula = formulasTexto.firstOrNull() ?: compostos.firstOrNull { it.via == "formula" }?.texto,
            propriedades = props.map { it.id }, propriedade = props.firstOrNull()?.id
        )
        val nEnt = p.elementos.size + p.compostos.size + p.formulas.size
        val tem = nEnt > 0
        fun fim(intent: Intent, extra: (ParsedQuery) -> ParsedQuery = { it }): ParsedQuery = extra(p.copy(intent = intent))

        // 2) conversa e meta
        if (RX_SAUDACAO.containsMatchIn(n) && !tem) return fim(Intent.AJUDA)
        if (RX_SOBRE_DADOS.containsMatchIn(n)) return fim(Intent.SOBRE_DADOS)
        if (RX_FONTES.containsMatchIn(n) && !tem) return fim(Intent.FONTES)
        if (RX_AJUDA.containsMatchIn(n)) return fim(Intent.AJUDA)

        // 3) equação química
        if (equacao != null || RX_BALANCEAR.containsMatchIn(n)) {
            val querCalcular = temQuant && Regex("""\b(?:limitante|rendimento|quantos?|quantas?|massa de|gramas?|mols?|produz\w*|forma\w*|obt\w+|reage\w*|consum\w+|sobra\w*|excesso|volume|litros?)\b""").containsMatchIn(n)
            if (equacao != null && querCalcular) return fim(Intent.ESTEQUIOMETRIA) { it.copy(equacao = equacao) }
            return fim(Intent.BALANCEAR) { it.copy(equacao = equacao) }
        }

        // 4) conversão de unidades (duas unidades de uma mesma grandeza, ou "converter X para Y")
        val unidadesLidas = quant.filter { it.unidade != null }
        val textoCompacto = Regex("""^(.*\d)\s+""").replace(original.trim(), "$1 ").trim()
        val paraUnidade: String? = RX_PARA_UNIDADE.find(textoCompacto)?.let { Quantidades.lerUnidade(it.groupValues[1], unidades) }
        val quantosUnidade = RX_QUANTOS_UNIDADE.find(Texto.semAcentos(original))
        if (!tem || p.formulas.isEmpty() || temQuant) {
            val temConv = RX_CONVERSAO.containsMatchIn(n) || quantosUnidade != null || Regex("""(?:->|→| em | para | pra | to )""").containsMatchIn(original)
            if (unidadesLidas.isNotEmpty() && temConv && !RX_PH.containsMatchIn(n) && !RX_GAS.containsMatchIn(n) && !RX_CONCENTRACAO.containsMatchIn(n) &&
                !RX_ESTEQ.containsMatchIn(n) && !RX_MASSA_MOLAR.containsMatchIn(n)
            ) {
                var destino = if (quantosUnidade != null) Quantidades.lerUnidade(quantosUnidade.groupValues[1], unidades) else paraUnidade
                if (destino == null && unidadesLidas.size >= 2) destino = unidadesLidas.last().unidade
                val origem = unidadesLidas.first().unidade
                if (destino != null && origem != null && destino != origem && unidades.buscar(origem) != null) {
                    return fim(Intent.CONVERSAO_UNIDADE) { it.copy(unidadeDestino = destino, quantidades = listOfNotNull(unidadesLidas.first().let { q -> q.unidade?.let { u -> Quantidade(q.valor, u, q.texto) } })) }
                }
            }
        }

        // 5) cálculos
        val temKaKb = constantes.isNotEmpty()
        if (RX_PH.containsMatchIn(n)) {
            if (temQuant || temKaKb || tem || Regex("""\b(?:acido|base|solucao)\b""").containsMatchIn(n)) {
                if (temQuant || temKaKb) return fim(Intent.PH)
                if (Regex("""\bde\b""").containsMatchIn(n) && tem) return fim(Intent.PH)   // "pH da água" (sem concentração): a resposta pede os dados
            }
            return fim(Intent.CONCEITO) { it.copy(conceito = "ph") }
        }
        val gasPorVariaveis = RX_GAS_VAR.containsMatchIn(n) && unidadesLidas.any { it.unidade in setOf("atm", "Pa", "kPa", "mmHg", "bar", "K", "°C") } &&
            Regex("""\b(?:volume|pressao|temperatura|mols?|quantos)\b""").containsMatchIn(n)
        if (RX_GAS.containsMatchIn(n) || Regex("""pv\s*=\s*nrt""", RegexOption.IGNORE_CASE).containsMatchIn(original) || gasPorVariaveis) {
            if (RX_INICIO_CONCEITO.containsMatchIn(n) && !temQuant) return fim(Intent.CONCEITO) { it.copy(conceito = "gas ideal") }
            return fim(Intent.GAS_IDEAL)
        }
        if (RX_CONCENTRACAO.containsMatchIn(n) && (temQuant || Regex("""\bdilu\w*|molaridade|concentracao\b""").containsMatchIn(n)) && !RX_INICIO_CONCEITO3.containsMatchIn(n)) return fim(Intent.CONCENTRACAO)
        if (RX_ESTEQ.containsMatchIn(n) && (temQuant || tem) && !RX_INICIO_CONCEITO2.containsMatchIn(n)) {
            // com várias substâncias, a primeira é a que recebe a quantidade ("16 g de metano" em "quantos gramas de CO2 se formam de 16 g de metano")
            val ligado = compostoLigadoAQuantidade(original, quant, d, p.compostos)
            return fim(Intent.ESTEQUIOMETRIA) {
                if (ligado == null) it.copy(equacao = equacao)
                else it.copy(equacao = equacao, composto = ligado, compostos = listOf(ligado) + it.compostos.filter { c -> c != ligado })
            }
        }
        if (RX_MASSA_MOLAR.containsMatchIn(n) && !RX_INICIO_CONCEITO2.containsMatchIn(n)) return fim(Intent.MASSA_MOLAR)

        // 6) representação, comparação, segurança, nomenclatura
        if (RX_COMPARAR.containsMatchIn(n) && p.compostos.size + p.elementos.size + p.formulas.size >= 2) return fim(Intent.COMPARAR)
        if (RX_DESENHAR.containsMatchIn(n) && (p.compostos.isNotEmpty() || p.formulas.isNotEmpty()) && !Regex("""\bpropriedades\b""").containsMatchIn(n)) return fim(Intent.DESENHAR)
        if (RX_SEGURANCA.containsMatchIn(n)) {
            val mistura = Regex("""\b(?:mistur\w+|junto com|juntos|combinar|misturado|misturada|incompativ\w+)\b""").containsMatchIn(n)
            return fim(Intent.SEGURANCA) { it.copy(mistura = mistura) }
        }
        if (RX_NOMENCLATURA.containsMatchIn(n) && (p.compostos.isNotEmpty() || p.formulas.isNotEmpty())) return fim(Intent.NOMENCLATURA)

        // 7) tabela periódica
        val grupo = Regex("""\b(?:grupo|familia)\s+(\d{1,2})\b""").find(n)
        val periodo = Regex("""\bperiodo\s+(\d)\b""").find(n)
        val bloco = Regex("""\bbloco\s+([spdf])\b""").find(n)
        val categoria = CATEGORIAS.firstOrNull { it.first.containsMatchIn(n) }?.second
        val estado = ESTADOS.firstOrNull { it.first.containsMatchIn(n) }?.second
        val extremo = EXTREMOS.firstOrNull { it.first.containsMatchIn(n) }?.second
        val tendencia = Regex("""\btendencia\w*|\bperiodicidade|\bvaria\w* (?:ao longo|no periodo|no grupo)|\bao longo d[oa] (?:periodo|grupo)""").containsMatchIn(n)
        val filtroTabela = grupo != null || periodo != null || bloco != null || categoria != null || extremo != null || tendencia || Regex("""\btabela periodica\b""").containsMatchIn(n)
        if (filtroTabela && !(p.propriedade != null && nEnt > 0 && grupo == null && periodo == null && bloco == null && !tendencia)) {
            val naoEhFiltroPuro = nEnt > 0 && categoria == "metal" && grupo == null && periodo == null
            if (!naoEhFiltroPuro) {
                return fim(Intent.TABELA_PERIODICA) {
                    it.copy(
                        grupo = grupo?.groupValues?.get(1)?.toInt(), periodo = periodo?.groupValues?.get(1)?.toInt(), bloco = bloco?.groupValues?.get(1), categoria = categoria,
                        estado = if (Regex("""\belementos?\b""").containsMatchIn(n) || categoria != null) estado else null, extremo = extremo, tendencia = tendencia,
                        propriedade = p.propriedade ?: extremo?.first
                    )
                }
            }
        }
        if (estado != null && Regex("""\belementos?\b""").containsMatchIn(n) && nEnt == 0) return fim(Intent.TABELA_PERIODICA) { it.copy(estado = estado) }

        // 8) propriedades e perfis
        if (p.propriedade != null && tem) {
            val alvos = props.map { it.alvo }.toSet()
            return fim(Intent.PROPRIEDADE) { it.copy(alvoPropriedade = if ("composto" in alvos && p.compostos.isNotEmpty()) "composto" else if (p.elementos.isNotEmpty()) "elemento" else "composto") }
        }
        val cue = RX_CONCEITO_CUE.containsMatchIn(n)
        if (p.propriedade != null && !tem && cue) return fim(Intent.CONCEITO) { it.copy(conceito = conceitoDe(n)) }
        if (p.propriedade != null && !tem) {
            if (contexto != null && (contexto.elemento != null || contexto.composto != null)) {
                return fim(Intent.PROPRIEDADE) {
                    it.copy(elemento = contexto.elemento, elementos = contexto.elementos, composto = contexto.composto, compostos = contexto.compostos, compostoNome = contexto.compostoNome, herdado = true)
                }
            }
            return fim(Intent.PROPRIEDADE)
        }
        if (tem) {
            // "e do ferro?" depois de uma pergunta de propriedade
            if (Regex("""^e (?:o |a |os |as )?(?:de |do |da |dos |das )?""").containsMatchIn(n) && n.split(' ').size <= 5 && contexto?.propriedade != null && contexto.intent == Intent.PROPRIEDADE) {
                return fim(Intent.PROPRIEDADE) { it.copy(propriedade = contexto.propriedade, propriedades = contexto.propriedades.ifEmpty { listOf(contexto.propriedade) }, herdado = true) }
            }
            if (p.compostos.isNotEmpty() || p.formulas.isNotEmpty()) {
                if (p.elementos.isNotEmpty() && p.compostos.isEmpty() && p.formulas.isEmpty()) return fim(Intent.ELEMENTO)
                return fim(Intent.COMPOSTO)
            }
            return fim(Intent.ELEMENTO)
        }

        // 9) conceito
        if (cue || Regex("""\b(?:mol|ph|estequiometria|ligacao (?:ionica|covalente|metalica|quimica)|eletronegatividade|oxidacao|reducao|oxirreducao|redox|equilibrio quimico|entalpia|entropia|isomeria|acido|base|sal|oxido|solucao|concentracao|molaridade|diluicao|tabela periodica|reacao quimica|cinetica|catalisador|eletrolise|pilha|polaridade|forca intermolecular|forcas intermoleculares)\b""").containsMatchIn(n)) {
            val conceito = conceitoDe(n)
            if (conceito.isNotEmpty()) return fim(Intent.CONCEITO) { it.copy(conceito = conceito) }
        }
        return p
    }

    private fun conceitoDe(n: String): String =
        n.replace(RX_CONCEITO_CUE, "").trim().replace(Regex("""^(?:e |eh |sao |significa |quer dizer |seria )"""), "")
            .replace(Regex("""^(?:um |uma |o |a |os |as |de |do |da )+"""), "").trim()

    /** Composto citado logo depois de uma quantidade ("16 g de metano"): é a substância à qual a quantidade se refere. */
    private fun compostoLigadoAQuantidade(original: String, quant: List<QuantidadeLida>, d: Dicionario, cids: List<String>): String? {
        if (cids.size < 2) return null
        val sem = Texto.semAcentos(original).lowercase()
        for (q in quant) {
            if (q.unidade == null || q.unidade == "%") continue
            val resto = sem.substring(minOf(q.faixa.last + 1, sem.length)).trimStart(' ', ',', ':')
                .replace(Regex("""^(?:de|do|da|dos|das)\s+"""), "")
            for (cid in cids) {
                if (d.nomesEFormulaDe(cid.toLong()).any { resto.startsWith(it) }) return cid
            }
        }
        return null
    }

    /**
     * Variante para conversa: se a pergunta não traz entidade (ex.: "e o ponto de ebulição?"), herda a do contexto.
     * O parse já trata a continuação quando há propriedade; aqui só se completa o que faltou.
     */
    fun parseComContexto(pergunta: String, d: Dicionario, contexto: ParsedQuery?): ParsedQuery = parse(pergunta, d, contexto)

    /** Palavras da pergunta úteis para recuperar trechos de texto (sem artigos nem verbos de pedido). */
    fun termosDeBusca(texto: String): List<String> {
        val stop = setOf("o", "a", "os", "as", "um", "uma", "de", "do", "da", "dos", "das", "e", "que", "em", "no", "na", "para", "por", "com", "qual", "quais", "como", "se", "eh", "sao", "ser", "quer", "dizer", "significa", "explique", "explica", "defina", "conceito", "oque", "porque", "me", "funciona")
        return Texto.nlu(texto).split(' ').filter { it.length >= 2 && it !in stop }
    }
}
