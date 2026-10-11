#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Gera o dataset de perguntas e respostas (QA) do SaibaTudo Química, em português do Brasil, COM PROVENIÊNCIA.

Entrada: o pacote assinado `data/quimica/` (docs/DATA_CONTRACT.md) — ou, se ele ainda não existir, a fixture de teste em
`dataset/tests/fixtures/data-quimica/` (a saída então NÃO serve para treino; `stats.json` registra `fonteDados: "fixture"`).
Saída: `dataset/qa/*.jsonl` (uma linha por par, formato do DATA_CONTRACT §7) e `dataset/qa/stats.json`.

Famílias: elementos, compostos, calculos, nomenclatura, desenho, seguranca (GHS + trechos), recusas, conceitos (trechos).
Regras: nenhum número "de memória" — todo número da resposta vem do pacote, de cálculo por código, da pergunta, de uma definição
declarada ou de um trecho licenciado, e a origem de cada um fica em `numerosOrigem`. Python puro (biblioteca padrão).

Uso:
  python dataset/gerar_qa.py [--data data/quimica] [--out dataset/qa] [--seed 2026]
"""
import argparse
import json
import sys
from collections import Counter
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import fam_calculos  # noqa: E402
import ghs_pt  # noqa: E402
import fam_compostos  # noqa: E402
import fam_elementos  # noqa: E402
import fam_nomenclatura  # noqa: E402
import fam_recusas_desenho_seguranca as frds  # noqa: E402
import fam_regras  # noqa: E402
import fam_textos  # noqa: E402
from comum import REPO, escrever_jsonl, jaccard, norm_question, tokens  # noqa: E402
from dados_recusas import RECUSA_PADRAO  # noqa: E402
from pacote import localizar  # noqa: E402
from qa_base import Ctx  # noqa: E402

SCRIPT_VERSION = "1.0"
LICENCA_DATASET = "CC BY-SA 4.0"
ARQUIVOS = {
    "elementos": ["elementos"], "compostos": ["compostos"], "calculos": ["calculos"], "nomenclatura": ["nomenclatura"], "regras": ["regras"], "desenho": ["desenho"],
    "seguranca": ["seguranca", "seguranca_texto"], "recusas": ["recusas"], "conceitos": ["conceitos"],
}


def gerar(pac, seed=2026, variantes_el=2, variantes_co=1, n_recusas=420):
    ghs_pt.usar_frases_oficiais(pac.frases_h)
    ctx = Ctx(pac, seed=seed, variantes=variantes_el)
    fam_elementos.gerar(ctx)
    fam_compostos.gerar(ctx, variantes=variantes_co)
    fam_calculos.gerar(ctx)
    fam_nomenclatura.gerar(ctx)
    fam_regras.gerar(ctx)
    frds.gerar_desenho(ctx)
    frds.gerar_seguranca_ghs(ctx)
    frds.gerar_recusas(ctx, n_recusas)
    fam_textos.gerar(ctx)
    filtrar_contra_casos_de_seguranca(ctx, REPO / "contracts" / "seguranca_cases.json")
    return ctx


def filtrar_contra_casos_de_seguranca(ctx, caminho, limiar=0.8):
    """Remove dos pares de recusa/segurança tudo que for idêntico ou quase idêntico (Jaccard >= limiar) a um caso de contracts/seguranca_cases.json
    (os casos são material de TESTE do filtro de segurança: não podem estar no treino)."""
    p = Path(caminho)
    if not p.exists():
        return 0
    casos = json.loads(p.read_text(encoding="utf-8")).get("cases", [])
    toks = [tokens(c["q"]) for c in casos]
    exatos = {norm_question(c["q"]) for c in casos}
    mantidos, removidos = [], 0
    for r in ctx.registros:
        if r["tipo"] in ("recusa", "seguranca"):
            n = norm_question(r["pergunta"])
            if n in exatos or any(jaccard(tokens(r["pergunta"]), t) >= limiar for t in toks):
                removidos += 1
                continue
        mantidos.append(r)
    ctx.registros = mantidos
    ctx.stats["removidos_por_casos_de_seguranca"] = removidos
    return removidos


def escrever(ctx, out: Path):
    out.mkdir(parents=True, exist_ok=True)
    contagens = {}
    for arquivo, familias in ARQUIVOS.items():
        regs = []
        for f in familias:
            regs += ctx.por_familia(f)
        escrever_jsonl(out / f"{arquivo}.jsonl", regs)
        contagens[arquivo] = len(regs)
    return contagens


def _resumo_cobertura(cob):
    c = Counter(v["status"] for v in cob.values())
    com_fonte = [v for v in cob.values() if v["status"] != "sem fonte licenciada ainda"]
    return {"temas": len(cob), "ok": c.get("ok", 0), "faltamPares": c.get("faltam pares (há trecho disponível)", 0),
            "semFonteLicenciadaAinda": c.get("sem fonte licenciada ainda", 0),
            "fracaoOkEntreTemasComFonte": round(c.get("ok", 0) / len(com_fonte), 3) if com_fonte else None}


def montar_stats(ctx, contagens, a, pac):
    regs = ctx.registros
    por_tipo = Counter(r["tipo"] for r in regs)
    por_nivel = Counter(r["nivel"] for r in regs)
    stats = {
        "scriptVersion": SCRIPT_VERSION, "seed": a.seed, "licenca": LICENCA_DATASET,
        "fonteDados": "fixture" if pac.eh_fixture else ("parcial" if pac.manifest.get("parcial") else "real"), "versaoDados": pac.versao,
        "total": len(regs), "porArquivo": contagens, "porTipo": dict(sorted(por_tipo.items())), "porNivel": dict(sorted(por_nivel.items())),
        "elementos": len(pac.elementos), "compostos": len(pac.compostos),
        "conceitosPorFonte": ctx.__dict__.get("autoria_por_fonte", {}),
        "autoriaRejeitadas": ctx.__dict__.get("autoria_rejeitadas", [])[:50],
        "coberturaTemas": ctx.__dict__.get("cobertura_temas", {}),
        "coberturaResumo": _resumo_cobertura(ctx.__dict__.get("cobertura_temas", {})),
        "recusaPadrao": RECUSA_PADRAO, "frasesH": {"fonte": ghs_pt.FONTE_FRASES, "codigos": len(ghs_pt.frases_ativas())},
        "contadores": {k: v for k, v in sorted(ctx.stats.items()) if not k.startswith("tipo:")},
        "massaMolarDivergente": {"limitePct": 0.5, "total": len(ctx.__dict__.get("_divergentes", {})), "casos": list(ctx.__dict__.get("_divergentes", {}).values())[:200]},
        "avisos": ctx.avisos[:50], "avisosTotal": len(ctx.avisos),
    }
    return stats


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default=None, help="pasta do pacote (padrão: data/quimica se existir, senão a fixture)")
    ap.add_argument("--out", default=str(AQUI / "qa"))
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--variantes-elementos", type=int, default=2)
    ap.add_argument("--variantes-compostos", type=int, default=1)
    ap.add_argument("--recusas", type=int, default=420)
    a = ap.parse_args(argv)
    pac = localizar(a.data)
    ctx = gerar(pac, a.seed, a.variantes_elementos, a.variantes_compostos, a.recusas)
    contagens = escrever(ctx, Path(a.out))
    stats = montar_stats(ctx, contagens, a, pac)
    (Path(a.out) / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")
    print(json.dumps({k: stats[k] for k in ("fonteDados", "versaoDados", "total", "porArquivo", "porTipo", "conceitosPorFonte")}, ensure_ascii=False, indent=1))
    if pac.eh_fixture:
        print("\nATENÇÃO: gerado a partir da FIXTURE de teste (o pacote real data/quimica/ ainda não existe). Não usar para treino.")
    if pac.manifest.get("parcial"):
        print("\nATENÇÃO: pacote PARCIAL (" + str(pac.manifest.get("nota", "")) + "). Regerar quando o pacote real data/quimica/ existir.")
    print(f"\nOK -> {a.out}")


if __name__ == "__main__":
    main()
