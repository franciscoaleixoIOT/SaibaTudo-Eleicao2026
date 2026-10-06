# -*- coding: utf-8 -*-
"""
Juiz LLM da fila de revisão: dá uma SEGUNDA OPINIÃO sobre a intenção/entidades de perguntas reais, independente das regras do NLU.

Por que existe: o rótulo das regras (label_extra.mjs) ensina ao modelo o que as regras já sabem. O modelo em produção olha a mesma pergunta por
outro caminho; quando os dois concordam numa intenção SEM entidade, o risco de um erro é só de roteamento (fila.mjs aceita sozinho); em todo o
resto decide uma pessoa. O juiz NUNCA produz fato nem resposta: a saída é o mesmo JSON v2 do NLU (intenção + entidades citadas), gerada com a
MESMA gramática de produção e depois ancorada no texto da pergunta pelo normalizador do proxy (fila.mjs).

Uso (local, sem custo, com o GGUF da versão em produção):
  pip install llama-cpp-python
  python backend/retrain/judge_extra.py --gguf ai_model/output/gguf/v2.1-20261003/model-Q4_K_M.gguf \
         --in perguntas.jsonl --out julgadas.jsonl
Uso contra o endpoint do Modal (acorda o contêiner; custo de CPU de poucos minutos):
  python backend/retrain/judge_extra.py --endpoint https://...modal.run --key wk-... --secret ws-... --in perguntas.jsonl --out julgadas.jsonl
Entrada: JSONL { q } (ou texto, um por linha). Saída: JSONL { q, bruto, valido } — `bruto` é o texto do modelo.
"""
import argparse
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "modal"))

import eval_golden as ev  # noqa: E402
import nlu_core as core  # noqa: E402


def ler_perguntas(caminho: Path):
    saida = []
    for linha in caminho.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#"):
            continue
        if linha.startswith("{"):
            q = json.loads(linha).get("q")
        else:
            q = linha
        if isinstance(q, str) and q.strip():
            saida.append(q.strip())
    return saida


def julgar(gen, perguntas, fmt: str = "v2"):
    """`gen(q) -> texto bruto`. Falha de geração vira `bruto=None` (a fila trata como "sem juiz": vai para uma pessoa)."""
    resultados = []
    for q in perguntas:
        try:
            bruto = gen(q)
        except Exception as e:  # noqa: BLE001
            resultados.append({"q": q, "bruto": None, "valido": False, "erro": type(e).__name__})
            continue
        obj = core.parse_model_output(bruto)
        resultados.append({"q": q, "bruto": bruto, "valido": bool(core.has_valid_shape(obj, fmt))})
    return resultados


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    fonte = ap.add_mutually_exclusive_group(required=True)
    fonte.add_argument("--gguf")
    fonte.add_argument("--endpoint")
    ap.add_argument("--key", default=os.environ.get("MODAL_KEY", ""))
    ap.add_argument("--secret", default=os.environ.get("MODAL_SECRET", ""))
    ap.add_argument("--in", dest="entrada", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--format", choices=core.FORMATS, default="v2")
    ap.add_argument("--threads", type=int, default=4)
    a = ap.parse_args(argv)

    perguntas = ler_perguntas(Path(a.entrada))
    gen = ev.llama_generator(a.gguf, a.format, True, a.threads) if a.gguf else ev.http_generator(a.endpoint, a.key, a.secret)
    resultados = julgar(gen, perguntas, a.format)
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in resultados), encoding="utf-8")
    validos = sum(1 for r in resultados if r["valido"])
    print(f"{len(resultados)} perguntas julgadas, {validos} com JSON válido -> {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
