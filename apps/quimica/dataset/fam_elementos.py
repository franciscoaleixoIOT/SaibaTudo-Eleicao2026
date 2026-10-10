# -*- coding: utf-8 -*-
"""Família ELEMENTOS: ~30 templates × cada elemento do pacote, com variação de superfície."""
from decimal import Decimal

from comum import (MENOS, PLACEHOLDER, Resp, arred_sig, cap, com_artigo, config_sup, dec, fmt_ano, fmt_casas, fmt_pacote, fmt_sig,
                   lista_pt, renderizar)
from ghs_pt import CATEGORIA_GRUPO_PLURAL, CATEGORIA_PT, ESTADO_ARTIGO, ESTADO_PT
from calculo import ZERO_CELSIUS_K
from qa_base import Ctx, nome_em_frase, sup_elemento
from pacote import fontes_do_registro

FAM = "elementos"


def P(e, campo):
    return f"elementos.json#{e['simbolo']}.{campo}"


def do(e, prep="de"):
    return com_artigo(e["nome"], prep, elemento=True)


def Oo(e):
    """'O oxigênio' (início de frase)."""
    return cap(com_artigo(e["nome"], "", elemento=True))


def fonte_el(e):
    fs = e.get("fontes") or []
    nome = fs[0]["nome"] if fs else "PubChem"
    return " Fonte: " + ("PubChem." if nome.lower().startswith("pubchem") else f"{nome}.")


def pl(n, sing, plur):
    return sing if int(n) == 1 else plur


def _estado(e):
    return ESTADO_PT.get(e.get("estadoPadrao"))


def _sinal_oxid(n):
    return f"+{n}" if n > 0 else (f"{MENOS}{abs(n)}" if n < 0 else "0")


def _temp_c(k):
    """K -> °C com as mesmas casas decimais do valor em K."""
    dk = dec(k)
    casas = max(0, -dk.normalize().as_tuple().exponent)
    return dk - ZERO_CELSIUS_K, casas


# ---------------------------------------------------------------------------------------------------------
# Respostas: cada uma recebe (e, r, ctx) e devolve texto, ou None se faltar dado no pacote
# ---------------------------------------------------------------------------------------------------------
def r_simbolo(e, r, ctx):
    return f"O símbolo químico {do(e)} é {e['simbolo']}, e o seu número atômico é {r.pkg(e['z'], P(e, 'z'))}.{fonte_el(e)}"


def r_nome(e, r, ctx):
    return f"O símbolo {e['simbolo']} representa {com_artigo(e['nome'], '', elemento=True)} (Z = {r.pkg(e['z'], P(e, 'z'))}).{fonte_el(e)}"


def r_z(e, r, ctx):
    z = r.pkg(e["z"], P(e, "z"))
    return f"O número atômico {do(e)} ({e['simbolo']}) é {z}: cada átomo desse elemento tem {z} {pl(e['z'], 'próton', 'prótons')} no núcleo.{fonte_el(e)}"


def r_massa(e, r, ctx):
    if e.get("massaAtomica") is None:
        return None
    return (f"A massa atômica {do(e)} ({e['simbolo']}, Z = {r.pkg(e['z'], P(e, 'z'))}) é "
            f"{r.pkg(e['massaAtomica'], P(e, 'massaAtomica'))} u.{fonte_el(e)}")


def r_grupo(e, r, ctx):
    if e.get("grupo") is None:
        return None
    return f"{Oo(e)} ({e['simbolo']}) está no grupo {r.pkg(e['grupo'], P(e, 'grupo'))} da tabela periódica.{fonte_el(e)}"


def r_periodo(e, r, ctx):
    if e.get("periodo") is None:
        return None
    return f"{Oo(e)} ({e['simbolo']}) está no período {r.pkg(e['periodo'], P(e, 'periodo'))} da tabela periódica.{fonte_el(e)}"


def r_bloco(e, r, ctx):
    if not e.get("bloco"):
        return None
    return f"{Oo(e)} ({e['simbolo']}) pertence ao bloco {e['bloco']} da tabela periódica.{fonte_el(e)}"


