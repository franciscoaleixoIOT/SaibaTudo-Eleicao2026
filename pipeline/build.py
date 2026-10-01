# -*- coding: utf-8 -*-
"""
ETL OFICIAL — SaibaTudo-Eleicoes2026
====================================
Converte os arquivos oficiais do TSE (baixados por fetch.py) em um PACOTE DE DADOS versionado:

    <out>/manifest.json            versão, fase eleitoral, fontes (URL/ETag/sha256), arquivos (sha256)
    <out>/manifest.sig             assinatura ECDSA P-256/SHA-256 do manifest.json (opcional)
    <out>/candidatos/<UF>.json     candidaturas por UF ("BR" = Presidente/Vice)
    <out>/pesquisas.json           pesquisas registradas (PesqEle)
    <out>/regras.json              regras, calendário, vagas e estatísticas agregadas
    <out>/fontes.json              TREs e órgãos oficiais (copiado de pipeline/static)
    <out>/resultados/<UF>.json     resultados oficiais (somente quando o TSE publicar)
    <out>/fotos/<sq>.jpg           fotos oficiais de candidatos majoritários

PRINCÍPIOS (política de dados oficiais):
  * Todo campo vem de arquivo oficial do TSE ou é uma derivação determinística documentada.
  * Campos derivados são marcados no esquema (ver docs/DATA_CONTRACT.md) e rotulados no app.
  * Nada é "completado" com valor padrão: ausência de dado == ausência de campo (tri-state).
"""
import argparse
import glob
import json
import os
import re
import shutil
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sources as S  # noqa: E402
import themes as T  # noqa: E402
from common import (clean, dump_json, iter_csv, norm, read_csv, sha256_bytes,  # noqa: E402
                    sha256_file, strip_accents, to_float)

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "ai_model" / "data" / "tse_official"
OUT = ROOT / "data" / "eleicoes2026"
STATIC = Path(__file__).resolve().parent / "static"

SCHEMA_VERSION = 1
TURNO1 = "2026-10-04"
TURNO2 = "2026-10-25"
SITE = "https://saibatudo.net"

REGIOES = {
    "SP": "Sudeste", "RJ": "Sudeste", "MG": "Sudeste", "ES": "Sudeste",
    "PR": "Sul", "SC": "Sul", "RS": "Sul",
    "BA": "Nordeste", "PE": "Nordeste", "CE": "Nordeste", "MA": "Nordeste",
    "PB": "Nordeste", "RN": "Nordeste", "AL": "Nordeste", "SE": "Nordeste", "PI": "Nordeste",
    "DF": "Centro-Oeste", "GO": "Centro-Oeste", "MT": "Centro-Oeste", "MS": "Centro-Oeste",
    "AM": "Norte", "PA": "Norte", "AC": "Norte", "RO": "Norte", "RR": "Norte", "AP": "Norte", "TO": "Norte",
    "BR": "Nacional",
}

CARGO_MAP = {
    "PRESIDENTE": ("PRESIDENTE", 2, 6),
    "VICE-PRESIDENTE": ("VICE_PRESIDENTE", 2, 6),
    "GOVERNADOR": ("GOVERNADOR", 2, 5),
    "VICE-GOVERNADOR": ("VICE_GOVERNADOR", 2, 5),
    "SENADOR": ("SENADOR", 3, 3),
    "1º SUPLENTE": ("SUPLENTE_1", 3, 3),
    "2º SUPLENTE": ("SUPLENTE_2", 3, 3),
    "DEPUTADO FEDERAL": ("DEPUTADO_FEDERAL", 4, 1),
    "DEPUTADO ESTADUAL": ("DEPUTADO_ESTADUAL", 5, 2),
    "DEPUTADO DISTRITAL": ("DEPUTADO_DISTRITAL", 5, 2),
}
MAJORITARIOS_COM_FOTO = {"PRESIDENTE", "VICE_PRESIDENTE", "GOVERNADOR", "VICE_GOVERNADOR", "SENADOR"}
SIT_ELEITO = {"eleito", "eleito por qp", "eleito por media"}

# Situação oficial do julgamento -> enumeração estável (nunca inferir além do texto oficial)
ELEGIBILIDADE = {
    "DEFERIDO": "DEFERIDA",
    "DEFERIDO EM PRAZO RECURSAL OU COM RECURSO": "DEFERIDA_COM_RECURSO",
    "INDEFERIDO": "INDEFERIDA",
    "INDEFERIDO EM PRAZO RECURSAL OU COM RECURSO": "INDEFERIDA_COM_RECURSO",
    "RENÚNCIA": "RENUNCIA",
    "FALECIMENTO": "FALECIDO",
    "CANCELADO": "CANCELADA",
    "PENDENTE DE JULGAMENTO": "PENDENTE",
    "PEDIDO NÃO CONHECIDO": "NAO_CONHECIDO",
    "PEDIDO NÃO CONHECIDO EM PRAZO RECURSAL OU COM RECURSO": "NAO_CONHECIDO",
}


