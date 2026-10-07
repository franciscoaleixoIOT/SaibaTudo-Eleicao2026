# NLU em nuvem no Modal (CPU + llama.cpp)

Serve o modelo `franciscoaleixo/SaibaTudo-Eleicao2026` (Qwen2.5-1.5B-Instruct + LoRA fundido) em **GGUF Q4_K_M**
(~1,1 GB) com `llama-cpp-python`, **só em CPU**, atrás de um endpoint protegido por **Proxy Auth Token** do Modal.
Quem chama é apenas o proxy da Vercel (`api/nlu.js`); o app/site nunca falam com o Modal. Visão geral e segurança:
[`docs/BACKEND.md`](../../docs/BACKEND.md).

| Arquivo | Função |
| :-- | :-- |
| `nlu_core.py` | Lógica **pura** (stdlib): prompt idêntico ao do treino, gramáticas GBNF, validação da pergunta, parsing. |
| `nlu_app.py` | App Modal: classe `Nlu` (carrega o GGUF, `POST` com `requires_proxy_auth`), `health`, `bench`. |
| `convert_gguf.py` | Job: HF → GGUF f16 → Q4_K_M (+Q8_0) → Volume → avaliação → **gate** → promoção/rollback. |
| `eval_golden.py` | Avaliação contra `contracts/nlu_golden_cases.json` (local, CI ou contra o endpoint publicado). |
| `test_*.py` | Testes `unittest` locais (sem Modal e sem llama.cpp). |

Dois formatos de saída do modelo (campo `format` em `current.json`):

- `legacy` (modelo atual): `{"intent":"FILTER_CANDIDATES","target_route":...,"filters":{...}}`. A gramática **termina
  logo após `filters`**: `direct_answer`/`suggested_questions` nunca são gerados (poupa ~125 dos ~262 tokens de uma
  saída completa; nunca são repassados ao cliente). Trecho gerado: **média 136 tokens, máx. 149** (medido com o tokenizer
  do modelo sobre o dataset de treino) → `max_tokens = 160`.
- `v2` (modelo retreinado, ver [`../retrain/README.md`](../retrain/README.md)): já é o contrato, só as chaves presentes
  (`{"intent": "LISTAR_CANDIDATOS", "cargo": "GOVERNADOR", "uf": "SP"}`, ~10–30 tokens → **~5× menos tokens**).

> **Latência medida no gate (02/10/2026, Q4_K_M, 8 threads, formato legado, com gramática): média 10 s, máx. 15 s.** Por isso o
> serviço usa **8 núcleos** (com 4, passaria do timeout de 14 s dos apps). Texto original da estimativa: em CPU a geração é limitada pela banda de memória; para um 1,5B Q4 em 4 núcleos o
> esperado é da ordem de 10–20 tokens/s. Com o formato legado (~136 tokens) isso dá **~7–14 s por pergunta**, acima do
> timeout padrão de 12 s do proxy. Meça com `bench` (passo 7) e ajuste `MODAL_TIMEOUT_MS` na Vercel; o caminho de
> produção recomendado é o formato `v2` (≈1–3 s). Até lá, perguntas que estouram o tempo caem no NLU local (nada quebra).

---

## Passo a passo

Pré-requisitos: Python ≥ 3.10 local e uma conta em <https://modal.com> (plano Starter: US$ 30/mês de crédito grátis).
Rode os comandos **a partir da raiz do repositório**.

### 1. Instalar o cliente e autenticar

```bash
python -m venv .venv-modal && source .venv-modal/bin/activate      # Windows: .venv-modal\Scripts\activate
pip install modal
modal token new            # abre o navegador e grava o token do seu usuário em ~/.modal.toml
```

### 2. (Opcional) Segredo do Hugging Face

Só necessário se o repositório do modelo for **privado**. Preferível a exportar o token localmente:

```bash
modal secret create saibatudo-hf HF_TOKEN=hf_xxxxxxxx
export HF_SECRET_NAME=saibatudo-hf          # PowerShell: $env:HF_SECRET_NAME = "saibatudo-hf"
```

Outras variáveis lidas por `convert_gguf.py`: `HF_REPO` (padrão `franciscoaleixo/SaibaTudo-Eleicao2026`) e
`LLAMA_CPP_REF` (tag/SHA do llama.cpp; o job grava o SHA usado em `meta.json` — fixe-o depois do 1º sucesso).

