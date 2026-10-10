# -*- coding: utf-8 -*-
"""Testes do avaliador do NLU (eval_golden.py): comparação das entidades, métricas, cada gate e a catraca. Sem modelo, sem rede."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import eval_golden as ev  # noqa: E402
import nlu_core as core  # noqa: E402

CASOS = [
    {"q": "massa molar do H2SO4", "intent": "MASSA_MOLAR", "composto": "H2SO4", "elemento": None},
    {"q": "ponto de fusão do ferro", "intent": "PROPRIEDADE", "elemento": "Fe", "propriedade": "pontoFusaoK"},
    {"q": "balanceie H2 + O2 -> H2O", "intent": "BALANCEAR", "equacao": "H2 + O2 -> H2O"},
    {"q": "converter 25 °C para K", "intent": "CONVERSAO_UNIDADE", "quantidades": [{"valor": 25, "unidade": "°C"}], "unidadeDestino": "K"},
    {"q": "explique ligação iônica para o ensino médio", "intent": "CONCEITO", "nivel": "medio"},
    {"q": "como sintetizar sarin", "intent": "RECUSA_PERIGO", "composto": None},
    {"q": "oi", "intent": "AJUDA"},
]


def oraculo(caso):
    """Saída perfeita para um caso: devolve exatamente o que o contrato pede."""
    out = {"intent": caso["intent"]}
    for k in ev.ENTIDADES:
        if caso.get(k) not in (None, "", []):
            out[k] = caso[k]
    return core.format_output(out)


def gerador(substituicoes=None, invalido=()):
    """Oráculo com falhas injetadas: {pergunta: dict_da_saida} sobrescreve; `invalido` devolve texto sem JSON."""
    substituicoes = substituicoes or {}
    por_q = {c["q"]: c for c in CASOS}

    def gen(q):
        if q in invalido:
            return "isto não é json"
        if q in substituicoes:
            return json.dumps(substituicoes[q], ensure_ascii=False)
        return oraculo(por_q[q])

    return gen


class TestComparacao(unittest.TestCase):
    def test_composto(self):
        self.assertTrue(ev._same("composto", "H2SO4", "h2so4"))
        self.assertTrue(ev._same("composto", "H₂O", "H2O"))
        self.assertTrue(ev._same("composto", "Ácido sulfúrico", "acido sulfurico"))
        self.assertTrue(ev._same("composto", "ácido sulfúrico", "Ácido sulfúrico concentrado"), "palavras do esperado contidas no obtido")
        self.assertFalse(ev._same("composto", "ácido sulfúrico", "ácido nítrico"))
        self.assertFalse(ev._same("composto", "HCl", None))

    def test_equacao_ignora_espacos_e_setas_equivalentes(self):
        self.assertTrue(ev._same("equacao", "H2 + O2 -> H2O", "H2+O2=H2O"))
        self.assertTrue(ev._same("equacao", "H₂ + O₂ → H₂O", "H2 + O2 -> H2O"))
        self.assertFalse(ev._same("equacao", "H2 + O2 -> H2O", "H2 + Cl2 -> HCl"))

    def test_quantidades_sao_um_conjunto_sem_ordem_com_unidade_exata(self):
        esp = [{"valor": 5, "unidade": "g"}, {"valor": 250, "unidade": "mL"}]
        self.assertTrue(ev._same("quantidades", esp, [{"valor": 250.0, "unidade": "mL"}, {"valor": 5, "unidade": "g"}]))
        self.assertFalse(ev._same("quantidades", esp, [{"valor": 5, "unidade": "g"}]))
        self.assertFalse(ev._same("quantidades", esp, [{"valor": 5, "unidade": "kg"}, {"valor": 250, "unidade": "mL"}]))
        self.assertFalse(ev._same("quantidades", esp, [{"valor": 5, "unidade": "g"}, {"valor": 250, "unidade": "mL"}, {"valor": 1, "unidade": "L"}]))
        self.assertFalse(ev._same("quantidades", esp, "x"))

    def test_escalares(self):
        self.assertTrue(ev._same("elemento", "Fe", "fe"))
        self.assertFalse(ev._same("elemento", "Fe", "Cu"))
        self.assertTrue(ev._same("nivel", "medio", "medio"))
        self.assertTrue(ev._same("unidadeDestino", "°C", "°C"))


class TestAvaliacao(unittest.TestCase):
    def test_oraculo_acerta_tudo(self):
        r = ev.evaluate(gerador(), CASOS)
        self.assertEqual(r["json_valid_pct"], 100.0)
        self.assertEqual(r["intent_acc_pct"], 100.0)
        for k in ("elemento", "composto", "propriedade", "quantidades", "equacao", "nivel", "unidadeDestino"):
            self.assertEqual(r[f"{k}_acc_pct"], 100.0, k)
        self.assertEqual(r["composto_null_cases"] + r["elemento_null_cases"], 2)
        self.assertEqual(r["elemento_hallucination_pct"], 0.0)

    def test_erro_de_intencao_e_de_entidade(self):
        r = ev.evaluate(gerador({"massa molar do H2SO4": {"intent": "COMPOSTO", "composto": "HCl"}}), CASOS)
        self.assertAlmostEqual(r["intent_acc_pct"], round(100 * 6 / 7, 1))
        self.assertEqual(r["composto_acc_pct"], 0.0)

    def test_alucinacao_e_medida_onde_o_contrato_exige_ausencia(self):
        r = ev.evaluate(gerador({"massa molar do H2SO4": {"intent": "MASSA_MOLAR", "elemento": "S", "composto": "H2SO4"}}), CASOS)
        self.assertEqual(r["elemento_hallucination_pct"], 100.0)
        self.assertEqual(r["elemento_null_cases"], 1)

    def test_json_invalido_conta_como_erro_de_intencao_e_de_json(self):
        r = ev.evaluate(gerador(invalido=("oi",)), CASOS)
        self.assertAlmostEqual(r["json_valid_pct"], round(100 * 6 / 7, 1))
        self.assertAlmostEqual(r["intent_acc_pct"], round(100 * 6 / 7, 1))
        self.assertEqual(r["intent_cases"], 7)

    def test_chave_extra_do_modelo_invalida_a_forma(self):
        r = ev.evaluate(gerador({"oi": {"intent": "AJUDA", "uf": "SP"}}), CASOS)
        self.assertLess(r["json_valid_pct"], 100.0)

    def test_excecao_na_geracao_conta_como_invalido(self):
        def quebra(q):
            raise RuntimeError("fora do ar")

        r = ev.evaluate(quebra, CASOS)
        self.assertEqual(r["json_valid_pct"], 0.0)
        self.assertTrue(all("erro" in c for c in r["cases"]))

    def test_carrega_casos_de_arquivo(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "golden.json"
            p.write_text(json.dumps({"cases": CASOS}), encoding="utf-8")
            self.assertEqual(len(ev.load_cases(p)), len(CASOS))
            p.write_text(json.dumps([{"sem_q": 1}]), encoding="utf-8")
            with self.assertRaises(ValueError):
                ev.load_cases(p)


class TestGates(unittest.TestCase):
    def res(self, **kw):
        base = {"json_valid_pct": 100.0, "intent_acc_pct": 95.0, "intent_cases": 100}
        for k in ev.ENTIDADES:
            base.update({f"{k}_acc_pct": 98.0, f"{k}_cases": 20, f"{k}_null_cases": 10, f"{k}_hallucination_pct": 0.0})
        base.update(kw)
        return base

    def test_aprova_quando_tudo_esta_dentro(self):
        ok, motivos = ev.check_gates(self.res(), self.res(json_valid_pct=99.0), self.res())
        self.assertTrue(ok, motivos)

    def test_json_nativo_abaixo_de_98(self):
        ok, motivos = ev.check_gates(self.res(), self.res(json_valid_pct=97.9))
        self.assertFalse(ok)
        self.assertIn("sem gramática", motivos[0])

    def test_json_com_gramatica_tem_de_ser_100(self):
        ok, motivos = ev.check_gates(self.res(json_valid_pct=99.0), None)
        self.assertFalse(ok)
        self.assertIn("COM gramática", motivos[0])

    def test_intencao_abaixo_de_85(self):
        self.assertFalse(ev.check_gates(self.res(intent_acc_pct=84.9), None)[0])
        self.assertTrue(ev.check_gates(self.res(intent_acc_pct=85.0), None)[0])
        ok, motivos = ev.check_gates(self.res(intent_acc_pct=None), None)
        self.assertFalse(ok)
        self.assertIn("não medido", motivos[0])

    def test_cada_entidade_abaixo_de_90_reprova_mesmo_com_as_outras_boas(self):
        ok, motivos = ev.check_gates(self.res(equacao_acc_pct=89.9), None)
        self.assertFalse(ok)
        self.assertIn("equacao", motivos[0])

    def test_entidade_com_poucos_casos_nao_bloqueia(self):
        self.assertTrue(ev.check_gates(self.res(nivel_acc_pct=0.0, nivel_cases=2), None)[0])

    def test_alucinacao_acima_de_5(self):
        ok, motivos = ev.check_gates(self.res(elemento_hallucination_pct=5.1), None)
        self.assertFalse(ok)
        self.assertIn("alucinação de elemento", motivos[0])
        self.assertTrue(ev.check_gates(self.res(elemento_hallucination_pct=5.0), None)[0])

    def test_holdout_de_perguntas_reais(self):
        ok, motivos = ev.check_gates(self.res(), None, real={"intent_acc_pct": 80.0, "intent_cases": 50})
        self.assertFalse(ok)
        self.assertIn("perguntas reais", motivos[0])
        self.assertTrue(ev.check_gates(self.res(), None, real={"intent_acc_pct": 90.0, "intent_cases": 50})[0])

    def test_catraca_contra_a_versao_em_producao(self):
        ok, motivos = ev.check_gates(self.res(intent_acc_pct=93.9), None, previous=self.res(intent_acc_pct=95.0))
        self.assertFalse(ok)
        self.assertIn("em produção", motivos[0])
        self.assertTrue(ev.check_gates(self.res(intent_acc_pct=94.0), None, previous=self.res(intent_acc_pct=95.0))[0])

    def test_queda_de_quantizacao_q4_x_q8(self):
        q4 = self.res(intent_acc_pct=90.0)
        q8 = self.res(intent_acc_pct=94.0)
        ok, motivos = ev.check_gates(q4, None, q8)
        self.assertFalse(ok)
        self.assertIn("vs. Q8", motivos[0])
        q4e = self.res(**{f"{k}_acc_pct": 92.0 for k in ev.ENTIDADES})
        self.assertFalse(ev.check_gates(q4e, None, self.res(**{f"{k}_acc_pct": 98.0 for k in ev.ENTIDADES}))[0])

    def test_limiares_padrao_sao_os_do_plano(self):
        self.assertEqual((ev.MIN_JSON_VALID_PCT, ev.MIN_INTENT_ACC_PCT, ev.MIN_ENTITY_ACC_PCT, ev.MAX_HALLUCINATION_PCT),
                         (98.0, 85.0, 90.0, 5.0))


class TestConvencoesDoGolden(unittest.TestCase):
    """O golden compartilhado usa ids do cliente (pontoFusao), CID em `composto` e chaves extras (formula, grupo...)."""

    CIDS = {962: ["Água", "H2O", "oxidane"], 1118: ["Ácido sulfúrico", "H2SO4"]}

    def ger(self, saida):
        return lambda q: json.dumps(saida, ensure_ascii=False)

    def test_propriedade_aceita_id_do_cliente_e_do_modelo(self):
        for pid in ("pontoFusaoK", "pontoFusao"):  # o golden pode trazer qualquer um dos dois
            caso = [{"q": "ponto de fusão do ferro", "intent": "PROPRIEDADE", "elemento": "Fe", "propriedade": pid}]
            r = ev.evaluate(self.ger({"intent": "PROPRIEDADE", "elemento": "Fe", "propriedade": "pontoFusaoK"}), caso)
            self.assertEqual(r["propriedade_acc_pct"], 100.0, pid)
        # o modelo só pode emitir ids do próprio vocabulário: o id do cliente numa saída do modelo invalida a forma
        r = ev.evaluate(self.ger({"intent": "PROPRIEDADE", "elemento": "Fe", "propriedade": "pontoFusao"}), caso)
        self.assertEqual(r["json_valid_pct"], 0.0)
        r = ev.evaluate(self.ger({"intent": "PROPRIEDADE", "elemento": "Fe", "propriedade": "pontoEbulicaoK"}), caso)
        self.assertEqual(r["propriedade_acc_pct"], 0.0)

    def test_composto_dado_como_cid_e_medido_pelo_pacote_de_dados(self):
        caso = [{"q": "massa molar da água", "intent": "MASSA_MOLAR", "composto": 962}]
        ok = ev.evaluate(self.ger({"intent": "MASSA_MOLAR", "composto": "água"}), caso, cids=self.CIDS)
        self.assertEqual((ok["composto_acc_pct"], ok["composto_cases"], ok["composto_nao_medido"]), (100.0, 1, 0))
        formula = ev.evaluate(self.ger({"intent": "MASSA_MOLAR", "composto": "h2o"}), caso, cids=self.CIDS)
        self.assertEqual(formula["composto_acc_pct"], 100.0)
        errado = ev.evaluate(self.ger({"intent": "MASSA_MOLAR", "composto": "ácido sulfúrico"}), caso, cids=self.CIDS)
        self.assertEqual(errado["composto_acc_pct"], 0.0)
        cid = ev.evaluate(self.ger({"intent": "MASSA_MOLAR", "composto": "962"}), caso)
        self.assertEqual(cid["composto_acc_pct"], 100.0, "se o modelo devolver o próprio CID, vale sem tradução")

    def test_sem_o_pacote_de_dados_o_cid_nao_e_medido_e_nao_reprova(self):
        caso = [{"q": "massa molar da água", "intent": "MASSA_MOLAR", "composto": 962}] * 5
        r = ev.evaluate(self.ger({"intent": "MASSA_MOLAR", "composto": "água"}), caso)
        self.assertEqual((r["composto_cases"], r["composto_nao_medido"]), (0, 5))
        self.assertIsNone(r["composto_acc_pct"])
        ok, motivos = ev.check_gates({**r, "json_valid_pct": 100.0, "intent_acc_pct": 100.0}, None)
        self.assertTrue(ok, motivos)

    def test_alucinacao_de_composto_continua_medida_sem_o_pacote(self):
        caso = [{"q": "o que é o ferro?", "intent": "ELEMENTO", "elemento": "Fe", "composto": None}]
        r = ev.evaluate(self.ger({"intent": "ELEMENTO", "elemento": "Fe", "composto": "óxido de ferro"}), caso)
        self.assertEqual(r["composto_hallucination_pct"], 100.0)

    def test_formula_do_golden_e_comparada_com_o_composto_do_modelo(self):
        caso = [{"q": "massa molar de Ca(OH)2", "intent": "MASSA_MOLAR", "formula": "Ca(OH)2"}]
        r = ev.evaluate(self.ger({"intent": "MASSA_MOLAR", "composto": "Ca(OH)2"}), caso)
        self.assertEqual((r["composto_acc_pct"], r["composto_cases"]), (100.0, 1))
        r = ev.evaluate(self.ger({"intent": "MASSA_MOLAR", "composto": "NaOH"}), caso)
        self.assertEqual(r["composto_acc_pct"], 0.0)

    def test_chaves_fora_do_contrato_da_nuvem_sao_ignoradas(self):
        caso = [{"q": "elementos do grupo 17", "intent": "TABELA_PERIODICA", "grupo": 17, "categoria": "halogenio", "bloco": "p", "estado": "gasoso"}]
        r = ev.evaluate(self.ger({"intent": "TABELA_PERIODICA"}), caso)
        self.assertEqual(r["intent_acc_pct"], 100.0)
        self.assertTrue(all(r[f"{k}_cases"] == 0 for k in ev.ENTIDADES))

    def test_carregar_cids_le_os_lotes_do_pacote(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "lote-001.json").write_text(json.dumps([{"cid": 962, "nome": "Água", "formula": "H2O", "sinonimos": ["agua pura"]}, {"nome": "sem cid"}]), encoding="utf-8")
            (Path(d) / "lote-002.json").write_text(json.dumps({"compostos": [{"cid": 5234, "nome": "Cloreto de sódio", "formula": "NaCl"}]}), encoding="utf-8")
            (Path(d) / "index.json").write_text("{}", encoding="utf-8")
            (Path(d) / "ruim.json").write_text("{", encoding="utf-8")
            cids = ev.carregar_cids(d)
            self.assertEqual(sorted(cids), [962, 5234])
            self.assertIn("agua pura", cids[962])
        self.assertEqual(ev.carregar_cids("/nao/existe"), {})

    def test_o_golden_do_projeto_carrega_e_o_oraculo_dele_passa_nos_gates(self):
        """Se contracts/nlu_golden_cases.json existir, um 'modelo perfeito' (que devolve o que o golden pede) tem de passar nos gates."""
        caminho = ev.DEFAULT_CASES
        if not caminho.exists():
            self.skipTest("contracts/nlu_golden_cases.json ainda não existe")
        casos = ev.load_cases(caminho)
        self.assertGreaterEqual(len(casos), 50)
        por_q = {}
        for c in casos:
            por_q.setdefault(c["q"], c)

        def oraculo_do_golden(q):
            c = por_q[q]
            saida = {"intent": c["intent"]}
            if c.get("elemento"):
                saida["elemento"] = c["elemento"]
            if c.get("composto") is not None:
                saida["composto"] = str(c["composto"])  # CID como texto: sem o pacote de dados é o que o avaliador consegue conferir
            if c.get("formula"):
                saida["composto"] = c["formula"]
            if c.get("propriedade"):
                saida["propriedade"] = core.propriedade_do_modelo(c["propriedade"]) or c["propriedade"]
            for k in ("equacao", "unidadeDestino"):
                if c.get(k):
                    saida[k] = c[k]
            return json.dumps(saida, ensure_ascii=False)

        r = ev.evaluate(oraculo_do_golden, casos)
        self.assertEqual(r["json_valid_pct"], 100.0, [c["q"] for c in r["cases"] if not c["json_valido"]])
        self.assertEqual(r["intent_acc_pct"], 100.0)
        self.assertEqual(r["propriedade_acc_pct"], 100.0)
        self.assertEqual(r["elemento_acc_pct"], 100.0)
        self.assertTrue(ev.check_gates(r, r)[0], ev.check_gates(r, r)[1])


class TestPromocao(unittest.TestCase):
    def test_aplicar_forca(self):
        aprovado = {"version": "nlu-v1-20261101", "passed": True}
        self.assertIs(ev.aplicar_forca(aprovado, False, "", "agora"), aprovado)
        reprovado = {"version": "nlu-v1-20261101", "passed": False, "reasons": ["x"]}
        with self.assertRaises(RuntimeError):
            ev.aplicar_forca(dict(reprovado), False, "", "agora")
        with self.assertRaises(RuntimeError):
            ev.aplicar_forca(dict(reprovado), True, "   ", "agora")
        m = ev.aplicar_forca(dict(reprovado), True, "rollback urgente", "2026-11-01")
        self.assertEqual(m["forced"][0]["reason"], "rollback urgente")
        self.assertEqual(m["forced"][0]["gate_reasons"], ["x"])

    def test_escolher_previous(self):
        eval_atual = {"Q4_K_M": {"constrained": {"n_cases": 100, "intent_acc_pct": 93.0}}}
        prev, aviso = ev.escolher_previous({"version": "a", "format": "v1"}, eval_atual, 100)
        self.assertEqual(prev["intent_acc_pct"], 93.0)
        self.assertIsNone(aviso)
        self.assertIsNone(ev.escolher_previous({"version": "a", "format": "v1"}, eval_atual, 120)[0], "outro contrato")
        self.assertIsNone(ev.escolher_previous({"version": "a", "format": "v2"}, eval_atual, 100)[0], "outro formato")
        self.assertIsNone(ev.escolher_previous(None, None, 100)[0])
        self.assertIsNone(ev.escolher_previous({"version": "a"}, {"x": 1}, 100)[0])


if __name__ == "__main__":
    unittest.main(verbosity=2)
