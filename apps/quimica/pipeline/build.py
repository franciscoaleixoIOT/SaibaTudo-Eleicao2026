# -*- coding: utf-8 -*-
"""
Orquestra a coleta, valida e publica o pacote de dados `data/quimica/` (DATA_CONTRACT.md).

    python pipeline/build.py --assinar-com secrets/data_signing_key.pem        # build completo (leva ~30 min na 1ª vez)
    python pipeline/build.py --rapido --assinar-com secrets/data_signing_key.pem   # 300 compostos, textos reduzidos
    python pipeline/build.py --rapido --offline --cache pipeline/tests/fixtures/cache --out /tmp/pacote   # sem rede

Saída atômica: o pacote é montado em `<out>.novo`, validado e só então troca `<out>` (se a validação falhar, o pacote anterior
continua intacto). `stats.json` fica ao lado do manifesto mas fora do manifesto (muda a cada execução).
"""
import argparse
import json
import os
import shutil
import sys
import time
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import clp  # noqa: E402
import coleta_chebi  # noqa: E402
import coleta_compostos  # noqa: E402
import coleta_constantes  # noqa: E402
import coleta_elementos  # noqa: E402
import coleta_textos  # noqa: E402
import coleta_wikimedia  # noqa: E402
import fontes as F  # noqa: E402
import quimica_util as Q  # noqa: E402
import regras as R  # noqa: E402
import selecao_compostos  # noqa: E402
from common import dump_json, sha256_file  # noqa: E402
from http_cache import HttpCache, PASTA_CACHE  # noqa: E402
from pubchem import PubChem  # noqa: E402
from robots import Robots  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
OUT_PADRAO = RAIZ / "data" / "quimica"
TOPICOS_PADRAO = RAIZ / "dataset" / "topicos.json"
SCHEMA_VERSION = 1
BASE_URL = "https://saibatudo.net/quimica/data/"
LICENCAS_TEXTO_PERMITIDAS = {"CC BY-SA 4.0", "CC BY 4.0", "domínio público"}
PICTOGRAMAS_VALIDOS = {f"GHS0{i}" for i in range(1, 10)}

# Decisões de fonte/licença que o pipeline aplica (docs/FONTES_E_LICENCAS.md §5); vão para stats.json
DECISOES = [
    "OpenStax Chemistry 2e fora do pacote: CC BY-NC-SA 4.0 e cláusula contra IA generativa (nenhum clone, nenhum texto).",
    "ICSC fora dos dados (sem licença de reuso; versão PT © ACT): cada composto com CAS leva só icscBuscaUrl (link de busca da OIT).",
    "PubChem: só campos calculados pelo NLM e identificadores; sinônimos de depositantes não são lidos.",
    "GHS: só a classificação harmonizada da UE (Regulamento 1272/2008, Anexo VI); notificada (ECHA C&L) e NITE-CMC ficam fora.",
    "Frases H/EUH em português: Anexo III do CLP consolidado (EUR-Lex/Cellar); combinadas ausentes viram junção dos textos oficiais.",
    "CAS: só do Wikidata (identificador, CC0), validado pelo dígito verificador; elementos não levam CAS (CAS do átomo != substância).",
    "Textos: Wikipédia pt e Wikilivros pt (CC BY-SA 4.0), ChEBI (CC BY 4.0), Faraday (domínio público). Gold Book: bloqueado por Cloudflare.",
    "APIs oficiais (PUG REST, WDQS, /w/api.php) são acessadas apesar do Disallow genérico do robots.txt, conforme robots.EXCECOES.",
]


# ====================================================================================================== escrita
def escrever_json(out: Path, rel: str, obj, indent=None):
    dump_json(out / rel, obj, indent=indent)
    return rel


def escrever_textos(out: Path, pasta: str, registros):
    """Grava cada trecho em textos/<pasta>/<_arquivo>. Devolve os caminhos relativos."""
    rels = []
    for r in registros:
        reg = {k: v for k, v in r.items() if not k.startswith("_")}
        rels.append(escrever_json(out, f"textos/{pasta}/{r['_arquivo']}", reg))
    return rels


