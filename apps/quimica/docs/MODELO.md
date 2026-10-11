# Modelos de IA — ciclo local completo, cadência, custos e reversão

Dois modelos, treinados **nesta máquina** (RTX 5060, 8 GB). O Hugging Face é a publicação principal e o Modal, a reserva e o serviço do NLU. Tudo aqui foi escrito com base no
ciclo já validado do app de eleições (`../SaibaTudoEleicao2026/docs/PROJECT_MEMORY.md` §4.5) e **ainda não foi executado**: o código e os testes existem (fase 5 "base"), o treino
e o deploy são a fase 5 de verdade (§11).

| | NLU (interpretação) | Explicador (`ask`) |
| :-- | :-- | :-- |
| Papel | pergunta -> JSON `{intent, elemento, composto, propriedade, quantidades, equacao, nivel, unidadeDestino}` | explica um conceito a partir de **trechos licenciados** + dados que o app já mostrou |
| Base | `Qwen/Qwen2.5-1.5B-Instruct` | `Qwen/Qwen3-4B-Instruct-2507` |
| Treino | QLoRA 4-bit, `max_length 256`, 3 épocas | QLoRA 4-bit, `max_length 1024`, lote 1 × acúmulo 16, 2 épocas |
| Versão | `nlu-v1-AAAAMMDD` (imutável) | `ask-v1-AAAAMMDD` (imutável) |
| Serve em | Modal, CPU, GGUF Q4_K_M + gramática GBNF (`backend/modal/nlu_app.py`) | **Space ZeroGPU do HF** (`backend/hf_space_quimica`); reserva Modal L4 (`ask_app.py`) |
| Repositório HF | `franciscoaleixo/SaibaTudo-Quimica-NLU` | `franciscoaleixo/SaibaTudo-Quimica-Ask` |
| Volume do Modal | `saibatudo-quimica-models` (ponteiro `current.json`) | o mesmo Volume (ponteiro `ask-current.json`) |
| Gates (bloqueiam) | `eval_golden.py`: JSON ≥ 98 %, intenção ≥ 85 %, cada entidade ≥ 90 %, alucinação ≤ 5 %, holdout, catraca ≤ 1 ponto, Q4×Q8 ≤ 3 pontos | `eval_seguranca.py`: 0 % de resposta útil a pedido perigoso e ≥ 95 % de resposta aos legítimos · `eval_fidelidade.py`: ≥ 98 % das explicações sem número fora dos trechos |

Regras que não mudam: o modelo **não fornece fatos** (números vêm do pacote assinado ou de cálculo local); os casos de `contracts/` **nunca treinam**; pedido perigoso é recusado
**por regra antes do modelo** (`api/_lib/seguranca.js`) e o texto gerado passa pelo verificador do servidor (`api/_lib/fidelidade.js`); dataset gerado da *fixture* não treina.

## 1. Preparação (uma vez)
- **Python do treino.** Reaproveite o ambiente do app de eleições (`..\SaibaTudoEleicao2026\ai_model\.venv\Scripts\python.exe`), que já tem torch (CUDA 12.8, Blackwell), transformers, peft,
  bitsandbytes e `llama-cpp-python==0.3.19` (a versão do gate = a do serviço). Ou crie um: `python -m venv ai_model/.venv` e instale `torch` do índice `cu128`, `ai_model/requirements.txt` e `llama-cpp-python==0.3.19`.
- **Contas e ferramentas:** `hf auth login` (token de escrita só nesta máquina), `python -m modal setup`, `vercel login`, `gh auth login`. Segredos ficam em `secrets/` (ignorado pelo Git); quando
  precisar passar um valor ao assistente, cole-o em um arquivo de `secrets/`, nunca no chat.
