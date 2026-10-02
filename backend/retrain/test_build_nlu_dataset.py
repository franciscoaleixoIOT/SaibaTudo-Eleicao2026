# -*- coding: utf-8 -*-
"""Testes (unittest) do gerador de dataset do NLU. Usam um pacote de dados SINTÉTICO (determinístico) e os casos
reais de contracts/nlu_golden_cases.json. Rodar: python -m unittest discover -s backend/retrain -p "test_*.py" -v"""
import contextlib
import io
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(REPO / "backend" / "modal"))

import build_nlu_dataset as b  # noqa: E402
import nlu_core as core  # noqa: E402
import test_nlu_core as tnc  # noqa: E402  (conversor GBNF->regex para checar a gramática v2)

GOLDEN = REPO / "contracts" / "nlu_golden_cases.json"

NOMES = [
    ("MARIA DAS DORES", "GOVERNADOR", "SP", "PT"), ("JOSÉ  CARLOS SILVA", "SENADOR", "MG", "PL"),
    ("ANA PAULA LIMA", "DEPUTADO_FEDERAL", "SP", "PSD"), ("PEDRO ÁLVARES", "DEPUTADO_ESTADUAL", "BA", "NOVO"),
    ("LUIZ INÁCIO", "PRESIDENTE", "BR", "PT"), ("CARLA ZAMBELLI", "DEPUTADO_DISTRITAL", "DF", "PCDOB"),
    ("JOÃOZINHO DA FARMÁCIA", "GOVERNADOR", "RJ", "UNIÃO"), ("DEPUTADO FULANO", "DEPUTADO_FEDERAL", "SP", "PT"),
    ("CANDIDATO 123", "SENADOR", "SP", "PT"), ("PR", "SENADOR", "SP", "PT"),
]


def _pacote(dest: Path, n_extra=40):
    (dest / "candidatos").mkdir(parents=True)
    (dest / "manifest.json").write_text(json.dumps({"dataVersion": "teste-1", "schemaVersion": 1}), encoding="utf-8")
    por_uf = {}
    todos = list(NOMES) + [(f"FULANO{chr(65 + i % 26)}{chr(65 + (i * 7) % 26)} DE TAL", "DEPUTADO_ESTADUAL", ["SP", "MG", "BA", "RS"][i % 4], ["PT", "PL", "PSD", "NOVO", "MDB"][i % 5]) for i in range(n_extra)]
    for nome, cargo, uf, partido in todos:
        por_uf.setdefault(uf, []).append({"nomeUrna": nome, "cargo": cargo, "estadoUf": uf, "partido": partido})
    for uf, lista in por_uf.items():
        (dest / "candidatos" / f"{uf}.json").write_text(json.dumps(lista, ensure_ascii=False), encoding="utf-8")


class Base(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="nlu_ds_"))
        cls.data = cls.tmp / "data"
        _pacote(cls.data)
        cls.out = cls.tmp / "out"
        with contextlib.redirect_stdout(io.StringIO()):
            b.main(["--data", str(cls.data), "--golden", str(GOLDEN), "--out", str(cls.out), "--scale", "0.3", "--seed", "7"])
        cls.train = [json.loads(x) for x in (cls.out / "train.jsonl").read_text(encoding="utf-8").splitlines()]
        cls.val = [json.loads(x) for x in (cls.out / "val.jsonl").read_text(encoding="utf-8").splitlines()]
        cls.golden = json.loads(GOLDEN.read_text(encoding="utf-8"))["cases"]

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)


