# -*- coding: utf-8 -*-
"""
Núcleo PURO do NLU em nuvem (sem Modal, sem llama.cpp, só biblioteca padrão).

Concentra o que precisa ser idêntico entre treino, serviço e avaliação:
  - o prompt (formato de chat ChatML do Qwen2.5) e a instrução de sistema;
  - as gramáticas GBNF que garantem JSON válido e curto;
  - a limpeza/validação da pergunta e o parsing da saída.

Dois formatos de saída do modelo:

  "legacy"  Modelo atual (franciscoaleixo/SaibaTudo-Eleicao2026, treinado com ai_model/scripts/train_hybrid.py):
            {"intent": "FILTER_CANDIDATES", "target_route": "...", "menu_id": "...", "submenu_id": "sub_sp"|null,
             "filters": {cargo, digitos_urna, estado_uf, regiao, partido, tema, nome_candidato,
                         apenas_ficha_limpa, max_processos_administrativos, mandatos_anteriores[, reeleicao]},
             "direct_answer": "...", "suggested_questions": [...]}
            A gramática TERMINA logo após o objeto "filters": direct_answer/suggested_questions nunca são gerados
            (o proxy da Vercel nunca os repassa; gerá-los custaria ~125 tokens a mais por pergunta).

  "v2"      Formato compacto do modelo retreinado (backend/retrain/build_nlu_dataset.py): já é o contrato do NLU,
            só com as chaves presentes (~10-30 tokens):
            {"intent": "LISTAR_CANDIDATOS", "cargo": "GOVERNADOR", "uf": "SP"}

A normalização para o contrato (api/_lib/normalize.js) é feita no proxy; este módulo devolve o JSON bruto.
"""
import json
import re

# ---------------------------------------------------------------------------------------------------------
# Limites
# ---------------------------------------------------------------------------------------------------------
MAX_QUESTION_CHARS = 300
MIN_QUESTION_CHARS = 1  # o proxy exige >= 3; aqui só se recusa o vazio

# Medido com o tokenizer do modelo sobre o dataset de treino: o trecho "intent..filters" tem em média 136 tokens
# (máx. 149). 160 dá folga para nomes mais longos; se a gramática não terminar dentro do limite o JSON fica
# truncado e o proxy responde 502 (nunca se repassa JSON incompleto).
MAX_NEW_TOKENS = {"legacy": 160, "v2": 96}

FORMATS = ("legacy", "v2")

# ---------------------------------------------------------------------------------------------------------
# Prompts (ChatML do Qwen2.5; o MESMO usado no treino por train_hybrid.py e na validação test_inference.py)
# ---------------------------------------------------------------------------------------------------------
SYSTEM_PROMPT_LEGACY = (
    "Você é o assistente inteligente do SaibaTudo-Eleicao2026. "
    "Com base nos dados OFICIAIS do TSE (Eleições Gerais 2026), identifique "
    "intenção, rota, menu, submenu e filtros, e responda com JSON estruturado."
)

SYSTEM_PROMPT_V2 = (
    "Você interpreta perguntas de eleitores para o SaibaTudo Eleições 2026. "
    "Converta a pergunta em JSON compacto com a intenção e somente as entidades citadas na pergunta "
    "(cargo, uf, partido, nome, tema, apenasDeferidas, historico, turno). "
    "Não responda a pergunta e não invente dados."
)

SYSTEM_PROMPTS = {"legacy": SYSTEM_PROMPT_LEGACY, "v2": SYSTEM_PROMPT_V2}

IM_START = "<|im_start|>"
IM_END = "<|im_end|>"
STOP_TOKENS = [IM_END, "<|endoftext|>"]

_CONTROLES = re.compile(
    "[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤⁦-⁩﻿]"
)


def clean_question(q: str) -> str:
    """Remove controles/zero-width, colapsa espaços e neutraliza os delimitadores de token especial do ChatML
    (a pergunta não pode fabricar turnos de conversa nem tokens especiais no prompt)."""
    q = _CONTROLES.sub(" ", str(q))
    q = q.replace("<|", "< |").replace("|>", "| >")
    return re.sub(r"\s+", " ", q).strip()


