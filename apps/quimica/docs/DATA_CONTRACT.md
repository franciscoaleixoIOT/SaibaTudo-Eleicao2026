# Contrato de dados — SaibaTudo Química

Pacote: `data/quimica/`. Tudo em JSON UTF-8, chaves em `camelCase`, textos em **português do Brasil**; valores numéricos em **SI** (K, Pa, kg·m⁻³, J) com o campo
`unidade` quando houver ambiguidade. Nenhum campo é inventado: **ausência de dado = ausência de campo**. Cada registro traz `fontes` (lista de `{nome, url, licenca, acessadoEm}`).

## 1. `manifest.json` (+ `manifest.sig`)
Mesmo esquema do app de eleições: `{ version, generatedAt, schemaVersion: 1, files: { "<caminho>": { bytes, sha256 } }, sources: [...], licencas: [...],
cliente: { pollIntervalMinutes: 10080, baseUrl, nlu: { endpoint }, ask: { enabled: false }, melhoria: { enabled: false } } }`. A assinatura é ECDSA P-256/SHA-256 (DER, Base64)
do arquivo `manifest.json` byte a byte; chave pública em `pipeline/data_signing_public.pem` (e `.b64` para o site e o app). `pollIntervalMinutes` = 7 dias.

## 2. `elementos.json` — 118 elementos
```json
{ "z": 8, "simbolo": "O", "nome": "Oxigênio", "nomeEn": "Oxygen", "massaAtomica": 15.999, "massaAtomicaIncerteza": null,
  "grupo": 16, "periodo": 2, "bloco": "p", "categoria": "nao_metal",
  "configuracaoEletronica": "[He] 2s2 2p4", "eletronegatividade": 3.44, "raioAtomicoPm": 152, "afinidadeEletronicaKJmol": 141.0,
  "energiaIonizacaoKJmol": 1313.9, "pontoFusaoK": 54.36, "pontoEbulicaoK": 90.188, "densidadeKgm3": 1.429, "estadoPadrao": "gas",
  "estadosOxidacao": [-2, -1, 0, 1, 2], "descoberta": { "ano": 1774, "por": "Carl Wilhelm Scheele; Joseph Priestley" },
  "fontes": [ { "nome": "PubChem Periodic Table", "url": "https://pubchem.ncbi.nlm.nih.gov/periodic-table/", "licenca": "domínio público (NIH)", "acessadoEm": "2026-10-10" } ] }
```
`categoria` ∈ `metal_alcalino | metal_alcalino_terroso | metal_transicao | metal_pos_transicao | semimetal | nao_metal | halogenio | gas_nobre | lantanideo | actinideo | desconhecida`.
Nomes em PT seguem a **SBQ/IUPAC-PT** (ex.: "Oxigênio", "Hidrogênio"); `nomeEn` fica para busca.

## 3. `compostos/<lote>.json` — compostos (núcleo: ~2.000; lotes de 200 por arquivo, `compostos/index.json` com `{ cid → lote }` e nomes para busca)
```json
{ "cid": 2244, "nome": "Ácido acetilsalicílico", "nomePopular": "Aspirina", "nomeIupac": "2-acetyloxybenzoic acid", "sinonimos": ["aspirina", "AAS"],
  "formula": "C9H8O4", "formulaHill": "C9H8O4", "massaMolar": 180.16, "massaExata": 180.0423, "smiles": "CC(=O)OC1=CC=CC=C1C(=O)O", "inchiKey": "BSYNRYMUTXBXSQ-UHFFFAOYSA-N",
  "cas": "50-78-2", "propriedades": { "xlogp": 1.2, "doadoresH": 1, "aceptoresH": 4, "ligacoesRotaveis": 3, "carga": 0, "tpsa": 63.6 },
  "ghs": { "pictogramas": ["GHS07"], "palavraSinal": "Atenção", "frasesH": ["H302", "H315", "H319"], "fonte": "PubChem (ECHA C&L)" },
  "classes": ["acido_carboxilico", "ester", "aromatico"], "wikidata": "Q18216", "icsc": null,
  "fontes": [ { "nome": "PubChem CID 2244", "url": "https://pubchem.ncbi.nlm.nih.gov/compound/2244", "licenca": "domínio público (NIH)", "acessadoEm": "2026-10-10" } ] }
```
Nome em PT: do Wikidata (rótulo `pt`/`pt-br`) quando existir; senão o nome IUPAC em inglês com `nomePtPendente: true` (a interface mostra o IUPAC).
Seleção do núcleo: compostos com página na Wikipédia em português (sitelink `ptwiki`) **e** CID no PubChem, mais listas fixas (ácidos/bases/sais do ensino médio, solventes,
gases, polímeros comuns, fármacos de uso geral). Critério de inclusão é público (`pipeline/selecao_compostos.py`).

