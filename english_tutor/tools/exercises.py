"""Ferramentas que criam e corrigem exercícios interativos.

Cada ferramenta ``create_*`` devolve um payload com a chave ``widget``, que o
front-end usa para renderizar um cartão interativo (múltipla escolha, player
de áudio, microfone, etc.). O gabarito fica guardado no estado da sessão e
nunca é enviado ao navegador; a correção acontece em ``check_answer``,
``evaluate_pronunciation`` e ``record_writing_score``.
"""

from __future__ import annotations

import difflib
import re
import unicodedata
import uuid
from typing import Any

from google.adk.tools import ToolContext

from ..config import (
    SPEAKING_PASS_THRESHOLD,
    XP_CORRECT_ANSWER,
    XP_SPEAKING_MAX,
    XP_WRITING_MAX,
    XP_WRONG_ANSWER,
)
from .progress import SKILLS, read_progress, record_result, summarize_progress

EXERCISES_KEY = "exercises"
MIN_OPTIONS, MAX_OPTIONS = 2, 5


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _error(message: str) -> dict[str, Any]:
    return {"status": "error", "message": message}


def _normalize(text: str) -> str:
    """Minúsculas, sem acentos, sem pontuação e com espaços simples."""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = text.lower().replace("’", "'")
    text = re.sub(r"[^a-z0-9' ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _save_exercise(tool_context: ToolContext, data: dict[str, Any]) -> str:
    exercise_id = f"ex_{uuid.uuid4().hex[:8]}"
    exercises = dict(tool_context.state.get(EXERCISES_KEY) or {})
    exercises[exercise_id] = {**data, "answered": False}
    tool_context.state[EXERCISES_KEY] = exercises
    return exercise_id


def _load_exercise(tool_context: ToolContext, exercise_id: str) -> dict[str, Any] | None:
    return (tool_context.state.get(EXERCISES_KEY) or {}).get(exercise_id)


def _mark_answered(tool_context: ToolContext, exercise_id: str) -> None:
    exercises = dict(tool_context.state.get(EXERCISES_KEY) or {})
    exercises[exercise_id] = {**exercises[exercise_id], "answered": True}
    tool_context.state[EXERCISES_KEY] = exercises


def _validate_options(options: list[str], correct_option: int) -> str | None:
    if not MIN_OPTIONS <= len(options) <= MAX_OPTIONS:
        return f"Forneça entre {MIN_OPTIONS} e {MAX_OPTIONS} opções."
    if not 0 <= correct_option < len(options):
        return "correct_option deve ser o índice (começando em 0) de uma das opções."
    return None


def _choice_exercise(
    tool_context: ToolContext,
    widget: str,
    skill: str,
    question: str,
    options: list[str],
    correct_option: int,
    explanation: str,
    extra_public: dict[str, Any],
) -> dict[str, Any]:
    if skill not in SKILLS:
        return _error(f"skill deve ser uma de: {', '.join(SKILLS)}.")
    if problem := _validate_options(options, correct_option):
        return _error(problem)
    exercise_id = _save_exercise(
        tool_context,
        {
            "kind": "choice",
            "skill": skill,
            "options": options,
            "correct_option": correct_option,
            "explanation": explanation,
        },
    )
    return {
        "status": "success",
        "widget": widget,
        "exercise_id": exercise_id,
        "skill": skill,
        "question": question,
        "options": options,
        **extra_public,
        "note_for_tutor": "O cartão já está na tela. Não repita a pergunta nem as opções.",
    }


# --------------------------------------------------------------------------- #
# Criação de exercícios
# --------------------------------------------------------------------------- #
def create_multiple_choice(
    skill: str,
    question: str,
    options: list[str],
    correct_option: int,
    explanation: str,
    tool_context: ToolContext,
) -> dict[str, Any]:
    """Mostra ao aluno um exercício de múltipla escolha clicável.

    Args:
        skill: Habilidade treinada: grammar, vocabulary, reading, listening, writing ou speaking.
        question: Enunciado curto (pode misturar português e inglês).
        options: De 2 a 5 alternativas.
        correct_option: Índice (começando em 0) da alternativa correta.
        explanation: Explicação em português do porquê da resposta correta.

    Returns:
        Dados do cartão exibido, incluindo o exercise_id usado na correção.
    """
    return _choice_exercise(
        tool_context, "multiple_choice", skill, question, options, correct_option, explanation, {}
    )


def create_reading_exercise(
    title: str,
    passage: str,
    question: str,
    options: list[str],
    correct_option: int,
    explanation: str,
    tool_context: ToolContext,
) -> dict[str, Any]:
    """Mostra um texto curto em inglês com uma pergunta de interpretação.

    Args:
        title: Título do texto.
        passage: Texto em inglês nível A1/A2 (40 a 120 palavras).
        question: Pergunta de compreensão sobre o texto.
        options: De 2 a 5 alternativas.
        correct_option: Índice (começando em 0) da alternativa correta.
        explanation: Explicação em português, citando o trecho do texto.

    Returns:
        Dados do cartão exibido, incluindo o exercise_id.
    """
    return _choice_exercise(
        tool_context,
        "reading",
        "reading",
        question,
        options,
        correct_option,
        explanation,
        {"title": title, "passage": passage},
    )


def create_listening_exercise(
    audio_text: str,
    question: str,
    options: list[str],
    correct_option: int,
    explanation: str,
    tool_context: ToolContext,
) -> dict[str, Any]:
    """Cria um exercício de compreensão auditiva.

    O navegador lê ``audio_text`` em voz alta (voz nativa em inglês), com
    opção de velocidade lenta. A transcrição fica oculta até o aluno responder.

    Args:
        audio_text: Frase ou diálogo curto em inglês que será ouvido (até 60 palavras).
        question: Pergunta sobre o que foi ouvido.
        options: De 2 a 5 alternativas.
        correct_option: Índice (começando em 0) da alternativa correta.
        explanation: Explicação em português.

    Returns:
        Dados do player exibido, incluindo o exercise_id.
    """
    return _choice_exercise(
        tool_context,
        "listening",
        "listening",
        question,
        options,
        correct_option,
        explanation,
        {"audio_text": audio_text},
    )


def create_fill_in_the_blank(
    skill: str,
    sentence: str,
    correct_answers: list[str],
    hint: str,
    explanation: str,
    tool_context: ToolContext,
) -> dict[str, Any]:
    """Mostra uma frase com lacuna para o aluno digitar a palavra que falta.

    Args:
        skill: grammar, vocabulary ou writing.
        sentence: Frase em inglês com a lacuna marcada como "___".
        correct_answers: Todas as respostas aceitas (ex.: ["is", "'s"]).
        hint: Dica curta em português.
        explanation: Explicação em português da regra.

    Returns:
        Dados do cartão exibido, incluindo o exercise_id.
    """
    if skill not in SKILLS:
        return _error(f"skill deve ser uma de: {', '.join(SKILLS)}.")
    if "___" not in sentence:
        return _error('A frase precisa conter a lacuna "___".')
    if not correct_answers:
        return _error("Informe pelo menos uma resposta correta.")
    exercise_id = _save_exercise(
        tool_context,
        {
            "kind": "text",
            "skill": skill,
            "correct_answers": correct_answers,
            "explanation": explanation,
        },
    )
    return {
        "status": "success",
        "widget": "fill_blank",
        "exercise_id": exercise_id,
        "skill": skill,
        "sentence": sentence,
        "hint": hint,
        "note_for_tutor": "O cartão já está na tela. Não repita a frase.",
    }


def create_speaking_exercise(
    target_phrase: str, translation: str, tip: str, tool_context: ToolContext
) -> dict[str, Any]:
    """Pede ao aluno para ouvir e repetir uma frase em voz alta (microfone).

    Args:
        target_phrase: Frase curta em inglês para o aluno pronunciar.
        translation: Tradução em português.
        tip: Dica de pronúncia em português (ex.: som do "th").

    Returns:
        Dados do cartão de fala, incluindo o exercise_id.
    """
    if not _normalize(target_phrase):
        return _error("target_phrase não pode ser vazia.")
    exercise_id = _save_exercise(
        tool_context, {"kind": "speaking", "skill": "speaking", "target": target_phrase}
    )
    return {
        "status": "success",
        "widget": "speaking",
        "exercise_id": exercise_id,
        "target_phrase": target_phrase,
        "translation": translation,
        "tip": tip,
        "note_for_tutor": "O cartão com microfone já está na tela.",
    }


def create_writing_task(
    instructions: str, min_words: int, useful_words: list[str], tool_context: ToolContext
) -> dict[str, Any]:
    """Propõe uma pequena produção de texto em inglês.

    Args:
        instructions: O que o aluno deve escrever (em português, com exemplo em inglês).
        min_words: Quantidade mínima de palavras (entre 10 e 80 para nível básico).
        useful_words: Palavras/expressões em inglês que ajudam na tarefa.

    Returns:
        Dados do cartão de escrita, incluindo o exercise_id.
    """
    min_words = max(5, min(int(min_words), 150))
    exercise_id = _save_exercise(
        tool_context, {"kind": "writing", "skill": "writing", "min_words": min_words}
    )
    return {
        "status": "success",
        "widget": "writing",
        "exercise_id": exercise_id,
        "instructions": instructions,
        "min_words": min_words,
        "useful_words": useful_words,
        "note_for_tutor": "O cartão de escrita já está na tela.",
    }


def create_flashcards(
    words: list[str], translations: list[str], examples: list[str], tool_context: ToolContext
) -> dict[str, Any]:
    """Mostra cartões de vocabulário que viram ao clicar e têm áudio.

    Args:
        words: Palavras ou expressões em inglês (3 a 8).
        translations: Traduções em português, na mesma ordem.
        examples: Uma frase de exemplo em inglês para cada palavra, na mesma ordem.

    Returns:
        Dados dos flashcards exibidos.
    """
    if not (len(words) == len(translations) == len(examples)):
        return _error("words, translations e examples devem ter o mesmo tamanho.")
    if not words:
        return _error("Envie pelo menos uma palavra.")
    cards = [
        {"word": w, "translation": t, "example": e}
        for w, t, e in zip(words, translations, examples)
    ]
    return {
        "status": "success",
        "widget": "flashcards",
        "cards": cards,
        "note_for_tutor": "Os flashcards já estão na tela. Não liste as palavras de novo.",
    }


# --------------------------------------------------------------------------- #
# Correção
# --------------------------------------------------------------------------- #
def check_answer(exercise_id: str, answer: str, tool_context: ToolContext) -> dict[str, Any]:
    """Corrige a resposta do aluno a um exercício de múltipla escolha ou lacuna.

    Chame sempre que receber uma mensagem "[ANSWER] exercise_id=... answer=...".

    Args:
        exercise_id: Identificador do exercício (ex.: ex_1a2b3c4d).
        answer: Para múltipla escolha, o índice escolhido (ex.: "2"); para lacuna, o texto digitado.

    Returns:
        Se acertou, a resposta correta, a explicação e o progresso atualizado.
    """
    exercise = _load_exercise(tool_context, exercise_id)
    if exercise is None:
        return _error("Exercício não encontrado. Crie um novo exercício.")
    if exercise["kind"] not in ("choice", "text"):
        return _error("Use evaluate_pronunciation ou record_writing_score para este exercício.")

    if exercise["kind"] == "choice":
        try:
            chosen = int(str(answer).strip())
        except ValueError:
            normalized = _normalize(answer)
            chosen = next(
                (i for i, o in enumerate(exercise["options"]) if _normalize(o) == normalized), -1
            )
        is_correct = chosen == exercise["correct_option"]
        correct_text = exercise["options"][exercise["correct_option"]]
        chosen_text = exercise["options"][chosen] if 0 <= chosen < len(exercise["options"]) else answer
    else:
        accepted = {_normalize(a) for a in exercise["correct_answers"]}
        is_correct = _normalize(answer) in accepted
        correct_text = exercise["correct_answers"][0]
        chosen_text = answer

    first_attempt = not exercise["answered"]
    if first_attempt:
        _mark_answered(tool_context, exercise_id)
        xp = XP_CORRECT_ANSWER if is_correct else XP_WRONG_ANSWER
        progress = record_result(tool_context.state, exercise["skill"], is_correct, xp)
    else:
        xp = 0
        progress = read_progress(tool_context.state)

    return {
        "status": "success",
        "widget": "result",
        "exercise_id": exercise_id,
        "is_correct": is_correct,
        "student_answer": chosen_text,
        "correct_answer": correct_text,
        "correct_option": exercise.get("correct_option"),
        "explanation": exercise["explanation"],
        "xp_earned": xp,
        "progress": summarize_progress(progress),
    }


def evaluate_pronunciation(
    exercise_id: str, transcript: str, tool_context: ToolContext
) -> dict[str, Any]:
    """Compara o que o reconhecimento de voz ouviu com a frase-alvo.

    Chame ao receber "[SPEAKING] exercise_id=... transcript=...".

    Args:
        exercise_id: Identificador do exercício de fala.
        transcript: Texto reconhecido pelo microfone do aluno.

    Returns:
        Nota de 0 a 100, palavras corretas/faltando/extras e progresso.
    """
    exercise = _load_exercise(tool_context, exercise_id)
    if exercise is None or exercise["kind"] != "speaking":
        return _error("Exercício de fala não encontrado.")

    target_words = _normalize(exercise["target"]).split()
    spoken_words = _normalize(transcript).split()
    matcher = difflib.SequenceMatcher(a=target_words, b=spoken_words)
    similarity = matcher.ratio()

    matched: set[int] = set()
    for block in matcher.get_matching_blocks():
        matched.update(range(block.a, block.a + block.size))
    missing = [w for i, w in enumerate(target_words) if i not in matched]
    extra = sorted(set(spoken_words) - set(target_words))

    score = round(similarity * 100)
    passed = similarity >= SPEAKING_PASS_THRESHOLD
    first_attempt = not exercise["answered"]
    xp = round(XP_SPEAKING_MAX * similarity) if first_attempt else 0
    if first_attempt:
        _mark_answered(tool_context, exercise_id)
        progress = record_result(tool_context.state, "speaking", passed, xp)
    else:
        progress = read_progress(tool_context.state)

    return {
        "status": "success",
        "widget": "speaking_result",
        "exercise_id": exercise_id,
        "target_phrase": exercise["target"],
        "heard": transcript,
        "score": score,
        "passed": passed,
        "missing_or_mispronounced_words": missing,
        "extra_words": extra,
        "xp_earned": xp,
        "progress": summarize_progress(progress),
    }


def record_writing_score(
    exercise_id: str, score: int, tool_context: ToolContext
) -> dict[str, Any]:
    """Registra a nota da produção escrita depois que você a corrigiu.

    Args:
        exercise_id: Identificador da tarefa de escrita.
        score: Nota de 0 a 100 considerando gramática, vocabulário e tarefa cumprida.

    Returns:
        XP ganho e progresso atualizado.
    """
    exercise = _load_exercise(tool_context, exercise_id)
    if exercise is None or exercise["kind"] != "writing":
        return _error("Tarefa de escrita não encontrada.")
    score = max(0, min(int(score), 100))
    first_attempt = not exercise["answered"]
    xp = round(XP_WRITING_MAX * score / 100) if first_attempt else 0
    if first_attempt:
        _mark_answered(tool_context, exercise_id)
        progress = record_result(tool_context.state, "writing", score >= 60, xp)
    else:
        progress = read_progress(tool_context.state)
    return {
        "status": "success",
        "widget": "writing_result",
        "exercise_id": exercise_id,
        "score": score,
        "xp_earned": xp,
        "progress": summarize_progress(progress),
    }
