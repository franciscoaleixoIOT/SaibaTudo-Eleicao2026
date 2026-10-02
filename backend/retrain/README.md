# Atualização da IA (retreino do NLU)

O modelo de nuvem **só interpreta a pergunta** (intenção + entidades); todos os fatos vêm do pacote oficial
`data/eleicoes2026` no cliente (ver [`docs/DATA_CONTRACT.md`](../../docs/DATA_CONTRACT.md) §9). Por isso o ciclo de vida
tem duas velocidades:

| O que muda | Frequência | Precisa retreinar? | Como chega ao usuário |
| :-- | :-- | :-- | :-- |
| **Dados** (candidatos, partidos, resultados, pesquisas, calendário, fotos) | diária / a cada apuração | **Não** | Pacote assinado (`pipeline/` → site → app); o NLU local reconstrói o `Gazetteer` e a nuvem só devolve texto copiado da pergunta, revalidado contra os dados locais. |
| **Nomes e partidos novos** | a cada atualização | **Não** | O alvo de treino é “copiar da pergunta”: nomes/partidos nunca vistos funcionam (a validação separa NOMES para medir isso). |
| **Pesos do modelo** | só quando surgem **novas intenções ou vocabulário** (novo cargo, novo tema, nova forma de perguntar, nova eleição) | **Sim** | Retreino → conversão → gate → promoção por versão (`MODEL_VERSION`). |

## Gatilhos para retreinar

1. Nova intenção no contrato (`Intent` em `AiModels.kt`, `api/_lib/vocab.js`, `backend/modal/nlu_core.py`).
2. Novo vocabulário fechado: cargo (ex.: Prefeito/Vereador em 2028), tema, valor de `historico`.
3. Regressão medida: `eval_golden.py` abaixo do gate, ou alta taxa de campos descartados pela ancoragem
   (`drop` nos logs do proxy) / de respostas `DESCONHECIDA` para perguntas que o NLU local também não entende.
4. Troca do formato legado pelo `v2` (ver abaixo) — o motivo nº 1 para fazê-lo é **latência/custo em CPU**.

> Ao mudar vocabulário, atualize os três lugares em conjunto: `LocalNlu.kt`/`AiModels.kt`, `api/_lib/vocab.js` e
> `backend/modal/nlu_core.py` (há teste que compara Python × JS) e, aqui, as formas de superfície em
> `build_nlu_dataset.py` (`CARGO_FORMS`, `TEMA_FORMS`, templates). Os testes falham se os conjuntos divergirem.

## 1. Gerar o dataset (formato novo)

```bash
python backend/retrain/build_nlu_dataset.py --out backend/retrain/out --verify
# opções: --data data/eleicoes2026  --golden contracts/nlu_golden_cases.json  --seed 2026  --scale 1.0  --val-pct 5
```

Python puro (biblioteca padrão; `--verify` usa Node). Gera ~18 mil exemplos com as **16 intenções** (inclui
`RESULTADOS`, `SEGUNDO_TURNO`, `ELEGIBILIDADE`, `PATRIMONIO`, `RECOMENDACAO`):

```
pergunta: "Quem foi eleito governador no Pará?"
alvo    : {"intent": "RESULTADOS", "cargo": "GOVERNADOR", "uf": "PA"}
```

- **Sem fatos:** o alvo é só intenção + entidades presentes na pergunta (`RECOMENDACAO` não leva entidades: o app recusa
  com neutralidade). Nada de respostas prontas, contagens, datas ou valores.
- **Dados reais:** nomes de urna (majoritários: todos; deputados: amostra de `--max-deputados`), siglas de partido e UFs
  vêm do pacote atual; formas de cargo, tema e histórico vêm de tabelas com os mesmos ids do contrato.
- **Variação:** ~190 templates em português; caixa, acentos, erros de digitação leves (só em palavras de ligação, nunca
  em entidades), prefixos de cortesia, siglas vs. nomes de estado, “do PT”/“do partido PT”, etc.
