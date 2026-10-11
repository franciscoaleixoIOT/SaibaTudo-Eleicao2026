# -*- coding: utf-8 -*-
"""Testes do juiz (sem modelo): leitura de entrada, falha de geração e formato de saída."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import judge_extra as j  # noqa: E402


class Juiz(unittest.TestCase):
    def test_le_jsonl_texto_e_ignora_comentarios_e_vazios(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "in.txt"
            p.write_text('# cabeçalho\n\n{"q": "quando é a eleição"}\nonde voto\n{"x": 1}\n', encoding="utf-8")
            self.assertEqual(j.ler_perguntas(p), ["quando é a eleição", "onde voto"])

    def test_julga_com_gerador_falso(self):
        saidas = {"quando é a eleição": '{"intent": "CALENDARIO"}', "lixo": "isto não é json"}
        r = j.julgar(lambda q: saidas[q], ["quando é a eleição", "lixo"])
        self.assertEqual(r[0], {"q": "quando é a eleição", "bruto": '{"intent": "CALENDARIO"}', "valido": True})
        self.assertFalse(r[1]["valido"])
        self.assertEqual(r[1]["bruto"], "isto não é json")

    def test_falha_de_geracao_vira_sem_juiz_e_nao_derruba_o_lote(self):
        def gen(q):
            if q == "ruim":
                raise TimeoutError("lento")
            return '{"intent": "AJUDA"}'

        r = j.julgar(gen, ["boa", "ruim", "outra"])
        self.assertEqual([x["valido"] for x in r], [True, False, True])
        self.assertIsNone(r[1]["bruto"])
        self.assertEqual(r[1]["erro"], "TimeoutError")

    def test_cli_grava_jsonl(self):
        with tempfile.TemporaryDirectory() as d:
            ent, sai = Path(d) / "in.jsonl", Path(d) / "sub" / "out.jsonl"
            ent.write_text('{"q": "oi"}\n', encoding="utf-8")
            orig = j.ev.http_generator
            j.ev.http_generator = lambda *a, **k: (lambda q: '{"intent": "AJUDA"}')
            try:
                self.assertEqual(j.main(["--endpoint", "https://x.invalid", "--in", str(ent), "--out", str(sai)]), 0)
            finally:
                j.ev.http_generator = orig
            linhas = [json.loads(l) for l in sai.read_text(encoding="utf-8").splitlines()]
            self.assertEqual(linhas, [{"q": "oi", "bruto": '{"intent": "AJUDA"}', "valido": True}])


if __name__ == "__main__":
    unittest.main()
