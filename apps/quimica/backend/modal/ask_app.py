# -*- coding: utf-8 -*-
"""
SaibaTudo Química — explicador (/api/ask) em nuvem no Modal.com: RESERVA do Space do Hugging Face (ZeroGPU).

Serve o GGUF (Q4_K_M) do explicador (Qwen3-4B-Instruct-2507 ajustado, `ask-v1-AAAAMMDD`) com llama-cpp-python compilado com CUDA, numa GPU L4,
atrás de um endpoint HTTPS protegido por Proxy Auth Token do Modal (Modal-Key / Modal-Secret). Quem chama é SÓ o proxy da Vercel (api/ask.js),
e só quando o Space falha ou a cota diária dele acaba: o orçamento da reserva é baixo (MODAL_ASK_DAILY_BUDGET, padrão 15/dia), porque a GPU do
Modal cobra o contêiner inteiro (inclui a espera de `scaledown_window`).

  POST <url>  {"question": "...", "context": "...", "trechos": [{"id": "...", "texto": "..."}]}
  -> 200 {"ok": true, "answer": "...", "model": "<versão>", "ms": n, "tokens": n}
  -> 400 entrada inválida

O prompt é o MESMO do treino e do Space (ask_core.build_ask_prompt). A verificação da resposta (números, fórmulas, segurança, fontes) é feita
no proxy (api/_lib/fidelidade.js). O texto da pergunta e da resposta NÃO é registrado em log.

Deploy:   modal deploy backend/modal/ask_app.py
Teste:    modal run backend/modal/ask_app.py::bench
Pré-requisito: o GGUF no Volume e promovido (convert_local.py --target ask --upload; promover.py). Ver docs/MODELO.md.

NÃO executado ainda (fase 5 de verdade): validar o build do llama-cpp-python com CUDA e o tempo de partida a frio no primeiro deploy.
"""
import json
import os
import sys
import threading
import time
from pathlib import Path

import modal

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import ask_core as core  # noqa: E402

APP_NAME = os.environ.get("ASK_APP_NAME", "saibatudo-quimica-ask")
POINTER = os.environ.get("ASK_POINTER", "ask-current.json")
VOLUME_NAME = "saibatudo-quimica-models"
MODELS_DIR = "/models"
LLAMA_CPP_PYTHON = "llama-cpp-python==0.3.19"
GPU = "L4"
SCALEDOWN_SECONDS = 60     # quanto o contêiner fica ligado (e cobrado) depois da última resposta
MAX_CONTAINERS = 1         # a reserva nunca escala: o orçamento do proxy é o teto
REQUEST_TIMEOUT_S = 120

# Compilar para a arquitetura da L4 (Ada, sm_89); as bibliotecas "stub" do CUDA permitem ligar sem GPU na hora do build.
LLAMA_CPP_CUDA_BUILD = (
    'CMAKE_ARGS="-DGGML_CUDA=on -DCMAKE_CUDA_ARCHITECTURES=89 -DCMAKE_EXE_LINKER_FLAGS=-Wl,--allow-shlib-undefined '
    '-DCMAKE_SHARED_LINKER_FLAGS=-Wl,--allow-shlib-undefined" '
    'LD_LIBRARY_PATH=/usr/local/cuda/lib64/stubs:$LD_LIBRARY_PATH '
    f'pip install --no-cache-dir --no-binary llama-cpp-python "{LLAMA_CPP_PYTHON}"'
)

image = (
    modal.Image.from_registry("nvidia/cuda:12.4.1-devel-ubuntu22.04", add_python="3.12")
    .apt_install("build-essential", "cmake")
    .run_commands(LLAMA_CPP_CUDA_BUILD)
    .pip_install("fastapi[standard]")
    .add_local_file(str(HERE / "ask_core.py"), "/root/ask_core.py")
)

app = modal.App(APP_NAME, image=image)
models = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)


@app.cls(volumes={MODELS_DIR: models}, gpu=GPU, scaledown_window=SCALEDOWN_SECONDS, max_containers=MAX_CONTAINERS, timeout=REQUEST_TIMEOUT_S)
class Ask:
    @modal.enter()
    def load(self):
        """Carrega o GGUF indicado por /models/<POINTER> (escrito por promover.py) com todas as camadas na GPU."""
        from llama_cpp import Llama

        t0 = time.time()
        ponteiro = Path(MODELS_DIR) / POINTER
        if not ponteiro.exists():
            raise RuntimeError(f"Volume sem /models/{POINTER}: rode `python backend/modal/promover.py --version <ask-v1-AAAAMMDD>`")
        cfg = json.loads(ponteiro.read_text(encoding="utf-8"))
        self.version = cfg["version"]
        self.lock = threading.Lock()
        self.llm = Llama(model_path=str(Path(MODELS_DIR) / self.version / cfg["file"]), n_ctx=4096, n_gpu_layers=-1, verbose=False)
        print(json.dumps({"evt": "model_loaded", "version": self.version, "seconds": round(time.time() - t0, 2)}))

    def _responder(self, item) -> dict:
        if not isinstance(item, dict):
            raise ValueError("corpo inválido")
        pergunta = core.validate_question(item.get("question"))
        contexto = core.validate_context(item.get("context"))
        trechos = core.validate_trechos(item.get("trechos"))
        t0 = time.time()
        with self.lock:
            out = self.llm.create_completion(
                prompt=core.build_ask_prompt(pergunta, contexto, trechos), max_tokens=core.MAX_NEW_TOKENS, temperature=0.2, top_p=0.9,
                repeat_penalty=1.05, stop=core.STOP_TOKENS,
            )
        escolha = out["choices"][0]
        ms = int((time.time() - t0) * 1000)
        print(json.dumps({"evt": "ask", "ms": ms, "tokens": out["usage"]["completion_tokens"], "stop": escolha.get("finish_reason")}))  # sem texto
        texto = escolha["text"].strip()
        if not texto:
            return {"ok": False, "error": "empty_output", "model": self.version, "ms": ms}
        return {"ok": True, "answer": texto, "model": self.version, "ms": ms, "tokens": out["usage"]["completion_tokens"]}

    @modal.method()
    def generate(self, item: dict) -> dict:
        return self._responder(item)

    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def ask(self, item: dict):
        """Endpoint HTTP (protegido por Modal-Key/Modal-Secret). Corpo: {"question", "context", "trechos"}."""
        from fastapi import HTTPException

        try:
            return self._responder(item)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from None


@app.local_entrypoint()
def bench():
    """Mede a partida a frio e a latência de uma explicação típica."""
    ask = Ask()
    item = {
        "question": "O que é massa molar?",
        "context": "",
        "trechos": [{"id": "teste-001", "texto": "A massa molar de uma substância é a massa de um mol dela, em gramas por mol (g/mol)."}],
    }
    for i in range(3):
        t0 = time.time()
        r = ask.generate.remote(item)
        print(f"{'COLD ' if i == 0 else 'warm '}{time.time() - t0:6.2f}s  ok={r.get('ok')}  tokens={r.get('tokens')}  model_ms={r.get('ms')}")
