# -*- coding: utf-8 -*-
"""
Separação ESTÁVEL entre HOLDOUT (só mede) e TREINO (só ensina) para perguntas reais de usuários.

Regra: o balde de uma pergunta é sha256(pergunta normalizada) % 100, sem semente e sem estado. Isso garante que
  - a MESMA pergunta cai SEMPRE do mesmo lado, em qualquer build, máquina ou linguagem (há um gêmeo em holdout.mjs);
  - perguntas de holdout nunca vão para o treino, e portanto o modelo nunca é medido naquilo que aprendeu;
  - a separação vale ANTES de qualquer revisão humana: uma pergunta externa no balde de holdout é simplesmente
    excluída do treino (e, quando revisada, entra em contracts/nlu_real_cases.json).

Normalização: a mesma de build_nlu_dataset.norm_question e label_extra.mjs::chaveQ (só palavras alfanuméricas,
sem acento, minúsculas), para que "Quem é o favorito?" e "quem e o favorito" caiam no mesmo balde.
"""
import hashlib
import re
import unicodedata

HOLDOUT_PCT = 20  # fatia (em %) das perguntas reais reservada à medição


def chave_q(q: str) -> str:
    sem_acento = unicodedata.normalize("NFD", str(q)).encode("ascii", "ignore").decode().lower()
    return " ".join(re.findall(r"[a-z0-9]+", sem_acento))


def holdout_bucket(q: str) -> int:
    """Balde 0..99, determinístico."""
    return int(hashlib.sha256(chave_q(q).encode("utf-8")).hexdigest()[:8], 16) % 100


def eh_holdout(q: str, pct: float = HOLDOUT_PCT) -> bool:
    return holdout_bucket(q) < pct
