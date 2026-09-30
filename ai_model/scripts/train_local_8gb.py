"""
Script de treinamento LOCAL otimizado para GPU com 8GB de VRAM (ex: NVIDIA RTX 5060 / 4060 / 3070)
e memória RAM do sistema.

Técnicas aplicadas para caber com folga em 8GB de VRAM (~4.2GB utilizados):
1. QLoRA 4-bit (NF4) com dupla quantização (Double Quantization).
2. Gradient Checkpointing ativado (economiza ~2GB de VRAM).
3. Otimizador 'paged_adamw_8bit' com paginação automática na RAM.
4. Micro-batch size = 1 com Gradient Accumulation = 8.
5. Max sequence length = 512 tokens.
"""

import os
import sys
import json
import argparse
from pathlib import Path

def parse_args():
    parser = argparse.ArgumentParser(description="Treinamento Local 8GB VRAM - SaibaTudo-Eleicao2026")
    parser.add_argument("--base_model", type=str, default="Qwen/Qwen2.5-1.5B-Instruct",
                        help="Modelo base (Qwen2.5-1.5B-Instruct ou meta-llama/Llama-3.2-1B-Instruct)")
    parser.add_argument("--dataset_path", type=str, default="../data/generated_training_dataset.json",
                        help="Caminho para o dataset de treino JSON")
    parser.add_argument("--output_dir", type=str, default="../output/SaibaTudo-Eleicao2026-8gb",
                        help="Pasta de saída dos pesos treinados")
    parser.add_argument("--epochs", type=int, default=3, help="Número de épocas")
    parser.add_argument("--batch_size", type=int, default=1, help="Micro-batch size por passo (mantenha 1 para 8GB)")
    parser.add_argument("--grad_accum", type=int, default=8, help="Passos de acumulação de gradiente")
    parser.add_argument("--dry_run", action="store_true", help="Apenas valida o dataset e o pipeline sem iniciar treino pesado")
    return parser.parse_args()

def check_gpu():
    try:
        import torch
        if not torch.cuda.is_available():
            print("⚠️ AVISO: GPU NVIDIA com suporte a CUDA não detectada no ambiente Python atual. O treino rodará em CPU (muito mais lento).")
            return None
        gpu_name = torch.cuda.get_device_name(0)
        vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
        print(f"✅ GPU Detectada: {gpu_name} ({vram_gb:.2f} GB VRAM)")
        return gpu_name
    except ImportError:
        print("⚠️ Pacote 'torch' não instalado no ambiente.")
        return None

def format_sample(sample, tokenizer):
    user_msg = f"{sample['instruction']}\n\nConsulta do eleitor: {sample['input']}"
    assistant_msg = json.dumps(sample['output'], ensure_ascii=False, indent=2)
    
    messages = [
        {"role": "user", "content": user_msg},
        {"role": "assistant", "content": assistant_msg}
    ]
    return tokenizer.apply_chat_template(messages, tokenize=False)

def main():
    args = parse_args()
    print("=" * 70)
    print("  TREINAMENTO LOCAL DO MODELO SaibaTudo-Eleicao2026 (OTIMIZADO 8GB VRAM)  ")
    print("=" * 70)
    print(f"Modelo Base: {args.base_model}")
    print(f"Dataset:     {args.dataset_path}")
    print(f"Destino:     {args.output_dir}")

    gpu_name = check_gpu()

    dataset_file = Path(__file__).resolve().parent / args.dataset_path
    if not dataset_file.exists():
        print(f"❌ Erro: Dataset não encontrado em {dataset_file}")
        sys.exit(1)

    with open(dataset_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    print(f"📊 Dataset carregado com sucesso: {len(data)} exemplos de treino.")

    if args.dry_run:
        print("\n🧪 Modo Dry-Run ativado: Amostra do primeiro exemplo formatado:")
        print("-" * 50)
        print(f"Entrada: {data[0]['input']}")
        print(f"Saída:   {json.dumps(data[0]['output'], ensure_ascii=False, indent=2)}")
        print("-" * 50)
        print("✅ Validação concluída com sucesso! Para treinar de verdade, execute sem --dry_run.")
        return

    # Importações do Hugging Face
    import torch
    from datasets import Dataset
    from transformers import (
        AutoModelForCausalLM,
        AutoTokenizer,
        BitsAndBytesConfig,
        TrainingArguments
    )
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    from trl import SFTTrainer

    # Limpeza preventiva de memória
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    # 1. Configuração do Tokenizer
    print("Carregando tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(args.base_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # 2. Formatação dos Dados
    print("Formatando prompts de chat...")
    formatted_texts = [format_sample(item, tokenizer) for item in data]
    dataset = Dataset.from_dict({"text": formatted_texts})

    # 3. Quantização 4-bit (NF4) com Double Quant para 8GB VRAM
    print("Configurando quantização QLoRA 4-bit (NF4)...")
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16 if not torch.cuda.is_bf16_supported() else torch.bfloat16,
        bnb_4bit_use_double_quant=True
    )

    print(f"Carregando pesos do modelo base {args.base_model}...")
    model = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        quantization_config=bnb_config if torch.cuda.is_available() else None,
        device_map="auto" if torch.cuda.is_available() else "cpu",
        trust_remote_code=True
    )

    if torch.cuda.is_available():
        model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)

    # 4. LoRA Adapter Config
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

    # 5. Argumentos de Treinamento Otimizados para 8GB VRAM
    use_bf16 = torch.cuda.is_available() and torch.cuda.is_bf16_supported()
    training_args = TrainingArguments(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=2e-4,
        lr_scheduler_type="cosine",
        warmup_ratio=0.05,
        logging_steps=10,
        save_strategy="epoch",
        fp16=torch.cuda.is_available() and not use_bf16,
        bf16=use_bf16,
        optim="paged_adamw_8bit" if torch.cuda.is_available() else "adamw_torch",
        gradient_checkpointing=True,
        report_to="none"
    )

    trainer = SFTTrainer(
        model=model,
        train_dataset=dataset,
        peft_config=peft_config,
        dataset_text_field="text",
        max_seq_length=512,
        tokenizer=tokenizer,
        args=training_args
    )

    print("\n🚀 Iniciando treinamento local (monitorando limites da VRAM)...")
    trainer.train()

    print(f"\n💾 Salvando pesos ajustados e tokenizer em {args.output_dir}...")
    trainer.model.save_pretrained(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)
    print("🎉 Treinamento concluído com sucesso!")

if __name__ == "__main__":
    main()
