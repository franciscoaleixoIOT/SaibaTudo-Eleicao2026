# Operação — SaibaTudo Eleições 2026

> **Este é o documento de estado atual.** [`PLANO_PRODUCAO.md`](PLANO_PRODUCAO.md) e [`PROJECT_MEMORY.md`](PROJECT_MEMORY.md) são o histórico
> (fotografias de 01 a 03/10/2026). Atualizado em **06/10/2026**, entre o 1º turno (04/10) e o 2º (25/10).

## 1. O que roda, onde e com que cadência

| Peça | Onde | Cadência / gatilho | Quem avisa se quebrar |
| :-- | :-- | :-- | :-- |
| Atualização dos dados | GitHub Actions `data_refresh.yml` | **a cada 30 min**, o ano todo; só reconstrói e publica se uma fonte do TSE mudou (ETag) | `data_freshness.yml` abre a issue `alerta-dados` |
| Alerta de frescor | `data_freshness.yml` + `tools/frescor.py` | a cada 30 min | issue automática + job vermelho na aba Actions |
| Snapshot versionado do pacote | passo final do `data_refresh` | no máximo **1 commit/dia** (ou `workflow_dispatch` com `commit_snapshot`) | — |
| Site/PWA e API | Vercel (Hobby), `saibatudo.net` | deploy a cada publicação de dados | `GET /api/health` |
| IA de interpretação (NLU) | Modal, CPU, `saibatudo-nlu` | só quando o NLU local não entendeu e há consentimento | `GET /api/health` (`nlu`) |
| IA generativa (`/api/ask`) | Modal, GPU L4 | **DESLIGADA** (ver §4) | `GET /api/health` (`ask`) |
| Captura de perguntas não entendidas (`/api/melhoria`) | Vercel + Redis (Upstash) | **DESLIGADA**, opt-in da pessoa (ver §7) | `GET /api/health` (`melhoria`) |
| Avaliação noturna do modelo | GitHub Actions `nightly_eval.yml` | 03:00 de Brasília; painel na branch `metrics` | issue `alerta-ia` |

`GET https://saibatudo.net/api/health` resume tudo: `nlu`, `ask`, `report`, `shared` (contadores globais), `melhoria` (captura) e `data` (versão do pacote, idade em
minutos, extração do TSE, fase, se há resultados).

### Testes de dados: o que bloqueia e o que só avisa
O `data_refresh` roda **integridade** (build validado, assinatura ECDSA, `sha256`, módulos) como bloqueante e **comportamento sobre dados reais**
(NLU, respostas, filtros) como informativo. Motivo: em 05/10/2026 dois testes que assumiam "ninguém eleito" derrubaram a publicação por ~9 h, e os
resultados do 1º turno não chegaram a ninguém. Os mesmos testes continuam **bloqueando em push e PR** (`web_ci.yml`), onde o que muda é o código.
Se o resumo do job mostrar "testes de comportamento falharam", a publicação foi mantida; investigue no dia.

## 2. Alertas e como responder

| Sintoma | Causa provável | Ação |
| :-- | :-- | :-- |
| Issue `alerta-dados`: "execuções do data_refresh falharam em sequência" | quebra de pipeline, TSE fora, segredo inválido | abra o último run falho; veja o primeiro passo vermelho. Se for o TSE, aguarde; se for código, corrija e rode `workflow_dispatch` |
| "extração do TSE ... > 30 h" | o TSE parou de gerar, ou o pipeline não detecta mudança | confira `https://resultados.tse.jus.br` e rode `workflow_dispatch` com **forcar** |
| "assinatura do manifesto de produção é INVÁLIDA" | **crítico**: apps e site rejeitam a atualização | reponha o último pacote bom (redeploy do commit anterior na Vercel) e investigue a chave `DATA_SIGNING_KEY` |
| `/api/health` com `data: null` | manifesto indisponível ou o domínio não está em `ALLOWED_ORIGINS` | abra `https://saibatudo.net/data/eleicoes2026/manifest.json` |
| Muitos 429 | limite por IP/instalação (local ou compartilhado) | normal sob abuso; ajuste `RATE_*` só se houver uso legítimo |

## 3. Chaves de desligamento (kill switches)

