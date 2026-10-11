# Backend de IA e canal de relatos — SaibaTudo Eleições 2026

Camada opcional (opt-in) que interpreta perguntas que o NLU **local** não entendeu e recebe relatos de respostas
estranhas. Contrato público em [`DATA_CONTRACT.md`](DATA_CONTRACT.md) §9; este documento descreve a implementação,
a segurança e a operação.

> **Princípio:** a nuvem devolve **só intenção e entidades, nunca fatos.** Os clientes (app Android e site/PWA)
> revalidam tudo contra os dados oficiais locais (cargo/UF/partido do vocabulário; `nome` precisa existir no pacote).
> Sem a nuvem, o produto continua funcionando integralmente (NLU local + dados assinados).

## 1. Arquitetura

```
  App Android / Site (PWA)                         ── NLU local-first: regras + Gazetteer dos dados oficiais
        │  só se o usuário consentiu E o NLU local não entendeu
        │  POST /api/nlu {q, v:1, client, iid}        POST /api/report {q,a,intent,origem,dataVersion,app,note,client}
        ▼
 ┌─────────────────────────── Vercel (plano Hobby, uso não comercial) ───────────────────────────┐
 │  Vercel Firewall: 1 regra de rate limit por IP (barreira real)                               │
 │  api/nlu.js ── CORS ► método ► kill switch ► corpo/validação ► rate limit (IP, iid)          │
 │                 ► cache LRU 1 h ► orçamento diário ► chamada ao Modal ► normalização/ancoragem│
 │  api/report.js ─ validação ► sanitização ► rate limit ► GitHub REST (issue pública)          │
 │  api/health.js ─ {ok, version, model, nlu, report, time}                                     │
 │  Segredos SÓ aqui: MODAL_KEY, MODAL_SECRET, GITHUB_TOKEN                                     │
 └───────────────┬───────────────────────────────────────────────┬──────────────────────────────┘
                 │ HTTPS + Modal-Key / Modal-Secret              │ HTTPS + Bearer (issues:write)
                 ▼                                               ▼
 ┌──────────────── Modal.com (CPU, 8 núcleos, 3 GiB) ───────┐   ┌──── GitHub ──────────────────────┐
 │ backend/modal/nlu_app.py  (requires_proxy_auth)          │   │ issue pública, rótulo `relato-ia`│
 │ llama.cpp + GGUF Q4_K_M (Volume) + gramática GBNF        │   └──────────────────────────────────┘
 │ scaledown_window 30 s · max_containers 2                 │
 └──────────────────────────────────────────────────────────┘
   (conversão/avaliação/promoção: backend/modal/convert_gguf.py ; retreino: backend/retrain/)
```

Decisões: proxy serverless na Vercel (o app não carrega chave nenhuma); inferência **em CPU** com llama.cpp (tráfego
esparso: GPU cobraria cold start sem ganho); **não** se usa o Hugging Face Inference API (não serve fine-tune próprio).

## 2. Fluxo de uma pergunta

1. O app/site tenta o **NLU local**. Se a pergunta foi entendida, **nada sai do aparelho**.
2. Só se **não entendeu** e o usuário deu **consentimento**, envia `q` (≤ 300 caracteres) + `iid` (UUID aleatório da
   instalação) para `POST /api/nlu`.
3. O proxy: verifica **Origin** (CORS) → **método** → **kill switch** (`MODAL_ENDPOINT` vazio ⇒ 503 `disabled`) →
   lê o corpo (≤ 4 KB, `application/json`) e **valida** → **rate limit** (IP e `iid`) → **cache** (chave = pergunta
   normalizada + `MODEL_VERSION`; TTL 1 h) → **orçamento diário** → chama o **Modal** (timeout total `MODAL_TIMEOUT_MS`,
   1 retry só em 5xx).
4. O Modal monta o prompt **idêntico ao do treino** (ChatML do Qwen2.5), gera com `temperature 0` e **gramática GBNF**
   (JSON sempre válido e curto) e devolve o JSON bruto do modelo.
5. O proxy **normaliza** (`api/_lib/normalize.js`): formato legado → contrato novo; descarta valores fora do vocabulário
   e entidades **sem evidência na pergunta** (“ancoragem”); nunca repassa `direct_answer`/`suggested_questions`.
6. Responde `{ok:true, nlu:{…}, model, cached}`. O cliente **revalida** contra os dados locais e monta a resposta **só com
   dados oficiais**. Qualquer erro (4xx/5xx/timeout/`ok:false`) ⇒ o cliente usa a resposta do NLU local.