- **Repositórios no Hugging Face** (uma vez): `hf repos create franciscoaleixo/SaibaTudo-Quimica-NLU` e `...-Ask`; o Space: `hf repos create franciscoaleixo/saibatudo-quimica --type space --space-sdk gradio --private`.
- **Armadilhas desta máquina:** `MSYS_NO_PATHCONV=1` para argumentos que começam com `/` (destinos do `modal volume put`); **impedir a suspensão do Windows** durante o treino
  (`SetThreadExecutionState` em um PowerShell que viva enquanto o treino viver); scripts longos: gravar em arquivo e executar; se usar o WSL, `wsl --shutdown` logo depois.

## 2. Dados e dataset
1. Pacote de dados real: `python pipeline/build.py ...` (ver `docs/ARCHITECTURE.md`). **Sem `data/quimica/` real não há treino:** o gerador do dataset cai na fixture de teste e marca `fonteDados: "fixture"`.
2. `python dataset/gerar_nlu.py` e `python dataset/gerar_qa.py`; conferir `dataset/AMOSTRA.md` e `python -m unittest discover -s dataset -p "test_*.py"` (fidelidade numérica 100 %).
3. Montar os conjuntos de treino (ignorados pelo Git, `backend/retrain/out*/`):
   ```bash
   python backend/retrain/build_nlu_dataset.py --out backend/retrain/out-nlu
   python backend/retrain/build_ask_dataset.py --out backend/retrain/out-ask
   ```
   Os dois **recusam** dataset da fixture (`--permitir-fixture` só para testar o fluxo), **tiram do treino** toda pergunta igual ou quase igual (Jaccard ≥ 0,8) às de `contracts/`
   (`nlu_golden_cases`, `nlu_real_cases`, `seguranca_cases`), separam o **holdout** (NLU: respeita o `val.jsonl` do gerador, que separa por entidade; explicador: 20 % por hash do id) e gravam
   `stats.json`, `meta.json` (hash dos insumos) e `descartados.jsonl` (revisar: número sem fonte, recusa sem frase de recusa, conceito sem trecho). No explicador, a resposta de cada exemplo ganha `[id]` do trecho citado.
4. Regra de ouro dos extras (do ciclo de eleições): o rótulo vem do NLU determinístico dos clientes, **nunca** da fonte da pergunta; extras `origem=falhas_golden` são recusados (ensinar a prova contamina a nota);
   cubra **classes inteiras** (todos os elementos, todas as propriedades), não os casos do teste.

## 3. Treino (local)
Antes: se já existe `ai_model/output/SaibaTudo-Quimica-NLU-hybrid/final`, renomeie a pasta (o script não sobrescreve sem `--sobrescrever`). Com o Python do treino:
```bash
python ai_model/scripts/train_hybrid.py --target nlu --version nlu-v1-AAAAMMDD > ai_model/output/treino_nlu-v1.log
python ai_model/scripts/train_hybrid.py --target ask --version ask-v1-AAAAMMDD > ai_model/output/treino_ask-v1.log
```
A perda é calculada só na saída (prompt mascarado com -100); `train_meta.json` grava dataset (sha256), base, hiperparâmetros, semente (2026), commit, versões e perda final. Tempo: o NLU de eleições levou ~3 h 30
(20 mil exemplos, `max_length 256`); o explicador (4B, 1024 tokens) será bem mais lento — **medir no primeiro treino e anotar aqui**. Se faltar VRAM: `--max_length 768`, `--cpu_offload on`.

## 4. Fusão
```bash
python ai_model/scripts/merge_and_export.py --target nlu     # -> ai_model/output/SaibaTudo-Quimica-NLU-merged
python ai_model/scripts/merge_and_export.py --target ask     # -> ai_model/output/SaibaTudo-Quimica-Ask-merged
```
Copia `train_meta.json` e o cartão do modelo (`ai_model/MODEL_CARD_*.md` vira o `README.md`) para a pasta mesclada. As pastas mescladas são imutáveis: renomeie antes de refazer.

