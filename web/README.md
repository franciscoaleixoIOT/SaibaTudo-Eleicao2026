# SaibaTudo — site e PWA (`web/`)

Site institucional (`/`) e aplicativo web instalável **SaibaTudo Eleições 2026** (`/eleicoes2026/`), em HTML/CSS/JS puros:
**sem frameworks, sem CDN e sem dependências npm** (apenas Node ≥ 20 para o build, os testes e o servidor local).
O PWA tem o **mesmo modelo, design e comportamento do app Android** (`app/`) e consome o mesmo pacote de dados oficial
(`data/eleicoes2026/`, ver [`docs/DATA_CONTRACT.md`](../docs/DATA_CONTRACT.md)).

## Estrutura

```
web/
├── build.mjs               gera web/dist (copia src + dados + brand, minifica, versiona e gera os service workers)
├── serve.mjs               servidor estático local que imita o vercel.json (cleanUrls, rewrite SPA, CSP, Cache-Control)
├── src/
│   ├── index.html          home institucional (logotipo, "Informação cívica verificada", app Eleições 2026, instalar, projeto público, em breve)
│   ├── manifest.webmanifest, sw.js           PWA e service worker do portal (escopo /)
│   ├── privacidade/        política de privacidade (espelha docs/PRIVACIDADE.md; e-mail de contato pendente)
│   ├── sobre-os-dados/     redireciona para /eleicoes2026/sobre-os-dados (a tela é a do app)
│   ├── assets/             base.css (tokens claro/escuro), site.css, home.js, apps.js (CONFIG da home), theme-init.js
│   └── eleicoes2026/
│       ├── index.html, offline.html, manifest.webmanifest, sw.js   (escopo /eleicoes2026/)
│       ├── css/app.css
│       └── js/
│           ├── model.js      modelo de domínio (candidatura, cargos, UFs, elegibilidade, normalização)  ← DomainModels.kt
│           ├── gazetteer.js  dicionário de partidos/nomes (incremental)                                ← Gazetteer.kt
│           ├── nlu.js        NLU local por regras                                                      ← LocalNlu.kt
│           ├── answers.js    montagem das respostas a partir dos dados oficiais                        ← AnswerBuilder.kt
│           ├── filters.js    filtros e ordem fixa (cargo, UF, número)                                  ← CandidateQuery.kt
│           ├── phase.js      fase do calendário, datas em Brasília, menu por fase                      ← Fase.kt / MenuFactory.kt
│           ├── live.js       apuração ao vivo do TSE (cache 60 s, If-None-Match, ≥ 500 ms, cache negativo 5 min) ← TseApuracaoClient.kt
│           ├── verify.js     SHA-256 e assinatura ECDSA P-256/SHA-256 do manifesto (WebCrypto)         ← ManifestVerifier.kt
│           ├── data.js       DataStore: carga por UF sob demanda, verificação, atualização atômica      ← DataUpdater/BundleLoader
│           ├── engine.js     motor local-first (+ nuvem opcional)                                       ← LocalOfficialAiEngine/Hybrid
│           ├── cloud.js      NLU na nuvem (opt-in) + relato de problema                                 ← CloudNlu.kt / ReportClient.kt
│           ├── prefs.js, install.js, dom.js, icons.js, app.js (controlador/rotas/render), main.js
│           └── ui/           components.js, dialogs.js, urna.js, telas.js (onboarding, configurações, sobre os dados)
├── test/                   `node --test` (dados reais; ver "Testes")
└── tools/                  screenshots.mjs (Chrome headless + CDP), minify.mjs
```

## Como buildar e rodar localmente

```bash
node web/build.mjs                 # gera web/dist (≈ 1 s)
node web/serve.mjs                 # http://localhost:4173  (PORT=8080 node web/serve.mjs para outra porta)
# alternativa: npx --yes serve web/dist   (não aplica CSP/rewrite do vercel.json)
```