def utcnow():
    return datetime.now(timezone.utc)


def fase_eleitoral(hoje: date) -> str:
    t1 = date.fromisoformat(TURNO1)
    t2 = date.fromisoformat(TURNO2)
    if hoje < t1:
        return "PRE_ELEICAO"
    if hoje == t1:
        return "DIA_1T"
    if hoje < t2:
        return "ENTRE_TURNOS"
    if hoje == t2:
        return "DIA_2T"
    return "POS_ELEICAO"


def normalizar_url(u):
    if not u:
        return None
    u = u.strip().strip("<>\"' ")
    if not u or " " in u or "." not in u:
        return None
    if not re.match(r"(?i)^https?://", u):
        u = "https://" + u.lstrip("/")
    m = re.match(r"(?i)^(https?)://([^/?#]+)(.*)$", u)
    if not m:
        return None
    return f"{m.group(1).lower()}://{m.group(2).lower()}{m.group(3)}"


def hoje_brasilia() -> date:
    return (utcnow() - timedelta(hours=3)).date()


# ----------------------------------------------------------------------------------------------
# Leitura das fontes
# ----------------------------------------------------------------------------------------------

def csv_brasil(cache: Path, key: str, prefixo: str):
    """Localiza <prefixo>_2026_BRASIL.csv dentro de extracted/<key>/ ."""
    d = cache / "extracted" / key
    cand = list(d.glob(f"{prefixo}_*_BRASIL.csv"))
    if not cand:
        # fallback: um CSV por UF
        cand = sorted(d.glob(f"{prefixo}_*.csv"))
        if not cand:
            return None
        return cand
    return cand


def read_many(paths):
    rows = []
    for p in paths:
        rows.extend(read_csv(p))
    return rows


def load_state(cache: Path):
    p = cache / "state.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def extrair_temas_planos(cache: Path, candidatos_sq_uf: dict):
    """Detecta temas citados nos PDFs oficiais de plano de governo. Retorna {sq: [temas]} e {sq: n_pdfs}."""
    try:
        from pypdf import PdfReader
    except ImportError:
        print("  ! pypdf ausente: temas dos planos NÃO serão calculados (pip install pypdf)")
        return {}, {}
    cache_file = cache / "planos_temas.json"
    memo = json.loads(cache_file.read_text(encoding="utf-8")) if cache_file.exists() else {}
    por_sq = defaultdict(list)
    for pdf in glob.glob(str(cache / "extracted" / "planos_*" / "**" / "*.pdf"), recursive=True):
        m = re.match(r"2026[A-Z]{2}(\d+)_", os.path.basename(pdf))
        if m:
            por_sq[m.group(1)].append(pdf)
    out_temas, out_pdfs = {}, {}
    novos = 0
    for sq, pdfs in por_sq.items():
        if sq not in candidatos_sq_uf:
            continue
        pdfs.sort()
        sig = f"v{T.VERSAO}|" + "|".join(f"{os.path.basename(p)}:{os.path.getsize(p)}" for p in pdfs)
        out_pdfs[sq] = len(pdfs)
        if sq in memo and memo[sq].get("sig") == sig:
            out_temas[sq] = memo[sq]["temas"]
            continue
        texto, paginas = [], 0
        for p in pdfs:
            try:
                r = PdfReader(p)
                for pg in r.pages:
                    texto.append(pg.extract_text() or "")
                    paginas += 1
                    if paginas >= 150:
                        break
            except Exception as e:  # noqa: BLE001
                print(f"  ! PDF ilegível {os.path.basename(p)}: {e}")
            if paginas >= 150:
                break
        temas = T.detectar_temas(" ".join(texto))
        memo[sq] = {"sig": sig, "temas": temas}
        out_temas[sq] = temas
        novos += 1
    cache_file.write_text(json.dumps(memo, ensure_ascii=False), encoding="utf-8")
    print(f"  planos: {len(out_pdfs)} candidatos com PDF ({novos} processados agora)")
    return out_temas, out_pdfs


# ----------------------------------------------------------------------------------------------
# Prestação de contas (receitas e despesas contratadas declaradas pelas campanhas)
# ----------------------------------------------------------------------------------------------

