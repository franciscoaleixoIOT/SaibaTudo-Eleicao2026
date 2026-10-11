# -*- coding: utf-8 -*-
"""Quanto resta da cota de uploads da Vercel antes de um deploy.

O plano Hobby aceita 5.000 arquivos enviados por 24 h (`api-upload-free`), contados por CONTA: o site de eleições
(deploy a cada 30 min) e este projeto dividem a mesma cota. Um deploy que a esgota trava também os deploys de eleições.
A CLI só envia arquivos cujo SHA-1 a Vercel ainda não tem, então o custo de um deploy é o número de arquivos novos.

Envia UM arquivo de poucos bytes (gasta 1 upload, não cria deploy) e lê os cabeçalhos x-ratelimit-*.
Token: variável VERCEL_TOKEN ou o login local da CLI (auth.json). O token nunca é impresso.

Uso: python tools/vercel_cota.py [--minimo N]    (código de saída 1 se restarem menos de N uploads)
"""
import argparse
import datetime
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
API = 'https://api.vercel.com/v2/files'


def ler_token():
    if os.environ.get('VERCEL_TOKEN'):
        return os.environ['VERCEL_TOKEN']
    for base in (os.environ.get('APPDATA'), '~/.local/share', '~/Library/Application Support'):
        if not base:
            continue
        for p in (Path(base).expanduser() / 'com.vercel.cli' / 'Data' / 'auth.json', Path(base).expanduser() / 'com.vercel.cli' / 'auth.json'):
            if p.exists():
                return json.loads(p.read_text(encoding='utf-8'))['token']
    sys.exit('Sem VERCEL_TOKEN e sem login da CLI (rode `vercel login`).')


def ler_org():
    if os.environ.get('VERCEL_ORG_ID'):
        return os.environ['VERCEL_ORG_ID']
    return json.loads((RAIZ / '.vercel' / 'project.json').read_text(encoding='utf-8'))['orgId']


def resumo(cabecalhos, agora):
    """(restantes, texto) a partir dos cabeçalhos x-ratelimit-* da resposta."""
    limite = int(cabecalhos.get('x-ratelimit-limit') or 0)
    restantes = int(cabecalhos.get('x-ratelimit-remaining') or 0)
    reset = int(cabecalhos.get('x-ratelimit-reset') or 0)
    quando = datetime.datetime.fromtimestamp(reset).strftime('%d/%m %H:%M') if reset else '?'
    texto = (f'uploads livres: {restantes} de {limite}. A janela é móvel: cada envio sai da conta 24 h depois de feito '
             f'(x-ratelimit-reset {quando}, daqui a {max(0.0, (reset - agora) / 3600):.1f} h).')
    return restantes, texto


def sondar():
    corpo = f'sonda de cota saibatudo {time.time_ns()}'.encode()
    org = ler_org()
    url = API + (f'?teamId={org}' if org.startswith('team_') else '')
    req = urllib.request.Request(url, data=corpo, method='POST', headers={
        'Authorization': f'Bearer {ler_token()}', 'Content-Type': 'application/octet-stream',
        'x-vercel-digest': hashlib.sha1(corpo).hexdigest(), 'Content-Length': str(len(corpo)),
        'User-Agent': 'saibatudo-vercel-cota/1'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--minimo', type=int, default=0, help='falha (código 1) se restarem menos uploads que isto')
    args = ap.parse_args(argv)
    status, cab = sondar()
    restantes, texto = resumo(cab, time.time())
    print(f'HTTP {status}: {texto}')
    if status == 429 or restantes < args.minimo:
        print(f'NÃO faça deploy agora: precisa de {args.minimo}, restam {restantes}.')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
