# SaibaTudo — guia para agentes de código (repositório único)

Uma pasta por app. **Antes de mexer num app, leia o `CLAUDE.md` e o `docs/PROJECT_MEMORY.md` dele**: as regras de cada
app (neutralidade eleitoral e congelamento em eleições; licenças e segurança química em química; privacidade nos dois)
continuam valendo dentro da pasta.

- `apps/eleicoes2026/` — SaibaTudo Eleições 2026. Vercel `saibatudo`, que responde por saibatudo.net (home incluída).
  **Congelamento de 24 a 26/10/2026** (guarda: `.github/workflows/eleicoes-congelamento.yml`).
- `apps/quimica/` — SaibaTudo Química. Vercel `saibatudo-quimica`, servido em saibatudo.net/quimica/ por proxy.

## Regras do repositório
1. **Cada app é autocontido.** Scripts e testes usam caminhos relativos à pasta do app: rode tudo de dentro dela.
   Nenhum app importa arquivo de outro.
2. **Workflows** ficam em `.github/workflows/<app>-*.yml`, com `defaults.run.working-directory: apps/<app>` e filtro
   `paths: apps/<app>/**`. Num workflow novo, prefixe também concorrência, etiquetas de issue, segredos e variáveis.
   O validador de cada app (`apps/<app>/tools/test_workflows.py`) confere os workflows do seu prefixo.
3. **Segredos nunca no Git nem no chat.** Locais: `apps/<app>/secrets/` (ignorado). No GitHub: eleições sem sufixo
   (legado), química com `_QUIMICA`; `VERCEL_TOKEN` e `VERCEL_ORG_ID` compartilhados.
4. **Vercel:** cada app publica da própria pasta (`vercel deploy --prod` dentro de `apps/<app>`, com `.vercelignore`
   próprio). A CLI não lê o `.gitignore`. A cota de uploads é da conta inteira; medir antes de um deploy grande:
   `python apps/quimica/tools/vercel_cota.py --minimo N`.
5. **Domínio:** um app novo precisa de regras de proxy em `apps/eleicoes2026/vercel.json` (fora do congelamento), de
   exclusão no service worker da home (`apps/eleicoes2026/web/src/sw.js`) e de cartão em
   `apps/eleicoes2026/web/src/assets/apps.js`.
6. **Push na `main` não publica.** Cada app publica pelo `<app>-data-refresh.yml` (agendado ou `gh workflow run`).
   Depois de cada push, conferir todos os workflows disparados (`gh run list --limit 10`).
7. **Windows:** `git config core.longpaths true` (alguns caminhos de química passam de 200 caracteres). Depois de usar o
   WSL, `wsl --shutdown`.
