# -*- coding: utf-8 -*-
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import vercel_cota  # noqa: E402


class ResumoTest(unittest.TestCase):
    def test_le_os_cabecalhos_de_limite(self):
        restantes, texto = vercel_cota.resumo({'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': '123',
                                               'x-ratelimit-reset': '1791766938'}, 1791766938 - 3600)
        self.assertEqual(restantes, 123)
        self.assertIn('123 de 5000', texto)
        self.assertIn('1.0 h', texto)

    def test_sem_cabecalhos_conta_como_zero(self):
        restantes, _ = vercel_cota.resumo({}, 0)
        self.assertEqual(restantes, 0)


class MainTest(unittest.TestCase):
    def _rodar(self, status, restantes, minimo):
        cab = {'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': str(restantes), 'x-ratelimit-reset': '0'}
        with mock.patch.object(vercel_cota, 'sondar', return_value=(status, cab)), mock.patch('builtins.print'):
            return vercel_cota.main(['--minimo', str(minimo)])

    def test_bloqueia_deploy_quando_nao_cabe(self):
        self.assertEqual(self._rodar(200, 123, 1060), 1)

    def test_libera_quando_cabe(self):
        self.assertEqual(self._rodar(200, 4800, 1060), 0)

    def test_429_sempre_bloqueia(self):
        self.assertEqual(self._rodar(429, 0, 0), 1)


if __name__ == '__main__':
    unittest.main()