- **Casos de teste ficam de fora:** nenhuma pergunta de `contracts/nlu_golden_cases.json` entra — são removidas as
  idênticas (texto normalizado) **e** as quase idênticas (Jaccard de palavras ≥ 0,8). `stats.json` mostra quantas
  (`golden_exact_removed`, `golden_near_removed`). Teste automatizado garante.
- **Rótulos = pontos fixos do proxy:** com `--verify`, cada rótulo passa pelo normalizador real
  (`api/_lib/normalize.js`, com ancoragem na pergunta) e precisa sair idêntico — o que se treina é exatamente o que o
  proxy entrega ao app.
- **Treino × validação:** divisão estável por hash; a validação separa **nomes de candidatos** (generalização para
  nomes inéditos). `val_cases.json` é uma amostra da validação no esquema dos casos de referência.

Saídas em `backend/retrain/out/` (ignorada pelo Git): `train.jsonl`/`val.jsonl` (+ `.json` em array), `val_cases.json`,
`stats.json`, `meta.json` (inclui `dataVersion` do pacote e a semente). Cada registro: `instruction` (prompt de
sistema v2), `input` (pergunta crua), `output` (string JSON compacta), `intent`, `text` (ChatML completo).

### 1.1 Perguntas externas (mais variedade de formulação, sem fatos de terceiros)

Os templates cobrem bem o vocabulário, mas não o modo como as pessoas realmente escrevem (voz, typos, frase
solta). Dá para ampliar com perguntas vindas de fora — **desde que o rótulo nunca venha da fonte**:

```bash
# (a) relatos reais de usuários (issues públicas relato-ia) — exige --confirmar-finalidade, ver aviso abaixo
node backend/retrain/colher_relatos.mjs --confirmar-finalidade --out backend/retrain/extra/relatos.jsonl

# (b) rotular qualquer lista (JSONL/JSON array/.txt com uma pergunta por linha)
node backend/retrain/label_extra.mjs --in backend/retrain/extra/perguntas_usuario_2026-10-02.txt \
     --out backend/retrain/extra/rotuladas_usuario_2026-10-02.jsonl \
     --fonte lista-usuario-2026-10-02 --licenca "..." --coletado-em 2026-10-02 [--manter-desconhecidas 200]

# (c) gerar o dataset incluindo as externas, com teto de participação
python backend/retrain/build_nlu_dataset.py --out backend/retrain/out --verify \
       --extra backend/retrain/extra/rotuladas_usuario_2026-10-02.jsonl --extra-max-pct 25
```

Garantias (todas testadas):
- **Rótulo derivado, nunca copiado.** `label_extra.mjs` rotula com o NLU determinístico dos clientes
  (`web/src/eleicoes2026/js/nlu.js`, porte de `LocalNlu.kt`) sobre o pacote oficial, e só aceita o exemplo se o
  rótulo for **ponto fixo** do normalizador do proxy (`api/_lib/normalize.js`, com ancoragem na pergunta).
  `build_nlu_dataset.py` ainda revalida vocabulários fechados e exige que **nome e partido existam no pacote**
  (nome parcial vale se todos os tokens aparecem num mesmo nome oficial — mesma semântica de `resolverNome`).
- **Sem fatos de terceiros.** O alvo continua sendo só `intent` + entidades; a resposta exibida é montada pelo
  cliente a partir do pacote assinado. Uma lista de origem não oficial não consegue injetar dado não oficial.
- **Higiene.** Descartados: dados pessoais (padrões e máscaras de `api/_lib/sanitize.js`), duplicadas, fora do
  limite 3–300, entidades que o contrato v2 não representa (`numero`, `genero`, `vice`, `apenasIndeferidas` —
  o NLU local cobre esses casos) e rótulos que não são ponto fixo. Casos de referência saem do treino
  (idênticos e quase idênticos, Jaccard ≥ 0,8) — vale também para as externas.
