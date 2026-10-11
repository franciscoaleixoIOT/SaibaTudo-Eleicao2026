# -*- coding: utf-8 -*-
"""
`regras.json`: prefixos SI, unidades e fatores de conversão, série de reatividade dos metais, regras gerais de solubilidade,
ácidos e bases fortes, nomenclatura básica e a tabela de propriedades suportadas (`propriedades`).

Autoria própria do projeto. Os fatos (definições de unidades e prefixos do SI, fatores exatos) seguem o SI Brochure do BIPM
e o IUPAC Green Book; o texto das regras de ensino é nosso. Nenhum trecho de obra protegida foi copiado.
Fatores: valor da unidade expresso na unidade base da grandeza (base = valor 1).
"""
import quimica_util as Q

SCHEMA = 1

PREFIXOS_SI = [
    ("quetta", "Q", 30), ("ronna", "R", 27), ("yotta", "Y", 24), ("zetta", "Z", 21), ("exa", "E", 18), ("peta", "P", 15),
    ("tera", "T", 12), ("giga", "G", 9), ("mega", "M", 6), ("quilo", "k", 3), ("hecto", "h", 2), ("deca", "da", 1),
    ("deci", "d", -1), ("centi", "c", -2), ("mili", "m", -3), ("micro", "µ", -6), ("nano", "n", -9), ("pico", "p", -12),
    ("femto", "f", -15), ("atto", "a", -18), ("zepto", "z", -21), ("yocto", "y", -24), ("ronto", "r", -27), ("quecto", "q", -30),
]

UNIDADES = {
    "pressao": {"nome": "Pressão", "base": "Pa", "fatores": {
        "Pa": 1, "hPa": 100, "kPa": 1000, "MPa": 1000000, "bar": 100000, "mbar": 100, "atm": 101325,
        "mmHg": 133.322387415, "Torr": 101325 / 760, "psi": 6894.757293168}},
    "volume": {"nome": "Volume", "base": "m3", "fatores": {
        "m3": 1, "dm3": 0.001, "L": 0.001, "mL": 0.000001, "cm3": 0.000001, "µL": 0.000000001,
        "gal (EUA)": 0.003785411784, "ft3": 0.028316846592}},
    "energia": {"nome": "Energia", "base": "J", "fatores": {
        "J": 1, "kJ": 1000, "MJ": 1000000, "cal": 4.184, "kcal": 4184, "cal (IT)": 4.1868, "eV": 1.602176634e-19,
        "kWh": 3600000, "L·atm": 101.325, "erg": 1e-7}},
    "massa": {"nome": "Massa", "base": "kg", "fatores": {
        "kg": 1, "g": 0.001, "mg": 0.000001, "µg": 1e-9, "ng": 1e-12, "t": 1000, "lb": 0.45359237, "oz": 0.028349523125}},
    "comprimento": {"nome": "Comprimento", "base": "m", "fatores": {
        "m": 1, "km": 1000, "cm": 0.01, "mm": 0.001, "µm": 1e-6, "nm": 1e-9, "pm": 1e-12, "Å": 1e-10,
        "in": 0.0254, "ft": 0.3048, "mi": 1609.344}},
    "tempo": {"nome": "Tempo", "base": "s", "fatores": {"s": 1, "min": 60, "h": 3600, "d": 86400}},
    "quantidade": {"nome": "Quantidade de matéria", "base": "mol", "fatores": {"mol": 1, "mmol": 0.001, "kmol": 1000}},
    # K = a*x + b  (x na unidade dada)
    "temperatura": {"nome": "Temperatura", "base": "K", "afins": {
        "K": {"a": 1, "b": 0}, "°C": {"a": 1, "b": 273.15},
        "°F": {"a": 5 / 9, "b": 459.67 * 5 / 9}, "°R": {"a": 5 / 9, "b": 0}},
        "nota": "K = a·x + b; °F: K = (x + 459,67)·5/9"},
}

