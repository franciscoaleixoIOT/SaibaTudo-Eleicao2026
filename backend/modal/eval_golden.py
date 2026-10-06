# -*- coding: utf-8 -*-
"""
Avaliação do NLU em nuvem contra os casos de referência (contracts/nlu_golden_cases.json).
Reutilizável no job de conversão (convert_gguf.py), localmente e em CI.

O que mede (sobre o campo `q` de cada caso):
  - JSON válido: a saída tem a estrutura esperada do formato (legacy|v2).
    * COM gramática (modo de produção): deve ser 100% — verifica a integração gramática/modelo.
    * SEM gramática (`--unconstrained`): validade NATIVA do modelo — é o gate de qualidade (>= 98%), porque com a
      gramática um modelo corrompido pela quantização ainda produziria JSON "válido" (porém inútil).
  - Acerto de cargo, UF e partido: entre os casos em que o caso de referência traz a chave com valor,
    quantos o modelo acertou; e a taxa de alucinação nos casos em que a chave é null ("exige ausência").
  - Acerto de intenção, só para intenções representáveis no formato LEGADO
    (LISTAR->FILTER_CANDIDATES, PERFIL->CANDIDATE_LOOKUP, CALENDARIO->CALENDAR_QUERY|info/calendario,
     LOCAL_VOTACAO->VOTING_LOCATION_QUERY|info/locais, CONTAR->info/estatisticas, PESQUISAS->info/pesquisas).
     As demais intenções (RESULTADOS, ELEGIBILIDADE, PATRIMONIO, RECOMENDACAO...) não existem no formato legado
     e ficam como "n/a"; no formato v2 todas contam.

Atenção: mede o MODELO bruto. A normalização/ancoragem oficial é api/_lib/normalize.js (no proxy da Vercel); aqui
não há ancoragem, então os números de alucinação são um limite superior do que o usuário final vê.

Uso local (GGUF):
  pip install llama-cpp-python
  python backend/modal/eval_golden.py --gguf ./model-Q4_K_M.gguf --format legacy [--unconstrained]
Uso contra o endpoint já publicado (só biblioteca padrão):
  python backend/modal/eval_golden.py --endpoint https://...modal.run --key wk-... --secret ws-... --format legacy
Código de saída: 0 = gates ok; 1 = reprovado.
"""
import argparse
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import nlu_core as core  # noqa: E402

DEFAULT_CASES = HERE.parent.parent / "contracts" / "nlu_golden_cases.json"

# Limiares padrão dos gates (TODOS bloqueiam a promoção; ver check_gates)
MIN_JSON_VALID_PCT = 98.0     # validade nativa, sem gramática
MIN_INTENT_ACC_PCT = 85.0     # acerto de intenção no contrato golden (meta de 90 % após o próximo retreino)
MIN_ENTITY_ACC_PCT = 90.0     # acerto por entidade (cargo, uf, partido, nome, tema, historico, turno, apenasDeferidas); meta 95 %
MAX_HALLUCINATION_PCT = 5.0   # entidade preenchida onde o contrato exige ausência (chave null)
MAX_QUANT_DROP_PP = 3.0       # queda Q4 x Q8 (pontos percentuais), em entidades e em intenção
MAX_REGRESSION_PP = 1.0       # queda de intenção vs. a versão em produção (catraca: nunca regride mais que isso)
MIN_CASES_PER_METRIC = 3      # métrica com menos casos que isso não bloqueia (amostra pequena demais)

# Entidades medidas por formato. O formato legado só expressa as quatro primeiras.
ENTIDADES = {
    "legacy": ("cargo", "uf", "partido", "nome"),
    "v2": ("cargo", "uf", "partido", "nome", "tema", "historico", "turno", "apenasDeferidas"),
}
ENTIDADES_TODAS = ENTIDADES["v2"]


# ---------------------------------------------------------------------------------------------------------
# Casos
# ---------------------------------------------------------------------------------------------------------
def load_cases(path=DEFAULT_CASES):
    dados = json.loads(Path(path).read_text(encoding="utf-8"))
    casos = dados["cases"]
    for c in casos:
        if not isinstance(c.get("q"), str):
            raise ValueError(f"caso sem q: {c}")
    return casos


def fold(s) -> str:
    return unicodedata.normalize("NFD", str(s)).encode("ascii", "ignore").decode().lower().strip()