class TestFormato(Base):
    def test_todas_as_16_intencoes_aparecem_no_treino(self):
        self.assertEqual({r["intent"] for r in self.train}, set(core.INTENTS))

    def test_intencoes_novas_presentes(self):
        presentes = {r["intent"] for r in self.train}
        for i in ("RESULTADOS", "SEGUNDO_TURNO", "ELEGIBILIDADE", "PATRIMONIO", "RECOMENDACAO"):
            self.assertIn(i, presentes)

    def test_registro_e_saida_canonicos(self):
        for r in self.train + self.val:
            self.assertEqual(r["instruction"], core.SYSTEM_PROMPT_V2)
            alvo = json.loads(r["output"])
            self.assertEqual(r["output"], core.format_output_v2(alvo), r["output"])
            self.assertEqual(alvo["intent"], r["intent"])
            self.assertEqual(r["text"], core.build_training_text(r["input"], r["output"], "v2"))
            self.assertTrue(r["text"].startswith("<|im_start|>system\n"))

    def test_saidas_aceitas_pela_gramatica_v2(self):
        rx = tnc.grammar_regex("v2")
        for r in self.train + self.val:
            self.assertIsNotNone(rx.match(r["output"]), r["output"])

    def test_somente_chaves_do_contrato_e_valores_do_vocabulario(self):
        for r in self.train + self.val:
            alvo = json.loads(r["output"])
            self.assertLessEqual(set(alvo), set(core.V2_KEYS))
            self.assertIn(alvo["intent"], core.INTENTS)
            if "cargo" in alvo:
                self.assertIn(alvo["cargo"], core.CARGOS)
            if "uf" in alvo:
                self.assertIn(alvo["uf"], core.UFS)
            if "tema" in alvo:
                self.assertIn(alvo["tema"], core.TEMAS_V2)
            if "historico" in alvo:
                self.assertIn(alvo["historico"], core.HISTORICOS)
            if "turno" in alvo:
                self.assertIn(alvo["turno"], (1, 2))
            if "apenasDeferidas" in alvo:
                self.assertIs(alvo["apenasDeferidas"], True)
            self.assertLessEqual(len(r["input"]), core.MAX_QUESTION_CHARS)

    def test_alvo_so_tem_intencao_e_entidades_nunca_fatos(self):
        for r in self.train:
            self.assertNotIn("direct_answer", r["output"])
            self.assertNotIn("suggested", r["output"])

    def test_recomendacao_nao_carrega_entidades(self):
        for r in self.train:
            if r["intent"] == "RECOMENDACAO":
                self.assertEqual(r["output"], '{"intent": "RECOMENDACAO"}')

    def test_segundo_turno_sempre_com_turno_2(self):
        for r in self.train:
            if r["intent"] == "SEGUNDO_TURNO":
                self.assertEqual(json.loads(r["output"])["turno"], 2)

    def test_arquivos_gerados(self):
        for nome in ("train.jsonl", "val.jsonl", "train.json", "val.json", "val_cases.json", "stats.json", "meta.json"):
            self.assertTrue((self.out / nome).exists(), nome)
        meta = json.loads((self.out / "meta.json").read_text(encoding="utf-8"))
        self.assertEqual(meta["dataVersion"], "teste-1")
        self.assertEqual(meta["format"], "v2")
        arr = json.loads((self.out / "train.json").read_text(encoding="utf-8"))
        self.assertEqual(len(arr), len(self.train))  # array lido por ai_model/scripts/train_hybrid.py


class TestCasosDeValidacao(Base):
    def test_val_cases_no_esquema_do_avaliador_e_oraculo_pontua_100(self):
        import eval_golden as ev

        casos = ev.load_cases(self.out / "val_cases.json")
        self.assertGreater(len(casos), 0)
        saida_por_q = {r["input"]: r["output"] for r in self.val}
        r = ev.evaluate(lambda q: saida_por_q[q], casos, "v2", "oráculo")
        self.assertEqual(r["json_valid_pct"], 100.0)
        self.assertEqual(r["intent_acc_pct"], 100.0)
        for k in ("cargo", "uf", "partido"):
            self.assertIn(r[f"{k}_acc_pct"], (100.0, None))
            self.assertIn(r[f"{k}_hallucination_pct"], (0.0, None))


class TestCasosDeTesteForaDoTreino(Base):
    def test_nenhuma_pergunta_de_referencia_no_treino_nem_na_validacao(self):
        proibidas = {b.norm_question(c["q"]) for c in self.golden}
        for r in self.train + self.val:
            self.assertNotIn(b.norm_question(r["input"]), proibidas, r["input"])

    def test_nenhuma_pergunta_quase_identica(self):
        toks = [b.tokens(c["q"]) for c in self.golden]
        for r in self.train + self.val:
            t = b.tokens(r["input"])
            for g, c in zip(toks, self.golden):
                self.assertLess(b.jaccard(t, g), 0.8, f"{r['input']!r} ~ {c['q']!r}")

    def test_remocao_funciona_com_amostras_identicas_as_de_teste(self):
        casos = self.golden
        amostras = [(c["q"], {"intent": "DESCONHECIDA"}, "DESCONHECIDA", None) for c in casos]
        amostras.append(("pergunta totalmente diferente do contrato", {"intent": "DESCONHECIDA"}, "DESCONHECIDA", None))
        mantidas, stats = b.remover_casos_de_teste(amostras, GOLDEN)
        self.assertEqual(len(mantidas), 1)
        self.assertEqual(stats["golden_exact_removed"], len(casos))

    def test_variacoes_de_caixa_acento_e_pontuacao_tambem_sao_removidas(self):
        amostras = [("QUEM É LULA", {"intent": "DESCONHECIDA"}, "DESCONHECIDA", None),
                    ("quem e lula???", {"intent": "DESCONHECIDA"}, "DESCONHECIDA", None)]
        mantidas, stats = b.remover_casos_de_teste(amostras, GOLDEN)
        self.assertEqual(mantidas, [])
        self.assertEqual(stats["golden_exact_removed"], 2)


