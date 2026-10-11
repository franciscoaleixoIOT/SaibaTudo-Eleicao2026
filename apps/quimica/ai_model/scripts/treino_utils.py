# -*- coding: utf-8 -*-
"""
Utilitários de treino SEM dependência de torch/transformers (testáveis em qualquer máquina e no CI):
  - máscara de perda no PROMPT: o modelo só deve aprender a SAÍDA (o JSON de intenção/entidades do NLU, ou a explicação do /ask), não a
    repetir o system prompt, os trechos e a pergunta. Sem isso, a maior parte dos tokens do gradiente é "ensinar o modelo a copiar o prompt";
  - metadados reproduzíveis do treino (train_meta.json): sha256 do dataset, base, hiperparâmetros, semente, commit, versões e perda final.

Uso nos scripts: train_hybrid.py (importa este módulo da mesma pasta). Serve aos dois modelos do projeto (nlu e ask): o formato ChatML do
Qwen2.5 e do Qwen3 é o mesmo.
"""
import hashlib
import json
import subprocess
import time
from pathlib import Path

IGNORAR = -100  # índice ignorado pela perda do Hugging Face


def montar_textos(system: str, user: str, alvo: str):
    """Devolve (prompt, completo). `prompt` termina em "<|im_start|>assistant\\n"; `completo` acrescenta a saída e o fim de turno."""
    prompt = (
        f"<|im_start|>system\n{system}<|im_end|>\n"
        f"<|im_start|>user\n{user}<|im_end|>\n"
        "<|im_start|>assistant\n"
    )
    return prompt, f"{prompt}{alvo}<|im_end|>\n"


def mascarar_prompt(tokenizer, prompt: str, completo: str, max_length: int):
    """
    Tokeniza `completo` e mascara (-100) os tokens do prompt.
    Devolve (input_ids, labels, attention_mask, status) com status em:
      "ok"        o prompt tokenizado é prefixo exato dos ids completos (caso normal);
      "parcial"   a fronteira prompt/saída fundiu tokens: mascara só o prefixo comum (conservador, nunca mascara a saída);
      "truncado"  o texto foi cortado antes de começar a saída (max_length curto): amostra sem alvo, a chamada deve DESCARTÁ-LA
                  (um lote só com -100 dá perda NaN).
    """
    enc = tokenizer(completo, truncation=True, max_length=max_length, padding=False, add_special_tokens=False)
    ids = list(enc["input_ids"])
    mask = list(enc["attention_mask"])
    p_ids = list(tokenizer(prompt, padding=False, add_special_tokens=False)["input_ids"])
    n = len(p_ids)
    if ids[:n] == p_ids:
        status, k = "ok", n
    else:
        k = 0
        while k < min(len(ids), n) and ids[k] == p_ids[k]:
            k += 1
        status = "parcial"
    if k >= len(ids):
        return ids, [IGNORAR] * len(ids), mask, "truncado"
    labels = [IGNORAR] * k + ids[k:]
    return ids, labels, mask, status


def sha256_arquivo(caminho) -> str:
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()


def git_sha(raiz=None) -> str:
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], cwd=raiz, capture_output=True, text=True, timeout=10).stdout.strip() or "desconhecido"
    except Exception:  # noqa: BLE001
        return "desconhecido"


def perda_final(log_history) -> float | None:
    """Última perda de treino registrada pelo Trainer (state.log_history), ou None."""
    for item in reversed(log_history or []):
        if isinstance(item, dict) and "loss" in item:
            return float(item["loss"])
    return None


def escrever_train_meta(destino, *, dataset, base_model, hiperparametros: dict, semente: int, amostras: int,
                        mascara: dict, log_history=None, versoes: dict | None = None, inicio: float | None = None,
                        alvo: str | None = None, versao: str | None = None):
    """Grava `train_meta.json` ao lado do LoRA: tudo que é preciso para reproduzir (ou auditar) o treino."""
    meta = {
        "criadoEm": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "duracaoSegundos": round(time.time() - inicio) if inicio else None,
        "commit": git_sha(Path(__file__).resolve().parent),
        "dataset": {"arquivo": str(dataset), "sha256": sha256_arquivo(dataset), "amostras": amostras},
        "alvo": alvo,
        "versao": versao,
        "baseModel": base_model,
        "semente": semente,
        "hiperparametros": hiperparametros,
        "mascaraDoPrompt": mascara,
        "perdaFinal": perda_final(log_history),
        "versoes": versoes or {},
    }
    destino = Path(destino)
    destino.mkdir(parents=True, exist_ok=True)
    (destino / "train_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return meta
