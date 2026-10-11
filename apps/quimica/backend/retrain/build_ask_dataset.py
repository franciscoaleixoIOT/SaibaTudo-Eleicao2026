# -*- coding: utf-8 -*-
"""
Monta o conjunto de treino do EXPLICADOR (Qwen3-4B-Instruct-2507) a partir de dataset/qa/*.jsonl (docs/DATA_CONTRACT.md §7).

Entram os registros de tipo `conceito` (explicação ancorada em trechos licenciados), `seguranca` (perigos, EPI, primeiros socorros, ICSC/GHS)
e `recusa` (pedidos perigosos com a resposta de recusa padrão). Cada registro vira um exemplo no formato de ai_model/scripts/train_hybrid.py:

    {instruction, input, output, text, id, tipo, nivel}
      instruction  prompt de sistema (ask_core.ASK_SYSTEM_PROMPT)
      input        mensagem do usuário: TRECHOS licenciados + CONTEXTO + PERGUNTA (ask_core.build_user_message)
      output       a resposta do dataset (+ citação [id] dos trechos, se a resposta ainda não citar)
      text         ChatML completo (prompt + resposta), idêntico ao que o Space e o Modal montam na hora de servir

Os trechos vêm de `trechos` embutidos no registro ou de `fontes[].id` buscados em data/quimica/textos/**/<id>.json.

Garantias (todas testadas):
  - holdout de 20 % por hash do id: o MESMO registro cai sempre do mesmo lado e o holdout nunca treina (usado por eval_fidelidade.py);
  - as perguntas dos contratos (nlu_golden_cases, nlu_real_cases, seguranca_cases) ficam FORA: iguais ou quase iguais (Jaccard >= 0,8);
  - fidelidade: registro cuja resposta tem número que não está na pergunta/contexto/trechos é DESCARTADO (vai para descartados.jsonl);
  - `recusa` tem de ser uma recusa; `conceito`/`seguranca` não podem ensinar a produzir nada perigoso;
  - `conceito` sem nenhum trecho encontrado é descartado (o explicador nunca treina a responder de memória).

Uso:  python backend/retrain/build_ask_dataset.py --out backend/retrain/out-ask-v1
"""
import argparse
import json
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import dataset_common as dc  # noqa: E402  (também põe backend/modal no sys.path)
import ask_core as core  # noqa: E402
import eval_ask_common as common  # noqa: E402

REPO_ROOT = dc.REPO_ROOT
TIPOS_PADRAO = ("conceito", "seguranca", "recusa")


def montar_exemplo(rec: dict, trechos: list, citar: bool = True) -> dict:
    """Um registro do dataset -> exemplo de treino. Não valida: quem chama decide se o exemplo entra (ver classificar)."""
    pergunta = core.clean_text(rec["pergunta"])
    contexto = core.clean_text(rec.get("contexto") or "", manter_quebras=True)
    resposta = str(rec["resposta"]).strip()
    if citar and rec.get("tipo") != "recusa" and trechos:
        ausentes = [t["id"] for t in trechos if t["id"] not in resposta]
        if ausentes and not any(t["id"] in resposta for t in trechos):
            resposta = resposta + " " + " ".join(f"[{i}]" for i in ausentes)
    return {
        "instruction": core.ASK_SYSTEM_PROMPT,
        "input": core.build_user_message(pergunta, contexto, trechos),
        "output": resposta,
        "text": core.build_ask_training_text(pergunta, contexto, trechos, resposta),
        "id": rec["id"], "tipo": rec["tipo"], "nivel": rec.get("nivel"),
    }


def classificar(rec: dict, trechos: list, exemplo: dict) -> str | None:
    """None se o exemplo pode treinar; senão o motivo do descarte."""
    tipo = rec["tipo"]
    resposta = exemplo["output"]
    if tipo == "recusa":
        return None if core.e_recusa(resposta) and not core.ensina_producao(resposta) else "recusa_sem_frase_de_recusa"
    if core.ensina_producao(resposta):
        return "ensina_producao"
    if tipo == "conceito" and not trechos:
        return "sem_trecho"
    contexto = core.clean_text(rec.get("contexto") or "", manter_quebras=True)
    fontes = core.texto_das_fontes(core.clean_text(rec["pergunta"]), contexto, trechos)
    if core.numeros_sem_fonte(resposta, fontes):
        return "numero_sem_fonte"
    return None


