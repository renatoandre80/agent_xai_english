"""Testes das ferramentas do tutor (sem chamar o modelo)."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from english_tutor.tools import (
    check_answer,
    create_fill_in_the_blank,
    create_flashcards,
    create_listening_exercise,
    create_multiple_choice,
    create_speaking_exercise,
    create_writing_task,
    evaluate_pronunciation,
    get_student_progress,
    record_writing_score,
    update_student_profile,
)
from english_tutor.tools.progress import PROGRESS_KEY, level_for_xp


@pytest.fixture
def ctx():
    """Imitação mínima do ToolContext: só precisamos do dicionário de estado."""
    return SimpleNamespace(state={})


def test_multiple_choice_hides_answer_and_grades(ctx):
    created = create_multiple_choice("grammar", "I ___ happy.", ["is", "am", "are"], 1, "Com I usamos am.", ctx)
    assert created["status"] == "success"
    assert "correct_option" not in created  # gabarito não vai para o navegador

    result = check_answer(created["exercise_id"], "1", ctx)
    assert result["is_correct"] is True
    assert result["xp_earned"] == 10
    assert ctx.state[PROGRESS_KEY]["skills"]["grammar"] == {"correct": 1, "total": 1}


def test_second_attempt_gives_no_xp(ctx):
    ex = create_listening_exercise("Hello", "O que ouviu?", ["Hello", "Bye"], 0, "", ctx)
    check_answer(ex["exercise_id"], "1", ctx)
    again = check_answer(ex["exercise_id"], "0", ctx)
    assert again["is_correct"] is True
    assert again["xp_earned"] == 0
    assert ctx.state[PROGRESS_KEY]["skills"]["listening"]["total"] == 1


def test_choice_answer_by_text(ctx):
    ex = create_multiple_choice("vocabulary", "Gato?", ["Dog", "Cat"], 1, "", ctx)
    assert check_answer(ex["exercise_id"], "cat", ctx)["is_correct"] is True


@pytest.mark.parametrize(
    "options, correct",
    [(["só uma"], 0), (["a", "b"], 5)],
)
def test_invalid_choice_returns_error(ctx, options, correct):
    assert create_multiple_choice("grammar", "?", options, correct, "", ctx)["status"] == "error"


def test_invalid_skill(ctx):
    assert create_multiple_choice("dance", "?", ["a", "b"], 0, "", ctx)["status"] == "error"


def test_fill_in_the_blank_accepts_variants(ctx):
    ex = create_fill_in_the_blank("grammar", "She ___ a doctor.", ["is", "'s"], "verbo to be", "", ctx)
    assert check_answer(ex["exercise_id"], "  IS ", ctx)["is_correct"] is True


def test_fill_in_the_blank_requires_blank(ctx):
    assert create_fill_in_the_blank("grammar", "No blank here", ["x"], "", "", ctx)["status"] == "error"


def test_pronunciation_scoring(ctx):
    ex = create_speaking_exercise("I would like a coffee, please.", "Eu queria um café.", "", ctx)
    perfect = evaluate_pronunciation(ex["exercise_id"], "i would like a coffee please", ctx)
    assert perfect["score"] == 100 and perfect["passed"] is True

    ex2 = create_speaking_exercise("I would like a coffee, please.", "", "", ctx)
    partial = evaluate_pronunciation(ex2["exercise_id"], "I like coffee", ctx)
    assert partial["passed"] is False
    assert "would" in partial["missing_or_mispronounced_words"]


def test_writing_score_is_clamped(ctx):
    ex = create_writing_task("Apresente-se", 20, ["My name is"], ctx)
    result = record_writing_score(ex["exercise_id"], 150, ctx)
    assert result["score"] == 100
    assert result["xp_earned"] == 20


def test_flashcards_validate_lengths(ctx):
    assert create_flashcards(["cat"], ["gato", "cão"], ["The cat"], ctx)["status"] == "error"
    assert len(create_flashcards(["cat"], ["gato"], ["The cat sleeps."], ctx)["cards"]) == 1


def test_unknown_exercise(ctx):
    assert check_answer("ex_nope", "1", ctx)["status"] == "error"


def test_profile_and_progress(ctx):
    update_student_profile(" Renato ", "viagem", "futebol", ctx)
    data = get_student_progress(ctx)
    assert data["profile"]["name"] == "Renato"
    assert data["progress"]["xp"] == 0
    assert set(data["progress"]["never_practiced"]) >= {"listening", "speaking"}


def test_levels():
    assert level_for_xp(0).startswith("A1")
    assert level_for_xp(450).startswith("A2")
    assert level_for_xp(5000).startswith("B1")
