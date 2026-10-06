# -*- coding: utf-8 -*-
"""Testes do PLANO do job de treino no Modal (sem Modal, sem GPU): nomes, comandos, caminhos e a garantia de nunca tocar a produção."""
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import train_job as t  # noqa: E402


class Nome(unittest.TestCase):
    def test_aceita_o_padrao_de_versao(self):
        for ok in ("v2.2-20261101", "v3-20270101", "v2.10.1-20261231"):
            self.assertEqual(t.validar_nome(ok), ok)

    def test_recusa_o_que_nao_e_versao(self):
        for ruim in ("", "main", "v2.2", "2.2-20261101", "v2.2-2026", "v2.2-20261101/../x", "v2.2-20261101 ", "../v2.2-20261101"):
            with self.assertRaises(ValueError, msg=ruim):
                t.validar_nome(ruim)


class Plano(unittest.TestCase):
    P = t.plano("v2.2-20261101", dataset_no_volume="/data/datasets/v2.2-20261101/train.json", seed=7, epochs=2.0)

    def test_ordem_dos_passos(self):
        self.assertEqual([n for n, _ in self.P["passos"]], ["treinar", "guardar_lora", "fundir"])

    def test_treino_usa_dataset_do_volume_seed_e_sem_offload_na_ram(self):
        cmd = dict(self.P["passos"])["treinar"]
        self.assertTrue(cmd[1].endswith("train_hybrid.py"))
        self.assertEqual(cmd[cmd.index("--dataset") + 1], "/data/datasets/v2.2-20261101/train.json")
        self.assertEqual(cmd[cmd.index("--seed") + 1], "7")
        self.assertEqual(cmd[cmd.index("--epochs") + 1], "2.0")
        self.assertEqual(cmd[cmd.index("--cpu_offload") + 1], "off")

    def test_saidas_ficam_numa_pasta_propria_do_volume(self):
        self.assertEqual(self.P["pasta"], "/data/runs/v2.2-20261101")
        self.assertEqual(self.P["lora"], "/data/runs/v2.2-20261101/lora")
        self.assertEqual(self.P["merged"], "/data/runs/v2.2-20261101/merged")
        fundir = dict(self.P["passos"])["fundir"]
        self.assertEqual(fundir[fundir.index("--lora_dir") + 1], self.P["lora"])
        self.assertEqual(fundir[fundir.index("--output_dir") + 1], self.P["merged"])

    def test_publica_em_branch_nova_nunca_na_main_nem_no_repo_de_producao(self):
        self.assertEqual(self.P["branch"], "v2.2-20261101")
        self.assertNotEqual(self.P["branch"], "main")
        self.assertNotEqual(t.HF_REPO_CANDIDATOS, "franciscoaleixo/SaibaTudo-Eleicao2026", "o repositório de produção nunca é alvo deste job")
        self.assertIn("nunca main", t.resumo_do_plano(self.P))

    def test_nome_invalido_nao_gera_plano(self):
        with self.assertRaises(ValueError):
            t.plano("main", dataset_no_volume="/data/x.json")

    def test_resumo_lista_cada_passo(self):
        txt = t.resumo_do_plano(self.P)
        for palavra in ("treinar", "guardar_lora", "fundir", "publicar", "v2.2-20261101"):
            self.assertIn(palavra, txt)


class Ambiente(unittest.TestCase):
    def test_pins_cobrem_o_que_o_treino_importa(self):
        nomes = {p.split("==")[0] for p in t.PINS}
        self.assertTrue({"torch", "transformers", "peft", "bitsandbytes", "accelerate"} <= nomes)
        self.assertTrue(all("==" in p for p in t.PINS), "tudo fixado: treino reprodutível")

    def test_dry_run_documentado_no_cabecalho(self):
        self.assertIn("--dry-run", Path(t.__file__).read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
