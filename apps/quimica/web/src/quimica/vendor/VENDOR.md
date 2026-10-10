# Bibliotecas de terceiros (vendorizadas)

Nada é carregado de CDN: a CSP do site é `script-src 'self'` e tudo fica versionado aqui, com a licença ao lado.
Os arquivos vieram do **registro npm** (tarball oficial `https://registry.npmjs.org/<pacote>/-/<pacote>-<versão>.tgz`), conferidos em 10/10/2026.

| Biblioteca | Versão | Licença | Origem | Arquivos | Uso |
| :-- | :-- | :-- | :-- | :-- | :-- |
| **smiles-drawer** | 2.4.1 | MIT (© 2017 GDB / Reymond Research Group) | https://registry.npmjs.org/smiles-drawer/-/smiles-drawer-2.4.1.tgz · https://github.com/reymond-group/smilesDrawer | `smiles-drawer/smiles-drawer.min.js`, `smiles-drawer/LICENSE` (de `dist/smiles-drawer.min.js` e `LICENSE.md`) | Estrutura 2D da molécula a partir do SMILES, desenhada em `<canvas>` (o desenhador SVG da biblioteca usa atributos `style` e `<style>`, bloqueados pela CSP) |
| **KaTeX** | 0.19.0 | MIT (© 2013-2020 Khan Academy e colaboradores) | https://registry.npmjs.org/katex/-/katex-0.19.0.tgz · https://github.com/KaTeX/KaTeX | `katex/katex.min.js`, `katex/katex.min.css`, `katex/LICENSE`, `katex/fonts/*.woff2` | Fórmulas e passos de cálculo |
| **Pictogramas GHS** | — | desenhos próprios (MIT, deste repositório) | forma e cores conforme o GHS/ONU (losango com borda vermelha); símbolos simplificados | `ghs/ghs01.svg` … `ghs/ghs09.svg` (gerados por `web/tools/gerar-ghs.mjs`) | Ficha do composto e Segurança; cada SVG tem `<title>` e `<desc>`, e a interface põe o texto alternativo |

## Modificações nos arquivos copiados
- `smiles-drawer.min.js` (3 alterações, todas para a CSP `style-src 'self'`, que bloqueia atributos `style` e `<style>` inline):
  1. removida a última linha `//# sourceMappingURL=smiles-drawer.min.js.map` (o mapa não é publicado; evita 404 nas ferramentas do navegador);
  2. as 4 chamadas `x.setAttributeNS(null,"style",VALOR)` viraram `x.style.cssText=VALOR` (CSSOM, permitido pela CSP; o SVG serializado é idêntico);
  3. em `Drawer.draw(…, canvas)` o `<svg>` temporário deixou de ser anexado ao `document.body` (e perdeu o `style="visibility: hidden: …"`, que nem era CSS válido): ele só serve para gerar a imagem do canvas.
  O restante é idêntico ao do pacote. O teste `web/test/modules.test.mjs` falha se (2) ou (3) forem desfeitos numa atualização. A biblioteca ainda rasteriza os rótulos dos átomos
  como imagem `data:image/svg+xml`, por isso a CSP do site libera `img-src 'self' data:` (e nada mais).
- `katex.min.css`: mantidos só os `@font-face` das 12 fontes publicadas e, em cada um, só o formato `woff2` (todos os navegadores atuais o suportam), para não referenciar arquivos inexistentes. As regras de estilo são idênticas.
- `katex/fonts`: AMS-Regular, Main-Regular/Bold/Italic/BoldItalic, Math-Italic/BoldItalic, Size1–4-Regular e SansSerif-Regular (as demais famílias — caligráfica, fraktur, script, monoespaçada — não são usadas pelas fórmulas do app).

## Como o app usa
- `<script src="/quimica/vendor/katex/katex.min.js">` e `<script src="/quimica/vendor/smiles-drawer/smiles-drawer.min.js">` como scripts clássicos (expõem `katex` e `SmilesDrawer` globais). Sem `eval`, sem `innerHTML` de dados e sem estilos inline: o KaTeX aplica estilos por CSSOM (`el.style.x = …`), que a CSP permite.
- Para atualizar: baixar o novo tarball, repetir as duas modificações acima, atualizar esta tabela e rodar `npm test`.
