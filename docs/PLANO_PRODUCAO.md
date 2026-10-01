# Plano de produção — conferência, correções e execução

Estado em **01/10/2026** (faltam **3 dias** para o 1º turno, 04/10; 2º turno em 25/10). Este documento (1) confere o planejamento
recebido, (2) registra as correções/complementos — inclusive a **atualização contínua de dados e da IA, também após as eleições** —
e (3) mostra o que já foi executado e o que depende de ações manuais suas.

## 1. Conferência do planejamento recebido

| # | Item do plano | Veredito | Correção / complemento (com evidência) |
| :-- | :-- | :-- | :-- |
| 1 | Auditoria e integridade dos dados | ✅ confirmado, **com achados graves** | (a) "Ficha Limpa" era calculado como *deferido e sem motivo* e marcava **renunciados, falecidos e pendentes** como "com inelegibilidade" — removido; no lugar, a **situação oficial do julgamento** + motivos de indeferimento. (b) "Processos administrativos" era só a contagem de *motivos de indeferimento* — removido. (c) "Reeleição" era heurística errada (eleito em qualquer cargo + disputou o mesmo) e o campo oficial `ST_REELEICAO` vem `#NE`; agora **"já eleito para este cargo (histórico TSE)"**, rotulado como derivado. (d) Pablo Marçal (**indeferido, fora da urna**) aparecia como presidenciável; 1.069 registros estão fora da urna — o app agora distingue `naUrna`. (e) Dados tinham ~20 h de atraso (o TSE atualiza 5×/dia); fotos cobriam só BR+SP (2.658) e planos só 20 candidatos — agora fotos oficiais de todos os majoritários empacotadas e as demais pelo CDN oficial; 219 planos analisados. (f) CPF/título/e-mail **nunca** são publicados. Fontes que **faltavam** e foram incluídas: bens declarados, resultados (CSV + apuração ao vivo), fotos de todas as UFs, planos de todas as UFs; prestação de contas já está no pipeline (`--com-contas`, opcional) |
| 2 | IA e dados oficiais | ✅ confirmado e **reforçado** | A IA só interpreta; **toda resposta é montada dos dados** (ver `AnswerBuilder`); a saída da nuvem é revalidada contra os dados (descarta cargo/UF/partido/nome inventados). **Novo (verificado):** a **Res. TSE 23.755/2026 proíbe IAs de ranquear/recomendar/sugerir candidaturas, mesmo a pedido do usuário** → o app **recusa** recomendação/previsão e mantém ordem fixa. Telemetria: **nenhuma** (sem analytics/crash SDK); só "Relatar problema" iniciado pelo usuário |
| 3 | Modal vs Hugging Face | ✅ confirmado, **agora com números** | Ver §3. Recomendação: **local-first + Modal em CPU (llama.cpp GGUF Q4) atrás de proxy na Vercel**; custo-alvo **US$ 0–poucos/mês** (créditos gratuitos de US$ 30 do Modal). GPU não compensa (cold start cobrado). O HF Pro de US$ 9 **deixa de ser necessário** para o fluxo (repo do modelo público) — confirmar antes de cancelar |
| 4 | Arquitetura Android | ✅ executado | Pacote `net.saibatudo.eleicoes2026`, MVVM/StateFlow, DataStore, injeção manual, R8 ligado, `largeHeap`/backup removidos, APK ~8 MB (antes 38 MB), AAB assinado com chave de upload |
| 5 | Design, acessibilidade, conteúdo | 🟡 parcial | Feitos: tema claro/escuro/sistema, 4 tamanhos de texto, rótulos de acessibilidade, "Sobre os dados", avisos de neutralidade, simulador marcado como educativo, ícone/logotipo próprios. **Pendente (manual):** passada com TalkBack, tablets e orientação horizontal |
| 6 | Monetização | ✅ confirmado: **sem anúncios** | Vercel Hobby é **não comercial** (anúncios violariam); Google Ads veta conteúdo de candidatos; confiança e neutralidade. Se precisar de receita no futuro: apoio voluntário/patrocínio institucional não partidário, nunca no resultado das consultas |
| 7 | Testes e qualidade | ✅ executado | 39 testes unitários (dados reais, NLU 46 casos, respostas, atualizador com falha/adulteração/rollback, apuração), 2 instrumentados em dispositivo (passam), 9 de pipeline (Python), lint limpo, R8 testado no emulador (achou e corrigiu crash do WorkManager no release). **Pendente (manual):** Pre-launch report do Play, rodada com testadores |
| 8 | Conformidade Play Store | 🟡 preparado; **envio é manual** | Correções ao plano: (a) conta **pessoal nova** exige **teste fechado com 12 testadores por 14 dias** → produção só em ≈ meados de novembro; (b) `targetSdk ≥ 36` (temos 37); (c) **verificação de desenvolvedor** no Brasil desde 30/09/2026 para APK fora da Play; (d) política de **IA exige relato dentro do app** (feito); (e) evitar categoria "Notícias". Ver [`PLAY_STORE.md`](PLAY_STORE.md) |
| 9 | README, memória, licença | ✅ executado | README, contrato de dados, arquitetura, privacidade, backend, memória atualizados. **Licenças:** código MIT; dados **CC BY** (atribuição no app/site/manifesto); fotos do TSE; fonte Poppins OFL; **pesos do modelo = Qwen2.5-1.5B (verificar licença da base) — MIT do código não os licencia** |
| 10 | Site na Vercel | ❌ **corrigido** | O plano propunha só um site institucional, mas o pedido era um **botão que abre o app Eleições 2026 com o mesmo modelo do Android, instalável como app web (Android, iPhone, Windows)**. Entregue: home do ecossistema + **PWA completo** em `/eleicoes2026` (mesmo NLU/filtros/urna/resultados), com base para futuros apps |
| — | Ordem de execução proposta | 🔁 **ajustada** | O PWA **não passa por revisão** e é o único canal que alcança eleitores antes de 04/10 → ordem: dados → app (pronto) → **site/PWA** → backend de IA → Play (processo longo, em paralelo) |

