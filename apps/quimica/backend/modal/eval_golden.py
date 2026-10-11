# -*- coding: utf-8 -*-
"""
Avaliação do NLU em nuvem contra os casos de referência (contracts/nlu_golden_cases.json) — gate de promoção do modelo de interpretação.
Reutilizável na conversão local (convert_local.py), na avaliação noturna e em CI.

Formato dos casos: {"cases": [{"q": "...", "intent": "MASSA_MOLAR", "composto": "H2SO4", "elemento": null, ...}]}. Uma chave de entidade com
valor significa "o modelo tem de devolver isto"; uma chave com null (ou lista vazia) significa "o modelo tem de OMITIR"; uma chave ausente
não é medida. Entidades: elemento, composto, propriedade, quantidades [{valor, unidade}], equacao, nivel, unidadeDestino.

O que mede (sobre o campo `q` de cada caso):
  - JSON válido: a saída tem a forma do contrato (nlu_core.has_valid_shape).
    * COM gramática (produção): deve ser 100 % — verifica a integração gramática/modelo.
    * SEM gramática (`--unconstrained`): validade NATIVA do modelo — é o gate de qualidade (>= 98 %), porque com a gramática um modelo
      corrompido pela quantização ainda produziria JSON "válido" (porém inútil).
  - Acerto de intenção e acerto POR entidade; taxa de alucinação nos casos em que o contrato exige ausência.
  - Holdout de perguntas reais (formulações que o treino nunca viu), catraca contra a versão em produção e queda Q4 x Q8.

Convenções do contrato golden que o avaliador resolve (o modelo não as conhece):
  - `propriedade` vem no id único do contrato (`pontoFusaoK`, `densidadeKgm3`...): compara-se via `nlu_core.propriedade_do_modelo`;
  - `composto` do golden é o CID do PubChem (o NLU local resolve pelo dicionário); o modelo devolve o NOME ou a FÓRMULA copiados da pergunta e
    o cliente resolve. Para medir, o avaliador traduz o CID pelos nomes/fórmulas de data/quimica/compostos (--compostos); sem o pacote de dados,
    o caso não é medido (conta em `composto_nao_medido`), mas a alucinação em casos `composto: null` continua medida;
  - `formula` (MASSA_MOLAR/NOMENCLATURA com fórmula digitada) é comparada com o `composto` do modelo;
  - as chaves grupo, periodo, bloco, categoria e estado (TABELA_PERIODICA) não fazem parte do contrato da nuvem e são ignoradas.

Mede o MODELO bruto. A normalização/ancoragem oficial é api/_lib/normalize.js (no proxy), então os números de alucinação aqui são um
limite superior do que o usuário final vê.

Uso local (GGUF):    python backend/modal/eval_golden.py --gguf ./model-Q4_K_M.gguf [--unconstrained]
Uso contra o endpoint já publicado (só biblioteca padrão):
                     python backend/modal/eval_golden.py --endpoint https://...modal.run   (MODAL_KEY e MODAL_SECRET no ambiente)
Código de saída: 0 = gates ok; 1 = reprovado.
"""
import argparse
import json
import math
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
MIN_INTENT_ACC_PCT = 85.0     # acerto de intenção no contrato golden
MIN_ENTITY_ACC_PCT = 90.0     # acerto POR entidade (elemento, composto, propriedade, quantidades, equacao, nivel, unidadeDestino)
MAX_HALLUCINATION_PCT = 5.0   # entidade preenchida onde o contrato exige ausência (chave null)
MAX_QUANT_DROP_PP = 3.0       # queda Q4 x Q8 (pontos percentuais), em entidades e em intenção
MAX_REGRESSION_PP = 1.0       # queda de intenção vs. a versão em produção (catraca: nunca regride mais que isso)
MIN_CASES_PER_METRIC = 3      # métrica com menos casos que isso não bloqueia (amostra pequena demais)

ENTIDADES = ("elemento", "composto", "propriedade", "quantidades", "equacao", "nivel", "unidadeDestino")


# ---------------------------------------------------------------------------------------------------------
# Casos
# ---------------------------------------------------------------------------------------------------------
def load_cases(path=DEFAULT_CASES):
    dados = json.loads(Path(path).read_text(encoding="utf-8"))
    casos = dados["cases"] if isinstance(dados, dict) else dados
    for c in casos:
        if not isinstance(c.get("q"), str):
            raise ValueError(f"caso sem q: {c}")
    return casos


def fold(s) -> str:
    return unicodedata.normalize("NFD", str(s)).encode("ascii", "ignore").decode().lower().strip()


