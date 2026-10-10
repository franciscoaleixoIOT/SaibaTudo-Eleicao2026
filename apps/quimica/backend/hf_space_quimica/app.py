# -*- coding: utf-8 -*-
"""Space do Hugging Face (ZeroGPU) que gera a EXPLICAÇÃO do SaibaTudo Química, chamado só pelo servidor do projeto (api/ask.js).

Modelo: Qwen3-4B-Instruct-2507 (base, por enquanto). Depois do treino, aponte ASK_MODEL_ID para o repositório do modelo ajustado
(franciscoaleixo/SaibaTudo-Quimica-Ask) e ASK_MODEL_REVISION para o SHA da revisão publicada — nas "Variables" do Space, sem mexer no código.

O prompt é o MESMO do treino e da avaliação (ask_core.build_ask_prompt, copiado de backend/modal/ask_core.py para esta pasta): sistema de química
ancorado nos TRECHOS licenciados que o app envia, mais o CONTEXTO (dados que o app já exibiu). A cota diária da conta conta só o tempo dentro de
@spaces.GPU. A verificação da resposta (números, fórmulas, segurança, fontes) é feita no servidor da Vercel (api/_lib/fidelidade.js), não aqui.

API (Gradio, api_name="ask"): entradas [pergunta, contexto, trechos (texto JSON: [{"id": "...", "texto": "..."}])];
saída {ok, answer, model, gpu_s} (ou {ok: false, error}). Não registra pergunta nem resposta.
"""
import os
import time

import gradio as gr
import spaces
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

import ask_core as core

MODEL_ID = os.environ.get("ASK_MODEL_ID", "Qwen/Qwen3-4B-Instruct-2507")
MODEL_REVISION = os.environ.get("ASK_MODEL_REVISION") or None
ROTULO = os.environ.get("ASK_MODEL_LABEL", MODEL_ID.split("/")[-1])
GPU_SEGUNDOS = 45

tok = AutoTokenizer.from_pretrained(MODEL_ID, revision=MODEL_REVISION)
# no ZeroGPU o modelo vai para "cuda" já na carga do módulo (emulação fora de @spaces.GPU; GPU real dentro)
model = AutoModelForCausalLM.from_pretrained(MODEL_ID, revision=MODEL_REVISION, torch_dtype=torch.bfloat16).to("cuda")
model.eval()


@spaces.GPU(duration=GPU_SEGUNDOS)
def _gerar(prompt: str, max_new_tokens: int, temperature: float):
    t0 = time.time()
    ids = tok(prompt, return_tensors="pt").to("cuda")
    kw = {"do_sample": True, "temperature": temperature, "top_p": 0.9} if temperature > 0 else {"do_sample": False}
    with torch.inference_mode():
        out = model.generate(**ids, max_new_tokens=max_new_tokens, pad_token_id=tok.eos_token_id, repetition_penalty=1.05, **kw)
    novos = out[0][ids["input_ids"].shape[1]:]
    return tok.decode(novos, skip_special_tokens=True).strip(), round(time.time() - t0, 3), int(novos.shape[0])


def ask(question: str, context: str = "", trechos: str = ""):
    """Explicação ancorada nos trechos. Devolve também o tempo de GPU (o que conta para a cota)."""
    t0 = time.time()
    try:
        pergunta = core.validate_question(question)
        contexto = core.validate_context(context)
        lista = core.parse_trechos(trechos)
    except ValueError as e:
        return {"ok": False, "error": str(e)}
    texto, gpu_s, n = _gerar(core.build_ask_prompt(pergunta, contexto, lista), core.MAX_NEW_TOKENS, 0.2)
    if not texto:
        return {"ok": False, "error": "empty_output"}
    return {"ok": True, "answer": texto, "model": ROTULO, "gpu_s": gpu_s, "total_s": round(time.time() - t0, 3), "tokens": n}


demo = gr.Interface(
    fn=ask,
    inputs=[
        gr.Textbox(label="Pergunta"),
        gr.Textbox(label="Contexto (dados exibidos pelo app)", lines=4),
        gr.Textbox(label='Trechos (JSON: [{"id": "...", "texto": "..."}])', lines=6),
    ],
    outputs=gr.JSON(label="Resposta"),
    api_name="ask",
    title="SaibaTudo Química — explicação por IA",
    description="Uso do servidor do projeto. O texto é gerado por modelo e pode conter erros; não é dado oficial.",
)

if __name__ == "__main__":
    demo.queue(max_size=8).launch()
