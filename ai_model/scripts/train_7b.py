# -*- coding: utf-8 -*-
"""
Treinamento QLoRA 4-bit de Alta Eficiência - Qwen2.5-7B-Instruct para SaibaTudo Eleições 2026
============================================================================================

Otimizado especificamente para GPUs de 8GB VRAM (como a NVIDIA RTX 5060 Laptop):
  - Base: Qwen/Qwen2.5-7B-Instruct (7 bilhões de parâmetros)
  - Quantização base no carregamento: NF4 4-bit (BitsAndBytes)
  - Otimizador: paged_adamw_8bit (paginado na RAM para não estourar a VRAM)
  - Gradient checkpointing ativado
  - LoRA r=16, alpha=32 nos 7 módulos de atenção e MLP
  - Dataset oficial: backend/retrain/out-v21/train.json

Uso:
  python ai_model/scripts/train_7b.py --epochs 2 --batch_size 1 --grad_accum 16
"""
import argparse
import json
import os
import sys
import time
from collections import Counter
from pathlib import Path

import torch
from torch.utils.data import Dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    DataCollatorForSeq2Seq,
    Trainer,
    TrainingArguments,
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from transformers import set_seed

from treino_utils import escrever_train_meta, mascarar_prompt, montar_textos

BASE = Path(__file__).resolve().parent.parent
REPO_ROOT = BASE.parent
DATA_DEFAULT = REPO_ROOT / "backend" / "retrain" / "out-v21" / "train.json"
OUTPUT_DIR_DEFAULT = BASE / "output" / "SaibaTudo-Qwen7B-LoRA-v21"

INSTRUCTION = (
    "Você interpreta perguntas de eleitores para o SaibaTudo Eleições 2026. "
    "Converta a pergunta em JSON compacto com a intenção e somente as entidades citadas na pergunta "
    "(cargo, uf, partido, nome, tema, apenasDeferidas, historico, turno). "
    "Não responda a pergunta e não invente dados."
)


class EleicaoDataset(Dataset):
    """Perda SÓ na saída: os tokens do prompt levam -100 (treino_utils.mascarar_prompt); amostras truncadas antes da saída são descartadas."""

    def __init__(self, samples, tokenizer, max_length):
        self.tokenizer = tokenizer
        self.max_length = max_length
        self.stats = Counter()
        self.itens = []
        for item in samples:
            target = item.get("output", "")
            target_str = target if isinstance(target, str) else json.dumps(target, ensure_ascii=False)
            prompt, completo = montar_textos(item.get("instruction", INSTRUCTION), item.get("input", ""), target_str)
            ids, labels, mask, status = mascarar_prompt(tokenizer, prompt, completo, max_length)
            self.stats[status] += 1
            if status != "truncado":
                self.itens.append({"input_ids": ids, "labels": labels, "attention_mask": mask})
        print(f"Máscara do prompt: {dict(self.stats)} -> {len(self.itens)} amostras de treino")

    def __len__(self):
        return len(self.itens)

    def __getitem__(self, idx):
        return self.itens[idx]


def main():
    parser = argparse.ArgumentParser(description="Treino QLoRA 7B para SaibaTudo Eleições 2026")
    parser.add_argument("--base_model", default="Qwen/Qwen2.5-7B-Instruct", help="Modelo base Hugging Face")
    parser.add_argument("--dataset", default=str(DATA_DEFAULT), help="Caminho do train.json")
    parser.add_argument("--output_dir", default=str(OUTPUT_DIR_DEFAULT), help="Pasta de saída")
    parser.add_argument("--epochs", type=float, default=2.0)
    parser.add_argument("--batch_size", type=int, default=1)
    parser.add_argument("--grad_accum", type=int, default=16)
    parser.add_argument("--max_length", type=int, default=512)
    parser.add_argument("--lr", type=float, default=2e-4)
    parser.add_argument("--resume", default=None)
    parser.add_argument("--seed", type=int, default=2026, help="semente (gravada em train_meta.json)")
    args = parser.parse_args()
    set_seed(args.seed)
    inicio = time.time()

    print("=" * 70)
    print("  TREINO QLoRA 7B — SaibaTudo Eleições 2026")
    print(f"  Base: {args.base_model}")
    print(f"  Dataset: {args.dataset}")
    print(f"  VRAM Detectada: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'Sem GPU'}")
    print("=" * 70)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device != "cuda":
        print("AVISO: CUDA não detectado. O treino de 7B requer GPU com aceleração CUDA.")

    tokenizer = AutoTokenizer.from_pretrained(args.base_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16,
        bnb_4bit_use_double_quant=True,
    )

    print("Carregando pesos do modelo base com quantização 4-bit...")
    model = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        quantization_config=bnb_config if device == "cuda" else None,
        device_map="auto",
        torch_dtype=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16,
        trust_remote_code=True,
        attn_implementation="sdpa",
    )
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(
        model,
        use_gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False},
    )

    lora_config = LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    with open(args.dataset, encoding="utf-8") as f:
        samples = json.load(f)
    print(f"Dataset carregado: {len(samples)} exemplos oficiais.")
    train_ds = EleicaoDataset(samples, tokenizer, args.max_length)

    training_args = TrainingArguments(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        lr_scheduler_type="cosine",
        warmup_steps=30,
        weight_decay=0.01,
        bf16=torch.cuda.is_bf16_supported(),
        fp16=not torch.cuda.is_bf16_supported() and device == "cuda",
        gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False},
        logging_steps=20,
        save_strategy="steps",
        save_steps=250,
        save_total_limit=2,
        report_to=[],
        optim="paged_adamw_8bit",
        max_grad_norm=0.3,
        dataloader_num_workers=0,  # 0 para estabilidade no Windows
        remove_unused_columns=False,
        seed=args.seed,
        data_seed=args.seed,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        data_collator=DataCollatorForSeq2Seq(tokenizer, padding=True, label_pad_token_id=-100),
    )

    print("\nIniciando treinamento QLoRA...")
    trainer.train(resume_from_checkpoint=args.resume)

    final_dir = Path(args.output_dir) / "final"
    model.save_pretrained(str(final_dir))
    tokenizer.save_pretrained(str(final_dir))
    import peft, transformers
    escrever_train_meta(
        final_dir, dataset=args.dataset, base_model=args.base_model, semente=args.seed, amostras=len(train_ds),
        hiperparametros={"epochs": args.epochs, "batch_size": args.batch_size, "grad_accum": args.grad_accum, "max_length": args.max_length, "lr": args.lr},
        mascara=dict(train_ds.stats), log_history=trainer.state.log_history, inicio=inicio,
        versoes={"torch": torch.__version__, "transformers": transformers.__version__, "peft": peft.__version__},
    )
    print(f"\n✅ Treinamento 7B concluído com sucesso! Adaptadores salvos em: {final_dir} (train_meta.json grava dataset, semente, versões e perda final)")


if __name__ == "__main__":
    main()
