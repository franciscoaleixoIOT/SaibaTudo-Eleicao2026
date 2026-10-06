#!/usr/bin/env python3
"""Gera a lista de FORMULAÇÕES para o retreino v2.2 (uma pergunta por linha, sem rótulo).

Por que existe: o modelo v2.1 acerta 78,4 % das intenções nos casos de referência e, ao vivo (06/10/2026), devolveu
DESCONHECIDA para perguntas comuns ("haverá 2º turno para presidente?", "que horas abre a votação?", "posso votar de
bermuda?"). As intenções fracas tinham de 9 a 19 modelos de frase cada no gerador: pouca variedade de como as pessoas
escrevem. Este script amplia a variedade POR ASSUNTO (roupa e objetos na votação, documentos, horários, 2º turno,
resultados, sites oficiais), em registro formal e coloquial, com e sem acento.

O que NÃO faz: não copia nem parafraseia os casos de contracts/nlu_golden_cases.json (o gerador do dataset ainda remove
os idênticos e os quase idênticos) e não escreve rótulo nenhum. O rótulo vem de label_extra.mjs, que usa o NLU
determinístico dos clientes sobre o pacote oficial; o que ele não entende é descartado. 20 % das perguntas caem no
balde de holdout (holdout.py) e nunca treinam: servem para medir.

Uso:  python backend/retrain/extra/gerar_formas_v22.py > backend/retrain/extra/formas_v22_2026-10-06.txt
"""
import itertools
import json
import random
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SEED = 20261006

ROUPAS = ["bermuda", "chinelo", "short", "regata", "boné", "sandália", "roupa de academia", "camisa de time", "camiseta de candidato",
          "camiseta com número de candidato", "adesivo de candidato na roupa", "broche de partido", "saia curta", "roupa de praia",
          "óculos escuros", "chapéu", "uniforme do trabalho", "camisa do Brasil", "moletom com capuz", "máscara"]
OBJETOS = ["celular", "relógio inteligente", "câmera", "fone de ouvido", "mochila", "bolsa", "tablet", "caneta", "cola com os números",
           "papel com os números dos candidatos", "meu filho pequeno", "um acompanhante", "meu cachorro", "bandeira de partido",
           "santinho", "guarda-chuva", "garrafa de água", "arma"]
F_ROUPA = ["Posso votar de {x}?", "É permitido votar de {x}?", "Pode votar de {x}?", "Dá para votar usando {x}?", "Tem problema ir votar de {x}?",
           "posso ir votar de {x}", "pode entrar na seção de {x}?", "É proibido votar de {x}?", "Vão me barrar se eu for votar de {x}?",
           "Deixam votar de {x}?"]
F_OBJETO = ["Posso entrar na cabine com {x}?", "É permitido levar {x} para a cabine de votação?", "Pode levar {x} na hora de votar?",
            "É proibido entrar na seção eleitoral com {x}?", "posso levar {x} pra votar", "Posso usar {x} dentro da cabine?",
            "Tenho que deixar {x} com o mesário?", "Pode entrar com {x} na sala de votação?"]
URNA = ["Como funciona a urna eletrônica?", "A urna eletrônica é segura?", "A urna é confiável?", "Como é a ordem de votação na urna?",
        "Em que ordem eu voto na urna?", "Qual cargo aparece primeiro na urna?", "Quantos dígitos tem o número de deputado estadual?",
        "Quantos números eu digito para senador?", "Quantos dígitos para governador?", "Quantos dígitos tem o voto para presidente?",
        "Como digitar o número do candidato na urna?", "Como se vota na urna eletrônica?", "Qual o passo a passo para votar?",
        "passo a passo da urna", "como votar", "como eu voto na urna", "A urna imprime comprovante do voto?", "Tem voto impresso em 2026?",
        "Posso tirar foto do meu voto?", "Pode filmar a urna na hora de votar?", "Posso fazer selfie na cabine de votação?",
        "É permitido fotografar a urna?", "Como corrigir o voto se eu digitar errado?", "O que faz a tecla corrige?",
        "Para que serve o botão confirma da urna?", "A urna pode ser fraudada?", "Dá para auditar a urna eletrônica?",
        "segurança da urna eletrônica", "quantos digitos deputado federal", "ordem dos cargos na urna"]
