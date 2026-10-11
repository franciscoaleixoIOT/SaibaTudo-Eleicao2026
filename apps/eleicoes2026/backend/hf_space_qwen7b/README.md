---
title: SaibaTudo Qwen7B
emoji: 🗳️
colorFrom: blue
colorTo: yellow
sdk: gradio
sdk_version: 5.49.1
python_version: 3.10.13
app_file: app.py
pinned: false
short_description: Texto gerado do SaibaTudo (uso interno)
---

Space do projeto SaibaTudo Eleições 2026: gera a explicação por IA (Qwen2.5-7B no ZeroGPU), chamado só pelo servidor do projeto (`/api/ask`).
A verificação da resposta é feita no servidor; o texto pode conter erros e não é dado oficial. Código-fonte: `backend/hf_space_qwen7b/` no repositório do projeto (`nlu_core.py` é copiado de `backend/modal/`).
