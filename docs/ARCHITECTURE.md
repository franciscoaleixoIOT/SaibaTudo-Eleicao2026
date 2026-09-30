# Arquitetura do Sistema - SaibaTudo-Eleicao2026 🏛️📱

O **SaibaTudo-Eleicao2026** é uma plataforma cívica móvel integrada a um modelo de Inteligência Artificial especializado hospedado no **Hugging Face** (`SaibaTudo-Eleicao2026`), projetado para tornar a consulta eleitoral intuitiva, dinâmica e acessível a qualquer cidadão brasileiro nas Eleições Gerais de 2026.

---

## 🏗️ Visão Geral da Arquitetura

O sistema adota o padrão **Clean Architecture** e **MVI/MVVM** com divisão de responsabilidades estrita:

```
┌────────────────────────────────────────────────────────┐
│                   Camada de Apresentação (UI)          │
│   Menus Dinâmicos │ Filtros Inteligentes │ Listas │ Info │
└───────────────────────────▲────────────────────────────┘
                            │
┌───────────────────────────┴────────────────────────────┐
│                    Camada de Domínio                   │
│   UseCases (ProcessAiQuery, GetFilteredCandidates)     │
│   Modelos de Domínio (Candidate, MenuItem, Filter)     │
└─────────────▲────────────────────────────▲─────────────┘
              │                            │
┌─────────────┴───────────────┐ ┌──────────┴─────────────┐
│       Camada de Dados       │ │       Camada de IA     │
│   - TSE Data Sources        │ │ - Hugging Face Client  │
│   - Local Cache (Room/JSON) │ │ - On-Device Inference  │
│   - ElectionsRepositoryImpl │ │ - Intent & Slot Parser │
└─────────────────────────────┘ └────────────────────────┘
```

---

## 🤖 Como a IA comanda Menus, Submenus, Filtros e Listas

A grande inovação do **SaibaTudo-Eleicao2026** é a navegação impulsionada por IA estruturada:

1. **Entrada em Linguagem Natural**:
   O eleitor digita ou fala: *"Quais são os candidatos ao senado em Minas Gerais que apoiam a educação pública?"*

2. **Processamento pelo Modelo SaibaTudo-Eleicao2026**:
   O modelo identifica a intenção e faz a extração de entidades (Slot Filling), gerando um JSON estruturado:
   ```json
   {
     "intent": "FILTER_CANDIDATES",
     "target_route": "candidates/senador",
     "menu_id": "menu_senador",
     "submenu_id": "sub_mg",
     "filters": {
       "cargo": "SENADOR",
       "estado_uf": "MG",
       "tema": "educacao"
     }
   }
   ```

3. **Roteamento e Filtragem Reativa**:
   - A UI seleciona o **Menu** de Senador.
   - Aplica os **Chips de Filtro** (Estado: MG | Tema: Educação).
   - Consulta o repositório de dados com os parâmetros extraídos.
   - Apresenta a **Lista de Candidatos** filtrada instantaneamente.

---

## 🗂️ Estrutura de Módulos e Pacotes

```
app/src/main/java/com/example/saibatudo_eleicao2026/
├── core/
│   ├── constants/       # Constantes do sistema, rotas e IDs
│   └── network/         # Handlers de rede, wrappers de Result
├── data/
│   ├── datasource/      # Fontes locais e remotas (TSE / Cache)
│   ├── model/           # Entidades de banco e DTOs de API
│   └── repository/      # Implementação dos repositórios
├── domain/
│   ├── model/           # Entidades de negócio puras
│   ├── repository/      # Interfaces de repositório
│   └── usecase/         # Casos de uso de negócio
├── ai/
│   ├── engine/          # Motores de inferência (On-Device & Hugging Face)
│   ├── model/           # Modelos de intenção, slots e rotas de IA
│   └── prompt/          # Templates de prompt para extração estruturada
└── ui/
    ├── components/      # Componentes visuais reutilizáveis
    ├── navigation/      # Grafo de navegação e rotas
    ├── screens/         # Telas de Menus, Submenus, Filtros e Listas
    └── MainActivity.kt  # Ponto de entrada do app
```

---

## ⚡ Modos de Execução da IA

O projeto foi preparado para operar em dois modos intercambiáveis:
1. **Cloud / Hugging Face Inference API**: Envia a consulta diretamente para o endpoint do modelo no Hugging Face Hub para máxima precisão sem sobrecarregar a memória do dispositivo.
2. **On-Device (Offline First)**: Utiliza pesos convertidos em **ONNX Runtime** ou **LiteRT** para que o eleitor consiga navegar e filtrar mesmo em zonas eleitorais com sinal fraco ou sem internet.
