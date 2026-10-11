# -*- coding: utf-8 -*-
"""O catálogo completo (`dataset/CATALOGO.md`/`.jsonl`) cobre todas as famílias do QA e não perde nenhum par."""
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from tests import _base
import gerar_catalogo
import gerar_qa


class TestCatalogo(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.qa = Path(cls.tmp.name) / "qa"
        cls.qa.mkdir()
        pac = _base.pacote()
        ctx = _base.qa()
        contagens = gerar_qa.escrever(ctx, cls.qa)
        stats = gerar_qa.montar_stats(ctx, contagens, SimpleNamespace(seed=2026), pac)
        (cls.qa / "stats.json").write_text(json.dumps(stats, ensure_ascii=False), encoding="utf-8")
        cls.md = str(cls.qa / "CATALOGO.md")
        cls.jsonl = str(cls.qa / "CATALOGO.jsonl")
        gerar_catalogo.main(["--qa", str(cls.qa), "--out", cls.md, "--jsonl", cls.jsonl])

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_arquivos_gerados(self):
        self.assertTrue(Path(self.md).exists() and Path(self.md).stat().st_size > 0)
        self.assertTrue(Path(self.jsonl).exists() and Path(self.jsonl).stat().st_size > 0)

    def test_jsonl_tem_todos_os_pares_com_fonte(self):
        stats = json.loads((self.qa / "stats.json").read_text(encoding="utf-8"))
        linhas = [json.loads(l) for l in Path(self.jsonl).read_text(encoding="utf-8").splitlines() if l.strip()]
        self.assertEqual(len(linhas), stats["total"])
        faltam = [r["id"] for r in linhas if not r["fontes"] and r["tipo"] not in ("recusa",)]
        self.assertEqual(faltam[:5], [])

    def test_md_cobre_todas_as_familias(self):
        stats = json.loads((self.qa / "stats.json").read_text(encoding="utf-8"))
        md = Path(self.md).read_text(encoding="utf-8")
        for arq in stats["porArquivo"]:
            self.assertIn(arq[:6].capitalize(), md, arq)  # "Element", "Compos", "Calcul"...
        self.assertGreaterEqual(md.count("**P:**"), 500)


if __name__ == "__main__":
    unittest.main()