## 2. Novo: atualização contínua dos dados e da IA (inclusive pós-eleição)
Resumo (detalhes e runbook em [`ATUALIZACAO_DADOS_E_IA.md`](ATUALIZACAO_DADOS_E_IA.md)):
- **Dados atualizam sem nova versão do app** (pacote assinado; GitHub Actions 5×/dia e a cada 30 min nas janelas pós-eleição; clientes checam a cada 15 min em dias de votação).
- **Resultados em 3 níveis:** apuração ao vivo direto do TSE → CSV oficiais de votação assim que publicados → eleitos/2º turno/posse; a **fase do calendário** muda menus e respostas.
- **A IA "aprende" pelos dados** (partidos/nomes/UFs vêm do pacote). Os **pesos** do modelo só são retreinados quando surgirem intenções novas (pipeline `backend/retrain/`, gate de qualidade, versão `MODEL_VERSION`); sem a nuvem, o NLU local cobre tudo.
- Depois de 2026: o pipeline/contrato/NLU são reaproveitados para novos apps (`SaibaTudo-eleicoesXXXX`).

## 3. Modal vs Hugging Face — decisão com custos (pesquisa de 01/10/2026; **estimativas não medidas**)
| Opção | Custo mensal esperado | Observações |
| :-- | :-- | :-- |
| **Local-first + Modal CPU (4 cores, GGUF Q4)** ✅ | **US$ 0** até ≈ 30–50 mil chamadas ao LLM (cobertas pelos US$ 30 de crédito); ≈ US$ 10 por 10 mil se *toda* pergunta fosse à nuvem | cold start 3–5 s (cobrado), 4–6 s/resposta; só perguntas **não entendidas** e **consentidas** vão à nuvem |
| Modal GPU (T4/L4) | US$ 35–120 (10 mil) … US$ 260–1.000 (200 mil) | cold start 30–60 s cobrado; evitar |
| HF Inference Endpoint | US$ 48–360 se não desligar (mín. 15 min ocioso, 502 no cold start) | evitar |
| HF Space CPU grátis | US$ 0 | 8–20 s/resposta, sem SLA: só backup |
| HF Pro (US$ 9) | US$ 9 fixo | não é necessário para este fluxo |

