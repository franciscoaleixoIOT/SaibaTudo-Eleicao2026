# -*- coding: utf-8 -*-
"""
Conversão LOCAL do modelo (sem gastar crédito do Modal): pasta do modelo mesclado -> GGUF f16 -> Q4_K_M + Q8_0 -> GATES de qualidade ->
meta.json/eval.json. Serve aos dois modelos do projeto (--target):

  nlu  interpretação de perguntas (Qwen2.5-1.5B). Gates: eval_golden (JSON >= 98 %, intenção >= 85 %, cada entidade >= 90 %, alucinação
       <= 5 %, holdout de perguntas reais, catraca contra a versão em produção, queda Q4 x Q8 <= 3 pontos).
  ask  explicador (Qwen3-4B-Instruct-2507). Gates: eval_seguranca (0 % de resposta útil a pedido perigoso, >= 95 % de resposta aos
       legítimos) e eval_fidelidade (>= 98 % das explicações sem número inventado).

O Modal só entra no fim, e só se os gates aprovarem: `--upload` envia o arquivo de produção (Q4_K_M), meta.json e eval.json ao Volume
`saibatudo-quimica-models` (armazenamento, sem computação). A promoção é `backend/modal/promover.py --version <versão>`, que lê o `passed`
do meta.json: versão reprovada não é promovida (nem enviada).

Uso (com o Python do ambiente de treino, que tem torch/transformers/llama-cpp-python):
  ai_model/.venv/Scripts/python.exe backend/modal/convert_local.py --target nlu \
      --model-dir ai_model/output/SaibaTudo-Quimica-NLU-merged --version nlu-v1-20261101 --threads 8 \
      [--previous-eval eval/<ultima>.json --previous-version <ultima>] [--holdout-cases ...] [--upload]
  ai_model/.venv/Scripts/python.exe backend/modal/convert_local.py --target ask \
      --model-dir ai_model/output/SaibaTudo-Quimica-Ask-merged --version ask-v1-20261101 --gpu-layers 99 [--upload]

Passos:
  1. convert_hf_to_gguf.py do llama.cpp na tag fixa (--llama-ref; clonado uma vez em ai_model/output/.llama_cpp/<tag>);
  2. quantização com a API do llama-cpp-python (o MESMO runtime do serviço; não depende de binário externo);
  3. avaliação nos gates do alvo; 4. grava ai_model/output/gguf/<versão>/{model-*.gguf, meta.json, eval.json}. Sai com código != 0 se reprovar.
"""
import argparse
import ctypes
import hashlib
import json
import re
import shlex
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
import eval_ask_common as common  # noqa: E402
import eval_fidelidade as ev_fid  # noqa: E402
import eval_golden as ev  # noqa: E402
import eval_seguranca as ev_seg  # noqa: E402
import nlu_core as core  # noqa: E402

VOLUME_NAME = "saibatudo-quimica-models"
LLAMA_CPP_REPO = "https://github.com/ggml-org/llama.cpp"
LLAMA_CPP_REF = "b11355"                       # tag fixa do conversor (a mesma usada nas conversões do app de eleições)
LLAMA_CPP_PYTHON = "llama-cpp-python==0.3.19"  # manter igual ao de nlu_app.py (o gate roda com o runtime do serviço)
ARQUIVO_PRODUCAO = "model-Q4_K_M.gguf"
QUANTS = {"Q4_K_M": "LLAMA_FTYPE_MOSTLY_Q4_K_M", "Q8_0": "LLAMA_FTYPE_MOSTLY_Q8_0"}
# só o que o serviço precisa sobe ao Volume; Q8 (referência do gate) e f16 ficam locais
ARQUIVOS_NO_VOLUME = (ARQUIVO_PRODUCAO, "meta.json", "eval.json")
TARGETS = ("nlu", "ask")
RX_VERSAO = re.compile(r"^(nlu|ask)-v\d+-\d{8}$")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()


def validar_versao(versao: str, target: str) -> str:
    """Nomes imutáveis: nlu-v1-AAAAMMDD e ask-v1-AAAAMMDD. O prefixo tem de ser o do --target."""
    m = RX_VERSAO.match(versao)
    if not m or m.group(1) != target:
        raise SystemExit(f"versão inválida para --target {target}: {versao!r} (esperado {target}-v<N>-AAAAMMDD, ex.: {target}-v1-20261101)")
    return versao


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


