# Dataset do SaibaTudo Química (fase 2)

Perguntas e respostas em **português do Brasil**, com **proveniência**, para treinar e avaliar o app: o modelo de **interpretação** (NLU:
pergunta → intenção + entidades) e o de **explicação** (resposta ancorada em dados e trechos licenciados). Python 3 puro (biblioteca padrão).

```
dataset/
  gerar_qa.py        gera qa/*.jsonl + qa/stats.json          gerar_nlu.py   gera nlu/train|val.jsonl (+ *_sft.jsonl) + nlu/stats.json
  gerar_amostra.py   gera AMOSTRA.md (60 pares legíveis)      topicos.json   mapa de temas (cobertura de conceitos e segurança)
  gerar_catalogo.py  gera CATALOGO.md (catálogo completo) + CATALOGO.jsonl (todos os pares)
  conceitos/*.jsonl  pares de conceito/segurança escritos à mão a partir dos trechos licenciados (entrada do gerador)
  fam_*.py           uma família de perguntas por módulo      calculo.py     fórmulas, massa molar, balanceador, estequiometria, pH, gás, unidades
  dados_recusas.py   pedidos perigosos + a resposta padrão    ghs_pt.py      frases H em PT (fallback), pictogramas, rótulos
  tests/             testes (python -m unittest ...)          tests/fixtures pacote mínimo de teste (10 elementos, 20 compostos, 6 textos)
```

## Como gerar

```bash
python dataset/gerar_qa.py            # lê data/quimica/ (ou a fixture, se o pacote ainda não existir) -> dataset/qa/
python dataset/gerar_nlu.py           # -> dataset/nlu/ (remove os casos de contracts/nlu_golden_cases.json e seguranca_cases.json)
python dataset/gerar_amostra.py       # -> dataset/AMOSTRA.md
python dataset/gerar_catalogo.py      # -> dataset/CATALOGO.md + dataset/CATALOGO.jsonl
python -m unittest discover -s dataset -p "test_*.py"
```

Semente fixa (`--seed 2026`): a mesma entrada produz exatamente os mesmos arquivos. `stats.json` informa `fonteDados` (`real`, `parcial` ou `fixture`): **só `real` serve
para treino**. `--data <pasta>` aponta outro pacote; `DATASET_TESTE_PACOTE=fixture|real|<pasta>` força o pacote usado pelos testes.

### Estado atual (10/10/2026, 21h30)
O pacote real `data/quimica/` **existe e está assinado** (`fonteDados: "real"`), porém **reduzido a 300 compostos** (de uma lista fixa de 490) porque o PubChem
está limitando o IP (HTTP 429) e impede coletar os ~190 compostos restantes. O dataset já foi regerado sobre esse pacote real: **19.254 pares** (7.019 de elementos,
5.468 de compostos, 3.345 de cálculos, 1.047 de nomenclatura, 600 de desenho, 509 de segurança, 479 de conceitos, 416 recusas) e 65/65 temas cobertos. As famílias de
compostos, GHS por composto e cálculos com compostos crescem automaticamente quando o núcleo completo for coletado; regerar é rodar os 5 comandos acima (~1 min).

## Catálogo completo de perguntas e respostas
`dataset/gerar_catalogo.py` produz dois artefatos a partir de `qa/*.jsonl`:
- `CATALOGO.md` — catálogo legível, **completo em cobertura**: todos os modelos de pergunta por família (um exemplo real cada), os pares escritos à mão (conceitos e
  segurança geral) **na íntegra**, todas as perguntas de recusa, a tabela dos 65 temas com exemplo e o índice de entidades (118 elementos, todos os compostos);
- `CATALOGO.jsonl` — a lista **literal** de **todos** os pares (id, família, tipo, nível, tema, pergunta, resposta, fontes).


## Formato do QA (`qa/*.jsonl`, uma linha por par; DATA_CONTRACT §7)

