# -*- coding: utf-8 -*-
"""
Alerta de frescor dos dados publicados (workflow data_freshness.yml). Sem dependências além da biblioteca padrão
(a verificação de assinatura usa pipeline/sign.py, que precisa de `ecdsa`; sem ela a checagem é ignorada com aviso).

O que acusa problema:
  1. manifesto de produção inacessível ou ilegível;
  2. assinatura do manifesto de produção INVÁLIDA (a integridade é o contrato central do projeto);
  3. pacote publicado (`generatedAt`) mais velho que --max-horas (padrão 240 h = 10 dias: o pacote é semanal);
  4. as últimas SEGUIDAS execuções do data_refresh terminaram em falha (o incidente de 05/10/2026: 18 falhas seguidas por ~9 h,
     sem ninguém perceber);
  5. nenhuma execução bem-sucedida do data_refresh nas últimas MAX_SEM_SUCESSO_H horas (padrão 240 h).

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

MAX_IDADE_H = 240.0
FALHAS_SEGUIDAS = 2
MAX_SEM_SUCESSO_H = 240.0
BRT = timezone(timedelta(hours=-3))


def idade_pacote(generated_at, agora: datetime):
    """Horas desde `generatedAt` (ISO 8601, UTC). None se não der para ler."""
    if not generated_at or not isinstance(generated_at, str):
        return None
    try:
        t = datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
    except ValueError:
        return None
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    return (agora - t).total_seconds() / 3600.0


def _t(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


def avaliar(manifesto: dict | None, runs: list, agora: datetime, assinatura_valida: bool | None = None, max_idade_h: float = MAX_IDADE_H, max_sem_sucesso_h: float = MAX_SEM_SUCESSO_H):
    """Devolve (ok, problemas). `runs`: execuções do data_refresh, da mais nova para a mais antiga."""
    problemas = []

    if manifesto is None:
        problemas.append("O manifesto de produção está inacessível ou ilegível (https://saibatudo.net/quimica/data/manifest.json).")
    else:
        if assinatura_valida is False:
            problemas.append("A assinatura do manifesto de produção é INVÁLIDA: os apps e o site vão rejeitar a atualização.")
        idade = idade_pacote(manifesto.get("generatedAt"), agora)
        if idade is None:
            problemas.append(f"Não foi possível ler generatedAt do manifesto ({manifesto.get('generatedAt')!r}).")
        elif idade > max_idade_h:
            problemas.append(f"O pacote publicado tem {idade / 24:.1f} dias (limite {max_idade_h / 24:.0f} dias): generatedAt {manifesto.get('generatedAt')} (version {manifesto.get('version')}).")

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
            if horas > max_sem_sucesso_h:
                problemas.append(f"A última execução bem-sucedida do data_refresh foi há {horas / 24:.1f} dias (limite {max_sem_sucesso_h / 24:.0f} dias).")

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
    ap.add_argument("--max-horas", type=float, default=MAX_IDADE_H, help="idade máxima do pacote e da última execução boa (horas)")
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