- **Teto e proveniência.** `--extra-max-pct` (padrão 25) limita a participação; `stats.json` traz
  `extras_aceitos`, `extras_pct`, `extras_por_fonte` e `extras_descartados`; `meta.json` grava arquivos, teto,
  licença/coleta por fonte e o método de rotulagem.

> **Aviso (LGPD/finalidade) para a fonte (a):** `docs/PRIVACIDADE.md` declara hoje que os relatos ficam públicos
> "para transparência das correções". Usá-los para treinar é **finalidade nova**: atualize a política (e a página
> `web/src/privacidade`, que o build confere) e o texto do diálogo "Relatar problema" antes. Por isso
> `colher_relatos.mjs` só roda com `--confirmar-finalidade`.
>
> **Limite do método:** rotular com o nosso próprio NLU ensina ao modelo o que as regras **já** sabem. As
> perguntas mais valiosas são as que o NLU local não entende — essas precisam de rótulo manual (poucas, alto
> valor) e devem entrar também em `contracts/nlu_golden_cases.json`. Melhorar as regras do NLU costuma render
> mais que retreinar: o app/site respondem 100 % sem a nuvem.

## 2. Treinar

O prompt e o formato de saída ficam em **`backend/modal/nlu_core.py`** (`SYSTEM_PROMPT_V2`, `format_output_v2`): é a
mesma fonte usada pelo serviço, pela gramática e pelo gerador — não os duplique.

**A) Local (RTX), com os scripts existentes.** `ai_model/scripts/train_hybrid.py` lê um **array JSON** de
`{instruction, input, output}` (`output` como string é usado literalmente) — exatamente o `train.json` gerado. Ele tem o
caminho fixo `DATA = BASE/"data"/"dataset_oficial_treino.json"`; duas opções (esta pasta não edita `ai_model/`):

```bash
cp backend/retrain/out/train.json ai_model/data/dataset_oficial_treino.json     # simples, sobrescreve o antigo (está no Git)
# ou adicionar um argumento --dataset ao train_hybrid.py (1 linha: DATA = Path(args.dataset))
python ai_model/scripts/train_hybrid.py --base_model Qwen/Qwen2.5-1.5B-Instruct --max_length 256 --epochs 2
python ai_model/scripts/merge_and_export.py --lora_dir ../output/SaibaTudo-Eleicao2026-hybrid/final --output_dir ../output/SaibaTudo-NLU-v2-merged
```

Sugestões **não validadas**: os exemplos têm ~130 tokens, então `--max_length 256` basta (o padrão 768 só gasta
memória); `train_hybrid.py` calcula a perda também sobre o prompt — mascarar os tokens do prompt (`labels=-100`) tende a
acelerar a convergência. Publique o resultado no Hugging Face (`push_to_hub.py`) em um repositório/revisão **novo**
(não sobrescreva o modelo em produção) e anote o SHA do commit.

**B) Job Modal GPU sob demanda (não implementado aqui).** Mesmo fluxo em um job pontual (`gpu="A10G"`/`L4`, minutos,
dentro do crédito) que executa `train_hybrid.py` com o `train.json` em um Volume e publica no HF. Só vale a pena se a
RTX local não estiver disponível; **não** use GPU para servir (ver README do Modal).

## 3. Converter, avaliar e promover (gate de qualidade)

```bash
# 3.1 converter + gate automático (JSON válido nativo >= 98 %, 100 % com gramática, regressão Q4×Q8 <= 3 pts)
modal run backend/modal/convert_gguf.py::main --version v2-2026-11 --format v2 \
          --hf-repo franciscoaleixo/SaibaTudo-NLU-v2 --revision <sha> --with-q8        # sem --promote ainda

# 3.2 avaliar na validação (nomes inéditos) e nos casos de referência, baixando o GGUF do Volume
modal volume get saibatudo-nlu-models v2-2026-11/model-Q4_K_M.gguf ./model-Q4_K_M.gguf
pip install llama-cpp-python
python backend/modal/eval_golden.py --gguf ./model-Q4_K_M.gguf --format v2 --unconstrained \
       --cases backend/retrain/out/val_cases.json --min-entity-acc 95
python backend/modal/eval_golden.py --gguf ./model-Q4_K_M.gguf --format v2 --unconstrained --min-entity-acc 90

# 3.3 promover (ponteiro current.json) e alinhar a Vercel
modal run backend/modal/convert_gguf.py::promote --version v2-2026-11
#     Vercel: MODEL_VERSION=v2-2026-11 (invalida o cache) ; MODAL_TIMEOUT_MS ~4000 ; novo deploy
```