| Quero desligar | Faça | Efeito |
| :-- | :-- | :-- |
| IA de interpretação na nuvem | `MODAL_ENDPOINT` vazio na Vercel + redeploy | `/api/nlu` 503 `disabled`; clientes usam só o NLU local |
| IA generativa | já está desligada; para garantir: `ASK_ENABLED` ausente/≠`1` na Vercel | `/api/ask` 503 `disabled`; o pacote assinado também esconde o botão |
| Relatos públicos | `GITHUB_TOKEN` vazio | `/api/report` 503 |
| Captura de perguntas | `MELHORIA_ENABLED` ausente/≠`1` (ou remover o Redis) | `/api/melhoria` 503; a opção some dos apps no próximo pacote |
| Contadores globais | remover as variáveis do Upstash | volta ao limite só por instância |

## 4. IA generativa: como e quando religar

Está **desligada por padrão** em dois lugares (servidor e manifesto assinado), porque o texto sai de um modelo e não de dados oficiais. Antes de
religar, em ordem:

1. Atualizar a política de privacidade (já descreve o recurso, versão 1.2) e confirmar a tela de consentimento.
2. Montar o contexto no servidor a partir do pacote assinado (hoje o app o fornece e o servidor não consegue verificá-lo).
3. Medir o custo real de um despertar da GPU: `modal run backend/modal/qwen7b_awq_app.py::bench`; configurar e **testar** o teto de gasto do workspace Modal.
4. Ligar: `ASK_ENABLED=1` + `MODAL_ASK_ENDPOINT=<url explícita>` na Vercel **e** variável do repositório `ASK_ENABLED=1` (o pipeline escreve
   `cliente.ask.enabled=true` no próximo pacote). Verifique `GET /api/health` → `"ask":"on"`.

Fora do período de congelamento (§6).

## 5. Contadores globais de limite (opcional)

`api/_lib/compartilhado.js` soma, entre instâncias da Vercel, o limite por IP, por instalação e o orçamento diário, usando Upstash Redis via REST.
Para ligar: criar um banco Redis gratuito no Upstash (ou a integração "Vercel KV"), definir `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`
na Vercel e fazer redeploy. **Antes**, acrescente o Upstash aos operadores (§7) e à retenção (§8) da política de privacidade, porque IP e código de
instalação passam a ficar ali por até 1 dia. Falha aberto: se o Redis cair, vale só o limite local. **Não foi testado contra um Redis real**, só contra
um simulado; faça um teste de fumaça (`curl` repetido em `/api/nlu` e `/api/health` mostrando `"shared":"on"`).

## 6. Congelamento do 2º turno (24 a 26/10/2026)

Nada que decida o que o eleitor lê muda nesses três dias: modelo, NLU, respostas, API, pipeline, contratos, workflows e app. **Dados, documentação,
métricas e testes seguem livres.** O workflow `congelamento.yml` roda `tools/congelamento.mjs` em todo push e PR e falha se algum arquivo protegido
mudar; exceção consciente com `[congelamento-ok]` na mensagem do commit (fica no histórico) ou a variável de repositório `FREEZE_OVERRIDE=1`.
Como o push na `main` já aconteceu quando o check roda, ele **avisa**. Para **bloquear** de fato, ative em *Settings › Branches* a regra de proteção da `main`
exigindo a verificação "Guarda do congelamento" (ação manual, não feita por script). Também não faça merge de PRs do Dependabot nesses dias.

Checklist da véspera (24/10): rodar `workflow_dispatch` do `data_refresh` e conferir o resumo; confirmar `/api/health` (`data.fase`, idade do pacote);
conferir que `ask` está `off`; confirmar que ninguém tem deploy pendente.

## 7. O ciclo de auto-melhoria da IA (como funciona e como operar)

A interpretação melhora com perguntas reais, **sempre com uma pessoa no meio**. Nenhum modelo gera fatos, e nenhum rótulo com entidade entra no treino sem revisão.