def registros_chebi(compostos, hoje):
    regs = []
    for c in compostos:
        d = c.get("definicaoChebi")
        if not d:
            continue
        num = d["chebiId"].split(":")[1]
        regs.append({
            "_arquivo": f"{num}.json", "id": f"chebi-{num}", "fonte": "ChEBI", "licenca": d["licenca"],
            "url": coleta_chebi.URL_PAGINA.format(id=num), "capitulo": "", "secao": "Definição", "titulo": c["nome"],
            "textoOriginal": d["texto"], "textoPt": None, "traducao": "pendente", "idioma": "en",
            "palavrasChave": [c["nome"].lower(), c["formula"]], "entidades": {"elementos": [], "compostos": [c["cid"]]},
            "fontes": [Q.fonte(f"ChEBI {d['chebiId']}", coleta_chebi.URL_PAGINA.format(id=num), d["licenca"], hoje)],
        })
    return regs


def montar_ghs_frases(frases_h, compostos, hoje, info_clp):
    """Dicionário H/EUH em português + pictogramas. Combinadas ausentes no CLP viram junção dos textos oficiais dos componentes."""
    usados = sorted({h for c in compostos for h in c.get("ghs", {}).get("frasesH", [])})
    dic, sem_texto = {}, []
    for cod in usados:
        if cod in frases_h:
            dic[cod] = {"texto": frases_h[cod]}
        elif "+" in cod and all(p in frases_h for p in cod.split("+")):
            dic[cod] = {"texto": "; ".join(frases_h[p].rstrip(".") for p in cod.split("+")),
                        "derivado": "junção dos textos oficiais dos componentes (código combinado ausente no Anexo III)",
                        "componentes": cod.split("+")}
        else:
            sem_texto.append(cod)
    return {"versao": 1,
            "descricao": "Frases de perigo (H/EUH) em português do Regulamento (CE) n.º 1272/2008 (CLP), Anexo III, "
                         "texto consolidado (EUR-Lex), para os códigos usados nas classificações harmonizadas do pacote.",
            "frasesH": dic, "usadosSemTexto": sem_texto, "todasAsFrases": frases_h,
            "pictogramas": clp.PICTOGRAMAS, "palavrasSinal": list(clp.PALAVRAS_SINAL),
            "fontes": [Q.fonte(clp.NOME_FONTE, info_clp.get("url", clp.URL_EURLEX.format(celex="32008R1272")), clp.LICENCA, hoje)]}, sem_texto


# ====================================================================================================== manifesto
def montar_manifest(out: Path, rels, fontes_usadas, contagens, hoje, agora):
    arquivos = {}
    for rel in sorted(set(rels)):
        p = out / rel
        arquivos[rel] = {"bytes": p.stat().st_size, "sha256": sha256_file(p)}
    import hashlib
    h = hashlib.sha256("".join(f"{k}:{v['sha256']}" for k, v in arquivos.items()).encode()).hexdigest()[:12]
    manifest = {
        "version": f"{agora.strftime('%Y%m%dT%H%M%SZ')}-{h}",
        "generatedAt": agora.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "schemaVersion": SCHEMA_VERSION,
        "files": arquivos,
        "sources": [{"id": f["id"], "nome": f["nome"], "url": f["url"], "licenca": f["licenca"], "uso": f["uso"],
                     "acessadoEm": f["acessadoEm"]} for f in fontes_usadas],
        "licencas": F.licencas(fontes_usadas),
        "contagens": contagens,
        "atribuicao": "Dados: PubChem (NCBI/NLM) e CODATA 2022 (NIST), domínio público; Wikidata, CC0; textos da Wikipédia e do "
                      "Wikilivros em português, CC BY-SA 4.0; ChEBI, CC BY 4.0; Faraday (Project Gutenberg #14474), domínio público; "
                      "frases H do Regulamento CLP (EUR-Lex). Aplicativo independente.",
        "cliente": {"pollIntervalMinutes": 10080, "baseUrl": BASE_URL, "nlu": {"endpoint": "https://saibatudo.net/api/quimica/nlu"},
                    "ask": {"enabled": False}, "melhoria": {"enabled": False}},
    }
    dump_json(out / "manifest.json", manifest, indent=2)
    return manifest


