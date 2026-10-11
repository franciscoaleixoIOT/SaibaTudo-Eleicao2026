package net.saibatudo.eleicoes2026.ai.answer

import net.saibatudo.eleicoes2026.ai.model.AiFilterExtraction
import net.saibatudo.eleicoes2026.ai.model.AiMenuResponse
import net.saibatudo.eleicoes2026.ai.model.Intent
import net.saibatudo.eleicoes2026.ai.model.ParsedQuery
import net.saibatudo.eleicoes2026.ai.nlu.ModeloCargo
import net.saibatudo.eleicoes2026.core.constants.AppConstants
import net.saibatudo.eleicoes2026.domain.model.Datas
import net.saibatudo.eleicoes2026.domain.model.FaseEleitoral
import net.saibatudo.eleicoes2026.domain.model.Texto
import net.saibatudo.eleicoes2026.domain.model.Ufs
import net.saibatudo.eleicoes2026.domain.model.tituloCargo

// Pesquisas, calendário, local de votação, regras da urna e do voto, Senado, fontes e sobre os dados.
// Funções de extensão de [AnswerBuilder] (estado e helpers são `internal` na classe); o despacho por intenção fica em AnswerBuilder.kt.

// ------------------------------------------------------------------ pesquisas, calendário, regras, fontes

internal fun AnswerBuilder.pesquisas(p: ParsedQuery): AiMenuResponse {
    val filtro = data.pesquisas.filter { x ->
        (p.uf == null || x.uf.equals(p.uf, true)) &&
            (p.cargo == null || x.cargo.orEmpty().split(',').any { c -> ModeloCargo.mesmaFamilia(p.cargo, c.trim().uppercase().replace(' ', '_')) })
    }.sortedByDescending { it.dataRegistro.orEmpty() }
    val qtd = filtro.size
    val texto = buildString {
        append("O TSE tem ${n(qtd)} pesquisa${plural(qtd)} eleitora${if (qtd == 1) "l" else "is"} registrada${plural(qtd)}")
        if (p.uf != null) append(" ${Ufs.em(p.uf)}")
        if (p.cargo != null) append(" (${tituloCargo(p.cargo)})")
        append(".")
        filtro.firstOrNull()?.let {
            append("\nRegistro mais recente: ${it.empresa ?: "empresa não informada"}")
            val det = listOfNotNull(
                it.dataRegistro?.let { d -> "registrada em ${dataCurta(d)}" },
                it.dataDivulgacao?.let { d -> "divulgação a partir de ${dataCurta(d)}" },
                it.entrevistados?.let { e -> "$e entrevistados" }
            )
            if (det.isNotEmpty()) append(" (${det.joinToString("; ")})")
        }
        val inst = filtro.mapNotNull { it.empresa }.distinct().take(6)
        if (inst.isNotEmpty()) append("\nInstitutos com registros recentes: ${inst.joinToString(", ")}")
        append("\nAtenção: o registro no TSE não traz os resultados da pesquisa; consulte o relatório divulgado pelo instituto.")
    }
    return AiMenuResponse(
        targetRoute = "info/pesquisas", menuId = AppConstants.MENU_PESQUISAS, intent = p.intent,
        filters = AiFilterExtraction(estadoUf = p.uf, cargo = p.cargo),
        directAnswer = texto, suggestedQuestions = listOf("Quem disputa a Presidência?", "Calendário eleitoral 2026"),
        fonte = fonte, origem = origem
    )
}

