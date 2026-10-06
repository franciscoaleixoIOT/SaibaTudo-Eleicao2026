# -*- coding: utf-8 -*-
"""
Treino sob demanda do NLU no Modal (GPU L4, minutos), como job pontual: dataset no Volume -> QLoRA -> merge -> publica numa BRANCH NOVA
do Hugging Face (nunca sobrescreve `main`, que é o modelo em produção) -> imprime o SHA para o convert_gguf.py (gate bloqueante).

STATUS: o PLANO (comandos, caminhos, nomes) é testado em test_train_job.py. A EXECUÇÃO na GPU do Modal NÃO foi verificada: exige créditos de GPU
e o segredo do Hugging Face. O treino local (RTX) continua sendo o caminho já exercitado; use este job quando a máquina local não estiver disponível.
Custo: L4 ~US$ 0,80/h; um treino de 3 épocas do 1,5B em ~20 mil exemplos é da ordem de dezenas de minutos (estimativa, não medida). Meça antes de
automatizar. Nunca dispare entre 20/10 e 26/10 (congelamento do 2º turno; docs/OPERACAO.md §6).

Pré-requisitos:
  modal secret create saibatudo-hf HF_TOKEN=hf_xxx            # token com escrita no repositório privado de candidatos
  export HF_SECRET_NAME=saibatudo-hf  (ou HF_TOKEN no ambiente local)
  python backend/retrain/build_nlu_dataset.py --out backend/retrain/out-v22 ...   # gera train.json (com proveniência em meta.json)

Uso:
  modal run backend/modal/train_job.py::main --dataset backend/retrain/out-v22/train.json --run v2.2-20261101 --dry-run   # só mostra o plano
  modal run backend/modal/train_job.py::main --dataset backend/retrain/out-v22/train.json --run v2.2-20261101
Depois:
  modal run backend/modal/convert_gguf.py::main --version v2.2-20261101 --hf-repo <repo> --revision <sha impresso>   # gate; depois ::canary
"""
import json
import os
import re
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent

APP_NAME = "saibatudo-train"
VOLUME_NAME = "saibatudo-train"
DATA_DIR = "/data"
SCRIPTS = "/root/ai_model/scripts"
GPU = "L4"
BASE_MODEL = "Qwen/Qwen2.5-1.5B-Instruct"
# Repositório PRIVADO de candidatos: o modelo em produção (franciscoaleixo/SaibaTudo-Eleicao2026, branch main) nunca é tocado por este job.
HF_REPO_CANDIDATOS = os.environ.get("HF_REPO_CANDIDATOS", "franciscoaleixo/SaibaTudo-NLU-candidatos")
# Versões do ambiente local que treinou o v2.1 (ai_model/.venv). NÃO validadas em imagem Modal: ajuste se o build da imagem falhar.
PINS = ["torch==2.11.0", "transformers==5.17.0", "peft==0.21.1", "bitsandbytes==0.50.2", "accelerate==1.15.0", "huggingface_hub==1.33.0", "psutil==7.2.2"]

NOME_RX = re.compile(r"^v\d+(\.\d+)*-\d{8}$")


def validar_nome(run: str) -> str:
    """Nome da execução = nome da versão do modelo (`v2.2-AAAAMMDD`): vira pasta no Volume e branch no Hugging Face."""
    if not NOME_RX.match(run):
        raise ValueError(f"nome de execução inválido: {run!r} (esperado vN.M-AAAAMMDD, ex.: v2.2-20261101)")
    return run


def plano(run: str, *, dataset_no_volume: str, base_model: str = BASE_MODEL, epochs: float = 3.0, seed: int = 2026,
          max_length: int = 256, batch_size: int = 8, grad_accum: int = 2, lr: float = 2e-4, python: str = "python") -> dict:
    """Comandos e caminhos do job, em ordem. Pura: testável sem Modal nem GPU."""
    run = validar_nome(run)
    pasta = f"{DATA_DIR}/runs/{run}"
    lora_origem = "/root/ai_model/output/SaibaTudo-Eleicao2026-hybrid/final"  # onde train_hybrid.py grava
    return {
        "run": run,
        "pasta": pasta,
        "lora": f"{pasta}/lora",
        "merged": f"{pasta}/merged",
        "branch": run,
        "passos": [
            ("treinar", [python, f"{SCRIPTS}/train_hybrid.py", "--base_model", base_model, "--dataset", dataset_no_volume,
                         "--epochs", str(epochs), "--batch_size", str(batch_size), "--grad_accum", str(grad_accum), "--max_length", str(max_length),
                         "--lr", str(lr), "--cpu_offload", "off", "--seed", str(seed)]),
            ("guardar_lora", ["cp", "-r", lora_origem, f"{pasta}/lora"]),
            ("fundir", [python, f"{SCRIPTS}/merge_and_export.py", "--base_model", base_model, "--lora_dir", f"{pasta}/lora", "--output_dir", f"{pasta}/merged"]),
        ],
    }


