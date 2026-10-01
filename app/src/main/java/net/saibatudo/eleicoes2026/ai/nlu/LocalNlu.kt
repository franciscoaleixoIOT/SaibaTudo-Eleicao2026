package net.saibatudo.eleicoes2026.ai.nlu

import net.saibatudo.eleicoes2026.ai.model.Intent
import net.saibatudo.eleicoes2026.ai.model.ParsedQuery
import net.saibatudo.eleicoes2026.domain.model.HistoricoOpcao
import net.saibatudo.eleicoes2026.domain.model.Texto
import net.saibatudo.eleicoes2026.domain.model.Ufs

/**
 * NLU LOCAL determinístico (regras). Converte uma pergunta em [ParsedQuery].
 * Não consulta nem produz fatos: apenas identifica intenção e entidades (cargo, UF, partido, nome, tema).
 * Os mesmos casos de teste ("golden cases", contracts/nlu_golden_cases.json) validam este NLU e o do site.
 */
object LocalNlu {

    private val CARGOS = listOf(
        "vice presidente" to "VICE_PRESIDENTE", "vice governador" to "VICE_GOVERNADOR",
        "deputado federal" to "DEPUTADO_FEDERAL", "deputados federais" to "DEPUTADO_FEDERAL",
        "deputada federal" to "DEPUTADO_FEDERAL", "dep federal" to "DEPUTADO_FEDERAL",
        "deputado estadual" to "DEPUTADO_ESTADUAL", "deputados estaduais" to "DEPUTADO_ESTADUAL",
        "deputada estadual" to "DEPUTADO_ESTADUAL", "dep estadual" to "DEPUTADO_ESTADUAL",
        "deputado distrital" to "DEPUTADO_DISTRITAL", "deputados distritais" to "DEPUTADO_DISTRITAL",
        "senadores" to "SENADOR", "senadora" to "SENADOR", "senador" to "SENADOR", "senado" to "SENADOR",
        "governadores" to "GOVERNADOR", "governadora" to "GOVERNADOR", "governador" to "GOVERNADOR",
        "governo do estado" to "GOVERNADOR", "governo de" to "GOVERNADOR", "governo" to "GOVERNADOR",
        "presidentes" to "PRESIDENTE", "presidencia" to "PRESIDENTE", "presidente" to "PRESIDENTE",
        "planalto" to "PRESIDENTE", "federais" to "DEPUTADO_FEDERAL", "estaduais" to "DEPUTADO_ESTADUAL"
    )

    private val NOMES_UF: List<Pair<String, String>> = Ufs.NOMES.map { (sigla, nome) -> Texto.normalizar(nome) to sigla }
        .sortedByDescending { it.first.length } // "mato grosso do sul" antes de "mato grosso"

    /** Siglas de UF que coincidem com palavras comuns: só valem após preposição/“estado”/“uf” ou em maiúsculas. */
    private val SIGLAS_AMBIGUAS = setOf("se", "pa", "to", "ma", "al", "am", "go", "es", "ac", "ap", "pe", "pi", "ro", "rr")

    private val TEMAS = mapOf(
        "saude" to "saude", "educacao" to "educacao", "escola" to "educacao", "seguranca" to "seguranca",
        "seguranca publica" to "seguranca", "economia" to "economia", "emprego" to "economia",
        "meio ambiente" to "meio_ambiente", "ambiente" to "meio_ambiente", "transporte" to "transporte",
        "mobilidade" to "transporte", "moradia" to "moradia", "habitacao" to "moradia", "agro" to "agro",
        "agropecuaria" to "agro", "agricultura" to "agro", "cultura" to "cultura", "esporte" to "esporte",
        "tecnologia" to "tecnologia", "inovacao" to "tecnologia", "ciencia" to "tecnologia",
        "assistencia social" to "assistencia", "saneamento" to "saneamento", "energia" to "energia",
        "infraestrutura" to "infraestrutura", "transparencia" to "transparencia", "corrupcao" to "transparencia",
        "mulheres" to "mulheres", "juventude" to "juventude", "jovens" to "juventude", "idosos" to "idosos",
        "turismo" to "turismo", "pessoa com deficiencia" to "pcd", "acessibilidade" to "pcd"
    )

    private val FRASES_BRASIL_TODO = listOf("em todo o brasil", "no brasil todo", "brasil todo", "todo o pais", "pais todo", "em todo o pais", "todos os estados")

    private val PARTIDOS_AMBIGUOS = setOf(
        "novo", "rede", "agir", "missao", "democrata", "uniao", "pode", "avante", "mobiliza", "solidariedade",
        "cidadania", "up", "dc", "pv", "pp", "psd"
    )

