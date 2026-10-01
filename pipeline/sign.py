# -*- coding: utf-8 -*-
"""
Assinatura do manifesto de dados (ECDSA P-256 / SHA-256, assinatura DER em Base64).

Por que assinar: o app Android baixa atualizações de dados do domínio saibatudo.net. A assinatura
garante que somente quem possui a chave privada (guardada como segredo do CI) consegue publicar
dados aceitos pelo app — mesmo que a hospedagem seja comprometida.

Uso:
    python pipeline/sign.py gen   --private secrets/data_signing_key.pem --public pipeline/data_signing_public.pem
    python pipeline/sign.py sign  <manifest.json> --private secrets/data_signing_key.pem
    python pipeline/sign.py verify <manifest.json> --public pipeline/data_signing_public.pem

Dependência: pip install ecdsa  (Python puro; funciona onde extensões C são bloqueadas).
O Android verifica com java.security.Signature("SHA256withECDSA") usando a chave pública X.509 (Base64 DER).
"""
import argparse
import base64
import hashlib
import sys
from pathlib import Path

from ecdsa import NIST256p, SigningKey, VerifyingKey
from ecdsa.util import sigencode_der, sigdecode_der


def gerar(priv: Path, pub: Path):
    priv.parent.mkdir(parents=True, exist_ok=True)
    sk = SigningKey.generate(curve=NIST256p)
    priv.write_bytes(sk.to_pem())
    pub.write_bytes(sk.get_verifying_key().to_pem())
    # Chave pública X.509 SubjectPublicKeyInfo em Base64 (formato embutido no app)
    der = sk.get_verifying_key().to_der()
    pub.with_suffix(".b64").write_text(base64.b64encode(der).decode() + "\n", encoding="utf-8")


def assinar(manifest: Path, priv: Path):
    sk = SigningKey.from_pem(Path(priv).read_bytes())
    sig = sk.sign(Path(manifest).read_bytes(), hashfunc=hashlib.sha256, sigencode=sigencode_der)
    Path(manifest).with_name("manifest.sig").write_text(base64.b64encode(sig).decode() + "\n", encoding="utf-8")


def verificar(manifest: Path, pub: Path) -> bool:
    vk = VerifyingKey.from_pem(Path(pub).read_bytes())
    sig = base64.b64decode(Path(manifest).with_name("manifest.sig").read_text(encoding="utf-8").strip())
    try:
        return vk.verify(sig, Path(manifest).read_bytes(), hashfunc=hashlib.sha256, sigdecode=sigdecode_der)
    except Exception:  # noqa: BLE001
        return False


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["gen", "sign", "verify"])
    ap.add_argument("manifest", nargs="?")
    ap.add_argument("--private")
    ap.add_argument("--public")
    a = ap.parse_args()
    if a.cmd == "gen":
        gerar(Path(a.private), Path(a.public))
        print("chaves geradas")
    elif a.cmd == "sign":
        assinar(Path(a.manifest), Path(a.private))
        print("assinado")
    else:
        ok = verificar(Path(a.manifest), Path(a.public))
        print("assinatura VÁLIDA" if ok else "assinatura INVÁLIDA")
        sys.exit(0 if ok else 1)
