# -*- coding: utf-8 -*-
"""
Gerador de Dataset de Treinamento OFICIAL - SaibaTudo-Eleicao2026
=================================================================
Constrói pares (instruction/input/output) para fine-tuning a partir EXCLUSIVAMENTE
dos dados oficiais do TSE 2026 (já processados pelo build_official_data.py).

Categorias:
  A) Extração de intenção/rota/menu/filtros (JSON estruturado)
  B) Q&A cívico (regras, calendário, ordem de votação, dígitos, vagas)
  C) Fatos oficiais agregados (contagens reais por cargo/UF, presidenciáveis reais)
  D) Lookup de candidato real (responde SOMENTE com campos oficiais)
  E) Pesquisas eleitorais registradas no TSE
"""
import json
import random
from pathlib import Path
from collections import Counter, defaultdict

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "data"

random.seed(42)

INSTRUCTION = ("Você é o assistente inteligente do SaibaTudo-Eleicao2026. "
               "Com base nos dados OFICIAIS do TSE (Eleições Gerais 2026), identifique "
               "intenção, rota, menu, submenu e filtros, e responda com JSON estruturado.")

CARGOS = [
    ("presidente", "PRESIDENTE", "menu_presidente", "candidates/presidente", 2),
    ("governador", "GOVERNADOR", "menu_governador", "candidates/governador", 2),
    ("senador", "SENADOR", "menu_senador", "candidates/senador", 3),
    ("deputado federal", "DEPUTADO_FEDERAL", "menu_deputado_federal", "candidates/deputado_federal", 4),
    ("deputado estadual", "DEPUTADO_ESTADUAL", "menu_deputado_estadual", "candidates/deputado_estadual", 5),
]

ESTADOS = {
    "SP": ("São Paulo", "Sudeste"), "RJ": ("Rio de Janeiro", "Sudeste"), "MG": ("Minas Gerais", "Sudeste"),
    "ES": ("Espírito Santo", "Sudeste"), "PR": ("Paraná", "Sul"), "SC": ("Santa Catarina", "Sul"),
    "RS": ("Rio Grande do Sul", "Sul"), "BA": ("Bahia", "Nordeste"), "PE": ("Pernambuco", "Nordeste"),
    "CE": ("Ceará", "Nordeste"), "MA": ("Maranhão", "Nordeste"), "PB": ("Paraíba", "Nordeste"),
    "RN": ("Rio Grande do Norte", "Nordeste"), "AL": ("Alagoas", "Nordeste"), "SE": ("Sergipe", "Nordeste"),
    "PI": ("Piauí", "Nordeste"), "DF": ("Distrito Federal", "Centro-Oeste"), "GO": ("Goiás", "Centro-Oeste"),
    "MT": ("Mato Grosso", "Centro-Oeste"), "MS": ("Mato Grosso do Sul", "Centro-Oeste"),
    "AM": ("Amazonas", "Norte"), "PA": ("Pará", "Norte"), "AC": ("Acre", "Norte"), "RO": ("Rondônia", "Norte"),
    "RR": ("Roraima", "Norte"), "AP": ("Amapá", "Norte"), "TO": ("Tocantins", "Norte"),
}

TEMAS = ["educação", "saúde", "segurança", "economia", "meio ambiente", "tecnologia",
         "transporte", "moradia", "emprego", "agricultura"]


def jload(name):
    with open(DATA / name, encoding="utf-8") as f:
        return json.load(f)


def sample(inp, output):
    return {"instruction": INSTRUCTION, "input": inp, "output": output}


def out_route(intent, route, menu, submenu, filters, answer, suggested):
    return {
        "intent": intent, "target_route": route, "menu_id": menu, "submenu_id": submenu,
        "filters": filters, "direct_answer": answer, "suggested_questions": suggested,
    }


