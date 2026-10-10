package net.saibatudo.quimica.ai

import java.text.Normalizer

/** Categorias de recusa (mesmos ids de web/src/quimica/js/seguranca.js). */
enum class CategoriaRecusa(val rotulo: String) {
    EXPLOSIVOS("explosivos"),
    ARMAS_QUIMICAS("armas químicas"),
    DROGAS("drogas ilícitas"),
    PRECURSORES("precursores de drogas ou de armas"),
    REAGENTES_CASEIROS("receitas caseiras com reagentes perigosos"),
    DANO_A_PESSOAS("dano a pessoas"),
    AUTOLESAO("risco à própria vida")
}

data class AvaliacaoSeguranca(val recusar: Boolean, val categoria: CategoriaRecusa? = null, val motivo: String? = null) {
    val rotulo: String? get() = categoria?.rotulo
}

/** Resposta padrão de recusa (sem dados, sem números). */
data class RespostaRecusa(val principal: String, val linhas: List<String>, val categoria: CategoriaRecusa?)

/**
 * Segurança química: recusa por REGRAS, antes de qualquer outro processamento (NLU, dados ou modelo), de pedidos de síntese,
 * purificação ou ampliação de escala de explosivos, armas químicas, drogas ilícitas e precursores, e de receitas "em casa" com
 * reagentes perigosos. Perguntas legítimas (neutralizar um derramamento, EPI, primeiros socorros, por que não misturar produtos
 * de limpeza, fórmula ou estrutura de uma substância) NÃO são recusadas.
 *
 * Espelho de web/src/quimica/js/seguranca.js (mesmas listas e a mesma ordem de decisão). Casos compartilhados:
 * contracts/seguranca_cases.json. Estratégia: (alvo perigoso) E (ação de produzir/obter/esconder) no mesmo pedido; a frase é
 * examinada em três versões: normal (sem acentos), com trocas de "leet" (s1ntese, 3xplosivo) e "colada" (letras repetidas e
 * separadores removidos: "explo sivo", "e x p l o s i v o").
 */
object Seguranca {

    // ---- normalização ----------------------------------------------------------------------------------------------------

    private val RX_INVISIVEIS = Regex("[\\u200B-\\u200F\\u2060\\uFEFF\\u00AD\\u202A-\\u202E]")
    private val RX_COMBINANTES = Regex("[\\u0300-\\u036F]")
    private val RX_NAO_ALFANUM = Regex("[^a-z0-9]+")
    private val RX_ESPACOS = Regex("\\s+")
    private val RX_NAO_LETRA = Regex("[^a-z]")
    private val RX_REPETIDAS = Regex("(.)\\1+")

    /** Texto sem acentos, minúsculo e sem caracteres invisíveis. */
    private fun limpar(texto: String): String =
        RX_COMBINANTES.replace(RX_INVISIVEIS.replace(Normalizer.normalize(texto, Normalizer.Form.NFKD), ""), "").lowercase()

    private fun espacado(s: String) = RX_ESPACOS.replace(RX_NAO_ALFANUM.replace(s, " "), " ").trim()

    private fun leet(s: String): String = buildString(s.length) {
        for (c in s) append(
            when (c) {
                '0' -> 'o'; '1' -> 'i'; '3' -> 'e'; '4' -> 'a'; '5' -> 's'; '7' -> 't'; '8' -> 'b'
                '@' -> 'a'; '$' -> 's'; '!' -> 'i'; '|' -> 'l'; '€' -> 'e'
                else -> c
            }
        )
    }

    /** Colada: só letras, sem repetições consecutivas ("exploosivo" vira "explosivo"). */
    private fun colada(s: String) = RX_REPETIDAS.replace(RX_NAO_LETRA.replace(s, ""), "$1")

    private fun rx(partes: List<String>) = Regex("""\b(?:${partes.joinToString("|")})\b""")

    // ---- padrões (texto sem acentos) ---------------------------------------------------------------------------------------

