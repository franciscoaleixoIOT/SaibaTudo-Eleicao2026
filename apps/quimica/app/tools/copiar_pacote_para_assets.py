# -*- coding: utf-8 -*-
"""
Embute o pacote de dados REAL (data/quimica/) nos assets do app (app/src/main/assets/quimica/), byte a byte, e confere
os sha256 do manifesto. Sem argumentos, copia de data/quimica/. O Gradle já usa data/quimica/ diretamente quando existe;
este script serve para congelar o snapshot dentro de app/src/main/assets/ (tem prioridade no build) ou para usar um
pacote que esteja em outra pasta.

Uso (da raiz do repositório):
    python app/tools/copiar_pacote_para_assets.py                # data/quimica -> app/src/main/assets/quimica
    python app/tools/copiar_pacote_para_assets.py --origem OUTRA_PASTA
    python app/tools/copiar_pacote_para_assets.py --remover      # volta ao comportamento automático do Gradle
"""
import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
DESTINO = RAIZ / "app" / "src" / "main" / "assets" / "quimica"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--origem", default=str(RAIZ / "data" / "quimica"))
    ap.add_argument("--remover", action="store_true")
    a = ap.parse_args()
    if a.remover:
        shutil.rmtree(DESTINO, ignore_errors=True)
        print("assets/quimica removido")
        return 0
    origem = Path(a.origem)
    manifesto = origem / "manifest.json"
    if not manifesto.is_file() or not (origem / "manifest.sig").is_file():
        print(f"pacote não encontrado em {origem} (esperado manifest.json e manifest.sig)", file=sys.stderr)
        return 1
    m = json.loads(manifesto.read_text(encoding="utf-8"))
    arquivos = m.get("files")
    if isinstance(arquivos, dict):
        itens = [(k, v.get("sha256"), v.get("bytes")) for k, v in arquivos.items()]
    else:
        itens = [(x["path"], x.get("sha256"), x.get("bytes")) for x in m.get("arquivos", [])]
    for caminho, sha, tamanho in itens:
        f = origem / caminho
        if not f.is_file():
            print(f"arquivo do manifesto ausente: {caminho}", file=sys.stderr)
            return 1
        dados = f.read_bytes()
        if sha and hashlib.sha256(dados).hexdigest() != sha:
            print(f"sha256 divergente: {caminho}", file=sys.stderr)
            return 1
        if tamanho is not None and len(dados) != tamanho:
            print(f"tamanho divergente: {caminho}", file=sys.stderr)
            return 1
    shutil.rmtree(DESTINO, ignore_errors=True)
    DESTINO.mkdir(parents=True)
    for caminho, _, _ in itens:
        alvo = DESTINO / caminho
        alvo.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(origem / caminho, alvo)
    shutil.copyfile(manifesto, DESTINO / "manifest.json")
    shutil.copyfile(origem / "manifest.sig", DESTINO / "manifest.sig")
    print(f"{len(itens)} arquivos + manifesto copiados para {DESTINO}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