def agregar_contas(cache: Path, state: dict):
    """Soma receitas e despesas contratadas por SQ_CANDIDATO (arquivos por UF; ignora *_BRASIL para não duplicar).
    O resultado é memoizado por sha256 do zip (o processamento leva alguns minutos)."""
    st = state.get("prestacao_contas") or {}
    d = cache / "extracted" / "prestacao_contas"
    if not d.exists() or st.get("vazio"):
        return {}
    memo_file = cache / "contas_agregadas.json"
    if memo_file.exists():
        memo = json.loads(memo_file.read_text(encoding="utf-8"))
        if memo.get("sha256") == st.get("sha256") and memo.get("versao") == 1:
            return memo["dados"]
    rec = defaultdict(float)
    desp = defaultdict(float)
    tipo, ger = {}, {}
    for arq in sorted(d.glob("receitas_candidatos_2026_*.csv")):
        if arq.name.endswith("_BRASIL.csv"):
            continue
        for r in iter_csv(arq):
            v = to_float(r.get("VR_RECEITA"))
            if v is not None:
                sq = r["SQ_CANDIDATO"]
                rec[sq] += v
                tipo[sq] = r.get("TP_PRESTACAO_CONTAS") or tipo.get(sq)
                ger[sq] = r.get("DT_GERACAO") or ger.get(sq)
    for arq in sorted(d.glob("despesas_contratadas_candidatos_2026_*.csv")):
        if arq.name.endswith("_BRASIL.csv"):
            continue
        for r in iter_csv(arq):
            v = to_float(r.get("VR_DESPESA_CONTRATADA"))
            if v is not None:
                sq = r["SQ_CANDIDATO"]
                desp[sq] += v
                tipo.setdefault(sq, r.get("TP_PRESTACAO_CONTAS"))
                ger.setdefault(sq, r.get("DT_GERACAO"))
    dados = {sq: {"receitas": round(rec.get(sq, 0.0), 2), "despesasContratadas": round(desp.get(sq, 0.0), 2),
                  "tipo": tipo.get(sq), "geradoEm": ger.get(sq)} for sq in set(rec) | set(desp)}
    memo_file.write_text(json.dumps({"sha256": st.get("sha256"), "versao": 1, "dados": dados}, ensure_ascii=False),
                         encoding="utf-8")
    return dados


# ----------------------------------------------------------------------------------------------
# Resultados (somente quando o TSE publicar o arquivo com conteúdo)
# ----------------------------------------------------------------------------------------------

def carregar_resultados(cache: Path, state: dict):
    """Agrega votação oficial por candidato/turno. Retorna (por_sq, meta) ou ({}, None) se indisponível."""
    st = state.get("votacao_candidato_munzona") or {}
    d = cache / "extracted" / "votacao_candidato_munzona"
    if st.get("vazio") or not d.exists():
        return {}, None
    arquivos = sorted(d.glob("votacao_candidato_munzona_2026_*.csv"))
    arquivos = [a for a in arquivos if not a.name.endswith("_BRASIL.csv")] or arquivos
    if not arquivos:
        return {}, None
    votos = defaultdict(lambda: defaultdict(int))     # sq -> turno -> votos nominais válidos
    situacao = defaultdict(dict)                      # sq -> turno -> situação de totalização
    chave_cargo = {}                                  # sq -> (uf, cargo)
    ult_geracao = ""
    for arq in arquivos:
        for r in iter_csv(arq):
            sq = r.get("SQ_CANDIDATO")
            turno = int(r.get("NR_TURNO") or 1)
            qt = r.get("QT_VOTOS_NOMINAIS_VALIDOS") or r.get("QT_VOTOS_NOMINAIS") or "0"
            try:
                votos[sq][turno] += int(qt)
            except ValueError:
                pass
            sit = clean(r.get("DS_SIT_TOT_TURNO"))
            if sit:
                situacao[sq][turno] = sit
            chave_cargo[sq] = (r.get("SG_UF"), r.get("DS_CARGO"))
            ult_geracao = f"{r.get('DT_GERACAO', '')} {r.get('HH_GERACAO', '')}".strip()
    # percentual sobre votos nominais válidos do mesmo cargo/UF/turno (majoritários)
    total = defaultdict(int)
    for sq, por_turno in votos.items():
        for turno, v in por_turno.items():
            total[(chave_cargo[sq], turno)] += v
    por_sq = {}
    for sq, por_turno in votos.items():
        res = {}
        for turno, v in por_turno.items():
            rec = {"votos": v}
            t = total[(chave_cargo[sq], turno)]
            cargo = (chave_cargo[sq][1] or "").upper()
            if t and cargo in ("PRESIDENTE", "GOVERNADOR", "SENADOR"):
                rec["percentual"] = round(100.0 * v / t, 2)
            if turno in situacao[sq]:
                rec["situacao"] = situacao[sq][turno]
            res[str(turno)] = rec
        por_sq[sq] = res
    return por_sq, {"geradoEm": ult_geracao, "candidatos": len(por_sq)}


