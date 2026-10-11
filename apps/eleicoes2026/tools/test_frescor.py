# -*- coding: utf-8 -*-
"""Testes do avaliador de frescor (tools/frescor.py). Uso: python -m unittest discover -s tools -p "test_*.py" """
import json
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "pipeline"))

import frescor as f  # noqa: E402

AGORA = datetime(2026, 10, 6, 15, 0, tzinfo=timezone.utc)  # 12:00 em Brasília


def run(minutos_atras, conclusao="success", status="completed"):
    return {"status": status, "conclusion": conclusao, "createdAt": (AGORA - timedelta(minutes=minutos_atras)).isoformat().replace("+00:00", "Z")}


MANIFESTO_FRESCO = {"extracaoTse": "06/10/2026 08:30:21", "dataVersion": "x"}  # 3,5 h


class IdadeDaExtracao(unittest.TestCase):
    def test_horario_de_brasilia_e_convertido(self):
        # 04/10 12:30 BRT = 15:30 UTC; agora = 06/10 15:00 UTC => 47,5 h
        self.assertAlmostEqual(f.idade_extracao_tse("04/10/2026 12:30:21", AGORA), 47.5, delta=0.01)

    def test_formatos_invalidos(self):
        for ruim in (None, "", "2026-10-04", "31/02/2026 10:00:00", "abc"):
            self.assertIsNone(f.idade_extracao_tse(ruim, AGORA), ruim)

    def test_sem_segundos(self):
        self.assertIsNotNone(f.idade_extracao_tse("06/10/2026 08:30", AGORA))


class Avaliar(unittest.TestCase):
    def test_tudo_certo(self):
        ok, p = f.avaliar(MANIFESTO_FRESCO, [run(10), run(40), run(70)], AGORA, True)
        self.assertTrue(ok, p)

    def test_o_incidente_de_05_10_tres_falhas_seguidas(self):
        runs = [run(10, "failure"), run(40, "failure"), run(70, "failure"), run(100, "success")]
        ok, p = f.avaliar(MANIFESTO_FRESCO, runs, AGORA, True)
        self.assertFalse(ok)
        self.assertTrue(any("falharam em sequência" in x for x in p), p)

    def test_duas_falhas_ainda_nao_alertam_mas_uma_boa_no_meio_zera(self):
        ok, _ = f.avaliar(MANIFESTO_FRESCO, [run(10, "failure"), run(40, "failure"), run(70)], AGORA, True)
        self.assertTrue(ok)
        ok, _ = f.avaliar(MANIFESTO_FRESCO, [run(10, "failure"), run(40), run(70, "failure"), run(100, "failure")], AGORA, True)
        self.assertTrue(ok)

    def test_execucao_em_andamento_nao_conta(self):
        ok, _ = f.avaliar(MANIFESTO_FRESCO, [run(1, None, "in_progress"), run(30), run(60)], AGORA, True)
        self.assertTrue(ok)

    def test_sem_sucesso_recente(self):
        ok, p = f.avaliar(MANIFESTO_FRESCO, [run(240), run(300)], AGORA, True)
        self.assertFalse(ok)
        self.assertTrue(any("última execução bem-sucedida" in x for x in p), p)

    def test_extracao_do_tse_velha(self):
        ok, p = f.avaliar({"extracaoTse": "04/10/2026 12:30:21", "dataVersion": "v"}, [run(10)], AGORA, True)
        self.assertFalse(ok)
        self.assertTrue(any("extração do TSE" in x for x in p), p)

    def test_noite_e_dia_sem_geracao_do_tse_nao_alertam(self):
        # extração de ontem 10:14 BRT e agora é 12:00 BRT: 25,8 h, ainda dentro do limite de 30 h
        ok, p = f.avaliar({"extracaoTse": "05/10/2026 10:14:11"}, [run(10)], AGORA, True)
        self.assertTrue(ok, p)

    def test_manifesto_inacessivel(self):
        ok, p = f.avaliar(None, [run(10)], AGORA)
        self.assertFalse(ok)
        self.assertIn("inacessível", p[0])

    def test_assinatura_invalida_e_critica(self):
        ok, p = f.avaliar(MANIFESTO_FRESCO, [run(10)], AGORA, False)
        self.assertFalse(ok)
        self.assertTrue(any("INVÁLIDA" in x for x in p), p)

    def test_assinatura_nao_verificada_nao_alerta(self):
        ok, _ = f.avaliar(MANIFESTO_FRESCO, [run(10)], AGORA, None)
        self.assertTrue(ok)

    def test_sem_historico_de_runs_nao_alerta_por_runs(self):
        ok, _ = f.avaliar(MANIFESTO_FRESCO, [], AGORA, True)
        self.assertTrue(ok)


class AssinaturaReal(unittest.TestCase):
    def test_verificar_bytes_do_pacote_do_repositorio(self):
        try:
            from sign import verificar_bytes  # noqa: F401
        except ImportError:
            self.skipTest("ecdsa não instalado")
        d = HERE.parent / "data" / "eleicoes2026"
        pub = HERE.parent / "pipeline" / "data_signing_public.pem"
        manifest = (d / "manifest.json").read_bytes()
        sig = (d / "manifest.sig").read_text(encoding="ascii").strip()
        self.assertTrue(f._verificar_assinatura(manifest, sig, pub))
        self.assertFalse(f._verificar_assinatura(manifest + b" ", sig, pub), "um byte a mais invalida")


if __name__ == "__main__":
    unittest.main()
