"""
Script para publicação automática do modelo SaibaTudo-Eleicao2026 no Hugging Face Hub.
"""

import os
import argparse
from pathlib import Path
from huggingface_hub import HfApi, create_repo, get_token

def get_hf_token():
    token = os.getenv("HF_TOKEN") or get_token()
    if not token:
        try:
            import subprocess
            out = subprocess.check_output(["hf", "auth", "token"], text=True)
            for line in out.splitlines():
                l = line.strip()
                if l.startswith("hf_"):
                    token = l
                    break
        except Exception:
            pass
    return token

def push_to_huggingface(model_dir: str, repo_id: str, private: bool = False):
    token = get_hf_token()
    if not token:
        raise ValueError("Token do Hugging Face não encontrado. Faça login com `hf auth login` ou configure a variável `HF_TOKEN`.")

    api = HfApi(token=token)

    print(f"Garantindo repositório '{repo_id}' no Hugging Face Hub...")
    create_repo(repo_id=repo_id, token=token, repo_type="model", private=private, exist_ok=True)

    model_input = Path(model_dir)
    model_path = model_input.resolve() if model_input.exists() else (Path(__file__).resolve().parent / model_dir).resolve()
    print(f"Fazendo upload dos arquivos de {model_path} para {repo_id}...")
    api.upload_folder(
        folder_path=str(model_path),
        repo_id=repo_id,
        repo_type="model",
        commit_message="Initial release of SaibaTudo-Eleicao2026 model"
    )

    readme_path = Path(__file__).resolve().parent.parent / "README.md"
    if readme_path.exists():
        print("Enviando Model Card README.md atualizado...")
        api.upload_file(
            path_or_fileobj=str(readme_path),
            path_in_repo="README.md",
            repo_id=repo_id,
            repo_type="model",
            commit_message="Add Hugging Face Model Card with TSE 2026 specs"
        )

    print(f"Modelo publicado com sucesso em: https://huggingface.co/{repo_id}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Publicar SaibaTudo-Eleicao2026 no Hugging Face Hub")
    parser.add_argument("--model_dir", type=str, default="../output/SaibaTudo-Eleicao2026-merged", help="Pasta com os pesos salvos")
    parser.add_argument("--repo_id", type=str, default="franciscoaleixo/SaibaTudo-Eleicao2026", help="Nome do repositório no HF")
    parser.add_argument("--private", action="store_true", help="Criar repositório privado se especificado")
    args = parser.parse_args()

    push_to_huggingface(args.model_dir, args.repo_id, args.private)