Variáveis do build: `DATA_DIR` (pasta do pacote; padrão `data/eleicoes2026`), `OUT_DIR` (padrão `web/dist`),
`NO_MINIFY=1` (depuração), `SKIP_VERIFY=1` (pula a conferência de assinatura/checksums — **não use em produção**).

O build **recusa publicar dados inválidos**: confere a assinatura do manifesto (chave pública `pipeline/data_signing_public.b64`)
e o `sha256`/tamanho de todos os arquivos listados no manifesto. Os dados são copiados byte a byte (sem conversão de EOL).

Resultado em `web/dist` (≈ 26 MB, quase tudo dados/fotos): `index.html`, `eleicoes2026/…`, `assets/`, `brand/` (ícones PWA, favicon, `og-symbol-1200.png`, SVGs),
`fonts/poppins-semibold.woff` (Poppins OFL convertida de `brand/fonts` para WOFF no build, com `OFL.txt`) e `data/eleicoes2026/` (mesmo layout do contrato).

## Testes

```bash
node --test web/test               # tudo (≈ 3 s)
```

Os testes carregam os **dados reais** de `data/eleicoes2026` (ou `DATA_DIR`) — nada fictício:

| Arquivo | O que cobre |
| :-- | :-- |
| `nlu-golden.test.mjs` | **todos** os casos de `contracts/nlu_golden_cases.json` + vocabulário (cargos, temas, histórico, turno) |
| `answers.test.mjs` | equivalentes de `AnswerBuilderTest.kt` (13 candidaturas na urna a Presidente e Pablo Marçal fora da lista; recusa de recomendação; resultados antes da eleição; calendário por fase; elegibilidade = situação oficial; patrimônio; "Meu estado" implícito; prestação de contas) |
| `filters-engine.test.mjs` | filtros/ordem fixa, carga sob demanda por UF, resultados pós-eleição, NLU na nuvem (consentimento, validação, falhas, timeout 14 s), relato de problema, fotos |
| `data.test.mjs` | assinatura ECDSA (válida/adulterada), checksums de todo o pacote, DER → r‖s, arquivo adulterado, atualização atômica (só o que mudou, anti-rollback, assinatura inválida) |
| `live-phase.test.mjs` | apuração do TSE (parser, URLs, cache 60 s, If-None-Match, 500 ms, cache negativo), fase do calendário, menu por fase |
| `build.test.mjs` | build (estrutura, hash determinístico, service workers, falha com dados adulterados), **bundle minificado passa nos casos de referência**, `serve.mjs`, `vercel.json`, ausência de segredos |
| `modules.test.mjs` | imports/exports, HTML (sem script/style inline → CSP), manifestos PWA |

`web/test/fixtures/tse_apuracao_presidente.json` é só um **exemplo do formato** do JSON de apuração do TSE (números de teste, nunca publicado em `dist`).

### Screenshots (verificação visual)

```bash
node web/build.mjs && node web/serve.mjs &      # em outro terminal
node web/tools/screenshots.mjs                   # → web/.screenshots (390×844 e 1280×800, claro e escuro)
ONLY=lista,ia,urna node web/tools/screenshots.mjs http://localhost:4173
```

Cenários: home, onboarding, lista, resposta da IA, "Meu estado", filtros, detalhe, urna, configurações, sobre os dados, **offline** (service worker) e
**apuração** (data simulada no navegador + JSON do TSE interceptado com a fixture; os screenshots dessa cena têm sufixo `-SIMULADA` e **não** mostram dados reais).
Requer o Chrome (`CHROME=…` se não estiver no caminho padrão do Windows). O script também falha se houver erro de console/CSP.

## Como o PWA funciona

