# pipeline — coleta, validação e assinatura do pacote de dados

Python 3, só biblioteca padrão (`urllib`, `json`, `xml.etree`, `html.parser`) + `ecdsa` (assinatura). Saída: `data/quimica/`
(contrato em `docs/DATA_CONTRACT.md`; política de fontes em `docs/FONTES_E_LICENCAS.md` §5).

## Como rodar
```bash
pip install -r pipeline/requirements.txt
python pipeline/build.py --assinar-com secrets/data_signing_key.pem          # completo (~30-40 min na 1ª vez; depois usa o cache)
python pipeline/build.py --rapido --assinar-com secrets/data_signing_key.pem # 300 compostos, textos reduzidos (CI, testes)
python pipeline/sign.py verify data/quimica/manifest.json --public pipeline/data_signing_public.pem
python -m unittest discover -s pipeline/tests                                # testes (offline; usa pipeline/tests/fixtures/cache)
```
Opções úteis: `--offline` (só cache), `--cache DIR`, `--out DIR`, `--alvo N` (tamanho do núcleo, padrão 2000),
`--limite-compostos N`, `--limite-textos N`, `--sem-wikimedia`, `--hoje AAAA-MM-DD`, `--gutenberg-zip ARQ` (reserva).
A saída é atômica: o pacote é montado em `<out>.novo`, validado e só então troca `<out>`; se a validação falha, o anterior fica.
`stats.json` (contagens, fontes, descartes, tempos, falhas por família) fica ao lado do manifesto, fora dele.

## O que cada módulo faz
| Módulo | Função |
| :-- | :-- |
| `http_cache.py` | GET/POST com cache em `pipeline/.cache/<sha256 da URL>` (corpo gzip + cabeçalhos), ETag/Last-Modified, retentativas, limite por host |
| `robots.py` | checa `robots.txt` (exceções documentadas só para as APIs oficiais: PUG REST, WDQS, `/w/api.php`) |
| `fontes.py` | `FONTES` (nome, mantenedor, url, licença, uso, `acessadoEm`, lista de permissão) -> `fontes.json` e `manifest.licencas` |
| `coleta_elementos.py` | 118 elementos: PubChem Periodic Table + Wikidata; nomes da SBQ em `quimica_util.py` |
| `lista_fixa.py`, `selecao_compostos.py` | núcleo de ~2.000 compostos: lista fixa (CID conferido pela fórmula) + Wikidata (P662, ptwiki) por sitelinks |
| `pubchem.py`, `coleta_compostos.py` | PUG REST (campos calculados), GHS harmonizado (CLP Anexo VI), nomes/CAS/fórmula (Wikidata), `definicaoChebi`, lotes de 200 |
| `clp.py` | frases H/EUH em português: Anexo III do Regulamento CLP (EUR-Lex/Cellar) -> `ghs_frases.json` |
| `coleta_chebi.py` | definições e nomes do ChEBI (CC BY 4.0) pela API pública em lote |
| `coleta_constantes.py` | CODATA 2022 (NIST) -> `constantes.json` |
| `coleta_wikimedia.py` | Wikipédia pt (introduções) e Wikilivros pt, CC BY-SA 4.0, com `revisao` e `tema` |
| `coleta_textos.py` | trechos de 400-1.200 caracteres; Faraday (Gutenberg #14474); sonda do Gold Book |
| `coleta_icsc.py` | só o link de busca por CAS (`icscBuscaUrl`); parser dos cartões **desativado** |
| `regras.py` | `regras.json` (prefixos SI, unidades, reatividade, solubilidade, nomenclatura, `propriedades`) |
| `build.py`, `sign.py` | orquestração, validação (gates) e assinatura ECDSA P-256/SHA-256 do manifesto |

## Limites de taxa (respeitados em `http_cache.LIMITES_POR_HOST`)
PubChem 2 req/s (teto pedido: 4; o servidor devolveu 429 a ~3,3 req/s sustentados e **bloqueia o IP por alguns minutos**: depois de um
429 o limitador reduz a taxa e espera 30 s, 60 s, ... até 5 min) · Wikidata 1 req/s · OIT 1 req/s · Wikimedia 1 req/s em série ·
EBI/ChEBI 1 req/10 s (Crawl-delay do `robots.txt`) · demais 2 req/s. `User-Agent`: `SaibaTudoQuimica/0.1 (+https://saibatudo.net; saibatudo@saibatudo.net)`.

## Como adicionar uma fonte
1. Ler os termos e o `robots.txt`; registrar a linha em `docs/FONTES_E_LICENCAS.md`.
2. Acrescentar o objeto em `fontes.py` (`FONTES`) com `licenca`, `uso` e `exibir/dataset/treino`.
3. Criar `coleta_<fonte>.py` com `coletar(http, hoje)` devolvendo `(dados, stats)`; usar só `HttpCache` (nunca `urllib` direto).
4. Ligar em `build.py` (`tentar(...)` registra falha em `stats.json` sem derrubar o build) e acrescentar o gate em `validar()` se for obrigatória.
5. Testes em `pipeline/tests/` (parser com amostra sintética ou pequena resposta real em `fixtures/cache`).
Regras que o `validar()` impõe: licença de texto só `CC BY-SA 4.0`, `CC BY 4.0` ou `domínio público`; nada de OpenStax; nada de
`seguranca/` (ICSC); `ghs` só da fonte harmonizada (Regulamento 1272/2008); `icscBuscaUrl` exatamente quando há `cas`.

## Fixtures dos testes
`pipeline/tests/fixtures/cache/` guarda respostas reais pequenas (PubChem, Wikidata, CODATA, Wikimedia, ChEBI, Gutenberg) no formato do
cache. Para regravar: `python pipeline/build.py --out /tmp/x --cache /tmp/fx --limite-compostos 12 --limite-textos 6 --hoje 2026-10-10`
e copiar `/tmp/fx` (sem a entrada do CLP, 29 MB) para a pasta de fixtures.
