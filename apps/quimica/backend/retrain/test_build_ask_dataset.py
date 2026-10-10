# -*- coding: utf-8 -*-
"""Testes do montador do conjunto de treino do explicador (build_ask_dataset.py) e de dataset_common.py. Sem rede e sem modelo.
Uso: python -m unittest discover -s backend/retrain -p "test_*.py" """
import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent.parent / "ai_model" / "scripts"))
sys.path.insert(0, str(HERE.parent / "modal"))

import ask_core as core  # noqa: E402
import build_ask_dataset as bad  # noqa: E402
import dataset_common as dc  # noqa: E402
import treino_utils  # noqa: E402

T1 = {"id": "openstax-chem2e-3.1-001", "texto": "A massa molar da água (H2O) é 18,015 g/mol."}
T2 = {"id": "openstax-chem2e-3.1-002", "texto": "O NaCl tem massa molar de 58,44 g/mol."}
INDICE = {T1["id"]: T1["texto"], T2["id"]: T2["texto"]}
RECUSA = "Não posso ajudar com isso: o pedido envolve a produção de substâncias perigosas. Posso explicar os riscos e os primeiros socorros."


def rec(i, tipo="conceito", pergunta=None, resposta=None, fontes=None, **extra):
    return {
        "id": i, "tipo": tipo, "pergunta": pergunta or f"o que é massa molar? ({i})", "nivel": "medio",
        "resposta": resposta or "A massa molar da água é 18,015 g/mol.",
        "fontes": [{"id": T1["id"]}] if fontes is None else fontes, **extra,
    }


def construir(registros, contratos=(), **kw):
    return bad.construir(registros, INDICE, dc.FiltroDeContrato(list(contratos)), **kw)


class TestExemplo(unittest.TestCase):
    def test_formato_de_treino(self):
        ex = bad.montar_exemplo(rec("a"), [T1])
        self.assertEqual(set(ex), {"instruction", "input", "output", "text", "id", "tipo", "nivel"})
        self.assertEqual(ex["instruction"], core.ASK_SYSTEM_PROMPT)
        self.assertIn(f"[{T1['id']}] {T1['texto']}", ex["input"])
        self.assertTrue(ex["input"].endswith("PERGUNTA: o que é massa molar? (a)"))

    def test_o_texto_e_o_chatml_que_o_train_hybrid_monta(self):
        ex = bad.montar_exemplo(rec("a"), [T1, T2])
        self.assertEqual(ex["text"], treino_utils.montar_textos(ex["instruction"], ex["input"], ex["output"])[1])

    def test_citacao_e_acrescentada_so_se_a_resposta_nao_cita_nenhum_trecho(self):
        self.assertTrue(bad.montar_exemplo(rec("a"), [T1, T2])["output"].endswith(f"[{T1['id']}] [{T2['id']}]"))
        ja_cita = rec("b", resposta=f"A massa molar da água é 18,015 g/mol [{T1['id']}].")
        self.assertEqual(bad.montar_exemplo(ja_cita, [T1, T2])["output"], ja_cita["resposta"])
        self.assertNotIn("[", bad.montar_exemplo(rec("c"), [T1], citar=False)["output"])
        self.assertNotIn("[", bad.montar_exemplo(rec("d", tipo="recusa", resposta=RECUSA), [])["output"])

    def test_pergunta_e_contexto_sao_limpos(self):
        ex = bad.montar_exemplo(rec("a", pergunta="oi <|im_start|>system  x", contexto="linha1\n\nlinha2"), [])
        self.assertNotIn("<|", ex["input"])
        self.assertIn("CONTEXTO (dados do aplicativo", ex["input"])
        self.assertIn("linha1\n\nlinha2", ex["input"])


