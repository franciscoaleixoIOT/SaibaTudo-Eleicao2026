# -*- coding: utf-8 -*-
"""
Monta o conjunto de treino do NLU (Qwen2.5-1.5B-Instruct) a partir de dataset/nlu/*.jsonl (docs/DATA_CONTRACT.md §7):
    {"q": "massa molar do ácido sulfúrico", "alvo": {"intent": "MASSA_MOLAR", "composto": "H2SO4"}}
(as entidades podem vir no próprio `alvo` ou dentro de `alvo.entidades`).

Cada registro vira um exemplo no formato de ai_model/scripts/train_hybrid.py: {instruction, input, output, text, id}, com o alvo escrito por
nlu_core.format_output (só chaves presentes, ordem fixa — exatamente o que a gramática GBNF aceita).

Se a pasta já tem `train.jsonl` e `val.jsonl` (saída de dataset/gerar_nlu.py, que separa a validação por ENTIDADE para medir generalização), essa
divisão é respeitada: train.jsonl treina e val.jsonl vira o holdout. Sem eles, vale o hash da pergunta (20 %). Arquivos `*_sft*.jsonl` são ignorados.

Garantias (todas testadas): alvo válido pelo vocabulário (nlu_core.has_valid_shape); holdout de 20 % por hash da pergunta, que nunca treina
(vira holdout_cases.json no esquema dos casos de referência, para convert_local.py --holdout-cases); perguntas dos contratos (golden,
perguntas reais, segurança) ficam FORA, iguais ou quase iguais; e a entidade do alvo precisa ter evidência na pergunta (a mesma ideia da
ancoragem do proxy) — rótulo que a ancoragem derrubaria ensinaria o modelo a alucinar.

Uso:  python backend/retrain/build_nlu_dataset.py --out backend/retrain/out-nlu-v1
"""
import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import dataset_common as dc  # noqa: E402  (também põe backend/modal no sys.path)
import ask_core  # noqa: E402
import nlu_core as nlu  # noqa: E402
import eval_ask_common as common  # noqa: E402

REPO_ROOT = dc.REPO_ROOT


def alvo_normalizado(alvo: dict) -> dict:
    """Junta `alvo.entidades` ao `alvo` e fica só com as chaves do contrato."""
    plano = {k: v for k, v in alvo.items() if k != "entidades"}
    if isinstance(alvo.get("entidades"), dict):
        plano = {**alvo["entidades"], **plano}
    return {k: v for k, v in plano.items() if k in nlu.KEYS and v not in (None, "", [])}


def id_da_pergunta(q: str) -> str:
    return hashlib.sha256(ask_core.normalizar_pergunta(q).encode("utf-8")).hexdigest()[:16]


_SETA_DUPLA = re.compile(r"<[-=]{1,3}>|⇌|↔|⇄")
_SETA = re.compile(r"(?:-{1,3}|={1,3})>|→|⟶|➔|⇒|=")


def _eq_norm(s: str) -> str:
    """Equação sem espaços, com sub/sobrescritos como dígitos e setas unificadas em "->" / "<->" (a mesma ideia de api/_lib/ground.js)."""
    t = _SETA_DUPLA.sub("<->", ask_core.simplificar(s))
    return re.sub(r"\s+", "", _SETA.sub("->", t))


def _sem_coeficientes(s: str) -> str:
    return "".join(re.sub(r"^\d+(?:/\d+)?", "", p) for p in re.split(r"(<->|->|\+)", s))


def evidencia_basica(q: str, alvo: dict) -> str | None:
    """Verificação barata de evidência (a ancoragem completa é a do proxy, testada em api/): a equação e cada quantidade precisam aparecer
    na pergunta. Devolve o campo sem evidência, ou None."""
    if "equacao" in alvo:
        eq, pergunta = _eq_norm(alvo["equacao"]), _eq_norm(q)
        if eq not in pergunta and _sem_coeficientes(eq) not in _sem_coeficientes(pergunta):
            return "equacao"
    chaves = ask_core.numeros_de(q)
    for x in alvo.get("quantidades") or []:
        if ask_core._chave(float(x["valor"])) not in chaves:
            return "quantidades"
    return None