LOCAL = ["Onde eu voto?", "onde voto", "Onde vou votar este ano?", "Como descubro meu local de votação?", "Qual é a minha seção eleitoral?",
         "Como saber minha zona eleitoral?", "Como consulto meu local de votação?", "meu local de votação mudou?", "Onde fica minha seção?",
         "Preciso levar o título de eleitor para votar?", "Posso votar sem o título?", "Perdi meu título, consigo votar?",
         "Como baixar o e-título?", "O e-título vale como documento para votar?", "Dá para votar só com o e-título?",
         "Qual documento preciso levar para votar?", "Quais documentos são aceitos na votação?", "Posso votar com a carteira de motorista?",
         "A CNH digital serve para votar?", "Posso votar com o RG antigo?", "Passaporte vale para votar?", "Carteira de trabalho vale como documento?",
         "Posso votar com documento vencido?", "Certidão de nascimento serve para votar?", "Como justificar a ausência na votação?",
         "Como justifico o voto pelo celular?", "Estou viajando, como justifico?", "Não vou poder votar, o que eu faço?",
         "Até quando posso justificar o voto?", "Posso votar em outra cidade?", "Como funciona o voto em trânsito?",
         "Dá para votar fora do meu domicílio eleitoral?", "Como transferir o título de eleitor?", "Como regularizar meu título?",
         "Meu título está cancelado, posso votar?", "Como consultar a situação do meu título?", "A biometria é obrigatória para votar?",
         "Não fiz a biometria, posso votar?", "O que acontece se minha digital não for reconhecida?", "Como funciona a identificação por biometria?",
         "onde consulto minha zona e seção", "qual meu colégio eleitoral", "titulo de eleitor perdido como votar", "justificar voto como faz"]
CALENDARIO = ["Quando é a eleição?", "Que dia é a eleição?", "Qual a data da eleição de 2026?", "Que dia é a votação?", "quando vai ser a eleição",
              "Quando é o segundo turno?", "Que dia é o 2º turno?", "Qual a data do segundo turno?", "Quando foi o primeiro turno?",
              "Que horas começa a votação?", "Que horas abre a seção eleitoral?", "Que horas fecha a votação?", "Até que horas posso votar?",
              "Qual o horário da votação?", "A votação vai até que horas?", "horario de votacao", "que horas termina a eleição",
              "Qual o horário de votação no Acre?", "O horário de votação é o de Brasília?", "Quando sai o resultado da eleição?",
              "Quando é a posse do presidente?", "Que dia os eleitos tomam posse?", "Quando é a diplomação dos eleitos?",
              "Quando acaba a propaganda eleitoral?", "Até quando vai a campanha?", "Quais são os prazos do calendário eleitoral?",
              "calendário eleitoral 2026", "datas da eleição", "Quando é o dia da eleição este ano?", "Que dia cai o segundo turno?",
              "Em que dia da semana é a eleição?", "quando tem eleição de novo", "prazo para justificar o voto", "Quando começa a apuração?"]
FONTES = ["Qual o site oficial do TSE?", "Onde consulto os sites oficiais da eleição?", "Qual o link oficial dos resultados?",
          "Onde encontro os dados oficiais dos candidatos?", "Qual o site do TRE do meu estado?", "Qual o site do TRE de São Paulo?",
          "Quem fiscaliza as urnas?", "Quem organiza as eleições no Brasil?", "O que faz o TSE?", "O que faz um TRE?",
          "Para que serve a Justiça Eleitoral?", "Onde denunciar compra de votos?", "Como denunciar propaganda irregular?",
          "Onde denuncio fake news sobre a eleição?", "Como denunciar crime eleitoral?", "Qual o canal para denunciar desinformação?",
          "Qual o link do DivulgaCand?", "Onde vejo a prestação de contas no site oficial?", "links oficiais do tse", "site oficial da justiça eleitoral",
          "Onde consulto informações oficiais sobre a eleição?", "Quem fiscaliza a apuração dos votos?", "Qual órgão cuida das eleições?"]

