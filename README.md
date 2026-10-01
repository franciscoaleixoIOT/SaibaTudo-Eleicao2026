# SaibaTudo-Eleicao2026 🗳️🇧🇷

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Android](https://img.shields.io/badge/Platform-Android%20API%2024%2B-green.svg)](https://developer.android.com)
[![Hugging Face](https://img.shields.io/badge/%F0%9F%A4%97%20Model-franciscoaleixo%2FSaibaTudo--Eleicao2026-blue)](https://huggingface.co/franciscoaleixo/SaibaTudo-Eleicao2026)
[![Kotlin](https://img.shields.io/badge/Language-Kotlin%202.x-purple.svg)](https://kotlinlang.org)
[![Python](https://img.shields.io/badge/Python-3.10%20%7C%203.11%20%7C%203.12-3776AB.svg)](https://python.org)

Aplicativo Android de utilidade pública e código aberto voltado para as **Eleições Gerais de 2026 no Brasil**, potencializado por um modelo de Inteligência Artificial personalizado publicado no **Hugging Face**: [`franciscoaleixo/SaibaTudo-Eleicao2026`](https://huggingface.co/franciscoaleixo/SaibaTudo-Eleicao2026).

O objetivo do projeto é empoderar o cidadão brasileiro através de uma experiência interativa e inteligente, na qual a IA traduz pesquisas e dúvidas em **menus dinâmicos, submenus contextuais, filtros automáticos (cargo com máscara de dígitos oficiais, localização/UF, processos administrativos, histórico de mandatos) e listas detalhadas de candidatos e informações eleitorais oficiais**.

---

## 🌟 Principais Recursos

- **🧭 Navegação e Menus Conduzidos por IA**:
  O usuário não precisa se perder em menus estáticos. Ao expressar o que procura em linguagem natural (ex: *"Quem está disputando o governo de Minas Gerais?"* ou *"Candidatos ao Senado em SP com Ficha Limpa que priorizam saúde"*), a IA automaticamente:
  - Seleciona o **menu principal** correspondente.
  - Abre o **submenu** adequado (ex: estado, turno ou debate).
  - Preenche os **chips de filtros** (Cargo, UF, Partido, Tema de proposta, Processos, Reeleição).
  - Exibe a lista filtrada com resposta direta resumida.

- **📍 Filtro por Localização Inteligente (Ativo por Padrão & Desligável a Qualquer Momento)**:
  O aplicativo inicializa com a localização ativa para a região e estado do eleitor (ex: SP / Região Sudeste), exibindo prioritariamente os candidatos pertinentes. Com um simples toque no interruptor superior (*Switch* "Localização Ativa"), o eleitor desativa o filtro geográfico para navegar livremente por todo o Brasil ou selecionar outras macro-regiões e UFs.

- **🔢 Regras Oficiais de Dígitos e Cargos do TSE 2026**:
  Filtros e identificadores estritamente alinhados com o Tribunal Superior Eleitoral:
  1. **Deputado Federal**: 4 dígitos
  2. **Deputado Estadual ou Distrital**: 5 dígitos
  3. **Senador – 1ª vaga**: 3 dígitos
  4. **Senador – 2ª vaga**: 3 dígitos *(regra de renovação de 2/3 com voto duplo; repetição do mesmo candidato anula o segundo voto)*
  5. **Governador**: 2 dígitos
  6. **Presidente da República**: 2 dígitos

- **⚖️ Transparência, Ficha Limpa e Processos Administrativos**:
  Filtros dinâmicos para:
  - **Ficha Limpa (LC 135/2010)**: Candidatos elegíveis sem condenações em órgãos colegiados.
  - **Zero Processos Administrativos**: Destaque para fichas limpas de condutas disciplinares.
  - **Histórico Eleitoral**: Filtro por Estreantes (1º mandato), Candidatos à Reeleição e Veteranos (2+ mandatos).

- **🗳️ Simulador Interativo da Urna Eletrônica 2026**:
  Simulador completo da urna eletrônica brasileira com teclado numérico (1 a 0, BRANCO, CORRIGE, CONFIRMA), visor de votação idêntico ao oficial com fotos e legendas, transição pelas 6 etapas na ordem exata definida pelo TSE e validação em tempo real com alerta de voto duplicado para a segunda vaga ao Senado. Acessível pelo botão superior ou diretamente do perfil de qualquer candidato via "Simular Voto".

- **📊 Dados 100% Oficiais e Dinâmicos do TSE**:
   Base alimentada exclusivamente pelos arquivos oficiais do **Portal de Dados Abertos do TSE** (`dadosabertos.tse.jus.br`) e do **CDN oficial** (`cdn.tse.jus.br`), processados por um pipeline ETL próprio (`ai_model/scripts`):
   - **20.988 candidatos** realmente registrados nas Eleições Gerais 2026 (14 presidenciáveis oficiais).
   - **3.467 pesquisas eleitorais** registradas no TSE.
   - **2.658 fotos oficiais** de candidatos, planos de governo (PDF), situação de julgamento, Ficha Limpa, histórico de mandatos e redes sociais.
   - **27 TREs estaduais** + sistemas nacionais do TSE (DivulgaCandContas, Autoatendimento do Eleitor, Resultados) + órgãos de acompanhamento/fiscalização (Senado, Câmara, Congresso, MPF, TCU, AGU, CGU, STF, MJSP).
   - **Nenhum dado simulado, especulativo ou de fonte não-oficial.**

- **⚡ Resiliência On-Device & Conectividade Híbrida**:
  Capacidade de operar em modo conectado via Hugging Face Inference API ou modo local offline usando pesos locais fine-tunados com QLoRA.

- **⚖️ 100% Neutro, Transparente e Apartidário**:
  Todo o código e dataset do modelo são públicos, auditáveis e distribuídos sob a licença permissiva **MIT**.

---

## 🏛️ Estrutura do Repositório

```
SaibaTudo-Eleicao2026/
├── .github/                      # CI/CD Workflows (Android build, validação da IA)
├── app/                          # Código-fonte do aplicativo Android
│   ├── src/main/java/.../
│   │   ├── ai/                   # Motores de inferência, prompts e modelos de IA
│   │   ├── core/                 # Constantes, rede e utilitários
│   │   ├── data/                 # Repositórios e fontes de dados (TSE e Local)
│   │   ├── domain/               # Entidades de negócio, use cases e contratos
│   │   └── ui/                   # Telas, menus dinâmicos, listas e componentes
│   └── build.gradle.kts          # Configuração Gradle do módulo Android
├── ai_model/                     # Pipeline do modelo Hugging Face (SaibaTudo-Eleicao2026)
│   ├── data/                     # Datasets de treinamento e intents eleitorais
│   ├── scripts/                  # Scripts de geração, fine-tuning, exportação e upload
│   ├── requirements.txt          # Dependências Python (PyTorch, Transformers, PEFT, TRL)
│   └── README.md                 # Model Card oficial para publicação no Hugging Face Hub
├── docs/                         # Documentação técnica aprofundada
│   ├── PROJECT_MEMORY.md         # Memória do projeto, decisões de arquitetura e histórico
│   ├── ARCHITECTURE.md           # Arquitetura e fluxo reativo menus/filtros
│   ├── HUGGINGFACE_MODEL.md      # Especificação completa do modelo de IA
│   ├── API_AND_DATA.md           # Integração com APIs e dados abertos do TSE
│   └── CONTRIBUTING.md           # Diretrizes para colaboração no projeto
├── LICENSE                       # Licença MIT
└── README.md                     # Visão geral do projeto
```

---

## 🤖 O Modelo de IA (`SaibaTudo-Eleicao2026`)

O modelo foi projetado para compreender as especificidades das Eleições Gerais brasileiras de 2026 (Presidência da República, Governos Estaduais, 2/3 do Senado Federal, Câmara dos Deputados e Assembleias Legislativas).

### Exemplo de Predição do Modelo:

**Prompt de Entrada:**
> *"Quero ver os deputados federais de São Paulo do partido NOVO que defendem tecnologia e inovação"*

**Saída em JSON Estruturado gerada pelo modelo:**
```json
{
  "intent": "FILTER_CANDIDATES",
  "target_route": "candidates/deputado_federal",
  "menu_id": "menu_deputado_federal",
  "submenu_id": "sub_sp",
  "filters": {
    "cargo": "DEPUTADO_FEDERAL",
    "estado_uf": "SP",
    "partido": "NOVO",
    "tema": "tecnologia",
    "nome_candidato": null
  },
  "direct_answer": "Mostrando candidatos a Deputado Federal por São Paulo pelo partido NOVO com foco em tecnologia.",
  "suggested_questions": [
    "Quantos deputados federais são eleitos por SP?",
    "Ver outros partidos com candidatos na área de tecnologia em SP"
  ]
}
```

Para mais detalhes sobre o treinamento, quantização e upload do modelo, consulte [`docs/HUGGINGFACE_MODEL.md`](docs/HUGGINGFACE_MODEL.md).

---

## 🚀 Como Executar o Projeto

### 📱 1. Aplicativo Android

1. Abra o projeto no **Android Studio** (Koala / Ladybug ou superior).
2. Certifique-se de ter o **JDK 17 ou superior** configurado.
3. Conecte um dispositivo físico ou inicie um emulador Android (API 24+).
4. Execute via terminal:
   ```bash
   ./gradlew assembleDebug
   ```
   Ou clique no botão **Run** (`Shift + F10`) no Android Studio.

---

### 🧠 2. Pipeline de Dados Oficiais + Treinamento + Publicação da IA (Hugging Face)

> **Pré-requisito (Windows):** o `sitecustomize.py` do venv já contorna o bloqueio WDAC do `_lzma.pyd`. Para reduzir varredura do antivírus, execute `Add-DefenderExclusions.ps1` **como administrador**.

1. Entre no diretório do modelo e crie o ambiente virtual:
   ```bash
   cd ai_model
   python -m venv .venv
   .venv\Scripts\activate        # Windows  |  source .venv/bin/activate (Linux/macOS)
   pip install -r requirements.txt
   ```

2. Baixe e processe os dados OFICIAIS do TSE (gera os assets JSON do app):
   ```bash
   python scripts/build_official_data.py       # candidatos, pesquisas, regras + fotos
   python scripts/build_fontes_oficiais.py     # 27 TREs + órgãos oficiais
   ```

3. Gere o dataset de treino a partir dos dados oficiais:
   ```bash
   python scripts/build_training_dataset.py    # dataset_oficial_treino.json (5.192 pares)
   ```

4. Treine na GPU local com memória híbrida (base sólida Qwen2.5-1.5B, QLoRA 4-bit):
   ```bash
   python scripts/train_hybrid.py --epochs 2
   ```

5. Funda os adaptadores LoRA e valide com fatos oficiais:
   ```bash
   python scripts/merge_and_export.py
   python scripts/test_inference.py
   ```

6. Publique no Hugging Face Hub:
   ```bash
   hf auth login                # ou: export HF_TOKEN="seu_token"
   python scripts/push_to_hub.py --repo_id "franciscoaleixo/SaibaTudo-Eleicao2026"
   ```

---

## 🛠️ Tecnologias Utilizadas

- **Android / Mobile**: Kotlin 2.x, Android Jetpack, Coroutines & Flow, Material 3 Design.
- **Inteligência Artificial**: Hugging Face Hub, Transformers, PEFT/LoRA, TRL, ONNX Runtime Mobile, LiteRT.
- **Fontes de Dados**: Tribunal Superior Eleitoral (TSE) - DivulgaCandContas e Dados Abertos.
- **DevOps**: GitHub Actions (CI/CD contínuo para compilação Android e validação da IA).

---

## 👥 Autores & Colaboradores

- **Francisco Aleixo** ([@franciscoaleixoIOT](https://github.com/franciscoaleixoIOT)) — Mantenedor & Autor Principal
- **Cauã Francisco** ([@Cacx01](https://github.com/Cacx01)) — Colaborador Principal (`cauafrancisc@gmail.com`)

---

## 📄 Licença

Este projeto é distribuído sob os termos da licença **MIT**. Consulte o arquivo [LICENSE](LICENSE) para mais informações.
