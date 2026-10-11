# -*- coding: utf-8 -*-
"""Leitor tolerante do pacote `data/quimica/` (contrato: docs/DATA_CONTRACT.md) ou da fixture de teste.

Só lê; nunca altera o pacote (é assinado). Aceita variações de forma (lista ou objeto com a chave da família) porque o
contrato não fixa o invólucro dos arquivos; os campos de cada registro seguem o contrato à risca.
"""
import re
from pathlib import Path

from comum import FIXTURE_DIR, PACOTE_DIR, fold, ler_json


def _lista(obj, *chaves):
    if isinstance(obj, list):
        return obj
    if isinstance(obj, dict):
        for k in chaves:
            if isinstance(obj.get(k), list):
                return obj[k]
        # dict id -> registro
        vals = list(obj.values())
        if vals and all(isinstance(v, dict) for v in vals):
            return vals
    raise ValueError("formato inesperado: " + repr(type(obj)))


class Pacote:
    def __init__(self, raiz):
        self.raiz = Path(raiz)
        self.eh_fixture = (self.raiz.resolve() == FIXTURE_DIR.resolve())
        self.manifest = ler_json(self.raiz / "manifest.json") if (self.raiz / "manifest.json").exists() else {}
        self.versao = self.manifest.get("version") or self.manifest.get("dataVersion") or "desconhecida"
        self.avisos = []

        # elementos
        els = _lista(ler_json(self.raiz / "elementos.json"), "elementos")
        self.elementos = sorted(els, key=lambda e: e["z"])
        self.el_simbolo = {e["simbolo"]: e for e in self.elementos}
        self.el_z = {e["z"]: e for e in self.elementos}
        self.massas = {e["simbolo"]: e["massaAtomica"] for e in self.elementos if e.get("massaAtomica") is not None}

        # compostos (lotes)
        self.compostos = []
        vistos = set()
        pasta = self.raiz / "compostos"
        if pasta.exists():
            for arq in sorted(pasta.glob("*.json")):
                if arq.name == "index.json":
                    continue
                for c in _lista(ler_json(arq), "compostos"):
                    if c.get("cid") in vistos:
                        continue
                    vistos.add(c.get("cid"))
                    self.compostos.append(c)
        self.comp_cid = {c["cid"]: c for c in self.compostos}

        # constantes, regras, fontes
        self.constantes = []
        if (self.raiz / "constantes.json").exists():
            self.constantes = _lista(ler_json(self.raiz / "constantes.json"), "constantes")
        self.regras = ler_json(self.raiz / "regras.json") if (self.raiz / "regras.json").exists() else {}
        self.fontes_json = []
        if (self.raiz / "fontes.json").exists():
            fj = ler_json(self.raiz / "fontes.json")
            self.fontes_json = fj if isinstance(fj, list) else _lista(fj, "fontes")

        # frases H em português (Anexo III do CLP) — arquivo opcional do pacote
        self.frases_h = {}
        for rel in ("ghs_frases.json", "seguranca/ghs_frases.json", "ghs/frases.json"):
            if (self.raiz / rel).exists():
                fh = ler_json(self.raiz / rel)
                # Invólucros aceitos: {"frases"|"todasAsFrases"|"frasesH": mapa}, ou mapa direto {codigo: texto|{texto}}.
                # O pipeline (build.montar_ghs_frases) grava {"frasesH": {cod: {texto}}, "todasAsFrases": {cod: texto}, ...}.
                mapa = {}
                if isinstance(fh, dict):
                    for chave in ("todasAsFrases", "frases", "frasesH", "frases_h", "H"):
                        v = fh.get(chave)
                        if isinstance(v, dict):
                            mapa.update(v)
                        elif isinstance(v, list):
                            for x in v:
                                if isinstance(x, dict):
                                    mapa[x.get("codigo") or x.get("id")] = x.get("texto") or x.get("pt") or ""
                            break
                    if not mapa:  # mapa direto, sem invólucro
                        if all(isinstance(v, (str, dict)) for v in fh.values()):
                            mapa = fh
                elif isinstance(fh, list):
                    for x in fh:
                        if isinstance(x, dict):
                            mapa[x.get("codigo") or x.get("id")] = x.get("texto") or x.get("pt") or ""
                self.frases_h = {str(k).replace(" ", ""): (v if isinstance(v, str) else (v.get("texto") or v.get("pt") or ""))
                                 for k, v in mapa.items() if k is not None and isinstance(v, (str, dict))}
                self.frases_h = {k: v for k, v in self.frases_h.items() if v}
                break

        # textos
        self.textos = {}
        pasta = self.raiz / "textos"
        if pasta.exists():
            for arq in sorted(pasta.rglob("*.json")):
                if arq.name in ("index.json",):
                    continue
                try:
                    t = ler_json(arq)
                except ValueError:
                    continue
                for item in (t if isinstance(t, list) else [t]):
                    if isinstance(item, dict) and item.get("id") and item.get("textoOriginal"):
                        item["_pasta"] = arq.parent.name
                        self.textos[item["id"]] = item

    # -- consultas -------------------------------------------------------------------------------------
    def const(self, *palavras):
        """Constante cujo id/símbolo é IGUAL a uma palavra-chave, ou cujo id/nome (sem acento, minúsculo) a contém (palavras com mais de 2 letras)."""
        for c in self.constantes:
            idc, simb, nome = (fold(str(c.get(k) or "")) for k in ("id", "simbolo", "nome"))
            for p in palavras:
                kw = fold(p)
                if kw in (idc, simb) or (len(kw) > 2 and (kw in nome or kw in idc)):
                    return c
        return None

    def valor_const(self, *palavras):
        c = self.const(*palavras)
        if c is None:
            return None
        v = c.get("valor", c.get("value"))
        return v

    def regra(self, *caminho, padrao=None):
        o = self.regras
        for k in caminho:
            if isinstance(o, dict) and k in o:
                o = o[k]
            else:
                return padrao
        return o

    def nome_composto(self, c):
        return c.get("nome") or c.get("nomeIupac") or str(c.get("cid"))

    def comp_pendente(self, c):
        return bool(c.get("nomePtPendente"))

    def formula_exibicao(self, c):
        return c.get("formula") or c.get("formulaHill")

    def tem_ghs(self, c):
        g = c.get("ghs")
        return bool(g) and (g.get("pictogramas") or g.get("frasesH") or g.get("palavraSinal"))


