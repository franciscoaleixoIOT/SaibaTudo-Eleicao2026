# Plano — SaibaTudo Química

Criado em 10/10/2026 a pedido do mantenedor. Executado por agentes (orquestrador: Claude; subagentes por tarefa: Haiku para trabalho mecânico, Sonnet para código e
coleta, Opus para revisão de arquitetura e segurança), seguindo `ARCHITECTURE.md`, `DATA_CONTRACT.md` e `FONTES_E_LICENCAS.md`.

## Fases

| # | Fase | Entregas | Critério de pronto |
| :-- | :-- | :-- | :-- |
| 0 | **Fundação** (10/10) | repositório, documentos, chave de assinatura, política de fontes, `CLAUDE.md` | documentos escritos; pasta de livros fora do Git |
| 1 | **Dados v0** | `pipeline/` com coletores (PubChem elementos + núcleo de compostos, Wikidata, CODATA, ICSC em PT, OpenStax cap. 1–8, Gutenberg), validação, assinatura; `data/quimica/` publicado | `python pipeline/build.py --assinar-com secrets/...` gera o pacote; testes do pipeline verdes; manifesto assinado |
| 2 | **Dataset v0** | `dataset/qa/` (fatos por template sobre todos os elementos e compostos do núcleo; cálculos com passos; segurança; recusas; conceitos ancorados nos textos), `dataset/nlu/`, `contracts/nlu_golden_cases.json`, `contracts/seguranca_cases.json` | teste de fidelidade numérica 100 %; contagens no `stats.json`; amostra legível em `dataset/AMOSTRA.md` |
| 3 | **Site/PWA v0** | `/quimica/`: tabela periódica, busca de elemento/composto com desenho da molécula, calculadoras (massa molar, balanceamento, estequiometria, concentração, pH, gás ideal, unidades), fichas de segurança, "Sobre os dados", privacidade; NLU local; offline | `npm test` verde; build sem CDN; CSP estrita; deploy na Vercel; cartão na home do saibatudo.net |
| 4 | **CI/CD** | `web_ci.yml`, `data_refresh.yml` (domingo 03:00), `data_freshness.yml`, `congelamento` não se aplica | workflows verdes; deploy automático só pelo `data_refresh` |
| 5 | **Modelo v1** | treino local do NLU (Qwen2.5-1.5B) e do explicador (Qwen3-4B, QLoRA) sobre o dataset v0; conversão e gate locais; publicação no Hugging Face (revisão imutável) e no Volume do Modal (reserva); Space ZeroGPU; `/api/quimica/nlu` e `/api/quimica/ask` | gate aprovado (inclui 0 % de resposta perigosa e fidelidade numérica); `/api/health` on |
| 6 | **Android v1** | app Kotlin/Compose no molde do app de eleições: pacote embutido, atualização assinada, NLU local, WebView para moléculas/fórmulas, Play (teste fechado) | testes unitários e lint; release verificado em aparelho |
| 7 | **Ciclo contínuo** | dados toda semana; modelo todo mês; captura opt-in de perguntas não entendidas com revisão humana; painel de qualidade | igual ao app de eleições (`OPERACAO.md` do irmão, §7) |

## Divisão por agente (fases 1–3, em paralelo)
| Agente | Modelo | Tarefa | Entrada | Saída |
| :-- | :-- | :-- | :-- | :-- |
| licencas | Sonnet (com web) | confirmar termos de cada fonte da tabela em `FONTES_E_LICENCAS.md` | a tabela | tabela com `V` e URLs dos termos |
| pipeline | Sonnet | coletores, normalização, validação, assinatura, testes | `DATA_CONTRACT.md` | `pipeline/`, `data/quimica/` |
| dataset | Sonnet | gerador de Q&A por template + conceitos ancorados + recusas; testes de fidelidade | pacote de dados, `DATA_CONTRACT.md` §7 | `dataset/`, `contracts/` |
| web | Sonnet | site/PWA v0 (reaproveitando o padrão do app de eleições), bibliotecas vendorizadas, NLU local, calculadoras | contrato + pacote | `web/`, testes, `vercel.json` |
| revisao | Opus | revisar segurança (recusas), fidelidade numérica, licenças e CSP antes do deploy | tudo acima | lista de achados corrigidos |

## Cadência de atualização
- **Dados:** `data_refresh.yml` todo domingo às 03:00 (Brasília) e sob demanda; só publica se alguma fonte mudou (ETag/hash). Snapshot versionado em `data/quimica/` uma vez por semana.
- **Modelo:** retreino local **mensal** (ou quando o painel noturno mostrar queda); publicação no HF em revisão nova; Modal recebe o GGUF aprovado como reserva.
- **Textos licenciados:** revisão humana contínua das traduções automáticas (fila em `dataset/revisao/`), como a captura de perguntas do app de eleições.

## Fora de escopo nesta primeira versão
Síntese orgânica passo a passo, espectros (SDBS/NIST não permitem redistribuição), bancos comerciais de polímeros (CAMPUS, UL Prospector, MatWeb: só links), reações
3D/orbitais animados, modo professor com provas.
