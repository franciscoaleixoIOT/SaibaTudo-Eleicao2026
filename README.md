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
| 🤖 Android (Google Play) | pacote `net.saibatudo.eleicoes2026` — pronto para teste interno; publicação depende da conta (ver [`docs/PLAY_STORE.md`](docs/PLAY_STORE.md)) |

## Princípios (política de dados e de IA)
1. **Só dados oficiais.** Nada fictício, simulado ou de fonte não oficial. Todo campo vem do TSE ou é uma derivação determinística
   **rotulada** ([contrato de dados](docs/DATA_CONTRACT.md)). Ausência de dado = ausência de campo.
2. **"Elegibilidade" ≠ "Ficha Limpa".** O app mostra a *situação oficial do julgamento do registro* e os motivos de indeferimento; não emite certidão.
3. **A IA interpreta; os dados respondem.** O NLU (regras locais ou modelo na nuvem) só identifica intenção/entidades; todo fato exibido sai do pacote de dados.
   Pedidos de recomendação/previsão de voto são **recusados** (Res. TSE 23.755/2026). Listas têm **ordem fixa** (cargo, UF, número).
4. **Local-first e privado.** Funciona offline; sem GPS, login, anúncios ou analytics. A "IA na nuvem" é **opt-in** e envia só o texto de perguntas não entendidas ([privacidade](docs/PRIVACIDADE.md)).
5. **Atualização contínua e verificável.** Dados novos chegam sem nova versão do app, com **assinatura ECDSA** e checksums.

## Arquitetura (resumo — detalhes em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md))
```
TSE (dados abertos + CDN + resultados) ──► pipeline/ (fetch → ETL → valida → assina) ──► data/eleicoes2026/ (pacote)
                                                      │ GitHub Actions (5x/dia; 30 min pós-eleição)
                  ┌───────────────────────────────────┼────────────────────────────────────┐
                  ▼                                   ▼                                    ▼
        app Android (snapshot nos assets      site/PWA na Vercel (mesmo pacote)      IA opcional: /api/nlu (Vercel)
        + atualização assinada, WorkManager)  /data/eleicoes2026/*                    ─► Modal (CPU, llama.cpp, scale-to-zero)
```

| Pasta | Conteúdo |
| :-- | :-- |
| [`app/`](app/) | App Android (Kotlin, Compose, MVVM): dados, atualizador assinado, IA local-first, UI |
| [`pipeline/`](pipeline/) | Coleta incremental (ETag), ETL v2, validação, manifesto e assinatura do pacote de dados |
| [`data/eleicoes2026/`](data/eleicoes2026/) | Snapshot oficial versionado (assets do app e semente do site) |
| [`web/`](web/) | Site `saibatudo.net` + PWA `/eleicoes2026` (JS puro, sem CDN externo) |
| [`api/`](api/), [`backend/`](backend/) | Funções Vercel (`/api/nlu`, `/api/report`) e backend de IA no Modal + retreino |
| [`contracts/`](contracts/) | Casos de referência do NLU compartilhados por Android e Web |
| [`brand/`](brand/) · [`store/`](store/) | Identidade visual e materiais da Google Play |
| [`ai_model/`](ai_model/) | Treino/publicação do modelo de NLU (Hugging Face) |
| [`docs/`](docs/) | Plano de produção, contrato de dados, backend, privacidade, Play Store, memória do projeto |

## Como rodar
**Android** (JDK 17 / Android Studio): `./gradlew testDebugUnitTest` · `./gradlew installDebug` · `./gradlew bundleRelease`.
Release assinado: crie `keystore.properties` (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`; **nunca versionar**).

**Dados** (Python 3.12, `pip install -r pipeline/requirements.txt`):
```bash
python pipeline/fetch.py                       # baixa só o que mudou (ETag/Last-Modified)
python pipeline/build.py --assinar-com secrets/data_signing_key.pem   # ETL + validação + assinatura
# chave nova: python pipeline/sign.py gen --private secrets/data_signing_key.pem --public pipeline/data_signing_public.pem
```
**Site/API:** `node web/build.mjs && node --test web/test api/test` (ver [`web/README.md`](web/README.md), [`docs/BACKEND.md`](docs/BACKEND.md)).

## Qualidade
- **Android:** 41 testes unitários (integridade/assinatura dos dados reais, 46 casos de NLU, respostas, atualizador com falhas/adulteração/rollback, apuração ao vivo) + 4 instrumentados em dispositivo; lint limpo; R8 verificado em release. **Web:** 78 testes (mesmos 46 casos de NLU, assinatura WebCrypto, build, `vercel.json`). **API:** 151. **Pipeline/IA:** 9 + 40 + 26.
- CI: testes, lint e bundle a cada push; atualização de dados agendada ([`.github/workflows/`](.github/workflows/)).

## Dados, licenças e atribuição
- **Dados:** Portal de Dados Abertos do TSE, **CC BY** — atribuição exibida no app, no site e no manifesto. Fotos oficiais do TSE; **CPF e título de eleitor nunca são publicados**.
- **Código:** [MIT](LICENSE). **Marca/ícones/logotipos:** © SaibaTudo.Net (uso do código não licencia a marca). **Fonte Poppins:** SIL OFL.
- **Modelo de IA:** `franciscoaleixo/SaibaTudo-Eleicao2026` (ajuste fino de Qwen2.5-1.5B-Instruct; verifique a licença da base). A licença MIT do código não se estende automaticamente a dados e pesos de terceiros.

## Contribuir e corrigir dados
Abra uma *issue* (há também o botão **"Relatar problema"** no app) ou veja [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md).

## Autores
Francisco Aleixo ([@franciscoaleixoIOT](https://github.com/franciscoaleixoIOT)) · Cauã Francisco ([@Cacx01](https://github.com/Cacx01)).
