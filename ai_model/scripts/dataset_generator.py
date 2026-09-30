"""
Script de geração e ampliação sintética do dataset de intenções, menus, submenus, filtros,
ordem de votação e regras do TSE para o modelo SaibaTudo-Eleicao2026.
"""

import json
import itertools
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

CARGOS = [
    ("presidente", "PRESIDENTE", 2, "menu_presidente", "candidates/presidente"),
    ("governador", "GOVERNADOR", 2, "menu_governador", "candidates/governador"),
    ("senador 1ª vaga", "SENADOR_1", 3, "menu_senador", "candidates/senador"),
    ("senador 2ª vaga", "SENADOR_2", 3, "menu_senador", "candidates/senador"),
    ("deputado federal", "DEPUTADO_FEDERAL", 4, "menu_deputado_federal", "candidates/deputado_federal"),
    ("deputado estadual", "DEPUTADO_ESTADUAL", 5, "menu_deputado_estadual", "candidates/deputado_estadual")
]

ESTADOS = [
    ("São Paulo", "SP", "Sudeste"), ("Rio de Janeiro", "RJ", "Sudeste"), ("Minas Gerais", "MG", "Sudeste"),
    ("Bahia", "BA", "Nordeste"), ("Paraná", "PR", "Sul"), ("Rio Grande do Sul", "RS", "Sul"),
    ("Pernambuco", "PE", "Nordeste"), ("Ceará", "CE", "Nordeste"), ("Distrito Federal", "DF", "Centro-Oeste"),
    ("Santa Catarina", "SC", "Sul"), ("Goiás", "GO", "Centro-Oeste"), ("Pará", "PA", "Norte"),
    ("Amazonas", "AM", "Norte"), ("Espírito Santo", "ES", "Sudeste"), ("Mato Grosso", "MT", "Centro-Oeste")
]

TEMAS = [
    ("educação", "educacao"), ("saúde", "saude"), ("segurança", "seguranca"),
    ("economia", "economia"), ("meio ambiente", "meio_ambiente"), ("tecnologia", "tecnologia")
]

PARTIDOS = ["PT", "PL", "PSD", "MDB", "UNIÃO", "PP", "REPUBLICANOS", "PSB", "PSOL", "NOVO", "PODEMOS"]