## 5. Conversão e gates (local; só o aprovado sobe)
```bash
# NLU: gate do golden, catraca contra a versão em produção (eval/<ultima>.json) e holdout do gerador
python backend/modal/convert_local.py --target nlu --model-dir ai_model/output/SaibaTudo-Quimica-NLU-merged --version nlu-v1-AAAAMMDD --threads 8 \
    --holdout-cases backend/retrain/out-nlu/holdout_cases.json --previous-eval eval/<ultima>.json --previous-version <ultima> --origem "<dataset, épocas, perda>"
# Explicador: segurança + fidelidade (--gpu-layers 99 se o llama-cpp-python tiver CUDA; em CPU a amostra de 200 respostas leva horas)
python backend/modal/convert_local.py --target ask --model-dir ai_model/output/SaibaTudo-Quimica-Ask-merged --version ask-v1-AAAAMMDD --gpu-layers 99
```
O que faz: `convert_hf_to_gguf.py` do llama.cpp na tag fixa `b11355` (clonado em `ai_model/output/.llama_cpp/`), quantiza **Q4_K_M** (produção) e **Q8_0** (referência da queda de quantização), roda os gates e grava
`ai_model/output/gguf/<versão>/{model-*.gguf, meta.json, eval.json}`; sai com código ≠ 0 se reprovar. **Reprovou: não envie nada** — leia `eval.json` (cada caso errado vem com a saída do modelo).
- Pode-se rodar os gates soltos: `eval_golden.py --gguf ... --unconstrained`, `eval_seguranca.py --gguf ...`, `eval_fidelidade.py --gguf ... --amostra 200`; todos aceitam `--endpoint` (URL do Modal; `MODAL_KEY` e `MODAL_SECRET` no ambiente).
- `eval_golden.py` traduz o CID do golden pelos nomes de `data/quimica/compostos` (sem o pacote, o acerto de `composto` não é medido e o aviso aparece).
- Registrar: copie o resultado para `eval/AAAA-MM-DD_<versão>.json` (formato de `eval_golden.py --out`); é a base da catraca do próximo ciclo.

## 6. Publicar no Hugging Face (revisão nova e imutável)
```bash
hf upload franciscoaleixo/SaibaTudo-Quimica-NLU ai_model/output/SaibaTudo-Quimica-NLU-merged . --commit-message "nlu-v1-AAAAMMDD: <gates>"
hf upload franciscoaleixo/SaibaTudo-Quimica-NLU ai_model/output/gguf/nlu-v1-AAAAMMDD/model-Q4_K_M.gguf gguf/nlu-v1-AAAAMMDD-Q4_K_M.gguf     # opcional: o GGUF aprovado
hf repos tag create franciscoaleixo/SaibaTudo-Quimica-NLU nlu-v1-AAAAMMDD
```
(idem para `-Ask`). Anote o **SHA do commit** do upload: a versão é a revisão, não `main`. O `main` pode mudar; a revisão antiga continua recuperável (`--revision <SHA>`).
**Space do explicador** (principal em produção): publicar `backend/hf_space_quimica/` com o `ask_core.py` copiado (receita no README de lá), e nas *Variables* do Space `ASK_MODEL_ID=franciscoaleixo/SaibaTudo-Quimica-Ask`,
`ASK_MODEL_REVISION=<SHA>`; o Space reinicia sozinho. Enquanto não houver modelo ajustado aprovado, ele serve o `Qwen3-4B-Instruct-2507` base com o mesmo prompt e o servidor verifica a resposta do mesmo jeito.

## 7. Enviar ao Modal (reserva e serviço do NLU)
```bash
# só se o gate aprovou; o --upload do convert_local.py faz o mesmo. Sem MSYS_NO_PATHCONV=1 o Git Bash reescreve o destino para C:/Program Files/Git/...
MSYS_NO_PATHCONV=1 python -m modal volume put saibatudo-quimica-models ai_model/output/gguf/<versão>/model-Q4_K_M.gguf /<versão>/model-Q4_K_M.gguf
MSYS_NO_PATHCONV=1 python -m modal volume put saibatudo-quimica-models ai_model/output/gguf/<versão>/meta.json /<versão>/meta.json
MSYS_NO_PATHCONV=1 python -m modal volume put saibatudo-quimica-models ai_model/output/gguf/<versão>/eval.json /<versão>/eval.json
python -m modal deploy backend/modal/nlu_app.py          # NLU (CPU); primeira vez: python -m modal run backend/modal/nlu_app.py::bench
python -m modal deploy backend/modal/ask_app.py          # reserva do explicador (L4); primeira vez: ... ask_app.py::bench
```
O `deploy` pode ser feito antes de promover (os contêineres só sobem quando houver ponteiro). Anote as URLs (`...-infer.modal.run`, `...-ask.modal.run`) e crie o par de tokens de proxy no painel do Modal (Settings → Proxy Auth Tokens).