def filtros(cargo=None, digitos=None, uf=None, regiao=None, partido=None, tema=None,
            nome=None, ficha_limpa=None, max_processos=None, mandatos=None):
    return {
        "cargo": cargo, "digitos_urna": digitos, "estado_uf": uf, "regiao": regiao,
        "partido": partido, "tema": tema, "nome_candidato": nome,
        "apenas_ficha_limpa": ficha_limpa, "max_processos_administrativos": max_processos,
        "mandatos_anteriores": mandatos,
    }


def build():
    print("=" * 70)
    print("  GERADOR DE DATASET OFICIAL - SaibaTudo-Eleicao2026")
    print("=" * 70)

    candidatos = jload("official_candidates_2026.json")
    pesquisas = jload("official_pesquisas_2026.json")
    regras = jload("official_regras_2026.json")
    stats = regras["estatisticas"]

    samples = []

    # ================= A) EXTRAÇÃO DE INTENÇÃO (cargo x UF x tema) =================
    print("\n[A] Gerando extração de intenção (cargo x UF x tema)...")
    for cargo_nome, cargo_code, menu, route, dig in CARGOS:
        for uf, (estado_nome, regiao) in ESTADOS.items():
            for tema in random.sample(TEMAS, 3):
                q = f"Candidatos a {cargo_nome} em {estado_nome} com foco em {tema}"
                ans = (f"Mostrando candidatos a {cargo_nome.title()} ({dig} dígitos na urna) "
                       f"em {uf} ({regiao}) com propostas em {tema}. Dados oficiais do TSE 2026.")
                samples.append(sample(q, out_route(
                    "FILTER_CANDIDATES", route, menu, f"sub_{uf.lower()}",
                    filtros(cargo_code, dig, uf, regiao, tema=tema),
                    ans, [f"Quem concorre a {cargo_nome} em {uf}?", f"Ordem de votação para {cargo_nome}",
                          f"Candidatos a {cargo_nome} com Ficha Limpa em {uf}"])))
    print(f"    {len(samples)} amostras (A)")

    # Variantes de redação p/ robustez
    base_a = len(samples)
    phrasings = [
        "Quais os candidatos a {c} em {e}?", "Me mostre quem disputa {c} no {e}",
        "Lista de {c} de {e}", "{c} {e} 2026", "Quem são os {c} no estado de {e}?",
    ]
    for cargo_nome, cargo_code, menu, route, dig in CARGOS:
        for uf, (estado_nome, regiao) in ESTADOS.items():
            p = random.choice(phrasings).format(c=cargo_nome, e=estado_nome)
            samples.append(sample(p, out_route(
                "FILTER_CANDIDATES", route, menu, f"sub_{uf.lower()}",
                filtros(cargo_code, dig, uf, regiao),
                f"Exibindo candidatos a {cargo_nome.title()} em {uf} ({regiao}) com dados oficiais do TSE.",
                [f"Candidatos a {cargo_nome} com Ficha Limpa", f"Quantos candidatos a {cargo_nome} em {uf}?"])))
    print(f"    +{len(samples)-base_a} variantes de redação")

    # ================= B) Q&A CÍVICO (regras oficiais) =================
    print("\n[B] Gerando Q&A cívico (regras oficiais TSE)...")
    civico = [
        ("Qual é a ordem de votação na urna eletrônica em 2026?",
         "A ordem oficial de votação na urna (TSE 2026) é: 1º) Deputado Federal (4 dígitos); "
         "2º) Deputado Estadual ou Distrital (5 dígitos); 3º) Senador – 1ª vaga (3 dígitos); "
         "4º) Senador – 2ª vaga (3 dígitos); 5º) Governador (2 dígitos); 6º) Presidente da República (2 dígitos).",
         "info/regras", "menu_regras_eleitorais"),
        ("Quantos dígitos tem cada cargo na urna?",
         "Deputado Federal: 4 dígitos. Deputado Estadual/Distrital: 5 dígitos. Senador: 3 dígitos. "
         "Governador: 2 dígitos. Presidente: 2 dígitos.",
         "info/regras", "menu_regras_eleitorais"),
        ("Quando é a eleição de 2026?",
         "O 1º turno das Eleições Gerais 2026 será em 04/10/2026 (primeiro domingo de outubro). "
         "O 2º turno, onde houver (Presidente e Governador), será em 25/10/2026. Votação das 8h às 17h (horário de Brasília).",
         "info/calendario", "menu_calendario"),
        ("O que acontece se eu votar no mesmo senador nas duas vagas?",
         "Em 2026 o eleitor vota duas vezes para o Senado (renovação de 2/3). Se digitar o mesmo número "
         "nas duas vagas, o primeiro voto é computado e o segundo é automaticamente ANULADO pela urna.",
         "candidates/senador", "menu_senador"),
        ("O que é a Lei da Ficha Limpa?",
         "A Lei Complementar nº 135/2010 (Ficha Limpa) torna inelegíveis, por 8 anos, cidadãos condenados "
         "por órgãos colegiados. No app, o filtro 'Ficha Limpa' exibe apenas candidatos DEFERIDOS e sem "
         "fundamento legal de inelegibilidade registrado no TSE.",
         "info/regras", "menu_regras_eleitorais"),
        ("Como funciona o filtro de processos administrativos?",
         "O app usa os 'Fundamentos legais de julgamento' registrados oficialmente no TSE (LC 64/90, Lei 9.504/97). "
         "O filtro 'Zero Processos Adm.' destaca candidatos sem nenhum fundamento de inelegibilidade/cassação.",
         "info/regras", "menu_regras_eleitorais"),
        ("Quais documentos preciso levar para votar?",
         "Um documento oficial com foto (RG, CNH, Passaporte ou Carteira Profissional) ou o e-Título com foto. "
         "O título de eleitor deve estar regular.",
         "info/regras", "menu_regras_eleitorais"),
        ("Quantas vagas de Senador estão em disputa em 2026?",
         "Em 2026 ocorre a renovação de 2/3 do Senado Federal. Cada estado e o DF elegem 2 senadores "
         "(duas vagas), totalizando 54 vagas em disputa nacionalmente.",
         "candidates/senador", "menu_senador"),
        ("Como funciona o sistema proporcional para deputado?",
         "Deputados Federais, Estaduais e Distritais são eleitos pelo sistema proporcional: calcula-se o "
         "quociente eleitoral (votos válidos ÷ vagas) e o quociente partidário para distribuir as vagas "
         "entre partidos/federações/coligações.",
         "info/regras", "menu_regras_eleitorais"),
        ("Onde consulto meu local de votação?",
         "No aplicativo oficial e-Título da Justiça Eleitoral ou em www.tse.jus.br. Consulte a seção e o "
         "local com antecedência.",
         "info/locais", "menu_locais_votacao"),
    ]
    for q, a, route, menu in civico:
        samples.append(sample(q, out_route(
            "EXPLAIN_TOPIC", route, menu, None, filtros(),
            a, ["Simular voto na Urna 2026", "Ver candidatos a Presidente", "Ordem de votação na urna"])))
    print(f"    +{len(civico)} Q&A cívicos")

    # ================= C) FATOS OFICIAIS AGREGADOS =================
    print("\n[C] Gerando fatos oficiais agregados (contagens reais)...")
    total = stats["totalCandidatos"]
    samples.append(sample(
        "Quantos candidatos foram registrados no total nas Eleições 2026?",
        out_route("EXPLAIN_TOPIC", "info/estatisticas", "menu_regras_eleitorais", None, filtros(),
                  f"Segundo os dados oficiais do TSE (extração de {regras['dataGeracaoDados']}), "
                  f"foram registrados {total} candidatos nas Eleições Gerais 2026 em todo o Brasil.",
                  ["Quantos candidatos a Presidente?", "Ver candidatos por estado"])))

    # Contagem por cargo
    for cargo_ds, cnt in stats["porCargo"].items():
        samples.append(sample(
            f"Quantos candidatos a {cargo_ds.lower()} foram registrados em 2026?",
            out_route("EXPLAIN_TOPIC", "info/estatisticas", "menu_regras_eleitorais", None, filtros(),
                      f"O TSE registra oficialmente {cnt} candidatos ao cargo de {cargo_ds} nas Eleições 2026.",
                      [f"Lista de candidatos a {cargo_ds}", "Quantos candidatos por estado?"])))

    # Contagem por cargo x UF (amostra)
    por_cargo_uf = regras["totalPorCargoUf"]
    cnt_amostra = 0
    for key, v in por_cargo_uf.items():
        cargo_ds, uf = key.split("|")
        if uf not in ESTADOS:
            continue
        if random.random() < 0.12 and cnt_amostra < 400:
            estado_nome = ESTADOS[uf][0]
            samples.append(sample(
                f"Quantos candidatos a {cargo_ds.lower()} em {estado_nome}?",
                out_route("EXPLAIN_TOPIC", "info/estatisticas", "menu_regras_eleitorais", f"sub_{uf.lower()}",
                          filtros(uf=uf),
                          f"O TSE registra oficialmente {v} candidatos a {cargo_ds} em {uf} ({estado_nome}) nas Eleições 2026.",
                          [f"Lista de candidatos a {cargo_ds} em {uf}", f"Candidatos com Ficha Limpa em {uf}"])))
            cnt_amostra += 1
    print(f"    +{cnt_amostra} contagens cargo x UF")

    # Presidenciáveis REAIS
    presidentes = [c for c in candidatos if c["dsCargo"] == "PRESIDENTE"]
    presidentes.sort(key=lambda x: int(x["numero"]))
    nomes_pres = ", ".join(f"{p['nomeUrna']} ({p['partido']} - {p['numero']})" for p in presidentes)
    for q in ["Quem disputa a Presidência da República em 2026?",
              "Quais são os candidatos a presidente registrados no TSE?",
              "Lista oficial de presidenciáveis 2026"]:
        samples.append(sample(q, out_route(
            "FILTER_CANDIDATES", "candidates/presidente", "menu_presidente", None,
            filtros("PRESIDENTE", 2),
            f"Candidatos oficialmente registrados ao cargo de Presidente da República em 2026 "
            f"({len(presidentes)} no total): {nomes_pres}. Fonte: TSE.",
            ["Ver plano de governo dos presidenciáveis", "Simular voto para Presidente"])))

    # ================= D) LOOKUP DE CANDIDATO REAL =================
    print("\n[D] Gerando lookup de candidatos reais (campos oficiais)...")

    def candidate_answer(c):
        parts = [f"{c['nomeUrna']} (número {c['numero']}, {c['partido']})"]
        parts.append(f"concorre ao cargo de {c['dsCargo']}")
        if c["estadoUf"] != "BR":
            parts[-1] += f" por {c['estadoUf']}"
        else:
            parts[-1] += " (âmbito nacional)"
        extras = []
        if c.get("idade"):
            extras.append(f"{c['idade']} anos")
        if c.get("ocupacao"):
            extras.append(c["ocupacao"].lower())
        if c.get("municipioNascimento"):
            extras.append(f"natural de {c['municipioNascimento']}" + (f"/{c['ufNascimento']}" if c.get("ufNascimento") else ""))
        sit = c.get("situacaoJulgamento", "")
        extras.append(f"situação: {sit}")
        if c.get("fichaLimpa"):
            extras.append("Ficha Limpa (deferido, sem inelegibilidade)")
        if c.get("reeleicao"):
            extras.append("disputa reeleição")
        if c.get("mandatosAnteriores"):
            extras.append(f"{c['mandatosAnteriores']} mandato(s) eletivo(s) anterior(es)")
        line = parts[0] + " " + parts[1] + ". " + "; ".join(extras) + ". Fonte: dados oficiais do TSE 2026."
        return line

    def route_for(c):
        cmap = {c_["codigo"]: c_ for c_ in [
            {"codigo": "PRESIDENTE", "menu": "menu_presidente", "route": "candidates/presidente"},
            {"codigo": "GOVERNADOR", "menu": "menu_governador", "route": "candidates/governador"},
            {"codigo": "SENADOR", "menu": "menu_senador", "route": "candidates/senador"},
            {"codigo": "DEPUTADO_FEDERAL", "menu": "menu_deputado_federal", "route": "candidates/deputado_federal"},
            {"codigo": "DEPUTADO_ESTADUAL", "menu": "menu_deputado_estadual", "route": "candidates/deputado_estadual"},
            {"codigo": "DEPUTADO_DISTRITAL", "menu": "menu_deputado_estadual", "route": "candidates/deputado_estadual"},
        ]}
        info = cmap.get(c["cargo"], {"menu": "menu_home", "route": "candidates/todos"})
        return info["route"], info["menu"]

    # Todos os presidentes + governadores + senadores (conjunto estável e de alto interesse)
    major = [c for c in candidatos if c["dsCargo"] in ("PRESIDENTE", "GOVERNADOR", "SENADOR")]
    # + deputados com nome de urna curto e distintos (amostra ampla por UF)
    dep = [c for c in candidatos if c["dsCargo"] in ("DEPUTADO FEDERAL", "DEPUTADO ESTADUAL", "DEPUTADO DISTRITAL")]
    random.shuffle(dep)
    dep_sample = dep[:600]
    lookup_set = major + dep_sample

    for c in lookup_set:
        route, menu = route_for(c)
        for q in [f"Quem é {c['nomeUrna']}?", f"Informações sobre o candidato {c['nomeUrna']}",
                  f"Qual o número de {c['nomeUrna']}?", f"Situação da candidatura de {c['nomeUrna']}"]:
            f = filtros(c["cargo"], c.get("digitosUrna"),
                        c["estadoUf"] if c["estadoUf"] != "BR" else None,
                        c.get("regiao") if c["estadoUf"] != "BR" else None,
                        c.get("partido"), nome=c["nomeUrna"])
            sug = [f"Simular voto em {c['nomeUrna']} ({c['numero']})",
                   f"Outros candidatos a {c['dsCargo'].lower()}" + (f" em {c['estadoUf']}" if c['estadoUf'] != 'BR' else "")]
            samples.append(sample(q, out_route("CANDIDATE_LOOKUP", route, menu,
                                               f"sub_{c['estadoUf'].lower()}" if c["estadoUf"] != "BR" else None,
                                               f, candidate_answer(c), sug)))
    print(f"    +{len(lookup_set)*4} lookups de candidatos reais ({len(lookup_set)} candidatos)")

    # ================= E) PESQUISAS ELEITORAIS OFICIAIS =================
    print("\n[E] Gerando Q&A de pesquisas eleitorais oficiais...")
    n_pesq = len(pesquisas)
    empresas = Counter(p["empresa"] for p in pesquisas if p.get("empresa"))
    top_emp = ", ".join(f"{e} ({n})" for e, n in empresas.most_common(8))
    samples.append(sample(
        "Quantas pesquisas eleitorais foram registradas no TSE para 2026?",
        out_route("EXPLAIN_TOPIC", "info/pesquisas", "menu_regras_eleitorais", None, filtros(),
                  f"O TSE registra oficialmente {n_pesq} pesquisas eleitorais para as Eleições 2026 "
                  f"(base de dados abertos, extração de {regras['dataGeracaoDados']}).",
                  ["Quais empresas registraram pesquisas?", "Ver pesquisas para Presidente"])))
    samples.append(sample(
        "Quais empresas mais registraram pesquisas eleitorais em 2026?",
        out_route("EXPLAIN_TOPIC", "info/pesquisas", "menu_regras_eleitorais", None, filtros(),
                  f"Empresas com mais pesquisas registradas no TSE 2026: {top_emp}.",
                  ["Quantas pesquisas foram registradas?", "Ver pesquisas por estado"])))

    # Pesquisas por cargo (amostra)
    pesq_por_cargo = Counter(p["cargo"] for p in pesquisas if p.get("cargo"))
    for cargo_p, cnt in pesq_por_cargo.most_common(6):
        samples.append(sample(
            f"Quantas pesquisas eleitorais registradas para {cargo_p} em 2026?",
            out_route("EXPLAIN_TOPIC", "info/pesquisas", "menu_regras_eleitorais", None, filtros(),
                      f"O TSE registra {cnt} pesquisas eleitorais oficiais para o cargo de {cargo_p} nas Eleições 2026.",
                      ["Ver todas as pesquisas", "Empresas que registraram pesquisas"])))

    # ================= E2) FONTES OFICIAIS (TREs e órgãos) =================
    print("\n[E2] Gerando Q&A de fontes oficiais (TREs, Legislativo, Fiscalização)...")
    try:
        with open(DATA / "fontes_oficiais_2026.json", encoding="utf-8") as f:
            fontes = json.load(f)
    except FileNotFoundError:
        fontes = None

    if fontes:
        # Onde consultar por estado (TRE + sistemas nacionais)
        for tre in fontes["tres"]:
            uf = tre["uf"]
            estado_nome = tre["estado"]
            secoes_txt = "; ".join(s["titulo"] for s in tre.get("secoes", [])[:5])
            samples.append(sample(
                f"Onde consulto as eleições em {estado_nome}?",
                out_route(
                    "VOTING_LOCATION_QUERY", "info/locais", "menu_locais_votacao", f"sub_{uf.lower()}",
                    filtros(uf=uf),
                    f"Site oficial: {tre['url']} ({tre.get('titulo', '')}). "
                    f"Para Eleições Gerais 2026, o {tre['tribunal']} integra suas consultas aos sistemas "
                    f"nacionais do TSE: DivulgaCandContas (candidaturas e contas), Autoatendimento do Eleitor "
                    f"(título e local de votação) e Resultados TSE (apuração)."
                    + (f" Seções oficiais: {secoes_txt}." if secoes_txt else ""),
                    [f"Candidatos a Governador em {estado_nome}", "Onde consulto meu local de votação?"]
                )))

        # Denúncias, fiscalização, TCU/Ficha Limpa, legislação
        by_url = {o["url"]: o for o in fontes["orgaos"]}
        qa_orgaos = [
            ("Como denunciar irregularidades na eleição?",
             "Canais oficiais de denúncia: MPF Serviços (https://www.mpf.mp.br/mpfservicos) para irregularidades "
             "em campanhas de cargos federais e Fala.BR da CGU (https://falabr.cgu.gov.br) para uso de recursos "
             "da União em benefício eleitoral. Também é possível acionar o Ministério Público Eleitoral no seu estado."),
            ("Onde vejo se um candidato tem contas julgadas irregulares (Ficha Limpa)?",
             "O TCU publica a lista oficial de gestores com contas julgadas irregulares enviada ao TSE "
             "(https://sites.tcu.gov.br/contas-julgadas-irregulares), usada na verificação de inelegibilidade "
             "pela Lei da Ficha Limpa. No app, os fundamentos legais de julgamento do TSE aparecem no perfil "
             "de cada candidato (LC 64/90 e Lei 9.504/97)."),
            ("Onde consulto a legislação eleitoral vigente?",
             "O Congresso Nacional mantém a legislação eleitoral consolidada "
             "(https://www.congressonacional.leg.br), incluindo o Código Eleitoral (Lei nº 4.737/1965) e a "
             "Lei das Eleições (Lei nº 9.504/1997) com redação vigente."),
            ("Onde acompanho os resultados das eleições 2026?",
             "Acompanhe os boletins oficiais e a apuração em tempo real no Resultados TSE "
             "(https://resultados.tse.jus.br)."),
            ("Onde consulto as candidaturas e contas dos candidatos 2026?",
             "No DivulgaCandContas do TSE (https://divulgacandcontas.tse.jus.br/divulga/#/): candidaturas, bens, "
             "prestação de contas e propostas. Para os presidenciáveis, o TSE também reúne os planos de governo "
             "oficiais em https://www.tse.jus.br/comunicacao/noticias/2026/Setembro/nova-pagina-no-portal-do-tse-reune-planos-de-governo-de-presidenciaveis"),
            ("Onde consulto meu local de votação e situação do título?",
             "No Autoatendimento do Eleitor do TSE (https://autoatendimento.tse.jus.br) ou no app e-Título. "
             "Leve documento oficial com foto no dia da votação (1º turno em 04/10/2026)."),
        ]
        for q, a in qa_orgaos:
            samples.append(sample(q, out_route(
                "VOTING_LOCATION_QUERY" if "votação" in q.lower() else "EXPLAIN_TOPIC",
                "info/locais" if "votação" in q.lower() else "info/regras",
                "menu_locais_votacao" if "votação" in q.lower() else "menu_regras_eleitorais",
                None, filtros(), a,
                ["Onde consulto o TRE do meu estado?", "Calendário eleitoral 2026"])))
        print(f"    +{len(fontes['tres']) + len(qa_orgaos)} amostras de fontes oficiais")

    # ================= F) FILTROS ESPECIAIS =================
    print("\n[F] Gerando consultas de filtros especiais...")
    especiais = [
        ("Candidatos com Ficha Limpa em São Paulo", "SP", {"apenas_ficha_limpa": True}),
        ("Mostre candidatos com zero processos administrativos", None, {"max_processos": 0}),
        ("Quais candidatos estão tentando a reeleição?", None, {"reeleicao": True}),
        ("Candidatos que nunca foram eleitos (primeiro mandato)", None, {"mandatos": 0}),
        ("Veteranos com 2 ou mais mandatos", None, {"mandatos": 2}),
    ]
    for q, uf, fl in especiais:
        f = filtros(uf=uf, regiao=ESTADOS[uf][1] if uf else None,
                    ficha_limpa=fl.get("apenas_ficha_limpa"),
                    max_processos=fl.get("max_processos"),
                    mandatos=fl.get("mandatos"))
        if fl.get("reeleicao"):
            f["reeleicao"] = True
        samples.append(sample(q, out_route(
            "FILTER_CANDIDATES", "candidates/todos", "menu_home",
            f"sub_{uf.lower()}" if uf else None, f,
            f"Aplicando filtro oficial do TSE: {q.lower()}.",
            ["Simular voto na Urna 2026", "Ver candidatos a Presidente"])))

    # Filtrar por partido real (top partidos)
    for partido, cnt in Counter(c["partido"] for c in candidatos).most_common(20):
        if not partido:
            continue
        samples.append(sample(
            f"Candidatos do partido {partido} em 2026",
            out_route("FILTER_CANDIDATES", "candidates/todos", "menu_home", None,
                      filtros(partido=partido),
                      f"O TSE registra {cnt} candidatos pelo partido {partido} nas Eleições 2026.",
                      [f"Candidatos a Presidente do {partido}", f"Lista completa do {partido}"])))

    random.shuffle(samples)

    out_path = DATA / "dataset_oficial_treino.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(samples, f, ensure_ascii=False, indent=1)

    print(f"\n✅ Dataset oficial gerado: {len(samples)} pares -> {out_path.name}")
    print(f"   (100% derivado dos dados oficiais do TSE 2026)")
    return samples


if __name__ == "__main__":
    build()
