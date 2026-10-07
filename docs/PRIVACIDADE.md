# Política de Privacidade — SaibaTudo Eleições 2026

**Versão 1.4 — 07 de outubro de 2026** (1.4: a explicação por IA generativa, ainda desligada, passa a ser processada no Hugging Face, com o Modal.com como reserva; 1.3: "Ajudar a melhorar o app", opcional e desligado por padrão, correção sobre a localização no Android e botão da IA na nuvem também depois de uma resposta; 1.2: explicação por IA generativa, opcional e hoje desligada; 1.1: sugestão do estado pela localização aproximada, processada só no aparelho) · Aplica-se ao aplicativo Android `net.saibatudo.eleicoes2026` e ao site/PWA em
`saibatudo.net`. Texto-fonte desta política (a versão publicada em `https://saibatudo.net/privacidade` deve ser idêntica).

> **Em uma frase:** o SaibaTudo não tem cadastro, anúncios, rastreadores nem análise de uso; tudo que é preciso para consultar
> candidaturas fica no seu aparelho. Só há envio de texto a nossos servidores **se você pedir** ajuda da "IA na nuvem" (pelo
> botão em uma pergunta ou ligando o modo automático) ou **se você mesmo enviar** um relato de problema, ou ainda **se você ligar** a opção *Ajudar a melhorar o app* (desligada por padrão), caso em que as perguntas que o app não entendeu são enviadas para uma pessoa revisar.

## 1. Quem somos
O SaibaTudo é um projeto independente, de código aberto (licença MIT), sem fins lucrativos e **sem vínculo com o Tribunal Superior
Eleitoral (TSE), com o governo, com partidos ou com candidatos**. Controlador dos dados tratados pelo serviço de IA e relatos:
**Francisco Aleixo** (desenvolvedor) — contato: **<saibatudo@saibatudo.net>**.
Código-fonte e canal de correções: <https://github.com/franciscoaleixoIOT/SaibaTudo-Eleicao2026>.

## 2. O que NÃO coletamos
Não pedimos nome, e-mail, telefone, CPF, título de eleitor, contatos, fotos ou arquivos. Não há login, anúncios, SDKs de
publicidade, Google Analytics, Firebase Analytics ou relatórios de falhas de terceiros. Não vendemos nem compartilhamos dados.

**Localização aproximada (opcional, só no site e só no aparelho).** No site/PWA, na primeira abertura — ou quando você toca em "Usar minha localização" —
o navegador pede permissão de **localização aproximada** apenas para **sugerir o seu estado**. O estado é calculado **no próprio
aparelho**, comparando a posição com o contorno oficial das UFs (malha do IBGE, baixada de
saibatudo.net sem enviar a posição). **A localização não é enviada
a nenhum servidor, não é gravada nem usada para outra coisa**: fica guardada só a sigla do estado que você confirmar, e você pode
trocá-la quando quiser. Se você negar a permissão, basta escolher o estado na lista. **No aplicativo Android o app não usa a localização nem pede essa permissão:** você escolhe o estado na lista.

## 3. O que fica só no seu aparelho
Preferências (tema, tamanho do texto, estado escolhido, pergunta inicial, histórico local de perguntas recentes para navegação pelas setas, economia de dados, consentimentos) e os dados oficiais
do TSE baixados. Podem ser apagados nas configurações do app (*Limpar histórico de perguntas*), em *Configurações do Android › Apps › SaibaTudo › Armazenamento › Limpar dados*, ou desinstalando o app.
No site/PWA ficam em `localStorage`/cache do navegador. O app não permite backup em nuvem dessas informações.