## 8. Promover, configurar a Vercel e testar ao vivo
1. **Promover:** `python backend/modal/promover.py --version nlu-v1-AAAAMMDD` (e `--version ask-v1-AAAAMMDD`). Lê `meta.json`, exige `passed`; reprovada só com `--force --reason "..."` (fica registrado). Grava `/current.json` ou `/ask-current.json` no Volume.
2. **Variáveis na Vercel** (produção; `printf '%s'` sempre):
   ```bash
   printf '%s' "https://<...>-infer.modal.run"  | vercel env add MODAL_ENDPOINT production
   printf '%s' "$MODAL_KEY"                     | vercel env add MODAL_KEY production --sensitive
   printf '%s' "$MODAL_SECRET"                  | vercel env add MODAL_SECRET production --sensitive
   printf '%s' "nlu-v1-AAAAMMDD"                | vercel env add MODEL_VERSION production        # invalida o cache
   printf '%s' "1"                              | vercel env add ASK_ENABLED production           # só quando o explicador estiver aprovado
   printf '%s' "https://franciscoaleixo-saibatudo-quimica.hf.space" | vercel env add HF_ASK_SPACE_URL production
   printf '%s' "$HF_TOKEN_LEITURA"              | vercel env add HF_TOKEN production --sensitive  # fine-grained, somente leitura (secrets/hf_token.txt)
   printf '%s' "https://<...>-ask.modal.run"    | vercel env add MODAL_ASK_ENDPOINT production
   printf '%s' "ask-v1-AAAAMMDD"                | vercel env add ASK_MODEL_VERSION production
   ```
   O pacote de dados tem `cliente.nlu.endpoint` e `cliente.ask.enabled` (`docs/DATA_CONTRACT.md` §1): o pipeline os escreve a partir de variáveis do GitHub (`gh variable set ASK_ENABLED --body 1`).
3. **Deploy:** push na `main` **não** faz deploy; `gh workflow run quimica-data-refresh.yml` publica. Depois, `gh run list --limit 6` (conferir **todos** os workflows).
4. **Testar ao vivo:** `curl https://saibatudo.net/quimica/api/health` (esperado `nlu:"on"`, `ask:"on"`, `model` = a versão); `POST /quimica/api/nlu` com uma pergunta real e uma perigosa (esperado `RECUSA_PERIGO`, `model:"regra"`);
   `POST /quimica/api/ask` com trechos de teste. Ver `api/README.md`. Medir o tempo de GPU por resposta no Space (a cota é de 40 min/dia na conta PRO) e anotar.

## 9. Como reverter
| O que | Como |
| :-- | :-- |
| NLU para a versão anterior | `python backend/modal/promover.py --version <anterior> --target nlu --rollback` + `MODEL_VERSION=<anterior>` na Vercel + deploy |
| Explicador para a versão anterior | `ASK_MODEL_REVISION=<SHA anterior>` no Space (volta sozinho) · reserva: `promover.py --version <ask anterior> --target ask --rollback` · `ASK_MODEL_VERSION` na Vercel |
| Desligar a IA | `vercel env rm ASK_ENABLED production -y` (explicação) e/ou `vercel env rm MODAL_ENDPOINT production -y` (NLU) + deploy: o app continua 100 % funcional offline, com o NLU local |
| Modelo ruim detectado depois | a avaliação noturna (`eval_golden.py --endpoint`) reprova -> rollback acima; abrir issue com os casos |
| Dados ruins | redeploy do commit anterior na Vercel; investigar a assinatura se falhar |

