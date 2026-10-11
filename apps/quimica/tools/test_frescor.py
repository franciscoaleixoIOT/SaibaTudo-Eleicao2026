# -*- coding: utf-8 -*-
"""Testes do avaliador de frescor (tools/frescor.py), versão do pacote SEMANAL de química."""
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "pipeline"))

import frescor as f  # noqa: E402

AGORA = datetime(2026, 10, 12, 12, 0, tzinfo=timezone.utc)


def run(horas_atras, conclusao="success", status="completed"):
    return {"status": status, "conclusion": conclusao, "createdAt": (AGORA - timedelta(hours=horas_atras)).isoformat().replace("+00:00", "Z")}


def manifesto(dias):
    return {"generatedAt": (AGORA - timedelta(days=dias)).isoformat().replace("+00:00", "Z"), "version": "v"}


class Idade(unittest.TestCase):
    def test_iso_com_z_e_sem_fuso(self):
        self.assertAlmostEqual(f.idade_pacote("2026-10-10T12:00:00Z", AGORA), 48.0, delta=0.01)
        self.assertAlmostEqual(f.idade_pacote("2026-10-10T12:00:00", AGORA), 48.0, delta=0.01)

    def test_invalidos(self):
        for ruim in (None, "", "ontem", 12):
            self.assertIsNone(f.idade_pacote(ruim, AGORA), ruim)


class Avaliar(unittest.TestCase):
    def test_tudo_certo_pacote_de_3_dias(self):
        ok, problemas = f.avaliar(manifesto(3), [run(72)], AGORA, True)
        self.assertTrue(ok, problemas)

    def test_pacote_de_11_dias_alerta(self):
        ok, problemas = f.avaliar(manifesto(11), [run(24)], AGORA, True)
        self.assertFalse(ok)
        self.assertTrue(any("dias" in p for p in problemas))

    def test_duas_falhas_seguidas_alertam_semanal(self):
        ok, problemas = f.avaliar(manifesto(1), [run(1, "failure"), run(168, "failure"), run(336)], AGORA, True)
        self.assertFalse(ok)
        self.assertTrue(any("sequência" in p for p in problemas))

    def test_uma_falha_nao_alerta(self):
        ok, _ = f.avaliar(manifesto(1), [run(1, "failure"), run(168)], AGORA, True)
        self.assertTrue(ok)

    def test_sem_sucesso_ha_11_dias(self):
        ok, problemas = f.avaliar(manifesto(1), [run(264)], AGORA, True)
        self.assertFalse(ok)
        self.assertTrue(any("bem-sucedida" in p for p in problemas))

    def test_manifesto_inacessivel_e_assinatura_invalida(self):
        self.assertFalse(f.avaliar(None, [run(1)], AGORA)[0])
        ok, problemas = f.avaliar(manifesto(1), [run(1)], AGORA, False)
        self.assertFalse(ok)
        self.assertTrue(any("INVÁLIDA" in p for p in problemas))

    def test_assinatura_nao_verificada_e_sem_runs_nao_alertam(self):
        self.assertTrue(f.avaliar(manifesto(1), [], AGORA, None)[0])

    def test_limite_configuravel(self):
        self.assertTrue(f.avaliar(manifesto(11), [run(1)], AGORA, True, max_idade_h=24 * 30)[0])


if __name__ == "__main__":
    unittest.main()
