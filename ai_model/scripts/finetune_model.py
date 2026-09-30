"""
Script de fine-tuning para o modelo SaibaTudo-Eleicao2026 usando Hugging Face PEFT/LoRA.
"""

import os
import json
import argparse
from pathlib import Path
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

def parse_args():
    parser = argparse.ArgumentParser(description="Fine-tune SaibaTudo-Eleicao2026")
    parser.add_argument("--base_model", type=str, default="meta-llama/Llama-3.2-1B-Instruct", help="Modelo base do HF")
    parser.add_argument("--data_file", type=str, default="../data/training_samples.json", help="Caminho para o dataset JSON")
    parser.add_argument("--output_dir", type=str, default="../output/SaibaTudo-Eleicao2026", help="Diretório de saída")
    parser.add_argument("--epochs", type=int, default=3, help="Número de épocas")
    parser.add_argument("--batch_size", type=int, default=4, help="Batch size por dispositivo")
    parser.add_argument("--learning_rate", type=float, default=2e-4, help="Learning rate")
    return parser.parse_args()

def format_prompt(sample, tokenizer):
    user_msg = f"{sample['instruction']}\n\nConsulta do eleitor: {sample['input']}"
    assistant_msg = json.dumps(sample['output'], ensure_ascii=False, indent=2)
    
    messages = [
        {"role": "user", "content": user_msg},
        {"role": "assistant", "content": assistant_msg}
    ]
    return tokenizer.apply_chat_template(messages, tokenize=False)

def main():
    args = parse_args()
    print(f"Iniciando fine-tuning do modelo SaibaTudo-Eleicao2026...")
    print(f"Modelo base: {args.base_model}")

    # Carregar dados
    data_path = Path(__file__).resolve().parent / args.data_file
    with open(data_path, "r", encoding="utf-8") as f:
        raw_data = json.load(f)

    # Tokenizer
    tokenizer = AutoTokenizer.from_pretrained(args.base_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    formatted_texts = [format_prompt(item, tokenizer) for item in raw_data]
    dataset = Dataset.from_dict({"text": formatted_texts})

    # Quantização 4-bit para treino eficiente
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_use_double_quant=True
    )

    model = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        quantization_config=bnb_config if torch.cuda.is_available() else None,
        device_map="auto" if torch.cuda.is_available() else "cpu",
        trust_remote_code=True
    )
    
    if torch.cuda.is_available():
        model = prepare_model_for_kbit_training(model)

    peft_config = LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"]
    )
    model = get_peft_model(model, peft_config)

    training_args = TrainingArguments(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=2,
        learning_rate=args.learning_rate,
        logging_steps=10,
        save_strategy="epoch",
        fp16=torch.cuda.is_available(),
        optim="paged_adamw_8bit" if torch.cuda.is_available() else "adamw_torch",
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

    print("Treinando...")
    trainer.train()

    print(f"Salvando modelo treinado em {args.output_dir}...")
    trainer.model.save_pretrained(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)
    print("Fine-tuning concluído com sucesso!")

if __name__ == "__main__":
    main()