## 4. Conexões de rede que o app faz
| Para quê | Destino | O que é enviado | Quando |
| :-- | :-- | :-- | :-- |
| Atualizar os dados oficiais | `saibatudo.net` (hospedagem Vercel) | requisição HTTPS comum (o provedor registra IP e navegador em logs de servidor) | a cada poucas horas e ao abrir o app (a cada 15 min em dias de votação); respeita "Economia de dados" |
| Sugestão do estado (só no site) | `saibatudo.net` | download do arquivo de contornos das UFs (requisição comum; **a sua posição não é enviada**) | só se você usar a localização aproximada |
| Fotos de candidatos e apuração ao vivo | CDN/servidores oficiais do TSE (`resultados.tse.jus.br`) | requisição HTTPS comum (o TSE vê o IP) | ao exibir fotos ou resultados |
| **IA na nuvem (opcional)** | `saibatudo.net/api/nlu` → processamento no Modal.com | **texto da pergunta** (a que o app não entendeu ou que você quer conferir depois de uma resposta), um código aleatório de instalação (não identifica você) e o tipo de cliente (android/web) | **somente quando você toca em "Perguntar à IA na nuvem"** (vai só aquela pergunta) **ou se você ligar o modo automático** em *Configurações › IA na nuvem automática* |
| **Explicação por IA generativa (opcional; hoje desligada)** | `saibatudo.net/api/ask` → processamento no Hugging Face (GPU), com o Modal.com como reserva | **texto da pergunta, um resumo da resposta exibida e trechos de candidaturas usados como contexto (até 4.000 caracteres)**, um código aleatório de instalação e o tipo de cliente | **somente** se o recurso estiver ligado no pacote de dados **e** você tocar em "Gerar explicação com IA" (vai só aquela pergunta) |
| **Ajudar a melhorar o app (opcional; desligado por padrão)** | `saibatudo.net/api/melhoria` → banco Redis gerenciado (Upstash) | **somente o texto das perguntas que o app não entendeu** (em lotes de até 10), **excluídas as que revelam sua opinião ou preferência política**, e um código aleatório da instalação, que é usado só para limitar abusos e **não é guardado junto com o texto** | **somente** se você ligar *Configurações › Ajudar a melhorar o app* **e** o recurso estiver ativo no pacote de dados |
| **Relato de problema (opcional)** | `saibatudo.net/api/report` → issue pública no GitHub | **pergunta, resposta exibida, versões do app/dados e comentário opcional** | **somente quando você tocar em "Enviar relato"** |

**IA na nuvem.** O texto é usado só para interpretar a intenção (cargo, estado, partido…). Não é gravado em disco nem em logs
por nós; pode permanecer em memória por até 1 hora para cache de perguntas repetidas e por segundos no processamento. Os fatos
mostrados nas respostas **sempre** vêm dos dados oficiais armazenados no aparelho. Por padrão nada é enviado: quando o app não entende
uma pergunta, ele oferece o botão "Perguntar à IA na nuvem" (e, depois de uma resposta, também para você conferir se a nuvem entende a pergunta de outro jeito). O modo automático pode ser ligado ou desligado em *Configurações › IA na nuvem automática*.

**Explicação por IA generativa (hoje desligada).** Quando estiver ligada, o botão "Gerar explicação com IA" envia a pergunta e um resumo da resposta que o app já exibe para um modelo de linguagem (Qwen2.5-7B, no Hugging Face ou, como reserva, no Modal.com), que escreve uma explicação em texto. **Esse texto é gerado por modelo, pode conter erros e não é dado oficial**: os dados oficiais são os do app. O modelo é instruído a usar só os dados enviados e não recomendar, comparar nem prever candidatos (Res. TSE 23.755/2026); nosso servidor ainda **descarta** respostas que recomendem ou prevejam candidatos, que contradigam a regra do 2º turno ou que tragam números que não estavam nos dados enviados — nesse caso você continua vendo a resposta do app. O texto enviado não é gravado em disco nem em logs; fica em memória por segundos (e até 1 hora, para perguntas repetidas). Pedidos de recomendação de voto nem chegam ao modelo.

