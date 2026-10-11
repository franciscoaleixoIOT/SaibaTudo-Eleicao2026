# API (funções serverless da Vercel) — SaibaTudo Química

Node 22, módulos ES, **zero dependências**. Mesmos padrões do app de eleições: `Request`/`Response` padrão (`api/_lib/*-handler.js` não conhecem a Vercel e são
testados sem rede), CORS só para `https://saibatudo.net`, limites por IP e por instalação, cache em memória, orçamento diário, e **log sem o texto da
pergunta** (só status, latência, cache, `client` e o motivo do erro).

| Rota | Arquivo | O que faz | Estado padrão |
| :-- | :-- | :-- | :-- |
| `GET /quimica/api/health` | `health.js` | saúde, versão do modelo, `nlu`/`ask`/`shared` ligados ou não, idade do pacote de dados | sempre ligada |
| `POST /quimica/api/nlu` | `nlu.js` + `_lib/nlu-handler.js` | interpreta a pergunta na nuvem (intenção + entidades ancoradas na pergunta) | **desligada**: `503 disabled` |
| `POST /quimica/api/ask` | `ask.js` + `_lib/ask-handler.js` | explicação gerada, ancorada nos trechos licenciados, com verificador de fidelidade | **desligada**: `503 disabled` |

## Rewrite necessário (aplicar no `vercel.json`, fora da área de quem escreveu a API)
O site chama `/quimica/api/*`; as funções vivem em `/api/*`. Acrescentar ao `vercel.json` deste projeto:

```json
{
  "rewrites": [ { "source": "/quimica/api/:path*", "destination": "/api/:path*" } ],
  "functions": { "api/health.js": { "includeFiles": "data/quimica/manifest.json" } }
}
```
O `includeFiles` leva o manifesto do pacote de dados junto da função de saúde (`data` no `/health`). Sem ele o health busca `/quimica/data/manifest.json` no próprio site
(até 2 s) e, se também falhar, devolve `data: null` — nunca erro. O projeto irmão (`SaibaTudoEleicao2026`) continua precisando do rewrite `/quimica/*` → este projeto,
que já está descrito no `CLAUDE.md`. Regra do firewall (Vercel, plano Hobby): 60 requisições/minuto por IP em `/api/*`.

## Contratos

### `POST /api/nlu`
Entrada `{ "q": "...", "v": 1, "client": "android"|"web", "iid": "<uuid v4/v7>" }` (`q`: 3 a 300 caracteres; o corpo tem no máximo 4 KB).
Saída `200 { "ok": true, "nlu": { "intent": "...", ... }, "model": "<MODEL_VERSION>", "cached": false }`, com as chaves na ordem do contrato (`docs/DATA_CONTRACT.md` §8):
`intent`, `elemento` (símbolo), `composto` (**texto** copiado da pergunta — nome ou fórmula; o cliente resolve para o CID no dicionário local), `propriedade`
(id de `regras.propriedades` — o nome do campo do contrato, com unidade: `pontoFusaoK`, `densidadeKgm3`, `raioAtomicoPm`...), `quantidades [{valor, unidade}]`, `equacao`, `nivel`, `unidadeDestino`.
Cada entidade só vem se tiver **evidência no texto da pergunta** (`_lib/ground.js`); fora do vocabulário (`_lib/vocab.js`) é descartada. Intenções que são a própria
entidade (`ELEMENTO`, `COMPOSTO`, `PROPRIEDADE`, `MASSA_MOLAR`, `NOMENCLATURA`, `DESENHAR`, `COMPARAR`) sem a entidade viram `DESCONHECIDA`; as calculadoras continuam
sem entidades. Pedido perigoso (`_lib/seguranca.js`) **nunca chega ao modelo**: `200 { "nlu": { "intent": "RECUSA_PERIGO" }, "model": "regra" }`.

### `POST /api/ask`
Entrada `{ "q", "context"?, "trechos"?: [{ "id", "texto" }], "v": 1, "client", "iid" }`: contexto até 4.000 caracteres; até 6 trechos (`id` no formato de
`data/quimica/textos`, `texto` até 1.200 caracteres, 6.000 no total); corpo até 24 KB.
Saída `200 { "ok": true, "answer", "model", "fontes": [ids dos trechos citados], "cached" }`. O servidor **rejeita** (`422 { "error": "rejected" }`, motivo só no log) a resposta que:
(a) traga número com 2 ou mais dígitos, ou decimal, que não está na pergunta, no `context` nem nos `trechos`;
(b) viole a segurança química (passos de produção junto de um alvo perigoso);
(c) afirme fórmula química que não está nos dados enviados (molécula elementar como `O2` vale se o elemento aparece nos dados);
(d) invente fonte: `[id]` que não foi enviado, DOI/endereço/ISBN ou nome de fonte/obra (OpenStax, IUPAC, PubChem...) ausentes dos dados.
Pedido perigoso na pergunta: `422 { "error": "seguranca" }` sem tocar em provedor nenhum. `fidelidade.js` é a barreira final; os gates do modelo (`backend/modal/eval_*.py`) medem antes de publicar.

Provedores: **Space do Hugging Face (ZeroGPU)** é o principal (`POST /gradio_api/call/ask` devolve um `event_id`; `GET .../<event_id>` devolve o resultado em SSE); o **Modal** é a reserva
(cota esgotada, Space fora do ar, tempo esgotado), com orçamento próprio e baixo. Resposta reprovada no verificador não é refeita no outro provedor.

Erros comuns: `400` corpo inválido · `403` origem não permitida · `405` método · `413`/`415` corpo grande ou tipo errado · `429` limite (com `Retry-After`) · `502` provedor · `503` desligada ou orçamento do dia · `504` tempo esgotado.

