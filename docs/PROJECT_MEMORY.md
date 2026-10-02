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
