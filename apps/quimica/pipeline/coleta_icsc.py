# -*- coding: utf-8 -*-
"""
ICSC — Fichas Internacionais de Segurança Química (OIT/OMS; versão em português © ACT, Portugal).

DECISÃO (docs/FONTES_E_LICENCAS.md §5): os cartões NÃO entram como dados (sem licença de reuso). O pacote só leva, em cada
composto com número CAS, o campo `icscBuscaUrl`: link para a busca por CAS no site da OIT, em português. Nada do conteúdo dos
cartões é copiado nem coletado pelo build.

O parser abaixo ficou no repositório **desativado** (nenhum módulo do build o chama), caso a OIT/ACT autorize o reuso.
"""
import re
import urllib.parse
from html.parser import HTMLParser

DESATIVADO = True
URL_BUSCA = "https://chemicalsafety.ilo.org/dyn/icsc/showcard.listCards3"


def url_busca_cas(cas):
    """Link de busca por CAS no site da OIT (formulário em português; a página aceita GET)."""
    return f"{URL_BUSCA}?{urllib.parse.urlencode({'p_lang': 'pt', 'p_cas_number': cas})}"


# --------------------------------------------------------------------------------------------- parser (desativado)
class _Tabelas(HTMLParser):
    """Coleta o texto de cada <td>/<th> de cada <table> do cartão (estrutura da OIT, versão 2)."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tabelas, self._linha, self._cel, self._prof = [], None, None, 0
        self._atual = None

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self._prof += 1
            if self._prof == 1:
                self._atual = []
                self.tabelas.append(self._atual)
        elif tag == "tr" and self._prof == 1:
            self._linha = []
        elif tag in ("td", "th") and self._prof == 1:
            self._cel = []
        elif tag in ("br", "p") and self._cel is not None:
            self._cel.append("\n")

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._cel is not None and self._linha is not None:
            texto = re.sub(r"[ \t ]+", " ", "".join(self._cel))
            texto = re.sub(r"\n\s*", "\n", texto).strip()
            self._linha.append((tag, texto))
            self._cel = None
        elif tag == "tr" and self._linha is not None and self._atual is not None:
            self._atual.append(self._linha)
            self._linha = None
        elif tag == "table":
            self._prof -= 1

    def handle_data(self, data):
        if self._cel is not None:
            self._cel.append(data)


def parse_cartao(html_texto):
    """(DESATIVADO) Extrai campos de um cartão ICSC em português. Só para uso futuro, com autorização."""
    t = _Tabelas()
    t.feed(html_texto)
    out = {"nome": None, "icsc": None, "cas": None, "un": None, "ce": None}
    for tabela in t.tabelas:
        for linha in tabela:
            for _, txt in linha:
                m = re.search(r"CAS #:\s*([\d-]+)", txt)
                if m:
                    out["cas"] = m.group(1)
                m = re.search(r"ONU #:\s*(\d+)", txt)
                if m:
                    out["un"] = m.group(1)
                m = re.search(r"N[úu]mero CE:\s*([\d-]+)", txt)
                if m:
                    out["ce"] = m.group(1)
                m = re.search(r"ICSC:\s*(\d{4})", txt)
                if m:
                    out["icsc"] = m.group(1)
    if t.tabelas and t.tabelas[0] and t.tabelas[0][0]:
        out["nome"] = t.tabelas[0][0][0][1] or None
    return {k: v for k, v in out.items() if v}
