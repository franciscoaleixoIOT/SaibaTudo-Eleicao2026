---
title: SaibaTudo Quimica
emoji: 🧪
colorFrom: green
colorTo: blue
sdk: gradio
sdk_version: 5.49.1
python_version: 3.10.13
app_file: app.py
pinned: false
short_description: Explicacao por IA do SaibaTudo Quimica (uso interno)
---

Space do projeto **SaibaTudo Química**: gera a explicação por IA (Qwen3-4B-Instruct-2507 no ZeroGPU), chamado só pelo servidor do projeto
(`/api/ask`). O servidor descarta a resposta que traga número, fórmula ou fonte que não esteja nos trechos enviados, ou que viole a segurança
química; o texto pode conter erros e não é dado oficial. Código-fonte: `backend/hf_space_quimica/` no repositório do projeto.

## Publicar
Este Space precisa de `ask_core.py`, copiado de `backend/modal/` (o prompt é o mesmo do treino). Com o `hf` autenticado:

```bash
mkdir -p ai_model/output/space_build && cp backend/hf_space_quimica/{app.py,requirements.txt,README.md} ai_model/output/space_build/
cp backend/modal/ask_core.py ai_model/output/space_build/
hf upload franciscoaleixo/saibatudo-quimica ai_model/output/space_build . --repo-type space
```

Space **privado**; o servidor chama com `HF_TOKEN` (token de leitura, fine-grained) em `HF_ASK_SPACE_URL`. Variáveis do Space (Settings → Variables):
`ASK_MODEL_ID` (padrão `Qwen/Qwen3-4B-Instruct-2507`), `ASK_MODEL_REVISION` (SHA da revisão publicada do modelo ajustado) e `ASK_MODEL_LABEL`.
Passo a passo completo em `docs/MODELO.md`.