### 3. Criar o Volume do modelo

```bash
modal volume create saibatudo-nlu-models      # (o código também usa create_if_missing)
```

### 4. Converter, quantizar, avaliar e promover

```bash
modal run backend/modal/convert_gguf.py::main --version v2.2-AAAAMMDD --promote
```

(`--format v2` e `--with-q8` são o padrão: o Q8_0 de referência é **obrigatório**, porque a queda de quantização é um dos gates.)

O job (CPU 8 núcleos / 16 GB, algumas dezenas de minutos): baixa do HF → `convert_hf_to_gguf.py` (f16) → `llama-quantize`
(Q4_K_M e Q8_0) → grava `/models/<versão>/` → avalia as **111** perguntas de `contracts/nlu_golden_cases.json` e, quando tiver
casos, o holdout de perguntas reais `contracts/nlu_real_cases.json`. **Todos os gates bloqueiam** (`eval_golden.check_gates`):

| Medida | Gate (padrão) |
| :-- | :-- |
| JSON válido **sem** gramática (validade nativa do modelo) | **≥ 98 %** |
| JSON válido **com** gramática (produção) | = 100 % (integração) |
| Acerto de **intenção** no golden (`--min-intent-acc`) | **≥ 85 %** (meta de 90 % no próximo retreino) |
| Acerto **por entidade** (cargo, uf, partido, nome, tema, historico, turno, apenasDeferidas; `--min-entity-acc`) | **≥ 90 %** cada uma, com ≥ 3 casos (meta de 95 %) |
| **Alucinação**: entidade preenchida onde o contrato exige ausência (`--max-hallucination`) | **≤ 5 %** por entidade, com ≥ 3 casos `null` |
| Acerto de intenção no **holdout de perguntas reais** | **≥ 85 %** (só quando `nlu_real_cases.json` tem casos) |
| **Catraca**: intenção vs. a versão em produção | não cai mais que **1 ponto** (só se medida sobre o mesmo contrato) |
| Queda do Q4_K_M vs Q8_0, em entidades **e** em intenção | ≤ 3 pontos |

`promote --force` só promove uma versão reprovada com `--reason '<motivo>'`, gravado em `meta.json` (`forced`) junto dos motivos do gate.

> **Linha de base (06/10/2026).** O modelo em produção `v2.1-20261003` medido com este gate nos **111** casos atuais:
> intenção **78,4 %** (não os 87,1 % de 03/10, que eram sobre 93 casos), `tema` 66,7 % e alucinação de `tema` em casos `null`;
> **seria reprovado**. As 24 falhas se concentram nas intenções de conduta na votação (`REGRAS_URNA`, `LOCAL_VOTACAO`),
> acrescentadas ao contrato depois do treino. O NLU local resolve todos esses casos, então o impacto para o usuário é pequeno
> (a nuvem só entra quando o local não entende), mas o retreino v2.2 precisa fechar essa lacuna. Resultado completo em
> [`eval/2026-10-06_v2.1-20261003_golden111.json`](../../eval/2026-10-06_v2.1-20261003_golden111.json).

Por que dois JSON válidos? Com a gramática o JSON é sempre válido — mesmo que a quantização tenha estragado o modelo.
Por isso o gate de qualidade usa a geração **sem** gramática, e a regressão Q4×Q8 pega degradação silenciosa.

Reprovou → o job **falha** (código ≠ 0), os arquivos ficam no Volume (`/models/<versão>/eval.json` explica) e **nada é
promovido**. Aprovou + `--promote` → grava `/models/current.json` (ponteiro lido pelo serviço no boot do container).
O relatório também imprime acerto de cargo/UF/partido, alucinação nos casos “chave null” e latência por pergunta.

**Canário.** Uma versão aprovada no gate pode servir só uma fatia das instalações antes de virar produção: `::canary --version X` aponta `canary.json`
(a produção, `current.json`, não muda) e `::canary_rollback` o apaga (o app canário passa a falhar e o proxy refaz tudo na produção). O app canário é o mesmo `nlu_app.py` com
`NLU_APP_NAME=saibatudo-nlu-canary NLU_POINTER=canary.json`. Passo a passo e variáveis da Vercel: `docs/OPERACAO.md` §7.

