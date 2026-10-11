# -*- coding: utf-8 -*-
"""Testes das partes puras de convert_local.py e promover.py (nomes de versão, meta.json, plano de upload e de promoção). Não converte
nada, não chama o Modal."""
import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import convert_local as conv  # noqa: E402
import promover  # noqa: E402


class TestVersao(unittest.TestCase):
    def test_nomes_validos_e_prefixo_do_alvo(self):
        self.assertEqual(conv.validar_versao("nlu-v1-20261101", "nlu"), "nlu-v1-20261101")
        self.assertEqual(conv.validar_versao("ask-v12-20270105", "ask"), "ask-v12-20270105")
        for ruim, alvo in (("nlu-v1-20261101", "ask"), ("ask-v1-20261101", "nlu"), ("v2.3-20261007", "nlu"), ("nlu-v1-2026", "nlu"), ("nlu-1-20261101", "nlu"), ("", "nlu")):
            with self.assertRaises(SystemExit, msg=ruim):
                conv.validar_versao(ruim, alvo)


class TestMeta(unittest.TestCase):
    def meta(self, aprovado=True, target="nlu"):
        return conv.montar_meta(
            target=target, version=f"{target}-v1-20261101", origem="dataset X, 3 épocas", llama_ref="b11355", llama_sha="abc", aprovado=aprovado,
            motivos=[] if aprovado else ["intenção 80% < 85%"], gate_notes=[], limites={"min_intent_acc": 85.0}, segundos=1234,
            criado_em="2026-11-01T12:00:00Z", train_meta={"semente": 2026}, arquivos={"model-Q4_K_M.gguf": {"bytes": 10, "sha256": "ff"}},
        )

    def test_campos_que_o_servico_e_a_promocao_leem(self):
        m = self.meta()
        self.assertEqual((m["version"], m["file"], m["format"], m["passed"], m["promoted"]), ("nlu-v1-20261101", "model-Q4_K_M.gguf", "v1", True, False))
        self.assertEqual(self.meta(target="ask")["format"], "ask-v1")
        self.assertEqual(m["arquivos_no_volume"], ["model-Q4_K_M.gguf", "meta.json", "eval.json"])

    def test_so_versao_aprovada_vai_ao_volume(self):
        self.assertEqual(conv.pode_enviar(self.meta()), (True, ""))
        ok, motivo = conv.pode_enviar(self.meta(aprovado=False))
        self.assertFalse(ok)
        self.assertIn("intenção 80%", motivo)

    def test_plano_de_upload_envia_so_o_necessario_e_sem_o_f16(self):
        cmds = conv.plano_upload("nlu-v1-20261101", Path("/x/pasta"), "python -m modal")
        self.assertEqual(len(cmds), 3)
        destinos = [c[-1] for c in cmds]
        self.assertEqual(destinos, ["/nlu-v1-20261101/model-Q4_K_M.gguf", "/nlu-v1-20261101/meta.json", "/nlu-v1-20261101/eval.json"])
        for c in cmds:
            self.assertEqual(c[:5], ["python", "-m", "modal", "volume", "put"])
            self.assertEqual(c[5], "saibatudo-quimica-models")
        self.assertFalse(any("f16" in " ".join(c) or "Q8_0" in " ".join(c) for c in cmds))

    def test_normalizar_previous_aceita_os_dois_formatos(self):
        volume = {"Q4_K_M": {"constrained": {"n_cases": 1}}}
        self.assertIs(conv.normalizar_previous(volume), volume)
        r = conv.normalizar_previous({"passed": True, "constrained": {"n_cases": 2}, "unconstrained": None})
        self.assertEqual(r["Q4_K_M"]["constrained"]["n_cases"], 2)
        self.assertIsNone(conv.normalizar_previous({"x": 1}))
        self.assertIsNone(conv.normalizar_previous(None))

    def test_o_volume_e_o_do_projeto_de_quimica(self):
        self.assertEqual(conv.VOLUME_NAME, "saibatudo-quimica-models")


