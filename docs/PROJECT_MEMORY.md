# Memória do projeto — SaibaTudo Eleições 2026

> **Atualizado em 09/10/2026** (entre o 1º turno, 04/10, e o 2º, 25/10). Feito para que outra pessoa, ou outra sessão do Claude, assuma o projeto sem contexto prévio:
> o que está no ar, **como publicar**, **como testar**, o que o mantenedor decidiu e o que já deu errado.
> Estado operacional contínuo (alertas, chaves de desligamento, ciclo de auto-melhoria): [`OPERACAO.md`](OPERACAO.md).
> Entrada para agentes de código: [`../CLAUDE.md`](../CLAUDE.md). Contrato de dados: [`DATA_CONTRACT.md`](DATA_CONTRACT.md).

## 1. Em uma página — estado em 09/10/2026

| Peça | Estado |
| :-- | :-- |
| Fase eleitoral | Entre turnos. 2º turno em **25/10/2026**. **Congelamento de 24 a 26/10** (ver §4.9). |
| Site/PWA `saibatudo.net` e API | No ar na Vercel. Versão publicada = commit curto em `GET /api/health` (conferir contra `git rev-parse --short HEAD`). |
| Pacote de dados | Atualizado a cada 30 min pelo GitHub Actions, assinado (ECDSA P-256). Já traz os resultados do 1º turno (governadores e deputados); **Presidente só pela apuração ao vivo do TSE** (ver §7). |
| IA de interpretação (NLU) | Modelo **`v2.3-20261007`** no Modal (CPU). Intenção 93,7 % nos 111 casos de referência e 96,8 % em 435 perguntas reservadas. Treino e conversão **locais**. |
| IA generativa (texto gerado) | **Ligada desde 07/10.** Space privado `franciscoaleixo/saibatudo-qwen7b` no ZeroGPU do Hugging Face (principal), Modal L4 como reserva (15/dia). Só roda quando a pessoa toca em "Gerar explicação com IA". |
| Captura de perguntas ("Ajudar a melhorar o app") | Servidor ligado desde 06/10, Redis no Upstash. No app é **opt-in, desligado por padrão**. Filtro de dado pessoal e de opinião política no aparelho e no servidor. |
| Política de privacidade | **Versão 1.4** (07/10/2026), em `docs/PRIVACIDADE.md` e `web/src/privacidade/index.html` (devem ser idênticas). |
| Android | Teste fechado na Play em andamento com a **1.0.1** (versionCode 2). **1.0.3 (versionCode 4) pronta para enviar**: `docs/RELEASE_1.0.3.md`. Falta testar o release num aparelho. |
| CI | `web_ci.yml`, `android_ci.yml`, `data_refresh.yml` verdes no commit `cc804a3` (09/10). |
| Custos | Dentro dos US$ 30/mês grátis do Modal (§8). Cobrado até agora: **US$ 0**. |

## 2. Identidade, contas e onde cada coisa mora

| Item | Valor |
| :-- | :-- |
| Nome | SaibaTudo Eleições 2026 (repositório `SaibaTudo-Eleicao2026`; ecossistema SaibaTudo.Net) |
| Pacote Android | `net.saibatudo.eleicoes2026` |
| Repositório | <https://github.com/franciscoaleixoIOT/SaibaTudo-Eleicao2026> (MIT). Nesta máquina o git está configurado como **Cacx01** (Cauã); os commits do dia a dia saem com esse autor. |
| Equipe | Francisco Aleixo (mantenedor, @franciscoaleixoIOT), Cauã Francisco (@Cacx01, dono da conta do Play Console) |
| Vercel | projeto `saibatudo`, time `franciscoaleixo-9696`, domínio `saibatudo.net` (plano Hobby, uso **não comercial**) |
| Modal | workspace `franciscoaleixo/main`. Apps: `saibatudo-nlu` (CPU 8 núcleos, 3 GiB, desliga em 30 s, máx. 2 contêineres) e `saibatudo-qwen7b-awq` (L4, desliga em 120 s, máx. 1). Volume `saibatudo-nlu-models` com as versões `v1-legado`, `v2.1-20261003`, `v2.3-20261007` e o ponteiro `current.json` (hoje aponta para a v2.3). |
| Hugging Face | usuário `franciscoaleixo` (conta **PRO**: 40 min de GPU por dia no ZeroGPU). Space `saibatudo-qwen7b` (privado, `zero-a10g`). Modelo NLU publicado antigo: `franciscoaleixo/SaibaTudo-Eleicao2026` (v2.1; as versões novas não passam mais por lá). |
| Upstash | banco Redis `saibatudo` (plano gratuito, `sa-east-1`, 500 mil comandos/mês, 256 MB). Credenciais em `secrets/upstash.env`. |
| Play Console | conta de Cauã. Conta pessoal nova: exige teste fechado com **12 testadores por 14 dias contínuos**. |
| Contato público | `saibatudo@saibatudo.net` (nunca publicar o e-mail pessoal do mantenedor) |

## 3. Mapa do repositório

| Pasta | O que é |
| :-- | :-- |
| `app/` | App Android (Kotlin, Compose, MVVM). NLU local em `ai/nlu/`, respostas em `ai/answer/`, motor híbrido em `ai/engine/`. |
| `web/` | Site e PWA em JavaScript puro (sem CDN). `src/eleicoes2026/js/` espelha o app (mesmos módulos: `nlu.js`, `answers.js`, `engine.js`, `cloud.js`). Build: `node web/build.mjs`. |
| `api/` | Funções da Vercel: `nlu`, `ask`, `report`, `melhoria`, `health`. Núcleo em `api/_lib/`. |
| `pipeline/` | Coleta do TSE, ETL, validação, assinatura do pacote de dados. |
| `data/eleicoes2026/` | Snapshot oficial versionado (assets do app e semente do site). Um commit automático por dia (`chore(data): snapshot`). |
| `backend/modal/` | Serviços do Modal, gate de qualidade do modelo (`eval_golden.py`), **conversão local** (`convert_local.py`). |
| `backend/retrain/` | Ciclo de dados do modelo: geração, rotulagem, revisão humana, holdout. |
| `backend/hf_space_qwen7b/` | Código do Space do Hugging Face (texto gerado). |
| `ai_model/` | Scripts de treino local (`train_hybrid.py`, `merge_and_export.py`). Saídas em `ai_model/output/` (fora do Git). |
| `contracts/` | Casos compartilhados entre Android, site e servidor (§5.3). |
| `eval/` | **Histórico do painel de qualidade**: um arquivo por modelo em produção. Medições de apoio vão em `eval/local/`. |
| `tools/` | Verificações do CI (release R8, workflows, frescor dos dados, congelamento, métricas). |
| `secrets/` | **Fora do Git.** Chaves e tokens (§10). |
| `docs/` | Documentação. `OPERACAO.md` (estado), este arquivo (memória), `PRIVACIDADE.md`, `DATA_CONTRACT.md`, `PLAY_STORE.md`, `RELEASE_1.0.3.md`. |