    private val RX_RECOMENDACAO = listOf(
        Regex("""\bem quem (eu )?(devo|deveria|posso|vou|voto|votar|votaria|votar)\b"""),
        Regex("""\bquem (eu )?(devo|deveria|vale a pena|e melhor|seria melhor|merece)\b"""),
        Regex("""\b(melhor|pior|mais honest\w*|mais corrupt\w*|mais competente|mais preparad\w*|ideal|mais confiavel)\b.*\b(candidat\w*|president\w*|governador\w*|senador\w*|deputad\w*)\b"""),
        Regex("""\b(candidat\w*|president\w*|governador\w*|senador\w*|deputad\w*)\b.*\b(melhor|pior|mais honest\w*|mais corrupt\w*|mais competente|mais preparad\w*)\b"""),
        Regex("""\bvota(r)?\s+(em|no|na)\s+quem\b"""),
        Regex("""\b(recomend\w*|indic\w*|indiq\w*|sugir\w*|suger\w*|aconselh\w*)\b.*\b(candidat\w*|voto|votar|president\w*|governador\w*|senador\w*|deputad\w*)\b"""),
        Regex("""\bquem (vai|vao|deve|devera|tem mais chance de) (ganhar|vencer|ser eleito|se eleger|ganha)\b"""),
        Regex("""\bquem (ganha|vence|ganhara|vencera)\b.*\b(eleic\w*|president\w*|governo|senado)\b""")
    )

    private val RX_RESULTADOS = Regex(
        """\b(quem (ganhou|venceu|foi eleito|foram eleitos|esta ganhando|esta na frente|lidera|ficou em)|resultados?|apuracao|apurado\w*|""" +
            """votos (teve|recebeu|obteve|tem)|quantos votos|eleitos?|mais votad\w*|percentual de votos|totalizacao|boletim de urna|""" +
            """passou para o segundo|quem passou)\b"""
    )

