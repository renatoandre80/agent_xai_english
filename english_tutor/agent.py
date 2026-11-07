"""Ponto de entrada do ADK: expõe ``root_agent``.

Arquitetura multiagente:

    english_teacher (coordenadora)
      ├── listening_coach
      ├── speaking_coach
      ├── reading_coach
      ├── writing_coach
      └── vocabulary_grammar_coach

A coordenadora conhece o aluno e delega para o especialista via
``transfer_to_agent``; os especialistas podem devolver o controle.
"""

from google.adk.agents import LlmAgent

from . import prompts
from .config import build_model
from .sub_agents import ALL_COACHES, GENERATION_CONFIG
from .tools import get_student_progress, update_student_profile

root_agent = LlmAgent(
    name="english_teacher",
    model=build_model(),
    description="Professora coordenadora: acolhe o aluno, acompanha o progresso e delega aos especialistas.",
    instruction=prompts.ROOT_INSTRUCTION,
    tools=[get_student_progress, update_student_profile],
    sub_agents=ALL_COACHES,
    generate_content_config=GENERATION_CONFIG,
)
