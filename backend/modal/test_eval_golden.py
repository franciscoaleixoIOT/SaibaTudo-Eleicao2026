# -*- coding: utf-8 -*-
"""Testes (unittest, sem Modal/llama.cpp) do avaliador de casos de referência e dos gates de promoção."""
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import eval_golden as ev  # noqa: E402
import nlu_core as core  # noqa: E402

CASOS = ev.load_cases()


def _legado(intent, rota, **f):
    base = dict(cargo=None, digitos_urna=None, estado_uf=None, regiao=None, partido=None, tema=None, nome_candidato=None,
                apenas_ficha_limpa=None, max_processos_administrativos=None, mandatos_anteriores=None)
    base.update(f)
    return json.dumps({"intent": intent, "target_route": rota, "menu_id": "menu_home", "submenu_id": None, "filters": base})


def oraculo_legado(caso):
    """Gerador 'perfeito' no formato legado: devolve o que o caso de referência espera (quando representável)."""
    esperado = caso.get("intent")
    ent = {
        "cargo": caso.get("cargo"), "estado_uf": caso.get("uf"), "partido": caso.get("partido"),
        "nome_candidato": caso.get("nome"),
    }
    if esperado == "PERFIL_CANDIDATO":
        return _legado("CANDIDATE_LOOKUP", "candidates/todos", **ent)
    if esperado == "CALENDARIO":
        return _legado("EXPLAIN_TOPIC", "info/calendario", **ent)
    if esperado == "LOCAL_VOTACAO":
        return _legado("VOTING_LOCATION_QUERY", "info/locais", **ent)
    if esperado == "CONTAR":
        return _legado("EXPLAIN_TOPIC", "info/estatisticas", **ent)
    if esperado == "PESQUISAS":
        return _legado("EXPLAIN_TOPIC", "info/pesquisas", **ent)
    return _legado("FILTER_CANDIDATES", "candidates/todos", **ent)


def gerador_por_pergunta(fabrica):
    mapa = {c["q"]: c for c in CASOS}
    return lambda q: fabrica(mapa[q])


class TestCasos(unittest.TestCase):
    def test_carrega_os_casos_do_contrato(self):
        self.assertGreaterEqual(len(CASOS), 40)
        self.assertTrue(all(isinstance(c["q"], str) and c["q"] for c in CASOS))

    def test_todas_as_perguntas_dos_casos_sao_validas_para_o_servico(self):
        for c in CASOS:
            self.assertEqual(core.validate_question(c["q"]), c["q"].strip())