    fun parse(query: String, gaz: Gazetteer): ParsedQuery {
        val raw = query.trim().take(300)
        val t = Texto.normalizar(raw)
        val cargo = extrairCargo(t)
        val uf = extrairUf(raw, t)
        val partido = extrairPartido(t, gaz)
        val tema = extrairTema(t)
        val turno = extrairTurno(t)
        val deferidas = if (Regex("""\bficha limpa\b|\bdeferid\w*|\belegivel\b|\belegiveis\b""").containsMatchIn(t)) true else null
        val historico = extrairHistorico(t)

        fun q(intent: Intent, nome: String? = null) = ParsedQuery(
            intent = intent, cargo = cargo, uf = uf, partido = partido, nome = nome, tema = tema,
            apenasDeferidas = deferidas, historico = historico, turno = turno,
            nacional = uf == null && FRASES_BRASIL_TODO.any { t.contains(it) },
            textoOriginal = raw
        )

        if (t.isEmpty()) return q(Intent.DESCONHECIDA)

        // 1. Pedido de recomendação/previsão: recusa neutra (política do app + normas eleitorais sobre IA)
        if (RX_RECOMENDACAO.any { it.containsMatchIn(t) }) return q(Intent.RECOMENDACAO)

        // 2. Regras e informações do processo eleitoral
        if (Regex("""\b(dois|2|duas) (senadores|votos para senador|vagas)\b|\bsegunda vaga\b|\bmesmo senador\b|\brenovacao de 2/3\b|\bvoto duplicado\b""").containsMatchIn(t) ||
            (t.contains("senador") && Regex("""\b(quantos votos|quantos senadores|voto duplo)\b""").containsMatchIn(t))
        ) return q(Intent.SENADO_DOIS_VOTOS)
        if (Regex("""\bordem de votacao\b|\bcomo (funciona|vota|votar|e) (a |na )?urna\b|\bquantos digitos\b|\bdigitos\b|\bcomo digitar\b""").containsMatchIn(t))
            return q(Intent.REGRAS_URNA)
        if (Regex("""\bonde (eu )?(voto|votar|vou votar)\b|\blocal de votacao\b|\bzona eleitoral\b|\bsecao eleitoral\b|\btitulo\b|\be-titulo\b|\bjustific\w*\b|\bdocumentos?\b|\bnao (vou|posso) votar\b""").containsMatchIn(t))
            return q(Intent.LOCAL_VOTACAO)
        if (Regex("""\bcalendario\b|\bquando (e|sera|ocorre|acontece|vai ser|tem|e a)\b|\bque dia\b|\bdata (da|das|de|do) (eleic|votac|segundo|primeiro|posse)\w*\b|\bprazos?\b|\bhorario\b|\bposse\b|\bdiplom\w*\b""").containsMatchIn(t))
            return q(Intent.CALENDARIO)

        // 3. Pesquisas registradas (antes de "resultado", que também aparece em "resultado da pesquisa")
        if (Regex("""\bpesquisas?\b|\binstituto\b|\bdatafolha\b|\bquaest\b|\bipec\b|\batlas ?intel\b|\bpesq ?ele\b|\bintencao de voto\b""").containsMatchIn(t))
            return q(Intent.PESQUISAS)

        // 3.1 Segundo turno e resultados
        if (Regex("""\bsegundo turno\b|\b2 ?(o|º)? turno\b""").containsMatchIn(t) &&
            Regex("""\b(quem|quais|candidatos|disputam|disputa|vai ter|havera|tem|passou|passaram|foram)\b""").containsMatchIn(t) && !RX_RESULTADOS.containsMatchIn(t.replace("segundo turno", "")) )
            return q(Intent.SEGUNDO_TURNO)
        if (RX_RESULTADOS.containsMatchIn(t)) return q(Intent.RESULTADOS)

        // 4. Fontes e sobre os dados
        if (Regex("""\bde onde (vem|vêm|sao)\b|\bfontes?\b|\bdados (sao|vem|oficiais)\b|\batualizad\w*\b|\batualizacao\b|\bultima atualizacao\b|\bversao\b""").containsMatchIn(t))
            return q(Intent.SOBRE_DADOS)
        if (Regex("""\bsites? oficia\w*\b|\bdivulgacand\w*\b|\btre\b|\bonde consulto\b|\blinks? (oficia\w*|do tse)\b""").containsMatchIn(t))
            return q(Intent.FONTES)

        // 5. Patrimônio, elegibilidade, contagem
        val listagem = Regex("""\bquem (disputa|disputam|concorre|concorrem|sao)\b|\bcandidat\w* (a|ao|à|para|de|do|da|em)\b|\blista( de)? candidat\w*\b|\bmostr\w* (os )?candidat\w*\b|\bver (os )?candidat\w*\b|\bquais (os |sao os )?candidat\w*\b""").containsMatchIn(t)
        if (Regex("""\bpatrimonio\b|\bbens\b|\briqueza\b|\bdeclarou\b|\bquanto (tem|possui)\b""").containsMatchIn(t)) {
            return q(Intent.PATRIMONIO, nome = if (!listagem) resolverNome(t, raw, cargo, uf, partido, gaz) else null)
        }
        if (Regex("""\bficha limpa\b|\belegibilidade\b|\binelegi\w*\b|\bindeferid\w*\b|\bimpugna\w*\b|\bcassa\w*\b|\bsituacao (do|da) (registro|candidatura)\b|\bregistro (negado|aprovado|deferido)\b|\bdeferid\w*\b""").containsMatchIn(t))
            return q(Intent.ELEGIBILIDADE, nome = resolverNome(t, raw, cargo, uf, partido, gaz))
        if (Regex("""\bquantos\b|\bquantas\b|\bnumero de candidat\w*\b|\btotal de candidat\w*\b""").containsMatchIn(t))
            return q(Intent.CONTAR)

        // 6. Candidato por nome (quando não é uma pergunta de listagem)
        if (!listagem) {
            resolverNome(t, raw, cargo, uf, partido, gaz)?.let { return q(Intent.PERFIL_CANDIDATO, nome = it) }
        }

        // 7. Listagens por cargo/UF/partido/tema
        if (listagem || cargo != null || partido != null || tema != null || historico != null ||
            Regex("""\bcandidat\w*\b""").containsMatchIn(t)
        ) return q(Intent.LISTAR_CANDIDATOS)

        return q(Intent.DESCONHECIDA)
    }

    // ------------------------------------------------------------------ entidades

    fun extrairCargo(t: String): String? {
        for ((kw, code) in CARGOS) {
            if (Regex("""\b${Regex.escape(kw)}\b""").containsMatchIn(t)) return code
        }
        return null
    }

    fun extrairUf(raw: String, t: String): String? {
        for ((nome, sigla) in NOMES_UF) {
            // "para" (estado) colide com a preposição: só vale como "estado do pará"/"no pará"/"em pará"
            if (nome == "para") {
                if (Regex("""\b(estado do|no|em|do|de) para\b""").containsMatchIn(t)) return "PA"
                continue
            }
            if (Regex("""\b${Regex.escape(nome)}\b""").containsMatchIn(t)) return sigla
        }
        // Siglas isoladas
        for (sigla in Ufs.SIGLAS) {
            val s = sigla.lowercase()
            val maiuscula = Regex("""(^|[^A-Za-zÀ-ÿ])${sigla}(?![A-Za-zÀ-ÿ])""").containsMatchIn(raw)
            val comPrep = Regex("""\b(em|de|do|da|no|na|por|pelo|pela|uf|estado|governo de|senado de)\s+$s\b""").containsMatchIn(t)
            val livre = s !in SIGLAS_AMBIGUAS && Regex("""\b$s\b""").containsMatchIn(t)
            if (maiuscula || comPrep || livre) return sigla
        }
        return null
    }