def r_categoria(e, r, ctx):
    c = e.get("categoria")
    if not c or c == "desconhecida" or c not in CATEGORIA_PT:
        return None
    return f"{Oo(e)} ({e['simbolo']}) é classificado como {CATEGORIA_PT[c]}.{fonte_el(e)}"


def r_config(e, r, ctx):
    if not e.get("configuracaoEletronica"):
        return None
    return f"A configuração eletrônica {do(e)} ({e['simbolo']}) é {config_sup(e['configuracaoEletronica'])}.{fonte_el(e)}"


def r_en(e, r, ctx):
    if e.get("eletronegatividade") is None:
        return None
    return (f"A eletronegatividade {do(e)} ({e['simbolo']}), na escala de Pauling, é "
            f"{r.pkg(e['eletronegatividade'], P(e, 'eletronegatividade'))}.{fonte_el(e)}")


def _fus_ebu(campo, nome_prop, celsius_primeiro):
    def f(e, r, ctx):
        k = e.get(campo)
        if k is None:
            return None
        c, casas = _temp_c(k)
        ks = r.pkg(k, P(e, campo))
        cs = r.calc_casas(c, f"{campo}_celsius", casas)
        if celsius_primeiro:
            return f"O {nome_prop} {do(e)} ({e['simbolo']}) é {cs} °C (equivalente a {ks} K).{fonte_el(e)}"
        return f"O {nome_prop} {do(e)} ({e['simbolo']}) é {ks} K, ou seja, {cs} °C.{fonte_el(e)}"
    return f


def r_densidade(e, r, ctx):
    d = e.get("densidadeKgm3")
    if d is None:
        return None
    gcm3 = dec(d) / 1000
    return (f"A densidade {do(e)} ({e['simbolo']}) é {r.pkg(d, P(e, 'densidadeKgm3'))} kg/m³, o que equivale a "
            f"{r.calc(gcm3, 'densidade_g_cm3', 4)} g/cm³ (valor de referência nas condições padrão da fonte).{fonte_el(e)}")


def r_oxid(e, r, ctx):
    ox = e.get("estadosOxidacao")
    if not ox:
        return None
    itens = []
    for n in ox:
        r.pkg(abs(n), P(e, "estadosOxidacao"))
        itens.append(_sinal_oxid(n))
    if len(itens) == 1:
        return f"O único estado de oxidação registrado {do(e)} ({e['simbolo']}) é {itens[0]}.{fonte_el(e)}"
    return f"Os estados de oxidação conhecidos {do(e)} ({e['simbolo']}) são {lista_pt(itens)}.{fonte_el(e)}"


def r_descoberta(e, r, ctx):
    d = e.get("descoberta") or {}
    ano, por = d.get("ano"), d.get("por")
    if ano is None and not por:
        return None
    por_txt = lista_pt([p.strip() for p in por.split(";") if p.strip()]) if por else None
    if ano is not None and por_txt:
        return f"{Oo(e)} ({e['simbolo']}) foi descoberto em {r.pkg(ano, P(e, 'descoberta.ano'), fmt_ano)} por {por_txt}.{fonte_el(e)}"
    if ano is not None:
        return f"O ano de descoberta {do(e)} ({e['simbolo']}) registrado no pacote de dados é {r.pkg(ano, P(e, 'descoberta.ano'), fmt_ano)}.{fonte_el(e)}"
    return f"Sobre a descoberta {do(e)} ({e['simbolo']}), o pacote de dados registra: {por_txt}.{fonte_el(e)}"


def r_estado(e, r, ctx):
    est = e.get("estadoPadrao")
    if est not in ESTADO_ARTIGO:
        return None
    return f"Nas condições padrão, {com_artigo(e['nome'], '', elemento=True)} ({e['simbolo']}) é {ESTADO_ARTIGO[est]}.{fonte_el(e)}"


