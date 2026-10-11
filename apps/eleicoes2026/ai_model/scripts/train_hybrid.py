# -*- coding: utf-8 -*-
"""
Treinamento HÍBRIDO (GPU RTX 5060 + RAM do sistema) - SaibaTudo-Eleicao2026
===========================================================================
Fine-tuning QLoRA 4-bit (NF4) do dataset OFICIAL do TSE 2026
(dataset_oficial_treino.json), com:

  - Base mais sólida: Qwen2.5-1.5B-Instruct (3x maior que a base anterior 0.5B)
  - Memória híbrida: VRAM da GPU + offload para RAM (accelerate) quando necessário,
    permitindo bases maiores (até ~3B-7B) sem estourar os 8GB de VRAM
  - Gradient checkpointing + bf16 no formato NVIDIA Blackwell (sm_120)
  - LoRA em todos os módulos lineares (q,k,v,o,gate,up,down)

Uso:
  python train_hybrid.py --base_model Qwen/Qwen2.5-1.5B-Instruct --cpu_offload auto
"""
import argparse
import json
import os
import time
from collections import Counter
from pathlib import Path

import torch
from torch.utils.data import Dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    Trainer,
    TrainingArguments,
    DataCollatorForSeq2Seq,
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from transformers import set_seed

from treino_utils import escrever_train_meta, mascarar_prompt, montar_textos

BASE = Path(__file__).resolve().parent.parent
DATA = BASE.parent / "backend" / "retrain" / "out" / "train.json"   # gerado por backend/retrain/build_nlu_dataset.py
OUTPUT_DIR = BASE / "output" / "SaibaTudo-Eleicao2026-hybrid"

INSTRUCTION = ("Você é o assistente inteligente do SaibaTudo-Eleicao2026. "
               "Com base nos dados OFICIAIS do TSE (Eleições Gerais 2026), identifique "
               "intenção, rota, menu, submenu e filtros, e responda com JSON estruturado.")


class OficialDataset(Dataset):
    """Dataset de pares (instruction, input, output) -> chat template Qwen.

    A perda é calculada SÓ na saída: os tokens do prompt (system + pergunta) levam -100 (treino_utils.mascarar_prompt). Antes, `labels` era
    uma cópia de `input_ids` e o modelo gastava a maior parte do gradiente aprendendo a repetir o prompt. Amostras truncadas antes da saída
    (max_length curto) são descartadas aqui: um lote só com -100 dá perda NaN.
    """

    def __init__(self, samples, tokenizer, max_length):
        self.tokenizer = tokenizer
        self.max_length = max_length
        self.stats = Counter()
        self.itens = []
        for s in samples:
            target_text = s["output"] if isinstance(s["output"], str) else json.dumps(s["output"], ensure_ascii=False)
            prompt, completo = montar_textos(s.get("instruction", INSTRUCTION), s["input"], target_text)
            ids, labels, mask, status = mascarar_prompt(tokenizer, prompt, completo, max_length)
            self.stats[status] += 1
            if status != "truncado":
                self.itens.append({"input_ids": ids, "labels": labels, "attention_mask": mask})
        print(f"Máscara do prompt: {dict(self.stats)} -> {len(self.itens)} amostras de treino")

    def __len__(self):
        return len(self.itens)

    def __getitem__(self, idx):
        return self.itens[idx]


