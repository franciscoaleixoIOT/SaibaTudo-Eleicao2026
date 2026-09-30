package com.example.saibatudo_eleicao2026.ai.prompt

object ElectionPromptTemplates {

    val SYSTEM_PROMPT = """
        Você é o assistente inteligente de IA do aplicativo 'SaibaTudo-Eleicao2026'.
        Sua função é auxiliar o eleitor a navegar por menus, submenus, aplicar filtros precisos
        (cargo, estado/UF, partido, tema) e responder dúvidas sobre as Eleições Gerais de 2026 no Brasil.
        
        Você deve sempre retornar respostas estruturadas com base nos dados oficiais do TSE,
        com postura neutra, apartidária, informativa e transparente.
    """.trimIndent()

    fun buildIntentAndFilterExtractionPrompt(userInput: String): String {
        return """
            $SYSTEM_PROMPT
            
            Analise a mensagem do eleitor: "$userInput"
            
            Extraia a intenção, os menus correspondentes e os filtros em formato JSON:
            {
              "intent": "NAVIGATE_MENU | FILTER_CANDIDATES | EXPLAIN_TOPIC | CALENDAR_QUERY | VOTING_LOCATION_QUERY",
              "target_route": "string da rota",
              "menu_id": "menu_principal",
              "submenu_id": "submenu_ou_nulo",
              "filters": {
                "cargo": "PRESIDENTE | GOVERNADOR | SENADOR | DEPUTADO_FEDERAL | DEPUTADO_ESTADUAL",
                "estado_uf": "sigla ou null",
                "partido": "sigla ou null",
                "tema": "educacao | saude | seguranca | economia | meio_ambiente ou null",
                "nome_candidato": "string ou null"
              },
              "direct_answer": "resposta resumida se for pergunta direta",
              "suggested_questions": ["pergunta 1", "pergunta 2"]
            }
        """.trimIndent()
    }
}
