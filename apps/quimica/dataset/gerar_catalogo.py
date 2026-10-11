#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Gera o catálogo COMPLETO de perguntas e respostas do SaibaTudo Química.

Entrada: `dataset/qa/*.jsonl` (+ `qa/stats.json`) e, se existir, `dataset/nlu/stats.json`.
Saída:
  * `dataset/CATALOGO.md`   — catálogo legível, completo em cobertura: TODOS os modelos de pergunta por família (com um
                              exemplo real cada), na íntegra os pares escritos à mão (conceitos e segurança geral), todas
                              as perguntas de recusa, o índice de entidades (118 elementos, todos os compostos), a
                              cobertura dos 65 temas e um retrato do dataset de NLU.
  * `dataset/CATALOGO.jsonl` — lista LITERAL de todos os pares (id, família, tipo, nível, tema, pergunta, resposta, fontes).

Uso: python dataset/gerar_catalogo.py [--qa dataset/qa] [--out dataset/CATALOGO.md] [--jsonl dataset/CATALOGO.jsonl]
"""
import argparse
import json
import sys
from collections import Counter, OrderedDict
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

from comum import ler_jsonl  # noqa: E402

FAMILIAS = [
    ("1. Elementos (fatos da tabela periódica)", "elementos"),
    ("2. Compostos (fatos do PubChem)", "compostos"),
    ("3. Cálculos (massa molar, balanceamento, estequiometria, soluções, pH, gases, unidades)", "calculos"),
    ("4. Nomenclatura (nome x fórmula)", "nomenclatura"),
    ("5. Regras de ensino (solubilidade, reatividade)", "regras"),
    ("6. Desenho de estruturas (2D)", "desenho"),
    ("7. Segurança química (GHS, riscos, primeiros socorros)", "seguranca"),
    ("8. Recusas (pedidos perigosos)", "recusas"),
    ("9. Conceitos (explicações ancoradas em trechos licenciados)", "conceitos"),
]
AUTORIA = {"autoria:conceito", "autoria:seguranca"}


def _fontes(r):
    out = []
    for f in r.get("fontes") or []:
        par = (f.get("nome"), f.get("licenca"))
        if par not in out:
            out.append(par)
    return out


def _fontes_txt(r):
    return "; ".join(f"{n} ({l})" for n, l in _fontes(r))


def _exemplo(r):
    return [f"**P:** {r['pergunta']}", "", "**R:**", "", "```text", r["resposta"], "```", "",
            f"`{r['id']}` · nível `{r['nivel']}` · fonte: {_fontes_txt(r)}"]


def _tabela_contagens(stats):
    nomes = [("elementos", "1. Elementos"), ("compostos", "2. Compostos"), ("calculos", "3. Cálculos"),
             ("nomenclatura", "4. Nomenclatura"), ("regras", "5. Regras de ensino"), ("desenho", "6. Desenho"),
             ("seguranca", "7. Segurança"), ("recusas", "8. Recusas"), ("conceitos", "9. Conceitos")]
    linhas = ["| Família | Pares |", "| :-- | --: |"]
    for chave, rot in nomes:
        linhas.append(f"| {rot} | {stats['porArquivo'].get(chave, 0)} |")
    linhas.append(f"| **Total** | **{stats['total']}** |")
    linhas += ["", "Por tipo: " + " · ".join(f"{k} {v}" for k, v in sorted(stats["porTipo"].items())) + ".",
               "", "Por nível: " + " · ".join(f"{k} {v}" for k, v in sorted(stats["porNivel"].items())) + "."]
    return linhas


def _secao_familia(titulo, regs):
    linhas = [f"## {titulo}", ""]
    if not regs:
        return linhas + ["_(família vazia com os dados atuais)_", ""]
    por_modelo = OrderedDict()
    for r in regs:
        por_modelo.setdefault(r["geradoPor"], []).append(r)
    ordem = sorted(por_modelo.items(), key=lambda kv: (-len(kv[1]), kv[0]))
    templates = [(m, rr) for m, rr in ordem if m not in AUTORIA]
    manuais = [(m, rr) for m, rr in ordem if m in AUTORIA]
    if templates:
        linhas += [f"**{len(templates)} modelos de pergunta** cobrindo {sum(len(rr) for _, rr in templates)} pares. "
                   "Cada modelo é um texto-base com as entidades/valores substituídos; há um exemplo real por modelo.", "",
                   "### Modelos de pergunta (todos)", ""]
        for m, rr in templates:
            linhas += [f"#### `{m}` — {len(rr)} pares", ""] + _exemplo(rr[0]) + [""]
    if manuais:
        linhas += [f"### Pares escritos à mão ({sum(len(rr) for _, rr in manuais)}) — na íntegra", ""]
        for m, rr in manuais:
            linhas += [f"#### `{m}` — {len(rr)} pares", ""]
            for r in rr:
                linhas += [f"**P:** {r['pergunta']}", "", f"**R:** {r['resposta']}", "",
                           f"`{r['id']}` · tema `{r.get('tema')}` · nível `{r['nivel']}` · fonte: {_fontes_txt(r)}", "", "---", ""]
    linhas.append("")
    return linhas


def _secao_recusas(regs, recusa_padrao):
    linhas = ["## 8. Recusas (pedidos perigosos)", "",
              f"São **{len(regs)} pedidos** perigosos (síntese, purificação, escalonamento, obtenção caseira; com disfarces e "
              "grafias alteradas). **Todos recebem a mesma resposta padrão**, decidida por regra antes de qualquer modelo:", "",
              "```text", recusa_padrao, "```", ""]
    linhas += ["| Categoria | Pedidos |", "| :-- | --: |"]
    for m, n in sorted(Counter(r["geradoPor"] for r in regs).items()):
        linhas.append(f"| `{m}` | {n} |")
    linhas += ["", f"### Todas as perguntas ({len(regs)})", ""]
    for r in regs:
        linhas.append(f"- {r['pergunta']}")
    linhas.append("")
    return linhas


def _secao_temas(stats, regs_conceito):
    cob = stats.get("coberturaTemas") or {}
    if not cob:
        return []
    linhas = ["## Cobertura por tema (dataset/topicos.json)", "",
              f"Os {len(cob)} temas do mapa têm **{stats['coberturaResumo'].get('ok', 0)} com pares** escritos a partir de "
              "trechos licenciados. Exemplo por tema abaixo.", "",
              "| Tema | Nível | Pares | Trechos | Status |", "| :-- | :-- | --: | --: | :-- |"]
    for t, v in cob.items():
        linhas.append(f"| {v['nome']} (`{t}`) | {v['nivel']} | {v['pares']} | {v['trechosDisponiveis']} | {v['status']} |")
    linhas += ["", "Exemplos por tema:", ""]
    por_tema = {}
    for r in regs_conceito:
        por_tema.setdefault(r.get("tema"), r)
    for t, v in cob.items():
        r = por_tema.get(t)
        if r:
            linhas += [f"- **{v['nome']}** — **P:** {r['pergunta']}", f"  **R:** {r['resposta']}", ""]
    return linhas


def _secao_entidades(qa):
    els = ler_jsonl(qa / "elementos.jsonl")
    elems = {}
    for r in els:
        e = (r.get("entidades") or {}).get("elementos") or []
        if e and e[0] not in elems:
            elems[e[0]] = r
    cids = set()
    for r in ler_jsonl(qa / "compostos.jsonl"):
        for c in (r.get("entidades") or {}).get("compostos", []) or []:
            cids.add(c)
    linhas = ["## Índice de entidades cobertas", "",
              f"**Elementos ({len(elems)}).** Todos respondem aos modelos da família de elementos:", "",
              "| Z | Símbolo | Exemplo de pergunta |", "| --: | :--: | :-- |"]
    for simb, r in sorted(elems.items()):
        partes = r["id"].split("-")
        z = partes[1] if len(partes) > 1 and partes[1].isdigit() else ""
        linhas.append(f"| {z} | {simb} | {r['pergunta']} |")
    linhas += ["", f"**Compostos ({len(cids)}).** CIDs do núcleo (cada um responde aos modelos da família de compostos):", "",
               ", ".join(str(c) for c in sorted(cids)), ""]
    return linhas


def _secao_nlu(nlu_stats):
    if not nlu_stats:
        return []
    ints = (nlu_stats.get("por_intencao_train") or nlu_stats.get("intencoes")
            or nlu_stats.get("porIntent") or nlu_stats.get("por_intencao") or {})
    total = nlu_stats.get("total") or nlu_stats.get("exemplos") or "?"
    linhas = ["## Dataset de NLU (interpretação da pergunta)", "",
              f"{total} exemplos · treino {nlu_stats.get('train', '?')} · validação {nlu_stats.get('val', '?')} · "
              f"{nlu_stats.get('templates', '?')} modelos · {nlu_stats.get('compostos_no_pool', '?')} compostos no conjunto · "
              "arquivos em `dataset/nlu/`.", ""]
    if ints:
        linhas += ["| Intenção | Exemplos |", "| :-- | --: |"]
        for k, v in sorted(ints.items()):
            linhas.append(f"| `{k}` | {v} |")
        linhas.append("")
    return linhas


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--qa", default=str(AQUI / "qa"))
    ap.add_argument("--out", default=str(AQUI / "CATALOGO.md"))
    ap.add_argument("--jsonl", default=str(AQUI / "CATALOGO.jsonl"))
    a = ap.parse_args(argv)
    qa = Path(a.qa)
    stats = json.loads((qa / "stats.json").read_text(encoding="utf-8"))
    nlu_stats = None
    if (AQUI / "nlu" / "stats.json").exists():
        nlu_stats = json.loads((AQUI / "nlu" / "stats.json").read_text(encoding="utf-8"))

    por_fam, todas = {}, []
    for _, arq in FAMILIAS:
        regs = ler_jsonl(qa / f"{arq}.jsonl") if (qa / f"{arq}.jsonl").exists() else []
        por_fam[arq] = regs
        todas += regs

    L = ["# Catálogo completo de perguntas e respostas — SaibaTudo Química", "",
         f"**{stats['total']} pares** · dados **{stats['fonteDados']}** (versão `{stats['versaoDados']}`) · "
         f"licença **{stats['licenca']}** · semente `{stats['seed']}` · {stats['elementos']} elementos · "
         f"{stats['compostos']} compostos.", "",
         "Este catálogo cobre **todas as famílias e todos os modelos de pergunta**, lista **na íntegra** os pares escritos à "
         "mão (conceitos e segurança geral) e todas as perguntas de recusa. A lista **literal** de todos os pares está em "
         "`dataset/CATALOGO.jsonl` (e nos originais `dataset/qa/*.jsonl`). Nenhum par aparece sem a sua fonte.", "",
         "## Total por família", ""] + _tabela_contagens(stats) + [""]
    for titulo, arq in FAMILIAS:
        if arq == "recusas":
            L += _secao_recusas(por_fam[arq], stats.get("recusaPadrao", ""))
        else:
            L += _secao_familia(titulo, por_fam[arq])
    L += _secao_nlu(nlu_stats)
    L += _secao_temas(stats, por_fam.get("conceitos", []))
    L += _secao_entidades(qa)
    Path(a.out).write_text("\n".join(L), encoding="utf-8", newline="\n")

    with Path(a.jsonl).open("w", encoding="utf-8", newline="\n") as f:
        for _, arq in FAMILIAS:
            for r in por_fam[arq]:
                f.write(json.dumps({
                    "id": r["id"], "familia": arq, "tipo": r["tipo"], "nivel": r["nivel"], "tema": r.get("tema"),
                    "geradoPor": r["geradoPor"], "pergunta": r["pergunta"], "resposta": r["resposta"],
                    "fontes": [{"nome": n, "licenca": l} for n, l in _fontes(r)],
                }, ensure_ascii=False) + "\n")
    print(f"OK -> {a.out} e {a.jsonl} ({len(todas)} pares)")


if __name__ == "__main__":
    main()
