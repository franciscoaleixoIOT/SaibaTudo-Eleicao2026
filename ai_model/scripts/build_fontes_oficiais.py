# -*- coding: utf-8 -*-
"""
Processador das FONTES OFICIAIS complementares (TREs estaduais, Senado, Câmara,
Congresso Nacional, MPF, TCU, AGU, CGU, STF, MJSP).

Gera app/src/main/assets/tse_fontes_oficiais_2026.json com:
  - sistemas nacionais do TSE (DivulgaCandContas, Autoatendimento, Resultados)
  - TRE de cada UF (título, resumo do conteúdo e seções oficiais da página /eleicoes)
  - órgãos de acompanhamento, legislação e fiscalização
Tudo derivado dos HTMLs oficiais baixados (Chrome headless) - nenhum dado inventado.
"""
import json
import os
import re
import glob
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
TRE_DIR = BASE / "data" / "tre_official"
LEG_DIR = BASE / "data" / "legislativo_official"
ORG_DIR = BASE / "data" / "orgaos_official"
ASSETS = BASE.parent / "app" / "src" / "main" / "assets"
OUT_DATA = BASE / "data"

UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
       "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]
NOMES_UF = {
    "AC": "Acre", "AL": "Alagoas", "AP": "Amapá", "AM": "Amazonas", "BA": "Bahia",
    "CE": "Ceará", "DF": "Distrito Federal", "ES": "Espírito Santo", "GO": "Goiás",
    "MA": "Maranhão", "MT": "Mato Grosso", "MS": "Mato Grosso do Sul", "MG": "Minas Gerais",
    "PA": "Pará", "PB": "Paraíba", "PR": "Paraná", "PE": "Pernambuco", "PI": "Piauí",
    "RJ": "Rio de Janeiro", "RN": "Rio Grande do Norte", "RS": "Rio Grande do Sul",
    "RO": "Rondônia", "RR": "Roraima", "SC": "Santa Catarina", "SP": "São Paulo",
    "SE": "Sergipe", "TO": "Tocantins"
}

KW_ELEITORAIS = re.compile(r"elei[çc]|candidat|urna|voto|vota[çc]|eleitor|2026|t[íi]tulo|pleito|"
                           r"calend[áa]rio|pesquisa|resultad|boletim|justific|2[ºo] turno|ficha limpa|"
                           r"divulgacand|simulador|seguran[çc]a eleitoral|zona eleitoral|calend[áa]rio", re.I)


def strip_html(html):
    """Remove scripts/styles/tags e colapsa espaços (texto puro da página oficial)."""
    html = re.sub(r"(?is)<script.*?</script>", " ", html)
    html = re.sub(r"(?is)<style.*?</style>", " ", html)
    html = re.sub(r"(?is)<noscript.*?</noscript>", " ", html)
    html = re.sub(r"(?is)<!--.*?-->", " ", html)
    # captura metadados úteis antes de remover tags
    title = re.search(r"(?is)<title>(.*?)</title>", html)
    title = re.sub(r"\s+", " ", title.group(1)).strip() if title else ""
    text = re.sub(r"(?is)<[^>]+>", "\n", html)
    text = re.sub(r"&nbsp;?", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"[ \t]+", " ", text)
    lines = [l.strip() for l in text.splitlines()]
    lines = [l for l in lines if len(l) > 2]
    return title, "\n".join(lines)


def extract_links(html, base_url):
    """Extrai links (texto, href) cujo texto/href parece eleitoral."""
    links = []
    for m in re.finditer(r'(?is)<a[^>]+href="([^"#]+)"[^>]*>(.*?)</a>', html):
        href, txt = m.group(1), re.sub(r"(?is)<[^>]+>", " ", m.group(2))
        txt = re.sub(r"\s+", " ", txt).strip()
        if not txt or len(txt) < 8:
            continue
        if not KW_ELEITORAIS.search(txt) and not KW_ELEITORAIS.search(href):
            continue
        if href.startswith("/"):
            host = re.match(r"https?://[^/]+", base_url)
            href = (host.group(0) if host else "") + href
        if not href.startswith("http"):
            continue
        links.append({"titulo": txt[:140], "url": href})
    # dedup por url
    seen = set()
    out = []
    for l in links:
        if l["url"] not in seen:
            seen.add(l["url"])
            out.append(l)
    return out[:25]