## 4. Processo de publicação

### 4.1 Regra de ouro
**Dar push na `main` não publica o site.** Quem faz o deploy na Vercel é o workflow `data_refresh.yml` (a cada 30 min no relógio `10,40 * * * *`, ou sob demanda). Depois de qualquer push que mude código ou documentação do site:

```bash
git push origin main
gh workflow run data_refresh.yml              # publica agora, sem esperar o relógio
gh run watch <id> --exit-status               # id: gh run list --workflow data_refresh.yml --limit 1
curl -s https://saibatudo.net/api/health      # "version" tem de ser o commit curto publicado
```

**Depois de cada push, conferir também os outros workflows** (`web_ci.yml`, `android_ci.yml`): o deploy pode estar verde com o CI vermelho (aconteceu em 07/10, ver §7).
Mudar uma variável de ambiente da Vercel só vale no **próximo deploy**: rode o `data_refresh` depois.

### 4.2 Antes do push (checklist)
1. Rodar os testes das camadas tocadas (§5.1). Para mudança de comportamento, rodar tudo.
2. Texto de privacidade? Atualizar **os dois** arquivos e o número da versão (§4.7).
3. Mudou algo que o app Android também faz (NLU, respostas, textos de consentimento)? Portar para o Kotlin e rodar o Gradle: os contratos em `contracts/` existem para pegar divergência.
4. `git pull --rebase origin main` se o push for recusado: o robô de dados cria commits na `main` (`chore(data): snapshot ...`).
5. Mensagem de commit em inglês, no formato `tipo(escopo): resumo`, com o corpo explicando o porquê. Terminar com a linha `Co-Authored-By` da sessão.

