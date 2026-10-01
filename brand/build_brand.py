# -*- coding: utf-8 -*-
"""
Gera a identidade visual SaibaTudo (SVG autocontidos: texto convertido em curvas com a fonte livre
Poppins, licença SIL OFL — ver brand/fonts/OFL.txt) e exporta PNGs com Chrome/Edge headless.

    python brand/build_brand.py          # só SVGs
    python brand/build_brand.py --png    # SVGs + PNGs (Play, PWA, Android, favicon, README)

Paleta: azul-marinho #0C2340 · verde #22C55E / #007A3D · dourado #FFB81C · branco.
Símbolo SaibaTudo = lupa (consultar) + marca de verificação (dado oficial verificado).
Ícone Eleições 2026 = urna + cédula com verificação. Nenhum brasão/logotipo oficial é usado.
"""
import argparse
import math
import re
import shutil
import subprocess
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent
SVG = ROOT / "svg"
FONTS = ROOT / "fonts"

NAVY, NAVY2 = "#0C2340", "#143A66"
GREEN, GREEN_D, GOLD, WHITE = "#22C55E", "#007A3D", "#FFB81C", "#FFFFFF"


# ------------------------------------------------------------------ texto -> curvas
def texto_path(texto, fonte, size, x=0.0, y=0.0, tracking=0.0):
    """Retorna (path_d, largura). (x, y) = início da linha de base. tracking em unidades de 1/1000 em."""
    f = TTFont(str(FONTS / fonte))
    gs, cmap, upm = f.getGlyphSet(), f.getBestCmap(), f["head"].unitsPerEm
    hmtx = f["hmtx"]
    s = size / upm
    cursor, partes = 0.0, []
    for ch in texto:
        nome = cmap[ord(ch)]
        pen = SVGPathPen(gs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
        tp = TransformPen(pen, (s, 0, 0, -s, x + cursor, y))
        gs[nome].draw(tp)
        partes.append(pen.getCommands())
        cursor += hmtx[nome][0] * s + tracking * size / 1000.0
    return " ".join(p for p in partes if p), cursor - tracking * size / 1000.0


# ------------------------------------------------------------------ símbolos (canvas 512)
def tile(conteudo, raio=112, fundo=NAVY, faixa=NAVY2, id_clip="c", borda=None):
    contorno = (f'<rect x="6" y="6" width="500" height="500" rx="{max(raio - 6, 0)}" fill="none" stroke="{borda}" '
                f'stroke-width="12"/>') if borda else ""
    return f"""<clipPath id="{id_clip}"><rect width="512" height="512" rx="{raio}"/></clipPath>
<g clip-path="url(#{id_clip})"><rect width="512" height="512" fill="{fundo}"/>
<path d="M0,372 L512,196 L512,512 L0,512 Z" fill="{faixa}"/>{conteudo}</g>{contorno}"""


def glifo_lupa(cor_anel=WHITE, cor_check=GREEN, cor_cabo=GOLD, escala=1.0, cx=256, cy=256):
    # lupa centrada em (cx, cy) com bbox simétrico
    return f"""<g transform="translate({cx} {cy}) scale({escala}) translate(-251 -243)">
<circle cx="229" cy="229" r="116" fill="none" stroke="{cor_anel}" stroke-width="42"/>
<path d="M313,313 L397,397" stroke="{cor_cabo}" stroke-width="48" stroke-linecap="round"/>
<path d="M181,233 L219,271 L281,193" fill="none" stroke="{cor_check}" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/></g>"""


def glifo_urna(escala=1.0, cx=256, cy=256, mono=None):
    # derivado do vetor Android (viewport 108): cédula + verificação + urna
    c = (lambda k: mono or k)
    return f"""<g transform="translate({cx} {cy}) scale({escala * 4.74}) translate(-54 -54)">
<path fill="{c(GOLD)}" d="M41,24h26a3,3 0 0 1 3,3v36h-32v-36a3,3 0 0 1 3,-3z"/>
<path d="M47,42.5l5.2,5.2l9.3,-10.7" fill="none" stroke="{c(NAVY)}" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/>
<path fill="{c(WHITE)}" d="M29,59a3,3 0 0 1 3,-3h44a3,3 0 0 1 3,3v22a4,4 0 0 1 -4,4h-42a4,4 0 0 1 -4,-4z"/>
<path fill="{c(NAVY)}" d="M37,58h34v3h-34z"/>
<path fill="{c(GREEN)}" d="M29,70h50v5h-50z"/></g>"""


def svg(w, h, corpo, titulo, desc=""):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" '
            f'aria-labelledby="t d"><title id="t">{titulo}</title><desc id="d">{desc}</desc>{corpo}</svg>\n')


