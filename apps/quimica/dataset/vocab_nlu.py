# -*- coding: utf-8 -*-
"""Vocabulário de superfície do NLU: como as pessoas escrevem propriedades, unidades, tópicos e frases fora do escopo.

Os RÓTULOS (ids de propriedade, unidades, intenções) vêm do contrato do modelo (`backend/modal/nlu_core.py`); aqui ficam só as
formas de escrever. Nenhum fato químico: só vocabulário.
"""

# id -> [(artigo, forma)]
PROP_ELEMENTO = {
    "massaAtomica": [("a", "massa atômica"), ("o", "peso atômico"), ("a", "massa atomica")],
    "numeroAtomico": [("o", "número atômico"), ("o", "numero atomico")],
    "grupo": [("o", "grupo")],
    "periodo": [("o", "período")],
    "bloco": [("o", "bloco")],
    "categoria": [("a", "categoria")],
    "configuracaoEletronica": [("a", "configuração eletrônica"), ("a", "distribuição eletrônica")],
    "eletronegatividade": [("a", "eletronegatividade")],
    "raioAtomicoPm": [("o", "raio atômico")],
    "afinidadeEletronicaKJmol": [("a", "afinidade eletrônica")],
    "energiaIonizacaoKJmol": [("a", "energia de ionização"), ("o", "potencial de ionização")],
    "pontoFusaoK": [("o", "ponto de fusão"), ("a", "temperatura de fusão"), ("o", "ponto de fusao")],
    "pontoEbulicaoK": [("o", "ponto de ebulição"), ("a", "temperatura de ebulição"), ("o", "ponto de ebulicao")],
    "densidadeKgm3": [("a", "densidade"), ("a", "massa específica")],
    "estadoPadrao": [("o", "estado físico"), ("o", "estado padrão")],
    "estadosOxidacao": [("os", "estados de oxidação"), ("os", "números de oxidação")],
}
PROP_COMPOSTO = {
    "massaMolar": [("a", "massa molar"), ("o", "peso molecular"), ("a", "massa molecular")],
    "massaExata": [("a", "massa exata")],
    "formula": [("a", "fórmula molecular"), ("a", "fórmula química"), ("a", "fórmula")],
    "smiles": [("o", "SMILES")],
    "cas": [("o", "número CAS"), ("o", "CAS")],
    "xlogp": [("o", "XLogP"), ("o", "logP")],
    "tpsa": [("o", "TPSA"), ("a", "área de superfície polar")],
    "doadoresH": [("os", "doadores de hidrogênio")],
    "aceptoresH": [("os", "aceptores de hidrogênio")],
    "ligacoesRotaveis": [("as", "ligações rotáveis")],
    "carga": [("a", "carga")],
    "pka": [("o", "pKa")],
    "solubilidade": [("a", "solubilidade")],
    "pontoFusaoK": [("o", "ponto de fusão")],
    "pontoEbulicaoK": [("o", "ponto de ebulição")],
    "densidadeKgm3": [("a", "densidade")],
}

# unidade canônica -> formas escritas
UNID_SUP = {
    "g": ["g", "g", "gramas", "grama"], "mg": ["mg", "miligramas"], "kg": ["kg", "quilos", "quilogramas"], "mol": ["mol", "mols", "mol"],
    "mmol": ["mmol", "milimols"], "L": ["L", "litros", "litro", "l"], "mL": ["mL", "mL", "ml", "mililitros"], "dm3": ["dm³", "dm3"], "m3": ["m³", "m3", "metros cúbicos"],
    "cm3": ["cm³", "cm3", "cc"], "mol/L": ["mol/L", "mol/l", "molar", "M", "mols por litro"], "g/L": ["g/L", "gramas por litro"], "g/mol": ["g/mol"],
    "K": ["K", "kelvin"], "°C": ["°C", "°C", "graus Celsius", "ºC"], "°F": ["°F", "graus Fahrenheit"], "atm": ["atm", "atmosferas", "atm"], "Pa": ["Pa", "pascais"],
    "kPa": ["kPa", "quilopascais"], "bar": ["bar"], "mmHg": ["mmHg", "milímetros de mercúrio"], "torr": ["torr"], "J": ["J", "joules"], "kJ": ["kJ", "quilojoules"],
    "cal": ["cal", "calorias"], "kcal": ["kcal", "quilocalorias"], "m": ["m", "metros"], "cm": ["cm", "centímetros"], "mm": ["mm", "milímetros"], "nm": ["nm", "nanômetros"],
    "pm": ["pm", "picômetros"], "Å": ["Å", "angstroms"], "s": ["s", "segundos"], "min": ["min", "minutos"], "h": ["h", "horas"], "%": ["%", "por cento"],
}
# grupos de unidades convertíveis entre si (apenas unidades do contrato do modelo)
GRUPOS_CONVERSAO = [
    ["g", "mg", "kg"], ["mL", "L", "dm3", "m3", "cm3"], ["atm", "Pa", "kPa", "bar", "mmHg", "torr"], ["K", "°C", "°F"], ["J", "kJ", "cal", "kcal"],
    ["m", "cm", "mm", "nm", "pm", "Å"], ["s", "min", "h"], ["mol", "mmol"],
]
VALORES_NUM = ["1", "2", "2,5", "5", "10", "25", "100", "0,5", "250", "1000", "0,25", "750", "3,5", "12", "0,1", "20", "50", "1,5", "300", "0,05", "8", "15"]

