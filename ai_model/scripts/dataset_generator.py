"""
Script de geração e ampliação sintética do dataset de intenções, menus, submenus, filtros
e esclarecimento cívico eleitoral para o modelo SaibaTudo-Eleicao2026.
"""

import json
import itertools
from pathlib import Path

CARGOS = [
    ("presidente", "PRESIDENTE", "menu_presidente", "candidates/presidente"),
    ("governador", "GOVERNADOR", "menu_governador", "candidates/governador"),
    ("senador", "SENADOR", "menu_senador", "candidates/senador"),
    ("deputado federal", "DEPUTADO_FEDERAL", "menu_deputado_federal", "candidates/deputado_federal"),
    ("deputado estadual", "DEPUTADO_ESTADUAL", "menu_deputado_estadual", "candidates/deputado_estadual")
]

ESTADOS = [
    ("São Paulo", "SP"), ("Rio de Janeiro", "RJ"), ("Minas Gerais", "MG"),
    ("Bahia", "BA"), ("Paraná", "PR"), ("Rio Grande do Sul", "RS"),
    ("Pernambuco", "PE"), ("Ceará", "CE"), ("Distrito Federal", "DF"),
    ("Santa Catarina", "SC"), ("Goiás", "GO"), ("Pará", "PA")
]

TEMAS = [
    ("educação", "educacao"), ("saúde", "saude"), ("segurança", "seguranca"),
    ("economia", "economia"), ("meio ambiente", "meio_ambiente"), ("tecnologia", "tecnologia"),
    ("infraestrutura", "infraestrutura"), ("agricultura", "agricultura")
]

PARTIDOS = ["PT", "PL", "PSD", "MDB", "UNIÃO", "PP", "REPUBLICANOS", "PSB", "PSOL", "NOVO"]

CIVIC_FAQ = [
    {
        "input": "Quando é o primeiro e segundo turno das eleições de 2026?",
        "target_route": "info/calendario",
        "menu_id": "menu_calendario",
        "answer": "O primeiro turno das Eleições Gerais de 2026 acontecerá no primeiro domingo de outubro de 2026 (04/10/2026). O segundo turno, nos casos de Presidente e Governador onde nenhum candidato obtiver a maioria absoluta dos votos válidos, será realizado no último domingo de outubro (25/10/2026).",
        "suggested": ["Até quando posso transferir o título?", "Quais cargos terão segundo turno?"]
    },
    {
        "input": "Como funciona a eleição de dois senadores em 2026?",
        "target_route": "candidates/senador",
        "menu_id": "menu_senador",
        "answer": "O mandato de um senador é de 8 anos, e a renovação do Senado Federal é alternada: a cada 4 anos renova-se 1/3 e, na eleição seguinte, 2/3. Em 2026, ocorrerá a renovação de dois terços (2/3) das cadeiras, de modo que cada eleitor deverá votar em dois candidatos diferentes para o Senado no seu estado.",
        "suggested": ["Posso votar duas vezes no mesmo senador?", "Quem são os candidatos ao Senado no meu estado?"]
    },
    {
        "input": "Como justifico meu voto se eu estiver fora do meu domicílio eleitoral?",
        "target_route": "info/locais",
        "menu_id": "menu_locais_votacao",
        "answer": "No dia da eleição, você pode justificar o voto através da funcionalidade de geolocalização do aplicativo oficial e-Título ou em qualquer mesa receptora de justificativa. Após a eleição, a justificativa pode ser feita pelo e-Título ou pelo Sistema Justifica do TSE em até 60 dias após cada turno.",
        "suggested": ["Qual o valor da multa se não justificar?", "Como baixar o e-Título?"]
    },
    {
        "input": "Quais documentos são aceitos para votar na urna eletrônica?",
        "target_route": "info/regras",
        "menu_id": "menu_regras_eleitorais",
        "answer": "Para votar, você deve apresentar um documento oficial com foto (RG, CNH, Passaporte, Carteira de Trabalho física ou Certificado de Reservista) ou o e-Título com foto cadastrada (disponível para quem já coletou a biometria). Não é obrigatório levar o título de eleitor de papel se você souber sua seção e zona eleitoral.",
        "suggested": ["Posso votar só com o título de papel?", "Posso levar cola de papel para a urna?"]
    },
    {
        "input": "O que é o quociente eleitoral e como deputados são eleitos?",
        "target_route": "info/regras",
        "menu_id": "menu_regras_eleitorais",
        "answer": "Para os cargos de deputado federal e deputado estadual, adota-se o sistema proporcional. O quociente eleitoral é calculado dividindo-se o número de votos válidos pelo número de vagas a preencher. Os partidos preenchem as vagas conforme o quociente partidário, desde que o candidato atinja a votação nominal mínima exigida pela legislação eleitoral.",
        "suggested": ["O que são sobras eleitorais?", "Quantos deputados federais tem o meu estado?"]
    },
    {
        "input": "O voto é obrigatório para quem tem 16 ou 70 anos?",
        "target_route": "info/regras",
        "menu_id": "menu_regras_eleitorais",
        "answer": "O voto no Brasil é facultativo para jovens de 16 e 17 anos, para pessoas com mais de 70 anos e para pessoas analfabetas. Para os cidadãos alfabetizados entre 18 e 70 anos incompletos, o alistamento e o voto são obrigatórios.",
        "suggested": ["Como tirar o primeiro título de eleitor?", "Qual o prazo final para regularização do título?"]
    }
]

