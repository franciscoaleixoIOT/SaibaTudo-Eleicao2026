# -*- coding: utf-8 -*-
"""Validação do diretório de fontes oficiais (pipeline/static/fontes_oficiais.json).

O arquivo é ESTÁTICO e copiado byte a byte para o pacote assinado (pipeline/build.py), ou seja: um link
morto entra no app, no site e no pacote assinado sem que nada reclame. Estes testes são a rede de proteção
offline (formato, esquema, coerência com as constantes do app). A alcançabilidade real exige rede e esbarra
no WAF do TSE/TREs (403 para clientes que não são navegador) — por isso não é testada aqui.

Rodar: python -m unittest discover -s pipeline/tests
"""
import json
import re
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
STATIC = REPO / "pipeline" / "static" / "fontes_oficiais.json"
PACOTE = REPO / "data" / "eleicoes2026" / "fontes.json"
APP_CONSTANTS = REPO / "app" / "src" / "main" / "java" / "net" / "saibatudo" / "eleicoes2026" / "core" / "constants" / "AppConstants.kt"
MODEL_JS = REPO / "web" / "src" / "eleicoes2026" / "js" / "model.js"

# TREs sem seções mapeadas. O cliente exibe a URL principal do tribunal nesses casos.
# CE é uma lacuna conhecida: as páginas do TRE-CE respondem 403/404 para clientes automáticos (Akamai).
SECOES_VAZIAS_PERMITIDAS = {"CE"}

# URLs que já morreram (verificado em 02/10/2026) e não podem voltar.
URLS_MORTAS = (
    "www12.senado.leg.br/noticias/temas/eleicoes",
    "www.mpf.mp.br/pgr/eleitoral",
    "gov.br/agu/pt-br/acesso-a-informacao/boletins-destaques/condutas-vedadas",
)

UFs = {
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
    "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
}


def carregar(caminho: Path):
    return json.loads(caminho.read_text(encoding="utf-8"))


