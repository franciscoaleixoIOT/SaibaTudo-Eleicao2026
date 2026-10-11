# -*- coding: utf-8 -*-
"""Troca atômica do pacote de dados: uma falha no build ou na validação nunca pode deixar o pacote publicado quebrado."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import build  # noqa: E402


def _pacote(pasta: Path, versao: str):
    pasta.mkdir(parents=True, exist_ok=True)
    (pasta / "manifest.json").write_text(json.dumps({"dataVersion": versao, "contagens": {"candidaturas": 20000}}), encoding="utf-8")
    (pasta / "dado.txt").write_text(versao, encoding="utf-8")


class TrocaAtomica(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self._tmp.name)
        self.out = self.raiz / "eleicoes2026"

    def tearDown(self):
        self._tmp.cleanup()

    def test_troca_substitui_o_antigo_e_nao_deixa_lixo(self):
        _pacote(self.out, "antigo")
        _pacote(self.raiz / "eleicoes2026.novo", "novo")
        build.trocar_atomicamente(self.raiz / "eleicoes2026.novo", self.out)
        self.assertEqual((self.out / "dado.txt").read_text(encoding="utf-8"), "novo")
        self.assertEqual(sorted(p.name for p in self.raiz.iterdir()), ["eleicoes2026"])

    def test_troca_sem_pacote_anterior(self):
        _pacote(self.raiz / "eleicoes2026.novo", "novo")
        build.trocar_atomicamente(self.raiz / "eleicoes2026.novo", self.out)
        self.assertEqual((self.out / "dado.txt").read_text(encoding="utf-8"), "novo")

    def test_se_a_entrada_do_novo_falha_o_antigo_e_restaurado(self):
        _pacote(self.out, "antigo")
        _pacote(self.raiz / "eleicoes2026.novo", "novo")
        real = build.os.replace
        chamadas = []

        def quebra_na_segunda(origem, destino):
            chamadas.append((Path(origem).name, Path(destino).name))
            if len(chamadas) == 2:  # a entrada do novo
                raise OSError("disco cheio")
            return real(origem, destino)

        with mock.patch.object(build.os, "replace", side_effect=quebra_na_segunda):
            with self.assertRaises(OSError):
                build.trocar_atomicamente(self.raiz / "eleicoes2026.novo", self.out)
        self.assertEqual((self.out / "dado.txt").read_text(encoding="utf-8"), "antigo", "o pacote publicado continua íntegro")


class ConstruirAtomico(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self._tmp.name)
        self.out = self.raiz / "eleicoes2026"
        _pacote(self.out, "antigo")

    def tearDown(self):
        self._tmp.cleanup()

    def _build_fake(self, versao):
        def fake(cache, out, incluir_fotos=True, assinar_com=None, hoje=None):
            _pacote(out, versao)
            return {"dataVersion": versao}
        return fake

    def test_sucesso_troca_o_pacote(self):
        with mock.patch.object(build, "build", self._build_fake("novo")), mock.patch.object(build, "validar", return_value=[]):
            manifest, erros = build.construir_atomico(self.raiz / "cache", self.out)
        self.assertEqual(erros, [])
        self.assertEqual(manifest["dataVersion"], "novo")
        self.assertEqual((self.out / "dado.txt").read_text(encoding="utf-8"), "novo")
        self.assertFalse((self.raiz / "eleicoes2026.novo").exists())

    def test_validacao_reprovada_mantem_o_pacote_anterior(self):
        with mock.patch.object(build, "build", self._build_fake("novo")), \
                mock.patch.object(build, "validar", return_value=["candidaturas insuficientes: 10"]):
            manifest, erros = build.construir_atomico(self.raiz / "cache", self.out)
        self.assertIsNone(manifest)
        self.assertEqual(erros, ["candidaturas insuficientes: 10"])
        self.assertEqual((self.out / "dado.txt").read_text(encoding="utf-8"), "antigo")
        self.assertFalse((self.raiz / "eleicoes2026.novo").exists(), "rascunho removido")

    def test_falha_no_meio_do_build_mantem_o_pacote_anterior(self):
        def quebra(cache, out, incluir_fotos=True, assinar_com=None, hoje=None):
            _pacote(out, "parcial")
            raise RuntimeError("TSE fora do ar")

        with mock.patch.object(build, "build", quebra):
            with self.assertRaises(RuntimeError):
                build.construir_atomico(self.raiz / "cache", self.out)
        self.assertEqual((self.out / "dado.txt").read_text(encoding="utf-8"), "antigo")
        self.assertFalse((self.raiz / "eleicoes2026.novo").exists())

    def test_o_pacote_anterior_alimenta_a_checagem_de_queda_anormal(self):
        vistos = []

        def validar(novo, previo):
            vistos.append(previo)
            return []

        with mock.patch.object(build, "build", self._build_fake("novo")), mock.patch.object(build, "validar", side_effect=validar):
            build.construir_atomico(self.raiz / "cache", self.out)
        self.assertEqual(vistos[0]["contagens"]["candidaturas"], 20000)


if __name__ == "__main__":
    unittest.main()
