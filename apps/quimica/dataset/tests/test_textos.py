# -*- coding: utf-8 -*-
"""Validação dos pares escritos à mão a partir dos trechos licenciados (fam_textos): ids, tema, nível e números presentes no trecho."""
import json
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

from tests import _base  # noqa: F401
import fam_textos
from comum import FIXTURE_DIR
from pacote import Pacote
from qa_base import Ctx

OK = {"pergunta": "O que é um mol?", "resposta": "O mol contém exatamente 6,02214076 × 10²³ entidades elementares.", "nivel": "medio",
      "ids": ["wikipedia-pt-mol-001"], "tipo": "conceito", "tema": "mol-massa-molar"}


def rodar(linhas):
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "x.jsonl").write_text("\n".join(json.dumps(l, ensure_ascii=False) for l in linhas) + "\n", encoding="utf-8")
        antigo = fam_textos.PASTA_AUTORIA_FIXTURE
        fam_textos.PASTA_AUTORIA_FIXTURE = Path(d)
        try:
            ctx = Ctx(Pacote(FIXTURE_DIR))
            fam_textos.gerar(ctx)
        finally:
            fam_textos.PASTA_AUTORIA_FIXTURE = antigo
    return ctx


class TestValidacaoDeTextos(unittest.TestCase):
    def test_par_valido_vira_registro_com_fonte_do_trecho(self):
        ctx = rodar([OK])
        self.assertEqual(len(ctx.registros), 1)
        r = ctx.registros[0]
        self.assertEqual(r["tipo"], "conceito")
        self.assertEqual(r["fontes"], [{"id": "wikipedia-pt-mol-001", "nome": "Wikipédia em português", "licenca": "CC BY-SA 4.0"}])
        self.assertEqual(r["numeros"], ["6,02214076 × 10²³"])
        self.assertEqual(r["numerosOrigem"]["6,02214076 × 10²³"], ["passagem:wikipedia-pt-mol-001"])
        self.assertEqual(r["tema"], "mol-massa-molar")

    def test_numero_fora_do_trecho_e_rejeitado(self):
        ctx = rodar([dict(OK, resposta="Um mol contém 7,5 entidades.")])
        self.assertEqual(len(ctx.registros), 0)
        self.assertEqual(ctx.stats["autoria_numero_fora_do_trecho"], 1)

    def test_id_inexistente_tema_invalido_e_nivel_invalido(self):
        ctx = rodar([dict(OK, ids=["nao-existe"]), dict(OK, tema="tema-que-nao-existe"), dict(OK, nivel="doutorado")])
        self.assertEqual(len(ctx.registros), 0)
        self.assertEqual(ctx.stats["autoria_id_ausente_no_pacote"], 1)
        self.assertEqual(ctx.stats["autoria_tema_invalido"], 1)
        self.assertEqual(ctx.stats["autoria_campos_invalidos"], 1)
        self.assertEqual(len(ctx.__dict__["autoria_rejeitadas"]), 3)

    def test_valores_em_formatos_pt_e_en(self):
        vals = fam_textos.valores_no_texto("Avogadro: 6.022 x 10^23, 1,000 g, 0,5 L, 12.5 e 1.234,5")
        for v in ("6.022", "1000", "0.5", "12.5", "1234.5", "23"):
            self.assertIn(Decimal(v).normalize(), vals, v)
        self.assertTrue(fam_textos.numero_na_fonte("6,022 × 10²³", vals))
        self.assertFalse(fam_textos.numero_na_fonte("7,5", vals))

    def test_cobertura_lista_temas_sem_fonte(self):
        ctx = rodar([OK])
        cob = ctx.__dict__["cobertura_temas"]
        self.assertEqual(cob["mol-massa-molar"]["pares"], 1)
        self.assertEqual(cob["mol-massa-molar"]["status"], "faltam pares (há trecho disponível)")
        sem = [t for t, v in cob.items() if v["status"] == "sem fonte licenciada ainda"]
        self.assertGreater(len(sem), 30)  # a fixture tem 6 trechos: a maioria dos temas fica sem fonte, nunca preenchida de memória


if __name__ == "__main__":
    unittest.main()