def construir(registros: list, indice_textos: dict, filtro: dc.FiltroDeContrato, tipos=TIPOS_PADRAO, holdout_pct: int = 20,
              citar: bool = True, max_trechos: int = 4) -> tuple:
    """Devolve (treino, holdout, descartados, stats)."""
    stats = Counter()
    treino, holdout, descartados = [], [], []
    vistos = set()
    for rec in registros:
        if rec.get("tipo") not in tipos:
            stats["fora_dos_tipos"] += 1
            continue
        if not all(isinstance(rec.get(k), str) and rec[k].strip() for k in ("id", "pergunta", "resposta")):
            stats["registro_incompleto"] += 1
            continue
        if rec["id"] in vistos:
            stats["id_repetido"] += 1
            continue
        vistos.add(rec["id"])
        v = filtro.veredito(rec["pergunta"])
        if v:
            stats[f"contrato_{v}_removido"] += 1
            continue
        trechos = [] if rec["tipo"] == "recusa" else common.trechos_do_registro(rec, indice_textos, max_trechos)
        exemplo = montar_exemplo(rec, trechos, citar)
        motivo = classificar(rec, trechos, exemplo)
        if motivo:
            stats[f"descartado_{motivo}"] += 1
            descartados.append({"id": rec["id"], "tipo": rec["tipo"], "motivo": motivo, "pergunta": rec["pergunta"], "resposta": rec["resposta"]})
            continue
        destino = holdout if core.eh_holdout(rec["id"], holdout_pct) else treino
        destino.append(exemplo)
        stats[f"{'holdout' if destino is holdout else 'treino'}_{rec['tipo']}"] += 1
    stats["treino_total"], stats["holdout_total"], stats["descartados_total"] = len(treino), len(holdout), len(descartados)
    return treino, holdout, descartados, dict(stats)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--qa", default=str(REPO_ROOT / "dataset" / "qa"), help="pasta com os .jsonl (ou um arquivo)")
    ap.add_argument("--textos", default=str(REPO_ROOT / "data" / "quimica" / "textos"))
    ap.add_argument("--contracts", default=str(REPO_ROOT / "contracts"))
    ap.add_argument("--out", required=True, help="pasta de saída (ex.: backend/retrain/out-ask-v1; ignorada pelo Git)")
    ap.add_argument("--tipos", default=",".join(TIPOS_PADRAO))
    ap.add_argument("--holdout-pct", type=int, default=20)
    ap.add_argument("--max-trechos", type=int, default=4)
    ap.add_argument("--permitir-fixture", action="store_true", help="aceita dataset gerado da fixture de teste (só para testar o fluxo)")
    ap.add_argument("--sem-citacao", action="store_true", help="não acrescenta [id] ao fim das respostas que não citam o trecho")
    a = ap.parse_args(argv)

    dc.exigir_dados_reais(a.qa, a.permitir_fixture)
    registros = common.ler_jsonl(a.qa)
    if not registros:
        raise SystemExit(f"nenhum registro em {a.qa} (rode o gerador do dataset antes)")
    filtro = dc.FiltroDeContrato(dc.perguntas_dos_contratos(a.contracts))
    treino, holdout, descartados, stats = construir(
        registros, common.indexar_textos(a.textos), filtro, tuple(t for t in a.tipos.split(",") if t), a.holdout_pct,
        not a.sem_citacao, a.max_trechos,
    )
    insumos = sorted(Path(a.qa).glob("*.jsonl")) if Path(a.qa).is_dir() else [Path(a.qa)]
    meta = {"holdout_pct": a.holdout_pct, "tipos": a.tipos, "max_trechos": a.max_trechos, "citacao": not a.sem_citacao,
            "insumos_sha256": dc.sha256_arquivos(insumos), "contratos_usados": len(filtro.exatas)}
    dc.escrever_saidas(a.out, treino, holdout, stats, meta, descartados)
    print(json.dumps(stats, ensure_ascii=False, indent=1, sort_keys=True))
    print(f"-> {a.out}: {len(treino)} treino, {len(holdout)} holdout, {len(descartados)} descartados (ver descartados.jsonl)")
    return 0 if treino else 1


if __name__ == "__main__":
    sys.exit(main())