# ====================================================================================================== validação
def validar(out: Path, previo=None, minimos=None):
    """Gates de qualidade: devolve a lista de erros (vazia = pacote válido)."""
    mn = {"elementos": 118, "compostos": 250, "constantes": 40, "textos": 100}
    mn.update(minimos or {})
    erros = []
    try:
        m = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        return [f"manifest.json ilegível: {exc}"]
    for rel, info in m["files"].items():
        p = out / rel
        if not p.exists():
            erros.append(f"arquivo ausente: {rel}")
        elif sha256_file(p) != info["sha256"] or p.stat().st_size != info["bytes"]:
            erros.append(f"checksum/tamanho divergente: {rel}")
    if (out / "seguranca").exists():
        erros.append("seguranca/ não pode existir no pacote (ICSC fora dos dados)")

    def ler(rel):
        return json.loads((out / rel).read_text(encoding="utf-8"))

    # elementos
    try:
        els = ler("elementos.json")
        zs = [e["z"] for e in els]
        if sorted(zs) != list(range(1, 119)) or len(set(zs)) != len(zs):
            erros.append(f"elementos: Z de 1 a 118 sem repetição falhou ({len(zs)} registros)")
        for e in els:
            for k in ("z", "simbolo", "nome", "nomeEn", "periodo", "bloco", "categoria", "fontes"):
                if not e.get(k):
                    erros.append(f"elemento {e.get('z')}: campo obrigatório ausente {k}")
            for k, ref in (("massaAtomica", None), ("pontoFusaoK", None), ("pontoEbulicaoK", None), ("densidadeKgm3", None),
                           ("energiaIonizacaoKJmol", None), ("raioAtomicoPm", None)):
                if k in e and not (isinstance(e[k], (int, float)) and e[k] > 0):
                    erros.append(f"elemento {e['z']}: {k} inválido ({e[k]!r})")
            if "estadoPadrao" in e and e["estadoPadrao"] not in ("solido", "liquido", "gas"):
                erros.append(f"elemento {e['z']}: estadoPadrao inválido")
    except (OSError, KeyError, ValueError) as exc:
        erros.append(f"elementos.json inválido: {exc}")
        els = []
    if len(els) < mn["elementos"]:
        erros.append(f"elementos insuficientes: {len(els)}")

    # compostos
    cids, total = set(), 0
    for rel in sorted(m["files"]):
        if rel.startswith("compostos/lote-"):
            for c in ler(rel):
                total += 1
                if c.get("cid") in cids:
                    erros.append(f"CID duplicado {c.get('cid')}")
                cids.add(c.get("cid"))
                for k in ("cid", "nome", "formula", "formulaHill", "massaMolar", "smiles", "fontes"):
                    if not c.get(k):
                        erros.append(f"composto {c.get('cid')}: campo obrigatório ausente {k}")
                if c.get("cas") and not Q.cas_valido(c["cas"]):
                    erros.append(f"composto {c['cid']}: CAS inválido {c['cas']}")
                if ("icscBuscaUrl" in c) != ("cas" in c):
                    erros.append(f"composto {c['cid']}: icscBuscaUrl deve existir exatamente quando há CAS")
                g = c.get("ghs")
                if g and (not set(g.get("pictogramas", [])) <= PICTOGRAMAS_VALIDOS or not g.get("fonte")):
                    erros.append(f"composto {c['cid']}: ghs inválido")
                if "ghs" in c and "1272/2008" not in c["ghs"].get("fonte", ""):
                    erros.append(f"composto {c['cid']}: ghs só pode vir da classificação harmonizada (CLP)")
    if total < mn["compostos"]:
        erros.append(f"compostos insuficientes: {total}")
    if previo and previo.get("contagens", {}).get("compostos") and total < 0.8 * previo["contagens"]["compostos"]:
        erros.append(f"queda anormal de compostos: {previo['contagens']['compostos']} -> {total}")
    try:
        idx = ler("compostos/index.json")
        if set(map(int, idx["porCid"])) != cids:
            erros.append("compostos/index.json diverge dos lotes")
    except (OSError, KeyError, ValueError) as exc:
        erros.append(f"compostos/index.json inválido: {exc}")

    # constantes
    try:
        cs = ler("constantes.json")["constantes"]
        if len(cs) < mn["constantes"]:
            erros.append(f"constantes insuficientes: {len(cs)}")
        for c in cs:
            if not isinstance(c.get("valor"), (int, float)) or not c.get("fontes"):
                erros.append(f"constante {c.get('id')} inválida")
    except (OSError, KeyError, ValueError) as exc:
        erros.append(f"constantes.json inválido: {exc}")

    # textos: licenças permitidas, ids únicos, campos
    ids, n_textos = set(), 0
    for rel in m["files"]:
        if not rel.startswith("textos/"):
            continue
        t = ler(rel)
        n_textos += 1
        if t.get("id") in ids:
            erros.append(f"texto com id duplicado {t.get('id')}")
        ids.add(t.get("id"))
        for k in ("id", "fonte", "licenca", "url", "textoOriginal", "traducao", "fontes"):
            if not t.get(k):
                erros.append(f"texto {t.get('id')}: campo obrigatório ausente {k}")
        if t.get("licenca") not in LICENCAS_TEXTO_PERMITIDAS:
            erros.append(f"texto {t.get('id')}: licença não permitida {t.get('licenca')!r}")
        if "openstax" in (t.get("fonte", "") + t.get("id", "")).lower():
            erros.append(f"texto {t.get('id')}: OpenStax não pode entrar")
        if not 30 <= len(t.get("textoOriginal", "")) <= 1600 and not t["id"].startswith("chebi-"):
            erros.append(f"texto {t.get('id')}: tamanho fora do esperado ({len(t.get('textoOriginal', ''))})")
    if n_textos < mn["textos"]:
        erros.append(f"textos insuficientes: {n_textos}")

    for rel in ("regras.json", "fontes.json", "ghs_frases.json"):
        if rel not in m["files"]:
            erros.append(f"{rel} ausente do manifesto")
    return erros


