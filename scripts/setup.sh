#!/usr/bin/env bash
# Cria/atualiza o ambiente virtual e instala as dependências (Git Bash, Linux ou macOS).
# Funciona com caminhos que têm espaços ou acentos (ex.: "Área de Trabalho").
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="$ROOT/.venv"

if [ ! -d "$VENV" ]; then
  echo "Criando ambiente virtual em $VENV"
  python -m venv "$VENV"
fi

if [ -x "$VENV/Scripts/python.exe" ]; then
  PY="$VENV/Scripts/python.exe"   # Windows
else
  PY="$VENV/bin/python"           # Linux/macOS
fi

"$PY" -m pip install --upgrade pip
"$PY" -m pip install -r "$ROOT/requirements.txt"

[ -f "$ROOT/.env" ] || { cp "$ROOT/.env.example" "$ROOT/.env"; echo "Criei .env - coloque sua GOOGLE_API_KEY nele."; }

echo
echo "Pronto! Para iniciar:  \"$PY\" \"$ROOT/server.py\""
