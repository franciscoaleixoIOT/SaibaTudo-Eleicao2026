# -*- coding: utf-8 -*-
"""
Inventário de FONTES OFICIAIS do pipeline de dados (SaibaTudo-Eleicoes2026).

Cada fonte tem URL, licença e cadência esperada. O manifesto publicado com os dados
(manifest.json) replica esta tabela com ETag/Last-Modified/checksum observados na
extração, garantindo proveniência verificável.

Licença dos Dados Abertos do TSE: Creative Commons Atribuição (CC BY 4.0) — a atribuição
é feita no app, no site e no manifesto.
"""

CDN = "https://cdn.tse.jus.br/estatistica/sead"
ODSELE = f"{CDN}/odsele"
FOTOS = f"{CDN}/eleicoes/eleicoes2026/fotos"
DADOS_ABERTOS = "https://dadosabertos.tse.jus.br"

ANO = 2026
LICENCA = "CC BY 4.0 (Dados Abertos do TSE)"

UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB",
       "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"]

# Pacotes CSV (um único zip nacional, contém *_BRASIL.csv e um CSV por UF)
CSV_SOURCES = {
    "consulta_cand": {
        "url": f"{ODSELE}/consulta_cand/consulta_cand_{ANO}.zip",
        "descricao": "Candidaturas registradas (TSE - Candidatos)",
        "cadencia": "diária (até a eleição); a cada atualização do TSE durante julgamentos",
        "critica": True,
    },
    "consulta_cand_complementar": {
        "url": f"{ODSELE}/consulta_cand_complementar/consulta_cand_complementar_{ANO}.zip",
        "descricao": "Informações complementares das candidaturas (situação de julgamento, reeleição, urna)",
        "cadencia": "diária",
        "critica": True,
    },
    "bem_candidato": {
        "url": f"{ODSELE}/bem_candidato/bem_candidato_{ANO}.zip",
        "descricao": "Bens declarados pelos candidatos",
        "cadencia": "diária",
        "critica": False,
    },
    "consulta_coligacao": {
        "url": f"{ODSELE}/consulta_coligacao/consulta_coligacao_{ANO}.zip",
        "descricao": "Coligações e federações",
        "cadencia": "diária",
        "critica": False,
    },
    "consulta_vagas": {
        "url": f"{ODSELE}/consulta_vagas/consulta_vagas_{ANO}.zip",
        "descricao": "Vagas em disputa por cargo/UF",
        "cadencia": "estática",
        "critica": False,
    },
    "motivo_cassacao": {
        "url": f"{ODSELE}/motivo_cassacao/motivo_cassacao_{ANO}.zip",
        "descricao": "Motivos de indeferimento/cassação registrados no julgamento da candidatura",
        "cadencia": "diária",
        "critica": False,
    },
    "rede_social_candidato": {
        "url": f"{ODSELE}/consulta_cand/rede_social_candidato_{ANO}.zip",
        "descricao": "Redes sociais informadas pelos candidatos",
        "cadencia": "diária",
        "critica": False,
    },
    "historico_candidatura": {
        "url": f"{ODSELE}/historico_candidatura/historico_candidatura_{ANO}.zip",
        "descricao": "Histórico de candidaturas anteriores",
        "cadencia": "estática",
        "critica": False,
    },
    "pesquisa_eleitoral": {
        "url": f"{ODSELE}/pesquisa_eleitoral/pesquisa_eleitoral_{ANO}.zip",
        "descricao": "Pesquisas eleitorais registradas no TSE (PesqEle)",
        "cadencia": "diária",
        "critica": True,
    },
}

# Prestação de contas (grande: ~150 MB) — ativada com --com-contas
CONTAS_SOURCE = {
    "url": f"{ODSELE}/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_{ANO}.zip",
    "descricao": "Prestação de contas parcial/final dos candidatos (receitas e despesas)",
    "cadencia": "diária (parcial) até a prestação final",
}

# Resultados: o TSE publica o slot do arquivo antes da eleição com ~1 byte; passa a ter conteúdo na apuração
RESULTADOS_SOURCES = {
    "votacao_candidato_munzona": {
        "url": f"{ODSELE}/votacao_candidato_munzona/votacao_candidato_munzona_{ANO}.zip",
        "descricao": "Votação nominal por candidato, município e zona (resultado oficial)",
        "cadencia": "após a apuração de cada turno",
    },
    "detalhe_votacao_munzona": {
        "url": f"{ODSELE}/detalhe_votacao_munzona/detalhe_votacao_munzona_{ANO}.zip",
        "descricao": "Detalhe da votação (comparecimento, abstenções, brancos e nulos)",
        "cadencia": "após a apuração de cada turno",
    },
}


def foto_zip_url(uf: str) -> str:
    return f"{FOTOS}/foto_cand{ANO}_{uf}_div.zip"


def plano_zip_url(uf: str) -> str:
    return f"{ODSELE}/proposta_governo/proposta_governo_{ANO}_{uf}.zip"