**Treino em job.** `train_job.py` treina na GPU do Modal e publica numa branch nova de um repositório privado (nunca na produção); o plano é testado em `test_train_job.py`,
a execução na GPU não foi verificada.

**Conversão local (sem crédito do Modal).** `convert_local.py` faz na sua máquina o mesmo que o job acima: conversor do llama.cpp na tag fixa, quantização
pela API do `llama-cpp-python` (o runtime do serviço), os **mesmos gates** (`eval_golden.check_gates`) e `meta.json`/`eval.json` no formato do Volume. O Modal só
recebe os três arquivos de produção, e só se o gate aprovar (armazenamento, sem computação):

```bash
ai_model/.venv/Scripts/python.exe backend/modal/convert_local.py     --model-dir ai_model/output/SaibaTudo-NLU-v22-merged --version v2.2-AAAAMMDD     --previous-eval eval/<avaliação da versão em produção>.json --previous-version <versão em produção> --upload
modal run backend/modal/convert_gguf.py::promote --version v2.2-AAAAMMDD     # função mínima: só troca o ponteiro, e só de versão aprovada
```

No Git Bash do Windows, um `modal volume put ... /<versão>/arquivo` digitado à mão tem o caminho de destino reescrito para `C:/Program Files/Git/...`: exporte
`MSYS_NO_PATHCONV=1` antes (o `--upload` do script não sofre disso). **Resultado de 07/10/2026:** `v2.3-20261007` aprovada e promovida por este caminho (intenção 93,7 %,
todas as entidades 100 % nos casos de referência; 96,8 % em 435 perguntas reservadas); medições em `eval/2026-10-07_*`.

Use `--previous-eval` com uma medição da versão em produção sobre o **mesmo** contrato, senão a catraca é ignorada (o script avisa). Q8_0 e f16 ficam locais.
Testes das partes puras: `test_convert_local.py`.

Outros comandos do mesmo arquivo:

```bash
modal run backend/modal/convert_gguf.py::versions                       # lista versões e o ponteiro atual
modal run backend/modal/convert_gguf.py::promote --version v1-legado    # rollback / troca de versão (exige gate aprovado, ou --force --reason '...')
```

Versões são **imutáveis** (o job recusa reusar um nome). Para o modelo retreinado:
`modal run backend/modal/convert_gguf.py::main --version v2-2026-11 --format v2 --hf-repo <repo> --with-q8 --promote`.

### 5. Publicar o serviço

```bash
modal deploy backend/modal/nlu_app.py
```

A saída mostra duas URLs, no formato `https://<workspace>--saibatudo-nlu-nlu-infer.modal.run` (POST) e
`https://<workspace>--saibatudo-nlu-health.modal.run` (GET). Ambas exigem token de proxy.

Parâmetros relevantes (constantes no topo de `nlu_app.py`): `cpu=4`, `memory=3072` MiB, `scaledown_window=30`,
`max_containers=2`, `timeout=60`, 1 requisição por container (a instância do llama.cpp não é thread-safe; com
`max_containers=2` há no máximo 2 inferências simultâneas, as demais esperam na fila do Modal).
`USE_SNAPSHOT=False` (memory snapshot): ligue só depois de comparar o cold start com o `bench` — llama.cpp usa mmap e
threads, e **não foi verificado** que o restore funcione.

### 6. Criar o Proxy Auth Token

