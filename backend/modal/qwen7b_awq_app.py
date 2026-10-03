# -*- coding: utf-8 -*-
"""
SaibaTudo — Backend de IA de Alta Eficiência no Modal.com com Qwen2.5-7B-Instruct-AWQ e vLLM.
========================================================================================

Utiliza a base oficial Qwen/Qwen2.5-7B-Instruct-AWQ servida via vLLM em GPU Nvidia L4 / T4,
com scale-to-zero (desliga após 60s ocioso para custo zero quando sem tráfego).
Enquadra-se com folga no limite gratuito de $30/mês do Modal.com.

Fornece:
  1. POST /infer : Interpretação estruturada de intenção e entidades (formato v2 para a Vercel/App)
  2. POST /ask   : Resposta generativa aprofundada com ancoragem oficial estrita (TSE / LC 64/90)
  3. GET /health : Verificação de status

Deploy:
  python -m modal deploy backend/modal/qwen7b_awq_app.py

Teste de benchmark:
  python -m modal run backend/modal/qwen7b_awq_app.py::bench
"""
import json
import os
import sys
import time
from pathlib import Path

import modal

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import nlu_core as core  # lógica pura de schema e validação

APP_NAME = os.environ.get("QWEN7B_APP_NAME", "saibatudo-qwen7b-awq")
MODEL_ID = "Qwen/Qwen2.5-7B-Instruct-AWQ"

# Imagem com vLLM e suporte otimizado para AWQ em Debian Slim
vllm_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.4.0",
        "transformers==4.45.2",
        "vllm==0.6.3.post1",
        "huggingface_hub",
        "fastapi[standard]",
        "pydantic",
    )
    .add_local_file(str(HERE / "nlu_core.py"), "/root/nlu_core.py")
)

app = modal.App(APP_NAME, image=vllm_image)

# Cache de pesos do Hugging Face em Volume para acelerar inicializações
hf_cache = modal.Volume.from_name("saibatudo-hf-cache", create_if_missing=True)


