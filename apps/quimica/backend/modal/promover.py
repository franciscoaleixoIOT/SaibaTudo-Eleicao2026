# -*- coding: utf-8 -*-
"""
Promove (ou reverte) uma versão do modelo no Volume `saibatudo-quimica-models` do Modal: grava o ponteiro que o serviço lê ao subir.

  nlu  -> /current.json      (lido por nlu_app.py)
  ask  -> /ask-current.json  (lido por ask_app.py, a reserva do explicador)

O serviço carrega o ponteiro quando o contêiner sobe: depois de promover, os contêineres novos já servem a versão nova (os que estão
quentes terminam em até `scaledown_window` segundos; para forçar, `python -m modal app stop saibatudo-quimica-nlu` e redeploy).

Uso:
  python backend/modal/promover.py --version nlu-v1-20261101                 # lê ai_model/output/gguf/<versão>/meta.json; exige passed=true
  python backend/modal/promover.py --version nlu-v1-20261101 --force --reason "motivo"   # gate reprovado: fica gravado em meta.json
  python backend/modal/promover.py --version nlu-v1-20260901 --target nlu --rollback     # versão antiga que já está no Volume
  python backend/modal/promover.py --version ... --dry-run                   # só mostra o ponteiro e o comando
No Git Bash use MSYS_NO_PATHCONV=1 (o destino começa com "/"). Depois de promover: MODEL_VERSION / ASK_MODEL_VERSION na Vercel e deploy.
"""
import argparse
import json
import shlex
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
import convert_local as conv  # noqa: E402
import eval_golden as ev  # noqa: E402

POINTERS = {"nlu": "current.json", "ask": "ask-current.json"}


def montar_ponteiro(meta: dict, agora: str) -> dict:
    """Conteúdo do ponteiro: o que o serviço precisa para achar e conferir o arquivo (versão, nome, formato, sha256)."""
    arquivo = meta.get("file", conv.ARQUIVO_PRODUCAO)
    return {
        "version": meta["version"], "file": arquivo, "format": meta.get("format"), "target": meta.get("target"),
        "sha256": (meta.get("files") or {}).get(arquivo, {}).get("sha256"), "promoted_at": agora,
    }


def plano_promocao(alvo: str, ponteiro_local: Path, modal_cmd: str = "python -m modal") -> list:
    """Comando que grava o ponteiro no Volume (sobrescreve)."""
    return shlex.split(modal_cmd) + ["volume", "put", "--force", conv.VOLUME_NAME, str(ponteiro_local), f"/{POINTERS[alvo]}"]


def ponteiro_de_rollback(version: str, target: str) -> dict:
    """Rollback para uma versão que já está no Volume mas não tem meta.json nesta máquina: assume o arquivo de produção padrão."""
    conv.validar_versao(version, target)
    return {"version": version, "file": conv.ARQUIVO_PRODUCAO, "format": "v1" if target == "nlu" else "ask-v1", "target": target}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--version", required=True)
    ap.add_argument("--target", choices=conv.TARGETS, help="obrigatório com --rollback; senão vem do meta.json")
    ap.add_argument("--local-root", default=str(REPO_ROOT / "ai_model" / "output" / "gguf"))
    ap.add_argument("--rollback", action="store_true", help="promove uma versão que já está no Volume, sem meta.json local")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--reason", default="")
    ap.add_argument("--modal-cmd", default="python -m modal")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)

    agora = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    meta_path = Path(a.local_root) / a.version / "meta.json"
    if a.rollback:
        if not a.target:
            raise SystemExit("--rollback exige --target nlu|ask")
        alvo, ponteiro, meta = a.target, {**ponteiro_de_rollback(a.version, a.target), "promoted_at": agora, "rollback": True}, None
    else:
        if not meta_path.exists():
            raise SystemExit(f"{meta_path} não existe; rode convert_local.py antes (ou use --rollback para uma versão que já está no Volume)")
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        alvo = meta.get("target") or a.target
        if alvo not in POINTERS:
            raise SystemExit("meta.json sem target; passe --target nlu|ask")
        try:
            meta = ev.aplicar_forca(meta, a.force, a.reason, agora)
        except RuntimeError as e:
            raise SystemExit(str(e)) from None
        ponteiro = montar_ponteiro(meta, agora)

    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d) / POINTERS[alvo]
        tmp.write_text(json.dumps(ponteiro, ensure_ascii=False, indent=1), encoding="utf-8")
        cmd = plano_promocao(alvo, tmp, a.modal_cmd)
        print(json.dumps(ponteiro, ensure_ascii=False, indent=1))
        print("$", " ".join(cmd))
        if a.dry_run:
            return 0
        subprocess.run(cmd, check=True)

    if meta is not None:
        meta["promoted"] = True
        meta["promoted_at"] = agora
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    campo = "MODEL_VERSION" if alvo == "nlu" else "ASK_MODEL_VERSION"
    print(f"\nPromovida. Agora: {campo}={a.version} na Vercel (invalida o cache) e deploy.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