# ----------------------------------------------------------------------------------------------
# Build
# ----------------------------------------------------------------------------------------------

def build(cache: Path, out: Path, incluir_fotos=True, assinar_com=None, hoje=None):
    state = load_state(cache)
    hoje = hoje or hoje_brasilia()
    print("== ETL oficial TSE 2026 ==")

    cand_rows = read_many(csv_brasil(cache, "consulta_cand", "consulta_cand"))
    comp = {r["SQ_CANDIDATO"]: r for r in read_many(csv_brasil(cache, "consulta_cand_complementar", "consulta_cand_complementar"))}
    extracao = f"{cand_rows[0]['DT_GERACAO']} {cand_rows[0]['HH_GERACAO']}" if cand_rows else ""
    print(f"  candidaturas: {len(cand_rows)} (extração TSE {extracao})")

    # Motivos de indeferimento/cassação (texto oficial)
    motivos = defaultdict(list)
    cass = csv_brasil(cache, "motivo_cassacao", "motivo_cassacao")
    for r in (read_many(cass) if cass else []):
        m = clean(r.get("DS_MOTIVO"))
        if m and m not in motivos[r["SQ_CANDIDATO"]]:
            motivos[r["SQ_CANDIDATO"]].append(m)

    # Histórico de candidaturas -> vezes eleito / eleito antes para o mesmo cargo
    vezes_eleito, disputadas, mesmo_cargo = Counter(), Counter(), set()
    hist_path = csv_brasil(cache, "historico_candidatura", "historico_candidatura")
    cargo_atual = {r["SQ_CANDIDATO"]: norm(r["DS_CARGO"]) for r in cand_rows}
    for r in (read_many(hist_path) if hist_path else []):
        sq = r["SQ_CANDIDATO_ATUAL"]
        disputadas[sq] += 1
        if norm(r.get("DS_SIT_TOT_TURNO")) in SIT_ELEITO:
            vezes_eleito[sq] += 1
            if norm(r.get("DS_CARGO")) == cargo_atual.get(sq):
                mesmo_cargo.add(sq)

    # Redes sociais (URLs normalizadas: esquema/host em minúsculas, https por padrão)
    redes = defaultdict(list)
    rp = csv_brasil(cache, "rede_social_candidato", "rede_social_candidato")
    for r in (read_many(rp) if rp else []):
        u = normalizar_url(clean(r.get("DS_URL")))
        if u and u not in redes[r["SQ_CANDIDATO"]] and len(redes[r["SQ_CANDIDATO"]]) < 5:
            redes[r["SQ_CANDIDATO"]].append(u)

    # Bens declarados
    patrimonio, qtd_bens = defaultdict(float), Counter()
    bp = csv_brasil(cache, "bem_candidato", "bem_candidato")
    for r in (read_many(bp) if bp else []):
        v = to_float(r.get("VR_BEM_CANDIDATO"))
        if v is not None:
            patrimonio[r["SQ_CANDIDATO"]] += v
            qtd_bens[r["SQ_CANDIDATO"]] += 1

    # Fotos oficiais (majoritários)
    fotos = {}
    if incluir_fotos:
        for d in (cache / "extracted").glob("fotos_*"):
            for jpg in d.rglob("F*_div.jpg"):
                m = re.match(r"F[A-Z]{2}(\d+)_div\.jpg", jpg.name)
                if m:
                    fotos[m.group(1)] = jpg

    # Prestação de contas (opcional: exige o zip de ~150 MB baixado por fetch.py --com-contas)
    contas = agregar_contas(cache, state)
    print(f"  prestação de contas: {len(contas)} candidatos" if contas else "  prestação de contas: não incluída")

    # Resultados oficiais (pós-eleição)
    resultados, meta_resultados = carregar_resultados(cache, state)
    print(f"  resultados oficiais (CSV): {'disponíveis' if resultados else 'ainda não publicados pelo TSE'}")

    # Registro por candidato
    candidatos = []
    ids_vistos = set()
    resultados_por_sq = {}
    for r in cand_rows:
        sq = r["SQ_CANDIDATO"]
        ds_cargo = r["DS_CARGO"]
        if ds_cargo not in CARGO_MAP or sq in ids_vistos:
            continue
        ids_vistos.add(sq)
        codigo, digitos, ordem = CARGO_MAP[ds_cargo]
        c = comp.get(sq, {})
        sit = clean(c.get("DS_SITUACAO_JULGAMENTO"))
        uf = r["SG_UF"]
        idade = clean(c.get("NR_IDADE_DATA_POSSE"))
        rec = {
            "id": sq,
            "numero": r["NR_CANDIDATO"],
            "nomeUrna": clean(r["NM_URNA_CANDIDATO"]) or r["NM_CANDIDATO"],
            "nomeCompleto": r["NM_CANDIDATO"],
            "cargo": codigo,
            "dsCargo": ds_cargo,
            "digitosUrna": digitos,
            "ordemVotacao": ordem,
            "partido": clean(r["SG_PARTIDO"]) or r["SG_PARTIDO"],
            "nomePartido": clean(r["NM_PARTIDO"]),
            "numeroPartido": clean(r["NR_PARTIDO"]),
            "federacao": clean(r.get("NM_FEDERACAO")),
            "siglaFederacao": clean(r.get("SG_FEDERACAO")),
            "coligacao": clean(r.get("NM_COLIGACAO")),
            "estadoUf": uf,
            "regiao": REGIOES.get(uf, "Nacional"),
            "municipioNascimento": clean(c.get("NM_MUNICIPIO_NASCIMENTO")),
            "ufNascimento": clean(r.get("SG_UF_NASCIMENTO")),
            "idade": int(idade) if idade and idade.isdigit() else None,
            "genero": clean(r.get("DS_GENERO")),
            "corRaca": clean(r.get("DS_COR_RACA")),
            "grauInstrucao": clean(r.get("DS_GRAU_INSTRUCAO")),
            "estadoCivil": clean(r.get("DS_ESTADO_CIVIL")),
            "ocupacao": clean(r.get("DS_OCUPACAO")),
            # situação oficial do julgamento do registro (texto do TSE) + enumeração estável
            "situacao": sit,
            "elegibilidade": ELEGIBILIDADE.get(sit, "DESCONHECIDA") if sit else "DESCONHECIDA",
            "naUrna": clean(c.get("ST_CANDIDATO_INSERIDO_URNA")) == "SIM",
            "motivosIndeferimento": motivos.get(sq, []),
            # derivados do histórico oficial (rotulados no app)
            "vezesEleito": vezes_eleito.get(sq, 0),
            "eleicoesDisputadas": disputadas.get(sq, 0),
            "eleitoMesmoCargo": sq in mesmo_cargo,
            "redesSociais": redes.get(sq, []),
            "substituido": clean(c.get("ST_SUBSTITUIDO")) == "S",
            "declaraBens": {"S": True, "N": False}.get(clean(c.get("ST_DECLARAR_BENS"))),
            "patrimonioDeclarado": round(patrimonio[sq], 2) if sq in patrimonio else None,
            "qtdBens": qtd_bens.get(sq) or None,
            "prestouContas": {"S": True, "N": False}.get(clean(c.get("ST_PREST_CONTAS"))),
        }
        if sq in contas:
            rec["contas"] = contas[sq]
        if sq in fotos:
            rec["temFoto"] = True                      # foto oficial existe no CDN do TSE (resultados.tse.jus.br)
            if codigo in MAJORITARIOS_COM_FOTO:
                rec["foto"] = f"fotos/{sq}.jpg"        # majoritários: foto empacotada (offline)
        # Resultados NÃO ficam nos shards de candidatos (mudam a cada apuração): vão para resultados/<UF>.json
        sit_total = clean(r.get("DS_SIT_TOT_TURNO"))
        res = dict(resultados.get(sq) or {})
        if sit_total:
            res["situacaoTotalizacao"] = sit_total
        if res:
            resultados_por_sq[sq] = res
        candidatos.append(rec)

    uf_por_sq = {c["id"]: c["estadoUf"] for c in candidatos}
    temas_planos, pdfs_planos = extrair_temas_planos(cache, uf_por_sq)
    for c in candidatos:
        n = pdfs_planos.get(c["id"])
        if n:
            c["temPlanoGoverno"] = True
            if temas_planos.get(c["id"]):
                c["temasPlano"] = temas_planos[c["id"]]

    # -------- Pesquisas --------
    pesq_rows = read_many(csv_brasil(cache, "pesquisa_eleitoral", "pesquisa_eleitoral"))
    pesquisas = []
    for r in pesq_rows:
        met = clean(r.get("DS_METODOLOGIA_PESQUISA"))
        pesquisas.append({
            "protocolo": clean(r.get("NR_PROTOCOLO_REGISTRO")),
            "uf": r.get("SG_UF"),
            "municipio": clean(r.get("NM_UE")),
            "cargo": clean(r.get("DS_CARGO")),
            "empresa": clean(r.get("NM_EMPRESA_FANTASIA")) or clean(r.get("NM_EMPRESA")),
            "cnpj": clean(r.get("NR_CNPJ_EMPRESA")),
            "pesquisaPropria": r.get("ST_PESQUISA_PROPRIA") == "S",
            "dataRegistro": clean(r.get("DT_REGISTRO")),
            "dataInicio": clean(r.get("DT_INICIO_PESQUISA")),
            "dataFim": clean(r.get("DT_FIM_PESQUISA")),
            "dataDivulgacao": clean(r.get("DT_DIVULGACAO")),
            "entrevistados": clean(r.get("QT_ENTREVISTADO")),
            "estatistico": clean(r.get("NM_ESTATISTICO_RESP")),
            "conre": clean(r.get("CD_CONRE")),
            "valor": clean(r.get("VR_PESQUISA")),
            "metodologia": (met[:400] + "…") if met and len(met) > 400 else met,
        })
    pesquisas.sort(key=lambda x: x.get("dataDivulgacao") or "", reverse=True)

    # -------- Vagas / posse --------
    vagas = []
    vp = csv_brasil(cache, "consulta_vagas", "consulta_vagas")
    for r in (read_many(vp) if vp else []):
        vagas.append({"uf": r.get("SG_UF"), "cargo": clean(r.get("DS_CARGO")), "vagas": clean(r.get("QT_VAGA")),
                      "posse": clean(r.get("DT_POSSE"))})

    # -------- Estatísticas (todas calculadas dos dados oficiais) --------
    na_urna = [c for c in candidatos if c["naUrna"]]
    stats = {
        "totalRegistros": len(candidatos),
        "totalNaUrna": len(na_urna),
        "porCargo": dict(Counter(c["dsCargo"] for c in candidatos)),
        "porCargoNaUrna": dict(Counter(c["dsCargo"] for c in na_urna)),
        "porUf": dict(Counter(c["estadoUf"] for c in candidatos)),
        "porPartido": dict(Counter(c["partido"] for c in candidatos).most_common(40)),
        "porGenero": dict(Counter(c["genero"] for c in candidatos if c.get("genero"))),
        "porElegibilidade": dict(Counter(c["elegibilidade"] for c in candidatos)),
        "eleitosMesmoCargoAntes": sum(1 for c in candidatos if c["eleitoMesmoCargo"]),
        "pesquisasRegistradas": len(pesquisas),
        "candidatosComPlanoGoverno": len(pdfs_planos),
    }

    hoje_s = hoje.isoformat()
    regras = {
        "ano": S.ANO,
        "fonte": "Tribunal Superior Eleitoral (TSE) - Portal de Dados Abertos e CDN oficial",
        "licenca": S.LICENCA,
        "extracaoTse": extracao,
        "turno1": TURNO1,
        "turno2": TURNO2,
        "horarioVotacao": "08h às 17h (horário de Brasília)",
        "faseEleitoral": fase_eleitoral(hoje),
        # Códigos oficiais da eleição no sistema de divulgação de resultados do TSE (resultados.tse.jus.br)
        "resultadosTse": {
            "base": "https://resultados.tse.jus.br/oficial/ele2026",
            "federal": {"turno1": 6257, "turno2": 6258},
            "estadual": {"turno1": 6259, "turno2": 6260},
            "cargos": {"PRESIDENTE": 1, "GOVERNADOR": 3, "SENADOR": 5, "DEPUTADO_FEDERAL": 6,
                       "DEPUTADO_ESTADUAL": 7, "DEPUTADO_DISTRITAL": 8},
        },
        "ordemVotacaoUrna": [
            {"ordem": 1, "cargo": "Deputado Federal", "codigo": "DEPUTADO_FEDERAL", "digitos": 4,
             "regra": "2 primeiros dígitos = partido, 2 últimos = candidato", "sistema": "Proporcional"},
            {"ordem": 2, "cargo": "Deputado Estadual/Distrital", "codigo": "DEPUTADO_ESTADUAL", "digitos": 5,
             "regra": "2 primeiros dígitos = partido, 3 últimos = candidato", "sistema": "Proporcional"},
            {"ordem": 3, "cargo": "Senador – 1ª vaga", "codigo": "SENADOR", "digitos": 3,
             "regra": "3 dígitos do candidato", "sistema": "Majoritário (renovação de 2/3)"},
            {"ordem": 4, "cargo": "Senador – 2ª vaga", "codigo": "SENADOR", "digitos": 3,
             "regra": "Candidato DIFERENTE da 1ª vaga (voto repetido anula o 2º voto)", "sistema": "Majoritário"},
            {"ordem": 5, "cargo": "Governador", "codigo": "GOVERNADOR", "digitos": 2,
             "regra": "Número do partido do candidato", "sistema": "Majoritário absoluto (2 turnos)"},
            {"ordem": 6, "cargo": "Presidente da República", "codigo": "PRESIDENTE", "digitos": 2,
             "regra": "Número do partido do candidato", "sistema": "Majoritário absoluto (2 turnos)"},
        ],
        "estatisticas": stats,
        "vagas": vagas,
        "temas": T.rotulos(),
        "glossario": {
            "elegibilidade": "Situação do julgamento do registro de candidatura, conforme a Justiça Eleitoral "
                             "(inclui a análise da Lei da Ficha Limpa, LC 135/2010). O app NÃO emite certidão de "
                             "'Ficha Limpa': exibe a situação oficial e os motivos de indeferimento registrados.",
            "naUrna": "Candidatura inserida na urna eletrônica (ST_CANDIDATO_INSERIDO_URNA = SIM).",
            "eleitoMesmoCargo": "Candidato eleito para o MESMO cargo em eleição anterior segundo o histórico oficial "
                                "de candidaturas do TSE (derivado; não significa necessariamente exercício do mandato).",
            "temasPlano": "Temas detectados automaticamente por palavras-chave no plano de governo registrado "
                          f"(mín. {T.MIN_MENCOES} menções; até {T.MAX_TEMAS} temas por densidade). Indica conteúdo citado, não avaliação do plano.",
            "patrimonioDeclarado": "Soma dos bens declarados pelo próprio candidato ao TSE no registro.",
        },
    }

    # -------- Escrita --------
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    arquivos = []

    def registrar(rel, dados: bytes, registros=None):
        arquivos.append({"path": rel, "bytes": len(dados), "sha256": sha256_bytes(dados),
                         **({"records": registros} if registros is not None else {})})

    por_uf = defaultdict(list)
    for c in candidatos:
        por_uf[c["estadoUf"]].append(c)
    ordem_cargo = {"PRESIDENTE": 0, "VICE_PRESIDENTE": 1, "GOVERNADOR": 2, "VICE_GOVERNADOR": 3, "SENADOR": 4,
                   "SUPLENTE_1": 5, "SUPLENTE_2": 6, "DEPUTADO_FEDERAL": 7, "DEPUTADO_ESTADUAL": 8,
                   "DEPUTADO_DISTRITAL": 9}

    def slim(rec):
        o = {}
        for k, v in rec.items():
            if v is None or v == [] or v == "":
                continue
            if v is False and k in ("eleitoMesmoCargo", "substituido"):
                continue
            if v == 0 and k in ("vezesEleito", "eleicoesDisputadas"):
                continue
            o[k] = v
        return o

    for uf, lista in sorted(por_uf.items()):
        lista.sort(key=lambda c: (ordem_cargo[c["cargo"]], int(c["numero"]) if c["numero"].isdigit() else 0, c["nomeUrna"]))
        dados = dump_json(out / "candidatos" / f"{uf}.json", [slim(c) for c in lista])
        registrar(f"candidatos/{uf}.json", dados, len(lista))
    dados = dump_json(out / "pesquisas.json", pesquisas)
    registrar("pesquisas.json", dados, len(pesquisas))
    dados = dump_json(out / "regras.json", regras)
    registrar("regras.json", dados)
    fontes_static = STATIC / "fontes_oficiais.json"
    if fontes_static.exists():
        dados = fontes_static.read_bytes()
        (out / "fontes.json").write_bytes(dados)
        registrar("fontes.json", dados)
    if resultados_por_sq:
        res_por_uf = defaultdict(dict)
        for c in candidatos:
            if c["id"] in resultados_por_sq:
                res_por_uf[c["estadoUf"]][c["id"]] = resultados_por_sq[c["id"]]
        for uf, rs in sorted(res_por_uf.items()):
            dados = dump_json(out / "resultados" / f"{uf}.json", rs)
            registrar(f"resultados/{uf}.json", dados, len(rs))
    if incluir_fotos:
        (out / "fotos").mkdir()
        usadas = {c["id"] for c in candidatos if "foto" in c}
        for sq in sorted(usadas):
            dest = out / "fotos" / f"{sq}.jpg"
            shutil.copyfile(fotos[sq], dest)
            arquivos.append({"path": f"fotos/{sq}.jpg", "bytes": dest.stat().st_size, "sha256": sha256_file(dest)})

    # -------- Manifesto --------
    versao_hash = sha256_bytes("".join(a["sha256"] for a in arquivos if not a["path"].startswith("fotos/")).encode())[:12]
    gerado = utcnow()
    fontes_manifest = []
    for key, s in {**S.CSV_SOURCES, **S.RESULTADOS_SOURCES}.items():
        st = state.get(key, {})
        fontes_manifest.append({
            "id": key, "descricao": s["descricao"], "url": s["url"], "licenca": S.LICENCA,
            "etag": st.get("etag"), "lastModified": st.get("lastModified"), "sha256": st.get("sha256"),
            "coletadoEm": st.get("retrievedAt"), "vazio": st.get("vazio", False) or None,
        })
    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "id": "eleicoes2026",
        "dataVersion": f"{gerado.strftime('%Y%m%dT%H%M%SZ')}-{versao_hash}",
        "generatedAt": gerado.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "extracaoTse": extracao,
        "faseEleitoral": regras["faseEleitoral"],
        "eleicao": {"ano": S.ANO, "turno1": TURNO1, "turno2": TURNO2},
        "resultadosDisponiveis": bool(resultados_por_sq),
        "contagens": {"candidaturas": len(candidatos), "comPrestacaoDeContas": len([1 for c in candidatos if 'contas' in c]), "naUrna": len(na_urna), "pesquisas": len(pesquisas),
                      "candidatosComFoto": len([1 for c in candidatos if 'temFoto' in c]),
                      "fotosEmpacotadas": len([1 for c in candidatos if 'foto' in c])},
        "atribuicao": "Dados: Tribunal Superior Eleitoral (TSE) – Portal de Dados Abertos, licença CC BY 4.0. "
                      "Aplicativo independente, sem vínculo com o TSE, governo ou partidos.",
        "cliente": {
            "pollIntervalMinutes": 360 if regras["faseEleitoral"] in ("PRE_ELEICAO", "POS_ELEICAO") else 15,
            "baseUrl": f"{SITE}/data/eleicoes2026/",
            "nlu": {"endpoint": f"{SITE}/api/nlu"},
        },
        "fontes": fontes_manifest,
        "arquivos": arquivos,
    }
    dados = dump_json(out / "manifest.json", manifest, indent=2)
    print(f"  manifesto: {manifest['dataVersion']} | {len(arquivos)} arquivos")
    if assinar_com:
        from sign import assinar
        assinar(out / "manifest.json", Path(assinar_com))
        print("  manifesto assinado (manifest.sig)")

    return manifest


