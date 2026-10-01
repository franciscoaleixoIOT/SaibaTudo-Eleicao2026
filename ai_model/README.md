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
base_model: Qwen/Qwen2.5-1.5B-Instruct
pipeline_tag: text-generation
---

# SaibaTudo-Eleicao2026 — modelo de NLU (intenção e entidades)

Modelo de linguagem pequeno (ajuste fino QLoRA de **Qwen2.5-1.5B-Instruct**) que **interpreta perguntas** de eleitores sobre as
Eleições Gerais 2026 e devolve **JSON curto com intenção e entidades** (cargo, UF, partido, nome, tema…). Faz parte do app
**SaibaTudo Eleições 2026** (<https://saibatudo.net>, código em <https://github.com/franciscoaleixoIOT/SaibaTudo-Eleicao2026>).

> ## Papel do modelo (importante)
> - **Não fornece fatos.** Nomes, números, situações e resultados exibidos pelo app vêm **exclusivamente** dos dados abertos do TSE
>   carregados no aparelho/servidor. Campos `direct_answer`/`suggested_questions` da versão 2 do formato **não devem ser exibidos**.
> - **Não recomenda, compara nem prevê candidatos** (Res. TSE 23.755/2026). Pedidos desse tipo são recusados pelo app.
> - É **opcional e opt-in**: o app funciona 100 % sem o modelo (NLU local por regras); a nuvem só ajuda quando o NLU local não entende a pergunta.
> - A saída é **revalidada** pelo cliente (cargo/UF/partido do vocabulário; nome precisa existir nos dados).

## Versões
| Versão | Data | Base | Dados de treino | Observações |
| :-- | :-- | :-- | :-- | :-- |
| v2 (publicada) | 01/10/2026 | Qwen2.5-1.5B-Instruct | 5.192 pares derivados de dados oficiais do TSE (extração de 30/09/2026) | formato legado de saída (abaixo); nomes de candidatos de 30/09; o termo "ficha limpa" é mapeado pelo servidor para "candidaturas deferidas" |
| v3 (planejada) | pós-1º turno | idem | gerado por `backend/retrain/build_nlu_dataset.py` a partir do pacote vigente | **formato novo** (`LISTAR_CANDIDATOS`, `RESULTADOS`, `SEGUNDO_TURNO`, `ELEGIBILIDADE`, `PATRIMONIO`, `RECOMENDACAO`…), gate de qualidade e quantização GGUF Q4 |

Os **dados não exigem retreino**: partidos, nomes e UFs vêm do pacote atualizado diariamente. O modelo é retreinado só quando surgem
intenções/vocabulário novos (ver `docs/ATUALIZACAO_DADOS_E_IA.md`).

## Formato de saída (v2, legado)
```json
{
  "intent": "FILTER_CANDIDATES",
  "target_route": "candidates/governador",
  "menu_id": "menu_governador",
  "submenu_id": "sub_sp",
  "filters": {"cargo": "GOVERNADOR", "estado_uf": "SP", "partido": null, "tema": "seguranca",
              "nome_candidato": null, "apenas_ficha_limpa": null, "max_processos_administrativos": null,
              "mandatos_anteriores": null},
  "direct_answer": "(IGNORADO pelo app)",
  "suggested_questions": ["(IGNORADO pelo app)"]
}
```
O backend (`api/_lib/normalize.js`) converte esse formato para o contrato atual (`docs/DATA_CONTRACT.md` §9), descartando valores fora do vocabulário.

## Uso (Transformers)
```python
from transformers import AutoTokenizer, AutoModelForCausalLM
model_id = "franciscoaleixo/SaibaTudo-Eleicao2026"
tok = AutoTokenizer.from_pretrained(model_id)
model = AutoModelForCausalLM.from_pretrained(model_id, device_map="auto", torch_dtype="auto")
# Use o MESMO prompt/ template de treino (ver ai_model/scripts/test_inference.py e backend/modal/nlu_app.py).
```
Produção: GGUF **Q4_K_M** em CPU (llama.cpp) no Modal, com gramática JSON; ver `docs/BACKEND.md`.
O Inference API serverless do Hugging Face **não** serve este fine-tune (provedor sem mapeamento para modelos custom).

## Limitações e riscos
- Treinado só com dados públicos do TSE e templates em português; pode errar com gírias, erros de digitação extremos ou nomes muito raros.
- Não deve ser usado para avaliar candidatos, prever resultados ou influenciar o voto.
- Qualidade do Q4 e latência em produção ainda precisam ser medidas (gate em `backend/modal/convert_gguf.py`).

## Licenças
- Código do projeto: **MIT**. **Pesos**: derivados de **Qwen2.5-1.5B-Instruct** — confirme a licença da base em <https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct>; a licença MIT do código não se estende automaticamente aos pesos nem aos dados.
- Dados: Portal de Dados Abertos do TSE, **CC BY** (<https://dadosabertos.tse.jus.br>).
- Projeto independente, sem vínculo com o TSE, governo ou partidos.
