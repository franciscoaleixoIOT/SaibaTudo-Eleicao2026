---
language:
- pt
license: mit
tags:
- saibatudo-eleicao2026
- elections-2026
- brazil-elections
- intent-classification
- slot-filling
- text-classification
- menu-navigation
datasets:
- custom-elections-2026-ptbr
metrics:
- f1
- accuracy
base_model: Qwen/Qwen2.5-0.5B-Instruct
pipeline_tag: text-generation
---

# SaibaTudo-Eleicao2026 🗳️🤖

O modelo **SaibaTudo-Eleicao2026** é um modelo de linguagem e roteamento inteligente desenvolvido especificamente para orientar o eleitor brasileiro nas **Eleições Gerais de 2026**.

Ele atua como o cérebro do aplicativo Android [SaibaTudo-Eleicao2026](https://github.com/franciscoaleixoIOT/SaibaTudo-Eleicao2026), traduzindo perguntas em linguagem natural em:
1. **Navegação de Menus e Submenus**: Direciona instantaneamente o usuário para a tela e seção desejada.
2. **Extração de Filtros (Slot Filling)**: Identifica cargos (`PRESIDENTE`, `GOVERNADOR`, `SENADOR`, `DEPUTADO_FEDERAL`, `DEPUTADO_ESTADUAL`), estados/UF, partidos políticos e temas (`educação`, `saúde`, `economia`, `segurança`).
3. **Respostas Diretas & Fatos Eleitorais**: Esclarece dúvidas frequentes sobre datas de 1º e 2º turnos, locais de votação, justificativa eleitoral e regras oficiais do TSE.

---

## 🎯 Capacidades e Formato de Saída (JSON Estruturado)

O modelo recebe a consulta do eleitor e responde com um objeto JSON validado:

```json
{
  "intent": "FILTER_CANDIDATES",
  "target_route": "candidates/governador",
  "menu_id": "menu_governador",
  "submenu_id": "sub_sp",
  "filters": {
    "cargo": "GOVERNADOR",
    "estado_uf": "SP",
    "partido": null,
    "tema": "seguranca",
    "nome_candidato": null
  },
  "direct_answer": "Mostrando candidatos a Governador de São Paulo com propostas voltadas à segurança pública.",
  "suggested_questions": [
    "Quais são os candidatos ao Senado por SP?",
    "Quando é o debate para governador em SP?"
  ]
}
```

---

## 🚀 Como Usar via Transformers (Python)

```python
import json
from transformers import AutoTokenizer, AutoModelForCausalLM

model_id = "franciscoaleixo/SaibaTudo-Eleicao2026"

tokenizer = AutoTokenizer.from_pretrained(model_id)
model = AutoModelForCausalLM.from_pretrained(
    model_id,
    device_map="auto",
    torch_dtype="auto"
)

prompt = """<|im_start|>system
Você é o assistente do app SaibaTudo-Eleicao2026. Identifique menus e filtros para a eleição brasileira de 2026.<|im_end|>
<|im_start|>user
Quero ver os candidatos a senador em Minas Gerais focados em saúde pública<|im_end|>
<|im_start|>assistant
"""

inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
outputs = model.generate(**inputs, max_new_tokens=256, temperature=0.1)
response_text = tokenizer.decode(outputs[0][inputs.input_ids.shape[1]:], skip_special_tokens=True)

parsed_json = json.loads(response_text)
print(parsed_json)
```

---

## 📱 Execução On-Device no Android

O modelo está disponível nos seguintes formatos exportados:
- **ONNX Runtime** (`model.onnx` com quantização INT8 / FP16)
- **LiteRT / TFLite** (`model.tflite` para aceleração NPU/GPU no Android)
- **GGUF** (`SaibaTudo-Eleicao2026-Q4_K_M.gguf` para inferência via llama.cpp / ExecuTorch)

---

## ⚖️ Licença e Responsabilidade

Distribuído sob a licença **MIT**.
Os dados eleitorais são oriundos do Repositório de Dados Abertos do **Tribunal Superior Eleitoral (TSE)**. O modelo não possui afiliação partidária e tem fins estritamente cívicos e informativos.
