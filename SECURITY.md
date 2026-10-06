# Política de segurança

O SaibaTudo Eleições 2026 é um projeto independente e de código aberto que lida com informação eleitoral. Integridade dos dados
e neutralidade valem tanto quanto confidencialidade: leve a sério o que você achar.

## Como relatar uma vulnerabilidade

**Não abra uma issue pública** para falhas de segurança. Use uma destas vias:

1. **GitHub:** aba *Security* do repositório › *Report a vulnerability* (relato privado), se estiver habilitado; ou
2. **E-mail:** <saibatudo@saibatudo.net>, com o assunto "Segurança".

Inclua o que você viu, como reproduzir, o impacto que imagina e, se quiser, como prefere ser creditado. Respondemos em até 5 dias úteis
(melhor esforço: é um projeto mantido por poucas pessoas) e avisamos quando a correção estiver no ar.

## O que é mais importante para nós (escopo)

- **Integridade dos dados publicados:** qualquer forma de fazer os apps ou o site aceitarem um pacote de dados que não foi assinado com a
  chave do projeto, ou de contornar a verificação de assinatura, o `sha256` dos arquivos ou a proteção contra versão antiga (anti-rollback).
- **Chaves e segredos:** exposição da chave privada de assinatura dos dados, do keystore de upload, de tokens do Modal, da Vercel ou do GitHub.
- **API (`/api/nlu`, `/api/ask`, `/api/report`, `/api/health`):** injeção de instrução no modelo, abuso de custo, burla de limites, vazamento da pergunta
  de alguém, SSRF, XSS, CORS permissivo.
- **Neutralidade:** uma forma reproduzível de fazer a IA recomendar, comparar ou prever candidatos (Res. TSE 23.755/2026), ou de exibir texto gerado
  como se fosse dado oficial.
- **Privacidade:** qualquer envio de dado pessoal ou de localização que a [política de privacidade](docs/PRIVACIDADE.md) não declare.

Fora do escopo: erros nos dados que vêm do próprio TSE (relate ao TSE e abra uma issue comum, com o link da fonte), indisponibilidade por
excesso de acessos e achados que dependam de aparelho com root ou de acesso físico já desbloqueado.

## Versões com correção

Só a **última versão** do app (Google Play) e o site em produção (`saibatudo.net`) recebem correções de segurança.

## Segredos neste repositório

Nunca devem ser versionados: `secrets/`, `keystore.properties`, `*.pem` (exceto a chave **pública** `pipeline/data_signing_public.pem`),
`.env*`. Se você encontrar algum no histórico, avise pelas vias acima.
