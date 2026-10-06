# -*- coding: utf-8 -*-
"""Testes do agregador de métricas do modelo (tools/metricas.py)."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import metricas as m  # noqa: E402


def ev(intent=90.0, valido=100.0, alucina=0.0, casos=111, real=None):
    c = {"n_cases": casos, "intent_acc_pct": intent, "json_valid_pct": valido, "latency_s_mean": 0.8}
    for k in m.ENTIDADES:
        c[f"{k}_acc_pct"] = 95.0
        if k != "nome":
            c[f"{k}_hallucination_pct"] = alucina
    return {"constrained": c, "real": real}


def h(data, intent=90.0, versao="v2.1", **kw):
    return m.resumo(ev(intent=intent, **kw), data, versao)


class Resumo(unittest.TestCase):
    def test_resume_o_modo_de_producao(self):
        r = h("2026-10-06", intent=78.4)
        self.assertEqual((r["data"], r["versao"], r["casos"], r["intencao_pct"]), ("2026-10-06", "v2.1", 111, 78.4))
        self.assertEqual(r["entidades_pct"]["tema"], 95.0)
        self.assertNotIn("nome", r["alucinacao_pct"])
        self.assertIsNone(r["real"])

    def test_inclui_o_holdout_real_quando_existe(self):
        r = m.resumo(ev(real={"n_cases": 40, "intent_acc_pct": 88.0}), "2026-10-06", "v2.1")
        self.assertEqual(r["real"], {"casos": 40, "intencao_pct": 88.0})


class Alertas(unittest.TestCase):
    def test_sem_historico_nao_alerta(self):
        self.assertEqual(m.alertas([]), [])

    def test_tudo_bem(self):
        hist = [h(f"2026-10-0{i}", 90.0) for i in range(1, 6)]
        self.assertEqual(m.alertas(hist), [])

    def test_abaixo_do_minimo(self):
        p = m.alertas([h("2026-10-06", 78.4)])
        self.assertTrue(any("abaixo do mínimo" in x for x in p), p)

    def test_queda_contra_a_mediana(self):
        hist = [h(f"2026-10-0{i}", 92.0) for i in range(1, 6)] + [h("2026-10-06", 88.0)]
        p = m.alertas(hist)
        self.assertEqual(len(p), 1)
        self.assertIn("caiu 4.0 pontos", p[0])

    def test_oscilacao_pequena_nao_alerta(self):
        hist = [h(f"2026-10-0{i}", 92.0) for i in range(1, 6)] + [h("2026-10-06", 90.5)]
        self.assertEqual(m.alertas(hist), [])

    def test_a_mediana_ignora_um_pico_isolado(self):
        hist = [h("2026-10-01", 92.0), h("2026-10-02", 70.0), h("2026-10-03", 92.0), h("2026-10-04", 92.0), h("2026-10-05", 91.5)]
        self.assertEqual(m.alertas(hist), [])

    def test_precisa_de_ao_menos_duas_execucoes_anteriores_para_comparar(self):
        self.assertEqual(m.alertas([h("2026-10-01", 99.0), h("2026-10-02", 90.0)]), [])

    def test_alucinacao_e_json_invalido(self):
        p = m.alertas([h("2026-10-06", 90.0, alucina=20.0, valido=98.0)])
        self.assertTrue(any("alucinação" in x for x in p), p)
        self.assertTrue(any("JSON inválido" in x for x in p), p)

    def test_intencao_nao_medida(self):
        r = m.resumo({"constrained": {"n_cases": 0}}, "2026-10-06", "v")
        self.assertTrue(any("não mediu" in x for x in m.alertas([r])))

    def test_mudanca_de_versao_e_informativa(self):
        hist = [h("2026-10-01", versao="v2.1"), h("2026-10-02", versao="v2.2")]
        self.assertEqual(m.mudancas_de_versao(hist), [{"data": "2026-10-02", "de": "v2.1", "para": "v2.2"}])


class Arquivos(unittest.TestCase):
    def test_carrega_ordena_e_ignora_o_que_nao_e_avaliacao(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "2026-10-02_v2.1.json").write_text(json.dumps(ev(91.0)), encoding="utf-8")
            (d / "2026-10-01_v2.1.json").write_text(json.dumps(ev(90.0)), encoding="utf-8")
            (d / "index.json").write_text("{}", encoding="utf-8")
            (d / "notas.json").write_text("{}", encoding="utf-8")
            (d / "2026-10-03_v2.1.json").write_text("não é json", encoding="utf-8")
            hist = m.carregar_historico(d)
            self.assertEqual([r["data"] for r in hist], ["2026-10-01", "2026-10-02"])

    def test_cli_grava_o_indice_e_o_codigo_de_saida_reflete_os_alertas(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "2026-10-06_v2.1-20261003.json").write_text(json.dumps(ev(78.4)), encoding="utf-8")
            self.assertEqual(m.main(["--dir", str(d), "--out", str(d / "index.json")]), 1)
            idx = json.loads((d / "index.json").read_text(encoding="utf-8"))
            self.assertEqual(idx["execucoes"][0]["versao"], "v2.1-20261003")
            self.assertTrue(idx["alertas"])
            (d / "2026-10-06_v2.1-20261003.json").write_text(json.dumps(ev(95.0)), encoding="utf-8")
            self.assertEqual(m.main(["--dir", str(d), "--out", str(d / "index.json")]), 0)

    def test_pasta_inexistente(self):
        self.assertEqual(m.main(["--dir", "/nao/existe/mesmo", "--out", "x.json"]), 2)

    def test_le_a_linha_de_base_real_do_repositorio(self):
        pasta = HERE.parent / "eval"
        hist = m.carregar_historico(pasta)
        self.assertTrue(hist, "eval/ tem a linha de base de 06/10/2026")
        base = hist[0]
        self.assertEqual(base["data"], "2026-10-06")
        self.assertEqual(base["intencao_pct"], 78.4)
        self.assertTrue(any("abaixo do mínimo" in x for x in m.alertas(hist)), "o modelo em produção hoje reprova no mínimo: o alerta é honesto")


if __name__ == "__main__":
    unittest.main()