No painel: **Settings → Proxy Auth Tokens** (<https://modal.com/settings/proxy-auth-tokens>) → *New Token*. Guarde o
**Token ID** (`wk-…`) e o **Token Secret** (`ws-…`) — o secret só aparece uma vez. (A documentação do Modal também cita a
CLI `modal workspace proxy-tokens`; confira com `modal workspace --help`.) Eles viram `MODAL_KEY` e `MODAL_SECRET` na Vercel.

Teste direto, pelo terminal:

```bash
curl -s -X POST "https://<workspace>--saibatudo-nlu-nlu-infer.modal.run" \
  -H "Modal-Key: wk-xxxx" -H "Modal-Secret: ws-xxxx" -H "Content-Type: application/json" \
  -d '{"q": "candidatos a governador em SP"}'
# -> {"ok":true,"output":{"intent":"FILTER_CANDIDATES",...},"model":"v1-legado","format":"legacy","ms":6400,"tokens":130}
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://<workspace>--saibatudo-nlu-nlu-infer.modal.run" \
  -H "Content-Type: application/json" -d '{"q":"oi"}'     # sem token: esperado 401
```

A 1ª chamada após ociosidade inclui o boot do container e a carga do modelo (cold start).

### 7. Medir latência e cold start

```bash
modal run backend/modal/nlu_app.py::bench            # container efêmero; ~12 perguntas de contracts/nlu_golden_cases.json
```

Imprime cold (1ª chamada), p50/p95 com o container quente e tokens/s. Defina `MODAL_TIMEOUT_MS` na Vercel ≥ ~1,5 × p95
(máx. 20000). Para avaliar a qualidade do que está **publicado** (sem GPU, sem llama.cpp local):

```bash
python backend/modal/eval_golden.py --endpoint "https://<workspace>--saibatudo-nlu-nlu-infer.modal.run" \
  --key wk-xxxx --secret ws-xxxx --format legacy --out eval-endpoint.json
```

### 8. Configurar a Vercel

Em *Project → Settings → Environment Variables* (ou `vercel env add NOME production`); **faça novo deploy** depois
(variáveis só valem em deploys novos):

| Variável | Valor |
| :-- | :-- |
| `MODAL_ENDPOINT` | URL do `…-nlu-infer.modal.run` (https) |
| `MODAL_KEY` / `MODAL_SECRET` | Token ID / Secret do passo 6 (marque como *Sensitive*) |
| `MODEL_VERSION` | a mesma versão de `current.json` (ex.: `v1-legado`); faz parte da chave do cache |
| `MODAL_TIMEOUT_MS` | do passo 7 (padrão 12000) |
| `DAILY_BUDGET` | chamadas/dia ao Modal (padrão 300) |

Lista completa em [`docs/BACKEND.md`](../../docs/BACKEND.md#6-variáveis-de-ambiente-vercel).

### 9. Teto de gasto no Modal (obrigatório antes de abrir ao público)

*Settings → Usage & Billing* → defina o **Workspace budget** (sugestão inicial: US$ 10–15; só Owners/Managers editam;
o máximo depende do histórico de cobranças). **Não verificado:** o que o Modal faz exatamente ao estourar o budget
(a documentação cita um “spend limit” que interrompe cargas que gerariam cobrança fora do crédito). Trate-o como alarme
e **não** como única proteção: as barreiras reais são `max_containers=2`, `DAILY_BUDGET` e a regra de rate limit da Vercel.

### 10. Desligar e reverter

| Quero… | Faça |
| :-- | :-- |
| **Desligar a nuvem agora** (kill switch, sem tocar no Modal) | Vercel → `MODAL_ENDPOINT` = vazio → redeploy (ou promova de novo o deploy anterior). `GET /api/health` passa a mostrar `"nlu":"off"`; os clientes usam só o NLU local. |
| Parar de gastar no Modal | `modal app stop saibatudo-nlu` (derruba containers e endpoints) |
| Voltar a versão do modelo | `modal run backend/modal/convert_gguf.py::promote --version <anterior>` e ajuste `MODEL_VERSION` na Vercel |
| Apagar tudo | `modal app stop saibatudo-nlu`; `modal volume delete saibatudo-nlu-models`; revogar o Proxy Auth Token no painel |

---

## Custos (CPU — estimativa original com 4 núcleos, 3 GiB; o serviço usa 8 núcleos ⇒ ~2× por segundo)

Preços da página <https://modal.com/pricing> (consultada em out/2026; confira antes de decidir): CPU **US$ 0,0000131 /
núcleo físico / s**; memória **US$ 0,00000222 / GiB / s**; cobra-se o **maior entre o pedido e o uso**, e o container
é cobrado também ocioso até o fim do `scaledown_window`. Para `cpu=4`, `memory=3 GiB`:

> **US$ 0,00005906 / s ≈ US$ 0,2126 / hora de container** (com `cpu=8`: **US$ 0,0001115 / s ≈ US$ 0,40 / hora**; uma chamada
> fria ≈ 20 s de boot + 10 s de inferência + 30 s de cauda ≈ **US$ 0,007**; quente ≈ US$ 0,001. `DAILY_BUDGET=100` limita o pior caso a ≈ US$ 21/mês)

Modelo: custo por chamada = taxa × (t_inf + f × (t_boot + 30 s de cauda ociosa)), onde `f` = fração das chamadas que
**acordam um container** (depende da densidade do tráfego).

**Premissas explícitas (estimativas, nada medido):** `t_boot` (boot + carga do GGUF + aquecimento) = **15 s**;
`t_inf` = **6 s** (legado, ~136 tokens a ~20 tok/s) ou **2 s** (v2, ~25 tokens); `f` = 0,8 / 0,4 / 0,15 para 10 mil /
50 mil / 200 mil chamadas por mês; sem GPU; sem `min_containers`.

| Cenário | por 1.000 chamadas, sempre quente | por 1.000, sempre frio | 10 mil/mês (f=0,8) | 50 mil/mês (f=0,4) | 200 mil/mês (f=0,15) |
| :-- | --: | --: | --: | --: | --: |
| Legado (t_inf 6 s) | US$ 0,35 | US$ 3,01 | **US$ 24,8** | **US$ 70,9** | **US$ 150,6** |
| v2 compacto (t_inf 2 s) | US$ 0,12 | US$ 2,78 | **US$ 22,4** | **US$ 59,1** | **US$ 103,4** |

Leitura honesta:

- **Com tráfego esparso o custo é dominado pelo boot + cauda ociosa, não pela inferência** (~US$ 2,5–3 por 1.000
  chamadas). O crédito grátis (US$ 30) cobre **no máximo ~10–12 mil chamadas/mês** nesse regime; acima disso há cobrança.
- “Chamadas” = só as que chegam ao Modal: o NLU local resolve a maioria das perguntas, o usuário precisa ter **dado
  consentimento** e o cache de 1 h (no proxy) elimina repetições. Em um app novo é plausível ficar bem abaixo de 10 mil.
- **`DAILY_BUDGET` limita o custo no pior caso:** padrão 300/dia ⇒ ≤ 9.000 chamadas/mês ⇒ **≤ US$ 27** (tudo frio, legado)
  e ≈ US$ 3 (tudo quente). Com 1.000/dia seria ≤ US$ 90. (O contador é por instância da Vercel; a barreira global é
  `max_containers` + workspace budget.)
- Alavancas se o custo crescer: `SCALEDOWN_SECONDS` menor (cada segundo de cauda custa ~US$ 0,00006 por acordada), memory
  snapshot (corta o `t_boot` se funcionar), migrar para o formato `v2` (−5× tokens), subir o TTL do cache.
- **GPU não é recomendada:** tráfego esparso, cold start cobrado e custo/segundo bem maior — o ganho de latência não
  compensa para uma saída de ~30 tokens.

## Testes locais (sem Modal, sem llama.cpp)

```bash
python -m unittest discover -s backend/modal -p "test_*.py" -v
python -m py_compile backend/modal/*.py
# conferir a gramática legada contra TODOS os exemplos de treino (opcional; o dataset está no histórico do Git):
git show <commit>:ai_model/data/dataset_oficial_treino.json > /tmp/dataset.json
SAIBATUDO_TRAIN_DATASET=/tmp/dataset.json python backend/modal/test_nlu_core.py -v
```

As gramáticas não podem ser executadas sem llama.cpp; os testes usam um mini-conversor GBNF→regex (subconjunto usado)
para provar que elas são bem formadas, aceitam as saídas reais de treino (5.192 de 5.192 conferidas) e rejeitam JSON
fora do formato. `test_nlu_core.py` também confere que os vocabulários Python não divergiram de `api/_lib/vocab.js`.

## Não verificado (exige conta/credenciais)

Deploy e execução reais no Modal (as definições foram importadas com `modal 1.6.0` para validar nomes/argumentos da API,
sem rede); versão `llama-cpp-python==0.3.19` e disponibilidade da wheel CPU; build do llama.cpp e compatibilidade do
`convert_hf_to_gguf.py` (`LLAMA_CPP_REF=master` por padrão); latência real, cold start, tokens/s e qualidade do Q4_K_M;
comportamento do memory snapshot com llama.cpp; comportamento exato do workspace budget.