# ---------------------------------------------------------------------------------------------------------
# Comparação das entidades
# ---------------------------------------------------------------------------------------------------------
_SUBS = str.maketrans("₀₁₂₃₄₅₆₇₈₉", "0123456789")


def _vazio(v) -> bool:
    return v is None or v == "" or v == []


def _formula_chave(s) -> str:
    return re.sub(r"[\s·]", "", str(s).translate(_SUBS)).lower()


def _same_composto(esperado, obtido) -> bool:
    """Nome ou fórmula equivalentes: igualdade dobrada, fórmula sem espaços/caixa/subscritos, ou todas as palavras do esperado no obtido."""
    if fold(esperado) == fold(obtido) or _formula_chave(esperado) == _formula_chave(obtido):
        return True
    e, o = set(re.findall(r"[a-z0-9]+", fold(esperado))), set(re.findall(r"[a-z0-9]+", fold(obtido)))
    return bool(e) and len(e) >= 2 and e <= o


def _equacao_chave(s) -> str:
    t = str(s).translate(_SUBS)
    t = re.sub(r"<[-=]{1,3}>|⇌|↔|⇄", "<->", t)
    t = re.sub(r"(?:-{1,3}|={1,3})>|→|⟶|➔|⇒|=", "->", t)
    return re.sub(r"\s+", "", t)


def _same_quantidades(esperado, obtido) -> bool:
    if not isinstance(obtido, list) or len(obtido) != len(esperado):
        return False
    restantes = list(obtido)
    for e in esperado:
        for i, o in enumerate(restantes):
            try:
                if o.get("unidade") == e.get("unidade") and math.isclose(float(o.get("valor")), float(e.get("valor")), rel_tol=1e-9, abs_tol=1e-12):
                    del restantes[i]
                    break
            except (TypeError, ValueError, AttributeError):
                continue
        else:
            return False
    return True


def carregar_cids(pasta) -> dict:
    """{cid: [nomes e fórmulas]} de data/quimica/compostos/*.json (docs/DATA_CONTRACT.md §3). Vazio se a pasta não existir."""
    saida = {}
    pasta = Path(pasta)
    if not pasta.exists():
        return saida
    for arq in sorted(pasta.glob("*.json")):
        if arq.name == "index.json":
            continue
        try:
            dados = json.loads(arq.read_text(encoding="utf-8"))
        except ValueError:
            continue
        for c in (dados.get("compostos", []) if isinstance(dados, dict) else dados):
            if not isinstance(c, dict) or not isinstance(c.get("cid"), int):
                continue
            nomes = [c.get(k) for k in ("nome", "nomePopular", "nomeIupac", "formula", "formulaHill")] + list(c.get("sinonimos") or [])
            saida[c["cid"]] = [n for n in nomes if isinstance(n, str) and n.strip()]
    return saida


def _esperado_cid(valor) -> bool:
    return (isinstance(valor, int) and not isinstance(valor, bool)) or (isinstance(valor, str) and valor.strip().isdigit())


def _same_cid(cid, obtido, lookup):
    """True/False, ou None quando não dá para medir (o CID não está no pacote de dados e o modelo não devolveu um CID)."""
    if (isinstance(obtido, (int, float)) and not isinstance(obtido, bool)) or (isinstance(obtido, str) and obtido.strip().isdigit()):
        return int(obtido) == int(cid)
    nomes = (lookup or {}).get(int(cid))
    if not nomes:
        return None
    return any(_same_composto(n, obtido) for n in nomes)


def _same(chave: str, esperado, obtido, cids=None):
    """True/False, ou None quando o caso não é mensurável (CID sem tradução)."""
    if _vazio(obtido):
        return False
    if chave == "composto":
        if _esperado_cid(esperado):
            return _same_cid(esperado, obtido, cids)
        return _same_composto(esperado, obtido)
    if chave == "propriedade":
        a, b = core.propriedade_do_modelo(esperado), core.propriedade_do_modelo(obtido)
        return a == b if a and b else fold(esperado) == fold(obtido)
    if chave == "equacao":
        return _equacao_chave(esperado) == _equacao_chave(obtido)
    if chave == "quantidades":
        return _same_quantidades(esperado, obtido)
    return fold(esperado) == fold(obtido)


