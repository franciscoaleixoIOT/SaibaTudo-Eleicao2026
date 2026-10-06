# -*- coding: utf-8 -*-
"""
SaibaTudo — Backend de IA de Alta Eficiência no Modal.com com Qwen2.5-7B-Instruct-AWQ e vLLM.
========================================================================================

Utiliza a base oficial Qwen/Qwen2.5-7B-Instruct-AWQ servida via vLLM em GPU Nvidia L4 / T4,
com scale-to-zero (desliga após 120 s ocioso). Custo NÃO medido: cada despertar paga o cold start (até 300 s) mais a janela
ociosa em GPU L4 (~US$ 0,80/h); com 1 contêiner o teto contínuo é ~US$ 580/mês — por isso o proxy (/api/ask) fica DESLIGADO por
padrão (ASK_ENABLED=1 + MODAL_ASK_ENDPOINT explícito) e tem orçamento diário próprio. Meça com `bench` antes de religar.

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


def sanitize_generated_answer(answer: str, question: str) -> str:
    """Detecta contradições numéricas/constitucionais sobre 2º turno e corrige com base nas normas do TSE."""
    import re
    if not answer:
        return answer
    q_lower = question.lower()
    ans_lower = answer.lower()

    eh_sobre_2t_ou_executivo = (
        "segundo turno" in q_lower or "2o turno" in q_lower or "2º turno" in q_lower or
        "segundo turno" in ans_lower or "2o turno" in ans_lower or "2º turno" in ans_lower or
        "governador" in q_lower or "presidente" in q_lower or
        "governador" in ans_lower or "presidente" in ans_lower
    )
    if eh_sobre_2t_ou_executivo:
        afirma_sem_2t = (
            "não haverá segundo turno" in ans_lower or "nao havera segundo turno" in ans_lower or
            "não terá segundo turno" in ans_lower or "nao tera segundo turno" in ans_lower or
            "liquidou a eleição" in ans_lower or "eleito em primeiro turno" in ans_lower or
            "eleito em 1º turno" in ans_lower or "turno único" in ans_lower
        )
        if afirma_sem_2t:
            pcts = [float(p.replace(",", ".")) for p in re.findall(r"(\d{1,2}(?:[.,]\d{1,2})?)\s*%", answer)]
            tem_pct_menor_ou_igual_50 = any(0 < p <= 50.0 for p in pcts)
            afirma_maioria_falsa = ("maioria absoluta" in ans_lower and tem_pct_menor_ou_igual_50) if pcts else False
            menciona_passado_ou_omar = "omar aziz" in ans_lower or "40,63" in ans_lower or "40.63" in ans_lower

            if (tem_pct_menor_ou_igual_50 and afirma_maioria_falsa) or menciona_passado_ou_omar or (tem_pct_menor_ou_igual_50 and "liquidou" in ans_lower):
                return (
                    "De acordo com a Constituição Federal (Art. 28 e Art. 77) e as regras oficiais do Tribunal Superior Eleitoral (TSE):\n\n"
                    "• Para Governador e Presidente da República, a eleição só é decidida em 1º turno se o candidato mais votado alcançar mais de 50% dos votos válidos (maioria absoluta, desconsiderados brancos e nulos).\n"
                    "• Se nenhum candidato obtiver mais de 50% dos votos válidos no 1º turno, haverá obrigatoriamente 2º turno entre os dois mais votados.\n"
                    "• Data da votação do 2º turno: 25 de outubro de 2026, das 8h às 17h (horário de Brasília).\n\n"
                    "Nota: Senadores e Deputados são eleitos em turno único por maioria simples ou quociente eleitoral no 1º turno e não disputam 2º turno."
                )
    return answer


@app.cls(
    gpu="L4",  # Excelente custo-benefício (24GB VRAM, R$0 ocioso, ~$0.80/h ativo)
    volumes={"/root/.cache/huggingface": hf_cache},
    scaledown_window=120,  # 2 min ociosos (antes 600): cada despertar custa cold start + esta janela em GPU
    max_containers=1,      # teto de gasto: um único contêiner de GPU
    timeout=300,
    startup_timeout=300,
)
class Qwen7bEngine:
    @modal.enter()
    def load_model(self):
        from vllm import LLM

        print(f"Carregando {MODEL_ID} com vLLM (AWQ Marlin 4-bit)...")
        t0 = time.time()
        self.llm = LLM(
            model=MODEL_ID,
            quantization="awq_marlin",
            tensor_parallel_size=1,
            max_model_len=2048,
            gpu_memory_utilization=0.85,
            trust_remote_code=True,
            enforce_eager=True,
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
            "3. Utilize plenamente os dados e candidaturas fornecidos no contexto para responder de forma direta e completa ao eleitor.\n"
            "4. A situação da candidatura é determinística e baseada no registro do TSE (LC 64/90); não substitui certidão judicial.\n"
            "5. Ao responder sobre chapas majoritárias (Presidente ou Governador), informe claramente o titular, o respectivo vice e seus partidos.\n"
            "6. Quando a pergunta pedir patrimônio, valores declarados ou quem disputa certo cargo, cite os nomes, números, partidos e valores presentes no contexto oficial.\n"
            "7. Organize a resposta com tópicos objetivos e formatação limpa em português do Brasil.\n"
            "8. Regras no dia da votação (Res. TSE 23.736/2024 e Lei 9.504/97): vestimenta informal (chinelo, bermuda, regata, boné, camisetas/bandeiras de partido em manifestação individual e silenciosa) é permitida; trajes de banho (biquíni/sunga) e nudez são proibidos; celulares, smartwatches e câmeras são estritamente proibidos na cabine de votação; documentos com foto aceitos incluem e-Título com foto, CNH (mesmo vencida), RG, Passaporte, Reservista e carteiras profissionais; armas são proibidas a 100m da seção (inclusive para CACs).\n"
            "9. REGRAS DO SEGUNDO TURNO E MAIORIA ABSOLUTA (Art. 28 e 77 da CF/88): Segundo turno existe SOMENTE para Presidente da República e Governador. Um candidato a Presidente ou Governador SÓ vence no 1º turno se obtiver estritamente MAIS DE 50,00% dos votos válidos (maioria absoluta). Se o 1º colocado tiver 50% ou menos (ex: 40%, 45%, 49,9%), HAVERÁ OBRIGATORIAMENTE 2º TURNO entre os dois mais votados no dia 25/10/2026. É ABSOLUTAMENTE PROIBIDO e contraditório afirmar que um percentual menor que 50% constitui maioria absoluta ou liquida a eleição em turno único para Governador/Presidente.\n"
            "10. Senadores e Deputados são eleitos em turno único por maioria simples ou quociente eleitoral no 1º turno e NUNCA disputam 2º turno. NUNCA misture senadores ou deputados com a eleição para Governador.\n"
            "11. ANCORAGEM RIGOROSA NAS ELEIÇÕES 2026: Responda estritamente sobre as Eleições 2026. NUNCA use dados de eleições passadas (como 2022 ou 2018) como se fossem o resultado de 2026. Se o contexto oficial não contiver o resultado de apuração das Eleições 2026 para aquele estado ou cargo, informe com clareza a regra constitucional (necessidade de mais de 50% dos votos válidos no 1º turno para não haver 2º turno) e a data da votação do 2º turno (25/10/2026), sem inventar números ou vencedores."
        )

        user_content = f"Contexto Oficial do TSE:\n{context}\n\nPergunta do Eleitor: {question}" if context else f"Pergunta do Eleitor: {question}"
        prompt = (
            f"<|im_start|>system\n{system_prompt}<|im_end|>\n"
            f"<|im_start|>user\n{user_content}<|im_end|>\n"
            "<|im_start|>assistant\n"
        )
        resposta = self._gerar_texto(prompt, max_tokens=512, temperature=0.2)
        resposta_sanitizada = sanitize_generated_answer(resposta, question)
        ms = int((time.time() - t0) * 1000)

        return {
            "ok": True,
            "answer": resposta_sanitizada,
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