DOCS = ["a CNH", "a carteira de motorista", "a CNH vencida", "o RG", "a identidade", "o passaporte", "a carteira de trabalho", "o título de eleitor",
        "o e-título", "a certidão de nascimento", "a carteira da OAB", "o certificado de reservista", "um documento sem foto", "a CNH digital",
        "o RG digital", "um documento vencido"]
F_DOC = ["Posso votar com {d}?", "{d} vale para votar?", "Aceitam {d} na votação?", "Dá para votar só com {d}?", "Preciso levar {d} para votar?",
         "posso votar apresentando {d}", "O mesário aceita {d}?", "Serve {d} como documento na hora de votar?"]
HORA_VERBO = ["abre", "fecha", "começa", "termina", "encerra"]
HORA_OBJ = ["a votação", "a seção eleitoral", "a eleição", "o local de votação", "a urna"]
F_HORA = ["Que horas {v} {o}?", "A que horas {v} {o}?", "Até que horas vai {o}?", "que horas {v} {o} no domingo", "Qual o horário em que {v} {o}?",
          "Sabe me dizer que horas {v} {o}?"]

CARGOS_EXEC = ["presidente", "governador", "o governo", "a presidência", "governador do estado"]
UFS = ["no Acre", "em São Paulo", "em SP", "no Rio de Janeiro", "no RJ", "em Minas Gerais", "em MG", "na Bahia", "no Amazonas", "no DF",
       "no Distrito Federal", "no Paraná", "em Pernambuco", "no Ceará", "no Rio Grande do Sul", "em Goiás", "no Tocantins", "no Espírito Santo",
       "no Rio Grande do Norte", "em Santa Catarina", "no Pará", "no Maranhão"]
T2 = ["segundo turno", "2º turno", "2o turno", "2 turno", "segundo turno"]
F_2T_CARGO = ["Haverá {t} para {c}?", "Vai ter {t} para {c}?", "Vai haver {t} para {c}?", "Terá {t} para {c}?", "Tem {t} para {c}?",
              "A eleição para {c} vai para o {t}?", "Quem disputa o {t} para {c}?", "Quem foi para o {t} de {c}?", "{c} vai ter {t}?",
              "vai ter {t} pra {c}", "Quem passou para o {t} na eleição de {c}?", "Quais candidatos estão no {t} para {c}?",
              "Teve {t} para {c}?", "Já se sabe se haverá {t} para {c}?", "Quem enfrenta quem no {t} para {c}?"]
F_2T_UF = ["Vai ter {t} {u}?", "Haverá {t} {u}?", "Tem {t} {u}?", "Quem está no {t} {u}?", "Quem disputa o {t} {u}?", "{t} {u}",
           "Quem passou para o {t} {u}?", "Vai haver {t} para governador {u}?", "Haverá {t} para governador {u}?",
           "Quem foi para o {t} para governador {u}?", "terá {t} {u}?"]
F_2T_SOLTO = ["Vai ter {t}?", "Haverá {t}?", "Quem vai para o {t}?", "Quem está no {t}?", "Quais estados vão ter {t}?", "Onde vai ter {t}?",
              "Quem disputa o {t}?", "tem {t} esse ano?", "Vai ter {t} para deputado?", "Senador tem {t}?", "Existe {t} para senador?",
              "Como funciona o {t}?", "Quando um candidato ganha sem {t}?", "Quem ficou para o {t}?"]

CARGOS_RES = ["presidente", "governador", "senador", "deputado federal", "deputado estadual"]
F_RES_CARGO_UF = ["Quem ganhou para {c} {u}?", "Quem foi eleito {c} {u}?", "Quem venceu a eleição para {c} {u}?", "Resultado para {c} {u}",
                  "Quem lidera para {c} {u}?", "Quem está na frente para {c} {u}?", "Apuração para {c} {u}", "resultado {c} {u}",
                  "Quem são os eleitos para {c} {u}?", "Quem foram os mais votados para {c} {u}?"]
F_RES_CARGO = ["Quem ganhou a eleição para {c}?", "Quem foi eleito {c}?", "Resultado da eleição para {c}", "Quem lidera a apuração para {c}?",
               "resultado para {c}", "Como está a apuração para {c}?", "Quem está ganhando para {c}?", "Quem venceu para {c}?"]
