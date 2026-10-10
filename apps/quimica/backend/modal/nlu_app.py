# -*- coding: utf-8 -*-
"""
SaibaTudo Química — interpretação (NLU) em nuvem no Modal.com (CPU + llama.cpp).

Serve o GGUF (Q4_K_M) do modelo de interpretação (Qwen2.5-1.5B-Instruct ajustado, `nlu-v1-AAAAMMDD`) com llama-cpp-python e a gramática GBNF
de nlu_core.py, atrás de um endpoint HTTPS protegido por Proxy Auth Token do Modal (cabeçalhos Modal-Key / Modal-Secret). Quem chama é SÓ o
proxy serverless da Vercel (api/nlu.js), que guarda o segredo; o app/site nunca falam com o Modal.

  POST <url>  {"q": "<pergunta, no máximo 300 caracteres>"}
  -> 200 {"ok": true, "output": {...JSON bruto do modelo...}, "model": "<versão>", "format": "v1", "ms": n, "tokens": n}
  -> 400 pergunta inválida | ok=false se o modelo não produziu JSON completo

O proxy normaliza `output` e ANCORA cada entidade na pergunta (api/_lib/normalize.js). O texto da pergunta NÃO é registrado em log.

Deploy:   modal deploy backend/modal/nlu_app.py
Benchmark (container efêmero, mede cold start e latência):   modal run backend/modal/nlu_app.py::bench
Pré-requisito: o modelo no Volume e promovido (backend/modal/convert_local.py --upload; backend/modal/promover.py). Ver docs/MODELO.md.

Custo: CPU-only, `scaledown_window` curto, `max_containers` baixo. NÃO usar GPU: tráfego esparso, saída curta (10 a 40 tokens), cold start cobrado.
(NÃO executado ainda: o treino é a fase 5 de verdade. Rode o `bench` no primeiro deploy e ajuste CPU_CORES e MODAL_TIMEOUT_MS na Vercel.)
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
import nlu_core as core  # noqa: E402  (lógica pura: prompt, gramática, validação)

APP_NAME = os.environ.get("NLU_APP_NAME", "saibatudo-quimica-nlu")
# Ponteiro de versão que este app serve (gravado por promover.py). Sem ele o contêiner falha ao subir: é assim que o rollback é explícito.
POINTER = os.environ.get("NLU_POINTER", "current.json")
VOLUME_NAME = "saibatudo-quimica-models"
MODELS_DIR = "/models"
LLAMA_CPP_PYTHON = "llama-cpp-python==0.3.19"  # mesmo runtime do gate (convert_local.py)
# Compilado do código-fonte: a wheel "cpu" do índice do projeto é ligada à musl (não carrega no Debian/glibc).
# Instruções fixas (sem -march=native) para rodar em qualquer CPU x86-64 dos servidores do Modal.
LLAMA_CPP_PYTHON_BUILD = (
    'CMAKE_ARGS="-DGGML_NATIVE=OFF -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON" '
    f'CMAKE_BUILD_PARALLEL_LEVEL=8 pip install --no-cache-dir --no-binary llama-cpp-python "{LLAMA_CPP_PYTHON}"'
)

# --- parâmetros de custo/latência (ver docs/MODELO.md: custos) ---
CPU_CORES = 4.0            # núcleos FÍSICOS (o Modal cobra pelo maior entre reserva e uso). Saída curta (10-40 tokens): ajustar após o `bench`
MEMORY_MIB = 3072          # GGUF Q4_K_M ~1,1 GB + contexto + Python
SCALEDOWN_SECONDS = 30     # container ocioso desliga em 30 s (default do Modal é 60)
MAX_CONTAINERS = 2         # teto de concorrência/custo
REQUEST_TIMEOUT_S = 60
N_THREADS = int(os.environ.get("NLU_THREADS", "4"))

# Memory snapshot (restaura o modelo já carregado em vez de relê-lo): DESLIGADO até ser validado com o `bench`.
USE_SNAPSHOT = False

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("build-essential", "cmake")
    .run_commands(LLAMA_CPP_PYTHON_BUILD)
    .pip_install("fastapi[standard]")
    .add_local_file(str(HERE / "nlu_core.py"), "/root/nlu_core.py")
)

app = modal.App(APP_NAME, image=image)
models = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)


@app.cls(
    volumes={MODELS_DIR: models},
    cpu=CPU_CORES,
    memory=MEMORY_MIB,
    scaledown_window=SCALEDOWN_SECONDS,
    max_containers=MAX_CONTAINERS,
    timeout=REQUEST_TIMEOUT_S,
    enable_memory_snapshot=USE_SNAPSHOT,
)
class Nlu:
    @modal.enter(snap=USE_SNAPSHOT)
    def load(self):
        """Carrega o GGUF indicado por /models/<POINTER> (escrito por promover.py)."""
        from llama_cpp import Llama

        t0 = time.time()
        ponteiro = Path(MODELS_DIR) / POINTER
        if not ponteiro.exists():
            raise RuntimeError(f"Volume sem /models/{POINTER}: rode `python backend/modal/promover.py --version <nlu-v1-AAAAMMDD>`")
        cfg = json.loads(ponteiro.read_text(encoding="utf-8"))
        self.version = cfg["version"]
        self.fmt = cfg.get("format") or core.FORMAT_VERSION
        if self.fmt != core.FORMAT_VERSION:
            raise RuntimeError(f"formato de saída desconhecido no ponteiro: {self.fmt}")
        caminho = Path(MODELS_DIR) / self.version / cfg["file"]
        self.lock = threading.Lock()  # a instância do llama.cpp não é thread-safe
        self.llm = Llama(
            model_path=str(caminho),
            n_ctx=768,             # prompt (~100-200 tokens) + saída (<= 256)
            n_threads=N_THREADS,
            n_threads_batch=N_THREADS,
            n_batch=256,
            use_mmap=True,
            verbose=False,
        )
        # Aquecimento: preenche o cache de KV com o prefixo (system prompt), reaproveitado nas próximas perguntas.
        self._gerar("qual a massa molar da água?")
        self.load_seconds = round(time.time() - t0, 2)
        print(json.dumps({"evt": "model_loaded", "version": self.version, "format": self.fmt, "seconds": self.load_seconds}))

    # -------------------------------------------------------------------------------------------------
    def _gerar(self, pergunta: str):
        """Geração determinística com gramática GBNF. Devolve (texto, tokens, motivo_de_parada)."""
        from llama_cpp import LlamaGrammar

        # Gramática recriada a cada chamada (barata) para não compartilhar estado entre versões do llama-cpp-python
        grammar = LlamaGrammar.from_string(core.grammar(), verbose=False)
        with self.lock:
            out = self.llm.create_completion(
                prompt=core.build_prompt(pergunta),
                grammar=grammar,
                max_tokens=core.MAX_NEW_TOKENS,
                temperature=0.0,       # determinístico (guloso)
                repeat_penalty=1.0,    # sem penalidade: JSON repete chaves/aspas por natureza
                stop=core.STOP_TOKENS,
            )
        escolha = out["choices"][0]
        return escolha["text"], out["usage"]["completion_tokens"], escolha.get("finish_reason")

    def _infer(self, q) -> dict:
        """Núcleo comum ao endpoint HTTP e ao `bench`. Lança ValueError se a pergunta é inválida."""
        pergunta = core.validate_question(q)
        t0 = time.time()
        texto, tokens, motivo = self._gerar(pergunta)
        ms = int((time.time() - t0) * 1000)
        obj = core.parse_model_output(texto)
        ok = core.has_valid_shape(obj) and motivo != "length"
        # Log SEM o texto da pergunta nem da saída: só métricas
        print(json.dumps({"evt": "infer", "ok": ok, "ms": ms, "tokens": tokens, "stop": motivo}))
        base = {"model": self.version, "format": self.fmt, "ms": ms, "tokens": tokens}
        if not ok:
            return {"ok": False, "error": "incomplete_output" if motivo == "length" else "invalid_output", **base}
        return {"ok": True, "output": obj, **base}

    @modal.method()
    def generate(self, q: str) -> dict:
        """Chamada remota (usada pelo `bench`)."""
        return self._infer(q)

    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def infer(self, item: dict):
        """Endpoint HTTP (protegido por Modal-Key/Modal-Secret). Corpo: {"q": "..."}."""
        from fastapi import HTTPException

        try:
            return self._infer(item.get("q") if isinstance(item, dict) else None)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from None


# --------------------------------------------------------------------------------------------------------
# Healthcheck leve: NÃO carrega o modelo (não acorda a CPU cara). Para um teste profundo, faça um POST em /infer.
# --------------------------------------------------------------------------------------------------------
@app.function(cpu=0.125, memory=128, scaledown_window=2, max_containers=1)
@modal.fastapi_endpoint(method="GET", requires_proxy_auth=True)
def health():
    return {"ok": True, "app": APP_NAME}


# --------------------------------------------------------------------------------------------------------
# Benchmark: modal run backend/modal/nlu_app.py::bench   (container efêmero; consome alguns segundos de CPU)
# --------------------------------------------------------------------------------------------------------
@app.local_entrypoint()
def bench(n: int = 12):
    """Mede o cold start (1ª chamada) e a latência com o container quente, com perguntas do contrato de testes."""
    dados = json.loads((HERE.parent.parent / "contracts" / "nlu_golden_cases.json").read_text(encoding="utf-8"))
    casos = dados["cases"] if isinstance(dados, dict) else dados
    perguntas = [c["q"] for c in casos][: max(1, n)]
    modelo = Nlu()
    tempos, tokens = [], []
    for i, q in enumerate(perguntas):
        t0 = time.time()
        r = modelo.generate.remote(q)
        dt = time.time() - t0
        tempos.append(dt)
        tokens.append(r.get("tokens", 0))
        marca = "COLD " if i == 0 else "warm "
        print(f"{marca}{dt:6.2f}s  tokens={r.get('tokens')}  model_ms={r.get('ms')}  ok={r.get('ok')}")
    quentes = sorted(tempos[1:]) or tempos
    p50 = quentes[len(quentes) // 2]
    p95 = quentes[min(len(quentes) - 1, int(len(quentes) * 0.95))]
    print("\n--- resumo ---")
    print(f"cold (1ª chamada, inclui boot+carga do modelo): {tempos[0]:.1f} s")
    print(f"warm: p50 {p50:.2f} s | p95 {p95:.2f} s | max {max(quentes):.2f} s")
    print("Defina MODAL_TIMEOUT_MS na Vercel >= ~1,5 x o p95 (máx. 25000) e a duração máxima da função >= esse valor + 2 s.")