## Variáveis de ambiente (Vercel, produção) — nomes apenas; segredos nunca no Git
| Variável | Para quê | Padrão |
| :-- | :-- | :-- |
| `MODAL_ENDPOINT`, `MODAL_KEY`, `MODAL_SECRET` | NLU no Modal (URL https + par de tokens de proxy). **Esvaziar `MODAL_ENDPOINT` desliga o NLU.** | vazio = desligado |
| `MODEL_VERSION` | versão do NLU em produção (`nlu-v1-AAAAMMDD`); entra na chave do cache (promover invalida) | `dev` |
| `MODAL_TIMEOUT_MS` · `DAILY_BUDGET` | tempo total (500 a 25.000 ms) · chamadas ao Modal por dia (global, com Redis) | 12000 · 300 |
| `ASK_ENABLED` | **só `1` liga** o explicador (e é preciso um provedor abaixo) | desligado |
| `HF_ASK_SPACE_URL`, `HF_TOKEN` | Space do Hugging Face (https) e token de leitura fine-grained | vazio |
| `HF_ASK_DAILY_BUDGET` · `HF_ASK_TIMEOUT_MS` | chamadas ao Space por dia (protege a cota da conta) · tempo | 400 · 25000 |
| `MODAL_ASK_ENDPOINT` (+ `MODAL_KEY`/`MODAL_SECRET`) | reserva do explicador no Modal | vazio |
| `MODAL_ASK_DAILY_BUDGET` · `MODAL_ASK_TIMEOUT_MS` | chamadas à reserva por dia (a GPU cobra o contêiner) · tempo | 15 · 30000 |
| `ASK_MODEL_VERSION` | versão do explicador (chave do cache); sem ela vale `MODEL_VERSION` | `dev` |
| `RATE_IP_PER_MIN` · `RATE_IID_PER_DAY` | limites por IP e por instalação (`iid`) | 20 · 60 |
| `CACHE_TTL_SECONDS` · `CACHE_MAX_ENTRIES` | cache em memória por instância | 3600 · 500 |
| `ALLOWED_ORIGINS` | origens CORS, separadas por vírgula; `*` casa só um trecho de hostname | `https://saibatudo.net,https://www.saibatudo.net` |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (ou `KV_REST_API_*`) | contadores **globais** de limite e de orçamento entre instâncias (opcional; falha aberto) | vazio = só local |
| `VERCEL_GIT_COMMIT_SHA` | preenchida pela Vercel; vira `version` no health | `dev` |

No Git Bash grave sempre com `printf '%s' "$VALOR" | vercel env add NOME production [--sensitive]` (sem quebra de linha no fim). `vercel env ls production` lista só os nomes.

## Como desligar cada recurso (kill switch, vale a partir do próximo deploy)
| Recurso | Como | Efeito no cliente |
| :-- | :-- | :-- |
| NLU na nuvem | `vercel env rm MODAL_ENDPOINT production -y` (ou esvaziar) + deploy | `503 disabled`; o app usa só o NLU local por regras |
| Explicação por IA | `vercel env rm ASK_ENABLED production -y` + deploy | `503 disabled`; o app mantém a resposta montada dos dados |
| Só o Hugging Face | remover `HF_ASK_SPACE_URL` (a reserva no Modal passa a ser o principal, com o orçamento dela) | explicação via Modal |
| Só a reserva do Modal | remover `MODAL_ASK_ENDPOINT` | falha do Space vira `502` |
| Limites compartilhados | remover `UPSTASH_REDIS_REST_*` | volta a valer só o limite por instância |
| Gastar menos | `DAILY_BUDGET`, `HF_ASK_DAILY_BUDGET`, `MODAL_ASK_DAILY_BUDGET` menores (0 = esgotado) | `503 budget` |
Reverter a versão do modelo: `docs/MODELO.md` §9.

## Testes
`cd api && npm test` (`node:test`, sem rede). Cobrem: normalização e ancoragem (≥ 40 casos), segurança (casos de `test/seguranca_cases_api.json` e de `contracts/seguranca_cases.json`),
fidelidade, golden compartilhado (`contracts/nlu_golden_cases.json`: o "modelo perfeito" não perde entidade), handlers (503 desligado, CORS, validação, limites por IP/instalação/Redis, cache,
orçamento, coalescência, falhas do Modal, caminho Hugging Face → Modal → falha, verificador), health e adaptador Node. Não há modo mock: nada responde "como se fosse o modelo".

## Pontos a reconciliar com o resto do projeto
- **Ids de propriedade (unificado em 10/10/2026).** Cliente, modelo, golden e `regras.propriedades` usam o **mesmo** id: o nome do campo do contrato, com unidade
  (`pontoFusaoK`, `densidadeKgm3`, `raioAtomicoPm`, `energiaIonizacaoKJmol`, `afinidadeEletronicaKJmol`, `pontoEbulicaoK`). `PROPRIEDADE_CLIENTE` (vocab.js/nlu_core.py) ficou vazio.
- **`composto` como CID.** O golden traz o CID; a nuvem devolve texto (nome ou fórmula copiados da pergunta) e o cliente resolve. `eval_golden.py` traduz o CID por `data/quimica/compostos`.
- **Chaves do golden fora do contrato da nuvem** (`grupo`, `periodo`, `bloco`, `categoria`, `estado`, `formula`): a nuvem não as devolve (o NLU local cuida); `formula` vai em `composto`.
- **`contracts/seguranca_cases.json`** é a fonte comum; `api/test/seguranca_cases_api.json` tem casos extras da API e pode ser incorporado a ele.
