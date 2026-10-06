# RASCUNHO — texto para ligar o "Ajudar a melhorar o app"

> **Isto NÃO está em vigor.** É o texto pronto para entrar em [`PRIVACIDADE.md`](PRIVACIDADE.md) e em `web/src/privacidade/index.html` (as duas versões
> precisam ficar idênticas) **antes** de ligar a captura de perguntas não entendidas ([`OPERACAO.md`](OPERACAO.md) §7). Revise com quem entende de LGPD:
> o ponto delicado é que **uma pergunta livre pode revelar opinião política, que é dado pessoal sensível** (LGPD, art. 5º, II), e o tratamento exige
> consentimento **específico e destacado** (art. 11, I). Ajuste o que a sua assessoria jurídica indicar.

## O que muda na política (versão 1.3)

**Cabeçalho:** `Versão 1.3 — <data> (1.3: "Ajudar a melhorar o app", opcional e desligado por padrão)`.

**Frase-resumo (acrescentar):** "…ou **se você ligar** a opção *Ajudar a melhorar o app*, caso em que as perguntas que o app não entendeu são enviadas para uma pessoa revisar."

**Tabela da seção 4 — nova linha:**

| Para quê | Destino | O que é enviado | Quando |
| :-- | :-- | :-- | :-- |
| **Ajudar a melhorar o app (opcional; desligado por padrão)** | `saibatudo.net/api/melhoria` → banco Redis gerenciado (Upstash) | **somente o texto das perguntas que o app não entendeu** (em lotes de até 10) e um código aleatório da instalação, que é usado só para limitar abusos e **não é guardado junto com o texto** | **somente** se você ligar *Configurações › Ajudar a melhorar o app* **e** o recurso estiver ativo no pacote de dados |

**Novo parágrafo na seção 4:**

> **Ajudar a melhorar o app.** Se você ligar esta opção, as perguntas que o app **não conseguiu entender** (nunca as que ele respondeu) são guardadas no nosso servidor
> **sem seu nome, sem seu IP e sem a resposta**, apenas com o texto e quantas vezes ele apareceu no dia. Uma pessoa lê essas perguntas para ensinar o app a entendê-las;
> nada é usado automaticamente. Perguntas com e-mail, CPF, telefone ou números longos **nunca são enviadas**. **Atenção:** o texto de uma pergunta pode revelar sua
> opinião política, que é um dado pessoal sensível; por isso a opção vem desligada e só vale com o seu consentimento. Escreva só o necessário e evite dados pessoais.
> Guardamos as perguntas por **no máximo 90 dias** e as apagamos depois de revisadas. **Como não guardamos nada que identifique você junto do texto, não conseguimos
> localizar nem apagar uma pergunta específica sua depois de enviada**; você pode desligar a opção a qualquer momento (o que ainda não foi enviado é apagado do aparelho)
> e nada novo é enviado. Se uma pergunta for escolhida como exemplo para melhorar o app, ela só é publicada no código aberto **depois de revisada por uma pessoa e sem
> dados pessoais ou opinião identificável**, e pode ser reescrita para isso.

**Seção 6 (base legal) — acrescentar:** "…e, para *Ajudar a melhorar o app*, **seu consentimento específico e destacado** (art. 7º, I, e art. 11, I), dado ao ligar a opção e
revogável ao desligá-la."

**Seção 7 (operadores) — acrescentar:** "**Upstash** (banco Redis gerenciado onde as perguntas ficam guardadas por até 90 dias)." Também vale para os contadores de limite de
uso (IP e código de instalação, por até 1 dia), se `UPSTASH_REDIS_REST_*` estiver ligado ([`OPERACAO.md`](OPERACAO.md) §5).

**Seção 8 (retenção) — acrescentar:** "Perguntas enviadas em *Ajudar a melhorar o app*: até 90 dias (ou até a revisão, o que vier antes)."

## Texto de consentimento na tela (já está no app e no site)

> Desligado por padrão. Se ligar, as perguntas que o app não entendeu são enviadas ao nosso servidor, sem seu nome e sem identificar você, para uma pessoa revisar e ensinar
> o app a entendê-las. Perguntas com e-mail, CPF ou telefone nunca são enviadas. Atenção: o texto de uma pergunta pode revelar sua opinião política; ligue só se estiver de
> acordo e evite escrever dados pessoais. Você pode desligar a qualquer momento; o que ainda não foi enviado é apagado.

(`MELHORIA_TEXTOS` em `web/src/eleicoes2026/js/melhoria.js` e `Melhoria.TEXTO_DESCRICAO` em `MelhoriaClient.kt`; testes conferem as frases "Desligado por padrão",
"opinião política", "e-mail, CPF ou telefone" e "apagado". Se você mudar o texto aqui, mude lá.)

## Google Play (Data Safety)

Ao ligar, declare em *Data safety*: dado coletado **"Conteúdo do usuário › Outro conteúdo gerado pelo usuário"**, **opcional**, finalidade **"Funcionalidade do app / melhoria do
app"**, **não compartilhado**, **criptografado em trânsito**, **com solicitação de exclusão não disponível por não haver identificador** (ou, se preferir oferecer exclusão,
o desenho precisa mudar para guardar um identificador, o que piora a privacidade).
