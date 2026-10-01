# Publicação na Google Play — SaibaTudo Eleições 2026

Pacote: **`net.saibatudo.eleicoes2026`** · Nome na loja: **SaibaTudo Eleições 2026** · Versão inicial: `1.0.0` (versionCode 1)
Tudo que pode ser preparado fora do Play Console está pronto neste repositório. **O envio e as declarações exigem acesso manual à
conta** (a conta de desenvolvedor não é acessível por este projeto).

## 1. Artefatos prontos

| Item | Arquivo |
| :-- | :-- |
| App Bundle assinado (chave de upload) | `app/build/outputs/bundle/release/app-release.aab` (gerar: `./gradlew bundleRelease`) |
| Ícone 512×512 (quadrado, sem cantos — a Play aplica a máscara) | `store/play/icon-512.png` |
| Gráfico de recursos 1024×500 | `store/play/feature-graphic-1024x500.png` |
| Capturas de tela (1080×1920, 9:16) | `store/play/screenshots/*.png` (7 telas: principal, resposta da IA, candidaturas, detalhe, simulador educativo, tema escuro, sobre os dados) |
| Política de privacidade | `docs/PRIVACIDADE.md` → publicada em `https://saibatudo.net/privacidade` |
| Respostas do formulário de Data safety | seção 5 deste documento |

**Chave de upload:** `secrets/upload-keystore.p12` + `keystore.properties` (ambos fora do Git). **Faça backup agora** (cofre de
senhas + cópia offline). Ative o **Play App Signing** (padrão): se a chave de upload for perdida, o Google permite redefini-la.

## 2. Pré-requisitos e prazos (verificar HOJE)
1. **Play Console › Configurações › Detalhes da conta**: confirme se a conta é **pessoal** ou **organização** e a data de criação.
   - Conta **pessoal criada após 13/11/2023**: é obrigatório um **teste fechado com ≥ 12 testadores, opt-in contínuo por ≥ 14 dias**
     antes de pedir acesso à produção (depois, a análise leva "até 7 dias ou mais"). **Isso inviabiliza a publicação antes do 1º turno
     (04/10) e do 2º (25/10)**: o canal imediato para eleitores é o **PWA** (`saibatudo.net/eleicoes2026`). Meta realista: produção em meados de novembro.
   - Conta de organização ou conta pessoal antiga: a regra da página oficial não se aplica; a revisão do 1º envio leva de 1 a 7 dias.
2. **Verificação de desenvolvedor do Android** (em vigor no Brasil desde 30/09/2026 em dispositivos certificados): confira no Play Console se há
   pedido de registro do pacote; o APK distribuído fora da Play (GitHub) só instala sem atrito se o pacote estiver registrado.
3. **targetSdk 37** (≥ 36 exigido para apps novos desde 31/08/2026) ✔. AAB ✔. Sem código nativo (sem requisito de 16 KB) ✔. Tamanho ~8 MB ✔.

## 3. Ficha da loja (pt-BR)

- **Nome (≤ 30):** `SaibaTudo Eleições 2026`
- **Descrição curta (≤ 80):** `Candidaturas, pesquisas e resultados com dados abertos do TSE. App independente.`
- **Categoria:** **Educação** (alternativa: Livros e referências). **Evite "Notícias e revistas"** (aciona a política de apps de notícias).
- **E-mail de contato:** *preencher* · **Site:** `https://saibatudo.net` · **Política de privacidade:** `https://saibatudo.net/privacidade`

**Descrição completa (≤ 4000):**

```
Consulte as Eleições Gerais 2026 com dados abertos do TSE, de forma simples e neutra.

O QUE VOCÊ ENCONTRA
• Candidaturas a Presidente, Governador, Senador, Deputado Federal, Estadual e Distrital, com número da urna, partido, situação oficial do registro, bens declarados e histórico.
• Filtros por estado, cargo, partido, situação da candidatura e histórico — e a opção "Meu estado" para começar já filtrado.
• Assistente de IA para perguntar em linguagem natural ("Quem disputa a Presidência?", "Candidatos a governador em MG"). As respostas vêm SEMPRE dos dados oficiais, com fonte e data da extração.
• Pesquisas eleitorais registradas no TSE, calendário e regras da urna.
• Resultados e apuração com os números divulgados pelo TSE (a partir da votação).
• Simulador EDUCATIVO da urna para treinar o voto (não é a urna oficial e não registra votos).
• Funciona offline e se atualiza sozinho; pacotes de dados são verificados por assinatura digital.
• Tema claro, escuro ou do sistema; tamanho de texto ajustável; sem anúncios e sem cadastro.

NEUTRALIDADE E TRANSPARÊNCIA
• Aplicativo INDEPENDENTE: sem vínculo com o Tribunal Superior Eleitoral, com o governo ou com partidos.
• Não recomendamos, comparamos nem prevemos candidatos. As listas têm ordem fixa (cargo, estado e número).
• "Candidatura deferida" é a situação do julgamento do registro informada pelo TSE; o app não emite certidão de "Ficha Limpa".
• Código aberto (MIT): github.com/franciscoaleixoIOT/SaibaTudo-Eleicao2026 — erros e sugestões são bem-vindos.

FONTES
Dados Abertos do TSE (dadosabertos.tse.jus.br, licença CC BY) e sistemas oficiais do TSE (resultados.tse.jus.br, DivulgaCandContas). Em caso de divergência, vale o site oficial do TSE.

PRIVACIDADE
Sem GPS, sem login, sem anúncios. A "IA na nuvem" é opcional e vem desligada: só se você ligar, o texto de perguntas que o app não entendeu é enviado ao nosso servidor para interpretar a intenção.
```