Perguntas de **recomendação de voto** (`RECOMENDACAO`) são recusadas pelo app com neutralidade — a nuvem apenas sinaliza
a intenção (sem entidades).

## 3. API

### `POST /api/nlu`

Entrada: `{ "q": "<3–300 caracteres>", "v": 1, "client": "android"|"web", "iid": "<UUID v4/v7>" }`.
Saída 200: `{ "ok": true, "nlu": { "intent", "cargo?", "uf?", "partido?", "nome?", "tema?", "apenasDeferidas?", "historico?", "turno?" }, "model": "<MODEL_VERSION>", "cached": false }`.

| HTTP | `error` | Quando |
| :-- | :-- | :-- |
| 400 | `bad_request` (+`field`) / `invalid_json` | corpo/campos inválidos (`q`, `v`, `client`, `iid`) |
| 403 | `origin` | cabeçalho `Origin` fora de `ALLOWED_ORIGINS` |
| 405 | `method_not_allowed` | método ≠ POST/OPTIONS (`Allow` informado) |
| 413 / 415 | `payload_too_large` / `unsupported_media_type` | corpo > 4 KB / sem `application/json` |
| 429 | `rate_limited` | cota por IP ou por `iid` (`Retry-After`) |
| 502 | `upstream` / `bad_model_output` | Modal falhou, 4xx/401 do Modal, JSON do modelo inválido |
| 503 | `disabled` / `budget` | kill switch ligado / orçamento diário esgotado |
| 504 | `timeout` | Modal não respondeu em `MODAL_TIMEOUT_MS` |

`OPTIONS` responde o preflight (204). Sem `Origin` (app Android, curl) é permitido. Em todo erro o cliente cai no NLU local.

### `POST /api/report`

Entrada: `{ q, a, intent, origem, dataVersion, app, note?, client }` (`q` ≤ 300, `a` ≤ 1500, `note` ≤ 500; `dataVersion` e
`app` obrigatórios). Cria uma **issue pública** em `GITHUB_REPO` (padrão `franciscoaleixoIOT/SaibaTudo`) com o
rótulo `relato-ia` (**crie o rótulo antes**; só quem tem permissão de escrita aplica rótulos). Saída: `{ok:true}`.
Status: 400/403/405/413/415 como acima; 429 (5 relatos/hora/IP); 503 `disabled` (sem `GITHUB_TOKEN`) ou `budget`
(teto diário `REPORT_DAILY_MAX`); 502/504 se o GitHub falhar.

Sanitização (`api/_lib/sanitize.js`): todo texto do usuário vai **dentro de blocos de código** (cerca maior que qualquer
sequência de crases do conteúdo ⇒ não dá para “fechar” o bloco); `@menções` ganham um zero-width space (não notificam);
`#123`/`GH-123` não viram link; links e HTML ficam inertes dentro do bloco; e-mail, CPF, telefone e números longos
(≥ 9 dígitos) são **mascarados**; controles/zero-width/bidi removidos; truncamento por pontos de código. Metadados
(`intent`, `origem`, `dataVersion`, `app`, `client`) passam por regex/enum estritas. O título **não** contém texto do
usuário. Relato idêntico na última hora não cria issue duplicada. **O app deve avisar o usuário de que a issue é pública.**

### `POST /api/ask` (IA generativa — **desligada por padrão**)

Texto gerado por modelo (Qwen2.5-7B no Modal, GPU). Só funciona com `ASK_ENABLED=1` **e** `MODAL_ASK_ENDPOINT` explícito (+ credenciais do
Modal); sem isso responde 503 `disabled`. Os clientes só oferecem o botão "Gerar explicação com IA" quando o manifesto assinado traz
`cliente.ask.enabled=true` (o pipeline escreve `false` salvo `SAIBATUDO_ASK_ENABLED=1`). Entrada: `{ q, context?, v:1, client, iid }`
(`context` ≤ 4.000 caracteres, **enviado pelo app e não verificado** pelo servidor). Saída 200: `{ ok:true, answer, model, cached }`.

Neutralidade e verificação (`api/_lib/neutralidade.js`, Res. TSE 23.755/2026):

| HTTP | `error` | Quando |
| :-- | :-- | :-- |
| 422 | `neutrality` | a **pergunta** pede recomendação, comparação ou previsão de candidatos (ou tenta ignorar as regras): nem chega ao Modal, sem custo de GPU |
| 422 | `rejected` | a **resposta** gerada recomenda/prevê candidatos, contradiz a regra do 2º turno (CF arts. 28 e 77) ou traz números que não estão na pergunta, no contexto enviado nem nas regras autorizadas |

