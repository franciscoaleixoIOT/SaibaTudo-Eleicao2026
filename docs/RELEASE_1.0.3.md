# Versão 1.0.3 (versionCode 4) — o que mudou desde a 1.0.1 (versionCode 2)

Pacote: `net.saibatudo.eleicoes2026` · Gerada em 07/10/2026 · Arquivo: `app/build/outputs/bundle/release/app-release.aab` (11,3 MB, assinado com a chave de upload).
A versão 1.0.2 (versionCode 3) existiu só no código; tudo o que ela trazia está incluído aqui.

## 1. Texto para o campo "Novidades desta versão" da Play (pt-BR, 436 de 500 caracteres)

```
• Corrigido: o app agora informa corretamente quando há 2º turno e quem disputa.
• A IA na nuvem agora segue a conversa em perguntas em sequência ("e em SP?").
• Histórico de perguntas com setas para voltar e avançar.
• IA na nuvem com avisos mais claros; texto gerado por IA vem rotulado.
• Nova opção, desligada por padrão: "Ajudar a melhorar o app".
• Entende "2a turno" e "no Rio".
• Política de privacidade atualizada (versão 1.4).
```

## 2. Diferenças, uma a uma

### Correções
| # | O que mudou | Como era na 1.0.1 |
| :-- | :-- | :-- |
| 1 | **2º turno e eleitos corretos.** O app lê a situação publicada pelo TSE ("2º turno", "Eleito"). Quem passa ao 2º turno aparece como "2º turno", nunca como "Eleito". | Dizia "Não haverá 2º turno, eleito com 47%" e marcava os dois primeiros como ELEITO (Presidente e os 7 estados com 2º turno para governador). |
| 2 | **Trava extra:** nunca afirma "eleito em 1º turno" com dois candidatos marcados e o primeiro abaixo de 50 %. | Não existia. |
| 3 | **Sem apuração ao vivo:** usa a situação do pacote oficial (governador) ou avisa que não conseguiu consultar. | Respondia "depende da apuração do 1º turno", como se a votação não tivesse ocorrido. |
| 4 | **Respostas diretas sobre 2º turno** por cargo e estado, com visão geral do seu estado. Contagem de votos também para deputados. | Respostas genéricas. |
| 5 | **Entende "2a turno" / "2ª turno"** (erro de digitação comum) e **"no Rio" / "do Rio"** como Rio de Janeiro. | Virava lista de candidatos; "no Rio" não era reconhecido. |

### Conversa e histórico
| # | O que mudou | Como era na 1.0.1 |
| :-- | :-- | :-- |
| 6 | **Histórico de perguntas** guardado no aparelho, com setas para voltar e avançar; a última pergunta sobe e a caixa fica em branco. Pode ser apagado em Configurações. | Não havia histórico. |
| 7 | **A IA na nuvem segue a conversa** em perguntas em sequência ("candidatos a governador do RJ" e depois "e de SP?"): o contexto é aplicado no aparelho; só a pergunta atual é enviada. | As perguntas em sequência já funcionavam no app, mas a nuvem respondia de forma genérica. |

### IA na nuvem
| # | O que mudou | Como era na 1.0.1 |
| :-- | :-- | :-- |
| 8 | **Botão da nuvem numa resposta já entendida:** pede uma segunda interpretação, com a resposta vindo dos dados oficiais; só gera texto se a explicação por IA estiver liberada no pacote de dados. | O botão já aparecia, mas sempre gerava texto por IA. |
| 9 | **Avisos separados:** "a nuvem não encontrou outra forma de entender" × "a nuvem está indisponível". | Uma mensagem única, que parecia pane. |
| 10 | **Explicação por IA (texto gerado):** rotulada "Texto gerado por IA • pode conter erros"; o resumo enviado não corta listas no meio. Pedidos de recomendação de voto nunca chegam ao modelo. | Aparecia como "IA Generativa • Fundamentada nas normas e dados públicos do TSE", sem aviso de erro. |