def escrever(nome, conteudo):
    SVG.mkdir(parents=True, exist_ok=True)
    (SVG / nome).write_text(conteudo, encoding="utf-8")
    print("  ", nome)


# ------------------------------------------------------------------ gera SVGs
def gerar_svgs():
    print("== SVGs ==")
    # Ícones quadrados
    escrever("saibatudo-symbol.svg", svg(512, 512, tile(glifo_lupa(), id_clip="a"), "SaibaTudo",
                                         "Símbolo SaibaTudo: lupa com marca de verificação"))
    escrever("saibatudo-symbol-transparent.svg", svg(512, 512, glifo_lupa(cor_anel=NAVY, cor_check=GREEN_D, cor_cabo=GOLD),
                                                     "SaibaTudo", "Símbolo SaibaTudo sem fundo (para fundos claros)"))
    escrever("saibatudo-symbol-mono.svg", svg(512, 512, glifo_lupa("#000", "#000", "#000"), "SaibaTudo (monocromático)"))
    escrever("eleicoes2026-icon.svg", svg(512, 512, tile(glifo_urna(escala=1.18), id_clip="b"), "SaibaTudo Eleições 2026",
                                          "Ícone do app: urna com cédula e marca de verificação"))
    # Variantes full-bleed (sem cantos arredondados): Google Play, PWA maskable e apple-touch-icon aplicam a própria máscara
    escrever("saibatudo-symbol-square.svg", svg(512, 512, tile(glifo_lupa(), raio=0, id_clip="a2"), "SaibaTudo"))
    escrever("eleicoes2026-icon-square.svg", svg(512, 512, tile(glifo_urna(escala=1.18), raio=0, id_clip="b2"),
                                                 "SaibaTudo Eleições 2026"))

    # Wordmark (curvas): "Saiba" + "Tudo"
    TAM = 120
    d_saiba, w_saiba = texto_path("Saiba", "Poppins-Bold.ttf", TAM, 0, 0, tracking=-10)
    d_tudo, w_tudo = texto_path("Tudo", "Poppins-Bold.ttf", TAM, w_saiba - 6, 0, tracking=-10)
    largura = w_saiba + w_tudo - 6

    def lockup_horizontal(nome, cor_saiba, cor_tudo, cor_sub, fundo=None, produto=None, titulo="SaibaTudo"):
        icone = 168
        pad = 24
        esc = icone / 512
        texto_x = pad + icone + 36
        base = pad + icone / 2 + 36  # linha de base do wordmark
        w = int(texto_x + largura + pad)
        h = icone + 2 * pad
        simbolo_tile = tile(glifo_urna(1.18) if produto else glifo_lupa(), id_clip="k", borda="#3B6EA8" if fundo else None)
        corpo = ""
        if fundo:
            corpo += f'<rect width="{w}" height="{h}" fill="{fundo}"/>'
        corpo += f'<g transform="translate({pad} {pad}) scale({esc})">{simbolo_tile}</g>'
        corpo += f'<g transform="translate({texto_x} {base})"><path d="{d_saiba}" fill="{cor_saiba}"/><path d="{d_tudo}" fill="{cor_tudo}"/></g>'
        sub = produto or "Informação cívica verificada"
        d_sub, w_sub = texto_path(sub.upper(), "Poppins-SemiBold.ttf", 30, 0, 0, tracking=140)
        corpo += f'<g transform="translate({texto_x + 4} {base + 48})"><path d="{d_sub}" fill="{cor_sub}"/></g>'
        corpo += f'<rect x="{texto_x + 4}" y="{base + 62}" width="64" height="6" rx="3" fill="{GOLD}"/>'
        escrever(nome, svg(w, h, corpo, titulo, f"Logotipo {titulo}"))

    lockup_horizontal("saibatudo-logo-horizontal.svg", NAVY, GREEN_D, "#475569")
    lockup_horizontal("saibatudo-logo-horizontal-dark.svg", WHITE, GREEN, "#CBD5E1", fundo=NAVY)
    lockup_horizontal("eleicoes2026-logo-horizontal.svg", NAVY, GREEN_D, "#475569", produto="Eleições 2026",
                      titulo="SaibaTudo Eleições 2026")
    lockup_horizontal("eleicoes2026-logo-horizontal-dark.svg", WHITE, GREEN, "#CBD5E1", fundo=NAVY,
                      produto="Eleições 2026", titulo="SaibaTudo Eleições 2026")

    # Vertical (símbolo acima do wordmark)
    def lockup_vertical(nome, cor_saiba, cor_tudo, fundo=None):
        W, H = 720, 520
        esc = 280 / 512
        corpo = f'<rect width="{W}" height="{H}" fill="{fundo}"/>' if fundo else ""
        corpo += f'<g transform="translate({(W - 280) / 2} 30) scale({esc})">{tile(glifo_lupa(), id_clip="v")}</g>'
        s = 112 / 120
        total = largura * s
        corpo += (f'<g transform="translate({(W - total) / 2} 440) scale({s})"><path d="{d_saiba}" fill="{cor_saiba}"/>'
                  f'<path d="{d_tudo}" fill="{cor_tudo}"/></g>')
        corpo += f'<rect x="{W / 2 - 40}" y="470" width="80" height="7" rx="3.5" fill="{GOLD}"/>'
        escrever(nome, svg(W, H, corpo, "SaibaTudo", "Logotipo vertical SaibaTudo"))

    lockup_vertical("saibatudo-logo-vertical.svg", NAVY, GREEN_D)
    lockup_vertical("saibatudo-logo-vertical-dark.svg", WHITE, GREEN, fundo=NAVY)

    # Gráfico de recursos da Play (1024x500)
    W, H = 1024, 500
    d_s, w_s = texto_path("Saiba", "Poppins-Bold.ttf", 96, 0, 0, tracking=-10)
    d_t, w_t = texto_path("Tudo", "Poppins-Bold.ttf", 96, w_s - 4, 0, tracking=-10)
    d_e, _ = texto_path("ELEIÇÕES 2026", "Poppins-SemiBold.ttf", 34, 0, 0, tracking=170)
    linhas = ["Consulte candidaturas, pesquisas e regras", "com dados abertos do Tribunal Superior Eleitoral"]
    desc = "".join(
        f'<g transform="translate(80 {330 + i * 42})"><path d="{texto_path(l, "Poppins-Medium.ttf", 29)[0]}" fill="#E2E8F0"/></g>'
        for i, l in enumerate(linhas))
    aviso, _ = texto_path("App independente · sem vínculo com o TSE, governo ou partidos", "Poppins-Medium.ttf", 19)
    corpo = (f'<rect width="{W}" height="{H}" fill="{NAVY}"/><path d="M0,430 L1024,250 L1024,500 L0,500Z" fill="{NAVY2}"/>'
             f'<g transform="translate(700 -10) scale(0.95)" opacity="0.14">{glifo_lupa(WHITE, WHITE, WHITE)}</g>'
             f'<g transform="translate(80 70) scale({168 / 512})">{tile(glifo_urna(1.18), id_clip="f", borda="#3B6EA8")}</g>'
             f'<g transform="translate(278 160)"><path d="{d_s}" fill="{WHITE}"/><path d="{d_t}" fill="{GREEN}"/></g>'
             f'<g transform="translate(282 218)"><path d="{d_e}" fill="{GOLD}"/></g>'
             f'{desc}'
             f'<g transform="translate(80 466)"><path d="{aviso}" fill="#94A3B8"/></g>')
    escrever("eleicoes2026-feature-graphic.svg", svg(W, H, corpo, "SaibaTudo Eleições 2026", "Gráfico de recursos da Google Play"))


