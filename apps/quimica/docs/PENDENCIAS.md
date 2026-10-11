# Pendências — SaibaTudo Química

> **Em 10/10/2026, 21h30.** Ordem de execução recomendada. `[x]` = feito; `[~]` = feito em parte. Contexto completo em [`PROJECT_MEMORY.md`](PROJECT_MEMORY.md).

## 1. Pacote de dados (`data/quimica/`)
- [x] **Pacote real assinado com o núcleo completo da lista fixa** (491 compostos, 1787 textos): `python pipeline/build.py --alvo 491 --assinar-com secrets/data_signing_key.pem` (o build sem limite, alvo 2000, continua válido para ampliar depois). `Pacote válido: 20261010T234125Z-...`.
- [ ] (Opcional, depois) ampliar para o alvo de 2000 via seleção do Wikidata quando quiser cobrir mais compostos; regerar o dataset.
- [ ] Conferir `fontes.json` e `manifest.licencas` contra a seção 5 de `FONTES_E_LICENCAS.md` (nada de "CC BY 4.0" para OpenStax; Wikimedia e Gold Book CC BY-SA; ChEBI CC BY).
- [x] `python -m unittest discover -s pipeline/tests` (83, verde).

## 2. Integração (depende de 1)
- [x] **Unificar os ids de propriedade** (10/10/2026, 21h30): cliente (web + Android), modelo, golden e `regras.propriedades` usam o MESMO id = nome do campo do contrato com unidade (`pontoFusaoK`, `pontoEbulicaoK`, `densidadeKgm3`, `raioAtomicoPm`, `energiaIonizacaoKJmol`, `afinidadeEletronicaKJmol`). `PROPRIEDADE_CLIENTE` ficou vazio (proxy e nlu_core). Tocado em: `pipeline/regras.py`, `web/src/quimica/js/{propriedades,nlu}.js`, `app/.../{domain/Propriedades,ai/nlu/LocalNlu,ai/answer/AnswerBuilder}.kt`, `contracts/nlu_golden_cases.json`, fixtures (web + `app/tools/gerar_fixture_pacote.py`), `api/_lib/{vocab,normalize}.js`, `backend/modal/{nlu_core,eval_golden}.py`. **Novo teste de paridade:** `tools/test_vocab_paridade.py`.
- [ ] **Campo `composto`:** decidir (recomendado: o cliente resolve nome/fórmula → CID; o golden guarda o texto citado **e** o CID esperado; a nuvem devolve texto copiado da pergunta, nunca CID). O proxy já aceita CID mas o modelo emite `composto` como texto/número — falta fechar.
- [x] `python dataset/gerar_qa.py && python dataset/gerar_nlu.py && python dataset/gerar_amostra.py && python dataset/gerar_catalogo.py` com o pacote real; testes do dataset verdes (68). **Commitar `dataset/qa`, `dataset/nlu`, `dataset/CATALOGO.*`, `dataset/gerar_catalogo.py` e `pipeline/`** (hoje fora do Git) — ação do mantenedor.
- [x] `cd web && npm test` com o pacote real: **112/113** (1 pulado = E2E; 0 falhas). `node web/build.mjs` verde.
- [x] `cd api && npm test` (168, verde). Golden real do Android verde (145 casos).
- [ ] `python app/tools/copiar_pacote_para_assets.py` e `./gradlew.bat testDebugUnitTest lintDebug assembleRelease` com o pacote real (o fixture de teste já foi regerado).
- [ ] Consolidar `api/test/seguranca_cases_api.json` (~115 casos) em `contracts/seguranca_cases.json` e conferir os três `seguranca` (api, web, Android) contra o contrato unificado; incluir "escalar a produção de X" (o Android já pega).
- [ ] Aplicar no `vercel.json` deste projeto o rewrite `/quimica/api/:path*` → `/api/:path*` e `functions.api/health.js.includeFiles` (ver `api/README.md`); conferir que o rewrite do SPA não captura `/quimica/api/`.
- [ ] Revisão humana por amostragem dos 85 pares de segurança escritos à mão (`dataset/conceitos/12-seguranca-geral.jsonl`) e de ~50 conceitos; preencher `revisadoPor`.
- [ ] `tools/test_workflows.py` exige `bash` no PATH (valida a sintaxe dos passos dos workflows): roda no CI (Ubuntu); na máquina Windows falha por ambiente, não por código.