def validar(out: Path, previo: dict = None):
    """Gates de qualidade: falha o build se o pacote estiver incoerente."""
    m = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    erros = []
    total = 0
    ids = set()
    for a in m["arquivos"]:
        p = out / a["path"]
        if not p.exists():
            erros.append(f"arquivo ausente: {a['path']}")
            continue
        if sha256_file(p) != a["sha256"]:
            erros.append(f"checksum divergente: {a['path']}")
        if a["path"].startswith("candidatos/"):
            for c in json.loads(p.read_text(encoding="utf-8")):
                if c["id"] in ids:
                    erros.append(f"id duplicado {c['id']}")
                ids.add(c["id"])
                total += 1
                for campo in ("numero", "nomeUrna", "cargo", "partido", "estadoUf", "elegibilidade"):
                    if not c.get(campo):
                        erros.append(f"campo obrigatório ausente {campo} em {c['id']}")
    if total < 15000:
        erros.append(f"candidaturas insuficientes: {total}")
    if total != m["contagens"]["candidaturas"]:
        erros.append("contagem do manifesto diverge")
    if previo and previo.get("contagens", {}).get("candidaturas"):
        antes = previo["contagens"]["candidaturas"]
        if total < 0.8 * antes:
            erros.append(f"queda anormal de candidaturas: {antes} -> {total}")
    pres = [c for f in (out / "candidatos").glob("BR.json") for c in json.loads(f.read_text(encoding="utf-8"))
            if c["cargo"] == "PRESIDENTE"]
    if len(pres) < 2:
        erros.append("menos de 2 candidatos a Presidente")
    return erros


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=str(CACHE))
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--sem-fotos", action="store_true")
    ap.add_argument("--assinar-com", help="chave privada ECDSA (PEM) para assinar o manifesto")
    args = ap.parse_args()
    out = Path(args.out)
    previo = None
    if (out / "manifest.json").exists():
        previo = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    build(Path(args.cache), out, incluir_fotos=not args.sem_fotos, assinar_com=args.assinar_com)
    erros = validar(out, previo)
    if erros:
        print("\n❌ VALIDAÇÃO FALHOU:")
        for e in erros[:30]:
            print("  -", e)
        sys.exit(2)
    print("✅ Pacote de dados válido")


if __name__ == "__main__":
    main()
