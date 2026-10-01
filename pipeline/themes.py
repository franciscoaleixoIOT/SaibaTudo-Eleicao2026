# -*- coding: utf-8 -*-
"""
Detecção AUTOMÁTICA de temas citados em planos de governo (PDFs oficiais do TSE).

Método (documentado no app, em "Sobre os dados"): contagem de menções a palavras-chave
no texto integral do plano registrado. Um tema é associado ao candidato quando há pelo menos
MIN_MENCOES menções; são mantidos os MAX_TEMAS de maior densidade (menções por mil palavras). Isto é uma indicação de CONTEÚDO CITADO, não uma avaliação do plano
nem uma promessa/posicionamento do candidato.
"""
import re

from common import norm

VERSAO = 2          # incrementar ao alterar regras (invalida o cache de planos)
MIN_MENCOES = 8     # mínimo absoluto de menções para considerar um tema
MAX_TEMAS = 4       # no máximo N temas por candidato, ordenados por densidade de menções

TEMAS = {
    "saude": ("Saúde", r"\bsaude\b|\bsus\b|hospita|atencao basica|vacina|ubs\b"),
    "educacao": ("Educação", r"educacao|escola|ensino|professor|creche|alfabetiza"),
    "seguranca": ("Segurança pública", r"seguranca publica|policia|criminalidade|violencia urbana|crime organizado"),
    "economia": ("Economia e emprego", r"emprego|desemprego|empreendedor|economia|inflacao|salario|renda"),
    "meio_ambiente": ("Meio ambiente", r"meio ambiente|sustentabilidade|desmatamento|mudanca climatica|ambiental|preservacao"),
    "transporte": ("Transporte e mobilidade", r"transporte|mobilidade|rodovia|ferrovia|metro\b|onibus"),
    "moradia": ("Moradia", r"moradia|habitacao|casa propria|minha casa"),
    "agro": ("Agropecuária", r"agropecuaria|agricultura|agronegocio|produtor rural|agricultor"),
    "cultura": ("Cultura", r"\bcultura\b|cultural|patrimonio historico|artista"),
    "esporte": ("Esporte", r"esporte|atleta|olimpic"),
    "tecnologia": ("Ciência e tecnologia", r"tecnologia|inovacao|transformacao digital|inteligencia artificial|ciencia"),
    "assistencia": ("Assistência social", r"assistencia social|bolsa familia|vulnerabilidade|pobreza|inseguranca alimentar|fome"),
    "saneamento": ("Saneamento", r"saneamento|agua tratada|esgoto"),
    "energia": ("Energia", r"energia|petroleo|renovavel|eletrica"),
    "infraestrutura": ("Infraestrutura", r"infraestrutura|logistica|portos|obras publicas"),
    "transparencia": ("Transparência e combate à corrupção", r"transparencia|corrupcao|integridade|controle social"),
    "mulheres": ("Mulheres", r"\bmulher|\bmulheres|igualdade de genero|violencia domestica"),
    "juventude": ("Juventude", r"juventude|jovens"),
    "idosos": ("Pessoa idosa", r"\bidosos?\b|terceira idade|envelhecimento"),
    "pcd": ("Pessoas com deficiência", r"pessoa com deficiencia|pessoas com deficiencia|acessibilidade|inclusao"),
    "turismo": ("Turismo", r"turismo|turistic"),
}

_COMPILED = {k: re.compile(p) for k, (_, p) in TEMAS.items()}


def detectar_temas(texto: str):
    """Retorna ids de temas ordenados por densidade de menções (>= MIN_MENCOES menções absolutas)."""
    t = norm(texto)
    if not t:
        return []
    palavras = max(1, len(t.split()))
    cont = []
    for key, rx in _COMPILED.items():
        n = len(rx.findall(t))
        if n >= MIN_MENCOES:
            cont.append((n / palavras, key))
    cont.sort(reverse=True)
    return [k for _, k in cont[:MAX_TEMAS]]


def rotulos():
    return {k: v[0] for k, v in TEMAS.items()}