# do mais para o menos reativo (ordem da série eletroquímica dos potenciais-padrão de redução)
SERIE_REATIVIDADE = ["Li", "Rb", "K", "Cs", "Ba", "Sr", "Ca", "Na", "Mg", "Al", "Mn", "Zn", "Cr", "Fe", "Cd", "Co", "Ni", "Sn",
                     "Pb", "H", "Cu", "Ag", "Hg", "Pt", "Au"]

SOLUBILIDADE = [
    {"id": "alcalinos-amonio", "regra": "Os sais de metais alcalinos (Li⁺, Na⁺, K⁺, Rb⁺, Cs⁺) e de amônio (NH₄⁺) são solúveis em água.",
     "solubilidade": "soluvel", "ions": ["Li+", "Na+", "K+", "Rb+", "Cs+", "NH4+"], "excecoes": []},
    {"id": "nitratos-acetatos", "regra": "Os nitratos (NO₃⁻), acetatos (CH₃COO⁻), cloratos (ClO₃⁻) e percloratos (ClO₄⁻) são solúveis.",
     "solubilidade": "soluvel", "ions": ["NO3-", "CH3COO-", "ClO3-", "ClO4-"], "excecoes": []},
    {"id": "haletos", "regra": "Cloretos, brometos e iodetos são solúveis, exceto os de Ag⁺, Pb²⁺ e Hg₂²⁺ (insolúveis ou pouco solúveis).",
     "solubilidade": "soluvel", "ions": ["Cl-", "Br-", "I-"], "excecoes": ["Ag+", "Pb2+", "Hg2 2+"]},
    {"id": "sulfatos", "regra": "Os sulfatos (SO₄²⁻) são solúveis, exceto os de Ba²⁺, Sr²⁺ e Pb²⁺ (insolúveis); os de Ca²⁺ e Ag⁺ são pouco solúveis.",
     "solubilidade": "soluvel", "ions": ["SO4 2-"], "excecoes": ["Ba2+", "Sr2+", "Pb2+", "Ca2+", "Ag+"]},
    {"id": "hidroxidos", "regra": "Os hidróxidos (OH⁻) são insolúveis, exceto os de metais alcalinos e de amônio; os de Ca²⁺, Sr²⁺ e Ba²⁺ são moderadamente solúveis.",
     "solubilidade": "insoluvel", "ions": ["OH-"], "excecoes": ["Li+", "Na+", "K+", "Rb+", "Cs+", "NH4+", "Ca2+", "Sr2+", "Ba2+"]},
    {"id": "carbonatos-fosfatos", "regra": "Carbonatos (CO₃²⁻), fosfatos (PO₄³⁻), sulfitos (SO₃²⁻), cromatos (CrO₄²⁻) e oxalatos (C₂O₄²⁻) são insolúveis, exceto os de metais alcalinos e de amônio.",
     "solubilidade": "insoluvel", "ions": ["CO3 2-", "PO4 3-", "SO3 2-", "CrO4 2-", "C2O4 2-"], "excecoes": ["Li+", "Na+", "K+", "Rb+", "Cs+", "NH4+"]},
    {"id": "sulfetos", "regra": "Os sulfetos (S²⁻) são insolúveis, exceto os de metais alcalinos, alcalinoterrosos e de amônio.",
     "solubilidade": "insoluvel", "ions": ["S2-"], "excecoes": ["Li+", "Na+", "K+", "Rb+", "Cs+", "NH4+", "Ca2+", "Sr2+", "Ba2+"]},
    {"id": "oxidos-metalicos", "regra": "Os óxidos metálicos são em geral insolúveis; os de metais alcalinos e de Ca, Sr e Ba reagem com a água formando hidróxidos.",
     "solubilidade": "insoluvel", "ions": ["O2-"], "excecoes": ["Li+", "Na+", "K+", "Rb+", "Cs+", "Ca2+", "Sr2+", "Ba2+"]},
]
SOLUBILIDADE_NOTA = "Regras gerais de ensino, com exceções; solubilidade real depende de temperatura e concentração. Em caso de dúvida, consulte dados medidos."

