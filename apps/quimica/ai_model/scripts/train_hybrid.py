# -*- coding: utf-8 -*-
"""
Treinamento HÍBRIDO LOCAL (GPU RTX 5060 de 8 GB + RAM do sistema) — SaibaTudo Química
======================================================================================
Fine-tuning QLoRA 4-bit (NF4) dos DOIS modelos do projeto, sobre os conjuntos montados por backend/retrain/:

  --target nlu   interpretação de perguntas (intenção + entidades em JSON)   base Qwen/Qwen2.5-1.5B-Instruct       dataset backend/retrain/out-nlu/train.json
  --target ask   explicador ancorado em trechos licenciados                  base Qwen/Qwen3-4B-Instruct-2507      dataset backend/retrain/out-ask/train.json
                 (max_length 1024, batch 1 + acúmulo de gradiente, checkpoint de ativações)

  - Memória híbrida: VRAM da GPU + offload para RAM (accelerate) quando necessário.
  - Gradient checkpointing + bf16 (NVIDIA Blackwell, sm_120).
  - LoRA em todos os módulos lineares (q,k,v,o,gate,up,down).
  - A perda é calculada SÓ na saída (treino_utils.mascarar_prompt): o prompt (sistema, trechos, pergunta) leva -100.
  - Reproduzível: semente fixa e train_meta.json (sha256 do dataset, base, hiperparâmetros, commit, versões, perda final) ao lado do LoRA.
  - Nunca sobrescreve um treino anterior: se a saída já existe, renomeie a pasta ou passe --sobrescrever.

Uso (Python do ambiente de treino, ai_model/.venv):
  python ai_model/scripts/train_hybrid.py --target nlu --version nlu-v1-20261101 > ai_model/output/treino_nlu-v1.log
  python ai_model/scripts/train_hybrid.py --target ask --version ask-v1-20261101 > ai_model/output/treino_ask-v1.log
IMPEDIR a suspensão do Windows durante o treino (o notebook suspendeu uma vez e congelou o treino por horas).
"""
import argparse
import json
import re
import shutil
import time
from collections import Counter
from pathlib import Path

from treino_utils import escrever_train_meta, mascarar_prompt, montar_textos

BASE = Path(__file__).resolve().parent.parent          # ai_model/
RAIZ = BASE.parent                                      # raiz do repositório

# Predefinições por modelo. Tudo pode ser sobrescrito pela linha de comando.
PRESETS = {
    "nlu": {
        "base_model": "Qwen/Qwen2.5-1.5B-Instruct",
        "dataset": RAIZ / "backend" / "retrain" / "out-nlu" / "train.json",
        "output_dir": BASE / "output" / "SaibaTudo-Quimica-NLU-hybrid",
        "max_length": 256, "epochs": 3.0, "batch_size": 4, "grad_accum": 4, "lr": 2e-4,
    },
    "ask": {
        "base_model": "Qwen/Qwen3-4B-Instruct-2507",
        "dataset": RAIZ / "backend" / "retrain" / "out-ask" / "train.json",
        "output_dir": BASE / "output" / "SaibaTudo-Quimica-Ask-hybrid",
        "max_length": 1024, "epochs": 2.0, "batch_size": 1, "grad_accum": 16, "lr": 1e-4,
    },
}
RX_VERSAO = re.compile(r"^(nlu|ask)-v\d+-\d{8}$")


