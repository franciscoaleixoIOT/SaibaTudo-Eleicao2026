#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Gera o dataset de instruções (JSONL) do NLU no FORMATO NOVO (contrato de docs/DATA_CONTRACT.md §9).

O alvo de treino é SÓ intenção + entidades (nunca fatos, nunca resposta pronta):
    pergunta  ->  {"intent": "LISTAR_CANDIDATOS", "cargo": "GOVERNADOR", "uf": "SP"}

Python puro (apenas biblioteca padrão). Entradas:
  - pacote de dados atual (data/eleicoes2026): nomes de urna, partidos, UFs e cargos REAIS (nada inventado);
  - templates de pergunta em português, variados (formas de cargo/UF, siglas e nomes, erros de digitação leves,
    caixa/acentos, prefixos de cortesia) — 16 intenções, incluindo as novas RESULTADOS, SEGUNDO_TURNO,
    ELEGIBILIDADE, PATRIMONIO e RECOMENDACAO (pós-eleição: eleitos, 2º turno, diplomação, posse).
  - contracts/nlu_golden_cases.json: casos de TESTE. Eles NUNCA entram no treino: o gerador remove perguntas idênticas
    (texto normalizado) e quase idênticas (similaridade de Jaccard de palavras >= 0,8) a qualquer caso de referência.

Saídas (em --out):
  train.jsonl / val.jsonl   {"instruction", "input", "output"(string JSON compacta), "intent", "text"(ChatML completo)}
  train.json / val.json     mesmos registros como array (formato lido por ai_model/scripts/train_hybrid.py)
  val_cases.json            amostra da validação no esquema de nlu_golden_cases.json (para eval_golden.py --cases)
  stats.json                contagens por intenção/divisão, descartes, versão dos dados
  meta.json                 proveniência (dataVersion do pacote, semente, versões)

A divisão treino/validação é por CHAVE ESTÁVEL (hash): amostras com nome de candidato vão para a validação
por nome (a validação mede generalização para nomes que o modelo nunca viu); as demais, pelo texto da pergunta.

Os rótulos são, por construção, "pontos fixos" do normalizador do proxy (api/_lib/normalize.js): com --verify o script
confere isso rodando o normalizador real (requer Node) — garante que o que se treina é o que o proxy aceita.

Uso:
  python backend/retrain/build_nlu_dataset.py --out backend/retrain/out [--seed 2026] [--scale 1.0] [--verify]
