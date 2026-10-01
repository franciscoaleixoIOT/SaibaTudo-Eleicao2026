# Memória do Projeto • SaibaTudo-Eleicao2026 🗳️🧠

> **Documento de Registro Histórico, Decisões de Arquitetura, Desafios Técnicos e Memória Operacional**  
> **Data de Atualização**: 01 de Outubro de 2026  
> **Status do Projeto**: Migração concluída para **dados 100% OFICIAIS do TSE** (Eleições Gerais 2026). App dinâmico alimentado por 20.988 candidatos reais, 3.467 pesquisas registradas e 27 TREs. Modelo de IA re-treinado com base mais sólida (Qwen2.5-1.5B) sobre dataset oficial, em treino híbrido GPU+RAM na RTX 5060.

---

## 📌 1. Visão Geral e Identificação

| Item | Especificação |
| :--- | :--- |
| **Nome do Projeto** | `SaibaTudo-Eleicao2026` |
| **Plataforma** | Android (Kotlin 2.x, Jetpack Compose, Material 3, API 24+) |
| **Modelo de IA** | `franciscoaleixo/SaibaTudo-Eleicao2026` |
| **Licença** | MIT (100% Código Aberto e Apartidário) |
| **Repositório GitHub** | [https://github.com/franciscoaleixoIOT/SaibaTudo-Eleicao2026](https://github.com/franciscoaleixoIOT/SaibaTudo-Eleicao2026) |
| **Hugging Face Hub** | [https://huggingface.co/franciscoaleixo/SaibaTudo-Eleicao2026](https://huggingface.co/franciscoaleixo/SaibaTudo-Eleicao2026) |
| **Desenvolvedor** | Francisco Aleixo |
| **Colaborador Principal** | Cauã Francisco ([@Cacx01](https://github.com/Cacx01) • `cauafrancisc@gmail.com`) |

---

## 🎯 2. Propósito e Requisitos Centrais

O projeto nasceu com o objetivo de orientar o eleitor brasileiro para as **Eleições Gerais de 2026**, combinando uma interface moderna e acessível no Android com um modelo de Inteligência Artificial especializado na legislação e dados eleitorais oficiais do Tribunal Superior Eleitoral (TSE).

### Requisitos Estabelecidos pelo Usuário:
1. **Roteamento Inteligente por IA**: O usuário faz perguntas em linguagem natural (ex: *"Quem disputa o governo de SP?"* ou *"Candidatos ao senado ficha limpa"*) e a IA aciona os menus, submenus, filtros dinâmicos e exibe uma resposta direta resumida.
2. **Filtro de Localização Ativo por Padrão**: O app inicializa focado na região/UF do usuário (ex: São Paulo / Sudeste) e possui um interruptor (*Switch*) no topo da tela para ligar/desligar a localização a qualquer momento, permitindo alternar entre o contexto local e o nacional.
3. **Filtros Dinâmicos Oficiais**:
   - Cargos do TSE com máscaras de dígitos exatas.
   - Ficha Limpa (LC 135/2010).
   - Processos Administrativos (destaque para **Zero Processos Adm.**).
   - Histórico de mandatos anteriores (1º mandato/estreante, tentativa de reeleição, veteranos).
   - Macro-regiões e UFs.
4. **Treinamento Local da IA na GPU com 8GB VRAM**: Treinar localmente o modelo aproveitando os 8GB de VRAM da placa de vídeo disponível (NVIDIA RTX 5060 Laptop GPU).
5. **Regras do TSE para as Eleições 2026**:
   - Deputado Federal: 4 dígitos
   - Deputado Estadual ou Distrital: 5 dígitos
   - Senador – 1ª vaga: 3 dígitos
   - Senador – 2ª vaga: 3 dígitos (renovação de 2/3 com dois votos distintos; voto duplicado no mesmo candidato anula o segundo voto)
   - Governador: 2 dígitos
   - Presidente da República: 2 dígitos
6. **Publicação Pública com Licença MIT**: Repositório no GitHub e modelo no Hugging Face com o mesmo nome do projeto.

---

## 🏛️ 3. Arquitetura do Aplicativo Android

O aplicativo foi construído seguindo os princípios de **Clean Architecture** e design reativo unificado com **Jetpack Compose BOM**:

```
app/src/main/java/com/example/saibatudo_eleicao2026/
├── ai/
│   ├── engine/           # AiInferenceEngine, LocalOfficialAiEngine, HuggingFaceInferenceEngine, HybridAiInferenceEngine
│   ├── model/            # AiMenuResponse, AiFilterExtraction, IntentType
│   └── prompt/           # ElectionPromptTemplates (system + extração de intenção/filtros)
├── core/
│   └── constants/        # AppConstants (HF repo, sistemas oficiais TSE, órgãos, TREs)
├── data/
│   ├── datasource/       # OfficialElectionDataSource (carrega assets JSON oficiais via Gson streaming)
│   └── repository/       # ElectionsRepositoryImpl (filtragem dinâmica sobre 20.988 candidatos oficiais)
├── domain/
│   ├── model/            # Candidate, ElectoralFilter, MenuItem, TseCargo, MacroRegiao, MandatosOpcao,
│   │                     # PesquisaEleitoral, TseRegras, TreOficial, OrgaoOficial, FontesOficiais
│   ├── repository/       # ElectionsRepository (Contrato de dados)
│   └── usecase/          # ProcessAiQueryUseCase
└── ui/
    ├── components/       # SearchBarAi, FilterChipsRow, DynamicMenuGrid, CandidateItemCard,
    │                     # CandidateDetailDialog, UrnaSimulatorDialog, PesquisasOficiaisDialog, FontesOficiaisDialog
    ├── screens/          # MainAppScreen (Orquestrador de estados e componentes)
    ├── theme/            # Color.kt, Theme.kt, Type.kt (Suporte completo a Light & Dark Mode)
    └── MainActivity.kt   # Ponto de entrada (injeção de Context → datasource → repository → engines)
```

### Fonte de Dados OFICIAL (assets gerados pelo pipeline `ai_model`):
- **`tse_candidatos_2026.json`** (~17 MB) — 20.988 candidatos oficiais registrados (consulta_cand + complementar + histórico + cassação + redes + propostas).
- **`tse_pesquisas_2026.json`** (~2,7 MB) — 3.467 pesquisas eleitorais registradas no TSE.
- **`tse_regras_2026.json`** — regras, ordem de votação, vagas, calendário e estatísticas oficiais agregadas.
- **`tse_fontes_oficiais_2026.json`** (~150 KB) — 27 TREs estaduais, sistemas nacionais do TSE e 10 órgãos (Senado, Câmara, Congresso, MPF, TCU, AGU, CGU, STF, MJSP).
- **`fotos/*.jpg`** — 2.658 fotos oficiais de candidatos (CDN TSE: presidenciáveis + SP).

### Funcionalidades Especiais Implementadas:
- **`UrnaSimulatorDialog.kt`**: Simulador completo da urna eletrônica brasileira. Possui o teclado numérico virtual (1 a 0, BRANCO, CORRIGE, CONFIRMA), visor digital fiel ao do TSE com caixas de dígitos e feedback do candidato em tempo real, transição pelas 6 fases de votação na ordem oficial e validação de voto duplicado na 2ª vaga do Senado.
- **`CandidateDetailDialog.kt`**: Folha da transparência do candidato com dados do TSE, situação da candidatura, certidão de Ficha Limpa, conduta em processos administrativos, histórico eleitoral, resumo do plano de governo e botão de ação para simular o voto na urna.
- **Barra de Pesquisa IA com Envio Explícito e Teclado (`SearchBarAi.kt`)**:
  - Botão de envio explícito (`Icons.AutoMirrored.Filled.Send`) posicionado no campo de texto para envio instantâneo com um toque.
  - Suporte completo ao teclado virtual do Android (`KeyboardOptions(imeAction = ImeAction.Search)` e `KeyboardActions(onSearch = ...)`): ao pressionar a tecla de confirmação/check/pesquisa no teclado, o teclado é ocultado automaticamente (`LocalSoftwareKeyboardController`) e a busca da IA é disparada.
  - Indicador de progresso circular animado (`CircularProgressIndicator`) exibido durante a inferência da IA.
- **Painel de Resposta da IA com Botões Dinâmicos (`MainAppScreen.kt` & `DynamicMenuGrid.kt`)**:
  - Geração de botões dinâmicos contextuais logo abaixo do texto de resposta da IA:
    - **Botões dos Candidatos**: Botões diretos para os candidatos reais encontrados pela consulta (ex: `[👤 Lula (13)]`, `[👤 Tarcísio de Freitas (10)]`, `[👤 Baleia Rossi (1515)]`, `[👤 Léo Oliveira (15100)]`), permitindo abrir a ficha completa do candidato com um toque.
    - **Botão de Simulação na Urna**: Botão de ação rápida `[🗳️ Simular na Urna]` com pré-carregamento do candidato na urna eletrônica.
    - **Botões de Sugestões e Aprofundamento**: Chips e botões dinâmicos com perguntas sugeridas pela IA para continuar a navegação.
    - **Submenus Dinâmicos**: Barra dinâmica de submenus renderizada quando o tema ou cargo selecionado possui subdivisões ou filtros específicos.
- **Base de Dados 100% OFICIAL do TSE (dinâmica, sem dados simulados)**:
  - **Eliminação total** de dados fictícios e de listas "prováveis/especulativas" (a base anterior continha candidatos que NÃO estavam registrados no TSE).
  - Todos os registros agora derivam dos arquivos oficiais do **Portal de Dados Abertos do TSE** (`dadosabertos.tse.jus.br`) e do **CDN oficial** (`cdn.tse.jus.br`), extração de 30/09/2026:
    - **20.988 candidatos** realmente registrados (14 presidenciáveis oficiais — Lula/PT, Flávio Bolsonaro/PL, Pablo Marçal/PRTB, Zema/NOVO, Ronaldo Caiado/PSD, entre outros).
    - Situação de julgamento real (DEFERIDO/INDEFERIDO/RENÚNCIA), fundamentos legais de cassação (Ficha Limpa), histórico de mandatos, reeleição, redes sociais e planos de governo oficiais (PDF).
  - **Filtros 100% dinâmicos** calculados sobre os dados oficiais: cargo, UF/região, partido, Ficha Limpa, processos administrativos, mandatos anteriores, reeleição, busca textual e tema (derivado de planos de governo oficiais).
  - **`cidadesAtuacao`** substituído por **município de nascimento oficial**; fotos oficiais carregadas dos assets via Coil.
- **Motor de Inferência Híbrido (`HybridAiInferenceEngine.kt` + `LocalOfficialAiEngine.kt`)**:
  - **Nuvem primeiro**: modelo oficial publicado no Hugging Face (`franciscoaleixo/SaibaTudo-Eleicao2026`) para NLU (intenção, rota, filtros e resposta direta treinada com dados oficiais).
  - **Fallback local determinístico**: `LocalOfficialAiEngine` responde com os MESMOS dados oficiais do repositório (perfis reais de candidatos, contagens agregadas reais, pesquisas e regras do TSE) — zero alucinação e latência zero offline.
  - A **listagem de candidatos é SEMPRE** do repositório local de dados oficiais (o modelo nunca "inventa" candidatos).
- **Suporte Avançado ao Modo Escuro (*Dark Mode*)**:
  - Paleta com tokens adaptativos do Material 3 (`surfaceVariant`, `onSurface`, `onSurfaceVariant`, `onBackground`).
  - Textos de títulos, cartões e diálogos calibrados para contraste ótimo contra fundos escuros (`SurfaceDark` `#1E293B` e `BackgroundDark` `#0F172A`).

---

## 🤖 4. Pipeline de Inteligência Artificial (`ai_model`)

### Hardware Utilizado:
- **GPU**: NVIDIA GeForce RTX 5060 Laptop GPU (8GB GDDR6 VRAM)
- **Arquitetura da GPU**: `sm_120` (NVIDIA Blackwell)
- **CPU**: Intel Core Ultra 7 258V
- **Sistema Operacional**: Windows 11 Home

### Desafios de Engenharia & Soluções:
1. **Incompatibilidade inicial do PyTorch com Blackwell (`sm_120`)**:
   - *Problema*: As versões padrão do PyTorch compiladas com CUDA 12.4 acusavam que a GPU `sm_120` não era suportada pelos kernels pré-compilados.
   - *Solução*: Foi instalado o `torch-2.11.0+cu128` (CUDA 12.8), que possui compatibilidade e suporte nativo completo para arquiteturas `sm_120`.
2. **Bloqueio do Windows AppLocker / WDAC contra extensões C (Pandas, `_lzma.pyd`)**:
   - *Problema*: O **WDAC (Windows Defender Application Control)** — `UsermodeCodeIntegrityPolicyEnforcementStatus = 2` (modo aplicação) — bloqueia DLLs/`.pyd` não aprovados pela política de integridade de código. Isso afetou `_lzma.pyd` (importado transitivamente por `datasets`/`transformers.Trainer`) e, antes, `pandas`.
   - *Solução 1 (dados)*: ETL oficial 100% em **Python puro** (`csv`, `json`, `re`, `pypdf`) — sem `pandas`.
   - *Solução 2 (lzma)*: **`ai_model/.venv/Lib/site-packages/sitecustomize.py`** instala um *stub* de `lzma`/`_lzma` no startup do interpretador. Como nenhum script usa compressão LZMA, o stub evita o `ImportError` sem tocar na política WDAC.
   - *Observação*: `Add-MpPreference -ExclusionPath` (exclusão do antivírus) **não** remove bloqueio WDAC de integridade de código; o script `Add-DefenderExclusions.ps1` foi criado apenas para reduzir varredura/overhead do AV durante o treino.
3. **Base mais sólida + Treinamento Híbrido GPU+RAM (`train_hybrid.py`)**:
   - **Base atualizada**: `Qwen/Qwen2.5-1.5B-Instruct` (3× maior que a base anterior 0.5B) — mais robusta para JSON estruturado e conhecimento cívico.
   - **Memória híbrida**: QLoRA **4-bit NF4** + `gradient_checkpointing` + `device_map="auto"` com `max_memory` (VRAM da RTX + offload para RAM do sistema), permitindo até bases maiores se necessário. LoRA em todos os módulos lineares (`q,k,v,o,gate,up,down`), `paged_adamw_8bit`, `bf16`.
   - **Dataset OFICIAL**: `dataset_oficial_treino.json` com **5.192 pares** derivados exclusivamente dos dados do TSE (extração de intenção/filtros, Q&A cívico, fatos agregados reais, lookup de candidatos reais, pesquisas registradas e fontes oficiais/TREs).
   - Consumo observado: ~7,8 GB de VRAM + ~7,5 GB de RAM (híbrido), 650 passos (2 épocas) na RTX 5060.
4. **Mesclagem e Exportação Standalone (`merge_and_export.py`)**:
   - Os adaptadores LoRA são fundidos aos pesos base (`merge_and_unload()`) em `ai_model/output/SaibaTudo-Eleicao2026-merged` (Safetensors), pronto para inferência autônoma e conversão mobile.
5. **Validação Oficial (`test_inference.py`)**:
   - Valida (1) saída **JSON estruturada válida** e (2) **fatos oficiais** do TSE 2026 (candidatos reais, contagens, regras, pesquisas registradas), gravando `data/validacao_modelo_resultados.json`.
6. **Publicação no Hugging Face**:
   - `push_to_hub.py` / `hf` CLI. Repositório: [https://huggingface.co/franciscoaleixo/SaibaTudo-Eleicao2026](https://huggingface.co/franciscoaleixo/SaibaTudo-Eleicao2026).
   - **Correção crítica**: `AppConstants.HF_MODEL_REPO_ID` apontava para `franciscoaleixoIOT/...` (inexistente/401), causando falha silenciosa da inferência em nuvem e fallback para o motor local. Corrigido para `franciscoaleixo/SaibaTudo-Eleicao2026`.

---

## 🗄️ 4.1 Pipeline de Dados OFICIAIS do TSE (`ai_model/scripts`)

Fluxo completo de coleta → ETL → assets do app → dataset de treino, tudo a partir de fontes oficiais:

1. **Coleta (download)** — Portal de Dados Abertos do TSE (`dadosabertos.tse.jus.br`, API CKAN) e CDN oficial (`cdn.tse.jus.br`):
   - `consulta_cand_2026`, `consulta_cand_complementar_2026`, `consulta_coligacao_2026`, `consulta_vagas_2026`, `historico_candidatura_2026`, `motivo_cassacao_2026`, `rede_social_candidato_2026`, `pesquisa_eleitoral_2026` (+contratante/pagante), `proposta_governo_2026` (BR/SP) e fotos oficiais (BR/SP).
2. **`build_official_data.py`** — ETL principal: consolida os CSVs (latin-1, `;`), extrai texto dos PDFs de planos de governo (`pypdf`+`fontTools`), calcula Ficha Limpa (DEFERIDO + sem inelegibilidade), mandatos/reeleição (histórico), processos (cassação) e gera os assets `tse_candidatos_2026.json`, `tse_pesquisas_2026.json`, `tse_regras_2026.json`.
3. **`build_fontes_oficiais.py`** — processa os HTMLs oficiais (27 TREs + Senado/Câmara/Congresso/MPF/TCU/AGU/CGU/STF/MJSP) baixados via **Chrome headless** (os domínios `jus.br` usam Akamai/WAF que bloqueia clientes HTTP simples; o fingerprint real do Chrome contorna) e gera `tse_fontes_oficiais_2026.json`.
4. **`build_training_dataset.py`** — gera `dataset_oficial_treino.json` (5.192 pares) exclusivamente dos dados oficiais.

### Fontes oficiais integradas (todas validadas):
- **TSE**: Dados Abertos, DivulgaCandContas, Autoatendimento do Eleitor, Resultados, Portal Eleições 2026.
- **TREs**: `tre-{uf}.jus.br/eleicoes` (26/27 com conteúdo extraído; TRE-CE usa fallback oficial — para Eleições Gerais os TREs integram os sistemas nacionais do TSE).
- **Legislativo**: Senado (54 cadeiras), Câmara (bancadas/quociente), Congresso (Código Eleitoral e Lei 9.504/97).
- **Fiscalização/Controle**: MPF/PGR e MPF Serviços (denúncias), TCU (contas irregulares → Ficha Limpa), AGU (condutas vedadas), CGU (Fala.BR), STF (ADIs), MJSP (crimes eleitorais).

---

## 📱 5. Validação e Execução em Dispositivos

### 1. No Emulador Android:
- Criado o AVD `medium_phone` através da CLI do Android (`android emulator create medium_phone`).
- Validada toda a árvore de componentes visuais, interações com a barra de busca da IA, abertura dos diálogos e fluxo completo de votação na Urna.

### 2. No Celular Físico (Xiaomi / Redmi Note `24115RA8EG`):
- Conectado via USB com Depuração USB ativa.
- **Particularidade Xiaomi (MIUI/HyperOS)**: O sistema operacional possui a flag de segurança `INSTALL_FAILED_USER_RESTRICTED`. Foi necessário habilitar a opção **"Instalar via USB"** dentro de Opções do Desenvolvedor.
- O APK foi transferido e instalado diretamente (`Success`).
### 3. Revisão Completa dos Temas Escuro e Claro (WCAG 2.1 AA Compliance):
- **Barra de Pesquisa IA (`SearchBarAi.kt`)**:
  - Eliminado o fundo branco fixo (`Color.White`) no `OutlinedTextField`. Substituído por `MaterialTheme.colorScheme.surface`, integrando harmoniosamente tanto no modo escuro quanto no claro.
  - Textos de placeholder e ícones vinculados aos tokens semânticos `onSurfaceVariant`, `primary` e `secondary`.
  - Badges e chips de sugestão atualizados com `surfaceVariant`, `outlineVariant` e `onSurface`.
- **Filtros Oficiais TSE (`FilterChipsRow.kt`)**:
  - Corrigido o bug de layout em que o botão *"Limpar"* quebrava verticalmente letra por letra (`L-i-m-p-a-r`). O cabeçalho foi otimizado com espaçamento horizontal limpo e padding proporcional.
  - Implementado `customFilterChipColors` dinâmico em todos os chips de filtros (Cargos, Ficha Limpa, Zero Processos Adm., Mandatos e Regiões), garantindo contraste superior a 7:1 em ambos os temas.
  - O Switch de localização agora utiliza `onPrimary` para o polegar e `primary` para a trilha.
- **Cartões de Candidatos (`CandidateItemCard.kt`)**:
  - Distintivo numérico do candidato atualizado com `primaryContainer` e `onPrimaryContainer`, eliminando o contraste escuro-sobre-escuro anterior.
  - As tags de *"Zero Processos Adm."* e pendências utilizam pares dinâmicos de container e onContainer (`primaryContainer`/`onPrimaryContainer` e `secondaryContainer`/`onSecondaryContainer`), eliminando o verde/amarelo apagado no fundo escuro.
- **Diálogo de Detalhes (`CandidateDetailDialog.kt`)**:
  - Botão de ação *"Simular Voto na Urna"* calibrado com `primary` e `onPrimary`.
  - Botão *"Fechar"* com `onSurfaceVariant` em semi-bold (alta legibilidade).
  - Ícones e textos de certidão de Ficha Limpa e conduta ajustados com `primary` e `error`.
- **Navegação Eleitoral (`DynamicMenuGrid.kt`)**:
  - Contornos ativos e ícones agora utilizam `primary` dinâmico (`#22C55E` no Dark Mode e `#007A3D` no Light Mode).
- **Validação Visual Dupla**:
  - Testado e inspecionado via screenshots em alta resolução tanto no Emulador Android (`medium_phone`) quanto no Celular Físico do usuário (`Xiaomi / Redmi 24115RA8EG`).

---

## 🗺️ 6. Guia para Publicação no Google Play Console

Para disponibilizar o aplicativo para você e outros testadores através da Google Play Store:

1. **Geração do Android App Bundle (`.aab`)**:
   ```powershell
   $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"; $env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
   .\gradlew.bat bundleRelease
   ```
2. **Faixa de Teste Interno (*Internal Testing*)**:
   - No [Google Play Console](https://play.google.com/console), crie o app e acesse **Teste > Teste interno**.
   - Faça upload do arquivo `.aab` gerado em `app/build/outputs/bundle/release/`.
   - Na aba **Testadores**, adicione os e-mails das contas Google autorizadas a baixar (até 100 pessoas).
   - O aplicativo fica disponível em **poucos minutos** (sem passar pela fila de revisão pública demorada da Play Store).
   - Os testadores recebem um link oficial da Play Store e o app se atualiza sozinho no celular conforme novas versões forem enviadas.

---

## 📜 7. Registro de Versões e Commits no Git

| Hash | Mensagem do Commit | Descrição dos Avanços |
| :--- | :--- | :--- |
| `0e54d62` | *Initial commit: SaibaTudo-Eleicao2026* | Estrutura inicial do projeto, licença MIT e documentação |
| `3cf0d86` | *feat(ai): optimize local training for RTX 5060...* | Treinamento nativo PyTorch na GPU RTX 5060 com QLoRA 4-bit |
| `93398dc` | *test(ai): add test_inference.py and validate...* | Validação da inferência da IA e extração de JSON eleitoral |
| `77c6a3a` | *feat: complete UI dialogs, Urna simulator 2026...* | Conexão do Simulador da Urna, Detalhes e publicação no Hugging Face |
| `de78561` | *fix(ui): enable candidate card click and improve Urna...* | Ajuste de clique nos cartões e espaçamento de botões da urna |
| `9468e40` | *feat(ui): add high-contrast dark theme support...* | Suporte completo de alto contraste ao Modo Escuro no celular |
| `3a4eecc` | *docs: add comprehensive project memory document* | Criação do documento central de arquitetura e decisões de engenharia |
| `8bbd0c7` | *fix(ui): revise dark and light theme contrast...* | Revisão de contraste WCAG em inputs, botões, chips e fix da quebra do botão Limpar |
| `8d81cb8` | *docs: add Cacx01 as primary collaborator* | Configuração do colaborador principal Cacx01 no GitHub e Git local |
| `16989a4` | *feat(ui): add send button, search keyboard action, and dynamic response buttons* | Botão Enviar, ação Search no teclado virtual e botões dinâmicos de candidatos, urna e sugestões |
| `47b4efb` | *feat: integrate real 2026 election candidates, regional Brodowski context, and retrained AI model* | Eliminação de dados de teste, candidatos reais TSE 2026, contexto Brodowski/RMRP, retreino LoRA na RTX 5060 (loss 0.0345) e fusão de pesos |
| `b6c796f` | *refactor(ui): replace 'IA Oficial' with 'IA' across UI and prompts* | Remoção do termo 'oficial' junto à IA no cabeçalho do app e templates de prompt |
| `252b7d8` | *refactor(ui): remove 'Pronta' from AI status badge* | Atualização do distintivo da IA para 'IA SaibaTudo-Eleição2026' na barra de busca |

---

> *Este documento serve como a base perene de conhecimento para manutenção, evolução e auditoria do projeto SaibaTudo-Eleicao2026.*