# ---------------------------------------------------------------------------------------------------------
# Leitura da saída do modelo, por formato
# ---------------------------------------------------------------------------------------------------------
def model_entities(obj: dict, fmt: str) -> dict:
    """cargo/uf/partido/nome da saída BRUTA do modelo (sem ancoragem)."""
    if fmt == "legacy":
        f = obj.get("filters") or {}
        return {"cargo": f.get("cargo"), "uf": f.get("estado_uf"), "partido": f.get("partido"), "nome": f.get("nome_candidato")}
    return {k: obj.get(k) for k in ENTIDADES["v2"]}


def intent_matches(expected: str, obj: dict, fmt: str):
    """True/False, ou None quando a intenção esperada não é representável no formato."""
    if fmt == "v2":
        return obj.get("intent") == expected
    intent = obj.get("intent")
    rota = str(obj.get("target_route") or "")
    if expected == "LISTAR_CANDIDATOS":
        return intent == "FILTER_CANDIDATES"
    if expected == "PERFIL_CANDIDATO":
        return intent == "CANDIDATE_LOOKUP"
    if expected == "CALENDARIO":
        return intent == "CALENDAR_QUERY" or (intent == "EXPLAIN_TOPIC" and rota == "info/calendario")
    if expected == "LOCAL_VOTACAO":
        return intent == "VOTING_LOCATION_QUERY" or (intent == "EXPLAIN_TOPIC" and rota == "info/locais")
    if expected == "CONTAR":
        return intent == "EXPLAIN_TOPIC" and rota == "info/estatisticas"
    if expected == "PESQUISAS":
        return intent == "EXPLAIN_TOPIC" and rota == "info/pesquisas"
    return None


def _same(chave: str, esperado, obtido) -> bool:
    if obtido is None:
        return False
    if chave == "nome":  # "lula" == "LULA"; "fernando haddad" ⊆ "FERNANDO HADDAD DA SILVA"
        e, o = set(fold(esperado).split()), set(fold(obtido).split())
        return bool(e) and e <= o
    return fold(esperado) == fold(obtido)


# ---------------------------------------------------------------------------------------------------------
# Avaliação
# ---------------------------------------------------------------------------------------------------------
def evaluate(generate, cases, fmt: str, label: str = "") -> dict:
    """`generate(q) -> texto bruto do modelo`. Devolve métricas + detalhe por caso."""
    n = len(cases)
    validos = 0
    por_caso = []
    intent_ok = intent_n = 0
    ent = {k: {"ok": 0, "n": 0, "alucina": 0, "n_nulos": 0} for k in ENTIDADES[fmt]}
    lat = []

    for caso in cases:
        t0 = time.time()
        try:
            texto = generate(caso["q"])
        except Exception as e:  # falha de geração conta como inválido
            texto = ""
            erro = f"{type(e).__name__}"
        else:
            erro = None
        lat.append(time.time() - t0)
        obj = core.parse_model_output(texto)
        valido = core.has_valid_shape(obj, fmt)
        validos += int(valido)
        item = {"q": caso["q"], "json_valido": valido, "saida": (texto or "")[:600], **({"erro": erro} if erro else {})}
        if valido:
            if "intent" in caso:
                m = intent_matches(caso["intent"], obj, fmt)
                if m is not None:
                    intent_n += 1
                    intent_ok += int(m)
                    item["intent_ok"] = m
            got = model_entities(obj, fmt)
            for k in ent:
                if k not in caso:
                    continue
                if caso[k] is None:  # "chave com null exige ausência"
                    ent[k]["n_nulos"] += 1
                    ent[k]["alucina"] += int(got[k] is not None)
                else:
                    ent[k]["n"] += 1
                    ent[k]["ok"] += int(_same(k, caso[k], got[k]))
        elif "intent" in caso:
            m = intent_matches(caso["intent"], {}, fmt)
            if m is not None or fmt == "v2":
                intent_n += 1  # saída inválida conta como erro nos casos representáveis
        por_caso.append(item)

    def pct(a, b):
        return round(100.0 * a / b, 1) if b else None

    return {
        "label": label,
        "format": fmt,
        "n_cases": n,
        "json_valid_pct": pct(validos, n),
        "intent_acc_pct": pct(intent_ok, intent_n),
        "intent_cases": intent_n,
        **{f"{k}_acc_pct": pct(v["ok"], v["n"]) for k, v in ent.items()},
        **{f"{k}_cases": v["n"] for k, v in ent.items()},
        **{f"{k}_null_cases": v["n_nulos"] for k, v in ent.items()},
        **{f"{k}_hallucination_pct": pct(v["alucina"], v["n_nulos"]) for k, v in ent.items() if k != "nome"},
        "latency_s_mean": round(sum(lat) / len(lat), 2) if lat else None,
        "latency_s_max": round(max(lat), 2) if lat else None,
        "cases": por_caso,
    }