Campos do contrato: `id`, `pergunta`, `resposta`, `tipo` (`fato | calculo | conceito | seguranca | recusa | nomenclatura | desenho`), `nivel`
(`fundamental | medio | superior`), `entidades`, `numeros`, `fontes`, `geradoPor`, `revisadoPor` (sempre `null` até uma pessoa revisar).
Campos adicionados: `numerosOrigem` (de onde veio cada número), `calculo` (tipo, entrada e resultado, nos cálculos), `acao` + `smiles` (desenho) e `tema`
(id de `topicos.json`, nos conceitos e na segurança geral).

| Arquivo | Conteúdo | Origem dos dados |
| :-- | :-- | :-- |
| `elementos.jsonl` | ~30 templates × 118 elementos (símbolo, Z, massa, grupo/período/bloco, categoria, configuração, eletronegatividade, fusão/ebulição em K e °C, densidade, oxidação, descoberta, estado, vizinhos, elétrons, comparações...). Dado ausente no pacote vira resposta de ausência, nunca palpite | `elementos.json` |
| `compostos.jsonl` | 18 templates × cada composto do núcleo (fórmula, massa molar, IUPAC, popular, CAS, SMILES, classes, GHS, "é perigoso?", comparação de massas molares...) | `compostos/*.json` |
| `calculos.jsonl` | massa molar, balanceamento (> 200 equações), estequiometria (massa↔mol, partículas, volume nas CNTP, reagente limitante, rendimento), molaridade, preparo e diluição, pH de ácido/base forte, gás ideal, conversão de unidades. Etapas completas | cálculo por código sobre o pacote; `constantes.json`; `regras.json` |
| `nomenclatura.jsonl` | nome ↔ fórmula dos compostos do núcleo e de > 100 inorgânicos gerados por regras e validados por fórmula conhecida | pacote + regras de nomenclatura |
| `regras.jsonl` | solubilidade de sais e reatividade de metais, aplicadas por código às regras de ensino do pacote | `regras.json` |
| `desenho.jsonl` | "desenhe a estrutura de X" → `acao: "desenhar"` + `smiles` | `compostos/*.json` |
| `seguranca.jsonl` | GHS harmonizado (frases H em português do CLP, pictogramas, riscos físicos/saúde/ambiente por composto) e segurança geral de laboratório/doméstica **a partir dos trechos** | pacote + trechos |
| `recusas.jsonl` | ≥ 150 pedidos perigosos (síntese, purificação, escalonamento, obtenção caseira; disfarces e grafias alteradas) com **uma única resposta padrão** | `dados_recusas.py` |
| `conceitos.jsonl` | ≥ 300 explicações de 2 a 6 frases, escritas a partir **exclusivamente** do(s) trecho(s) citado(s) em `fontes[].id` | `textos/*` |

### Fidelidade numérica
Todo número da `resposta` aparece em `numeros`, e `numerosOrigem` diz de onde veio: `pacote:<arquivo>#<caminho>` (valor lido do pacote, conferido pelo teste),
`calculo:<tipo>` (produzido por código, recomputado por um segundo caminho nos testes), `pergunta`, `definicao:<nome>` (ex.: 0 °C = 273,15 K),
`regra:<nome>` (carga de íon/índice de fórmula) ou `passagem:<id>` (número presente no trecho licenciado). O gerador **recusa-se a escrever** uma resposta com número sem
origem (`RespostaInconsistente`). Nos cálculos, os valores intermediários são exibidos com 5 algarismos significativos **e usados como exibidos**; o resultado final traz
4 algarismos significativos (declarado na resposta). A massa molar calculada é conferida com o `massaMolar` do PubChem: se divergir mais de 0,5 %, a resposta usa o valor
do PubChem e o caso entra em `stats.json` (`massaMolarDivergente`).

### Segurança e recusas
`RECUSA_PADRAO` (em `dados_recusas.py`) é curta, sem sermão e oferece perigos, primeiros socorros, cálculos e química geral. Os pedidos de `contracts/seguranca_cases.json` são
**material de teste**: nada idêntico ou quase idêntico (Jaccard de palavras ≥ 0,8) entra em `recusas`, `seguranca` ou no NLU. Perguntas legítimas sobre os mesmos
assuntos ("perigos da nitroglicerina", "massa molar do TNT", "primeiros socorros para cianeto") existem no dataset e **não** são recusadas.