class TestDivisaoEDeterminismo(Base):
    def test_validacao_nao_vazia_e_proporcao_razoavel(self):
        total = len(self.train) + len(self.val)
        self.assertGreater(len(self.val), 0)
        self.assertLess(len(self.val) / total, 0.15)

    def test_perguntas_nao_se_repetem_entre_treino_e_validacao(self):
        a = {b.norm_question(r["input"]) for r in self.train}
        c = {b.norm_question(r["input"]) for r in self.val}
        self.assertFalse(a & c)

    def test_nomes_de_candidatos_nao_atravessam_treino_e_validacao(self):
        nomes_t = {b.fold(json.loads(r["output"])["nome"]) for r in self.train if "nome" in json.loads(r["output"])}
        nomes_v = {b.fold(json.loads(r["output"])["nome"]) for r in self.val if "nome" in json.loads(r["output"])}
        self.assertFalse(nomes_t & nomes_v)

    def test_determinismo_e_semente(self):
        def roda(seed, nome):
            out = self.tmp / nome
            with contextlib.redirect_stdout(io.StringIO()):
                b.main(["--data", str(self.data), "--golden", str(GOLDEN), "--out", str(out), "--scale", "0.3", "--seed", str(seed)])
            return (out / "train.jsonl").read_text(encoding="utf-8")

        self.assertEqual(roda(7, "o1"), roda(7, "o2"))
        self.assertNotEqual(roda(7, "o3"), roda(8, "o4"))


class TestDadosDoPacote(Base):
    def test_nomes_vem_do_pacote_e_estao_higienizados(self):
        permitido = {b.fold(" ".join(n.split())) for n, *_ in NOMES} | {
            b.fold(f"FULANO{chr(65 + i % 26)}{chr(65 + (i * 7) % 26)} DE TAL") for i in range(40)}
        usados = {b.fold(json.loads(r["output"])["nome"]) for r in self.train + self.val if "nome" in json.loads(r["output"])}
        self.assertTrue(usados)
        self.assertLessEqual(usados, permitido)
        for n in usados:
            self.assertNotIn("  ", n)

    def test_nomes_com_palavras_de_cargo_digitos_ou_curtos_sao_excluidos(self):
        usados = {b.fold(json.loads(r["output"])["nome"]) for r in self.train + self.val if "nome" in json.loads(r["output"])}
        for ruim in ("deputado fulano", "candidato 123", "pr"):
            self.assertNotIn(ruim, usados)

    def test_partidos_vem_do_pacote(self):
        partidos = {json.loads(r["output"])["partido"] for r in self.train + self.val if "partido" in json.loads(r["output"])}
        self.assertTrue(partidos)
        self.assertLessEqual({p.upper().replace("PC DO B", "PCDOB").replace("PCDOB", "PCDOB") for p in partidos},
                             {"PT", "PL", "PSD", "NOVO", "MDB", "PCDOB", "UNIÃO"})

    def test_uf_nome_em_sincronia_com_o_contrato(self):
        self.assertEqual(sorted(b.UF_NOME), sorted(core.UFS))
        self.assertEqual(set(b.CARGO_FORMS), set(core.CARGOS))
        self.assertEqual(set(b.TEMA_FORMS), set(core.TEMAS_V2))

    def test_distrital_so_com_df(self):
        for r in self.train + self.val:
            a = json.loads(r["output"])
            if a.get("cargo") == "DEPUTADO_DISTRITAL" and "uf" in a:
                self.assertEqual(a["uf"], "DF")

    def test_cargo_nacional_nunca_com_uf(self):
        for r in self.train + self.val:
            a = json.loads(r["output"])
            if a.get("cargo") in ("PRESIDENTE", "VICE_PRESIDENTE"):
                self.assertNotIn("uf", a)


