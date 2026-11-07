# 🎓 EnglishUp: professor de inglês com IA (Google ADK)

Um sistema **multiagente** feito com o [Google Agent Development Kit (ADK)](https://google.github.io/adk-docs/) para ajudar alunos brasileiros de nível básico (A1/A2) a aprender inglês treinando as 4 habilidades: **Listening, Speaking, Reading e Writing**, além de **vocabulário e gramática**, com exercícios interativos.

## ✨ Funcionalidades

| Habilidade | Coach | Como funciona |
|---|---|---|
| 🎧 Listening | Coach Leo | Áudio com voz nativa (normal ou lento) + perguntas. A transcrição só aparece depois da resposta |
| 🎤 Speaking | Coach Mia | O aluno ouve a frase, grava pelo microfone e recebe uma nota de pronúncia com as palavras erradas destacadas |
| 📖 Reading | Coach Theo | Textos curtos com perguntas de interpretação; clique em qualquer palavra para ouvir a pronúncia |
| ✍️ Writing | Coach Zoe | Tarefas de escrita com contador de palavras e correção detalhada (❌ → ✅) com nota |
| 🃏🧩 Vocabulário e gramática | Coach Max | Flashcards que viram, com áudio, e exercícios de lacuna e múltipla escolha |

- **Teacher Ana** (agente coordenador) conhece o aluno, salva o perfil, acompanha o progresso e transfere para o especialista certo.
- **Gamificação**: XP, nível aproximado (A1 → B1), sequência de dias e taxa de acerto por habilidade.
- **Progresso persistente** em SQLite, com estado `user:` do ADK que é compartilhado entre conversas.
- O **gabarito nunca vai para o navegador**: as respostas são guardadas no estado da sessão e corrigidas pelas ferramentas no servidor.
- Interface responsiva (desktop e celular), com tema claro/escuro, streaming das respostas, confete 🎉 e ditado por voz.

## 🏗️ Arquitetura

```
english_teacher (coordenadora, LlmAgent)
 ├── listening_coach          ─ create_listening_exercise, check_answer
 ├── speaking_coach           ─ create_speaking_exercise, evaluate_pronunciation
 ├── reading_coach            ─ create_reading_exercise, create_multiple_choice, check_answer
 ├── writing_coach            ─ create_writing_task, record_writing_score, ...
 └── vocabulary_grammar_coach ─ create_flashcards, create_fill_in_the_blank, ...
```

```
english_tutor/          Pacote do agente ADK (expõe root_agent)
  agent.py              Agente coordenador
  sub_agents.py         Coaches especialistas
  prompts.py            Instruções pedagógicas
  config.py             Modelo, retry e pontuação
  tools/exercises.py    Criação e correção de exercícios
  tools/progress.py     Perfil, XP, nível e sequência de dias
frontend/               Interface web (HTML/CSS/JS puro, sem build)
server.py               FastAPI: API oficial do ADK (get_fast_api_app) + interface
tests/                  Testes unitários das ferramentas
```

Os cartões interativos funcionam assim: as ferramentas `create_*` devolvem um payload com a chave `widget`. O front-end lê os eventos SSE do ADK (`/run_sse`) e desenha o cartão correspondente. Quando o aluno responde, o cartão envia uma mensagem `[ANSWER]`, `[SPEAKING]` ou `[WRITING]`, e o agente chama a ferramenta de correção.

## 🚀 Como rodar

```bash
pip install -r requirements.txt
cp .env.example .env        # coloque sua GOOGLE_API_KEY
python server.py            # abra http://localhost:8000
```

> Use **Google Chrome** ou **Microsoft Edge** para ter o reconhecimento de voz (Speaking).

Também dá para usar a interface de desenvolvimento do ADK: `adk web` (na raiz do projeto).

### Testes

```bash
python -m pytest
```

## ⚠️ Limites do plano gratuito da Gemini API

No plano gratuito, cada modelo permite cerca de **5 requisições por minuto e 20 por dia**. Cada mensagem do aluno usa de 1 a 3 requisições (a transferência entre agentes também conta). O app repete automaticamente quando estoura o limite por minuto, mas o limite diário só volta no dia seguinte.

Para uso real, **ative o faturamento** no projeto do Google AI Studio. Para trocar de modelo, use a variável `TUTOR_MODEL` no `.env` (padrão: `gemini-3.5-flash`, que teve o melhor desempenho com as ferramentas nos testes).