### Privacidade
| # | O que mudou | Como era na 1.0.1 |
| :-- | :-- | :-- |
| 11 | **Nova opção "Ajudar a melhorar o app"** em Configurações, **desligada por padrão**: envia as perguntas que o app não entendeu para revisão humana, sem nome, IP ou resposta. | Não existia. |
| 12 | **Filtro no aparelho:** perguntas com e-mail, CPF, telefone ou que revelem opinião/preferência política ("quero que fulano ganhe") não entram na fila. | Não existia. |
| 13 | **Sem localização:** o estado é escolhido na lista; o app não pede essa permissão. | Igual (a política é que foi corrigida para dizer isso). |

**Permissões:** nenhuma permissão nova. Continuam só internet, estado da rede e as do agendador de atualização de dados.

### O que NÃO depende desta versão (já vale para a 1.0.1 pelos dados e pelo servidor)
- Resultados oficiais do 1º turno no pacote de dados.
- Modelo de nuvem novo (`v2.3`), que entende bem mais perguntas.
- Número de candidato na nuvem ("Quem é o 13?").
- Verificador reforçado do texto gerado e servidor no Hugging Face.

## 3. Passo a passo para publicar no teste fechado

1. **Play Console** › SaibaTudo Eleições 2026 › *Testar e lançar* › *Teste fechado* › a faixa que já está em uso › **Criar nova versão**.
2. **Enviar** `app/build/outputs/bundle/release/app-release.aab`. A Play deve mostrar **4 (1.0.3)**.
3. **Nome da versão:** `1.0.3`. **Novidades:** colar o texto da seção 1 em `pt-BR`.
4. **Salvar** › **Revisar versão** › conferir que não há erros nem avisos novos de permissão › **Iniciar lançamento para teste fechado**.
5. **Segurança dos dados (Data Safety):** revisar, porque esta versão traz recursos opcionais que enviam texto:
   - *Conteúdo do usuário › Outro conteúdo gerado pelo usuário*: **coletado**, **opcional**, finalidade *funcionalidade do app*, **não compartilhado**, **criptografado em trânsito**;
   - exclusão de dados: não há identificador guardado junto do texto (ver `docs/PRIVACIDADE_melhoria_RASCUNHO.md`, seção Google Play);
   - link da política: `https://saibatudo.net/privacidade` (versão 1.4).
6. **Avisar os testadores** para atualizar pela Play e manter o opt-in: os 14 dias de teste contínuo com 12 testadores não reiniciam com uma versão nova.

## 4. O que pedir para os testadores conferirem

| Teste | Resultado esperado |
| :-- | :-- |
| "haverá 2º turno para presidente?" | "Sim, haverá 2º turno", com os dois candidatos, percentuais e a data de 25/10/2026 |
| "resultado para presidente" e abrir a tabela | os dois primeiros com "2º turno"; ninguém "Eleito" |
| "vai ter segundo turno para governador em SP?" | "Não haverá 2º turno", com o eleito |
| "candidatos a governador do RJ" e depois "e de SP?" | lista de governador em SP |
| Setas do histórico | voltam e avançam pelas perguntas feitas |
| Tocar em "Perguntar à IA na nuvem" numa resposta já dada | nova resposta, ou aviso de que não há outra interpretação (não "indisponível") |
| Configurações › "Ajudar a melhorar o app" | aparece desligada, com o texto de consentimento |
| Modo avião | o app continua respondendo com os dados já baixados |

## 5. Antes de enviar (verificação do build)

- Feito nesta máquina: testes unitários e `lintRelease` passaram; o AAB está assinado (`jarsigner -verify`); `tools/verificar_release.py` confirmou as 5 classes obrigatórias no APK de release; `versionCode 4`, `versionName 1.0.3`.
- **Falta, e só você pode fazer:** instalar o build de **release** num aparelho e abrir as telas principais. O verificador não substitui isso (lição registrada: o R8 já quebrou o release antes sem quebrar os testes). O APK equivalente está em `app/build/outputs/apk/release/app-release.apk`:
  ```
  adb install -r app/build/outputs/apk/release/app-release.apk
  ```
  Se o app da Play estiver instalado, a assinatura é diferente (a Play reassina): desinstale antes ou teste em outro aparelho.
