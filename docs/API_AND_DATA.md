# Fontes de Dados e Integração TSE - Eleições 2026 🇧🇷📊

O **SaibaTudo-Eleicao2026** tem como princípio a fidelidade absoluta aos dados oficiais de registro de candidaturas, prestação de contas e diretrizes eleitorais do Brasil.

---

## 🏛️ Fontes Oficiais

1. **DivulgaCandContas (TSE)**:
   - Sistema oficial do Tribunal Superior Eleitoral para divulgação de candidaturas e prestação de contas eleitorais.
   - Endpoint Base: `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/`
   - Principais recursos consumidos:
     - Consulta de candidatos por cargo e UF
     - Planos de governo e propostas registradas
     - Situação de deferimento da candidatura
     - Número na urna, coligações e foto oficial

2. **Portal de Dados Abertos do TSE**:
   - Arquivos consolidados de locais de votação, seções eleitorais, zonas e estatísticas de eleitorado por município e faixa etária.

---

## 💾 Estratégia de Cache e Resiliência Offline

Para assegurar funcionamento ágil mesmo em momentos de sobrecarga dos servidores do TSE ou instabilidade de rede no dia da eleição:

1. **Pre-caching Local**:
   - O aplicativo armazena as estruturas de menus, partidos, cargos e regras eleitorais localmente.
2. **Atualização Incremental**:
   - As listas de candidatos e planos de governo são sincronizadas em segundo plano via WorkManager e armazenadas em cache.
3. **Fallback Offline**:
   - Quando não há conectividade com a internet, o aplicativo opera com o último snapshot sincronizado e com o motor de inferência local.