def validate_question(q) -> str:
    """Devolve a pergunta limpa ou levanta ValueError (o endpoint responde 400)."""
    if not isinstance(q, str):
        raise ValueError("q deve ser texto")
    if len(q) > MAX_QUESTION_CHARS:
        raise ValueError(f"q excede {MAX_QUESTION_CHARS} caracteres")
    limpa = clean_question(q)
    if len(limpa) < MIN_QUESTION_CHARS:
        raise ValueError("q vazia")
    return limpa


MAX_CONTEXT_CHARS = 4000  # igual ao limite do proxy (api/_lib/validate.js)


def validate_context(ctx) -> str:
    """Contexto enviado pelo app para o /ask: texto de até MAX_CONTEXT_CHARS, sem controles nem tokens especiais do ChatML.
    Mantém as quebras de linha (o app envia tópicos). Vazio/None => "". Levanta ValueError (o endpoint responde 400)."""
    if ctx is None or ctx == "":
        return ""
    if not isinstance(ctx, str):
        raise ValueError("context deve ser texto")
    if len(ctx) > MAX_CONTEXT_CHARS:
        raise ValueError(f"context excede {MAX_CONTEXT_CHARS} caracteres")
    # _CONTROLES não inclui \t, \n e \r: as quebras de linha sobrevivem
    limpo = _CONTROLES.sub(" ", ctx.replace("\r\n", "\n").replace("\r", "\n"))
    limpo = limpo.replace("<|", "< |").replace("|>", "| >")
    return re.sub(r"[ \t]+", " ", limpo).strip()


ASK_SYSTEM_PROMPT = (
    "Você é o assistente do aplicativo independente SaibaTudo Eleições 2026 (sem vínculo com o TSE, governo, partidos ou candidatos). "
    "Responda em português do Brasil, com neutralidade absoluta, de forma objetiva e em tópicos curtos. Princípios obrigatórios:\n"
    "1. Use SOMENTE nomes, números, partidos, percentuais e valores que estejam no CONTEXTO ou nas REGRAS abaixo. "
    "Se o contexto não trouxer o dado pedido, diga que o dado não está disponível; nunca complete de memória nem use eleições passadas (2022, 2018).\n"
    "2. Nunca elogie, critique, compare, preveja nem recomende candidatos ou votos (Res. TSE 23.755/2026). Se pedirem, recuse com neutralidade.\n"
    "3. A situação da candidatura vem do registro no TSE (LC 64/90) e não substitui certidão judicial.\n"
    "4. Em chapas majoritárias, informe o titular, o vice e os partidos que estiverem no contexto.\n"
    "REGRAS (podem ser citadas sem constar do contexto):\n"
    "- Votação: 1º turno em 04/10/2026 e 2º turno em 25/10/2026, das 8h às 17h (Brasília). Celulares, smartwatches e câmeras são proibidos na cabine; "
    "armas são proibidas a 100 m da seção; vestimenta informal é permitida, trajes de banho e nudez não (Res. TSE 23.736/2024 e Lei 9.504/97). "
    "Documentos com foto aceitos: e-Título com foto, CNH (mesmo vencida), RG, passaporte, reservista e carteiras profissionais.\n"
    "- Segundo turno existe SOMENTE para Presidente e Governador, quando ninguém tem MAIS DE 50% dos votos válidos no 1º turno (CF, arts. 28 e 77). "
    "50% ou menos nunca elege no 1º turno. Senadores e Deputados são eleitos em turno único e não disputam 2º turno.\n"
    "- Se o contexto não trouxer a apuração de 2026 para o cargo ou estado, explique a regra e a data do 2º turno, sem inventar números nem vencedores."
)


