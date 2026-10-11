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
    """Todos os gates bloqueiam: JSON, intenção, cada entidade, alucinação, holdout real, catraca e quantização."""

    @staticmethod
    def _res(validos=100.0, intent=95.0, ent=95.0, alucina=0.0, n=10, **extra):
        r = {"json_valid_pct": validos, "intent_acc_pct": intent, "intent_cases": 100}
        for k in ev.ENTIDADES_TODAS:
            r[f"{k}_acc_pct"] = ent
            r[f"{k}_cases"] = n
            r[f"{k}_null_cases"] = n
            if k != "nome":
                r[f"{k}_hallucination_pct"] = alucina
        r.update(extra)
        return r

    def test_aprova(self):
        ok, m = ev.check_gates(self._res(), self._res(validos=98.0))
        self.assertTrue(ok, m)

    def test_reprova_json_nativo_abaixo_de_98(self):
        ok, m = ev.check_gates(self._res(), self._res(validos=97.9))
        self.assertFalse(ok)
        self.assertIn("sem gramática", m[0])

    def test_reprova_se_gramatica_nao_da_100(self):
        ok, _ = ev.check_gates(self._res(validos=99.0), None)
        self.assertFalse(ok)

    def test_intencao_bloqueia(self):
        ok, m = ev.check_gates(self._res(intent=60.0), None)
        self.assertFalse(ok)
        self.assertTrue(any("intenção" in x for x in m), m)
        ok, _ = ev.check_gates(self._res(intent=ev.MIN_INTENT_ACC_PCT), None)
        self.assertTrue(ok)

    def test_intencao_nao_medida_bloqueia(self):
        ok, m = ev.check_gates(self._res(intent=None), None)
        self.assertFalse(ok)
        self.assertTrue(any("não medido" in x for x in m), m)

    def test_uma_entidade_ruim_nao_e_escondida_pela_media(self):
        r = self._res(ent=100.0, tema_acc_pct=50.0)
        ok, m = ev.check_gates(r, None)
        self.assertFalse(ok)
        self.assertTrue(any("tema" in x for x in m), m)

    def test_entidade_com_poucos_casos_nao_bloqueia(self):
        r = self._res(ent=100.0, turno_acc_pct=0.0, turno_cases=ev.MIN_CASES_PER_METRIC - 1)
        ok, m = ev.check_gates(r, None)
        self.assertTrue(ok, m)

    def test_alucinacao_bloqueia_inclusive_nas_entidades_novas(self):
        for k in ("cargo", "uf", "partido", "tema", "historico", "turno", "apenasDeferidas"):
            ok, m = ev.check_gates(self._res(**{f"{k}_hallucination_pct": 20.0}), None)
            self.assertFalse(ok, k)
            self.assertTrue(any("alucinação" in x and k in x for x in m), (k, m))

    def test_holdout_de_perguntas_reais_bloqueia(self):
        real_ruim = self._res(intent=70.0)
        ok, m = ev.check_gates(self._res(), None, real=real_ruim)
        self.assertFalse(ok)
        self.assertTrue(any("perguntas reais" in x for x in m), m)
        ok, _ = ev.check_gates(self._res(), None, real=self._res(intent=90.0))
        self.assertTrue(ok)

    def test_catraca_contra_a_versao_em_producao(self):
        prod = self._res(intent=97.0)
        ok, m = ev.check_gates(self._res(intent=95.5), None, previous=prod)  # caiu 1,5 pp
        self.assertFalse(ok)
        self.assertTrue(any("em produção" in x for x in m), m)
        ok, m = ev.check_gates(self._res(intent=96.5), None, previous=prod)  # caiu 0,5 pp: tolerado
        self.assertTrue(ok, m)

    def test_queda_de_quantizacao_em_entidades_e_em_intencao(self):
        q8 = self._res(intent=97.0, ent=97.0)
        ok, m = ev.check_gates(self._res(intent=97.0, ent=92.0), None, baseline=q8)
        self.assertFalse(ok)
        self.assertTrue(any("entidades caiu" in x for x in m), m)
        ok, m = ev.check_gates(self._res(intent=92.0, ent=97.0), None, baseline=q8)
        self.assertFalse(ok)
        self.assertTrue(any("intenção caiu" in x for x in m), m)
        ok, m = ev.check_gates(self._res(intent=95.0, ent=95.0), None, baseline=q8)
        self.assertTrue(ok, m)

    def test_limiares_sao_configuraveis(self):
        ok, _ = ev.check_gates(self._res(intent=70.0), None, min_intent_acc=60.0)
        self.assertTrue(ok)

    def test_sem_unconstrained_so_valida_a_gramatica(self):
        ok, _ = ev.check_gates(self._res(), None)
        self.assertTrue(ok)


