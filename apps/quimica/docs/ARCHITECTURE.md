# Arquitetura — SaibaTudo Química

> Segundo app do ecossistema SaibaTudo, no mesmo molde do **SaibaTudo Eleições 2026** (repositório irmão, `../SaibaTudoEleicao2026`): local-first, código aberto (MIT),
> sem anúncios, dados **licenciados e com fonte**, e uma IA que **explica** mas **não inventa números**. Rota no site: `https://saibatudo.net/quimica/`. Pacote Android:
> `net.saibatudo.quimica`.

## 1. Princípios (política de dados e de IA)

1. **Só fontes abertas e licenciadas, com fonte em cada resposta.** PubChem e CODATA (domínio público), Wikidata (CC0), OpenStax *Chemistry 2e* (CC BY 4.0), LibreTexts
   (CC BY-NC-SA 4.0), fichas ICSC da OIT/OMS, IUPAC (pesos atômicos e símbolos: fatos). O que não tem licença de reuso é **referência para a pessoa que revisa**, não entra
   no repositório, no dataset nem no modelo (ver `FONTES_E_LICENCAS.md`). Isso inclui os livros didáticos comerciais da pasta local `LivrosQuimica`.
2. **Cálculo é determinístico e roda no aparelho.** Massa molar, balanceamento, estequiometria, concentração/diluição, pH de ácidos e bases fortes, gás ideal, conversão de
   unidades: código testado, nunca modelo. O modelo não faz conta.
3. **A IA explica; os dados respondem.** Todo número, constante, propriedade ou classificação de perigo exibido vem do pacote de dados assinado ou de um cálculo local.
   O texto gerado é rotulado ("texto gerado por IA, pode conter erros") e o servidor **descarta** respostas com números que não estão nos dados enviados.
4. **Segurança química primeiro.** O app responde sobre perigos, EPIs e primeiros socorros (ICSC/GHS), mas **recusa** rotas de síntese, purificação ou escalonamento de
   explosivos, agentes químicos de guerra, drogas ilícitas e precursores controlados, e qualquer pedido de "como fazer em casa" com reagentes perigosos. A recusa é
   decidida por regras **antes** de qualquer modelo (`seguranca.js`, espelhado no Android), e o verificador do texto gerado rejeita respostas que escapem.
5. **Local-first e privado.** Funciona offline com o pacote embutido. Sem login, anúncios ou analytics. Nada é enviado sem toque ou consentimento, como no app de eleições.
6. **Atualização assinada e semanal.** O pacote de dados (ECDSA P-256) é refeito **toda semana** (domingo 03:00 de Brasília) e só publicado se uma fonte mudou; o
   modelo é retreinado **mensalmente** ou quando o gate indicar, sempre **localmente** (decisão do mantenedor: GPU local, Modal só serve).

## 2. Visão geral

```
PubChem · Wikidata · CODATA · OpenStax · LibreTexts · ICSC · IUPAC ──► pipeline/ (coleta com cache → normaliza → valida → assina) ──► data/quimica/ (pacote)
                                                   │ GitHub Actions: semanal (domingo), só publica se mudou
        ┌──────────────────────────────────────────┼──────────────────────────────────────────────┐
        ▼                                          ▼                                              ▼
 app Android (pacote embutido +            site/PWA na Vercel (/quimica/)                 IA opcional (opt-in):
 atualização assinada, WorkManager)        mesmo pacote em /quimica/data/                 /api/quimica/nlu  → Modal CPU (interpretação, JSON)
 WebView p/ desenho de moléculas           SmilesDrawer + KaTeX + SVG                     /api/quimica/ask  → Space ZeroGPU do HF (explicação), Modal L4 reserva
```

### 2.1 Fluxo de uma pergunta
1. **Segurança** (`seguranca.js` / `Seguranca.kt`): pedido de síntese perigosa → recusa com orientação (não chega a modelo nenhum).
2. **NLU local** por regras + dicionário derivado dos dados (nomes PT/EN/IUPAC, sinônimos do PubChem, símbolos): intenção + entidades (elemento, composto, propriedade,
   quantidade com unidade, equação). Mesma ordem de regras no site (`nlu.js`) e no Android (`LocalNlu.kt`), conferida por `contracts/nlu_golden_cases.json`.
3. **Resposta montada dos dados** (`answers.js` / `AnswerBuilder.kt`): perfil de elemento, ficha de composto, propriedade pedida, cálculo com passos, ficha de segurança,
   estrutura desenhada. Cada bloco traz fonte e licença.
4. **Nuvem, só com consentimento:** se o NLU local não entendeu, `/api/quimica/nlu` reinterpreta (modelo pequeno, JSON, revalidado contra os dados locais). Se a pessoa toca em
   "Explicar com IA", `/api/quimica/ask` gera uma explicação **ancorada** nos trechos licenciados e nos dados que o app já exibiu; o servidor verifica (números, segurança,
   contradição com os dados) antes de devolver.

