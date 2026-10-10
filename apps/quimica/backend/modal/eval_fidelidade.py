# -*- coding: utf-8 -*-
"""
GATE DE FIDELIDADE do explicador: sobre uma amostra de dataset/qa/*.jsonl de tipo `conceito`, gera a explicação com os trechos licenciados
no prompt e confere que TODO número da resposta aparece na pergunta ou nos trechos (ask_core.numeros_sem_fonte). Meta: >= 98 % das
respostas sem número inventado. Em produção o servidor (api/_lib/fidelidade.js) descarta o que passar; este gate mede o modelo antes.

Informativo (não bloqueia): citações com id que não foi enviado e respostas vazias.

A amostra usa, por padrão, só o HOLDOUT (20 % dos ids por hash, que o treino nunca viu) em ordem estável; `--todos` usa tudo.

Uso:  python backend/modal/eval_fidelidade.py --gguf ai_model/output/gguf/ask-v1-20261101/model-Q4_K_M.gguf --amostra 200
      python backend/modal/eval_fidelidade.py --endpoint https://...modal.run
Código de saída: 0 = aprovado; 1 = reprovado.
"""
import argparse
import hashlib
import json
import re
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import ask_core as core  # noqa: E402
import eval_ask_common as common  # noqa: E402

MIN_FIEL_PCT = 98.0
TIPO = "conceito"


def amostra(registros, indice_textos, n: int, so_holdout: bool = True, holdout_pct: int = 20, max_trechos: int = 4) -> list:
    """Itens {id, q, contexto, trechos} de tipo `conceito` com ao menos um trecho encontrado; ordem estável por hash do id."""
    itens = []
    for r in registros:
        if r.get("tipo") != TIPO or not isinstance(r.get("pergunta"), str) or not isinstance(r.get("id"), str):
            continue
        if so_holdout and not core.eh_holdout(r["id"], holdout_pct):
            continue
        trechos = common.trechos_do_registro(r, indice_textos, max_trechos)
        if not trechos:
            continue
        itens.append({"id": r["id"], "q": r["pergunta"], "contexto": r.get("contexto") or "", "trechos": trechos})
    itens.sort(key=lambda i: hashlib.sha256(i["id"].encode("utf-8")).hexdigest())
    return itens[:n]


def citacoes_invalidas(resposta: str, trechos) -> list:
    ids = {t["id"] for t in trechos}
    achadas = []
    for m in re.finditer(r"\[([^\]\n]{1,100})\]", resposta):
        c = m.group(1).strip()
        if re.fullmatch(r"\d{1,3}", c):
            continue
        achadas += [p for p in re.split(r"\s*[;,]\s*", c) if p not in ids]
    return achadas


def evaluate(generate, itens, label: str = "") -> dict:
    ok = vazias = falhas_gen = com_citacao_invalida = 0
    detalhe = []
    for it in itens:
        try:
            resposta = generate(it["q"], it["contexto"], it["trechos"])
        except Exception as e:  # falha de geração conta como infiel (não há resposta verificável)
            falhas_gen += 1
            detalhe.append({"id": it["id"], "motivo": f"erro: {type(e).__name__}"})
            continue
        if not resposta.strip():
            vazias += 1
            detalhe.append({"id": it["id"], "motivo": "resposta vazia"})
            continue
        sobras = core.numeros_sem_fonte(resposta, core.texto_das_fontes(it["q"], it["contexto"], it["trechos"]))
        if sobras:
            detalhe.append({"id": it["id"], "motivo": "número sem fonte", "numeros": sobras[:5], "q": it["q"]})
        else:
            ok += 1
        if citacoes_invalidas(resposta, it["trechos"]):
            com_citacao_invalida += 1
    n = len(itens)
    return {
        "label": label,
        "n": n,
        "fiel_pct": round(100.0 * ok / n, 1) if n else None,
        "vazias": vazias,
        "falhas_de_geracao": falhas_gen,
        "citacao_invalida": com_citacao_invalida,
        "falhas": detalhe,
    }


def check_gates(res: dict, min_fiel: float = MIN_FIEL_PCT, min_amostra: int = 1):
    if res["n"] < min_amostra:
        return False, [f"amostra vazia: nenhum registro `{TIPO}` com trechos encontrados (dataset/qa e data/quimica/textos)"]
    if res["fiel_pct"] < min_fiel:
        return False, [f"fidelidade numérica {res['fiel_pct']}% < {min_fiel}% ({res['n']} respostas)"]
    return True, []


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    fonte = ap.add_mutually_exclusive_group(required=True)
    fonte.add_argument("--gguf", help="GGUF do explicador (requer llama-cpp-python)")
    fonte.add_argument("--endpoint", help="URL do endpoint do explicador (POST {question, context, trechos})")
    ap.add_argument("--qa", default=str(common.DEFAULT_QA), help="pasta com os .jsonl do dataset (ou um arquivo)")
    ap.add_argument("--textos", default=str(common.DEFAULT_TEXTOS))
    ap.add_argument("--amostra", type=int, default=200)
    ap.add_argument("--todos", action="store_true", help="usa todos os registros, não só o holdout")
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--gpu-layers", type=int, default=0)
    ap.add_argument("--min-fiel", type=float, default=MIN_FIEL_PCT)
    ap.add_argument("--out", help="grava o resultado completo em JSON")
    a = ap.parse_args(argv)

    itens = amostra(common.ler_jsonl(a.qa), common.indexar_textos(a.textos), a.amostra, so_holdout=not a.todos)
    if a.gguf:
        gen = common.llama_ask_generator(a.gguf, n_threads=a.threads, n_gpu_layers=a.gpu_layers)
    else:
        chave, segredo = common.credenciais_do_ambiente()
        gen = common.http_ask_generator(a.endpoint, chave, segredo)
    t0 = time.time()
    res = evaluate(gen, itens, "explicador")
    ok, motivos = check_gates(res, a.min_fiel)
    print(f"== fidelidade numérica ({res['n']} respostas, {time.time() - t0:.0f} s)")
    print(f"   respostas sem número inventado ... {res['fiel_pct']}%  (meta >= {a.min_fiel}%)")
    print(f"   vazias {res['vazias']} | falhas de geração {res['falhas_de_geracao']} | com citação inválida {res['citacao_invalida']} (informativo)")
    for f in res["falhas"][:20]:
        print(f"   - {f['id']}: {f['motivo']} {f.get('numeros', '')}")
    print("\nGATE DE FIDELIDADE:", "APROVADO" if ok else "REPROVADO")
    for m in motivos:
        print("  -", m)
    if a.out:
        Path(a.out).write_text(json.dumps({"passed": ok, "reasons": motivos, **res}, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
