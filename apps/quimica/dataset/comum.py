# -*- coding: utf-8 -*-
"""Utilitários comuns do gerador de dataset (somente biblioteca padrão).

- normalização de texto, similaridade (Jaccard), balde estável (hash);
- formatação numérica pt-BR (vírgula decimal, algarismos significativos, notação científica);
- tokenização de números de uma resposta (a mesma usada pelos testes de fidelidade numérica);
- `Resp`: construtor de respostas que REGISTRA a origem de cada número (pacote, cálculo, pergunta, definição);
- variação de superfície das perguntas (caixa, acentos, prefixos, erros de digitação só em palavras de ligação).
"""
import hashlib
import json
import random
import re
import unicodedata
from decimal import Decimal, ROUND_HALF_UP, getcontext
from fractions import Fraction
from pathlib import Path

getcontext().prec = 50

AQUI = Path(__file__).resolve().parent
REPO = AQUI.parent
FIXTURE_DIR = AQUI / "tests" / "fixtures" / "data-quimica"
PACOTE_DIR = REPO / "data" / "quimica"

MENOS = "−"  # sinal de menos tipográfico (nunca "-" em valores negativos das respostas)
SUP = str.maketrans("0123456789-+", "⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺")
SUB = str.maketrans("0123456789", "₀₁₂₃₄₅₆₇₈₉")


# ---------------------------------------------------------------------------------------------------------
# Texto
# ---------------------------------------------------------------------------------------------------------
def fold(s: str) -> str:
    """minúsculas sem acentos (µ/μ viram 'u')."""
    s = (s or "").replace("µ", "u").replace("μ", "u")
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()