def r_vizinhos(e, r, ctx):
    pac = ctx.pac
    ant, seg = pac.el_z.get(e["z"] - 1), pac.el_z.get(e["z"] + 1)
    partes = []
    if ant:
        partes.append(f"o anterior é {com_artigo(ant['nome'], '', elemento=True)} ({ant['simbolo']}, Z = {r.pkg(ant['z'], P(ant, 'z'))})")
    if seg:
        partes.append(f"o seguinte é {com_artigo(seg['nome'], '', elemento=True)} ({seg['simbolo']}, Z = {r.pkg(seg['z'], P(seg, 'z'))})")
    if not partes:
        return None
    return (f"Na ordem de número atômico, {com_artigo(e['nome'], '', elemento=True)} (Z = {r.pkg(e['z'], P(e, 'z'))}) tem como vizinhos: "
            + " e ".join(partes) + f".{fonte_el(e)}")


def r_por_z(e, r, ctx):
    ent = r.ent(e["z"])
    return f"O elemento de número atômico {ent} é {com_artigo(e['nome'], '', elemento=True)} (símbolo {e['simbolo']}).{fonte_el(e)}" \
        if r.pkg(e["z"], P(e, "z")) else None


def r_eletrons(e, r, ctx):
    z = r.pkg(e["z"], P(e, "z"))
    return f"Um átomo neutro {do(e)} ({e['simbolo']}) tem {z} {pl(e['z'], 'elétron', 'elétrons')}, o mesmo número de prótons (Z = {z}).{fonte_el(e)}"


def r_protons(e, r, ctx):
    z = r.pkg(e["z"], P(e, "z"))
    return f"Cada átomo {do(e)} ({e['simbolo']}) tem {z} {pl(e['z'], 'próton', 'prótons')} no núcleo, pois o número atômico é {z}.{fonte_el(e)}"


def r_nome_en(e, r, ctx):
    if not e.get("nomeEn"):
        return None
    return f"Em inglês, {com_artigo(e['nome'], '', elemento=True)} ({e['simbolo']}) se chama {e['nomeEn']}.{fonte_el(e)}"


def r_raio(e, r, ctx):
    if e.get("raioAtomicoPm") is None:
        return None
    return f"O raio atômico {do(e)} ({e['simbolo']}) é {r.pkg(e['raioAtomicoPm'], P(e, 'raioAtomicoPm'))} pm.{fonte_el(e)}"


def r_ei(e, r, ctx):
    if e.get("energiaIonizacaoKJmol") is None:
        return None
    return f"A energia de ionização {do(e)} ({e['simbolo']}) é {r.pkg(e['energiaIonizacaoKJmol'], P(e, 'energiaIonizacaoKJmol'))} kJ/mol.{fonte_el(e)}"


def r_ae(e, r, ctx):
    if e.get("afinidadeEletronicaKJmol") is None:
        return None
    return f"A afinidade eletrônica {do(e)} ({e['simbolo']}) é {r.pkg(e['afinidadeEletronicaKJmol'], P(e, 'afinidadeEletronicaKJmol'))} kJ/mol.{fonte_el(e)}"


def r_valencia(e, r, ctx):
    g, bloco = e.get("grupo"), e.get("bloco")
    if g is None or bloco not in ("s", "p"):
        return None
    if e["simbolo"] == "He":
        vs = r.calc(2, "eletrons_valencia", 4, texto="2")
        return f"{Oo(e)} (He) tem {vs} elétrons de valência: a sua única camada está completa.{fonte_el(e)}"
    if g in (1, 2):
        gs = r.pkg(g, P(e, "grupo"))
        vs = r.calc(g, "eletrons_valencia", 4, texto=str(g))
        return (f"{Oo(e)} ({e['simbolo']}), do grupo {gs} e bloco {bloco}, tem {vs} "
                f"{'elétron' if g == 1 else 'elétrons'} de valência (igual ao número do grupo).{fonte_el(e)}")
    if 13 <= g <= 18:
        gs = r.pkg(g, P(e, "grupo"))
        dez = r.defin(10, "regra_valencia")
        v = g - 10
        vs = r.calc(v, "eletrons_valencia", 4, texto=str(v))
        return (f"{Oo(e)} ({e['simbolo']}), do grupo {gs} e bloco {bloco}, tem {vs} elétrons de valência "
                f"(número do grupo menos {dez}: {gs} {MENOS} {dez} = {vs}).{fonte_el(e)}")
    return None


