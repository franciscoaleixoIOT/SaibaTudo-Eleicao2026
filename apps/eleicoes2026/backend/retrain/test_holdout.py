# -*- coding: utf-8 -*-
"""Testes do holdout estável (Python) e da paridade com o gêmeo em JavaScript (holdout.mjs)."""
import json
import subprocess
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import holdout as h  # noqa: E402

# Vetores de referência: o MESMO conjunto é conferido em holdout.test.mjs. Se mudar a normalização ou o hash, mude os dois.
VETORES = {
    "Em quem devo votar?": 4,
    "quem e o favorito": 1,
    "Quem é o favorito?!": 1,
    "minas": 3,
    "Qual o horário da votação?": 84,
    "Resultado para governador em SP": 15,
    "Como justificar o voto?": 0,
    "Quem disputa a Presidência?": 50,
}


class TestHoldout(unittest.TestCase):
    def test_vetores_de_referencia(self):
        for q, balde in VETORES.items():
            self.assertEqual(h.holdout_bucket(q), balde, q)

    def test_normalizacao_acento_caixa_e_pontuacao_nao_mudam_o_lado(self):
        self.assertEqual(h.holdout_bucket("Quem é o favorito?!"), h.holdout_bucket("quem e o favorito"))
        self.assertEqual(h.holdout_bucket("  QUEM   é o  FAVORITO "), h.holdout_bucket("quem e o favorito"))

    def test_determinismo_e_faixa(self):
        for i in range(200):
            q = f"pergunta numero {i}"
            self.assertEqual(h.holdout_bucket(q), h.holdout_bucket(q))
            self.assertTrue(0 <= h.holdout_bucket(q) < 100)

    def test_fatia_proxima_de_20_por_cento(self):
        n = 5000
        dentro = sum(h.eh_holdout(f"como faco para votar na secao {i} do municipio {i * 7}") for i in range(n))
        self.assertTrue(0.17 < dentro / n < 0.23, dentro / n)

    def test_pct_zero_nao_reserva_nada_e_cem_reserva_tudo(self):
        self.assertFalse(h.eh_holdout("minas", 0))
        self.assertTrue(h.eh_holdout("minas", 100))

    def test_paridade_com_o_gemeo_em_javascript(self):
        script = (
            "import { holdoutBucket } from './holdout.mjs';"
            f"const qs = {json.dumps(list(VETORES), ensure_ascii=False)};"
            "console.log(JSON.stringify(qs.map((q) => holdoutBucket(q))));"
        )
        r = subprocess.run(["node", "--input-type=module", "-e", script], cwd=HERE, capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(json.loads(r.stdout), [h.holdout_bucket(q) for q in VETORES])


if __name__ == "__main__":
    unittest.main()
