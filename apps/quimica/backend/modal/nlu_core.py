# -*- coding: utf-8 -*-
"""
Núcleo PURO do NLU em nuvem do SaibaTudo Química (sem Modal, sem llama.cpp, só biblioteca padrão).

Concentra o que precisa ser idêntico entre treino, serviço e avaliação:
  - o prompt (ChatML do Qwen2.5) e a instrução de sistema;
  - a gramática GBNF que garante JSON válido, curto e SÓ com as chaves do contrato;
  - a limpeza/validação da pergunta, o parsing e a validação de forma da saída;
  - o formato do alvo de treino (format_output) e o texto completo de um exemplo (build_training_text).

Contrato de saída (docs/DATA_CONTRACT.md §8), só as chaves presentes, na ordem fixa:
  {"intent": "MASSA_MOLAR", "composto": "H2SO4"}
  {"intent": "CONCENTRACAO", "composto": "NaCl", "quantidades": [{"valor": 5, "unidade": "g"}, {"valor": 250, "unidade": "mL"}]}
  {"intent": "BALANCEAR", "equacao": "H2 + O2 -> H2O"}
  {"intent": "CONVERSAO_UNIDADE", "quantidades": [{"valor": 25, "unidade": "°C"}], "unidadeDestino": "K"}

A normalização e a ANCORAGEM de cada entidade no texto da pergunta são feitas no proxy (api/_lib/normalize.js e ground.js); este módulo
devolve o JSON bruto. Os vocabulários abaixo espelham api/_lib/vocab.js: test_nlu_core.py confere que não divergiram.
"""
import json
import re

# ---------------------------------------------------------------------------------------------------------
# Limites
# ---------------------------------------------------------------------------------------------------------
MAX_QUESTION_CHARS = 300
MIN_QUESTION_CHARS = 1  # o proxy exige >= 3; aqui só se recusa o vazio

# Pior caso do alvo: intent + elemento + composto (60 car.) + 4 quantidades + equação (80 car.) + nível + unidadeDestino ≈ 170 tokens.
# O típico tem 10 a 40. Se a gramática não terminar dentro do limite o JSON fica truncado e o proxy responde 502.
MAX_NEW_TOKENS = 256

FORMAT_VERSION = "v1"

# ---------------------------------------------------------------------------------------------------------
# Prompt (ChatML do Qwen2.5; o MESMO usado no treino por ai_model/scripts/train_hybrid.py e na avaliação)
# ---------------------------------------------------------------------------------------------------------
SYSTEM_PROMPT = (
    "Você interpreta perguntas de química para o SaibaTudo Química. "
    "Converta a pergunta em JSON compacto com a intenção e somente as entidades citadas na pergunta "
    "(elemento, composto, propriedade, quantidades, equacao, nivel, unidadeDestino). "
    "Não responda a pergunta, não calcule e não invente dados."
)

IM_START = "<|im_start|>"
IM_END = "<|im_end|>"
STOP_TOKENS = [IM_END, "<|endoftext|>"]