- **Dados**: `manifest.json` primeiro → verifica a assinatura (WebCrypto, chave pública embutida em `verify.js`) → `regras.json` e `fontes.json` →
  `candidatos/BR.json` + a UF do usuário (renderização rápida). As demais UFs só são baixadas **sob demanda** (filtro "Brasil", região, busca por nome ou pergunta à IA que precise delas;
  o progresso aparece sob o título da lista). Cada arquivo é conferido por `sha256` e `bytes`; `pesquisas.json` (2,7 MB) só carrega ao abrir "Pesquisas".
  Falha de verificação de um arquivo ⇒ ele **não entra** nos dados e o aviso aparece discretamente em *Sobre os dados*. Se a assinatura do manifesto não puder ser
  verificada no boot (navegador sem WebCrypto/HTTP), o app usa os arquivos do próprio deploy e sinaliza o fato em *Sobre os dados*.
- **Atualização**: a cada `cliente.pollIntervalMinutes` (mínimo 5 min) enquanto a aba está aberta, ao voltar o foco e ao clicar em "Atualizar agora": baixa o manifesto (`cache: no-cache`),
  exige assinatura válida, rejeita schema maior e pacote mais antigo (anti-rollback), baixa **só** os arquivos cujo `sha256` mudou e **troca tudo atomicamente** (se algo falhar, os dados atuais permanecem).
  A fonte é a própria origem (`/data/eleicoes2026/`), não o `cliente.baseUrl` absoluto (a CSP só permite `'self'` e o endpoint de NLU também é `/api/nlu`).
- **IA**: local-first e determinística (`nlu.js` + `answers.js`, portes fiéis do Kotlin). Só texto de perguntas **não entendidas** vai a `POST /api/nlu`, e **somente com consentimento**
  (opt-in, desligado por padrão); a resposta de nuvem é revalidada contra os dados locais (cargo/UF/partido/nome) e os fatos vêm sempre do pacote. Timeout de 14 s (o backend leva até ~12 s);
  durante a espera aparece "IA analisando…" (e o spinner na busca). "Relatar problema nesta resposta" abre um diálogo que mostra exatamente o que será enviado e só envia (`POST /api/report`) após o clique.
- **Resultados**: nas fases DIA_1T/ENTRE_TURNOS/DIA_2T/POS_ELEICAO a pergunta de resultados consulta **direto** `https://resultados.tse.jus.br/oficial/ele2026/…-u.json` (cache ≈ 60 s, `If-None-Match`,
  ≥ 500 ms entre requisições, cache negativo de 5 min) e exibe os números **como publicados**; a tabela se atualiza a cada ~60 s enquanto a aba está visível.
- **Neutralidade**: ordem fixa (cargo, UF, número), recusa de pedidos de recomendação/previsão de voto, "elegibilidade" = **situação oficial** do julgamento do registro (nunca "Ficha Limpa" inferida).
- **Service worker** (`/eleicoes2026/sw.js`, só em HTTPS ou localhost): pré-cache versionado do shell (hash do conteúdo) + pacote de dados do deploy (manifesto, regras, fontes, BR);
  `manifest.json`/`.sig` em stale-while-revalidate (rede primeiro quando o app força a revalidação); fatias de dados em cache-first **versionado** (`?v=<sha256>`; versões antigas são podadas);
  fotos com limite; página offline; **nunca** intercepta `/api/*` nem a apuração do TSE. As URLs do pré-cache são as "limpas" (`/eleicoes2026/`, `/eleicoes2026/offline`) porque a Vercel redireciona `*.html`
  e uma resposta redirecionada não pode servir uma navegação.
- **Instalação**: `manifest.webmanifest` (raiz: "SaibaTudo"; app: "SaibaTudo Eleições 2026", escopo `/eleicoes2026/`, atalhos Presidente/Governador/Pesquisas), botão "Instalar app" via `beforeinstallprompt`
  (barra do app e Configurações) e instruções para iPhone/iPad (Compartilhar → Adicionar à Tela de Início).
- **Acessibilidade**: WCAG AA (contrastes dos tokens, foco visível, alvos ≥ 44 px, `<dialog>` nativo, `aria-live` nas respostas, link "Ir para o conteúdo", `prefers-reduced-motion`),
  tema claro/escuro/sistema e tamanho de texto ajustável (preferências em `localStorage`, apenas neste aparelho).