### 4.3 Variáveis e segredos
| Onde | Nomes (nunca os valores) |
| :-- | :-- |
| **Vercel (produção)** | `MODAL_ENDPOINT`, `MODAL_KEY`, `MODAL_SECRET`, `MODAL_TIMEOUT_MS`, `MODEL_VERSION`, `DAILY_BUDGET`, `MODAL_ASK_ENDPOINT`, `ASK_ENABLED`, `HF_ASK_SPACE_URL`, `HF_TOKEN`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `MELHORIA_ENABLED`, `GITHUB_TOKEN` (relatos) |
| **GitHub, segredos** | `DATA_SIGNING_KEY`, `UPLOAD_KEYSTORE_B64`, `UPLOAD_KEYSTORE_PASSWORD`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_TOKEN` |
| **GitHub, variáveis** | `ASK_ENABLED=1`, `MELHORIA_ENABLED=1` (o pipeline escreve `cliente.ask.enabled` e `cliente.melhoria.enabled` no pacote assinado a partir delas) |

Comandos: `vercel env ls production` (só lista nomes), `printf '%s' "$VALOR" | vercel env add NOME production [--sensitive]`, `vercel env rm NOME production -y`, `gh variable set NOME --body 1`.
No Git Bash use sempre `printf '%s'` (sem quebra de linha no fim). **Quando o mantenedor precisa passar um segredo, ele cola em um arquivo dentro de `secrets/` (ignorado pelo Git), não no chat.**
Ainda **não existem** no GitHub os segredos `MODAL_ENDPOINT`, `MODAL_KEY` e `MODAL_SECRET`: por isso a avaliação noturna (`nightly_eval.yml`) fica verde mas **pula a medição** (§9).

### 4.4 Dados
Automático. `pipeline/fetch.py` baixa só o que mudou (ETag), `pipeline/build.py` monta e assina o pacote, e o `data_refresh` publica. Testes de **integridade** bloqueiam a publicação; testes de **comportamento** sobre dados reais só avisam (lição de 05/10). Se uma publicação falhar, abre a issue `alerta-dados` (OPERACAO §2). Forçar o download de tudo: `gh workflow run data_refresh.yml -f forcar=true`; gravar o snapshot na `main` fora do ritmo diário: `-f commit_snapshot=true`.

### 4.5 Modelo de interpretação (NLU na nuvem) — ciclo local completo
Tudo roda nesta máquina (RTX 5060 de 8 GB). O Modal só recebe o arquivo final.

1. **Dados:** `python backend/retrain/extra/gerar_formas_v22.py > backend/retrain/extra/formas_<nova>.txt` (formulações por assunto; para o próximo ciclo, edite as listas do script) → `node backend/retrain/label_extra.mjs --in ... --out ...rotuladas_....jsonl --fonte ... --licenca ... --coletado-em AAAA-MM-DD` (o rótulo vem do NLU determinístico dos clientes, nunca da fonte) → `python backend/retrain/build_nlu_dataset.py --out backend/retrain/out-<vN> --verify --extra <jsonl>... --extra-max-pct 25`.
   Regras: extras `origem=falhas_golden` são **recusados** (ensinar a prova contamina a nota); 20 % das perguntas externas vão para o **holdout** e nunca treinam; cubra **classes inteiras** (todos os estados, todos os temas), não os casos do teste.
2. **Treino:** renomear antes `ai_model/output/SaibaTudo-Eleicao2026-hybrid` (o script reutiliza o nome), depois
   `ai_model/.venv/Scripts/python.exe ai_model/scripts/train_hybrid.py --base_model Qwen/Qwen2.5-1.5B-Instruct --dataset backend/retrain/out-<vN>/train.json --max_length 256 --epochs 3 --seed 2026 > ai_model/output/treino_<vN>.log`.
   Leva cerca de 3 h 30 e usa a GPU inteira. **Impedir a suspensão do Windows** durante o treino (o notebook suspendeu às 2h40 de 07/10 e congelou o treino por 5 h): `SetThreadExecutionState` num PowerShell que vive enquanto o processo viver.
3. **Mesclar:** `merge_and_export.py --lora_dir ai_model/output/SaibaTudo-Eleicao2026-hybrid/final --output_dir ai_model/output/SaibaTudo-NLU-<vN>-merged` e copiar `train_meta.json` para a pasta mesclada.
4. **Converter e passar no gate (local):** `ai_model/.venv/Scripts/python.exe backend/modal/convert_local.py --model-dir ai_model/output/SaibaTudo-NLU-<vN>-merged --version <vN>-AAAAMMDD --threads 8 --holdout-cases backend/retrain/out-<vN>/holdout_cases.json --previous-eval eval/<ultima-versao-em-producao>.json --previous-version <ultima> --origem "<dataset, épocas, perda>"`.
   O gate **bloqueia**: JSON válido ≥ 98 %, intenção ≥ 85 %, cada entidade ≥ 90 % (com ≥ 3 casos), alucinação ≤ 5 %, queda Q4×Q8 ≤ 3 pontos, catraca (não cai mais de 1 ponto contra a versão em produção). Reprovou → **não envie nada**; leia `ai_model/output/gguf/<versão>/eval.json`.
5. **Enviar ao Modal (só se aprovou):** `MSYS_NO_PATHCONV=1 python -m modal volume put saibatudo-nlu-models <pasta>/<arquivo> /<versão>/<arquivo>` para `model-Q4_K_M.gguf`, `meta.json`, `eval.json` (o `--upload` do script faz o mesmo; **sem** `MSYS_NO_PATHCONV=1` o Git Bash reescreve o destino para `C:/Program Files/Git/...`).
6. **Promover:** `python -m modal run backend/modal/convert_gguf.py::promote --version <versão>` → `MODEL_VERSION=<versão>` na Vercel (invalida o cache) → `gh workflow run data_refresh.yml` → testar ao vivo (`POST /api/nlu`).
7. **Registrar:** copiar o resultado para `eval/AAAA-MM-DD_<versão>.json` no formato de `eval_golden.py --out` (`{passed, reasons, constrained, unconstrained, real}`); o resto vai para `eval/local/`.
8. **Rollback:** `python -m modal run backend/modal/convert_gguf.py::promote --version v2.1-20261003` + `MODEL_VERSION` anterior + deploy.

WSL: se usar, rode `wsl --shutdown` logo depois (pedido do mantenedor, a máquina fica sem memória). O caminho atual **não** precisa de WSL.

### 4.6 Texto gerado (Qwen 7B no Hugging Face)
- Código: `backend/hf_space_qwen7b/` (`app.py`, `requirements.txt`, `README.md`; o `nlu_core.py` é copiado de `backend/modal/`). Publicar mudanças: `huggingface_hub.HfApi().upload_file(..., repo_id="franciscoaleixo/saibatudo-qwen7b", repo_type="space")`.
- O servidor (`api/_lib/ask-handler.js`) chama o Space primeiro (`POST /gradio_api/call/ask`, depois `GET .../<event_id>` em SSE) e cai no Modal só se o Space falhar ou a cota do dia acabar. Orçamentos: `HF_ASK_DAILY_BUDGET` (400/dia) e `MODAL_ASK_DAILY_BUDGET` (15/dia).
- Token do Space: fine-grained `acessosaibatudo` (somente leitura), guardado em `secrets/hf_token.txt` e na Vercel como `HF_TOKEN` (sensível). Trocar: `vercel env rm HF_TOKEN production -y` e `add --sensitive`, depois deploy.
- **Verificador** (`api/_lib/neutralidade.js`): pedido de recomendação nem chega ao modelo; a resposta é descartada se recomendar, trouxer número ou contagem que não está nos dados enviados, contradisser a regra do 2º turno ou **contradisser o que o app apurou**. Descartou → o usuário continua vendo a resposta do app.
- Medido em 07/10: 3,0 s de GPU por resposta em média (≈ 800 respostas/dia dentro dos 40 min); espera do usuário de 1 a 18 s conforme a fila.
- **Desligar:** OPERACAO §3.

### 4.7 Política de privacidade
`docs/PRIVACIDADE.md` e `web/src/privacidade/index.html` precisam dizer o mesmo (testes em `web/test/modules.test.mjs` conferem versão, parágrafo da localização, resumo, tabela e base legal). Para mudar: editar os dois, subir o número no cabeçalho (`**Versão 1.X — data**` no Markdown e `<strong>Versão 1.X — data</strong>` no HTML), rodar `npm test` em `web/`, publicar (§4.1). O que muda para quem usa o app Android só chega no próximo build.
Fatos que a política afirma e que o código precisa continuar respeitando: o app Android **não usa localização**; "Ajudar a melhorar o app" é opt-in e filtra dado pessoal e opinião política; o texto gerado vem rotulado; nada é enviado sem toque ou consentimento.

### 4.8 App Android (Play)
1. Subir `versionCode` (único e crescente, a Play recusa repetido) e `versionName` em `app/build.gradle.kts`.
2. `JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./gradlew.bat --console=plain testDebugUnitTest lintRelease bundleRelease assembleRelease`.
3. Conferir: `python tools/verificar_release.py app/build/outputs/apk/release/app-release.apk` (5 classes obrigatórias), `jarsigner -verify app/build/outputs/bundle/release/app-release.aab` e o `aapt2 dump badging` (versionCode e versionName).
4. **Testar o release num aparelho** (`adb install -r app/build/outputs/apk/release/app-release.apk`; desinstalar antes se o app da Play estiver instalado). O R8 já quebrou o release sem quebrar nenhum teste; o verificador não substitui isso.
5. Play Console → Testar e lançar → Teste fechado → Criar nova versão → enviar `app/build/outputs/bundle/release/app-release.aab`. Notas da versão em `<pt-BR>...</pt-BR>`, **no máximo 500 caracteres** (modelo pronto em `docs/RELEASE_1.0.3.md`).
6. Revisar *Segurança dos dados* sempre que entrar recurso que envia texto (opt-in, não compartilhado, criptografado em trânsito, sem identificador junto do texto). Os 14 dias de teste contínuo não reiniciam com versão nova.
7. Assinatura: chave de **upload** em `secrets/upload-keystore.p12` + `keystore.properties`; a Play reassina com a chave dela (por isso o APK local não atualiza por cima do instalado pela Play).

### 4.9 Congelamento do 2º turno (24 a 26/10/2026)
Nada que decida o que o eleitor lê muda: modelo, NLU, respostas, API, pipeline, contratos, workflows e app. Dados, documentação, métricas e testes seguem livres. `congelamento.yml` roda em todo push e falha se um arquivo protegido mudar; exceção consciente: `[congelamento-ok]` na mensagem do commit. Checklist da véspera em OPERACAO §6.

### 4.10 Reversões rápidas
| O que | Como |
| :-- | :-- |
| Modelo NLU | `promote --version <anterior>` + `MODEL_VERSION` + deploy (§4.5, passo 8) |
| Texto gerado | remover `ASK_ENABLED` (Vercel e GitHub) + deploy |
| Captura de perguntas | remover `MELHORIA_ENABLED` + deploy |
| Dados ruins | redeploy do commit anterior na Vercel; investigar `DATA_SIGNING_KEY` se a assinatura falhar |
| Release Android | corrigir e subir **novo versionCode**; a Play não volta versão, só pausa a faixa |

## 5. Testes

### 5.1 Comandos e contagens (09/10/2026)
| Camada | Comando | Resultado esperado |
| :-- | :-- | :-- |
| API | `cd api && npm test` | 228 testes |
| Site | `cd web && npm test` | 176 testes (inclui a varredura de todos os candidatos) |
| Retreino (Node) | `node --test "backend/retrain/*.test.mjs"` | 54 testes |
| Pipeline | `python -m unittest discover -s pipeline/tests` | verde |
| Ferramentas | `python -m unittest discover -s tools -p "test_*.py"` | 48 testes |
| Treino | `python -m unittest discover -s ai_model/scripts -p "test_treino*.py"` | verde |
| Modal/gate | `python -m unittest discover -s backend/modal -p "test_*.py"` | verde (1 pulado) |
| Retreino (Python) | `python -m unittest discover -s backend/retrain -p "test_*.py"` | verde |
| Workflows | `python tools/test_workflows.py` | YAML e shell de cada passo válidos |
| Android | `./gradlew.bat testDebugUnitTest lintRelease` | 102 testes unitários, lint limpo. Instrumentados (4) só em aparelho. |

**O Gradle pode dizer "BUILD SUCCESSFUL" com relatório antigo** (tarefa UP-TO-DATE): confira o horário dos XML em `app/build/test-results/testDebugUnitTest/`.

### 5.2 CI
| Workflow | Quando | O que garante |
| :-- | :-- | :-- |
| `web_ci.yml` | push e PR | site, API, pipeline, ferramentas, modelo/gate, retreino, painel de métricas |
| `android_ci.yml` | push e PR | testes unitários, lint, bundle, verificador de release |
| `data_refresh.yml` | a cada 30 min e manual | dados + deploy (integridade bloqueia; comportamento só avisa) |
| `data_freshness.yml` | a cada 30 min | alerta de dados atrasados (issue `alerta-dados`) |
| `nightly_eval.yml` | 03:00 de Brasília | medição do modelo em produção e painel (**hoje pula a medição**, faltam os segredos do Modal) |
| `lacunas_nlu.yml` | manual | perguntas reais que o NLU local não entende |
| `congelamento.yml` | push e PR | guarda do congelamento (§4.9) |

### 5.3 Contratos compartilhados (`contracts/`)
Mesmo arquivo, conferido por Android, site e, quando cabe, servidor. Mudou o comportamento de propósito → mude os três lados e o contrato.
| Arquivo | Conteúdo |
| :-- | :-- |
| `nlu_golden_cases.json` | 111 casos de referência do NLU (e do gate do modelo; **não acrescente casos** sem refazer a linha de base, a catraca compara o mesmo número de casos) |
| `nlu_real_cases.json` | perguntas reais revisadas por uma pessoa, só para medir (hoje vazio) |
| `nlu_nome_cases.json` | 33 casos de candidato por nome ("quem é o candidato a deputado X", nomes com palavras de outras regras) e listagens que não podem virar perfil |
| `answers_parity.json` | 66 textos de resposta idênticos entre Android e site (regerar: `node web/tools/gerar_paridade.mjs`) |
| `opiniao_cases.json` | 47 casos do filtro de opinião política da captura de perguntas |
| `geo_cases.json` | casos da sugestão de UF pela localização (site e o código inerte do Android, `SugestaoUfTest.kt`) |

### 5.4 Medir antes de afirmar
Lição repetida: não dizer "corrigido" sem reproduzir antes e depois. Padrões que funcionaram: (a) **varredura** de todos os 20.290 candidatos por várias formas de perguntar (a falha de "candidato a CARGO + nome" era 100 %); (b) **comparar o NLU antigo com o novo** sobre milhares de perguntas conhecidas e revisar cada diferença; (c) usar a **resposta real do TSE** como amostra de teste (o formato inventado escondeu o erro do 2º turno); (d) testar **ao vivo** depois do deploy (`/api/nlu`, `/api/ask`, `/api/health`).

## 6. Decisões do mantenedor (valem sobre qualquer sugestão em contrário)
| Data | Decisão |
| :-- | :-- |
| 01/10 | Dados **somente oficiais do TSE**; nada fictício. App sem anúncios e sem analytics. |
| 06/10 | **Estado escolhido à mão** na primeira abertura do Android, **sem localização** (evitar restrição na aprovação da Play). O site pode sugerir pelo aparelho. |
| 06/10 | O botão "Perguntar à IA na nuvem" **fica sempre disponível**, mesmo depois de uma resposta local correta (o NLU local às vezes erra). |
| 06/10 | **Treino e conversão de modelo são sempre locais**, para poupar o crédito do Modal. O Modal só serve. |
| 06/10 | Captura de perguntas **ligada**; o mantenedor avaliou que, com o filtro de opinião e o consentimento específico, atende à LGPD. A política mantém o texto "pode revelar opinião política" e a base do art. 11, I. |
| 07/10 | Texto gerado **ligado**, no ZeroGPU do Hugging Face (custo), Modal só de reserva com teto baixo. |
| 07/10 | Segredos vão em arquivo dentro de `secrets/`, não no chat. Depois de usar o WSL, `wsl --shutdown`. |

## 7. Observações e armadilhas (o que já deu errado)

**Dados e resultados**
- **Apuração do TSE:** o JSON ao vivo manda `e:"s"` também para quem **passa ao 2º turno** (`st:"2º turno"`). Ler só o `e` fez o app dizer "não haverá 2º turno, eleito com 47 %" em 06/10. Quem decide é o campo `st`. Há uma função única (`leituraSegundoTurno`) e uma trava: dois marcados e o primeiro abaixo de 50 % nunca é "eleito".
- O CSV `votacao_candidato_munzona` de 2026 **não traz linhas de Presidente** (o `_BR.csv` vem só com o cabeçalho): o pacote assinado não tem resultado de Presidente. A única fonte oficial desse cargo é a apuração ao vivo (`resultados.tse.jus.br`); sem ela o app avisa que não conseguiu consultar. Governadores têm a situação "2º TURNO" no pacote (AC, AM, DF, ES, RJ, RN, TO).
- Muitos 404 em `resultados.tse.jus.br` bloqueiam o IP por ~10 min: não sondar. Fotos: só `…/fotos/<uf>/<sq>.jpeg` de candidaturas com `temFoto`.

**NLU e modelo**
- **"candidato a CARGO" virava listagem e o nome se perdia** (todos os 20.290 candidatos falhavam). Corrigido em 09/10 no site e no Android; nome completo dentro da frase sai do texto antes das regras (nomes como "Maria Gato" ou "Tulio Fontes" não viram regra da urna ou fontes). Sobram 17 nomes sem solução pelo texto (2 letras, iguais a palavra ou estado, homônimos).
- **O modelo de nuvem não é "mais preciso" por definição:** o v2.1 devolvia "desconhecida" em um terço das perguntas comuns. Antes de prometer qualquer coisa, meça no gate.
- **Contaminação do gate:** extras derivados das falhas do golden são recusados; o v2.2 reprovou justamente por isso (estado digitado sozinho) e a correção foi cobrir a classe inteira, não os casos.
- O NLU da nuvem recebe **só a pergunta atual**; o contexto de conversa ("e de SP?") é aplicado **no aparelho** depois (`resolverContinuacao`). Nunca enviar perguntas anteriores ao servidor sem mudar a política.
- Número de candidato ("quem é o 13?") **não existe** no contrato v2 do modelo: o proxy tira o número do texto da pergunta (`groundNumero`), nunca da saída do modelo.
- Falha da nuvem tem dois motivos com avisos diferentes: o modelo **não entendeu** × o serviço **indisponível**.

**Texto gerado**
- Visto em teste: o modelo recebeu uma lista cortada em 1.000 caracteres e afirmou "total de 5 candidaturas" (eram 13). Por isso o contexto não corta no meio da linha e avisa quando está incompleto, e o verificador barra contagem sem fonte. **Builds antigos do Android ainda cortam em 1.000**: o servidor cobre.
- Fatos críticos (quem foi eleito, se há 2º turno) **nunca** vêm do texto gerado; o verificador compara com o que o app apurou.

**Ambiente (Windows / Git Bash / ferramenta de shell)**
- `git push` recusado por causa dos commits do robô de dados: `git pull --rebase origin main` e enviar de novo.
- Avisos "LF will be replaced by CRLF" do Git são inofensivos (os scripts de edição preservam o fim de linha de cada arquivo).
- Git Bash reescreve caminhos que começam com `/` em argumentos de programa Windows: `MSYS_NO_PATHCONV=1` (visto no `modal volume put` e no `adb`).
- Heredocs com muitas aspas ou `\n` dentro de Python quebram na ferramenta de shell: grave o script com a ferramenta de escrita e rode o arquivo. `\u0000` vira byte nulo: use `chr()`.
- Smart App Control/WDAC bloqueia binários não assinados (`llama-quantize.exe`): a quantização usa a API do `llama-cpp-python` (a wheel carrega).
- O notebook suspende e congela o treino (§4.5). Treino e conversão disputam GPU/CPU: não rodar medições pesadas durante o treino.
- Gradle: ver §5.1 (relatório antigo).
- **`eval/` é só o histórico do painel** (um arquivo por execução no formato de `eval_golden.py --out`); arquivos em outro formato quebram `tools/test_metricas.py` e o CI (aconteceu em 07/10).
- Linhas "PROBLEMA: classe obrigatória AUSENTE" no log do CI eram saída simulada de um teste do verificador de release (agora capturada); um release real quebrado teria o passo `verificar_release` vermelho.

**Android**
- R8 + WorkManager/Room quebrou o release: regras em `app/src/main/keepRules/rules.keep`. **Sempre** testar o release em aparelho.
- Campos de texto no Compose: nunca alimentar `value` por `StateFlow` ou DataStore (cursor volta em Xiaomi/Gboard); use `mutableStateOf`.
- Xiaomi/HyperOS: `adb shell input` exige "Depuração USB (Configurações de segurança)".
- Toda sugestão exibida precisa ser respondível (`PerguntasReaisTest` percorre as sugestões).

**Operação**
- **Conferir o CI, não só o deploy**, depois de cada push.
- Mudança de variável da Vercel só vale no próximo deploy.
- O pacote assinado manda o que os apps mostram (`cliente.ask.enabled`, `cliente.melhoria.enabled`); mudar uma flag exige publicar dados.

## 8. Custos e limites
| Recurso | Limite | Uso e observação |
| :-- | :-- | :-- |
| Modal | US$ 30/mês grátis (workspace) | 1 a 6/10: US$ 4,50 medidos (NLU US$ 0,49; Qwen 7B na GPU US$ 3,50; conversão US$ 0,38); cobrado US$ 0. `python -m modal billing summary` e `billing report --for "this month" -r d --show-resources --json`. **O teto de gasto só se define no painel.** |
| Modal, NLU (CPU) | ~US$ 0,40/h ligado | ~US$ 3/mês no ritmo atual |
| Modal, Qwen 7B (L4) | ~US$ 0,88/h ligado, cobra o contêiner inteiro (inclui 120 s de espera) | ~US$ 39/mês se usado como em 04–05/10; por isso o principal agora é o Hugging Face e a reserva tem teto de 15/dia |
| Hugging Face (PRO) | 40 min de GPU/dia no ZeroGPU, conta só o tempo de GPU | ~3 s por resposta; passar da cota só cobra se houver **crédito pré-pago** (US$ 1 por 10 min): não deixe saldo |
| Upstash (gratuito) | 500 mil comandos/mês, 256 MB | cada chamada de nuvem usa ~4 comandos (2 contadores de limite × INCR+EXPIRE) |
| Vercel (Hobby) | uso não comercial | firewall: 60 req/min por IP em `/api/*` |

## 9. Pendências abertas
1. **Enviar a 1.0.3 ao teste fechado** e testar o release num aparelho antes (`docs/RELEASE_1.0.3.md`). Manter os 12 testadores por 14 dias.
2. **Definir o teto de gasto no painel do Modal** (US$ 30) e testar.
3. **Segredos `MODAL_ENDPOINT`, `MODAL_KEY`, `MODAL_SECRET` no GitHub** para a avaliação noturna realmente medir (hoje pula).
4. **Decidir o texto gerado no congelamento** (24 a 26/10): hoje `on`.
5. Backup offline de `secrets/upload-keystore.p12`, `keystore.properties` e `secrets/data_signing_key.pem` (perder a chave de dados exige novo app).
6. **Próximo ciclo do modelo (v2.4):** "quantos votos teve o lula?" volta sem o `nome`; "no rio" não vira RJ na nuvem; "Quantas mulheres são candidatas?" marca tema; acrescentar formulações com essas classes. Fora do congelamento.
7. Texto gerado: avaliar o volume real (a cota de 40 min é da conta inteira) e a revisão jurídica da política 1.4.
8. Código inerte de sugestão de estado por localização no Android (`SugestaoUf.kt`): pode ser removido numa limpeza.
9. Licença da base Qwen2.5 no model card; relato privado de vulnerabilidades (*Settings › Security*); passada de acessibilidade (TalkBack) e tablets.

## 10. Segredos e backups (nunca no Git)
`secrets/upload-keystore.p12` + `keystore.properties` (chave de **upload** do Play), `secrets/data_signing_key.pem` (assinatura dos **dados**; chave pública em `pipeline/data_signing_public.pem`), `secrets/hf_token.txt` (token do Space), `secrets/upstash.env` (URL e token do Redis). A pasta `secrets/` é ignorada pelo Git. Faça backup offline das chaves de assinatura.

## 11. Histórico recente (05 a 09/10/2026)
- **05/10:** `data_refresh` falhou 18 vezes (testes web assumiam "ninguém eleito"); resultados do 1º turno só chegaram à produção às 02:26 UTC de 06/10. Os testes de comportamento deixaram de bloquear a publicação de dados.
- **06/10:** plano em 6 fases executado (gate endurecido, holdout, captura de perguntas com revisão humana, canário, paridade Android×site, testes de workflows). IA generativa e captura entregues desligadas. Filtro de opinião política nas 3 camadas. Política 1.3. Upstash criado e captura ligada. Botão da nuvem restaurado depois de resposta correta. Nuvem passou a seguir a conversa. Correção do 2º turno (`e:"s"` × `st`). Mensagem de falha da nuvem separada em dois motivos. Avaliação noturna e painel.
- **07/10:** modelos **v2.2** (reprovou no gate: estado e tema) e **v2.3** (aprovado e promovido; treino e conversão locais). Número de candidato na nuvem. "No Rio" = RJ. Texto gerado no ZeroGPU do Hugging Face com Modal de reserva, verificador reforçado, política 1.4, recurso **ligado**. CI vermelho por 6 execuções (`eval/` em formato errado), corrigido; saída simulada do verificador silenciada.
- **08 a 09/10:** release **1.0.3 (versionCode 4)** montado e verificado; notas e passo a passo em `docs/RELEASE_1.0.3.md`. **Correção do NLU para "quem é o candidato a deputado X"** e nomes com palavras de outras regras (de 100 % de falha para 0,08 % entre os candidatos; contrato `nlu_nome_cases.json`). Este arquivo reescrito e `CLAUDE.md` criado.

---

# Registro anterior (01 a 05/10/2026)

> Mantido como história. Itens marcados **(superado)** já não valem; o que vale está acima.

## Estado em 06/10/2026 (após o 1º turno) — **(superado em parte: ver §1, §4 e §11 acima)**
Ver [`OPERACAO.md`](OPERACAO.md) (documento de estado atual). Resumo do que mudou desde 03/10:
- **Incidente 05/10 16:49 UTC a 06/10 02:23 UTC:** `data_refresh` falhou 18 vezes seguidas porque dois testes web assumiam "ninguém eleito"; os resultados do 1º turno só chegaram à produção às 02:26 UTC. Correção: testes seguem `manifest.resultadosDisponiveis`; o workflow separa integridade (bloqueante) de comportamento (informativo); alerta `data_freshness.yml`.
- **`/api/ask` (Qwen 7B, texto gerado) desligado por padrão**: exige `ASK_ENABLED=1` + `MODAL_ASK_ENDPOINT` explícito; o manifesto assinado traz `cliente.ask.enabled=false` e os clientes escondem o botão. Respostas passam por `api/_lib/neutralidade.js` (recomendação, contradição do 2º turno, números sem fonte); texto rotulado "pode conter erros".
- **Gate do modelo endurecido**: todos os limiares bloqueiam. Medido sobre os 111 casos do contrato, o `v2.1-20261003` em produção tem **intenção 78,4 %** (os 87,1 % eram sobre 93 casos) e seria reprovado; as falhas estão em REGRAS_URNA/LOCAL_VOTACAO, que o NLU local resolve. Retreino v2.2 pendente (fora do congelamento).
- **Holdout**: `contracts/nlu_real_cases.json` (vazio, só perguntas reais revisadas) + balde estável sha256 % 100 (20 %) idêntico em Python e JS; extras `origem=falhas_golden` são recusados.
- **Operação**: build atômico do pacote, cron a cada 30 min, snapshot versionado diário, contadores globais opcionais (Upstash), guarda de congelamento de 24 a 26/10.
- **Lições**: (1) teste de hipótese de fase não pode bloquear publicação de dados; (2) `\u0000` em heredoc/Python pela ferramenta de shell vira byte nulo: escreva blocos com Write e use `chr()`; (3) o gate documentado não era o gate implementado.

## Estado em 01/10/2026 — **(superado)**
- **Dados:** pipeline reprodutível (`pipeline/`), snapshot oficial `data/eleicoes2026` (extração TSE 01/10/2026 12:31): 20.988 candidaturas (19.919 na urna), 3.457 pesquisas, bens, prestação de contas (19.166), planos (219 com PDF), fotos de majoritários; manifesto assinado ECDSA.
- **App Android:** reescrito (MVVM, DataStore, WorkManager), release R8 de ~8 MB assinado com chave de upload; 39 testes unitários + 4 instrumentados passam; lint limpo.
- **IA:** local-first (NLU por regras + respostas dos dados); nuvem opcional (opt-in) via `/api/nlu` → Modal (CPU, llama.cpp) — **código pronto, não implantado** (precisa de contas/credenciais).
- **Site/PWA e API:** construídos em `web/`, `api/`, `backend/` (ver relatórios abaixo); **não implantados** (precisa da Vercel/Modal do usuário).
- **Play Store:** materiais prontos (`store/play`, `docs/PLAY_STORE.md`); envio é manual.

## Publicação (02/10/2026, madrugada)
- **Vercel:** projeto `saibatudo` (time `franciscoaleixo-9696`), produção em <https://saibatudo.vercel.app>; domínios
  `saibatudo.net` e `www.saibatudo.net` adicionados — falta o DNS no GoDaddy (`A @` e `A www` → `76.76.21.21`; NS atuais
  `domaincontrol.com`). Firewall: regra "Limite da API" 60 req/min por IP em `/api/*`. `.vercelignore` precisa manter
  `web/tools/minify.mjs` e `brand/fonts/` (usados pelo build).
- **GitHub (segredos):** `DATA_SIGNING_KEY`, `UPLOAD_KEYSTORE_B64`, `UPLOAD_KEYSTORE_PASSWORD`, `VERCEL_ORG_ID`,
  `VERCEL_PROJECT_ID` configurados; **`VERCEL_TOKEN` falta** (a API da Vercel não deixa a credencial da CLI criar token: gerar em
  vercel.com/account/tokens). Sem ele, `data_refresh` gera e assina mas não publica (aviso no resumo). Rótulo `relato-ia` criado.
- **Modal:** imagem compila `llama-cpp-python` do código-fonte (a wheel "cpu" do índice é musl e não carrega no Debian).
  Teto de gasto do workspace só pelo painel (Settings → Usage & Billing).
- **Relatos (`/api/report`):** desligados até criar um token *fine-grained* do GitHub só com `Issues: write` (`GITHUB_TOKEN` na Vercel).

## Decisões-chave (e por quê)
1. **Ficha Limpa só derivada da situação oficial.** O cálculo antigo marcava renunciados/falecidos/pendentes como "inelegíveis" e chamava "processos administrativos" a contagem de motivos de indeferimento. Agora: situação oficial do julgamento + motivos; campo `naUrna` distingue 1.069 registros fora da urna (ex.: Pablo Marçal, indeferido). Após o teste no celular (01/10), o usuário pediu a Ficha Limpa visível: ela é **derivada e rotulada** (deferido = sem impedimento; indeferido com motivo "Inelegibilidade infraconstitucional (LC 64/90)" = inelegível), regra em `DATA_CONTRACT.md` §3.1.
2. **Reeleição:** `ST_REELEICAO` vem `#NE` em 2026; usamos "já eleito para este cargo (histórico TSE)" rotulado como derivado.
3. **IA interpreta, dados respondem; sem recomendação.** Res. TSE 23.755/2026 proíbe IAs de ranquear/recomendar candidaturas. Listas em ordem fixa; recusa de "em quem votar".
4. **Local-first + nuvem opt-in.** Reduz custo (Modal CPU, créditos gratuitos), risco de abuso e superfície de privacidade. Sem chave de IA no APK.
5. **Sem anúncios, sem analytics; localização só no aparelho.** A pedido do usuário (01/10), a UF vem **sugerida pela localização aproximada** (permissão COARSE, malha do IBGE embutida em `data/geo/ufs.json`, ponto-no-polígono no aparelho; casos em `contracts/geo_cases.json`); nada é enviado, só a sigla escolhida é guardada; Vercel Hobby é não comercial; Google Ads veta conteúdo de candidatos. **(superado em 06/10: no Android a UF é escolhida à mão e o app não usa localização; só o site sugere pelo aparelho.)**
6. **Dados assinados e atualizáveis sem nova versão do app** (ECDSA P-256; chave privada só no CI/local; **perder a chave = novo app**). `.gitattributes` impede conversão de EOL no pacote.
7. **Resultados:** apuração ao vivo direto do TSE (`-u.json`, CORS aberto; ≤100 req/IP/s; cache 60 s; **muitos 404 bloqueiam o IP ~10 min — não sondar agressivamente**); CSV oficiais (`votacao_candidato_munzona`) aparecem como arquivo de 1 byte até a apuração e são tratados como "ainda não publicado". `DS_SIT_TOT_TURNO` vem em maiúsculas após a eleição.
8. **PWA como canal principal em outubro:** a Play não publica antes do 1º turno (e, com conta pessoal nova, nem antes do 2º).
9. **Modal em CPU (GGUF Q4) atrás de proxy Vercel**; GPU e Inference Endpoints do HF descartados por custo; HF Pro deixa de ser necessário para este fluxo. **(em parte superado: o NLU segue em CPU no Modal, mas o texto gerado usa GPU, no ZeroGPU do Hugging Face com reserva no Modal L4; ver §4.6.)**

## Armadilhas conhecidas
- **R8 + WorkManager/Room:** o release quebrava (`WorkDatabase` removido) — regras em `app/src/main/keepRules/rules.keep`. **Sempre teste o release em dispositivo.**
- **Git Bash no Windows converte `/sdcard/...` em caminho do Git** (`MSYS_NO_PATHCONV=1`); a cwd dentro de pastas a renomear trava `git mv`.
- **WDAC** bloqueia `_lzma.pyd`/extensões C no Python do projeto: pipeline usa só Python puro (`pypdf`, `ecdsa`); `ai_model/.venv/.../sitecustomize.py` contorna `lzma` no treino.
- **Akamai/WAF** bloqueia `divulgacandcontas`, `www.tse.jus.br` e TREs para clientes simples; a CDN `cdn.tse.jus.br` e `resultados.tse.jus.br` respondem normalmente (User-Agent de navegador).
- Fotos: o CDN de resultados serve `…/fotos/<uf>/<sq>.jpeg` para todas as candidaturas **com foto** (`temFoto`); pedir fotos inexistentes gera 404 em massa.
- Emulador: não é possível alterar a data do sistema (para testar fases use testes de unidade/instrumentados com `hoje` injetado).
- **Campos de texto no Compose:** nunca alimentar `value` de um `TextField` por `StateFlow` coletado ou DataStore (atualização assíncrona) — em teclados reais (Xiaomi/Gboard) o cursor volta e as letras saem fora de ordem. Use `mutableStateOf` (síncrono).
- **Xiaomi/HyperOS:** `adb shell input` exige "Depuração USB (Configurações de segurança)"; sem isso só dá para instalar e capturar tela.
- **Toda sugestão exibida precisa ser respondível:** `PerguntasReaisTest` percorre as sugestões (2 níveis) e falha se alguma cair em "não entendi".

## Segredos e backups (nunca no Git)
`secrets/upload-keystore.p12` + `keystore.properties` (chave de **upload** do Play), `secrets/data_signing_key.pem` (assinatura dos **dados**; chave pública em `pipeline/data_signing_public.pem`). Faça backup offline.
Segredos de CI/Vercel/Modal listados em [`PLANO_PRODUCAO.md`](PLANO_PRODUCAO.md) §5 e [`BACKEND.md`](BACKEND.md).

## Histórico resumido
- 30/09/2026 — primeira versão com dados do TSE (30/09), modelo Qwen2.5-1.5B publicado no HF.
- 01/10/2026 — **auditoria e produção**: pipeline v2, correções de semântica, novo app (pacote `net.saibatudo.eleicoes2026`), atualização assinada, resultados ao vivo, prestação de contas, identidade visual, CI, site/PWA, backend de IA, documentação e materiais da Play. Commits `c660903` → `e89a8d6` (e seguintes).
- 01/10/2026 (noite) — **correções do teste no celular**: cursor/travamento nos campos de texto, perguntas não entendidas (número de urna, vice, plano de governo, contas, voto branco/nulo, saudações, simulador pelas sugestões), Ficha Limpa derivada e visível, respostas em linhas/tópicos. Contrato de NLU v2 (74 casos).
- 02/10/2026 — **NLU: fim dos perfis falsos** (nomes de urna que são palavras comuns: TRANSPORTE, SAUDE, FAVORITO, CONTRA, SOCIAL…): `resolverNome` em 3 modos (indício de pessoa / só o nome / sem indício exige 2+ palavras e remove temas), `RX_CUE_FALSO`, `RECOMENDACAO` ampliada (favorito, chances, próximo presidente, virada, rejeição — Res. 23.755/2026) e cobertura nova (urna segura, voto impresso, cabine/celular, mesário, voto em trânsito, biometria, quem fiscaliza, fake news/denúncia). Contrato 74 → **93 casos**. **Pipeline de perguntas externas**: `backend/retrain/label_extra.mjs` (o rótulo sai do NLU dos clientes sobre o pacote oficial e só vale se for ponto fixo do normalizador), `colher_relatos.mjs` (relatos públicos, exige `--confirmar-finalidade` por LGPD) e `--extra/--extra-max-pct` no gerador com proveniência/licença. **Fontes oficiais**: 3 links mortos trocados (Senado, MPF, AGU), 12 anomalias de URL sanadas (`?session=`, `http://`, `/.`, `copy_of_`), `sistemasNacionais` 3 → 6 e `pipeline/tests/test_fontes.py` (12 testes; antes não havia nenhum). Commits `415d7ee`, `0f7f8da`, `fe270b3`.
- 03/10/2026 — **NLU v2.1 no ar**: dataset com 20.618 exemplos (554 externos: 441 da lista do mantenedor + 173 formas fracas derivadas das falhas do gate), treino local na RTX (3 épocas, 3.663 passos, perda 2,3383 → 0,1321), quantização **local no WSL2** (Q4_K_M 940 MB + Q5_K_M + Q8_0, llama.cpp b11355), gate local com `llama-cpp-python 0.3.19`: JSON nativo **100 %**, intenção **87,1 %** (90,0 % excluindo os 3 casos que o contrato v2 não expressa), entidades 100/93,3/100, alucinação **0 %**, **0,77 s** média. Promovido no Modal (`current=v2.1-20261003`, `format=v2`) subindo o GGUF direto para o Volume com `modal volume put` + `convert_gguf.py::promote` — sem depender do upload HF. `MODEL_VERSION` atualizado na Vercel, deploy via `data_refresh` forçado e produção validada (1-2 s quente, cold start 14 s sem 504, `RECOMENDACAO` funcionando). Snapshot `data/eleicoes2026` sincronizado com o pacote assinado de produção (789 arquivos, ECDSA + sha256 verificados localmente). Commits `1121726`, `0076402`.

### Lições operacionais de 02–03/10/2026
- **Memória mata o treino:** `.wslconfig` com `memory=20GB` + pagefile fixo de 28 GB em máquina de 31,5 GB → evento Windows 2004 ("memória virtual insuficiente": vmmemWSL 21 GB, python 7,8 GB, kilo 3,1 GB), `WinError 1455` e `LiveKernelEvent 141/193`. Regra: **não treinar com o WSL ligado**; `dataloader_num_workers=0` no Windows (o spawn recarrega o torch e estoura a paginação).
- **Smart App Control/WDAC bloqueia binários não assinados** (evento CodeIntegrity 3077 no `llama-quantize-impl.dll`): no Windows só roda o que é assinado — `llama-cpp-python` (wheel) carrega, os `.exe` do llama.cpp não. Saída: quantizar no **WSL2** (e `wsl --shutdown` ao terminar) ou no job do Modal.
- **Gradle mente com "BUILD SUCCESSFUL":** testes que leem arquivos fora do módulo (`contracts/`, `data/`) precisam de `inputs.files(...)` declarado, senão a tarefa fica UP-TO-DATE e o relatório é antigo. Confira sempre o **timestamp do XML** em `app/build/test-results/`.
- **O gate de código é mais fraco que a documentação:** `check_gates` só bloqueia JSON válido (≥98 % nativo, 100 % com gramática), `--min-entity-acc` (default 0) e queda Q4×Q8 ≤3 pp. Intenção/entidades/alucinação são **reportados, não bloqueantes** — pendência: endurecer `check_gates`.
- **Publicação de modelo:** nunca sobrescrever sem fixar a revisão anterior (`13851ea0d02628546da18121f03831a92d2a38f4` = v1-legado, recuperável por `--revision`), e o rollback é `convert_gguf.py::promote --version v1-legado` (o Volume guarda versões imutáveis; o serviço não baixa do HF em runtime).
