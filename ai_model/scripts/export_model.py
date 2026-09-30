"""
Exportação do modelo SaibaTudo-Eleicao2026 para ONNX e formatos mobile (LiteRT / GGUF)
para consumo no Android.
"""

import os
import argparse
from pathlib import Path
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

def export_onnx(model_dir: str, output_path: str):
    print(f"Exportando {model_dir} para ONNX em {output_path}...")
    tokenizer = AutoTokenizer.from_pretrained(model_dir)
    model = AutoModelForCausalLM.from_pretrained(model_dir, torch_dtype=torch.float32)
    model.eval()

    dummy_input = tokenizer("Menu presidente São Paulo", return_tensors="pt")
    
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    
    torch.onnx.export(
        model,
        (dummy_input["input_ids"],),
        output_path,
        input_names=["input_ids"],
        output_names=["logits"],
        dynamic_axes={"input_ids": {0: "batch_size", 1: "sequence_length"}},
        opset_version=17
    )
    print("Exportação ONNX concluída!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Exportar SaibaTudo-Eleicao2026 para Mobile")
    parser.add_argument("--model_dir", type=str, default="../output/SaibaTudo-Eleicao2026")
    parser.add_argument("--output_onnx", type=str, default="../output/SaibaTudo-Eleicao2026.onnx")
    args = parser.parse_args()

    export_onnx(args.model_dir, args.output_onnx)