def build_ask_prompt(question: str, context: str = "") -> str:
    """Prompt do /ask. O CONTEXTO é rotulado como enviado pelo aplicativo (não verificado pelo servidor)."""
    if context:
        user = (
            f"CONTEXTO (enviado pelo aplicativo, a partir do pacote de dados do TSE):\n{context}\n\n"
            f"PERGUNTA DO ELEITOR: {question}"
        )
    else:
        user = f"PERGUNTA DO ELEITOR: {question}"
    return (
        f"{IM_START}system\n{ASK_SYSTEM_PROMPT}{IM_END}\n"
        f"{IM_START}user\n{user}{IM_END}\n"
        f"{IM_START}assistant\n"
    )


def build_prompt(question: str, fmt: str = "legacy") -> str:
    """Prompt idêntico ao do treino: system + user (pergunta crua) + início do turno do assistente."""
    if fmt not in SYSTEM_PROMPTS:
        raise ValueError(f"formato desconhecido: {fmt}")
    return (
        f"{IM_START}system\n{SYSTEM_PROMPTS[fmt]}{IM_END}\n"
        f"{IM_START}user\n{question}{IM_END}\n"
        f"{IM_START}assistant\n"
    )


def build_training_text(question: str, output_json: str, fmt: str = "v2") -> str:
    """Texto completo de um exemplo de treino (prompt + alvo + <|im_end|>), no formato de train_hybrid.py."""
    return build_prompt(question, fmt) + output_json + f"{IM_END}\n"


