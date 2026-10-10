# Fontes e licenças — política e inventário

> **Regra:** só entra no pacote de dados, no dataset e no modelo o que tem licença explícita de reuso e redistribuição (domínio público, CC0, CC BY, CC BY-SA/NC-SA com as
> condições cumpridas) ou é **fato não protegível** (pesos atômicos, constantes, símbolos). Tudo o mais é **referência de leitura para a pessoa que revisa** e, no app, no
> máximo um **link**. O app é não comercial e o código é MIT; dados derivados de fontes NC-SA ficam em pastas próprias com a licença herdada declarada no manifesto.

## 1. Veredito por fonte (verificado em 10/10/2026; `V` = verificado por agente nos termos de uso, `P` = preliminar)

| Fonte | Mantenedor | Licença / termos | Uso neste projeto | Como acessar | Status |
| :-- | :-- | :-- | :-- | :-- | :-- |
| PubChem (compostos, propriedades, GHS, periodic table) | NIH/NCBI (EUA) | domínio público; pedido de atribuição; limite 5 req/s, 400 req/min | **dados** (núcleo de compostos, elementos) | PUG REST / PUG View, com cache e `User-Agent` identificado | P |
| CODATA 2022 (constantes) | NIST | domínio público (obra do governo dos EUA) | **dados** (`constantes.json`) | arquivo `allascii.txt` | P |
| Wikidata | Wikimedia | CC0 | **dados** (nomes PT, CAS, descoberta, sitelinks para seleção) | SPARQL (`query.wikidata.org`), `User-Agent` identificado | P |
| Wikipédia em português | Wikimedia | CC BY-SA 4.0 | **critério de seleção** do núcleo; resumos **não** entram (SA sobre o modelo é controverso) | API | P |
| OpenStax *Chemistry 2e* | Rice University | **CC BY 4.0** | **textos** (explicações), tradução automática marcada | arquivo CNX/EPUB público | P |
| OpenStax *Química 2ed* (espanhol) | Rice University | CC BY 4.0 | apoio à tradução de termos | idem | P |
| LibreTexts Chemistry | LibreTexts | CC BY-NC-SA 4.0 | **textos** em pasta própria, dataset derivado herda NC-SA | API MindTouch (`@api/deki`) | P |
| ICSC — Fichas Internacionais de Segurança Química | OIT/OMS | reprodução permitida com atribuição (confirmar termos do site da OIT) | **dados de segurança** (cartões em PT) | páginas `showcard.display?p_lang=pt` | P |
| CAMEO Chemicals | NOAA/EPA (EUA) | domínio público (governo dos EUA) | **dados** de reatividade/incompatibilidade (fase 2) | download do banco | P |
| ECHA (C&L Inventory, REACH) | União Europeia | reuso permitido com aviso legal e atribuição; sem uso comercial de partes | **via PubChem** (GHS já agregado); link direto para a ficha | — | P |
| IUPAC: pesos atômicos, símbolos, Green Book | IUPAC | fatos (pesos/símbolos) + obra protegida (texto) | **dados** (fatos) e **referência** (texto) | tabela CIAAW; PDF do Green Book | P |
| IUPAC Gold Book | IUPAC | CC BY-NC-ND 4.0 | **citação curta com link**; sem derivação | site | P |
| NIST Chemistry WebBook | NIST | obra do governo dos EUA, mas termos do SRD restringem **redistribuição em massa** | **link** por composto; valores pontuais só com citação | página do composto | P |
| ChemSpider | RSC | termos proíbem extração em massa | **link** | — | P |
| SDBS (espectros) | AIST (Japão) | uso restrito, sem redistribuição | **link** | — | P |
| QNInt / SBQ | SBQ | copyright da sociedade (verificar artigo a artigo) | **link** | — | P |
| RSC, ACS, C&EN, Organic Chemistry Portal | diversos | copyright | **link** | — | P |
| Compound Interest | A. Brunning | CC BY-NC-ND 4.0 | **link** (sem derivação) | — | P |
| CAMPUS Plastics, UL Prospector, MatWeb, Omnexus, Polymer Properties Database | fabricantes/empresas | termos comerciais, proíbem scraping | **link** e descrição do que cada um oferece | — | P |
| ASTM D20, ISO TC 61 | ASTM/ISO | normas pagas | **citar número e título**, nunca o conteúdo | — | P |
| ABPol / revista *Polímeros* (SciELO) | ABPol | CC BY (SciELO) | **textos** de polímeros (fase 2, artigo a artigo) | SciELO | P |
| Project Gutenberg #14474, *The Chemical History of a Candle* (Faraday) | — | domínio público | **texto** histórico (combustão), rotulado como histórico | zip local | P |
| **Livros da pasta `LivrosQuimica`** (Atkins, CRC, Levine, Clayden, Feltre, Brown, Solomons, Pauling, Tito e Canto, Martha Reis, McQuarrie, Weller, March, Shriver, Moderna PLUS) | editoras | **obras protegidas, cópias de origem não autorizada** | **referência de leitura da pessoa que revisa**. Nada é extraído para o repositório, o dataset ou o modelo. A pasta está no `.gitignore` do projeto irmão. | — | V |

## 2. Como registrar uma fonte nova
1. Achar a página de licença/termos e guardar a URL e a data.
2. Classificar: `dados` (entra no pacote), `textos` (entra em `textos/` com licença), `link` (só referência na interface), `referencia` (só leitura humana).
3. Acrescentar a linha acima **e** o objeto em `pipeline/fontes.py` (`FONTES`), que gera `data/quimica/fontes.json` e a página "Sobre os dados".
4. Respeitar limites técnicos (taxa, `User-Agent`, cache por ETag). Nunca rodar coleta em massa contra fonte que proíbe.

## 3. Atribuição exibida
"Sobre os dados" lista cada fonte, licença, data de acesso e o que foi usado. Cada resposta traz a fonte do dado (ex.: "Fonte: PubChem CID 2244, domínio público") e, para
explicações, o trecho licenciado (ex.: "OpenStax Chemistry 2e, §3.1, CC BY 4.0, tradução automática").