def generate_dataset(output_path: Path):
    samples = []
    
    # 1. Filtros por Cargo, Estado e Tema
    for (cargo_nome, cargo_code, menu_id, route), (estado_nome, uf), tema in itertools.product(CARGOS, ESTADOS, TEMAS):
        if cargo_code == "PRESIDENTE":
            query = f"Quais os candidatos a presidente com propostas para {tema[0]}?"
            sample = {
                "instruction": "Você é o assistente inteligente do SaibaTudo-Eleicao2026. Identifique menus, submenus, filtros e intenções.",
                "input": query,
                "output": {
                    "intent": "FILTER_CANDIDATES",
                    "target_route": route,
                    "menu_id": menu_id,
                    "submenu_id": None,
                    "filters": {
                        "cargo": cargo_code,
                        "estado_uf": None,
                        "partido": None,
                        "tema": tema[1],
                        "nome_candidato": None
                    },
                    "direct_answer": f"Filtrando candidatos à Presidência da República com propostas em {tema[0]}.",
                    "suggested_questions": ["Ver todos os presidenciáveis", "Comparar planos de governo"]
                }
            }
            samples.append(sample)
        else:
            query = f"Quero ver candidatos a {cargo_nome} em {estado_nome} que defendem {tema[0]}"
            sample = {
                "instruction": "Você é o assistente inteligente do SaibaTudo-Eleicao2026. Identifique menus, submenus, filtros e intenções.",
                "input": query,
                "output": {
                    "intent": "FILTER_CANDIDATES",
                    "target_route": route,
                    "menu_id": menu_id,
                    "submenu_id": f"sub_{uf.lower()}",
                    "filters": {
                        "cargo": cargo_code,
                        "estado_uf": uf,
                        "partido": None,
                        "tema": tema[1],
                        "nome_candidato": None
                    },
                    "direct_answer": f"Mostrando candidatos a {cargo_nome} no estado {uf} focados em {tema[0]}.",
                    "suggested_questions": [f"Quem lidera as pesquisas para {cargo_nome} em {uf}?", f"Ver partidos com candidatos a {cargo_nome} em {uf}"]
                }
            }
            samples.append(sample)

    # 2. Filtros por Partido e Cargo
    for (cargo_nome, cargo_code, menu_id, route), partido in itertools.product(CARGOS, PARTIDOS):
        query = f"Quem são os candidatos a {cargo_nome} do {partido}?"
        sample = {
            "instruction": "Você é o assistente inteligente do SaibaTudo-Eleicao2026. Identifique menus, submenus, filtros e intenções.",
            "input": query,
            "output": {
                "intent": "FILTER_CANDIDATES",
                "target_route": route,
                "menu_id": menu_id,
                "submenu_id": None,
                "filters": {
                    "cargo": cargo_code,
                    "estado_uf": None,
                    "partido": partido,
                    "tema": None,
                    "nome_candidato": None
                },
                "direct_answer": f"Exibindo os candidatos a {cargo_nome} filiados ao partido {partido}.",
                "suggested_questions": [f"Ver coligações do {partido}", f"Propostas do {partido} para 2026"]
            }
        }
        samples.append(sample)

    # 3. Perguntas Cívicas Oficiais (TSE FAQ e Regras)
    for faq in CIVIC_FAQ:
        sample = {
            "instruction": "Você é o assistente inteligente do SaibaTudo-Eleicao2026. Identifique menus, submenus, filtros e intenções.",
            "input": faq["input"],
            "output": {
                "intent": "EXPLAIN_TOPIC",
                "target_route": faq["target_route"],
                "menu_id": faq["menu_id"],
                "submenu_id": None,
                "filters": {
                    "cargo": None,
                    "estado_uf": None,
                    "partido": None,
                    "tema": None,
                    "nome_candidato": None
                },
                "direct_answer": faq["answer"],
                "suggested_questions": faq["suggested"]
            }
        }
        samples.append(sample)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(samples, f, ensure_ascii=False, indent=2)

    print(f"Dataset gerado com sucesso! Total de {len(samples)} pares de instrução e raciocínio salvos em {output_path}")

if __name__ == "__main__":
    out_file = Path(__file__).resolve().parent.parent / "data" / "generated_training_dataset.json"
    generate_dataset(out_file)
