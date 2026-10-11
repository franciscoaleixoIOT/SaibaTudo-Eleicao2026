# SaibaTudo Eleições 2026 — guia para agentes de código

App Android + site/PWA cívico, **independente e sem anúncios**, com dados abertos do TSE (Eleições Gerais 2026). Um assistente responde **só com dados oficiais**:
a IA interpreta a pergunta, os dados respondem. Idioma de tudo o que o usuário lê: **português do Brasil**. Commits e código em inglês/misto, como já está.

**Leia primeiro:** [`docs/PROJECT_MEMORY.md`](docs/PROJECT_MEMORY.md) (estado, processo de publicação, testes, decisões, armadilhas) e
[`docs/OPERACAO.md`](docs/OPERACAO.md) (operação, alertas, chaves de desligamento).

## Regras que não se negociam
1. **Só dados oficiais do TSE.** Nada fictício, inferido ou de fonte não oficial. Derivações são determinísticas e rotuladas.
2. **Neutralidade (Res. TSE 23.755/2026).** O app nunca recomenda, compara nem prevê candidatos. Pedido de recomendação é recusado e **nunca chega a um modelo**.
3. **Fato crítico não vem de texto gerado.** Quem foi eleito, se há 2º turno, datas e votos saem dos dados/apuração; o texto gerado é rotulado ("pode conter erros") e o servidor o descarta se contradisser o app.
4. **Privacidade.** Nada é enviado sem toque ou consentimento. O Android **não usa localização**. Perguntas com dado pessoal ou que revelem opinião política nunca entram na captura. Política (`docs/PRIVACIDADE.md` = `web/src/privacidade/index.html`) tem de continuar verdadeira.
5. **Segredos nunca no Git nem no chat.** Ficam em `secrets/` (ignorado pelo Git). Peça ao mantenedor para colar o segredo em um arquivo lá.
6. **Congelamento de 24 a 26/10/2026** (2º turno): não mudar modelo, NLU, respostas, API, pipeline, workflows nem app. Dados, docs e testes seguem livres (`docs/PROJECT_MEMORY.md` §4.9).

## Publicar (resumo; passo a passo em `docs/PROJECT_MEMORY.md` §4)
- **Push na `main` não faz deploy.** Depois de enviar: `gh workflow run eleicoes-data-refresh.yml`, esperar terminar e conferir `curl -s https://saibatudo.net/api/health` (o `version` é o commit publicado).
- **Conferir também `eleicoes-web-ci.yml` e `eleicoes-android-ci.yml`** depois de cada push (`gh run list --limit 6`). Deploy verde não significa CI verde.
- Push recusado? O robô de dados comita na `main`: `git pull --rebase origin main` e enviar de novo.
- Variável da Vercel só vale no próximo deploy. `printf '%s' "$VALOR" | vercel env add NOME production --sensitive` (Git Bash).
- Mudou algo que existe no app **e** no site (NLU, respostas, textos)? Portar para os dois e rodar os dois conjuntos de testes; os arquivos de `contracts/` pegam divergência.
- Modelo da nuvem: ciclo **local** (treino, conversão e gate) em `docs/PROJECT_MEMORY.md` §4.5. Só o arquivo final vai ao Modal; promover só o que passa no gate.
- Android: subir `versionCode`, gerar o AAB, rodar `tools/verificar_release.py` e **testar o release num aparelho** antes de enviar à Play (§4.8).

## Testar
```bash
cd api && npm test                                   # 228
cd web && npm test                                   # 176
node --test "backend/retrain/*.test.mjs"             # 54
python -m unittest discover -s tools -p "test_*.py"
python -m unittest discover -s backend/modal -p "test_*.py"
python -m unittest discover -s pipeline/tests
python tools/test_workflows.py
JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./gradlew.bat --console=plain testDebugUnitTest lintRelease   # 102; confira o horário dos XML
```
Antes de dizer "corrigido": **reproduza, corrija, meça de novo** (varredura de todos os candidatos, comparação antigo × novo sobre perguntas conhecidas, resposta real do TSE como amostra) e teste **ao vivo** depois do deploy.

## Onde mora cada coisa
`app/` Android · `web/` site e PWA (JS puro) · `api/` funções da Vercel · `pipeline/` dados do TSE · `backend/modal/` serviços e gate do modelo ·
`backend/retrain/` dados de treino · `backend/hf_space_qwen7b/` Space do texto gerado · `ai_model/` scripts de treino (saídas fora do Git) ·
`contracts/` casos compartilhados Android×site×servidor · `eval/` histórico do painel (**só um arquivo por modelo em produção**; o resto em `eval/local/`) ·
`tools/` verificações do CI · `docs/` documentação.

## Armadilhas desta máquina (Windows 11, Git Bash)
- Git Bash reescreve argumentos que começam com `/`: use `MSYS_NO_PATHCONV=1` (`modal volume put`, `adb`).
- Scripts longos com aspas, `\n` ou Unicode quebram em heredoc: **grave o arquivo** com a ferramenta de escrita e rode-o.
- Depois de usar o WSL, rode `wsl --shutdown`. O ciclo atual do modelo não precisa de WSL.
- Treino de ~3,5 h na GPU: impedir a suspensão do Windows enquanto ele roda. Não rodar medições pesadas ao mesmo tempo.
- JDK: `C:\Program Files\Android\Android Studio\jbr` (defina `JAVA_HOME`). Aviso "LF will be replaced by CRLF" do Git é inofensivo.
- `.kilo/` na raiz é de outra ferramenta e fica fora do Git.

## Decisões já tomadas pelo mantenedor (não re-propor)
Estado escolhido à mão no Android (sem localização) · botão "Perguntar à IA na nuvem" sempre disponível · treino e conversão de modelo sempre locais ·
captura de perguntas ligada, opt-in da pessoa · texto gerado ligado no ZeroGPU do Hugging Face, Modal só de reserva · custo dentro dos US$ 30/mês grátis do Modal.