def r_camadas(e, r, ctx):
    p = e.get("periodo")
    if p is None:
        return None
    ps = r.pkg(p, P(e, "periodo"))
    return f"Um átomo {do(e)} ({e['simbolo']}) tem {ps} {pl(e['periodo'], 'camada eletrônica ocupada', 'camadas eletrônicas ocupadas')}, pois está no período {ps}.{fonte_el(e)}"


def r_mesmo_grupo(e, r, ctx):
    g = e.get("grupo")
    if g is None:
        return None
    todos = [x for x in ctx.pac.elementos if x.get("grupo") == g]
    if not 2 <= len(todos) <= 9:
        return None
    itens = [f"{x['nome'][:1].lower() + x['nome'][1:]} ({x['simbolo']})" for x in todos]
    return f"No pacote de dados, os elementos do grupo {r.pkg(g, P(e, 'grupo'))} são: {lista_pt(itens)}.{fonte_el(e)}"


def r_perfil(e, r, ctx):
    if e.get("massaAtomica") is None:
        return None
    partes = [f"massa atômica {r.pkg(e['massaAtomica'], P(e, 'massaAtomica'))} u"]
    if e.get("grupo") is not None:
        partes.append(f"grupo {r.pkg(e['grupo'], P(e, 'grupo'))}")
    if e.get("periodo") is not None:
        partes.append(f"período {r.pkg(e['periodo'], P(e, 'periodo'))}")
    if e.get("bloco"):
        partes.append(f"bloco {e['bloco']}")
    cat = CATEGORIA_PT.get(e.get("categoria"))
    if cat and e.get("categoria") != "desconhecida":
        partes.append(f"categoria: {cat}")
    if e.get("configuracaoEletronica"):
        partes.append(f"configuração eletrônica {config_sup(e['configuracaoEletronica'])}")
    est = _estado(e)
    if est:
        partes.append(f"estado padrão: {est}")
    return f"{Oo(e)} ({e['simbolo']}, Z = {r.pkg(e['z'], P(e, 'z'))}): " + "; ".join(partes) + f".{fonte_el(e)}"


