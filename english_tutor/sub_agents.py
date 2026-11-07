"""Agentes especialistas em cada habilidade do inglês."""

from __future__ import annotations

from google.adk.agents import LlmAgent
from google.genai import types

from . import prompts
from .config import build_model
from .tools import (
    check_answer,
    create_fill_in_the_blank,
    create_flashcards,
    create_listening_exercise,
    create_multiple_choice,
    create_reading_exercise,
    create_speaking_exercise,
    create_writing_task,
    evaluate_pronunciation,
    get_student_progress,
    record_writing_score,
)

GENERATION_CONFIG = types.GenerateContentConfig(temperature=0.7)


def _coach(name: str, description: str, instruction: str, tools: list) -> LlmAgent:
    return LlmAgent(
        name=name,
        model=build_model(),
        description=description,
        instruction=instruction,
        tools=[*tools, get_student_progress],
        generate_content_config=GENERATION_CONFIG,
    )


listening_coach = _coach(
    "listening_coach",
    "Treina compreensão auditiva com áudios em inglês e perguntas.",
    prompts.LISTENING_INSTRUCTION,
    [create_listening_exercise, check_answer],
)

speaking_coach = _coach(
    "speaking_coach",
    "Treina pronúncia e fala usando o microfone do aluno.",
    prompts.SPEAKING_INSTRUCTION,
    [create_speaking_exercise, evaluate_pronunciation],
)

reading_coach = _coach(
    "reading_coach",
    "Treina leitura e interpretação de textos curtos em inglês.",
    prompts.READING_INSTRUCTION,
    [create_reading_exercise, create_multiple_choice, check_answer],
)

writing_coach = _coach(
    "writing_coach",
    "Treina escrita em inglês e corrige os textos do aluno.",
    prompts.WRITING_INSTRUCTION,
    [create_writing_task, record_writing_score, create_fill_in_the_blank, check_answer],
)

vocabulary_grammar_coach = _coach(
    "vocabulary_grammar_coach",
    "Ensina vocabulário com flashcards e gramática básica com exercícios.",
    prompts.VOCAB_GRAMMAR_INSTRUCTION,
    [create_flashcards, create_multiple_choice, create_fill_in_the_blank, check_answer],
)

ALL_COACHES = [
    listening_coach,
    speaking_coach,
    reading_coach,
    writing_coach,
    vocabulary_grammar_coach,
]
