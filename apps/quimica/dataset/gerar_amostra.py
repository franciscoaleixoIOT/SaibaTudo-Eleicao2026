#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Gera `dataset/AMOSTRA.md`: 60 pares representativos (5 por família, 12 famílias) legíveis, a partir de `dataset/qa/*.jsonl`.

Uso: python dataset/gerar_amostra.py [--qa dataset/qa] [--out dataset/AMOSTRA.md] [--seed 2026]
"""
import argparse
import json
import random
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

from comum import ler_jsonl  # noqa: E402

# (título, arquivo, filtro por geradoPor/tipo)
GRUPOS = [
    ("1. Elementos (fatos da tabela periódica)", "elementos", lambda r: True),
    ("2. Compostos (fatos do PubChem)", "compostos", lambda r: True),
    ("3. Cálculo: massa molar", "calculos", lambda r: r["geradoPor"] == "calculo:massa_molar"),
    ("4. Cálculo: balanceamento", "calculos", lambda r: r["geradoPor"] == "calculo:balanceamento"),
    ("5. Cálculo: estequiometria", "calculos", lambda r: r["geradoPor"].startswith(("calculo:estequiometria", "calculo:massa_para_mol", "calculo:mol_para"))),
    ("6. Cálculo: soluções e pH", "calculos", lambda r: r["geradoPor"].startswith(("calculo:ph", "calculo:molaridade", "calculo:diluicao", "calculo:massa_preparo", "calculo:g_por"))),
    ("7. Cálculo: gás ideal e conversão de unidades", "calculos", lambda r: r["geradoPor"].startswith(("calculo:gas_ideal", "calculo:conversao"))),
    ("8. Segurança (GHS e segurança geral)", "seguranca", lambda r: True),
    ("9. Recusas (pedidos perigosos)", "recusas", lambda r: True),
    ("10. Nomenclatura e regras de ensino", "nomenclatura", lambda r: True),
    ("11. Desenho de estruturas", "desenho", lambda r: True),
    ("12. Conceitos (a partir de trechos licenciados)", "conceitos", lambda r: True),
]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--qa", default=str(AQUI / "qa"))
    ap.add_argument("--out", default=str(AQUI / "AMOSTRA.md"))
    ap.add_argument("--seed", type=int, default=2026)
    a = ap.parse_args(argv)
    rng = random.Random(a.seed)
    qa = Path(a.qa)
    stats = json.loads((qa / "stats.json").read_text(encoding="utf-8"))
    linhas = ["# Amostra do dataset de perguntas e respostas", "",
              f"60 pares representativos (5 por família), sorteados com semente fixa ({a.seed}) de `dataset/qa/*.jsonl`. "
              f"Gerado por `python dataset/gerar_amostra.py`. Dados: **{stats['fonteDados']}** (versão `{stats['versaoDados']}`); "
              f"licença do dataset: **{stats['licenca']}**.", ""]
    if stats["fonteDados"] == "fixture":
        linhas += ["> **Atenção:** esta amostra foi gerada a partir da fixture de teste (10 elementos e 20 compostos), porque o pacote real `data/quimica/` ainda não existia. "
                   "Os números das respostas vêm da fixture e **não** devem ser usados como referência química.", ""]
    for titulo, arquivo, filtro in GRUPOS:
        regs = [r for r in ler_jsonl(qa / f"{arquivo}.jsonl") if filtro(r)] if (qa / f"{arquivo}.jsonl").exists() else []
        if arquivo == "seguranca":  # 3 de GHS + 2 de segurança geral (trechos), se houver
            ghs = [r for r in regs if r["geradoPor"].startswith("template:")]
            txt = [r for r in regs if r["geradoPor"].startswith("autoria:")]
            escolha = rng.sample(txt, min(2, len(txt))) + rng.sample(ghs, min(5 - min(2, len(txt)), len(ghs)))
        elif arquivo == "nomenclatura":
            reg_rg = [r for r in ler_jsonl(qa / "regras.jsonl") if True] if (qa / "regras.jsonl").exists() else []
            escolha = rng.sample(regs, min(3, len(regs))) + rng.sample(reg_rg, min(2, len(reg_rg)))
        else:
            escolha = rng.sample(regs, min(5, len(regs)))
        linhas += [f"## {titulo}", ""]
        if not escolha:
            linhas += ["_(sem pares nesta família com os dados atuais)_", ""]
        for r in escolha:
            fontes = "; ".join(dict.fromkeys(f"{f.get('nome')} ({f.get('licenca')})" for f in r["fontes"]))
            linhas += [f"**P:** {r['pergunta']}", "", "**R:**", "", "```text", r["resposta"], "```", "",
                       f"`{r['id']}` · tipo `{r['tipo']}` · nível `{r['nivel']}` · gerado por `{r['geradoPor']}` · fontes: {fontes}", "", "---", ""]
    Path(a.out).write_text("\n".join(linhas), encoding="utf-8", newline="\n")
    print("OK ->", a.out)


if __name__ == "__main__":
    main()