class TestEvaluate(unittest.TestCase):
    def test_oraculo_legado_pontua_100(self):
        r = ev.evaluate(gerador_por_pergunta(oraculo_legado), CASOS, "legacy", "oráculo")
        self.assertEqual(r["json_valid_pct"], 100.0)
        self.assertEqual(r["cargo_acc_pct"], 100.0)
        self.assertEqual(r["uf_acc_pct"], 100.0)
        self.assertEqual(r["partido_acc_pct"], 100.0)
        self.assertEqual(r["intent_acc_pct"], 100.0)
        self.assertEqual(r["uf_hallucination_pct"], 0.0)
        self.assertEqual(r["partido_hallucination_pct"], 0.0)
        self.assertGreater(r["cargo_cases"], 5)
        self.assertGreater(r["uf_cases"], 5)
        self.assertGreater(r["partido_cases"], 2)

    def test_intencoes_sem_equivalente_legado_ficam_fora_da_acuracia(self):
        self.assertIsNone(ev.intent_matches("RESULTADOS", {"intent": "FILTER_CANDIDATES"}, "legacy"))
        self.assertIsNone(ev.intent_matches("RECOMENDACAO", {"intent": "FILTER_CANDIDATES"}, "legacy"))
        self.assertTrue(ev.intent_matches("RESULTADOS", {"intent": "RESULTADOS"}, "v2"))
        self.assertFalse(ev.intent_matches("RESULTADOS", {"intent": "CONTAR"}, "v2"))

    def test_saida_invalida_derruba_json_valido(self):
        def ruim(c):
            return "não sei" if c["q"].startswith("Quem") else oraculo_legado(c)

        r = ev.evaluate(gerador_por_pergunta(ruim), CASOS, "legacy")
        self.assertLess(r["json_valid_pct"], 100.0)
        n_quem = sum(1 for c in CASOS if c["q"].startswith("Quem"))
        self.assertEqual(round(r["json_valid_pct"], 1), round(100.0 * (len(CASOS) - n_quem) / len(CASOS), 1))

    def test_excecao_do_gerador_conta_como_invalido(self):
        def explode(_):
            raise RuntimeError("boom")

        r = ev.evaluate(explode, CASOS[:3], "legacy")
        self.assertEqual(r["json_valid_pct"], 0.0)
        self.assertTrue(all("erro" in c for c in r["cases"]))

    def test_alucinacao_em_chave_null_e_medida(self):
        # "se eu votar em branco" exige uf ausente; o modelo inventa SP
        caso = [c for c in CASOS if c["q"] == "se eu votar em branco"]
        r = ev.evaluate(lambda q: _legado("FILTER_CANDIDATES", "candidates/todos", estado_uf="SP"), caso, "legacy")
        self.assertEqual(r["uf_hallucination_pct"], 100.0)

    def test_entidade_errada_reduz_acerto(self):
        def errado(c):
            ent = json.loads(oraculo_legado(c))
            if ent["filters"]["estado_uf"]:
                ent["filters"]["estado_uf"] = "AC" if ent["filters"]["estado_uf"] != "AC" else "AL"
            return json.dumps(ent)

        r = ev.evaluate(gerador_por_pergunta(errado), CASOS, "legacy")
        self.assertEqual(r["uf_acc_pct"], 0.0)
        self.assertEqual(r["cargo_acc_pct"], 100.0)

    def test_nome_aceita_expansao_e_caixa(self):
        caso = [{"q": "Quem é Lula?", "intent": "PERFIL_CANDIDATO", "nome": "lula"}]
        r = ev.evaluate(lambda q: _legado("CANDIDATE_LOOKUP", "candidates/presidente", nome_candidato="LULA"), caso, "legacy")
        self.assertEqual(r["nome_acc_pct"], 100.0)
        caso2 = [{"q": "Fernando Haddad", "intent": "PERFIL_CANDIDATO", "nome": "fernando haddad"}]
        r2 = ev.evaluate(lambda q: _legado("CANDIDATE_LOOKUP", "candidates/todos", nome_candidato="FERNANDO HADDAD"), caso2, "legacy")
        self.assertEqual(r2["nome_acc_pct"], 100.0)

    def test_formato_v2(self):
        def v2(c):
            d = {"intent": c.get("intent", "DESCONHECIDA")}
            for k in ("cargo", "uf", "partido", "nome"):
                if c.get(k):
                    d[k] = c[k]
            return core.format_output_v2(d)

        r = ev.evaluate(gerador_por_pergunta(v2), CASOS, "v2")
        self.assertEqual(r["json_valid_pct"], 100.0)
        self.assertEqual(r["intent_acc_pct"], 100.0)
        self.assertEqual(r["cargo_acc_pct"], 100.0)


class TestGates(unittest.TestCase):
    def _res(self, validos=100.0, cargo=90.0, uf=90.0, partido=90.0):
        return {"json_valid_pct": validos, "cargo_acc_pct": cargo, "uf_acc_pct": uf, "partido_acc_pct": partido}

    def test_aprova(self):
        ok, m = ev.check_gates(self._res(), self._res(validos=98.0))
        self.assertTrue(ok, m)

    def test_reprova_json_nativo_abaixo_de_98(self):
        ok, m = ev.check_gates(self._res(), self._res(validos=97.9))
        self.assertFalse(ok)
        self.assertIn("sem gramática", m[0])

    def test_reprova_se_gramatica_nao_da_100(self):
        ok, m = ev.check_gates(self._res(validos=99.0), None)
        self.assertFalse(ok)

    def test_limiar_de_entidades_e_regressao_de_quantizacao(self):
        ok, m = ev.check_gates(self._res(cargo=40, uf=40, partido=40), None, min_entity_acc=50)
        self.assertFalse(ok)
        base = self._res(cargo=90, uf=90, partido=90)
        ok, m = ev.check_gates(self._res(cargo=80, uf=80, partido=80), None, baseline=base, max_quant_drop=3.0)
        self.assertFalse(ok)
        ok, m = ev.check_gates(self._res(cargo=88, uf=88, partido=88), None, baseline=base, max_quant_drop=3.0)
        self.assertTrue(ok, m)

    def test_sem_unconstrained_so_valida_a_gramatica(self):
        ok, _ = ev.check_gates(self._res(), None)
        self.assertTrue(ok)


class TestCli(unittest.TestCase):
    def test_entity_score(self):
        self.assertEqual(ev.entity_score({"cargo_acc_pct": 100.0, "uf_acc_pct": 50.0, "partido_acc_pct": None}), 75.0)
        self.assertIsNone(ev.entity_score({}))


if __name__ == "__main__":
    unittest.main(verbosity=2)
