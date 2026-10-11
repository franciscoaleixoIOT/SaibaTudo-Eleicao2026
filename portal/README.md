# Portal — a home de saibatudo.net

Projeto próprio (Vercel `saibatudo-portal`, https://saibatudo-portal.vercel.app), servido em **https://saibatudo.net/**
pelo proxy do projeto de eleições (`apps/eleicoes2026/vercel.json`: `/`, `/sw.js`, `/manifest.webmanifest` e `/portal/*`).

- `src/index.html` — a página; `src/manifest.webmanifest` e `src/sw.js` (service worker de escopo `/`).
- `src/portal/` — tudo o que a home usa, com cópias próprias (CSS, tema, ícones, marca, fonte Poppins com a licença OFL).
  A home não depende de arquivo de nenhum app: o teste `test/portal.test.mjs` garante.
- `build.mjs` — copia `src/` para `dist/` e preenche o service worker (versão = hash do conteúdo, lista de pré-cache).

```bash
node build.mjs                    # gera dist/
node --test test/*.test.mjs       # build, independência, service worker, manifesto, vercel.json
vercel deploy --prod --yes        # publicação manual (normalmente: push na main → .github/workflows/portal-ci.yml)
```

## Como adicionar um novo app à home
1. Cartão: edite `src/portal/apps.js` (`APPS` para apps no ar, `EM_BREVE` para planejados).
2. Rota: se o app é outro projeto da Vercel, acrescente em `apps/eleicoes2026/vercel.json` as três regras de proxy
   (`/<app>`, `/<app>/` e `/<app>/:path*` — a barra final é literal) fora do congelamento de eleições.
3. Service worker: inclua o prefixo do app nas exclusões de `src/sw.js` (cache-primeiro aqui prenderia arquivos antigos).
4. `node --test "tests/*.test.mjs"` na raiz do repositório confere as três coisas juntas.
