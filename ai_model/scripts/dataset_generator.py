"""
Script de geração e ampliação sintética do dataset de intenções, menus, submenus e filtros
para o modelo SaibaTudo-Eleicao2026.
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
    ("Pernambuco", "PE"), ("Ceará", "CE"), ("Distrito Federal", "DF")
]

TEMAS = [
    ("educação", "educacao"), ("saúde", "saude"), ("segurança", "seguranca"),
    ("economia", "economia"), ("meio ambiente", "meio_ambiente"), ("tecnologia", "tecnologia")
]

PARTIDOS = ["PT", "PL", "PSD", "MDB", "UNIÃO", "PP", "REPUBLICANOS", "PSB", "PSOL", "NOVO"]

TEMPLATE_QUERIES = [
    "Quero ver os candidatos a {cargo_nome} em {estado_nome}",
    "Quem são os candidatos a {cargo_nome} do {partido}?",
    "Filtre os candidatos a {cargo_nome} em {estado_nome} com foco em {tema_nome}",
    "Mostre a lista de {cargo_nome} pelo estado {uf}",
    "Propostas de {cargo_nome} em {estado_nome} para {tema_nome}"
]

def generate_dataset(output_path: Path):
    samples = []
    
    # 1. Combinações estruturadas
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
                    "direct_answer": f"Filtrando candidatos à Presidência com propostas em {tema[0]}.",
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

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(samples, f, ensure_ascii=False, indent=2)

    print(f"Dataset gerado com sucesso! Total de {len(samples)} exemplos salvos em {output_path}")

if __name__ == "__main__":
    out_file = Path(__file__).resolve().parent.parent / "data" / "generated_training_dataset.json"
    generate_dataset(out_file)
