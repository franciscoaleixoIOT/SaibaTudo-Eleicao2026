"""
Fusão (Merge) dos adaptadores LoRA com o modelo base e exportação completa
do modelo SaibaTudo-Eleicao2026 para publicação e conversão Mobile.
"""

import os
import argparse
from pathlib import Path
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

def merge_lora_model(base_model_name: str, lora_dir: str, output_merged_dir: str):
    print("=" * 70)
    print("  FUSÃO (MERGE) DOS PESOS LoRA: SaibaTudo-Eleicao2026  ")
    print("=" * 70)
    print(f"Modelo Base: {base_model_name}")
    print(f"Pesos LoRA:  {lora_dir}")
    print(f"Destino:     {output_merged_dir}")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Dispositivo para fusão: {device}")

    print("\n1. Carregando tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(lora_dir, trust_remote_code=True)

    print("2. Carregando modelo base em float16...")
    base_model = AutoModelForCausalLM.from_pretrained(
        base_model_name,
        torch_dtype=torch.float16,
        device_map="auto" if torch.cuda.is_available() else "cpu",
        trust_remote_code=True
    )

    print("3. Aplicando adaptadores LoRA...")
    lora_model = PeftModel.from_pretrained(base_model, lora_dir)

    print("4. Fundindo (merge_and_unload) pesos nos tensores principais...")
    merged_model = lora_model.merge_and_unload()

    output_path = Path(output_merged_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    print(f"5. Salvando modelo fundido completo em {output_path}...")
    merged_model.save_pretrained(str(output_path), safe_serialization=True)
    tokenizer.save_pretrained(str(output_path))

    # Copiar Model Card README.md
    src_readme = Path(__file__).resolve().parent.parent / "README.md"
    dst_readme = output_path / "README.md"
    if src_readme.exists():
        with open(src_readme, "r", encoding="utf-8") as f_in, open(dst_readme, "w", encoding="utf-8") as f_out:
            f_out.write(f_in.read())

    print("\n✅ Fusão concluída com sucesso! O modelo está 100% pronto e autônomo.")
    print(f"Pasta final: {output_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Merge LoRA weights with base model")
    parser.add_argument("--base_model", type=str, default="Qwen/Qwen2.5-1.5B-Instruct")
    parser.add_argument("--lora_dir", type=str, default="../output/SaibaTudo-Eleicao2026-hybrid/final")
    parser.add_argument("--output_dir", type=str, default="../output/SaibaTudo-Eleicao2026-merged")
    args = parser.parse_args()

    lora_path = Path(__file__).resolve().parent / args.lora_dir
    output_path = Path(__file__).resolve().parent / args.output_dir

    merge_lora_model(args.base_model, str(lora_path), str(output_path))
