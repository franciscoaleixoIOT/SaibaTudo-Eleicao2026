# ai_model — treino local dos modelos do SaibaTudo Química

Treino **local** (RTX 5060 de 8 GB; o Modal só serve). Dois modelos, mesmo fluxo:

| Alvo | Base | Conjunto de treino | Saída |
| :-- | :-- | :-- | :-- |
| `nlu` (interpretação) | `Qwen/Qwen2.5-1.5B-Instruct`, `max_length 256` | `backend/retrain/build_nlu_dataset.py` -> `backend/retrain/out-nlu/train.json` | `output/SaibaTudo-Quimica-NLU-merged` |
| `ask` (explicador) | `Qwen/Qwen3-4B-Instruct-2507`, `max_length 1024` | `backend/retrain/build_ask_dataset.py` -> `backend/retrain/out-ask/train.json` | `output/SaibaTudo-Quimica-Ask-merged` |

```bash
python -m venv ai_model/.venv && ai_model/.venv/Scripts/python.exe -m pip install -r ai_model/requirements.txt
ai_model/.venv/Scripts/python.exe ai_model/scripts/train_hybrid.py --target nlu --version nlu-v1-AAAAMMDD > ai_model/output/treino_nlu-v1.log
ai_model/.venv/Scripts/python.exe ai_model/scripts/merge_and_export.py --target nlu
```

O passo a passo completo (dataset -> treino -> fusão -> conversão e gates -> Hugging Face -> Modal -> promoção -> Vercel) está em `docs/MODELO.md`.
`output/` e `data/` ficam fora do Git. Testes: `python -m unittest discover -s ai_model/scripts -p "test_*.py"`.

Cartões dos modelos (viram o `README.md` da pasta mesclada): `MODEL_CARD_NLU.md` e `MODEL_CARD_ASK.md`.
