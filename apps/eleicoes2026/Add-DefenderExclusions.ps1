# ============================================================================
#  Add-DefenderExclusions.ps1  -  SaibaTudo-Eleicao2026
# ----------------------------------------------------------------------------
#  Adiciona exclusoes do Windows Defender ANTIVIRUS (scan em tempo real) para
#  o projeto, o Python (uv) e o cache do Hugging Face. Isso reduz overhead de
#  varredura durante o treino e evita interferencia do AV.
#
#  IMPORTANTE: o bloqueio do `_lzma.pyd` vem do WDAC (Windows Defender
#  Application Control / Integridade de Codigo), NAO do antivirus. Exclusoes
#  de AV nao removem bloqueio WDAC - para isso seria necessario alterar a
#  politica de integridade de codigo (administrador de TI). O stub
#  `sitecustomize.py` do venv ja contorna o lzma de forma definitiva.
#
#  EXECUTAR COMO ADMINISTRADOR:
#    1) Clique com o botao direito no PowerShell -> "Executar como administrador"
#    2) & "C:\Users\franc\AndroidStudioProjects\SaibaTudoEleicao2026\Add-DefenderExclusions.ps1"
# ============================================================================

$ErrorActionPreference = 'Stop'

# Verifica elevacao
$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "ERRO: execute este script como Administrador." -ForegroundColor Red
    exit 1
}

$paths = @(
    'C:\Users\franc\AndroidStudioProjects\SaibaTudoEleicao2026',
    'C:\Users\franc\AppData\Roaming\uv',
    'C:\Users\franc\.cache\huggingface',
    'C:\Users\franc\AppData\Local\Temp\kilo'
)

foreach ($p in $paths) {
    if (Test-Path -LiteralPath $p) {
        try {
            Add-MpPreference -ExclusionPath $p
            Write-Host "OK  exclusao adicionada: $p" -ForegroundColor Green
        } catch {
            Write-Host "FALHA ao adicionar $p : $($_.Exception.Message)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "SKIP (nao existe): $p" -ForegroundColor DarkGray
    }
}

# Exclusoes de processo (python do venv e toolchain de treino)
$procs = @('python.exe', 'pythonw.exe')
foreach ($pr in $procs) {
    try {
        Add-MpPreference -ExclusionProcess $pr
        Write-Host "OK  exclusao de processo: $pr" -ForegroundColor Green
    } catch {
        Write-Host "FALHA processo $pr : $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Exclusoes atuais (ExclusionPath):" -ForegroundColor Cyan
(Get-MpPreference).ExclusionPath | ForEach-Object { Write-Host "  $_" }
Write-Host ""
Write-Host "NOTA: se o WDAC continuar bloqueando DLLs especificas, o stub sitecustomize.py" -ForegroundColor Cyan
Write-Host "do venv ja contorna o lzma. Para WDAC geral, contate o administrador de TI." -ForegroundColor Cyan
