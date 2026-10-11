# -*- coding: utf-8 -*-
"""Validação do pacote (gates), assinatura ECDSA (chave temporária), regras.json e fontes.json."""
import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import build  # noqa: E402
import fontes as F  # noqa: E402
import regras as R  # noqa: E402
import sign  # noqa: E402
from common import dump_json  # noqa: E402


def elemento(z):
    return {"z": z, "simbolo": f"X{z}", "nome": f"El{z}", "nomeEn": f"El{z}", "periodo": 1, "bloco": "s",
            "categoria": "nao_metal", "massaAtomica": 1.0 + z, "fontes": [{"nome": "PubChem", "url": "u", "licenca": "l", "acessadoEm": "d"}]}


def composto(cid, **extra):
    c = {"cid": cid, "nome": f"C{cid}", "formula": "H2O", "formulaHill": "H2O", "massaMolar": 18.015, "smiles": "O",
         "fontes": [{"nome": "PubChem", "url": "u", "licenca": "l", "acessadoEm": "d"}]}
    c.update(extra)
    return c


def texto(i, **extra):
    t = {"id": f"wikipedia-pt-t{i}", "fonte": "Wikipédia em português", "licenca": "CC BY-SA 4.0", "url": "https://pt.wikipedia.org/",
         "textoOriginal": "x" * 300, "textoPt": "x" * 300, "traducao": "n/a", "fontes": [{"nome": "n", "url": "u", "licenca": "l", "acessadoEm": "d"}]}
    t.update(extra)
    return t


def montar_pacote(raiz: Path, elementos=None, compostos=None, textos=None, extras=None):
    rels = []
    els = elementos if elementos is not None else [elemento(z) for z in range(1, 119)]
    cps = compostos if compostos is not None else [composto(i) for i in range(1, 21)]
    txs = textos if textos is not None else [texto(i) for i in range(5)]
    rels.append(build.escrever_json(raiz, "elementos.json", els))
    rels.append(build.escrever_json(raiz, "compostos/lote-001.json", cps))
    rels.append(build.escrever_json(raiz, "compostos/index.json", {"porCid": {str(c["cid"]): "lote-001" for c in cps}, "nomes": []}))
    rels.append(build.escrever_json(raiz, "constantes.json", {"constantes": [{"id": f"c{i}", "valor": 1.0, "fontes": [{"nome": "n"}]} for i in range(45)]}))
    for rel in ("regras.json", "fontes.json", "ghs_frases.json"):
        rels.append(build.escrever_json(raiz, rel, {}))
    for i, t in enumerate(txs):
        rels.append(build.escrever_json(raiz, f"textos/wikipedia-pt/t{i}.json", t))
    for rel, obj in (extras or {}).items():
        rels.append(build.escrever_json(raiz, rel, obj))
    fontes = F.gerar({"pubchem"}, "2026-10-10")
    return build.montar_manifest(raiz, rels, fontes, {"compostos": len(cps)}, "2026-10-10", datetime(2026, 10, 10, tzinfo=timezone.utc))


MIN = {"compostos": 10, "textos": 3}


class ValidacaoTest(unittest.TestCase):
    def pacote(self, **kw):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        raiz = Path(tmp.name)
        montar_pacote(raiz, **kw)
        return raiz

    def test_pacote_valido(self):
        self.assertEqual(build.validar(self.pacote(), minimos=MIN), [])

    def test_z_repetido_ou_faltando(self):
        els = [elemento(z) for z in range(1, 119)]
        els[5] = elemento(1)
        erros = build.validar(self.pacote(elementos=els), minimos=MIN)
        self.assertTrue(any("Z de 1 a 118" in e for e in erros))

    def test_cid_duplicado_e_smiles_vazio(self):
        cps = [composto(i) for i in range(1, 15)] + [composto(3), composto(99, smiles="")]
        erros = build.validar(self.pacote(compostos=cps), minimos=MIN)
        self.assertTrue(any("CID duplicado 3" in e for e in erros))
        self.assertTrue(any("99" in e and "smiles" in e for e in erros))

    def test_unidades_invalidas(self):
        els = [elemento(z) for z in range(1, 119)]
        els[7]["pontoFusaoK"] = -5
        self.assertTrue(any("pontoFusaoK" in e for e in build.validar(self.pacote(elementos=els), minimos=MIN)))

    def test_checksum_e_arquivo_alterado(self):
        raiz = self.pacote()
        (raiz / "elementos.json").write_text("[]", encoding="utf-8")
        self.assertTrue(any("checksum" in e for e in build.validar(raiz, minimos=MIN)))

    def test_ghs_so_harmonizado_e_icsc_so_link(self):
        cps = [composto(i) for i in range(1, 15)]
        cps[0]["ghs"] = {"pictogramas": ["GHS07"], "frasesH": ["H302"], "fonte": "ECHA C&L Notifications Summary"}
        cps[1]["cas"] = "64-17-5"  # sem icscBuscaUrl
        erros = build.validar(self.pacote(compostos=cps), minimos=MIN)
        self.assertTrue(any("harmonizada" in e for e in erros))
        self.assertTrue(any("icscBuscaUrl" in e for e in erros))

    def test_licenca_nc_e_openstax_barradas(self):
        txs = [texto(0), texto(1, licenca="CC BY-NC-SA 4.0"), texto(2, fonte="OpenStax Chemistry 2e", id="openstax-chem2e-3.1-001"), texto(3)]
        erros = build.validar(self.pacote(textos=txs), minimos=MIN)
        self.assertTrue(any("licença não permitida" in e for e in erros))
        self.assertTrue(any("OpenStax" in e for e in erros))

    def test_icsc_nao_pode_estar_no_pacote(self):
        erros = build.validar(self.pacote(extras={"seguranca/icsc/0044.json": {"icsc": "0044"}}), minimos=MIN)
        self.assertTrue(any("seguranca" in e for e in erros))

    def test_queda_anormal(self):
        erros = build.validar(self.pacote(), previo={"contagens": {"compostos": 1000}}, minimos=MIN)
        self.assertTrue(any("queda anormal" in e for e in erros))