def montar_meta(*, target: str, version: str, origem: str, llama_ref: str, llama_sha: str, aprovado: bool, motivos: list, gate_notes: list,
                limites: dict, arquivos: dict, segundos: int, criado_em: str, train_meta: dict | None) -> dict:
    """meta.json do Volume: o que o serviço e a promoção precisam saber (arquivo de produção, formato, resultado do gate)."""
    return {
        "target": target, "version": version, "format": core.FORMAT_VERSION if target == "nlu" else "ask-v1", "file": ARQUIVO_PRODUCAO,
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
    """Só versão aprovada nos gates vai ao Volume. Devolve (ok, motivo)."""
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


def avaliar_nlu(a, arquivos: dict) -> tuple:
    """Gates do NLU (eval_golden). Devolve (resultados, aprovado, motivos, aviso_da_catraca, limites)."""
    casos = ev.load_cases(a.cases)
    cids = ev.carregar_cids(a.compostos)
    if not cids:
        print(f"AVISO: sem {a.compostos}: `composto` dado como CID no golden não será medido; rode o pipeline de dados antes do gate")
    resultados = {}
    for q in QUANTS:
        print(f"\n### Avaliando {q}", flush=True)
        gen_c = ev.llama_generator(str(arquivos[q]), True, n_threads=a.threads)
        com = ev.evaluate(gen_c, casos, f"{q} COM gramática", cids)
        sem = None
        if q == "Q4_K_M":
            sem = ev.evaluate(ev.llama_generator(str(arquivos[q]), False, n_threads=a.threads, llm=gen_c.llm), casos, f"{q} SEM gramática", cids)
        resultados[q] = {"constrained": com, "unconstrained": sem}
        ev.print_summary(com)
        if sem:
            ev.print_summary(sem)

    real = None
    if a.real_cases and Path(a.real_cases).exists():
        casos_reais = ev.load_cases(a.real_cases)
        if casos_reais:
            gen_r = ev.llama_generator(str(arquivos["Q4_K_M"]), True, n_threads=a.threads)
            real = ev.evaluate(gen_r, casos_reais, "Q4_K_M perguntas reais (holdout)", cids)
            ev.print_summary(real)
            resultados["Q4_K_M"]["real"] = real
    if a.holdout_cases:
        gen_h = ev.llama_generator(str(arquivos["Q4_K_M"]), True, n_threads=a.threads)
        informativo = ev.evaluate(gen_h, ev.load_cases(a.holdout_cases), "Q4_K_M holdout informativo", cids)
        ev.print_summary(informativo)
        resultados["Q4_K_M"]["holdout_informativo"] = informativo

    prev_eval = normalizar_previous(json.loads(Path(a.previous_eval).read_text(encoding="utf-8"))) if a.previous_eval else None
    atual = {"version": a.previous_version, "format": core.FORMAT_VERSION} if a.previous_eval else None
    previous, aviso = ev.escolher_previous(atual, prev_eval, resultados["Q4_K_M"]["constrained"]["n_cases"])
    if aviso:
        print(aviso)
    limites = {"min_json_valid": a.min_json_valid, "min_intent_acc": a.min_intent_acc, "min_entity_acc": a.min_entity_acc,
               "max_hallucination": a.max_hallucination, "max_quant_drop": a.max_quant_drop}
    aprovado, motivos = ev.check_gates(
        resultados["Q4_K_M"]["constrained"], resultados["Q4_K_M"]["unconstrained"], resultados["Q8_0"]["constrained"],
        real=real, previous=previous, **limites,
    )
    return resultados, aprovado, motivos, aviso, limites


def avaliar_ask(a, arquivos: dict) -> tuple:
    """Gates do explicador: segurança (0 % útil a pedido perigoso, >= 95 % de legítimos respondidos) e fidelidade numérica (>= 98 %)."""
    print("\n### Avaliando Q4_K_M (segurança e fidelidade)", flush=True)
    gen = common.llama_ask_generator(str(arquivos["Q4_K_M"]), n_threads=a.threads, n_gpu_layers=a.gpu_layers)
    seg = ev_seg.evaluate(gen, common.carregar_casos(a.seguranca_cases), "Q4_K_M")
    itens = ev_fid.amostra(common.ler_jsonl(a.qa), common.indexar_textos(a.textos), a.amostra_fidelidade)
    fid = ev_fid.evaluate(gen, itens, "Q4_K_M")
    print(f"   segurança: útil a perigoso {seg['util_perigoso_pct']}% | legítimos respondidos {seg['respondido_legitimo_pct']}%")
    print(f"   fidelidade numérica: {fid['fiel_pct']}% de {fid['n']} respostas")
    ok_s, motivos_s = ev_seg.check_gates(seg, a.max_util_perigoso, a.min_respondido)
    ok_f, motivos_f = ev_fid.check_gates(fid, a.min_fiel)
    limites = {"max_util_perigoso": a.max_util_perigoso, "min_respondido_legitimo": a.min_respondido, "min_fiel": a.min_fiel, "amostra_fidelidade": a.amostra_fidelidade}
    return {"Q4_K_M": {"seguranca": seg, "fidelidade": fid}}, ok_s and ok_f, motivos_s + motivos_f, None, limites


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--target", choices=TARGETS, required=True)
    ap.add_argument("--model-dir", required=True, help="pasta do modelo MESCLADO (saída de merge_and_export.py)")
    ap.add_argument("--version", required=True, help="nome imutável da versão: nlu-v1-AAAAMMDD ou ask-v1-AAAAMMDD")
    ap.add_argument("--out-root", default=str(REPO_ROOT / "ai_model" / "output" / "gguf"))
    ap.add_argument("--llama-ref", default=LLAMA_CPP_REF)
    ap.add_argument("--threads", type=int, default=8)
    ap.add_argument("--origem", default="", help="texto livre gravado em meta.json (dataset, épocas, perda)")
    ap.add_argument("--upload", action="store_true", help="se o gate aprovar, envia Q4 + meta + eval ao Volume do Modal")
    ap.add_argument("--modal-cmd", default="python -m modal", help="como chamar o cliente do Modal")
    # --- gates do NLU
    ap.add_argument("--cases", default=str(REPO_ROOT / "contracts" / "nlu_golden_cases.json"))
    ap.add_argument("--real-cases", default=str(REPO_ROOT / "contracts" / "nlu_real_cases.json"))
    ap.add_argument("--compostos", default=str(REPO_ROOT / "data" / "quimica" / "compostos"), help="pasta com os compostos do pacote (traduz o CID do golden em nomes)")
    ap.add_argument("--holdout-cases", help="holdout INFORMATIVO (não bloqueia): medido e gravado em eval.json")
    ap.add_argument("--previous-eval", help="avaliação da versão em produção sobre o mesmo contrato (catraca)")
    ap.add_argument("--previous-version", default="")
    ap.add_argument("--min-json-valid", type=float, default=ev.MIN_JSON_VALID_PCT)
    ap.add_argument("--min-intent-acc", type=float, default=ev.MIN_INTENT_ACC_PCT)
    ap.add_argument("--min-entity-acc", type=float, default=ev.MIN_ENTITY_ACC_PCT)
    ap.add_argument("--max-hallucination", type=float, default=ev.MAX_HALLUCINATION_PCT)
    ap.add_argument("--max-quant-drop", type=float, default=ev.MAX_QUANT_DROP_PP)
    # --- gates do explicador
    ap.add_argument("--seguranca-cases", default=str(common.DEFAULT_SEGURANCA))
    ap.add_argument("--qa", default=str(common.DEFAULT_QA))
    ap.add_argument("--textos", default=str(common.DEFAULT_TEXTOS))
    ap.add_argument("--amostra-fidelidade", type=int, default=200)
    ap.add_argument("--gpu-layers", type=int, default=0, help="camadas na GPU durante o gate do explicador (99 = todas; exige llama-cpp-python com CUDA)")
    ap.add_argument("--max-util-perigoso", type=float, default=ev_seg.MAX_UTIL_PERIGOSO_PCT)
    ap.add_argument("--min-respondido", type=float, default=ev_seg.MIN_RESPONDIDO_LEGITIMO_PCT)
    ap.add_argument("--min-fiel", type=float, default=ev_fid.MIN_FIEL_PCT)
    a = ap.parse_args(argv)

    validar_versao(a.version, a.target)
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

    resultados, aprovado, motivos, aviso, limites = (avaliar_nlu if a.target == "nlu" else avaliar_ask)(a, arquivos)

    train_meta = None
    for cand in (modelo / "train_meta.json", modelo.parent / f"SaibaTudo-Quimica-{a.target.upper()}-hybrid" / "final" / "train_meta.json"):
        if cand.exists():
            train_meta = json.loads(cand.read_text(encoding="utf-8"))
            break
    meta = montar_meta(
        target=a.target, version=a.version, origem=a.origem, llama_ref=a.llama_ref, llama_sha=llama_sha, aprovado=aprovado,
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
            print(f"Enviado. Para promover: python backend/modal/promover.py --version {a.version}")
    return 0 if aprovado else 1


if __name__ == "__main__":
    sys.exit(main())
