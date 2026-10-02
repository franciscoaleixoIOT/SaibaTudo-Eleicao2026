# Arquitetura — SaibaTudo Eleições 2026

## 1. Visão geral

```
                         ┌───────────────── Fontes oficiais (TSE) ─────────────────┐
                         │ CDN/dados abertos (CSV/ZIP/PDF/JPG)   resultados.tse.jus.br (JSON ao vivo) │
                         └───────────────┬──────────────────────────────────────┬──┘
                                         │ fetch incremental (ETag)             │ consulta direta (CORS aberto)
                       ┌─────────────────▼─────────────────┐                    │
                       │ pipeline/ (GitHub Actions)        │                    │
                       │ fetch → ETL v2 → valida → ASSINA  │                    │
                       └─────────────────┬─────────────────┘                    │
                                         ▼                                      │
                          data/eleicoes2026  (manifest.json + .sig + shards)    │
              ┌──────────────────────────┼──────────────────────────┐           │
              ▼                          ▼                          ▼           │
   Android: snapshot nos assets   Site/PWA (Vercel): /data/…   Treino do NLU      │
   + atualização verificada       service worker + WebCrypto   (retreino raro)     │
   (WorkManager, ao abrir)                                                        │
              │                          │                                        │
              └────────── IA local-first ┴───────────────► apuração ao vivo ◄──────┘
                                  │ (somente se o usuário consentiu e o NLU local não entendeu)
                                  ▼
                       Vercel /api/nlu  (valida, limita, cacheia)  ──►  Modal (CPU, llama.cpp, scale-to-zero)
                       Vercel /api/report  ──►  issue pública no GitHub
```

## 2. Camadas do app Android (`net.saibatudo.eleicoes2026`)

| Camada | Pacote | Responsabilidade |
| :-- | :-- | :-- |
| UI (Compose, MVVM) | `ui/` | `MainViewModel` (StateFlow), telas (principal, onboarding, configurações, sobre os dados), componentes, tema claro/escuro/sistema e escala de fonte |
| Domínio | `domain/` | modelos (`Candidate`, `Elegibilidade`, `FaseEleitoral`…), `CandidateQuery` (filtros determinísticos, ordem fixa), `MenuFactory` |
| IA | `ai/` | `LocalNlu` (regras) → `ParsedQuery` → `AnswerBuilder` (respostas só dos dados) · `CloudNluClient` + `NluValidator` · `HybridAiInferenceEngine` (local-first) |
| Dados | `data/` | `bundle/` (manifesto, verificação ECDSA, `DataUpdater`, `BundleStore`, WorkManager) · `datasource/BundleLoader` · `live/` (apuração do TSE) · `prefs/` (DataStore) · `remote/` (relato) |
| DI | `di/AppContainer` | injeção manual; sem frameworks pesados |

Fluxo de uma pergunta: `texto → LocalNlu.parse → ParsedQuery → AnswerBuilder(dados, fase, apuração) → AiMenuResponse (texto + filtros + fonte)`.
Se `resolvida = false` **e** a IA na nuvem estiver ligada: `CloudNluClient` → `NluValidator` (descarta alucinações) → `AnswerBuilder`. O texto exibido **nunca** é gerado por modelo.

## 3. Pacote de dados e atualização
Contrato em [`DATA_CONTRACT.md`](DATA_CONTRACT.md). O app abre com o **snapshot** (assets) e mantém uma versão baixada em `filesDir/bundles/<versão>/`;
a troca é **atômica** e só acontece com assinatura ECDSA válida, `sha256`/tamanho conferidos, `schemaVersion` suportado e `generatedAt` ≥ ativo (anti-rollback).
Apenas arquivos alterados são baixados (delta por shard). Se a versão baixada corromper, volta ao snapshot.

## 4. Fases do calendário
`PRE_ELEICAO → DIA_1T → ENTRE_TURNOS → DIA_2T → POS_ELEICAO` (fuso de Brasília; datas em `regras.json`). A fase muda menus (aparece "Resultados"), faixa informativa,
respostas (calendário, resultados, 2º turno) e a cadência de verificação (15 min em dias de votação). Resultados: **ao vivo** direto do TSE (cache 60 s, ETag, cache negativo)
e **definitivos** pelos arquivos abertos assim que o TSE publicar.

## 5. Segurança e privacidade
Sem chaves de IA no app; chave **pública** de verificação embutida; segredos (assinatura de dados, Modal, GitHub) só em CI/Vercel; HTTPS obrigatório (`usesCleartextTraffic=false`);
backup desativado; R8 ativo; permissões mínimas (`INTERNET`, `ACCESS_NETWORK_STATE`); validação rígida da saída da nuvem. Ver [`PRIVACIDADE.md`](PRIVACIDADE.md) e [`BACKEND.md`](BACKEND.md).

## 6. Decisões e alternativas descartadas
- **GPU no Modal / Hugging Face Endpoints:** descartados por custo (cold start cobrado; tráfego esparso). **CPU + scale-to-zero + local-first** mantém o custo próximo de zero.
- **Localização precisa / geocodificação em serviço externo:** descartadas. A UF é **sugerida** pela localização aproximada (permissão COARSE, só em primeiro plano) com a malha oficial do IBGE embutida (`data/geo/ufs.json`, 84 KB) e ponto-no-polígono **no aparelho**; a coordenada nunca sai do aparelho e não é gravada.
- **Anúncios:** descartados (confiança, associação política, Vercel Hobby não comercial, Google Ads veta conteúdo de candidatos).
- **"Ficha Limpa" calculada sobre dados não oficiais:** removida (marcava renúncias/pendências como "inelegíveis"). No lugar, uma
  derivação **determinística e rotulada** da situação oficial do registro e dos motivos do TSE ([`DATA_CONTRACT.md` §3.1](DATA_CONTRACT.md)).
- **Respostas em parágrafo corrido:** substituídas pelo formato em linhas (título; itens "• "; campos "Rótulo: valor"), que a interface
  formata sem alterar o conteúdo (`TextoResposta.kt` no app, renderização equivalente no site).
- **Campo de texto alimentado por `StateFlow`/DataStore:** causava cursor voltando e letras fora de ordem em teclados reais; a caixa de
  pergunta usa estado do Compose no ViewModel e o campo das Configurações usa estado local.