# ---------------------------------------------------------------------------------------------------------
# Avaliação
# ---------------------------------------------------------------------------------------------------------
def evaluate(generate, cases, label: str = "", cids=None) -> dict:
    """`generate(q) -> texto bruto do modelo`. `cids` = {cid: nomes} (carregar_cids) para medir `composto` dado como CID. Devolve métricas + detalhe."""
    n = len(cases)
    validos = intent_ok = intent_n = 0
    por_caso = []
    ent = {k: {"ok": 0, "n": 0, "alucina": 0, "n_nulos": 0, "nao_medido": 0} for k in ENTIDADES}
    lat = []

    for caso in cases:
        t0 = time.time()
        try:
            texto, erro = generate(caso["q"]), None
        except Exception as e:  # falha de geração conta como inválido
            texto, erro = "", type(e).__name__
        lat.append(time.time() - t0)
        obj = core.parse_model_output(texto)
        valido = core.has_valid_shape(obj)
        validos += int(valido)
        item = {"q": caso["q"], "json_valido": valido, "saida": (texto or "")[:600], **({"erro": erro} if erro else {})}
        if valido:
            if "intent" in caso:
                intent_n += 1
                item["intent_ok"] = obj["intent"] == caso["intent"]
                intent_ok += int(item["intent_ok"])
            esperado = dict(caso)
            if "composto" not in esperado and isinstance(esperado.get("formula"), str):
                esperado["composto"] = esperado["formula"]  # fórmula digitada: o modelo a devolve em `composto`
            for k in ENTIDADES:
                if k not in esperado:
                    continue
                if _vazio(esperado[k]):  # "chave com null exige ausência"
                    ent[k]["n_nulos"] += 1
                    ent[k]["alucina"] += int(not _vazio(obj.get(k)))
                    continue
                r = _same(k, esperado[k], obj.get(k), cids)
                if r is None:
                    ent[k]["nao_medido"] += 1
                    continue
                ent[k]["n"] += 1
                ent[k]["ok"] += int(r)
        elif "intent" in caso:
            intent_n += 1  # saída inválida conta como erro de intenção
        por_caso.append(item)

    def pct(a, b):
        return round(100.0 * a / b, 1) if b else None

    return {
        "label": label,
        "format": core.FORMAT_VERSION,
        "n_cases": n,
        "json_valid_pct": pct(validos, n),
        "intent_acc_pct": pct(intent_ok, intent_n),
        "intent_cases": intent_n,
        **{f"{k}_acc_pct": pct(v["ok"], v["n"]) for k, v in ent.items()},
        **{f"{k}_cases": v["n"] for k, v in ent.items()},
        **{f"{k}_null_cases": v["n_nulos"] for k, v in ent.items()},
        **{f"{k}_nao_medido": v["nao_medido"] for k, v in ent.items()},
        **{f"{k}_hallucination_pct": pct(v["alucina"], v["n_nulos"]) for k, v in ent.items()},
        "latency_s_mean": round(sum(lat) / len(lat), 2) if lat else None,
        "latency_s_max": round(max(lat), 2) if lat else None,
        "cases": por_caso,
    }


def entity_score(res: dict):
    """Média simples do acerto das entidades que têm casos. None se não houver nenhuma."""
    vals = [res.get(f"{k}_acc_pct") for k in ENTIDADES]
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
    for k in ENTIDADES:
        n = constrained.get(f"{k}_cases") or 0
        acc = constrained.get(f"{k}_acc_pct")
        if n >= min_cases and acc is not None and acc < min_entity_acc:
            motivos.append(f"acerto de {k} {acc}% < {min_entity_acc}% ({n} casos)")

    # 4) alucinação: entidade preenchida onde o contrato exige ausência
    for k in ENTIDADES:
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
    """Regra de promoção de uma versão já avaliada. Aprovada: promove. Reprovada: só com `force` E um `reason` não vazio, que fica
    gravado em meta["forced"] (auditoria, junto com os motivos que o gate deu). Devolve o meta atualizado."""
    if meta.get("passed"):
        return meta
    if not force:
        raise RuntimeError(f"a versão {meta.get('version')} NÃO passou no gate; use --force --reason '<motivo>' apenas se souber o que está fazendo")
    if not str(reason or "").strip():
        raise RuntimeError("--force exige --reason '<motivo>' (fica gravado em meta.json)")
    meta.setdefault("forced", []).append({"reason": reason.strip(), "at": agora, "gate_reasons": list(meta.get("reasons", []))})
    return meta