def construir(registros: list, filtro: dc.FiltroDeContrato, holdout_pct: int = 20) -> tuple:
    stats = Counter()
    treino, holdout, casos_holdout, descartados = [], [], [], []
    vistos = set()
    for rec in registros:
        q, alvo = rec.get("q"), rec.get("alvo")
        if not isinstance(q, str) or not isinstance(alvo, dict):
            stats["registro_incompleto"] += 1
            continue
        try:
            q = nlu.validate_question(q)
        except ValueError:
            stats["pergunta_invalida"] += 1
            continue
        chave = ask_core.normalizar_pergunta(q)
        if chave in vistos:
            stats["pergunta_repetida"] += 1
            continue
        vistos.add(chave)
        v = filtro.veredito(q)
        if v:
            stats[f"contrato_{v}_removido"] += 1
            continue
        plano = alvo_normalizado(alvo)
        if not nlu.has_valid_shape(plano):
            stats["alvo_fora_do_vocabulario"] += 1
            descartados.append({"q": q, "motivo": "alvo_fora_do_vocabulario", "alvo": alvo})
            continue
        sem = evidencia_basica(q, plano)
        if sem:
            stats[f"sem_evidencia_{sem}"] += 1
            descartados.append({"q": q, "motivo": f"sem_evidencia_{sem}", "alvo": alvo})
            continue
        saida = nlu.format_output(plano)
        ident = id_da_pergunta(q)
        ex = {"instruction": nlu.SYSTEM_PROMPT, "input": q, "output": saida, "text": nlu.build_training_text(q, saida), "id": ident, "intent": plano["intent"]}
        lado = rec.get("_lado") or ("holdout" if ask_core.eh_holdout(ident, holdout_pct) else "treino")
        if lado == "holdout":
            holdout.append(ex)
            casos_holdout.append({"q": q, **{k: plano.get(k) for k in nlu.KEYS if k != "intent" and k in plano}, "intent": plano["intent"]})
            stats["holdout"] += 1
        else:
            treino.append(ex)
            stats["treino"] += 1
        stats[f"intent_{plano['intent']}"] += 1
    stats["treino_total"], stats["holdout_total"] = len(treino), len(holdout)
    return treino, holdout, casos_holdout, descartados, dict(stats)


def ler_registros(caminho) -> list:
    """Registros {q, alvo}. Com train.jsonl + val.jsonl na pasta, marca o lado de cada um (`_lado`); senão lê todos os .jsonl (menos *_sft*)."""
    p = Path(caminho)
    if p.is_dir() and (p / "train.jsonl").exists() and (p / "val.jsonl").exists():
        return ([{**r, "_lado": "treino"} for r in common.ler_jsonl(p / "train.jsonl")]
                + [{**r, "_lado": "holdout"} for r in common.ler_jsonl(p / "val.jsonl")])
    if p.is_dir():
        return [r for arq in sorted(p.glob("*.jsonl")) if "_sft" not in arq.name for r in common.ler_jsonl(arq)]
    return common.ler_jsonl(p)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--nlu", default=str(REPO_ROOT / "dataset" / "nlu"), help="pasta com os .jsonl (ou um arquivo)")
    ap.add_argument("--contracts", default=str(REPO_ROOT / "contracts"))
    ap.add_argument("--out", required=True, help="pasta de saída (ex.: backend/retrain/out-nlu-v1; ignorada pelo Git)")
    ap.add_argument("--holdout-pct", type=int, default=20)
    ap.add_argument("--permitir-fixture", action="store_true", help="aceita dataset gerado da fixture de teste (só para testar o fluxo)")
    a = ap.parse_args(argv)

    dc.exigir_dados_reais(a.nlu, a.permitir_fixture)
    registros = ler_registros(a.nlu)
    if not registros:
        raise SystemExit(f"nenhum registro em {a.nlu} (rode o gerador do dataset antes)")
    filtro = dc.FiltroDeContrato(dc.perguntas_dos_contratos(a.contracts))
    treino, holdout, casos, descartados, stats = construir(registros, filtro, a.holdout_pct)
    insumos = [x for x in sorted(Path(a.nlu).glob("*.jsonl")) if "_sft" not in x.name] if Path(a.nlu).is_dir() else [Path(a.nlu)]
    meta = {"holdout_pct": a.holdout_pct, "insumos_sha256": dc.sha256_arquivos(insumos), "contratos_usados": len(filtro.exatas), "formato": nlu.FORMAT_VERSION}
    dc.escrever_saidas(a.out, treino, holdout, stats, meta, descartados)
    (Path(a.out) / "holdout_cases.json").write_text(json.dumps({"cases": casos}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(stats, ensure_ascii=False, indent=1, sort_keys=True))
    print(f"-> {a.out}: {len(treino)} treino, {len(holdout)} holdout, {len(descartados)} descartados")
    return 0 if treino else 1


if __name__ == "__main__":
    sys.exit(main())
