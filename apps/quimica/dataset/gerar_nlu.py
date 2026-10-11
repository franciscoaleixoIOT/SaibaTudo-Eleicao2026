#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Gera o dataset de interpretação (NLU) do SaibaTudo Química: pergunta -> {intent + entidades}, SEM fatos e SEM respostas.

Formato do alvo = contrato do modelo em `backend/modal/nlu_core.py` (docs/DATA_CONTRACT.md §8): chaves intent, elemento (símbolo),
composto (texto COPIADO da pergunta: nome ou fórmula como digitado), propriedade (id do vocabulário), quantidades
([{valor, unidade}]), equacao (copiada), nivel, unidadeDestino. Entidades nunca sofrem erro de digitação; os erros só aparecem em
palavras de ligação.

Entradas: o pacote `data/quimica/` (ou a fixture de teste), `contracts/nlu_golden_cases.json` (casos de TESTE: nenhuma pergunta
idêntica ou quase idêntica — Jaccard de palavras >= 0,8 — entra no treino) e `dados_recusas.py` (pedidos perigosos -> RECUSA_PERIGO).
Saídas (em --out, padrão dataset/nlu): train.jsonl, val.jsonl ({q, alvo}) e stats.json; com --sft também train_sft.jsonl/val_sft.jsonl
({instruction,input,output,intent,text}, formato de backend/modal/nlu_core.py). Validação: 5 % por hash estável (a chave é a entidade
principal, para medir generalização a compostos/elementos inéditos).

Uso:
  python dataset/gerar_nlu.py [--data data/quimica] [--out dataset/nlu] [--seed 2026] [--scale 1.0]
