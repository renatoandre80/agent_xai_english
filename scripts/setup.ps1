# Cria/atualiza o ambiente virtual e instala as dependências (PowerShell no Windows).
# Funciona com caminhos que têm espaços ou acentos (ex.: "Área de Trabalho").
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Venv = Join-Path $Root ".venv"
$Py = Join-Path $Venv "Scripts\python.exe"

if (-not (Test-Path $Venv)) {
    Write-Host "Criando ambiente virtual em $Venv"
    python -m venv "$Venv"
}

& "$Py" -m pip install --upgrade pip
& "$Py" -m pip install -r (Join-Path $Root "requirements.txt")

$EnvFile = Join-Path $Root ".env"
if (-not (Test-Path $EnvFile)) {
    Copy-Item (Join-Path $Root ".env.example") $EnvFile
    Write-Host "Criei .env - coloque sua GOOGLE_API_KEY nele."
}

Write-Host ""
Write-Host "Pronto! Para iniciar:  & `"$Py`" `"$(Join-Path $Root 'server.py')`""
