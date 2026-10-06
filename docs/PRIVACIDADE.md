# Política de Privacidade — SaibaTudo Eleições 2026

**Versão 1.2 — 06 de outubro de 2026** (1.2: explicação por IA generativa, opcional e hoje desligada; 1.1: sugestão do estado pela localização aproximada, processada só no aparelho) · Aplica-se ao aplicativo Android `net.saibatudo.eleicoes2026` e ao site/PWA em
`saibatudo.net`. Texto-fonte desta política (a versão publicada em `https://saibatudo.net/privacidade` deve ser idêntica).

> **Em uma frase:** o SaibaTudo não tem cadastro, anúncios, rastreadores nem análise de uso; tudo que é preciso para consultar
> candidaturas fica no seu aparelho. Só há envio de texto a nossos servidores **se você pedir** ajuda da "IA na nuvem" (pelo
> botão em uma pergunta ou ligando o modo automático) ou **se você mesmo enviar** um relato de problema.

## 1. Quem somos
O SaibaTudo é um projeto independente, de código aberto (licença MIT), sem fins lucrativos e **sem vínculo com o Tribunal Superior
Eleitoral (TSE), com o governo, com partidos ou com candidatos**. Controlador dos dados tratados pelo serviço de IA e relatos:
**Francisco Aleixo** (desenvolvedor) — contato: **<saibatudo@saibatudo.net>**.
Código-fonte e canal de correções: <https://github.com/franciscoaleixoIOT/SaibaTudo-Eleicao2026>.

## 2. O que NÃO coletamos
Não pedimos nome, e-mail, telefone, CPF, título de eleitor, contatos, fotos ou arquivos. Não há login, anúncios, SDKs de
publicidade, Google Analytics, Firebase Analytics ou relatórios de falhas de terceiros. Não vendemos nem compartilhamos dados.

**Localização aproximada (opcional, só no aparelho).** Na primeira abertura — ou quando você toca em "Usar minha localização" —
o app pede permissão de **localização aproximada** apenas para **sugerir o seu estado**. O estado é calculado **no próprio
aparelho**, comparando a posição com o contorno oficial das UFs (malha do IBGE, embutida no app Android; no site, baixada de
saibatudo.net sem enviar a posição). **A localização não é enviada
a nenhum servidor, não é gravada nem usada para outra coisa**: fica guardada só a sigla do estado que você confirmar, e você pode
trocá-la quando quiser. Se você negar a permissão, basta escolher o estado na lista.

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
| **IA na nuvem (opcional)** | `saibatudo.net/api/nlu` → processamento no Modal.com | **texto da pergunta que o app não entendeu**, um código aleatório de instalação (não identifica você) e o tipo de cliente (android/web) | **somente quando você toca em "Perguntar à IA na nuvem"** (vai só aquela pergunta) **ou se você ligar o modo automático** em *Configurações › IA na nuvem automática* |
| **Explicação por IA generativa (opcional; hoje desligada)** | `saibatudo.net/api/ask` → processamento no Modal.com (GPU) | **texto da pergunta, um resumo da resposta exibida e trechos de candidaturas usados como contexto (até 4.000 caracteres)**, um código aleatório de instalação e o tipo de cliente | **somente** se o recurso estiver ligado no pacote de dados **e** você tocar em "Gerar explicação com IA" (vai só aquela pergunta) |
| **Relato de problema (opcional)** | `saibatudo.net/api/report` → issue pública no GitHub | **pergunta, resposta exibida, versões do app/dados e comentário opcional** | **somente quando você tocar em "Enviar relato"** |

**IA na nuvem.** O texto é usado só para interpretar a intenção (cargo, estado, partido…). Não é gravado em disco nem em logs
por nós; pode permanecer em memória por até 1 hora para cache de perguntas repetidas e por segundos no processamento. Os fatos
mostrados nas respostas **sempre** vêm dos dados oficiais armazenados no aparelho. Por padrão nada é enviado: quando o app não entende
uma pergunta, ele oferece o botão "Perguntar à IA na nuvem". O modo automático pode ser ligado ou desligado em *Configurações › IA na nuvem automática*.

**Explicação por IA generativa (hoje desligada).** Quando estiver ligada, o botão "Gerar explicação com IA" envia a pergunta e um resumo da resposta que o app já exibe para um modelo de linguagem (Qwen2.5-7B, no Modal.com), que escreve uma explicação em texto. **Esse texto é gerado por modelo, pode conter erros e não é dado oficial**: os dados oficiais são os do app. O modelo é instruído a usar só os dados enviados e não recomendar, comparar nem prever candidatos (Res. TSE 23.755/2026); nosso servidor ainda **descarta** respostas que recomendem ou prevejam candidatos, que contradigam a regra do 2º turno ou que tragam números que não estavam nos dados enviados — nesse caso você continua vendo a resposta do app. O texto enviado não é gravado em disco nem em logs; fica em memória por segundos (e até 1 hora, para perguntas repetidas). Pedidos de recomendação de voto nem chegam ao modelo.

**Relatos.** Ficam **públicos** no repositório do GitHub (para transparência das correções). Não escreva dados pessoais no comentário.

## 5. Origem dos dados exibidos
Dados abertos do TSE (<https://dadosabertos.tse.jus.br>), licença Creative Commons Atribuição (CC BY), incluindo fotos e
resultados oficiais. O app **não publica** CPF, número de título de eleitor ou e-mail de candidatos. Informações sobre
candidatos são dados públicos de registro eleitoral; o app apenas as reproduz com a situação oficial do TSE.

## 6. Finalidade e base legal (LGPD, Lei 13.709/2018)
Atender seu pedido de consulta (art. 7º, V), manter a segurança e evitar abuso do serviço (art. 7º, IX) e, para a IA na nuvem e a explicação por IA generativa,
**seu consentimento** (art. 7º, I), dado a cada pergunta pelo botão ou, no caso da IA na nuvem, de forma contínua pelo modo automático, revogável a
qualquer momento nas configurações.

## 7. Compartilhamento e operadores
Operadores que processam dados sob nossas instruções: **Vercel** (hospedagem e funções serverless), **Modal Labs** (execução do
modelo de linguagem), **GitHub** (código e relatos públicos) e **Google Play** (distribuição). Esses serviços podem processar
dados fora do Brasil (por exemplo, nos EUA). Cada um possui política própria.

## 8. Retenção
Não mantemos banco de dados de usuários. Logs técnicos do provedor de hospedagem (IP, data, URL) seguem a retenção do provedor.
Relatos enviados permanecem no GitHub até serem removidos a pedido.

## 9. Seus direitos
Você pode pedir confirmação, acesso, correção, anonimização ou eliminação dos dados que tratamos, e revogar consentimento
(art. 18 da LGPD), pelo contato acima ou por issue no GitHub. Como não mantemos cadastro, em geral não há dados pessoais a
exibir além de eventual relato que você enviou.

## 10. Crianças
O app não é direcionado a menores de 13 anos e não coleta dados de crianças conscientemente.

## 11. Segurança
Conexões HTTPS; pacotes de dados **assinados digitalmente** (o app rejeita dados sem assinatura válida); chaves de serviços de
IA ficam apenas em servidores (nunca no app); limites de uso contra abuso. Nenhum sistema é 100% seguro.

## 12. Alterações
Mudanças relevantes serão publicadas nesta página e na descrição do app, com nova data de versão.
