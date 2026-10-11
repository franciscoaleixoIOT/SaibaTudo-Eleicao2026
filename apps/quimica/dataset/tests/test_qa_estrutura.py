# -*- coding: utf-8 -*-
"""Estrutura do QA: esquema, ids, recusas com a resposta padrão, desenho, conceitos ancorados, fontes licenciadas, nomenclatura, JSONL no disco."""
import json
import re
import unittest
from collections import Counter

from tests import _base
import fam_nomenclatura
from calculo import FormulaInvalida, parse_formula
from comum import AQUI, REPO, norm_question, ler_jsonl
from dados_recusas import RECUSA_PADRAO
from fontes_permitidas import PROIBIDAS_NO_NOME, chaves_permitidas, fonte_ok

TIPOS = {"fato", "calculo", "conceito", "seguranca", "recusa", "nomenclatura", "desenho"}
NIVEIS = {"fundamental", "medio", "superior"}
CHAVES = {"id", "pergunta", "resposta", "tipo", "nivel", "entidades", "numeros", "numerosOrigem", "fontes", "geradoPor", "revisadoPor"}


class TestEsquema(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pac = _base.pacote()
        cls.regs = _base.registros()

    def test_campos_e_tipos(self):
        self.assertGreater(len(self.regs), 1000)
        for r in self.regs:
            self.assertTrue(CHAVES <= set(r), (r["id"], CHAVES - set(r)))
            self.assertIn(r["tipo"], TIPOS, r["id"])
            self.assertIn(r["nivel"], NIVEIS, r["id"])
            self.assertIsInstance(r["entidades"], dict, r["id"])
            self.assertTrue(r["pergunta"].strip() and r["resposta"].strip(), r["id"])
            self.assertTrue(all(isinstance(n, str) for n in r["numeros"]), r["id"])
            self.assertIsNone(r["revisadoPor"], r["id"])
            self.assertTrue(r["geradoPor"], r["id"])
            self.assertIsInstance(r["fontes"], list, r["id"])
            self.assertGreaterEqual(len(r["fontes"]), 1, r["id"])
            for f in r["fontes"]:
                self.assertTrue(f.get("nome") and f.get("licenca"), (r["id"], f))

    def test_ids_e_perguntas_unicos(self):
        ids = [r["id"] for r in self.regs]
        self.assertEqual(len(ids), len(set(ids)))
        pergs = Counter(norm_question(r["pergunta"]) for r in self.regs)
        repetidas = [p for p, n in pergs.items() if n > 1]
        self.assertEqual(repetidas[:5], [])

    def test_todos_os_tipos_presentes(self):
        presentes = {r["tipo"] for r in self.regs}
        self.assertEqual(TIPOS - presentes, set())

    def test_numeros_em_pt_br(self):
        """Decimais com vírgula (nunca '3.14'); ponto só como separador de milhar com três dígitos."""
        for r in self.regs:
            if r["tipo"] in ("fato", "calculo") and "nome_iupac" not in r.get("geradoPor", ""):
                self.assertIsNone(re.search(r"(?<![\w.])\d+\.\d{1,2}(?![\d.\w])", r["resposta"]), r["id"])


class TestRecusas(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.regs = _base.registros()
        cls.rec = [r for r in cls.regs if r["tipo"] == "recusa"]

    def test_quantidade_e_resposta_padrao(self):
        self.assertGreaterEqual(len(self.rec), 150)
        for r in self.rec:
            self.assertEqual(r["resposta"], RECUSA_PADRAO, r["id"])
            self.assertEqual(r["numeros"], [])
            self.assertNotRegex(r["resposta"], r"\d")

    def test_resposta_padrao_curta_e_oferece_alternativas(self):
        self.assertLessEqual(len(RECUSA_PADRAO), 400)
        self.assertRegex(RECUSA_PADRAO, r"perigos")
        self.assertRegex(RECUSA_PADRAO, r"primeiros socorros")
        self.assertRegex(RECUSA_PADRAO, r"qu[ií]mica geral")

    def test_pedidos_legitimos_nao_foram_recusados(self):
        casos = json.loads((REPO / "contracts" / "seguranca_cases.json").read_text(encoding="utf-8"))["cases"]
        legitimos = {norm_question(c["q"]) for c in casos if not c["recusar"]}
        recusados = {norm_question(r["pergunta"]) for r in self.rec}
        self.assertEqual(legitimos & recusados, set())
        for r in self.regs:
            if r["tipo"] != "recusa":
                self.assertNotEqual(r["resposta"], RECUSA_PADRAO, r["id"])

    def test_nenhum_caso_de_seguranca_no_treino(self):
        from comum import jaccard, tokens
        casos = json.loads((REPO / "contracts" / "seguranca_cases.json").read_text(encoding="utf-8"))["cases"]
        toks = [tokens(c["q"]) for c in casos]
        for r in self.regs:
            if r["tipo"] in ("recusa", "seguranca"):
                t = tokens(r["pergunta"])
                self.assertFalse(any(jaccard(t, x) >= 0.8 for x in toks), r["pergunta"])

    def test_categorias_cobertas(self):
        ger = Counter(r["geradoPor"].split(".")[-1] for r in self.rec)
        self.assertEqual(set(ger), {"explosivo", "guerra_quimica", "droga", "precursor"})


class TestDesenhoEConceito(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pac = _base.pacote()
        cls.regs = _base.registros()

    def test_desenho(self):
        d = [r for r in self.regs if r["tipo"] == "desenho"]
        self.assertGreater(len(d), 0)
        for r in d:
            self.assertEqual(r["acao"], "desenhar")
            self.assertIn(r["smiles"], r["resposta"])
            cid = r["entidades"]["compostos"][0]
            self.assertEqual(self.pac.comp_cid[cid]["smiles"], r["smiles"])

    def test_conceitos_citam_trechos_existentes(self):
        cs = [r for r in self.regs if r["tipo"] == "conceito"]
        self.assertGreater(len(cs), 0)
        for r in cs:
            self.assertTrue(r["fontes"])
            for f in r["fontes"]:
                self.assertIn(f["id"], self.pac.textos, r["id"])
                t = self.pac.textos[f["id"]]
                self.assertEqual(f["nome"], t["fonte"])
                self.assertEqual(f["licenca"], t["licenca"])
            self.assertIn(r["geradoPor"], ("autoria:conceito",))

    def test_metas_de_conteudo_com_pacote_real(self):
        if self.pac.eh_fixture:
            self.skipTest("fixture: metas valem para o pacote real")
        cont = Counter(r["tipo"] for r in self.regs)
        self.assertGreaterEqual(cont["conceito"], 300)
        textos_seg = [r for r in self.regs if r["tipo"] == "seguranca" and r["geradoPor"] == "autoria:seguranca"]
        self.assertGreaterEqual(len(textos_seg), 80)


class TestFontes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pac = _base.pacote()
        cls.regs = _base.registros()
        cls.chaves = chaves_permitidas(cls.pac.fontes_json)

    def test_todas_as_fontes_sao_licenciadas(self):
        ruins = Counter()
        for r in self.regs:
            for f in r["fontes"]:
                motivo = fonte_ok(f, self.chaves)
                if motivo:
                    ruins[motivo] += 1
        self.assertEqual(dict(ruins), {})

    def test_nenhuma_fonte_proibida_em_lugar_algum(self):
        proibidas = ("openstax", "icsc", "libretexts", "nist chemistry webbook", "echa")
        for r in self.regs:
            texto = (json.dumps(r["fontes"], ensure_ascii=False) + r["geradoPor"]).lower()
            for p in proibidas:
                self.assertNotRegex(texto, r"(?<![a-z])" + re.escape(p) + r"(?![a-z])", r["id"])

    def test_nenhum_livro_protegido_citado(self):
        livros = ("atkins", "feltre", "solomons", "clayden", "levine", "mcquarrie", "livrosquimica", "tito e canto", "moderna plus", "martha reis")
        for r in self.regs:
            texto = (r["pergunta"] + " " + r["resposta"] + json.dumps(r["fontes"], ensure_ascii=False)).lower()
            for l in livros:
                self.assertNotIn(l, texto, r["id"])

    def test_fonte_do_pacote_fora_da_lista_e_detectada(self):
        self.assertTrue(fonte_ok({"nome": "OpenStax Chemistry 2e", "licenca": "CC BY 4.0"}, self.chaves))
        self.assertTrue(fonte_ok({"nome": "ICSC 0360", "licenca": "x"}, self.chaves))
        self.assertTrue(fonte_ok({"nome": "PubChem CID 1", "licenca": "CC BY-NC-SA 4.0"}, self.chaves))
        self.assertTrue(fonte_ok({"nome": "LibreTexts Chemistry", "licenca": "CC BY-NC-SA 4.0"}, self.chaves))
        self.assertTrue(fonte_ok({"nome": "NIST Chemistry WebBook", "licenca": "x"}, self.chaves))
        self.assertTrue(fonte_ok({"nome": "ECHA C&L Inventory", "licenca": "x"}, self.chaves))
        self.assertEqual(fonte_ok({"nome": "PubChem CID 962", "licenca": "domínio público (NCBI/NLM)"}, self.chaves), "")


class TestNomenclatura(unittest.TestCase):
    def test_regras_validadas_por_formula_conhecida(self):
        regs = [r for r in _base.registros() if r["tipo"] == "nomenclatura" and r["geradoPor"].startswith("regra:")]
        self.assertGreaterEqual(len(regs), 100 if not _base.pacote().eh_fixture else 100)
        conhecidas = {**fam_nomenclatura.CONHECIDAS, **fam_nomenclatura.ACIDOS_CONHECIDOS, **fam_nomenclatura.COVALENTES_CONHECIDOS}
        nomes = set()
        for r in regs:
            nome, formula = r["entidades"]["nome"], r["entidades"]["formula"]
            self.assertIn(nome, conhecidas)
            self.assertEqual(dict(parse_formula(formula)), dict(parse_formula(conhecidas[nome])), nome)
            nomes.add(nome)
        self.assertGreaterEqual(len(nomes), 100)

    def test_neutralidade_eletrica_dos_ionicos(self):
        for nome, formula, info in fam_nomenclatura.gerar_ionicos():
            self.assertEqual(info["n_cat"] * info["q"], info["n_an"] * info["qa"], nome)
            parse_formula(formula)

    def test_compostos_do_pacote_em_ambos_os_sentidos(self):
        regs = [r for r in _base.registros() if r["tipo"] == "nomenclatura" and r["geradoPor"].startswith("template:")]
        self.assertTrue(any("nome_formula" in r["geradoPor"] for r in regs))
        self.assertTrue(any("formula_nome" in r["geradoPor"] for r in regs))


class TestArquivosNoDisco(unittest.TestCase):
    """Se dataset/qa/ já foi gerado, os arquivos são JSONL válido, com o esquema e coerentes com stats.json."""

    def test_jsonl_valido(self):
        pasta = AQUI / "qa"
        arqs = sorted(pasta.glob("*.jsonl"))
        if not arqs:
            self.skipTest("dataset/qa/ ainda não gerado")
        total = 0
        for a in arqs:
            for r in ler_jsonl(a):
                self.assertTrue(CHAVES <= set(r), (a.name, r.get("id")))
                self.assertIn(r["tipo"], TIPOS)
                total += 1
        stats = json.loads((pasta / "stats.json").read_text(encoding="utf-8"))
        self.assertEqual(stats["total"], total)
        self.assertEqual(stats["licenca"], "CC BY-SA 4.0")
        self.assertEqual(sum(stats["porArquivo"].values()), total)
        self.assertEqual(sum(stats["porTipo"].values()), total)


class TestEstatisticas(unittest.TestCase):
    def test_stats_em_memoria(self):
        from gerar_qa import ARQUIVOS, montar_stats
        import argparse
        ctx = _base.qa()
        a = argparse.Namespace(seed=2026)
        contagens = {arq: sum(1 for r in ctx.registros if r["_familia"] in fams) for arq, fams in ARQUIVOS.items()}
        st = montar_stats(ctx, contagens, a, _base.pacote())
        self.assertEqual(st["total"], len(ctx.registros))
        self.assertEqual(sum(st["porTipo"].values()), st["total"])
        self.assertEqual(st["licenca"], "CC BY-SA 4.0")
        self.assertIn("coberturaTemas", st)


if __name__ == "__main__":
    unittest.main()