    /** Ações que PRODUZEM, obtêm, ampliam ou escondem. */
    private val ACAO = rx(listOf(
        """fa(?:z|zer|zendo|zem|zia|co|ca|cam)""", """fabric(?:ar|ando|o|a|am|ac\w+)""", """produz\w*""", """prepar\w*""", """sintetiz\w*""", "sintese", "obter", """obtenc\w*""", "obtem", "conseguir", "adquirir",
        "comprar", "compra", "vender", """vend\w+ (?:de|da|do)""", """trafic\w*""", """contrabande\w*""", """desvi\w+""", """burl\w+""", "esconder", """escond\w+""",
        "extrair", """extrac\w*""", "extrai", "cozinhar", """cozinh\w+""", "montar", "monto", """constru\w+""", "criar", "cria", "gerar", "gero", "gera",
        """purific\w*""", """refin\w+""", """cristaliz\w*""", """destil\w*""", """escalon\w*""", """escal(?:ar|ando)""", "larga escala", """aument\w+ (?:a |o |de )?(?:producao|rendimento|escala|potencia|pureza)""",
        "receita", "passo a passo", "tutorial", """instruc\w+""", """ensina\w*""", "rota de sintese", "procedimento (?:de|para)", "protocolo (?:de|para)",
        "como (?:se )?(?:faz|fabrica|produz|prepara|sintetiza|obtem|extrai|cozinha|monta)",
        "quantidade de .{1,40} para (?:fazer|produzir|preparar)", "quais reagentes", "que reagentes", "o que preciso para (?:fazer|produzir)", "ingredientes para",
        "materiais para (?:fazer|montar|produzir)",
        "make", "making", "synthesi[sz]\\w*", "synthesis", "produce", "cook", "recipe", "manufactur\\w+", "extract", "build", "steps to"
    ))

    /** Contexto de manuseio, incidente ou descarte: "o que fazer se inalar cloro em casa" NÃO é pedido de produção. */
    private val CONTEXTO_SEGURO = rx(listOf(
        """descart\w*""", """neutraliz\w*""", """armazen\w*""", """guard\w*""", """manuse\w*""", """manipul\w*""", "primeiros? socorros?", "epis?", """derram\w*""", """vazament\w*""", """respingo\w*""",
        "inal(?:ar|ei|ou|ado|acao)", """ingeri\w*""", """queimadura\w*""", """intoxicac\w+ (?:por|com)""", "primeiro atendimento", "equipamento de protecao", "protecao individual", "luvas", "oculos de protecao", "mascara",
        "o que fazer (?:se|quando|em caso)", "o que (?:eu )?(?:devo|posso) fazer (?:se|quando|em caso)", "em caso de", "ficha de seguranca", "fispq", "icsc", "reciclar", "reciclagem"
    ))

    private val ALVO_EXPLOSIVOS = rx(listOf(
        """explosiv\w*""", "dinamite", "tnt", "trinitrotolueno", "nitroglicerina", """c ?4 explosiv\w*""", "c-4", "rdx", "hmx", "petn", "hmtd", "tatp", "peroxido de acetona", "triperoxido de triacetona",
        "azida de (?:chumbo|sodio)", """fulminato\w*""", "anfo", """picrato\w*""", "tetril", "polvora(?: negra| sem fumaca)?", "nitrato de amonio (?:com|e|\\+|mais) (?:diesel|oleo|combustivel|gasolina)",
        "bomba[s]? (?:caseira[s]?|artesana(?:l|is)|improvisada[s]?|quimica[s]?|incendiaria[s]?|de fumaca|de pressao|relogio|de pregos?|de tubo)", "pipe bomb", "coquetel[s]? molotov", "molotov", "napalm",
        "explosives?", "nitroglycerin", "gunpowder", "granada[s]?", "artefato[s]? explosivo[s]?", "detonador(?:es)?", "pavio de bomba", "fogos? de artificio(?: caseiro[s]?)?", "termit[ae]", "thermite", "material incendiario", "bomba atomica", "bomba suja"
    ))

    /** "fazer uma bomba" sem qualificativo inofensivo (bomba d'água, de calor, calorimétrica, de insulina, de vácuo…). */
    private val FAZER_BOMBA = Regex(
        """\b(?:fa(?:z|zer|zendo)|fabric\w*|montar|constru\w+|criar|produzir|preparar|make|build)\s+(?:uma?\s+|an?\s+|as\s+|a\s+)?(?:bomba|bomb)\b(?!\s+(?:de\s+)?(?:agua|calor|vacuo|insulina|combustivel|ar|infusao|hidraulica|calorimetrica|centrifuga|submersa|peristaltica|de))"""
    )

    private val ALVO_ARMAS = rx(listOf(
        "sarin", "soman", "tabun", "vx", "nerve agents?", "chemical weapons?", "mustard gas", "novichok", """agentes? (?:nervos\w*|neurotoxic\w*|vesican\w*|quimic\w*(?: de guerra)?)""", """armas? quimic\w*""", """armas? bacteriologic\w*""", "arma de destruicao em massa",
        """gas(?:es)? (?:mostarda|sarin|nervos\w*|lacrimogeneo\w*|toxic\w*|venenos\w*|letal|letais|asfixiante\w*|de guerra|cloro|fosgenio)""", "mostarda (?:sulfurada|nitrogenada)", "fosgenio", "cloropicrina", "lewisita",
        "ricina", "cianeto(?: de hidrogenio| de potassio| de sodio)?", "acido cianidrico", "cloraminas?", "arsina", "fosfina", "toxina botulinica", "antraz", "cloro gasoso", "cloro em gas", "acido sulfidrico", "gas sulfidrico",
        "monoxido de carbono (?:para|pra) (?:matar|ferir|envenenar)"
    ))

