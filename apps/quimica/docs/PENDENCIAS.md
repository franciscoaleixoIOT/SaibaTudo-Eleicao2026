# Pendências — SaibaTudo Química

> **Em 10/10/2026, 22h30 (horário de Brasília).** Ordem de execução recomendada. `[x]` = feito; `[~]` = feito em parte. Contexto completo em [`PROJECT_MEMORY.md`](PROJECT_MEMORY.md).

## 1. Pacote de dados (`data/quimica/`)
- [x] **Pacote real assinado com o núcleo completo da lista fixa** (491 compostos, 1787 textos): `python pipeline/build.py --alvo 491 --assinar-com secrets/data_signing_key.pem` (o build sem limite, alvo 2000, continua válido para ampliar depois). `Pacote válido: 20261010T234125Z-...`.
- [ ] (Opcional, depois) ampliar para o alvo de 2000 via seleção do Wikidata quando quiser cobrir mais compostos; regerar o dataset.
- [ ] Conferir `fontes.json` e `manifest.licencas` contra a seção 5 de `FONTES_E_LICENCAS.md` (nada de "CC BY 4.0" para OpenStax; Wikimedia e Gold Book CC BY-SA; ChEBI CC BY).
- [x] `python -m unittest discover -s pipeline/tests` (83, verde).

## 2. Integração (depende de 1)
- [x] **Unificar os ids de propriedade** (10/10/2026, 21h30): cliente (web + Android), modelo, golden e `regras.propriedades` usam o MESMO id = nome do campo do contrato com unidade (`pontoFusaoK`, `pontoEbulicaoK`, `densidadeKgm3`, `raioAtomicoPm`, `energiaIonizacaoKJmol`, `afinidadeEletronicaKJmol`). `PROPRIEDADE_CLIENTE` ficou vazio (proxy e nlu_core). Tocado em: `pipeline/regras.py`, `web/src/quimica/js/{propriedades,nlu}.js`, `app/.../{domain/Propriedades,ai/nlu/LocalNlu,ai/answer/AnswerBuilder}.kt`, `contracts/nlu_golden_cases.json`, fixtures (web + `app/tools/gerar_fixture_pacote.py`), `api/_lib/{vocab,normalize}.js`, `backend/modal/{nlu_core,eval_golden}.py`. **Novo teste de paridade:** `tools/test_vocab_paridade.py`.
- [ ] **Campo `composto`:** decidir (recomendado: o cliente resolve nome/fórmula → CID; o golden guarda o texto citado **e** o CID esperado; a nuvem devolve texto copiado da pergunta, nunca CID). O proxy já aceita CID mas o modelo emite `composto` como texto/número — falta fechar.
- [x] `python dataset/gerar_qa.py && python dataset/gerar_nlu.py && python dataset/gerar_amostra.py && python dataset/gerar_catalogo.py` com o pacote real; testes do dataset verdes (68). Tudo commitado e enviado em `af68d02` (CI verde).
- [x] `cd web && npm test` com o pacote real: **112/113** (1 pulado = E2E; 0 falhas). `node web/build.mjs` verde.
- [x] `cd api && npm test` (168, verde). Golden real do Android verde (145 casos).
- [x] `python app/tools/copiar_pacote_para_assets.py` e `./gradlew.bat testDebugUnitTest lintDebug assembleRelease` com o pacote real (92 testes, lint limpo, APK release 3,7 MB; assets em `af68d02`).
- [ ] Consolidar `api/test/seguranca_cases_api.json` (~115 casos) em `contracts/seguranca_cases.json` e conferir os três `seguranca` (api, web, Android) contra o contrato unificado; incluir "escalar a produção de X" (o Android já pega).
- [x] `vercel.json`: rewrite `/quimica/api/:path*` → `/api/:path*` antes do SPA, SPA exclui `api/`, `includeFiles` do manifesto; coberto por teste (`5963a1f`). Obs.: o cliente web ainda não chama a API (nuvem fica para a fase 5).
- [ ] Revisão humana por amostragem dos 85 pares de segurança escritos à mão (`dataset/conceitos/12-seguranca-geral.jsonl`) e de ~50 conceitos; preencher `revisadoPor`.
- [ ] `tools/test_workflows.py` exige `bash` no PATH (valida a sintaxe dos passos dos workflows): roda no CI (Ubuntu); na máquina Windows falha por ambiente, não por código.