_CONTROLES = re.compile(
    "[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]"
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


def build_prompt(question: str) -> str:
    """Prompt idêntico ao do treino: system + user (pergunta crua) + início do turno do assistente."""
    return (
        f"{IM_START}system\n{SYSTEM_PROMPT}{IM_END}\n"
        f"{IM_START}user\n{question}{IM_END}\n"
        f"{IM_START}assistant\n"
    )


def build_training_text(question: str, output_json: str) -> str:
    """Texto completo de um exemplo de treino (prompt + alvo + <|im_end|>), no formato de train_hybrid.py."""
    return build_prompt(question) + output_json + f"{IM_END}\n"


# ---------------------------------------------------------------------------------------------------------
# Vocabulários (espelham api/_lib/vocab.js — test_nlu_core.py confere que não divergiram)
# ---------------------------------------------------------------------------------------------------------
INTENTS = [
    "ELEMENTO", "COMPOSTO", "PROPRIEDADE", "MASSA_MOLAR", "BALANCEAR", "ESTEQUIOMETRIA", "CONCENTRACAO", "PH", "GAS_IDEAL",
    "CONVERSAO_UNIDADE", "NOMENCLATURA", "DESENHAR", "COMPARAR", "TABELA_PERIODICA", "SEGURANCA", "CONCEITO", "RECUSA_PERIGO",
    "SOBRE_DADOS", "FONTES", "AJUDA", "DESCONHECIDA",
]
NIVEIS = ["fundamental", "medio", "superior"]
SIMBOLOS = [
    "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca",
    "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr",
    "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd",
    "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg",
    "Tl", "Pb", "Bi", "Po", "At", "Rn", "Fr", "Ra", "Ac", "Th", "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm",
    "Md", "No", "Lr", "Rf", "Db", "Sg", "Bh", "Hs", "Mt", "Ds", "Rg", "Cn", "Nh", "Fl", "Mc", "Lv", "Ts", "Og",
]
PROPRIEDADES = [
    "massaAtomica", "massaMolar", "massaExata", "numeroAtomico", "grupo", "periodo", "bloco", "categoria", "configuracaoEletronica",
    "eletronegatividade", "raioAtomicoPm", "afinidadeEletronicaKJmol", "energiaIonizacaoKJmol", "pontoFusaoK", "pontoEbulicaoK",
    "densidadeKgm3", "estadoPadrao", "estadosOxidacao", "descoberta", "formula", "smiles", "cas", "xlogp", "tpsa", "doadoresH",
    "aceptoresH", "ligacoesRotaveis", "carga", "pka", "solubilidade",
]
# Id que o CLIENTE usa (regras.propriedades do app e contracts/nlu_golden_cases.json) quando difere do id do modelo (nome do campo do pacote,
# com unidade). O modelo é treinado com o id do campo; o proxy (api/_lib/normalize.js) devolve o id do cliente. Espelha PROPRIEDADE_CLIENTE do vocab.js.
PROPRIEDADE_CLIENTE = {
    "pontoFusaoK": "pontoFusao", "pontoEbulicaoK": "pontoEbulicao", "densidadeKgm3": "densidade", "raioAtomicoPm": "raioAtomico",
    "energiaIonizacaoKJmol": "energiaIonizacao", "afinidadeEletronicaKJmol": "afinidadeEletronica",
}


def propriedade_do_modelo(pid):
    """Id de propriedade no vocabulário do modelo, aceitando também o id do cliente (pontoFusao -> pontoFusaoK). None se desconhecido."""
    if not isinstance(pid, str):
        return None
    inverso = {cliente.lower(): modelo for modelo, cliente in PROPRIEDADE_CLIENTE.items()}
    for cand in PROPRIEDADES:
        if cand.lower() == pid.lower():
            return cand
    return inverso.get(pid.lower())


UNIDADES = [
    "g", "mg", "kg", "u", "mol", "mmol", "L", "mL", "dm3", "m3", "cm3",
    "mol/L", "mmol/L", "g/L", "mg/L", "g/mL", "g/cm3", "kg/m3", "g/mol", "kJ/mol", "kcal/mol",
    "%", "ppm", "K", "°C", "°F", "atm", "Pa", "kPa", "bar", "mmHg", "torr",
    "J", "kJ", "cal", "kcal", "eV", "m", "cm", "mm", "nm", "pm", "Å", "s", "min", "h",
]

MAX_QUANTIDADES = 4  # a gramática desenrola 4; o proxy aceita até 6, mas o modelo nunca precisou de mais de 4

# ---------------------------------------------------------------------------------------------------------
# Gramática GBNF
# ---------------------------------------------------------------------------------------------------------
# Escrita só com construções básicas do GBNF (literais, classes, alternativas, grupos, `?`), sem `{m,n}` e sem recursão, para funcionar
# em qualquer versão do llama-cpp-python. Comprimentos limitados por aninhamento de opcionais. Cada regra fica em UMA linha. Acentos em
# UTF-8 cru. `"` e `\` ficam FORA das classes de caracteres de texto: o JSON gerado nunca precisa de escape.

_SUB = "₀-₉"  # subscritos Unicode (H₂O) — contíguos em U+2080..U+2089
_COMPOSTO_CHARS = f"[A-Za-z0-9 ,.'()+À-ÿ·{_SUB}-]"  # letras, dígitos, espaço, , . ' ( ) + e acentuadas; "-" por último
_EQUACAO_CHARS = f"[A-Za-z0-9 +=<>()._/,^·→⇌↔⇄⟶{_SUB}-]"


def _lit(valor: str) -> str:
    """Literal GBNF de um valor string JSON, aspas JSON incluídas."""
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


def build_grammar() -> str:
    """Gramática do formato v1: só as chaves presentes, na ordem fixa do contrato."""
    # quantidades: 1 a MAX_QUANTIDADES itens, desenrolados (sem recursão)
    resto = ""
    for _ in range(MAX_QUANTIDADES - 1):
        resto = f'(", " quant{(" " + resto) if resto else ""})?'
    linhas = [
        'root ::= "{\\"intent\\": " intent elemento? composto? propriedade? quantidades? equacao? nivel? destino? "}"',
        f"intent ::= {_alt(INTENTS)}",
        f'elemento ::= ", \\"elemento\\": " ({_alt(SIMBOLOS)})',
        f'composto ::= ", \\"composto\\": \\"" {_bounded(_COMPOSTO_CHARS, 2, 60)} "\\""',
        f'propriedade ::= ", \\"propriedade\\": " ({_alt(PROPRIEDADES)})',
        f'quantidades ::= ", \\"quantidades\\": [" quant {resto} "]"',
        'quant ::= "{\\"valor\\": " numero ", \\"unidade\\": " unidade "}"',
        f"numero ::= \"-\"? {_bounded('[0-9]', 1, 9)} (\".\" {_bounded('[0-9]', 1, 9)})? ((\"e\" | \"E\") (\"-\" | \"+\")? [0-9] [0-9]? [0-9]?)?",
        f"unidade ::= {_alt(UNIDADES)}",
        f'equacao ::= ", \\"equacao\\": \\"" {_bounded(_EQUACAO_CHARS, 3, 80)} "\\""',
        f'nivel ::= ", \\"nivel\\": " ({_alt(NIVEIS)})',
        'destino ::= ", \\"unidadeDestino\\": " unidade',
    ]
    return "\n".join(linhas) + "\n"


_GRAMMAR = None


def grammar() -> str:
    global _GRAMMAR
    if _GRAMMAR is None:
        _GRAMMAR = build_grammar()
    return _GRAMMAR


# ---------------------------------------------------------------------------------------------------------
# Saída
# ---------------------------------------------------------------------------------------------------------
def parse_model_output(text):
    """Extrai o objeto JSON da saída do modelo (tolera lixo antes/depois, como o extrair_json do treino). Devolve dict ou None."""
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


# Ordem fixa das chaves (= ordem do contrato e da gramática)
KEYS = ["intent", "elemento", "composto", "propriedade", "quantidades", "equacao", "nivel", "unidadeDestino"]


def has_valid_shape(obj) -> bool:
    """Forma esperada: intent do vocabulário, só chaves do contrato, entidades do vocabulário fechado, quantidades bem formadas."""
    if not isinstance(obj, dict) or obj.get("intent") not in INTENTS:
        return False
    if any(k not in KEYS for k in obj):
        return False
    if "elemento" in obj and obj["elemento"] not in SIMBOLOS:
        return False
    if "propriedade" in obj and obj["propriedade"] not in PROPRIEDADES:
        return False
    if "nivel" in obj and obj["nivel"] not in NIVEIS:
        return False
    if "unidadeDestino" in obj and obj["unidadeDestino"] not in UNIDADES:
        return False
    for k in ("composto", "equacao"):
        if k in obj and not (isinstance(obj[k], str) and obj[k].strip()):
            return False
    if "quantidades" in obj:
        q = obj["quantidades"]
        if not (isinstance(q, list) and 1 <= len(q) <= MAX_QUANTIDADES):
            return False
        for item in q:
            if not (isinstance(item, dict) and set(item) == {"valor", "unidade"} and item["unidade"] in UNIDADES):
                return False
            if isinstance(item["valor"], bool) or not isinstance(item["valor"], (int, float)):
                return False
    return True


def format_number(valor) -> str:
    """Número no formato que a gramática aceita: inteiro sem ".0"; senão a repr mais curta do float."""
    if isinstance(valor, bool) or not isinstance(valor, (int, float)):
        raise ValueError("valor deve ser numérico")
    f = float(valor)
    if f != f or f in (float("inf"), float("-inf")):
        raise ValueError("valor deve ser finito")
    if f == int(f) and abs(f) < 1e15:
        return str(int(f))
    return repr(f)


def format_output(nlu: dict) -> str:
    """Serializa um alvo de treino: só chaves presentes e não vazias, ordem fixa, separadores padrão (", " e ": ") — exatamente o que a
    gramática aceita. `quantidades` vira [{"valor": n, "unidade": "u"}]; valores nulos são omitidos."""
    partes = []
    for k in KEYS:
        v = nlu.get(k)
        if v is None or v == "" or v == []:
            continue
        if k == "quantidades":
            itens = [f'{{"valor": {format_number(x["valor"])}, "unidade": {json.dumps(x["unidade"], ensure_ascii=False)}}}' for x in v]
            partes.append(f'"quantidades": [{", ".join(itens)}]')
        else:
            partes.append(f"{json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}")
    if not partes or not partes[0].startswith('"intent"'):
        raise ValueError("intent ausente")
    return "{" + ", ".join(partes) + "}"