ACIDOS_FORTES = [
    {"formula": "HCl", "nome": "Ácido clorídrico"}, {"formula": "HBr", "nome": "Ácido bromídrico"},
    {"formula": "HI", "nome": "Ácido iodídrico"}, {"formula": "HNO3", "nome": "Ácido nítrico"},
    {"formula": "H2SO4", "nome": "Ácido sulfúrico", "nota": "forte na 1ª ionização"},
    {"formula": "HClO4", "nome": "Ácido perclórico"}, {"formula": "HClO3", "nome": "Ácido clórico"},
]
BASES_FORTES = [
    {"formula": "LiOH", "nome": "Hidróxido de lítio"}, {"formula": "NaOH", "nome": "Hidróxido de sódio"},
    {"formula": "KOH", "nome": "Hidróxido de potássio"}, {"formula": "RbOH", "nome": "Hidróxido de rubídio"},
    {"formula": "CsOH", "nome": "Hidróxido de césio"}, {"formula": "Ca(OH)2", "nome": "Hidróxido de cálcio", "nota": "pouco solúvel; dissocia-se totalmente o que dissolve"},
    {"formula": "Sr(OH)2", "nome": "Hidróxido de estrôncio"}, {"formula": "Ba(OH)2", "nome": "Hidróxido de bário"},
]

