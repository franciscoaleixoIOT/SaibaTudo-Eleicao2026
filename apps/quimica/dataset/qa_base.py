# -*- coding: utf-8 -*-
"""Base comum das famílias de perguntas e respostas (contexto, registro, superfícies de entidades)."""
import random
from collections import Counter

from comum import (Resp, RespostaInconsistente, cap, com_artigo, fold, genero, norm_question, renderizar, superficie_nome)
from pacote import Pacote, fontes_do_registro

# Fontes internas (não vêm do pacote). Nomes e licenças conferidos pelos testes.
FONTE_AUTORIA = {"nome": "Autoria própria (SaibaTudo Química)", "licenca": "CC BY 4.0"}
FONTE_RECUSA = {"nome": "Política de segurança do SaibaTudo Química", "licenca": "CC BY 4.0"}
FONTE_CLP = {"nome": "Regulamento CLP (CE) n.º 1272/2008, Anexo III (EUR-Lex)", "licenca": "CC BY 4.0"}
FONTE_UNECE = FONTE_CLP  # compatibilidade: as frases H vêm do CLP (EUR-Lex), com redação adaptada ao português do Brasil
FONTE_DEFINICOES = {"nome": "Definições do SI e convenções (autoria própria)", "licenca": "CC BY 4.0"}


class Ctx:
    def __init__(self, pac: Pacote, seed: int = 2026, variantes: int = 2):
        self.pac = pac
        self.seed = seed
        self.rng = random.Random(seed)
        self.variantes = variantes
        self.stats = Counter()
        self.avisos = []
        self.registros = []
        self._ids = set()
        self._perguntas = {}

    # -- registro ------------------------------------------------------------------------------------------
    def add(self, rid, pergunta, resposta, r: Resp, tipo, nivel, entidades, fontes, gerado_por, familia, extra=None):
        """Valida e guarda um par. Devolve True se entrou (False: duplicado)."""
        extra = extra or {}
        nq = norm_question(pergunta)
        if not nq or not resposta.strip():
            return False
        if rid in self._ids:
            raise ValueError(f"id repetido: {rid}")
        if nq in self._perguntas:
            if self._perguntas[nq] != resposta:
                self.stats["perguntas_repetidas_com_respostas_diferentes"] += 1
                self.avisos.append(f"pergunta repetida com resposta diferente: {pergunta!r} ({rid})")
            self.stats["duplicadas_descartadas"] += 1
            return False
        try:
            fechado = r.fechar(resposta)
        except RespostaInconsistente as e:
            self.stats["descartados_fidelidade"] += 1
            if len(self.avisos) < 400:
                self.avisos.append(f"descartado por fidelidade numérica ({rid}): {e}")
            return False
        self._ids.add(rid)
        self._perguntas[nq] = resposta
        reg = {
            "id": rid, "pergunta": pergunta, "resposta": resposta, "tipo": tipo, "nivel": nivel, "entidades": entidades,
            "numeros": fechado["numeros"], "numerosOrigem": fechado["numerosOrigem"], "fontes": fontes,
            "geradoPor": gerado_por, "revisadoPor": None,
        }
        reg.update(extra)
        reg["_familia"] = familia
        self.registros.append(reg)
        self.stats[f"{familia}"] += 1
        self.stats[f"tipo:{tipo}"] += 1
        return True

    def por_familia(self, familia):
        return [{k: v for k, v in r.items() if k != "_familia"} for r in self.registros if r["_familia"] == familia]


# ---------------------------------------------------------------------------------------------------------
# Superfícies de entidades
# ---------------------------------------------------------------------------------------------------------
_PREP_SEM_ARTIGO = {"": "", "de": "de", "em": "em", "a": "a", "por": "por"}


def sup_elemento(ctx: Ctx, e, prep: str = "de", permitir_simbolo: bool = True) -> str:
    """Forma escrita de um elemento na pergunta, com a preposição: 'do oxigênio', 'de O', 'do elemento Fe'."""
    rng = ctx.rng
    nome, simb = e["nome"], e["simbolo"]
    r = rng.random()
    if permitir_simbolo and r < 0.14:
        if prep == "":
            return f"o elemento {simb}"
        art = {"de": "do", "em": "no", "a": "ao", "por": "pelo"}[prep]
        return rng.choice([f"{art} elemento {simb}", f"{_PREP_SEM_ARTIGO[prep]} {simb}"])
    g = genero(nome, elemento=True)
    art = {"o": {"": "o", "de": "do", "em": "no", "a": "ao", "por": "pelo"},
           "a": {"": "a", "de": "da", "em": "na", "a": "à", "por": "pela"}}[g][prep]
    return f"{art} {superficie_nome(rng, nome)}"


def sup_composto(ctx: Ctx, c, prep: str = "de", permitir_formula: bool = True, permitir_popular: bool = True):
    """Forma escrita de um composto na pergunta. Devolve (texto, tipo_de_superficie)."""
    pac, rng = ctx.pac, ctx.rng
    nome = pac.nome_composto(c)
    pendente = pac.comp_pendente(c)
    formula = pac.formula_exibicao(c)
    r = rng.random()
    if permitir_formula and formula and r < 0.12:
        art = {"": "", "de": "de", "em": "em", "a": "a", "por": "por"}[prep]
        return (f"{art} {formula}".strip(), "formula")
    popular = c.get("nomePopular")
    if permitir_popular and popular and not pendente and r < 0.30:
        return (_com_art_nome(popular, prep, rng), "popular")
    if pendente:
        return (com_artigo(nome, prep, pendente=True), "iupac")
    return (_com_art_nome(nome, prep, rng), "nome")


def _com_art_nome(nome: str, prep: str, rng) -> str:
    g = genero(nome)
    art = {"o": {"": "o", "de": "do", "em": "no", "a": "ao", "por": "pelo"},
           "a": {"": "a", "de": "da", "em": "na", "a": "à", "por": "pela"}}[g][prep]
    return f"{art} {superficie_nome(rng, nome)}"


def nome_em_frase(nome: str) -> str:
    """Nome para uso no meio da frase (minúscula inicial, exceto siglas)."""
    return nome[:1].lower() + nome[1:] if not nome[:2].isupper() else nome


def ctx_nome_resp(pac, c, prep=""):
    """Nome com artigo para a RESPOSTA ('a água', 'do ácido sulfúrico', 'do composto X')."""
    nome = pac.nome_composto(c)
    return com_artigo(nome, prep, pendente=pac.comp_pendente(c))


def perguntas_distintas(ctx: Ctx, modelos, n: int):
    """Até n modelos distintos (sem repetição) sorteados com a semente do contexto."""
    modelos = list(modelos)
    ctx.rng.shuffle(modelos)
    return modelos[:n]


def sup_composto_sem_artigo(ctx: Ctx, c, permitir_formula: bool = True, permitir_popular: bool = False) -> str:
    """Forma escrita SEM artigo, para frases como '20 g de ___': 'água', 'ácido sulfúrico', 'NaCl', 'composto X' (IUPAC pendente)."""
    pac, rng = ctx.pac, ctx.rng
    nome = pac.nome_composto(c)
    formula = pac.formula_exibicao(c)
    r = rng.random()
    if permitir_formula and formula and r < 0.25:
        return formula
    popular = c.get("nomePopular")
    if permitir_popular and popular and not pac.comp_pendente(c) and r < 0.45:
        return superficie_nome(rng, popular, (0.7, 0.2, 0.0, 0.1))
    if pac.comp_pendente(c):
        return f"composto {nome}"
    return superficie_nome(rng, nome, (0.7, 0.2, 0.0, 0.1))
