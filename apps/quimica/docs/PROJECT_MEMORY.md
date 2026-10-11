# Memória do projeto — SaibaTudo Química

> **Atualizado em 10/10/2026, 23h (horário de Brasília).** Feito para que outra pessoa, ou outra sessão de agente, continue o projeto sem contexto prévio. O que falta está em
> [`PENDENCIAS.md`](PENDENCIAS.md). Guia curto para agentes: [`../CLAUDE.md`](../CLAUDE.md). Arquitetura: [`ARCHITECTURE.md`](ARCHITECTURE.md). Contrato de dados:
> [`DATA_CONTRACT.md`](DATA_CONTRACT.md). Fontes e licenças: [`FONTES_E_LICENCAS.md`](FONTES_E_LICENCAS.md). Modelo: [`MODELO.md`](MODELO.md). Plano por fases: [`PLANO.md`](PLANO.md).

## 1. Em uma página

| Peça | Estado em 10/10/2026 |
| :-- | :-- |
| Repositório | `franciscoaleixoIOT/SaibaTudo` (público, MIT). Pasta local `C:\Users\franc\AndroidStudioProjects\SaibaTudoQuimica`. Molde: `../SaibaTudoEleicao2026`. |
| Site/PWA | **No ar desde 10/10/2026 ~22h25:** https://saibatudo.net/quimica/ (proxy da home) e https://saibatudo-quimica.vercel.app/quimica/. Conferido ao vivo: assinatura do manifesto válida, 43 arquivos de dados batem com o SHA-256, rotas internas, API (`/quimica/api/health`; `nlu`/`ask` desligados → 503 `disabled`). `web/` com 114 testes (113 passam, 1 pulado — E2E que exige navegador real). |
| App Android | **v0 pronta, não publicada.** `app/` (`net.saibatudo.quimica` 1.0.0, 92 testes verdes, lint limpo, abre no emulador). Sem chave de upload ainda. |
| API e backend | **Prontos, desligados.** `api/` (168 testes), `backend/` (gates, conversão local, Space), `ai_model/` (treino). Nada treinado, nada implantado. |
| Pacote de dados | **Pacote real assinado com o núcleo completo da lista fixa: 491 compostos e 1787 textos** (`data/quimica/`). O alvo de 2000 (seleção do Wikidata) fica para depois. |
| Dataset | **Regerado sobre o pacote REAL** (`fonteDados: "real"`): **24.023 pares** (elementos 7.019, compostos 8.759, cálculos 4.039, nomenclatura 1.374, desenho 970, segurança 594, conceitos 479, recusas 419, regras 370) e 65/65 temas cobertos; NLU com 18.206 exemplos. **Catálogo completo** em `dataset/CATALOGO.md` + `dataset/CATALOGO.jsonl` (`gerar_catalogo.py`). Licença CC BY-SA 4.0. |
| Vercel | Projeto `saibatudo-quimica`. Publicado pela CLI na pasta do projeto (`vercel deploy --prod --yes`; o build roda na Vercel). Publicado com o **trial do Pro** (cota 40.000 uploads/24 h); no Hobby a cota é 5.000/24 h **dividida com eleições** — conferir antes com `python tools/vercel_cota.py --minimo N`. A 1ª tentativa (10/10 ~21h20, sem `.vercelignore`) gastou ~4.400 uploads e enviou `secrets/sumarios_livros.json` ao armazenamento da Vercel (ver §6.d). Falta `VERCEL_TOKEN` no GitHub: sem ele o `data_refresh` semanal gera o pacote e NÃO publica. |
| GitHub | Segredos `DATA_SIGNING_KEY`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` definidos. Workflows: `quimica-web-ci.yml`, `quimica-data-refresh.yml` (domingo 06:00 UTC), `quimica-data-freshness.yml`. |
| Home do saibatudo.net | **Cartão publicado** (eleições 3d5ffa9 e 01fb70e): regras de proxy `/quimica`, `/quimica/` e `/quimica/:path*` → `saibatudo-quimica.vercel.app`; o service worker da home não intercepta `/quimica/`; texto do cartão com as fontes reais (PubChem, Wikidata, CODATA, ChEBI, Wikipédia, Wikilivros). |
| Modelo de IA | Decidido: explicador Qwen3-4B-Instruct-2507 (QLoRA local), interpretação Qwen2.5-1.5B (GGUF no Modal CPU), serviço no ZeroGPU do HF com Modal de reserva. **Não treinado.** |

## 2. Decisões do mantenedor e do orquestrador (com data)

| Data | Decisão |
| :-- | :-- |
| 10/10 | Mesmo padrão do app de eleições: local-first, sem anúncios, código MIT, dados assinados, IA que explica mas não fornece número. |
| 10/10 | **Os livros da pasta `../SaibaTudoEleicao2026/LivrosQuimica` (24 obras comerciais de origem não autorizada) não entram no repositório, no dataset nem no modelo.** Uso permitido: leitura de referência de quem revisa, sumários como mapa de temas (ideias), conferência local de números por amostragem. O mantenedor pediu mais de uma vez para treinar com eles; a resposta foi não, com a explicação (obra derivada publicada; ganho quase nulo numa arquitetura em que números vêm dos dados). Só o Faraday (Gutenberg) e os fatos do Green Book são usados. |
| 10/10 | **Política de licenças (seção 5 de FONTES_E_LICENCAS):** entram domínio público, CC0, CC BY e CC BY-SA; ficam fora NC, ND, cláusulas contra IA e fontes que proíbem coleta. Dataset derivado publicado como CC BY-SA 4.0. |
| 10/10 | OpenStax Chemistry 2e é CC BY-NC-SA com cláusula explícita contra uso em IA (lido na página do livro). Só link até permissão escrita (formulário https://riceuniversity.tfaforms.net/52). A página openstax.org/ai não é autorização. |
| 10/10 | Fichas ICSC da OIT: sem licença de reuso; viram link por CAS. NIST WebBook: `ai-train=no`, só link. LibreTexts: API bloqueada por robots, fora por ora. ENEM/INEP e Química Nova na Escola: ND, só link. |
| 10/10 | Entram como texto: Wikipédia e Wikibooks PT (CC BY-SA), IUPAC Gold Book (CC BY-SA), ChEBI (CC BY), Química Nova/JBCS/Polímeros via SciELO (CC BY), Faraday (DP). Livros CC BY/BY-SA de universidades: agente verificando obra a obra. |
| 10/10 | PubChem: só campos calculados pelo NLM; GHS apenas da classificação harmonizada da UE (CLP Anexo VI); frases H em PT do EUR-Lex. |
| 10/10 | Recusa por regra, antes de qualquer modelo, de síntese/purificação/escalonamento de explosivos, armas químicas e drogas (`seguranca.js`/`Seguranca.kt`/`api/_lib/seguranca.js`, contrato `contracts/seguranca_cases.json`, 137 casos). Perguntas legítimas de segurança são respondidas. |
| 10/10 | Cadência: dados semanais (domingo), modelo mensal; treino e conversão sempre locais; HF publicação principal, Modal reserva. |
| 10/10 | O site de química é um projeto Vercel próprio exposto em `saibatudo.net/quimica/` por rewrite do projeto de eleições (um só site para o usuário). |
| 10/10 | Segredos vão em arquivo dentro de `secrets/` (ignorado), nunca no chat. Chave `apikey-sabetudo.txt` encontrada solta na pasta de livros foi movida para `../SaibaTudoEleicao2026/secrets/`; serviço desconhecido. |

## 3. Como o trabalho foi dividido (agentes, 10/10/2026)

| Agente | Modelo | Entrega | Estado |
| :-- | :-- | :-- | :-- |
| Licenças | Sonnet | `FONTES_E_LICENCAS.md` §1 e §4 (30 fontes verificadas nos termos) | concluído |
| Backend/API | Sonnet | `api/`, `backend/`, `ai_model/`, `MODELO.md` | concluído, 168 + 158 testes |
| Android | Sonnet | `app/` | concluído, 92 testes |
| Site/PWA | Sonnet | `web/`, `vercel.json`, `brand/` | concluído, 109 testes |
| Dataset | Sonnet | `dataset/` | concluído sobre pacote parcial |
| Pipeline de dados | Sonnet | `pipeline/`, `data/quimica/` | pacote real REDUZIDO (300 compostos) coletado, assinado; núcleo completo (490) pendente do 429 do PubChem |
| Livros abertos | Sonnet | `pipeline/livros_abertos.json`, `FONTES_E_LICENCAS.md` §6 | em andamento |
| Orquestração | Fable | documentos, CI, repositório, Vercel, integração | — |

Lição: os agentes trabalharam em paralelo sobre o **contrato** (`DATA_CONTRACT.md`) e fixtures próprias, porque o pacote real atrasou. Resultado: três convenções de ids de propriedade (`pontoFusaoK` no modelo/dataset, `pontoFusao` no golden/Android, `ponto_fusao` em `pipeline/regras.py`) e o campo `composto` ora CID, ora texto. Unificar antes do treino (ver PENDENCIAS §2).

## 4. Processo de publicação (igual ao app de eleições, adaptado)
- Push na `main` **não** publica. `gh workflow run quimica-data-refresh.yml` reconstrói, assina e publica (precisa de `VERCEL_TOKEN`). Até lá: `node web/build.mjs && vercel deploy --prod --yes` na pasta do projeto.
- Conferir **todos** os workflows depois de cada push.
- Home do saibatudo.net: no repositório de eleições, enviar o commit 15e09db (`web/src/assets/apps.js` + `vercel.json`) e disparar o `data_refresh` de lá **só depois** de o site de química estar no ar.
- Android: `app/README.md` (chave de upload pelo mantenedor; `python app/tools/copiar_pacote_para_assets.py` embute o pacote real).
- Modelo: `docs/MODELO.md` (ciclo local completo; gates incluem segurança e fidelidade).

## 5. Testes (10/10/2026, 21h30)
| Camada | Comando | Resultado |
| :-- | :-- | :-- |
| API | `cd api && npm test` | 168 |
| Site | `cd web && npm test` | 113 (112 passam, 1 pulado — E2E opcional; golden real verde) |
| Pipeline | `python -m unittest discover -s pipeline/tests` | 83 (verde) |
| Dataset | `python -m unittest discover -s dataset -p "test_*.py"` | 68 (verde, inclui o catálogo) |
| Backend | `python -m unittest discover -s backend/modal -p "test_*.py"` e `-s backend/retrain` e `-s ai_model/scripts` | 115 + 25 + 18 |
| Ferramentas | `python -m unittest discover -s tools -p "test_*.py"` | paridade dos vocabulários (5) verde; `tools/test_workflows.py` precisa de `bash` (valida workflows, roda no CI) |
| Android | `JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./gradlew.bat :app:testDebugUnitTest :app:lintDebug` | 92 (verde, golden real 145 casos) |
| Build web | `cd web && node build.mjs` | verde com o pacote real assinado (dist ~5 MB) |

## 6. Armadilhas já encontradas
- O pacote de dados é o gargalo: a coleta no PubChem respeita 4 req/s e ~2.000 compostos × (propriedades + GHS por PUG View) leva dezenas de minutos; o Gold Book respondeu 403 ao coletor.
- `python -m unittest discover -s dataset/tests` falha por import; usar `-s dataset -p "test_*.py"`.
- O site exige pacote assinado no build (`DATA_DIR=web/test/fixtures/data-quimica` para a fixture).
- SmilesDrawer precisou de 3 patches para a CSP (documentados em `web/src/quimica/vendor/VENDOR.md`) e de `img-src data:`.
- As mesmas armadilhas da máquina do app de eleições: `MSYS_NO_PATHCONV=1`, heredocs grandes, `wsl --shutdown`, suspensão durante treino.
- **PubChem 429:** depois de vários builds o IP fica bloqueado (429 até em 1 requisição, com backoff crescente). O build **reduzido** (`--limite-compostos 300`) roda do cache em segundos; o build do núcleo completo/2000 depende do PubChem liberar.
- **Índice real do pipeline só tem chaves normalizadas** (`index.json` = `porCid`/`nomes`/`lotes`; `nomes` = pares `[chave, cid]`), sem nome/fórmula de exibição. O `Dicionario` do site casava essas chaves como se fossem nomes e a chave `oxigenio` (O2) vencia o elemento O. Corrigido: chave de composto igual a nome de elemento é ignorada (o elemento ganha; a forma molecular segue por "gás X", "O2").
- **`numeros_do_texto` apagava trechos literais como substring cega**: remover o sinônimo `H2` de dentro de `H220`/`GHS02` expunha `20`/`02` falsos. Agora a remoção respeita limites de palavra (`(?<![\w])... (?![\w])`).
- **pH inverso com 1 casa decimal**: concentração com 1 algarismo significativo pode desviar ~33 %; o limite do teste era 12 %. Ajustado para 34 % (só para `sf==1`).
- **Aproximação por erro de digitação** casava função gramatical com químico ("sobre" → "cobre", "ácido fraco" → "ácido úrico"). Agora pula palavras funcionais e frases de 2+ palavras só aproximam com 1 edição.

- **CLI da Vercel não lê o `.gitignore`** (só `.vercelignore` + uma lista padrão: `.git`, `node_modules`, `.cache`, `.vercel`…): sem `.vercelignore`, `secrets/`, `app/build` etc. sobem. Padrão sem `/` inicial vale em qualquer pasta. **A cota de uploads (5.000/24 h no Hobby) é da conta: eleições e química dividem.** Medir antes: `python tools/vercel_cota.py --minimo N`.

- **Vercel com `cleanUrls: true`:** rewrite para `/…/index.html` dá 404 (o caminho com `.html` some para as regras); o destino do SPA tem de ser `/quimica/`. O mesmo erro existia em eleições desde o início (recarregar qualquer tela dava 404) e foi corrigido em 10/10. **Barra final é literal nas regras:** `/quimica` não casa com `/quimica/` e `/quimica/:path*` exige algo depois da barra. **Pelo proxy, a CSP que vale é a da home** (hoje compatível). A versão no `/health` é o commit no momento do deploy pela CLI: commitar antes de publicar (o deploy de 10/10 mostra `fff8696`, mas o código é o de `7dd7a3b`).

## 6.b O que esta sessão (10/10/2026, 21h30) fez
- Revisou o estado: pipeline/dataset/site/Android prontos; só faltava o pacote. Interfaces `dataset/pacote.py` × `data/quimica/ghs_frases.json` estavam incompatíveis (o leitor iterava chaves de metadados) — corrigido.
- Construiu o **pacote real reduzido** (300 compostos, textos completos, assinado) e o **regerou o dataset real** (19.254 pares).
- Recuperou **446 pares de conceito** que caíam por id ausente, acrescentando 7 títulos da Wikipédia (`coleta_wikimedia.FIXOS_CONCEITOS`): Sólido, Solução aquosa, Reação ácido–base, Reação de Bosch, Dispersão de Rayleigh, Açúcar redutor, Ânion enolato. Restam 2 pares fora (artigo "Absorção física" não existe).
- Criou o **catálogo completo** (`dataset/gerar_catalogo.py`, `CATALOGO.md`, `CATALOGO.jsonl`) e seu teste.
- Corrigiu bugs reais do NLU do site e do gerador (elemento vs. composto, remoção de literais, tolerância do pH inverso, aproximação). O golden real caiu de 24 para 2 falhas — as 2 restantes são compostos (glicose, fosgênio) fora do núcleo reduzido.

- **PubChem, quando libera, exige `--alvo ~491` (lista fixa)** para não travar: o alvo 2000 dispara 429 e o backoff (até ~5 min por composto) pode levar horas. O núcleo da lista fixa cobre currículo + golden.
- **Mesmos bugs nos dois clientes:** o Android `Dicionario.kt` repetia os desvios do site (nome de elemento virando composto, "fontes"→"Fontex", "ácido fraco"→"ácido úrico"). Corrigido por port; o golden real do Android caía de 20 desvios para 0.
- **Editar fixture do app sem regerar o manifesto quebra o `BundleLoader`** (checksum): sempre rodar `python app/tools/gerar_fixture_pacote.py` depois de mexer em `app/src/test/resources/data-quimica/`.

## 6.c O que a continuação (10/10/2026, 23h30) fez
- PubChem liberou; construiu o **pacote do núcleo completo** (491 compostos, 1787 textos, assinado) com `--alvo 491` (o alvo 2000 travava em 429).
- Regerou dataset e catálogo: **24.023 pares**, NLU 18.206 exemplos. Corrigiu 2 regressões do pacote maior (excluir compostos com massa molar divergente do PubChem — ex.: água deuterada — dos cálculos de passo; e não escanear decimais dentro do nome IUPAC). Recuperou o golden de glicose e fosgênio (web 112/113, 0 falhas).
- **Unificou os ids de propriedade** (era o maior item da §2): cliente web+Android, modelo, golden e `regras.propriedades` agora usam o mesmo id (nome do campo com unidade). Ponte `PROPRIEDADE_CLIENTE` esvaziada. Novo `tools/test_vocab_paridade.py` (web × Android × modelo × pipeline). Suítes: pipeline 83, dataset 68, web 112/113, api 168, backend 115+25, Android 92 (golden real 145 casos).

## 6.d O que a revisão final (10/10/2026, 21h–22h30) fez
- Rerodou todas as suítes com o pacote completo e **commitou e enviou tudo o que estava fora do Git**: `af68d02` (3.779 arquivos: `pipeline/`, `data/`, `dataset/qa|nlu|CATALOGO.*`, assets Android reais). **CI do repositório ficou verde pela primeira vez** (as 2 execuções anteriores falhavam por falta do pacote).
- Android: `copiar_pacote_para_assets.py` (1.795 arquivos, 9,4 MB) + `testDebugUnitTest lintDebug assembleRelease` verdes (APK release sem assinatura, 3,7 MB).
- `vercel.json`: rewrite `/quimica/api/:path*` → `/api/:path*` **antes** do SPA; SPA agora é `/quimica/:path((?!api/)(?!.*\.).*)`; `functions.api/health.js.includeFiles`; teste do `build.test.mjs` cobre as três coisas. `.vercelignore` igual ao do app de eleições + `dataset/`, `pipeline/`, `contracts/`, `brand/`, `tools/`. Commit `5963a1f`.
- **Deploy bloqueado** pela cota de upload (ver tabela da §1). O cartão da home (eleições, 15e09db) continua sem push até o site responder.
- **Teste de envio (22h)**: sonda de 1 arquivo aceita (HTTP 200, 123 livres de 5.000); consulta à API sem enviar nada (lista com um arquivo fictício → resposta `missing_files`, nenhum deploy criado) mostrou 1.060 arquivos faltando. **Não publicado para não esgotar a cota dos deploys de eleições.**
- **O 1º `.vercelignore` quebraria o build remoto** (`tools/` sem barra inicial apagava `web/tools/minify.mjs`; `pipeline/` apagava a chave pública; `brand/` os ícones). Corrigido com padrões ancorados na raiz e exceções; build remoto **simulado só com os 1.928 arquivos que sobem: verde**; teste novo em `web/test/build.test.mjs`; ferramenta `tools/vercel_cota.py` (+ teste).
- **Incidente:** a tentativa sem `.vercelignore` enviou `secrets/sumarios_livros.json` (sumários dos livros de referência, 58 KB) ao armazenamento da Vercel. Arquivos enviados ficam no CDN da Vercel acessíveis **só por quem souber o SHA-1 do conteúdo** (não estão em nenhum deploy). **A chave privada `data_signing_key.pem` NÃO subiu** (HEAD pelo SHA-1 → 403, igual a um hash aleatório de controle). Não há API conhecida para apagar o arquivo enviado.
- Dois agentes de pesquisa web (Sonnet) verificaram **livros abertos** (`FONTES_E_LICENCAS.md` §6: entram UNILA ×2, USP 1584/625/1010, eduCAPES 203562, Wikiversidade por dump, Química Nova ≥ 39-9; QNEsc/NIST/Khan só link; Gold Book em conflito; LibreTexts-OpenStax em português CC BY 4.0 = decisão do mantenedor) e **fontes estruturadas** (§7: Wikidata P1117/P2177/P2054/P2101/P2114, PubChem PUG View com lista branca de `LicenseNote`, CODATA 2022, páginas de dados da Wikipédia, Nobel API, listas PF/Anvisa, Commons, CIAAW; **CAMEO não é domínio público — só link**; Kps e ΔHf sem fonte aberta). Tudo em `PENDENCIAS.md` §5, §8 e §9.
- Diagnóstico para a análise de melhorias (ver `PENDENCIAS.md` §8): dos 1.787 textos, **608 estão em inglês com `traducao: "pendente"` e `textoPt` vazio** (ChEBI 373 — definições de ~120 caracteres —, Gutenberg 235); o site cai no original com aviso e penaliza na busca. Compostos só têm 6 propriedades (PubChem computadas: xlogp, TPSA, H doadores/aceptores, ligações rotáveis, carga) — **sem ponto de fusão/ebulição, densidade, solubilidade, pKa, estado físico**; só 195/491 têm GHS. Dataset: 16.148 "fato" de template contra 479 conceitos e 594 segurança; NLU com 21 intenções (PROPRIEDADE 3.098 … SOBRE_DADOS 105).

## 7. Contas e segredos
Vercel `saibatudo-quimica` (time `franciscoaleixo-9696`); GitHub `franciscoaleixoIOT`; Hugging Face `franciscoaleixo` (PRO, 40 min/dia de ZeroGPU); Modal `franciscoaleixo/main` (US$ 30/mês grátis; já usados pelo app de eleições, ~US$ 5/mês).
`secrets/data_signing_key.pem` (nova, exclusiva deste app; pública em `pipeline/data_signing_public.pem`). Fazer backup offline. Nenhum outro segredo deste projeto existe ainda.