## 10. Cadência, custos e limites
- **Dados:** semanal (domingo 03:00, Brasília), só publica se uma fonte mudou. **Modelo:** mensal, ou quando o painel noturno reprovar a produção, ou quando surgirem **intenção, propriedade, unidade ou classe de composto novos**
  (nesse caso atualizar *juntos*: `api/_lib/vocab.js`, `backend/modal/nlu_core.py`, `LocalNlu.kt`/`nlu.js` e `dataset/vocab_nlu.py`; `test_nlu_core.py` e `vocab.test.mjs` falham se divergirem).
- **Custos de referência** (medidos no app de eleições; **medir de novo** aqui): Modal US$ 30/mês grátis no workspace (o teto de gasto só se define no painel); NLU em CPU ≈ US$ 0,40/h ligado (≈ US$ 3/mês no ritmo atual);
  L4 ≈ US$ 0,88/h e cobra o contêiner inteiro (inclui os 60 s de `scaledown_window`) — por isso é só reserva, com `MODAL_ASK_DAILY_BUDGET=15`; Hugging Face PRO: 40 min/dia de ZeroGPU, ≈ 3 s de GPU por resposta
  (≈ 800 respostas/dia), passar da cota só cobra com **crédito pré-pago** (não deixe saldo); Upstash gratuito (500 mil comandos/mês, ≈ 4 por chamada); Vercel Hobby (uso não comercial).
- **Limites de proteção:** `RATE_IP_PER_MIN=20`, `RATE_IID_PER_DAY=60`, `DAILY_BUDGET=300`, `HF_ASK_DAILY_BUDGET=400`; firewall da Vercel 60 req/min por IP em `/api/*`.

## 11. Antes do primeiro treino (o que falta)
1. `data/quimica/` real publicado e dataset **não** gerado da fixture (`stats.json`); golden com mais cobertura (hoje não há `quantidades` nem `nivel` no `nlu_golden_cases.json`: esses gates ficam sem casos).
2. Unificar os ids de propriedade e a regra do `composto` (CID × texto) — ver "Pontos a reconciliar" em `api/README.md`; o gerador do dataset (`dataset/vocab_nlu.py`) usa os ids do **modelo** (`pontoFusaoK`...).
3. Aplicar o rewrite e o `includeFiles` no `vercel.json` (`api/README.md`); criar os repositórios do HF e o Space; criar o par de tokens do Modal; token de leitura do HF em `secrets/`.
4. Validar no primeiro uso, porque não puderam ser executados: build do `llama-cpp-python` com CUDA em `ask_app.py`, `bench` do NLU (CPU_CORES e `MODAL_TIMEOUT_MS`), tempo de GPU do Space, tempo de treino do 4B, `--gpu-layers` do gate.
5. Depois do primeiro modelo aprovado: criar `eval/` com o resultado, ligar a avaliação noturna (segredos `MODAL_*` no GitHub) e atualizar o cartão de cada modelo com as versões e métricas.

## 12. Mapa de arquivos
`api/` (rotas e `_lib/`: `vocab`, `ground`, `normalize`, `seguranca`, `fidelidade`, handlers) · `backend/modal/` (`nlu_core.py`, `ask_core.py`, `nlu_app.py`, `ask_app.py`, `convert_local.py`, `promover.py`, `eval_golden.py`, `eval_seguranca.py`, `eval_fidelidade.py`, `eval_ask_common.py`, `gbnf_mini.py`) ·
`backend/hf_space_quimica/` · `backend/retrain/` (`build_nlu_dataset.py`, `build_ask_dataset.py`, `dataset_common.py`) · `ai_model/` (`scripts/train_hybrid.py`, `merge_and_export.py`, `treino_utils.py`, cartões dos modelos).
Testes: `cd api && npm test` · `python -m unittest discover -s backend/modal -p "test_*.py"` · `python -m unittest discover -s backend/retrain -p "test_*.py"` · `python -m unittest discover -s ai_model/scripts -p "test_*.py"`.
