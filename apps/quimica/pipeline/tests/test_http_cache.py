# -*- coding: utf-8 -*-
"""Cache HTTP: gravação/leitura, TTL, revalidação 304, retentativas com espera exponencial, limitador por host, offline."""
import gzip
import io
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import http_cache as H  # noqa: E402


class RespostaFalsa:
    def __init__(self, status=200, corpo=b"{}", cab=None):
        self.status = status
        self._corpo = corpo
        self.headers = cab or {}

    def read(self):
        return self._corpo

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class Servidor:
    """Substitui urllib.request.urlopen: devolve a fila de respostas/exceções e guarda os pedidos."""

    def __init__(self, *respostas):
        self.fila = list(respostas)
        self.pedidos = []

    def __call__(self, req, timeout):
        self.pedidos.append(req)
        r = self.fila.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


def http_erro(codigo, cab=None):
    return urllib.error.HTTPError("http://x", codigo, "erro", cab or {}, io.BytesIO(b"corpo de erro"))


class Relogio:
    def __init__(self):
        self.t = 1000.0
        self.dormidos = []

    def agora(self):
        return self.t

    def dormir(self, s):
        self.dormidos.append(s)
        self.t += s


class HttpCacheTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.rel = Relogio()
        self.lim = H.LimitadorTaxa(relogio=self.rel.agora, dormir=self.rel.dormir)

    def tearDown(self):
        self.tmp.cleanup()

    def cliente(self, *respostas, **kw):
        self.srv = Servidor(*respostas)
        kw.setdefault("limitador", self.lim)
        return H.HttpCache(pasta=self.tmp.name, abrir=self.srv, dormir=self.rel.dormir, agora=self.rel.agora, **kw)

    def test_user_agent_e_cache(self):
        c = self.cliente(RespostaFalsa(corpo=b'{"a": 1}', cab={"ETag": '"v1"', "Content-Type": "application/json"}))
        r = c.get("https://exemplo.org/x", params={"q": "1"})
        self.assertEqual(r.json(), {"a": 1})
        self.assertEqual(self.srv.pedidos[0].get_header("User-agent"), H.USER_AGENT)
        self.assertIn("saibatudo@saibatudo.net", H.USER_AGENT)
        r2 = c.get("https://exemplo.org/x", params={"q": "1"})  # dentro do TTL: não vai à rede
        self.assertTrue(r2.do_cache)
        self.assertEqual(len(self.srv.pedidos), 1)
        chave = H.chave_cache("https://exemplo.org/x?q=1")
        self.assertTrue((Path(self.tmp.name) / f"{chave}.body").exists())
        self.assertTrue((Path(self.tmp.name) / f"{chave}.json").exists())

    def test_revalida_com_etag_e_aceita_304(self):
        c = self.cliente(RespostaFalsa(corpo=b"antigo", cab={"ETag": '"v1"'}), http_erro(304))
        c.get("https://exemplo.org/x")
        self.rel.t += H.TTL_PADRAO_S + 1
        r = c.get("https://exemplo.org/x")
        self.assertEqual(r.corpo, b"antigo")
        self.assertEqual(self.srv.pedidos[1].get_header("If-none-match"), '"v1"')
        self.assertEqual(c.stats["revalidadas304"], 1)

    def test_retentativas_com_espera_exponencial(self):
        c = self.cliente(http_erro(503), http_erro(503), RespostaFalsa(corpo=b"ok"), espera_base=2.0)
        r = c.get("https://exemplo.org/y")
        self.assertEqual(r.corpo, b"ok")
        self.assertEqual([round(x, 1) for x in self.rel.dormidos if x >= 2.0], [2.0, 4.0])
        self.assertEqual(c.stats["tentativasExtras"], 2)

    def test_429_respeita_retry_after(self):
        c = self.cliente(http_erro(429, {"Retry-After": "7"}), RespostaFalsa(corpo=b"ok"))
        c.get("https://exemplo.org/z")
        self.assertIn(7, self.rel.dormidos)

    def test_429_sem_retry_after_espera_longo_e_reduz_a_taxa(self):
        c = self.cliente(http_erro(429), http_erro(429), RespostaFalsa(corpo=b"ok"))
        antes = self.lim.limites.get("exemplo.org", self.lim.padrao)
        c.get("https://exemplo.org/lento")
        self.assertEqual([x for x in self.rel.dormidos if x >= 30], [30, 60])
        self.assertLess(self.lim.limites["exemplo.org"], antes)

    def test_pubchem_semaforo_vermelho_espera(self):
        c = self.cliente(RespostaFalsa(corpo=b"ok", cab={"X-Throttling-Control": "Request Count status: Red (80%)"}))
        c.get("https://pubchem.ncbi.nlm.nih.gov/rest/pug/x")
        self.assertIn(10, self.rel.dormidos)

    def test_erro_definitivo_levanta_e_404_e_resposta(self):
        c = self.cliente(http_erro(403))
        with self.assertRaises(H.HttpErro):
            c.get("https://exemplo.org/proibido")
        c = self.cliente(http_erro(404))
        self.assertEqual(c.get("https://exemplo.org/nada").status, 404)

    def test_falha_de_rede_usa_cache_vencido(self):
        c = self.cliente(RespostaFalsa(corpo=b"velho"), urllib.error.URLError("sem rede"), urllib.error.URLError("sem rede"),
                         tentativas=2)
        c.get("https://exemplo.org/w")
        self.rel.t += H.TTL_PADRAO_S + 1
        self.assertEqual(c.get("https://exemplo.org/w").corpo, b"velho")
        self.assertEqual(c.stats["cacheVencido"], 1)

    def test_gzip_na_resposta_e_no_disco(self):
        grande = b"x" * 20000
        c = self.cliente(RespostaFalsa(corpo=gzip.compress(grande), cab={"Content-Encoding": "gzip"}))
        self.assertEqual(c.get("https://exemplo.org/g").corpo, grande)
        arquivo = next(Path(self.tmp.name).glob("*.body"))
        self.assertLess(arquivo.stat().st_size, 2000)  # guardado comprimido
        c2 = self.cliente(offline=True)
        self.assertEqual(c2.get("https://exemplo.org/g").corpo, grande)

    def test_post_tem_chave_propria(self):
        c = self.cliente(RespostaFalsa(corpo=b"um"), RespostaFalsa(corpo=b"dois"))
        a = c.get("https://exemplo.org/p", dados=b"query=1")
        b = c.get("https://exemplo.org/p", dados=b"query=2")
        self.assertEqual((a.corpo, b.corpo), (b"um", b"dois"))

    def test_offline_sem_cache_levanta(self):
        c = self.cliente(offline=True)
        with self.assertRaises(H.CacheMiss):
            c.get("https://exemplo.org/nao-existe")


