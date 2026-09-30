# Memória do Projeto • SaibaTudo-Eleicao2026 🗳️🧠

> **Documento de Registro Histórico, Decisões de Arquitetura, Desafios Técnicos e Memória Operacional**  
> **Data de Atualização**: 30 de Setembro de 2026  
> **Status do Projeto**: Concluído, testado em dispositivo físico e emulador, publicado no GitHub e Hugging Face.

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
│   ├── engine/           # AiInferenceEngine, LocalMockAiInferenceEngine, HybridAiInferenceEngine
│   └── model/            # AiElectionsResponse, AiExtractedFilters
├── core/
│   └── constants/        # TseElectionConstants (Cargos, Dígitos, Datas oficiais)
├── data/
│   ├── datasource/       # LocalElectionDataSource (Mock com dados reais estruturados do TSE)
│   └── repository/       # ElectionsRepositoryImpl (Implementação de filtragem em memória)
├── domain/
│   ├── model/            # Candidate, ElectoralFilter, MenuItem, TseCargo, MacroRegiao, MandatosOpcao
│   └── repository/       # ElectionsRepository (Contrato de dados)
└── ui/
    ├── components/       # SearchBarAi, FilterChipsRow, DynamicMenuGrid, CandidateItemCard,
    │                     # CandidateDetailDialog, UrnaSimulatorDialog
    ├── screens/          # MainAppScreen (Orquestrador de estados e componentes)
    ├── theme/            # Color.kt, Theme.kt, Type.kt (Suporte completo a Light & Dark Mode)
    └── MainActivity.kt   # Ponto de entrada do Android
```

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
- **Base de Dados 100% Real e Contexto Regional (Brodowski & SP)**:
  - Eliminação completa de dados fictícios de teste ("Candidato Presidencial A", "Maria Governadora").
  - Inclusão dos candidatos reais e prováveis para as Eleições 2026:
    - **Presidência**: Lula (13 - PT), Tarcísio de Freitas (10 - Republicanos), Ronaldo Caiado (44 - União), Romeu Zema (30 - Novo), Ratinho Júnior (55 - PSD), Ciro Gomes (12 - PDT), Simone Tebet (15 - MDB), Eduardo Leite (45 - PSDB).
    - **Governo de SP**: Tarcísio de Freitas (10 - Republicanos), Guilherme Boulos (50 - PSOL), Márcio França (40 - PSB), Ricardo Nunes (15 - MDB).
    - **Senado Federal SP (2 Vagas)**: Eduardo Bolsonaro (222 - PL), Alexandre Padilha (131 - PT), Paulo Skaf (100 - Republicanos), Marina Silva (180 - REDE).
    - **Deputados Federais por SP**: Baleia Rossi (1515 - MDB - Base Brodowski/Ribeirão), Ricardo Silva (5555 - PSD), Arnaldo Jardim (2323), Delegado Bruno Lima (1100), Guilherme Boulos (5010), Rosângela Moro (4444).
    - **Deputados Estaduais por SP**: Léo Oliveira (15100 - MDB - Base direta Brodowski/Batatais/Ribeirão com atuação na duplicação da SP-334), Rafael Silva (55123 - PSD), Lucas Bove (22000 - PL), Eduardo Suplicy (13100 - PT), Carlos Giannazi (50123 - PSOL).
  - Suporte ao atributo `cidadesAtuacao` no modelo `Candidate` e filtros expandidos no repositório para cruzamento geográfico municipal e regional.
- **Motor de Inferência Híbrido com Inteligência Factual Instantânea (`HybridAiInferenceEngine.kt` & `LocalMockAiInferenceEngine.kt`)**:
  - Respostas determinísticas e factuais sem alucinações para perguntas sobre Brodowski, candidatos específicos, regras do TSE, senadores e Ficha Limpa.
  - Latência zero (<50ms) no celular sem depender de conexões instáveis de nuvem.
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
2. **Bloqueio do Windows AppLocker / WDAC contra Pandas e Datasets**:
   - *Problema*: O controle de aplicativos do Windows bloqueava a execução de bibliotecas C-extension como `pandas_parser.pyd`.
   - *Solução*: Eliminamos qualquer dependência das bibliotecas `pandas` e `datasets` no pipeline de treino. Criamos um loop nativo puro em PyTorch com `torch.utils.data.Dataset` e `DataLoader`, integrando diretamente com o `AutoModelForCausalLM` e a biblioteca `peft`.
3. **Consumo de Memória Ultra Eficiente & Retreinamento com Dados Reais**:
   - Utilizou-se o modelo base `Qwen/Qwen2.5-0.5B-Instruct` quantizado em **4-bit (NF4)** via QLoRA.
   - O treinamento consumiu apenas **0.87 GB de VRAM** dos 8GB disponíveis na NVIDIA RTX 5060 Laptop GPU.
   - **Ciclo 1 (Regras Gerais e Sintaxe JSON)**: Em 3 épocas (1644 passos), a perda de treino (*loss*) convergiu de **2.39** para **0.0284**.
   - **Ciclo 2 (Dados Factuais Reais 2026 & Brodowski/SP)**: Gerado novo dataset factual com 553 pares estruturados cobrindo candidatos reais (Lula, Tarcísio, Caiado, Zema, Baleia Rossi, Léo Oliveira, Padilha, Skaf, etc.), representação regional de Brodowski e Região Metropolitana de Ribeirão Preto.
   - A perda de treino (*loss*) convergiu de **2.4018** para **0.0345** (553 passos).
4. **Mesclagem e Exportação Standalone (`merge_and_export.py`)**:
   - Os adaptadores LoRA foram fundidos aos pesos base (`merge_and_unload()`).
   - O modelo resultante fundido está salvo em `ai_model/output/SaibaTudo-Eleicao2026-merged` com aproximadamente **988 MB** em formato Safetensors (`model.safetensors`), pronto para servir inferência local autônoma e conversão mobile sem dependência de adaptadores externos.
5. **Publicação no Hugging Face**:
   - Script automatizado `push_to_hub.py` integrado à API do Hugging Face.
   - Publicado com sucesso no endereço: [https://huggingface.co/franciscoaleixo/SaibaTudo-Eleicao2026](https://huggingface.co/franciscoaleixo/SaibaTudo-Eleicao2026).

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

---

> *Este documento serve como a base perene de conhecimento para manutenção, evolução e auditoria do projeto SaibaTudo-Eleicao2026.*
