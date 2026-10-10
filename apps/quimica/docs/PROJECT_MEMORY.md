# Memória do projeto — SaibaTudo Química

> **Atualizado em 10/10/2026, 17h30.** Feito para que outra pessoa, ou outra sessão de agente, continue o projeto sem contexto prévio. O que falta está em
> [`PENDENCIAS.md`](PENDENCIAS.md). Guia curto para agentes: [`../CLAUDE.md`](../CLAUDE.md). Arquitetura: [`ARCHITECTURE.md`](ARCHITECTURE.md). Contrato de dados:
> [`DATA_CONTRACT.md`](DATA_CONTRACT.md). Fontes e licenças: [`FONTES_E_LICENCAS.md`](FONTES_E_LICENCAS.md). Modelo: [`MODELO.md`](MODELO.md). Plano por fases: [`PLANO.md`](PLANO.md).

## 1. Em uma página

| Peça | Estado em 10/10/2026 |
| :-- | :-- |
| Repositório | `franciscoaleixoIOT/SaibaTudo-Quimica` (público, MIT). Pasta local `C:\Users\franc\AndroidStudioProjects\SaibaTudoQuimica`. Molde: `../SaibaTudoEleicao2026`. |
| Site/PWA | **v0 pronta, não publicada.** `web/` (109 testes; 4 pulados até existir o pacote real). Rota `/quimica/`. |
| App Android | **v0 pronta, não publicada.** `app/` (`net.saibatudo.quimica` 1.0.0, 92 testes, lint limpo, abre no emulador). Sem chave de upload ainda. |
| API e backend | **Prontos, desligados.** `api/` (168 testes), `backend/` (gates, conversão local, Space), `ai_model/` (treino). Nada treinado, nada implantado. |
| Pacote de dados | **Bloqueio atual.** `pipeline/` escrito; `data/quimica/` ainda vazio (agente de coleta parado há 1 h; pedido um pacote reduzido imediato). |
| Dataset | Gerador pronto (`dataset/`); 481 pares de conceito escritos à mão sobre textos licenciados, cobrindo os 65 temas de `dataset/topicos.json`. Os arquivos `dataset/qa` e `dataset/nlu` só valem depois de regenerados com o pacote real. Licença CC BY-SA 4.0. |
| Vercel | Projeto `saibatudo-quimica` criado e ligado (`.vercel/`). Nenhum deploy feito. Falta `VERCEL_TOKEN` no GitHub. |
| GitHub | Segredos `DATA_SIGNING_KEY`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` definidos. Workflows: `web_ci.yml`, `data_refresh.yml` (domingo 06:00 UTC), `data_freshness.yml`. |
| Home do saibatudo.net | Cartão e rotas `/quimica` → projeto novo **commitados localmente no repositório de eleições (commit 15e09db), não enviados**, para não publicar link quebrado. |
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
| Pipeline de dados | Sonnet | `pipeline/`, `data/quimica/` | **em andamento, sem pacote ainda** |
| Livros abertos | Sonnet | `pipeline/livros_abertos.json`, `FONTES_E_LICENCAS.md` §6 | em andamento |
| Orquestração | Fable | documentos, CI, repositório, Vercel, integração | — |

Lição: os agentes trabalharam em paralelo sobre o **contrato** (`DATA_CONTRACT.md`) e fixtures próprias, porque o pacote real atrasou. Resultado: três convenções de ids de propriedade (`pontoFusaoK` no modelo/dataset, `pontoFusao` no golden/Android, `ponto_fusao` em `pipeline/regras.py`) e o campo `composto` ora CID, ora texto. Unificar antes do treino (ver PENDENCIAS §2).

## 4. Processo de publicação (igual ao app de eleições, adaptado)
- Push na `main` **não** publica. `gh workflow run data_refresh.yml` reconstrói, assina e publica (precisa de `VERCEL_TOKEN`). Até lá: `node web/build.mjs && vercel deploy --prod --yes` na pasta do projeto.
- Conferir **todos** os workflows depois de cada push.
- Home do saibatudo.net: no repositório de eleições, enviar o commit 15e09db (`web/src/assets/apps.js` + `vercel.json`) e disparar o `data_refresh` de lá **só depois** de o site de química estar no ar.
- Android: `app/README.md` (chave de upload pelo mantenedor; `python app/tools/copiar_pacote_para_assets.py` embute o pacote real).
- Modelo: `docs/MODELO.md` (ciclo local completo; gates incluem segurança e fidelidade).

## 5. Testes (10/10/2026)
| Camada | Comando | Resultado |
| :-- | :-- | :-- |
| API | `cd api && npm test` | 168 |
| Site | `cd web && npm test` | 109 (4 pulados sem pacote real) |
| Pipeline | `python -m unittest discover -s pipeline/tests` | a confirmar após a entrega do agente |
| Dataset | `python -m unittest discover -s dataset -p "test_*.py"` | 65 (2 pulados) |
| Backend | `python -m unittest discover -s backend/modal -p "test_*.py"` e `-s backend/retrain` e `-s ai_model/scripts` | 115 + 25 + 18 |
| Ferramentas | `python -m unittest discover -s tools -p "test_*.py"`, `python tools/test_workflows.py` | verde |
| Android | `JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./gradlew.bat testDebugUnitTest lintDebug` | 92 |

## 6. Armadilhas já encontradas
- O pacote de dados é o gargalo: a coleta no PubChem respeita 4 req/s e ~2.000 compostos × (propriedades + GHS por PUG View) leva dezenas de minutos; o Gold Book respondeu 403 ao coletor.
- `python -m unittest discover -s dataset/tests` falha por import; usar `-s dataset -p "test_*.py"`.
- O site exige pacote assinado no build (`DATA_DIR=web/test/fixtures/data-quimica` para a fixture).
- SmilesDrawer precisou de 3 patches para a CSP (documentados em `web/src/quimica/vendor/VENDOR.md`) e de `img-src data:`.
- As mesmas armadilhas da máquina do app de eleições: `MSYS_NO_PATHCONV=1`, heredocs grandes, `wsl --shutdown`, suspensão durante treino.

## 7. Contas e segredos
Vercel `saibatudo-quimica` (time `franciscoaleixo-9696`); GitHub `franciscoaleixoIOT`; Hugging Face `franciscoaleixo` (PRO, 40 min/dia de ZeroGPU); Modal `franciscoaleixo/main` (US$ 30/mês grátis; já usados pelo app de eleições, ~US$ 5/mês).
`secrets/data_signing_key.pem` (nova, exclusiva deste app; pública em `pipeline/data_signing_public.pem`). Fazer backup offline. Nenhum outro segredo deste projeto existe ainda.
