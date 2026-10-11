package net.saibatudo.quimica.ai.answer

import net.saibatudo.quimica.ai.Seguranca
import net.saibatudo.quimica.ai.model.Acao
import net.saibatudo.quimica.ai.model.Bloco
import net.saibatudo.quimica.ai.model.Intent
import net.saibatudo.quimica.ai.model.OrigemResposta
import net.saibatudo.quimica.ai.model.ParsedQuery
import net.saibatudo.quimica.ai.model.Resposta
import net.saibatudo.quimica.ai.model.TipoCalculadora
import net.saibatudo.quimica.ai.nlu.Dicionario
import net.saibatudo.quimica.ai.nlu.LocalNlu
import net.saibatudo.quimica.data.model.Composto
import net.saibatudo.quimica.data.model.Elemento
import net.saibatudo.quimica.data.model.Fonte
import net.saibatudo.quimica.data.prefs.Nivel
import net.saibatudo.quimica.data.repository.Pacote
import net.saibatudo.quimica.domain.GhsTextos
import net.saibatudo.quimica.domain.Propriedades
import net.saibatudo.quimica.domain.Texto
import net.saibatudo.quimica.domain.calc.CalculoInvalido
import net.saibatudo.quimica.domain.calc.MassaMolar
import net.saibatudo.quimica.domain.calc.ResultadoCalculo

/**
 * Monta a RESPOSTA a partir de uma [ParsedQuery] usando SOMENTE os dados do pacote e cálculo local testado.
 * Nenhum texto gerado por modelo de linguagem é exibido como fato (origem sempre LOCAL nesta versão). Toda resposta
 * traz as fontes dos dados usados; quando o pacote não tem o dado, a resposta diz isso em vez de inventar.
 */
