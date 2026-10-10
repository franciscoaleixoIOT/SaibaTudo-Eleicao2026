# -*- coding: utf-8 -*-
"""
Fusão (merge) dos adaptadores LoRA com o modelo base e exportação completa do modelo ajustado do SaibaTudo Química, pronta para o
Hugging Face e para a conversão em GGUF (backend/modal/convert_local.py).

  python ai_model/scripts/merge_and_export.py --target nlu     # Qwen2.5-1.5B-Instruct + LoRA -> ai_model/output/SaibaTudo-Quimica-NLU-merged
  python ai_model/scripts/merge_and_export.py --target ask     # Qwen3-4B-Instruct-2507 + LoRA -> ai_model/output/SaibaTudo-Quimica-Ask-merged

Copia train_meta.json (dataset, semente, versões, perda final) e o cartão do modelo (MODEL_CARD_NLU.md / MODEL_CARD_ASK.md, como README.md)
para a pasta mesclada, para que o que sobe ao Hugging Face seja auditável.
"""
import argparse
import shutil
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent  # ai_model/

PRESETS = {
    "nlu": {
        "base_model": "Qwen/Qwen2.5-1.5B-Instruct",
        "lora_dir": BASE / "output" / "SaibaTudo-Quimica-NLU-hybrid" / "final",
        "output_dir": BASE / "output" / "SaibaTudo-Quimica-NLU-merged",
        "card": BASE / "MODEL_CARD_NLU.md",
    },
    "ask": {
        "base_model": "Qwen/Qwen3-4B-Instruct-2507",
        "lora_dir": BASE / "output" / "SaibaTudo-Quimica-Ask-hybrid" / "final",
        "output_dir": BASE / "output" / "SaibaTudo-Quimica-Ask-merged",
        "card": BASE / "MODEL_CARD_ASK.md",
    },
}


def copiar_documentos(lora_dir: Path, destino: Path, card: Path) -> list:
    """train_meta.json e o cartão do modelo vão junto dos pesos. Devolve o que foi copiado."""
    copiados = []
    meta = lora_dir / "train_meta.json"
    if meta.exists():
        shutil.copy2(meta, destino / "train_meta.json")
        copiados.append("train_meta.json")
    if card.exists():
        shutil.copy2(card, destino / "README.md")
        copiados.append("README.md")
    return copiados


def merge_lora_model(base_model_name: str, lora_dir: Path, output_dir: Path, card: Path):
    import torch
    from peft import PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer

    print("=" * 70)
    print("  FUSÃO (MERGE) DOS PESOS LoRA: SaibaTudo Química")
    print("=" * 70)
    print(f"Modelo base: {base_model_name}\nPesos LoRA:  {lora_dir}\nDestino:     {output_dir}")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Dispositivo para a fusão: {device}")

    print("\n1. Carregando tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(str(lora_dir), trust_remote_code=True)
    print("2. Carregando o modelo base em float16...")
    base_model = AutoModelForCausalLM.from_pretrained(base_model_name, torch_dtype=torch.float16, device_map="auto" if device == "cuda" else "cpu", trust_remote_code=True)
    print("3. Aplicando os adaptadores LoRA...")
    lora_model = PeftModel.from_pretrained(base_model, str(lora_dir))
    print("4. Fundindo (merge_and_unload) os pesos nos tensores principais...")
    merged = lora_model.merge_and_unload()

    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"5. Salvando o modelo fundido em {output_dir}...")
    merged.save_pretrained(str(output_dir), safe_serialization=True)
    tokenizer.save_pretrained(str(output_dir))
    print("6. Copiando train_meta.json e o cartão do modelo:", ", ".join(copiar_documentos(lora_dir, output_dir, card)) or "(nada para copiar)")
    print(f"\nFusão concluída. Pasta final: {output_dir}")
    print("Próximo passo: python backend/modal/convert_local.py --target <nlu|ask> --model-dir <pasta> --version <versão>")


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--target", choices=sorted(PRESETS), required=True)
    p.add_argument("--base_model", default=None)
    p.add_argument("--lora_dir", default=None)
    p.add_argument("--output_dir", default=None)
    a = p.parse_args(argv)
    pre = PRESETS[a.target]
    lora_dir = Path(a.lora_dir or pre["lora_dir"]).resolve()
    output_dir = Path(a.output_dir or pre["output_dir"]).resolve()
    if not (lora_dir / "adapter_config.json").exists():
        raise SystemExit(f"{lora_dir} não tem adapter_config.json: rode train_hybrid.py --target {a.target} antes")
    if (output_dir / "config.json").exists():
        raise SystemExit(f"{output_dir} já tem um modelo mesclado: renomeie-o (as versões são imutáveis) antes de refazer a fusão")
    merge_lora_model(a.base_model or pre["base_model"], lora_dir, output_dir, pre["card"])


if __name__ == "__main__":
    main()