Nada é "corrigido" com texto fixo: resposta reprovada vira erro e o cliente fica com a resposta local, montada só dos dados. O texto exibido
é rotulado "Texto gerado por IA … pode conter erros". **Pré-condição para religar em escala:** montar o contexto no servidor a partir do
pacote assinado (hoje o cliente o fornece), medir o custo real da GPU (`modal run backend/modal/qwen7b_awq_app.py::bench`) e testar o
limite de gasto do workspace.

### `GET /api/health`

`{ ok:true, version:<sha curto|"dev">, model, nlu:"on"|"off", report:"on"|"off", time }`. Sem segredos e **sem chamar
o Modal** (não gera custo). `nlu:"off"` = kill switch ativo.

## 4. Segurança

| Controle | Implementação |
| :-- | :-- |
| **Segredos só na Vercel** | `MODAL_KEY`, `MODAL_SECRET`, `GITHUB_TOKEN` em variáveis de ambiente (marcar *Sensitive*). **Nenhuma chave no APK/site.** Respostas e logs nunca os contêm. |
| **Autenticação do Modal** | `requires_proxy_auth=True` (Proxy Auth Token: cabeçalhos `Modal-Key`/`Modal-Secret`). Sem token ⇒ o Modal responde 401 antes de acordar o container. Revogável no painel. |
| **Token do GitHub mínimo** | Fine-grained, **só** o repositório de relatos e a permissão `Issues: write`. |
| **CORS restrito** | `ALLOWED_ORIGINS` (padrão `https://saibatudo.net`, `https://www.saibatudo.net`; `*` casa só um trecho de hostname, ex. `https://saibatudo-*.vercel.app` para previews). Origem não listada ⇒ 403 também no `POST`. Nunca `*`. |
| **Validação** | JSON, `Content-Type`, 4 KB, `q` 3–300, `v==1`, `client`∈{android,web}, `iid` UUID v4/v7; controles/zero-width removidos; `<\|…\|>` neutralizados (a pergunta não forja tokens do ChatML). Revalidada no Modal (`validate_question`). |
| **Rate limit em memória** | Janela deslizante: 20/min por IP e 60/dia por `iid` (`RATE_*`); 5 relatos/h por IP. **É por instância** (cada instância fria zera): é só a 1ª camada. |
| **Orçamento diário** | `DAILY_BUDGET` chamadas ao Modal/dia (dia de Brasília, UTC−3). Ao estourar: 503 `{ok:false,error:"budget"}` e o cliente usa o NLU local; respostas em cache continuam sendo servidas. Também é por instância. |
| **Barreiras reais de custo** | (1) **Vercel Firewall**: no Hobby há **1 regra** de rate limit (janela 10 s–10 min, chave IP) — configure uma para `/api/*` (sugestão: 60 req/min/IP; contadores são por região). (2) **Modal**: `max_containers=2` e **Workspace budget** (spend limit). (3) `DAILY_BUDGET`. |
| **Cache / coalescência** | Perguntas idênticas simultâneas compartilham 1 chamada; cache só guarda a saída **normalizada**, em memória, 1 h. |
| **Anti-alucinação** | Vocabulário fechado + **ancoragem**: cargo/UF/partido/nome/tema só passam se houver evidência textual na pergunta (o modelo legado “lembra” cargo/UF/partido de candidatos do treino — sem isso, “Quem é Maria Silva?” poderia filtrar por outra pessoa). `PERFIL_CANDIDATO` exige `nome` ancorado. |
| **Cabeçalhos** | `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, CSP `default-src 'none'`, HSTS. |
| **Falha segura** | Erros internos devolvem 500 genérico (sem mensagem); handler isolado por `try/catch`. |

### Privacidade e minimização

- **O texto da pergunta não é registrado** em log (nem na Vercel, nem no Modal): os logs têm só status, latência, cache
  hit/miss, `client` e códigos de erro (teste automatizado cobre isso, inclusive o `console.log` padrão). O Modal imprime
  apenas `{ok, ms, tokens, stop}`.
- IP e `iid` ficam **apenas na memória da instância** (janelas de 1 min/1 h/24 h) e **nunca** são registrados nem
  repassados ao Modal ou ao GitHub. O `iid` é aleatório por instalação (sem relação com conta/dispositivo).
- A pergunta **transita** pela Vercel e pelo Modal (processamento em memória) — informe isso na tela de consentimento.
- Relatos viram issues **públicas**: sem IP/`iid`; PII comum é mascarada, mas o usuário pode digitar dados pessoais em
  texto livre — avise no app.

## 5. Observabilidade mínima (sem dados pessoais)

- **Vercel → Logs** (Hobby retém ~1 h): linhas JSON `{"evt":"nlu","status":200,"ms":812,"cache":"miss","client":"android","drop":1}`
  e `{"evt":"report","status":200,"ms":240,"client":"web"}`; `err` traz o código (`rate_limited`, `timeout`, `budget`…);
  `drop` = nº de campos descartados por vocabulário/ancoragem (sinal de deriva do modelo).
- **Modal → Logs/Usage:** `{"evt":"infer","ok":true,"ms":6400,"tokens":130,"stop":"stop"}` e `model_loaded` (segundos de
  carga = cold start). Painel de uso/cobrança em *Settings → Usage & Billing*.
- **Sondas:** `GET /api/health` (barato) e `modal run backend/modal/nlu_app.py::bench` (latência real).
- Indicadores a olhar: taxa 429/503/504, `cache:"hit"` %, p95 de `ms`, `drop` médio, gasto do Modal vs. budget.
- Hobby não oferece *log drains*: se precisar de histórico, é preciso Pro ou uma ferramenta externa.

## 6. Variáveis de ambiente (Vercel)

| Variável | Padrão | Descrição |
| :-- | :-- | :-- |
| `MODAL_ENDPOINT` | *(vazio = nuvem desligada)* | URL https do `…-nlu-infer.modal.run`. **Kill switch: esvazie e faça redeploy.** |
| `MODAL_CANARY_ENDPOINT` / `CANARY_PCT` / `CANARY_MODEL_VERSION` | *(sem canário)* | **Canário do NLU**: URL do app `saibatudo-nlu-canary`, % das instalações (0–100, balde estável por `iid`) e versão que ele serve. Falha do canário => a pergunta é refeita na produção. Passo a passo e rollback: `docs/OPERACAO.md` §7. |
| `MELHORIA_ENABLED` / `MELHORIA_PER_HOUR` / `MELHORIA_PER_DAY` | *(desligado)* / `6` / `20` | **Captura de perguntas não entendidas** (`POST /api/melhoria`): só com `MELHORIA_ENABLED=1` **e** Redis configurado; guarda só texto + contagem/dia por 90 dias. Antes de ligar: política de privacidade (`docs/PRIVACIDADE_melhoria_RASCUNHO.md`). |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (ou `KV_REST_API_URL` / `KV_REST_API_TOKEN`) | *(vazio = só limites por instância)* | **Contadores globais opcionais** (`api/_lib/compartilhado.js`): limite por IP, por instalação e orçamento diário compartilhados entre instâncias da Vercel, via Upstash Redis (REST). Falha **aberto** (Redis fora = vale só o limite local). Guarda IP e `iid` com expiração ≤ 1 dia: **antes de ligar, acrescente o Upstash aos operadores (§7) e à retenção (§8) de `docs/PRIVACIDADE.md`** (e à página web). `/api/health` mostra `"shared":"on"`. |
| `ASK_ENABLED` / `MODAL_ASK_ENDPOINT` | *(desligado)* | IA generativa `/api/ask` (Qwen 7B em GPU): **só liga com `ASK_ENABLED=1` E `MODAL_ASK_ENDPOINT` explícito** (+ `MODAL_KEY`/`MODAL_SECRET`). Não há derivação a partir de `MODAL_ENDPOINT` nem URL fixa; qualquer um dos dois vazio desliga. `/api/health` mostra `"ask":"on"\|"off"`. |
| `MODAL_KEY` / `MODAL_SECRET` | — | Proxy Auth Token do Modal (`wk-…`/`ws-…`). Sem eles a nuvem fica `disabled`. |
| `MODEL_VERSION` | `dev` | Versão em `current.json` do Modal; devolvida em `model` e **parte da chave do cache**. |
| `MODAL_TIMEOUT_MS` | `12000` (500–25000) | Timeout total da chamada (inclui o retry). Ajuste após o `bench`. |
| `DAILY_BUDGET` | `300` | Chamadas/dia ao Modal por instância (retry conta). `0` = nunca chama o Modal. |
| `RATE_IP_PER_MIN` / `RATE_IID_PER_DAY` | `20` / `60` | Limites em memória do `/api/nlu`. |
| `CACHE_TTL_SECONDS` / `CACHE_MAX_ENTRIES` | `3600` / `500` | Cache LRU. |
| `ALLOWED_ORIGINS` | `https://saibatudo.net,https://www.saibatudo.net` | Lista separada por vírgula (substitui o padrão); `*` = um trecho de hostname. |
| `MOCK_NLU` | — | `1` usa um modelo falso (**só dev**; ignorado se `VERCEL_ENV=production`). |
| `GITHUB_TOKEN` | — | Fine-grained, só `issues:write`. Vazio ⇒ `/api/report` responde 503. |
| `GITHUB_REPO` | `franciscoaleixoIOT/SaibaTudo` | `dono/repo` dos relatos (formato validado). |
| `REPORT_PER_HOUR` / `REPORT_DAILY_MAX` | `5` / `100` | Relatos/h por IP e teto diário global de issues. |