    private val ALVO_DROGAS = rx(listOf(
        "metanfetamina[s]?", "methamphetamine", "cocaine", "heroin", "meth", "cristal (?:de )?meth", "cocaina", "crack", "pasta base", "merla", "heroina", "lsd", "acido lisergico", "mdma", "ecstasy", "extase", "molly", """fentanil\w*""", "fentanyl",
        "pcp", "fenciclidina", "ketamina", "cetamina", "dmt", "dimetiltriptamina", "mescalina", "psilocibina", "cogumelos? magicos?", "anfetamina[s]?", "ghb", "gbh", "oxicodona", "opio", "maconha", "cannabis",
        "haxixe", "thc", "canabinoides? sinteticos?", "spice", "bath salts", "catinonas? sinteticas?", "drogas? sinteticas?", "droga[s]? ilicitas?", "entorpecentes?", "lanca[- ]perfume", "cheirinho da loló", "lolo", "skank",
        "laboratorio clandestino", "narcolaboratorio"
    ))

    private val PRECURSORES_NOMES = rx(listOf(
        "efedrina", "pseudoefedrina", "norefedrina", "safrol", "isosafrol", "piperonal", "fenilacetona", "p2p", "fenil-?2-?propanona", "acido fenilacetico", "anidrido acetico", "ergotamina", "ergometrina",
        "acido antranilico", "n-?acetilantranilico", "acido lisergico", "precursores? (?:de|da|do|para|quimicos?|controlados?)", "precursores? controlados?", "iodo vermelho", "fosforo vermelho"
    ))

    private val ALVO_DANO = rx(listOf(
        "envenen\\w+ (?:alguem|uma pessoa|o|a|meu|minha|um|uma|alguns?|animal|animais|cachorro|gato|crianca[s]?|vizinh\\w+|colega|professor\\w*|chefe|marido|esposa|mulher|namorad\\w+|ex)",
        "matar (?:alguem|uma pessoa|meu|minha|o|a|um|uma)", "assassinar", "intoxicar (?:alguem|uma pessoa|propositalmente)",
        "veneno[s]? (?:indetectave\\w+|que nao (?:deixa|deixam) rastro\\w*|sem rastro\\w*|letal|letais|mortal|mortais|caseiro[s]?)",
        "dose letal para matar", "ferir (?:alguem|uma pessoa)", "queimar (?:alguem|uma pessoa) com (?:acido|quimico)", "jogar acido em", "atacar (?:alguem|uma pessoa) com"
    ))

    private val ALVO_AUTOLESAO = rx(listOf(
        "me matar", "me suicidar", "suicidio", "suicidar", "tirar (?:a )?minha vida", "acabar com (?:a )?minha vida", "me envenenar", "quero morrer", "morrer sem dor", "morrer sem sofrer", "overdose para morrer",
        "me machucar", "me ferir", "me cortar", "me intoxicar de proposito"
    ))

    private val PERIGOSOS_CASEIROS = rx(listOf(
        "acido (?:sulfurico|nitrico|cloridrico|muriatico|fluoridrico|perclorico|picrico|cianidrico)", "agua regia", "cloro(?: gasoso| em gas)?", "gas cloro", """cianeto\w*""", "arsenio", "arsina", "fosfina", "fosgenio",
        "mercurio", "fosforo (?:branco|vermelho)", "sodio metalico", "potassio metalico", "amonia anidra", """clorato\w*""", """perclorato\w*""", "peroxido de (?:acetona|metil\\w*|benzoila)",
        "agua oxigenada (?:concentrada|de? \\d+ ?volumes?)", "nitrato de (?:amonio|potassio) (?:concentrado)?", "permanganato de potassio", "acido sulfidrico", "sulfeto de hidrogenio", "monoxido de carbono",
        """gas(?:es)? (?:toxic\w*|venenos\w*|inflamave\w*|asfixiante\w*)""", """fluoreto\w*""", "acido fluoridrico", "veneno[s]?", "toxina[s]?", "napalm", "termit[ae]", "thermite", "nitrocelulose", "nitroglicerina", "tolueno nitrado",
        "acetona e agua oxigenada", "agua sanitaria e (?:amonia|acido|vinagre)", "cloro e amonia", "soda e aluminio"
    ))