```
perguntas que o app NÃO entendeu ──(opt-in)──► /api/melhoria ──► Redis (texto + contagem/dia, 90 dias)
                                                                         │ colher_sinais.mjs (--confirmar-politica, --apagar)
        judge_extra.py (modelo = 2ª opinião) ─┐                           ▼
        label_extra/NLU de regras ────────────┴──► fila.mjs ──► review/pending.jsonl  (git-ignorado, texto cru)
                                                                         │ revisar.mjs (PESSOA: rótulo + texto publicável)
                                                                         ▼
                                       promover.mjs ──► holdout (20 %)  contracts/nlu_real_cases.json   (só MEDE)
                                                   └──► treino (80 %)  backend/retrain/extra/rotuladas_humanas_*.jsonl
        retreino (build_nlu_dataset.py --extra) ──► convert_gguf.py (GATE bloqueante) ──► promote ──► nightly_eval.yml (painel)
```

**Ligado ou desligado hoje?** A captura (`/api/melhoria`, opção "Ajudar a melhorar o app" no app e no site) está **desligada** em três camadas: servidor
(`MELHORIA_ENABLED`), manifesto assinado (`cliente.melhoria.enabled=false`) e preferência da pessoa (padrão desligada). O que existe sem a captura:
`fila.mjs` aceita qualquer arquivo de perguntas (relatos, listas), então o ciclo já roda com os relatos públicos e com listas fornecidas.

**Para ligar a captura** (em ordem; não pule o passo 1):
1. **Política:** aplique o texto de [`PRIVACIDADE_melhoria_RASCUNHO.md`](PRIVACIDADE_melhoria_RASCUNHO.md) em `docs/PRIVACIDADE.md` **e** `web/src/privacidade/index.html`, e declare no *Data Safety* da Play. Há dado pessoal sensível em jogo (opinião política): revise juridicamente.
2. Redis: configure `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` na Vercel (§5).
3. Servidor: `MELHORIA_ENABLED=1` na Vercel + redeploy. Confira `GET /api/health` → `"melhoria":"on"`.
4. Pacote: variável do repositório `MELHORIA_ENABLED=1` (o workflow passa `SAIBATUDO_MELHORIA_ENABLED`) e rode `data_refresh` → manifesto com `cliente.melhoria.enabled=true`. Só então a opção aparece nos apps.
Para desligar: remova qualquer uma das três camadas (o servidor responde 503 e a opção some no próximo pacote).

**Rotina de revisão** (semanal basta; nunca durante o congelamento do 2º turno, §6):
```bash
UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... node backend/retrain/colher_sinais.mjs --confirmar-politica --apagar   # sinais -> review/sinais.jsonl
python backend/retrain/judge_extra.py --gguf <GGUF em produção> --in backend/retrain/review/sinais.jsonl --out backend/retrain/review/julgadas.jsonl
node backend/retrain/fila.mjs --in backend/retrain/review/sinais.jsonl --julgadas backend/retrain/review/julgadas.jsonl
node backend/retrain/revisar.mjs --revisor "seu nome"      # decide rótulo e texto publicável, mais frequentes primeiro
node backend/retrain/promover.mjs                          # holdout -> contracts/nlu_real_cases.json; treino -> extra/rotuladas_humanas_*.jsonl
git add contracts backend/retrain/extra && git commit      # só o que uma pessoa revisou é versionado
```
Regras que o código impõe: aceitar exige confirmar "sem dado pessoal e sem opinião identificável" (ou reescrever o texto, e o rótulo é revalidado no texto novo);
~20 % vão para o holdout pelo balde estável (`holdout.py/.mjs`) e **nunca** treinam; `auto.jsonl` (concordância regras + juiz em intenção sem entidade) nunca é publicado;
a fila crua fica em `backend/retrain/review/` (git-ignorada).

**Retreinar e promover:** `python backend/retrain/build_nlu_dataset.py --extra backend/retrain/extra/rotuladas_humanas_*.jsonl ...` → treino → `modal run backend/modal/convert_gguf.py::main`.
O gate bloqueia por intenção, entidade, alucinação, holdout real, regressão contra a versão em produção e queda Q4×Q8 (`backend/modal/README.md`). **O modelo em produção hoje (v2.1)
reprovaria**: medir e fechar essa lacuna é o objetivo do primeiro ciclo.