def entity_score(res: dict):
    """Média simples do acerto de cargo/UF/partido (ignora chaves sem casos). None se não houver nenhum."""
    vals = [res.get(f"{k}_acc_pct") for k in ("cargo", "uf", "partido")]
    vals = [v for v in vals if v is not None]
    return round(sum(vals) / len(vals), 1) if vals else None


def check_gates(constrained: dict, unconstrained: dict | None, baseline: dict | None = None, *,
                real: dict | None = None, previous: dict | None = None,
                min_json_valid: float = MIN_JSON_VALID_PCT, min_intent_acc: float = MIN_INTENT_ACC_PCT,
                min_entity_acc: float = MIN_ENTITY_ACC_PCT, max_hallucination: float = MAX_HALLUCINATION_PCT,
                max_quant_drop: float = MAX_QUANT_DROP_PP, max_regression: float = MAX_REGRESSION_PP,
                min_cases: int = MIN_CASES_PER_METRIC):
    """Gates de promoção. TODOS bloqueiam. Devolve (aprovado: bool, motivos: list[str]).

    constrained / unconstrained  avaliação do Q4_K_M no contrato golden COM e SEM gramática (validade nativa)
    baseline                     avaliação do Q8_0 (referência para a queda de quantização); None = não checa
    real                         avaliação no holdout de perguntas reais (contracts/nlu_real_cases.json); None = sem holdout ainda
    previous                     avaliação (constrained) da versão hoje em produção; None = primeira versão
    """
    motivos = []

    # 1) JSON válido
    if unconstrained is not None:
        v = unconstrained["json_valid_pct"]
        if v is None or v < min_json_valid:
            motivos.append(f"JSON válido sem gramática {v}% < {min_json_valid}%")
    if constrained["json_valid_pct"] != 100.0:
        motivos.append(f"JSON válido COM gramática {constrained['json_valid_pct']}% != 100% (problema na integração gramática/modelo)")

    # 2) intenção no golden
    ia = constrained.get("intent_acc_pct")
    if ia is None:
        motivos.append("acerto de intenção não medido (nenhum caso com intent)")
    elif ia < min_intent_acc:
        motivos.append(f"acerto de intenção {ia}% < {min_intent_acc}%")

    # 3) por entidade (não média): uma entidade ruim não pode ser escondida por outras boas
    for k in ENTIDADES_TODAS:
        n = constrained.get(f"{k}_cases") or 0
        acc = constrained.get(f"{k}_acc_pct")
        if n >= min_cases and acc is not None and acc < min_entity_acc:
            motivos.append(f"acerto de {k} {acc}% < {min_entity_acc}% ({n} casos)")

    # 4) alucinação: entidade preenchida onde o contrato exige ausência
    for k in ENTIDADES_TODAS:
        if k == "nome":
            continue
        n_nulos = constrained.get(f"{k}_null_cases") or 0
        h = constrained.get(f"{k}_hallucination_pct")
        if n_nulos >= min_cases and h is not None and h > max_hallucination:
            motivos.append(f"alucinação de {k} {h}% > {max_hallucination}% ({n_nulos} casos null)")

    # 5) holdout de perguntas reais (formulações que o treino nunca viu)
    if real is not None:
        ir = real.get("intent_acc_pct")
        if ir is None or ir < min_intent_acc:
            motivos.append(f"acerto de intenção nas perguntas reais {ir}% < {min_intent_acc}% ({real.get('intent_cases')} casos)")

    # 6) catraca: nunca regride mais que max_regression contra a versão em produção
    if previous is not None:
        ip = previous.get("intent_acc_pct")
        if ip is not None and ia is not None and ip - ia > max_regression:
            motivos.append(f"intenção caiu {ip - ia:.1f} pontos vs. a versão em produção ({ip}% -> {ia}%) > {max_regression}")

    # 7) quantização: Q4 não pode piorar mais que max_quant_drop vs. Q8, em entidades e em intenção
    if baseline is not None:
        sq, sb = entity_score(constrained), entity_score(baseline)
        if sq is not None and sb is not None and sb - sq > max_quant_drop:
            motivos.append(f"acerto de entidades caiu {sb - sq:.1f} pontos vs. Q8 ({sb}% -> {sq}%) > {max_quant_drop}")
        ib = baseline.get("intent_acc_pct")
        if ib is not None and ia is not None and ib - ia > max_quant_drop:
            motivos.append(f"acerto de intenção caiu {ib - ia:.1f} pontos vs. Q8 ({ib}% -> {ia}%) > {max_quant_drop}")
    return (not motivos), motivos


