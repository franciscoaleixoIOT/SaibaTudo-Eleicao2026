# -*- coding: utf-8 -*-
"""
Download incremental das fontes OFICIAIS do TSE (CDN oficial cdn.tse.jus.br).

- Usa HEAD + ETag/Last-Modified/Content-Length para só baixar o que mudou.
- Guarda o estado em  <cache>/state.json  (ETag, Last-Modified, tamanho, sha256, data de coleta).
- Extrai os zips em  <cache>/extracted/<fonte>/ .
- Código de saída 0 mesmo sem mudanças; imprime "CHANGED=<n>" para uso em CI.

Uso:
    python pipeline/fetch.py                 # fontes essenciais + fotos/planos
    python pipeline/fetch.py --com-contas    # inclui prestação de contas (~150 MB)
    python pipeline/fetch.py --force         # ignora ETag e baixa tudo de novo
"""
import argparse
import hashlib
import json
import os
import shutil
import sys
import time
import urllib.error
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sources as S  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CACHE = ROOT / "ai_model" / "data" / "tse_official"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/124.0 Safari/537.36 SaibaTudoBot/1.0 (+https://saibatudo.net)")


def utcnow():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def head(url, timeout=40):
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return {
            "status": r.status,
            "etag": r.headers.get("ETag"),
            "lastModified": r.headers.get("Last-Modified"),
            "size": int(r.headers.get("Content-Length") or 0),
        }


def download(url, dest: Path, retries=3):
    dest.parent.mkdir(parents=True, exist_ok=True)
    last = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            sha = hashlib.sha256()
            tmp = dest.with_suffix(dest.suffix + ".part")
            with urllib.request.urlopen(req, timeout=120) as r, open(tmp, "wb") as f:
                while True:
                    chunk = r.read(1 << 20)
                    if not chunk:
                        break
                    f.write(chunk)
                    sha.update(chunk)
            tmp.replace(dest)
            return sha.hexdigest()
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2 * attempt)
    raise RuntimeError(f"falha ao baixar {url}: {last}")


class Fetcher:
    def __init__(self, cache: Path, force=False):
        self.cache = cache
        self.raw = cache / "raw"
        self.extracted = cache / "extracted"
        self.state_path = cache / "state.json"
        self.force = force
        self.state = {}
        self.changed = []
        if self.state_path.exists():
            self.state = json.loads(self.state_path.read_text(encoding="utf-8"))
        self.raw.mkdir(parents=True, exist_ok=True)
        self.extracted.mkdir(parents=True, exist_ok=True)

    def save(self):
        self.state_path.write_text(json.dumps(self.state, indent=2, ensure_ascii=False), encoding="utf-8")

    def sync(self, key: str, url: str, extract_to: str = None) -> dict:
        """Baixa se mudou. Retorna o registro de estado da fonte (None se indisponível)."""
        info_prev = self.state.get(key, {})
        try:
            h = head(url)
        except urllib.error.HTTPError as e:
            print(f"  [{key}] indisponível (HTTP {e.code})")
            return info_prev or None
        except Exception as e:  # noqa: BLE001
            print(f"  [{key}] erro de rede: {e}")
            return info_prev or None

        zip_path = self.raw / (Path(url).name)
        same = (
            not self.force
            and info_prev.get("etag") == h["etag"]
            and info_prev.get("lastModified") == h["lastModified"]
            and info_prev.get("size") == h["size"]
            and zip_path.exists()
        )
        target = self.extracted / (extract_to or key)
        if same and target.exists():
            print(f"  [{key}] sem mudanças ({h['lastModified']})")
            return info_prev

        print(f"  [{key}] baixando {h['size'] / 1e6:.1f} MB ...")
        sha = download(url, zip_path)
        rec = {
            "url": url,
            "etag": h["etag"],
            "lastModified": h["lastModified"],
            "size": h["size"],
            "sha256": sha,
            "retrievedAt": utcnow(),
        }
        if h["size"] <= 1024:
            # Slot publicado pelo TSE sem conteúdo (ex.: resultados antes da apuração)
            rec["vazio"] = True
            print(f"  [{key}] arquivo ainda vazio no TSE ({h['size']} bytes)")
        else:
            if target.exists():
                shutil.rmtree(target)
            target.mkdir(parents=True, exist_ok=True)
            try:
                with zipfile.ZipFile(zip_path) as z:
                    z.extractall(target)
            except zipfile.BadZipFile:
                rec["vazio"] = True
                print(f"  [{key}] zip inválido/vazio")
        self.state[key] = rec
        self.changed.append(key)
        self.save()
        return rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=str(DEFAULT_CACHE))
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--com-contas", action="store_true", help="inclui prestação de contas (~150 MB)")
    ap.add_argument("--sem-fotos", action="store_true")
    ap.add_argument("--sem-planos", action="store_true")
    args = ap.parse_args()

    f = Fetcher(Path(args.cache), force=args.force)
    print("== CSVs oficiais ==")
    for key, src in S.CSV_SOURCES.items():
        f.sync(key, src["url"])
    print("== Resultados (slots do TSE) ==")
    for key, src in S.RESULTADOS_SOURCES.items():
        f.sync(key, src["url"])
    if args.com_contas:
        print("== Prestação de contas ==")
        f.sync("prestacao_contas", S.CONTAS_SOURCE["url"])
    if not args.sem_fotos:
        print("== Fotos oficiais ==")
        for uf in ["BR"] + S.UFS:
            f.sync(f"fotos_{uf}", S.foto_zip_url(uf))
    if not args.sem_planos:
        print("== Planos de governo (PDF) ==")
        for uf in ["BR"] + S.UFS:
            f.sync(f"planos_{uf}", S.plano_zip_url(uf))
    f.save()
    print(f"CHANGED={len(f.changed)}")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as out:
            out.write(f"changed={'true' if f.changed else 'false'}\n")


if __name__ == "__main__":
    main()
