"""Servidor web: API oficial do ADK + interface do aluno.

Execute com:  python server.py   e abra http://localhost:8000
"""

from __future__ import annotations

import os
from pathlib import Path

import uvicorn
from fastapi import Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from google.adk.cli.fast_api import get_fast_api_app

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR / "frontend"
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8000"))

# Sessões em SQLite: o progresso do aluno (estado "user:")
# sobrevive a reinícios do servidor.
SESSION_DB = f"sqlite:///{(DATA_DIR / 'sessions.db').as_posix()}"

app = get_fast_api_app(
    agents_dir=str(BASE_DIR),
    session_service_uri=SESSION_DB,
    allow_origins=[f"http://localhost:{PORT}", f"http://127.0.0.1:{PORT}"],
    web=False,  # usamos nossa própria interface
)

app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.middleware("http")
async def revalidate_frontend(request: Request, call_next):
    """Faz o navegador revalidar a interface a cada carga.

    Evita que JS/CSS antigos continuem em cache após uma atualização.
    """
    response = await call_next(request)
    if request.url.path == "/" or request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-cache"
    return response


@app.get("/", include_in_schema=False)
async def index() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT)
