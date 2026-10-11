---
language:
- pt
license: apache-2.0
base_model: Qwen/Qwen2.5-1.5B-Instruct
pipeline_tag: text-generation
tags:
- saibatudo
- quimica
- chemistry
- nlu
- json
- qlora
---

# SaibaTudo Química — modelo de interpretação (NLU)

Ajuste fino QLoRA de **Qwen2.5-1.5B-Instruct** que **interpreta perguntas de química** em português e devolve **JSON curto só com intenção e
entidades** (elemento, composto, propriedade, quantidades, equação, nível, unidade de destino). Faz parte do app **SaibaTudo Química**
(<https://saibatudo.net/quimica/>, código aberto).

## Papel do modelo
- **Não fornece fatos nem faz contas.** Massas, constantes, propriedades e perigos exibidos pelo app vêm do pacote de dados assinado
  (PubChem, CODATA, OpenStax, ICSC...) ou de cálculo local testado. O modelo só devolve a interpretação da pergunta.
- **Opcional e opt-in:** o app funciona 100 % sem ele (NLU local por regras); a nuvem só é consultada se o NLU local não entendeu e a pessoa permitiu.
- **Revalidado:** o proxy (`api/_lib/normalize.js`) só mantém uma entidade se houver evidência no texto da pergunta, e o app confere tudo contra os dados.
- **Pedidos perigosos** (síntese de explosivos, armas químicas, drogas...) são recusados por regra antes do modelo; a intenção `RECUSA_PERIGO` existe como segunda barreira.
- Na decodificação usa **gramática GBNF**: o JSON é sempre válido e nunca traz chaves extras.

## Versões
Nomes imutáveis `nlu-v1-AAAAMMDD`; cada uma é publicada em uma revisão própria deste repositório (use o SHA da revisão, não `main`). Os resultados
do gate de cada versão ficam em `eval.json` (JSON ≥ 98 %, intenção ≥ 85 %, cada entidade ≥ 90 %, alucinação ≤ 5 %, holdout, catraca, queda Q4×Q8 ≤ 3 pontos).

## Treino
Dataset gerado por templates e fontes com licença de reuso (ver `docs/FONTES_E_LICENCAS.md` do repositório); os casos de referência (`contracts/`) nunca treinam.
`train_meta.json` traz o hash do dataset, a semente e os hiperparâmetros. Treino local (RTX 5060, 8 GB).