def const_id(c) -> str:
    return str(c.get("id") or c.get("simbolo") or c.get("nome"))


def localizar(diretorio=None) -> Pacote:
    """Pacote real quando existe (`data/quimica/manifest.json`); senão a fixture de teste."""
    if diretorio:
        return Pacote(diretorio)
    if (PACOTE_DIR / "manifest.json").exists() and (PACOTE_DIR / "elementos.json").exists():
        return Pacote(PACOTE_DIR)
    return Pacote(FIXTURE_DIR)


def fontes_do_registro(reg, max_n=2):
    """`fontes` do registro -> [{nome, licenca}] (curto) para anexar às perguntas/respostas."""
    out = []
    for f in (reg.get("fontes") or [])[:max_n]:
        item = {"nome": f.get("nome"), "licenca": f.get("licenca")}
        if item not in out:
            out.append(item)
    return out


def resolver_origem(pac: Pacote, caminho: str):
    """'elementos.json#O.massaAtomica' | 'compostos#962.massaMolar' | 'constantes#gases.valor' | 'regras#...'
    -> valor do pacote (ou None). Usado pelos testes de fidelidade."""
    arq, _, resto = caminho.partition("#")
    partes = resto.split(".")
    chave, campos = partes[0], partes[1:]
    if arq.startswith("elementos"):
        obj = pac.el_simbolo.get(chave)
    elif arq.startswith("compostos"):
        obj = pac.comp_cid.get(int(chave)) if chave.isdigit() else None
    elif arq.startswith("constantes"):
        obj = next((c for c in pac.constantes if const_id(c) == chave), None)
    elif arq.startswith("regras"):
        obj = pac.regras
        campos = partes
    else:
        return None
    for k in campos:
        if isinstance(obj, dict):
            obj = obj.get(k)
        elif isinstance(obj, list) and k.isdigit() and int(k) < len(obj):
            obj = obj[int(k)]
        else:
            return None
    return obj
