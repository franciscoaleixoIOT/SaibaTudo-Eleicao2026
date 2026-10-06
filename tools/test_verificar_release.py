# -*- coding: utf-8 -*-
"""Testes do verificador de release (tools/verificar_release.py). O teste com o APK real roda quando app/build/outputs/apk/release/app-release.apk existe."""
import struct
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import verificar_release as v  # noqa: E402

APK = HERE.parent / "app" / "build" / "outputs" / "apk" / "release" / "app-release.apk"


def dex_minimo(classes):
    """DEX mínimo e válido para o leitor: header + string_ids + strings + type_ids + class_defs (sem código)."""
    strings = sorted(classes)
    dados = b"".join(bytes([len(s)]) + s.encode() + b"\x00" for s in strings)
    str_off = 0x70
    dados_off = str_off + 4 * len(strings)
    offs, pos = [], dados_off
    for s in strings:
        offs.append(pos)
        pos += 1 + len(s) + 1
    tipo_off = pos
    cls_off = tipo_off + 4 * len(strings)
    header = bytearray(0x70)
    header[0:8] = b"dex\n035\x00"
    struct.pack_into("<IIII", header, 0x38, len(strings), str_off, len(strings), tipo_off)
    struct.pack_into("<II", header, 0x60, len(strings), cls_off)
    corpo = b"".join(struct.pack("<I", o) for o in offs) + dados
    tipos = b"".join(struct.pack("<I", i) for i in range(len(strings)))
    defs = b"".join(struct.pack("<I", i) + b"\x00" * 28 for i in range(len(strings)))
    return bytes(header) + corpo + tipos + defs


class Leitor(unittest.TestCase):
    def test_lista_as_classes_definidas(self):
        cls = {"Lnet/exemplo/A;", "Lnet/exemplo/B$C;"}
        self.assertEqual(v.classes_definidas(dex_minimo(cls)), cls)

    def test_nao_dex_e_recusado(self):
        with self.assertRaises(ValueError):
            v.classes_definidas(b"isto nao e um dex" * 10)

    def test_uleb128(self):
        self.assertEqual(v._uleb128(bytes([0x05]), 0), (5, 1))
        self.assertEqual(v._uleb128(bytes([0xE5, 0x8E, 0x26]), 0), (624485, 3))


class Verificacao(unittest.TestCase):
    def _apk(self, classes, tamanho_extra=0):
        d = tempfile.mkdtemp()
        p = Path(d) / "app.apk"
        with zipfile.ZipFile(p, "w", zipfile.ZIP_STORED) as z:
            z.writestr("classes.dex", dex_minimo(classes))
            if tamanho_extra:
                z.writestr("res/raw/enchimento.bin", b"\x00" * tamanho_extra)
        return p

    def test_apk_com_todas_as_obrigatorias_passa(self):
        p = self._apk(set(v.OBRIGATORIAS), tamanho_extra=4 * 1024 * 1024)
        ok, problemas = v.verificar(p)
        self.assertTrue(ok, problemas)

    def test_classe_removida_pelo_r8_e_apontada_pelo_nome(self):
        faltando = set(v.OBRIGATORIAS) - {"Landroidx/work/impl/WorkDatabase_Impl;"}
        ok, problemas = v.verificar(self._apk(faltando, tamanho_extra=4 * 1024 * 1024))
        self.assertFalse(ok)
        self.assertEqual(len(problemas), 1)
        self.assertIn("WorkDatabase_Impl", problemas[0])
        self.assertIn("AUSENTE", problemas[0])

    def test_tamanho_fora_do_esperado(self):
        ok, problemas = v.verificar(self._apk(set(v.OBRIGATORIAS)))  # minúsculo
        self.assertFalse(ok)
        self.assertTrue(any("tamanho" in p for p in problemas), problemas)

    def test_apk_sem_dex(self):
        d = tempfile.mkdtemp()
        p = Path(d) / "vazio.apk"
        with zipfile.ZipFile(p, "w") as z:
            z.writestr("AndroidManifest.xml", b"x")
        with self.assertRaises(ValueError):
            v.classes_do_apk(p)

    def test_cli_codigos_de_saida(self):
        self.assertEqual(v.main([]), 2)
        self.assertEqual(v.main(["/nao/existe.apk"]), 2)
        self.assertEqual(v.main([str(self._apk(set(v.OBRIGATORIAS), tamanho_extra=4 * 1024 * 1024))]), 0)
        self.assertEqual(v.main([str(self._apk({"Lx/Y;"}, tamanho_extra=4 * 1024 * 1024))]), 1)


@unittest.skipUnless(APK.exists(), "APK de release não gerado (rode ./gradlew assembleRelease)")
class ApkReal(unittest.TestCase):
    def test_o_release_real_tem_as_classes_que_ja_quebraram_o_app(self):
        ok, problemas = v.verificar(APK)
        self.assertTrue(ok, problemas)

    def test_o_dex_real_define_milhares_de_classes(self):
        self.assertGreater(len(v.classes_do_apk(APK)), 1000)


if __name__ == "__main__":
    unittest.main()