# (chave, nível, perguntas, função de resposta, campo p/ resposta de ausência | None, rótulo do campo)
TEMPLATES = [
    ("simbolo", "fundamental", ["Qual é o símbolo químico {el_de}?", "Qual o símbolo {el_de}?", "Como se escreve o símbolo {el_de} na tabela periódica?",
                                "Símbolo químico {el_de}", "Me diga o símbolo {el_de}."], r_simbolo, None, None),
    ("nome_por_simbolo", "fundamental", ["Qual elemento tem o símbolo {simb}?", "O símbolo {simb} representa qual elemento?", "{simb} é o símbolo de qual elemento químico?",
                                         "Que elemento é representado por {simb}?"], r_nome, None, None),
    ("numero_atomico", "fundamental", ["Qual é o número atômico {el_de}?", "Qual o Z {el_de}?", "Número atômico {el_de}", "Quantos prótons tem o átomo {el_de}? Qual o número atômico?"],
     r_z, None, None),
    ("massa_atomica", "medio", ["Qual é a massa atômica {el_de}?", "Qual a massa atômica {el_de} em u?", "Quanto vale a massa atômica {el_de}?", "Massa atômica {el_de}",
                                "Qual o peso atômico {el_de}?"], r_massa, "massaAtomica", "a massa atômica"),
    ("grupo", "fundamental", ["Em que grupo da tabela periódica está {el}?", "Qual é o grupo {el_de}?", "A que grupo pertence {el}?", "Grupo {el_de} na tabela periódica"],
     r_grupo, "grupo", "o grupo"),
    ("periodo", "fundamental", ["Em que período da tabela periódica está {el}?", "Qual é o período {el_de}?", "Qual o período {el_de} na tabela?", "Período {el_de}"],
     r_periodo, "periodo", "o período"),
    ("bloco", "medio", ["A que bloco da tabela periódica pertence {el}?", "Qual é o bloco {el_de} (s, p, d ou f)?", "Em qual bloco está {el}?"],
     r_bloco, "bloco", "o bloco"),
    ("categoria", "fundamental", ["Que tipo de elemento é {el}?", "Qual é a classificação {el_de} na tabela periódica?", "{el} é metal, não metal ou outra coisa?",
                                  "A que categoria pertence {el}?"], r_categoria, "categoria", "a categoria"),
    ("configuracao", "superior", ["Qual é a configuração eletrônica {el_de}?", "Qual a distribuição eletrônica {el_de}?", "Configuração eletrônica {el_de}",
                                  "Faça a distribuição eletrônica {el_de}."], r_config, "configuracaoEletronica", "a configuração eletrônica"),
    ("eletronegatividade", "medio", ["Qual é a eletronegatividade {el_de}?", "Qual a eletronegatividade de Pauling {el_de}?", "Eletronegatividade {el_de}",
                                     "Quão eletronegativo é {el}?"], r_en, "eletronegatividade", "a eletronegatividade"),
    ("fusao", "medio", ["Qual é o ponto de fusão {el_de}?", "A que temperatura {el} derrete?", "Ponto de fusão {el_de} em kelvin",
                        "Qual a temperatura de fusão {el_de}?"], _fus_ebu("pontoFusaoK", "ponto de fusão", False), "pontoFusaoK", "o ponto de fusão"),
    ("fusao_c", "medio", ["Qual é o ponto de fusão {el_de} em graus Celsius?", "Em °C, qual o ponto de fusão {el_de}?", "Ponto de fusão {el_de} em °C"],
     _fus_ebu("pontoFusaoK", "ponto de fusão", True), "pontoFusaoK", "o ponto de fusão"),
    ("ebulicao", "medio", ["Qual é o ponto de ebulição {el_de}?", "A que temperatura {el} ferve?", "Ponto de ebulição {el_de} em kelvin",
                           "Qual a temperatura de ebulição {el_de}?"], _fus_ebu("pontoEbulicaoK", "ponto de ebulição", False), "pontoEbulicaoK", "o ponto de ebulição"),
    ("ebulicao_c", "medio", ["Qual é o ponto de ebulição {el_de} em graus Celsius?", "Em °C, qual o ponto de ebulição {el_de}?", "Ponto de ebulição {el_de} em °C"],
     _fus_ebu("pontoEbulicaoK", "ponto de ebulição", True), "pontoEbulicaoK", "o ponto de ebulição"),
    ("densidade", "medio", ["Qual é a densidade {el_de}?", "Qual a densidade {el_de} em kg/m³?", "Densidade {el_de}", "Quão denso é {el}?"],
     r_densidade, "densidadeKgm3", "a densidade"),
    ("oxidacao", "medio", ["Quais são os estados de oxidação {el_de}?", "Que números de oxidação {el} pode ter?", "Estados de oxidação {el_de}", "Qual o nox {el_de}?"],
     r_oxid, "estadosOxidacao", "os estados de oxidação"),
    ("descoberta", "fundamental", ["Quem descobriu {el}?", "Quando {el} foi descoberto?", "Quem e quando descobriu {el}?", "Quem foi o descobridor {el_de}?"],
     r_descoberta, "descoberta", "a descoberta"),
    ("estado_padrao", "fundamental", ["Qual o estado físico {el_de} nas condições padrão?", "{el} é sólido, líquido ou gasoso?", "Em que estado físico {el} se encontra no ambiente?",
                                      "Estado padrão {el_de}"], r_estado, "estadoPadrao", "o estado padrão"),
    ("vizinhos", "fundamental", ["Quais são os elementos vizinhos {el_de} na tabela periódica?", "Qual elemento vem antes e depois {el_de}?", "Quem vem logo depois {el_de} na tabela?",
                                 "Qual o elemento anterior ao {nome}?"], r_vizinhos, None, None),
    ("por_z", "fundamental", ["Qual elemento tem Z = {z}?", "Qual é o elemento de número atômico {z}?", "Que elemento tem número atômico {z}?", "Qual elemento tem Z={z}?"],
     r_por_z, None, None),
    ("eletrons", "fundamental", ["Quantos elétrons tem um átomo neutro {el_de}?", "Quantos elétrons tem o átomo {el_de}?", "Número de elétrons {el_de}"],
     r_eletrons, None, None),
    ("protons", "fundamental", ["Quantos prótons tem o átomo {el_de}?", "Quantos prótons há no núcleo {el_de}?"], r_protons, None, None),
    ("nome_en", "fundamental", ["Como se diz {el} em inglês?", "Qual é o nome em inglês {el_de}?", "{el} em inglês"], r_nome_en, "nomeEn", "o nome em inglês"),
    ("raio", "medio", ["Qual é o raio atômico {el_de}?", "Raio atômico {el_de} em pm", "Qual o tamanho do átomo {el_de} (raio atômico)?"], r_raio, "raioAtomicoPm", "o raio atômico"),
    ("energia_ionizacao", "superior", ["Qual é a energia de ionização {el_de}?", "Energia de ionização {el_de} em kJ/mol", "Quanta energia é preciso para ionizar {el}?"],
     r_ei, "energiaIonizacaoKJmol", "a energia de ionização"),
    ("afinidade", "superior", ["Qual é a afinidade eletrônica {el_de}?", "Afinidade eletrônica {el_de} em kJ/mol"], r_ae, "afinidadeEletronicaKJmol", "a afinidade eletrônica"),
    ("valencia", "medio", ["Quantos elétrons de valência tem {el}?", "Qual o número de elétrons na camada de valência {el_de}?", "Elétrons de valência {el_de}"],
     r_valencia, None, None),
    ("camadas", "fundamental", ["Quantas camadas eletrônicas tem o átomo {el_de}?", "Quantos níveis de energia tem {el}?"], r_camadas, None, None),
    ("mesmo_grupo", "medio", ["Quais elementos estão no mesmo grupo {el_de}?", "Quem são os elementos da mesma família {el_de}?", "Elementos do mesmo grupo {el_de}"],
     r_mesmo_grupo, None, None),
    ("perfil", "medio", ["Fale sobre {el}.", "Me dê um resumo {el_de}.", "O que você sabe sobre {el}?", "Perfil {el_de}", "Quais são as principais informações {el_de}?"],
     r_perfil, None, None),
]


