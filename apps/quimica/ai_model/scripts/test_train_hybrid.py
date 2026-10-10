# -*- coding: utf-8 -*-
"""Testes (sem torch) dos argumentos e das predefinições de train_hybrid.py e da cópia de documentos de merge_and_export.py.
Uso: python -m unittest discover -s ai_model/scripts -p "test_*.py" """
import contextlib
import io
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent.parent / "backend" / "modal"))

import merge_and_export as merge  # noqa: E402
import train_hybrid as th  # noqa: E402
import treino_utils as t  # noqa: E402


class Argumentos(unittest.TestCase):
    def test_predefinicoes_do_plano(self):
        nlu = th.montar_argumentos(["--target", "nlu", "--version", "nlu-v1-20261101"])
        self.assertEqual(nlu.base_model, "Qwen/Qwen2.5-1.5B-Instruct")
        self.assertEqual(nlu.max_length, 256)
        self.assertEqual(nlu.output_dir.name, "SaibaTudo-Quimica-NLU-hybrid")
        ask = th.montar_argumentos(["--target", "ask", "--version", "ask-v1-20261101"])
        self.assertEqual(ask.base_model, "Qwen/Qwen3-4B-Instruct-2507")
        self.assertEqual(ask.max_length, 1024)
        self.assertEqual((ask.batch_size, ask.grad_accum), (1, 16), "4B em 8 GB: lote 1 com acúmulo de gradiente")
        self.assertEqual(ask.output_dir.name, "SaibaTudo-Quimica-Ask-hybrid")
        self.assertEqual(ask.seed, 2026)

    def test_linha_de_comando_vence_a_predefinicao(self):
        a = th.montar_argumentos(["--target", "ask", "--version", "ask-v2-20270101", "--max_length", "768", "--epochs", "1", "--dataset", "x.json"])
        self.assertEqual((a.max_length, a.epochs, a.dataset.name), (768, 1.0, "x.json"))

    def test_versao_tem_de_combinar_com_o_alvo(self):
        for argv in (["--target", "nlu", "--version", "ask-v1-20261101"], ["--target", "ask", "--version", "v2.3-20261007"], ["--target", "nlu", "--version", "nlu-v1-2026"]):
            with self.assertRaises(SystemExit), contextlib.redirect_stderr(io.StringIO()):
                th.montar_argumentos(argv)

    def test_alvo_e_obrigatorio(self):
        with self.assertRaises(SystemExit), contextlib.redirect_stderr(io.StringIO()):
            th.montar_argumentos(["--version", "nlu-v1-20261101"])

    def test_dataset_padrao_aponta_para_a_saida_dos_montadores(self):
        self.assertTrue(str(th.PRESETS["nlu"]["dataset"]).replace("\\", "/").endswith("backend/retrain/out-nlu/train.json"))
        self.assertTrue(str(th.PRESETS["ask"]["dataset"]).replace("\\", "/").endswith("backend/retrain/out-ask/train.json"))

    def test_carregar_amostras_valida_o_formato(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "train.json"
            p.write_text('[{"instruction": "i", "input": "q", "output": "o"}]', encoding="utf-8")
            self.assertEqual(len(th.carregar_amostras(p)), 1)
            for ruim in ("[]", '{"a": 1}', '[{"input": "q", "output": "o"}]', '[{"instruction": "i", "input": "q", "output": ""}]'):
                p.write_text(ruim, encoding="utf-8")
                with self.assertRaises(SystemExit, msg=ruim):
                    th.carregar_amostras(p)


class FormatoDoTexto(unittest.TestCase):
    def test_o_texto_do_treino_e_o_mesmo_que_o_servico_monta(self):
        """montar_textos (treino) == nlu_core.build_training_text / ask_core.build_ask_training_text (serviço e avaliação)."""
        import ask_core
        import nlu_core

        q, saida = "massa molar do H2SO4", '{"intent": "MASSA_MOLAR", "composto": "H2SO4"}'
        self.assertEqual(t.montar_textos(nlu_core.SYSTEM_PROMPT, q, saida)[1], nlu_core.build_training_text(q, saida))
        trechos = [{"id": "t-1", "texto": "A massa molar do ácido sulfúrico é 98,079 g/mol."}]
        usuario = ask_core.build_user_message("qual a massa molar do ácido sulfúrico?", "", trechos)
        self.assertEqual(
            t.montar_textos(ask_core.ASK_SYSTEM_PROMPT, usuario, "A massa molar é 98,079 g/mol [t-1].")[1],
            ask_core.build_ask_training_text("qual a massa molar do ácido sulfúrico?", "", trechos, "A massa molar é 98,079 g/mol [t-1]."),
        )


class Fusao(unittest.TestCase):
    def test_copia_train_meta_e_cartao_do_modelo(self):
        with tempfile.TemporaryDirectory() as d:
            lora, out, card = Path(d) / "lora", Path(d) / "out", Path(d) / "card.md"
            lora.mkdir()
            out.mkdir()
            (lora / "train_meta.json").write_text("{}", encoding="utf-8")
            card.write_text("# cartão", encoding="utf-8")
            self.assertEqual(merge.copiar_documentos(lora, out, card), ["train_meta.json", "README.md"])
            self.assertEqual((out / "README.md").read_text(encoding="utf-8"), "# cartão")
            (lora / "train_meta.json").unlink()
            (Path(d) / "out2").mkdir()
            self.assertEqual(merge.copiar_documentos(lora, Path(d) / "out2", Path(d) / "inexistente.md"), [])

    def test_predefinicoes_batem_com_o_treino(self):
        for alvo in ("nlu", "ask"):
            self.assertEqual(merge.PRESETS[alvo]["base_model"], th.PRESETS[alvo]["base_model"])
            self.assertEqual(merge.PRESETS[alvo]["lora_dir"], th.PRESETS[alvo]["output_dir"] / "final")
            self.assertTrue(merge.PRESETS[alvo]["card"].exists(), merge.PRESETS[alvo]["card"])


if __name__ == "__main__":
    unittest.main()