NOMENCLATURA = {
    "prefixosNumericos": [
        {"n": 1, "prefixo": "mono"}, {"n": 2, "prefixo": "di"}, {"n": 3, "prefixo": "tri"}, {"n": 4, "prefixo": "tetra"},
        {"n": 5, "prefixo": "penta"}, {"n": 6, "prefixo": "hexa"}, {"n": 7, "prefixo": "hepta"}, {"n": 8, "prefixo": "octa"},
        {"n": 9, "prefixo": "nona"}, {"n": 10, "prefixo": "deca"}],
    "sufixosAnions": [
        {"sufixo": "-eto", "uso": "ânions monoatômicos e binários", "exemplos": ["cloreto (Cl⁻)", "sulfeto (S²⁻)", "cianeto (CN⁻)"]},
        {"sufixo": "-ato", "uso": "oxiânions com mais oxigênio", "exemplos": ["sulfato (SO₄²⁻)", "nitrato (NO₃⁻)", "carbonato (CO₃²⁻)"]},
        {"sufixo": "-ito", "uso": "oxiânions com menos oxigênio", "exemplos": ["sulfito (SO₃²⁻)", "nitrito (NO₂⁻)"]},
        {"prefixo": "hipo-", "uso": "ainda menos oxigênio (hipo…ito)", "exemplos": ["hipoclorito (ClO⁻)"]},
        {"prefixo": "per-", "uso": "mais oxigênio (per…ato)", "exemplos": ["perclorato (ClO₄⁻)"]}],
    "acidos": [
        {"sufixo": "-ídrico", "uso": "ácidos binários (sem oxigênio)", "exemplos": ["ácido clorídrico (HCl)", "ácido sulfídrico (H₂S)"]},
        {"sufixo": "-ico", "uso": "oxiácidos cujo ânion termina em -ato", "exemplos": ["ácido sulfúrico (H₂SO₄)", "ácido nítrico (HNO₃)"]},
        {"sufixo": "-oso", "uso": "oxiácidos cujo ânion termina em -ito", "exemplos": ["ácido sulfuroso (H₂SO₃)", "ácido nitroso (HNO₂)"]}],
    "radicaisOrganicos": [
        {"n": 1, "radical": "met"}, {"n": 2, "radical": "et"}, {"n": 3, "radical": "prop"}, {"n": 4, "radical": "but"},
        {"n": 5, "radical": "pent"}, {"n": 6, "radical": "hex"}, {"n": 7, "radical": "hept"}, {"n": 8, "radical": "oct"},
        {"n": 9, "radical": "non"}, {"n": 10, "radical": "dec"}],
    "sufixosOrganicos": [
        {"funcao": "alcano", "sufixo": "-ano"}, {"funcao": "alceno", "sufixo": "-eno"}, {"funcao": "alcino", "sufixo": "-ino"},
        {"funcao": "álcool", "sufixo": "-ol"}, {"funcao": "aldeído", "sufixo": "-al"}, {"funcao": "cetona", "sufixo": "-ona"},
        {"funcao": "ácido carboxílico", "sufixo": "-óico", "nota": "ácido …óico"}, {"funcao": "amina", "sufixo": "-amina"},
        {"funcao": "amida", "sufixo": "-amida"}, {"funcao": "éster", "sufixo": "-oato de …ila"}],
    "ions": [
        {"formula": "H⁺", "nome": "hidrogênio (próton); em água, hidrônio H₃O⁺", "carga": 1},
        {"formula": "Li⁺", "nome": "lítio", "carga": 1}, {"formula": "Na⁺", "nome": "sódio", "carga": 1},
        {"formula": "K⁺", "nome": "potássio", "carga": 1}, {"formula": "NH₄⁺", "nome": "amônio", "carga": 1},
        {"formula": "Ag⁺", "nome": "prata", "carga": 1}, {"formula": "Mg²⁺", "nome": "magnésio", "carga": 2},
        {"formula": "Ca²⁺", "nome": "cálcio", "carga": 2}, {"formula": "Sr²⁺", "nome": "estrôncio", "carga": 2},
        {"formula": "Ba²⁺", "nome": "bário", "carga": 2}, {"formula": "Zn²⁺", "nome": "zinco", "carga": 2},
        {"formula": "Al³⁺", "nome": "alumínio", "carga": 3}, {"formula": "Fe²⁺", "nome": "ferro(II) (ferroso)", "carga": 2},
        {"formula": "Fe³⁺", "nome": "ferro(III) (férrico)", "carga": 3}, {"formula": "Cu⁺", "nome": "cobre(I) (cuproso)", "carga": 1},
        {"formula": "Cu²⁺", "nome": "cobre(II) (cúprico)", "carga": 2}, {"formula": "Pb²⁺", "nome": "chumbo(II)", "carga": 2},
        {"formula": "Sn²⁺", "nome": "estanho(II) (estanoso)", "carga": 2}, {"formula": "Hg²⁺", "nome": "mercúrio(II)", "carga": 2},
        {"formula": "F⁻", "nome": "fluoreto", "carga": -1}, {"formula": "Cl⁻", "nome": "cloreto", "carga": -1},
        {"formula": "Br⁻", "nome": "brometo", "carga": -1}, {"formula": "I⁻", "nome": "iodeto", "carga": -1},
        {"formula": "O²⁻", "nome": "óxido", "carga": -2}, {"formula": "S²⁻", "nome": "sulfeto", "carga": -2},
        {"formula": "OH⁻", "nome": "hidróxido", "carga": -1}, {"formula": "CN⁻", "nome": "cianeto", "carga": -1},
        {"formula": "NO₃⁻", "nome": "nitrato", "carga": -1}, {"formula": "NO₂⁻", "nome": "nitrito", "carga": -1},
        {"formula": "SO₄²⁻", "nome": "sulfato", "carga": -2}, {"formula": "SO₃²⁻", "nome": "sulfito", "carga": -2},
        {"formula": "CO₃²⁻", "nome": "carbonato", "carga": -2}, {"formula": "HCO₃⁻", "nome": "hidrogenocarbonato (bicarbonato)", "carga": -1},
        {"formula": "PO₄³⁻", "nome": "fosfato", "carga": -3}, {"formula": "ClO⁻", "nome": "hipoclorito", "carga": -1},
        {"formula": "ClO₃⁻", "nome": "clorato", "carga": -1}, {"formula": "ClO₄⁻", "nome": "perclorato", "carga": -1},
        {"formula": "CH₃COO⁻", "nome": "acetato", "carga": -1}, {"formula": "MnO₄⁻", "nome": "permanganato", "carga": -1},
        {"formula": "CrO₄²⁻", "nome": "cromato", "carga": -2}, {"formula": "Cr₂O₇²⁻", "nome": "dicromato", "carga": -2}],
}