def resumo_do_plano(p: dict) -> str:
    linhas = [f"Execução {p['run']} (GPU {GPU}); saídas em {p['pasta']} do Volume {VOLUME_NAME}; publicação na branch '{p['branch']}' de {HF_REPO_CANDIDATOS} (privado)."]
    for nome, cmd in p["passos"]:
        linhas.append(f"  {nome}: {' '.join(cmd)}")
    linhas.append(f"  publicar: upload de {p['merged']} para {HF_REPO_CANDIDATOS}@{p['branch']}  (nunca main)")
    return "\n".join(linhas)


# ---------------------------------------------------------------------------------------------------------------------------------
# Execução no Modal (não verificada na GPU; ver STATUS acima)
# ---------------------------------------------------------------------------------------------------------------------------------
try:
    import modal
except ImportError:  # os testes do plano rodam sem o pacote modal
    modal = None

if modal is not None:
    image = (
        modal.Image.debian_slim(python_version="3.12")
        .pip_install(*PINS)
        .add_local_dir(str(REPO_ROOT / "ai_model" / "scripts"), SCRIPTS)
        .add_local_file(str(REPO_ROOT / "ai_model" / "README.md"), "/root/ai_model/README.md")
        .add_local_file(str(HERE / "nlu_core.py"), "/root/nlu_core.py")
    )
    app = modal.App(APP_NAME, image=image)
    volume = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)
    if os.environ.get("HF_SECRET_NAME"):
        _SECRETS = [modal.Secret.from_name(os.environ["HF_SECRET_NAME"])]
    elif os.environ.get("HF_TOKEN"):
        _SECRETS = [modal.Secret.from_dict({"HF_TOKEN": os.environ["HF_TOKEN"]})]
    else:
        _SECRETS = []

    @app.function(gpu=GPU, timeout=3 * 3600, volumes={DATA_DIR: volume}, secrets=_SECRETS, max_containers=1)
    def treinar_e_publicar(run: str, dataset_no_volume: str, base_model: str, epochs: float, seed: int, max_length: int, publicar: bool) -> dict:
        import subprocess

        volume.reload()
        p = plano(run, dataset_no_volume=dataset_no_volume, base_model=base_model, epochs=epochs, seed=seed, max_length=max_length)
        if Path(p["pasta"]).exists():
            raise RuntimeError(f"a execução {run} já existe no Volume; escolha outro nome (execuções são imutáveis)")
        Path(p["pasta"]).mkdir(parents=True)
        t0 = time.time()
        for nome, cmd in p["passos"]:
            print(f"$ [{nome}] {' '.join(cmd)}", flush=True)
            subprocess.run(cmd, check=True)
        volume.commit()
        resultado = {"run": run, "segundos": round(time.time() - t0), "lora": p["lora"], "merged": p["merged"]}
        meta = Path(p["lora"]) / "train_meta.json"
        if meta.exists():
            resultado["train_meta"] = json.loads(meta.read_text(encoding="utf-8"))
        if publicar:
            from huggingface_hub import HfApi

            token = os.environ.get("HF_TOKEN")
            if not token:
                raise RuntimeError("HF_TOKEN ausente: defina HF_SECRET_NAME ou HF_TOKEN")
            api = HfApi(token=token)
            api.create_repo(HF_REPO_CANDIDATOS, repo_type="model", private=True, exist_ok=True)
            api.create_branch(HF_REPO_CANDIDATOS, branch=p["branch"], repo_type="model", exist_ok=True)
            info = api.upload_folder(folder_path=p["merged"], repo_id=HF_REPO_CANDIDATOS, repo_type="model", revision=p["branch"],
                                     commit_message=f"{run}: candidato (treino reprodutível, ver train_meta.json)")
            resultado["hf"] = {"repo": HF_REPO_CANDIDATOS, "branch": p["branch"], "commit": getattr(info, "oid", None) or str(info)}
        return resultado

    @app.local_entrypoint()
    def main(dataset: str, run: str, base_model: str = BASE_MODEL, epochs: float = 3.0, seed: int = 2026, max_length: int = 256,
             dry_run: bool = False, sem_publicar: bool = False):
        """Treina, funde e publica numa branch nova. `--dry-run` só imprime o plano."""
        run = validar_nome(run)
        ds = Path(dataset)
        if not ds.exists():
            raise SystemExit(f"dataset não encontrado: {ds}")
        no_volume = f"{DATA_DIR}/datasets/{run}/train.json"
        print(resumo_do_plano(plano(run, dataset_no_volume=no_volume, base_model=base_model, epochs=epochs, seed=seed, max_length=max_length)))
        if dry_run:
            print("\n(dry-run: nada foi enviado nem executado)")
            return
        with volume.batch_upload(force=False) as lote:
            lote.put_file(str(ds), f"/datasets/{run}/train.json")
            meta = ds.with_name("meta.json")
            if meta.exists():
                lote.put_file(str(meta), f"/datasets/{run}/meta.json")  # proveniência do dataset junto do treino
        r = treinar_e_publicar.remote(run, no_volume, base_model, epochs, seed, max_length, not sem_publicar)
        print(json.dumps(r, indent=1, ensure_ascii=False))
        hf = r.get("hf") or {}
        if hf.get("commit"):
            print(f"\nPróximo passo (gate): modal run backend/modal/convert_gguf.py::main --version {run} --hf-repo {hf['repo']} --revision {hf['commit']}")
