# Memória do projeto — SaibaTudo Eleições 2026

> Registro operacional e de decisões. **Atualizado em 01/10/2026** (3 dias antes do 1º turno). Para o plano completo veja
> [`PLANO_PRODUCAO.md`](PLANO_PRODUCAO.md); para o contrato de dados, [`DATA_CONTRACT.md`](DATA_CONTRACT.md).

## Identidade e contas
| Item | Valor |
| :-- | :-- |
| Nome | SaibaTudo Eleições 2026 (repositório `SaibaTudo-Eleicao2026`; ecossistema SaibaTudo.Net) |
| Pacote Android | `net.saibatudo.eleicoes2026` (antes `com.example.saibatudo_eleicao2026`) |
| Domínio | `saibatudo.net` (Vercel, plano Hobby — uso **não comercial**) |
| Repositório | <https://github.com/franciscoaleixoIOT/SaibaTudo-Eleicao2026> (MIT) |
| Modelo (HF) | `franciscoaleixo/SaibaTudo-Eleicao2026` (Qwen2.5-1.5B + LoRA; NLU, formato v2 legado) |
| Equipe | Francisco Aleixo (mantenedor), Cauã Francisco (@Cacx01 — conta do Play Console) |
| Play Console | conta de Cauã; tipo/data **a confirmar** (define teste fechado de 12 testadores × 14 dias) |

## Estado em 06/10/2026 (após o 1º turno)
Ver [`OPERACAO.md`](OPERACAO.md) (documento de estado atual). Resumo do que mudou desde 03/10:
- **Incidente 05/10 16:49 UTC a 06/10 02:23 UTC:** `data_refresh` falhou 18 vezes seguidas porque dois testes web assumiam "ninguém eleito"; os resultados do 1º turno só chegaram à produção às 02:26 UTC. Correção: testes seguem `manifest.resultadosDisponiveis`; o workflow separa integridade (bloqueante) de comportamento (informativo); alerta `data_freshness.yml`.
- **`/api/ask` (Qwen 7B, texto gerado) desligado por padrão**: exige `ASK_ENABLED=1` + `MODAL_ASK_ENDPOINT` explícito; o manifesto assinado traz `cliente.ask.enabled=false` e os clientes escondem o botão. Respostas passam por `api/_lib/neutralidade.js` (recomendação, contradição do 2º turno, números sem fonte); texto rotulado "pode conter erros".
- **Gate do modelo endurecido**: todos os limiares bloqueiam. Medido sobre os 111 casos do contrato, o `v2.1-20261003` em produção tem **intenção 78,4 %** (os 87,1 % eram sobre 93 casos) e seria reprovado; as falhas estão em REGRAS_URNA/LOCAL_VOTACAO, que o NLU local resolve. Retreino v2.2 pendente (fora do congelamento).
- **Holdout**: `contracts/nlu_real_cases.json` (vazio, só perguntas reais revisadas) + balde estável sha256 % 100 (20 %) idêntico em Python e JS; extras `origem=falhas_golden` são recusados.
- **Operação**: build atômico do pacote, cron a cada 30 min, snapshot versionado diário, contadores globais opcionais (Upstash), guarda de congelamento de 24 a 26/10.
- **Lições**: (1) teste de hipótese de fase não pode bloquear publicação de dados; (2) `\u0000` em heredoc/Python pela ferramenta de shell vira byte nulo: escreva blocos com Write e use `chr()`; (3) o gate documentado não era o gate implementado.

## Estado em 01/10/2026
- **Dados:** pipeline reprodutível (`pipeline/`), snapshot oficial `data/eleicoes2026` (extração TSE 01/10/2026 12:31): 20.988 candidaturas (19.919 na urna), 3.457 pesquisas, bens, prestação de contas (19.166), planos (219 com PDF), fotos de majoritários; manifesto assinado ECDSA.
- **App Android:** reescrito (MVVM, DataStore, WorkManager), release R8 de ~8 MB assinado com chave de upload; 39 testes unitários + 4 instrumentados passam; lint limpo.
- **IA:** local-first (NLU por regras + respostas dos dados); nuvem opcional (opt-in) via `/api/nlu` → Modal (CPU, llama.cpp) — **código pronto, não implantado** (precisa de contas/credenciais).
- **Site/PWA e API:** construídos em `web/`, `api/`, `backend/` (ver relatórios abaixo); **não implantados** (precisa da Vercel/Modal do usuário).
- **Play Store:** materiais prontos (`store/play`, `docs/PLAY_STORE.md`); envio é manual.

