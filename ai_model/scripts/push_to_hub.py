"""
Script para publicação automática do modelo SaibaTudo-Eleicao2026 no Hugging Face Hub.
"""

import os
import argparse
from pathlib import Path
from huggingface_hub import HfApi, create_repo

def push_to_huggingface(model_dir: str, repo_id: str, private: bool = False):
    token = os.getenv("HF_TOKEN")
    if not token:
        raise ValueError("A variável de ambiente HF_TOKEN não foi encontrada. Configure com `export HF_TOKEN=seu_token` ou `huggingface-cli login`.")

    api = HfApi(token=token)

    print(f"Garantindo repositório '{repo_id}' no Hugging Face Hub...")
    create_repo(repo_id=repo_id, token=token, repo_type="model", private=private, exist_ok=True)

    print(f"Fazendo upload dos arquivos de {model_dir} para {repo_id}...")
    api.upload_folder(
        folder_path=model_dir,
        repo_id=repo_id,
        repo_type="model",
        commit_message="Initial release of SaibaTudo-Eleicao2026 model"
    )

    readme_path = Path(__file__).resolve().parent.parent / "README.md"
    if readme_path.exists():
        print("Enviando Model Card README.md...")
        api.upload_file(
            path_or_fileobj=str(readme_path),
            path_in_repo="README.md",
            repo_id=repo_id,
            repo_type="model",
            commit_message="Add Hugging Face Model Card"
        )

    print(f"Modelo publicado com sucesso em: https://huggingface.co/{repo_id}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Publicar SaibaTudo-Eleicao2026 no Hugging Face Hub")
    parser.add_argument("--model_dir", type=str, default="../output/SaibaTudo-Eleicao2026-8gb", help="Pasta com os pesos salvos")
    parser.add_argument("--repo_id", type=str, default="franciscoaleixoIOT/SaibaTudo-Eleicao2026", help="Nome do repositório no HF")
    parser.add_argument("--private", action="store_true", help="Criar repositório privado se especificado")
    args = parser.parse_args()

    push_to_huggingface(args.model_dir, args.repo_id, args.private)