F_RES_UF = ["Resultado da eleição {u}", "Como foi a apuração {u}?", "Quem ganhou {u}?", "Quem foi eleito {u}?", "apuração {u}",
            "Quem foram os eleitos {u}?"]
F_RES_NOME = ["Quantos votos teve {n}?", "Quantos votos {n} recebeu?", "{n} foi eleito?", "{n} ganhou?", "Qual o percentual de votos de {n}?",
              "Como foi a votação de {n}?", "quantos votos o {n} teve", "{n} foi para o segundo turno?", "A {n} foi eleita?", "{n} se elegeu?"]
F_NOME_OUTROS = ["{n} é ficha limpa?", "O {n} é ficha limpa?", "A {n} é ficha limpa?", "{n} pode ser candidato?", "Qual o patrimônio de {n}?",
                 "Quanto {n} declarou de bens?", "Quais as propostas de {n}?", "Qual o plano de governo de {n}?", "Quanto {n} gastou na campanha?",
                 "Quem é {n}?", "Fale sobre {n}", "Qual o número de {n}?", "Quem é o vice de {n}?", "me fale do {n}"]


def nomes_majoritarios(max_n=60):
    """Nomes de urna de candidatos a Presidente e Governador (do pacote oficial), para as frases com {n}."""
    nomes = []
    base = REPO / "data" / "eleicoes2026" / "candidatos"
    for arq in sorted(base.glob("*.json")):
        for c in json.loads(arq.read_text(encoding="utf-8")):
            if c.get("cargo") in ("PRESIDENTE", "GOVERNADOR") and c.get("naUrna", True) and c.get("nomeUrna"):
                nomes.append(c["nomeUrna"].title())
    return sorted(set(nomes))[:10_000][:max_n * 4]


def main():
    rnd = random.Random(SEED)
    out = []

    def amostra(frames, slots, n):
        combos = list(itertools.product(frames, *slots.values()))
        rnd.shuffle(combos)
        for frame, *vals in combos[:n]:
            out.append(frame.format(**dict(zip(slots.keys(), vals))))

    amostra(F_ROUPA, {"x": ROUPAS}, 120)
    amostra(F_OBJETO, {"x": OBJETOS}, 100)
    out.extend(URNA + LOCAL + CALENDARIO + FONTES)
    amostra(F_DOC, {"d": DOCS}, 90)
    amostra(F_HORA, {"v": HORA_VERBO, "o": HORA_OBJ}, 70)
    amostra(F_2T_CARGO, {"t": T2, "c": CARGOS_EXEC}, 110)
    amostra(F_2T_UF, {"t": T2, "u": UFS}, 130)
    amostra(F_2T_SOLTO, {"t": T2}, 50)
    amostra(F_RES_CARGO_UF, {"c": CARGOS_RES, "u": UFS}, 140)
    amostra(F_RES_CARGO, {"c": CARGOS_RES}, 30)
    amostra(F_RES_UF, {"u": UFS}, 50)
    nomes = nomes_majoritarios()
    rnd.shuffle(nomes)
    amostra(F_RES_NOME, {"n": nomes[:40]}, 110)
    amostra(F_NOME_OUTROS, {"n": nomes[40:90]}, 130)

    # variações de superfície: sem acento, minúsculas, sem interrogação (como as pessoas digitam no celular)
    import unicodedata
    variantes = []
    for q in out:
        r = rnd.random()
        if r < 0.18:
            variantes.append("".join(ch for ch in unicodedata.normalize("NFD", q) if unicodedata.category(ch) != "Mn").lower().rstrip("?"))
        elif r < 0.30:
            variantes.append(q.lower())
        elif r < 0.36:
            variantes.append(q.rstrip("?") + "??")
    vistos, final = set(), []
    for q in out + variantes:
        k = " ".join(q.split()).lower()
        if k not in vistos and 3 <= len(q) <= 300:
            vistos.add(k)
            final.append(" ".join(q.split()))
    rnd.shuffle(final)
    sys.stdout.reconfigure(encoding="utf-8", newline="\n")
    print("\n".join(final))


if __name__ == "__main__":
    main()