# ------------------------------------------------------------------ PNG via Chrome/Edge headless
def navegador():
    for p in (r"C:\Program Files\Google\Chrome\Application\chrome.exe",
              r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
              shutil.which("chrome") or "", shutil.which("google-chrome") or "", shutil.which("chromium") or ""):
        if p and Path(p).exists():
            return p
    return None


def png(svg_nome, saida: Path, w, h=None, fundo="transparent", arredondar=0):
    if h is None:  # preserva a proporção do SVG
        m = re.search(r'width="(\d+)" height="(\d+)"', (SVG / svg_nome).read_text(encoding="utf-8")[:300])
        h = round(w * int(m.group(2)) / int(m.group(1)))
    nav = navegador()
    if not nav:
        print("  ! navegador headless não encontrado; PNG ignorado:", saida.name)
        return
    saida.parent.mkdir(parents=True, exist_ok=True)
    src = (SVG / svg_nome).as_uri()
    html = ROOT / ".render.html"
    estilo = f"border-radius:{arredondar}%;" if arredondar else ""
    html.write_text(f'<!doctype html><meta charset="utf-8"><style>html,body{{margin:0;padding:0;background:{fundo};'
                    f'overflow:hidden}}img{{display:block;width:{w}px;height:{h}px;{estilo}}}</style><img src="{src}">',
                    encoding="utf-8")
    cmd = [nav, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
           "--default-background-color=00000000", f"--window-size={w},{h + 200}",
           f"--screenshot={saida}", html.as_uri()]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
    recortar(saida, w, h)


