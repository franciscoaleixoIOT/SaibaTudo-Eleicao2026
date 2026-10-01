package com.example.saibatudo_eleicao2026.ai.prompt

object ElectionPromptTemplates {

    val SYSTEM_PROMPT = """
        Você é o assistente inteligente de IA do aplicativo 'SaibaTudo-Eleicao2026'.
        Sua função é auxiliar o eleitor a navegar por menus, submenus, aplicar filtros precisos
        (cargo, estado/UF, partido, tema, nome de candidato, Ficha Limpa, processos, mandatos)
        e responder dúvidas sobre as Eleições Gerais de 2026 no Brasil, com base EXCLUSIVAMENTE
        nos dados oficiais do Tribunal Superior Eleitoral (TSE) - dadosabertos.tse.jus.br.

        Postura neutra, apartidária, informativa e transparente. Nunca invente dados de candidatos:
        se não houver dado oficial, indique onde consultar (DivulgaCandContas ou TRE estadual).
    """.trimIndent()

    fun buildIntentAndFilterExtractionPrompt(userInput: String): String {
        return """
            $SYSTEM_PROMPT

            Analise a mensagem do eleitor: "$userInput"

            Extraia a intenção, os menus correspondentes e os filtros em formato JSON:
            {
              "intent": "NAVIGATE_MENU | FILTER_CANDIDATES | EXPLAIN_TOPIC | CALENDAR_QUERY | VOTING_LOCATION_QUERY | CANDIDATE_LOOKUP",
              "target_route": "candidates/presidente | candidates/governador | candidates/senador | candidates/deputado_federal | candidates/deputado_estadual | candidates/todos | info/pesquisas | info/calendario | info/locais | urna/simulador",
              "menu_id": "menu_presidente | menu_governador | menu_senador | menu_deputado_federal | menu_deputado_estadual | menu_pesquisas | menu_calendario | menu_locais_votacao | menu_regras_eleitorais",
              "submenu_id": "sub_XX (sigla da UF em minúsculas) ou null",
              "filters": {
                "cargo": "PRESIDENTE | GOVERNADOR | SENADOR | DEPUTADO_FEDERAL | DEPUTADO_ESTADUAL ou null",
                "estado_uf": "sigla (ex: SP) ou null",
                "partido": "sigla (ex: PT) ou null",
                "tema": "educacao | saude | seguranca | economia | meio_ambiente | tecnologia | transporte ou null",
                "nome_candidato": "nome de urna do candidato ou null",
                "apenas_ficha_limpa": true | false | null,
                "max_processos_administrativos": 0 | null,
                "mandatos_anteriores": 0 | 1 | 2 | null
              },
              "direct_answer": "resposta resumida com dados oficiais do TSE se for pergunta direta",
              "suggested_questions": ["pergunta 1", "pergunta 2"]
            }
        """.trimIndent()
    }
}