# id -> {nome, unidade, origem, escopo, sinonimos}. `origem` = "<arquivo>.<campo>" do pacote.
PROPRIEDADES = {
    "numeroAtomico": ("Número atômico", "", "elementos.z", "elemento", ["número atômico", "z"]),
    "simbolo": ("Símbolo", "", "elementos.simbolo", "elemento", ["símbolo"]),
    "massaAtomica": ("Massa atômica", "u", "elementos.massaAtomica", "elemento", ["massa atômica", "peso atômico"]),
    "grupo": ("Grupo", "", "elementos.grupo", "elemento", ["grupo", "família"]),
    "periodo": ("Período", "", "elementos.periodo", "elemento", ["período"]),
    "bloco": ("Bloco", "", "elementos.bloco", "elemento", ["bloco"]),
    "categoria": ("Categoria", "", "elementos.categoria", "elemento", ["categoria", "classificação"]),
    "configuracaoEletronica": ("Configuração eletrônica", "", "elementos.configuracaoEletronica", "elemento",
                                ["configuração eletrônica", "distribuição eletrônica"]),
    "eletronegatividade": ("Eletronegatividade (Pauling)", "", "elementos.eletronegatividade", "elemento", ["eletronegatividade"]),
    "raioAtomicoPm": ("Raio atômico", "pm", "elementos.raioAtomicoPm", "elemento", ["raio atômico"]),
    "afinidadeEletronicaKJmol": ("Afinidade eletrônica", "kJ/mol", "elementos.afinidadeEletronicaKJmol", "elemento",
                             ["afinidade eletrônica", "eletroafinidade"]),
    "energiaIonizacaoKJmol": ("Energia de ionização", "kJ/mol", "elementos.energiaIonizacaoKJmol", "elemento",
                         ["energia de ionização", "potencial de ionização"]),
    "pontoFusaoK": ("Ponto de fusão", "K", "elementos.pontoFusaoK", "elemento", ["ponto de fusão", "temperatura de fusão"]),
    "pontoEbulicaoK": ("Ponto de ebulição", "K", "elementos.pontoEbulicaoK", "elemento", ["ponto de ebulição", "temperatura de ebulição"]),
    "densidadeKgm3": ("Densidade", "kg/m³", "elementos.densidadeKgm3", "elemento", ["densidade", "massa específica"]),
    "estadoPadrao": ("Estado físico padrão", "", "elementos.estadoPadrao", "elemento", ["estado físico", "estado padrão"]),
    "estadosOxidacao": ("Estados de oxidação", "", "elementos.estadosOxidacao", "elemento", ["estados de oxidação", "nox"]),
    "descoberta": ("Descoberta", "", "elementos.descoberta", "elemento", ["descoberta", "quem descobriu", "quando foi descoberto", "descobriu"]),
    "massaMolar": ("Massa molar", "g/mol", "compostos.massaMolar", "composto", ["massa molar", "massa molecular", "peso molecular"]),
    "massaExata": ("Massa exata (monoisotópica)", "u", "compostos.massaExata", "composto", ["massa exata", "massa monoisotópica"]),
    "formula": ("Fórmula", "", "compostos.formula", "composto", ["fórmula", "fórmula molecular"]),
    "formulaHill": ("Fórmula de Hill", "", "compostos.formulaHill", "composto", ["fórmula de hill"]),
    "smiles": ("SMILES", "", "compostos.smiles", "composto", ["smiles"]),
    "inchiKey": ("InChIKey", "", "compostos.inchiKey", "composto", ["inchikey"]),
    "nomeIupac": ("Nome IUPAC (PubChem)", "", "compostos.nomeIupac", "composto", ["nome iupac", "nomenclatura iupac"]),
    "cas": ("Número CAS", "", "compostos.cas", "composto", ["cas", "número cas"]),
    "xlogp": ("XLogP", "", "compostos.propriedades.xlogp", "composto", ["xlogp", "logp"]),
    "tpsa": ("Área de superfície polar topológica (TPSA)", "Å²", "compostos.propriedades.tpsa", "composto", ["tpsa"]),
    "doadoresH": ("Doadores de ligação de hidrogênio", "", "compostos.propriedades.doadoresH", "composto", ["doadores de hidrogênio"]),
    "aceptoresH": ("Aceptores de ligação de hidrogênio", "", "compostos.propriedades.aceptoresH", "composto", ["aceptores de hidrogênio"]),
    "ligacoesRotaveis": ("Ligações rotáveis", "", "compostos.propriedades.ligacoesRotaveis", "composto", ["ligações rotáveis"]),
    "carga": ("Carga", "e", "compostos.propriedades.carga", "composto", ["carga"]),
    "pictogramas_ghs": ("Pictogramas GHS (classificação harmonizada)", "", "compostos.ghs.pictogramas", "composto", ["pictogramas", "perigos"]),
    "frases_h": ("Frases de perigo H (classificação harmonizada)", "", "compostos.ghs.frasesH", "composto", ["frases h", "advertências de perigo"]),
    "palavra_sinal": ("Palavra de advertência GHS", "", "compostos.ghs.palavraSinal", "composto", ["palavra de advertência"]),
}