internal fun AnswerBuilder.calendario(): AiMenuResponse {
    val d1 = dataBr(regras.turno1)
    val d2 = dataBr(regras.turno2)
    val dias1 = Datas.diasEntre(hoje, regras.turno1)
    val situacao = when (fase) {
        FaseEleitoral.PRE_ELEICAO -> "O 1º turno será em $d1 (${if (dias1 == 1L) "amanhã" else "daqui a $dias1 dias"})."
        FaseEleitoral.DIA_1T -> "Hoje é o 1º turno ($d1)."
        FaseEleitoral.ENTRE_TURNOS -> "O 1º turno foi em $d1; o 2º turno, onde houver, será em $d2."
        FaseEleitoral.DIA_2T -> "Hoje é o 2º turno ($d2)."
        FaseEleitoral.POS_ELEICAO -> "As votações ocorreram em $d1 (1º turno) e $d2 (2º turno)."
    }
    val texto = "$situacao\n" +
        "1º turno: $d1\n" +
        "2º turno: $d2 — só onde houver (Presidente e Governador)\n" +
        "Horário de votação: ${regras.horarioVotacao}\n" +
        "Posse: Presidente em 05/01/2027; Governadores em 06/01/2027 (EC 111/2021)\n" +
        "Demais prazos (prestação de contas, diplomação etc.): calendário oficial do TSE — ${AppConstants.URL_CALENDARIO_TSE}"
    return AiMenuResponse(
        targetRoute = "info/calendario", menuId = AppConstants.MENU_CALENDARIO, intent = Intent.CALENDARIO,
        directAnswer = texto, suggestedQuestions = listOf("Onde consultar meu local de votação?", "Quem disputa a Presidência?"),
        fonte = fonte, origem = origem
    )
}

internal fun AnswerBuilder.localVotacao(p: ParsedQuery? = null): AiMenuResponse {
    val t = Texto.normalizar(p?.textoOriginal.orEmpty())
    val ehBiometria = t.contains("biometri")
    val ehDocumento = Regex("""document|cnh|habilitacao|carteira|passaporte|reservista|certidao|oab|crm|crea|foto|galeria|copia|identificacao|titulo""").containsMatchIn(t)

    if (ehBiometria) {
        val texto = "Identificação biométrica na votação (Resolução TSE nº 23.736/2024):\n" +
            "• Tentativas de leitura: O sistema da urna realiza até 4 tentativas de leitura da digital do eleitor;\n" +
            "• Se a digital não for reconhecida: O mesário confere o documento oficial com foto e a assinatura do eleitor, anota a ocorrência na ata da seção e faz a liberação manual pelo código do mesário. Nenhum eleitor apto é impedido de votar por falha biométrica;\n" +
            "• Quem não cadastrou a biometria: Vota normalmente apresentando documento oficial com foto, desde que seu título esteja em situação regular."
        return AiMenuResponse(
            targetRoute = "info/locais", menuId = AppConstants.MENU_LOCAIS_VOTACAO, intent = Intent.LOCAL_VOTACAO,
            directAnswer = texto,
            suggestedQuestions = listOf("Quais documentos levar para votar?", "Ordem de votação na urna"),
            fonte = "Fonte: Resolução TSE nº 23.736/2024 (art. 104) e orientações do TSE.", origem = origem
        )
    }

    if (ehDocumento) {
        val texto = "Documentos para identificação no dia da votação (Res. TSE nº 23.736/2024, art. 104):\n" +
            "• Documentos OFICIAIS ACEITOS (com foto):\n" +
            "  - e-Título (se tiver foto biométrica cadastrada no aplicativo oficial);\n" +
            "  - Carteira de Identidade (RG) ou identidade social;\n" +
            "  - CNH (Carteira Nacional de Habilitação, aceita inclusive se estiver vencida);\n" +
            "  - Passaporte brasileiro original e válido;\n" +
            "  - Carteira de Trabalho física ou digital oficial;\n" +
            "  - Certificado de reservista militar com foto;\n" +
            "  - Carteiras profissionais oficiais reconhecidas por lei (OAB, CRM, CREA etc.).\n" +
            "• O que NÃO É ACEITO:\n" +
            "  - Certidão de nascimento ou de casamento (não possuem foto);\n" +
            "  - Fotos de documentos salvas na galeria do celular ou capturas de tela/prints;\n" +
            "  - Crachás comuns de eleitor ou cópias não autenticadas se houver dúvida.\n" +
            "• Título de eleitor impresso: NÃO é obrigatório portar o papel físico se levar documento com foto.\n" +
            "• e-Título sem foto: Deve ser apresentado acompanhado obrigatoriamente de outro documento oficial com foto."
        return AiMenuResponse(
            targetRoute = "info/locais", menuId = AppConstants.MENU_LOCAIS_VOTACAO, intent = Intent.LOCAL_VOTACAO,
            directAnswer = texto,
            suggestedQuestions = listOf("Onde consultar meu local de votação?", "Como funciona a biometria?"),
            fonte = "Fonte: Resolução TSE nº 23.736/2024 (art. 104) e Lei nº 9.504/1997.", origem = origem
        )
    }

    return AiMenuResponse(
        targetRoute = "info/locais", menuId = AppConstants.MENU_LOCAIS_VOTACAO, intent = Intent.LOCAL_VOTACAO,
        directAnswer = "Onde votar e situação do título (sistemas oficiais):\n" +
            "• Local de votação e título: Autoatendimento do Eleitor (${AppConstants.URL_AUTOATENDIMENTO_ELEITOR}) ou app e-Título\n" +
            "• Justificar a ausência: app e-Título ou sistema Justifica\n" +
            "• No dia: leve documento oficial com foto (o e-Título com foto também vale)\n" +
            "O app não consulta dados pessoais do eleitor.",
        suggestedQuestions = listOf("Calendário eleitoral 2026", "Ordem de votação na urna"), fonte = fonte, origem = origem
    )
}

