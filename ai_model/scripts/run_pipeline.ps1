# Pipeline Completo de Treinamento e Publicação - SaibaTudo-Eleicao2026
$ErrorActionPreference = "Stop"

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   PIPELINE IA SAIBA TUDO ELEICAO 2026 (TREINO LOCAL + HF HUB)   " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

$VENV_PYTHON = "$PSScriptRoot\..\.venv\Scripts\python.exe"

if (-not (Test-Path $VENV_PYTHON)) {
    Write-Host "Criando ambiente virtual uv..." -ForegroundColor Yellow
    uv venv --python 3.12 "$PSScriptRoot\..\.venv"
}

# 1. Instalar dependências adicionais
Write-Host "[1/4] Verificando dependencias Hugging Face..." -ForegroundColor Green
uv pip install --python $VENV_PYTHON transformers peft trl accelerate bitsandbytes datasets sentencepiece protobuf

# 2. Gerar Dataset Enriquecido com TSE
Write-Host "[2/4] Gerando dataset eleitoral com regras oficiais do TSE..." -ForegroundColor Green
& $VENV_PYTHON "$PSScriptRoot\dataset_generator.py"

# 3. Executar Treinamento Local na GPU de 8GB
Write-Host "[3/4] Iniciando Treinamento QLoRA 4-bit na NVIDIA RTX 5060 (8GB VRAM)..." -ForegroundColor Green
& $VENV_PYTHON "$PSScriptRoot\train_local_8gb.py" --epochs 3 --batch_size 1 --grad_accum 8

# 4. Publicar no Hugging Face se HF_TOKEN estiver configurado
if ($env:HF_TOKEN) {
    Write-Host "[4/4] Publicando modelo no Hugging Face Hub (franciscoaleixoIOT/SaibaTudo-Eleicao2026)..." -ForegroundColor Green
    & $VENV_PYTHON "$PSScriptRoot\push_to_hub.py" --repo_id "franciscoaleixoIOT/SaibaTudo-Eleicao2026"
} else {
    Write-Host "[4/4] HF_TOKEN nao configurado no ambiente. O modelo esta salvo localmente em ai_model/output/." -ForegroundColor Yellow
    Write-Host "Para publicar no Hugging Face Hub, execute:" -ForegroundColor Yellow
    Write-Host '$env:HF_TOKEN = "seu_token"' -ForegroundColor Yellow
    Write-Host '& $VENV_PYTHON "$PSScriptRoot\push_to_hub.py" --repo_id "franciscoaleixoIOT/SaibaTudo-Eleicao2026"' -ForegroundColor Yellow
}

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "            PIPELINE CONCLUIDO COM SUCESSO!                      " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
