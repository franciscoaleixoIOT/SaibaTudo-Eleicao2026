---
language:
- pt
license: apache-2.0
base_model: Qwen/Qwen3-4B-Instruct-2507
pipeline_tag: text-generation
tags:
- saibatudo
- quimica
- chemistry
- rag
- qlora
---

# SaibaTudo Química — explicador ancorado em trechos

Ajuste fino QLoRA de **Qwen3-4B-Instruct-2507** que **explica conceitos de química** em português a partir de **trechos licenciados** (OpenStax
*Chemistry 2e*, CC BY 4.0, LibreTexts, CC BY-NC-SA, fichas ICSC...) e dos dados que o app já exibiu. Faz parte do app **SaibaTudo Química**
(<https://saibatudo.net/quimica/>, código aberto).

## Papel do modelo
- **Explica; os dados respondem.** O prompt traz os trechos com `id`; o modelo cita `[id]` e não escreve número, fórmula ou fonte que não esteja neles.
- **O servidor descarta** a resposta com número ou fórmula fora dos dados enviados, com fonte inventada ou que viole a segurança química
  (`api/_lib/fidelidade.js`). O texto é rotulado "gerado por IA, pode conter erros".
- **Segurança:** recusa rotas de síntese, purificação ou obtenção caseira de explosivos, armas químicas, drogas ilícitas, precursores e venenos, e
  responde perigos, EPI, primeiros socorros e descarte seguro. Gates: 0 % de resposta útil a pedido perigoso e ≥ 95 % de resposta aos legítimos.

## Versões
Nomes imutáveis `ask-v1-AAAAMMDD`; cada uma em uma revisão própria do repositório (use o SHA da revisão). Gate de fidelidade numérica: ≥ 98 % das
explicações de uma amostra de conceitos sem número fora dos trechos. `train_meta.json` traz o hash do dataset, a semente e os hiperparâmetros.
Treino local (RTX 5060, 8 GB), QLoRA 4-bit com `max_length` 1024.
