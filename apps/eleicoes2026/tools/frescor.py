# -*- coding: utf-8 -*-
"""
Alerta de frescor dos dados publicados (workflow data_freshness.yml). Sem dependências além da biblioteca padrão
(a verificação de assinatura usa pipeline/sign.py, que precisa de `ecdsa`; sem ela a checagem é ignorada com aviso).

O que acusa problema:
  1. manifesto de produção inacessível ou ilegível;
  2. assinatura do manifesto de produção INVÁLIDA (a integridade é o contrato central do projeto);
  3. extração do TSE mais velha que MAX_IDADE_TSE_H (30 h: o TSE para de gerar à noite e, depois da eleição, pode gerar só 1x por dia;
     um limite curto alertaria toda madrugada. Pipeline travado é pego pelos itens 4 e 5, que são rápidos);
  4. as últimas SEGUIDAS execuções do data_refresh terminaram em falha (o incidente de 05/10/2026: 18 falhas seguidas por ~9 h,
     sem ninguém perceber);
  5. nenhuma execução bem-sucedida do data_refresh nas últimas MAX_SEM_SUCESSO_H horas.

Uso:  python tools/frescor.py --manifest-url URL --runs runs.json [--assinatura-url URL] [--saida resultado.json]
`runs.json` = saída de: gh run list --workflow data_refresh.yml --limit 10 --json conclusion,status,createdAt
Código de saída: 0 = tudo certo; 1 = há problema (o workflow abre/atualiza a issue); 2 = erro de uso.
"""
import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

MAX_IDADE_TSE_H = 30.0
FALHAS_SEGUIDAS = 3
MAX_SEM_SUCESSO_H = 3.0
BRT = timezone(timedelta(hours=-3))


def idade_extracao_tse(extracao: str | None, agora: datetime):
    """Horas desde a extração do TSE ("dd/mm/aaaa HH:MM:SS", horário de Brasília). None se não der para ler."""
    m = re.fullmatch(r"\s*(\d{2})/(\d{2})/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s*", extracao or "")
    if not m:
        return None
    d, mes, a, h, mi, s = int(m[1]), int(m[2]), int(m[3]), int(m[4]), int(m[5]), int(m[6] or 0)
    try:
        t = datetime(a, mes, d, h, mi, s, tzinfo=BRT)
    except ValueError:
        return None
    return (agora - t).total_seconds() / 3600.0


def _t(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


def avaliar(manifesto: dict | None, runs: list, agora: datetime, assinatura_valida: bool | None = None):
    """Devolve (ok, problemas). `runs`: execuções do data_refresh, da mais nova para a mais antiga."""
    problemas = []

    if manifesto is None:
        problemas.append("O manifesto de produção está inacessível ou ilegível (https://saibatudo.net/data/eleicoes2026/manifest.json).")
    else:
        if assinatura_valida is False:
            problemas.append("A assinatura do manifesto de produção é INVÁLIDA: os apps e o site vão rejeitar a atualização.")
        idade = idade_extracao_tse(manifesto.get("extracaoTse"), agora)
        if idade is None:
            problemas.append(f"Não foi possível ler extracaoTse do manifesto ({manifesto.get('extracaoTse')!r}).")
        elif idade > MAX_IDADE_TSE_H:
            problemas.append(
                f"A extração do TSE publicada tem {idade:.1f} h (limite {MAX_IDADE_TSE_H:.0f} h): "
                f"{manifesto.get('extracaoTse')} (dataVersion {manifesto.get('dataVersion')})."
            )

    concluidas = [r for r in runs if r.get("status") == "completed"]
    seguidas = 0
    for r in concluidas:
        if r.get("conclusion") == "failure":
            seguidas += 1
        else:
            break
    if seguidas >= FALHAS_SEGUIDAS:
        problemas.append(f"As últimas {seguidas} execuções do data_refresh falharam em sequência.")

    sucessos = [r for r in concluidas if r.get("conclusion") == "success"]
    if concluidas:
        if not sucessos:
            problemas.append(f"Nenhuma execução bem-sucedida do data_refresh entre as últimas {len(concluidas)}.")
        else:
            horas = (agora - _t(sucessos[0]["createdAt"])).total_seconds() / 3600.0
            if horas > MAX_SEM_SUCESSO_H:
                problemas.append(f"A última execução bem-sucedida do data_refresh foi há {horas:.1f} h (limite {MAX_SEM_SUCESSO_H:.0f} h).")

    return (not problemas), problemas


def _baixar(url: str, timeout: float = 30.0) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "saibatudo-frescor/1"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def _verificar_assinatura(manifest_bytes: bytes, sig_b64: str, pub_pem: Path):
    """True/False, ou None se não for possível verificar neste ambiente (sem `ecdsa`)."""
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline"))
        from sign import verificar_bytes  # type: ignore
    except Exception:  # noqa: BLE001
        return None
    try:
        return bool(verificar_bytes(manifest_bytes, sig_b64, pub_pem))
    except Exception:  # noqa: BLE001
        return False


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--manifest-url", required=True)
    ap.add_argument("--assinatura-url", help="URL de manifest.sig (se informada, a assinatura é verificada)")
    ap.add_argument("--public", default=str(Path(__file__).resolve().parent.parent / "pipeline" / "data_signing_public.pem"))
    ap.add_argument("--runs", required=True, help="JSON de gh run list (do data_refresh)")
    ap.add_argument("--saida", help="grava {ok, problemas, avaliadoEm} em JSON")
    a = ap.parse_args(argv)

    agora = datetime.now(timezone.utc)
    manifesto, assinatura_ok = None, None
    try:
        bruto = _baixar(a.manifest_url)
        manifesto = json.loads(bruto.decode("utf-8"))
        if a.assinatura_url:
            assinatura_ok = _verificar_assinatura(bruto, _baixar(a.assinatura_url).decode("ascii").strip(), Path(a.public))
    except (urllib.error.URLError, OSError, ValueError):
        manifesto = None
    runs = json.loads(Path(a.runs).read_text(encoding="utf-8")) if Path(a.runs).exists() else []

    ok, problemas = avaliar(manifesto, runs, agora, assinatura_ok)
    for p in problemas:
        print("PROBLEMA:", p)
    if ok:
        print("OK: dados frescos e íntegros")
    if a.saida:
        Path(a.saida).write_text(json.dumps({"ok": ok, "problemas": problemas, "avaliadoEm": agora.isoformat()}, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
