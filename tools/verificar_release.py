# -*- coding: utf-8 -*-
"""
Verificação ESTÁTICA do APK de release (R8): as classes que são instanciadas por reflexão precisam estar DEFINIDAS no dex.

Por que existe: o primeiro release assinado crashou ao abrir porque o R8 removeu WorkDatabase_Impl (Room/WorkManager criam essas classes por
nome); os testes unitários e o build de debug não pegaram, e só um teste em aparelho achou (docs/PROJECT_MEMORY.md). Esta checagem roda no CI depois de
`assembleRelease` e custa segundos, sem emulador: lê o DEX direto (sem dependência do Android SDK) e confere que cada classe da lista abaixo existe.
É complementar, não substitui rodar o release num aparelho antes de publicar (docs/PLAY_STORE.md).

Uso:  python tools/verificar_release.py app/build/outputs/apk/release/app-release.apk
Código de saída: 0 = ok; 1 = classe obrigatória ausente ou APK fora do esperado; 2 = erro de uso.
"""
import struct
import sys
import zipfile
from pathlib import Path

# Classes que DEVEM existir no release. Formato de descritor DEX: "Lpacote/Classe;".
OBRIGATORIAS = [
    # criadas por reflexão pelo Room (o WorkManager guarda a fila de atualização de dados nele): foi o crash do 1º release
    # (os *Dao_Impl são instanciados direto por WorkDatabase_Impl: o R8 pode renomeá-los sem prejuízo, então não entram na lista)
    "Landroidx/work/impl/WorkDatabase_Impl;",
    # componentes e classes que o sistema ou o WorkManager instanciam pelo nome
    "Lnet/saibatudo/eleicoes2026/ui/MainActivity;",
    "Lnet/saibatudo/eleicoes2026/SaibaTudoApp;",
    "Lnet/saibatudo/eleicoes2026/data/bundle/DataUpdateWorker;",
    # modelos lidos por reflexão (Gson): precisam manter nome e campos
    "Lnet/saibatudo/eleicoes2026/data/bundle/BundleManifest;",
]
TAMANHO_MIN = 3 * 1024 * 1024
TAMANHO_MAX = 25 * 1024 * 1024


def _uleb128(b: bytes, i: int):
    r = s = 0
    while True:
        x = b[i]
        i += 1
        r |= (x & 0x7F) << s
        if not x & 0x80:
            return r, i
        s += 7


def classes_definidas(dex: bytes) -> set:
    """Descritores das classes DEFINIDAS (class_defs) num arquivo DEX. Leitor mínimo do formato (header, string_ids, type_ids, class_defs)."""
    if dex[:4] != b"dex\n":
        raise ValueError("não é um arquivo DEX")
    str_n, str_off, tipo_n, tipo_off = struct.unpack_from("<IIII", dex, 0x38)
    cls_n, cls_off = struct.unpack_from("<II", dex, 0x60)
    strings = []
    for k in range(str_n):
        (off,) = struct.unpack_from("<I", dex, str_off + 4 * k)
        _, i = _uleb128(dex, off)
        fim = dex.index(b"\x00", i)
        strings.append(dex[i:fim].decode("utf-8", "replace"))
    tipos = [strings[struct.unpack_from("<I", dex, tipo_off + 4 * k)[0]] for k in range(tipo_n)]
    return {tipos[struct.unpack_from("<I", dex, cls_off + 32 * k)[0]] for k in range(cls_n)}


def classes_do_apk(apk: Path) -> set:
    out = set()
    with zipfile.ZipFile(apk) as z:
        dexes = [n for n in z.namelist() if n.startswith("classes") and n.endswith(".dex")]
        if not dexes:
            raise ValueError("APK sem classes*.dex")
        for n in dexes:
            out |= classes_definidas(z.read(n))
    return out


def verificar(apk: Path, obrigatorias=OBRIGATORIAS):
    """Devolve (ok, problemas)."""
    problemas = []
    tam = apk.stat().st_size
    if not TAMANHO_MIN <= tam <= TAMANHO_MAX:
        problemas.append(f"tamanho do APK fora do esperado: {tam / 1e6:.1f} MB (esperado {TAMANHO_MIN / 1e6:.0f} a {TAMANHO_MAX / 1e6:.0f} MB)")
    definidas = classes_do_apk(apk)
    for c in obrigatorias:
        if c not in definidas:
            problemas.append(f"classe obrigatória AUSENTE no release (R8 removeu ou renomeou?): {c}")
    return (not problemas), problemas


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) != 1 or not Path(argv[0]).is_file():
        print("uso: python tools/verificar_release.py <app-release.apk>", file=sys.stderr)
        return 2
    ok, problemas = verificar(Path(argv[0]))
    for p in problemas:
        print("PROBLEMA:", p)
    if ok:
        print(f"OK: {len(OBRIGATORIAS)} classes obrigatórias presentes no release")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