## Publicação (02/10/2026, madrugada)
- **Vercel:** projeto `saibatudo` (time `franciscoaleixo-9696`), produção em <https://saibatudo.vercel.app>; domínios
  `saibatudo.net` e `www.saibatudo.net` adicionados — falta o DNS no GoDaddy (`A @` e `A www` → `76.76.21.21`; NS atuais
  `domaincontrol.com`). Firewall: regra "Limite da API" 60 req/min por IP em `/api/*`. `.vercelignore` precisa manter
  `web/tools/minify.mjs` e `brand/fonts/` (usados pelo build).
- **GitHub (segredos):** `DATA_SIGNING_KEY`, `UPLOAD_KEYSTORE_B64`, `UPLOAD_KEYSTORE_PASSWORD`, `VERCEL_ORG_ID`,
  `VERCEL_PROJECT_ID` configurados; **`VERCEL_TOKEN` falta** (a API da Vercel não deixa a credencial da CLI criar token: gerar em
  vercel.com/account/tokens). Sem ele, `data_refresh` gera e assina mas não publica (aviso no resumo). Rótulo `relato-ia` criado.
- **Modal:** imagem compila `llama-cpp-python` do código-fonte (a wheel "cpu" do índice é musl e não carrega no Debian).
  Teto de gasto do workspace só pelo painel (Settings → Usage & Billing).
- **Relatos (`/api/report`):** desligados até criar um token *fine-grained* do GitHub só com `Issues: write` (`GITHUB_TOKEN` na Vercel).

## Decisões-chave (e por quê)
1. **Ficha Limpa só derivada da situação oficial.** O cálculo antigo marcava renunciados/falecidos/pendentes como "inelegíveis" e chamava "processos administrativos" a contagem de motivos de indeferimento. Agora: situação oficial do julgamento + motivos; campo `naUrna` distingue 1.069 registros fora da urna (ex.: Pablo Marçal, indeferido). Após o teste no celular (01/10), o usuário pediu a Ficha Limpa visível: ela é **derivada e rotulada** (deferido = sem impedimento; indeferido com motivo "Inelegibilidade infraconstitucional (LC 64/90)" = inelegível), regra em `DATA_CONTRACT.md` §3.1.
2. **Reeleição:** `ST_REELEICAO` vem `#NE` em 2026; usamos "já eleito para este cargo (histórico TSE)" rotulado como derivado.
3. **IA interpreta, dados respondem; sem recomendação.** Res. TSE 23.755/2026 proíbe IAs de ranquear/recomendar candidaturas. Listas em ordem fixa; recusa de "em quem votar".
4. **Local-first + nuvem opt-in.** Reduz custo (Modal CPU, créditos gratuitos), risco de abuso e superfície de privacidade. Sem chave de IA no APK.
5. **Sem anúncios, sem analytics; localização só no aparelho.** A pedido do usuário (01/10), a UF vem **sugerida pela localização aproximada** (permissão COARSE, malha do IBGE embutida em `data/geo/ufs.json`, ponto-no-polígono no aparelho; casos em `contracts/geo_cases.json`); nada é enviado, só a sigla escolhida é guardada; Vercel Hobby é não comercial; Google Ads veta conteúdo de candidatos.
6. **Dados assinados e atualizáveis sem nova versão do app** (ECDSA P-256; chave privada só no CI/local; **perder a chave = novo app**). `.gitattributes` impede conversão de EOL no pacote.
7. **Resultados:** apuração ao vivo direto do TSE (`-u.json`, CORS aberto; ≤100 req/IP/s; cache 60 s; **muitos 404 bloqueiam o IP ~10 min — não sondar agressivamente**); CSV oficiais (`votacao_candidato_munzona`) aparecem como arquivo de 1 byte até a apuração e são tratados como "ainda não publicado". `DS_SIT_TOT_TURNO` vem em maiúsculas após a eleição.
8. **PWA como canal principal em outubro:** a Play não publica antes do 1º turno (e, com conta pessoal nova, nem antes do 2º).
9. **Modal em CPU (GGUF Q4) atrás de proxy Vercel**; GPU e Inference Endpoints do HF descartados por custo; HF Pro deixa de ser necessário para este fluxo.

