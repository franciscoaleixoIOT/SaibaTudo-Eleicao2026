# -*- coding: utf-8 -*-
"""
Verificação de robots.txt antes de cada fonte HTTP (urllib.robotparser) e Crawl-delay.

Regras do projeto (docs/FONTES_E_LICENCAS.md §4.7.9): `User-Agent` identificado, esperas e checagem de robots.txt.
Exceção documentada: as APIs de dados dos projetos Wikimedia (`/w/api.php`) estão sob `Disallow: /w/` para robôs
genéricos, mas são a interface oficial para programas (API:Etiquette + User-Agent Policy: serial, `User-Agent` com
contato). Elas só são aceitas pela lista EXCECOES abaixo; qualquer outra rota segue o robots.txt à risca.
"""
import urllib.parse
import urllib.robotparser

from http_cache import USER_AGENT, CacheMiss, HttpErro

# (host, prefixo de caminho) aceitos mesmo com Disallow no robots.txt, por serem a API oficial de programas.
EXCECOES = (
    ("pt.wikipedia.org", "/w/api.php"),
    ("pt.wikibooks.org", "/w/api.php"),
    ("www.wikidata.org", "/w/api.php"),
    ("query.wikidata.org", "/sparql"),  # endpoint SPARQL oficial, documentado para clientes automáticos
    # PUG REST/PUG View são a API oficial do PubChem (limite documentado: 5 req/s); o robots.txt cobre o HTML do site.
    ("pubchem.ncbi.nlm.nih.gov", "/rest/pug"),
)


class Robots:
    def __init__(self, http, agente=USER_AGENT):
        self.http = http
        self.agente = agente
        self._por_host = {}

    def _regras(self, esquema, host):
        chave = (esquema, host)
        if chave not in self._por_host:
            rp = urllib.robotparser.RobotFileParser()
            try:
                r = self.http.get(f"{esquema}://{host}/robots.txt", ttl_s=24 * 3600)
                if r.status == 200:
                    rp.parse(r.texto("utf-8").splitlines())
                else:  # sem robots.txt: tudo liberado
                    rp.parse([])
            except (HttpErro, CacheMiss, OSError):
                rp.parse([])  # sem como ler: o chamador ainda respeita as esperas
            self._por_host[chave] = rp
        return self._por_host[chave]

    def permitido(self, url):
        p = urllib.parse.urlparse(url)
        for host, prefixo in EXCECOES:
            if p.netloc == host and p.path.startswith(prefixo):
                return True
        return self._regras(p.scheme, p.netloc).can_fetch(self.agente, url)

    def atraso(self, url):
        """Crawl-delay (s) declarado para o nosso agente (ou `*`); None se não houver."""
        p = urllib.parse.urlparse(url)
        rp = self._regras(p.scheme, p.netloc)
        return rp.crawl_delay(self.agente) or rp.crawl_delay("*")