### Diferenças deliberadas em relação ao Android

- Números de contagem nas respostas usam separador de milhar (`20.988`), o Android não.
- "Meu estado" implícito (paridade com o Android) **e** o pedido "em todo o Brasil" realmente afasta o recorte (a dica da resposta o promete; o NLU Kotlin ainda não trata essa frase).
- Fotos remotas do TSE só são guardadas pelo service worker se o CDN permitir CORS (respostas opacas pesam muito na cota).

## Como adicionar um novo app à home

Edite **apenas** `src/assets/apps.js` (é o único lugar de configuração da home):

- `GOOGLE_PLAY_URL`: preencha com o link da Play Store para habilitar o botão "Baixar na Google Play" do app Eleições 2026 (vazio = botão desabilitado com a marca "em breve").
- `APPS`: apps disponíveis (`{ id, nome, descricao, url, playUrl? }`) — aparecem como cartões em "Nossos apps".
- `EM_BREVE`: apps planejados (`{ id, titulo, descricao, repo? }`, por ex. `SaibaTudo-eleicoesXXXX`) — aparecem em "Em breve".

Cada app novo deve ter a própria rota (`/eleicoesXXXX/`), manifesto e service worker com escopo próprio, seguindo `src/eleicoes2026/`.

## Deploy na Vercel

O `vercel.json` (raiz do repositório) define `buildCommand: node web/build.mjs`, `outputDirectory: web/dist`, `cleanUrls`, o rewrite do SPA
(`/eleicoes2026/:path((?!.*\.).*)` → `/eleicoes2026/index.html`, sem capturar arquivos com extensão), o redirect `/sobre-os-dados` → `/eleicoes2026/sobre-os-dados` e os cabeçalhos:

- **CSP restritiva** (`default-src 'self'`; `script-src`/`style-src 'self'` — sem inline —; `connect-src 'self' https://resultados.tse.jus.br`; `img-src 'self' https://resultados.tse.jus.br data:`; `frame-ancestors 'none'`…),
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` com todos os recursos desabilitados, `X-Frame-Options`, COOP e HSTS;
- **Cache**: `immutable` de 1 ano para `fotos/`, `brand/` e `fonts/` (se trocar um desses arquivos, renomeie-o); `max-age=300` para os JSONs de dados;
  `max-age=0, must-revalidate` para `manifest.json`/`manifest.sig`, `sw.js`, manifestos web e HTML/JS/CSS do app (a versão é controlada pelo service worker).

As funções serverless ficam em `/api` na raiz (`api/nlu.js`, `api/report.js`); o `vercel.json` não as toca. O workflow `data_refresh.yml` gera um novo pacote assinado em `data/eleicoes2026/` e publica com `vercel deploy --prod`
(sem commit; o snapshot versionado no Git só é atualizado em releases do app): os clientes detectam o novo `dataVersion` pelo manifesto e baixam só o que mudou.
`web/dist` está no `web/.gitignore` (é gerado).

## Pendências e limites conhecidos

- A política de privacidade está publicada, mas o **e-mail de contato** é um campo pendente (o build avisa); revise o texto jurídico antes de divulgar.
- O link da Google Play ainda não existe (`GOOGLE_PLAY_URL` vazio).
- `/api/nlu` e `/api/report` não rodam no `serve.mjs` (404): a nuvem cai para a resposta local; os testes cobrem o contrato com `fetch` simulado.
- Bundle inicial do app (JS+CSS, sem dados): ≈ 170 KB minificado / ≈ 61 KB com gzip; a meta de 150 KB vale para o tamanho transferido.
- Resultados ao vivo só foram exercitados com o formato de exemplo (a votação é em 04/10/2026); confirme com o JSON real do TSE no dia.
- Não houve deploy: cabeçalhos, rewrites e redirects foram validados apenas pelo `serve.mjs` e pelos testes do `vercel.json`, não na infraestrutura da Vercel.
