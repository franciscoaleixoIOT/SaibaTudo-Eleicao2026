# App Android — SaibaTudo Química (v0)

Kotlin + Jetpack Compose (Material 3), MVVM, DataStore, WorkManager, OkHttp, Gson. Pacote `net.saibatudo.quimica`, `versionName 1.0.0`
(`versionCode 1`), `minSdk 24`. Molde: o app do SaibaTudo Eleições 2026.

**O que faz:** início com campo de pergunta (NLU local, respostas só dos dados com fonte), tabela periódica interativa, ficha do elemento e do
composto (estrutura 2D numa WebView local com SmilesDrawer, GHS com pictogramas vetoriais, link da ficha ICSC no site da OIT), busca,
calculadoras com passos (massa molar, balanceamento, estequiometria, concentração/diluição, pH forte e fraco, gás ideal, unidades),
segurança/GHS, "Sobre os dados", privacidade e configurações (tema, tamanho do texto, nível). Nesta versão **nada do usuário sai do aparelho**:
a internet serve só para a atualização assinada do pacote de dados; a IA na nuvem aparece como "ainda não disponível".

## Construir

Pré-requisitos: JDK do Android Studio e SDK em `%LOCALAPPDATA%\Android\Sdk` (`local.properties`).

```bash
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
./gradlew.bat testDebugUnitTest lintDebug     # testes e lint
./gradlew.bat assembleDebug                    # app/build/outputs/apk/debug/app-debug.apk
./gradlew.bat assembleRelease lintRelease      # R8 ligado (regras em app/src/main/keepRules/rules.keep)
```

Os testes leem arquivos reais fora do módulo: `contracts/*.json` (NLU e segurança, compartilhados com o site) e `pipeline/data_signing_public.b64`;
`inputs.files` declara `contracts` e `data` para o Gradle não pular testes quando eles mudam. Sem `data/quimica/`, os testes de contrato usam o
fixture (`app/src/test/resources/data-quimica`, assinado com a chave do projeto) e só os casos cujas entidades ele tem; com o pacote real, valem todos.

## Dados embutidos

Ordem de preferência do Gradle para os assets (`quimica/`):
1. `app/src/main/assets/quimica/` (copiado por `python app/tools/copiar_pacote_para_assets.py`; `--remover` desfaz);
2. `data/quimica/` do repositório (pacote real do pipeline, usado direto);
3. o fixture de testes (só para o app abrir antes de existir o pacote real; ele é rotulado como fixture nas fontes).

Outros utilitários em `app/tools/`: `gerar_fixture_pacote.py` (refaz e assina o fixture com `secrets/data_signing_key.pem`) e `gerar_ghs_kt.py`
(gera `domain/GhsTextos.kt` de `dataset/ghs_pt.py`, as mesmas frases H do site).

## Atualização de dados

`BundleLoader` lê o pacote embutido ou o baixado; `DataUpdater` baixa `manifest.json` + `manifest.sig`, verifica a assinatura ECDSA P-256 com a chave de
`pipeline/data_signing_public.b64` (embutida por BuildConfig), rejeita schema/versão incompatível e pacote mais antigo (anti-rollback), baixa só
o que mudou, confere sha256 e tamanho, e troca de forma atômica (`BundleStore`, com rollback para a versão anterior ou para o pacote embutido).
O WorkManager repete a verificação no intervalo `cliente.pollIntervalMinutes` do manifesto (semanal); o app também confere ao abrir.
Lotes de compostos (`compostos/index.json` → `compostos/<lote>.json`) são lidos sob demanda.

## Assinatura de release

A chave de upload será criada pelo mantenedor. Crie `keystore.properties` na raiz (**fora do Git**, já está no `.gitignore`):

```properties
storeFile=caminho/para/upload.jks
storePassword=...
keyAlias=...
keyPassword=...
```

(ou as variáveis `SAIBATUDO_STORE_FILE`, `SAIBATUDO_STORE_PASSWORD`, `SAIBATUDO_KEY_ALIAS`, `SAIBATUDO_KEY_PASSWORD` no CI). Sem isso, `assembleRelease`
gera `app-release-unsigned.apk`.

## NLU e segurança

`ai/nlu/LocalNlu.kt` é o espelho de `web/src/quimica/js/nlu.js` (mesma ordem de regras, documentada no cabeçalho) e `ai/Seguranca.kt` de `seguranca.js`;
os casos de `contracts/nlu_golden_cases.json` e `contracts/seguranca_cases.json` conferem os dois. O dicionário é derivado dos dados do pacote.