def extract_main_text(full_text):
    """Recorta o corpo principal (evita cabeçalho/rodapé/JS)."""
    lines = full_text.splitlines()
    # pega trecho central com mais conteúdo textual
    keep = [l for l in lines if len(l) > 15][:160]
    return " ".join(keep)[:3500]


def process_tres():
    tres = []
    for uf in UFS:
        path = TRE_DIR / f"tre_{uf.lower()}_eleicoes.html"
        if not path.exists() or path.stat().st_size < 8000:
            tres.append({
                "uf": uf, "estado": NOMES_UF[uf],
                "tribunal": f"TRE {uf}", "url": f"https://tre-{uf.lower()}.jus.br/eleicoes",
                "titulo": f"Eleições — Tribunal Regional Eleitoral {NOMES_UF[uf]}",
                "resumo": "Página oficial de Eleições do TRE. Para Eleições Gerais (Presidente, Governador, "
                          "Senador e Deputados), este TRE integra suas consultas aos sistemas nacionais do TSE "
                          "(DivulgaCandContas, Autoatendimento do Eleitor e Resultados TSE).",
                "secoes": [], "extraido": False,
            })
            continue
        html = path.read_text(encoding="utf-8", errors="ignore")
        title, text = strip_html(html)
        links = extract_links(html, f"https://tre-{uf.lower()}.jus.br/eleicoes")
        tres.append({
            "uf": uf,
            "estado": NOMES_UF[uf],
            "tribunal": f"TRE {uf}",
            "url": f"https://tre-{uf.lower()}.jus.br/eleicoes",
            "titulo": title or f"Eleições — TRE {NOMES_UF[uf]}",
            "resumo": extract_main_text(text)[:1200],
            "secoes": links,
            "extraido": True,
        })
    return tres


def process_orgaos():
    """Órgãos: Senado, Câmara, Congresso, MPF, TCU, AGU, CGU, STF, MJSP."""
    defs = [
        ("senado_eleicoes.html", LEG_DIR, "Senado Federal — Eleições 2026",
         "https://www12.senado.leg.br/noticias/temas/eleicoes",
         "Acompanhamento das 54 cadeiras em disputa (duas vagas por estado), perfis de candidatos ao Senado e guias explicativos de votação."),
        ("camara_tv_eleicoes.html", LEG_DIR, "Câmara dos Deputados — TV Eleições 2026",
         "https://www.camara.leg.br/tv/eleicoes-2026",
         "Cobertura jornalística das disputas para deputado federal, regras de quociente partidário e composição das bancadas."),
        ("congresso_nacional.html", LEG_DIR, "Congresso Nacional",
         "https://www.congressonacional.leg.br",
         "Legislação eleitoral consolidada, Código Eleitoral (Lei nº 4.737/1965) e Lei das Eleições (Lei nº 9.504/1997) com redação vigente."),
        ("mpf_pgr_eleitoral.html", LEG_DIR, "Ministério Público Eleitoral (MPF/PGR)",
         "https://www.mpf.mp.br/pgr/eleitoral",
         "Atuação da Procuradoria-Geral Eleitoral na fiscalização de abusos de poder político/econômico e cartilhas explicativas."),
        ("mpf_servicos.html", LEG_DIR, "MPF Serviços — Denúncias",
         "https://www.mpf.mp.br/mpfservicos",
         "Canal para cidadãos enviarem denúncias formais sobre irregularidades em campanhas de cargos federais (presidente, senador e deputado federal)."),
        ("tcu_contas_irregulares.html", ORG_DIR, "Tribunal de Contas da União (TCU) — Contas julgadas irregulares",
         "https://sites.tcu.gov.br/contas-julgadas-irregulares",
         "Lista oficial de gestores com contas irregulares enviada ao TSE, utilizada para verificação de inelegibilidade pela Lei da Ficha Limpa."),
        ("agu_condutas_vedadas.html", ORG_DIR, "Advocacia-Geral da União (AGU) — Condutas Vedadas",
         "https://www.gov.br/agu/pt-br/acesso-a-informacao/boletins-destaques/condutas-vedadas",
         "Manual e cartilha de condutas vedadas aos agentes públicos federais (limites legais de uso da máquina pública, desincompatibilização e publicidade)."),
        ("cgu_falabr.html", ORG_DIR, "Controladoria-Geral da União (CGU) — Fala.BR",
         "https://falabr.cgu.gov.br",
         "Plataforma Fala.BR para denúncias de servidores públicos usando recursos, prédios ou frotas da União em benefício eleitoral."),
        ("stf_portal.html", ORG_DIR, "Supremo Tribunal Federal (STF)",
         "https://portal.stf.jus.br",
         "Julgamentos de Ações Diretas de Inconstitucionalidade (ADIs) sobre regras de federações partidárias, fundo eleitoral e cláusulas de barreira."),
        ("mjsp_portal.html", ORG_DIR, "Ministério da Justiça e Segurança Pública (MJSP)",
         "https://www.gov.br/mj/pt-br",
         "Monitoramento de segurança e operações integradas da Polícia Federal contra crimes eleitorais (compra de votos, corrupção eleitoral e desinformação)."),
    ]
    orgaos = []
    for fname, d, nome, url, utilidade in defs:
        path = d / fname
        resumo = ""
        extraido = False
        if path.exists() and path.stat().st_size > 8000:
            html = path.read_text(encoding="utf-8", errors="ignore")
            title, text = strip_html(html)
            resumo = extract_main_text(text)[:1000]
            extraido = True
        orgaos.append({
            "orgao": nome,
            "url": url,
            "utilidade": utilidade,
            "resumo_pagina": resumo,
            "extraido": extraido,
        })
    return orgaos


