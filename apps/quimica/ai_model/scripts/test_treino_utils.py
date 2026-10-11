# -*- coding: utf-8 -*-
"""Testes dos utilitários de treino (sem torch): máscara do prompt e metadados. Uso: python -m unittest discover -s ai_model/scripts -p "test_treino*.py" """
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import treino_utils as t  # noqa: E402


class TokenizadorFalso:
    """Palavras e marcas <|...|> viram ids estáveis; `funde` simula BPE que cola o fim do prompt na 1ª palavra da saída."""

    def __init__(self, funde=False):
        self.vocab = {}
        self.funde = funde

    def _id(self, tok):
        return self.vocab.setdefault(tok, len(self.vocab) + 1)

    def __call__(self, texto, truncation=False, max_length=None, padding=False, add_special_tokens=False):
        toks = re.findall(r"<\|[^|]+\|>|\n|[^\s<]+", texto)
        if self.funde and texto.count("<|im_start|>") == 3:  # só no texto completo: cola "\n" + palavra
            for i, tk in enumerate(toks):
                if tk == "\n" and toks[i - 1] == "assistant" and i + 1 < len(toks):
                    toks[i: i + 2] = ["\n" + toks[i + 1]]
                    break
        ids = [self._id(x) for x in toks]
        if truncation and max_length:
            ids = ids[:max_length]
        return {"input_ids": ids, "attention_mask": [1] * len(ids)}


SISTEMA = "Você interpreta perguntas de química."
USUARIO = "massa molar do ácido sulfúrico"
ALVO = '{"intent": "MASSA_MOLAR", "composto": "Ácido sulfúrico"}'


class Mascara(unittest.TestCase):
    def test_monta_prompt_e_completo(self):
        prompt, completo = t.montar_textos(SISTEMA, USUARIO, ALVO)
        self.assertTrue(prompt.endswith("<|im_start|>assistant\n"))
        self.assertTrue(completo.startswith(prompt))
        self.assertTrue(completo.endswith(ALVO + "<|im_end|>\n"))

    def test_mascara_so_o_prompt_e_aprende_a_saida(self):
        tok = TokenizadorFalso()
        prompt, completo = t.montar_textos(SISTEMA, USUARIO, ALVO)
        ids, labels, mask, status = t.mascarar_prompt(tok, prompt, completo, 256)
        self.assertEqual(status, "ok")
        self.assertEqual(len(ids), len(labels))
        n = len(tok(prompt)["input_ids"])
        self.assertTrue(all(x == t.IGNORAR for x in labels[:n]), "o prompt inteiro é ignorado pela perda")
        self.assertEqual(labels[n:], ids[n:], "a saída (JSON + fim de turno) é o que o modelo aprende")
        self.assertGreater(len(ids) - n, 0)

    def test_nenhum_token_do_alvo_e_mascarado(self):
        tok = TokenizadorFalso()
        prompt, completo = t.montar_textos(SISTEMA, USUARIO, ALVO)
        ids, labels, _, _ = t.mascarar_prompt(tok, prompt, completo, 256)
        aprendidos = [x for x in labels if x != t.IGNORAR]
        self.assertEqual(aprendidos, ids[-len(aprendidos):])
        self.assertEqual(len(aprendidos), len(tok(f"{ALVO}<|im_end|>\n")["input_ids"]))

    def test_fronteira_fundida_mascara_so_o_prefixo_comum(self):
        tok = TokenizadorFalso(funde=True)
        prompt, completo = t.montar_textos(SISTEMA, USUARIO, ALVO)
        ids, labels, _, status = t.mascarar_prompt(tok, prompt, completo, 256)
        self.assertEqual(status, "parcial")
        self.assertTrue(any(x != t.IGNORAR for x in labels), "a saída continua sendo aprendida")
        self.assertEqual(labels[-1], ids[-1])

    def test_truncado_antes_da_saida_e_sinalizado_para_descarte(self):
        tok = TokenizadorFalso()
        prompt, completo = t.montar_textos(SISTEMA, USUARIO, ALVO)
        n = len(tok(prompt)["input_ids"])
        ids, labels, _, status = t.mascarar_prompt(tok, prompt, completo, n)  # cabe só o prompt
        self.assertEqual(status, "truncado")
        self.assertTrue(all(x == t.IGNORAR for x in labels))

    def test_truncar_no_meio_da_saida_ainda_aprende_o_que_coube(self):
        tok = TokenizadorFalso()
        prompt, completo = t.montar_textos(SISTEMA, USUARIO, ALVO)
        n = len(tok(prompt)["input_ids"])
        ids, labels, _, status = t.mascarar_prompt(tok, prompt, completo, n + 2)
        self.assertEqual(status, "ok")
        self.assertEqual(len([x for x in labels if x != t.IGNORAR]), 2)


class Metadados(unittest.TestCase):
    def test_perda_final(self):
        self.assertEqual(t.perda_final([{"loss": 2.3}, {"eval_loss": 9}, {"loss": 0.13}, {"epoch": 3}]), 0.13)
        self.assertIsNone(t.perda_final([]))
        self.assertIsNone(t.perda_final(None))

    def test_train_meta_traz_o_que_reproduz_o_treino(self):
        with tempfile.TemporaryDirectory() as d:
            ds = Path(d) / "train.json"
            ds.write_text('[{"input": "x", "output": "y"}]', encoding="utf-8")
            meta = t.escrever_train_meta(
                Path(d) / "final", dataset=ds, base_model="Qwen/Qwen2.5-1.5B-Instruct", hiperparametros={"epochs": 3, "lr": 2e-4},
                semente=2026, amostras=1, mascara={"ok": 1, "parcial": 0, "truncado": 0}, log_history=[{"loss": 0.2}], versoes={"torch": "x"},
                alvo="nlu", versao="nlu-v1-20261101")
            gravado = json.loads((Path(d) / "final" / "train_meta.json").read_text(encoding="utf-8"))
            self.assertEqual(gravado, meta)
            self.assertEqual(gravado["dataset"]["sha256"], t.sha256_arquivo(ds))
            self.assertEqual(len(gravado["dataset"]["sha256"]), 64)
            self.assertEqual(gravado["semente"], 2026)
            self.assertEqual((gravado["alvo"], gravado["versao"]), ("nlu", "nlu-v1-20261101"))
            self.assertEqual(gravado["perdaFinal"], 0.2)
            self.assertEqual(gravado["mascaraDoPrompt"]["ok"], 1)

    def test_sha256_muda_com_o_conteudo(self):
        with tempfile.TemporaryDirectory() as d:
            a, b = Path(d) / "a", Path(d) / "b"
            a.write_text("1", encoding="utf-8")
            b.write_text("2", encoding="utf-8")
            self.assertNotEqual(t.sha256_arquivo(a), t.sha256_arquivo(b))


if __name__ == "__main__":
    unittest.main()