## 3. Primeiro deploy
- [ ] `node web/build.mjs && vercel deploy --prod --yes` (na pasta do projeto; CLI logada). Conferir `https://saibatudo-quimica.vercel.app/quimica/` e `/quimica/api/health`.
- [ ] No repositório de eleições: `git push origin main` do commit 15e09db (cartão + rotas) e `gh workflow run data_refresh.yml`; conferir `https://saibatudo.net/quimica/`.
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
- [ ] Incorporar os livros aprovados em `pipeline/livros_abertos.json` (agente de livros abertos) com um coletor `pipeline/coleta_livros_abertos.py` (PDF → trechos; `pypdf` em `requirements.txt`) e regerar conceitos por tema.
- [ ] Pedir permissão escrita à OpenStax (formulário https://riceuniversity.tfaforms.net/52) para Chemistry 2e e Química 2ed; se vier, pasta própria com licença NC-SA e dataset derivado separado.
- [ ] Gold Book: achar caminho permitido (API/`robots.txt`) ou manter só como link.
- [ ] Química Nova via SciELO: coletar resumos/artigos de ensino (CC BY) em `textos/quimica-nova/`.
- [ ] `regras.incompatibilidades` e `pKw` no pacote (o site hoje usa 14 a 25 °C e avisa).
- [ ] Conferência local por amostragem dos números das respostas contra as tabelas dos livros de referência (relatório fora do Git; nada do livro é copiado).

## 6. Android (fase 6, depois de 3)
- [ ] Chave de upload (`secrets/upload-keystore.p12` + `keystore.properties`, fora do Git), `bundleRelease`, verificador de release (`tools/verificar_release.py` adaptado do app de eleições), teste em aparelho.
- [ ] Ícone: trocar o Erlenmeyer próprio por `brand/quimica-icon.svg`; revisar modo escuro; teste instrumentado mínimo.
- [ ] Paridade do NLU Android × site: `LocalNlu.kt` tem desvios conhecidos ("licenças" → FONTES, "explique o que é massa molar" → CONCEITO, tema sem artigo, ordem composto/quantidade); alinhar com `nlu.js` e cobrir no golden.
- [ ] Play: ficha, Data Safety (nada sai do aparelho além da atualização assinada; nuvem opt-in quando ligada), teste fechado.

## 7. Operação (fase 7)
- [ ] `docs/OPERACAO.md` (alertas, chaves de desligamento, ciclo de auto-melhoria) adaptado do app de eleições; captura opt-in de perguntas não entendidas com filtro de dado pessoal; painel noturno de qualidade do modelo.
- [ ] `CLAUDE.md` e este arquivo atualizados a cada mudança de estado.

## Pendente com o mantenedor (resumo)
1. `VERCEL_TOKEN` (arquivo em `secrets/`).
1.b. Commitar o que está fora do Git: `pipeline/` (inteiro), `data/`, `dataset/qa`, `dataset/nlu`, `dataset/CATALOGO.md`, `dataset/CATALOGO.jsonl`, `dataset/gerar_catalogo.py` e as correções em `dataset/*.py` e `web/src/quimica/js/dicionario.js`.
2. Origem da chave `apikey-sabetudo.txt`.
3. Permissão da OpenStax (opcional).
4. Tokens do Modal e conta do Hugging Face quando o modelo estiver pronto; teto de gasto no Modal.
5. Chave de upload e conta da Play para o Android.
