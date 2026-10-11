# Guia de Contribuição

Obrigado por contribuir com o **SaibaTudo**! Projeto público, apartidário, sob licença **MIT**, com compromisso de neutralidade e de uso exclusivo de dados oficiais.

## Regras de ouro (não negociáveis)
1. **Só dados oficiais.** Nada fictício, simulado, "provável" ou de fonte não oficial. Novos campos precisam citar o arquivo do TSE de origem ou ser derivação determinística **rotulada** (veja [`DATA_CONTRACT.md`](DATA_CONTRACT.md)).
2. **Neutralidade.** Nada que recomende, ranqueie, compare ou preveja candidaturas (Res. TSE 23.755/2026). Listas em ordem fixa. Correções de dado devem apontar a fonte oficial.
3. **Sem rastreamento.** Nada de analytics, anúncios ou SDKs de terceiros sem discussão pública e atualização de [`PRIVACIDADE.md`](PRIVACIDADE.md) e do Data safety.
4. **IA interpreta, dados respondem.** O texto factual nunca vem de um modelo de linguagem.

## Fluxo
1. Faça um fork e uma branch (`git checkout -b feature/minha-melhoria`).
2. Rode os testes relevantes antes de abrir o PR:
   - Android: `./gradlew testDebugUnitTest lintRelease`
   - Dados: `python -m unittest discover -s pipeline/tests` (e `python pipeline/build.py` para validar o pacote)
   - Site/API: `node --test web/test api/test`
3. Mudou o NLU? Adicione casos em [`contracts/nlu_golden_cases.json`](../contracts/nlu_golden_cases.json): **Android e Web devem passar nos mesmos casos**.
4. Abra o PR descrevendo motivação, fonte oficial (quando houver dados) e testes.

## Estilo
Kotlin (guia oficial do Android), Python (PEP 8), JS (módulos ES, sem dependências externas no site). Comentários em português.

## Segredos
Nunca versione `keystore.properties`, `secrets/`, chaves `.pem` privadas, tokens ou `.env`. A chave **pública** de assinatura dos dados é `pipeline/data_signing_public.pem`.

## Código de conduta
Postura estritamente apartidária, plural e respeitosa. Contribuições que visem favorecer, desinformar ou violar as diretrizes do TSE serão rejeitadas.