**Ajudar a melhorar o app.** Se você ligar esta opção, as perguntas que o app **não conseguiu entender** (nunca as que ele respondeu) são guardadas no nosso servidor
**sem seu nome, sem seu IP e sem a resposta**, apenas com o texto e quantas vezes ele apareceu no dia. Uma pessoa lê essas perguntas para ensinar o app a entendê-las;
nada é usado automaticamente. Perguntas com e-mail, CPF, telefone ou números longos **nunca são enviadas**. **Também não enviamos perguntas que possam revelar a sua opinião ou
preferência política**, como dizer quem você quer que ganhe, que candidato você apoia ou pedir uma estratégia para ajudar alguém a ganhar: o próprio app as descarta antes
de enviar e o servidor confere de novo. **Atenção:** esse filtro automático não é perfeito, e o texto de uma pergunta ainda pode revelar sua opinião política, que é um dado
pessoal sensível; por isso a opção vem desligada e só vale com o seu consentimento. Escreva só o necessário e evite dados pessoais e opiniões.
Guardamos as perguntas por **no máximo 90 dias** e as apagamos depois de revisadas. **Como não guardamos nada que identifique você junto do texto, não conseguimos
localizar nem apagar uma pergunta específica sua depois de enviada**; você pode desligar a opção a qualquer momento (o que ainda não foi enviado é apagado do aparelho)
e nada novo é enviado. Se uma pergunta for escolhida como exemplo para melhorar o app, ela só é publicada no código aberto **depois de revisada por uma pessoa e sem
dados pessoais ou opinião identificável**, e pode ser reescrita para isso.

**Relatos.** Ficam **públicos** no repositório do GitHub (para transparência das correções). Não escreva dados pessoais no comentário.

## 5. Origem dos dados exibidos
Dados abertos do TSE (<https://dadosabertos.tse.jus.br>), licença Creative Commons Atribuição (CC BY), incluindo fotos e
resultados oficiais. O app **não publica** CPF, número de título de eleitor ou e-mail de candidatos. Informações sobre
candidatos são dados públicos de registro eleitoral; o app apenas as reproduz com a situação oficial do TSE.

## 6. Finalidade e base legal (LGPD, Lei 13.709/2018)
Atender seu pedido de consulta (art. 7º, V), manter a segurança e evitar abuso do serviço (art. 7º, IX) e, para a IA na nuvem e a explicação por IA generativa,
**seu consentimento** (art. 7º, I), dado a cada pergunta pelo botão ou, no caso da IA na nuvem, de forma contínua pelo modo automático, revogável a
qualquer momento nas configurações. Para *Ajudar a melhorar o app*, a base é **seu consentimento específico e destacado** (art. 7º, I, e art. 11, I), dado ao ligar a opção e revogável ao desligá-la.

## 7. Compartilhamento e operadores
Operadores que processam dados sob nossas instruções: **Vercel** (hospedagem e funções serverless), **Hugging Face** (execução do modelo que gera a explicação por IA, quando ligada), **Modal Labs** (execução do
modelo de linguagem), **Upstash** (banco Redis gerenciado onde as perguntas de *Ajudar a melhorar o app* ficam guardadas por até 90 dias e onde ficam os contadores de limite de uso, por até 1 dia), **GitHub** (código e relatos públicos) e **Google Play** (distribuição). Esses serviços podem processar
dados fora do Brasil (por exemplo, nos EUA). Cada um possui política própria.

## 8. Retenção
Não mantemos cadastro nem banco de dados de usuários. Perguntas enviadas em *Ajudar a melhorar o app*: até 90 dias (ou até a revisão, o que vier antes). Logs técnicos do provedor de hospedagem (IP, data, URL) seguem a retenção do provedor.
Relatos enviados permanecem no GitHub até serem removidos a pedido.

## 9. Seus direitos
Você pode pedir confirmação, acesso, correção, anonimização ou eliminação dos dados que tratamos, e revogar consentimento
(art. 18 da LGPD), pelo contato acima ou por issue no GitHub. Como não mantemos cadastro, em geral não há dados pessoais a
exibir além de eventual relato que você enviou. As perguntas de *Ajudar a melhorar o app* não ficam ligadas a você, então não conseguimos localizá-las nem apagá-las individualmente (veja a seção 4); desligar a opção interrompe novos envios.

## 10. Crianças
O app não é direcionado a menores de 13 anos e não coleta dados de crianças conscientemente.

## 11. Segurança
Conexões HTTPS; pacotes de dados **assinados digitalmente** (o app rejeita dados sem assinatura válida); chaves de serviços de
IA ficam apenas em servidores (nunca no app); limites de uso contra abuso. Nenhum sistema é 100% seguro.

## 12. Alterações
Mudanças relevantes serão publicadas nesta página e na descrição do app, com nova data de versão.
