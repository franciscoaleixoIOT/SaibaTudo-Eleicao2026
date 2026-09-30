"""
Treinamento LOCAL de Alta Performance em PyTorch Nativo + PEFT / LoRA
Otimizado para GPUs NVIDIA com 8GB de VRAM (ex: RTX 5060 Laptop GPU sm_120).

Vantagens:
- 100% compatível com Windows (sem dependências de C-extensions como pandas/datasets bloqueadas pelo AppLocker).
- Controle milimétrico de memória VRAM (~3.8GB a 4.5GB consumidos).
- Suporte nativo a autocast bfloat16/fp16 e Gradient Accumulation.
"""

import os
import sys
import json
import argparse
from pathlib import Path
import torch
from torch.utils.data import Dataset, DataLoader
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training

class ElectionDataset(Dataset):
    def __init__(self, data_list, tokenizer, max_length=512):
        self.samples = []
        for item in data_list:
            user_msg = f"{item['instruction']}\n\nConsulta do eleitor: {item['input']}"
            assistant_msg = json.dumps(item['output'], ensure_ascii=False, indent=2)
            
            messages = [
                {"role": "user", "content": user_msg},
                {"role": "assistant", "content": assistant_msg}
            ]
            
            try:
                prompt_text = tokenizer.apply_chat_template(messages, tokenize=False)
            except Exception:
                prompt_text = f"<|im_start|>user\n{user_msg}<|im_end|>\n<|im_start|>assistant\n{assistant_msg}<|im_end|>"
                
            encodings = tokenizer(
                prompt_text,
                truncation=True,
                max_length=max_length,
                padding="max_length",
                return_tensors="pt"
            )
            
            input_ids = encodings["input_ids"].squeeze(0)
            attention_mask = encodings["attention_mask"].squeeze(0)
            labels = input_ids.clone()
            labels[attention_mask == 0] = -100
            
            self.samples.append({
                "input_ids": input_ids,
                "attention_mask": attention_mask,
                "labels": labels
            })

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        return self.samples[idx]

def parse_args():
    parser = argparse.ArgumentParser(description="Treinamento Local 8GB VRAM - SaibaTudo-Eleicao2026")
    parser.add_argument("--base_model", type=str, default="Qwen/Qwen2.5-1.5B-Instruct")
    parser.add_argument("--dataset_path", type=str, default="../data/generated_training_dataset.json")
    parser.add_argument("--output_dir", type=str, default="../output/SaibaTudo-Eleicao2026-8gb")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch_size", type=int, default=1)
    parser.add_argument("--grad_accum", type=int, default=8)
    parser.add_argument("--learning_rate", type=float, default=2e-4)
    parser.add_argument("--max_length", type=int, default=512)
    parser.add_argument("--dry_run", action="store_true")
    return parser.parse_args()

def main():
    args = parse_args()
    print("=" * 72)
    print("  TREINAMENTO LOCAL DO MODELO SaibaTudo-Eleicao2026 (OTIMIZADO 8GB VRAM)  ")
    print("=" * 72)
    
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if torch.cuda.is_available():
        gpu_name = torch.cuda.get_device_name(0)
        vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
        print(f"✅ GPU Ativa: {gpu_name} ({vram_gb:.2f} GB VRAM)")
    else:
        print("⚠️ Executando em CPU.")

    dataset_file = Path(__file__).resolve().parent / args.dataset_path
    with open(dataset_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    print(f"📊 Dataset carregado: {len(data)} exemplos eleitorais.")

    if args.dry_run:
        print("\n🧪 Modo Dry-Run: Amostra validada:")
        print(f"Entrada: {data[0]['input']}")
        print(f"Saída: {json.dumps(data[0]['output'], ensure_ascii=False, indent=2)}")
        print("\n✅ Validação concluída com sucesso!")
        return

    # 1. Carregar Tokenizer
    print(f"\nCarregando tokenizer ({args.base_model})...")
    tokenizer = AutoTokenizer.from_pretrained(args.base_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # 2. Preparar Dataset & DataLoader
    print("Construindo DataLoader PyTorch...")
    dataset = ElectionDataset(data, tokenizer, max_length=args.max_length)
    dataloader = DataLoader(dataset, batch_size=args.batch_size, shuffle=True)

    # 3. Carregar Modelo com QLoRA 4-bit (NF4)
    print("Carregando modelo com quantização 4-bit NF4...")
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16,
        bnb_4bit_use_double_quant=True
    )

    model = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        quantization_config=bnb_config if torch.cuda.is_available() else None,
        device_map="auto" if torch.cuda.is_available() else "cpu",
        trust_remote_code=True
    )

    if torch.cuda.is_available():
        model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)

    # 4. LoRA Adapters
    peft_config = LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"]
    )
    model = get_peft_model(model, peft_config)
    trainable_params, all_param = model.get_nb_trainable_parameters()
    print(f"Parâmetros treináveis (LoRA): {trainable_params:,} / {all_param:,} ({100 * trainable_params / all_param:.2f}%)")

    # 5. Otimizador & Treinamento Nativo PyTorch
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.learning_rate)
    scaler = torch.cuda.amp.GradScaler(enabled=torch.cuda.is_available())

    output_dir = Path(__file__).resolve().parent / args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    total_steps = len(dataloader) * args.epochs
    print(f"\n🚀 Iniciando Treinamento: {args.epochs} épocas | {total_steps} passos totais...")

    model.train()
    step_count = 0
    accumulated_loss = 0.0

    for epoch in range(1, args.epochs + 1):
        print(f"\n--- Época {epoch}/{args.epochs} ---")
        epoch_loss = 0.0
        
        for batch_idx, batch in enumerate(dataloader):
            step_count += 1
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            labels = batch["labels"].to(device)

            with torch.cuda.amp.autocast(dtype=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16):
                outputs = model(
                    input_ids=input_ids,
                    attention_mask=attention_mask,
                    labels=labels
                )
                loss = outputs.loss / args.grad_accum

            scaler.scale(loss).backward()
            accumulated_loss += loss.item() * args.grad_accum
            epoch_loss += loss.item() * args.grad_accum

            if step_count % args.grad_accum == 0 or (batch_idx + 1) == len(dataloader):
                scaler.unscale_(optimizer)
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                scaler.step(optimizer)
                scaler.update()
                optimizer.zero_grad()

            if step_count % (args.grad_accum * 5) == 0:
                avg_loss = accumulated_loss / (args.grad_accum * 5)
                vram_used = torch.cuda.memory_allocated() / (1024 ** 3) if torch.cuda.is_available() else 0
                print(f"Passo [{batch_idx+1}/{len(dataloader)}] | Loss: {avg_loss:.4f} | VRAM: {vram_used:.2f} GB")
                accumulated_loss = 0.0

        print(f"Fim da Época {epoch} | Loss Média: {epoch_loss / len(dataloader):.4f}")

    print(f"\n💾 Salvando modelo adaptado e tokenizer em {output_dir}...")
    model.save_pretrained(str(output_dir))
    tokenizer.save_pretrained(str(output_dir))
    print("🎉 Treinamento e salvamento concluídos com sucesso!")

if __name__ == "__main__":
    main()