## 3. Primeiro deploy
- [ ] **Primeiro deploy — a partir de 11/10 ~21h30.** 1) `python tools/vercel_cota.py --minimo 1400` (precisa de 1.060 uploads + folga para os deploys de eleições, que dividem a cota); 2) `vercel deploy --prod --yes` na pasta do projeto (o build roda na Vercel; o `.vercelignore` já foi validado com build simulado); 3) conferir `https://saibatudo-quimica.vercel.app/quimica/` e `/quimica/api/health`; 4) rodar de novo `vercel_cota.py` e conferir que eleições publicou depois (`gh run list --workflow data_refresh.yml` no repositório de eleições). Histórico: tentado em 10/10 ~21h20 sem `.vercelignore` (~4.400 arquivos, cota estourada); teste de envio às 22h: 1.060 faltando, 123 livres → adiado. Se a cota for problema recorrente: lotes de textos (§8.1) ou plano Pro.
- [ ] No repositório de eleições (**só depois do item acima**): `git push origin main` dos commits locais 15e09db (cartão + rotas) e do `.vercelignore` (exclui `LivrosQuimica/`, `*.pdf`, `*.pem`, porque a CLI não lê o `.gitignore`), depois `gh workflow run data_refresh.yml`; conferir `https://saibatudo.net/quimica/`.
- [ ] CSP: a home de eleições aplica cabeçalhos a `/(.*)`; se o app de química quebrar por CSP sob `saibatudo.net/quimica/`, acrescentar `img-src data:` lá (já existe) e conferir `font-src`.
- [ ] Mantenedor: `VERCEL_TOKEN` em `secrets/vercel_token.txt` → `gh secret set VERCEL_TOKEN < secrets/vercel_token.txt`; testar `gh workflow run data_refresh.yml -f rapido=true`.
- [ ] Privacidade: `docs/PRIVACIDADE.md` ainda não existe; criar a partir da página `web/src/quimica/privacidade/` (os dois devem ser idênticos, com teste como no app de eleições).

## 4. Modelo (fase 5) — só depois de 2
- [ ] NLU: `ai_model/scripts/train_hybrid.py --target nlu` sobre `dataset/nlu/` (Qwen2.5-1.5B, QLoRA, ~3 h na RTX 5060); merge; `backend/modal/convert_local.py --target nlu`; gates (JSON, intenção ≥ 85 %, entidades, alucinação, `eval_seguranca.py`).
- [ ] Explicador: `backend/retrain/build_ask_dataset.py` → `train_hybrid.py --target ask` (Qwen3-4B, `max_length 1024`; medir tempo: pode passar de 8 h); merge; gates `eval_fidelidade.py` e `eval_seguranca.py`.
- [ ] Publicar no Hugging Face em repositórios novos (`franciscoaleixo/SaibaTudo-Quimica-NLU`, `-Ask`), revisão imutável; enviar GGUF do NLU ao Volume do Modal `saibatudo-quimica-models` e implantar `backend/modal/nlu_app.py`; criar o Space `franciscoaleixo/saibatudo-quimica-ask` (ZeroGPU) com `backend/hf_space_quimica/`.
- [ ] Vercel: `MODAL_ENDPOINT`, `MODAL_KEY`, `MODAL_SECRET`, `MODEL_VERSION`, `HF_ASK_SPACE_URL`, `HF_TOKEN`, `ASK_ENABLED=1`; variável do repositório `ASK_ENABLED=1`; deploy; teste ao vivo; política de privacidade atualizada (nuvem opt-in, Hugging Face e Modal como operadores).
- [ ] Impedir a suspensão do Windows durante o treino; não rodar outras cargas na GPU.
- [ ] Teto de gasto no painel do Modal (ainda não definido pelo mantenedor).