def montar_argumentos(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--target", choices=sorted(PRESETS), required=True)
    p.add_argument("--version", required=True, help="nome da versão que este treino vai gerar: nlu-v1-AAAAMMDD ou ask-v1-AAAAMMDD")
    p.add_argument("--base_model", default=None, help="padrão: o da predefinição do --target")
    p.add_argument("--dataset", default=None, help="array JSON de {instruction,input,output} (padrão: backend/retrain/out-<target>/train.json)")
    p.add_argument("--output_dir", default=None)
    p.add_argument("--epochs", type=float, default=None)
    p.add_argument("--batch_size", type=int, default=None)
    p.add_argument("--grad_accum", type=int, default=None)
    p.add_argument("--max_length", type=int, default=None)
    p.add_argument("--lr", type=float, default=None)
    p.add_argument("--cpu_offload", default="auto", choices=["auto", "on", "off"], help="Híbrido: offload de camadas para a RAM do sistema.")
    p.add_argument("--resume", default=None)
    p.add_argument("--seed", type=int, default=2026, help="semente (gravada em train_meta.json): mesmo dataset + mesma semente = mesmo treino")
    p.add_argument("--sobrescrever", action="store_true", help="permite reaproveitar a pasta de saída de um treino anterior")
    a = p.parse_args(argv)
    m = re.match(RX_VERSAO, a.version)
    if not m or m.group(1) != a.target:
        p.error(f"--version inválida para --target {a.target}: {a.version!r} (esperado {a.target}-v<N>-AAAAMMDD)")
    pre = PRESETS[a.target]
    for k in ("base_model", "dataset", "output_dir", "epochs", "batch_size", "grad_accum", "max_length", "lr"):
        if getattr(a, k) is None:
            setattr(a, k, pre[k])
    a.dataset, a.output_dir = Path(a.dataset), Path(a.output_dir)
    return a


def resolve_gpu_memory(torch):
    """VRAM disponível na RTX local (com margem para o sistema)."""
    if torch.cuda.is_available():
        total = torch.cuda.get_device_properties(0).total_memory / 1e9
        return f"{max(4.0, total * 0.88 - 0.6):.2f}GiB"
    return "0GiB"


def carregar_amostras(caminho: Path) -> list:
    amostras = json.loads(caminho.read_text(encoding="utf-8"))
    if not isinstance(amostras, list) or not amostras:
        raise SystemExit(f"{caminho} não é um array JSON com amostras")
    for i, s in enumerate(amostras[:50]):
        if not all(isinstance(s.get(k), str) and s[k] for k in ("instruction", "input", "output")):
            raise SystemExit(f"amostra {i} sem instruction/input/output em {caminho}")
    return amostras


def main(argv=None):
    a = montar_argumentos(argv)
    if (a.output_dir / "final").exists() and not a.sobrescrever:
        raise SystemExit(f"{a.output_dir / 'final'} já existe: renomeie a pasta do treino anterior ou passe --sobrescrever")
    if not a.dataset.exists():
        raise SystemExit(f"dataset ausente: {a.dataset} (rode backend/retrain/build_{a.target}_dataset.py antes)")

    # imports pesados só aqui: o resto do módulo (argumentos, predefinições) roda sem torch
    import os
    import torch
    from torch.utils.data import Dataset
    from transformers import (AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, DataCollatorForSeq2Seq, Trainer, TrainingArguments,
                              set_seed)
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    import peft
    import transformers

    class OficialDataset(Dataset):
        """Pares (instruction, input, output) -> ChatML do Qwen, com a perda só na saída (-100 no prompt). Amostras truncadas antes da saída
        (max_length curto) são descartadas: um lote só com -100 dá perda NaN."""

        def __init__(self, samples, tokenizer, max_length):
            self.stats = Counter()
            self.itens = []
            for s in samples:
                alvo = s["output"] if isinstance(s["output"], str) else json.dumps(s["output"], ensure_ascii=False)
                prompt, completo = montar_textos(s["instruction"], s["input"], alvo)
                ids, labels, mask, status = mascarar_prompt(tokenizer, prompt, completo, max_length)
                self.stats[status] += 1
                if status != "truncado":
                    self.itens.append({"input_ids": ids, "labels": labels, "attention_mask": mask})
            print(f"Máscara do prompt: {dict(self.stats)} -> {len(self.itens)} amostras de treino")
            if self.stats["truncado"]:
                print(f"AVISO: {self.stats['truncado']} amostras truncadas antes da saída; aumente --max_length se forem muitas")

        def __len__(self):
            return len(self.itens)

        def __getitem__(self, idx):
            return self.itens[idx]

    set_seed(a.seed)
    inicio = time.time()
    print("=" * 70)
    print(f"  TREINO HÍBRIDO SaibaTudo Química [{a.target}] {a.version} (RTX + RAM, QLoRA 4-bit NF4)")
    print("=" * 70)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Dispositivo: {device}" + (f" ({torch.cuda.get_device_name(0)})" if device == "cuda" else ""))
    print(f"Base: {a.base_model} | dataset: {a.dataset} | max_length {a.max_length} | épocas {a.epochs}")

    tokenizer = AutoTokenizer.from_pretrained(a.base_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    bnb = BitsAndBytesConfig(
        load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=torch.bfloat16 if device == "cuda" else torch.float32,
        bnb_4bit_use_double_quant=True,
    )

    # Memória híbrida: VRAM local + RAM (offload) — permite bases maiores se necessário
    max_memory = {}
    if device == "cuda":
        max_memory[0] = resolve_gpu_memory(torch)
    if a.cpu_offload in ("auto", "on"):
        ram = 0
        try:
            import psutil

            ram = psutil.virtual_memory().total / 1e9
        except Exception:  # noqa: BLE001
            ram = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / 1e9 if hasattr(os, "sysconf") else 0
        if ram and a.cpu_offload == "on":
            max_memory["cpu"] = f"{int(ram * 0.75)}GiB"
        print(f"Memória híbrida: GPU={max_memory.get(0)} CPU_offload={'auto' if a.cpu_offload == 'auto' else max_memory.get('cpu')}")

    model = AutoModelForCausalLM.from_pretrained(
        a.base_model, quantization_config=bnb if device == "cuda" else None, device_map="auto", max_memory=max_memory or None,
        trust_remote_code=True, torch_dtype=torch.bfloat16 if device == "cuda" else torch.float32, attn_implementation="sdpa",
    )
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True, gradient_checkpointing_kwargs={"use_reentrant": False})
    lora = LoraConfig(
        r=16, lora_alpha=32, lora_dropout=0.05, bias="none", task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    )
    model = get_peft_model(model, lora)
    model.print_trainable_parameters()

    samples = carregar_amostras(a.dataset)
    print(f"Dataset: {len(samples)} pares")
    train_ds = OficialDataset(samples, tokenizer, a.max_length)

    if a.output_dir.exists() and a.sobrescrever:
        shutil.rmtree(a.output_dir / "final", ignore_errors=True)
    training_args = TrainingArguments(
        output_dir=str(a.output_dir), num_train_epochs=a.epochs, per_device_train_batch_size=a.batch_size, gradient_accumulation_steps=a.grad_accum,
        learning_rate=a.lr, lr_scheduler_type="cosine", warmup_steps=25, weight_decay=0.01, bf16=(device == "cuda"), gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False}, logging_steps=20, save_strategy="steps", save_steps=200, save_total_limit=2,
        report_to=[], optim="paged_adamw_8bit", max_grad_norm=0.3,
        # 0 workers: no Windows, o spawn de subprocesso recarrega o torch e estoura o arquivo de paginação (WinError 1455).
        dataloader_num_workers=0, remove_unused_columns=False, seed=a.seed, data_seed=a.seed,
    )
    trainer = Trainer(model=model, args=training_args, train_dataset=train_ds, data_collator=DataCollatorForSeq2Seq(tokenizer, padding=True, label_pad_token_id=-100))

    print("\nIniciando treino...")
    trainer.train(resume_from_checkpoint=a.resume)

    final_dir = a.output_dir / "final"
    model.save_pretrained(str(final_dir))
    tokenizer.save_pretrained(str(final_dir))
    escrever_train_meta(
        final_dir, dataset=a.dataset, base_model=a.base_model, semente=a.seed, amostras=len(train_ds), alvo=a.target, versao=a.version,
        hiperparametros={"epochs": a.epochs, "batch_size": a.batch_size, "grad_accum": a.grad_accum, "max_length": a.max_length, "lr": a.lr,
                         "lora_r": 16, "lora_alpha": 32, "lora_dropout": 0.05},
        mascara=dict(train_ds.stats), log_history=trainer.state.log_history, inicio=inicio,
        versoes={"torch": torch.__version__, "transformers": transformers.__version__, "peft": peft.__version__},
    )
    print(f"\nTreino concluído. LoRA salvo em {final_dir} (train_meta.json grava dataset, semente, versões e perda final)")
    print(f"Próximo passo: python ai_model/scripts/merge_and_export.py --target {a.target}")


if __name__ == "__main__":
    main()
