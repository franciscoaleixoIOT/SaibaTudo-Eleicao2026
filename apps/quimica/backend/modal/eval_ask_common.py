# -*- coding: utf-8 -*-
"""
Peças comuns dos gates do EXPLICADOR (eval_seguranca.py e eval_fidelidade.py): geradores sobre um GGUF local (llama-cpp-python) ou sobre
um endpoint HTTP, e leitura do dataset (jsonl) com os trechos licenciados de data/quimica/textos.

Um gerador é uma função `gen(pergunta, contexto, trechos) -> texto da resposta`, com o MESMO prompt do treino (ask_core.build_ask_prompt).
"""
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

import ask_core as core

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_QA = REPO_ROOT / "dataset" / "qa"
DEFAULT_TEXTOS = REPO_ROOT / "data" / "quimica" / "textos"
DEFAULT_SEGURANCA = REPO_ROOT / "contracts" / "seguranca_cases.json"


# ---------------------------------------------------------------------------------------------------------
# Geradores
# ---------------------------------------------------------------------------------------------------------
def llama_ask_generator(gguf_path: str, n_threads: int = 4, n_ctx: int = 4096, n_gpu_layers: int = 0, llm=None, temperature: float = 0.0):
    """Gerador sobre o GGUF do explicador (requer llama-cpp-python). Decodificação gulosa: o gate tem de ser reproduzível."""
    from llama_cpp import Llama  # import tardio: este módulo roda sem llama-cpp para --endpoint

    if llm is None:
        llm = Llama(model_path=gguf_path, n_ctx=n_ctx, n_threads=n_threads, n_gpu_layers=n_gpu_layers, verbose=False)

    def gen(pergunta: str, contexto: str = "", trechos=()) -> str:
        p = core.validate_question(pergunta)
        c = core.validate_context(contexto)
        t = core.validate_trechos(list(trechos))
        out = llm.create_completion(
            prompt=core.build_ask_prompt(p, c, t), temperature=temperature, repeat_penalty=1.05, stop=core.STOP_TOKENS,
            max_tokens=core.MAX_NEW_TOKENS,
        )
        return out["choices"][0]["text"].strip()

    gen.llm = llm
    return gen


def http_ask_generator(endpoint: str, key: str = "", secret: str = "", timeout: float = 120.0):
    """Gerador sobre o endpoint do explicador no Modal: POST {question, context, trechos} -> {ok, answer}."""

    def gen(pergunta: str, contexto: str = "", trechos=()) -> str:
        cab = {"Content-Type": "application/json"}
        if key:
            cab.update({"Modal-Key": key, "Modal-Secret": secret})
        req = urllib.request.Request(
            endpoint, method="POST", headers=cab,
            data=json.dumps({"question": pergunta, "context": contexto, "trechos": list(trechos)}).encode("utf-8"),
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                dados = json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"HTTP {e.code}") from None
        if not dados.get("ok") or not isinstance(dados.get("answer"), str):
            raise RuntimeError("ok=false")
        return dados["answer"].strip()

    return gen


def credenciais_do_ambiente():
    return os.environ.get("MODAL_KEY", ""), os.environ.get("MODAL_SECRET", "")


# ---------------------------------------------------------------------------------------------------------
# Dataset
# ---------------------------------------------------------------------------------------------------------
def ler_jsonl(caminhos) -> list:
    """Lê um ou mais arquivos .jsonl (ou uma pasta com *.jsonl). Linhas vazias e inválidas são ignoradas."""
    arquivos = []
    for c in ([caminhos] if isinstance(caminhos, (str, Path)) else list(caminhos)):
        p = Path(c)
        arquivos += sorted(p.glob("*.jsonl")) if p.is_dir() else [p]
    registros = []
    for arq in arquivos:
        for linha in Path(arq).read_text(encoding="utf-8").splitlines():
            linha = linha.strip()
            if not linha:
                continue
            try:
                r = json.loads(linha)
            except ValueError:
                continue
            if isinstance(r, dict):
                registros.append(r)
    return registros


def indexar_textos(pasta=DEFAULT_TEXTOS) -> dict:
    """{id: texto} de data/quimica/textos/**/*.json (docs/DATA_CONTRACT.md §5). Prefere a tradução (textoPt) ao original."""
    indice = {}
    pasta = Path(pasta)
    if not pasta.exists():
        return indice
    for arq in sorted(pasta.rglob("*.json")):
        try:
            d = json.loads(arq.read_text(encoding="utf-8"))
        except ValueError:
            continue
        itens = d if isinstance(d, list) else [d]
        for t in itens:
            if isinstance(t, dict) and isinstance(t.get("id"), str):
                texto = t.get("textoPt") or t.get("textoOriginal") or t.get("texto")
                if isinstance(texto, str) and texto.strip():
                    indice[t["id"]] = texto
    return indice


def trechos_do_registro(rec: dict, indice: dict, max_trechos: int = 4) -> list:
    """Trechos de um registro do dataset: `trechos` embutidos no registro, senão os ids de `fontes[].id` buscados em data/quimica/textos."""
    brutos = []
    if isinstance(rec.get("trechos"), list):
        brutos = [t for t in rec["trechos"] if isinstance(t, dict)]
    else:
        for f in rec.get("fontes") or []:
            fid = f.get("id") if isinstance(f, dict) else None
            if isinstance(fid, str) and fid in indice:
                brutos.append({"id": fid, "texto": indice[fid]})
    vistos, saida = set(), []
    for t in brutos:
        if t.get("id") in vistos or not isinstance(t.get("texto"), str):
            continue
        vistos.add(t["id"])
        saida.append({"id": t["id"], "texto": t["texto"]})
        if len(saida) >= max_trechos:
            break
    try:
        return core.validate_trechos(saida)
    except ValueError:
        return []


def carregar_casos(caminho):
    """Casos {q, recusar, ...}: aceita {"cases": [...]} ou uma lista; o texto da pergunta pode vir em q, pergunta ou texto."""
    dados = json.loads(Path(caminho).read_text(encoding="utf-8"))
    casos = dados["cases"] if isinstance(dados, dict) else dados
    saida = []
    for c in casos:
        q = c.get("q") or c.get("pergunta") or c.get("texto")
        if not isinstance(q, str) or "recusar" not in c:
            raise ValueError(f"caso inválido (precisa de q e recusar): {c}")
        saida.append({**c, "q": q})
    return saida