def resolve_gpu_memory():
    """VRAM disponível na RTX local (com margem para o sistema)."""
    if torch.cuda.is_available():
        total = torch.cuda.get_device_properties(0).total_memory / 1e9
        return f"{max(4.0, total * 0.88 - 0.6):.2f}GiB"
    return "0GiB"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base_model", default="Qwen/Qwen2.5-1.5B-Instruct",
                        help="Base mais sólida: 1.5B (padrão). Suporta 3B com offload.")
    parser.add_argument("--dataset", default=None, help="array JSON de {instruction,input,output} (padrão: backend/retrain/out/train.json)")
    parser.add_argument("--epochs", type=float, default=2.0)
    parser.add_argument("--batch_size", type=int, default=2)
    parser.add_argument("--grad_accum", type=int, default=8)
    parser.add_argument("--max_length", type=int, default=768)
    parser.add_argument("--lr", type=float, default=2e-4)
    parser.add_argument("--cpu_offload", default="auto",
                        choices=["auto", "on", "off"],
                        help="Híbrido: offload de camadas para RAM do sistema.")
    parser.add_argument("--resume", default=None)
    parser.add_argument("--seed", type=int, default=2026, help="semente (gravada em train_meta.json): mesmo dataset + mesma semente = mesmo treino")
    args = parser.parse_args()
    set_seed(args.seed)
    inicio = time.time()
    global DATA
    if args.dataset:
        DATA = Path(args.dataset)

    print("=" * 70)
    print("  TREINO HÍBRIDO SaibaTudo-Eleicao2026 (RTX + RAM, QLoRA 4-bit NF4)")
    print("=" * 70)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Dispositivo: {device}" +
          (f" ({torch.cuda.get_device_name(0)})" if device == "cuda" else ""))
    print(f"Base: {args.base_model}")

    tokenizer = AutoTokenizer.from_pretrained(args.base_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    bnb = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16 if device == "cuda" else torch.float32,
        bnb_4bit_use_double_quant=True,
    )

    # Memória híbrida: VRAM local + RAM (offload) - permite bases maiores se necessário
    max_memory = {}
    if device == "cuda":
        max_memory[0] = resolve_gpu_memory()
    if args.cpu_offload in ("auto", "on"):
        import psutil  # noqa
        ram = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / 1e9 if hasattr(os, "sysconf") else 0
        try:
            ram = psutil.virtual_memory().total / 1e9
        except Exception:
            pass
        if ram and args.cpu_offload == "on":
            max_memory["cpu"] = f"{int(ram * 0.75)}GiB"
        print(f"Memória híbrida: GPU={max_memory.get(0)} CPU_offload={'auto' if args.cpu_offload=='auto' else max_memory.get('cpu')}")

    model = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        quantization_config=bnb if device == "cuda" else None,
        device_map="auto",
        max_memory=max_memory if max_memory else None,
        trust_remote_code=True,
        torch_dtype=torch.bfloat16 if device == "cuda" else torch.float32,
        attn_implementation="sdpa",
    )
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True,
                                            gradient_checkpointing_kwargs={"use_reentrant": False})

    lora = LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    )
    model = get_peft_model(model, lora)
    model.print_trainable_parameters()

    with open(DATA, encoding="utf-8") as f:
        samples = json.load(f)
    print(f"Dataset OFICIAL: {len(samples)} pares")
    train_ds = OficialDataset(samples, tokenizer, args.max_length)

    training_args = TrainingArguments(
        output_dir=str(OUTPUT_DIR),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        lr_scheduler_type="cosine",
        warmup_steps=25,
        weight_decay=0.01,
        bf16=(device == "cuda"),
        gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False},
        logging_steps=20,
        save_strategy="steps",
        save_steps=200,
        save_total_limit=2,
        report_to=[],
        optim="paged_adamw_8bit",
        max_grad_norm=0.3,
        # 0 workers: no Windows, o spawn de subprocesso recarrega o torch e estoura o
        # arquivo de paginação (WinError 1455). Sem workers o treino roda no processo principal.
        dataloader_num_workers=0,
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

    print("\nIniciando treino...")
    trainer.train(resume_from_checkpoint=args.resume)

    final_dir = OUTPUT_DIR / "final"
    model.save_pretrained(str(final_dir))
    tokenizer.save_pretrained(str(final_dir))
    import peft, transformers
    escrever_train_meta(
        final_dir, dataset=DATA, base_model=args.base_model, semente=args.seed, amostras=len(train_ds),
        hiperparametros={"epochs": args.epochs, "batch_size": args.batch_size, "grad_accum": args.grad_accum, "max_length": args.max_length,
                         "lr": args.lr, "lora_r": 16, "lora_alpha": 32, "lora_dropout": 0.05},
        mascara=dict(train_ds.stats), log_history=trainer.state.log_history, inicio=inicio,
        versoes={"torch": torch.__version__, "transformers": transformers.__version__, "peft": peft.__version__},
    )
    print(f"\n✅ Treino concluído. LoRA salvo em {final_dir} (train_meta.json grava dataset, semente, versões e perda final)")


if __name__ == "__main__":
    main()