@unittest.skipUnless(shutil.which("node"), "Node.js não encontrado")
class TestConsistenciaComONormalizadorDoProxy(Base):
    def test_todos_os_rotulos_sao_pontos_fixos_do_normalizador_real(self):
        """Roda api/_lib/normalize.js (com ancoragem na pergunta) sobre TODAS as amostras: sem divergências."""
        with contextlib.redirect_stdout(io.StringIO()):
            b.verificar_com_normalizador(self.train + self.val)

    def test_verify_detecta_rotulo_inconsistente(self):
        ruim = [{"input": "Candidatos a governador em SP", "output": '{"intent": "LISTAR_CANDIDATOS", "cargo": "SENADOR", "uf": "SP"}'}]
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                b.verificar_com_normalizador(ruim)


class TestPerguntasExternas(Base):
    """Perguntas coletadas fora dos templates (relatos, FAQ/ouvidoria oficial, parafraseamento).

    O rótulo nunca vem da fonte: é validado contra os vocabulários fechados e contra nomes/partidos que
    existem no pacote oficial; casos de teste continuam fora do treino; e a participação tem teto.
    """

    EXTRAS = [
        # aceitos
        {"q": "me diz ai quais sao os candidatos a senador do partido NOVO em santa catarina",
         "alvo": {"intent": "LISTAR_CANDIDATOS", "cargo": "SENADOR", "uf": "SC", "partido": "NOVO"},
         "fonte": "faq-tse", "licenca": "oficial TSE (CC BY)", "coletadoEm": "2026-10-02"},
        {"q": "quando sera a posse dos eleitos", "alvo": {"intent": "CALENDARIO"}, "fonte": "ouvidoria", "licenca": "LAI"},
        {"q": "me fala sobre a maria das dores", "alvo": {"intent": "PERFIL_CANDIDATO", "nome": "MARIA DAS DORES"},
         "fonte": "relato-ia#1", "licenca": "primeira parte"},
        # nome parcial: todos os tokens existem num mesmo nome oficial (semântica de resolverNome)
        {"q": "quem é o de tal", "alvo": {"intent": "PERFIL_CANDIDATO", "nome": "DE TAL"}, "fonte": "relato-ia#2"},
        # descartados
        {"q": "em quem eu deveria votar para governador", "alvo": {"intent": "RECOMENDACAO", "cargo": "GOVERNADOR"},
         "fonte": "relato-ia#3"},
        {"q": "quem é o candidato zezinho inventado", "alvo": {"intent": "PERFIL_CANDIDATO", "nome": "ZEZINHO INVENTADO"},
         "fonte": "relato-ia#4"},
        {"q": "candidatos do partido xyz", "alvo": {"intent": "LISTAR_CANDIDATOS", "partido": "XYZ"}, "fonte": "relato-ia#5"},
        {"q": "candidatos a prefeito de brodowski", "alvo": {"intent": "LISTAR_CANDIDATOS", "cargo": "PREFEITO"},
         "fonte": "relato-ia#6"},
        {"q": "me diz ai quais sao os candidatos a senador do partido NOVO em santa catarina",
         "alvo": {"intent": "LISTAR_CANDIDATOS", "cargo": "SENADOR", "uf": "SC", "partido": "NOVO"}, "fonte": "duplicada"},
    ]

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.candidatos = [
            {k: c.get(k) for k in ("cargo", "estadoUf", "partido", "nomeUrna")}
            for arq in sorted((cls.data / "candidatos").glob("*.json"))
            for c in json.loads(arq.read_text(encoding="utf-8"))
        ]
        cls.arq_extra = cls.tmp / "extras.jsonl"
        cls.arq_extra.write_text(
            "\n".join(json.dumps(e, ensure_ascii=False) for e in cls.EXTRAS) + "\n", encoding="utf-8")

    def _carregar(self):
        amostras, descartes, prov = b.carregar_extras([self.arq_extra], self.candidatos)
        return amostras, descartes, prov

    def test_aceitos_e_descartados_por_motivo(self):
        amostras, descartes, _ = self._carregar()
        aceites = {q for q, *_ in amostras}
        self.assertIn("quando sera a posse dos eleitos", aceites)          # intenção SEM entidade é válida
        self.assertIn("me fala sobre a maria das dores", aceites)
        self.assertIn("quem é o de tal", aceites)                          # nome parcial oficial
        self.assertEqual(descartes.get("entidade_indevida"), 1)            # RECOMENDACAO não leva entidades
        self.assertEqual(descartes.get("nome_fora_do_pacote"), 1)
        self.assertEqual(descartes.get("partido_fora_do_pacote"), 1)
        self.assertEqual(descartes.get("vocab_cargo"), 1)                  # PREFEITO não existe no contrato
        self.assertEqual(descartes.get("duplicada"), 1)

    def test_proveniencia_e_licenca_por_fonte(self):
        _, _, prov = self._carregar()
        self.assertEqual(prov["faq-tse"], {"quantidade": 1, "licenca": "oficial TSE (CC BY)", "coletadoEm": "2026-10-02"})
        self.assertEqual(prov["ouvidoria"]["licenca"], "LAI")
        self.assertNotIn("licenca", prov["relato-ia#2"])                   # sem licença declarada => chave ausente

    def test_rotulos_sao_canonicos_e_aceitos_pela_gramatica_v2(self):
        amostras, _, _ = self._carregar()
        rx = tnc.grammar_regex("v2")
        for q, alvo, intent, nome_fonte in amostras:
            self.assertEqual(alvo["intent"], intent)
            self.assertLessEqual(set(alvo), set(core.V2_KEYS))
            self.assertEqual(list(alvo), [k for k in core.V2_KEYS if k in alvo])   # ordem canônica
            self.assertIsNotNone(rx.match(core.format_output_v2(alvo)))
            if nome_fonte:
                self.assertTrue(b._nome_existe(nome_fonte, b._indice_de_nomes(self.candidatos)))

    def test_nome_inventado_nao_passa_e_parcial_oficial_passa(self):
        indice = b._indice_de_nomes(self.candidatos)
        self.assertFalse(b._nome_existe("ZEZINHO INVENTADO", indice))
        self.assertFalse(b._nome_existe("", indice))
        self.assertTrue(b._nome_existe("MARIA DAS DORES", indice))
        self.assertTrue(b._nome_existe("de tal", indice))

    def test_casos_de_teste_tambem_saem_das_perguntas_externas(self):
        caso = self.golden[0]["q"]
        amostras, _, _ = self._carregar()
        amostras.append((caso, {"intent": "DESCONHECIDA"}, "DESCONHECIDA", None))
        mantidas, stats = b.remover_casos_de_teste(amostras, GOLDEN)
        self.assertNotIn(caso, {q for q, *_ in mantidas})
        self.assertGreaterEqual(stats["golden_exact_removed"], 1)

    def test_teto_de_participacao_e_deterministico(self):
        amostras, _, _ = self._carregar()
        mantidas, cortadas = b.limitar_extras(amostras, geradas=4, max_pct=10.0, seed=7)
        self.assertEqual(len(mantidas) + cortadas, len(amostras))
        self.assertLessEqual(len(mantidas), int(0.10 * (4 + len(amostras))))
        self.assertEqual(b.limitar_extras(amostras, 4, 10.0, 7)[0], mantidas)      # mesma semente => mesma amostra
        self.assertEqual(b.limitar_extras(amostras, 4, 0.0, 7), ([], len(amostras)))  # 0 desliga

    def test_integracao_no_dataset_com_stats_e_meta(self):
        out = self.tmp / "out_extra"
        with contextlib.redirect_stdout(io.StringIO()):
            b.main(["--data", str(self.data), "--golden", str(GOLDEN), "--out", str(out), "--scale", "0.3",
                    "--seed", "7", "--extra", str(self.arq_extra), "--extra-max-pct", "25"])
        stats = json.loads((out / "stats.json").read_text(encoding="utf-8"))
        meta = json.loads((out / "meta.json").read_text(encoding="utf-8"))
        self.assertEqual(stats["extras_aceitos"], 4)
        self.assertLessEqual(stats["extras_pct"], 25.0)
        self.assertEqual(stats["extras_descartados"]["duplicadas_das_geradas"], 0)
        self.assertEqual(meta["extras"]["fontes"]["faq-tse"]["licenca"], "oficial TSE (CC BY)")
        self.assertIn("label_extra.mjs", meta["extras"]["rotulagem"])
        regs = [json.loads(x) for x in (out / "train.jsonl").read_text(encoding="utf-8").splitlines()] + \
               [json.loads(x) for x in (out / "val.jsonl").read_text(encoding="utf-8").splitlines()]
        entradas = {r["input"] for r in regs}
        self.assertIn("quando sera a posse dos eleitos", entradas)
        for r in regs:                                                     # formato idêntico ao dos templates
            self.assertEqual(r["instruction"], core.SYSTEM_PROMPT_V2)
            self.assertEqual(r["output"], core.format_output_v2(json.loads(r["output"])))


if __name__ == "__main__":
    unittest.main(verbosity=2)