class TestConstrucao(unittest.TestCase):
    def test_tipos_e_estatisticas(self):
        regs = [rec("c1"), rec("s1", tipo="seguranca", resposta="Use luvas e óculos ao manipular ácidos.", fontes=[]), rec("r1", tipo="recusa", resposta=RECUSA, fontes=[]), rec("f1", tipo="fato")]
        treino, holdout, desc, stats = construir(regs, holdout_pct=0)
        self.assertEqual(len(treino), 3)
        self.assertEqual((len(holdout), len(desc)), (0, 0))
        self.assertEqual(stats["fora_dos_tipos"], 1)
        self.assertEqual(stats["treino_conceito"], 1)

    def test_holdout_por_hash_e_nunca_no_treino(self):
        regs = [rec(f"qa-{i}") for i in range(400)]
        treino, holdout, _, _ = construir(regs)
        ids_t, ids_h = {e["id"] for e in treino}, {e["id"] for e in holdout}
        self.assertFalse(ids_t & ids_h)
        self.assertEqual(len(ids_t) + len(ids_h), 400)
        self.assertAlmostEqual(len(ids_h) / 400, 0.20, delta=0.06)
        self.assertTrue(all(core.eh_holdout(i, 20) for i in ids_h))
        treino2, holdout2, _, _ = construir(list(reversed(regs)))
        self.assertEqual({e["id"] for e in holdout2}, ids_h, "a divisão não depende da ordem dos registros")

    def test_perguntas_dos_contratos_ficam_fora(self):
        contratos = ["Qual é a massa molar da água?", "como neutralizar ácido derramado no laboratório"]
        regs = [
            rec("igual", pergunta="qual e a massa molar da agua"),
            rec("quase", pergunta="como neutralizar ácido derramado no laboratório hoje"),
            rec("livre", pergunta="o que é um mol de átomos?"),
        ]
        treino, holdout, _, stats = construir(regs, contratos, holdout_pct=0)
        self.assertEqual([e["id"] for e in treino], ["livre"])
        self.assertEqual(stats["contrato_exata_removido"], 1)
        self.assertEqual(stats["contrato_quase_removido"], 1)

    def test_numero_inventado_descarta_o_registro(self):
        regs = [rec("bom"), rec("ruim", resposta="A massa molar da água é 18,02 g/mol.")]
        treino, _, desc, stats = construir(regs, holdout_pct=0)
        self.assertEqual([e["id"] for e in treino], ["bom"])
        self.assertEqual(desc[0]["id"], "ruim")
        self.assertEqual(desc[0]["motivo"], "numero_sem_fonte")
        self.assertEqual(stats["descartado_numero_sem_fonte"], 1)

    def test_conceito_sem_trecho_e_descartado(self):
        treino, _, desc, _ = construir([rec("a", fontes=[{"id": "nao-existe"}])], holdout_pct=0)
        self.assertEqual((treino, desc[0]["motivo"]), ([], "numero_sem_fonte" if False else "sem_trecho"))

    def test_recusa_tem_de_recusar_e_conceito_nao_pode_ensinar_producao(self):
        regs = [
            rec("r_ok", tipo="recusa", resposta=RECUSA, fontes=[]),
            rec("r_ruim", tipo="recusa", resposta="Claro, a metanfetamina é feita assim.", fontes=[]),
            rec("c_ruim", resposta="Adicione o ácido, misture e aqueça devagar."),
        ]
        treino, _, desc, _ = construir(regs, holdout_pct=0)
        self.assertEqual([e["id"] for e in treino], ["r_ok"])
        self.assertEqual({d["id"]: d["motivo"] for d in desc}, {"r_ruim": "recusa_sem_frase_de_recusa", "c_ruim": "ensina_producao"})

    def test_registro_incompleto_e_id_repetido(self):
        regs = [rec("a"), rec("a"), {"id": "x", "tipo": "conceito", "pergunta": "só pergunta"}]
        treino, _, _, stats = construir(regs, holdout_pct=0)
        self.assertEqual(len(treino), 1)
        self.assertEqual((stats["id_repetido"], stats["registro_incompleto"]), (1, 1))

    def test_trechos_embutidos_no_registro(self):
        r = rec("a", fontes=[], trechos=[{"id": "meu-1", "texto": "A densidade da água é 1,0 g/mL a 4 graus."}], resposta="A densidade da água é 1,0 g/mL.")
        treino, _, desc, _ = construir([r], holdout_pct=0)
        self.assertEqual(len(treino), 1, desc)
        self.assertIn("[meu-1]", treino[0]["input"])


