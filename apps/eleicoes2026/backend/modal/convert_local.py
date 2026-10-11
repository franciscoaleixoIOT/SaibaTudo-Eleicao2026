# -*- coding: utf-8 -*-
"""
Conversão LOCAL do modelo de NLU (sem gastar crédito do Modal): pasta do modelo mesclado -> GGUF f16 -> Q4_K_M + Q8_0
-> MESMO gate de qualidade do job do Modal (eval_golden.check_gates) -> meta.json/eval.json no MESMO formato do Volume.

É o equivalente local de convert_gguf.py::main. O Modal só entra no fim, e só se o gate aprovar: `--upload` envia o
arquivo de produção (Q4_K_M), o meta.json e o eval.json para o Volume `saibatudo-nlu-models` (armazenamento, sem
computação). A promoção continua sendo `modal run backend/modal/convert_gguf.py::promote --version <versão>`, que lê o
`passed` do meta.json: versão reprovada não é promovida (nem enviada).

Uso (com o Python do ambiente de treino, que tem torch/transformers/llama-cpp-python):
  ai_model/.venv/Scripts/python.exe backend/modal/convert_local.py \
      --model-dir ai_model/output/SaibaTudo-NLU-v22-merged --version v2.2-20261006 \
      --previous-eval eval/2026-10-07_v2.3-20261007.json --previous-version v2.3-20261007 [--upload]

Passos:
  1. convert_hf_to_gguf.py do llama.cpp na tag fixa (--llama-ref; clonado uma vez em ai_model/output/.llama_cpp/<tag>);
  2. quantização com a API do llama-cpp-python (o MESMO runtime do serviço; não depende de binário externo);
  3. avaliação nos casos de referência COM e SEM gramática (Q4), Q8 como referência de quantização, holdout de perguntas
     reais se houver, catraca contra a versão em produção (--previous-eval) e, opcionalmente, um holdout informativo;
  4. grava ai_model/output/gguf/<versão>/{model-*.gguf, meta.json, eval.json}. Sai com código != 0 se o gate reprovar.
"""
import argparse
import ctypes
import hashlib
import json
import shlex
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
import eval_golden as ev  # noqa: E402
import nlu_core as core  # noqa: E402

VOLUME_NAME = "saibatudo-nlu-models"
LLAMA_CPP_REPO = "https://github.com/ggml-org/llama.cpp"
LLAMA_CPP_REF = "b11355"                       # a mesma tag usada na conversão do v2.1
LLAMA_CPP_PYTHON = "llama-cpp-python==0.3.19"  # manter igual ao de nlu_app.py (o gate roda com o runtime do serviço)
ARQUIVO_PRODUCAO = "model-Q4_K_M.gguf"
QUANTS = {"Q4_K_M": "LLAMA_FTYPE_MOSTLY_Q4_K_M", "Q8_0": "LLAMA_FTYPE_MOSTLY_Q8_0"}
# só o que o serviço precisa sobe ao Volume; Q8 (referência do gate) e f16 ficam locais
ARQUIVOS_NO_VOLUME = (ARQUIVO_PRODUCAO, "meta.json", "eval.json")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()


def normalizar_previous(eval_json: dict | None) -> dict | None:
    """Aceita a avaliação da versão em produção nos dois formatos que existem no projeto e devolve o formato do Volume
    ({"Q4_K_M": {"constrained": ...}}), que é o que eval_golden.escolher_previous espera:
      - eval.json do Volume/da conversão: {"Q4_K_M": {"constrained": ..., "unconstrained": ...}, "Q8_0": ...}
      - saída de `eval_golden.py --out` (pasta eval/): {"passed": ..., "constrained": ..., "unconstrained": ...}"""
    if not isinstance(eval_json, dict):
        return None
    if isinstance(eval_json.get("Q4_K_M"), dict) and "constrained" in eval_json["Q4_K_M"]:
        return eval_json
    if isinstance(eval_json.get("constrained"), dict):
        return {"Q4_K_M": {"constrained": eval_json["constrained"], "unconstrained": eval_json.get("unconstrained")}}
    return None


def montar_meta(*, version: str, fmt: str, origem: str, llama_ref: str, llama_sha: str, aprovado: bool, motivos: list,
                gate_notes: list, limites: dict, arquivos: dict, segundos: int, criado_em: str, train_meta: dict | None) -> dict:
    """meta.json no MESMO esquema do job do Modal (convert_gguf.py), com os campos extras da conversão local."""
    return {
        "version": version, "format": fmt, "file": ARQUIVO_PRODUCAO,
        "hf_repo": None, "hf_revision": None, "origem_modelo": origem,
        "llama_cpp_ref": llama_ref, "llama_cpp_sha": llama_sha, "llama_cpp_python": LLAMA_CPP_PYTHON,
        "converted_localmente": "backend/modal/convert_local.py (quantização pela API do llama-cpp-python)",
        "created_at": criado_em, "seconds": segundos,
        "passed": bool(aprovado), "reasons": list(motivos), "promoted": False, "gate_notes": list(gate_notes),
        "gate_thresholds": dict(limites),
        "treino": train_meta or None,
        "files": dict(arquivos),
        "arquivos_no_volume": list(ARQUIVOS_NO_VOLUME),
    }