def aplicar_forca(meta: dict, force: bool, reason: str, agora: str) -> dict:
    """Regra de promoção de uma versão já avaliada. Aprovada: promove. Reprovada: só com `force` E um `reason` não vazio,
    que fica gravado em meta["forced"] (auditoria, junto com os motivos que o gate deu). Devolve o meta atualizado."""
    if meta.get("passed"):
        return meta
    if not force:
        raise RuntimeError(f"a versão {meta.get('version')} NÃO passou no gate; use --force --reason '<motivo>' apenas se souber o que está fazendo")
    if not str(reason or "").strip():
        raise RuntimeError("--force exige --reason '<motivo>' (fica gravado em meta.json)")
    meta.setdefault("forced", []).append({"reason": reason.strip(), "at": agora, "gate_reasons": list(meta.get("reasons", []))})
    return meta


def escolher_previous(atual: dict | None, eval_atual: dict | None, fmt: str, n_cases: int):
    """Avaliação da versão em produção para a catraca. Só vale se foi medida sobre o MESMO contrato (mesmo nº de casos) e formato.
    Devolve (previous | None, aviso | None)."""
    if not atual or not eval_atual:
        return None, "catraca ignorada: sem avaliação da versão em produção"
    try:
        prev = eval_atual["Q4_K_M"]["constrained"]
    except (KeyError, TypeError):
        return None, "catraca ignorada: avaliação da versão em produção em formato desconhecido"
    if atual.get("format") == fmt and prev.get("n_cases") == n_cases:
        return prev, None
    return None, f"catraca ignorada: a versão em produção ({atual.get('version')}) foi medida sobre outro contrato/formato"


# ---------------------------------------------------------------------------------------------------------
# Geradores
# ---------------------------------------------------------------------------------------------------------
def llama_generator(gguf_path: str, fmt: str, constrained: bool, n_threads: int = 4, llm=None):
    """Gerador sobre um GGUF local (requer llama-cpp-python). `constrained` = usa a gramática de produção."""
    from llama_cpp import Llama, LlamaGrammar  # import tardio: este arquivo roda sem llama-cpp para --endpoint

    if llm is None:
        llm = Llama(model_path=gguf_path, n_ctx=1024, n_threads=n_threads, n_batch=256, verbose=False)

    def gen(q: str) -> str:
        pergunta = core.validate_question(q)
        prompt = core.build_prompt(pergunta, fmt)
        kwargs = dict(
            prompt=prompt, temperature=0.0, repeat_penalty=1.0, stop=core.STOP_TOKENS,
            max_tokens=core.MAX_NEW_TOKENS[fmt] if constrained else 500,
        )
        if constrained:
            kwargs["grammar"] = LlamaGrammar.from_string(core.grammar_for(fmt), verbose=False)
        return llm.create_completion(**kwargs)["choices"][0]["text"]

    gen.llm = llm
    return gen


def http_generator(endpoint: str, key: str, secret: str, timeout: float = 60.0):
    """Gerador sobre o endpoint do Modal (devolve o JSON do campo `output` como texto)."""

    def gen(q: str) -> str:
        req = urllib.request.Request(
            endpoint, data=json.dumps({"q": q}).encode("utf-8"), method="POST",
            headers={"Content-Type": "application/json", "Modal-Key": key, "Modal-Secret": secret},
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                dados = json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"HTTP {e.code}") from None
        if not dados.get("ok"):
            raise RuntimeError("ok=false")
        out = dados.get("output")
        return out if isinstance(out, str) else json.dumps(out, ensure_ascii=False)

    return gen