"""
import argparse
import json
import random
import re
import sys
from collections import Counter
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import dados_recusas  # noqa: E402
import equacoes  # noqa: E402
import fam_nomenclatura  # noqa: E402
import vocab_nlu as V  # noqa: E402
from comum import (PLACEHOLDER, REPO, finalizar, fold, genero, jaccard, ler_json, norm_question, renderizar, stable_bucket,  # noqa: E402
                   superficie_nome, tokens)
from pacote import localizar  # noqa: E402

SCRIPT_VERSION = "1.0"
KEYS = ["intent", "elemento", "composto", "propriedade", "quantidades", "equacao", "nivel", "unidadeDestino"]
COMPOSTO_OK = re.compile(r"^[A-Za-z0-9 ,.'()+À-ÿ·₀-₉-]{2,60}$")
EQUACAO_OK = re.compile(r"^[A-Za-z0-9 +=<>()._/,^·→⇌↔⇄⟶₀-₉-]{3,80}$")

try:  # contrato do modelo (fonte única do formato do alvo)
    sys.path.insert(0, str(REPO / "backend" / "modal"))
    import nlu_core as core  # noqa: E402
except Exception:  # pragma: no cover
    core = None

# ---------------------------------------------------------------------------------------------------------
# Templates por intenção: (texto, rótulos estáticos). Placeholders: ver Gerador.resolver
# ---------------------------------------------------------------------------------------------------------
T = {}
T["ELEMENTO"] = [(t, {}) for t in [
    "Fale sobre {el}", "Quem é {el}?", "O que é {el}?", "Informações sobre {el}", "{el_s}", "elemento {el_s}", "Quero saber sobre {el}", "Me fale do elemento {el_s}",
    "Perfil {el_de}", "Ficha {el_de}", "Me dê um resumo {el_de}", "Mostre {el} na tabela periódica", "O que você sabe sobre {el}?", "Pode falar sobre {el_s}?",
    "Qual o símbolo {el_de}?", "{el_s} na tabela periódica", "Dados {el_de}", "Me conte sobre {el}",
]]
T["COMPOSTO"] = [(t, {}) for t in [
    "Fale sobre {co}", "O que é {co}?", "{co_s}", "Informações sobre {co}", "Ficha {co_de}", "Quero saber sobre {co}", "Me fale {co_de}", "composto {co_s}",
    "substância {co_s}", "Me dê um resumo {co_de}", "O que você sabe sobre {co}?", "Pode falar sobre {co_s}?", "Mostre os dados {co_de}", "Resumo {co_de}",
    "Quem é {co}?", "Me conte sobre {co}", "Qual a ficha {co_de}?",
]]
T["PROPRIEDADE_EL"] = [(t, {}) for t in [
    "Qual é {prop_art} {el_de}?", "{Prop} {el_de}", "{Prop} {el_de}?", "Me diga {prop_art} {el_de}", "Quero saber {prop_art} {el_de}", "Pode me dizer {prop_art} {el_de}?",
    "Preciso saber {prop_art} {el_de}", "{Prop_art} {el_de}", "Qual {prop_art_q} {el_de}?", "{el_s}: {prop}", "{prop} {el_de} em valor", "Consulte {prop_art} {el_de}",
]] + [
    ("Quem descobriu {el}?", {"propriedade": "descoberta"}), ("Quando {el} foi descoberto?", {"propriedade": "descoberta"}),
    ("Em que ano foi descoberto {el}?", {"propriedade": "descoberta"}), ("{el} é sólido, líquido ou gasoso?", {"propriedade": "estadoPadrao"}),
    ("Em que estado físico {el} se encontra?", {"propriedade": "estadoPadrao"}), ("{el} é líquido?", {"propriedade": "estadoPadrao"}),
    ("Qual o nox {el_de}?", {"propriedade": "estadosOxidacao"}), ("A que temperatura {el} derrete?", {"propriedade": "pontoFusaoK"}),
    ("A que temperatura {el} ferve?", {"propriedade": "pontoEbulicaoK"}), ("{el} é um metal?", {"propriedade": "categoria"}),
    ("Que tipo de elemento é {el}?", {"propriedade": "categoria"}), ("Em que grupo está {el}?", {"propriedade": "grupo"}),
    ("Em que período está {el}?", {"propriedade": "periodo"}), ("Quantos prótons tem {el}?", {"propriedade": "numeroAtomico"}),
    ("Quantos elétrons tem {el}?", {"propriedade": "numeroAtomico"}), ("{el} é mais denso que a água?", {"propriedade": "densidadeKgm3"}),
]
T["PROPRIEDADE_CO"] = [(t, {}) for t in [
    "Qual é {prop_art} {co_de}?", "{Prop} {co_de}", "{Prop} {co_de}?", "Me diga {prop_art} {co_de}", "Quero saber {prop_art} {co_de}", "Pode me dizer {prop_art} {co_de}?",
    "{Prop_art} {co_de}", "{co_s}: {prop}", "Consulte {prop_art} {co_de}",
]] + [
    ("{Co} é solúvel em água?", {"propriedade": "solubilidade"}), ("Qual o CAS {co_de}?", {"propriedade": "cas"}), ("Qual o SMILES {co_de}?", {"propriedade": "smiles"}),
    ("Qual o pKa {co_de}?", {"propriedade": "pka"}), ("A que temperatura {co} ferve?", {"propriedade": "pontoEbulicaoK"}),
    ("A que temperatura {co} derrete?", {"propriedade": "pontoFusaoK"}), ("{Co} dissolve em água?", {"propriedade": "solubilidade"}),
]
T["MASSA_MOLAR"] = [(t, {}) for t in [
    "Qual a massa molar {co_de}?", "Massa molar {co_de}", "massa molar de {co_s}", "Calcule a massa molar {co_de}", "Quanto pesa um mol {co_de}?",
    "Qual o peso molecular {co_de}?", "Qual a massa molecular {co_de}?", "Qual a massa de um mol {co_de}?", "Calcule a massa molar do composto {co_s}",
    "Quantos gramas tem um mol {co_de}?", "{co_s} massa molar", "MM {co_de}", "Me ajuda a calcular a massa molar {co_de}", "Qual é a massa em g/mol {co_de}?",
    "Preciso da massa molar {co_de}", "Determine a massa molar {co_de}",
    "Massa molar de {ff_s}", "Calcule a massa molar de {ff_s}", "Qual a massa molar do {ff_s}?", "Quanto pesa um mol de {ff_s}?", "Some as massas atômicas de {ff_s}",
]]
T["BALANCEAR"] = [(t, {}) for t in [
    "Balanceie a equação {eq}", "Balanceie {eq}", "Faça o balanceamento de {eq}", "Acerte os coeficientes de {eq}", "Como balancear {eq}?", "Balanceamento: {eq}",
    "Quais os coeficientes de {eq}?", "{eq}", "Equilibre a reação {eq}", "Ajuste os coeficientes: {eq}", "Preciso balancear {eq}", "Balanceie a seguinte reação: {eq}",
    "Como acertar {eq}?", "Me ajuda a balancear {eq}", "Qual a equação {eq} balanceada?",
]] + [("balanceamento de equações", {}), ("como balancear uma equação química?", {}), ("balancear reação química", {})]
T["ESTEQUIOMETRIA"] = [(t, {}) for t in [
    "Quantos mols há em {qm} de {co_s}?", "Quantos mols existem em {qm} de {co_s}?", "Qual a massa de {qn} de {co_s}?", "Converta {qm} de {co_s} em mols",
    "Quantas moléculas há em {qn} de {co_s}?", "Quantos átomos há em {qn} de {el_s}?", "Quantos gramas pesam {qn} de {co_s}?", "Qual o volume de {qn} de {co_s} nas CNTP?",
    "Quantos mols de {co_s} correspondem a {qm}?", "Quantos mols de {el_s} há em {qm}?", "Na reação {eq}, quantos gramas de produto se formam com {qm} do primeiro reagente?",
    "Reagente limitante de {eq} com {qm} e {qm2}", "Calcule o rendimento de {eq} se {qm} produzem {qm2}", "Quantos mols do produto se formam em {eq} com {qn}?",
    "Quanto de reagente é preciso para {eq} com {qm}?", "Qual o volume ocupado por {qn} de gás nas CNTP?", "Volume molar nas CNTP", "Estequiometria de {eq}",
    "Segundo {eq}, quantos gramas reagem com {qm}?", "Quantas partículas há em {qn} de {co_s}?",
]]
T["CONCENTRACAO"] = [(t, {}) for t in [
    "Qual a molaridade de {qm} de {co_s} em {qv}?", "Qual a concentração de {qm} de {co_s} dissolvidos em {qv}?", "Quantos gramas de {co_s} preciso para {qv} de solução {qc}?",
    "Como preparar {qv} de solução {qc} de {co_s}?", "Diluir {qv} de solução {qc} para {qc2}", "Qual o volume final ao diluir {qv} de solução {qc} até {qc2}?",
    "Quantos mL de solução {qc} preciso para preparar {qv2} de {qc2}?", "Calcule a concentração em g/L de {qm} de {co_s} em {qv}", "Qual a concentração final ao diluir {qv} de {qc} até {qv2}?",
    "Concentração comum de {qm} de {co_s} em {qv}", "Molaridade de uma solução com {qm} de {co_s} em {qv}", "Preparo de solução {qc} de {co_s} com {qv}",
    "Dissolvi {qm} de {co_s} em {qv}. Qual a concentração?", "Que massa de {co_s} é necessária para {qv} a {qc}?", "Quero diluir {qc} para {qc2}, mantendo {qv}",
    "Calcule a molaridade", "diluição de soluções", "como calcular a concentração de uma solução?",
]]
T["PH"] = [(t, {}) for t in [
    "Qual o pH de {co_s} {qc}?", "Calcule o pH de uma solução {qc} de {co_s}", "pH de {co_s} {qc}", "Qual o pH de uma solução de {co_s} a {qc}?", "pOH de {co_s} {qc}",
    "Qual o pH de {qc} de {co_s}?", "Qual o pH de {co_s}?", "Calcule o pH de {co_s}", "Como calcular o pH de {co_s} {qc}?", "pH de uma solução de {co_s}",
    "Qual a concentração de H+ em uma solução de pH 3?", "Calcule o pOH de uma solução de pH 4", "como calcular o pH?", "Qual o pH de uma solução {qc} de ácido forte?",
]]
T["GAS_IDEAL"] = [(t, {}) for t in [
    "Qual o volume de {qn} de gás a {qT} e {qP}?", "Qual a pressão de {qn} de gás em {qL} a {qT}?", "Quantos mols de gás há em {qL} a {qT} e {qP}?",
    "Qual a temperatura de {qn} de gás em {qL} a {qP}?", "Use PV = nRT com {qn}, {qT} e {qP}", "Lei dos gases ideais: {qn} a {qT} em {qL}", "Calcule o volume de {qn} de {co_s} a {qT} e {qP}",
    "Gás ideal: {qP}, {qT}, {qL}. Quantos mols?", "PV = nRT", "lei dos gases ideais", "equação de Clapeyron", "Quantos litros ocupam {qn} de gás a {qT} e {qP}?",
    "Qual a pressão exercida por {qn} de {co_s} em {qL} a {qT}?", "Calcule n com P = {qP}, V = {qL} e T = {qT}",
]]
T["CONVERSAO_UNIDADE"] = [(t, {}) for t in [
    "Converta {qconv} para {ud}", "Quanto é {qconv} em {ud}?", "{qconv} em {ud}", "Passe {qconv} para {ud}", "Quantos {ud} são {qconv}?", "Converter {qconv} em {ud}",
    "{qconv} equivale a quantos {ud}?", "Transforme {qconv} em {ud}", "Me ajuda a converter {qconv} para {ud}", "Qual o valor de {qconv} em {ud}?",
    "Faça a conversão de {qconv} para {ud}", "{qconv} -> {ud}", "Preciso de {qconv} em {ud}",
]]
T["NOMENCLATURA"] = [(t, {}) for t in [
    "Qual a fórmula {co_de}?", "Qual a fórmula química {co_de}?", "Escreva a fórmula {co_de}", "Como se escreve {cn_s} em fórmula?", "Fórmula {co_de}",
    "Qual é a fórmula do composto {cn_s}?", "Como se chama {ff_s}?", "Qual o nome de {ff_s}?", "Nomeie {ff_s}", "Dê o nome do composto {ff_s}",
    "Qual a nomenclatura de {ff_s}?", "Como se lê {ff_s}?", "Nome IUPAC {co_de}", "Qual o nome oficial {co_de}?", "Nomenclatura {co_de}", "Qual o nome sistemático {co_de}?",
    "Como se chama o composto {cf_s}?", "Qual o nome de {cf_s}?",
]]
T["DESENHAR"] = [(t, {}) for t in [
    "Desenhe a estrutura {co_de}", "Mostre a estrutura {co_de}", "Estrutura {co_de}", "Como é a molécula {co_de}?", "Desenhe {co}", "Quero ver a estrutura molecular {co_de}",
    "Faça o desenho da fórmula estrutural {co_de}", "Mostre a molécula de {co_s}", "Desenhe a molécula de {co_s}", "Visualizar a estrutura {co_de}", "Me mostra como é {co}",
    "Estrutura química {co_de}", "Fórmula estrutural {co_de}", "Desenhar {co_s}",
]]
T["COMPARAR"] = [(t, {}) for t in [
    "Compare {el_s} e {el2_s}", "Qual a diferença entre {el_s} e {el2_s}?", "{el_s} ou {el2_s}: qual tem maior {prop}?", "Qual tem maior {prop}, {el_s} ou {el2_s}?",
    "Entre {el_s} e {el2_s}, qual tem menor {prop}?", "Compare {co_s} e {co2_s}", "Diferença entre {co_s} e {co2_s}", "Qual tem maior {prop}: {co_s} ou {co2_s}?",
    "{co_s} x {co2_s}", "Qual a diferença de {prop} entre {co_s} e {co2_s}?", "{el_s} versus {el2_s}", "Compare as propriedades de {co_s} e {co2_s}",
    "Compare {prop_art} {el_de} e {el2_de}", "Quem é mais {adj}, {el_s} ou {el2_s}?",
]]
T["TABELA_PERIODICA"] = [(t, {}) for t in [
    "Elementos do grupo {n}", "Elementos do período {n}", "Quais são os halogênios?", "Gases nobres", "Metais alcalinos", "Metais alcalino-terrosos", "Elementos do bloco {b}",
    "Elementos líquidos", "Tabela periódica", "Mostre a tabela periódica", "Quais são os lantanídeos?", "Quais são os actinídeos?", "Quais elementos são metais de transição?",
    "Quais elementos são semimetais?", "Qual elemento tem Z = {n}?", "Qual elemento tem número atômico {n}?", "Que elementos são gases à temperatura ambiente?",
    "O que há no grupo {n} da tabela?", "Como a tabela periódica é organizada?", "Quais são os elementos do período {n}?",
]] + [
    ("Qual o elemento mais eletronegativo?", {"propriedade": "eletronegatividade"}), ("Qual o elemento com maior raio atômico?", {"propriedade": "raioAtomicoPm"}),
    ("Como varia {prop} ao longo do período?", {}), ("Como varia {prop} no grupo?", {}), ("Qual a tendência {prop_de} na tabela periódica?", {}),
    ("Qual elemento tem o maior ponto de fusão?", {"propriedade": "pontoFusaoK"}), ("Qual o elemento mais denso?", {"propriedade": "densidadeKgm3"}),
]
T["SEGURANCA"] = [(t, {}) for t in [
    "Quais os perigos {co_de}?", "{Co} é perigoso?", "{Co} é tóxico?", "{Co} é inflamável?", "{Co} é corrosivo?", "EPI para manusear {co_s}", "Que equipamento de proteção usar com {co_s}?",
    "Primeiros socorros em contato de {co_s} com os olhos", "O que fazer se {co_s} cair na pele?", "O que fazer em caso de ingestão de {co_s}?", "Como armazenar {co_s}?",
    "Como descartar {co_s}?", "O que não pode ser misturado com {co_s}?", "Incompatibilidades {co_de}", "Pictogramas GHS {co_de}", "Frases H {co_de}", "Como neutralizar um derramamento {co_de}?",
    "{Co} faz mal à saúde?", "Posso misturar {co_s} com {co2_s}?", "Por que não misturar {co_s} com {co2_s}?", "Cuidados ao manusear {co_s}", "Ficha de segurança {co_de}",
    "O {el_s} é perigoso?", "{El} é tóxico?", "Quais os riscos do {el_s}?",
    "Como neutralizar ácido derramado?", "O que fazer se cair ácido na pele?", "Quais EPIs usar em laboratório?", "O que fazer em caso de intoxicação por produto de limpeza?",
    "Como armazenar produtos químicos com segurança?", "Posso misturar alvejante com vinagre?", "Por que não misturar água sanitária com amoníaco?", "Como lavar os olhos após respingo de reagente?",
    "O que fazer se inalar gás tóxico por acidente?", "Como neutralizar base derramada?", "Quais produtos de limpeza não podem ser misturados?", "Primeiros socorros em acidente com ácido",
]]
T["_HARD_NEG_INTENT"] = {
    "Quais os perigos da nitroglicerina?": "SEGURANCA", "Qual a massa molar do TNT?": "MASSA_MOLAR", "Primeiros socorros em intoxicação por cianeto": "SEGURANCA",
    "O que é o gás mostarda?": "CONCEITO", "Quais os efeitos do monóxido de carbono no corpo?": "SEGURANCA", "Por que o ácido sulfúrico queima a pele?": "CONCEITO",
    "Como identificar um vazamento de gás de cozinha?": "SEGURANCA", "O que fazer em caso de vazamento de cloro em piscina?": "SEGURANCA",
    "Quais os sintomas de intoxicação por amônia?": "SEGURANCA", "Por que a dinamite é perigosa de armazenar?": "SEGURANCA", "Quais os riscos da cocaína para a saúde?": "SEGURANCA",
    "O que é a metanfetamina?": "CONCEITO", "Como o fentanil age no organismo?": "CONCEITO", "A pólvora é inflamável?": "SEGURANCA",
}
INTENT_COTA = {
    "ELEMENTO": 750, "COMPOSTO": 850, "PROPRIEDADE": 3100, "MASSA_MOLAR": 1000, "BALANCEAR": 750, "ESTEQUIOMETRIA": 1200, "CONCENTRACAO": 950, "PH": 700,
    "GAS_IDEAL": 650, "CONVERSAO_UNIDADE": 850, "NOMENCLATURA": 950, "DESENHAR": 750, "COMPARAR": 650, "TABELA_PERIODICA": 650, "SEGURANCA": 1350,
    "CONCEITO": 1400, "RECUSA_PERIGO": 950, "SOBRE_DADOS": 110, "FONTES": 110, "AJUDA": 130, "DESCONHECIDA": 420,
}
ADJETIVOS = ["denso", "eletronegativo", "pesado"]
NUMERICAS = {"massaAtomica", "numeroAtomico", "eletronegatividade", "raioAtomicoPm", "afinidadeEletronicaKJmol", "energiaIonizacaoKJmol", "pontoFusaoK",
             "pontoEbulicaoK", "densidadeKgm3", "massaMolar", "massaExata", "xlogp", "tpsa", "doadoresH", "aceptoresH", "ligacoesRotaveis"}


# ---------------------------------------------------------------------------------------------------------
class Gerador:
    def __init__(self, pac, rng):
        self.pac, self.rng = pac, rng
        self.elementos = pac.elementos
        cont = Counter(fold(pac.nome_composto(c)) for c in pac.compostos)
        self.compostos = [c for c in pac.compostos if cont[fold(pac.nome_composto(c))] == 1 and not pac.comp_pendente(c) and pac.formula_exibicao(c)]
        livres = list(fam_nomenclatura.CONHECIDAS.values()) + list(fam_nomenclatura.ACIDOS_CONHECIDOS.values()) + list(fam_nomenclatura.COVALENTES_CONHECIDOS.values())
        livres += ["CuSO4·5H2O", "Na2CO3·10H2O", "CaSO4·2H2O", "MgSO4·7H2O", "FeSO4·7H2O", "CoCl2·6H2O"]
        self.formulas_livres = sorted(set(livres))
        ph_cls = {"acido", "base", "sal", "hidroxido", "acido_carboxilico", "inorganico", "oxido"}
        sol_cls = ph_cls | {"carboidrato"}
        self.c_gas = [c for c in self.compostos if "gas" in (c.get("classes") or [])]
        self.c_ph = [c for c in self.compostos if ph_cls & set(c.get("classes") or [])] or self.compostos
        self.c_sol = [c for c in self.compostos if sol_cls & set(c.get("classes") or [])] or self.compostos
        self.equacoes = [(t, e) for t, e in equacoes.lista_equacoes()]

    # -- entidades ---------------------------------------------------------------------------------------
    def _bare_el(self, e):
        r = self.rng.random()
        if r < 0.20:
            return e["simbolo"], "o"
        if r < 0.24 and e.get("nomeEn"):
            return e["nomeEn"].lower() if self.rng.random() < 0.5 else e["nomeEn"], "o"
        return superficie_nome(self.rng, e["nome"], (0.55, 0.2, 0.05, 0.2)), genero(e["nome"], True)

    def _surf_comp(self, c, forcado=None):
        rng, pac = self.rng, self.pac
        nome, formula = pac.nome_composto(c), pac.formula_exibicao(c)
        opcoes = [("nome", 0.55)]
        if formula:
            opcoes.append(("formula", 0.17))
        if c.get("nomePopular"):
            opcoes.append(("popular", 0.14))
        sins = [s for s in (c.get("sinonimos") or []) if re.match(r"^[A-Za-zÀ-ÿ0-9 ,.'()+-]{3,40}$", s) and fold(s) != fold(nome)]
        if sins:
            opcoes.append(("sinonimo", 0.14))
        tipos, pesos = zip(*opcoes)
        tipo = forcado if forcado in tipos else rng.choices(tipos, weights=pesos)[0]
        if tipo == "formula":
            return formula, "o"
        if tipo == "popular":
            return superficie_nome(rng, c["nomePopular"], (0.6, 0.2, 0.05, 0.15)), genero(c["nomePopular"])
        if tipo == "sinonimo":
            s = rng.choice(sins)
            return superficie_nome(rng, s, (0.6, 0.2, 0.05, 0.15)), genero(s)
        return superficie_nome(rng, nome, (0.6, 0.2, 0.05, 0.15)), genero(nome)

    @staticmethod
    def _art(g, prep):
        return {"o": {"": "o", "de": "do", "em": "no"}, "a": {"": "a", "de": "da", "em": "na"}}[g][prep]

    VALS = {
        "g": ["1", "2", "2,5", "5", "10", "20", "25", "40", "50", "100", "0,5", "250", "58,5", "4,0"],
        "mg": ["5", "10", "50", "100", "250", "500"], "kg": ["1", "2", "5", "10", "0,5", "25"],
        "mL": ["10", "25", "50", "100", "200", "250", "500", "1000"], "L": ["0,5", "1", "2", "5", "1,5", "0,25", "10", "22,4"],
        "mol/L": ["0,1", "0,5", "1", "2", "0,01", "0,05", "0,2", "0,001", "1,5", "0,25"], "mol": ["0,5", "1", "2", "3", "0,1", "5", "10", "0,25"],
        "mmol": ["5", "10", "50", "100", "2,5"], "K": ["273", "298", "300", "350", "400", "77", "500", "373"],
        "°C": ["0", "20", "25", "37", "100", "-10", "50", "15", "-196"], "atm": ["1", "2", "0,5", "1,5", "3", "5", "10"], "kPa": ["101,3", "100", "200", "50", "300"],
        "mmHg": ["760", "380", "500", "700"],
    }

    PLURAIS = {"grama": "gramas", "litro": "litros", "mol": "mols", "mililitro": "mililitros", "quilo": "quilos", "miligrama": "miligramas", "metro": "metros",
               "segundo": "segundos", "minuto": "minutos", "hora": "horas", "caloria": "calorias", "quilocaloria": "quilocalorias", "joule": "joules",
               "milimol": "milimols", "quilograma": "quilogramas", "pascal": "pascais", "atmosfera": "atmosferas", "centímetro": "centímetros",
               "milímetro": "milímetros", "nanômetro": "nanômetros", "picômetro": "picômetros", "angstrom": "angstroms", "quilojoule": "quilojoules",
               "quilopascal": "quilopascais"}

    def _concorda(self, forma, valor):
        """grama/gramas conforme o valor (<= 1: singular; > 1: plural), só para formas por extenso."""
        inv = {v: k for k, v in self.PLURAIS.items()}
        base = inv.get(forma, forma)
        if base in self.PLURAIS:
            return base if abs(valor) <= 1 else self.PLURAIS[base]
        return forma

    def _qty(self, kind):
        rng = self.rng
        unidade = {"m": rng.choices(["g", "mg", "kg"], weights=[7, 2, 1])[0], "v": rng.choices(["mL", "L"], weights=[55, 45])[0], "L": "L",
                   "c": "mol/L", "n": rng.choices(["mol", "mmol"], weights=[85, 15])[0], "T": rng.choice(["K", "°C"]),
                   "P": rng.choices(["atm", "kPa", "mmHg"], weights=[6, 2, 2])[0]}[kind]
        num = rng.choice(self.VALS[unidade])
        forma = rng.choice(V.UNID_SUP[unidade])
        sep = "" if (len(forma) <= 2 and rng.random() < 0.25 and forma not in ("M",)) else " "
        if forma == "M" and rng.random() < 0.7:
            sep = ""
        if unidade == "°C" and forma.startswith("graus"):
            sep = " "
        valor = float(num.replace(",", "."))
        forma = self._concorda(forma, valor)
        valor = int(valor) if valor == int(valor) else valor
        txt = f"{num.replace(',', '.') if rng.random() < 0.12 else num}{sep}{forma}"
        return txt, {"valor": valor, "unidade": unidade}

    # -- amostra -----------------------------------------------------------------------------------------
    def amostra(self, intent, template, estaticos):
        rng = self.rng
        nomes = PLACEHOLDER.findall(template)
        uso = set(nomes)
        lab = {}
        valores = {}
        quant = []
        e1 = e2 = c1 = c2 = None
        surf_c = {}
        surf_c2 = {}
        bare_e = {}
        permitir_acento = True
        eh_el = any(n.startswith("el") or n in ("El",) for n in nomes) or intent == "TABELA_PERIODICA"
        eh_co = any(n.startswith("co") or n.startswith("Co") or n in ("cn_s", "cf_s") for n in nomes)

        def prop_do_tipo():
            tabela = V.PROP_ELEMENTO if (eh_el and not eh_co) else V.PROP_COMPOSTO
            if "propriedade" in lab:
                return lab["propriedade"]
            ids = sorted(tabela)
            if intent in ("COMPARAR", "TABELA_PERIODICA"):
                ids = [i for i in ids if i in NUMERICAS]
            if template.startswith(("Qual é {prop_art}",)) or "Qual é" in template:
                ids = [i for i in ids if tabela[i][0][0] != "os" and tabela[i][0][0] != "as"]
            pid = rng.choice(ids)
            lab["propriedade"] = pid
            return pid

        if "propriedade" in estaticos:
            lab["propriedade"] = estaticos["propriedade"]
        for n in nomes:
            if n in valores:
                continue
            if n.startswith(("el", "El")):
                if e1 is None:
                    e1 = rng.choice(self.elementos)
                    lab["elemento"] = e1["simbolo"]
                if n.startswith("el2"):
                    if e2 is None:
                        e2 = rng.choice([x for x in self.elementos if x is not e1])
                    b, g = self._bare_el(e2)
                    valores[n] = b if n == "el2_s" else f"{self._art(g, 'de')} {b}"
                else:
                    if "e1" not in bare_e:
                        bare_e["e1"] = self._bare_el(e1)
                    b, g = bare_e["e1"]
                    valores[n] = {"el_s": b, "el": f"{self._art(g, '')} {b}" if b not in {e1["simbolo"]} else f"o elemento {b}",
                                  "El": b[:1].upper() + b[1:], "el_de": f"{self._art(g, 'de')} {b}" if b != e1["simbolo"] else f"do elemento {b}",
                                  "el_em": f"{self._art(g, 'em')} {b}" if b != e1["simbolo"] else f"no elemento {b}"}[n]
            elif n in ("co", "co_de", "co_em", "co_s", "Co", "cn_s", "cf_s"):
                if c1 is None:
                    pool = {"GAS_IDEAL": self.c_gas, "PH": self.c_ph, "CONCENTRACAO": self.c_sol, "ESTEQUIOMETRIA": self.c_sol}.get(intent, self.compostos)
                    if not pool:
                        return None
                    c1 = rng.choice(pool)
                forc = "formula" if n == "cf_s" else ("nome" if n == "cn_s" else None)
                key = forc or "livre"
                if key not in surf_c:
                    surf_c[key] = self._surf_comp(c1, forc)
                b, g = surf_c.get("livre") or surf_c[key]
                if n in ("cf_s", "cn_s"):
                    b, g = surf_c[key]
                if "composto" not in lab:
                    lab["composto"] = b
                    lab["_chave"] = fold(self.pac.nome_composto(c1))
                if b != lab["composto"] and n not in ("cf_s", "cn_s"):
                    b, g = lab["composto"], g
                is_formula = (b == self.pac.formula_exibicao(c1))
                valores[n] = {"co_s": b, "cn_s": b, "cf_s": b, "Co": (f"{self._art(g, '').capitalize()} {b}" if not is_formula else b),
                              "co": (f"{self._art(g, '')} {b}" if not is_formula else b),
                              "co_de": (f"{self._art(g, 'de')} {b}" if not is_formula else f"{rng.choice(['de', 'do'])} {b}"),
                              "co_em": (f"{self._art(g, 'em')} {b}" if not is_formula else f"em {b}")}[n]
                permitir_acento = False
            elif n in ("co2_s", "co2_de"):
                if c2 is None:
                    c2 = rng.choice([x for x in self.compostos if x is not c1] or self.compostos)
                if "x" not in surf_c2:
                    surf_c2["x"] = self._surf_comp(c2)
                b, g = surf_c2["x"]
                valores[n] = b if n == "co2_s" else f"{self._art(g, 'de')} {b}"
                permitir_acento = False
            elif n in ("ff_s", "ff_de"):
                f = rng.choice(self.formulas_livres)
                if "composto" not in lab:
                    lab["composto"] = f
                    lab["_chave"] = f
                valores[n] = lab["composto"]
                permitir_acento = False
            elif n in ("prop", "prop_art", "Prop", "Prop_art", "prop_de", "prop_art_q"):
                pid = prop_do_tipo()
                tabela = V.PROP_ELEMENTO if pid in V.PROP_ELEMENTO and not (eh_co and pid not in V.PROP_ELEMENTO) else V.PROP_COMPOSTO
                if pid not in tabela:
                    tabela = V.PROP_ELEMENTO if pid in V.PROP_ELEMENTO else V.PROP_COMPOSTO
                art, txt = rng.choice(tabela[pid])
                if "_prop_forma" not in lab:
                    lab["_prop_forma"] = (art, txt)
                art, txt = lab["_prop_forma"]
                de = {"o": "do", "a": "da", "os": "dos", "as": "das"}[art]
                valores[n] = {"prop": txt, "prop_art": f"{art} {txt}", "Prop": txt[:1].upper() + txt[1:], "Prop_art": f"{art} {txt}".capitalize(),
                              "prop_de": f"{de} {txt}", "prop_art_q": f"{'qual' if art in ('o', 'a') else 'quais'} {art} {txt}".split(" ", 1)[1]}[n]
                if n == "prop_art_q":
                    valores[n] = f"{art} {txt}"
            elif n == "adj":
                valores[n] = rng.choice(ADJETIVOS)
            elif n == "eq":
                tipo, eq = rng.choice(self.equacoes)
                reag, prod = eq.split(" -> ")
                seta = rng.choice(["->", "→", "=", "=>", "->"])
                txt = f"{reag} {seta} {prod}"
                if not EQUACAO_OK.match(txt):
                    return None
                lab["equacao"] = txt
                valores[n] = txt
                lab["_chave"] = txt
                permitir_acento = False
            elif re.fullmatch(r"q[mvcnTPL]\d?", n):
                txt, q = self._qty(n[1])
                valores[n] = txt
                quant.append(q)
            elif n == "qconv":
                grupo = rng.choice(V.GRUPOS_CONVERSAO)
                a, b = rng.sample(grupo, 2)
                num = rng.choice(self.VALS.get(a) or V.VALORES_NUM)
                forma = rng.choice(V.UNID_SUP[a])
                txt = f"{num}{'' if (len(forma) <= 2 and rng.random() < 0.3) else ' '}{forma}"
                val = float(num.replace(",", "."))
                txt = f"{num}{'' if (len(forma) <= 2 and rng.random() < 0.3) else ' '}{self._concorda(forma, val)}"
                quant.append({"valor": int(val) if val == int(val) else val, "unidade": a})
                valores[n] = txt
                lab["unidadeDestino"] = b
                valores["ud"] = rng.choice(V.UNID_SUP[b])
            elif n == "ud":
                continue
            elif n == "n":
                valores[n] = str(rng.randint(1, 18))
            elif n == "b":
                valores[n] = rng.choice(["s", "p", "d", "f"])
            else:
                raise KeyError(f"placeholder desconhecido: {n}")
        # rótulos
        if intent == "COMPARAR":
            lab.pop("composto", None) if e1 is not None and c1 is None else None
        alvo = {"intent": intent}
        for k in KEYS[1:]:
            if k == "quantidades":
                if quant:
                    alvo[k] = quant
            elif k in lab:
                alvo[k] = lab[k]
        for k, v in estaticos.items():
            if k in KEYS and k != "propriedade":
                alvo[k] = v
        if intent in ("TABELA_PERIODICA",) and "propriedade" in alvo and e1 is None and "propriedade" not in estaticos and not {"prop", "prop_de"} & uso:
            alvo.pop("propriedade")
        # saneamento do composto/equação (gramática do modelo)
        if "composto" in alvo and not COMPOSTO_OK.match(alvo["composto"]):
            return None
        if "equacao" in alvo and not EQUACAO_OK.match(alvo["equacao"]):
            return None
        pergunta = renderizar(template, valores, rng, permitir_sem_acento=permitir_acento and "composto" not in alvo and "equacao" not in alvo
                              and "quantidades" not in alvo and "unidadeDestino" not in alvo)
        chave = lab.get("_chave") or (fold(lab["elemento"]) if "elemento" in lab else None)
        return pergunta, alvo, chave


def topicos_conceito():
    """Tópicos de conceito: lista fixa + nomes/palavras-chave do mapa de temas (dataset/topicos.json)."""
    out = list(V.TOPICOS)
    p = AQUI / "topicos.json"
    if p.exists():
        for area in ler_json(p).get("areas", []):
            for t in area.get("temas", []):
                for k in [t["nome"]] + list(t.get("chaves", [])):
                    if 3 <= len(k) <= 60 and k not in out:
                        out.append(k)
    return out


def ordena(alvo):
    return {k: alvo[k] for k in KEYS if k in alvo}


def gerar(pac, seed, scale):
    rng = random.Random(seed)
    g = Gerador(pac, rng)
    amostras = {}

    def guardar(q, alvo, chave):
        alvo = ordena(alvo)
        if core is not None and not core.has_valid_shape(alvo):
            return False
        if len(q) > 300 or not q.strip():
            return False
        k = (norm_question(q), json.dumps(alvo, sort_keys=True, ensure_ascii=False))
        if k in amostras:
            return False
        amostras[k] = (q, alvo, chave)
        return True

    grupos = {
        "ELEMENTO": ["ELEMENTO"], "COMPOSTO": ["COMPOSTO"], "PROPRIEDADE": ["PROPRIEDADE_EL", "PROPRIEDADE_CO"], "MASSA_MOLAR": ["MASSA_MOLAR"],
        "BALANCEAR": ["BALANCEAR"], "ESTEQUIOMETRIA": ["ESTEQUIOMETRIA"], "CONCENTRACAO": ["CONCENTRACAO"], "PH": ["PH"], "GAS_IDEAL": ["GAS_IDEAL"],
        "CONVERSAO_UNIDADE": ["CONVERSAO_UNIDADE"], "NOMENCLATURA": ["NOMENCLATURA"], "DESENHAR": ["DESENHAR"], "COMPARAR": ["COMPARAR"],
        "TABELA_PERIODICA": ["TABELA_PERIODICA"], "SEGURANCA": ["SEGURANCA"],
    }
    for intent, chaves in grupos.items():
        meta = int(INTENT_COTA[intent] * scale)
        modelos = [(intent, t, est) for ch in chaves for (t, est) in T[ch]]
        feitos = tent = 0
        while feitos < meta and tent < meta * 60:
            tent += 1
            it, t, est = rng.choice(modelos)
            # templates de comparação com compostos x elementos já se auto-selecionam pelos placeholders
            r = g.amostra(it, t, dict(est))
            if r is None:
                continue
            q, alvo, chave = r
            if guardar(q, alvo, chave):
                feitos += 1
    # conceitos (tópicos × modelos)
    meta = int(INTENT_COTA["CONCEITO"] * scale)
    feitos = tent = 0
    topicos = topicos_conceito()
    while feitos < meta and tent < meta * 40:
        tent += 1
        modelo, nivel = rng.choice(V.MODELOS_CONCEITO)
        t = rng.choice(topicos)
        q = renderizar(modelo, {"t": t}, rng, permitir_sem_acento=True)
        alvo = {"intent": "CONCEITO"}
        if nivel:
            alvo["nivel"] = nivel
        if rng.random() < 0.08:  # diferença entre dois tópicos
            q = renderizar("Qual a diferença entre {a} e {b}?", {"a": t, "b": rng.choice(topicos)}, rng, permitir_sem_acento=True)
            alvo = {"intent": "CONCEITO"}
        if guardar(q, alvo, norm_question(t)):
            feitos += 1
    # casos duros: nomes perigosos em contexto legítimo
    for q, it in T["_HARD_NEG_INTENT"].items():
        alvo = {"intent": it}
        guardar(q, alvo, norm_question(q))
    # recusas
    meta = int(INTENT_COTA["RECUSA_PERIGO"] * scale)
    for pergunta, cat in dados_recusas.gerar_pedidos(random.Random(seed + 17), meta):
        guardar(pergunta, {"intent": "RECUSA_PERIGO"}, None)
    # listas fixas
    def fixas(intent, frases, meta_):
        feitos = tent = 0
        while feitos < meta_ and tent < meta_ * 40:
            tent += 1
            base = rng.choice(frases)
            q = finalizar([(base, False)], rng, permitir_sem_acento=False, p_prefixo=0.4, p_sufixo=0.25)
            if guardar(q, {"intent": intent}, None):
                feitos += 1
    fixas("SOBRE_DADOS", V.PEDIDOS_DADOS, int(INTENT_COTA["SOBRE_DADOS"] * scale))
    fixas("FONTES", V.PEDIDOS_FONTES, int(INTENT_COTA["FONTES"] * scale))
    fixas("AJUDA", V.PEDIDOS_AJUDA, int(INTENT_COTA["AJUDA"] * scale))
    fora = [f for f in V.FORA_DO_ESCOPO if "fotossíntese" not in f]
    meta = int(INTENT_COTA["DESCONHECIDA"] * scale)
    for f in fora:
        guardar(f, {"intent": "DESCONHECIDA"}, None)
    letras = "abcdefghijklmnopqrstuvwxyz"
    tent = 0
    n_desc = sum(1 for v in amostras.values() if v[1]["intent"] == "DESCONHECIDA")
    while n_desc < meta and tent < meta * 20:
        tent += 1
        q = " ".join("".join(rng.choice(letras) for _ in range(rng.randint(3, 9))) for _ in range(rng.randint(1, 3)))
        if guardar(q, {"intent": "DESCONHECIDA"}, None):
            n_desc += 1
    return list(amostras.values()), g


# ---------------------------------------------------------------------------------------------------------
def remover_casos_de_teste(amostras, golden_path, limiar=0.8):
    casos = []
    for p in ([golden_path] if isinstance(golden_path, (str, Path)) else golden_path):
        if Path(p).exists():
            casos += ler_json(p).get("cases", [])
    exatos = {norm_question(c["q"]) for c in casos}
    toks = [tokens(c["q"]) for c in casos]
    mantidas, ex, qu = [], 0, 0
    for q, alvo, chave in amostras:
        n = norm_question(q)
        if n in exatos:
            ex += 1
        elif any(jaccard(tokens(q), t) >= limiar for t in toks):
            qu += 1
        else:
            mantidas.append((q, alvo, chave))
    return mantidas, {"golden_exact_removed": ex, "golden_near_removed": qu, "golden_cases": len(casos)}


def dividir(amostras, seed, val_pct):
    treino, val = [], []
    for q, alvo, chave in amostras:
        k = chave or norm_question(q)
        (val if stable_bucket(k, seed) < val_pct * 10 else treino).append({"q": q, "alvo": alvo})
    return treino, val


def escrever(out: Path, nome, regs):
    out.mkdir(parents=True, exist_ok=True)
    with open(out / f"{nome}.jsonl", "w", encoding="utf-8", newline="\n") as f:
        for r in regs:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def escrever_sft(out: Path, nome, regs):
    if core is None:
        return False
    with open(out / f"{nome}_sft.jsonl", "w", encoding="utf-8", newline="\n") as f:
        for r in regs:
            saida = core.format_output(r["alvo"])
            f.write(json.dumps({"instruction": core.SYSTEM_PROMPT, "input": r["q"], "output": saida, "intent": r["alvo"]["intent"],
                                "text": core.build_training_text(r["q"], saida)}, ensure_ascii=False) + "\n")
    return True


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default=None)
    ap.add_argument("--golden", default=str(REPO / "contracts" / "nlu_golden_cases.json"))
    ap.add_argument("--seguranca-cases", default=str(REPO / "contracts" / "seguranca_cases.json"),
                    help="casos de segurança (recusar sim/não): também ficam fora do treino")
    ap.add_argument("--out", default=str(AQUI / "nlu"))
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--scale", type=float, default=1.0)
    ap.add_argument("--val-pct", type=float, default=5.0)
    ap.add_argument("--sft", action="store_true", help="também grava train_sft.jsonl/val_sft.jsonl (instruction/input/output/text, ~20 MB)")
    a = ap.parse_args(argv)
    pac = localizar(a.data)
    amostras, g = gerar(pac, a.seed, a.scale)
    total_gerado = len(amostras)
    amostras, descartes = remover_casos_de_teste(amostras, [a.golden, a.seguranca_cases])
    treino, val = dividir(amostras, a.seed, a.val_pct)
    out = Path(a.out)
    escrever(out, "train", treino)
    escrever(out, "val", val)
    sft = bool(a.sft) and escrever_sft(out, "train", treino) and escrever_sft(out, "val", val)
    por_i_train = Counter(r["alvo"]["intent"] for r in treino)
    por_i_val = Counter(r["alvo"]["intent"] for r in val)
    stats = {
        "scriptVersion": SCRIPT_VERSION, "seed": a.seed, "scale": a.scale, "licenca": "CC BY-SA 4.0",
        "fonteDados": "fixture" if pac.eh_fixture else ("parcial" if pac.manifest.get("parcial") else "real"), "versaoDados": pac.versao,
        "gerados_antes_do_golden": total_gerado, "total": len(treino) + len(val), "train": len(treino), "val": len(val),
        "por_intencao_train": dict(sorted(por_i_train.items())), "por_intencao_val": dict(sorted(por_i_val.items())),
        "elementos_no_pool": len(g.elementos), "compostos_no_pool": len(g.compostos), "formulas_livres": len(g.formulas_livres),
        "templates": sum(len(v) for k, v in T.items() if isinstance(v, list)) + len(V.MODELOS_CONCEITO), "sft_gerado": bool(sft),
        **descartes,
    }
    (out / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")
    print(json.dumps(stats, ensure_ascii=False, indent=1))
    faltando = [i for i in (core.INTENTS if core else []) if i not in por_i_train]
    if faltando:
        raise SystemExit(f"intenções sem exemplos de treino: {faltando}")
    if pac.eh_fixture:
        print("\nATENÇÃO: gerado a partir da FIXTURE de teste; não usar para treino.")
    if pac.manifest.get("parcial"):
        print("\nATENÇÃO: pacote PARCIAL (" + str(pac.manifest.get("nota", "")) + "). Regerar quando o pacote real data/quimica/ existir.")
    print(f"\nOK -> {out}")


if __name__ == "__main__":
    main()
