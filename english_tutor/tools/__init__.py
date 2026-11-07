"""Ferramentas (function tools) usadas pelos agentes do tutor."""

from .exercises import (
    check_answer,
    create_fill_in_the_blank,
    create_flashcards,
    create_listening_exercise,
    create_multiple_choice,
    create_reading_exercise,
    create_speaking_exercise,
    create_writing_task,
    evaluate_pronunciation,
    record_writing_score,
)
from .progress import get_student_progress, update_student_profile

__all__ = [
    "check_answer",
    "create_fill_in_the_blank",
    "create_flashcards",
    "create_listening_exercise",
    "create_multiple_choice",
    "create_reading_exercise",
    "create_speaking_exercise",
    "create_writing_task",
    "evaluate_pronunciation",
    "get_student_progress",
    "record_writing_score",
    "update_student_profile",
]