internal fun AnswerBuilder.regrasUrna(p: ParsedQuery? = null): AiMenuResponse {
    val t = Texto.normalizar(p?.textoOriginal.orEmpty())
    val condutaOuVestimenta = Regex("""chinel|sandali|bermud|calcao|short|regat|roupa|vestiment|traje|descalc|sem camisa|biquin|sunga|maio|vestir|calcado|celular|telefon|smartphon|camera|fotograf|filmador|film|grava|foto|colinha|porte de arma|arma|cac\b|cacs\b|bone|chapeu|gorro|oculos de sol|mascara|quipa|veu|niqab|burca|saia|minissaia|destroyed|rasgad|bombacha|cosplay|fantasia|pijama|legging|top fitness|jaleco|avental|tatuag|uniforme|fardad|fiscal|fiscais|delegado|cracha|boca de urna|santinho|panfleto|apito|buzina|vuvuzela|palavras de ordem|pedir voto|aglomerac|filho|crianca|idoso|deficienc|acessibilidade|auxili|cao-guia|cao guia|libras|ceg|surd|animal|pet|cachorro|gato|desord|tumulto|prisao|embriag|autoridade|expulsar|caderno|comprovante|sigilo do voto""").containsMatchIn(t) ||
        Regex("""\b(posso|pode|da pra|da para) (ir de|usar|votar de|levar|entrar com)\b""").containsMatchIn(t) ||
        Regex("""\bo que (posso|pode) (levar|usar|vestir)\b""").containsMatchIn(t)

    if (condutaOuVestimenta) {
        val destaque = when {
            Regex("""celular|smartphon|camera|fotograf|filmador|film|grav|audio|video|smartwatch|relogio|fone|headphone|tablet|sigilo""").containsMatchIn(t) ->
                "• CELULAR, ELETRÔNICOS E CABINE (Lei 9.504/97, art. 91-A; Código Eleitoral, art. 312):\n" +
                "  - Proibição estrita: É proibido entrar na cabine com celular, smartphone, smartwatch, fones de ouvido sem fio, tablet, máquina fotográfica ou filmadora (mesmo desligados no bolso);\n" +
                "  - Onde deixar: Devem ser desligados e entregues na mesa receptora aos mesários antes de votar;\n" +
                "  - Recusa ou gravação: Recusar a entrega impede o voto; filmar ou fotografar a urna é crime eleitoral (violação do sigilo do voto, detenção de até 2 anos) com prisão em flagrante.\n\n"
            Regex("""arma|porte de arma|cac|tiro|policia|desord|tumulto|prisao|embriag|autoridade|expulsar""").containsMatchIn(t) ->
                "• ARMAS, SEGURANÇA E ORDEM (Res. TSE nº 23.736/2024, art. 132; Código Eleitoral, art. 139):\n" +
                "  - Proibição de armas: Proibido o porte e transporte de armas de fogo no raio de 100m das seções nas 48h antes e 24h depois do pleito (inclusive para civis com porte e CACs);\n" +
                "  - Policiais em serviço: Só votam armados policiais escalados em serviço na segurança daquele local de votação; de folga, votam desarmados;\n" +
                "  - Embriaguez e desordem: Eleitor embriagado que mantiver a compostura pode votar; desordeiros e tumultuadores podem ser expulsos e presos pelo presidente da mesa, que possui autoridade de polícia.\n\n"
            Regex("""filho|crianca|idoso|deficienc|acessibilidade|auxili|cao-guia|cao guia|libras|ceg|surd|animal|pet|cachorro|gato""").containsMatchIn(t) ->
                "• ACESSIBILIDADE, CRIANÇAS E ACOMPANHANTES (Res. TSE nº 23.736/2024, arts. 136 e 137):\n" +
                "  - Crianças pequenas: Pais podem entrar acompanhados de filhos pequenos, mas a criança NÃO pode apertar as teclas da urna (o voto é personalíssimo);\n" +
                "  - Auxílio ao eleitor com deficiência ou idoso: Permitido acompanhante de sua confiança (não pode ser mesário, fiscal ou pessoa a serviço de partido);\n" +
                "  - Cão-guia: Entrada garantida na seção e na cabine para pessoas com deficiência visual; animais domésticos comuns (pets) não são permitidos;\n" +
                "  - Urna acessível: Teclas em Braille, fones de áudio fornecidos na seção com sintetizador de voz e tradutor em Libras na tela.\n\n"
            Regex("""boca de urna|santinho|panfleto|apito|buzina|vuvuzela|palavras de ordem|pedir voto|aglomerac|fiscal|fiscais|delegado|cracha""").containsMatchIn(t) ->
                "• PROPAGANDA NO DIA, BOCA DE URNA E FISCAIS (Lei 9.504/97, art. 39; Res. TSE nº 23.736/2024):\n" +
                "  - Boca de urna é CRIME: Proibido pedir votos na fila, distribuir santinhos, panfletos, cópias de colinhas, usar apitos, buzinas, vuvuzelas ou gritar palavras de ordem (detenção de 6 meses a 1 ano);\n" +
                "  - Derrame de santinhos: Despejar propaganda no chão na madrugada do pleito é crime eleitoral;\n" +
                "  - Mesários e fiscais: Mesários não podem usar roupas de partidos. Fiscais partidários só podem usar crachá padronizado oficial (10x15cm, sem propaganda).\n\n"
            else -> ""
        }

        val texto = "Vestimenta e conduta no dia da votação (Resolução TSE nº 23.736/2024, arts. 132 e 135):\n" +
            destaque +
            "• O que É PERMITIDO:\n" +
            "  - Votar de chinelo, sandália, bermuda, shorts, regata ou camiseta (não há exigência de roupa formal);\n" +
            "  - Votar descalço, de boné, chapéu, gorro, óculos de sol, máscara de proteção facial ou roupas religiosas (quipá, véu; niqab/burca exige identificação facial prévia);\n" +
            "  - Usar roupas casuais, calça rasgada, pijama, cosplay, bombacha, roupas fitness, avental ou uniformes de time e da empresa;\n" +
            "  - Manifestação individual e silenciosa da preferência eleitoral (bandeiras, broches, dísticos, adesivos e camisetas de candidatos/partidos);\n" +
            "  - Levar \"colinha\" em papel com os números anotados dos seus candidatos (pode guardar no bolso após votar).\n" +
            "• O que É PROIBIDO:\n" +
            "  - Celular, smartphone, máquina fotográfica ou filmadora dentro da cabine de votação (devem ser desligados e entregues aos mesários antes de votar — Lei nº 9.504/1997, art. 91-A);\n" +
            "  - Votar em trajes de banho (biquíni, maiô, sunga) ou sem camisa / nudez;\n" +
            "  - Boca de urna, aglomeração ou distribuição de material de campanha no dia da eleição;\n" +
            "  - Porte de armas no local de votação e no raio de 100 metros (salvo forças de segurança em serviço autorizado).\n" +
            "• Caderno e comprovante: Assinar o caderno de votação é obrigatório; o comprovante de votação é entregue ao eleitor (quitação pode ser emitida online a qualquer momento)."
        return AiMenuResponse(
            targetRoute = "urna/simulador", menuId = AppConstants.MENU_REGRAS_ELEITORAIS, intent = Intent.REGRAS_URNA,
            directAnswer = texto,
            suggestedQuestions = listOf("Ordem de votação na urna", "Onde consultar meu local de votação?", "Simular voto na urna"),
            fonte = "Fonte: Resolução TSE nº 23.736/2024 (arts. 132 e 135) e Lei nº 9.504/1997 (art. 91-A).",
            origem = origem
        )
    }

    val etapas = regras.ordemVotacaoUrna.sortedBy { it.ordem }.joinToString("\n") { "• ${it.ordem}º) ${it.cargo} — ${it.digitos} dígitos" }
    return AiMenuResponse(
        targetRoute = "urna/simulador", menuId = AppConstants.MENU_REGRAS_ELEITORAIS, intent = Intent.REGRAS_URNA,
        directAnswer = "Ordem de votação na urna eletrônica em 2026:\n$etapas\n" +
            "Como votar: digite o número, confira foto, nome e partido e aperte CONFIRMA (CORRIGE apaga; BRANCO vota em branco).\n" +
            "O simulador do app é educativo: não é a urna oficial e não registra votos.",
        suggestedQuestions = listOf("Regra dos dois senadores", "Simular voto na urna"), fonte = fonte, origem = origem
    )
}