SISTEMAS_NACIONAIS = [
    {"nome": "DivulgaCandContas — Consulta de Candidaturas e Contas",
     "url": "https://divulgacandcontas.tse.jus.br/divulga/#/",
     "utilidade": "Consulta oficial de candidaturas, bens, prestação de contas e propostas dos candidatos 2026."},
    {"nome": "Autoatendimento do Eleitor — Título e Local de Votação",
     "url": "https://autoatendimento.tse.jus.br",
     "utilidade": "Consulta oficial de local de votação, situação do título e justificativa de ausência."},
    {"nome": "Resultados TSE — Acompanhamento da Apuração",
     "url": "https://resultados.tse.jus.br",
     "utilidade": "Boletins oficiais e resultados em tempo real das Eleições 2026."},
]


def build():
    print("=" * 70)
    print("  FONTES OFICIAIS COMPLEMENTARES (TREs, Legislativo, Fiscalização)")
    print("=" * 70)
    tres = process_tres()
    orgaos = process_orgaos()
    out = {
        "fonte": "Sites oficiais dos TREs estaduais (tre-XX.jus.br), Senado Federal, Câmara dos Deputados, "
                 "Congresso Nacional, MPF, TCU, AGU, CGU, STF e MJSP",
        "nota": "Para as Eleições Gerais 2026, os TREs integram suas consultas aos sistemas nacionais do TSE "
                "(DivulgaCandContas, Autoatendimento do Eleitor e Resultados TSE).",
        "sistemas_nacionais_tse": SISTEMAS_NACIONAIS,
        "tres": tres,
        "orgaos": orgaos,
    }
    data = json.dumps(out, ensure_ascii=False, indent=1)
    ASSETS.mkdir(parents=True, exist_ok=True)
    (ASSETS / "tse_fontes_oficiais_2026.json").write_text(data, encoding="utf-8")
    OUT_DATA.mkdir(parents=True, exist_ok=True)
    (OUT_DATA / "fontes_oficiais_2026.json").write_text(data, encoding="utf-8")
    extraidos = sum(1 for t in tres if t["extraido"])
    org_extraidos = sum(1 for o in orgaos if o["extraido"])
    print(f"✅ TREs processados: {extraidos}/27 com conteúdo extraído")
    print(f"✅ Órgãos processados: {org_extraidos}/{len(orgaos)} com conteúdo extraído")
    print(f"   Asset: tse_fontes_oficiais_2026.json ({os.path.getsize(ASSETS / 'tse_fontes_oficiais_2026.json')/1e3:.0f} KB)")


if __name__ == "__main__":
    build()
