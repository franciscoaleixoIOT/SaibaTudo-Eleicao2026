# Atualização contínua dos dados e da IA (inclusive depois das eleições)

**Ideia central:** a IA do app não "sabe" fatos — ela entende a pergunta e **os dados respondem**. Por isso, manter a IA atualizada
significa manter **os dados** atualizados (todo dia, sem retreinar nada) e retreinar o **modelo de linguagem** apenas quando surgir
vocabulário/intenção novos. São quatro camadas, da mais rápida para a mais lenta:

| Camada | O que atualiza | Como | Cadência | Precisa de nova versão do app? |
| :-- | :-- | :-- | :-- | :-- |
| **L0 — Apuração ao vivo** | votos e eleitos de Presidente, Governador e Senador | cliente consulta o JSON público do TSE (`resultados.tse.jus.br`), com cache 60 s, ETag e cache negativo | em dia de votação, enquanto a tela de resultados está aberta | Não |
| **L1 — Pacote de dados** | candidaturas (substituições, renúncias, indeferimentos), pesquisas, bens, **resultados oficiais, eleitos, 2º turno**, fases do calendário, vocabulário da IA (partidos/nomes) | GitHub Actions (`eleicoes-data-refresh.yml`): fetch por ETag → ETL → validação → **assinatura** → deploy; app/site baixam o delta | 5×/dia (alinhado às gerações do TSE) e a cada 30 min nas janelas pós-eleição; clientes checam a cada 15 min (dia de votação) / 6 h | **Não** |
| **L2 — Regras do NLU** | sinônimos, intenções novas tratadas por regras, textos de resposta | código do `LocalNlu`/`AnswerBuilder` + casos de referência (`contracts/nlu_golden_cases.json`) | por versão do app e do site (CI roda os mesmos casos em ambos) | Sim (versão leve) |
| **L3 — Pesos do modelo (nuvem)** | entendimento de perguntas ambíguas/novas | retreino do NLU (`backend/retrain/`), avaliação com gate (JSON válido ≥ 98 %, acerto de entidades), conversão GGUF Q4 e promoção por `MODEL_VERSION` no Modal | só quando surgirem intenções/vocabulário novos (previsto: pós-1º turno) | Não |

Se a nuvem estiver desligada, defasada ou fora do ar, **nada quebra**: o NLU local (L2) e os dados (L1/L0) respondem sozinhos.

## Linha do tempo eleitoral e o que acontece em cada fase

| Quando | Fase | Dados e IA |
| :-- | :-- | :-- |
| até 03/10 | `PRE_ELEICAO` | candidaturas/pesquisas: o TSE gera ~5×/dia e o pipeline checa a cada 30 min (ETag); substituições e indeferimentos chegam sozinhos |
| **04/10** | `DIA_1T` | votação 8h–17h (Brasília); a partir das 17h, apuração ao vivo (L0); clientes passam a checar o pacote a cada 15 min |
| 05–09/10 | `ENTRE_TURNOS` | CSVs oficiais de resultado (`votacao_candidato_munzona`) saem do estado "vazio" (1 byte): o pipeline detecta, gera `resultados/<UF>.json` e `situacaoTotalizacao` ("2º turno", "eleito") |
| 10–24/10 | `ENTRE_TURNOS` | candidatos ao 2º turno (Presidente/Governador) identificados por `DS_SIT_TOT_TURNO`; respostas "quem vai pro 2º turno?" |
| **25/10** | `DIA_2T` | apuração ao vivo do 2º turno (códigos `6258`/`6260`) |
| a partir de 26/10 | `POS_ELEICAO` | eleitos e votos definitivos; prestação de contas final (3/11 e 14/11 — conferir no calendário oficial do TSE); diplomação (dezembro); posse: Presidente 05/01/2027, Governadores 06/01/2027 |
| 2027 em diante | arquivo | pipeline semanal; app/site mantêm "Eleições 2026" como histórico; novas eleições = **novo app/pacote** (`SaibaTudo-eleicoesXXXX`) reaproveitando pipeline, contrato e NLU |

## Garantias do mecanismo
- **Verificado:** assinatura ECDSA P-256 do manifesto + `sha256`/tamanho de cada arquivo; schema e versão mínima do app; anti-rollback.
- **Atômico:** staging → ativação; falha mantém o pacote atual; versão corrompida volta ao snapshot embutido.
- **Econômico:** delta por shard; "Economia de dados" restringe a Wi-Fi.
- **Observável:** "Sobre os dados" mostra versão, extração do TSE, fontes (ETag/Last-Modified), última verificação e resultado da atualização.
- **Gates de qualidade no CI:** contagens mínimas, ids únicos, campos obrigatórios, queda anormal (> 20 %) bloqueia a publicação; testes JS/Kotlin sobre os dados reais.

## Runbook — noite de apuração (04/10 e 25/10)
1. Véspera: rode `workflow_dispatch` de `eleicoes-data-refresh.yml` e confira o resumo (fase, contagens). Confirme `vercel deploy` verde e o site abrindo.
2. Durante: acompanhe o fluxo em `resultados.tse.jus.br`; os clientes consultam o TSE diretamente (respeitando 100 req/IP/s). **Não faça sondagens agressivas** (muitos 404 bloqueiam o IP por ~10 min).
3. Após a totalização: `eleicoes-data-refresh.yml` publica os CSVs oficiais. Se atrasar, rode manualmente com `forcar`.
4. Incidente com a IA na nuvem: esvazie `MODAL_ENDPOINT` na Vercel (kill switch) — clientes caem no NLU local.
5. Dado errado: corrija a fonte/ETL, rode `workflow_dispatch`; clientes recebem o pacote corrigido no próximo ciclo (≤ 15 min em dias de votação).

## Pós-eleição: retreino do NLU (L3)
1. Gerar dataset novo: `python backend/retrain/build_nlu_dataset.py` (usa nomes/partidos/UFs reais do pacote e templates; **não** usa os casos de teste).
2. Treinar (RTX local com `ai_model/scripts/train_hybrid.py` ou job de GPU sob demanda no Modal) → fundir → `ai_model/scripts/test_inference.py`.
3. Converter para GGUF Q4_K_M no Modal (`backend/modal/convert_gguf.py`), que roda o **gate** com `contracts/nlu_golden_cases.json`; só promove se passar.
4. Publicar no HF (`ai_model/scripts/push_to_hub.py`), subir `MODEL_VERSION` e `modal deploy`. Rollback = redeploy da versão anterior.
