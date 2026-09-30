# Especificação do Modelo Hugging Face: SaibaTudo-Eleicao2026 🤖📦

Este documento detalha o ciclo de vida, arquitetura, treinamento e exportação do modelo **SaibaTudo-Eleicao2026** publicado no **Hugging Face Hub**.

---

## 🎯 Identificação do Modelo

- **Nome no Hugging Face**: `SaibaTudo-Eleicao2026`
- **Repositório Hugging Face**: `cauafrancisc/SaibaTudo-Eleicao2026` (ou organização correspondente)
- **Licença**: MIT
- **Idioma Principal**: Português do Brasil (`pt-BR`)
- **Tipo de Tarefa**: Geração de Texto Estruturado / Classificação de Intenção & Slot Filling Eleitoral

---

## 🧩 Schema de Entrada e Saída

### 1. Entrada (Prompt)

```text
Você é o assistente inteligente do SaibaTudo-Eleicao2026. Identifique menus, submenus, filtros e intenções.

Consulta do eleitor: Quero ver os candidatos a deputado estadual em Goiás focados em saúde
```

### 2. Saída (JSON Estruturado)

```json
{
  "intent": "FILTER_CANDIDATES",
  "target_route": "candidates/deputado_estadual",
  "menu_id": "menu_deputado_estadual",
  "submenu_id": "sub_go",
  "filters": {
    "cargo": "DEPUTADO_ESTADUAL",
    "estado_uf": "GO",
    "partido": null,
    "tema": "saude",
    "nome_candidato": null
  },
  "direct_answer": "Mostrando candidatos a Deputado Estadual em Goiás com propostas voltadas à saúde.",
  "suggested_questions": [
    "Quantos deputados estaduais serão eleitos em GO?",
    "Ver lista de todos os partidos com candidatos em GO"
  ]
}
```

---

## 🛠️ Pipeline de Fine-Tuning

O modelo é ajustado com **PEFT/LoRA (Low-Rank Adaptation)** sobre um modelo base compacto e eficiente:

- **Modelos Base Recomendados**:
  - `meta-llama/Llama-3.2-1B-Instruct` (Excelente para raciocínio e seguimento de instruções estruturadas)
  - `Qwen/Qwen2.5-0.5B-Instruct` (Ultraleve, ideal para conversão direta para On-Device Android)
  - `neuralmind/bert-base-portuguese-cased` (Para abordagem focada em classificação pura de menus e tokens NER)

### Parâmetros LoRA:
- Rank ($r$): `16`
- Alpha ($\alpha$): `32`
- Target Modules: `["q_proj", "k_proj", "v_proj", "o_proj"]`
- Dropout: `0.05`
- Otimizador: `paged_adamw_8bit`

---

## 📤 Publicação no Hugging Face Hub

Para treinar e publicar o modelo no Hugging Face:

1. Instale as dependências:
   ```bash
   pip install -r ai_model/requirements.txt
   ```
2. Gere os dados de treino sintéticos:
   ```bash
   python ai_model/scripts/dataset_generator.py
   ```
3. Execute o treinamento LoRA:
   ```bash
   python ai_model/scripts/finetune_model.py --epochs 3 --batch_size 4
   ```
4. Exporte para ONNX para uso mobile:
   ```bash
   python ai_model/scripts/export_model.py
   ```
5. Publique no Hugging Face:
   ```bash
   export HF_TOKEN="seu_token_hf"
   python ai_model/scripts/push_to_hub.py --repo_id "seu-usuario/SaibaTudo-Eleicao2026"
   ```