def montar(hoje=None):
    hoje = hoje or Q.hoje_iso()
    fontes = [
        Q.fonte("Autoria própria do SaibaTudo Química (regras de ensino de química geral)",
                "https://github.com/franciscoaleixoIOT/SaibaTudo", "MIT", hoje),
        Q.fonte("BIPM — SI Brochure (definições de unidades e prefixos do SI; fatos)", "https://www.bipm.org/en/publications/si-brochure",
                "fatos (definições do SI), citados", hoje),
        Q.fonte("IUPAC — Green Book, Quantities, Units and Symbols in Physical Chemistry (símbolos e unidades; fatos)",
                "https://iupac.org/what-we-do/books/greenbook/", "fatos (símbolos e unidades), citados; texto não copiado", hoje),
    ]
    return {
        "versao": SCHEMA,
        "descricao": "Regras e tabelas de apoio: prefixos SI, unidades e fatores, série de reatividade, solubilidade, ácidos e bases fortes, "
                     "nomenclatura básica e propriedades suportadas. Autoria própria; fatos conforme BIPM/IUPAC.",
        "prefixosSI": [{"nome": n, "simbolo": s, "expoente": e, "fator": float(f"1e{e}")} for n, s, e in PREFIXOS_SI],
        "unidades": UNIDADES,
        "serieReatividadeMetais": {"ordem": SERIE_REATIVIDADE, "nota": "do mais reativo (cede elétrons com mais facilidade) ao menos "
                                   "reativo; o hidrogênio (H) é a referência. Um metal desloca o cátion de outro que está depois dele."},
        "solubilidade": {"regras": SOLUBILIDADE, "nota": SOLUBILIDADE_NOTA},
        "acidosFortes": ACIDOS_FORTES,
        "basesFortes": BASES_FORTES,
        "nomenclatura": NOMENCLATURA,
        "propriedades": {pid: {"nome": nome, "unidade": un, "origem": orig, "escopo": esc, "sinonimos": sin}
                         for pid, (nome, un, orig, esc, sin) in PROPRIEDADES.items()},
        "fontes": fontes,
    }
