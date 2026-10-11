# -*- coding: utf-8 -*-
"""
Valida os arquivos de .github/: YAML bem formado e estrutura mínima de cada workflow, e a SINTAXE DE SHELL de cada passo `run` (bash -n).
Motivo: um bloco `run:` com uma linha na coluna 0 quebrou eleicoes-lacunas-nlu.yml (workflow inválido: falha em 0 s, sem log) e só foi percebido depois do push.

Precisa de PyYAML (pip install pyyaml); sem ele os testes são pulados. A checagem de shell precisa de `bash` (há no runner do GitHub e no Git Bash).
Uso: python -m unittest discover -s tools -p "test_workflows.py"
"""
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None

RAIZ = Path(__file__).resolve().parent.parent
# Repositório único (SaibaTudo): os workflows ficam na raiz do repositório, com o prefixo do app.
REPO = next(p for p in [RAIZ, *RAIZ.parents] if (p / ".github" / "workflows").is_dir())
GITHUB = REPO / ".github"
WORKFLOWS = sorted((GITHUB / "workflows").glob("eleicoes-*.yml"))
BASH = shutil.which("bash")


def _carregar(p: Path):
    return yaml.safe_load(p.read_text(encoding="utf-8"))


@unittest.skipIf(yaml is None, "PyYAML não instalado")
class Yaml(unittest.TestCase):
    def test_ha_workflows(self):
        self.assertGreaterEqual(len(WORKFLOWS), 7)

    def test_todos_os_yaml_do_github_sao_validos(self):
        for p in [*WORKFLOWS, *GITHUB.glob("*.yml")]:
            with self.subTest(arquivo=p.name):
                self.assertIsInstance(_carregar(p), dict)

    def test_estrutura_minima_dos_workflows(self):
        for p in WORKFLOWS:
            with self.subTest(arquivo=p.name):
                d = _carregar(p)
                self.assertIn("name", d)
                self.assertTrue("on" in d or True in d, "gatilho (`on`; o YAML 1.1 lê `on` como True)")
                self.assertTrue(d.get("jobs"), "sem jobs")
                for nome, job in d["jobs"].items():
                    self.assertIn("runs-on", job, nome)
                    self.assertTrue(job.get("steps"), f"{nome}: sem steps")
                    for passo in job["steps"]:
                        self.assertTrue("run" in passo or "uses" in passo, f"{nome}: passo sem run/uses: {passo}")

    def test_workflows_com_escrita_declaram_permissoes(self):
        # quem faz push, abre issue ou PR precisa dizer o que pode (o padrão do repositório pode ser só leitura)
        for nome in ("eleicoes-data-refresh.yml", "eleicoes-data-freshness.yml", "eleicoes-nightly-eval.yml", "eleicoes-lacunas-nlu.yml"):
            with self.subTest(arquivo=nome):
                self.assertIn("permissions", _carregar(GITHUB / "workflows" / nome))

    def test_nenhum_workflow_usa_segredo_em_if_de_job_sem_env(self):
        # `secrets` não existe em `if:` de job/step: erro clássico que invalida o workflow
        for p in WORKFLOWS:
            with self.subTest(arquivo=p.name):
                for nome, job in _carregar(p)["jobs"].items():
                    for passo in job["steps"]:
                        cond = str(passo.get("if", ""))
                        self.assertNotIn("secrets.", cond, f"{nome}: `secrets` não pode ser usado em if (use env)")


@unittest.skipIf(yaml is None or BASH is None, "PyYAML ou bash ausente")
class Shell(unittest.TestCase):
    def test_sintaxe_de_shell_de_cada_passo_run(self):
        for p in WORKFLOWS:
            for nome, job in _carregar(p)["jobs"].items():
                for i, passo in enumerate(job["steps"]):
                    script = passo.get("run")
                    if not script:
                        continue
                    with self.subTest(arquivo=p.name, job=nome, passo=passo.get("name", i)):
                        limpo = re.sub(r"\$\{\{.*?\}\}", "X", script, flags=re.S)  # expressões do Actions não são shell
                        with tempfile.NamedTemporaryFile("w", suffix=".sh", delete=False, encoding="utf-8", newline="\n") as f:
                            f.write(limpo)
                        try:
                            r = subprocess.run([BASH, "-n", f.name], capture_output=True, text=True)
                        finally:
                            Path(f.name).unlink(missing_ok=True)
                        self.assertEqual(r.returncode, 0, r.stderr)


if __name__ == "__main__":
    unittest.main()