@app.cls(
    gpu="L4",  # Excelente custo-benefício (24GB VRAM, R$0 ocioso, ~$0.80/h ativo)
    volumes={"/root/.cache/huggingface": hf_cache},
    scaledown_window=60,  # Desliga após 60 segundos sem requisições (custo zero)
    max_containers=2,
    timeout=300,
    startup_timeout=300,
)
class Qwen7bEngine:
    @modal.enter()
    def load_model(self):
        from vllm import LLM

        print(f"Carregando {MODEL_ID} com vLLM (AWQ 4-bit)...")
        t0 = time.time()
        self.llm = LLM(
            model=MODEL_ID,
            quantization="awq",
            tensor_parallel_size=1,
            max_model_len=2048,
            gpu_memory_utilization=0.85,
            trust_remote_code=True,
            enforce_eager=False,
        )
        self.load_time = round(time.time() - t0, 2)
        print(f"Modelo {MODEL_ID} carregado em {self.load_time}s")

    def _gerar_texto(self, prompt: str, max_tokens: int = 256, temperature: float = 0.0) -> str:
        from vllm import SamplingParams

        sampling_params = SamplingParams(
            temperature=temperature,
            max_tokens=max_tokens,
            stop=["<|im_end|>", "<|endoftext|>"],
        )
        outputs = self.llm.generate([prompt], sampling_params)
        return outputs[0].outputs[0].text.strip()

    @modal.method()
    def generate_nlu(self, query: str) -> dict:
        """Extração estruturada de intenção e entidades segundo o contrato v2."""
        pergunta = core.validate_question(query)
        t0 = time.time()
        prompt = (
            "<|im_start|>system\n"
            "Você interpreta perguntas de eleitores para o SaibaTudo Eleições 2026. "
            "Converta a pergunta em JSON compacto com a intenção e somente as entidades citadas "
            "(cargo, uf, partido, nome, tema, apenasDeferidas, historico, turno). "
            "Não responda a pergunta e não invente dados.\n<|im_end|>\n"
            f"<|im_start|>user\n{pergunta}<|im_end|>\n"
            "<|im_start|>assistant\n"
        )
        texto = self._gerar_texto(prompt, max_tokens=160, temperature=0.0)
        ms = int((time.time() - t0) * 1000)

        obj = core.parse_model_output(texto)
        ok = core.has_valid_shape(obj, "v2")
        return {
            "ok": ok,
            "output": obj if ok else None,
            "raw": texto,
            "model": "Qwen2.5-7B-Instruct-AWQ",
            "format": "v2",
            "ms": ms,
        }

    @modal.method()
    def answer_with_context(self, question: str, context: str = "") -> dict:
        """Geração de resposta detalhada fundamentada nas regras e dados oficiais do TSE."""
        t0 = time.time()
        system_prompt = (
            "Você é o assistente eleitoral oficial do aplicativo SaibaTudo Eleições 2026. "
            "Suas respostas são rigorosamente ancoradas nos dados públicos do Tribunal Superior Eleitoral (TSE). "
            "Princípios obrigatórios:\n"
            "1. Responda com clareza, neutralidade absoluta e precisão jurídica.\n"
            "2. Nunca elogie, critique ou recomende votos em candidatos (Res. TSE 23.755/2026).\n"
            "3. Se a informação não constar nos dados ou no contexto, diga claramente que o dado ainda não consta no TSE.\n"
            "4. A situação da candidatura é determinística e baseada no registro do TSE (LC 64/90); não substitui certidão judicial.\n"
            "5. Ao responder sobre chapas majoritárias (Presidente ou Governador), informe claramente o titular, o respectivo vice e seus partidos.\n"
            "6. Organize a resposta com tópicos objetivos e formatação limpa em português do Brasil."
        )

        user_content = f"Contexto Oficial do TSE:\n{context}\n\nPergunta do Eleitor: {question}" if context else f"Pergunta do Eleitor: {question}"
        prompt = (
            f"<|im_start|>system\n{system_prompt}<|im_end|>\n"
            f"<|im_start|>user\n{user_content}<|im_end|>\n"
            "<|im_start|>assistant\n"
        )
        resposta = self._gerar_texto(prompt, max_tokens=512, temperature=0.2)
        ms = int((time.time() - t0) * 1000)

        return {
            "ok": True,
            "answer": resposta,
            "model": "Qwen2.5-7B-Instruct-AWQ",
            "ms": ms,
        }

    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def infer(self, item: dict):
        """Endpoint HTTP para proxy Vercel (mesma interface de api/nlu.js)."""
        from fastapi import HTTPException

        q = item.get("q") if isinstance(item, dict) else None
        if not q or not isinstance(q, str):
            raise HTTPException(status_code=400, detail="Pergunta inválida.")
        return self.generate_nlu.local(q)

    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def ask(self, item: dict):
        """Endpoint HTTP para respostas generativas ancoradas."""
        from fastapi import HTTPException

        q = item.get("question") or item.get("q")
        ctx = item.get("context", "")
        if not q:
            raise HTTPException(status_code=400, detail="Campo 'question' obrigatório.")
        return self.answer_with_context.local(q, ctx)


@app.function(cpu=0.125, memory=128, scaledown_window=2, max_containers=1)
@modal.fastapi_endpoint(method="GET", requires_proxy_auth=True)
def health():
    return {"ok": True, "app": APP_NAME, "base_model": MODEL_ID}


@app.local_entrypoint()
def bench():
    """Validação rápida de geração e tempo de inferência."""
    engine = Qwen7bEngine()
    testes = [
        "Quem disputa a presidência da república em 2026?",
        "Candidatos ao governo de SP pelo PL",
        "O que significa registro indeferido com recurso na Lei da Ficha Limpa?",
    ]
    print("\n--- Testando NLU Estruturado ---")
    for q in testes:
        t0 = time.time()
        res = engine.generate_nlu.remote(q)
        print(f"Q: '{q}'\nTempo: {time.time()-t0:.2f}s | Output: {json.dumps(res.get('output'), ensure_ascii=False)}\n")

    print("\n--- Testando Resposta Generativa Ancorada ---")
    r = engine.answer_with_context.remote(
        "Como funciona a votação para senador em 2026?",
        "Em 2026 serão renovados 2/3 do Senado Federal (duas vagas por estado). O eleitor vota duas vezes para senador, em números diferentes."
    )
    print(f"Resposta:\n{r['answer']}\nTempo: {r['ms']}ms")
