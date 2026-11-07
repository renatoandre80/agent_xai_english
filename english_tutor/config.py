"""Configuração central do tutor (lida de variáveis de ambiente)."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from google.adk.models.google_llm import Gemini
from google.genai import types

_PACKAGE_DIR = Path(__file__).resolve().parent
load_dotenv(_PACKAGE_DIR / ".env")
load_dotenv(_PACKAGE_DIR.parent / ".env")

MODEL_NAME: str = os.getenv("TUTOR_MODEL", "gemini-3.5-flash")

# O plano gratuito da Gemini API tem limite baixo de requisições por minuto;
# repetimos automaticamente (com espera exponencial) em caso de 429/5xx.
RETRY_OPTIONS = types.HttpRetryOptions(
    attempts=int(os.getenv("TUTOR_RETRY_ATTEMPTS", "4")),
    initial_delay=3.0,
    max_delay=40.0,
    exp_base=2.0,
    http_status_codes=[429, 500, 502, 503, 504],
)


def build_model() -> Gemini:
    """Modelo Gemini compartilhado por todos os agentes, com retry configurado."""
    return Gemini(model=MODEL_NAME, retry_options=RETRY_OPTIONS)

# Pontuação de gamificação
XP_CORRECT_ANSWER = 10
XP_WRONG_ANSWER = 2
XP_SPEAKING_MAX = 15
XP_WRITING_MAX = 20

# Similaridade mínima (0-1) para considerar uma fala "aprovada"
SPEAKING_PASS_THRESHOLD = 0.8