## 4. `seguranca/icsc/<numero>.json` — Fichas Internacionais de Segurança Química (OIT/OMS), em português
Campos oficiais do cartão: `{ icsc, nome, cas, un, formula, perigosAgudos: {incendio, explosao}, exposicao: {inalacao, pele, olhos, ingestao}, primeirosSocorros: {...},
derramamento, armazenamento, classificacaoGhs, propriedadesFisicas: {...}, fontes }`. Só os cartões que existem em PT; os demais ficam fora (não traduzimos ficha de segurança por máquina).

## 5. `textos/<fonte>/<id>.json` — trechos licenciados para explicação e retrieval
```json
{ "id": "openstax-chem2e-3.1-001", "fonte": "OpenStax Chemistry 2e", "licenca": "CC BY 4.0", "url": "https://openstax.org/books/chemistry-2e/pages/3-1-formula-mass-and-the-mole-concept",
  "capitulo": "3", "secao": "3.1 Massa fórmula e o conceito de mol", "titulo": "Massa fórmula", "textoOriginal": "...", "textoPt": "...", "traducao": "automática, revisada: não",
  "palavrasChave": ["massa fórmula", "mol"], "entidades": { "elementos": [], "compostos": [] } }
```
Regras: o trecho original é preservado (para auditoria e citação); a tradução é marcada como automática até uma pessoa revisar. CC BY-NC-SA (LibreTexts) só entra em
pasta própria com a licença no `manifest.licencas`, e o dataset derivado dela herda CC BY-NC-SA.

## 6. `constantes.json` (CODATA 2022, NIST, domínio público), `regras.json` (prefixos SI, unidades, série de reatividade, solubilidade, nomenclatura básica — autoria própria
com fontes) e `fontes.json` (lista completa de fontes, licenças e datas, exibida em "Sobre os dados").

## 7. Dataset (`dataset/`) — não faz parte do pacote assinado; é o material de treino e avaliação
`dataset/qa/*.jsonl` (uma linha por par):
```json
{ "id": "el-8-massa", "pergunta": "Qual é a massa atômica do oxigênio?", "resposta": "A massa atômica do oxigênio (O, Z = 8) é 15,999 u.", "tipo": "fato",
  "nivel": "medio", "entidades": { "elementos": ["O"] }, "numeros": ["15,999", "8"], "fontes": [ { "nome": "PubChem Periodic Table", "licenca": "domínio público" } ],
  "geradoPor": "template:elemento.massa", "revisadoPor": null }
```
`tipo` ∈ `fato | calculo | conceito | seguranca | recusa | nomenclatura | desenho`. `recusa` são pedidos perigosos com a resposta de recusa padrão. Para `conceito`, a resposta
cita o trecho (`fontes[].id` aponta para `textos/`). **Todo número da resposta tem de aparecer em `numeros` e existir na fonte** (teste automático).
`dataset/nlu/*.jsonl`: `{ q, alvo: { intent, entidades... } }` para o modelo de interpretação (mesmo formato do app de eleições).
`contracts/nlu_golden_cases.json`: casos de referência do NLU (nunca entram no treino). `contracts/seguranca_cases.json`: pedidos que **devem** ser recusados e pedidos legítimos
que **não** podem ser recusados (ex.: "como neutralizar ácido derramado").

## 8. Intenções do NLU (v1)
`ELEMENTO` (perfil), `COMPOSTO` (ficha), `PROPRIEDADE` (de X: ponto de fusão, pKa…), `MASSA_MOLAR`, `BALANCEAR`, `ESTEQUIOMETRIA`, `CONCENTRACAO` (molaridade, diluição),
`PH`, `GAS_IDEAL`, `CONVERSAO_UNIDADE`, `NOMENCLATURA` (nome ↔ fórmula), `DESENHAR` (estrutura), `COMPARAR`, `TABELA_PERIODICA` (tendências, grupo, período), `SEGURANCA`
(perigos, EPI, primeiros socorros), `CONCEITO` (explicação), `RECUSA_PERIGO`, `SOBRE_DADOS`, `FONTES`, `AJUDA`, `DESCONHECIDA`.
Entidades: `elemento` (símbolo), `composto` (cid ou nome canônico), `propriedade` (id de `regras.propriedades`), `quantidades: [{valor, unidade}]`, `equacao` (texto),
`nivel` (`fundamental|medio|superior`), `unidadeDestino`.