def escolher_previous(atual: dict | None, eval_atual: dict | None, n_cases: int):
    """Avaliação da versão em produção para a catraca. Só vale se foi medida sobre o MESMO contrato (mesmo nº de casos) e formato.
    Devolve (previous | None, aviso | None)."""
    if not atual or not eval_atual:
        return None, "catraca ignorada: sem avaliação da versão em produção"
    try:
        prev = eval_atual["Q4_K_M"]["constrained"]
    except (KeyError, TypeError):
        return None, "catraca ignorada: avaliação da versão em produção em formato desconhecido"
    if atual.get("format", core.FORMAT_VERSION) == core.FORMAT_VERSION and prev.get("n_cases") == n_cases:
        return prev, None
    return None, f"catraca ignorada: a versão em produção ({atual.get('version')}) foi medida sobre outro contrato/formato"


# ---------------------------------------------------------------------------------------------------------
# Geradores
# ---------------------------------------------------------------------------------------------------------
def llama_generator(gguf_path: str, constrained: bool, n_threads: int = 4, llm=None):
    """Gerador sobre um GGUF local (requer llama-cpp-python). `constrained` = usa a gramática de produção."""
    from llama_cpp import Llama, LlamaGrammar  # import tardio: este arquivo roda sem llama-cpp para --endpoint

    if llm is None:
        llm = Llama(model_path=gguf_path, n_ctx=1024, n_threads=n_threads, n_batch=256, verbose=False)

    def gen(q: str) -> str:
        pergunta = core.validate_question(q)
        kwargs = dict(
            prompt=core.build_prompt(pergunta), temperature=0.0, repeat_penalty=1.0, stop=core.STOP_TOKENS,
            max_tokens=core.MAX_NEW_TOKENS if constrained else 500,
        )
        if constrained:
            kwargs["grammar"] = LlamaGrammar.from_string(core.grammar(), verbose=False)
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
    print(f"   intenção ........... {res['intent_acc_pct']}%  ({res['intent_cases']} casos)")
    for k in ENTIDADES:
        nm = f"  [{res[f'{k}_nao_medido']} não medidos]" if res.get(f"{k}_nao_medido") else ""
        print(f"   {k:<15} acerto . {res[f'{k}_acc_pct']}%  ({res[f'{k}_cases']} casos){nm}   alucinação em casos null: {res[f'{k}_hallucination_pct']}%")
    print(f"   latência média/máx . {res['latency_s_mean']} s / {res['latency_s_max']} s")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    fonte = ap.add_mutually_exclusive_group(required=True)
    fonte.add_argument("--gguf", help="caminho de um GGUF local (requer llama-cpp-python)")
    fonte.add_argument("--endpoint", help="URL do endpoint Modal (POST)")
    ap.add_argument("--key", default=os.environ.get("MODAL_KEY", ""), help="Modal-Key (padrão: variável MODAL_KEY, para não vazar em argv)")
    ap.add_argument("--secret", default=os.environ.get("MODAL_SECRET", ""), help="Modal-Secret (padrão: variável MODAL_SECRET)")
    ap.add_argument("--cases", default=str(DEFAULT_CASES))
    ap.add_argument("--compostos", default=str(HERE.parent.parent / "data" / "quimica" / "compostos"), help="pasta com os compostos do pacote (traduz CID em nomes)")
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
    cids = carregar_cids(a.compostos)
    if not cids and any(_esperado_cid(c.get("composto")) for c in casos):
        print(f"AVISO: sem {a.compostos}: o acerto de `composto` dado como CID não será medido (rode o pipeline de dados antes do gate)")
    unconstrained = None
    if a.gguf:
        gen_c = llama_generator(a.gguf, True, a.threads)
        constrained = evaluate(gen_c, casos, "COM gramática (produção)", cids)
        if a.unconstrained:
            unconstrained = evaluate(llama_generator(a.gguf, False, a.threads, llm=gen_c.llm), casos, "SEM gramática (validade nativa)", cids)
    else:
        gen_c = http_generator(a.endpoint, a.key, a.secret)
        constrained = evaluate(gen_c, casos, "endpoint (com gramática)", cids)

    print_summary(constrained)
    if unconstrained:
        print_summary(unconstrained)
    real = None
    if a.real_cases and Path(a.real_cases).exists():
        casos_reais = load_cases(a.real_cases)
        if casos_reais:
            real = evaluate(gen_c, casos_reais, "perguntas reais (holdout)", cids)
            print_summary(real)
    ok, motivos = check_gates(constrained, unconstrained, real=real, min_json_valid=a.min_json_valid, min_intent_acc=a.min_intent_acc,
                              min_entity_acc=a.min_entity_acc, max_hallucination=a.max_hallucination)
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
