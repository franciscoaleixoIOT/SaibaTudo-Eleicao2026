# Contrato de dados — pacote `eleicoes2026`

Fonte única de verdade para **Android**, **site/PWA** e **treino da IA**. Gerado por [`pipeline/`](../pipeline) a partir
**exclusivamente** de arquivos oficiais do TSE (licença CC BY). Versão do esquema: `schemaVersion = 1`.

> Princípios: (1) todo campo vem do TSE ou é uma derivação determinística **rotulada**; (2) ausência de dado = ausência
> de campo (nunca valor padrão "conveniente"); (3) o pacote é **assinado**; (4) nada de dados fictícios/simulados.

## 1. Layout

```
data/eleicoes2026/              (snapshot versionado no Git; o site publica o mesmo layout em /data/eleicoes2026/)
├── manifest.json               versão, fase, fontes (URL/ETag/sha256), arquivos (sha256/bytes), cliente
├── manifest.sig                ECDSA P-256 / SHA-256, assinatura DER em Base64 sobre os BYTES de manifest.json
├── regras.json                 calendário, ordem da urna, estatísticas, glossário, códigos do sistema de resultados do TSE
├── pesquisas.json              pesquisas registradas (PesqEle)
├── fontes.json                 TREs e órgãos oficiais (links)
├── candidatos/<UF>.json        candidaturas por UF ("BR" = Presidente/Vice) — array
├── resultados/<UF>.json        (somente quando o TSE publicar) { "<sq>": {situacaoTotalizacao?, "1":{…}, "2":{…}} }
└── fotos/<sq>.jpg              fotos oficiais de majoritários (Presidente, Governador, Senador + vices)
```

Chave pública de verificação: `pipeline/data_signing_public.pem` (PEM) / `pipeline/data_signing_public.b64`
(X.509 SubjectPublicKeyInfo em Base64). A chave privada fica **somente** no segredo `DATA_SIGNING_KEY` do CI.

## 2. `manifest.json`

| Campo | Descrição |
| :-- | :-- |
| `schemaVersion` | inteiro; clientes rejeitam versões maiores que a suportada |
| `dataVersion` | `<timestamp UTC>-<hash>`; muda quando o conteúdo muda |
| `generatedAt` | ISO UTC; clientes só aceitam pacote **igual ou mais novo** que o ativo (anti-rollback) |
| `extracaoTse` | `DT_GERACAO HH_GERACAO` do CSV de candidatos do TSE (horário de Brasília) |
| `faseEleitoral` | `PRE_ELEICAO` · `DIA_1T` · `ENTRE_TURNOS` · `DIA_2T` · `POS_ELEICAO` (clientes recalculam localmente com `regras.turno1/turno2`) |
| `resultadosDisponiveis` | há `resultados/*.json` |
| `contagens` | candidaturas, naUrna, pesquisas, candidatosComFoto, fotosEmpacotadas |
| `atribuicao` | texto de atribuição CC BY + aviso de independência |
| `cliente.pollIntervalMinutes` | 360 normal; 15 em dias de votação/apuração |
| `cliente.baseUrl` / `cliente.nlu.endpoint` | onde baixar atualizações / endpoint do NLU opcional |
| `fontes[]` | `id, descricao, url, licenca, etag, lastModified, sha256, coletadoEm` de cada arquivo oficial usado |
| `arquivos[]` | `path, bytes, sha256, records?` de cada arquivo do pacote |

## 3. `candidatos/<UF>.json`

Array ordenado por (cargo, número, nome). Campos (ausentes quando sem dado):