internal fun AnswerBuilder.regrasVoto(p: ParsedQuery): AiMenuResponse {
    val t = Texto.normalizar(p.textoOriginal)
    val condutaOuVestimenta = Regex("""chinel|sandali|bermud|short|regat|roupa|vestiment|traje|descalc|sem camisa|biquin|sunga|maio|vestir|calcado|celular|colinha""").containsMatchIn(t) ||
        Regex("""\b(posso|pode|da pra|da para) (ir de|usar|votar de|levar)\b""").containsMatchIn(t)
    if (condutaOuVestimenta) {
        return regrasUrna(p)
    }
    val obrigatoriedade = Regex("""obrigat|facultativ|multa|nao votar|obrigad""").containsMatchIn(t)
    val brancoNulo = Regex("""nul|branco|validos|anular""").containsMatchIn(t) || !obrigatoriedade
    val texto = buildString {
        if (brancoNulo) {
            append("Voto em branco e voto nulo (regras oficiais):")
            append("\n• Nenhum dos dois conta como voto válido: só contam os votos dados a candidatos e, nas eleições proporcionais, às legendas (Constituição, art. 77, §2º; Lei 9.504/1997, arts. 2º e 5º).")
            append("\n• Na urna: para votar em branco, aperte BRANCO e CONFIRMA; voto nulo é digitar um número que não corresponde a candidato nem a partido e confirmar.")
            append("\n• Mesmo que a maioria vote nulo, a eleição NÃO é anulada: a anulação do Código Eleitoral (art. 224) trata de votos anulados pela Justiça Eleitoral, por exemplo por fraude, e não do voto nulo do eleitor.")
        }
        if (obrigatoriedade) {
            if (isNotEmpty()) append("\n")
            append("Quem deve votar (Constituição, art. 14, §1º):")
            append("\n• Obrigatório: eleitores de 18 a 70 anos.")
            append("\n• Facultativo: jovens de 16 e 17 anos, maiores de 70 anos e analfabetos.")
            append("\n• Quem não votar deve justificar no dia da eleição ou em até 60 dias após cada turno (app e-Título ou sistema Justifica); sem justificativa, há multa e restrições até a regularização.")
        }
    }
    return AiMenuResponse(
        targetRoute = "info/regras", menuId = AppConstants.MENU_REGRAS_ELEITORAIS, intent = Intent.REGRAS_VOTO,
        directAnswer = texto, suggestedQuestions = listOf("Ordem de votação na urna", "Onde consultar meu local de votação?"),
        fonte = "Fonte: Constituição Federal, Lei 9.504/1997 e Código Eleitoral; orientações do TSE (${AppConstants.URL_PORTAL_TSE_2026}).",
        origem = origem
    )
}