    private val CASA = rx(listOf(
        "em casa", "caseir[oa]s?", "artesana(?:l|is)", "improvisad[oa]s?", "na cozinha", "no quintal", "na garagem", "no banheiro", "no apartamento",
        "com produtos? (?:de casa|domesticos?|de limpeza|de supermercado|de farmacia)", "sem laboratorio", "faca voce mesmo", "diy",
        "com materiais? (?:facil|faceis|de casa|domesticos?)", "usando (?:so |apenas )?produtos? (?:de casa|domesticos?|de limpeza)"
    ))

    private val RX_OBTENCAO = Regex("""\b(?:extrair|extrac\w*|obter|comprar|conseguir|desvi\w+|sem (?:receita|licenca|autorizacao)|burl\w+|vender|trafic\w*|esconder|escond\w+|sintese|sintetiz\w*)\b""")

    // Palavras-chave "coladas" (sem espaços nem repetições): pegam "explo sivo", "e x p l o s i v o", "m e t a n f e t a m i n a".
    private fun colar(vararg l: String) = l.map(::colada)

    private val COLADA_ALVOS: Map<CategoriaRecusa, List<String>> = mapOf(
        CategoriaRecusa.EXPLOSIVOS to colar("explosivo", "nitroglicerina", "dinamite", "trinitrotolueno", "peroxidodeacetona", "molotov", "napalm", "bombacaseira", "bombaartesanal", "polvora", "detonador", "fulminato", "tatp", "hmtd"),
        CategoriaRecusa.ARMAS_QUIMICAS to colar("sarin", "novichok", "gasmostarda", "agentenervoso", "armaquimica", "fosgenio", "ricina", "gastoxico", "gasvenenoso", "cianeto", "cloraminas", "gascloro"),
        CategoriaRecusa.DROGAS to colar("metanfetamina", "cocaina", "heroina", "fentanil", "ecstasy", "mdma", "anfetamina", "drogassinteticas", "pastabase", "crack", "lsd", "ketamina", "cetamina"),
        CategoriaRecusa.PRECURSORES to colar("pseudoefedrina", "efedrina", "safrol", "fenilacetona", "anidridoacetico", "precursores")
    )
    private val COLADA_ACOES = colar(
        "sintese", "sintetizar", "fazer", "fabricar", "produzir", "preparar", "purificar", "refinar", "cozinhar", "extrair", "comofaz", "receita", "passoapasso",
        "montar", "construir", "obter", "comprar", "escalonar"
    )

    // ---- mensagens -----------------------------------------------------------------------------------------------------------

    private const val MSG_PADRAO =
        "Não posso ajudar com isso. O SaibaTudo Química não fornece instruções de síntese, purificação, ampliação de escala nem receitas caseiras de explosivos, armas químicas, drogas ilícitas, seus precursores ou outros reagentes perigosos, porque podem causar mortes e ferimentos graves."
    private const val MSG_ALTERNATIVAS =
        "Posso ajudar com segurança e conhecimento: perigos, equipamentos de proteção (EPI), armazenamento, descarte e primeiros socorros de uma substância; propriedades, fórmula, massa molar e estrutura; cálculos e conceitos de Química."
    private const val MSG_DANO =
        "Não posso ajudar com isso. Não oriento sobre como ferir, envenenar ou intoxicar pessoas ou animais. Se alguém corre perigo ou foi exposto a uma substância, procure imediatamente um serviço de emergência ou um centro de informação toxicológica da sua região."
    private const val MSG_AUTOLESAO =
        "Sinto muito que você esteja passando por isso. Não posso orientar sobre esse assunto, mas você não está sozinho(a): procure agora alguém de confiança e um serviço de emergência da sua região. O Centro de Valorização da Vida (CVV) conversa com qualquer pessoa, de forma gratuita e sigilosa, em https://cvv.org.br."

    /** Perguntas de segurança legítimas, respondíveis pelo app (usadas como sugestões). */
    val SUGESTOES_SEGURAS = listOf(
        "Quais EPIs usar com ácido sulfúrico?",
        "Primeiros socorros para respingo de soda cáustica no olho",
        "Por que não misturar água sanitária com amoníaco?"
    )

    // ---- avaliação -------------------------------------------------------------------------------------------------------------

    private val LIBERADO = AvaliacaoSeguranca(false)

    private fun recusa(c: CategoriaRecusa, motivo: String) = AvaliacaoSeguranca(true, c, motivo)