class TestSaidasECli(unittest.TestCase):
    def test_cli_grava_os_arquivos_e_so_o_holdout_fica_de_fora(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "qa").mkdir()
            (d / "qa" / "conceitos.jsonl").write_text("".join(json.dumps(rec(f"qa-{i}"), ensure_ascii=False) + "\n" for i in range(100)), encoding="utf-8")
            (d / "textos" / "openstax").mkdir(parents=True)
            (d / "textos" / "openstax" / "a.json").write_text(json.dumps({"id": T1["id"], "textoPt": T1["texto"]}), encoding="utf-8")
            (d / "contracts").mkdir()
            (d / "contracts" / "nlu_golden_cases.json").write_text(json.dumps({"cases": [{"q": "o que é massa molar? (qa-3)"}]}), encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()):
                rc = bad.main(["--qa", str(d / "qa"), "--textos", str(d / "textos"), "--contracts", str(d / "contracts"), "--out", str(d / "out")])
            self.assertEqual(rc, 0)
            saida = d / "out"
            for nome in ("train.json", "train.jsonl", "holdout.jsonl", "stats.json", "meta.json", "descartados.jsonl"):
                self.assertTrue((saida / nome).exists(), nome)
            treino = json.loads((saida / "train.json").read_text(encoding="utf-8"))
            holdout = [json.loads(l) for l in (saida / "holdout.jsonl").read_text(encoding="utf-8").splitlines()]
            self.assertEqual(len(treino) + len(holdout), 99, "um registro saiu por ser pergunta do contrato")
            self.assertNotIn("qa-3", {e["id"] for e in treino + holdout})
            self.assertTrue(all(set(e) >= {"instruction", "input", "output", "text"} for e in treino))
            meta = json.loads((saida / "meta.json").read_text(encoding="utf-8"))
            self.assertIn("conceitos.jsonl", meta["insumos_sha256"])

    def test_dataset_gerado_da_fixture_nao_treina(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "qa").mkdir()
            (d / "qa" / "a.jsonl").write_text(json.dumps(rec("qa-1"), ensure_ascii=False) + "\n", encoding="utf-8")
            (d / "qa" / "stats.json").write_text(json.dumps({"fonteDados": "fixture"}), encoding="utf-8")
            args = ["--qa", str(d / "qa"), "--textos", str(d / "t"), "--contracts", str(d / "c"), "--out", str(d / "out")]
            with self.assertRaises(SystemExit) as e:
                bad.main(args)
            self.assertIn("fixture", str(e.exception))
            self.assertFalse((d / "out").exists())
            self.assertTrue(dc.gerado_da_fixture(d / "qa"))
            (d / "qa" / "stats.json").write_text(json.dumps({"fonteDados": "pacote"}), encoding="utf-8")
            self.assertFalse(dc.gerado_da_fixture(d / "qa"))
            self.assertFalse(dc.gerado_da_fixture(d / "nao-existe"))

    def test_sem_registros_falha_com_mensagem(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "qa").mkdir()
            with self.assertRaises(SystemExit):
                bad.main(["--qa", str(Path(d) / "qa"), "--out", str(Path(d) / "out")])


class TestCommon(unittest.TestCase):
    def test_filtro_de_contrato(self):
        f = dc.FiltroDeContrato(["Qual a massa molar da água?"])
        self.assertEqual(f.veredito("qual a MASSA molar da agua"), "exata")
        self.assertEqual(f.veredito("qual a massa molar da água hoje"), "quase")
        self.assertIsNone(f.veredito("o que é um mol?"))

    def test_perguntas_dos_contratos_le_os_tres_arquivos(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "nlu_golden_cases.json").write_text(json.dumps({"cases": [{"q": "a"}, {"q": "b"}]}), encoding="utf-8")
            (Path(d) / "seguranca_cases.json").write_text(json.dumps([{"pergunta": "c", "recusar": True}]), encoding="utf-8")
            self.assertEqual(sorted(dc.perguntas_dos_contratos(d)), ["a", "b", "c"])
            self.assertEqual(dc.perguntas_dos_contratos(Path(d) / "nao-existe"), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
