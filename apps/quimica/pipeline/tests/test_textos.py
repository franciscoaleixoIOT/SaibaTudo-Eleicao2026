# -*- coding: utf-8 -*-
"""Empacotamento em trechos (400-1200 caracteres), Wikipédia/Wikilivros (registros, temas), Gutenberg."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import coleta_textos as T  # noqa: E402
import coleta_wikimedia as WM  # noqa: E402


def paragrafo(n, c="a"):
    return (f"Parágrafo {n}. " + (c * 80 + ". ") * (n % 4 + 3)).strip()


class EmpacotarTest(unittest.TestCase):
    def test_limites_e_fronteira_de_paragrafo(self):
        unid = [{"cabecalho": "S", "texto": paragrafo(i), "termos": []} for i in range(1, 40)]
        trechos, curtos = T.empacotar(unid)
        self.assertGreater(len(trechos), 3)
        textos = [p for t in trechos for p in t["texto"].split("\n\n")]
        self.assertEqual(sorted(textos), sorted(u["texto"] for u in unid))  # nenhum parágrafo cortado ou perdido
        for t in trechos[:-1]:
            self.assertLessEqual(len(t["texto"]), T.MAXIMO)
            self.assertGreaterEqual(len(t["texto"]), T.MINIMO)

    def test_paragrafo_gigante_e_dividido_em_frases(self):
        gigante = " ".join(f"Esta é a frase {i} do texto." for i in range(200))
        trechos, _ = T.empacotar([{"cabecalho": "S", "texto": gigante, "termos": []}])
        self.assertGreater(len(trechos), 1)
        self.assertTrue(all(len(t["texto"]) <= T.MAXIMO + 5 for t in trechos))
        self.assertEqual(" ".join(t["texto"].replace("\n\n", " ") for t in trechos), gigante)

    def test_texto_pequeno_demais_e_descartado(self):
        trechos, _ = T.empacotar([{"cabecalho": "S", "texto": "curto", "termos": []}])
        self.assertEqual(trechos, [])

    def test_palavras_chave_e_elementos(self):
        self.assertEqual(T.palavras_chave(["Mol", "mol", "átomo"], "x"), ["mol", "átomo"])
        self.assertEqual(T.elementos_no_texto("Hydrogen and oxygen form water; lead is a verb here.",
                                              {"hydrogen": "H", "oxygen": "O", "lead": "Pb"}), ["H", "O"])


PAGINA = {"title": "Hidrogénio", "pageid": 983, "fullurl": "https://pt.wikipedia.org/wiki/Hidrog%C3%A9nio",
          "revisions": [{"revid": 72281984}],
          "extract": "O hidrogénio é um elemento químico. " * 12 + "\n" + "Foi descoberto por Cavendish em 1766. " * 10}


class WikimediaTest(unittest.TestCase):
    def test_registro_da_wikipedia_segue_o_contrato(self):
        regs, _ = WM.registros_pagina(PAGINA, "pt.wikipedia.org", WM.NOME_WP, "wikipedia-pt", "2026-10-10", usados=set(),
                                      entidades={"elementos": ["H"], "compostos": []}, palavras=["hidrogénio", "H"],
                                      extra={"tipo": "elemento"})
        self.assertGreaterEqual(len(regs), 1)
        r = regs[0]
        self.assertEqual(r["id"], "wikipedia-pt-hidrogenio-001")
        self.assertEqual(r["_arquivo"], "hidrogenio-001.json")
        self.assertEqual(r["licenca"], "CC BY-SA 4.0")
        self.assertEqual(r["url"], "https://pt.wikipedia.org/w/index.php?title=Hidrog%C3%A9nio&oldid=72281984")  # permalink
        self.assertEqual(r["revisao"], 72281984)
        self.assertEqual(r["textoPt"], r["textoOriginal"])
        self.assertEqual(r["secao"], "Introdução")
        self.assertEqual(r["entidades"], {"elementos": ["H"], "compostos": []})
        self.assertEqual(r["fontes"][0]["licenca"], "CC BY-SA 4.0")

    def test_slug_unico(self):
        usados = set()
        a, _ = WM.registros_pagina(PAGINA, "pt.wikipedia.org", WM.NOME_WP, "wikipedia-pt", "2026-10-10", usados=usados)
        b, _ = WM.registros_pagina(dict(PAGINA, pageid=1), "pt.wikipedia.org", WM.NOME_WP, "wikipedia-pt", "2026-10-10", usados=usados)
        self.assertNotEqual(a[0]["id"], b[0]["id"])

    def test_topicos_e_relevancia(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "topicos.json"
            p.write_text(json.dumps({"areas": [{"temas": [{"id": "t1", "nome": "Tema 1", "chaves": ["pH", "mol"]},
                                                          {"id": "t2", "nome": "Tema 2", "chaves": ["mol"]}]}]}), encoding="utf-8")
            chaves, nomes = WM.ler_topicos(p)
        self.assertEqual(chaves, {"pH": ["t1"], "mol": ["t1", "t2"]})
        self.assertEqual(nomes, {"t1": "Tema 1", "t2": "Tema 2"})
        self.assertTrue(WM.relevante("estado físico", {"title": "Estado da matéria", "extract": "O estado físico dos materiais..."}))
        self.assertFalse(WM.relevante("destilação", {"title": "Banana", "extract": "Fruta tropical."}))

    def test_sobrescritas_e_ignoradas_estao_normalizadas(self):
        import quimica_util as Q
        for k in list(WM.SOBRESCRITAS) + list(WM.CHAVES_IGNORADAS):
            self.assertEqual(k, Q.norm(k), k)
        self.assertFalse(set(WM.SOBRESCRITAS) & WM.CHAVES_IGNORADAS)
        topicos = Path(__file__).resolve().parents[2] / "dataset" / "topicos.json"
        if topicos.exists():  # toda sobrescrita deve corresponder a uma chave real do mapa de temas
            chaves, _ = WM.ler_topicos(topicos)
            normalizadas = {Q.norm(c) for c in chaves}
            for k in list(WM.SOBRESCRITAS) + list(WM.CHAVES_IGNORADAS):
                self.assertIn(k, normalizadas, k)

    def test_vocabulario_de_quimica_barra_homonimos(self):
        quimica = {"extract": "Em química, a base é uma substância que aceita prótons; o ácido doa íons."}
        homonimo = {"extract": "Grupo étnico é um conjunto de pessoas com ancestralidade e cultura comuns."}
        self.assertTrue(WM.tem_vocabulario_quimica(quimica))
        self.assertFalse(WM.tem_vocabulario_quimica(homonimo))
        self.assertFalse(WM.relevante("mar de elétrons", {"title": "Banana", "extract": "Fruta."}, todas=True))

    def test_desambiguacao(self):
        self.assertTrue(WM.e_desambiguacao({"pageprops": {"disambiguation": ""}}))
        self.assertFalse(WM.e_desambiguacao({"pageprops": {}}))
        self.assertFalse(WM.e_desambiguacao({}))

    def test_wikilivros_secoes_e_prosa(self):
        extract = "== Introdução ==\n" + "Texto longo de um parágrafo de livro didático sobre química geral. " * 3 + "\n== Átomos ==\nOutro parágrafo " + "bem longo " * 12
        unid = WM.unidades_wikitexto(extract, "Livro/Capítulo")
        self.assertEqual([u["cabecalho"] for u in unid], ["Introdução", "Átomos"])
        self.assertTrue(WM.tem_prosa(extract))
        self.assertFalse(WM.tem_prosa("Capa\n\nHistória da Química\n\nConceitos introdutórios\n\nA matéria\n\nEstados"))


HTML_PG = """<html><body><header><h1>Cabeçalho do Gutenberg</h1></header>
<h2>PREFACE</h2><p>Paragraph of the preface. {x}</p>
<h2>CONTENTS.</h2><h5>LECTURE I.</h5>
<h2>THE CHEMICAL HISTORY OF A CANDLE</h2><h5>LECTURE I.</h5><h5>A CANDLE: THE FLAME</h5>
<p>I purpose, in return for the honour you do us, to bring before you the chemical history of a candle. {x}</p>
<p>[Footnote 1: Page 16. ignorar]</p><p>Second paragraph about the flame and the wax. {x}</p>
<h2>LECTURE II.</h2><p>The flame is a thing worth studying. {x}</p>
<h2>NOTES.</h2><p>[Footnote 1: ignorar]</p></body></html>""".replace("{x}", "Texto de enchimento. " * 20)


class GutenbergTest(unittest.TestCase):
    def test_secoes(self):
        s = T.secoes_gutenberg(HTML_PG)
        self.assertEqual([x["chave"] for x in s], ["preface", "lecture-1", "lecture-2"])
        self.assertEqual(s[1]["subtitulo"], "A CANDLE: THE FLAME")
        self.assertEqual(len(s[1]["paragrafos"]), 2)  # nota de rodapé ignorada

    def test_registros_historicos_em_dominio_publico(self):
        regs, st = T.coletar_gutenberg(HTML_PG, "2026-10-10", {"oxygen": "O"})
        self.assertEqual(st["secoes"], 3)
        r = regs[0]
        self.assertEqual(r["fonte"], "Project Gutenberg #14474 (Faraday, 1861)")
        self.assertEqual(r["licenca"], "domínio público")
        self.assertTrue(r["historico"])
        self.assertIsNone(r["textoPt"])
        self.assertEqual(r["traducao"], "pendente")
        self.assertTrue(all(x["id"].startswith("gutenberg-14474-") for x in regs))

    def test_openstax_foi_removida(self):
        for nome in ("coletar_openstax", "obter_openstax", "ler_colecao"):
            self.assertFalse(hasattr(T, nome), nome)


if __name__ == "__main__":
    unittest.main()