# ---------------------------------------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------------------------------------
def print_summary(res: dict):
    print(f"\n== {res['label'] or 'avaliação'} (formato {res['format']}, {res['n_cases']} casos)")
    print(f"   JSON válido ........ {res['json_valid_pct']}%")
    print(f"   intenção ........... {res['intent_acc_pct']}%  ({res['intent_cases']} casos representáveis)")
    for k in ENTIDADES[res["format"]]:
        extra = f"   alucinação em casos null: {res[f'{k}_hallucination_pct']}%" if k != "nome" else ""
        print(f"   {k:<14} acerto .... {res[f'{k}_acc_pct']}%  ({res[f'{k}_cases']} casos){extra}")
    print(f"   latência média/máx . {res['latency_s_mean']} s / {res['latency_s_max']} s")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    fonte = ap.add_mutually_exclusive_group(required=True)
    fonte.add_argument("--gguf", help="caminho de um GGUF local (requer llama-cpp-python)")
    fonte.add_argument("--endpoint", help="URL do endpoint Modal (POST)")
    ap.add_argument("--key", default=os.environ.get("MODAL_KEY", ""), help="Modal-Key (token de proxy; padrão: variável MODAL_KEY, para não vazar em argv)")
    ap.add_argument("--secret", default=os.environ.get("MODAL_SECRET", ""), help="Modal-Secret (token de proxy; padrão: variável MODAL_SECRET)")
    ap.add_argument("--cases", default=str(DEFAULT_CASES))
    ap.add_argument("--format", choices=core.FORMATS, default="legacy")
    ap.add_argument("--unconstrained", action="store_true", help="também mede a validade NATIVA (sem gramática); só com --gguf")
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--min-json-valid", type=float, default=MIN_JSON_VALID_PCT)
    ap.add_argument("--min-intent-acc", type=float, default=MIN_INTENT_ACC_PCT)
    ap.add_argument("--min-entity-acc", type=float, default=MIN_ENTITY_ACC_PCT, help="mínimo POR entidade (não média)")
    ap.add_argument("--max-hallucination", type=float, default=MAX_HALLUCINATION_PCT)
    ap.add_argument("--real-cases", help="holdout de perguntas reais (contracts/nlu_real_cases.json); avaliado e exigido se tiver casos")
    ap.add_argument("--out", help="grava o resultado completo em JSON")
    a = ap.parse_args(argv)

    casos = load_cases(a.cases)
    unconstrained = None
    if a.gguf:
        gen_c = llama_generator(a.gguf, a.format, True, a.threads)
        constrained = evaluate(gen_c, casos, a.format, "COM gramática (produção)")
        if a.unconstrained:
            gen_u = llama_generator(a.gguf, a.format, False, a.threads, llm=gen_c.llm)
            unconstrained = evaluate(gen_u, casos, a.format, "SEM gramática (validade nativa)")
    else:
        constrained = evaluate(http_generator(a.endpoint, a.key, a.secret), casos, a.format, "endpoint (com gramática)")

    print_summary(constrained)
    if unconstrained:
        print_summary(unconstrained)
    real = None
    if a.real_cases and Path(a.real_cases).exists():
        casos_reais = load_cases(a.real_cases)
        if casos_reais:
            gen_r = gen_c if a.gguf else http_generator(a.endpoint, a.key, a.secret)
            real = evaluate(gen_r, casos_reais, a.format, "perguntas reais (holdout)")
            print_summary(real)
    ok, motivos = check_gates(constrained, unconstrained, real=real, min_json_valid=a.min_json_valid,
                              min_intent_acc=a.min_intent_acc, min_entity_acc=a.min_entity_acc, max_hallucination=a.max_hallucination)
    print("\nGATES:", "APROVADO" if ok else "REPROVADO")
    for m in motivos:
        print("  -", m)
    if a.out:
        Path(a.out).write_text(
            json.dumps({"passed": ok, "reasons": motivos, "constrained": constrained, "unconstrained": unconstrained, "real": real},
                       ensure_ascii=False, indent=1),
            encoding="utf-8",
        )
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
