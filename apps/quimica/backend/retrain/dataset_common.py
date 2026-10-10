# -*- coding: utf-8 -*-
"""
Peças comuns dos montadores de dataset de treino (build_nlu_dataset.py e build_ask_dataset.py): perguntas dos contratos (que NUNCA treinam),
remoção de duplicatas e quase duplicatas, escrita das saídas e hash dos insumos. Só biblioteca padrão.
"""
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend" / "modal"))
import ask_core as core  # noqa: E402

# Arquivos de contrato: as perguntas daqui ficam FORA do treino (ensinar a prova contamina a nota).
CONTRATOS = ("nlu_golden_cases.json", "nlu_real_cases.json", "seguranca_cases.json")
JACCARD_QUASE_IGUAL = 0.8


def perguntas_dos_contratos(pasta) -> list:
    """Texto de todas as perguntas dos arquivos de contrato que existirem em `pasta` (campos q, pergunta ou texto)."""
    saida = []
    for nome in CONTRATOS:
        p = Path(pasta) / nome
        if not p.exists():
            continue
        dados = json.loads(p.read_text(encoding="utf-8"))
        for c in (dados["cases"] if isinstance(dados, dict) else dados):
            q = c.get("q") or c.get("pergunta") or c.get("texto")
            if isinstance(q, str):
                saida.append(q)
    return saida


class FiltroDeContrato:
    """Diz se uma pergunta é igual (texto normalizado) ou quase igual (Jaccard de palavras >= 0,8) a alguma do contrato."""

    def __init__(self, perguntas):
        self.exatas = {core.normalizar_pergunta(q) for q in perguntas}
        self.conjuntos = [set(core.normalizar_pergunta(q).split()) for q in perguntas]

    def veredito(self, pergunta: str):
        """None se a pergunta pode treinar; "exata" ou "quase" se ela é (quase) igual a uma do contrato."""
        n = core.normalizar_pergunta(pergunta)
        if n in self.exatas:
            return "exata"
        ps = set(n.split())
        if ps:
            for c in self.conjuntos:
                if c and len(ps & c) / len(ps | c) >= JACCARD_QUASE_IGUAL:
                    return "quase"
        return None


def gerado_da_fixture(pasta) -> bool:
    """O dataset em `pasta` foi gerado da FIXTURE de teste (stats.json com fonteDados == "fixture")? Esse material não serve para treino."""
    p = Path(pasta)
    p = (p if p.is_dir() else p.parent) / "stats.json"
    if not p.exists():
        return False
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
    except ValueError:
        return False
    return isinstance(d, dict) and str(d.get("fonteDados") or d.get("fonte_dados") or "").lower() == "fixture"


def exigir_dados_reais(pasta, permitir_fixture: bool = False):
    if gerado_da_fixture(pasta) and not permitir_fixture:
        raise SystemExit(f"{pasta}/stats.json diz fonteDados=fixture: o dataset foi gerado de dados de TESTE e não pode treinar o modelo. "
                         "Rode o pipeline de dados (data/quimica) e regere o dataset; --permitir-fixture só para testar o fluxo.")


def sha256_arquivos(arquivos) -> dict:
    saida = {}
    for a in sorted(Path(x) for x in arquivos):
        h = hashlib.sha256()
        h.update(a.read_bytes())
        saida[a.name] = h.hexdigest()
    return saida


def escrever_saidas(destino, treino: list, holdout: list, stats: dict, meta: dict, descartados: list | None = None):
    """train.json (array, o que train_hybrid.py lê), train.jsonl, holdout.jsonl, stats.json, meta.json e descartados.jsonl (para revisão)."""
    destino = Path(destino)
    destino.mkdir(parents=True, exist_ok=True)
    (destino / "train.json").write_text(json.dumps(treino, ensure_ascii=False, indent=1), encoding="utf-8")
    for nome, itens in (("train.jsonl", treino), ("holdout.jsonl", holdout), ("descartados.jsonl", descartados or [])):
        (destino / nome).write_text("".join(json.dumps(i, ensure_ascii=False) + "\n" for i in itens), encoding="utf-8")
    (destino / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")
    (destino / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")