"""
import argparse
import hashlib
import json
import random
import re
import shutil
import subprocess
import sys
import unicodedata
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
sys.path.insert(0, str(REPO / "backend" / "modal"))
import nlu_core as core  # noqa: E402  (prompt, formato de saída e vocabulários: fonte única)

SCRIPT_VERSION = "1.0"
SYSTEM_PROMPT = core.SYSTEM_PROMPT_V2

# ---------------------------------------------------------------------------------------------------------
# Vocabulário de superfície (como as pessoas escrevem). Os RÓTULOS vêm de nlu_core / contrato.
# ---------------------------------------------------------------------------------------------------------
UF_NOME = {  # sigla -> (nome, artigo: "o" | "a" | "")
    "AC": ("Acre", "o"), "AL": ("Alagoas", ""), "AP": ("Amapá", "o"), "AM": ("Amazonas", "o"), "BA": ("Bahia", "a"),
    "CE": ("Ceará", "o"), "DF": ("Distrito Federal", "o"), "ES": ("Espírito Santo", "o"), "GO": ("Goiás", ""),
    "MA": ("Maranhão", "o"), "MT": ("Mato Grosso", "o"), "MS": ("Mato Grosso do Sul", "o"), "MG": ("Minas Gerais", ""),
    "PA": ("Pará", "o"), "PB": ("Paraíba", "a"), "PR": ("Paraná", "o"), "PE": ("Pernambuco", ""), "PI": ("Piauí", "o"),
    "RJ": ("Rio de Janeiro", "o"), "RN": ("Rio Grande do Norte", "o"), "RS": ("Rio Grande do Sul", "o"),
    "RO": ("Rondônia", ""), "RR": ("Roraima", ""), "SC": ("Santa Catarina", ""), "SP": ("São Paulo", ""),
    "SE": ("Sergipe", ""), "TO": ("Tocantins", "o"),
}
ART_EM = {"o": "no", "a": "na", "": "em"}
ART_DE = {"o": "do", "a": "da", "": "de"}

# cargo -> (singular, plural)
CARGO_FORMS = {
    "PRESIDENTE": (["presidente", "presidente da república"], ["presidentes"]),
    "VICE_PRESIDENTE": (["vice-presidente", "vice presidente"], ["vice-presidentes"]),
    "GOVERNADOR": (["governador"], ["governadores"]),
    "VICE_GOVERNADOR": (["vice-governador", "vice governador"], ["vice-governadores"]),
    "SENADOR": (["senador"], ["senadores"]),
    "DEPUTADO_FEDERAL": (["deputado federal", "dep. federal"], ["deputados federais"]),
    "DEPUTADO_ESTADUAL": (["deputado estadual", "dep. estadual"], ["deputados estaduais"]),
    "DEPUTADO_DISTRITAL": (["deputado distrital"], ["deputados distritais"]),
}
CARGO_PESOS = {  # frequência relativa nas perguntas
    "PRESIDENTE": 3, "VICE_PRESIDENTE": 1, "GOVERNADOR": 4, "VICE_GOVERNADOR": 1, "SENADOR": 4,
    "DEPUTADO_FEDERAL": 4, "DEPUTADO_ESTADUAL": 4, "DEPUTADO_DISTRITAL": 1,
}
NACIONAIS = {"PRESIDENTE", "VICE_PRESIDENTE"}

# id do tema -> formas escritas (todas ancoráveis pelo proxy: o id ou um sinônimo do mesmo id aparece no texto)
TEMA_FORMS = {
    "saude": ["saúde"], "educacao": ["educação", "escola"], "seguranca": ["segurança", "segurança pública"],
    "economia": ["economia", "emprego"], "meio_ambiente": ["meio ambiente"], "transporte": ["transporte", "mobilidade"],
    "moradia": ["moradia", "habitação"], "agro": ["agro", "agropecuária", "agricultura"], "cultura": ["cultura"],
    "esporte": ["esporte"], "tecnologia": ["tecnologia", "inovação", "ciência"], "assistencia": ["assistência social"],
    "saneamento": ["saneamento"], "energia": ["energia"], "infraestrutura": ["infraestrutura"],
    "transparencia": ["transparência", "corrupção"], "mulheres": ["mulheres"], "juventude": ["juventude", "jovens"],
    "idosos": ["idosos"], "turismo": ["turismo"], "pcd": ["PcD", "acessibilidade", "pessoa com deficiência"],
}
HIST_ADJ = {
    "NUNCA_ELEITO": ["estreantes", "novatos", "iniciantes"],
    "ELEITO_2_OU_MAIS": ["veteranos"],
    "ELEITO_MESMO_CARGO": ["em busca de reeleição"],
}
HIST_CLAUSE = {
    "NUNCA_ELEITO": ["que nunca foram eleitos", "disputando pela primeira vez"],
    "ELEITO_MESMO_CARGO": ["que buscam a reeleição", "que já foram eleitos para o cargo"],
    "ELEITO_2_OU_MAIS": ["eleitos várias vezes"],
}
TURNO_FORMS = {1: ["primeiro turno", "1º turno"], 2: ["segundo turno", "2º turno"]}
PARTIDO_VARIANTES = {"PCDOB": ["PCdoB", "PC do B"], "UNIÃO": ["União Brasil"]}

# palavras de ligação em que erros de digitação leves são seguros (nunca em entidades)
TYPO_OK = {
    "candidatos", "candidato", "quantos", "informações", "informacoes", "patrimônio", "patrimonio", "resultado",
    "disputa", "quando", "eleição", "eleicao", "pesquisas", "declarado", "situação", "situacao", "registrados",
    "oficiais", "atualizados", "calendário", "calendario", "apuração", "apuracao",
}
PREFIXOS = [
    "", "", "", "", "", "por favor, ", "oi, ", "me diga: ", "gostaria de saber: ", "pode me dizer ", "quero saber ",
    "ei, ", "preciso saber ", "você sabe ",
]
SUFIXOS = ["", "", "", "", "", " por favor", " em 2026", " hoje", " agora"]

# ---------------------------------------------------------------------------------------------------------
# Templates: (texto, rótulos estáticos). Placeholders -> rótulos:
#   {cargo} {cargos}                -> cargo        {cargo_inst} (só PRESIDENTE/GOVERNADOR/SENADOR)
#   {uf_em} {uf_de} {uf}            -> uf           {partido} -> partido      {nome} -> nome (como digitado)
#   {tema} -> tema (id)             {hist_adj} {hist_clause} -> historico
#   {turno} -> turno                {turno_tipo}  (alias de {turno} usado em frases "o {turno}")
# Rótulos estáticos cobrem entidades que aparecem em texto fixo (ex.: "governo" => cargo GOVERNADOR).
# ---------------------------------------------------------------------------------------------------------
T = {}

T["LISTAR_CANDIDATOS"] = [
    ("Quem disputa o governo {uf_de}?", {"cargo": "GOVERNADOR"}),
    ("Candidatos ao governo {uf_de}", {"cargo": "GOVERNADOR"}),
    ("Quem disputa o senado {uf_de}?", {"cargo": "SENADOR"}),
    ("Quem disputa a presidência da república?", {"cargo": "PRESIDENTE"}),
    ("Candidatos ao Planalto", {"cargo": "PRESIDENTE"}),
    ("Quem concorre à presidência em 2026?", {"cargo": "PRESIDENTE"}),
    ("Candidatos a {cargo} {uf_em}", {}),
    ("Quem são os {cargos} {uf_de}?", {}),
    ("Lista de {cargos} {uf_de}", {}),
    ("Mostrar candidatos a {cargo} {uf_em}", {}),
    ("{cargos} {uf_de}", {}),
    ("Quais os {cargos} {uf_em} em 2026?", {}),
    ("Candidatos a {cargo}", {}),
    ("Quem concorre a {cargo}?", {}),
    ("Quem são os candidatos a {cargo} {uf_em}?", {}),
    ("Quero ver os {cargos} {uf_de}", {}),
    ("Candidatos do {partido} {uf_em}", {}),
    ("Candidatos do partido {partido}", {}),
    ("Mostrar {cargos} do {partido}", {}),
    ("{cargos} do {partido} {uf_em}", {}),
    ("Quem o {partido} lança para {cargo} {uf_em}?", {}),
    ("Candidatos pelo {partido} a {cargo}", {}),
    ("Lista de candidatos do {partido}", {}),
    ("Candidatos a {cargo} que citam {tema} no plano", {}),
    ("Quem fala de {tema} {uf_em}?", {}),
    ("Candidatos com propostas de {tema}", {}),
    ("{cargos} com foco em {tema} {uf_em}", {}),
    ("Quais {cargos} falam de {tema}?", {}),
    ("Candidatos {hist_adj} a {cargo} {uf_em}", {}),
    ("{cargos} {hist_adj} {uf_de}", {}),
    ("Candidatos a {cargo} {hist_clause}", {}),
    ("Candidatos {uf_em} {hist_clause}", {}),
]

T["PERFIL_CANDIDATO"] = [
    ("Quem é {nome}?", {}), ("Informações sobre {nome}", {}), ("Fale sobre {nome}", {}), ("{nome}", {}),
    ("Qual o número de {nome}?", {}), ("Perfil do candidato {nome}", {}),
    ("Quero saber mais sobre {nome}", {}), ("{nome} candidato", {}), ("O que se sabe sobre {nome}?", {}),
    ("Mostre o perfil de {nome}", {}), ("Me fale sobre {nome}", {}), ("Dados do candidato {nome}", {}),
    ("Quem é {nome}, candidato a {cargo} {uf_em}?", {}),
    ("Informações sobre {nome} do {partido}", {}),
    ("Quem é {nome} do {partido} {uf_em}?", {}),
    ("{nome} {cargo}", {}),
]

T["CONTAR"] = [
    ("Quantos candidatos a {cargo} {uf_em}?", {}), ("Quantos candidatos foram registrados?", {}),
    ("Quantos candidatos {uf_em}?", {}), ("Qual o total de candidatos a {cargo}?", {}),
    ("Quantas candidaturas {uf_em}?", {}), ("Quantos candidatos o {partido} lançou?", {}),
    ("Número de {cargos} {uf_de}", {}), ("Quantos candidatos do {partido} {uf_em}?", {}),
    ("Quantos {cargos} disputam {uf_em}?", {}), ("Qual o total de candidaturas registradas no país?", {}),
    ("Quantos candidatos ao governo {uf_de}?", {"cargo": "GOVERNADOR"}),
    ("Quantos candidatos {hist_adj} a {cargo}?", {}),
]

T["PESQUISAS"] = [
    ("Pesquisas eleitorais registradas", {}), ("Quais pesquisas foram registradas?", {}),
    ("Pesquisas para {cargo} {uf_de}", {}), ("Pesquisa eleitoral {uf_em}", {}),
    ("Quantas pesquisas foram registradas no TSE?", {}), ("Quais institutos registraram pesquisas para {cargo}?", {}),
    ("Última pesquisa para {cargo} {uf_de}", {}), ("Pesquisas de intenção de voto para {cargo}", {}),
    ("Que institutos fizeram pesquisa {uf_em}?", {}), ("Mostrar as pesquisas registradas para {cargo} {uf_de}", {}),
]

T["CALENDARIO"] = [
    ("Quando é a eleição?", {}), ("Qual a data da eleição?", {}), ("Qual a data do {turno}?", {}),
    ("Quando será o {turno}?", {}), ("Calendário eleitoral", {}), ("Quais os prazos eleitorais?", {}),
    ("Quando é a posse dos eleitos?", {}), ("Quando acontece a diplomação?", {}), ("Que dia é a votação?", {}),
    ("Qual o horário de votação?", {}), ("Quando termina a campanha eleitoral?", {}),
    ("Que dia vai ser o {turno}?", {}), ("Datas importantes da eleição", {}), ("Quando saem os resultados?", {}),
]

T["LOCAL_VOTACAO"] = [
    ("Onde eu voto?", {}), ("Onde voto?", {}), ("Qual meu local de votação?", {}),
    ("Como saber minha seção eleitoral?", {}), ("Como justificar o voto?", {}),
    ("Qual documento levar para votar?", {}), ("Preciso do título para votar?", {}),
    ("Como consultar minha zona eleitoral?", {}), ("Esqueci o título, posso votar?", {}),
    ("Onde consulto meu local de votação {uf_em}?", {}), ("Não vou estar na minha cidade, como justifico?", {}),
    ("Como pego o e-título?", {}),
]

T["REGRAS_URNA"] = [
    ("Qual a ordem de votação na urna?", {}), ("Como funciona a urna eletrônica?", {}),
    ("Quantos dígitos tem o voto para {cargo}?", {}), ("Quantos dígitos para {cargo}?", {}),
    ("Como digito o voto de {cargo}?", {}), ("Em qual ordem voto na urna?", {}),
    ("Qual o número de dígitos de {cargo}?", {}), ("Quantos dígitos tem o candidato a {cargo}?", {}),
    ("Em que ordem aparecem os cargos na urna?", {}), ("Como digitar o número do candidato?", {}),
]

T["SENADO_DOIS_VOTOS"] = [
    ("Quantos votos tenho para senador?", {"cargo": "SENADOR"}),
    ("Posso votar no mesmo senador duas vezes?", {"cargo": "SENADOR"}),
    ("Por que são dois votos para o senado?", {"cargo": "SENADOR"}),
    ("Quantas vagas de senador estão em disputa?", {"cargo": "SENADOR"}),
    ("Como funciona o voto duplo para senador?", {"cargo": "SENADOR"}),
    ("Quantos senadores serão eleitos {uf_em}?", {"cargo": "SENADOR"}),
    ("Preciso votar em dois senadores?", {"cargo": "SENADOR"}),
    ("Como funciona a renovação de 2/3 do senado?", {"cargo": "SENADOR"}),
    ("Se eu repetir o senador nas duas vagas, o que acontece?", {"cargo": "SENADOR"}),
]

T["ELEGIBILIDADE"] = [
    ("Como funciona a lei da ficha limpa?", {}), ("Candidatos com ficha limpa {uf_em}", {"apenasDeferidas": True}),
    ("Quais {cargos} têm ficha limpa?", {"apenasDeferidas": True}),
    ("Candidatos a {cargo} com registro deferido {uf_em}", {"apenasDeferidas": True}),
    ("Só candidatos deferidos a {cargo}", {"apenasDeferidas": True}),
    ("Candidatos do {partido} com ficha limpa", {"apenasDeferidas": True}),
    ("Qual a situação da candidatura de {nome}?", {}), ("{nome} está inelegível?", {}),
    ("O registro de {nome} foi deferido?", {}), ("A candidatura de {nome} foi indeferida?", {}),
    ("Quem teve a candidatura indeferida {uf_em}?", {}),
    ("Quais candidatos a {cargo} estão inelegíveis?", {}),
    ("Existe candidato {uf_em} com registro negado?", {}),
    ("{nome} tem ficha limpa?", {}),
]

T["RESULTADOS"] = [
    ("Quem foi eleito {cargo} {uf_em}?", {}), ("Quem ganhou a eleição para {cargo} {uf_em}?", {}),
    ("Resultado da apuração para {cargo} {uf_de}", {}), ("Quem lidera a apuração para {cargo}?", {}),
    ("Quantos votos {nome} teve?", {}), ("Quantos votos teve {nome}?", {}), ("Percentual de votos de {nome}", {}),
    ("Quem são os {cargos} eleitos {uf_em}?", {}), ("Quem está na frente para {cargo} {uf_em}?", {}),
    ("Resultado do {turno} para {cargo}", {}), ("Apuração {uf_em}", {}), ("Boletim de urna {uf_em}", {}),
    ("Quem venceu {uf_em}?", {}), ("Como foi a votação de {nome}?", {}),
    ("Resultados da eleição para {cargo}", {}), ("{nome} foi eleito?", {}),
]

T["SEGUNDO_TURNO"] = [
    ("Quem passou para o segundo turno {uf_em}?", {"turno": 2}),
    ("Quais candidatos disputam o segundo turno para {cargo}?", {"turno": 2}),
    ("Vai ter segundo turno {uf_em}?", {"turno": 2}),
    ("Quem disputa o 2º turno para {cargo}?", {"turno": 2}),
    ("Quem foi para o segundo turno de {cargo} {uf_em}?", {"turno": 2}),
    ("Haverá segundo turno para {cargo}?", {"turno": 2}),
    ("Os candidatos do segundo turno {uf_em}", {"turno": 2}),
    ("Quais estados terão segundo turno?", {"turno": 2}),
    ("Quem ficou para o 2º turno?", {"turno": 2}),
]

T["PATRIMONIO"] = [
    ("Qual o patrimônio declarado de {nome}?", {}), ("Quanto {nome} declarou de bens?", {}),
    ("Bens declarados por {nome}", {}), ("Quanto {nome} tem de patrimônio?", {}),
    ("Patrimônio dos candidatos a {cargo} {uf_de}", {}), ("Qual o patrimônio do {nome}?", {}),
    ("Quem tem o maior patrimônio entre os candidatos a {cargo}?", {}), ("Riqueza declarada de {nome}", {}),
    ("Quais bens {nome} declarou à Justiça Eleitoral?", {}),
]

T["RECOMENDACAO"] = [
    ("Em quem devo votar para {cargo}?", {}), ("Qual o melhor candidato a {cargo}?", {}),
    ("Quem vai ganhar para {cargo} {uf_em}?", {}), ("Me indique um candidato a {cargo}", {}),
    ("Quem merece meu voto?", {}), ("Qual candidato é mais honesto?", {}), ("Vale a pena votar em {nome}?", {}),
    ("Quem é o pior candidato a {cargo}?", {}), ("Em quem você votaria {uf_em}?", {}),
    ("Qual candidato a {cargo} tem mais chance de ganhar?", {}), ("Me recomende um candidato do {partido}", {}),
    ("Quem é o melhor entre {nome} e os outros?", {}), ("Quem vai vencer a eleição?", {}),
    ("Quem você acha que vai ser eleito {cargo}?", {}),
]

# Intenções do contrato v2 resolvidas pelo NLU local dos clientes; o modelo as aprende para não confundi-las com outras.
T["REGRAS_VOTO"] = [
    ("Voto nulo anula a eleição?", {}), ("O que acontece se eu votar em branco?", {}), ("O voto é obrigatório?", {}),
    ("Quem não precisa votar?", {}), ("Qual a diferença entre voto nulo e voto em branco?", {}),
    ("Voto em branco conta para algum candidato?", {}), ("Quem tem voto facultativo?", {}),
    ("Qual a multa por não votar?", {}), ("Aos 16 anos o voto é obrigatório?", {}), ("Voto nulo ajuda algum candidato?", {}),
    ("Votar nulo vale como voto válido?", {}), ("Maiores de 70 anos precisam votar?", {}),
]

T["PLANO_GOVERNO"] = [
    ("Plano de governo do {nome}", {}), ("Quais as propostas de {nome}?", {}), ("Onde vejo o plano de governo de {nome}?", {}),
    ("{nome} tem plano de governo registrado?", {}), ("Propostas do candidato {nome}", {}),
    ("Planos de governo dos candidatos a {cargo} {uf_de}", {}), ("Quais candidatos a {cargo} {uf_em} registraram plano de governo?", {}),
]

T["CONTAS_CAMPANHA"] = [
    ("Quanto {nome} gastou na campanha?", {}), ("Quanto {nome} arrecadou?", {}), ("Despesas de campanha de {nome}", {}),
    ("Receitas declaradas de {nome}", {}), ("Prestação de contas de {nome}", {}), ("Quanto custou a campanha de {nome}?", {}),
    ("Quem doou para a campanha de {nome}?", {}),
]

T["SIMULADOR"] = [
    ("Simular voto na urna", {}), ("Quero treinar meu voto", {}), ("Abrir o simulador de urna", {}),
    ("Simulador da urna eletrônica", {}), ("Quero praticar o voto", {}), ("Simular voto em {nome}", {}),
    ("Simular meu voto para {cargo}", {}), ("Como é a urna? Quero testar", {}),
]

T["AJUDA"] = [
    ("ajuda", {}), ("Como usar o aplicativo?", {}), ("O que você faz?", {}), ("O que posso perguntar?", {}),
    ("Preciso de ajuda", {}), ("Quem criou este app?", {}), ("Como funciona este aplicativo?", {}),
    ("O que você sabe responder?", {}), ("oi", {}), ("olá", {}), ("bom dia", {}), ("boa tarde", {}),
    ("obrigado", {}), ("valeu", {}),
]

T["FONTES"] = [
    ("Onde consulto os sites oficiais da Justiça Eleitoral?", {}), ("Qual o link do DivulgaCandContas?", {}),
    ("Qual o site do TRE {uf_de}?", {}), ("Onde acompanho a apuração oficial?", {}),
    ("Link do portal de dados abertos do TSE", {}), ("Onde denunciar irregularidades eleitorais?", {}),
    ("Quais são os links oficiais do TSE?", {}), ("Onde vejo as contas de campanha dos candidatos?", {}),
    ("Qual o portal oficial dos resultados?", {}),
]

T["SOBRE_DADOS"] = [
    ("Qual a fonte dos dados do aplicativo?", {}), ("Os dados estão atualizados?", {}),
    ("Quando foi a última atualização dos dados?", {}), ("Os dados são oficiais?", {}),
    ("Qual a versão dos dados?", {}), ("Esses dados são do TSE?", {}), ("Como vocês conseguem esses dados?", {}),
    ("Com que frequência os dados são atualizados?", {}), ("Esse app é do governo?", {}),
]

DESCONHECIDAS = [
    "Qual a previsão do tempo para amanhã?", "Me conte uma piada", "Como fazer bolo de cenoura?",
    "Qual a capital da França?", "Quanto está o dólar hoje?", "Quero uma receita de feijoada",
    "Me ajude com meu dever de matemática", "Qual o melhor celular para comprar?", "Traduza bom dia para inglês",
    "Como emagrecer rápido?", "Quem descobriu o Brasil?", "Que horas são?",
    "kkkkk", "tudo bem?", "Quanto é 15 vezes 7?", "Como trocar um pneu?", "Escreva um poema sobre o mar",
    "Qual o sentido da vida?", "Como instalar o Windows?", "Receita de pão de queijo", "Qual a maior montanha do mundo?",
    "Me indique um filme para hoje à noite", "Como tirar o passaporte?", "Quanto custa uma passagem para Lisboa?",
    "Quais são os signos do zodíaco?", "Como plantar tomate?",
]

INTENT_QUOTA = {  # amostras desejadas por intenção (multiplicadas por --scale); o teto real depende da variedade
    "LISTAR_CANDIDATOS": 3800, "PERFIL_CANDIDATO": 3200, "CONTAR": 1000, "PESQUISAS": 600, "CALENDARIO": 700,
    "LOCAL_VOTACAO": 600, "REGRAS_URNA": 700, "SENADO_DOIS_VOTOS": 450, "ELEGIBILIDADE": 1300, "RESULTADOS": 1400,
    "SEGUNDO_TURNO": 650, "PATRIMONIO": 1000, "RECOMENDACAO": 1000, "FONTES": 500, "SOBRE_DADOS": 500,
    "REGRAS_VOTO": 400, "PLANO_GOVERNO": 500, "CONTAS_CAMPANHA": 500, "SIMULADOR": 350, "AJUDA": 300,
    "DESCONHECIDA": 700,
}

# ---------------------------------------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------------------------------------
PLACEHOLDER = re.compile(r"\{([a-z_]+)\}")
NOME_OK = re.compile(r"^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]{2,39}$")
PALAVRAS_CARGO = re.compile(
    r"\b(president\w*|governador\w*|senador\w*|deputad\w*|vice|suplente|prefeit\w*|vereador\w*|candidat\w*|partido|"
    r"estadual|federal|distrital|eleit\w*|urna|voto|votos)\b", re.I)


def fold(s: str) -> str:
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()


def norm_question(s: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", fold(s)))


def tokens(s: str) -> frozenset:
    return frozenset(norm_question(s).split())


def jaccard(a: frozenset, b: frozenset) -> float:
    return len(a & b) / len(a | b) if (a or b) else 0.0


def stable_bucket(chave: str, seed: int) -> int:
    return int(hashlib.sha1(f"{seed}|{chave}".encode("utf-8")).hexdigest()[:8], 16) % 1000


def pesos(rng: random.Random, tabela: dict, permitido=None) -> str:
    itens = [(k, w) for k, w in tabela.items() if permitido is None or k in permitido]
    return rng.choices([k for k, _ in itens], weights=[w for _, w in itens], k=1)[0]


# ---------------------------------------------------------------------------------------------------------
# Pacote de dados
# ---------------------------------------------------------------------------------------------------------
def load_package(data_dir: Path):
    manifest = json.loads((data_dir / "manifest.json").read_text(encoding="utf-8"))
    candidatos = []
    for arq in sorted((data_dir / "candidatos").glob("*.json")):
        for c in json.loads(arq.read_text(encoding="utf-8")):
            candidatos.append({k: c.get(k) for k in ("cargo", "estadoUf", "partido", "nomeUrna")})
    if not candidatos:
        raise SystemExit(f"nenhum candidato em {data_dir}/candidatos")
    return manifest, candidatos


def build_pools(candidatos, rng: random.Random, max_deputados: int):
    partidos = sorted({c["partido"] for c in candidatos if isinstance(c.get("partido"), str) and 2 <= len(c["partido"]) <= 14})
    reservados = {fold(p) for p in partidos} | {fold(v[0]) for v in UF_NOME.values()}
    vistos = set()
    majoritarios, deputados = [], []
    for c in candidatos:
        nome = " ".join((c.get("nomeUrna") or "").split())  # colapsa espaços duplicados do TSE
        if not NOME_OK.match(nome) or PALAVRAS_CARGO.search(nome) or len(re.findall(r"[A-Za-zÀ-ÿ]", nome)) < 3:
            continue
        if fold(nome) in reservados:
            continue
        if c["cargo"] not in core.CARGOS or c["cargo"] in ("VICE_PRESIDENTE", "VICE_GOVERNADOR"):
            continue
        chave = (fold(nome), c["cargo"], c["estadoUf"])
        if chave in vistos:
            continue
        vistos.add(chave)
        reg = {"nome": nome, "cargo": c["cargo"], "uf": c["estadoUf"] if c["estadoUf"] in UF_NOME else None, "partido": c["partido"]}
        (majoritarios if c["cargo"] in ("PRESIDENTE", "GOVERNADOR", "SENADOR") else deputados).append(reg)
    rng.shuffle(deputados)
    return partidos, majoritarios, deputados[:max_deputados]


# ---------------------------------------------------------------------------------------------------------
# Geração
# ---------------------------------------------------------------------------------------------------------
class Gerador:
    def __init__(self, partidos, nomes, rng):
        self.partidos, self.nomes, self.rng = partidos, nomes, rng

    # -- escolhas de superfície -------------------------------------------------------------------------
    def uf_surface(self, uf, modo):
        nome, art = UF_NOME[uf]
        usar_sigla = self.rng.random() < 0.3 or (modo == "bare" and uf == "PA")
        if modo == "bare":
            return (uf, True) if usar_sigla else (nome, False)
        if usar_sigla:
            return (f"{'em' if modo == 'em' else 'de'} {uf}", True)
        return (f"{(ART_EM if modo == 'em' else ART_DE)[art]} {nome}", False)

    def nome_surface(self, nome):
        r = self.rng.random()
        if r < 0.35:
            return nome  # como no pacote (MAIÚSCULAS)
        if r < 0.70:
            return nome.title()
        if r < 0.90:
            return nome.lower()
        return fold(nome)

    # -- uma amostra -------------------------------------------------------------------------------------
    def amostra(self, intent, texto, estaticos):
        rng = self.rng
        campos = PLACEHOLDER.findall(texto)
        uso = set(campos)
        rotulos = dict(estaticos)
        cand = None

        if "nome" in uso:
            cand = rng.choice(self.nomes)
            rotulos["nome"] = None  # preenchido ao renderizar
            if {"cargo", "cargos"} & uso:
                rotulos["cargo"] = cand["cargo"]
            if {"uf_em", "uf_de", "uf"} & uso:
                if cand["uf"] is None:
                    return None
                rotulos["uf"] = cand["uf"]
            if "partido" in uso:
                rotulos["partido"] = cand["partido"]
        cargo = rotulos.get("cargo")
        if {"cargo", "cargos"} & uso and "cargo" not in rotulos:
            tem_uf = bool({"uf_em", "uf_de", "uf"} & uso)
            cargo = pesos(rng, CARGO_PESOS, None if not tem_uf else set(CARGO_PESOS) - NACIONAIS)
            rotulos["cargo"] = cargo
        if "cargo_inst" in uso:
            return None  # reservado (os templates usam rótulo estático)
        if {"uf_em", "uf_de", "uf"} & uso and "uf" not in rotulos:
            rotulos["uf"] = "DF" if rotulos.get("cargo") == "DEPUTADO_DISTRITAL" else rng.choice(sorted(UF_NOME))
        if rotulos.get("cargo") == "DEPUTADO_DISTRITAL" and rotulos.get("uf") not in (None, "DF"):
            return None
        if "partido" in uso and "partido" not in rotulos:
            rotulos["partido"] = rng.choice(self.partidos)
        if {"tema"} & uso:
            rotulos["tema"] = rng.choice(sorted(TEMA_FORMS))
        if {"hist_adj", "hist_clause"} & uso:
            tabela = HIST_ADJ if "hist_adj" in uso else HIST_CLAUSE
            rotulos["historico"] = rng.choice(sorted(tabela))
        if {"turno", "turno_tipo"} & uso:
            rotulos["turno"] = rng.choice([1, 2])

        # renderização por segmentos: (texto, protegido). Protegido = entidade (não sofre erro de digitação/caixa de carrier)
        segmentos = []
        pos = 0
        for m in PLACEHOLDER.finditer(texto):
            if m.start() > pos:
                segmentos.append((texto[pos:m.start()], False))
            campo = m.group(1)
            if campo == "cargo":
                forms = CARGO_FORMS[rotulos["cargo"]][0]
                segmentos.append((rng.choice(forms), True))
            elif campo == "cargos":
                segmentos.append((rng.choice(CARGO_FORMS[rotulos["cargo"]][1]), True))
            elif campo in ("uf_em", "uf_de", "uf"):
                s, sigla = self.uf_surface(rotulos["uf"], campo[3:] if campo != "uf" else "bare")
                segmentos.append((s, "sigla" if sigla else True))
            elif campo == "partido":
                p = rotulos["partido"]
                segmentos.append((rng.choice([p] + PARTIDO_VARIANTES.get(p, []) + ([p.lower()] if rng.random() < 0.1 else [])), "sigla"))
            elif campo == "nome":
                s = self.nome_surface(cand["nome"])
                rotulos["nome"] = s
                segmentos.append((s, True))
            elif campo == "tema":
                segmentos.append((rng.choice(TEMA_FORMS[rotulos["tema"]]), True))
            elif campo == "hist_adj":
                segmentos.append((rng.choice(HIST_ADJ[rotulos["historico"]]), True))
            elif campo == "hist_clause":
                segmentos.append((rng.choice(HIST_CLAUSE[rotulos["historico"]]), True))
            elif campo in ("turno", "turno_tipo"):
                segmentos.append((rng.choice(TURNO_FORMS[rotulos["turno"]]), True))
            else:
                raise ValueError(f"placeholder desconhecido: {campo}")
            pos = m.end()
        if pos < len(texto):
            segmentos.append((texto[pos:], False))

        pergunta = self.finalizar(segmentos, permitir_sem_acento="nome" not in uso)
        if len(pergunta) > core.MAX_QUESTION_CHARS:
            return None
        return pergunta, self.alvo(intent, rotulos), (fold(cand["nome"]) if cand else None)

    def finalizar(self, segmentos, permitir_sem_acento=True):
        """Variações superficiais: erros leves em palavras de ligação, caixa, pontuação, prefixos/sufixos.
        Entidades (segmentos protegidos) nunca sofrem erro de digitação nem mudança de caixa."""
        rng = self.rng
        partes = []
        for texto, protegido in segmentos:
            if not protegido and rng.random() < 0.10:
                texto = " ".join(self.typo(w) for w in texto.split(" "))
            partes.append((texto, protegido))
        minuscula = rng.random() < 0.20
        if minuscula:
            partes = [(t if p else t.lower(), p) for t, p in partes]
        prefixo = rng.choice(PREFIXOS) if rng.random() < 0.35 else ""
        sufixo = rng.choice(SUFIXOS) if rng.random() < 0.25 else ""
        miolo = "".join(t for t, _ in partes)
        fim = re.search(r"[?!.\s]+$", miolo)
        pontuacao = fim.group(0).strip() if fim else ""
        miolo = miolo[:fim.start()] if fim else miolo
        if prefixo and partes and not partes[0][1]:
            miolo = miolo[:1].lower() + miolo[1:]  # "pode me dizer quem são..." (sem maiúscula no meio da frase)
        corpo = prefixo + miolo + sufixo + ("" if rng.random() < 0.25 else pontuacao)
        # sem acentos: só quando nenhum rótulo é texto copiado e não há sigla em maiúsculas (que depende da caixa)
        if permitir_sem_acento and rng.random() < 0.08 and not re.search(r"\b[A-Z]{2,}\b", corpo):
            corpo = unicodedata.normalize("NFD", corpo).encode("ascii", "ignore").decode()
        corpo = re.sub(r"\s+", " ", corpo).strip()
        primeiro_e_livre = bool(prefixo) or (bool(partes) and not partes[0][1])
        if primeiro_e_livre and not minuscula and rng.random() < 0.85:
            corpo = corpo[:1].upper() + corpo[1:]
        return corpo

    def typo(self, palavra):
        base = re.sub(r"\W", "", palavra.lower())
        if base in TYPO_OK and len(base) >= 6 and self.rng.random() < 0.6:
            i = self.rng.randrange(1, len(palavra) - 2)
            return palavra[:i] + palavra[i + 1] + palavra[i] + palavra[i + 2:]
        return palavra

    @staticmethod
    def alvo(intent, rotulos):
        d = {"intent": intent}
        for k in ("cargo", "uf", "partido", "nome", "tema", "apenasDeferidas", "historico", "turno"):
            if rotulos.get(k) is not None:
                d[k] = rotulos[k]
        if intent == "RECOMENDACAO":
            d = {"intent": intent}  # o app recusa com neutralidade: nenhuma entidade é necessária
        if intent == "SEGUNDO_TURNO":
            d["turno"] = 2
        return d


def gerar_desconhecidas(rng, n):
    out = {}
    for frase in DESCONHECIDAS:
        out[frase] = {"intent": "DESCONHECIDA"}
    letras = "abcdefghijklmnopqrstuvwxyz"
    tentativas = 0
    while len(out) < n and tentativas < n * 20:
        tentativas += 1
        palavras = ["".join(rng.choice(letras) for _ in range(rng.randint(3, 9))) for _ in range(rng.randint(1, 3))]
        out[" ".join(palavras)] = {"intent": "DESCONHECIDA"}
    return list(out.items())


def gerar(candidatos, seed: int, scale: float, max_deputados: int):
    rng = random.Random(seed)
    partidos, majoritarios, deputados = build_pools(candidatos, rng, max_deputados)
    nomes = majoritarios + deputados
    if not nomes or not partidos:
        raise SystemExit("pacote sem nomes/partidos utilizáveis")
    g = Gerador(partidos, nomes, rng)
    amostras = {}
    for intent, templates in T.items():
        meta = int(INTENT_QUOTA[intent] * scale)
        tentativas = 0
        gerados = 0
        while gerados < meta and tentativas < meta * 40:
            tentativas += 1
            texto, estaticos = rng.choice(templates)
            r = g.amostra(intent, texto, estaticos)
            if r is None:
                continue
            q, alvo, nome_fonte = r
            chave = (norm_question(q), json.dumps(alvo, sort_keys=True))
            if chave in amostras or not q:
                continue
            amostras[chave] = (q, alvo, intent, nome_fonte)
            gerados += 1
    for q, alvo in gerar_desconhecidas(rng, int(INTENT_QUOTA["DESCONHECIDA"] * scale)):
        amostras[(norm_question(q), json.dumps(alvo, sort_keys=True))] = (q, alvo, "DESCONHECIDA", None)
    return list(amostras.values()), {"partidos": len(partidos), "nomes": len(nomes)}


# ---------------------------------------------------------------------------------------------------------
# Casos de referência (teste) fora do treino
# ---------------------------------------------------------------------------------------------------------
def remover_casos_de_teste(amostras, golden_path: Path, limiar: float = 0.8):
    casos = json.loads(golden_path.read_text(encoding="utf-8"))["cases"]
    exatos = {norm_question(c["q"]) for c in casos}
    toks = [tokens(c["q"]) for c in casos]
    mantidas, removidas_exatas, removidas_quase = [], 0, 0
    for q, alvo, intent, nome_fonte in amostras:
        n = norm_question(q)
        if n in exatos:
            removidas_exatas += 1
        elif any(jaccard(tokens(q), t) >= limiar for t in toks):
            removidas_quase += 1
        else:
            mantidas.append((q, alvo, intent, nome_fonte))
    return mantidas, {"golden_exact_removed": removidas_exatas, "golden_near_removed": removidas_quase,
                      "golden_cases": len(casos)}


# ---------------------------------------------------------------------------------------------------------
# Perguntas externas (relatos de usuários, FAQ/ouvidoria oficial do TSE, parafraseamento, datasets licenciados)
# ---------------------------------------------------------------------------------------------------------
def _ler_arquivo_extra(caminho: Path):
    texto = caminho.read_text(encoding="utf-8").strip()
    if not texto:
        return []
    if texto.startswith("["):
        return json.loads(texto)
    return [json.loads(linha) for linha in texto.splitlines() if linha.strip()]


def _indice_de_nomes(candidatos):
    """Índice token -> nomes oficiais que o contêm, para validar `nome` com a mesma semântica dos
    clientes (resolverNome/NluValidator): cada token do nome extraído precisa aparecer num MESMO nome
    oficial. "bolsonaro" vale (FLAVIO BOLSONARO); um nome inventado, não."""
    indice = {}
    for c in candidatos:
        n = fold(c.get("nomeUrna") or "")
        if not n:
            continue
        for t in set(n.split()):
            indice.setdefault(t, set()).add(n)
    return indice


def _nome_existe(nome, indice):
    toks = fold(str(nome)).split()
    if not toks:
        return False
    comuns = None
    for t in toks:
        nomes = indice.get(t)
        if not nomes:
            return False
        comuns = nomes if comuns is None else (comuns & nomes)
        if not comuns:
            return False
    return True


def carregar_extras(caminhos, candidatos):
    """Perguntas coletadas fora dos templates, já rotuladas por `backend/retrain/label_extra.mjs`.

    O RÓTULO NUNCA VEM DA FONTE coletada: ou foi produzido pelo NLU determinístico dos clientes sobre o
    pacote oficial (e validado como ponto fixo do normalizador do proxy), ou é revalidado AQUI contra os
    vocabulários fechados e contra nomes/partidos que EXISTEM no pacote. Assim uma pergunta de origem não
    oficial não consegue introduzir fato não oficial no treino. Devolve amostras no mesmo formato das
    geradas: (q, alvo, intent, nome_fonte).
    """
    nomes_indice = _indice_de_nomes(candidatos)
    partidos_ok = {fold(c["partido"]) for c in candidatos if c.get("partido")}
    descartes = Counter()
    proveniencia = {}
    amostras, vistas = [], set()

    for caminho in caminhos:
        p = Path(caminho)
        if not p.exists():
            raise SystemExit(f"--extra: arquivo não encontrado: {p}")
        for item in _ler_arquivo_extra(p):
            q = str(item.get("q") or "").strip()
            if not q:
                descartes["sem_pergunta"] += 1
                continue
            if len(q) > core.MAX_QUESTION_CHARS:
                descartes["longa"] += 1
                continue
            alvo = item.get("alvo")
            if isinstance(alvo, str):
                alvo = json.loads(alvo)
            if alvo is None and isinstance(item.get("label"), str):
                alvo = json.loads(item["label"])
            if not isinstance(alvo, dict) or not isinstance(alvo.get("intent"), str):
                descartes["sem_rotulo"] += 1
                continue
            intent = alvo["intent"]
            if intent not in core.INTENTS:
                descartes["intent_invalida"] += 1
                continue
            if not set(alvo) <= set(core.V2_KEYS):
                descartes["chave_fora_do_contrato"] += 1
                continue
            if intent in ("DESCONHECIDA", "RECOMENDACAO") and set(alvo) != {"intent"}:
                # Res. TSE 23.755/2026: recomendação é recusada SEM entidades; DESCONHECIDA não as tem.
                descartes["entidade_indevida"] += 1
                continue
            # Intenções sem entidade (CALENDARIO, LOCAL_VOTACAO, REGRAS_VOTO, AJUDA, SIMULADOR, FONTES,
            # SOBRE_DADOS) têm alvo {"intent"} e são exemplos válidos — como nos templates.
            if "cargo" in alvo and alvo["cargo"] not in core.CARGOS:
                descartes["vocab_cargo"] += 1
                continue
            if "uf" in alvo and alvo["uf"] not in core.UFS:
                descartes["vocab_uf"] += 1
                continue
            if "tema" in alvo and alvo["tema"] not in core.TEMAS_V2:
                descartes["vocab_tema"] += 1
                continue
            if "historico" in alvo and alvo["historico"] not in core.HISTORICOS:
                descartes["vocab_historico"] += 1
                continue
            if "turno" in alvo and alvo["turno"] not in (1, 2):
                descartes["vocab_turno"] += 1
                continue
            if "apenasDeferidas" in alvo and not isinstance(alvo["apenasDeferidas"], bool):
                descartes["vocab_apenasDeferidas"] += 1
                continue
            if "partido" in alvo and fold(str(alvo["partido"])) not in partidos_ok:
                descartes["partido_fora_do_pacote"] += 1
                continue
            if "nome" in alvo and not _nome_existe(alvo["nome"], nomes_indice):
                descartes["nome_fora_do_pacote"] += 1
                continue

            chave = norm_question(q)
            if chave in vistas:
                descartes["duplicada"] += 1
                continue
            vistas.add(chave)

            fonte = str(item.get("fonte") or p.name)
            prov = proveniencia.setdefault(fonte, {"quantidade": 0})
            prov["quantidade"] += 1
            for campo in ("licenca", "coletadoEm"):
                if item.get(campo):
                    prov[campo] = item[campo]
            amostras.append((q, alvo, intent, alvo.get("nome") or item.get("nomeFonte")))

    return amostras, dict(sorted(descartes.items())), proveniencia


def limitar_extras(extras, geradas: int, max_pct: float, seed: int):
    """Teto de participação das perguntas externas: a distribuição de entidades segue ancorada no pacote
    oficial (a maioria dos exemplos continua vindo dos templates)."""
    if max_pct <= 0 or not extras:
        return [], len(extras)
    limite = int(max_pct / 100.0 * (geradas + len(extras)))
    if len(extras) <= limite:
        return extras, 0
    return random.Random(seed + 7).sample(extras, limite), len(extras) - limite


# ---------------------------------------------------------------------------------------------------------
# Registros e divisão
# ---------------------------------------------------------------------------------------------------------
def registro(q, alvo, intent):
    saida = core.format_output_v2(alvo)
    return {
        "instruction": SYSTEM_PROMPT, "input": q, "output": saida, "intent": intent,
        "text": core.build_training_text(q, saida, "v2"),
    }


def dividir(amostras, seed: int, val_pct: float):
    treino, val = [], []
    for q, alvo, intent, nome_fonte in amostras:
        # a validação separa NOMES: um candidato (mesmo em intenções sem nome no rótulo, como RECOMENDACAO) cai só de um lado
        chave = nome_fonte or norm_question(q)
        (val if stable_bucket(chave, seed) < val_pct * 10 else treino).append(registro(q, alvo, intent))
    return treino, val


def escrever(out: Path, nome: str, regs):
    with open(out / f"{nome}.jsonl", "w", encoding="utf-8", newline="\n") as f:
        for r in regs:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    (out / f"{nome}.json").write_text(json.dumps(regs, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")


def escrever_casos_de_validacao(out: Path, val, seed: int, maximo: int = 300):
    """val_cases.json: amostra da validação no MESMO esquema de contracts/nlu_golden_cases.json, para rodar
    `python backend/modal/eval_golden.py --cases <out>/val_cases.json ...` (chaves null exigem ausência)."""
    rng = random.Random(seed + 1)
    amostra = rng.sample(val, min(maximo, len(val)))
    casos = []
    for r in amostra:
        alvo = json.loads(r["output"])
        c = {"q": r["input"], "intent": alvo["intent"]}
        for k in ("cargo", "uf", "partido"):
            c[k] = alvo.get(k)  # None => o modelo não deve produzir a chave (mede alucinação)
        if "nome" in alvo:
            c["nome"] = alvo["nome"]
        casos.append(c)
    (out / "val_cases.json").write_text(
        json.dumps({"version": 1, "descricao": "Amostra da validação (gerada); mesmo esquema de nlu_golden_cases.json", "cases": casos},
                   ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")


def verificar_com_normalizador(regs, node="node"):
    """Roda o normalizador REAL do proxy (api/_lib/normalize.js) sobre cada amostra: o rótulo deve ser ponto fixo."""
    if shutil.which(node) is None:
        raise SystemExit("--verify requer Node.js no PATH")
    entrada = json.dumps([{"q": r["input"], "label": r["output"]} for r in regs], ensure_ascii=False)
    p = subprocess.run([node, str(HERE / "check_labels.mjs")], input=entrada, capture_output=True, text=True, encoding="utf-8")
    sys.stdout.write(p.stdout)
    if p.returncode != 0:
        sys.stderr.write(p.stderr)
        raise SystemExit("rótulos incompatíveis com o normalizador do proxy")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default=str(REPO / "data" / "eleicoes2026"))
    ap.add_argument("--golden", default=str(REPO / "contracts" / "nlu_golden_cases.json"))
    ap.add_argument("--out", default=str(HERE / "out"))
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--scale", type=float, default=1.0, help="multiplica as cotas por intenção")
    ap.add_argument("--val-pct", type=float, default=5.0)
    ap.add_argument("--max-deputados", type=int, default=1500, help="nomes de deputados amostrados (majoritários entram todos)")
    ap.add_argument("--extra", action="append", default=[], metavar="ARQ",
                    help="JSONL/JSON de perguntas externas JÁ ROTULADAS (backend/retrain/label_extra.mjs); repetível")
    ap.add_argument("--extra-max-pct", type=float, default=25.0,
                    help="teto da participação das perguntas externas no dataset (0 = não usar)")
    ap.add_argument("--verify", action="store_true", help="confere os rótulos com o normalizador do proxy (requer Node)")
    a = ap.parse_args(argv)

    manifest, candidatos = load_package(Path(a.data))
    amostras, pools = gerar(candidatos, a.seed, a.scale, a.max_deputados)
    amostras, descartes = remover_casos_de_teste(amostras, Path(a.golden))

    info_extras = {}
    if a.extra:
        extras, desc_extra, proveniencia = carregar_extras(a.extra, candidatos)
        extras, golden_extra = remover_casos_de_teste(extras, Path(a.golden))
        extras, cortadas = limitar_extras(extras, len(amostras), a.extra_max_pct, a.seed)
        chaves = {norm_question(q) for q, _, _, _ in amostras}
        unicas = [e for e in extras if norm_question(e[0]) not in chaves]
        amostras = amostras + unicas
        total = len(amostras)
        info_extras = {
            "extras_aceitos": len(unicas),
            "extras_pct": round(100.0 * len(unicas) / total, 2) if total else 0.0,
            "extras_por_fonte": proveniencia,
            "extras_descartados": {
                **desc_extra,
                "golden_exact_removed": golden_extra["golden_exact_removed"],
                "golden_near_removed": golden_extra["golden_near_removed"],
                "cortadas_por_teto": cortadas,
                "duplicadas_das_geradas": len(extras) - len(unicas),
            },
        }

    treino, val = dividir(amostras, a.seed, a.val_pct)

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    escrever(out, "train", treino)
    escrever(out, "val", val)
    escrever_casos_de_validacao(out, val, a.seed)
    stats = {
        "total": len(treino) + len(val), "train": len(treino), "val": len(val),
        "por_intencao_train": dict(sorted(Counter(r["intent"] for r in treino).items())),
        "por_intencao_val": dict(sorted(Counter(r["intent"] for r in val).items())),
        **pools, **descartes, **info_extras,
    }
    meta = {
        "script_version": SCRIPT_VERSION, "seed": a.seed, "scale": a.scale, "val_pct": a.val_pct,
        "dataVersion": manifest.get("dataVersion"), "schemaVersion": manifest.get("schemaVersion"),
        "format": "v2", "system_prompt": SYSTEM_PROMPT,
        "intents": core.INTENTS,
    }
    if a.extra:
        # Proveniência e licença de cada fonte externa ficam registradas com o dataset (auditoria).
        meta["extras"] = {
            "arquivos": [str(Path(c)) for c in a.extra],
            "max_pct": a.extra_max_pct,
            "fontes": info_extras.get("extras_por_fonte", {}),
            "rotulagem": "backend/retrain/label_extra.mjs (NLU dos clientes + ponto fixo do normalizador)",
        }
    (out / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=1), encoding="utf-8")
    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(stats, ensure_ascii=False, indent=1))
    faltando = [i for i in core.INTENTS if i not in stats["por_intencao_train"]]
    if faltando:
        raise SystemExit(f"intenções sem exemplos de treino: {faltando}")
    if a.verify:
        verificar_com_normalizador(treino + val)
    print(f"\nOK -> {out}")


if __name__ == "__main__":
    main()