class ManifestoEAssinaturaTest(unittest.TestCase):
    def test_manifesto_segue_o_contrato_e_assinatura_confere(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp) / "pacote"
            m = montar_pacote(raiz)
            for k in ("version", "generatedAt", "schemaVersion", "files", "sources", "licencas", "cliente"):
                self.assertIn(k, m)
            self.assertEqual(m["schemaVersion"], 1)
            self.assertEqual(m["cliente"]["pollIntervalMinutes"], 10080)
            self.assertEqual(m["cliente"]["baseUrl"], "https://saibatudo.net/quimica/data/")
            self.assertFalse(m["cliente"]["ask"]["enabled"])
            self.assertFalse(m["cliente"]["melhoria"]["enabled"])
            self.assertEqual(set(m["files"]["elementos.json"]), {"bytes", "sha256"})
            self.assertNotIn("manifest.json", m["files"])
            priv, pub = Path(tmp) / "k.pem", Path(tmp) / "pub.pem"
            sign.gerar(priv, pub)  # chave temporária
            sign.assinar(raiz / "manifest.json", priv)
            self.assertTrue(sign.verificar(raiz / "manifest.json", pub))
            (raiz / "manifest.json").write_bytes((raiz / "manifest.json").read_bytes() + b" ")
            self.assertFalse(sign.verificar(raiz / "manifest.json", pub))

    def test_troca_atomica_mantem_o_anterior_em_falha(self):
        with tempfile.TemporaryDirectory() as tmp:
            destino, novo = Path(tmp) / "pacote", Path(tmp) / "pacote.novo"
            destino.mkdir()
            (destino / "v.txt").write_text("antigo")
            novo.mkdir()
            (novo / "v.txt").write_text("novo")
            build.trocar_atomicamente(novo, destino)
            self.assertEqual((destino / "v.txt").read_text(), "novo")
            self.assertFalse(novo.exists())
            self.assertFalse((Path(tmp) / "pacote.antigo").exists())


class RegrasEFontesTest(unittest.TestCase):
    def test_regras(self):
        r = R.montar("2026-10-10")
        self.assertEqual(len(r["prefixosSI"]), 24)
        kilo = next(p for p in r["prefixosSI"] if p["simbolo"] == "k")
        self.assertEqual((kilo["expoente"], kilo["fator"]), (3, 1000.0))
        self.assertEqual(r["unidades"]["pressao"]["fatores"]["atm"], 101325)
        self.assertAlmostEqual(r["unidades"]["pressao"]["fatores"]["Torr"] * 760, 101325)
        self.assertEqual(r["unidades"]["energia"]["fatores"]["cal"], 4.184)
        f = r["unidades"]["temperatura"]["afins"]["°F"]
        self.assertAlmostEqual(f["a"] * 212 + f["b"], 373.15)  # 212 °F = 100 °C
        self.assertEqual(r["serieReatividadeMetais"]["ordem"][0], "Li")
        self.assertIn("HCl", [a["formula"] for a in r["acidosFortes"]])
        self.assertIn("NaOH", [b["formula"] for b in r["basesFortes"]])
        for pid, p in r["propriedades"].items():
            self.assertEqual(set(p), {"nome", "unidade", "origem", "escopo", "sinonimos"}, pid)
        self.assertIn("massaMolar", r["propriedades"])
        self.assertTrue(any("Green Book" in f["nome"] for f in r["fontes"]))

    def test_fontes_e_licencas(self):
        todas = F.gerar(None, "2026-10-10")
        ids = {f["id"] for f in todas}
        self.assertNotIn("openstax", ids)
        self.assertFalse(any("OpenStax" in f["nome"] for f in todas))
        for f in todas:
            self.assertEqual(f["acessadoEm"], "2026-10-10")
            self.assertIn(f["treino"], ("sim", "cond.", "nao"))
        self.assertEqual(F.POR_ID["icsc-oit"]["uso"], "link")
        self.assertEqual(F.POR_ID["icsc-oit"]["treino"], "nao")
        self.assertEqual(F.POR_ID["chebi"]["licenca"], "CC BY 4.0")
        self.assertEqual(F.POR_ID["wikipedia-pt"]["licenca"], "CC BY-SA 4.0")
        self.assertEqual(F.POR_ID["wikidata"]["licenca"], "CC0")
        self.assertEqual({lic["licenca"] for lic in F.licencas(todas)} >= {"CC0", "CC BY 4.0", "CC BY-SA 4.0", "domínio público"}, True)


if __name__ == "__main__":
    unittest.main()