class TesteEstrutura(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fontes = carregar(STATIC)

    def test_chaves_de_topo(self):
        self.assertEqual(set(self.fontes), {"nota", "sistemasNacionais", "tres", "orgaos"})

    def test_27_tres_uma_por_uf(self):
        ufs = [t["uf"] for t in self.fontes["tres"]]
        self.assertEqual(len(ufs), 27)
        self.assertEqual(set(ufs), UFs)
        for t in self.fontes["tres"]:
            self.assertEqual(t["estado"] and len(t["estado"]) > 2, True, t["uf"])
            self.assertTrue(t["tribunal"], t["uf"])
            self.assertEqual(t["url"], f"https://tre-{t['uf'].lower()}.jus.br/eleicoes")
            for s in t["secoes"]:
                self.assertEqual(set(s), {"titulo", "url"}, s)
                self.assertTrue(s["titulo"].strip())

    def test_secoes_vazias_so_onde_documentado(self):
        vazias = {t["uf"] for t in self.fontes["tres"] if not t["secoes"]}
        self.assertLessEqual(vazias, SECOES_VAZIAS_PERMITIDAS, f"TREs sem seções: {sorted(vazias)}")

    def test_orgaos_e_sistemas_com_campos_completos(self):
        self.assertGreaterEqual(len(self.fontes["orgaos"]), 10)
        for o in self.fontes["orgaos"]:
            self.assertEqual(set(o), {"orgao", "url", "utilidade"})
            self.assertTrue(o["orgao"].strip() and o["utilidade"].strip())
        self.assertGreaterEqual(len(self.fontes["sistemasNacionais"]), 6)
        for s in self.fontes["sistemasNacionais"]:
            self.assertEqual(set(s), {"nome", "url", "utilidade"})
            self.assertTrue(s["nome"].strip() and s["utilidade"].strip())


class TesteQualidadeDasUrls(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        f = carregar(STATIC)
        cls.urls = (
            [s["url"] for s in f["sistemasNacionais"]]
            + [u for t in f["tres"] for u in [t["url"], *(s["url"] for s in t["secoes"])]]
            + [o["url"] for o in f["orgaos"]]
        )

    def test_todas_https(self):
        for u in self.urls:
            self.assertTrue(u.startswith("https://"), u)

    def test_sem_artefatos_de_scraping_ou_sessao(self):
        for u in self.urls:
            self.assertNotIn("copy_of_", u, u)
            self.assertNotIn("?session=", u, u)
            self.assertNotIn("session=", u, u)
            self.assertFalse(u.endswith("/."), u)
            self.assertFalse(u.endswith("."), u)
            self.assertNotRegex(u, r"\s", u)

    def test_urls_mortas_nao_voltaram(self):
        for morta in URLS_MORTAS:
            self.assertFalse(any(morta in u for u in self.urls), morta)

    def test_secao_com_titulo_generico_nao_aponta_para_outro_orgao(self):
        """Defeito real encontrado em 02/10/2026: um TRE com seção "Eleições 2026" apontando para o portal
        do TSE — o eleitor acha que é página do tribunal. Seções que levam a outro órgão precisam dizer isso.
        (Não exigimos "TSE" em todo link ao TSE: é normal um TRE apontar para sistemas nacionais, ex.
        pesquisas eleitorais; o problema é o título genérico que se passa por conteúdo do próprio TRE.)"""
        f = carregar(STATIC)
        genericos = {"eleições 2026", "eleicoes 2026"}
        for t in f["tres"]:
            for s in t["secoes"]:
                if s["titulo"].strip().lower() in genericos and "tse.jus.br" in s["url"]:
                    self.fail(f"{t['uf']}: seção '{s['titulo']}' aponta para o TSE sem indicar: {s['url']}")


class TesteCoerenciaComOsClientes(unittest.TestCase):
    """O app e o site têm URLs oficiais hardcoded (fallback quando o pacote não carrega). Se elas divergem
    do diretório, o eleitor vê listas diferentes no diálogo e na resposta da IA."""

    @classmethod
    def setUpClass(cls):
        f = carregar(STATIC)
        cls.urls = {s["url"].rstrip("/") for s in f["sistemasNacionais"]}
        cls.urls |= {o["url"].rstrip("/") for o in f["orgaos"]}

    def _urls_hardcoded(self, caminho: Path):
        """URLs literais em aspas simples ou duplas (Kotlin usa ", o site usa '). Template strings
        (ex.: `https://tre-${uf}.jus.br/...`) não são URLs literais e ficam de fora."""
        texto = caminho.read_text(encoding="utf-8")
        urls = re.findall(r"""['"](https://[^'"\s]+)['"]""", texto)
        return {u.rstrip("/") for u in urls if "${" not in u and "{" not in u}

    def test_sistemas_nacionais_cobrem_as_constantes_do_app(self):
        esperadas = {
            "https://divulgacandcontas.tse.jus.br/divulga/#",
            "https://autoatendimento.tse.jus.br",
            "https://resultados.tse.jus.br",
            "https://dadosabertos.tse.jus.br",
            "https://www.tse.jus.br/eleicoes/eleicoes-2026",
        }
        self.assertLessEqual(esperadas, self.urls, f"faltam no diretório: {sorted(esperadas - self.urls)}")

    def test_constantes_do_app_existem_no_diretorio(self):
        if not APP_CONSTANTS.exists():
            self.skipTest("AppConstants.kt ausente")
        hardcoded = {u for u in self._urls_hardcoded(APP_CONSTANTS) if "tse.jus.br" in u or "jus.br" in u}
        # o fallback do app pode citar o repositório/privacidade; só cobramos os sistemas oficiais
        oficiais = {u for u in hardcoded if "saibatudo" not in u}
        self.assertLessEqual(oficiais, self.urls, f"hardcoded fora do diretório: {sorted(oficiais - self.urls)}")

    def test_site_e_app_usam_as_mesmas_urls(self):
        if not MODEL_JS.exists():
            self.skipTest("model.js ausente")
        do_app = {u for u in self._urls_hardcoded(APP_CONSTANTS) if "tse.jus.br" in u}
        do_site = {u for u in self._urls_hardcoded(MODEL_JS) if "tse.jus.br" in u}
        self.assertEqual(do_app, do_site, "AppConstants.kt e model.js divergem")


class TestePacoteAssinado(unittest.TestCase):
    """O pacote em data/eleicoes2026 é a cópia assinada que vai no APK e no site. Ele é regenerado pelo
    pipeline (fetch -> build -> sign) e pelo data_refresh no CI, então pode estar ATRÁS do arquivo estático
    por algumas horas; aqui só cobramos esquema e https, nunca o conteúdo já corrigido no estático."""

    def test_fontes_do_pacote_tem_o_mesmo_esquema(self):
        if not PACOTE.exists():
            self.skipTest("pacote não gerado")
        f = carregar(PACOTE)
        self.assertEqual(set(f), {"nota", "sistemasNacionais", "tres", "orgaos"})
        self.assertEqual(len(f["tres"]), 27)
        for t in f["tres"]:
            self.assertTrue(t["url"].startswith("https://"), t["url"])
            for s in t["secoes"]:
                self.assertTrue(s["url"].startswith("https://") or s["url"].startswith("http://"), s["url"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