def norm_question(s: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", fold(s)))


def tokens(s: str) -> frozenset:
    return frozenset(norm_question(s).split())


def jaccard(a: frozenset, b: frozenset) -> float:
    return len(a & b) / len(a | b) if (a or b) else 0.0


def stable_bucket(chave: str, seed: int, mod: int = 1000) -> int:
    return int(hashlib.sha1(f"{seed}|{chave}".encode("utf-8")).hexdigest()[:8], 16) % mod


def ler_json(caminho):
    return json.loads(Path(caminho).read_text(encoding="utf-8-sig"))


def escrever_jsonl(caminho, registros):
    Path(caminho).parent.mkdir(parents=True, exist_ok=True)
    with open(caminho, "w", encoding="utf-8", newline="\n") as f:
        for r in registros:
            f.write(json.dumps(r, ensure_ascii=False, sort_keys=False) + "\n")


def ler_jsonl(caminho):
    out = []
    with open(caminho, encoding="utf-8") as f:
        for i, linha in enumerate(f, 1):
            linha = linha.strip()
            if linha:
                try:
                    out.append(json.loads(linha))
                except json.JSONDecodeError as e:
                    raise ValueError(f"{caminho}:{i}: JSON inválido ({e})") from e
    return out


def cap(s: str) -> str:
    return s[:1].upper() + s[1:] if s else s


def lista_pt(itens, conj="e") -> str:
    itens = [str(i) for i in itens]
    if not itens:
        return ""
    if len(itens) == 1:
        return itens[0]
    return ", ".join(itens[:-1]) + f" {conj} " + itens[-1]


# ---------------------------------------------------------------------------------------------------------
# Números
# ---------------------------------------------------------------------------------------------------------
def dec(x) -> Decimal:
    """Converte para Decimal sem artefatos binários (float -> repr mais curto)."""
    if isinstance(x, Decimal):
        return x
    if isinstance(x, bool):
        raise TypeError("bool não é número")
    if isinstance(x, int):
        return Decimal(x)
    if isinstance(x, Fraction):
        return Decimal(x.numerator) / Decimal(x.denominator)
    if isinstance(x, float):
        return Decimal(repr(x))
    return Decimal(str(x))


def _agrupar(parte_int: str) -> str:
    """Agrupa milhares com ponto a partir de 5 dígitos (10.000); 4 dígitos ficam sem separador (1337)."""
    if len(parte_int) < 5:
        return parte_int
    out = []
    while parte_int:
        out.append(parte_int[-3:])
        parte_int = parte_int[:-3]
    return ".".join(reversed(out))


def _plano(d: Decimal) -> str:
    """Decimal -> texto pt-BR sem notação científica (preserva zeros à direita do expoente do Decimal)."""
    sinal = MENOS if d < 0 else ""
    s = format(abs(d), "f")
    if "." in s:
        i, f = s.split(".")
        return sinal + _agrupar(i) + "," + f
    return sinal + _agrupar(s)


def sup_expoente(e: int) -> str:
    return str(e).translate(SUP)


def _cient(d: Decimal, sig: int) -> str:
    d = arred_sig(d, sig)
    sinal = MENOS if d < 0 else ""
    d = abs(d)
    e = d.adjusted()
    m = (d.scaleb(-e)).quantize(Decimal(1).scaleb(-(sig - 1)), ROUND_HALF_UP)
    if m >= 10:
        m = (m / 10).quantize(Decimal(1).scaleb(-(sig - 1)), ROUND_HALF_UP)
        e += 1
    return f"{sinal}{format(m, 'f').replace('.', ',')} × 10{sup_expoente(e).replace('⁺', '')}"


def arred_sig(x, sig: int) -> Decimal:
    """Arredonda para `sig` algarismos significativos (meio para cima)."""
    d = dec(x)
    if d == 0:
        return Decimal(0)
    exp = d.adjusted() - sig + 1
    q = d.quantize(Decimal(1).scaleb(exp), ROUND_HALF_UP)
    if q.adjusted() != d.adjusted():  # 9,9996 -> 10,00
        exp = q.adjusted() - sig + 1
        q = d.quantize(Decimal(1).scaleb(exp), ROUND_HALF_UP)
    return q


def fmt_sig(x, sig: int = 4, cient_acima: int = 6, cient_abaixo: int = -3) -> str:
    """Formata com `sig` algarismos significativos (zeros à direita preservados), pt-BR.
    Notação científica fora de [10^cient_abaixo, 10^cient_acima)."""
    d = dec(x)
    if d == 0:
        return "0"
    if d.adjusted() >= cient_acima or d.adjusted() < cient_abaixo:
        return _cient(d, sig)
    q = arred_sig(d, sig)
    if q.as_tuple().exponent > 0:  # 12350 -> sem expoente
        q = q.quantize(Decimal(1))
    return _plano(q)


def fmt_casas(x, casas: int) -> str:
    d = dec(x).quantize(Decimal(1).scaleb(-casas), ROUND_HALF_UP)
    return _plano(d)


def fmt_pacote(v) -> str:
    """Formata um valor do pacote de forma FIEL (sem arredondar): 15.999 -> '15,999'; 6.02214076e23 -> '6,02214076 × 10²³'."""
    if isinstance(v, bool):
        raise TypeError("bool")
    if isinstance(v, int):
        return _plano(Decimal(v))
    d = dec(v)
    if d == 0:
        return "0"
    if d.adjusted() >= 6 or d.adjusted() < -4:
        sinal = MENOS if d < 0 else ""
        d = abs(d)
        e = d.adjusted()
        m = d.scaleb(-e).normalize()
        ms = format(m, "f")
        return f"{sinal}{ms.replace('.', ',')} × 10{sup_expoente(e).replace('⁺', '')}"
    return _plano(d)


def inter(x, sig: int = 5):
    """Valor INTERMEDIÁRIO de um cálculo: arredonda para `sig` algarismos significativos (sem zeros desnecessários se o valor
    já é exato) e devolve (Decimal usado nas contas seguintes, texto exibido). O que se mostra é exatamente o que se usa."""
    d = dec(x)
    if d == 0:
        return Decimal(0), "0"
    q = arred_sig(d, sig)
    if q == d:
        q = d.normalize()
    sinal = MENOS if q < 0 else ""
    a = abs(q)
    adj = a.adjusted()
    if adj >= 6 or adj < -3:
        m = a.scaleb(-adj).normalize()
        return q, f"{sinal}{format(m, 'f').replace('.', ',')} × 10{sup_expoente(adj).replace('⁺', '')}"
    if a == a.to_integral_value():
        a = a.quantize(Decimal(1))
    return q, sinal + _plano(a.normalize() if a != a.to_integral_value() else a)


fmt_plano = _plano


def fmt_ano(n) -> str:
    return str(int(n))


def potencia_sup(base: int, e: int) -> str:
    return f"{base}{sup_expoente(e)}"


def config_sup(conf: str) -> str:
    """'[He] 2s2 2p4' -> '[He] 2s² 2p⁴'."""
    return re.sub(r"([spdf])(\d+)", lambda m: m.group(1) + m.group(2).translate(SUP), conf)


def inv_config_sup(conf: str) -> str:
    inv = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹", "0123456789")
    return conf.translate(inv)


# Tokenizador de números (fonte única para gerador e testes).
# Ordem: CAS (7732-18-5) | notação científica "6,022 × 10²³" | grupos com ponto "10.000,5" | inteiro/decimal.
# Não captura dígitos colados a letras/parênteses (fórmulas H2O, Ca(OH)2, 2s2, SMILES), nem localizantes de nomes
# (2-acetil...), nem listas "2,2,4-trimetil...".
NUM_RE = re.compile(
    r"(?<![\w)\]·.,/^-])"
    r"(\d{2,7}-\d{2}-\d(?!\w)"
    r"|\d+(?:,\d+)?\s×\s10[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+"
    r"|\d{1,3}(?:\.\d{3})+(?:,\d+)?(?![\w]|,\d|-\w)"
    r"|\d+(?:,\d+)?(?![\w]|,\d|-\w))"
)


def numeros_do_texto(texto: str, ignorar=()) -> list:
    """Números (como aparecem) de uma resposta, na ordem. `ignorar`: trechos literais (SMILES, nomes IUPAC...) removidos antes."""
    t = texto
    for s in sorted({x for x in ignorar if x}, key=len, reverse=True):
        t = t.replace(s, " ")
    return [m.group(1) for m in NUM_RE.finditer(t)]


def valor_do_token(tok: str):
    """Token pt-BR -> Decimal (ou None para CAS / científico não numérico)."""
    tok = tok.strip()
    if re.fullmatch(r"\d{2,7}-\d{2}-\d", tok):
        return None
    m = re.fullmatch(r"(\d+(?:,\d+)?)\s×\s10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)", tok)
    if m:
        inv = str.maketrans("⁻⁰¹²³⁴⁵⁶⁷⁸⁹", "-0123456789")
        return Decimal(m.group(1).replace(",", ".")) * (Decimal(10) ** int(m.group(2).translate(inv)))
    t = tok
    if re.fullmatch(r"\d{1,3}(?:\.\d{3})+(?:,\d+)?", t):
        t = t.replace(".", "")
    return Decimal(t.replace(",", "."))


# ---------------------------------------------------------------------------------------------------------
# Construtor de respostas com proveniência numérica
# ---------------------------------------------------------------------------------------------------------
class RespostaInconsistente(Exception):
    pass


class Resp:
    """Registra cada número impresso na resposta com a sua origem:
       pacote:<arquivo>#<caminho>   valor lido do pacote assinado
       calculo:<tipo>               produzido por código (cálculo local testado)
       pergunta                     número dado pelo usuário na pergunta
       definicao:<nome>             definição (ex.: 0 °C = 273,15 K; 1 atm = 101325 Pa)
       passagem:<id>                valor presente no trecho licenciado (conceitos)
    """

    def __init__(self):
        self.numeros = []
        self.origem = {}
        self.ignorar = []

    def _reg(self, texto: str, origem: str) -> str:
        """Registra o número SEM sinal (o tokenizador nunca captura o sinal); devolve o texto original (com sinal)."""
        chave = texto.lstrip(MENOS + "+-")
        if chave not in self.numeros:
            self.numeros.append(chave)
        lst = self.origem.setdefault(chave, [])
        if origem not in lst:
            lst.append(origem)
        return texto

    def pkg(self, valor, caminho: str, fmt=None) -> str:
        return self._reg(fmt(valor) if fmt else fmt_pacote(valor), "pacote:" + caminho)

    def pkg_sig(self, valor, caminho: str, sig: int) -> str:
        """Valor do pacote exibido com `sig` algarismos significativos (origem marcada com @<n>sig)."""
        return self._reg(fmt_sig(valor, sig), f"pacote:{caminho}@{sig}sig")

    def pkg_casas(self, valor, caminho: str, casas: int) -> str:
        return self._reg(fmt_casas(valor, casas), f"pacote:{caminho}@{casas}casas")

    def pkg_txt(self, texto: str, caminho: str) -> str:
        """Texto do pacote que é, ele mesmo, um número/identificador (CAS, CID, ICSC, UN)."""
        return self._reg(str(texto), "pacote:" + caminho)

    def calc(self, valor, tipo: str, sig: int = 4, texto=None) -> str:
        return self._reg(texto if texto is not None else fmt_sig(valor, sig), "calculo:" + tipo)

    def calc_casas(self, valor, tipo: str, casas: int) -> str:
        return self._reg(fmt_casas(valor, casas), "calculo:" + tipo)

    def ent(self, texto) -> str:
        return self._reg(str(texto), "pergunta")

    def defin(self, texto, nome: str) -> str:
        return self._reg(str(texto), "definicao:" + nome)

    def passagem(self, texto, pid: str) -> str:
        return self._reg(str(texto), "passagem:" + pid)

    def regra(self, texto, nome: str) -> str:
        """Número que decorre de uma regra de nomenclatura/convenção (carga de íon, índice da fórmula)."""
        return self._reg(str(texto), "regra:" + nome)

    def lit(self, s: str) -> str:
        """Texto literal que pode conter dígitos sem ser número (SMILES, nome IUPAC, fórmula)."""
        self.ignorar.append(s)
        return s

    def fechar(self, texto: str) -> dict:
        """Confere que o texto só contém números registrados e que todo registrado aparece no texto."""
        achados = numeros_do_texto(texto, self.ignorar)
        extras = [a for a in achados if a not in self.numeros]
        if extras:
            raise RespostaInconsistente(f"números não registrados {extras} em: {texto!r}")
        faltam = [n for n in self.numeros if n not in achados]
        if faltam:
            raise RespostaInconsistente(f"números registrados ausentes do texto {faltam} em: {texto!r}")
        return {"numeros": list(self.numeros), "numerosOrigem": {k: list(v) for k, v in self.origem.items()}}


# ---------------------------------------------------------------------------------------------------------
# Artigos e concordância (nomes de elementos e compostos)
# ---------------------------------------------------------------------------------------------------------
ELEMENTOS_FEMININOS = {"prata", "platina"}
_PREFIXOS_MASC = ("acido", "oxido", "dioxido", "trioxido", "monoxido", "peroxido", "superoxido", "cloreto", "brometo", "iodeto",
                  "fluoreto", "sulfeto", "sulfato", "sulfito", "nitrato", "nitrito", "fosfato", "carbonato", "bicarbonato",
                  "hidroxido", "hidreto", "hipoclorito", "clorato", "perclorato", "permanganato", "dicromato", "cromato",
                  "acetato", "citrato", "oxalato", "etanol", "metanol", "propanol", "butanol", "benzeno", "tolueno", "metano",
                  "etano", "propano", "butano", "pentano", "hexano", "etileno", "acetileno", "etanal", "propeno", "eter",
                  "alcool", "sal", "gas", "oleo", "sulfonato", "cianeto", "amonio", "silicato", "aluminato", "borato")
_FEM_EXATOS = {"agua", "amonia", "acetona", "glicose", "sacarose", "frutose", "lactose", "maltose", "ureia", "aspirina", "cafeina",
               "nicotina", "morfina", "silica", "cal", "gasolina", "parafina", "vitamina", "cera", "borracha", "soda caustica",
               "agua oxigenada", "agua sanitaria", "agua regia", "amonia anidra", "penicilina", "insulina", "testosterona",
               "gelatina", "celulose", "amilose", "glicerina", "glicina", "alanina", "anilina", "piridina", "naftalina", "vaselina",
               "fenolftaleina", "quinina", "dioxina", "resina", "cocaina", "heroina", "codeina", "fosfina", "arsina", "estibina",
               "silano", "hidrazina", "hidroxilamina", "dimetilamina", "metilamina", "etilamina", "trimetilamina", "melamina",
               "creatina", "adrenalina", "dopamina", "serotonina", "melatonina", "histamina", "tiamina", "riboflavina"}
_FEM_SUFIXOS = ("ose", "ina", "eia", "ona", "ana", "ila")
_MASC_TERMINA_A = {"dia", "mapa", "planeta", "sistema", "tema", "aroma", "clima", "problema", "diploma", "cinema", "programa", "idioma", "poema", "lema", "enema"}
_MASC_EXATOS = {"tolueno", "xileno", "cloroformio", "formol", "diazepam", "paracetamol", "ibuprofeno", "etanol", "naftaleno",
                "fenol", "estireno", "etino", "propino", "ozonio", "ozonio", "argonio", "gelo", "vapor", "ar"}


def genero(nome: str, elemento: bool = False) -> str:
    """'o' | 'a' — heurística conservadora para nomes de elementos e compostos em português."""
    f = fold(nome)
    if elemento:
        return "a" if f in ELEMENTOS_FEMININOS else "o"
    if f in _MASC_EXATOS:
        return "o"
    if f in _FEM_EXATOS:
        return "a"
    primeira = f.split(" ")[0]
    if primeira in _PREFIXOS_MASC:
        return "o"
    if primeira in _MASC_EXATOS or primeira in _MASC_TERMINA_A:
        return "o"
    if primeira.endswith(("ose", "ina", "eia", "ona", "ila", "ita", "ilha", "assa", "ade", "ura", "ia", "ice")):
        return "a"
    if primeira.endswith("a"):  # nomes de substâncias terminados em "a" são femininos (água, amônia, pólvora, anilina...)
        return "a"
    return "o"


def com_artigo(nome: str, prep: str = "", elemento: bool = False, pendente: bool = False, minusculo: bool = True) -> str:
    """'do oxigênio', 'da água', 'o ferro', 'no cálcio'. Para nomes pendentes (IUPAC em inglês): 'do composto X'."""
    if pendente:
        base = f"composto {nome}"
        return {"": f"o {base}", "de": f"do {base}", "em": f"no {base}", "a": f"ao {base}", "por": f"pelo {base}"}.get(prep, f"o {base}")
    g = genero(nome, elemento)
    n = nome[:1].lower() + nome[1:] if (minusculo and not nome[:2].isupper()) else nome
    art = {"o": {"": "o", "de": "do", "em": "no", "a": "ao", "por": "pelo"}, "a": {"": "a", "de": "da", "em": "na", "a": "à", "por": "pela"}}[g][prep]
    return f"{art} {n}"


# ---------------------------------------------------------------------------------------------------------
# Variação de superfície das perguntas
# ---------------------------------------------------------------------------------------------------------
# palavras de ligação/genéricas em que erros de digitação leves são seguros (NUNCA em entidades, números ou unidades)
TYPO_OK = {
    "quantos", "quantas", "qual", "quais", "informações", "informacoes", "estrutura", "molecular", "atômico", "atomico",
    "número", "numero", "massa", "molar", "fórmula", "formula", "composto", "elemento", "símbolo", "simbolo", "ponto",
    "fusão", "fusao", "ebulição", "ebulicao", "densidade", "eletronegatividade", "configuração", "configuracao",
    "eletrônica", "eletronica", "perigoso", "perigosos", "segurança", "seguranca", "primeiros", "socorros", "armazenar",
    "armazenamento", "balanceie", "equação", "equacao", "calcule", "concentração", "concentracao", "solução", "solucao",
    "diluição", "diluicao", "explique", "significa", "desenhe", "mostre", "descoberta", "descoberto", "oxidação",
    "oxidacao", "estados", "pictogramas", "palavra", "sinal", "classes", "nomenclatura", "como", "onde", "porque",
    "sobre", "preciso", "gostaria", "favor", "diferença", "diferenca", "comparar", "compare", "maior", "menor",
    "propriedades", "volume", "pressão", "pressao", "temperatura", "converter", "converta", "quanto", "tabela", "periódica",
    "periodica", "tendência", "tendencia", "proteção", "protecao", "derramamento", "incompatível", "incompativel",
}
PREFIXOS = ["", "", "", "", "", "por favor, ", "oi, ", "me diga: ", "gostaria de saber: ", "pode me dizer ", "quero saber ",
            "ei, ", "preciso saber ", "você sabe ", "uma dúvida: ", "me ajuda: "]
# prefixos que preservam a gramática quando a frase NÃO é uma pergunta (imperativo, enunciado)
PREFIXOS_NEUTROS = ["", "", "", "", "", "por favor, ", "oi, ", "ei, ", "uma dúvida: ", "olá, "]
INICIOS_INTERROGATIVOS = {"qual", "quais", "quanto", "quantos", "quantas", "como", "onde", "quando", "quem", "que", "por", "ha", "existe", "sera", "posso", "devo"}
ARTIGOS_INICIAIS = {"o", "a", "os", "as"}
SUFIXOS = ["", "", "", "", "", " por favor", " rapidinho", " pra mim", " agora"]


def typo(rng: random.Random, palavra: str) -> str:
    base = re.sub(r"\W", "", palavra.lower())
    if base in TYPO_OK and len(base) >= 6 and rng.random() < 0.6:
        i = rng.randrange(1, len(palavra) - 2)
        return palavra[:i] + palavra[i + 1] + palavra[i] + palavra[i + 2:]
    return palavra


def finalizar(segmentos, rng: random.Random, permitir_sem_acento: bool = True, p_typo: float = 0.10,
              p_prefixo: float = 0.30, p_sufixo: float = 0.18) -> str:
    """Segmentos [(texto, protegido)] -> pergunta final. Entidades (protegidas) nunca sofrem erro nem mudança de caixa."""
    partes = []
    for texto, protegido in segmentos:
        if not protegido and rng.random() < p_typo:
            texto = " ".join(typo(rng, w) for w in texto.split(" "))
        partes.append((texto, protegido))
    minuscula = rng.random() < 0.18
    if minuscula:
        partes = [(t if p else t.lower(), p) for t, p in partes]
    palavras = fold("".join(t for t, _ in partes).strip()).split(" ") if partes else [""]
    primeira, segunda = palavras[0], (palavras[1] if len(palavras) > 1 else "")
    interrogativa = primeira in INICIOS_INTERROGATIVOS or (primeira in ARTIGOS_INICIAIS and segunda in ("que", "quanto", "quantos", "qual", "quais"))
    lista_prefixos = PREFIXOS if interrogativa else PREFIXOS_NEUTROS
    prefixo = rng.choice(lista_prefixos) if rng.random() < p_prefixo else ""
    sufixo = rng.choice(SUFIXOS) if rng.random() < p_sufixo else ""
    miolo = "".join(t for t, _ in partes)
    fim = re.search(r"[?!.\s]+$", miolo)
    pontuacao = fim.group(0).strip() if fim else ""
    miolo = miolo[:fim.start()] if fim else miolo
    if prefixo and partes and not partes[0][1]:
        miolo = miolo[:1].lower() + miolo[1:]
    corpo = prefixo + miolo + sufixo + ("" if rng.random() < 0.2 else pontuacao)
    if permitir_sem_acento and rng.random() < 0.07 and not re.search(r"\b[A-Z][A-Za-z0-9()]*[A-Z0-9][A-Za-z0-9()]*\b", corpo):
        corpo = unicodedata.normalize("NFD", corpo).encode("ascii", "ignore").decode()
    corpo = re.sub(r"\s+", " ", corpo).strip()
    primeiro_e_livre = bool(prefixo) or (bool(partes) and not partes[0][1])
    if primeiro_e_livre and not minuscula and rng.random() < 0.85:
        corpo = corpo[:1].upper() + corpo[1:]
    return corpo


PLACEHOLDER = re.compile(r"\{(\w+)\}")


def renderizar(template: str, valores: dict, rng: random.Random, permitir_sem_acento: bool = False, **kw) -> str:
    """Substitui {chave} por `valores[chave]` (str, protegida) e aplica a variação de superfície ao resto."""
    segs, pos = [], 0
    for m in PLACEHOLDER.finditer(template):
        if m.start() > pos:
            segs.append((template[pos:m.start()], False))
        segs.append((str(valores[m.group(1)]), True))
        pos = m.end()
    if pos < len(template):
        segs.append((template[pos:], False))
    return finalizar(segs, rng, permitir_sem_acento=permitir_sem_acento, **kw)


def superficie_nome(rng: random.Random, nome: str, pesos=(0.55, 0.20, 0.05, 0.20)) -> str:
    """Variações de caixa/acento de um NOME (canônico, com acentos): minúsculo | Capitalizado | MAIÚSCULO | sem acento."""
    r = rng.random()
    a, b, c, _ = pesos
    if r < a:
        return nome[:1].lower() + nome[1:] if not nome[:2].isupper() else nome
    if r < a + b:
        return nome[:1].upper() + nome[1:]
    if r < a + b + c:
        return nome.upper()
    return fold(nome)


def sorteio(rng: random.Random, itens, k=None):
    return rng.choice(itens) if k is None else rng.sample(itens, min(k, len(itens)))
