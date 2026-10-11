# -*- coding: utf-8 -*-
"""
Cliente do PubChem (PUG REST e PUG View) sobre o cache HTTP (2 req/s; teto pedido 4).

Política de campos (docs/FONTES_E_LICENCAS.md §5): só entram campos **calculados pelo próprio PubChem/NLM** (fórmula, massa,
massa exata, SMILES, InChIKey, XLogP, TPSA, contagens, carga, IUPACName) e identificadores. Sinônimos e demais depósitos de
terceiros não são lidos. GHS: apenas quando o PUG View indicar como fonte o Regulamento (CE) n.º 1272/2008 (classificação
harmonizada do Anexo VI); classificações notificadas (ECHA C&L Inventory), NITE-CMC e demais fontes ficam fora.
"""
import re
import urllib.parse

from http_cache import HttpErro

REST = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"
VIEW = "https://pubchem.ncbi.nlm.nih.gov/rest/pug_view"
PROPS = ("MolecularFormula,MolecularWeight,ExactMass,IUPACName,ConnectivitySMILES,InChIKey,XLogP,HBondDonorCount,"
         "HBondAcceptorCount,RotatableBondCount,Charge,TPSA")
LOTE = 100

FONTE_HARMONIZADA = "1272/2008"  # trecho do nome da fonte no PUG View (Regulamento CLP)
SINAIS = {"Danger": "Perigo", "Warning": "Atenção"}  # palavras de advertência do CLP em português

_H = re.compile(r"^\s*((?:EUH\d{3}[A-Z]?)|(?:H\d{3}[A-Za-z]*(?:\s*\+\s*H\d{3}[A-Za-z]*)*))\b")


class PubChem:
    def __init__(self, http):
        self.http = http
        self._props = {}

    # ---- identificação
    def nome_para_cids(self, nome):
        url = f"{REST}/compound/name/{urllib.parse.quote(nome, safe='')}/cids/JSON"
        r = self.http.get(url)
        if r.status != 200:
            return []
        return [int(c) for c in r.json().get("IdentifierList", {}).get("CID", []) if int(c) > 0]

    # ---- propriedades (lotes determinísticos para o cache)
    def propriedades(self, cids):
        """Devolve {cid: {...}} só dos CIDs encontrados. Reaproveita o que já foi lido nesta execução."""
        faltam = sorted({int(c) for c in cids} - set(self._props))
        for i in range(0, len(faltam), LOTE):
            lote = faltam[i:i + LOTE]
            for linha in self._lote_props(lote, PROPS):
                self._props[int(linha["CID"])] = linha
            sem_smiles = [c for c in lote if c in self._props and "ConnectivitySMILES" not in self._props[c]]
            if sem_smiles:  # compatibilidade: nome antigo da propriedade
                for linha in self._lote_props(sem_smiles, "CanonicalSMILES"):
                    if "CanonicalSMILES" in linha:
                        self._props[int(linha["CID"])]["ConnectivitySMILES"] = linha["CanonicalSMILES"]
            for c in lote:
                self._props.setdefault(c, None)
        return {c: self._props[c] for c in {int(x) for x in cids} if self._props.get(c)}

    def _lote_props(self, cids, props):
        url = f"{REST}/compound/cid/{','.join(map(str, cids))}/property/{props}/JSON"
        r = self.http.get(url)
        if r.status != 200:
            return []
        return r.json().get("PropertyTable", {}).get("Properties", [])

    # ---- GHS
    def ghs_harmonizado(self, cid):
        """GHS da classificação harmonizada da UE (Regulamento 1272/2008) ou None."""
        url = f"{VIEW}/data/compound/{int(cid)}/JSON?heading=GHS+Classification"
        r = self.http.get(url)  # HttpErro (rede/429 persistente) sobe: o chamador conta a falha e decide
        if r.status != 200:   # 404 = sem seção GHS para este CID
            return None
        return extrair_ghs_harmonizado(r.json())


def _secao(secoes, titulo):
    for s in secoes:
        if s.get("TOCHeading") == titulo:
            return s
        achado = _secao(s.get("Section", []), titulo)
        if achado:
            return achado
    return None


def extrair_ghs_harmonizado(dados):
    """Lê o JSON do PUG View ("GHS Classification") e devolve o GHS da fonte harmonizada, ou None.

    Resultado: {"pictogramas": ["GHS02", ...], "palavraSinal": "Perigo", "frasesH": ["H225", ...],
                "fonte": "<SourceName literal do PubChem>", "fonteUrl": "...", "entrada": "<Name literal>"}"""
    rec = dados.get("Record", {})
    secao = _secao(rec.get("Section", []), "GHS Classification")
    if not secao:
        return None
    refs = {r["ReferenceNumber"]: r for r in rec.get("Reference", [])}
    grupos = {}
    for info in secao.get("Information", []):
        grupos.setdefault(info.get("ReferenceNumber"), []).append(info)
    for num, infos in grupos.items():
        ref = refs.get(num, {})
        if FONTE_HARMONIZADA not in (ref.get("SourceName") or ""):
            continue
        pictos, sinal, frases = [], None, []
        for info in infos:
            nome = info.get("Name")
            valores = info.get("Value", {}).get("StringWithMarkup", [])
            if nome == "Pictogram(s)":
                for v in valores:
                    for m in v.get("Markup", []):
                        mt = re.search(r"(GHS\d{2})\.svg", m.get("URL", ""))
                        if m.get("Type") == "Icon" and mt and mt.group(1) not in pictos:
                            pictos.append(mt.group(1))
            elif nome == "Signal" and valores:
                sinal = SINAIS.get(valores[0].get("String", "").strip())
            elif nome == "GHS Hazard Statements":
                for v in valores:
                    m = _H.match(v.get("String", ""))
                    if m:
                        cod = re.sub(r"\s+", "", m.group(1))
                        if cod not in frases:
                            frases.append(cod)
        if not (pictos or sinal or frases):
            continue
        out = {"pictogramas": sorted(pictos), "frasesH": frases, "fonte": ref.get("SourceName", "").strip()}
        if sinal:
            out["palavraSinal"] = sinal
        if ref.get("URL"):
            out["fonteUrl"] = ref["URL"]
        if ref.get("Name"):
            out["entrada"] = ref["Name"].strip()
        return out
    return None


def numero(v):
    """Valores do PUG REST vêm como número ou texto ('180.16'); devolve float/int ou None."""
    if v is None or v == "":
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return int(f) if f == int(f) and isinstance(v, int) else f