(`VERCEL_GIT_COMMIT_SHA` e `VERCEL_ENV` são definidas pela própria Vercel.) Variáveis só valem em **novos deploys**.

## 7. Custos e limites

**Vercel Hobby** — gratuito, mas **uso não comercial e pessoal** (cláusula de *fair use*): se o projeto passar a ter
fins comerciais, migre para Pro. Inclui 1 M invocações de função/mês, 4 CPU-h de *Active CPU*, 360 GB-h de memória e
duração máxima de função de 300 s (valores consultados na documentação da Vercel em out/2026; confira no painel). Estas
funções gastam pouca CPU ativa (aguardam I/O). **Atenção:** ao exceder limites do Hobby o projeto pode ser **pausado por
até 30 dias** — por isso a regra de rate limit do Firewall e o `DAILY_BUDGET` não são opcionais. Não há *Spend
Management* no Hobby. `export const config = { maxDuration }` fixa 30 s (`nlu`), 15 s (`report`), 5 s (`health`).

**Modal** — crédito de **US$ 30/mês** no plano Starter; CPU US$ 0,0000131/núcleo/s, memória US$ 0,00000222/GiB/s ⇒
**≈ US$ 0,40/hora de container** a 8 núcleos/3 GiB (latência medida ~10 s/pergunta; com 4 núcleos ~2× mais lenta), cobrado inclusive ocioso até o fim do `scaledown_window`. Estimativas
(premissas explícitas e **não medidas** em [`backend/modal/README.md`](../backend/modal/README.md#custos-cpu-4-núcleos-3-gib)):
~US$ 2,5–3 por 1.000 chamadas com tráfego esparso (domina o boot) e ~US$ 0,12–0,35 por 1.000 com container quente;
10 mil / 50 mil / 200 mil chamadas por mês ≈ US$ 22–25 / 59–71 / 103–151. **O crédito grátis cobre ~10–12 mil chamadas/mês
no regime esparso.** Defina o **Workspace budget** no painel (comportamento ao estourar não verificado) e use
`DAILY_BUDGET` (padrão 300 ⇒ ≤ ~US$ 27/mês no pior caso).

**Limites conhecidos**

- **Latência em CPU (não medida):** o modelo legado gera ~136 tokens ⇒ estimativa de 7–14 s por pergunta, acima do timeout
  de 4 s; cold start soma o carregamento do GGUF. Perguntas que estouram o tempo caem no NLU local (primeira chamada após
  ociosidade tende a ser “perdida”, mas acorda o container). Caminho recomendado: formato `v2` compacto (≈ 5× menos tokens;
  ver `backend/retrain/`). Ajuste `MODAL_TIMEOUT_MS` (≤ 25 s) após `modal run … nlu_app.py::bench`.
- Limites em memória são **por instância** da Vercel (podem somar mais que o configurado sob carga distribuída).
- O modelo legado só cobre bem listagem e perfil (87 % do treino era `CANDIDATE_LOOKUP`); as 16 intenções do contrato
  exigem o retreino `v2`. Mapeamentos legados extras no normalizador: `EXPLAIN_TOPIC` com rota `info/estatisticas|
  pesquisas|calendario|locais` ⇒ `CONTAR|PESQUISAS|CALENDARIO|LOCAL_VOTACAO`; `NAVIGATE_MENU` com entidades ⇒
  `LISTAR_CANDIDATOS`; sem rota/entidades ⇒ `DESCONHECIDA`.
- `api/test/` é código de teste dentro de `api/`: **inclua `api/test/` no `.vercelignore`** da raiz para a Vercel não
  tratá-lo como funções (o `.vercelignore` atual não o lista).
- O web usa CSP `connect-src 'self'` (`vercel.json`): o site chama `/api/nlu` no **mesmo domínio**, então CORS só importa para
  previews e clientes em outras origens.

## 8. Runbook de incidente

| Sintoma | Ação |
| :-- | :-- |
| **Gasto no Modal subindo / abuso** | 1) Vercel: `MODAL_ENDPOINT` = vazio → redeploy (clientes caem no NLU local em segundos). 2) `modal app stop saibatudo-nlu`. 3) Revogue o Proxy Auth Token (painel Modal). 4) Investigue 429/`cache` nos logs; baixe `DAILY_BUDGET`/`RATE_*`; confira a regra do Firewall. |
| **Respostas ruins/estranhas da IA** | Veja as issues `relato-ia`. Se for sistêmico: kill switch (acima) e/ou `promote --version <anterior>` + `MODEL_VERSION=<anterior>`. O NLU local segue respondendo. |
| **Muitos 504/timeout** | `bench` no Modal; suba `MODAL_TIMEOUT_MS` (≤ 25000) **e** a duração máxima da função; considere formato `v2`/memory snapshot. |
| **503 `budget`** | Esperado ao atingir `DAILY_BUDGET` (zera à meia-noite de Brasília, por instância). Aumente só se o Modal budget permitir. |
| **502 `upstream` com 401 do Modal** | Token revogado/errado: gere outro e atualize `MODAL_KEY`/`MODAL_SECRET` + redeploy. |
| **Relatos em spam** | `GITHUB_TOKEN` vazio (desliga) ou `REPORT_PER_HOUR`/`REPORT_DAILY_MAX` menores; bloqueie/feche em lote pelo rótulo `relato-ia`. |
| **Vazamento de segredo** | Revogue o token no Modal/GitHub imediatamente; gere novos; atualize a Vercel; faça redeploy. |

