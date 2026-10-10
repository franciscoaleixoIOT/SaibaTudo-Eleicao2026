# -*- coding: utf-8 -*-
"""Ajudantes dos testes: gera (uma vez) o dataset em memória a partir do pacote real (se existir) ou da fixture."""
import os
import sys
from pathlib import Path

DATASET = Path(__file__).resolve().parent.parent
if str(DATASET) not in sys.path:
    sys.path.insert(0, str(DATASET))

import gerar_nlu  # noqa: E402
import gerar_qa  # noqa: E402
from comum import FIXTURE_DIR, PACOTE_DIR, REPO  # noqa: E402
from pacote import Pacote, localizar  # noqa: E402

_cache = {}


def pacote() -> Pacote:
    if "pac" not in _cache:
        modo = os.environ.get("DATASET_TESTE_PACOTE", "auto")
        if modo == "fixture":
            _cache["pac"] = Pacote(FIXTURE_DIR)
        elif modo == "real":
            _cache["pac"] = Pacote(PACOTE_DIR)
        elif Path(modo).is_dir():  # caminho de um pacote (ex.: pacote parcial de ensaio)
            _cache["pac"] = Pacote(Path(modo))
        else:
            _cache["pac"] = localizar()
    return _cache["pac"]


def qa():
    """Contexto com todos os registros QA (gerado uma vez por execução dos testes)."""
    if "qa" not in _cache:
        _cache["qa"] = gerar_qa.gerar(pacote(), seed=2026)
    return _cache["qa"]


def registros():
    return [{k: v for k, v in r.items() if k != "_familia"} for r in qa().registros]


def nlu():
    if "nlu" not in _cache:
        amostras, g = gerar_nlu.gerar(pacote(), 2026, 1.0)
        golden = [REPO / "contracts" / "nlu_golden_cases.json", REPO / "contracts" / "seguranca_cases.json"]
        mantidas, desc = gerar_nlu.remover_casos_de_teste(amostras, golden)
        _cache["nlu"] = (mantidas, desc, g)
    return _cache["nlu"]
