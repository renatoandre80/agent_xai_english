"""Perfil e progresso do aluno, persistidos no estado da sessão ADK.

Chaves com prefixo ``user:`` são compartilhadas entre todas as sessões do
mesmo usuário, então o progresso sobrevive a novas conversas.

Observação: o ADK só registra alterações de estado quando a chave é
reatribuída; por isso sempre copiamos o dicionário, alteramos e gravamos.
"""

from __future__ import annotations

import copy
from datetime import date
from typing import Any, MutableMapping

from google.adk.tools import ToolContext

PROFILE_KEY = "user:profile"
PROGRESS_KEY = "user:progress"

SKILLS = ("listening", "speaking", "reading", "writing", "vocabulary", "grammar")

LEVELS = (
    (0, "A1 - Iniciante"),
    (150, "A1+ - Iniciante avançado"),
    (400, "A2 - Básico"),
    (800, "A2+ - Básico avançado"),
    (1400, "B1 - Intermediário"),
)


def _empty_progress() -> dict[str, Any]:
    return {
        "xp": 0,
        "streak_days": 0,
        "last_study_date": None,
        "skills": {skill: {"correct": 0, "total": 0} for skill in SKILLS},
    }


def level_for_xp(xp: int) -> str:
    """Retorna o nível CEFR aproximado para a quantidade de XP."""
    current = LEVELS[0][1]
    for threshold, name in LEVELS:
        if xp >= threshold:
            current = name
    return current


def read_progress(state: MutableMapping[str, Any]) -> dict[str, Any]:
    """Lê (uma cópia de) o progresso, preenchendo campos ausentes."""
    progress = copy.deepcopy(state.get(PROGRESS_KEY) or _empty_progress())
    for skill in SKILLS:
        progress["skills"].setdefault(skill, {"correct": 0, "total": 0})
    return progress


def record_result(
    state: MutableMapping[str, Any], skill: str, correct: bool, xp: int
) -> dict[str, Any]:
    """Registra o resultado de um exercício e atualiza XP e sequência de dias."""
    progress = read_progress(state)
    stats = progress["skills"].setdefault(skill, {"correct": 0, "total": 0})
    stats["total"] += 1
    if correct:
        stats["correct"] += 1
    progress["xp"] += max(0, xp)

    today = date.today()
    last = progress.get("last_study_date")
    if last != today.isoformat():
        yesterday = date.fromordinal(today.toordinal() - 1).isoformat()
        progress["streak_days"] = progress["streak_days"] + 1 if last == yesterday else 1
        progress["last_study_date"] = today.isoformat()

    state[PROGRESS_KEY] = progress
    return progress


def summarize_progress(progress: dict[str, Any]) -> dict[str, Any]:
    """Gera um resumo amigável (com percentuais) do progresso."""
    skills = {}
    for skill, stats in progress["skills"].items():
        total = stats["total"]
        skills[skill] = {
            **stats,
            "accuracy_percent": round(100 * stats["correct"] / total) if total else None,
        }
    practiced = {k: v for k, v in skills.items() if v["total"]}
    weakest = min(practiced, key=lambda k: practiced[k]["accuracy_percent"]) if practiced else None
    return {
        "xp": progress["xp"],
        "level": level_for_xp(progress["xp"]),
        "streak_days": progress["streak_days"],
        "skills": skills,
        "weakest_skill": weakest,
        "never_practiced": [k for k, v in skills.items() if not v["total"]],
    }


def get_student_progress(tool_context: ToolContext) -> dict[str, Any]:
    """Consulta o perfil e o progresso atual do aluno.

    Use no início da conversa para personalizar a aula e sempre que o aluno
    perguntar sobre seu desempenho, nível ou pontos.

    Returns:
        Perfil do aluno, XP, nível, sequência de dias e acerto por habilidade.
    """
    state = tool_context.state
    return {
        "status": "success",
        "profile": state.get(PROFILE_KEY) or {},
        "progress": summarize_progress(read_progress(state)),
    }


def update_student_profile(
    name: str, learning_goal: str, interests: str, tool_context: ToolContext
) -> dict[str, Any]:
    """Salva o perfil do aluno para personalizar as aulas.

    Args:
        name: Primeiro nome do aluno.
        learning_goal: Objetivo com o inglês (ex.: viagem, trabalho, provas).
        interests: Assuntos de interesse para criar exemplos (ex.: futebol, games).

    Returns:
        O perfil salvo.
    """
    profile = {
        "name": name.strip(),
        "learning_goal": learning_goal.strip(),
        "interests": interests.strip(),
    }
    tool_context.state[PROFILE_KEY] = profile
    return {"status": "success", "profile": profile}