def recortar(arq: Path, w, h):
    """Recorta o PNG para w×h (a janela headless é mais alta que o necessário). PNG puro-Python."""
    import struct
    import zlib
    dados = arq.read_bytes()
    pos, idat, ihdr = 8, b"", None
    while pos < len(dados):
        n = struct.unpack(">I", dados[pos:pos + 4])[0]
        tipo = dados[pos + 4:pos + 8]
        corpo = dados[pos + 8:pos + 8 + n]
        if tipo == b"IHDR":
            ihdr = struct.unpack(">IIBBBBB", corpo)
        elif tipo == b"IDAT":
            idat += corpo
        pos += 12 + n
    W, H, prof, ctipo = ihdr[0], ihdr[1], ihdr[2], ihdr[3]
    if W == w and H == h:
        return
    bpp = {6: 4, 2: 3, 0: 1, 4: 2}[ctipo] * (prof // 8)
    raw = zlib.decompress(idat)
    stride = W * bpp
    linhas, prev = [], bytearray(stride)
    i = 0
    for _ in range(H):
        f = raw[i]
        linha = bytearray(raw[i + 1:i + 1 + stride])
        i += 1 + stride
        for x in range(stride):
            a = linha[x - bpp] if x >= bpp else 0
            b = prev[x]
            c = prev[x - bpp] if x >= bpp else 0
            if f == 1:
                linha[x] = (linha[x] + a) & 255
            elif f == 2:
                linha[x] = (linha[x] + b) & 255
            elif f == 3:
                linha[x] = (linha[x] + ((a + b) >> 1)) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                linha[x] = (linha[x] + pr) & 255
        linhas.append(linha)
        prev = linha
    novo = b"".join(b"\x00" + bytes(l[:w * bpp]) for l in linhas[:h])

    def chunk(t, c):
        return struct.pack(">I", len(c)) + t + c + struct.pack(">I", zlib.crc32(t + c) & 0xFFFFFFFF)

    out = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, prof, ctipo, 0, 0, 0))
    out += chunk(b"IDAT", zlib.compress(novo, 9)) + chunk(b"IEND", b"")
    arq.write_bytes(out)


def gerar_pngs():
    print("== PNGs ==")
    out = ROOT / "png"
    # Play Store
    png("eleicoes2026-icon-square.svg", out / "play-icon-512.png", 512)
    png("eleicoes2026-feature-graphic.svg", out / "play-feature-graphic-1024x500.png", 1024, 500)
    # Logotipos para README/site
    png("saibatudo-logo-horizontal.svg", out / "saibatudo-logo-horizontal.png", 1100)
    png("saibatudo-symbol.svg", out / "saibatudo-symbol-512.png", 512)
    # PWA / site
    for tam in (192, 512):
        png("eleicoes2026-icon.svg", out / f"pwa-eleicoes2026-{tam}.png", tam)
        png("eleicoes2026-icon-square.svg", out / f"pwa-eleicoes2026-maskable-{tam}.png", tam)
        png("saibatudo-symbol.svg", out / f"pwa-saibatudo-{tam}.png", tam)
        png("saibatudo-symbol-square.svg", out / f"pwa-saibatudo-maskable-{tam}.png", tam)
    png("eleicoes2026-icon-square.svg", out / "apple-touch-icon-180.png", 180)
    png("saibatudo-symbol-square.svg", out / "apple-touch-icon-saibatudo-180.png", 180)
    png("saibatudo-logo-horizontal.svg", out / "saibatudo-logo-horizontal.png", 1100)
    png("saibatudo-logo-horizontal-dark.svg", out / "saibatudo-logo-horizontal-dark.png", 1100)
    png("eleicoes2026-logo-horizontal.svg", out / "eleicoes2026-logo-horizontal.png", 1100)
    png("saibatudo-logo-vertical.svg", out / "saibatudo-logo-vertical.png", 720)
    png("saibatudo-symbol.svg", out / "favicon-32.png", 32)
    png("saibatudo-symbol.svg", out / "favicon-48.png", 48)
    png("saibatudo-symbol.svg", out / "og-symbol-1200.png", 1200)
    # Android (ícones legados, API < 26): quadrado e redondo
    for dens, px in (("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)):
        png("eleicoes2026-icon.svg", out / "android" / f"mipmap-{dens}" / "ic_launcher.png", px)
        png("eleicoes2026-icon.svg", out / "android" / f"mipmap-{dens}" / "ic_launcher_round.png", px, arredondar=50)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--png", action="store_true")
    a = ap.parse_args()
    gerar_svgs()
    if a.png:
        gerar_pngs()
    (ROOT / ".render.html").unlink(missing_ok=True)
