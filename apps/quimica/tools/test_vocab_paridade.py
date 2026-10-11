# -*- coding: utf-8 -*-
"""PARIDADE DOS VOCABULÁRIOS (web, Android, modelo/proxy e pipeline).

Desde a unificação (10/10/2026) todos falam o MESMO id de propriedade: o nome do campo do contrato, com unidade
(`pontoFusaoK`, `densidadeKgm3`, `raioAtomicoPm`, `energiaIonizacaoKJmol`, `afinidadeEletronicaKJmol`, `pontoEbulicaoK`).

Este teste lê os quatro lados como fonte (regex/import) e falha se voltarem a divergir:
  - `web/src/quimica/js/propriedades.js` (cliente web) e `app/.../domain/Propriedades.kt` (cliente Android): id == campo;
  - os dois conjuntos de ids são iguais (paridade web × Android);
  - toda `propriedade` do golden compartilhado existe no vocabulário do modelo (`backend/modal/nlu_core.py`);
  - o vocabulário do modelo é o mesmo em `nlu_core.py` e `api/_lib/vocab.js`;
  - `PROPRIEDADE_CLIENTE` (ponte antiga) está vazio nos dois lados.
"""
import json
import re
import sys
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "backend" / "modal"))

import nlu_core  # noqa: E402

ANTIGOS = {"pontoFusao", "pontoEbulicao", "densidade", "raioAtomico", "energiaIonizacao", "afinidadeEletronica"}
# ids que antes divergiam do campo por causa da unidade no nome; agora id == campo nos dois clientes
UNIFICADAS = {k: k for k in ("pontoFusaoK", "pontoEbulicaoK", "densidadeKgm3", "raioAtomicoPm", "energiaIonizacaoKJmol", "afinidadeEletronicaKJmol")}


def _web_ids():
    txt = (RAIZ / "web" / "src" / "quimica" / "js" / "propriedades.js").read_text(encoding="utf-8")
    return [(m.group(1), m.group(2)) for m in re.finditer(r"id: '([^']+)'[\s\S]*?campo: '([^']+)'", txt)]


def _app_ids():
    txt = (RAIZ / "app" / "src" / "main" / "java" / "net" / "saibatudo" / "quimica" / "domain" / "Propriedades.kt").read_text(encoding="utf-8")
    return [(m.group(1), m.group(2)) for m in re.finditer(r'p\("([^"]+)", "[^"]*", "[^"]*", "([^"]+)"', txt)]


class TestVocabParidade(unittest.TestCase):
    def test_cliente_web_id_igual_campo(self):
        d = dict(_web_ids())
        self.assertGreaterEqual(len(d), 20)
        self.assertEqual({k: d.get(k) for k in UNIFICADAS}, UNIFICADAS, "no web, os ids unificados devem ser iguais ao campo")

    def test_cliente_android_id_igual_campo(self):
        d = dict(_app_ids())
        self.assertGreaterEqual(len(d), 8)
        self.assertEqual({k: d.get(k) for k in UNIFICADAS}, UNIFICADAS, "no Android, os ids unificados devem ser iguais ao campo")

    def test_web_e_android_tem_os_mesmos_ids(self):
        web = {i for i, _ in _web_ids()}
        app = {i for i, _ in _app_ids()}
        self.assertTrue(app <= web, f"ids do Android fora do web: {sorted(app - web)}")
        self.assertTrue(ANTIGOS.isdisjoint(web), f"ids antigos no web: {sorted(ANTIGOS & web)}")
        self.assertTrue(ANTIGOS.isdisjoint(app), f"ids antigos no Android: {sorted(ANTIGOS & app)}")

    def test_golden_usa_o_vocabulario_do_modelo(self):
        casos = json.loads((RAIZ / "contracts" / "nlu_golden_cases.json").read_text(encoding="utf-8"))["cases"]
        vocab = set(nlu_core.PROPRIEDADES)
        faltam = sorted({c["propriedade"] for c in casos if c.get("propriedade") and c["propriedade"] not in vocab})
        self.assertEqual(faltam, [], "propriedade do golden fora do vocabulário do modelo")

    def test_modelo_e_proxy_usam_o_mesmo_vocabulario(self):
        self.assertEqual(nlu_core.PROPRIEDADE_CLIENTE, {}, "a ponte antiga deve estar vazia (id unificado)")
        js = (RAIZ / "api" / "_lib" / "vocab.js").read_text(encoding="utf-8")
        m = re.search(r"export const PROPRIEDADES = Object\.freeze\(\[([\s\S]*?)\]\)", js)
        ids_js = set(re.findall(r"'([A-Za-z][A-Za-z0-9]*)'", m.group(1)))
        self.assertEqual(ids_js, set(nlu_core.PROPRIEDADES), "vocabulários do modelo (proxy × nlu_core) diferem")


if __name__ == "__main__":
    unittest.main()
