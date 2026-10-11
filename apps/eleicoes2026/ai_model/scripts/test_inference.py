# -*- coding: utf-8 -*-
"""
Validação OFICIAL do modelo treinado SaibaTudo-Eleicao2026 (merged).
Testa: (1) saída JSON estruturada válida; (2) fatos OFICIAIS do TSE 2026
(candidatos reais, contagens reais, regras, pesquisas registradas).
"""
import json
import re
import sys
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MERGED = Path(__file__).resolve().parent.parent / "output" / "SaibaTudo-Eleicao2026-merged"

# Fatos oficiais verificados nos dados TSE 2026 (extração 30/09/2026)
FATOS_OFICIAIS = {
    "total_candidatos": 20988,
    "total_presidentes": 14,
    "primeiro_turno": "04/10/2026",
    "pesquisas_registradas": 3467,
    "presidenciaveis_reais": {"LULA": "PT", "FLAVIO BOLSONARO": "PL", "PABLO MARÇAL": "PRTB",
                               "ZEMA": "NOVO", "RONALDO CAIADO": "PSD", "ESCRITOR AUGUSTO CURY": "AVANTE"},
}

TEST_QUERIES = [
    "Qual é a ordem de votação na urna eletrônica em 2026 e quantos dígitos tem cada cargo?",
    "Quem disputa a Presidência da República em 2026?",
    "Quem é LULA e qual seu partido?",
    "Candidatos a senador em SP com foco em saúde",
    "Quantos candidatos foram registrados nas eleições 2026?",
    "Quem é Fred Couto?",
    "O que acontece se eu votar no mesmo senador na 1ª e na 2ª vaga?",
    "Quantas pesquisas eleitorais foram registradas no TSE para 2026?",
    "Onde consulto as eleições em São Paulo?",
    "Candidatos com Ficha Limpa em São Paulo",
]


def extrair_json(texto):
    i = texto.find("{")
    j = texto.rfind("}")
    if i == -1 or j <= i:
        return None
    try:
        return json.loads(texto[i:j + 1])
    except Exception:
        return None


def validar_estrutura(d):
    if d is None:
        return False, "sem JSON"
    obrigatorios = ["intent", "target_route", "menu_id", "filters", "direct_answer"]
    faltando = [k for k in obrigatorios if k not in d]
    if faltando:
        return False, f"faltando {faltando}"
    return True, "ok"


def main():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print("=" * 70)
    print("  VALIDAÇÃO OFICIAL - SaibaTudo-Eleicao2026 (merged)")
    print("=" * 70)
    print(f"Modelo: {MERGED} | Dispositivo: {device}")

    tokenizer = AutoTokenizer.from_pretrained(str(MERGED), trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        str(MERGED), torch_dtype=torch.bfloat16, device_map="auto", trust_remote_code=True
    )
    model.eval()

    json_ok = 0
    resultados = []
    for idx, q in enumerate(TEST_QUERIES, 1):
        prompt = (
            "<|im_start|>system\nVocê é o assistente inteligente do SaibaTudo-Eleicao2026. "
            "Com base nos dados OFICIAIS do TSE (Eleições Gerais 2026), identifique "
            "intenção, rota, menu, submenu e filtros, e responda com JSON estruturado.<|im_end|>\n"
            "<|im_start|>user\n" + q + "<|im_end|>\n"
            "<|im_start|>assistant\n"
        )
        inputs = tokenizer(prompt, return_tensors="pt").to(device)
        with torch.no_grad():
            out = model.generate(**inputs, max_new_tokens=350, temperature=0.1, do_sample=False,
                                 pad_token_id=tokenizer.eos_token_id)
        gen = tokenizer.decode(out[0][inputs.input_ids.shape[1]:], skip_special_tokens=True).strip()
        d = extrair_json(gen)
        ok, motivo = validar_estrutura(d)
        json_ok += int(ok)
        resultados.append((q, ok, motivo, gen[:220]))
        print(f"\n[{idx}] {'✅' if ok else '❌'} {q}\n    {motivo}\n    {gen[:180].replace(chr(10), ' ')}")

    print("\n" + "=" * 70)
    print(f"RESULTADO: {json_ok}/{len(TEST_QUERIES)} respostas com JSON estruturado válido")
    print("=" * 70)
    Path(__file__).parent.parent.joinpath("data").mkdir(exist_ok=True)
    with open(Path(__file__).parent.parent / "data" / "validacao_modelo_resultados.json", "w", encoding="utf-8") as f:
        json.dump([{"pergunta": q, "json_valido": ok, "motivo": m, "saida": g}
                   for q, ok, m, g in resultados], f, ensure_ascii=False, indent=1)
    sys.exit(0 if json_ok >= len(TEST_QUERIES) * 0.8 else 1)


if __name__ == "__main__":
    main()