class TestEntidadesNovas(unittest.TestCase):
    def test_v2_mede_tema_historico_turno_e_apenas_deferidas(self):
        casos = [
            {"q": "candidatos de saúde", "intent": "LISTAR_CANDIDATOS", "tema": "saude"},
            {"q": "quem nunca foi eleito", "intent": "LISTAR_CANDIDATOS", "historico": "NUNCA_ELEITO"},
            {"q": "resultado do 2 turno", "intent": "RESULTADOS", "turno": 2},
            {"q": "só deferidas", "intent": "LISTAR_CANDIDATOS", "apenasDeferidas": True},
            {"q": "quem disputa", "intent": "LISTAR_CANDIDATOS", "tema": None},
        ]
        saidas = {
            "candidatos de saúde": {"intent": "LISTAR_CANDIDATOS", "tema": "saude"},
            "quem nunca foi eleito": {"intent": "LISTAR_CANDIDATOS", "historico": "ELEITO_2_OU_MAIS"},  # errado
            "resultado do 2 turno": {"intent": "RESULTADOS", "turno": 2},
            "só deferidas": {"intent": "LISTAR_CANDIDATOS", "apenasDeferidas": True},
            "quem disputa": {"intent": "LISTAR_CANDIDATOS", "tema": "educacao"},  # alucinou onde o contrato exige ausência
        }
        r = ev.evaluate(lambda q: json.dumps(saidas[q], ensure_ascii=False), casos, "v2")
        self.assertEqual(r["tema_acc_pct"], 100.0)
        self.assertEqual(r["historico_acc_pct"], 0.0)
        self.assertEqual(r["turno_acc_pct"], 100.0)
        self.assertEqual(r["apenasDeferidas_acc_pct"], 100.0)
        self.assertEqual(r["tema_null_cases"], 1)
        self.assertEqual(r["tema_hallucination_pct"], 100.0)

    def test_formato_legado_nao_mede_o_que_nao_expressa(self):
        r = ev.evaluate(lambda q: "", [{"q": "x", "intent": "LISTAR_CANDIDATOS"}], "legacy")
        self.assertNotIn("tema_acc_pct", r)
        self.assertIn("cargo_acc_pct", r)


class TestPromocao(unittest.TestCase):
    AGORA = "2026-10-06T12:00:00Z"

    def test_aprovada_promove_sem_forca(self):
        meta = {"version": "v3", "passed": True}
        self.assertIs(ev.aplicar_forca(meta, False, "", self.AGORA), meta)
        self.assertNotIn("forced", meta)

    def test_reprovada_sem_force_e_recusada(self):
        with self.assertRaises(RuntimeError):
            ev.aplicar_forca({"version": "v3", "passed": False}, False, "", self.AGORA)

    def test_force_exige_motivo(self):
        for motivo in ("", "   ", None):
            with self.assertRaises(RuntimeError):
                ev.aplicar_forca({"version": "v3", "passed": False}, True, motivo, self.AGORA)

    def test_force_com_motivo_grava_auditoria(self):
        meta = {"version": "v3", "passed": False, "reasons": ["intenção 70% < 85%"]}
        ev.aplicar_forca(meta, True, "  rollback emergencial do 2º turno  ", self.AGORA)
        self.assertEqual(meta["forced"], [{"reason": "rollback emergencial do 2º turno", "at": self.AGORA,
                                           "gate_reasons": ["intenção 70% < 85%"]}])

    def test_catraca_so_vale_sobre_o_mesmo_contrato(self):
        atual = {"version": "v2.1", "format": "v2"}
        prod = {"Q4_K_M": {"constrained": {"n_cases": 93, "intent_acc_pct": 87.1}}}
        prev, aviso = ev.escolher_previous(atual, prod, "v2", 93)
        self.assertEqual(prev["intent_acc_pct"], 87.1)
        self.assertIsNone(aviso)
        prev, aviso = ev.escolher_previous(atual, prod, "v2", 111)  # contrato cresceu: não compara maçã com laranja
        self.assertIsNone(prev)
        self.assertIn("outro contrato", aviso)
        prev, aviso = ev.escolher_previous(atual, prod, "legacy", 93)
        self.assertIsNone(prev)

    def test_catraca_sem_avaliacao_anterior(self):
        self.assertEqual(ev.escolher_previous(None, None, "v2", 111)[0], None)
        self.assertIn("sem avaliação", ev.escolher_previous(None, None, "v2", 111)[1])
        self.assertIn("desconhecido", ev.escolher_previous({"format": "v2"}, {"x": 1}, "v2", 111)[1])


class TestCli(unittest.TestCase):
    def test_entity_score(self):
        self.assertEqual(ev.entity_score({"cargo_acc_pct": 100.0, "uf_acc_pct": 50.0, "partido_acc_pct": None}), 75.0)
        self.assertIsNone(ev.entity_score({}))


if __name__ == "__main__":
    unittest.main(verbosity=2)