**Kill switch em uma frase:** `MODAL_ENDPOINT` vazio na Vercel + redeploy ⇒ `/api/nlu` responde 503 `disabled`, `/api/health`
mostra `"nlu":"off"` e todos os clientes usam só o NLU local. Para religar, restaure o valor e faça redeploy.

## 9. Testes e arquivos

```bash
node --test api/test                                         # 151 testes, sem rede (fetch simulado)
python -m unittest discover -s backend/modal -p "test_*.py"  # núcleo, gramáticas, avaliador
python -m unittest discover -s backend/retrain -p "test_*.py"
python -m py_compile backend/modal/*.py backend/retrain/*.py
```

```
api/nlu.js · report.js · health.js          funções (assinatura clássica req/res + adaptador para Request/Response)
api/_lib/  http · validate · ratelimit · cache · normalize · ground · vocab · config · sanitize · mock · *-handler
api/test/  *.test.mjs                        node:test
backend/modal/   nlu_app.py · convert_gguf.py · eval_golden.py · nlu_core.py · test_*.py · README.md
backend/retrain/ build_nlu_dataset.py · check_labels.mjs · README.md
```

## 10. O que **não** foi verificado

Tudo abaixo exige credenciais/rede e **não foi executado**:

- **Deploy real** na Vercel (inclusive que a assinatura clássica `(req, res)` + `api/package.json` com `"type":"module"`
  funcione como esperado, a cobertura de `api/_lib` como não-função e o `config.maxDuration`) e o comportamento do Firewall.
- **Deploy real no Modal:** as definições foram importadas com `modal 1.6.0` (valida nomes/argumentos da API), mas nada rodou
  na nuvem; `llama-cpp-python==0.3.19` (wheel CPU), build do llama.cpp, `convert_hf_to_gguf.py` e o memory snapshot.
- **Latência real**, cold start, tokens/s e **qualidade do Q4_K_M** (o gate do `convert_gguf.py` existe para medir isso).
- Comportamento exato do **Workspace budget** do Modal ao estourar e as taxas de custo reais (as estimativas usam premissas).
- Que o rótulo `relato-ia` exista no repositório e o `GITHUB_TOKEN` tenha o escopo certo.
- As gramáticas GBNF **não rodaram no llama.cpp**: foram validadas por um conversor GBNF→regex contra as 5.192 saídas
  reais de treino e contra o formato `v2`.
- O modelo `v2` retreinado **ainda não existe**; só o gerador de dataset e o pipeline de conversão/gate estão prontos.