### Conceitos e segurança geral (`conceitos/*.jsonl`)
Cada linha: `{"pergunta", "resposta", "nivel", "ids": ["<id do trecho>"], "tipo": "conceito"|"seguranca", "tema": "<id de topicos.json>"}`. O gerador valida: os `ids` existem
no pacote; fonte e licença são copiadas do trecho; todo número da resposta existe no trecho; o tema existe. A cobertura por tema (≥ 3 pares; temas sem trecho licenciado
aparecem como "sem fonte licenciada ainda", nunca preenchidos de memória) vai para `qa/stats.json` (`coberturaTemas`, `coberturaResumo`). Hoje há 481 pares de conceito e 85 de segurança geral escritos à mão (65 temas de `topicos.json`, ≥ 5 pares cada); 479 conceitos entram no QA (2 pares citam o artigo "Absorção física", que não existe na Wikipédia PT, e são descartados com mensagem clara em `stats.json`). Nenhum trecho em inglês foi usado
(o Gold Book respondeu 403 na coleta e o ChEBI não trouxe definições); se vierem, devem virar resposta em português citando o id do trecho.

## NLU (`nlu/`)

`{"q": "...", "alvo": {"intent": "...", ...}}` no **formato do modelo** (`backend/modal/nlu_core.py`): chaves `intent`, `elemento` (símbolo), `composto`, `propriedade`
(ids do vocabulário do modelo, ex.: `pontoFusaoK`), `quantidades` (`[{valor, unidade}]`), `equacao`, `nivel`, `unidadeDestino`, nessa ordem. `composto` e `equacao` são o **texto
copiado da pergunta** (nome, nome popular, sinônimo ou fórmula como digitado; o servidor ancora e o cliente resolve para o CID), como no app de eleições. Sem fatos e sem respostas
no alvo. 21 intenções, > 300 templates, erros de digitação só em palavras de ligação, > 15 mil exemplos. Validação: 5 % por hash estável da **entidade principal** (mede
generalização a compostos/elementos inéditos). Com `--sft`, também grava `*_sft.jsonl` (formato `instruction/input/output/text` do treino, ~20 MB).

## Licença do dataset

**CC BY-SA 4.0** (herdada dos textos da Wikipédia e do Wikilivros em português e do IUPAC Gold Book, CC BY-SA). Os demais insumos são compatíveis: PubChem e CODATA (domínio público),
Wikidata (CC0), ChEBI (CC BY 4.0), Regulamento CLP/EUR-Lex (reutilização livre, com atribuição), Project Gutenberg #14474 (domínio público) e autoria própria. Cada par traz as
`fontes[]` individuais (nome e licença); a atribuição completa está em `data/quimica/fontes.json`. **Fora do dataset por política** (docs/FONTES_E_LICENCAS.md §5): OpenStax,
ICSC, LibreTexts, NIST WebBook, ECHA e qualquer fonte NC/ND — um teste falha se alguma aparecer. Nada vem dos livros da pasta `LivrosQuimica`.

## Testes

`python -m unittest discover -s dataset -p "test_*.py"` (~20 s): cálculo e balanceador (conservação de átomos em todas as equações), massa molar × PubChem, fidelidade numérica
(todo número tem origem válida; cálculos recomputados de forma independente), esquema e ids, recusas com a resposta padrão, fontes licenciadas/proibidas, nomenclatura, NLU
(golden fora do treino, alvo válido para o modelo, entidades presentes na pergunta), contratos (golden ≥ 120, segurança ≥ 80) e cobertura mínima de temas.

## Decisões fora do contrato

- Campos extras no QA (`numerosOrigem`, `calculo`, `acao`, `smiles`, `tema`) e arquivos `regras.jsonl`/`desenho.jsonl` separados.
- O NLU usa os ids de propriedade do **modelo** (`nlu_core.PROPRIEDADES`); `regras.json` usa snake_case (`ponto_fusao`) e o golden usa nomes curtos (`pontoFusao`) — três
  convenções a reconciliar (ver relatório da fase).
- Respostas de ausência ("o pacote de dados não traz X") quando um elemento/composto não tem o campo: o dataset nunca preenche lacunas.