class TestPromocao(unittest.TestCase):
    def test_ponteiro_tem_versao_arquivo_e_sha(self):
        meta = {"version": "ask-v1-20261101", "target": "ask", "file": "model-Q4_K_M.gguf", "format": "ask-v1", "files": {"model-Q4_K_M.gguf": {"sha256": "abc"}}}
        p = promover.montar_ponteiro(meta, "2026-11-01T00:00:00Z")
        self.assertEqual((p["version"], p["file"], p["sha256"], p["target"]), ("ask-v1-20261101", "model-Q4_K_M.gguf", "abc", "ask"))

    def test_cada_alvo_tem_o_seu_ponteiro(self):
        self.assertEqual(promover.POINTERS, {"nlu": "current.json", "ask": "ask-current.json"})
        cmd = promover.plano_promocao("ask", Path("/tmp/x.json"), "python -m modal")
        self.assertEqual(cmd[-1], "/ask-current.json")
        self.assertIn("--force", cmd)
        self.assertEqual(promover.plano_promocao("nlu", Path("/tmp/x.json"))[-1], "/current.json")

    def test_rollback_valida_o_nome(self):
        p = promover.ponteiro_de_rollback("nlu-v1-20260901", "nlu")
        self.assertEqual((p["version"], p["file"]), ("nlu-v1-20260901", "model-Q4_K_M.gguf"))
        with self.assertRaises(SystemExit):
            promover.ponteiro_de_rollback("ask-v1-20260901", "nlu")

    def run_cli(self, meta, *args):
        with tempfile.TemporaryDirectory() as d:
            pasta = Path(d) / meta["version"]
            pasta.mkdir()
            (pasta / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
            with mock.patch("subprocess.run") as run, contextlib.redirect_stdout(io.StringIO()):
                try:
                    rc = promover.main(["--version", meta["version"], "--local-root", d, "--modal-cmd", "modal", *args])
                except SystemExit as e:
                    return e.code, run, json.loads((pasta / "meta.json").read_text(encoding="utf-8"))
                return rc, run, json.loads((pasta / "meta.json").read_text(encoding="utf-8"))

    def test_versao_reprovada_nao_e_promovida_sem_force_e_motivo(self):
        meta = {"version": "nlu-v1-20261101", "target": "nlu", "passed": False, "reasons": ["x"], "file": "model-Q4_K_M.gguf"}
        rc, run, _ = self.run_cli(meta)
        self.assertIn("NÃO passou no gate", str(rc))
        run.assert_not_called()
        rc, run, _ = self.run_cli(meta, "--force")
        self.assertIn("--reason", str(rc))
        run.assert_not_called()
        rc, run, gravado = self.run_cli(meta, "--force", "--reason", "rollback urgente")
        self.assertEqual(rc, 0)
        run.assert_called_once()
        self.assertEqual(gravado["forced"][0]["reason"], "rollback urgente")
        self.assertTrue(gravado["promoted"])

    def test_versao_aprovada_promove_e_grava_promoted(self):
        meta = {"version": "ask-v1-20261101", "target": "ask", "passed": True, "file": "model-Q4_K_M.gguf", "files": {}}
        rc, run, gravado = self.run_cli(meta)
        self.assertEqual(rc, 0)
        self.assertEqual(run.call_args.args[0][-1], "/ask-current.json")
        self.assertTrue(gravado["promoted"])

    def test_dry_run_nao_chama_o_modal(self):
        meta = {"version": "nlu-v1-20261101", "target": "nlu", "passed": True, "file": "model-Q4_K_M.gguf"}
        rc, run, gravado = self.run_cli(meta, "--dry-run")
        self.assertEqual(rc, 0)
        run.assert_not_called()
        self.assertFalse(gravado.get("promoted", False))


if __name__ == "__main__":
    unittest.main(verbosity=2)
