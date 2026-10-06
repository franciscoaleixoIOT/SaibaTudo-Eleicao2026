# -*- coding: utf-8 -*-
"""
Agregador das avaliações do modelo (backend/modal/eval_golden.py --out ...) para o painel de qualidade e para o alerta de regressão.

Entrada: uma pasta com `AAAA-MM-DD_<versão>.json` (um por execução; o nightly_eval.yml grava um por noite). Saída: `index.json`, que o painel
estático (dashboard/index.html) lê, com a série histórica e os alertas da execução mais recente.

Alertas (a execução mais recente contra o histórico):
  - intenção abaixo do mínimo do gate (MIN_INTENT_ACC_PCT);
  - queda de intenção maior que MAX_QUEDA_PP contra a mediana das JANELA execuções anteriores (regressão silenciosa);
  - alucinação de alguma entidade acima de MAX_ALUCINACAO_PCT;
  - JSON inválido mesmo com gramática (a integração gramática/modelo quebrou);
  - mudança de versão do modelo (informativo: não é problema, mas explica uma queda).

Uso:  python tools/metricas.py --dir eval --out eval/index.json
Código de saída: 0 = sem alerta; 1 = há alerta; 2 = erro de uso.
"""
import argparse
import json
import re
import statistics
import sys
from pathlib import Path

MIN_INTENT_ACC_PCT = 85.0
MAX_QUEDA_PP = 2.0
MAX_ALUCINACAO_PCT = 5.0
JANELA = 7

NOME_RX = re.compile(r"^(\d{4}-\d{2}-\d{2})_(.+?)\.json$")
ENTIDADES = ("cargo", "uf", "partido", "nome", "tema", "historico", "turno", "apenasDeferidas")


def resumo(ev: dict, data: str, versao: str) -> dict:
    """Resumo de uma avaliação (o campo `constrained` é o modo de produção)."""
    c = ev.get("constrained") or {}
    real = ev.get("real") or None
    return {
        "data": data,
        "versao": versao,
        "casos": c.get("n_cases"),
        "intencao_pct": c.get("intent_acc_pct"),
        "json_valido_pct": c.get("json_valid_pct"),
        "entidades_pct": {k: c.get(f"{k}_acc_pct") for k in ENTIDADES if c.get(f"{k}_acc_pct") is not None},
        "alucinacao_pct": {k: c.get(f"{k}_hallucination_pct") for k in ENTIDADES if c.get(f"{k}_hallucination_pct") is not None},
        "latencia_media_s": c.get("latency_s_mean"),
        "real": ({"casos": real.get("n_cases"), "intencao_pct": real.get("intent_acc_pct")} if real else None),
    }


def carregar_historico(pasta: Path) -> list:
    """Lê todos os AAAA-MM-DD_<versão>.json da pasta, em ordem de data (arquivos com outro nome e JSON inválido são ignorados)."""
    historico = []
    for p in sorted(Path(pasta).glob("*.json")):
        m = NOME_RX.match(p.name)
        if not m or p.name == "index.json":
            continue
        try:
            ev = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        historico.append(resumo(ev, m.group(1), m.group(2)))
    return sorted(historico, key=lambda r: (r["data"], r["versao"]))


def alertas(historico: list, *, min_intent=MIN_INTENT_ACC_PCT, max_queda=MAX_QUEDA_PP, max_alucinacao=MAX_ALUCINACAO_PCT, janela=JANELA) -> list:
    """Alertas da execução mais recente. Lista de textos (vazia = tudo bem)."""
    if not historico:
        return []
    ultimo, anteriores = historico[-1], historico[:-1]
    problemas = []

    ia = ultimo.get("intencao_pct")
    if ia is None:
        problemas.append("a avaliação mais recente não mediu a intenção")
    elif ia < min_intent:
        problemas.append(f"intenção {ia}% abaixo do mínimo de {min_intent}%")

    base = [r["intencao_pct"] for r in anteriores[-janela:] if r.get("intencao_pct") is not None]
    if ia is not None and len(base) >= 2:
        mediana = statistics.median(base)
        if mediana - ia > max_queda:
            problemas.append(f"intenção caiu {mediana - ia:.1f} pontos contra a mediana das últimas {len(base)} execuções ({mediana}% -> {ia}%)")

    for k, h in (ultimo.get("alucinacao_pct") or {}).items():
        if h is not None and h > max_alucinacao:
            problemas.append(f"alucinação de {k} em {h}% (limite {max_alucinacao}%)")

    if ultimo.get("json_valido_pct") not in (None, 100.0):
        problemas.append(f"JSON inválido mesmo com gramática: {ultimo['json_valido_pct']}% (integração gramática/modelo)")

    return problemas


def mudancas_de_versao(historico: list) -> list:
    saida = []
    for a, b in zip(historico, historico[1:]):
        if a["versao"] != b["versao"]:
            saida.append({"data": b["data"], "de": a["versao"], "para": b["versao"]})
    return saida


def indice(pasta: Path) -> dict:
    h = carregar_historico(pasta)
    return {"execucoes": h, "alertas": alertas(h), "mudancasDeVersao": mudancas_de_versao(h),
            "limites": {"intencaoMinima": MIN_INTENT_ACC_PCT, "quedaMaxima": MAX_QUEDA_PP, "alucinacaoMaxima": MAX_ALUCINACAO_PCT}}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    if not Path(a.dir).is_dir():
        print(f"pasta inexistente: {a.dir}", file=sys.stderr)
        return 2
    idx = indice(Path(a.dir))
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(idx, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    for p in idx["alertas"]:
        print("ALERTA:", p)
    print(f"{len(idx['execucoes'])} execuções agregadas -> {a.out}")
    return 1 if idx["alertas"] else 0


if __name__ == "__main__":
    sys.exit(main())
