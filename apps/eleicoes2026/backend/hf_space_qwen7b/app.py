# -*- coding: utf-8 -*-
"""Space de TESTE: Qwen2.5-7B-Instruct no ZeroGPU do Hugging Face, com o MESMO prompt do serviço do Modal (nlu_core.build_ask_prompt).

Serve para medir quanto da cota diária de GPU (40 min na conta PRO) cada resposta consome e quanto o usuário espera.
A cota conta só o tempo dentro de @spaces.GPU, não o tempo ocioso. NÃO está ligado à produção: o proxy (/api/ask) continua
desligado. A verificação da resposta (recomendação, números sem fonte, contradição de 2º turno) segue sendo feita no proxy.
"""
import time

import gradio as gr
import spaces
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

import nlu_core as core

MODEL_ID = "Qwen/Qwen2.5-7B-Instruct"
ROTULO = "Qwen2.5-7B-Instruct"

tok = AutoTokenizer.from_pretrained(MODEL_ID)
# no ZeroGPU o modelo vai para "cuda" já na carga do módulo (emulação fora de @spaces.GPU; GPU real dentro)
model = AutoModelForCausalLM.from_pretrained(MODEL_ID, torch_dtype=torch.bfloat16).to("cuda")
model.eval()


@spaces.GPU(duration=30)
def _gerar(prompt: str, max_new_tokens: int, temperature: float):
    t0 = time.time()
    ids = tok(prompt, return_tensors="pt").to("cuda")
    kw = {"do_sample": True, "temperature": temperature} if temperature > 0 else {"do_sample": False}
    with torch.inference_mode():
        out = model.generate(**ids, max_new_tokens=max_new_tokens, pad_token_id=tok.eos_token_id, **kw)
    novos = out[0][ids["input_ids"].shape[1]:]
    return tok.decode(novos, skip_special_tokens=True).strip(), round(time.time() - t0, 3), int(novos.shape[0])


def ask(question: str, context: str = ""):
    """Resposta generativa ancorada no contexto. Devolve também o tempo de GPU (o que conta para a cota)."""
    t0 = time.time()
    try:
        pergunta = core.validate_question(question)
        contexto = core.validate_context(context)
    except ValueError as e:
        return {"ok": False, "error": str(e)}
    texto, gpu_s, n = _gerar(core.build_ask_prompt(pergunta, contexto), 512, 0.2)
    return {"ok": True, "answer": texto, "model": ROTULO, "gpu_s": gpu_s, "total_s": round(time.time() - t0, 3), "tokens": n}


demo = gr.Interface(
    fn=ask,
    inputs=[gr.Textbox(label="Pergunta"), gr.Textbox(label="Contexto (dados oficiais enviados pelo app)", lines=6)],
    outputs=gr.JSON(label="Resposta"),
    api_name="ask",
    title="SaibaTudo — teste do Qwen 7B no ZeroGPU",
    description="Uso interno de medição. O texto é gerado por modelo e pode conter erros; não é dado oficial.",
)

if __name__ == "__main__":
    demo.queue(max_size=8).launch()