def trocar_atomicamente(novo: Path, destino: Path):
    """Troca `destino` por `novo` sem deixar `destino` quebrado (o antigo vira `.antigo` até a troca concluir)."""
    antigo = destino.with_name(destino.name + ".antigo")
    if antigo.exists():
        shutil.rmtree(antigo)
    tinha = destino.exists()
    if tinha:
        os.replace(destino, antigo)
    try:
        os.replace(novo, destino)
    except OSError:
        if tinha:
            os.replace(antigo, destino)
        raise
    if antigo.exists():
        shutil.rmtree(antigo, ignore_errors=True)


# ====================================================================================================== orquestração
def tentar(stats, nome, fn, log, obrigatoria=False, vazio=None):
    """Executa uma etapa; se falhar e não for obrigatória, registra em stats e devolve `vazio`."""
    t0 = time.time()
    try:
        r = fn()
        stats["familias"].setdefault(nome, {})["status"] = "ok"
        stats["familias"][nome]["segundos"] = round(time.time() - t0, 1)
        return r
    except Exception as exc:  # noqa: BLE001
        if obrigatoria:
            raise
        log(f"  !! {nome} falhou: {exc}")
        stats["familias"][nome] = {"status": "falhou", "erro": f"{type(exc).__name__}: {exc}"[:300],
                                   "segundos": round(time.time() - t0, 1)}
        return vazio