## Armadilhas conhecidas
- **R8 + WorkManager/Room:** o release quebrava (`WorkDatabase` removido) — regras em `app/src/main/keepRules/rules.keep`. **Sempre teste o release em dispositivo.**
- **Git Bash no Windows converte `/sdcard/...` em caminho do Git** (`MSYS_NO_PATHCONV=1`); a cwd dentro de pastas a renomear trava `git mv`.
- **WDAC** bloqueia `_lzma.pyd`/extensões C no Python do projeto: pipeline usa só Python puro (`pypdf`, `ecdsa`); `ai_model/.venv/.../sitecustomize.py` contorna `lzma` no treino.
- **Akamai/WAF** bloqueia `divulgacandcontas`, `www.tse.jus.br` e TREs para clientes simples; a CDN `cdn.tse.jus.br` e `resultados.tse.jus.br` respondem normalmente (User-Agent de navegador).
- Fotos: o CDN de resultados serve `…/fotos/<uf>/<sq>.jpeg` para todas as candidaturas **com foto** (`temFoto`); pedir fotos inexistentes gera 404 em massa.
- Emulador: não é possível alterar a data do sistema (para testar fases use testes de unidade/instrumentados com `hoje` injetado).
- **Campos de texto no Compose:** nunca alimentar `value` de um `TextField` por `StateFlow` coletado ou DataStore (atualização assíncrona) — em teclados reais (Xiaomi/Gboard) o cursor volta e as letras saem fora de ordem. Use `mutableStateOf` (síncrono).
- **Xiaomi/HyperOS:** `adb shell input` exige "Depuração USB (Configurações de segurança)"; sem isso só dá para instalar e capturar tela.
- **Toda sugestão exibida precisa ser respondível:** `PerguntasReaisTest` percorre as sugestões (2 níveis) e falha se alguma cair em "não entendi".

## Segredos e backups (nunca no Git)
`secrets/upload-keystore.p12` + `keystore.properties` (chave de **upload** do Play), `secrets/data_signing_key.pem` (assinatura dos **dados**; chave pública em `pipeline/data_signing_public.pem`). Faça backup offline.
Segredos de CI/Vercel/Modal listados em [`PLANO_PRODUCAO.md`](PLANO_PRODUCAO.md) §5 e [`BACKEND.md`](BACKEND.md).