TOPICOS = [
    "mol", "massa molar", "número de Avogadro", "ligação iônica", "ligação covalente", "ligação metálica", "polaridade das moléculas", "geometria molecular",
    "hibridização", "eletronegatividade", "tabela periódica", "raio atômico", "energia de ionização", "afinidade eletrônica", "número atômico", "isótopos",
    "modelo atômico de Bohr", "orbitais atômicos", "distribuição eletrônica", "regra do octeto", "pH", "pOH", "ácidos", "bases", "neutralização", "solução tampão",
    "titulação", "indicador ácido-base", "solubilidade", "soluções", "concentração molar", "diluição", "partes por milhão", "propriedades coligativas",
    "pressão osmótica", "osmose", "estados da matéria", "mudanças de estado", "gás ideal", "lei de Boyle", "lei de Charles", "hipótese de Avogadro", "pressão parcial",
    "equilíbrio químico", "princípio de Le Chatelier", "constante de equilíbrio", "cinética química", "energia de ativação", "catalisador", "velocidade de reação",
    "termoquímica", "entalpia", "lei de Hess", "entropia", "energia livre de Gibbs", "reações exotérmicas e endotérmicas", "oxirredução", "número de oxidação", "pilha",
    "eletrólise", "potencial padrão de redução", "lei de Faraday", "corrosão", "estequiometria", "reagente limitante", "rendimento de uma reação", "balanceamento de equações",
    "lei de Lavoisier", "lei de Proust", "hidrocarbonetos", "alcanos", "alcenos", "alcinos", "compostos aromáticos", "isomeria", "isomeria óptica", "grupos funcionais",
    "álcoois", "ácidos carboxílicos", "ésteres", "aminas", "amidas", "polímeros", "polimerização", "carboidratos", "proteínas", "lipídios", "ácidos nucleicos", "enzimas",
    "combustão", "chuva ácida", "efeito estufa", "camada de ozônio", "ligações de hidrogênio", "forças intermoleculares", "forças de van der Waals", "ponto de ebulição",
    "ponto de fusão", "densidade", "sólidos cristalinos", "ligas metálicas", "semicondutores", "radioatividade", "fissão nuclear", "fusão nuclear", "meia-vida",
    "espectroscopia", "cromatografia", "destilação", "filtração", "decantação", "misturas homogêneas e heterogêneas", "substâncias puras", "separação de misturas",
    "elemento químico", "átomo", "molécula", "íon", "cátion e ânion", "isóbaros e isótonos", "massa atômica", "unidade de massa atômica", "ressonância", "carga formal",
    "ácidos e bases de Brønsted-Lowry", "ácidos e bases de Lewis", "produto de solubilidade", "efeito do íon comum", "lei de Raoult", "lei de Henry", "calor específico",
    "calorimetria", "capacidade calorífica", "diagrama de fases", "ponto triplo", "ponto crítico", "gases reais", "teoria cinética dos gases", "difusão dos gases",
    "números quânticos", "princípio da exclusão de Pauli", "regra de Hund", "efeito fotoelétrico", "espectro de emissão", "ligação sigma e pi", "ligação dupla e tripla",
    "reações de substituição", "reações de adição", "reações de eliminação", "esterificação", "saponificação", "hidrólise", "fermentação", "fotossíntese", "respiração celular",
]
MODELOS_CONCEITO = [
    ("O que é {t}?", None), ("Explique {t}", None), ("Como funciona {t}?", None), ("O que significa {t}?", None), ("Me explique {t}", None),
    ("Pode explicar {t}?", None), ("Conceito de {t}", None), ("Explique {t} de forma simples", "fundamental"), ("Explique {t} para uma criança", "fundamental"),
    ("O que é {t}? Explique para o ensino médio", "medio"), ("Explique {t} em nível de ensino médio", "medio"), ("Resumo de {t} para o ENEM", "medio"),
    ("Explique {t} em nível de graduação", "superior"), ("Explique {t} para a faculdade", "superior"), ("{t} explicado em nível universitário", "superior"),
    ("Qual a importância de {t}?", None), ("Dê um exemplo de {t}", None), ("Por que {t} é importante na química?", None),
    ("Tenho prova amanhã, me explica {t}", "medio"), ("Não entendi {t}, pode ajudar?", None), ("Quero entender {t}", None), ("{t}: do que se trata?", None),
]
FORA_DO_ESCOPO = [
    "qual a capital da França?", "quem ganhou a copa de 2002?", "me conta uma piada", "qual a previsão do tempo para amanhã?", "como faço um bolo de cenoura?",
    "quem é o presidente do Brasil?", "traduza 'good morning' para o português", "qual o melhor celular?", "como tirar passaporte?", "quanto é 15 vezes 12?",
    "escreva um poema sobre o mar", "qual a cotação do dólar?", "como aprender a tocar violão?", "quem descobriu o Brasil?", "qual a distância da Terra à Lua?",
    "me indica um filme", "como declarar imposto de renda?", "o que é inflação?", "como fazer um currículo?", "quais as regras do futebol?",
    "qual o sentido da vida?", "que horas são?", "como emagrecer rápido?", "quem inventou a lâmpada?", "qual a maior montanha do mundo?",
    "resolva a equação x² − 5x + 6 = 0", "qual a raiz quadrada de 144?", "como instalar o Windows?", "quem escreveu Dom Casmurro?", "o que é fotossíntese em plantas de jardim e como regar?",
    "receita de brigadeiro", "como pedir demissão?", "qual o horário do mercado?", "me ajuda com a lição de história", "quando começa o carnaval?",
    "teste", "ok", "hmm", "não sei", "????", "kkkk", "bom dia", "valeu", "123456", "asdfgh", "qwerty", "lorem ipsum", "o que você acha da política?",
    "qual o melhor time do Brasil?", "como funciona o Pix?", "quanto custa uma passagem para Lisboa?", "qual a população do Brasil?",
]
PEDIDOS_AJUDA = [
    "oi", "olá", "ajuda", "me ajuda", "o que você faz?", "o que você sabe fazer?", "como usar o app?", "como funciona isso aqui?", "o que posso perguntar?",
    "quais as suas funções?", "me dá exemplos de perguntas", "tutorial", "como você pode me ajudar?", "bom dia, o que você faz?", "preciso de ajuda com química",
    "quem é você?", "como faço uma pergunta?", "me mostra o que dá pra fazer", "comandos", "menu",
]
PEDIDOS_DADOS = [
    "de onde vêm os dados?", "qual a origem dos dados?", "como os dados são atualizados?", "quando foi a última atualização dos dados?", "esses dados são confiáveis?",
    "os dados são assinados?", "sobre os dados", "quem fornece as informações?", "qual a versão dos dados?", "os valores vêm de onde?", "os dados funcionam offline?",
    "como vocês verificam os números?",
]
PEDIDOS_FONTES = [
    "quais as fontes?", "fontes dos dados", "quais fontes vocês usam?", "me mostre as fontes", "de qual site vem isso?", "qual a licença dos dados?",
    "quais as licenças?", "referências", "citar as fontes", "quais bases de dados são usadas?", "o PubChem é usado?", "quais as fontes dos textos de explicação?",
]
