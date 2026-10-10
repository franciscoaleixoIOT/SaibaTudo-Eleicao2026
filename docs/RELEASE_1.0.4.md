# Versão 1.0.4 (versionCode 5) — o que muda em relação à 1.0.3 (versionCode 4)

Pacote: `net.saibatudo.eleicoes2026` · Gerada em 09/10/2026 · Arquivo: `app/build/outputs/bundle/release/app-release.aab` (11,3 MB, assinado com a chave de upload).
**Por que existe:** a 1.0.3 já tinha sido enviada à Play (a Play não aceita o mesmo versionCode duas vezes) e o pacote final passou a trazer a correção da busca de
candidato por nome e o snapshot de dados mais recente. Quem tem a 1.0.3 instalada atualiza para esta.

## Diferenças em relação à 1.0.3
| # | O que muda | Como era |
| :-- | :-- | :-- |
| 1 | **Acha o candidato por nome** em "quem é o candidato a deputado Cabo Maciel" e em nomes que contêm palavras de outras regras ("Maria Gato", "Tulio Fontes", "Nai da Bahia"); abreviações com ponto ("Prof. Roger", "Dr.Luisinho") e nomes de 3 letras ("JHC") também. | Toda pergunta com "candidato a CARGO" virava lista e perdia o nome; nomes com palavra de outra regra viravam a regra errada. |
| 2 | **Dados oficiais embutidos atualizados** (snapshot de 09/10/2026). | Snapshot mais antigo (o app atualiza sozinho pela internet; o embutido vale no primeiro uso e offline). |

Tudo o mais é igual à 1.0.3. A lista completa de mudanças desde a 1.0.1 está em [`RELEASE_1.0.3.md`](RELEASE_1.0.3.md). **Nenhuma permissão nova.**

## 1. Texto para "Notas da versão" (pt-BR, 153 de 500 caracteres)

```
<pt-BR>
• Acha o candidato em "quem é o candidato a deputado X" e em nomes com palavras comuns (Maria Gato, Prof. Roger).
• Dados oficiais embutidos atualizados.
</pt-BR>
```

Se a 1.0.3 ainda estiver sem testadores atualizados e você quiser que as notas contem tudo desde a 1.0.1 (449 de 500 caracteres):

```
<pt-BR>
• Corrigido: informa corretamente quando há 2º turno e quem disputa.
• Acha o candidato em "quem é o candidato a deputado X" e em nomes com palavras comuns.
• IA na nuvem segue a conversa ("e em SP?") e tem avisos mais claros.
• Histórico de perguntas com setas para voltar e avançar.
• Texto gerado por IA vem rotulado.
• Nova opção, desligada: "Ajudar a melhorar o app".
• Entende "2a turno" e "no Rio".
• Política de privacidade atualizada (1.4).
</pt-BR>
```

## 2. Passo a passo (teste fechado)
1. Play Console › *Testar e lançar* › *Teste fechado* › a faixa em uso › **Criar nova versão**.
2. Enviar `app/build/outputs/bundle/release/app-release.aab`. A Play deve mostrar **5 (1.0.4)**. Nome da versão: `1.0.4`.
3. Colar as notas (seção 1) › Salvar › Revisar versão › Iniciar lançamento.
4. Se a 1.0.3 estiver **em análise** na mesma faixa, ela pode ser substituída por esta versão em vez de publicada. Os 14 dias de teste contínuo com 12 testadores não reiniciam.
5. *Segurança dos dados*: nada muda em relação à 1.0.3.

## 3. O que pedir para os testadores conferirem (além da lista da 1.0.3)
| Teste | Resultado esperado |
| :-- | :-- |
| "quem é o candidato a deputado cabo maciel" | perfil do CABO MACIEL (Deputado Estadual, Amazonas), não uma lista |
| "patrimônio do candidato a deputado cabo maciel" | patrimônio dele |
| "Maria Gato", "Tulio Fontes", "Nai da Bahia" | perfil de cada um (não regras da urna, fontes ou um estado) |
| "quem é o Prof. Roger" | perfil do PROF. ROGER |
| "candidatos a governador do PT em SP" | continua sendo uma **lista** |

## 4. Verificação feita nesta máquina
Testes unitários (102) e `lintRelease` passaram; o AAB está assinado (`jarsigner -verify`); `tools/verificar_release.py` confirmou as 5 classes obrigatórias; `aapt2` mostra
versionCode 5 e versionName 1.0.4. **Falta, e só você pode fazer:** instalar o release num aparelho e abrir as telas principais
(`adb install -r app/build/outputs/apk/release/app-release.apk`; desinstale antes o app da Play, a assinatura é diferente).
