# -*- coding: utf-8 -*-
"""Utilitários compartilhados do pipeline (somente biblioteca padrão)."""
import csv
import hashlib
import json
import re
import unicodedata
from pathlib import Path

csv.field_size_limit(50_000_000)

PLACEHOLDERS = {"#NE", "#NULO", "#NULO#", "-1", "-2", "-3", "-4", "-5", "NÃO DIVULGÁVEL",
                "Não divulgável", "#DIVULGA", ""}


def clean(v):
    """Normaliza placeholders do TSE para None; mantém '0' (é um valor válido em vários campos)."""
    if v is None:
        return None
    v = v.strip()
    return None if v in PLACEHOLDERS else v


def strip_accents(s):
    if not s:
        return s or ""
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def norm(s):
    return re.sub(r"\s+", " ", strip_accents(s or "").lower()).strip()


def _encoding(path: Path):
    with open(path, "rb") as f:
        head = f.read(200_000)
    try:
        head.decode("utf-8")
        return "utf-8-sig"
    except UnicodeDecodeError:
        return "latin-1"


def read_csv(path):
    """Lê CSV oficial do TSE (separador ';', latin-1 ou utf-8)."""
    path = Path(path)
    with open(path, encoding=_encoding(path), newline="") as f:
        return list(csv.DictReader(f, delimiter=";"))


def iter_csv(path):
    path = Path(path)
    with open(path, encoding=_encoding(path), newline="") as f:
        yield from csv.DictReader(f, delimiter=";")


def to_float(v):
    """'1.234,56' | '1234,56' -> float (formato numérico brasileiro)."""
    v = clean(v)
    if v is None:
        return None
    v = v.replace(".", "").replace(",", ".") if "," in v else v
    try:
        return float(v)
    except ValueError:
        return None


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sha256_file(path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def dump_json(path, obj, indent=None):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    data = json.dumps(obj, ensure_ascii=False, separators=(",", ":") if indent is None else None,
                      indent=indent, sort_keys=False).encode("utf-8")
    path.write_bytes(data)
    return data
