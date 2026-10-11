# Medições locais (fora do histórico do painel)

A pasta `eval/` (um nível acima) é o HISTÓRICO que o painel de qualidade lê (`tools/metricas.py`): um arquivo por execução, no formato de
`eval_golden.py --out`, sempre sobre os casos de referência (`contracts/nlu_golden_cases.json`). Aqui ficam as medições que não pertencem a esse histórico:

- `*_holdout*.json`: perguntas reservadas (nunca treinadas), outro conjunto de casos;
- `*_local.json`: o `eval.json` completo da conversão local (`backend/modal/convert_local.py`), no formato do Volume (`Q4_K_M`, `Q8_0`, holdout informativo);
- versões reprovadas no gate (ex.: `v2.2-20261006`), que nunca foram para produção.
