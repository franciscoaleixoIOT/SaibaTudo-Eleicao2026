# -*- coding: utf-8 -*-
"""Testes das partes puras da conversão local (sem llama.cpp, sem Modal): formato do meta, catraca e regra de envio."""
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import convert_local as cl  # noqa: E402
import eval_golden as ev  # noqa: E402


def meta(aprovado=True, motivos=()):
    return cl.montar_meta(
        version="v9-teste", fmt="v2", origem="teste", llama_ref="b1", llama_sha="abc", aprovado=aprovado, motivos=list(motivos),
        gate_notes=[], limites={"min_intent_acc": 85.0}, arquivos={"model-Q4_K_M.gguf": {"bytes": 1, "sha256": "x"}},
        segundos=1, criado_em="2026-10-06T00:00:00Z", train_meta={"seed": 2026},
    )


class ConvertLocalTest(unittest.TestCase):
    def test_meta_tem_os_campos_que_o_servico_e_o_promote_leem(self):
        m = meta()
        # nlu_app.py lê current.json (version/format/file); promote_version lê passed/format/file do meta
        for k in ("version", "format", "file", "passed", "reasons", "promoted", "files", "llama_cpp_python", "gate_thresholds"):
            self.assertIn(k, m)
        self.assertEqual(m["file"], "model-Q4_K_M.gguf")
        self.assertIs(m["promoted"], False)
        self.assertIn(m["file"], m["files"])
        self.assertEqual(m["treino"], {"seed": 2026})

    def test_versao_reprovada_nao_vai_ao_volume(self):
        ok, motivo = cl.pode_enviar(meta(False, ["acerto de intenção 70.0% < 85.0%"]))
        self.assertFalse(ok)
        self.assertIn("70.0%", motivo)
        self.assertEqual(cl.pode_enviar(meta(True)), (True, ""))
        # reprovada continua barrada no promote do Modal (sem --force + motivo)
        with self.assertRaises(Exception):
            ev.aplicar_forca(meta(False, ["x"]), False, "", "2026-10-06T00:00:00Z")

    def test_upload_envia_so_o_arquivo_de_producao_meta_e_eval(self):
        cmds = cl.plano_upload("v9-teste", Path("pasta"), "python -m modal")
        self.assertEqual(len(cmds), 3)
        destinos = [c[-1] for c in cmds]
        self.assertEqual(destinos, ["/v9-teste/model-Q4_K_M.gguf", "/v9-teste/meta.json", "/v9-teste/eval.json"])
        for c in cmds:
            self.assertEqual(c[:5], ["python", "-m", "modal", "volume", "put"])
            self.assertEqual(c[5], "saibatudo-nlu-models")
        self.assertFalse(any("Q8" in d or "f16" in d for d in destinos))

    def test_catraca_aceita_os_dois_formatos_de_avaliacao(self):
        medida = {"n_cases": 111, "intent_acc_pct": 78.4}
        do_volume = {"Q4_K_M": {"constrained": medida, "unconstrained": None}, "Q8_0": {"constrained": medida}}
        da_pasta_eval = {"passed": False, "reasons": [], "constrained": medida, "unconstrained": None}
        for bruto in (do_volume, da_pasta_eval):
            prev, aviso = ev.escolher_previous({"version": "v2.1", "format": "v2"}, cl.normalizar_previous(bruto), "v2", 111)
            self.assertIsNone(aviso)
            self.assertEqual(prev["intent_acc_pct"], 78.4)
        self.assertIsNone(cl.normalizar_previous(None))
        self.assertIsNone(cl.normalizar_previous({"qualquer": 1}))
        # contrato diferente (outro nº de casos): a catraca é ignorada, com aviso
        prev, aviso = ev.escolher_previous({"version": "v2.1", "format": "v2"}, cl.normalizar_previous(da_pasta_eval), "v2", 93)
        self.assertIsNone(prev)
        self.assertIn("catraca ignorada", aviso)

    def test_catraca_bloqueia_modelo_que_regride(self):
        base = {"json_valid_pct": 100.0, "intent_acc_pct": 76.0}
        ok, motivos = ev.check_gates(base, None, None, previous={"intent_acc_pct": 78.4}, min_intent_acc=0)
        self.assertFalse(ok)
        self.assertTrue(any("caiu" in m for m in motivos))


if __name__ == "__main__":
    unittest.main()