## Histórico resumido
- 30/09/2026 — primeira versão com dados do TSE (30/09), modelo Qwen2.5-1.5B publicado no HF.
- 01/10/2026 — **auditoria e produção**: pipeline v2, correções de semântica, novo app (pacote `net.saibatudo.eleicoes2026`), atualização assinada, resultados ao vivo, prestação de contas, identidade visual, CI, site/PWA, backend de IA, documentação e materiais da Play. Commits `c660903` → `e89a8d6` (e seguintes).
- 01/10/2026 (noite) — **correções do teste no celular**: cursor/travamento nos campos de texto, perguntas não entendidas (número de urna, vice, plano de governo, contas, voto branco/nulo, saudações, simulador pelas sugestões), Ficha Limpa derivada e visível, respostas em linhas/tópicos. Contrato de NLU v2 (74 casos).
- 02/10/2026 — **NLU: fim dos perfis falsos** (nomes de urna que são palavras comuns: TRANSPORTE, SAUDE, FAVORITO, CONTRA, SOCIAL…): `resolverNome` em 3 modos (indício de pessoa / só o nome / sem indício exige 2+ palavras e remove temas), `RX_CUE_FALSO`, `RECOMENDACAO` ampliada (favorito, chances, próximo presidente, virada, rejeição — Res. 23.755/2026) e cobertura nova (urna segura, voto impresso, cabine/celular, mesário, voto em trânsito, biometria, quem fiscaliza, fake news/denúncia). Contrato 74 → **93 casos**. **Pipeline de perguntas externas**: `backend/retrain/label_extra.mjs` (o rótulo sai do NLU dos clientes sobre o pacote oficial e só vale se for ponto fixo do normalizador), `colher_relatos.mjs` (relatos públicos, exige `--confirmar-finalidade` por LGPD) e `--extra/--extra-max-pct` no gerador com proveniência/licença. **Fontes oficiais**: 3 links mortos trocados (Senado, MPF, AGU), 12 anomalias de URL sanadas (`?session=`, `http://`, `/.`, `copy_of_`), `sistemasNacionais` 3 → 6 e `pipeline/tests/test_fontes.py` (12 testes; antes não havia nenhum). Commits `415d7ee`, `0f7f8da`, `fe270b3`.
- 03/10/2026 — **NLU v2.1 no ar**: dataset com 20.618 exemplos (554 externos: 441 da lista do mantenedor + 173 formas fracas derivadas das falhas do gate), treino local na RTX (3 épocas, 3.663 passos, perda 2,3383 → 0,1321), quantização **local no WSL2** (Q4_K_M 940 MB + Q5_K_M + Q8_0, llama.cpp b11355), gate local com `llama-cpp-python 0.3.19`: JSON nativo **100 %**, intenção **87,1 %** (90,0 % excluindo os 3 casos que o contrato v2 não expressa), entidades 100/93,3/100, alucinação **0 %**, **0,77 s** média. Promovido no Modal (`current=v2.1-20261003`, `format=v2`) subindo o GGUF direto para o Volume com `modal volume put` + `convert_gguf.py::promote` — sem depender do upload HF. `MODEL_VERSION` atualizado na Vercel, deploy via `data_refresh` forçado e produção validada (1-2 s quente, cold start 14 s sem 504, `RECOMENDACAO` funcionando). Snapshot `data/eleicoes2026` sincronizado com o pacote assinado de produção (789 arquivos, ECDSA + sha256 verificados localmente). Commits `1121726`, `0076402`.

### Lições operacionais de 02–03/10/2026
- **Memória mata o treino:** `.wslconfig` com `memory=20GB` + pagefile fixo de 28 GB em máquina de 31,5 GB → evento Windows 2004 ("memória virtual insuficiente": vmmemWSL 21 GB, python 7,8 GB, kilo 3,1 GB), `WinError 1455` e `LiveKernelEvent 141/193`. Regra: **não treinar com o WSL ligado**; `dataloader_num_workers=0` no Windows (o spawn recarrega o torch e estoura a paginação).
- **Smart App Control/WDAC bloqueia binários não assinados** (evento CodeIntegrity 3077 no `llama-quantize-impl.dll`): no Windows só roda o que é assinado — `llama-cpp-python` (wheel) carrega, os `.exe` do llama.cpp não. Saída: quantizar no **WSL2** (e `wsl --shutdown` ao terminar) ou no job do Modal.
- **Gradle mente com "BUILD SUCCESSFUL":** testes que leem arquivos fora do módulo (`contracts/`, `data/`) precisam de `inputs.files(...)` declarado, senão a tarefa fica UP-TO-DATE e o relatório é antigo. Confira sempre o **timestamp do XML** em `app/build/test-results/`.
- **O gate de código é mais fraco que a documentação:** `check_gates` só bloqueia JSON válido (≥98 % nativo, 100 % com gramática), `--min-entity-acc` (default 0) e queda Q4×Q8 ≤3 pp. Intenção/entidades/alucinação são **reportados, não bloqueantes** — pendência: endurecer `check_gates`.
- **Publicação de modelo:** nunca sobrescrever sem fixar a revisão anterior (`13851ea0d02628546da18121f03831a92d2a38f4` = v1-legado, recuperável por `--revision`), e o rollback é `convert_gguf.py::promote --version v1-legado` (o Volume guarda versões imutáveis; o serviço não baixa do HF em runtime).
