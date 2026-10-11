# -*- coding: utf-8 -*-
"""Testes do montador do conjunto de treino do NLU (build_nlu_dataset.py). Sem rede e sem modelo."""
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

import build_nlu_dataset as bnd  # noqa: E402
import dataset_common as dc  # noqa: E402
import nlu_core as nlu  # noqa: E402
import treino_utils  # noqa: E402


def r(q, alvo):
    return {"q": q, "alvo": alvo}


def construir(registros, contratos=(), pct=20):
    return bnd.construir(registros, dc.FiltroDeContrato(list(contratos)), pct)


class TestAlvo(unittest.TestCase):
    def test_entidades_dentro_ou_fora_do_alvo(self):
        self.assertEqual(bnd.alvo_normalizado({"intent": "MASSA_MOLAR", "entidades": {"composto": "H2O"}}), {"intent": "MASSA_MOLAR", "composto": "H2O"})
        self.assertEqual(bnd.alvo_normalizado({"intent": "ELEMENTO", "elemento": "Fe", "uf": "SP", "nivel": None}), {"intent": "ELEMENTO", "elemento": "Fe"})


class TestConstrucao(unittest.TestCase):
    def test_formato_de_treino_e_texto_igual_ao_do_treino(self):
        treino, holdout, _, _, stats = construir([r("massa molar do H2SO4", {"intent": "MASSA_MOLAR", "composto": "H2SO4"})], pct=0)
        ex = treino[0]
        self.assertEqual(ex["output"], '{"intent": "MASSA_MOLAR", "composto": "H2SO4"}')
        self.assertEqual(ex["instruction"], nlu.SYSTEM_PROMPT)
        self.assertEqual(ex["text"], treino_utils.montar_textos(ex["instruction"], ex["input"], ex["output"])[1])
        self.assertEqual(stats["intent_MASSA_MOLAR"], 1)

    def test_alvo_fora_do_vocabulario_e_descartado(self):
        _, _, _, desc, _ = construir([r("x y z", {"intent": "FILTER_CANDIDATES"}), r("oi", {"intent": "ELEMENTO", "elemento": "Zz"})], pct=0)
        self.assertEqual([d["motivo"] for d in desc], ["alvo_fora_do_vocabulario"] * 2)

    def test_evidencia_da_equacao_e_das_quantidades(self):
        ok = [
            r("balanceie H2 + O2 -> H2O", {"intent": "BALANCEAR", "equacao": "H2 + O2 -> H2O"}),
            r("balanceie 2 H2 + O2 = 2 H2O", {"intent": "BALANCEAR", "equacao": "H2 + O2 -> H2O"}),
            r("quantos mols em 18 g de água", {"intent": "ESTEQUIOMETRIA", "composto": "H2O", "quantidades": [{"valor": 18, "unidade": "g"}]}),
            r("molaridade de 0,1 mol de NaCl", {"intent": "CONCENTRACAO", "quantidades": [{"valor": 0.1, "unidade": "mol"}]}),
        ]
        ruins = [
            r("balanceie a combustão do metano", {"intent": "BALANCEAR", "equacao": "CH4 + O2 -> CO2 + H2O"}),
            r("quantos mols em 18 g de sal", {"intent": "ESTEQUIOMETRIA", "quantidades": [{"valor": 36, "unidade": "g"}]}),
        ]
        treino, _, _, desc, stats = construir(ok + ruins, pct=0)
        self.assertEqual(len(treino), 4)
        self.assertEqual({d["motivo"] for d in desc}, {"sem_evidencia_equacao", "sem_evidencia_quantidades"})

    def test_holdout_por_hash_vira_casos_de_referencia(self):
        regs = [r(f"massa molar do composto número {i}", {"intent": "MASSA_MOLAR", "composto": f"C{i}H{i}"}) for i in range(300)]
        treino, holdout, casos, _, _ = construir(regs)
        self.assertEqual(len(treino) + len(holdout), 300)
        self.assertAlmostEqual(len(holdout) / 300, 0.20, delta=0.07)
        self.assertEqual(len(casos), len(holdout))
        self.assertEqual(casos[0].keys() >= {"q", "intent", "composto"}, True)
        self.assertFalse({e["id"] for e in treino} & {e["id"] for e in holdout})

    def test_perguntas_dos_contratos_e_repetidas_ficam_fora(self):
        regs = [r("Qual a massa molar da água?", {"intent": "MASSA_MOLAR", "composto": "H2O"}), r("qual a massa molar da agua", {"intent": "MASSA_MOLAR", "composto": "H2O"}),
                r("massa molar do sal de cozinha", {"intent": "MASSA_MOLAR", "composto": "NaCl"}), r("massa molar do sal de cozinha!", {"intent": "MASSA_MOLAR", "composto": "NaCl"})]
        treino, _, _, _, stats = construir(regs, ["qual é a massa molar da água"], pct=0)
        self.assertEqual([e["input"] for e in treino], ["massa molar do sal de cozinha"])
        self.assertEqual(stats["pergunta_repetida"], 2)
        self.assertGreaterEqual(stats.get("contrato_exata_removido", 0) + stats.get("contrato_quase_removido", 0), 1)

    def test_respeita_a_divisao_do_gerador_e_ignora_arquivos_sft(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            def linhas(prefixo, n):
                return "".join(json.dumps(r(f"{prefixo} massa molar do composto {i}", {"intent": "MASSA_MOLAR", "composto": f"C{i}H{i}"}), ensure_ascii=False) + "\n" for i in range(n))
            (d / "train.jsonl").write_text(linhas("treino", 30), encoding="utf-8")
            (d / "val.jsonl").write_text(linhas("validação", 5), encoding="utf-8")
            (d / "train_sft.jsonl").write_text('{"instruction": "x", "input": "y", "output": "z"}\n', encoding="utf-8")
            regs = bnd.ler_registros(d)
            self.assertEqual(len(regs), 35)
            treino, holdout, casos, _, stats = construir(regs)
            self.assertEqual((len(treino), len(holdout)), (30, 5))
            self.assertTrue(all(c["q"].startswith("validação") for c in casos))
            self.assertNotIn("registro_incompleto", stats)
            # sem train/val, lê tudo menos *_sft*
            (d / "val.jsonl").unlink()
            (d / "train.jsonl").rename(d / "outro.jsonl")
            self.assertEqual(len(bnd.ler_registros(d)), 30)

    def test_cli(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "nlu").mkdir()
            linhas = [r(f"ponto de fusão do elemento número {i}", {"intent": "PROPRIEDADE", "elemento": "Fe", "propriedade": "pontoFusaoK"}) for i in range(60)]
            (d / "nlu" / "a.jsonl").write_text("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in linhas), encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()):
                rc = bnd.main(["--nlu", str(d / "nlu"), "--contracts", str(d / "contracts"), "--out", str(d / "out")])
            self.assertEqual(rc, 0)
            casos = json.loads((d / "out" / "holdout_cases.json").read_text(encoding="utf-8"))["cases"]
            self.assertTrue(all(c["intent"] == "PROPRIEDADE" and c["elemento"] == "Fe" for c in casos))
            self.assertTrue((d / "out" / "train.json").exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