def load_tse_rules():
    tse_path = DATA_DIR / "tse_regras_cargos_2026.json"
    if tse_path.exists():
        with open(tse_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def generate_tse_specific_qa():
    return [
        {
            "input": "Qual é a ordem de votação na urna eletrônica em 2026 e quantos dígitos tem cada cargo?",
            "target_route": "info/regras",
            "menu_id": "menu_regras_eleitorais",
            "filters": {},
            "answer": "Nas Eleições Gerais de 2026, a ordem oficial de votação na urna do TSE é: 1º) Deputado Federal (4 dígitos); 2º) Deputado Estadual ou Distrital (5 dígitos); 3º) Senador – 1ª vaga (3 dígitos); 4º) Senador – 2ª vaga (3 dígitos); 5º) Governador (2 dígitos); 6º) Presidente da República (2 dígitos).",
            "suggested": ["Posso votar no mesmo senador duas vezes?", "Como levar a colinha para a urna?"]
        },
        {
            "input": "Quantos dígitos eu digito na urna para Deputado Federal?",
            "target_route": "candidates/deputado_federal",
            "menu_id": "menu_deputado_federal",
            "filters": {"cargo": "DEPUTADO_FEDERAL"},
            "answer": "O cargo de Deputado Federal possui 4 dígitos na urna eletrônica. Os 2 primeiros números identificam o partido e os 2 últimos o candidato.",
            "suggested": ["Como funciona o quociente eleitoral?", "Ver deputados federais por estado"]
        },
        {
            "input": "Quantos dígitos tem o cargo de Deputado Estadual ou Distrital?",
            "target_route": "candidates/deputado_estadual",
            "menu_id": "menu_deputado_estadual",
            "filters": {"cargo": "DEPUTADO_ESTADUAL"},
            "answer": "O cargo de Deputado Estadual (ou Deputado Distrital no Distrito Federal) possui 5 dígitos na urna. Os 2 primeiros indicam a legenda partidária e os 3 seguintes o candidato.",
            "suggested": ["Quantas vagas de deputado estadual tem meu estado?", "Ver candidatos a deputado estadual"]
        },
        {
            "input": "Quantos dígitos têm Senador, Governador e Presidente?",
            "target_route": "info/regras",
            "menu_id": "menu_regras_eleitorais",
            "filters": {},
            "answer": "Senador possui 3 dígitos (votando-se duas vezes em candidatos diferentes para a 1ª e 2ª vaga). Governador possui 2 dígitos (número do partido). Presidente da República possui 2 dígitos (número do partido).",
            "suggested": ["Posso anular o voto para um dos senadores?", "Quando é o debate presidencial?"]
        },
        {
            "input": "O que acontece se eu votar no mesmo senador na 1ª e na 2ª vaga?",
            "target_route": "candidates/senador",
            "menu_id": "menu_senador",
            "filters": {"cargo": "SENADOR_2"},
            "answer": "Pelas regras do TSE, o eleitor deve votar em dois candidatos diferentes para o Senado em 2026. Se digitar o mesmo número para a 1ª vaga e para a 2ª vaga, o primeiro voto será computado para o candidato e o segundo voto será automaticamente anulado pela urna eletrônica.",
            "suggested": ["Como funciona a renovação de dois terços do Senado?", "Lista de candidatos ao Senado"]
        },
        {
            "input": "Como funciona o filtro de Ficha Limpa e processos administrativos no aplicativo?",
            "target_route": "info/regras",
            "menu_id": "menu_regras_eleitorais",
            "filters": {"apenas_ficha_limpa": True},
            "answer": "A Lei da Ficha Limpa (LC 135/2010) torna inelegíveis cidadãos com condenações em órgãos colegiados da Justiça por 8 anos. No SaibaTudo-Eleicao2026, você pode aplicar o filtro 'Ficha Limpa 100%' ou 'Zero Processos Adm.' para ver exclusivamente candidatos sem pendências ou rejeição de contas públicas.",
            "suggested": ["Filtrar candidatos com zero processos em SP", "O que é candidatura deferida com recurso?"]
        },
        {
            "input": "Quero ver candidatos que nunca foram eleitos para primeiro mandato",
            "target_route": "candidates/todos",
            "menu_id": "menu_home",
            "filters": {"mandatos_anteriores": 0},
            "answer": "Filtrando candidatos estreantes que estão concorrendo ao primeiro mandato eletivo nas eleições de 2026.",
            "suggested": ["Filtrar candidatos que tentam reeleição", "Ver deputados federais novatos"]
        },
        {
            "input": "Filtrar apenas candidatos da minha região atual ou do meu estado",
            "target_route": "candidates/local",
            "menu_id": "menu_home",
            "filters": {"localizacao_ativa": True},
            "answer": "Filtro de localização ativado. O aplicativo está exibindo os candidatos específicos do seu estado e da sua região geográfica.",
            "suggested": ["Como desligar o filtro de localização?", "Ver candidatos de outros estados"]
        }
    ]

def generate_dataset(output_path: Path):
    samples = []

    # 1. Combinações estruturadas com dígitos, estado e tema
    for (cargo_nome, cargo_code, digitos, menu_id, route), (estado_nome, uf, regiao), tema in itertools.product(CARGOS, ESTADOS, TEMAS):
        if "PRESIDENTE" in cargo_code:
            query = f"Quais os candidatos a presidente ({digitos} dígitos) com foco em {tema[0]}?"
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
                        "digitos_urna": digitos,
                        "estado_uf": None,
                        "regiao": None,
                        "partido": None,
                        "tema": tema[1],
                        "nome_candidato": None
                    },
                    "direct_answer": f"Filtrando presidenciáveis ({digitos} dígitos na urna) com propostas em {tema[0]}.",
                    "suggested_questions": ["Ver todos os presidenciáveis", "Ordem de votação na urna"]
                }
            }
            samples.append(sample)
        else:
            query = f"Candidatos a {cargo_nome} ({digitos} dígitos) em {estado_nome} focados em {tema[0]}"
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
                        "digitos_urna": digitos,
                        "estado_uf": uf,
                        "regiao": regiao,
                        "partido": None,
                        "tema": tema[1],
                        "nome_candidato": None
                    },
                    "direct_answer": f"Mostrando candidatos a {cargo_nome} ({digitos} dígitos) em {uf} ({regiao}) com propostas em {tema[0]}.",
                    "suggested_questions": [f"Quem concorre a {cargo_nome} em {uf}?", f"Ordem de votação para {cargo_nome}"]
                }
            }
            samples.append(sample)

    # 2. Perguntas oficiais do TSE de Ordem, Dígitos, Ficha Limpa e Reeleição
    for qa in generate_tse_specific_qa():
        sample = {
            "instruction": "Você é o assistente inteligente do SaibaTudo-Eleicao2026. Identifique menus, submenus, filtros e intenções.",
            "input": qa["input"],
            "output": {
                "intent": "EXPLAIN_TOPIC",
                "target_route": qa["target_route"],
                "menu_id": qa["menu_id"],
                "submenu_id": None,
                "filters": qa["filters"],
                "direct_answer": qa["answer"],
                "suggested_questions": qa["suggested"]
            }
        }
        samples.append(sample)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(samples, f, ensure_ascii=False, indent=2)

    print(f"Dataset ampliado com regras do TSE gerado com sucesso! Total de {len(samples)} pares salvos em {output_path}")

if __name__ == "__main__":
    out_file = DATA_DIR / "generated_training_dataset.json"
    generate_dataset(out_file)
