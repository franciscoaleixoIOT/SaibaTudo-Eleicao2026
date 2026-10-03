---
language:
- pt
license: mit
tags:
- saibatudo
- elections-2026
- brazil
- intent-classification
- slot-filling
- qlora
- nlu
- json
base_model: Qwen/Qwen2.5-1.5B-Instruct
pipeline_tag: text-generation
---

# SaibaTudo-Eleicao2026 — modelo de NLU (intenção e entidades)

Ajuste fino QLoRA de **Qwen2.5-1.5B-Instruct** que **interpreta perguntas** de eleitores sobre as Eleições
Gerais 2026 e devolve **JSON curto só com intenção e entidades** (cargo, UF, partido, nome, tema…). Faz parte
do app **SaibaTudo Eleições 2026** (<https://saibatudo.net>, código em
<https://github.com/franciscoaleixoIOT/SaibaTudo-Eleicao2026>).

> ## Papel do modelo (importante)
> - **Não fornece fatos.** Nomes, números, situações, contas e resultados exibidos pelo app vêm
>   **exclusivamente** do pacote assinado de dados abertos do TSE carregado no aparelho. O modelo devolve só
>   a interpretação da pergunta; a resposta é montada localmente a partir dos dados oficiais.
> - **Não recomenda, compara nem prevê candidatos** (Res. TSE 23.755/2026): pedidos desse tipo viram a
>   intenção `RECOMENDACAO`, que os clientes respondem com recusa neutra.
> - É **opcional e opt-in**: app e site funcionam 100 % sem o modelo (NLU local por regras); a nuvem só é
>   consultada quando o NLU local não entende a pergunta.
> - A saída é **revalidada** duas vezes: no proxy (`api/_lib/normalize.js`, com ancoragem de cada entidade no
>   texto da pergunta) e no cliente (`NluValidator`/`validarNluNuvem` — cargo/UF do vocabulário, partido e
>   nome precisam existir nos dados). Em produção a decodificação usa **gramática GBNF**, então o JSON é
>   sempre válido e nunca contém campos extras.

## Versões
| Versão em produção | Publicada em | Formato de saída | Dados de treino | Estado |
| :-- | :-- | :-- | :-- | :-- |
| `v2.1-20261003` | 03/10/2026 | **contrato v2**: `{intent, entidades citadas}` | 20.618 exemplos (19.525 treino / 1.093 validação) | atual |
| `v1-legado` | 01/10/2026 — revisão [`13851ea0d02628546da18121f03831a92d2a38f4`](https://huggingface.co/franciscoaleixo/SaibaTudo-Eleicao2026/tree/13851ea0d02628546da18121f03831a92d2a38f4) | legado (`intent` + `filters` + `direct_answer`, ignorado) | 5.192 pares (extração TSE de 30/09/2026) | **substituída**, mas continua acessível pela revisão acima e no Volume do Modal (rollback) |

A substituição do `main` **não apaga** a versão anterior: os pesos antigos permanecem recuperáveis pelo SHA
fixado acima (`--revision 13851ea0…`), e o artefato servido fica num Volume imutável por versão, com rollback
por `modal run backend/modal/convert_gguf.py::promote --version v1-legado`.

Os **dados não exigem retreino**: partidos, nomes e UFs vêm do pacote atualizado várias vezes ao dia. O modelo
é retreinado quando surgem intenções/vocabulário novos ou quando se quer ampliar a cobertura de formulações
(ver `docs/ATUALIZACAO_DADOS_E_IA.md`).

## Formato de saída (contrato v2)
Só as chaves presentes; nenhuma outra. Intenções: `LISTAR_CANDIDATOS`, `CONTAR_CANDIDATOS`,
`PERFIL_CANDIDATO`, `PESQUISAS`, `RESULTADOS`, `SEGUNDO_TURNO`, `PLANO_GOVERNO`, `CONTAS_CAMPANHA`,
`PATRIMONIO`, `ELEGIBILIDADE`, `CALENDARIO`, `REGRAS_VOTO`, `REGRAS_URNA`, `SENADO_DOIS_VOTOS`,
`LOCAL_VOTACAO`, `FONTES`, `SOBRE_DADOS`, `SIMULADOR`, `AJUDA`, `RECOMENDACAO`, `DESCONHECIDA`.

```json
{"intent": "LISTAR_CANDIDATOS", "cargo": "GOVERNADOR", "uf": "SP"}
{"intent": "PERFIL_CANDIDATO", "nome": "MARIA DAS DORES"}
{"intent": "RECOMENDACAO"}
```

Regras do contrato: `RECOMENDACAO` e `DESCONHECIDA` **não levam entidades**; `SEGUNDO_TURNO` implica
`turno: 2`; `PERFIL_CANDIDATO` exige `nome`; `LISTAR_CANDIDATOS` exige ao menos uma entidade de listagem.
`numero`, `genero`, `vice` e `apenasIndeferidas` **não existem no contrato v2** — esses casos são resolvidos
pelo NLU local dos clientes (candidatos a v3).

## Treinamento
- **Base:** Qwen2.5-1.5B-Instruct · **Método:** QLoRA 4-bit NF4 (`r=16`, `alpha=32`, `dropout=0.05`,
  `target_modules=all-linear`), gradient checkpointing, `paged_adamw_8bit`, `batch 2 × accum 8` (efetivo 16),
  LR cosine `2e-4`, warmup 25, `max_length 256`.
- **Hardware:** NVIDIA GeForce RTX 5060 Laptop (8 GB) com descarga seletiva de camadas para RAM
  (`ai_model/scripts/train_hybrid.py`).
- **Execução v2.1:** 3 épocas, 3.663 passos, perda **2,3383 → 0,1321** (média dos últimos 20 registros: 0,1277).
- **Dataset:** `backend/retrain/build_nlu_dataset.py` sobre o pacote oficial
  (`dataVersion 20261001T175100Z`), ~190 templates em PT-BR com variação de superfície (caixa, acentos,
  prefixos/sufixos de cortesia, erros de digitação **apenas** em palavras de ligação — nunca em entidades).
- **554 exemplos externos (2,7 %)** com formulações reais/fora dos templates: 441 de uma lista fornecida pelo
  mantenedor e 173 derivadas das falhas medidas no gate anterior. O **rótulo nunca veio da fonte**: foi
  produzido pelo NLU determinístico dos clientes sobre o pacote oficial e aceito somente se for **ponto fixo**
  do normalizador do proxy (`backend/retrain/label_extra.mjs`). Proveniência e licença em `meta.json`.
- **Higiene de avaliação:** as perguntas de `contracts/nlu_golden_cases.json` (93 casos) foram removidas do
  treino — idênticas e quase idênticas (Jaccard ≥ 0,8). Todos os 20.618 rótulos passaram por
  `--verify` contra `api/_lib/normalize.js` sem divergências.

## Gate de qualidade (`backend/modal/eval_golden.py`)
Medido sobre os **93 casos** de `contracts/nlu_golden_cases.json` com `llama-cpp-python 0.3.19` (o mesmo
runtime do serviço), CPU, 8 threads.

**O que é bloqueante** (`check_gates`): JSON válido **sem** gramática ≥ 98 %, JSON válido **com** gramática
= 100 %, e queda do acerto médio de cargo/UF/partido do Q4_K_M vs Q8_0 ≤ 3 pp. `--min-entity-acc` vem
desligado por padrão. **Intenção, acerto por entidade e alucinação são reportados, mas não bloqueiam** a
promoção — os números abaixo devem ser lidos com isso em mente.

| Rodada | Modelo | JSON c/ gramática | JSON nativo | **Intenção** | cargo / UF / partido | nome | Alucinação | Latência (média/máx) |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 02/10 | v2 (2 épocas, só templates) | 100 % | 95,7 % ✗ | 77,4 % | 100 / 100 / 100 % | 92,3 % | 0 % | 1,06 s / 2,42 s |
| 03/10 | **v2.1** (3 épocas + 554 externos), Q4_K_M | **100 %** | **100 %** | **87,1 %** | 100 / 93,3 / 100 % | **100 %** | **0 %** | **0,77 s / 1,90 s** |
| 03/10 | v2.1, Q8_0 (baseline de quantização) | 100 % | — | 89,2 % | 100 / 100 / 100 % | 100 % | 0 % | 0,87 s / 2,14 s |

**Leitura honesta do v2.1.** O gate de código aprovou (JSON nativo 100 %, queda de entidades Q4×Q8 de 2,2 pp
≤ 3 pp). A intenção ficou em 87,1 % — **90,0 % se excluirmos os 3 casos que o contrato v2 não consegue
expressar** (`numero` de urna e `vice`, resolvidos pelo NLU local antes de a nuvem ser consultada). Dos 12
erros restantes: **8 são conservadores** (o modelo devolve `DESCONHECIDA` em vez de arriscar — o usuário vê
"não entendi", nunca um fato errado), **3 são as lacunas de contrato** citadas e **1 é ambíguo**
("Tenho que votar em um novo candidato" → recusa neutra, o lado seguro da Res. 23.755/2026). Nenhum erro
produz resposta factual errada e a alucinação de entidade é 0 %.

O v2 falhou por **cobertura**, não por capacidade: 90,5 % de acerto nos 74 casos dentro da distribuição de
treino e 26,3 % nos 19 adicionados naquele dia (nunca vistos). O v2.1 atacou exatamente isso e subiu 9,7 pp
no conjunto todo, 100 % de JSON nativo e latência 27 % menor — **sem trocar o modelo base**.
Promovido no lugar do `v1-legado` por ser estritamente melhor em produção (0,77 s vs ~12 s, sem 504 de cold
start, e com a intenção `RECOMENDACAO` que o legado não tem); rollback em
`modal run backend/modal/convert_gguf.py::promote --version v1-legado`.

## Uso (Transformers)
```python
from transformers import AutoTokenizer, AutoModelForCausalLM
model_id = "franciscoaleixo/SaibaTudo-Eleicao2026"
tok = AutoTokenizer.from_pretrained(model_id)
model = AutoModelForCausalLM.from_pretrained(model_id, device_map="auto", dtype="auto")
# Use o MESMO system prompt/template ChatML do treino: backend/modal/nlu_core.py (SYSTEM_PROMPT_V2).
```
Produção: GGUF **Q4_K_M** em CPU (llama.cpp) no Modal, com gramática GBNF e `scale-to-zero`; ver
`docs/BACKEND.md`. O Inference API serverless do Hugging Face **não** serve este fine-tune (provedor sem
mapeamento para modelos custom).

## Limitações e riscos
- Treinado só com dados públicos do TSE e templates/em PT-BR; pode errar com gírias, erros de digitação
  extremos ou nomes muito raros. Quando erra, o cliente descarta a interpretação e responde com o NLU local.
- Não sabe `numero` de urna, `genero`, `vice` nem `apenasIndeferidas` (fora do contrato v2).
- Não deve ser usado para avaliar candidatos, prever resultados ou influenciar o voto.

## Licenças
- Código do projeto: **MIT**. **Pesos**: derivados de **Qwen2.5-1.5B-Instruct** — confirme a licença da base em
  <https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct>; a licença MIT do código não se estende
  automaticamente aos pesos nem aos dados.
- Dados: Portal de Dados Abertos do TSE, **CC BY** (<https://dadosabertos.tse.jus.br>).
- Projeto independente, sem vínculo com o TSE, governo ou partidos.