### 2.2 O que o modelo faz e o que não faz
| Faz | Não faz |
| :-- | :-- |
| Interpretar perguntas livres (intenção + entidades), inclusive com erros de digitação e nomes populares | Fornecer números: massa, ponto de fusão, pKa, constantes vêm do pacote |
| Explicar conceitos **a partir de trechos licenciados** (RAG), citando-os | Rotas de síntese perigosas, dosagens, uso recreativo |
| Reformular em linguagem acessível (fundamental, médio, superior) | Afirmar fato que não esteja nos trechos ou nos dados enviados |

## 3. Desenho de informação (o que é visual em química)
| Necessidade | Site/PWA | Android | Observação |
| :-- | :-- | :-- | :-- |
| Estrutura 2D de moléculas | **SmilesDrawer** (MIT, vendorizado, sem CDN) a partir do SMILES do PubChem | WebView local com o mesmo SmilesDrawer (HTML embutido nos assets) | SMILES vem do pacote; nada é desenhado "de cabeça" |
| Fórmulas e equações | **KaTeX** (MIT, vendorizado, fontes locais) | WebView local com KaTeX, ou texto Unicode (sub/sobrescrito) nos cartões | Equações balanceadas pelo código local |
| Tabela periódica interativa | SVG gerado dos dados (`elementos.json`), com filtros por bloco/grupo/estado | Compose Canvas/LazyGrid a partir do mesmo JSON | Cores por categoria, acessível (nome lido por leitor de tela) |
| Gráficos (curva de titulação, Maxwell-Boltzmann, PV) | SVG desenhado por função determinística | Compose Canvas | Só a partir de cálculo local |
| Pictogramas GHS | SVG oficiais (UNECE, uso livre) | drawables | Com texto alternativo |

O CSP do site continua estrito (`script-src 'self'`): toda biblioteca é vendorizada em `web/src/quimica/vendor/` com a licença ao lado.

## 4. Modelo de IA

| Decisão | Escolha | Por quê |
| :-- | :-- | :-- |
| Base para **explicação** (ask) | **Qwen3-4B-Instruct-2507** | Já está no cache local; forte em português; 4B cabe em QLoRA 4-bit na RTX 5060 (8 GB) com `max_length 1024`; qualidade de explicação muito acima dos 1,5B. Alternativas avaliadas: Gemma 3 4B (licença mais restritiva), Llama 3.2 3B (pior em PT), Qwen2.5-1.5B (bom só para JSON). |
| Base para **interpretação** (nlu) | **Qwen2.5-1.5B-Instruct** (mesmo fluxo do app de eleições) | Rápido em CPU no Modal (GGUF Q4, ~1 s), formato JSON com gramática, gate já pronto. |
| Treino | **Local** (QLoRA, `ai_model/scripts/train_hybrid.py` do projeto irmão, generalizado) | Decisão do mantenedor; custo zero. |
| Conversão e gate | **Local** (`backend/modal/convert_local.py` do projeto irmão, generalizado) | Só o arquivo aprovado sobe. |
| Publicação | **Hugging Face** (repo de modelo `franciscoaleixo/SaibaTudo-Quimica-NLU` e `-Ask`, revisões imutáveis) e **Modal** como reserva (Volume `saibatudo-quimica-models`) | Pedido do mantenedor: HF principal, Modal backup. |
| Serviço de explicação | Space privado no **ZeroGPU** (cota de 40 min/dia da conta PRO), Modal L4 reserva com teto diário baixo | Mesmo desenho já medido no app de eleições (3 s de GPU por resposta). |
| Cadência | Dados: **semanal**. Modelo: **mensal** ou quando o gate reprovar a produção no painel noturno | "Atualizações constantes com periodicidade menor". |

Dataset de treino: `dataset/` (ver `DATA_CONTRACT.md` §5). Gate: igual ao do app de eleições (JSON válido, intenção, entidades, alucinação, holdout) **mais** um gate de
segurança (0 % de resposta a pedidos perigosos) e um de fidelidade (números da explicação ⊂ números dos trechos).

## 5. Pastas
```
pipeline/      coleta (cache por ETag), normalização, validação, assinatura        web/           site + PWA em JS puro (sem CDN), build próprio
data/quimica/  pacote assinado (manifest.json + manifest.sig + json por família)   api/           funções Vercel: health, nlu, ask, report
app/           Android (Kotlin/Compose), molde do app de eleições                  backend/       Modal (nlu, convert_local), Space do HF, retreino
contracts/     casos compartilhados Android×site×servidor                           dataset/       perguntas e respostas com proveniência (treino e avaliação)
tools/         verificações do CI                                                   docs/          este arquivo, DATA_CONTRACT, FONTES_E_LICENCAS, PLANO, PRIVACIDADE
```

## 6. Diferenças em relação ao app de eleições (para quem vem de lá)
- Não há "neutralidade eleitoral"; o equivalente é a **recusa de química perigosa** (§1.4) e a **fidelidade numérica**.
- O pacote de dados é grande (centenas de milhares de compostos no PubChem): o app embute um **núcleo** (118 elementos, ~2.000 compostos comuns, constantes, textos) e
  consulta o restante **sob demanda** no site (`/quimica/data/compostos/<lote>.json`) ou, opcionalmente, direto no PubChem (domínio público, com consentimento, como a
  apuração do TSE no app de eleições).
- Desenho de moléculas e fórmulas exige bibliotecas vendorizadas e, no Android, uma WebView local.