**Treinar em job (opcional, sem a RTX local):** `modal run backend/modal/train_job.py::main --dataset backend/retrain/out-v22/train.json --run v2.2-AAAAMMDD [--dry-run]`.
Treina na GPU L4 do Modal, funde e publica numa **branch nova de um repositório privado** do Hugging Face (nunca `main`, que é a produção) e imprime o SHA para o gate.
**A execução na GPU não foi verificada** (só o plano, testado); meça o custo antes de depender dele. O treino local continua sendo o caminho exercitado.
O treino agora **mascara o prompt** (a perda só conta a saída; antes 77 % dos tokens da perda eram prompt), fixa a **semente** e grava `train_meta.json` (dataset com sha256, base, hiperparâmetros, versões, perda final); `build_nlu_dataset.py` grava a proveniência em `meta.json`.

**Canário e rollback (após o gate aprovar):**
```bash
modal run backend/modal/convert_gguf.py::canary --version v2.2-AAAAMMDD         # aponta canary.json; a produção (current.json) fica intacta
NLU_APP_NAME=saibatudo-nlu-canary NLU_POINTER=canary.json modal deploy backend/modal/nlu_app.py   # app canário (1 vez)
# Vercel: MODAL_CANARY_ENDPOINT=<url do app canário>  CANARY_MODEL_VERSION=v2.2-AAAAMMDD  CANARY_PCT=10   (+ redeploy)
```
O proxy leva `CANARY_PCT` % das instalações (balde estável por `iid`) ao canário e **refaz a pergunta na produção se o canário falhar**, então o eleitor não percebe.
Compare 24 a 48 h (`/api/health`, painel, issues `relato-ia` por versão) e promova com `modal run ...::main --version ... --promote` (o gate exige tudo de novo) ou, em caso de problema,
**rollback imediato**: `modal run backend/modal/convert_gguf.py::canary_rollback` (apaga `canary.json`; o app canário passa a falhar e tudo cai na produção sozinho); zere `CANARY_PCT` depois, com calma.
**A promoção e o rollback do canário são manuais**: não há métrica de produção acessível ao Modal para automatizá-los com segurança (os logs da Vercel não são consultáveis de lá).
Sem canário configurado (`MODAL_CANARY_ENDPOINT` vazio ou `CANARY_PCT=0`) nada muda.

**Regras locais melhoram com o uso:** `promover.mjs` põe as perguntas reais no contrato e marca `"lacuna": true` nas que o NLU local ainda não entende;
`lacunas_nlu.yml` abre um **PR rascunho** (ou issue) com `docs/LACUNAS_NLU.md`: grupos de perguntas parecidas, termos que as distinguem **sem colidir com outras intenções** e onde mexer.
Uma pessoa escreve a regra nos dois NLUs (`nlu.js` e `LocalNlu.kt`; o contrato compartilhado confere a paridade) e remove a marca (o teste cobra).

**Monitoramento:** `nightly_eval.yml` (03:00 BRT) mede o modelo em produção e grava em `metrics`; o painel é `dashboard/index.html` publicado por GitHub Pages (Settings › Pages › branch
`metrics`, ação manual). Exige os segredos `MODAL_ENDPOINT`, `MODAL_KEY`, `MODAL_SECRET` no GitHub (sem eles o job avisa e pula a medição). Regressão abre a issue `alerta-ia`
(feche para silenciar por 7 dias).

## 8. Pendências que só o mantenedor resolve

- Confirmar o backup offline de `secrets/upload-keystore.p12`, `keystore.properties` e `secrets/data_signing_key.pem` (perder a chave de dados exige novo app).
- Definir e **testar** o teto de gasto do workspace Modal; reduzir o tempo ocioso da GPU no deploy (o código já está em 120 s e 1 contêiner, mas só vale após `modal deploy`).
- Decidir a sugestão de estado por localização no Android: o código existe (`SugestaoUf.kt`) mas o manifesto não declara a permissão e a tela de
  boas-vindas diz "sem permissões"; ou declara a permissão e atualiza o *Data Safety* da Play, ou remove o código e corrige README e ARCHITECTURE.
- Play Console: teste fechado (12 testadores por 14 dias, se a conta for pessoal nova); produção em meados de novembro.
- Confirmar a licença da base Qwen2.5 e registrá-la no model card.
- Habilitar, se quiser, o relato privado de vulnerabilidades em *Settings › Security* (a `SECURITY.md` já o cita).
- Passada manual de acessibilidade (TalkBack), tablets e orientação horizontal.
