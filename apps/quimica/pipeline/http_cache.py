# -*- coding: utf-8 -*-
"""
Cliente HTTP com cache em disco, retentativas e limitador de taxa por host (somente biblioteca padrão).

- GET (e POST, para consultas SPARQL grandes) com `urllib`, `User-Agent` identificado.
- Cache em `pipeline/.cache/<sha256 da URL>.body` + `.json` (cabeçalhos e data da busca). Respeita ETag/Last-Modified:
  depois do TTL a resposta é revalidada com `If-None-Match`/`If-Modified-Since`; 304 reaproveita o corpo.
- Retentativas com espera exponencial (429, 5xx, erro de rede); `Retry-After` é respeitado.
- Se a rede falhar mas houver cache (mesmo vencido), devolve o cache e conta em `stats["cacheVencido"]`.
- Limite de taxa por host: PubChem 4 req/s, Wikidata 1 req/s, OIT (ILO) 1 req/s, demais 2 req/s.
- `offline=True` nunca toca a rede: sem cache levanta `CacheMiss` (usado nos testes e no CI sem rede).
"""
import gzip
import hashlib
import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

USER_AGENT = "SaibaTudoQuimica/0.1 (+https://saibatudo.net; saibatudo@saibatudo.net)"
PASTA_CACHE = Path(__file__).resolve().parent / ".cache"
TTL_PADRAO_S = 6 * 24 * 3600  # o pacote é refeito toda semana; 6 dias evita rebuscar dentro da mesma semana

# requisições por segundo (Wikimedia: 1 req/s em série, conforme API:Etiquette)
LIMITES_POR_HOST = {
    "pubchem.ncbi.nlm.nih.gov": 2.0,  # teto pedido: 4 req/s; 2 deixa folga (houve 429 e bloqueio do IP a ~3,3 req/s sustentados)
    "query.wikidata.org": 1.0,
    "www.wikidata.org": 1.0,
    "chemicalsafety.ilo.org": 1.0,
    "www.ilo.org": 1.0,
    "pt.wikipedia.org": 1.0,
    "pt.wikibooks.org": 1.0,
    "www.ebi.ac.uk": 0.1,  # robots.txt do EBI: Crawl-delay 10
}
LIMITE_PADRAO = 2.0


class CacheMiss(Exception):
    """Modo offline sem entrada em cache para a URL pedida."""


class HttpErro(Exception):
    def __init__(self, status, url, detalhe=""):
        super().__init__(f"HTTP {status} em {url} {detalhe}".strip())
        self.status = status
        self.url = url


@dataclass
class Resposta:
    status: int
    corpo: bytes
    cabecalhos: dict = field(default_factory=dict)
    url: str = ""
    do_cache: bool = False
    buscado_em: float = 0.0

    def charset(self):
        for parte in (self.cabecalhos.get("content-type") or "").split(";")[1:]:
            k, _, v = parte.strip().partition("=")
            if k.lower() == "charset" and v:
                return v.strip("\"' ")
        return None

    def texto(self, encoding=None):
        try:
            return self.corpo.decode(encoding or self.charset() or "utf-8", errors="replace")
        except LookupError:
            return self.corpo.decode("utf-8", errors="replace")

    def json(self):
        return json.loads(self.corpo.decode("utf-8"))

    @property
    def ok(self):
        return self.status == 200


class LimitadorTaxa:
    """Garante o intervalo mínimo entre requisições ao mesmo host. Relógio e sleep injetáveis (testes)."""

    def __init__(self, limites=None, padrao=LIMITE_PADRAO, relogio=time.monotonic, dormir=time.sleep):
        self.limites = dict(LIMITES_POR_HOST if limites is None else limites)
        self.padrao = padrao
        self.relogio = relogio
        self.dormir = dormir
        self._ultimo = {}
        self._trava = threading.Lock()

    def intervalo(self, host):
        return 1.0 / self.limites.get(host, self.padrao)

    def reduzir(self, host, fator=0.6, minimo=0.5):
        """Depois de um 429, reduz a taxa do host pelo resto da execução (nunca abaixo de `minimo` req/s)."""
        atual = self.limites.get(host, self.padrao)
        self.limites[host] = max(minimo, atual * fator)

    def esperar(self, host):
        with self._trava:
            agora = self.relogio()
            ultimo = self._ultimo.get(host)
            if ultimo is not None:
                falta = self.intervalo(host) - (agora - ultimo)
                if falta > 0:
                    self.dormir(falta)
                    agora = self.relogio()
            self._ultimo[host] = agora