Proteções: sem chave no APK; proxy Vercel valida/limita/cacheia; `max_containers` 1–2; **spend limit** do workspace Modal; **kill switch** (esvaziar `MODAL_ENDPOINT`). Ver [`BACKEND.md`](BACKEND.md).
**Riscos:** latência/custo reais só serão conhecidos após benchmark no Modal; qualidade do Q4 precisa passar o gate (JSON válido ≥ 98 %); Vercel Hobby pausa recursos ao estourar cotas.

## 4. O que foi executado

| Frente | Entrega | Onde |
| :-- | :-- | :-- |
| Dados | pipeline reprodutível (ETag, ETL v2, validação, manifesto + assinatura ECDSA), snapshot oficial de 01/10/2026 | `pipeline/`, `data/eleicoes2026/`, [`DATA_CONTRACT.md`](DATA_CONTRACT.md) |
| App | app novo (MVVM), atualização assinada, IA local-first, apuração ao vivo, fases, onboarding/configurações/sobre os dados/relato, simulador educativo, ícone, release R8 | `app/` |
| Marca | símbolo, logotipos, ícones (Play/PWA/Android), gráfico de recursos | `brand/`, `store/` |
| Site/PWA | home do ecossistema + PWA Eleições 2026 | `web/`, `vercel.json` |
| Backend IA | `/api/nlu`, `/api/report`, app Modal, conversão GGUF, retreino | `api/`, `backend/`, [`BACKEND.md`](BACKEND.md) |
| Operação | CI Android, CI web/API, atualização agendada de dados | `.github/workflows/` |
| Documentação | plano, README, arquitetura, privacidade, Play Store, atualização contínua, memória | `docs/` |

## 5. O que depende de você (ações manuais, em ordem)

1. **Hoje:** abrir **Vercel**, importar o repositório (raiz do repo; `vercel.json` já define build/saída), configurar o domínio **saibatudo.net** e as variáveis de ambiente de [`BACKEND.md`](BACKEND.md) → o PWA e `/data/eleicoes2026/` ficam no ar (alcança eleitores antes de 04/10).
2. **Hoje:** criar os **segredos do GitHub**: `DATA_SIGNING_KEY` (conteúdo de `secrets/data_signing_key.pem` — **faça backup**), `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `UPLOAD_KEYSTORE_B64` + `UPLOAD_KEYSTORE_PASSWORD` (opcional, release por tag). Rode `data_refresh.yml` manualmente uma vez.
3. **Hoje:** **backup** de `secrets/upload-keystore.p12` + `keystore.properties` e de `secrets/data_signing_key.pem` (cofre de senhas + cópia offline). Perder a chave de **dados** exige novo app com nova chave pública.
4. **Play Console:** verificar tipo/data da conta (define o teste fechado); criar o app; preencher *App content* e *Data safety* ([`PLAY_STORE.md`](PLAY_STORE.md)); informar **e-mail de contato** (também em `docs/PRIVACIDADE.md` e na página de privacidade); teste interno → fechado (12 testadores/14 dias, se aplicável) → produção.
5. **Modal (opcional, após 04/10 se preferir):** criar conta/token, rodar `convert_gguf.py` (gate), `modal deploy`, Proxy Auth Token, **spend limit**, configurar variáveis na Vercel. Até lá o app/site funcionam 100 % sem a nuvem.
6. **Hugging Face:** atualizar o model card ([`ai_model/README.md`](../ai_model/README.md) já reescrito localmente) quando publicar a nova versão; avaliar cancelar o Pro.
7. **Verificação de desenvolvedor Android** e registro do pacote, se for distribuir APK fora da Play.

## 6. Riscos abertos
- **Play não publica antes do 1º turno** (nem do 2º, se a conta for pessoal nova) → PWA é o canal principal em outubro.
- **TSE/Akamai** pode bloquear IPs de CI ou clientes (muitos 404; 100 req/IP/s): o pipeline tem backoff/ETag; rode um *dry run* do workflow antes de 04/10.
- **Formato dos resultados**: o JSON ao vivo (`-u.json`) e os CSV pós-apuração foram verificados pelo esquema atual/2022; confirmar na noite de 04/10 (há testes com o cabeçalho real).
- **Qualidade/custo da IA na nuvem** não medidos em produção (ver §3); o app é plenamente funcional sem ela.
- **Licença do modelo base** a confirmar; **textos jurídicos** (privacidade/termos) devem passar por revisão sua; **e-mail de contato** ainda é um campo a preencher.