Critérios sugeridos para promover (ajuste após o 1º ciclo): JSON válido nativo ≥ 98 % (**imposto** pelo job); acerto de
intenção ≥ 95 % e de cargo/UF/partido ≥ 95 % na validação; alucinação em chaves null ≤ 2 %; nos casos de referência, nenhum
caso que o NLU local resolve pode piorar. **Não** promova sem `bench` (latência) no Modal.

Rollback: `modal run backend/modal/convert_gguf.py::promote --version <anterior>` + `MODEL_VERSION=<anterior>` na Vercel.
O proxy entende **os dois formatos** (legado e v2) — a troca não exige mudança nos clientes, e versões antigas do app
continuam funcionando porque o contrato `POST /api/nlu` não muda.

## Por que o formato `v2`

O modelo legado emite ~262 tokens por resposta (136 só até `filters`) e foi treinado com 87 % de `CANDIDATE_LOOKUP`; em CPU
isso custa segundos e dinheiro, e ele nunca viu várias intenções do contrato. O `v2` emite 10–30 tokens (~5× menos) e é
**o próprio contrato**, de modo que o proxy só valida/ancora, sem traduzir.

## Plano pós-eleição (RESULTADOS, eleitos, 2º turno, diplomação, posse)

Fases do pacote (`faseEleitoral`): `PRE_ELEICAO` → `DIA_1T` → `ENTRE_TURNOS` → `DIA_2T` → `POS_ELEICAO`. Datas oficiais vêm de
`regras.json` — **não** são codificadas no modelo nem aqui.

| Fase | O que o usuário pergunta | Dependência | Retreino? |
| :-- | :-- | :-- | :-- |
| 1º turno (04/10/2026) e apuração | “quem lidera para governador em SP?”, “resultado em MG” | `resultados/<UF>.json` + apuração ao vivo (cliente → TSE) | Não: `RESULTADOS` já está no contrato e no dataset v2; o texto da resposta vem dos dados |
| Entre turnos | “quem vai pro segundo turno?”, “vai ter 2º turno no PA?” | `situacaoTotalizacao = "2º TURNO"` | Não (`SEGUNDO_TURNO`, `turno=2`) |
| Pós 2º turno | “quem foi eleito presidente?”, “quem são os senadores eleitos?” | Resultados finais publicados | Não |
| Diplomação e posse | “quando é a diplomação / a posse?” | Calendário em `regras.json` | Não (`CALENDARIO`); acrescente templates novos se surgirem formas de pergunta (`CALENDARIO` em `T`) |
| Depois do ciclo | Arquivar o pacote 2026; novo ciclo (2028: Prefeito/Vereador) | Novo pipeline de dados | **Sim**: novos cargos ⇒ novo vocabulário ⇒ novo ciclo desta pasta |

Se o modelo **v2 ainda não estiver em produção** na data da apuração, `RESULTADOS`/`SEGUNDO_TURNO`/`ELEGIBILIDADE`/
`PATRIMONIO`/`RECOMENDACAO` continuam sendo resolvidos pelo **NLU local** (regras); o modelo legado só ajuda em listagem e
perfil. Isso é degradação aceitável (nada quebra), mas é a razão para priorizar o retreino v2.

## Testes desta pasta

```bash
python -m unittest discover -s backend/retrain -p "test_*.py" -v
python -m py_compile backend/retrain/build_nlu_dataset.py
```