def construir(opts, log=print):
    t0 = time.time()
    agora = Q.agora_utc()
    hoje = opts.hoje or Q.hoje_iso()
    http = HttpCache(pasta=opts.cache, offline=opts.offline, log=log)
    stats = {"geradoEm": agora.strftime("%Y-%m-%dT%H:%M:%SZ"), "modo": "rapido" if opts.rapido else "completo",
             "familias": {}, "contagens": {}, "decisoes": list(DECISOES), "avisos": []}
    out = Path(opts.out)
    novo = out.with_name(out.name + ".novo")
    if novo.exists():
        shutil.rmtree(novo)
    novo.mkdir(parents=True)
    rels, fontes_usadas = [], {"pubchem", "codata", "wikidata", "icsc-oit"}

    try:
        log("== elementos")
        elementos, st = tentar(stats, "elementos", lambda: coleta_elementos.coletar(http, hoje), log, obrigatoria=True)
        stats["familias"]["elementos"].update(st)
        rels.append(escrever_json(novo, "elementos.json", elementos))

        log("== constantes")
        constantes, st = tentar(stats, "constantes", lambda: coleta_constantes.coletar(http, hoje), log, obrigatoria=True)
        stats["familias"]["constantes"].update(st)
        rels.append(escrever_json(novo, "constantes.json", {"constantes": constantes}))

        log("== frases H (CLP, EUR-Lex)")
        r = tentar(stats, "clp", lambda: clp.coletar(http, hoje), log, vazio=({}, {}))
        frases_h, st_clp = r
        stats["familias"]["clp"].update(st_clp)
        if frases_h:
            fontes_usadas.add("clp-eurlex")

        log("== compostos")
        pubchem = PubChem(http)
        rapido_n = opts.limite_compostos if opts.limite_compostos is not None else (300 if opts.rapido else None)
        selecao, st_sel = tentar(stats, "selecaoCompostos",
                                 lambda: selecao_compostos.selecionar(http, pubchem, alvo=opts.alvo, rapido_n=rapido_n, log=log),
                                 log, obrigatoria=True)
        stats["familias"]["selecaoCompostos"].update(st_sel)
        compostos, meta, st_cmp = tentar(stats, "compostos",
                                         lambda: coleta_compostos.coletar(http, pubchem, selecao, hoje, frases_h, log=log),
                                         log, obrigatoria=True)
        stats["familias"]["compostos"].update(st_cmp)
        if any("definicaoChebi" in c for c in compostos):
            fontes_usadas.add("chebi")

        ghs_json, sem_texto = montar_ghs_frases(frases_h, compostos, hoje, st_clp)
        stats["familias"]["clp"]["codigosSemTextoPt"] = sem_texto
        rels.append(escrever_json(novo, "ghs_frases.json", ghs_json))

        lotes, indice = coleta_compostos.para_lotes(compostos)
        for nome, parte in lotes:
            rels.append(escrever_json(novo, f"compostos/{nome}.json", parte))
        indice["lotes"] = [n for n, _ in lotes]
        rels.append(escrever_json(novo, "compostos/index.json", indice))

        log("== textos")
        nomes_en = {e["nomeEn"].lower(): e["simbolo"] for e in elementos}
        n_textos = {}
        lim = None
        if opts.rapido or opts.limite_textos is not None:
            n = opts.limite_textos if opts.limite_textos is not None else 30
            lim = {"elementos": n, "compostos": max(1, n // 2), "conceitos": n}
        if not opts.sem_wikimedia:
            regs, st = tentar(stats, "wikipedia", lambda: coleta_wikimedia.coletar_wikipedia(
                http, elementos, compostos, meta, opts.topicos, hoje, limites=lim, log=log), log, vazio=([], {}))
            stats["familias"]["wikipedia"].update(st)
            if regs:
                rels += escrever_textos(novo, "wikipedia-pt", regs)
                fontes_usadas.add("wikipedia-pt")
            n_textos["wikipedia-pt"] = len(regs)
            regs, st = tentar(stats, "wikilivros", lambda: coleta_wikimedia.coletar_wikilivros(
                http, hoje, limite_paginas=(lim["conceitos"] // 2 if lim else None), log=log), log, vazio=([], {}))
            stats["familias"]["wikilivros"].update(st)
            if regs:
                rels += escrever_textos(novo, "wikibooks-pt", regs)
                fontes_usadas.add("wikibooks-pt")
            n_textos["wikibooks-pt"] = len(regs)
        regs = registros_chebi(compostos, hoje)
        if regs:
            rels += escrever_textos(novo, "chebi", regs)
        n_textos["chebi"] = len(regs)

        def faraday():
            html = coleta_textos.ler_gutenberg(http, opts.gutenberg_zip, log)
            return coleta_textos.coletar_gutenberg(html, hoje, nomes_en)
        regs, st = tentar(stats, "faraday", faraday, log, vazio=([], {}))
        stats["familias"]["faraday"].update(st)
        if regs:
            rels += escrever_textos(novo, coleta_textos.FONTE_GUTENBERG_DIR, regs)
            fontes_usadas.add("gutenberg-14474")
        n_textos["gutenberg-14474"] = len(regs)

        def goldbook():
            rb = Robots(http)
            if not rb.permitido(coleta_textos.URL_GOLDBOOK):
                return {"status": "pulado", "motivo": "robots.txt não permite"}
            try:
                r = http.get(coleta_textos.URL_GOLDBOOK, ttl_s=24 * 3600)
            except Exception as exc:  # noqa: BLE001
                return {"status": "bloqueado", "motivo": str(exc)[:200]}
            if r.status != 200 or b"Just a moment" in r.corpo[:4000]:
                return {"status": "bloqueado", "motivo": f"HTTP {r.status} (desafio anti-robô do Cloudflare)"}
            return {"status": "acessivel-nao-implementado",
                    "motivo": "o site respondeu; a coleta por verbete não foi implementada (reavaliar com o download oficial JSON/XML)"}
        r = tentar(stats, "goldBook", goldbook, log, vazio={})
        stats["familias"]["goldBook"].update(r)
        n_textos["gold-book"] = 0
        stats["contagens"]["textosPorFonte"] = n_textos

        log("== regras, fontes e manifesto")
        rels.append(escrever_json(novo, "regras.json", R.montar(hoje)))
        usadas = F.gerar(fontes_usadas, hoje)
        rels.append(escrever_json(novo, "fontes.json", {"fontes": usadas}))
        contagens = {"elementos": len(elementos), "compostos": len(compostos), "constantes": len(constantes),
                     "textos": sum(n_textos.values()), "textosPorFonte": n_textos,
                     "compostosComGhsHarmonizado": sum(1 for c in compostos if "ghs" in c),
                     "compostosComCas": sum(1 for c in compostos if "cas" in c)}
        stats["contagens"].update(contagens)
        previo = None
        if (out / "manifest.json").exists():
            try:
                previo = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
            except ValueError:
                previo = None
        manifest = montar_manifest(novo, rels, usadas, contagens, hoje, agora)
        if opts.assinar_com:
            from sign import assinar
            assinar(novo / "manifest.json", Path(opts.assinar_com))
            log("  manifesto assinado (manifest.sig)")

        stats["fontes"] = [f["id"] for f in usadas]
        stats["http"] = http.stats
        stats["duracaoSegundos"] = round(time.time() - t0, 1)
        stats["versao"] = manifest["version"]
        minimos = {"compostos": 10, "textos": 10, "constantes": 40} if (opts.rapido or opts.limite_compostos) else None
        if opts.sem_wikimedia:
            minimos = dict(minimos or {}, textos=1)
        erros = validar(novo, previo, minimos)
        stats["erros"] = erros
        dump_json(novo / "stats.json", stats, indent=2)
        try:  # cópia fora do pacote, útil para diagnosticar uma validação que falhou
            dump_json(Path(opts.cache) / "ultimo_stats.json", stats, indent=2)
        except OSError:
            pass
        if erros:
            return None, erros, stats
        trocar_atomicamente(novo, out)
        return manifest, [], stats
    finally:
        if novo.exists():
            shutil.rmtree(novo, ignore_errors=True)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Constrói, valida e assina o pacote de dados do SaibaTudo Química.")
    ap.add_argument("--out", default=str(OUT_PADRAO))
    ap.add_argument("--cache", default=str(PASTA_CACHE))
    ap.add_argument("--assinar-com", help="chave privada ECDSA (PEM) para assinar o manifesto")
    ap.add_argument("--rapido", action="store_true", help="300 compostos (só lista fixa) e textos reduzidos; para testes e CI")
    ap.add_argument("--offline", action="store_true", help="nunca usa a rede; falha se faltar entrada no cache")
    ap.add_argument("--alvo", type=int, default=selecao_compostos.ALVO_PADRAO, help="tamanho do núcleo de compostos")
    ap.add_argument("--limite-compostos", type=int, help="limita o núcleo a N compostos da lista fixa (testes)")
    ap.add_argument("--limite-textos", type=int, help="limita os textos da Wikimedia (testes)")
    ap.add_argument("--sem-wikimedia", action="store_true", help="não coleta Wikipédia/Wikilivros")
    ap.add_argument("--topicos", default=str(TOPICOS_PADRAO))
    ap.add_argument("--gutenberg-zip", help="zip local do HTML do Gutenberg #14474 (reserva se a web falhar)")
    ap.add_argument("--hoje", help="data de acesso AAAA-MM-DD (padrão: hoje, UTC)")
    a = ap.parse_args(argv)
    try:
        manifest, erros, stats = construir(a)
    except Exception:  # noqa: BLE001
        traceback.print_exc()
        print("\nFALHA NO BUILD (o pacote anterior foi mantido).")
        return 1
    if erros:
        print("\nVALIDAÇÃO FALHOU (o pacote anterior foi mantido):")
        for e in erros[:40]:
            print("  -", e)
        return 2
    print(f"\nPacote válido: {manifest['version']} | {stats['contagens']['compostos']} compostos | "
          f"{stats['contagens']['textos']} textos | {stats['duracaoSegundos']} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