def _valores_pergunta(ctx: Ctx, e, modelo):
    v = {}
    for ph in PLACEHOLDER.findall(modelo):
        if ph == "el_de":
            v[ph] = sup_elemento(ctx, e, "de")
        elif ph == "el_em":
            v[ph] = sup_elemento(ctx, e, "em")
        elif ph == "el":
            v[ph] = sup_elemento(ctx, e, "")
        elif ph == "simb":
            v[ph] = e["simbolo"]
        elif ph == "z":
            v[ph] = str(e["z"])
        elif ph == "nome":
            v[ph] = e["nome"][:1].lower() + e["nome"][1:]
        else:
            raise KeyError(ph)
    return v


def _gerar_comparacoes(ctx: Ctx):
    pac, rng = ctx.pac, ctx.rng
    props = [
        ("eletronegatividade", "eletronegatividade", "", lambda x: fmt_pacote(x), "maior", "menor"),
        ("massaAtomica", "massa atômica", " u", None, "maior", "menor"),
        ("raioAtomicoPm", "raio atômico", " pm", None, "maior", "menor"),
        ("pontoFusaoK", "ponto de fusão", " K", None, "maior", "menor"),
        ("pontoEbulicaoK", "ponto de ebulição", " K", None, "maior", "menor"),
        ("densidadeKgm3", "densidade", " kg/m³", None, "maior", "menor"),
        ("energiaIonizacaoKJmol", "energia de ionização", " kJ/mol", None, "maior", "menor"),
    ]
    n_pares = max(8, min(60, len(pac.elementos) // 2))
    for campo, rotulo, unid, _, mais, menos in props:
        com_dado = [e for e in pac.elementos if e.get(campo) is not None]
        if len(com_dado) < 2:
            continue
        feitos = set()
        tentativas = 0
        gerados = 0
        while gerados < n_pares and tentativas < n_pares * 20:
            tentativas += 1
            a, b = rng.sample(com_dado, 2)
            chave = (campo, a["simbolo"], b["simbolo"])
            if chave in feitos or dec(a[campo]) == dec(b[campo]):
                continue
            feitos.add(chave)
            maior = rng.random() < 0.5
            va, vb = dec(a[campo]), dec(b[campo])
            venc, perd = (a, b) if (va > vb) == maior else (b, a)
            modelos = [
                "Qual tem {adj} {rot}: {a} ou {b}?", "Entre {a} e {b}, qual tem {adj} {rot}?", "Compare a {rot} {a_de} e {b_de}: quem tem {adj} valor?",
                "Quem tem {adj} {rot}, {a} ou {b}?",
            ]
            modelo = rng.choice(modelos)
            valores = {"adj": mais if maior else menos, "rot": rotulo, "a": sup_elemento(ctx, a, "", True), "b": sup_elemento(ctx, b, "", True),
                       "a_de": sup_elemento(ctx, a, "de", True), "b_de": sup_elemento(ctx, b, "de", True)}
            # 'a_de' e 'b_de' só aparecem em um modelo; sup_elemento consome sorteios, o que é determinístico por semente
            pergunta = renderizar(modelo, valores, rng)
            r = Resp()
            adj = mais if maior else menos
            frase = (f"{cap(com_artigo(venc['nome'], '', elemento=True))} ({venc['simbolo']}) tem {adj} {rotulo} "
                     f"({r.pkg(venc[campo], P(venc, campo))}{unid}) do que {com_artigo(perd['nome'], '', elemento=True)} ({perd['simbolo']}), "
                     f"cujo valor é {r.pkg(perd[campo], P(perd, campo))}{unid}.{fonte_el(venc)}")
            ok = ctx.add(f"el-cmp-{campo}-{a['simbolo']}-{b['simbolo']}", pergunta, frase, r, "fato", "medio",
                         {"elementos": [a["simbolo"], b["simbolo"]]}, fontes_do_registro(venc), f"template:elemento.comparar.{campo}", FAM)
            gerados += 1 if ok else 0


def gerar(ctx: Ctx):
    pac, rng = ctx.pac, ctx.rng
    for e in pac.elementos:
        for chave, nivel, modelos, fn, campo_aus, rotulo_aus in TEMPLATES:
            r0 = Resp()
            texto = fn(e, r0, ctx)
            if texto is None:
                ctx.stats[f"elementos_ausente:{chave}"] += 1
                if campo_aus is None or e.get(campo_aus) not in (None, {}, [], ""):
                    continue
                # dado ausente no pacote: resposta honesta, sem inventar valor
                r = Resp()
                texto = (f"O pacote de dados não traz {rotulo_aus} {do(e)} ({e['simbolo']}); por isso não informo um valor. "
                         f"Consulte uma fonte de referência para esse dado.")
                modelo = rng.choice(modelos)
                pergunta = renderizar(modelo, _valores_pergunta(ctx, e, modelo), rng)
                ctx.add(f"el-{e['z']}-{chave}-ausente", pergunta, texto, r, "fato", nivel, {"elementos": [e["simbolo"]]},
                        fontes_do_registro(e), f"template:elemento.{chave}.ausente", FAM)
                continue
            for i, modelo in enumerate(ctx.rng.sample(modelos, min(ctx.variantes, len(modelos)))):
                r = Resp()
                texto = fn(e, r, ctx)  # refaz o registro de origem de números para cada variante
                valores = _valores_pergunta(ctx, e, modelo)
                pergunta = renderizar(modelo, valores, rng)
                ctx.add(f"el-{e['z']}-{chave}-{i + 1}", pergunta, texto, r, "fato", nivel, {"elementos": [e["simbolo"]]},
                        fontes_do_registro(e), f"template:elemento.{chave}", FAM)
    _gerar_comparacoes(ctx)
