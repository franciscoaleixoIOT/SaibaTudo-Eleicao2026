# SaibaTudo — Eleições 2026 🗳️🇧🇷

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Dados: TSE CC BY](https://img.shields.io/badge/dados-TSE%20(CC%20BY)-blue.svg)](https://dadosabertos.tse.jus.br)
[![Android](https://img.shields.io/badge/Android-API%2024%2B-green.svg)](app/)
[![PWA](https://img.shields.io/badge/PWA-saibatudo.net-0C2340.svg)](https://saibatudo.net)

<p align="center"><img src="brand/png/saibatudo-logo-horizontal.png" alt="SaibaTudo" width="520"></p>

**SaibaTudo** é um ecossistema de apps cívicos **independentes, de código aberto e sem anúncios**. O primeiro é o
**SaibaTudo Eleições 2026**: consulta de candidaturas, pesquisas registradas, regras e resultados das Eleições Gerais 2026
com **dados abertos do TSE**, um assistente de IA que **só responde com dados oficiais** e um simulador educativo da urna.

> **Aviso:** projeto independente, **sem vínculo com o TSE, governo, partidos ou candidatos**. Não recomenda, compara nem prevê
> candidatos. Em caso de divergência vale o site oficial do TSE.

| Onde usar | Status |
| :-- | :-- |
| 🌐 Web / PWA (Android, iPhone, Windows) | `https://saibatudo.net/eleicoes2026` — instalável (código em [`web/`](web/)) |
| 🤖 Android (Google Play) | pacote `net.saibatudo.eleicoes2026` — **teste fechado em andamento**; produção prevista para meados de novembro (ver [`docs/PLAY_STORE.md`](docs/PLAY_STORE.md)) |

## Princípios (política de dados e de IA)
1. **Só dados oficiais.** Nada fictício, simulado ou de fonte não oficial. Todo campo vem do TSE ou é uma derivação determinística
   **rotulada** ([contrato de dados](docs/DATA_CONTRACT.md)). Ausência de dado = ausência de campo.
2. **Ficha Limpa derivada e rotulada.** O app mostra a *situação oficial do julgamento do registro*, os motivos de indeferimento
   e, a partir deles, a Ficha Limpa (registro deferido = sem impedimento reconhecido; indeferido por inelegibilidade da LC 64/90 =
   inelegível). Regra pública em [`DATA_CONTRACT.md`](docs/DATA_CONTRACT.md#31-ficha-limpa--derivação-nos-clientes-app-e-site); não é certidão.
3. **A IA interpreta; os dados respondem.** O NLU (regras locais ou modelo na nuvem) só identifica intenção/entidades; todo fato exibido sai do pacote de dados.
   Pedidos de recomendação/previsão de voto são **recusados** (Res. TSE 23.755/2026). Listas têm **ordem fixa** (cargo, UF, número).
   A **explicação por IA generativa** (Qwen 7B) existe, mas vem **desligada**; quando ligada, o texto é rotulado como gerado e o servidor descarta respostas que recomendem ou prevejam candidatos.
4. **Local-first e privado.** Funciona offline; sem login, anúncios ou analytics. No site/PWA o estado pode vir sugerido pela localização **aproximada**, calculada no aparelho (nada é enviado); no app Android a escolha do estado é manual e o app **não usa a localização**. A "IA na nuvem" é **opt-in**, o botão fica sempre disponível mesmo depois de uma resposta local e envia só o texto daquela pergunta.
   "**Ajudar a melhorar o app**" também é **opt-in e desligado por padrão**: se a pessoa ligar, perguntas que o app não entendeu vão para uma pessoa revisar, sem nome, IP, resposta ou horário, guardadas por até 90 dias. Perguntas com dado pessoal ou que **revelem a opinião ou a preferência política** de quem perguntou (ex.: "quero que fulano ganhe") **não são enviadas**: o filtro roda no app, no site e de novo no servidor ([`contracts/opiniao_cases.json`](contracts/opiniao_cases.json)). Política em vigor: **versão 1.3** ([privacidade](docs/PRIVACIDADE.md)).
5. **Atualização contínua e verificável.** Dados novos chegam sem nova versão do app, com **assinatura ECDSA** e checksums.

## Arquitetura (resumo — detalhes em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md))
```
TSE (dados abertos + CDN + resultados) ──► pipeline/ (fetch → ETL → valida → assina) ──► data/eleicoes2026/ (pacote)
                                                      │ GitHub Actions (a cada 30 min; só publica se o TSE mudou)
                  ┌───────────────────────────────────┼────────────────────────────────────┐
                  ▼                                   ▼                                    ▼
        app Android (snapshot nos assets      site/PWA na Vercel (mesmo pacote)      IA opcional (Vercel → Modal, scale-to-zero):
        + atualização assinada, WorkManager)  /data/eleicoes2026/*                    /api/nlu (CPU) · /api/ask (GPU, desligada)
                                                                                     /api/melhoria (opt-in) ─► Redis (Upstash)
```
O treino do modelo é feito **localmente** (GPU própria), para reduzir custo; o Modal só serve a IA. Um gate bloqueia a publicação de modelo que piore nos casos de referência.

| Pasta | Conteúdo |
| :-- | :-- |
| [`app/`](app/) | App Android (Kotlin, Compose, MVVM): dados, atualizador assinado, IA local-first, UI |
| [`pipeline/`](pipeline/) | Coleta incremental (ETag), ETL v2, validação, manifesto e assinatura do pacote de dados |
| [`data/eleicoes2026/`](data/eleicoes2026/) | Snapshot oficial versionado (assets do app e semente do site) |
| [`web/`](web/) | Site `saibatudo.net` + PWA `/eleicoes2026` (JS puro, sem CDN externo) |
| [`api/`](api/), [`backend/`](backend/) | Funções Vercel (`/api/nlu`, `/api/ask`, `/api/melhoria`, `/api/report`, `/api/health`), backend de IA no Modal e ciclo de melhoria (coleta, fila, revisão humana, holdout, retreino) |
| [`contracts/`](contracts/) | Contratos compartilhados por Android, site e servidor: NLU (golden e perguntas reais), paridade das respostas e filtro de opinião |
| [`eval/`](eval/) · [`dashboard/`](dashboard/) · [`tools/`](tools/) | Medições do modelo, painel de qualidade e verificações do CI (release R8, workflows, frescor dos dados, congelamento do 2º turno) |
| [`brand/`](brand/) · [`store/`](store/) | Identidade visual e materiais da Google Play |
| [`ai_model/`](ai_model/) | Treino/publicação do modelo de NLU (Hugging Face) |
| [`docs/`](docs/) | **Operação (estado atual)**, plano de produção, contrato de dados, backend, privacidade, Play Store, memória do projeto |

## Como rodar
**Android** (JDK 17 / Android Studio): `./gradlew testDebugUnitTest lintRelease` · `./gradlew installDebug` · `./gradlew bundleRelease`.
Release assinado: crie `keystore.properties` (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`; **nunca versionar**).

**Dados** (Python 3.12, `pip install -r pipeline/requirements.txt`):
```bash
python pipeline/fetch.py                       # baixa só o que mudou (ETag/Last-Modified)
python pipeline/build.py --assinar-com secrets/data_signing_key.pem   # ETL + validação + assinatura
# chave nova: python pipeline/sign.py gen --private secrets/data_signing_key.pem --public pipeline/data_signing_public.pem
```
**Site/API:** `node web/build.mjs && node --test web/test api/test` e `node --test "backend/retrain/*.test.mjs"` (ver [`web/README.md`](web/README.md), [`docs/BACKEND.md`](docs/BACKEND.md)).
**Python:** `python -m unittest discover -s pipeline/tests` · `python -m unittest discover -s backend/retrain -p "test_*.py"` · `python tools/test_workflows.py`.
**Variáveis de operação** (captura de perguntas, Redis, IA generativa, canário): [`docs/OPERACAO.md`](docs/OPERACAO.md).

## Qualidade
[![Android CI](https://github.com/franciscoaleixoIOT/SaibaTudo-Eleicao2026/actions/workflows/android_ci.yml/badge.svg)](https://github.com/franciscoaleixoIOT/SaibaTudo-Eleicao2026/actions/workflows/android_ci.yml)
[![Web e API CI](https://github.com/franciscoaleixoIOT/SaibaTudo-Eleicao2026/actions/workflows/web_ci.yml/badge.svg)](https://github.com/franciscoaleixoIOT/SaibaTudo-Eleicao2026/actions/workflows/web_ci.yml)
[![Dados](https://github.com/franciscoaleixoIOT/SaibaTudo-Eleicao2026/actions/workflows/data_refresh.yml/badge.svg)](https://github.com/franciscoaleixoIOT/SaibaTudo-Eleicao2026/actions/workflows/data_refresh.yml)

- **Cobertura por camada** (as contagens exatas ficam no CI, não aqui, para não envelhecerem): Android com testes unitários sobre os dados reais
  (integridade e assinatura, NLU com o contrato compartilhado, respostas, atualizador com falha/adulteração/rollback, apuração) e instrumentados em dispositivo;
  site/PWA com os mesmos casos de NLU, assinatura WebCrypto, build e `vercel.json`; API com validação, limites, CORS, neutralidade e kill switches; pipeline,
  backend de IA e retreino com testes em Python e Node. Lint limpo e R8 verificado em release.
- **Paridade Android × site:** as respostas que não dependem de candidatos são conferidas texto a texto ([`contracts/answers_parity.json`](contracts/answers_parity.json)); o service worker do site é testado com defeitos injetados; o verificador de release lê o dex para garantir que o R8 não removeu classes usadas por reflexão (não substitui rodar o release num aparelho).
- **Contrato de NLU:** [`contracts/nlu_golden_cases.json`](contracts/nlu_golden_cases.json) (111 casos) é o mesmo para Android, site e gate do modelo; perguntas reais
  revisadas por uma pessoa ficam em [`contracts/nlu_real_cases.json`](contracts/nlu_real_cases.json) e **nunca** entram no treino.
- **CI:** testes, lint e bundle a cada push; atualização dos dados a cada 30 min com testes de integridade bloqueantes; alerta automático de dados atrasados;
  guarda do congelamento do 2º turno ([`.github/workflows/`](.github/workflows/)). Estado operacional em [`docs/OPERACAO.md`](docs/OPERACAO.md).

## Dados, licenças e atribuição
- **Dados:** Portal de Dados Abertos do TSE, **CC BY** — atribuição exibida no app, no site e no manifesto. Fotos oficiais do TSE; **CPF e título de eleitor nunca são publicados**.
- **Código:** [MIT](LICENSE). **Marca/ícones/logotipos:** © SaibaTudo.Net (uso do código não licencia a marca). **Fonte Poppins:** SIL OFL.
- **Modelo de IA:** `franciscoaleixo/SaibaTudo-Eleicao2026` (ajuste fino de Qwen2.5-1.5B-Instruct para interpretar perguntas; a explicação generativa, desligada por padrão, usa Qwen2.5-7B; verifique a licença das bases). A licença MIT do código não se estende automaticamente a dados e pesos de terceiros.

## Contribuir e corrigir dados
Abra uma *issue* (há também o botão **"Relatar problema"** no app) ou veja [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md).

## Autores
Francisco Aleixo ([@franciscoaleixoIOT](https://github.com/franciscoaleixoIOT)) · Cauã Francisco ([@Cacx01](https://github.com/Cacx01)).