## 5. Fontes e dataset (contínuo)
- [ ] **Livros abertos verificados em 10/10 (noite), ver `FONTES_E_LICENCAS.md` §6** — criar `pipeline/livros_abertos.json` + `pipeline/coleta_livros_abertos.py` (PDF → trechos por seção; `pypdf`; checar a ficha catalográfica no PDF antes; nunca re-hospedar o PDF) com: UNILA *Química geral no laboratório* e *Química analítica no laboratório* (CC BY 4.0), USP/IQSC *Ensinando físico-química na prática* (CC BY 4.0, id 1584), USP *Métodos analíticos… águas residuárias* (CC BY, id 625), USP *Conservação da massa e energia* (CC BY-SA, id 1010, pasta separada), eduCAPES *Prática Pedagógica em Química* (CC BY 3.0 BR). Depois regerar conceitos por tema.
- [ ] Wikiversidade pt pelo **dump** (`ptwikiversity-latest-pages-articles.xml.bz2`, CC BY-SA): "Org - Química Orgânica" e Categoria:Química/Bioquímica.
- [ ] **Decisão do mantenedor:** LibreTexts *Química 1e/2e (OpenStax)* em português está rotulado CC BY 4.0 (edição de 2019, licença irrevogável) — usar ou manter só link até a OpenStax responder? Hoje: só link.
- [ ] Pedir permissão escrita à OpenStax (formulário https://riceuniversity.tfaforms.net/52) para Chemistry 2e e Química 2ed; se vier, pasta própria com licença NC-SA e dataset derivado separado.
- [ ] Gold Book: licença em conflito (CC BY-SA na home × CC BY-NC-ND no IUPAC Cookbook) e 403 ao coletor; endpoints `/terms/index/all/json` e `/terms/view/{CODE}/json`. Só verbetes pontuais com atribuição; para a coleção, pedir permissão (formulário IUPAC).
- [ ] Química Nova via SciELO (CC BY 4.0 confirmado a partir do fascículo 39-9/2016): coletar resumos/artigos de ensino em `textos/quimica-nova/` (índices `https://www.scielo.br/j/qn/i/<ano>.v<vol>n<num>/`). QNEsc continua só link (NC-ND + proibição de armazenar em banco de dados).
- [ ] `regras.incompatibilidades` e `pKw` no pacote (o site hoje usa 14 a 25 °C e avisa). Fonte das incompatibilidades: **HSDB/NIOSH via PubChem PUG View** (domínio público), não CAMEO (proíbe duplicação — só link).
- [ ] **Novas fontes estruturadas verificadas em 10/10 (noite), ver `FONTES_E_LICENCAS.md` §7** — ordem sugerida: (1) Wikidata P1117 pKa, P2177 solubilidade, P2054 densidade, P2101/P2102 fusão/ebulição, P2114 semivida, P2374 abundância, P1121 oxidação → `compostos[].propriedades` e `elementos[]`; (2) PubChem PUG View com **lista branca de licenças** (HSDB, NIOSH, OSHA, EPA, ChEMBL; recusar DrugBank, Haz-Map, HMDB, IUPAC pKa, IPTEI, CAMEO, JECFA) → solubilidade, pKa, armazenamento, primeiros socorros; (3) CODATA 2022 (`allascii.txt`, citar Rev. Mod. Phys. 97, 025002); (4) páginas de dados da Wikipédia (potenciais padrão, pKa, solubilidade por temperatura) com `oldid`; (5) Nobel API (dados CC0, confirmar) + Wikidata para biografias curtas; (6) listas oficiais PF (Portaria 204/2022) e Anvisa (344/98) → reforço da recusa por regra; (7) Wikimedia Commons (vidraria, com autor/licença); (8) CIAAW pesos atômicos 2021 (uso educacional). Cada fonte: entrada em `fontes.json`, teste de licença no pipeline, cache por ETag, User-Agent.
- [ ] Conferência local por amostragem dos números das respostas contra as tabelas dos livros de referência (relatório fora do Git; nada do livro é copiado).

## 6. Android (fase 6, depois de 3)
- [ ] Chave de upload (`secrets/upload-keystore.p12` + `keystore.properties`, fora do Git), `bundleRelease`, verificador de release (`tools/verificar_release.py` adaptado do app de eleições), teste em aparelho.
- [ ] Ícone: trocar o Erlenmeyer próprio por `brand/quimica-icon.svg`; revisar modo escuro; teste instrumentado mínimo.
- [ ] Paridade do NLU Android × site: `LocalNlu.kt` tem desvios conhecidos ("licenças" → FONTES, "explique o que é massa molar" → CONCEITO, tema sem artigo, ordem composto/quantidade); alinhar com `nlu.js` e cobrir no golden.
- [ ] Play: ficha, Data Safety (nada sai do aparelho além da atualização assinada; nuvem opt-in quando ligada), teste fechado.

## 7. Operação (fase 7)
- [ ] `docs/OPERACAO.md` (alertas, chaves de desligamento, ciclo de auto-melhoria) adaptado do app de eleições; captura opt-in de perguntas não entendidas com filtro de dado pessoal; painel noturno de qualidade do modelo.
- [ ] `CLAUDE.md` e este arquivo atualizados a cada mudança de estado.

## 8. Melhorias identificadas na revisão de 10/10/2026 (23h) — por impacto
Diagnóstico sobre o pacote e o dataset reais (números em `PROJECT_MEMORY.md` §6.d).

### 8.1 Dados (o que o estudante pergunta e o pacote ainda não tem)
- [ ] **Propriedades físicas dos compostos**: hoje só as 6 computadas do PubChem (xlogp, TPSA, H doadores/aceptores, ligações rotáveis, carga). Faltam **ponto de fusão/ebulição, densidade, solubilidade em água, estado físico a 25 °C, pKa/pKb, cor/odor**. Caminhos com licença ok: Wikidata (P2101 fusão, P2102 ebulição, P2054 densidade, P2177 solubilidade, P1117 pKa — CC0) e PubChem PUG View (`heading=Solubility`, `Dissociation+Constants`…) **filtrando por `LicenseNote` da referência** (HSDB/NIOSH/OSHA/EPA domínio público; DrugBank, Haz-Map, IUPAC pKa fora — ver `FONTES_E_LICENCAS.md` §7). Entra em `compostos[].propriedades` com `fontes` por valor e nos `regras.propriedades` do contrato (ids com unidade, como `pontoFusaoK`); regerar `template:composto.*` e a intenção PROPRIEDADE para compostos.
- [ ] **GHS só em 195/491** (harmonizado CLP). Completar com PubChem PUG View "GHS Classification" (notificações agregadas, com aviso "notificado, não harmonizado") para os outros ~300; marcar origem.
- [ ] **608 textos em inglês sem tradução** (`traducao: "pendente"`: ChEBI 373, Gutenberg 235). Tradução local em lote com o Qwen3-4B (job `pipeline/traduzir_textos.py`, cache por hash, campo `traducao: "automatica"`, revisão por amostragem) — o site já cai no original com aviso, mas a busca penaliza o inglês e as respostas de conceito ficam piores.
- [ ] **Tabelas de referência em `regras.json`** (fatos, com citação por valor): potenciais padrão de redução e Ka/pKa comuns (páginas de dados da Wikipédia + Wikidata P1117), `pKw` por temperatura, `incompatibilidades` (HSDB/NIOSH via PubChem; **CAMEO só link**). **Kps e entalpias de formação não têm fonte aberta estruturada** — compilar à mão de fontes múltiplas abertas, com citação. Cada tabela gera 1–3 famílias novas de perguntas e calculadoras (Nernst simples, pH de ácido fraco, solubilidade molar).
- [ ] **Elementos**: 118 com `afinidadeEletronicaKJmol` só em 57, `grupo` em 88 (lantanídeos/actinídeos sem grupo é correto), `pontoEbulicaoK` 93. Completar via Wikidata/CIAAW (pesos atômicos 2021; uso educacional) e **isótopos** (abundância P2374, semivida **P2114** — P2050 é envergadura) para perguntas de radioatividade.
- [ ] **Nomenclatura em português**: `nomeIupac` vem em inglês do PubChem (489). Gerar nome IUPAC em português por regra para as classes simples (óxidos, ácidos, sais, hidrocarbonetos até C10) e marcar `nomeIupacPt` com `geradoPor: regra`; onde a Wikipédia-pt dá o nome, usar o título.
- [ ] Agrupar `textos/<fonte>/*.json` em **lotes** como os compostos (1.786 arquivos → ~40): o deploy completo cai de ~1.930 para ~180 arquivos (a cota de 5.000/24 h é dividida com eleições), menos requisições no app; manter o id por texto no `index.json`.

### 8.2 Dataset (mais perguntas, e perguntas melhores)
- [ ] **Desbalanceamento**: 16.148 "fato" de template × 479 conceitos × 594 segurança × 419 recusas. Metas para a próxima geração: conceitos ≥ 2.000 (um por seção dos 1.178 textos em português já no pacote: "explique", "dê um exemplo", "qual a diferença entre X e Y", "por que"), segurança ≥ 1.500 (uma pergunta por frase H/P de cada composto com GHS + "o que fazer se…" via primeiros socorros de fonte pública), recusas ≥ 1.000 com paráfrases adversariais (gírias, erros de digitação, pedidos indiretos "para um trabalho da escola").
- [ ] **Perguntas de comparação e raciocínio** (hoje só `comparar_massa_molar`): "qual é mais eletronegativo", "qual tem maior ponto de ebulição e por quê", "ordene por reatividade", "qual é mais ácido" — ancoradas nas tabelas de 8.1.
- [ ] **Multi-turno** (o app de eleições já tem contexto de sequência): "e o do potássio?", "e em gramas?", "desenhe" após uma resposta; gerar 1.000 pares com histórico curto para o NLU (campo `contexto`).
- [ ] **Cálculos**: faltam diluição em série, mistura de soluções, titulação (ponto de equivalência), pH de ácido fraco (Ka), Kps→solubilidade, Lei de Hess, rendimento percentual com reagente limitante combinados, gases (mistura, Dalton), calorimetria (q = m·c·ΔT), meia-vida. Cada um = calculadora em `web/src/quimica/js/calc/` + Kotlin + gerador + teste de fidelidade numérica.
- [ ] **Desenho**: 970 pares só "mostre a estrutura". Acrescentar "desenhe o isômero…", "estrutura de Lewis de…" (gerar por regra para moléculas pequenas), "qual a geometria (VSEPR) de…", "quantas ligações pi"; verificar que o SmilesDrawer renderiza íons/aromáticos de todos os 491 SMILES (teste automático de render no E2E).
- [ ] **Variedade linguística**: 4.258 moldes de 3 palavras para 24 k pares — ampliar paráfrases (sem pontuação, erros comuns "acido", "molecula", maiúsculas, fórmulas com dígitos subscritos Unicode, nomes populares: soda cáustica, cal virgem, água oxigenada, bicarbonato) e perguntas "fora de escopo" com resposta de limite (física, biologia, dever de casa inteiro).
- [ ] **Revisão humana** dos 85 pares de segurança e amostra de conceitos (`revisadoPor`), antes de treinar.
- [ ] **Avaliação**: holdout por família + conjunto "perguntas reais" (capturadas opt-in quando o site estiver no ar) como no app de eleições; gate de alucinação numérica já existe (`eval_fidelidade.py`).

### 8.3 Produto e operação
- [ ] Cliente web/Android ainda **não chamam a API** (`/quimica/api/*` fica ocioso até a fase 5): quando ligar, copiar de eleições `cloud.js` (botão sempre após a resposta, contexto da sequência, `textoFalhaNuvem`) e `MelhoriaClient` (captura opt-in com filtro de dado pessoal; aqui sem filtro político, mas com filtro de **pedidos perigosos** — nunca capturar texto de síntese recusada).
- [ ] Deploy: se a cota da Vercel voltar a estourar, ligar o repositório ao projeto (Git integration) ou usar lotes de textos (8.1).
- [ ] Monitoramento: `data_freshness.yml` já alerta por idade (240 h); acrescentar alerta de **divergência de números** entre pacote novo e anterior (ex.: massa molar mudou > 0,5 %) antes de assinar.

## 9. Decisões pedidas ao mantenedor (10/10/2026, noite)
1. **LibreTexts *Química 1e/2e (OpenStax)* em português** rotulado CC BY 4.0 (edição de 2019, licença irrevogável) × decisão atual de respeitar a vontade da OpenStax (NC-SA + anti-IA nas edições novas). Usar ou manter só link? Hoje: só link.
2. **Monetização:** CIAAW, OpenStax, PhET e o plano Hobby da Vercel só valem para uso não comercial. Confirmar que o app segue gratuito e sem anúncios (hoje sim).
3. **Pedidos de permissão** (opcionais): OpenStax (formulário), SBQ para QNEsc, OMS/OIT para ICSC em português (ipcsmail@who.int), IUPAC para o Gold Book inteiro.

## Pendente com o mantenedor (resumo)
1. `VERCEL_TOKEN` (arquivo em `secrets/`).
2. Origem da chave `apikey-sabetudo.txt`.
3. Permissão da OpenStax (opcional).
4. Tokens do Modal e conta do Hugging Face quando o modelo estiver pronto; teto de gasto no Modal.
5. Chave de upload e conta da Play para o Android.