    /** "o que fazer se…", "fazer o descarte…" não são pedidos de produção: saem da frase antes de procurar a ação. */
    private val TIRAR_FAZER_SEGURO = Regex(
        """\b(?:o que (?:eu |a gente |se )?(?:devo |posso |preciso |deve |tenho que )?fa(?:zer|co|z) (?:se|quando|em caso|apos|depois|com|ao|diante)|fa(?:zer|co|z) (?:o |a |um |uma )?(?:descarte|limpeza|neutralizacao|armazenamento|transporte|manuseio|diluicao|primeiros socorros))\b"""
    )
    private val RX_NAO_ALFANUM_ESPACO = Regex("[^a-z0-9]+")

    fun avaliar(texto: String): AvaliacaoSeguranca {
        val base = limpar(texto)
        if (base.isBlank()) return LIBERADO
        val v1 = espacado(base)
        val v2 = espacado(leet(base))
        val visoes = if (v1 == v2) listOf(v1) else listOf(v1, v2)

        // autolesão primeiro: resposta de acolhimento, mesmo sem "ação"
        for (v in visoes) if (ALVO_AUTOLESAO.containsMatchIn(v)) return recusa(CategoriaRecusa.AUTOLESAO, "pedido ligado a autolesão")

        for (v in visoes) {
            val incidente = CONTEXTO_SEGURO.containsMatchIn(v)
            val vc = TIRAR_FAZER_SEGURO.replace(v, " ")
            val acao = ACAO.containsMatchIn(vc)
            val casa = CASA.containsMatchIn(v)
            // dano a pessoas: o alvo já contém a ação
            if (ALVO_DANO.containsMatchIn(v)) return recusa(CategoriaRecusa.DANO_A_PESSOAS, "pedido para ferir ou envenenar")
            if (FAZER_BOMBA.containsMatchIn(vc)) return recusa(CategoriaRecusa.EXPLOSIVOS, "construção de artefato explosivo")
            // alvos graves: a recusa vale mesmo com palavras de "segurança" na frase (não há como produzir "com segurança")
            if (acao && ALVO_EXPLOSIVOS.containsMatchIn(vc)) return recusa(CategoriaRecusa.EXPLOSIVOS, "produção de explosivos")
            if (acao && ALVO_ARMAS.containsMatchIn(vc)) return recusa(CategoriaRecusa.ARMAS_QUIMICAS, "produção de agentes tóxicos ou armas químicas")
            if (acao && ALVO_DROGAS.containsMatchIn(vc)) return recusa(CategoriaRecusa.DROGAS, "produção ou obtenção de drogas ilícitas")
            if (acao && PRECURSORES_NOMES.containsMatchIn(vc) && (ALVO_DROGAS.containsMatchIn(vc) || RX_OBTENCAO.containsMatchIn(vc))) {
                return recusa(CategoriaRecusa.PRECURSORES, "obtenção ou uso de precursores controlados")
            }
            // receitas caseiras com reagentes perigosos: "em casa" + produzir; fica de fora quem trata de descarte, EPI, incidente etc.
            if (!incidente && acao && casa && PERIGOSOS_CASEIROS.containsMatchIn(vc)) {
                return recusa(CategoriaRecusa.REAGENTES_CASEIROS, "receita caseira com reagente perigoso")
            }
        }

        // versão colada: tolera "explo sivo", "e x p l o s i v o", "exploosivo"
        val c = colada(TIRAR_FAZER_SEGURO.replace(RX_NAO_ALFANUM_ESPACO.replace(leet(base), " "), " "))
        if (c.length >= 8 && !CONTEXTO_SEGURO.containsMatchIn(v1)) {
            if (COLADA_ACOES.any { c.contains(it) }) {
                for ((cat, alvos) in COLADA_ALVOS) {
                    if (alvos.any { c.contains(it) }) return recusa(cat, "pedido de produção (grafia disfarçada)")
                }
            }
        }
        return LIBERADO
    }

    /** Resposta padrão de recusa. */
    fun respostaRecusa(avaliacao: AvaliacaoSeguranca?): RespostaRecusa {
        val principal = when (avaliacao?.categoria) {
            CategoriaRecusa.DANO_A_PESSOAS -> MSG_DANO
            CategoriaRecusa.AUTOLESAO -> MSG_AUTOLESAO
            else -> MSG_PADRAO
        }
        val linhas = mutableListOf(principal)
        if (avaliacao?.categoria != CategoriaRecusa.AUTOLESAO) linhas += MSG_ALTERNATIVAS
        return RespostaRecusa(principal, linhas, avaliacao?.categoria)
    }
}