def plano_upload(version: str, pasta: Path, modal_cmd: str = "python -m modal") -> list:
    """Comandos que enviam a versão ao Volume (um por arquivo). Só os arquivos de ARQUIVOS_NO_VOLUME."""
    base = shlex.split(modal_cmd)
    return [base + ["volume", "put", VOLUME_NAME, str(pasta / nome), f"/{version}/{nome}"] for nome in ARQUIVOS_NO_VOLUME]


def pode_enviar(meta: dict) -> tuple:
    """Só versão aprovada no gate vai ao Volume. Devolve (ok, motivo)."""
    if not meta.get("passed"):
        return False, "gate reprovado: " + "; ".join(meta.get("reasons") or ["sem motivo registrado"])
    return True, ""


# --------------------------------------------------------------------------------------------- passos pesados
def _sh(cmd, **kw):
    print("$", " ".join(str(c) for c in cmd), flush=True)
    return subprocess.run(cmd, check=True, **kw)


def garantir_llama_cpp(ref: str, raiz: Path) -> tuple:
    """Clona (uma vez) o llama.cpp na tag pedida; devolve (pasta, sha). Só o conversor em Python é usado."""
    destino = raiz / ref
    if not (destino / "convert_hf_to_gguf.py").exists():
        raiz.mkdir(parents=True, exist_ok=True)
        _sh(["git", "clone", "--depth", "1", "--branch", ref, LLAMA_CPP_REPO, str(destino)])
    sha = subprocess.run(["git", "-C", str(destino), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    return destino, sha


def quantizar(f16: Path, saida: Path, quant: str, threads: int):
    import llama_cpp

    llama_cpp.llama_backend_init()
    params = llama_cpp.llama_model_quantize_default_params()
    params.ftype = getattr(llama_cpp, QUANTS[quant])
    params.nthread = threads
    rc = llama_cpp.llama_model_quantize(str(f16).encode("utf-8"), str(saida).encode("utf-8"), ctypes.byref(params))
    if rc != 0 or not saida.exists():
        raise RuntimeError(f"quantização {quant} falhou (código {rc})")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model-dir", required=True, help="pasta do modelo MESCLADO (saída de merge_and_export.py)")
    ap.add_argument("--version", required=True, help="nome imutável da versão, ex.: v2.2-20261006")
    ap.add_argument("--format", choices=core.FORMATS, default="v2")
    ap.add_argument("--out-root", default=str(REPO_ROOT / "ai_model" / "output" / "gguf"))
    ap.add_argument("--llama-ref", default=LLAMA_CPP_REF)
    ap.add_argument("--threads", type=int, default=8)
    ap.add_argument("--cases", default=str(REPO_ROOT / "contracts" / "nlu_golden_cases.json"))
    ap.add_argument("--real-cases", default=str(REPO_ROOT / "contracts" / "nlu_real_cases.json"))
    ap.add_argument("--holdout-cases", help="holdout INFORMATIVO (não bloqueia): medido e gravado em eval.json")
    ap.add_argument("--previous-eval", help="avaliação da versão em produção sobre o mesmo contrato (catraca)")
    ap.add_argument("--previous-version", default="")
    ap.add_argument("--origem", default="", help="texto livre gravado em meta.json (dataset, épocas, perda)")
    ap.add_argument("--min-json-valid", type=float, default=ev.MIN_JSON_VALID_PCT)
    ap.add_argument("--min-intent-acc", type=float, default=ev.MIN_INTENT_ACC_PCT)
    ap.add_argument("--min-entity-acc", type=float, default=ev.MIN_ENTITY_ACC_PCT)
    ap.add_argument("--max-hallucination", type=float, default=ev.MAX_HALLUCINATION_PCT)
    ap.add_argument("--max-quant-drop", type=float, default=ev.MAX_QUANT_DROP_PP)
    ap.add_argument("--upload", action="store_true", help="se o gate aprovar, envia Q4 + meta + eval ao Volume do Modal")
    ap.add_argument("--modal-cmd", default="python -m modal", help="como chamar o cliente do Modal")
    a = ap.parse_args(argv)

    modelo = Path(a.model_dir).resolve()
    if not (modelo / "config.json").exists():
        raise SystemExit(f"{modelo} não parece um modelo mesclado (falta config.json)")
    destino = Path(a.out_root) / a.version
    if (destino / "meta.json").exists():
        raise SystemExit(f"a versão {a.version} já existe em {destino}; escolha outro nome (versões são imutáveis)")
    destino.mkdir(parents=True, exist_ok=True)
    t0 = time.time()

    llama_dir, llama_sha = garantir_llama_cpp(a.llama_ref, REPO_ROOT / "ai_model" / "output" / ".llama_cpp")
    f16 = destino / "model-f16.gguf"
    _sh([sys.executable, str(llama_dir / "convert_hf_to_gguf.py"), str(modelo), "--outfile", str(f16), "--outtype", "f16"])
    arquivos = {}
    for q in QUANTS:
        saida = destino / f"model-{q}.gguf"
        print(f"\n### Quantizando {q}", flush=True)
        quantizar(f16, saida, q, a.threads)
        arquivos[q] = saida
        print(f"{q}: {saida.stat().st_size / 1e6:.0f} MB")

    # ------------------------------------------------------------------ avaliação (mesmo roteiro do job do Modal)
    casos = ev.load_cases(a.cases)
    resultados = {}
    for q in QUANTS:
        print(f"\n### Avaliando {q}", flush=True)
        gen_c = ev.llama_generator(str(arquivos[q]), a.format, True, n_threads=a.threads)
        com = ev.evaluate(gen_c, casos, a.format, f"{q} COM gramática")
        sem = None
        if q == "Q4_K_M":
            gen_u = ev.llama_generator(str(arquivos[q]), a.format, False, n_threads=a.threads, llm=gen_c.llm)
            sem = ev.evaluate(gen_u, casos, a.format, f"{q} SEM gramática")
        resultados[q] = {"constrained": com, "unconstrained": sem}
        ev.print_summary(com)
        if sem:
            ev.print_summary(sem)

    real = None
    if a.real_cases and Path(a.real_cases).exists():
        casos_reais = ev.load_cases(a.real_cases)
        if casos_reais:
            gen_r = ev.llama_generator(str(arquivos["Q4_K_M"]), a.format, True, n_threads=a.threads)
            real = ev.evaluate(gen_r, casos_reais, a.format, "Q4_K_M perguntas reais (holdout)")
            ev.print_summary(real)
            resultados["Q4_K_M"]["real"] = real

    if a.holdout_cases:
        gen_h = ev.llama_generator(str(arquivos["Q4_K_M"]), a.format, True, n_threads=a.threads)
        informativo = ev.evaluate(gen_h, ev.load_cases(a.holdout_cases), a.format, "Q4_K_M holdout informativo")
        ev.print_summary(informativo)
        resultados["Q4_K_M"]["holdout_informativo"] = informativo

    prev_eval = None
    if a.previous_eval:
        prev_eval = normalizar_previous(json.loads(Path(a.previous_eval).read_text(encoding="utf-8")))
    atual = {"version": a.previous_version, "format": a.format} if a.previous_eval else None
    previous, aviso = ev.escolher_previous(atual, prev_eval, a.format, resultados["Q4_K_M"]["constrained"]["n_cases"])
    if aviso:
        print(aviso)

    limites = {"min_json_valid": a.min_json_valid, "min_intent_acc": a.min_intent_acc, "min_entity_acc": a.min_entity_acc,
               "max_hallucination": a.max_hallucination, "max_quant_drop": a.max_quant_drop}
    aprovado, motivos = ev.check_gates(
        resultados["Q4_K_M"]["constrained"], resultados["Q4_K_M"]["unconstrained"], resultados["Q8_0"]["constrained"],
        real=real, previous=previous, **limites,
    )

    train_meta = None
    for cand in (modelo / "train_meta.json", modelo.parent / "SaibaTudo-Eleicao2026-hybrid" / "final" / "train_meta.json"):
        if cand.exists():
            train_meta = json.loads(cand.read_text(encoding="utf-8"))
            break
    meta = montar_meta(
        version=a.version, fmt=a.format, origem=a.origem, llama_ref=a.llama_ref, llama_sha=llama_sha, aprovado=aprovado,
        motivos=motivos, gate_notes=[aviso] if aviso else [], limites=limites, segundos=round(time.time() - t0),
        criado_em=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), train_meta=train_meta,
        arquivos={p.name: {"bytes": p.stat().st_size, "sha256": sha256(p)} for p in arquivos.values()},
    )
    (destino / "eval.json").write_text(json.dumps(resultados, ensure_ascii=False, indent=1), encoding="utf-8")
    (destino / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")

    print("\n" + ("APROVADO" if aprovado else "REPROVADO"), "-", destino)
    for m in motivos:
        print(" -", m)
    ok, motivo = pode_enviar(meta)
    if a.upload:
        if not ok:
            print("NÃO enviado ao Volume:", motivo)
        else:
            for cmd in plano_upload(a.version, destino, a.modal_cmd):
                _sh(cmd)
            print(f"Enviado. Para promover: modal run backend/modal/convert_gguf.py::promote --version {a.version}")
    return 0 if aprovado else 1


if __name__ == "__main__":
    sys.exit(main())
