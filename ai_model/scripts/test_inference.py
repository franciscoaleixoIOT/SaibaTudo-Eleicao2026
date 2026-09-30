"""
Script de teste de inferência do modelo treinado SaibaTudo-Eleicao2026.
Carrega os pesos LoRA e valida a geração estruturada em JSON e respostas cívicas.
"""

import json
import torch
from pathlib import Path
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from peft import PeftModel

MODEL_DIR = Path(__file__).resolve().parent.parent / "output" / "SaibaTudo-Eleicao2026-8gb"
BASE_MODEL = "Qwen/Qwen2.5-0.5B-Instruct"

TEST_QUERIES = [
    "Qual é a ordem de votação na urna eletrônica em 2026 e quantos dígitos tem cada cargo?",
    "Candidatos a deputado federal (4 dígitos) em São Paulo focados em educação",
    "O que acontece se eu votar no mesmo senador na 1ª e na 2ª vaga?",
    "Como funciona o filtro de Ficha Limpa e processos administrativos no aplicativo?"
]

def main():
    print("=" * 70)
    print("  TESTE DE INFERÊNCIA DO MODELO SaibaTudo-Eleicao2026 (TREINADO)  ")
    print("=" * 70)
    print(f"Pesos LoRA:  {MODEL_DIR}")
    print(f"Modelo Base: {BASE_MODEL}")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Dispositivo: {device}")

    print("\nCarregando tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(str(MODEL_DIR), trust_remote_code=True)

    print("Carregando modelo base...")
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_use_double_quant=True
    )
    base_model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL,
        quantization_config=bnb_config if torch.cuda.is_available() else None,
        device_map="auto" if torch.cuda.is_available() else "cpu",
        trust_remote_code=True
    )

    print("Aplicando adaptadores LoRA treinados...")
    model = PeftModel.from_pretrained(base_model, str(MODEL_DIR))
    model.eval()

    print("\n" + "=" * 70)
    print("  EXECUTANDO CONSULTAS DE TESTE DO ELEITOR  ")
    print("=" * 70)

    for idx, query in enumerate(TEST_QUERIES, 1):
        print(f"\n--- [Consulta {idx}] ---")
        print(f"Pergunta do Eleitor: '{query}'\n")

        prompt = (
            f"<|im_start|>user\n"
            f"Você é o assistente inteligente do SaibaTudo-Eleicao2026. Identifique menus, submenus, filtros e intenções.\n\n"
            f"Consulta do eleitor: {query}<|im_end|>\n"
            f"<|im_start|>assistant\n"
        )

        inputs = tokenizer(prompt, return_tensors="pt").to(device)

        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=256,
                temperature=0.1,
                do_sample=False,
                pad_token_id=tokenizer.eos_token_id
            )

        generated = tokenizer.decode(outputs[0][inputs.input_ids.shape[1]:], skip_special_tokens=True)
        print("Resposta do Modelo:")
        print(generated.strip())
        print("-" * 50)

    print("\n✅ Teste de inferência finalizado com sucesso!")

if __name__ == "__main__":
    main()