class LimitadorTest(unittest.TestCase):
    def test_intervalos_por_host(self):
        lim = H.LimitadorTaxa()
        self.assertAlmostEqual(lim.intervalo("pubchem.ncbi.nlm.nih.gov"), 1 / 2.0)  # 2 req/s (teto pedido: 4)
        self.assertAlmostEqual(lim.intervalo("query.wikidata.org"), 1.0)          # 1 req/s
        self.assertAlmostEqual(lim.intervalo("chemicalsafety.ilo.org"), 1.0)      # 1 req/s
        self.assertAlmostEqual(lim.intervalo("www.ebi.ac.uk"), 10.0)              # Crawl-delay do EBI
        self.assertAlmostEqual(lim.intervalo("qualquer.org"), 0.5)                # padrão 2 req/s

    def test_espaca_as_requisicoes(self):
        rel = Relogio()
        lim = H.LimitadorTaxa(relogio=rel.agora, dormir=rel.dormir)
        for _ in range(5):
            lim.esperar("pubchem.ncbi.nlm.nih.gov")
        self.assertAlmostEqual(sum(rel.dormidos), 4 / 2.0)
        lim.esperar("query.wikidata.org")  # outro host não espera
        self.assertAlmostEqual(sum(rel.dormidos), 4 / 2.0)  # continua igual: o outro host não esperou


if __name__ == "__main__":
    unittest.main()
