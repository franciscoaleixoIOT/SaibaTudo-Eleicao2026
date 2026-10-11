# SaibaTudo

Repositório único dos apps SaibaTudo: ferramentas independentes, sem anúncios, que respondem só com dados públicos e
oficiais. Tudo é publicado em **https://saibatudo.net**.

| App | Pasta | Endereço | Projeto na Vercel |
| :-- | :-- | :-- | :-- |
| Home (página principal) | [`portal/`](portal/) | https://saibatudo.net/ | `saibatudo-portal` |
| SaibaTudo Eleições 2026 (site, PWA e Android) | [`apps/eleicoes2026/`](apps/eleicoes2026/) | https://saibatudo.net/eleicoes2026/ | `saibatudo` (responde pelo domínio) |
| SaibaTudo Química (site, PWA e Android) | [`apps/quimica/`](apps/quimica/) | https://saibatudo.net/quimica/ | `saibatudo-quimica` |

## Como está organizado

- **Cada app é independente.** Código, dados, testes, app Android, documentação e `vercel.json` ficam na pasta dele; um
  app não importa arquivos de outro. Os comandos de cada app rodam de dentro da pasta (`cd apps/<app>`).
- **Deploy independente.** Cada projeto publica no próprio projeto da Vercel, pelos próprios workflows
  (`.github/workflows/<app>-*.yml` e `portal-ci.yml`), que rodam dentro da pasta e só disparam quando ela muda.
- **Um domínio.** saibatudo.net fica no projeto de eleições, que encaminha a home (`/`, `/portal/*`) ao projeto do portal e
  `/quimica/*` ao de química (proxy). Os contratos entre eles ficam em `tests/rotas.test.mjs`.
  Os endereços públicos não mudaram com a reorganização.
- **Segredos do GitHub:** os de eleições não têm sufixo (`DATA_SIGNING_KEY`, `VERCEL_PROJECT_ID`…); os de química têm
  `_QUIMICA` (`DATA_SIGNING_KEY_QUIMICA`, `VERCEL_PROJECT_ID_QUIMICA`) e as variáveis, prefixo `QUIMICA_`.
  `VERCEL_TOKEN` e `VERCEL_ORG_ID` são compartilhados.

Histórico: este repositório se chamava `SaibaTudo-Eleicao2026` (o GitHub redireciona o nome antigo). O antigo
`SaibaTudo-Quimica` foi incorporado com todo o histórico em `apps/quimica/` e arquivado.

Guia para quem mantém (pessoas e agentes): [`CLAUDE.md`](CLAUDE.md) e o `CLAUDE.md` de cada app.