class AnswerBuilder(
    internal val pacote: Pacote,
    internal val dic: Dicionario,
    internal val nivel: Nivel = Nivel.MEDIO
) {
    internal var sugestoesCache: List<String>? = null

    /** Interpreta e responde. [contexto] é a pergunta anterior (para "e o ponto de ebulição?"). */
    suspend fun responder(pergunta: String, contexto: ParsedQuery? = null): Pair<ParsedQuery, Resposta> {
        val q = LocalNlu.parseComContexto(pergunta, dic, contexto)
        return q to construir(q)
    }

    suspend fun construir(q: ParsedQuery, corrigir: Boolean = true): Resposta {
        val resposta = try {
            when (q.intent) {
                Intent.RECUSA_PERIGO -> recusa(q)
                Intent.AJUDA -> ajuda()
                Intent.FONTES -> fontes(q)
                Intent.SOBRE_DADOS -> sobreDados()
                Intent.ELEMENTO -> elemento(q)
                Intent.COMPOSTO -> composto(q)
                Intent.PROPRIEDADE -> propriedade(q)
                Intent.MASSA_MOLAR -> massaMolar(q)
                Intent.BALANCEAR -> balancear(q)
                Intent.ESTEQUIOMETRIA -> estequiometria(q)
                Intent.CONCENTRACAO -> concentracao(q)
                Intent.PH -> ph(q)
                Intent.GAS_IDEAL -> gasIdeal(q)
                Intent.CONVERSAO_UNIDADE -> conversao(q)
                Intent.NOMENCLATURA -> nomenclatura(q)
                Intent.DESENHAR -> desenhar(q)
                Intent.COMPARAR -> comparar(q)
                Intent.SEGURANCA -> seguranca(q)
                Intent.TABELA_PERIODICA -> tabelaPeriodica(q)
                Intent.CONCEITO -> conceito(q)
                Intent.DESCONHECIDA -> naoEntendi(q)
            }
        } catch (e: CalculoInvalido) {
            erroDeCalculo(q, e.message ?: "Não consegui fazer esta conta.")
        }
        // pergunta sem entidade reconhecida: pode ser erro de digitação ("oxigenioo"); oferece o nome certo, já conferido
        if (corrigir && !resposta.entendida && q.intent != Intent.DESCONHECIDA && q.elemento == null && q.composto == null && q.formula == null) {
            val sugeridas = correcoes(q.textoOriginal)
            if (sugeridas.isNotEmpty()) {
                return resposta.copy(
                    blocos = resposta.blocos + Bloco.Paragrafo("Você quis dizer: ${sugeridas.first()}"),
                    sugestoes = (sugeridas.take(2) + resposta.sugestoes).distinct()
                )
            }
        }
        return resposta
    }

    // ---- utilitários ----------------------------------------------------------------------------------------------------------

    internal val un get() = dic.unidades

    internal fun elementoDe(q: ParsedQuery): Elemento? = q.elemento?.let { pacote.porSimbolo[it] }

    internal suspend fun compostoDe(q: ParsedQuery): Composto? = q.composto?.toLongOrNull()?.let { pacote.composto(it) }

    internal fun nomeDe(e: Elemento) = e.nome
    internal fun nomeDe(c: Composto) = c.nomeExibicao

    internal fun fontesDeElementos(simbolos: Collection<String>): List<Fonte> =
        simbolos.mapNotNull { pacote.porSimbolo[it] }.flatMap { it.fontes }.distinctBy { it.nome }.take(3)

    internal fun fontesDoPacote(): List<Fonte> = pacote.fontesExibicao.take(2)

    internal fun erroDeCalculo(q: ParsedQuery, mensagem: String): Resposta {
        val calc = when (q.intent) {
            Intent.BALANCEAR -> TipoCalculadora.BALANCEAMENTO
            Intent.ESTEQUIOMETRIA -> TipoCalculadora.ESTEQUIOMETRIA
            Intent.CONCENTRACAO -> TipoCalculadora.CONCENTRACAO
            Intent.PH -> TipoCalculadora.PH
            Intent.GAS_IDEAL -> TipoCalculadora.GAS_IDEAL
            Intent.CONVERSAO_UNIDADE -> TipoCalculadora.UNIDADES
            else -> TipoCalculadora.MASSA_MOLAR
        }
        return Resposta(
            q.intent, "Não consegui fazer esta conta",
            listOf(Bloco.Aviso(mensagem), Bloco.Paragrafo("Você pode preencher os campos na calculadora; ela mostra os passos.")),
            acoes = listOf(Acao.AbrirCalculadora(calc, "Abrir a calculadora de ${calc.rotulo.lowercase()}")),
            sugestoes = emptyList(), entendida = false
        )
    }

    internal fun resultadoComoBlocos(r: ResultadoCalculo): List<Bloco> = buildList {
        r.linhas.forEach { add(Bloco.Campo(it.rotulo, it.valor)) }
        if (r.passos.isNotEmpty()) add(Bloco.Passos("Passo a passo", if (nivel == Nivel.FUNDAMENTAL) r.passos else r.passos))
        r.notas.forEach { add(Bloco.Aviso(it)) }
    }

    // ---- recusa, ajuda, dados ---------------------------------------------------------------------------------------------------

    private fun recusa(q: ParsedQuery): Resposta {
        val av = Seguranca.avaliar(q.textoOriginal)
        val r = Seguranca.respostaRecusa(av)
        val acoes = if (r.categoria == net.saibatudo.quimica.ai.CategoriaRecusa.AUTOLESAO) listOf(Acao.AbrirUrl("https://cvv.org.br", "Falar com o CVV (cvv.org.br)")) else emptyList()
        return Resposta(
            Intent.RECUSA_PERIGO, "Não posso ajudar com isso", r.linhas.map { Bloco.Paragrafo(it) },
            origem = OrigemResposta.AVISO, acoes = acoes, sugestoes = Seguranca.SUGESTOES_SEGURAS, recusa = true
        )
    }

    private suspend fun ajuda(): Resposta = Resposta(
        Intent.AJUDA, "O que o SaibaTudo Química responde",
        listOf(
            Bloco.Paragrafo("Pergunte sobre elementos e compostos (propriedades, massa molar, estrutura, perigos GHS), faça cálculos com os passos à vista e consulte a tabela periódica."),
            Bloco.Lista(
                listOf(
                    "Propriedades: \"ponto de fusão do ferro\", \"fórmula da água\"",
                    "Cálculos: massa molar, balanceamento, estequiometria, concentração, pH de ácidos e bases fortes, gás ideal, unidades",
                    "Estrutura: \"desenhe a molécula do etanol\"",
                    "Segurança: perigos e pictogramas GHS de um composto",
                    "Os números vêm do pacote de dados assinado ou de cálculo no aparelho; nada é inventado."
                )
            )
        ),
        sugestoes = sugestoes(6)
    )

    private fun fontes(q: ParsedQuery): Resposta {
        val e = elementoDe(q)
        val lista = (e?.fontes.orEmpty() + pacote.fontesExibicao).distinctBy { it.nome }
        return Resposta(
            Intent.FONTES, "Fontes e licenças dos dados",
            listOf(
                Bloco.Paragrafo("Cada resposta traz a fonte do dado. Estas são as fontes do pacote de dados em uso:"),
                Bloco.Lista(lista.map { f -> f.rotulo() + (f.url?.let { " ($it)" } ?: "") + (f.acessadoEm?.let { " – acesso em $it" } ?: "") })
            ),
            acoes = listOf(Acao.AbrirSobreDados()), fontes = emptyList()
        )
    }

    private fun sobreDados(): Resposta {
        val m = pacote.manifest
        val dias = m.pollIntervalMinutes / (24 * 60)
        val blocos = mutableListOf<Bloco>(
            Bloco.Campo("Versão dos dados", m.version.orEmpty()),
            Bloco.Campo("Gerado em", m.generatedAt.orEmpty()),
            Bloco.Campo("Origem", pacote.origem),
            Bloco.Campo("Elementos", pacote.elementos.size.toString()),
            Bloco.Campo("Compostos no pacote", dic.totalCompostos.toString()),
            Bloco.Paragrafo("O pacote é assinado digitalmente (ECDSA P-256) e conferido a cada atualização; o app verifica se há um novo a cada $dias dias.")
        )
        return Resposta(Intent.SOBRE_DADOS, "Sobre os dados", blocos, acoes = listOf(Acao.AbrirSobreDados()), fontes = fontesDoPacote())
    }

    // ---- elemento e composto ------------------------------------------------------------------------------------------------------

    private fun elemento(q: ParsedQuery): Resposta {
        val e = elementoDe(q) ?: return semDado(q, "Não encontrei esse elemento no pacote de dados.")
        val linhas = Propriedades.fichaElemento(e, dic.propriedades, un, nivel)
        val blocos = mutableListOf<Bloco>(Bloco.Paragrafo("${e.nome}, símbolo ${e.simbolo}, número atômico ${e.z}.") )
        linhas.forEach { blocos += Bloco.Campo(it.rotulo, it.valor) }
        return Resposta(
            Intent.ELEMENTO, "${e.nome} (${e.simbolo})", blocos, fontes = e.fontes.ifEmpty { fontesDoPacote() },
            acoes = listOf(Acao.AbrirElemento(e.z, "Abrir a ficha de ${e.nome}"), Acao.AbrirTabela()),
            sugestoes = listOf("Qual o ponto de fusão de ${e.nome}?", "Qual a massa molar de ${e.nome}?")
        )
    }

    private suspend fun composto(q: ParsedQuery): Resposta {
        val c = compostoDe(q)
        if (c == null) {
            // fórmula válida fora do índice: a massa molar ainda é calculável
            val f = q.formula ?: return semDado(q, "Não encontrei esse composto no pacote de dados.")
            val mm = MassaMolar.calcular(f, pacote.porSimbolo)
            return Resposta(
                Intent.COMPOSTO, Texto.formulaUnicode(f),
                listOf(
                    Bloco.Aviso("Este composto não está no núcleo de compostos do pacote; mostro só o que dá para calcular."),
                    Bloco.Campo("Massa molar", "${Texto.fixo(mm.massaMolar, 3)} g/mol")
                ) + listOf(Bloco.Passos("Como calculei", mm.comoResultado().passos)),
                fontes = fontesDeElementos(mm.formula.contagem.keys),
                acoes = listOf(Acao.AbrirCalculadora(TipoCalculadora.MASSA_MOLAR, "Abrir a calculadora de massa molar", mapOf("formula" to f)))
            )
        }
        val blocos = mutableListOf<Bloco>()
        c.formula?.let { blocos += Bloco.Destaque(Texto.formulaUnicode(it)) }
        if (c.nomePtPendente) blocos += Bloco.Aviso("Nome em português ainda não revisado: mostro o nome IUPAC.")
        c.nomePopular?.takeIf { !it.equals(c.nome, true) }?.let { blocos += Bloco.Campo("Também conhecido como", it) }
        Propriedades.fichaComposto(c, dic.propriedades, un, nivel).forEach { blocos += Bloco.Campo(it.rotulo, it.valor) }
        c.cas?.let { blocos += Bloco.Campo("Número CAS", it) }
        c.smiles?.let { blocos += Bloco.Estrutura(it, "${c.nomeExibicao}${c.formula?.let { f -> ", ${Texto.formulaUnicode(f)}" } ?: ""}") }
        c.definicaoChebi?.let { blocos += Bloco.Paragrafo("Definição (ChEBI, ${it.licenca}): ${it.texto}") }
        return Resposta(
            Intent.COMPOSTO, c.nomeExibicao, blocos, fontes = c.fontes.ifEmpty { fontesDoPacote() },
            acoes = listOf(Acao.AbrirComposto(c.cid, "Abrir a ficha de ${c.nomeExibicao}")) + listOfNotNull(c.icscBuscaUrl?.let { Acao.AbrirUrl(it, "Ficha ICSC no site da OIT") }),
            sugestoes = listOf("Quais os perigos de ${c.nomeExibicao}?", "Desenhe a estrutura de ${c.nomeExibicao}")
        )
    }

    private suspend fun propriedade(q: ParsedQuery): Resposta {
        val def = q.propriedade?.let { dic.propriedade(it) } ?: return naoEntendi(q)
        val e = elementoDe(q)
        val c = if (e == null) compostoDe(q) else null
        if (e == null && c == null) {
            val exemplos = pacote.elementos.take(40).mapNotNull { el -> if (Propriedades.formatar(def, Propriedades.bruto(def, el), un) != null) "Qual ${def.rotulo.replaceFirstChar { it.lowercase() }} de ${el.nome}?".replace("Qual ponto", "Qual o ponto") else null }.take(3)
            return Resposta(
                Intent.PROPRIEDADE, def.rotulo.replaceFirstChar { it.uppercase() },
                listOf(Bloco.Paragrafo("De qual elemento ou composto? Diga o nome, o símbolo ou a fórmula.")),
                sugestoes = exemplos, entendida = false
            )
        }
        val nome = e?.let { "${it.nome} (${it.simbolo})" } ?: c!!.nomeExibicao
        val valor = if (e != null) Propriedades.formatar(def, Propriedades.bruto(def, e), un, nivel) else Propriedades.formatar(def, Propriedades.bruto(def, c!!), un, nivel)
        if (valor == null) {
            return Resposta(
                Intent.PROPRIEDADE, "$nome: ${def.rotulo}",
                listOf(Bloco.Paragrafo("O pacote de dados não traz ${def.rotulo} para $nome. Não vou estimar esse valor.")),
                fontes = if (e != null) e.fontes else c!!.fontes,
                acoes = if (e != null) listOf(Acao.AbrirElemento(e.z, "Abrir a ficha de ${e.nome}")) else listOf(Acao.AbrirComposto(c!!.cid, "Abrir a ficha de ${c.nomeExibicao}")),
                entendida = false
            )
        }
        val blocos = mutableListOf<Bloco>(Bloco.Campo(def.rotulo.replaceFirstChar { it.uppercase() }, valor.texto))
        if (def.id == "estadosOxidacao" || def.id == "configuracaoEletronica") blocos += Bloco.Paragrafo("Valor do pacote de dados.")
        return Resposta(
            Intent.PROPRIEDADE, "$nome: ${def.rotulo}", blocos,
            fontes = (if (e != null) e.fontes else c!!.fontes).ifEmpty { fontesDoPacote() },
            acoes = if (e != null) listOf(Acao.AbrirElemento(e.z, "Abrir a ficha de ${e.nome}")) else listOf(Acao.AbrirComposto(c!!.cid, "Abrir a ficha de ${c.nomeExibicao}"))
        )
    }

    // ---- nomenclatura, estrutura, comparação -----------------------------------------------------------------------------------------

    private suspend fun nomenclatura(q: ParsedQuery): Resposta {
        val c = compostoDe(q)
        if (c != null) {
            val perguntaFormula = Regex("""\bformula\b""").containsMatchIn(Texto.chaveNome(q.textoOriginal)) && q.formula == null
            val blocos = mutableListOf<Bloco>()
            if (perguntaFormula || q.formula == null) {
                c.formula?.let { blocos += Bloco.Campo("Fórmula", Texto.formulaUnicode(it)) }
                blocos += Bloco.Campo("Nome", c.nomeExibicao)
            } else {
                blocos += Bloco.Campo("Nome", c.nomeExibicao)
                c.formula?.let { blocos += Bloco.Campo("Fórmula", Texto.formulaUnicode(it)) }
            }
            c.nomeIupac?.let { blocos += Bloco.Campo("Nome IUPAC", it) }
            c.nomePopular?.let { blocos += Bloco.Campo("Nome popular", it) }
            return Resposta(
                Intent.NOMENCLATURA, "${c.nomeExibicao}: nome e fórmula", blocos, fontes = c.fontes.ifEmpty { fontesDoPacote() },
                acoes = listOf(Acao.AbrirComposto(c.cid, "Abrir a ficha de ${c.nomeExibicao}"))
            )
        }
        val e = elementoDe(q)
        if (e != null) {
            return Resposta(
                Intent.NOMENCLATURA, "${e.nome}: nome e símbolo",
                listOf(Bloco.Campo("Nome", e.nome), Bloco.Campo("Símbolo", e.simbolo), Bloco.Campo("Nome em inglês", e.nomeEn.orEmpty()).takeIf { e.nomeEn != null } ?: Bloco.Paragrafo("")),
                fontes = e.fontes, acoes = listOf(Acao.AbrirElemento(e.z, "Abrir a ficha de ${e.nome}"))
            )
        }
        return semDado(q, "Não encontrei essa substância no pacote de dados, então não posso informar o nome ou a fórmula sem inventar.")
    }

    private suspend fun desenhar(q: ParsedQuery): Resposta {
        val c = compostoDe(q)
        if (c?.smiles != null) {
            return Resposta(
                Intent.DESENHAR, "Estrutura de ${c.nomeExibicao}",
                listOf(
                    Bloco.Estrutura(c.smiles, "${c.nomeExibicao}${c.formula?.let { ", ${Texto.formulaUnicode(it)}" } ?: ""}"),
                    Bloco.Campo("SMILES", c.smiles)
                ),
                fontes = c.fontes.ifEmpty { fontesDoPacote() },
                acoes = listOf(Acao.AbrirComposto(c.cid, "Abrir a ficha de ${c.nomeExibicao}"))
            )
        }
        if (c != null) return semDado(q, "O pacote de dados não traz a estrutura (SMILES) de ${c.nomeExibicao}.")
        val e = elementoDe(q)
        if (e != null) {
            return Resposta(
                Intent.DESENHAR, "${e.nome} é um elemento",
                listOf(Bloco.Paragrafo("Elementos não têm estrutura 2D como as moléculas. Veja a ficha do elemento, com a configuração eletrônica."), Bloco.Campo("Configuração eletrônica", e.configuracaoEletronica.orEmpty()).takeIf { e.configuracaoEletronica != null } ?: Bloco.Paragrafo("")),
                fontes = e.fontes, acoes = listOf(Acao.AbrirElemento(e.z, "Abrir a ficha de ${e.nome}"))
            )
        }
        return semDado(q, "Não encontrei esse composto no pacote de dados, então não posso desenhar a estrutura.")
    }

    private suspend fun comparar(q: ParsedQuery): Resposta {
        val elementos = q.elementos.mapNotNull { pacote.porSimbolo[it] }
        val compostos = q.compostos.mapNotNull { it.toLongOrNull() }.mapNotNull { pacote.composto(it) }
        val blocos = mutableListOf<Bloco>()
        val fontes = mutableListOf<Fonte>()
        val acoes = mutableListOf<Acao>()
        if (elementos.size >= 2) {
            val ids = listOf("numeroAtomico", "massaAtomica", "categoria", "eletronegatividade", "raioAtomicoPm", "pontoFusaoK", "pontoEbulicaoK", "densidadeKgm3")
            for (id in ids) {
                val d = dic.propriedade(id) ?: continue
                val valores = elementos.map { Propriedades.formatar(d, Propriedades.bruto(d, it), un, nivel)?.curto }
                if (valores.all { it == null }) continue
                blocos += Bloco.Campo(d.rotulo.replaceFirstChar { it.uppercase() }, elementos.indices.joinToString(" | ") { i -> "${elementos[i].nome}: ${valores[i] ?: "sem dado"}" })
            }
            elementos.forEach { fontes += it.fontes; acoes += Acao.AbrirElemento(it.z, "Abrir ${it.nome}") }
        } else if (compostos.size >= 2) {
            val ids = listOf("formula", "massaMolar", "pontoFusaoK", "pontoEbulicaoK", "densidadeKgm3", "xlogp")
            for (id in ids) {
                val d = dic.propriedade(id) ?: continue
                val valores = compostos.map { Propriedades.formatar(d, Propriedades.bruto(d, it), un, nivel)?.curto }
                if (valores.all { it == null }) continue
                blocos += Bloco.Campo(d.rotulo.replaceFirstChar { it.uppercase() }, compostos.indices.joinToString(" | ") { i -> "${compostos[i].nomeExibicao}: ${valores[i] ?: "sem dado"}" })
            }
            compostos.forEach { fontes += it.fontes; acoes += Acao.AbrirComposto(it.cid, "Abrir ${it.nomeExibicao}") }
        } else {
            return semDado(q, "Para comparar, cite dois elementos ou dois compostos do pacote de dados.")
        }
        val titulo = if (elementos.size >= 2) elementos.joinToString(" × ") { it.nome } else compostos.joinToString(" × ") { it.nomeExibicao }
        return Resposta(Intent.COMPARAR, "Comparação: $titulo", blocos.ifEmpty { listOf(Bloco.Paragrafo("O pacote não traz propriedades em comum para comparar.")) }, fontes = fontes.distinctBy { it.nome }.take(3), acoes = acoes)
    }

    // ---- segurança -----------------------------------------------------------------------------------------------------------------------

    private suspend fun seguranca(q: ParsedQuery): Resposta {
        val c = compostoDe(q)
        val e = elementoDe(q)
        val blocos = mutableListOf<Bloco>()
        val acoes = mutableListOf<Acao>()
        var fontes: List<Fonte> = emptyList()
        val titulo: String
        val emMistura = Regex("""\b(misturar|mistura|misturo|misturas|juntar|combinar)\b""").containsMatchIn(Texto.chaveNome(q.textoOriginal))
        if (emMistura) {
            titulo = "Misturar produtos químicos"
            blocos += Bloco.Paragrafo("Não misture produtos químicos, principalmente de limpeza (água sanitária, amoníaco, ácidos, desentupidores): a reação entre eles pode liberar gases tóxicos, calor ou projeção de líquido. Use cada produto sozinho, com o ambiente ventilado, e siga o rótulo.")
            val citados = q.compostos.mapNotNull { it.toLongOrNull() }.mapNotNull { pacote.composto(it) }
            for (x in citados.filter { it.ghs != null && (it.ghs.pictogramas.isNotEmpty() || it.ghs.frasesH.isNotEmpty()) }) {
                blocos += Bloco.Paragrafo("${x.nomeExibicao}, classificação GHS no pacote:")
                blocos += Bloco.GhsBloco(x.ghs!!, textosH(x.ghs.textosH))
            }
            fontes = citados.flatMap { it.fontes }.distinctBy { it.nome }.take(3)
            citados.firstOrNull()?.let { acoes += Acao.AbrirComposto(it.cid, "Abrir a ficha de ${it.nomeExibicao}") }
        } else if (c != null) {
            titulo = "Segurança: ${c.nomeExibicao}"
            val g = c.ghs
            if (g != null && (g.pictogramas.isNotEmpty() || g.frasesH.isNotEmpty())) {
                blocos += Bloco.GhsBloco(g, textosH(g.textosH))
                g.fonte?.let { blocos += Bloco.Paragrafo("Classificação: $it.") }
            } else {
                blocos += Bloco.Paragrafo("O pacote de dados não traz classificação GHS harmonizada para ${c.nomeExibicao}. Isso não significa que a substância seja segura.")
            }
            blocos += Bloco.Aviso("Antes de usar, leia a ficha de segurança (FISPQ) do fabricante e use os equipamentos de proteção indicados. Este app não substitui a ficha.")
            fontes = c.fontes
            acoes += Acao.AbrirComposto(c.cid, "Abrir a ficha de ${c.nomeExibicao}")
            c.icscBuscaUrl?.let { acoes += Acao.AbrirUrl(it, "Ficha ICSC no site da OIT") }
        } else if (e != null) {
            titulo = "Segurança: ${e.nome}"
            blocos += Bloco.Paragrafo("O pacote de dados não traz classificação de perigo para elementos isolados. Consulte a ficha de segurança do material específico (a forma química importa: ${e.nome} metálico, óxido e sais têm perigos diferentes).")
            fontes = e.fontes
            acoes += Acao.AbrirElemento(e.z, "Abrir a ficha de ${e.nome}")
        } else {
            titulo = "Segurança química e GHS"
            blocos += Bloco.Paragrafo("O GHS é o sistema internacional que padroniza pictogramas, palavras de sinal e frases de perigo (H). Estes são os nove pictogramas:")
            blocos += Bloco.Lista(GhsTextos.PICTOGRAMAS.entries.sortedBy { it.key }.map { "${it.key}: ${it.value.first} (${it.value.second})" })
            fontes = listOf(Fonte(GhsTextos.FONTE_NOME, licenca = GhsTextos.FONTE_LICENCA))
        }
        blocos += Bloco.Paragrafo("Em caso de exposição ou acidente, procure atendimento: SAMU 192, Bombeiros 193 ou Disque-Intoxicação 0800 722 6001 (Brasil).")
        acoes += Acao.AbrirSeguranca()
        return Resposta(Intent.SEGURANCA, titulo, blocos, fontes = fontes.ifEmpty { fontesDoPacote() }, acoes = acoes, sugestoes = Seguranca.SUGESTOES_SEGURAS.take(0))
    }

    internal fun textosH(doComposto: Map<String, String>): Map<String, String> {
        val m = LinkedHashMap<String, String>()
        m.putAll(pacote.regras.frasesH)
        m.putAll(doComposto)
        return m
    }

    // ---- tabela periódica, conceito, não entendi ---------------------------------------------------------------------------------------

    private suspend fun conceito(q: ParsedQuery): Resposta = buscarConceito(q)

    private suspend fun naoEntendi(q: ParsedQuery): Resposta = respostaNaoEntendi(q)

    internal fun semDado(q: ParsedQuery, mensagem: String): Resposta = Resposta(
        q.intent, "Não encontrei esse dado", listOf(Bloco.Paragrafo(mensagem)),
        sugestoes = emptyList(), entendida = false
    )
}