    fun extrairPartido(t: String, gaz: Gazetteer): String? {
        for ((norm, sigla) in gaz.partidos) {
            val esc = Regex.escape(norm)
            val achou = if (norm in PARTIDOS_AMBIGUOS) {
                Regex("""\b(partido|do|pelo|pela|da|federacao|legenda)\s+$esc\b""").containsMatchIn(t)
            } else {
                Regex("""\b$esc\b""").containsMatchIn(t)
            }
            if (achou) return sigla
        }
        return null
    }

    fun extrairTema(t: String): String? {
        for ((kw, id) in TEMAS.entries.sortedByDescending { it.key.length }) {
            if (Regex("""\b${Regex.escape(kw)}\b""").containsMatchIn(t)) return id
        }
        return null
    }

    private fun extrairTurno(t: String): Int? = when {
        Regex("""\bsegundo turno\b|\b2 ?(o|º)? turno\b""").containsMatchIn(t) -> 2
        Regex("""\bprimeiro turno\b|\b1 ?(o|º)? turno\b""").containsMatchIn(t) -> 1
        else -> null
    }

    private fun extrairHistorico(t: String): HistoricoOpcao? = when {
        Regex("""\bestreante\w*\b|\bprimeira vez\b|\bnunca (foi )?eleit\w*\b|\bnovato\w*\b""").containsMatchIn(t) -> HistoricoOpcao.NUNCA_ELEITO
        Regex("""\breeleicao\b|\btentando reeleicao\b|\bja (foi )?eleit\w*\b""").containsMatchIn(t) -> HistoricoOpcao.ELEITO_MESMO_CARGO
        Regex("""\bveterano\w*\b|\bvarias vezes eleito\b""").containsMatchIn(t) -> HistoricoOpcao.ELEITO_2_OU_MAIS
        else -> null
    }

    // ------------------------------------------------------------------ nome de candidato

    private val STOP_EXTRA = setOf(
        "disputa", "disputam", "disputar", "concorre", "concorrem", "concorrer", "lista", "listar", "todos", "todas",
        "onde", "quando", "como", "sao", "ser", "tenho", "posso", "quero", "gostaria", "saber", "exibir", "filtrar",
        "filtro", "entre", "estado", "estados", "brasil", "nacional", "regiao", "ano", "segundo", "primeiro", "turno",
        "fale", "fala", "falar", "diga", "me", "pode", "pelo", "pela", "uma", "uns", "esse", "essa", "este", "esta",
        "aquele", "aquela", "dele", "dela", "seu", "sua", "meu", "minha", "tudo", "mais", "menos", "muito", "pouco",
        "votar", "votei", "votando", "vota", "novo", "nova", "novos", "novas", "outro", "outra", "algum", "alguma",
        "preciso", "precisa", "decidir", "escolher", "escolha", "gostar", "gosto", "queria", "tenho", "tinha"
    )

    /**
     * Procura um nome de candidato na pergunta removendo palavras de função, cargos, UFs e partidos.
     * Só devolve um nome se existir candidato correspondente (todas as palavras presentes no nome).
     */
    fun resolverNome(t: String, raw: String, cargo: String?, uf: String?, partido: String?, gaz: Gazetteer): String? {
        var texto = t
        for ((kw, _) in CARGOS) texto = texto.replace(Regex("""\b${Regex.escape(kw)}\b"""), " ")
        for ((n, _) in NOMES_UF) texto = texto.replace(Regex("""\b${Regex.escape(n)}\b"""), " ")
        if (partido != null) texto = texto.replace(Regex("""\b${Regex.escape(Texto.normalizar(partido))}\b"""), " ")
        val tokens = texto.split(' ', '?', '!', '.', ',', ';', ':', '"', '\'', '(', ')')
            .filter { it.length >= 3 && it.any(Char::isLetter) && it !in Gazetteer.STOP_NOME && it !in STOP_EXTRA }
            .filter { !(it.length == 2 && it.uppercase() in Ufs.SIGLAS) }
        if (tokens.isEmpty()) return null
        for (tamanho in minOf(tokens.size, 4) downTo 1) {
            for (janela in tokens.windowed(tamanho)) {
                val termo = janela.joinToString(" ")
                if (tamanho == 1 && termo.length < 4) continue
                if (gaz.buscarPorNome(termo, cargo = null, uf = null, limite = 1).isNotEmpty()) return termo
            }
        }
        return null
    }
}