| Campo | Origem / regra |
| :-- | :-- |
| `id` | `SQ_CANDIDATO` (único) |
| `numero`, `nomeUrna`, `nomeCompleto` | `consulta_cand` |
| `cargo` | `PRESIDENTE · VICE_PRESIDENTE · GOVERNADOR · VICE_GOVERNADOR · SENADOR · SUPLENTE_1 · SUPLENTE_2 · DEPUTADO_FEDERAL · DEPUTADO_ESTADUAL · DEPUTADO_DISTRITAL` |
| `dsCargo`, `digitosUrna`, `ordemVotacao` | texto do TSE e regras da urna |
| `partido`, `nomePartido`, `numeroPartido`, `federacao`, `siglaFederacao`, `coligacao` | `consulta_cand` |
| `estadoUf`, `regiao` | `SG_UF` (`BR` = nacional) e macro-região |
| `municipioNascimento`, `ufNascimento`, `idade`, `genero`, `corRaca`, `grauInstrucao`, `estadoCivil`, `ocupacao` | `consulta_cand` / complementar |
| `situacao` | `DS_SITUACAO_JULGAMENTO` (texto oficial) |
| `elegibilidade` | enumeração estável: `DEFERIDA · DEFERIDA_COM_RECURSO · INDEFERIDA · INDEFERIDA_COM_RECURSO · RENUNCIA · FALECIDO · CANCELADA · PENDENTE · NAO_CONHECIDO · DESCONHECIDA`. **Não é "Ficha Limpa"**: é o julgamento do registro |
| `naUrna` | `ST_CANDIDATO_INSERIDO_URNA == SIM` |
| `motivosIndeferimento[]` | `motivo_cassacao` (texto oficial) |
| `vezesEleito`, `eleicoesDisputadas` | **derivado** do `historico_candidatura` (eleito = "Eleito/Eleito por QP/Eleito por média") |
| `eleitoMesmoCargo` | **derivado**: eleito antes para o mesmo cargo (não significa mandato em exercício) |
| `redesSociais[]` | `rede_social_candidato` (URL normalizada) |
| `declaraBens`, `patrimonioDeclarado`, `qtdBens` | `bem_candidato` (soma dos bens declarados pelo próprio candidato) |
| `contas` | **prestação de contas** (receitas e despesas contratadas somadas por candidato) de `prestacao_de_contas_eleitorais_candidatos_2026`: `{receitas, despesasContratadas, tipo ("PARCIAL"/"RELATÓRIO FINANCEIRO"/final), geradoEm}`; valores mudam até a prestação final |
| `prestouContas`, `substituido` | `consulta_cand_complementar` |
| `temPlanoGoverno`, `temasPlano[]` | **derivado**: PDFs oficiais de proposta de governo; temas por palavras-chave (≥ 8 menções, até 4 por densidade). Indica conteúdo citado, não avaliação |
| `foto` | caminho `fotos/<sq>.jpg` (somente majoritários, empacotada) |
| `temFoto` | foto oficial existe no CDN do TSE (ver §6) |

**Campos que NÃO existem (de propósito):** `fichaLimpa`, `processosAdministrativos`, `reeleicao`. O TSE não publica essas
classificações; o campo oficial `ST_REELEICAO` vem `#NE` em 2026. CPF, título de eleitor e e-mail **nunca** são publicados.

### 3.1 Ficha Limpa — derivação nos clientes (app e site)

A "Ficha Limpa" **não vem no pacote**: app (`FichaLimpa.de`, `DomainModels.kt`) e site calculam, com a mesma regra
determinística, a partir de `elegibilidade` e `motivosIndeferimento` (textos oficiais). A Lei da Ficha Limpa (LC 135/2010)
é aplicada pela Justiça Eleitoral no julgamento do registro; por isso o rótulo é sempre exibido **junto** da situação e dos
motivos oficiais, com a ressalva "não é certidão; pode caber recurso".

| Situação oficial (+ motivo) | Ficha Limpa exibida |
| :-- | :-- |
| `DEFERIDA`, `DEFERIDA_COM_RECURSO` | Sem impedimento reconhecido (+ "com recurso pendente") |
| indeferida + motivo contendo "Inelegibilidade infraconstitucional" (LC 64/90) | Inelegibilidade reconhecida (LC 64/90, alterada pela Lei da Ficha Limpa) |
| indeferida + "Inelegibilidade constitucional" | Inelegibilidade constitucional (CF, art. 14) — não é Ficha Limpa |
| indeferida + outros motivos (DRAP, quitação, requisito formal, desincompatibilização…) | Registro indeferido por outro motivo |
| indeferida sem motivo publicado | Registro indeferido (motivo não detalhado) |
| `PENDENTE` | Aguardando julgamento |
| `RENUNCIA`, `CANCELADA`, `FALECIDO`, `NAO_CONHECIDO` | Não se aplica (fora da disputa) |

"Indeferida" = `INDEFERIDA` ou `INDEFERIDA_COM_RECURSO`. Na extração de 01/10/2026: 19.122 sem impedimento, 108 inelegíveis
pela LC 64/90, 29 por inelegibilidade constitucional.

## 4. Resultados (`resultados/<UF>.json`)

`{ "<sq>": { "situacaoTotalizacao": "ELEITO | ELEITO POR QP | ELEITO POR MÉDIA | SUPLENTE | NÃO ELEITO | 2º TURNO", "1": {"votos": n, "percentual": x, "situacao": "…"}, "2": {…} } }`.
Origem: `votacao_candidato_munzona_2026` (votos nominais válidos) e `DS_SIT_TOT_TURNO` de `consulta_cand`. O TSE publica o
arquivo vazio (1 byte) antes da apuração; o pipeline trata como "ainda não publicado". Comparações de situação devem
ser case/acento-insensíveis.

## 5. Apuração ao vivo (JSON público do TSE)

