# -*- coding: utf-8 -*-
"""
Job do Modal: Hugging Face -> GGUF (f16 -> Q4_K_M [+ Q8_0]) -> Volume -> avaliação -> promoção.

  1. baixa o modelo do HF (HF_REPO / revisão; HF_TOKEN opcional — repositório público dispensa);
  2. converte para GGUF f16 com o convert_hf_to_gguf.py do llama.cpp (clonado na imagem);
  3. quantiza para Q4_K_M (e, opcionalmente, Q8_0 como referência de qualidade);
  4. grava em /models/<versão>/ no Volume (com meta.json: origem, SHA do HF, SHA do llama.cpp, SHA-256);
  5. avalia contra contracts/nlu_golden_cases.json (eval_golden.py): JSON válido COM e SEM gramática, acerto de
     cargo/UF/partido, e regressão Q4 vs Q8;
  6. GATE de promoção: JSON válido (sem gramática) >= 98% (+ 100% com gramática, + regressão de quantização).
     Reprovou => o job FALHA (exit != 0), os arquivos ficam no Volume para inspeção e NADA é promovido.
     Passou e --promote => escreve /models/current.json (o app do Modal passa a servir esta versão no próximo boot).

Uso (a partir da raiz do repositório):
  modal run backend/modal/convert_gguf.py::main --version v1-legado --promote
  modal run backend/modal/convert_gguf.py::main --version v2-2026-10 --format v2 --hf-repo franciscoaleixo/SaibaTudo-NLU-v2 --with-q8 --promote
  modal run backend/modal/convert_gguf.py::promote --version v1-legado          # rollback / troca de versão
  modal run backend/modal/convert_gguf.py::versions                             # lista versões no Volume

Variáveis de ambiente locais lidas por este arquivo: HF_REPO, HF_SECRET_NAME ou HF_TOKEN (opcionais), LLAMA_CPP_REF (tag/SHA do llama.cpp).
Custo: CPU pontual (8 núcleos, ~16 GB, algumas dezenas de minutos); dentro do crédito mensal gratuito do Modal.
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import modal

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
import nlu_core as core  # noqa: E402

VOLUME_NAME = "saibatudo-nlu-models"
MODELS_DIR = "/models"
HF_REPO = os.environ.get("HF_REPO", "franciscoaleixo/SaibaTudo-Eleicao2026")
# Fixe uma tag/SHA do llama.cpp compatível com o llama-cpp-python usado no serviço (nlu_app.py). O job grava o SHA
# efetivamente usado em meta.json; depois do 1º sucesso, passe-o aqui para tornar a conversão reprodutível.
LLAMA_CPP_REF = os.environ.get("LLAMA_CPP_REF", "master")
LLAMA_CPP_PYTHON = "llama-cpp-python==0.3.19"  # manter igual ao de nlu_app.py (o gate roda com o MESMO runtime do serviço)
# Compilado do código-fonte: a wheel "cpu" do índice do projeto é ligada à musl (não carrega no Debian/glibc).
# Instruções fixas (sem -march=native) para rodar em qualquer CPU x86-64 dos servidores do Modal.
LLAMA_CPP_PYTHON_BUILD = (
    'CMAKE_ARGS="-DGGML_NATIVE=OFF -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON" '
    f'CMAKE_BUILD_PARALLEL_LEVEL=8 pip install --no-cache-dir --no-binary llama-cpp-python "{LLAMA_CPP_PYTHON}"'
)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("git", "build-essential", "cmake")
    .pip_install("torch", extra_index_url="https://download.pytorch.org/whl/cpu")
    .pip_install("transformers", "sentencepiece", "safetensors", "numpy", "gguf", "protobuf", "huggingface_hub")
    .run_commands(LLAMA_CPP_PYTHON_BUILD)
    .run_commands(
        "git clone --filter=blob:none https://github.com/ggml-org/llama.cpp /opt/llama.cpp",
        f"git -C /opt/llama.cpp checkout {LLAMA_CPP_REF}",
        "cmake -S /opt/llama.cpp -B /opt/llama.cpp/build -DCMAKE_BUILD_TYPE=Release -DGGML_NATIVE=OFF "
        "-DLLAMA_CURL=OFF -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_SERVER=OFF -DLLAMA_BUILD_EXAMPLES=ON -DLLAMA_BUILD_TOOLS=ON",
        "cmake --build /opt/llama.cpp/build --target llama-quantize -j 8",
    )
    .add_local_file(str(HERE / "nlu_core.py"), "/root/nlu_core.py")
    .add_local_file(str(HERE / "eval_golden.py"), "/root/eval_golden.py")
    .add_local_file(str(REPO_ROOT / "contracts" / "nlu_golden_cases.json"), "/root/contracts/nlu_golden_cases.json")
    .add_local_file(str(REPO_ROOT / "contracts" / "nlu_real_cases.json"), "/root/contracts/nlu_real_cases.json")
)

app = modal.App("saibatudo-nlu-convert", image=image)
models = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)

# Token do HF (repositório público dispensa). Preferível: Secret nomeado no Modal
#   modal secret create saibatudo-hf HF_TOKEN=hf_xxx   +   HF_SECRET_NAME=saibatudo-hf
# Alternativa: exportar HF_TOKEN localmente (vai como Secret efêmero do Modal).
if os.environ.get("HF_SECRET_NAME"):
    _SECRETS = [modal.Secret.from_name(os.environ["HF_SECRET_NAME"])]
elif os.environ.get("HF_TOKEN"):
    _SECRETS = [modal.Secret.from_dict({"HF_TOKEN": os.environ["HF_TOKEN"]})]
else:
    _SECRETS = []


def _sh(cmd, **kw):
    print("$", " ".join(str(c) for c in cmd), flush=True)
    subprocess.run(cmd, check=True, **kw)


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()


@app.function(
    volumes={MODELS_DIR: models}, secrets=_SECRETS, cpu=8.0, memory=16384, timeout=3 * 60 * 60,
)
def convert(hf_repo: str, revision: str, version: str, fmt: str, with_q8: bool, promote_flag: bool,
            min_json_valid: float, min_entity_acc: float, max_quant_drop: float,
            min_intent_acc: float = 85.0, max_hallucination: float = 5.0) -> dict:
    from huggingface_hub import HfApi, snapshot_download

    sys.path.insert(0, "/root")
    import eval_golden as ev

    if fmt not in core.FORMATS:
        raise ValueError(f"formato inválido: {fmt}")
    if not with_q8:
        # a queda de quantização (Q4 x Q8) é um dos gates: sem o Q8 de referência o gate não pode ser avaliado
        raise ValueError("o gate exige o Q8_0 de referência: rode com --with-q8")
    destino = Path(MODELS_DIR) / version
    if (destino / "meta.json").exists():
        raise RuntimeError(f"a versão {version} já existe no Volume; escolha outro nome (versões são imutáveis)")

    token = os.environ.get("HF_TOKEN") or None
    t0 = time.time()
    info = HfApi().model_info(hf_repo, revision=revision, token=token)
    print(f"HF {hf_repo}@{revision} -> {info.sha}")
    hf_dir = Path("/tmp/hf")
    snapshot_download(
        repo_id=hf_repo, revision=info.sha, local_dir=str(hf_dir), token=token,
        allow_patterns=["*.json", "*.safetensors", "*.txt", "*.jinja", "tokenizer*", "*.model"],
    )

    work = Path("/tmp/work")
    work.mkdir(parents=True, exist_ok=True)
    f16 = work / "model-f16.gguf"
    _sh([sys.executable, "/opt/llama.cpp/convert_hf_to_gguf.py", str(hf_dir), "--outfile", str(f16), "--outtype", "f16"])

    quants = ["Q4_K_M"] + (["Q8_0"] if with_q8 else [])
    arquivos = {}
    for q in quants:
        saida = work / f"model-{q}.gguf"
        _sh(["/opt/llama.cpp/build/bin/llama-quantize", str(f16), str(saida), q])
        arquivos[q] = saida
        print(f"{q}: {saida.stat().st_size / 1e6:.0f} MB")

    llama_sha = subprocess.run(["git", "-C", "/opt/llama.cpp", "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()

    # ------------------------------------------------------------------ avaliação (gate)
    casos = ev.load_cases("/root/contracts/nlu_golden_cases.json")
    resultados = {}
    for q in quants:
        print(f"\n### Avaliando {q}")
        gen_c = ev.llama_generator(str(arquivos[q]), fmt, True, n_threads=8)
        com = ev.evaluate(gen_c, casos, fmt, f"{q} COM gramática")
        sem = None
        if q == "Q4_K_M":  # a validade nativa só precisa ser medida no artefato que vai para produção
            gen_u = ev.llama_generator(str(arquivos[q]), fmt, False, n_threads=8, llm=gen_c.llm)
            sem = ev.evaluate(gen_u, casos, fmt, f"{q} SEM gramática")
        resultados[q] = {"constrained": com, "unconstrained": sem}
        ev.print_summary(com)
        if sem:
            ev.print_summary(sem)

    baseline = resultados["Q8_0"]["constrained"]

    # holdout de perguntas reais (contracts/nlu_real_cases.json): só entra no gate quando já tem casos revisados
    real = None
    real_path = Path("/root/contracts/nlu_real_cases.json")
    if real_path.exists():
        casos_reais = ev.load_cases(str(real_path))
        if casos_reais:
            gen_r = ev.llama_generator(str(arquivos["Q4_K_M"]), fmt, True, n_threads=8)
            real = ev.evaluate(gen_r, casos_reais, fmt, "Q4_K_M perguntas reais (holdout)")
            ev.print_summary(real)
            resultados["Q4_K_M"]["real"] = real

    # catraca: compara com a versão em produção, mas só se foi medida sobre o MESMO contrato (mesmo nº de casos)
    atual = prev_eval = None
    try:
        atual = json.loads((Path(MODELS_DIR) / "current.json").read_text(encoding="utf-8"))
        prev_eval = json.loads((Path(MODELS_DIR) / atual["version"] / "eval.json").read_text(encoding="utf-8"))
    except (OSError, KeyError, ValueError):
        pass
    previous, aviso_catraca = ev.escolher_previous(atual, prev_eval, fmt, resultados["Q4_K_M"]["constrained"]["n_cases"])
    if aviso_catraca:
        print(aviso_catraca)

    aprovado, motivos = ev.check_gates(
        resultados["Q4_K_M"]["constrained"], resultados["Q4_K_M"]["unconstrained"], baseline,
        real=real, previous=previous, min_json_valid=min_json_valid, min_intent_acc=min_intent_acc,
        min_entity_acc=min_entity_acc, max_hallucination=max_hallucination, max_quant_drop=max_quant_drop,
    )

    # ------------------------------------------------------------------ grava no Volume (mesmo reprovado, para inspeção)
    destino.mkdir(parents=True, exist_ok=True)
    meta = {
        "version": version, "format": fmt, "file": "model-Q4_K_M.gguf", "hf_repo": hf_repo, "hf_revision": info.sha,
        "llama_cpp_ref": LLAMA_CPP_REF, "llama_cpp_sha": llama_sha, "llama_cpp_python": LLAMA_CPP_PYTHON,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "seconds": round(time.time() - t0),
        "passed": aprovado, "reasons": motivos, "promoted": False, "gate_notes": [aviso_catraca] if aviso_catraca else [],
        "gate_thresholds": {"min_json_valid": min_json_valid, "min_intent_acc": min_intent_acc, "min_entity_acc": min_entity_acc,
                            "max_hallucination": max_hallucination, "max_quant_drop": max_quant_drop},
        "files": {},
    }
    for q, caminho in arquivos.items():
        alvo = destino / caminho.name
        shutil.copyfile(caminho, alvo)
        meta["files"][caminho.name] = {"bytes": alvo.stat().st_size, "sha256": _sha256(alvo)}
    (destino / "eval.json").write_text(json.dumps(resultados, ensure_ascii=False, indent=1), encoding="utf-8")

    if aprovado and promote_flag:
        _escrever_ponteiro(version, fmt, meta["file"])
        meta["promoted"] = True
    (destino / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    models.commit()

    print("\n" + ("APROVADO" if aprovado else "REPROVADO"), "-", "promovido" if meta["promoted"] else "NÃO promovido")
    for m in motivos:
        print(" -", m)
    if not aprovado:
        raise RuntimeError("Gate de qualidade reprovado: " + "; ".join(motivos))
    return {k: meta[k] for k in ("version", "format", "hf_revision", "llama_cpp_sha", "passed", "promoted", "files")}


def _escrever_ponteiro(version: str, fmt: str, arquivo: str):
    p = Path(MODELS_DIR) / "current.json"
    tmp = Path(MODELS_DIR) / "current.json.tmp"
    tmp.write_text(json.dumps({"version": version, "format": fmt, "file": arquivo}, indent=1), encoding="utf-8")
    tmp.replace(p)


@app.function(volumes={MODELS_DIR: models}, cpu=0.25, memory=256, timeout=300)
def promote_version(version: str, force: bool = False, reason: str = "") -> dict:
    """Aponta /models/current.json para uma versão JÁ existente (rollback). Exige que ela tenha passado no gate.
    `force` (promover mesmo reprovada) exige um `reason` não vazio, gravado em meta.json (auditoria)."""
    models.reload()
    meta_path = Path(MODELS_DIR) / version / "meta.json"
    if not meta_path.exists():
        raise RuntimeError(f"versão {version} não existe no Volume")
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    sys.path.insert(0, "/root")
    import eval_golden as ev

    meta = ev.aplicar_forca(meta, force, reason, time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    _escrever_ponteiro(version, meta["format"], meta["file"])
    meta["promoted"] = True
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    models.commit()
    return {"current": version, "format": meta["format"]}


@app.function(volumes={MODELS_DIR: models}, cpu=0.25, memory=256, timeout=300)
def list_versions() -> dict:
    models.reload()
    out = {"current": None, "versions": []}
    cur = Path(MODELS_DIR) / "current.json"
    if cur.exists():
        out["current"] = json.loads(cur.read_text(encoding="utf-8"))
    for meta in sorted(Path(MODELS_DIR).glob("*/meta.json")):
        m = json.loads(meta.read_text(encoding="utf-8"))
        out["versions"].append({k: m.get(k) for k in ("version", "format", "hf_revision", "passed", "created_at")})
    return out


@app.local_entrypoint()
def main(version: str, hf_repo: str = HF_REPO, revision: str = "main", format: str = "v2",
         with_q8: bool = True, promote: bool = False, min_json_valid: float = 98.0,
         min_entity_acc: float = 90.0, max_quant_drop: float = 3.0,
         min_intent_acc: float = 85.0, max_hallucination: float = 5.0):
    """modal run backend/modal/convert_gguf.py::main --version v2.2-AAAAMMDD [--promote]
    Todos os gates bloqueiam (ver eval_golden.check_gates); o Q8_0 de referência é obrigatório."""
    r = convert.remote(hf_repo, revision, version, format, with_q8, promote, min_json_valid, min_entity_acc, max_quant_drop,
                       min_intent_acc, max_hallucination)
    print(json.dumps(r, indent=1, ensure_ascii=False))


@app.local_entrypoint()
def promote(version: str, force: bool = False, reason: str = ""):
    """modal run backend/modal/convert_gguf.py::promote --version X [--force --reason 'motivo']"""
    print(json.dumps(promote_version.remote(version, force, reason), indent=1))


@app.local_entrypoint()
def versions():
    print(json.dumps(list_versions.remote(), indent=1, ensure_ascii=False))