# ---------------------------------------------------------------------------------------------------------
# Vocabulários (espelham api/_lib/vocab.js — test_nlu_core.py confere que não divergiram)
# ---------------------------------------------------------------------------------------------------------
# Contrato v2 (mesma lista e ordem de api/_lib/vocab.js; um teste confere a sincronia). O modelo publicado usa o formato
# LEGADO (LEGACY_INTENTS) e foi treinado antes das intenções SIMULADOR/AJUDA/REGRAS_VOTO/PLANO_GOVERNO/CONTAS_CAMPANHA;
# elas são resolvidas pelo NLU local dos clientes. Incluí-las no próximo retreino (backend/retrain).
INTENTS = [
    "LISTAR_CANDIDATOS", "PERFIL_CANDIDATO", "CONTAR", "PESQUISAS", "CALENDARIO", "LOCAL_VOTACAO", "REGRAS_URNA",
    "REGRAS_VOTO", "SENADO_DOIS_VOTOS", "ELEGIBILIDADE", "PLANO_GOVERNO", "CONTAS_CAMPANHA", "RESULTADOS",
    "SEGUNDO_TURNO", "PATRIMONIO", "FONTES", "SOBRE_DADOS", "SIMULADOR", "AJUDA", "RECOMENDACAO", "DESCONHECIDA",
]
LEGACY_INTENTS = [
    "NAVIGATE_MENU", "FILTER_CANDIDATES", "EXPLAIN_TOPIC", "CALENDAR_QUERY", "VOTING_LOCATION_QUERY", "CANDIDATE_LOOKUP",
]
CARGOS = [
    "PRESIDENTE", "VICE_PRESIDENTE", "GOVERNADOR", "VICE_GOVERNADOR", "SENADOR",
    "DEPUTADO_FEDERAL", "DEPUTADO_ESTADUAL", "DEPUTADO_DISTRITAL",
]
UFS = [
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI",
    "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]
HISTORICOS = ["NUNCA_ELEITO", "ELEITO_MESMO_CARGO", "ELEITO_2_OU_MAIS"]
# ids de tema usados pelo app (valores do formato v2)
TEMAS_V2 = [
    "saude", "educacao", "seguranca", "economia", "meio_ambiente", "transporte", "moradia", "agro", "cultura",
    "esporte", "tecnologia", "assistencia", "saneamento", "energia", "infraestrutura", "transparencia", "mulheres",
    "juventude", "idosos", "turismo", "pcd",
]

# Valores do formato legado observados no dataset de treino (5.192 exemplos) — a gramática os enumera.
LEGACY_ROUTES = [
    "candidates/presidente", "candidates/governador", "candidates/senador", "candidates/deputado_federal",
    "candidates/deputado_estadual", "candidates/todos", "info/regras", "info/calendario", "info/locais",
    "info/estatisticas", "info/pesquisas",
]
LEGACY_MENUS = [
    "menu_presidente", "menu_governador", "menu_senador", "menu_deputado_federal", "menu_deputado_estadual",
    "menu_regras_eleitorais", "menu_locais_votacao", "menu_calendario", "menu_home",
]
LEGACY_REGIOES = ["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"]
LEGACY_TEMAS = [
    "educação", "saúde", "segurança", "economia", "meio ambiente", "tecnologia", "transporte", "moradia", "emprego",
    "agricultura",
]

# ---------------------------------------------------------------------------------------------------------
# Gramáticas GBNF
# ---------------------------------------------------------------------------------------------------------
# Escritas só com construções básicas do GBNF (literais, classes, alternativas, grupos, `?`), sem `{m,n}`,
# para funcionar em qualquer versão do llama-cpp-python. Comprimentos limitados por aninhamento de opcionais.
# Cada regra fica em UMA linha. Acentos em UTF-8 cru (o parser de GBNF do llama.cpp decodifica UTF-8).

_NOME_CHARS = "[A-Za-z0-9 .'()°À-ÿ-]"  # letras, dígitos, espaço, . ' ( ) ° e acentuadas; "-" por último
_PARTIDO_CHARS = "[A-Za-z0-9 .À-ÿ-]"


def _lit(valor: str) -> str:
    """Literal GBNF de um valor string JSON, aspas JSON incluídas (acentos em UTF-8 cru, como o modelo os emite)."""
    corpo = valor.replace("\\", "\\\\").replace('"', '\\"')
    return '"\\"' + corpo + '\\""'


def _alt(valores) -> str:
    return " | ".join(_lit(v) for v in valores)


def _bounded(char_rule: str, minimo: int, maximo: int) -> str:
    """`char{minimo,maximo}` usando só sequência + opcionais aninhados (compatível com qualquer versão)."""
    obrigatorios = " ".join([char_rule] * minimo)
    opcionais = maximo - minimo
    if opcionais <= 0:
        return obrigatorios
    aninhado = ""
    for _ in range(opcionais):
        aninhado = f"({char_rule}{(' ' + aninhado) if aninhado else ''})?"
    return f"{obrigatorios} {aninhado}".strip()


def build_grammar_legacy() -> str:
    """Gramática do formato legado: termina logo após o objeto "filters"."""
    cargos = _alt(CARGOS)
    ufs = _alt(UFS)  # no treino o escopo nacional (BR) usa estado_uf = null
    linhas = [
        'root ::= "{\\"intent\\": " intent ", \\"target_route\\": " route ", \\"menu_id\\": " menu '
        '", \\"submenu_id\\": " submenu ", \\"filters\\": " filters "}"',
        f"intent ::= {_alt(LEGACY_INTENTS)}",
        f"route ::= {_alt(LEGACY_ROUTES)}",
        f"menu ::= {_alt(LEGACY_MENUS)}",
        'submenu ::= "null" | "\\"sub_" [a-z] [a-z] "\\""',
        'filters ::= "{\\"cargo\\": " cargo ", \\"digitos_urna\\": " digitos ", \\"estado_uf\\": " uf '
        '", \\"regiao\\": " regiao ", \\"partido\\": " partido ", \\"tema\\": " tema '
        '", \\"nome_candidato\\": " nome ", \\"apenas_ficha_limpa\\": " bool '
        '", \\"max_processos_administrativos\\": " int2 ", \\"mandatos_anteriores\\": " int1 reeleicao "}"',
        f'cargo ::= "null" | {cargos}',
        'digitos ::= "null" | [2-5]',
        f'uf ::= "null" | {ufs}',
        f'regiao ::= "null" | {_alt(LEGACY_REGIOES)}',
        f'partido ::= "null" | "\\"" {_bounded(_PARTIDO_CHARS, 2, 14)} "\\""',
        f'tema ::= "null" | {_alt(LEGACY_TEMAS)}',
        f'nome ::= "null" | "\\"" {_bounded(_NOME_CHARS, 1, 40)} "\\""',
        'bool ::= "null" | "true" | "false"',
        'int2 ::= "null" | [0-9] [0-9]?',
        'int1 ::= "null" | [0-9]',
        'reeleicao ::= (", \\"reeleicao\\": " bool)?',
    ]
    return "\n".join(linhas) + "\n"


def build_grammar_v2() -> str:
    """Gramática do formato compacto v2: só as chaves presentes, na ordem fixa do contrato."""
    linhas = [
        'root ::= "{\\"intent\\": " intent cargo? uf? partido? nome? tema? deferidas? historico? turno? "}"',
        f"intent ::= {_alt(INTENTS)}",
        f'cargo ::= ", \\"cargo\\": " ({_alt(CARGOS)})',
        f'uf ::= ", \\"uf\\": " ({_alt(UFS)})',
        f'partido ::= ", \\"partido\\": \\"" {_bounded(_PARTIDO_CHARS, 2, 14)} "\\""',
        f'nome ::= ", \\"nome\\": \\"" {_bounded(_NOME_CHARS, 3, 40)} "\\""',
        f'tema ::= ", \\"tema\\": " ({_alt(TEMAS_V2)})',
        'deferidas ::= ", \\"apenasDeferidas\\": true"',
        f'historico ::= ", \\"historico\\": " ({_alt(HISTORICOS)})',
        'turno ::= ", \\"turno\\": " ("1" | "2")',
    ]
    return "\n".join(linhas) + "\n"


_GRAMMARS = {}


def grammar_for(fmt: str) -> str:
    if fmt not in FORMATS:
        raise ValueError(f"formato desconhecido: {fmt}")
    if fmt not in _GRAMMARS:
        _GRAMMARS[fmt] = build_grammar_legacy() if fmt == "legacy" else build_grammar_v2()
    return _GRAMMARS[fmt]


# ---------------------------------------------------------------------------------------------------------
# Saída
# ---------------------------------------------------------------------------------------------------------
def parse_model_output(text):
    """Extrai o objeto JSON da saída do modelo (tolera lixo antes/depois, como o extrair_json do treino).
    Devolve dict ou None."""
    if not isinstance(text, str):
        return None
    i, j = text.find("{"), text.rfind("}")
    if i == -1 or j <= i:
        return None
    try:
        obj = json.loads(text[i : j + 1])
    except ValueError:
        return None
    return obj if isinstance(obj, dict) else None


def has_valid_shape(obj, fmt: str) -> bool:
    """Estrutura mínima esperada (usada na avaliação e como sanidade do serviço)."""
    if not isinstance(obj, dict) or not isinstance(obj.get("intent"), str):
        return False
    if fmt == "legacy":
        return obj["intent"] in LEGACY_INTENTS and isinstance(obj.get("filters"), dict)
    return obj["intent"] in INTENTS


# Ordem fixa das chaves do formato v2 (= ordem do contrato)
V2_KEYS = ["intent", "cargo", "uf", "partido", "nome", "tema", "apenasDeferidas", "historico", "turno"]


def format_output_v2(nlu: dict) -> str:
    """Serializa um alvo de treino v2: só chaves presentes e não nulas, ordem fixa, separadores padrão
    (", " e ": ") — exatamente o que a gramática v2 aceita. `apenasDeferidas` só aparece quando true."""
    out = {}
    for k in V2_KEYS:
        v = nlu.get(k)
        if v is None or (k == "apenasDeferidas" and v is not True):
            continue
        out[k] = v
    if "intent" not in out:
        raise ValueError("intent ausente")
    return json.dumps(out, ensure_ascii=False)