internal fun AnswerBuilder.senadoDoisVotos() = AiMenuResponse(
    targetRoute = "candidates/senador", menuId = AppConstants.MENU_SENADOR, intent = Intent.SENADO_DOIS_VOTOS,
    filters = AiFilterExtraction(cargo = "SENADOR", resetar = true),
    directAnswer = "Em 2026 cada eleitor vota em DOIS senadores (renovação de 2/3 do Senado):\n" +
        "• 1ª vaga e 2ª vaga: 3 dígitos cada\n" +
        "• Os dois votos devem ser para candidatos diferentes: se o mesmo número for digitado nas duas vagas, o segundo voto é anulado pela urna.",
    suggestedQuestions = listOf("Candidatos ao Senado em ${ufPadrao ?: "SP"}", "Ordem de votação na urna"), fonte = fonte, origem = origem
)

internal fun AnswerBuilder.fontes(p: ParsedQuery): AiMenuResponse {
    val tre = p.uf?.let { u -> data.fontes?.tres?.firstOrNull { it.uf == u } }
    val texto = buildString {
        append("Fontes oficiais:")
        AppConstants.SISTEMAS_OFICIAIS_TSE.forEach { append("\n• ${it.first}: ${it.second}") }
        tre?.let { append("\n• ${it.tribunal}: ${it.url}") }
    }
    return AiMenuResponse(
        targetRoute = "info/fontes", menuId = AppConstants.MENU_REGRAS_ELEITORAIS, intent = Intent.FONTES,
        directAnswer = texto, suggestedQuestions = listOf("De onde vêm os dados?"), fonte = fonte, origem = origem
    )
}

internal fun AnswerBuilder.sobreDados(): AiMenuResponse {
    val m = data.manifest
    val texto = "Sobre os dados do app:\n" +
        "Fonte: arquivos abertos do TSE (${AppConstants.URL_DADOS_ABERTOS_TSE}), licença CC BY\n" +
        "Extração do TSE: ${regras.extracaoTse.ifBlank { "—" }}\n" +
        "Pacote: ${m.dataVersion} (${data.origem})\n" +
        "Conteúdo: ${n(regras.estatisticas.totalRegistros)} candidaturas · ${n(regras.estatisticas.pesquisasRegistradas)} pesquisas registradas\n" +
        "O app verifica atualizações automaticamente e confere a assinatura digital dos dados."
    return AiMenuResponse(
        targetRoute = "info/sobre", menuId = AppConstants.MENU_REGRAS_ELEITORAIS, intent = Intent.SOBRE_DADOS,
        directAnswer = texto, suggestedQuestions = listOf("Quem disputa a Presidência?"), fonte = fonte, origem = origem
    )
}
