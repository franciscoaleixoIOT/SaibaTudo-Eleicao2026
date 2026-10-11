# -*- coding: utf-8 -*-
"""Roda `build.py --rapido` OFFLINE sobre respostas reais gravadas em fixtures/cache (PubChem, Wikidata, CODATA, Wikimedia,
ChEBI, Gutenberg). As frases H do CLP (29 MB no Cellar) são substituídas por um dicionário pequeno."""
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import build  # noqa: E402
import clp  # noqa: E402
import sign  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "cache"
FRASES = {"H225": "Líquido e vapor facilmente inflamáveis.", "H271": "Risco de incêndio ou de explosão; muito comburente.",
          "H272": "Pode agravar incêndios; comburente.", "H300": "Mortal por ingestão.", "H310": "Mortal em contacto com a pele.",
          "H314": "Provoca queimaduras na pele e lesões oculares graves.", "H330": "Mortal por inalação.",
          "H331": "Tóxico por inalação.", "H335": "Pode provocar irritação das vias respiratórias."}


class BuildOfflineTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        tmp = Path(cls.tmp.name)
        cls.out = tmp / "pacote"
        cls.cache = tmp / "cache"
        shutil.copytree(FIXTURES, cls.cache)  # cópia: o build pode gravar (ultimo_stats.json)
        sign.gerar(tmp / "k.pem", tmp / "pub.pem")
        cls.pub = tmp / "pub.pem"
        cls._orig = clp.coletar
        clp.coletar = lambda http, hoje: (dict(FRASES), {"celex": "teste", "url": clp.URL_EURLEX.format(celex="32008R1272")})
        try:
            cls.rc = build.main(["--rapido", "--offline", "--cache", str(cls.cache), "--out", str(cls.out),
                                 "--limite-compostos", "12", "--limite-textos", "6", "--hoje", "2026-10-10",
                                 "--assinar-com", str(tmp / "k.pem")])
        finally:
            clp.coletar = cls._orig

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def lido(self, rel):
        return json.loads((self.out / rel).read_text(encoding="utf-8"))

    def test_build_terminou_e_assinou(self):
        self.assertEqual(self.rc, 0)
        self.assertTrue(sign.verificar(self.out / "manifest.json", self.pub))
        self.assertEqual(build.validar(self.out, minimos={"compostos": 10, "textos": 10, "constantes": 40}), [])
        self.assertFalse(Path(str(self.out) + ".novo").exists())

    def test_contagens(self):
        m = self.lido("manifest.json")
        self.assertEqual(m["contagens"]["elementos"], 118)
        self.assertEqual(m["contagens"]["compostos"], 12)
        self.assertGreaterEqual(m["contagens"]["constantes"], 50)
        self.assertGreater(m["contagens"]["textosPorFonte"]["gutenberg-14474"], 100)
        self.assertGreater(m["contagens"]["textosPorFonte"]["wikipedia-pt"], 5)
        self.assertEqual(m["contagens"]["textosPorFonte"]["gold-book"], 0)

    def test_elementos_e_compostos(self):
        els = self.lido("elementos.json")
        self.assertEqual([e["z"] for e in els], list(range(1, 119)))
        c = self.lido("compostos/lote-001.json")
        self.assertEqual(len(c), 12)
        hcl = next(x for x in c if x["cid"] == 313)
        self.assertEqual(hcl["formula"], "HCl")
        self.assertEqual(hcl["formulaHill"], "ClH")
        self.assertEqual(hcl["cas"], "7647-01-0")
        self.assertTrue(hcl["icscBuscaUrl"].startswith("https://chemicalsafety.ilo.org/dyn/icsc/showcard.listCards3?p_lang=pt&p_cas_number="))
        self.assertIn("1272/2008", hcl["ghs"]["fonte"])
        self.assertEqual(self.lido("compostos/index.json")["porCid"]["313"], "lote-001")

    def test_nada_de_openstax_nem_icsc_nos_dados(self):
        self.assertFalse((self.out / "seguranca").exists())
        self.assertFalse((self.out / "textos" / "openstax-chem2e").exists())
        pastas = {p.name for p in (self.out / "textos").iterdir()}
        self.assertTrue(pastas <= {"wikipedia-pt", "wikibooks-pt", "chebi", "gutenberg-14474", "gold-book"}, pastas)
        m = self.lido("manifest.json")
        self.assertFalse(any("openstax" in k.lower() or k.startswith("seguranca/") for k in m["files"]))

    def test_licencas_declaradas(self):
        licencas = {l["licenca"] for l in self.lido("manifest.json")["licencas"]}
        self.assertTrue({"CC0", "CC BY 4.0", "CC BY-SA 4.0", "domínio público"} <= licencas, licencas)
        fontes = {f["id"]: f for f in self.lido("fontes.json")["fontes"]}
        self.assertEqual(fontes["gutenberg-14474"]["licenca"], "domínio público")
        self.assertNotIn("openstax", fontes)

    def test_stats(self):
        s = self.lido("stats.json")
        self.assertNotIn("stats.json", self.lido("manifest.json")["files"])
        self.assertEqual(s["familias"]["goldBook"]["status"], "bloqueado")
        self.assertIn("trechosPorTema", s["familias"]["wikipedia"])
        self.assertIn("temasSemArtigo", s["familias"]["wikipedia"])
        self.assertIn("duracaoSegundos", s)
        self.assertEqual(s["erros"], [])

    def test_ghs_frases_em_portugues(self):
        g = self.lido("ghs_frases.json")
        self.assertEqual(g["frasesH"]["H314"]["texto"], FRASES["H314"])
        self.assertEqual(g["usadosSemTexto"], [])


if __name__ == "__main__":
    unittest.main()