def chave_cache(url, dados=None):
    base = url if dados is None else url + "\n" + (dados.decode("utf-8") if isinstance(dados, bytes) else dados)
    return hashlib.sha256(base.encode("utf-8")).hexdigest()


def montar_url(url, params=None):
    if not params:
        return url
    sep = "&" if "?" in url else "?"
    return url + sep + urllib.parse.urlencode(params, doseq=True)


def _abrir_urllib(req, timeout):
    return urllib.request.urlopen(req, timeout=timeout)


class HttpCache:
    def __init__(self, pasta=None, offline=False, ttl_s=TTL_PADRAO_S, tentativas=7, espera_base=1.5, timeout=90,
                 limitador=None, abrir: Optional[Callable] = None, dormir=time.sleep, agora=time.time, log=None):
        self.pasta = Path(pasta) if pasta else PASTA_CACHE
        self.offline = offline
        self.ttl_s = ttl_s
        self.tentativas = tentativas
        self.espera_base = espera_base
        self.timeout = timeout
        self.limitador = limitador or LimitadorTaxa()
        self.abrir = abrir or _abrir_urllib
        self.dormir = dormir
        self.agora = agora
        self.log = log or (lambda msg: None)
        self.stats = {"requisicoes": 0, "doCache": 0, "revalidadas304": 0, "tentativasExtras": 0, "erros": 0,
                      "cacheVencido": 0, "porHost": {}}

    # ---- cache em disco ----
    def _caminhos(self, chave):
        return self.pasta / f"{chave}.body", self.pasta / f"{chave}.json"

    def _ler(self, chave):
        corpo_p, meta_p = self._caminhos(chave)
        if not (corpo_p.exists() and meta_p.exists()):
            return None, None
        try:
            meta = json.loads(meta_p.read_text(encoding="utf-8"))
            corpo = corpo_p.read_bytes()
            return (gzip.decompress(corpo) if meta.get("gz") else corpo), meta
        except (OSError, ValueError):
            return None, None

    def _gravar(self, chave, url, status, corpo, cab, dados=None):
        self.pasta.mkdir(parents=True, exist_ok=True)
        corpo_p, meta_p = self._caminhos(chave)
        meta = {"url": url, "status": status, "buscadoEm": self.agora(), "bytes": len(corpo),
                "etag": cab.get("etag"), "lastModified": cab.get("last-modified"),
                "contentType": cab.get("content-type"), "postBody": dados is not None}
        gravar = corpo
        if len(corpo) > 8192:  # respostas grandes (GHS, sinônimos, listas) ocupam ~10x menos em disco
            gravar = gzip.compress(corpo, 6)
            meta["gz"] = True
        tmp = corpo_p.with_suffix(".tmp")
        tmp.write_bytes(gravar)
        os.replace(tmp, corpo_p)
        tmp_m = meta_p.with_suffix(".tmp")
        tmp_m.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp_m, meta_p)
        return meta

    def _resposta_cache(self, corpo, meta, url):
        cab = {"content-type": meta.get("contentType") or "", "etag": meta.get("etag"),
               "last-modified": meta.get("lastModified")}
        return Resposta(meta.get("status", 200), corpo, cab, url, True, meta.get("buscadoEm", 0.0))

    # ---- rede ----
    def _requisitar(self, url, dados, cabecalhos, etag, last_mod):
        host = urllib.parse.urlparse(url).netloc
        h = {"User-Agent": USER_AGENT, "Accept-Encoding": "gzip"}
        h.update(cabecalhos or {})
        if etag:
            h["If-None-Match"] = etag
        if last_mod:
            h["If-Modified-Since"] = last_mod
        corpo_envio = dados.encode("utf-8") if isinstance(dados, str) else dados
        ultimo_erro = None
        for tentativa in range(1, self.tentativas + 1):
            self.limitador.esperar(host)
            self.stats["requisicoes"] += 1
            self.stats["porHost"][host] = self.stats["porHost"].get(host, 0) + 1
            req = urllib.request.Request(url, data=corpo_envio, headers=h)
            retry_after = None
            try:
                with self.abrir(req, self.timeout) as r:
                    corpo = r.read()
                    cab = {k.lower(): v for k, v in r.headers.items()}
                    if cab.get("content-encoding", "").lower() == "gzip":
                        corpo = gzip.decompress(corpo)
                    controle = cab.get("x-throttling-control", "")  # PubChem: Green/Yellow/Red/Black
                    if "Black" in controle or "Red" in controle:
                        self.dormir(10)
                    elif "Yellow" in controle:
                        self.dormir(2)
                    return r.status, corpo, cab
            except urllib.error.HTTPError as e:
                cab = {k.lower(): v for k, v in (e.headers.items() if e.headers else [])}
                if e.code == 304:
                    return 304, b"", cab
                if e.code == 404:
                    corpo = e.read() or b""
                    if cab.get("content-encoding", "").lower() == "gzip":
                        try:
                            corpo = gzip.decompress(corpo)
                        except OSError:
                            pass
                    return 404, corpo, cab
                if e.code not in (429, 500, 502, 503, 504):
                    raise HttpErro(e.code, url) from e
                ultimo_erro = e
                ra = cab.get("retry-after")
                if ra and ra.isdigit():
                    retry_after = min(int(ra), 300)
                elif e.code == 429:  # sem Retry-After: espera longa (o bloqueio por excesso de requisições dura minutos)
                    retry_after = min(300, 30 * 2 ** (tentativa - 1))
                if e.code == 429:
                    self.limitador.reduzir(host)  # daqui em diante, mais devagar com este host
            except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
                ultimo_erro = e
            self.stats["erros"] += 1
            if tentativa < self.tentativas:
                self.stats["tentativasExtras"] += 1
                espera = retry_after if retry_after is not None else self.espera_base * (2 ** (tentativa - 1))
                self.log(f"  [http] tentativa {tentativa} falhou ({ultimo_erro}); nova em {espera:.1f}s")
                self.dormir(espera)
        raise HttpErro(getattr(ultimo_erro, "code", 0) or 0, url, f"após {self.tentativas} tentativas: {ultimo_erro}")

    def get(self, url, params=None, dados=None, cabecalhos=None, ttl_s=None, forcar=False) -> Resposta:
        """GET (ou POST se `dados`). Devolve Resposta (status 200 ou 404; outros erros levantam HttpErro)."""
        url_final = montar_url(url, params)
        chave = chave_cache(url_final, dados)
        corpo_c, meta = self._ler(chave)
        ttl = self.ttl_s if ttl_s is None else ttl_s
        if corpo_c is not None and meta is not None:
            if self.offline:
                self.stats["doCache"] += 1
                return self._resposta_cache(corpo_c, meta, url_final)
            if not forcar and (self.agora() - meta.get("buscadoEm", 0)) < ttl:
                self.stats["doCache"] += 1
                return self._resposta_cache(corpo_c, meta, url_final)
        elif self.offline:
            raise CacheMiss(url_final)
        try:
            status, corpo, cab = self._requisitar(url_final, dados, cabecalhos,
                                                  (meta or {}).get("etag") if corpo_c is not None and dados is None else None,
                                                  (meta or {}).get("lastModified") if corpo_c is not None and dados is None else None)
        except HttpErro:
            if corpo_c is not None:
                self.stats["cacheVencido"] += 1
                self.log(f"  [http] sem rede para {url_final[:90]}; usando cache vencido")
                return self._resposta_cache(corpo_c, meta, url_final)
            raise
        if status == 304 and corpo_c is not None:
            self.stats["revalidadas304"] += 1
            meta["buscadoEm"] = self.agora()
            self._gravar(chave, url_final, meta.get("status", 200), corpo_c,
                         {"etag": meta.get("etag"), "last-modified": meta.get("lastModified"),
                          "content-type": meta.get("contentType")}, dados)
            return self._resposta_cache(corpo_c, meta, url_final)
        meta = self._gravar(chave, url_final, status, corpo, cab, dados)
        return Resposta(status, corpo, {"content-type": cab.get("content-type", ""), "etag": cab.get("etag"),
                                        "last-modified": cab.get("last-modified")}, url_final, False, meta["buscadoEm"])

    def get_json(self, url, params=None, **kw):
        r = self.get(url, params=params, **kw)
        return (r.json() if r.status == 200 else None), r

    def post(self, url, dados, **kw):
        return self.get(url, dados=dados, **kw)
