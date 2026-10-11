# SaibaTudo Química — site/PWA (`/quimica/`)

JavaScript puro (módulos ES), **sem npm em tempo de execução, sem CDN e com CSP estrita** (`script-src 'self'`, nada inline). Molde: `web/` do SaibaTudo Eleições 2026.
Servido pela Vercel num projeto próprio e exposto em `saibatudo.net/quimica/` por rewrite do projeto irmão: **todo caminho publicado começa em `/quimica/`**
(inclusive os dados, em `/quimica/data/...`).

## Como rodar
```bash
cd web
npm test                                    # testes (Node ≥ 20, sem rede): node --test "test/*.test.mjs"
node build.mjs                              # gera web/dist/quimica/ a partir de data/quimica (verifica sha256 e assinatura)
DATA_DIR=test/fixtures/data-quimica node build.mjs   # o mesmo com o pacote de teste (assinado), útil enquanto o pacote real não existe
node serve.mjs                              # http://localhost:4173/quimica/ (imita o vercel.json: cleanUrls, rewrite do SPA, CSP, cache)
E2E=1 npm test                              # + verificação no Chrome real (telas, calculadoras, moléculas, CSP, offline)
node tools/screenshots.mjs                  # screenshots (mobile claro e desktop escuro) em web/.screenshots, com o servidor no ar
node tools/gerar_icones.mjs                 # marca: brand/quimica-icon.svg e brand/png/* (sem dependências)
python tools/gerar_ghs_js.py                # js/ghs.js (frases H em português) a partir de dataset/ghs_pt.py
node test/fixtures/gerar-data-quimica.mjs   # refaz e assina o pacote de teste (usa secrets/data_signing_key.pem)
```
Variáveis do build: `DATA_DIR`, `OUT_DIR`, `SKIP_VERIFY=1` (só testes locais), `NO_MINIFY=1`.

## Estrutura
```
web/src/quimica/
  index.html · offline.html · privacidade/index.html · manifest.webmanifest · sw.js
  css/        base.css (tokens claro/escuro, botões, chips) · app.css
  js/         main.js · app.js (SPA: rotas, shell) · data.js + verify.js (pacote assinado) · engine.js · nlu.js · seguranca.js · answers.js · dicionario.js
              propriedades.js · perigos.js + ghs.js · busca.js · formato.js · texto.js · math.js (KaTeX) · molecula.js (SmilesDrawer) · vendor.js
              calc/     formula · balancear · estequiometria · concentracao · ph · gas · massa · unidades · contexto · frac
              ui/       inicio · tabela · elemento · compostos (+ composto) · calculadoras · seguranca · sobre · config · componentes
  vendor/     katex/ · smiles-drawer/ · ghs/ (pictogramas SVG) · VENDOR.md   — com a licença ao lado
web/test/     *.test.mjs · fixtures/data-quimica (pacote mínimo assinado) · support.mjs · contrato.mjs · tex.mjs
web/tools/    minify.mjs · screenshots.mjs · gerar_icones.mjs · gerar_ghs_js.py · gerar-ghs.mjs
```
Telas: Início (pergunta ao motor local) · Tabela periódica · Ficha do elemento · Compostos e ficha do composto (estrutura 2D, GHS) · Calculadoras (7, com passos em KaTeX) ·
Segurança (GHS, frases H) · Sobre os dados · Configurações · Privacidade (página estática).

## Bibliotecas de terceiros (vendorizadas, sem CDN)
| Biblioteca | Versão | Licença | Uso |
| :-- | :-- | :-- | :-- |
| [KaTeX](https://github.com/KaTeX/KaTeX) | 0.19.0 | MIT | fórmulas e passos |
| [SmilesDrawer](https://github.com/reymond-group/smilesDrawer) | 2.4.1 | MIT | estrutura 2D a partir do SMILES (canvas) |
| Pictogramas GHS | — | desenhos próprios (MIT) | `vendor/ghs/*.svg`, simplificados, com `<title>`/`<desc>` |
| Poppins SemiBold | — | SIL OFL | títulos (convertida para WOFF no build) |

Origem, arquivos copiados e as pequenas modificações (por causa da CSP) estão em `src/quimica/vendor/VENDOR.md`.
A CSP libera `img-src 'self' data:` **só** porque o SmilesDrawer rasteriza os rótulos dos átomos via SVG em `data:`.

## Segurança e dados
- `seguranca.js` roda **antes** de tudo (NLU, dados): recusa síntese/purificação/escalonamento de explosivos, armas químicas, drogas e precursores e receitas caseiras com reagentes
  perigosos, tolerando grafias ("s1ntese", "explo sivo"). Casos em `contracts/seguranca_cases.json`; perguntas legítimas (neutralizar derramamento, EPI, misturas) passam.
- O NLU local e as respostas só usam o pacote assinado e cálculo local; cada bloco traz fonte e licença. Casos de referência em `contracts/nlu_golden_cases.json`.
- A IA na nuvem **ainda não está disponível** (fase 5): nada sai do aparelho.