**Notas de versão 1.0.0:** `Primeira versão: candidaturas, assistente de IA com dados oficiais do TSE, pesquisas, calendário, resultados e simulador educativo da urna.`

## 4. Declarações do Play Console (App content)

| Declaração | Resposta |
| :-- | :-- |
| Política de privacidade | URL pública acima (sem PDF) |
| Acesso ao app | Sem restrição de login. *Notas ao revisor:* "Todas as funções estão abertas. Perguntas de exemplo: 'Quem disputa a Presidência?', 'Candidatos a Governador em SP', 'Em quem devo votar?' (o app recusa recomendar). A IA na nuvem é opcional (desligada por padrão); o app funciona 100% offline com dados oficiais do TSE." |
| Anúncios | **Não** |
| Público-alvo | 16–17 e 18+ (não incluir menores de 13 — evita a política Families) |
| Classificação de conteúdo (IARC) | Questionário: sem violência, sexo, drogas ou jogos; sem conteúdo gerado por usuários; sem compartilhamento de localização; sem compras. Informar que há **assistente de IA** (interpreta perguntas; respostas de dados oficiais). Esperado: Livre |
| App governamental | **Não** (é independente; não use o nome/logotipo do TSE) |
| Apps de notícias | **Não** (não usar a categoria "Notícias" nem o termo "notícias/jornal") |
| Saúde / Financeiro / Redes sociais | Não |
| Conteúdo gerado por IA | Declarar o assistente. **Mecanismo de relato dentro do app** ✔ ("Relatar problema nesta resposta") |
| Permissões | `INTERNET` e `ACCESS_NETWORK_STATE`. Sem localização, sem armazenamento externo. |

## 5. Data safety (formulário) — conforme o comportamento real

- **Coleta de dados?** Sim, apenas dados opcionais abaixo. **Compartilhamento com terceiros?** Não (operadores — Vercel/Modal/GitHub — tratam sob nossas instruções).
- **Mensagens › Outras mensagens no app** (texto da pergunta enviado à IA na nuvem **e** relatos enviados pelo usuário): coletado, **opcional**, finalidade *Funcionalidade do app*, não compartilhado, criptografado em trânsito.
- **Identificadores de dispositivo ou outros › ID de instância do app** (UUID aleatório que acompanha as chamadas da IA na nuvem): coletado, **opcional**, finalidades *Funcionalidade do app* e *Prevenção de fraude/segurança*, não compartilhado.
- **Localização, informações pessoais, financeiro, saúde, fotos/arquivos, contatos, histórico de navegação, atividade no app:** **não coletados**.
- **Criptografia em trânsito:** Sim. **Exclusão de dados:** Sim — por contato/issue (não há cadastro; relatos públicos podem ser removidos a pedido).
- Mantenha esta resposta idêntica à `docs/PRIVACIDADE.md`. Se um dia ativar analytics/crash SDK, atualize os dois.

## 6. Roteiro de lançamento (ordem)
1. Conferir conta (item 2) e **criar o app** `net.saibatudo.eleicoes2026` (gratuito, pt-BR).
2. Preencher *App content* (seção 4) e *Data safety* (seção 5); ficha da loja (seção 3) e imagens.
3. **Teste interno** (até 100 e-mails, disponível em minutos) → subir o `.aab` → validar o *Pre-launch report* (sem crashes) e a instalação via link.
4. Se a conta exigir: **teste fechado** com ≥ 12 testadores reais por ≥ 14 dias (peça uso diário; faça 2–3 atualizações; responda ao formulário "Apply for production" com detalhes específicos).
5. **Produção** com liberação em etapas (20 % → 100 %). Publicação gerenciada para controlar o dia.
6. Atualizações: incremente `versionCode` em `app/build.gradle.kts`; o pacote de **dados** não exige nova versão do app (atualiza sozinho).
7. Divulgação: orgânica (site/redes). **Não anuncie no Google Ads com conteúdo de candidatos** (política de conteúdo político em anúncios).

## 7. Riscos de rejeição e mitigação
| Risco | Mitigação já aplicada |
| :-- | :-- |
| Parecer app oficial/vinculado ao TSE | Descrição, ficha e app dizem "independente"; sem logotipos do TSE; fontes visíveis |
| IA recomendar/ranquear candidatos (Res. TSE 23.755/2026; política de IA da Play) | Recusa de recomendação/previsão; ordem fixa; fonte e data em cada resposta; botão de relato; rótulo "IA" |
| Dado eleitoral errado/desatualizado | "Atualizado em…", atualização automática assinada, link para a fonte oficial; simulador marcado como educativo |
| Servidor de IA fora do ar na revisão | IA local-first: tudo funciona offline; nuvem é opcional |
| Data safety/privacidade incoerentes | Seção 5 espelha o comportamento real; sem SDKs de terceiros |
| Entrar no escopo de apps de notícias | Categoria Educação; sem "notícias" no texto |
| Teste fechado reprovado | Testadores ativos diariamente + atualizações + respostas específicas |