`https://resultados.tse.jus.br/oficial/ele2026/{cd}/dados/{uf}/{uf}-c{cargo:04d}-e{cd:06d}-u.json`
- `cd`: `6257` (federal, 1º turno) / `6258` (2º) para Presidente (`uf = br`); `6259` / `6260` para Governador, Senador e Deputados.
- `cargo`: 1 Presidente, 3 Governador, 5 Senador, 6 Dep. Federal, 7 Dep. Estadual, 8 Dep. Distrital (também em `regras.resultadosTse`).
- Campos usados: `dg/hg` (geração), `tf` (`s` = totalização final), `s.pst` (% seções totalizadas),
  `carg[0].agr[].par[].cand[]` → `n` (número), `sqcand`, `nmu`, `vap` (votos), `pvap` (%), `e` (`s` = eleito).
- Boas práticas obrigatórias (limites do TSE): cache ≈ 60 s, `If-None-Match`, ≥ 500 ms entre chamadas, cache negativo de
  5 min para erros (muitos 404 causam bloqueio do IP), **exibir os números exatamente como publicados**.
- CORS aberto: clientes (app/site) consultam direto; o servidor SaibaTudo não faz proxy.

## 6. Fotos

- Majoritários: `fotos/<sq>.jpg` (empacotadas, offline).
- Demais: `https://resultados.tse.jus.br/oficial/ele2026/{6257 se estadoUf=BR senão 6259}/fotos/{uf em minúsculas}/{sq}.jpeg`
  **somente quando `temFoto = true`** (evita 404 em massa).

## 7. Protocolo de atualização (clientes)

1. `GET {baseUrl}manifest.json` + `manifest.sig`; verificar a assinatura com a chave pública embutida.
2. Rejeitar se `schemaVersion` > suportado, `cliente.minAppVersionCode` > versão do app, ou `generatedAt` < ativo.
3. Se `dataVersion` igual ao ativo → nada a fazer.
4. Baixar **somente** arquivos cujo `sha256` mudou (os demais vêm do pacote ativo); conferir `sha256` e `bytes` de cada um.
5. Montar em área temporária e **ativar atomicamente**; falha em qualquer etapa mantém o pacote atual.
6. Intervalo: `cliente.pollIntervalMinutes`; Android também via WorkManager (a cada ~3 h) e ao abrir o app.

## 8. Fases do calendário

`FaseEleitoral.de(hoje, turno1, turno2)` (fuso America/Sao_Paulo): `hoje < t1` PRE · `== t1` DIA_1T · `< t2` ENTRE_TURNOS ·
`== t2` DIA_2T · `> t2` POS. Resultados/menus mudam com a fase; a IA responde conforme a fase.

## 9. Contrato do NLU

O NLU (regras locais **ou** modelo na nuvem) só produz `ParsedQuery`; os fatos exibidos vêm sempre do pacote.
Casos de referência compartilhados (Android e Web): [`contracts/nlu_golden_cases.json`](../contracts/nlu_golden_cases.json).
Intenções (contrato v2): `LISTAR_CANDIDATOS, PERFIL_CANDIDATO, CONTAR, PESQUISAS, CALENDARIO, LOCAL_VOTACAO, REGRAS_URNA,
REGRAS_VOTO, SENADO_DOIS_VOTOS, ELEGIBILIDADE, PLANO_GOVERNO, CONTAS_CAMPANHA, RESULTADOS, SEGUNDO_TURNO, PATRIMONIO, FONTES,
SOBRE_DADOS, SIMULADOR, AJUDA, RECOMENDACAO, DESCONHECIDA`.
Entidades: `cargo, uf, partido, nome, tema, apenasDeferidas, apenasIndeferidas, historico (NUNCA_ELEITO|ELEITO_MESMO_CARGO|ELEITO_2_OU_MAIS),
turno, numero (urna, 2–5 dígitos; anos 2018–2030 só após "número"), genero (FEMININO|MASCULINO), vice`.
`RECOMENDACAO` = pedido de indicação/previsão de voto → o app **recusa** com neutralidade. `SIMULADOR` abre o simulador educativo.
Respostas: texto em linhas (1ª = título; `• ` = item; `Rótulo: valor` = campo), formatado pela interface sem alterar o conteúdo.

> O modelo da nuvem foi treinado no contrato v1 (sem as intenções/entidades novas). Os clientes já aceitam os campos v2 se
> vierem; as perguntas novas são resolvidas pelo NLU local. Incluir as intenções v2 no próximo retreino (`backend/retrain`).

### API de NLU na nuvem (opcional, opt-in)

`POST /api/nlu` `{ "q": "<texto ≤ 300>", "v": 1, "client": "android|web", "iid": "<uuid aleatório>" }` →
`{ "ok": true, "nlu": { "intent": "<Intent>", "cargo?", "uf?", "partido?", "nome?", "tema?", "apenasDeferidas?", "historico?", "turno?" }, "model": "<versão>" }`.
O cliente **revalida** tudo contra os dados locais (cargo/UF/partido do vocabulário; `nome` precisa existir no pacote).

`POST /api/report` `{ q, a, intent, origem, dataVersion, app, note, client }` → cria issue pública sem dados pessoais.
