// Cartões interativos de exercícios, criados a partir das respostas das ferramentas do agente.

import { createRecognizer, speak, stopSpeaking, sttSupported } from "./speech.js";

const LETTERS = "ABCDE";
const SKILL_LABEL = {
  listening: "🎧 Listening",
  speaking: "🎤 Speaking",
  reading: "📖 Reading",
  writing: "✍️ Writing",
  vocabulary: "🃏 Vocabulário",
  grammar: "🧩 Gramática",
};

/** Cria elementos DOM sem innerHTML (o conteúdo vem do modelo e é tratado como texto). */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "style") el.style.cssText = value;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

function shell(skill, title, xpLabel, ...body) {
  return h(
    "article",
    { class: "widget", "data-skill": skill },
    h("header", { class: "w-head" }, h("span", { class: "w-tag" }, title || SKILL_LABEL[skill] || skill), h("span", { class: "w-xp" }, xpLabel)),
    h("div", { class: "w-body" }, ...body),
  );
}

function feedback(ok, title, text) {
  return h("div", { class: `feedback ${ok ? "ok" : "bad"}` }, h("strong", {}, title), text);
}

// --------------------------------------------------------------------------
// Fábrica: cada widget devolve { el, applyResult(result) }
// --------------------------------------------------------------------------
export class WidgetFactory {
  /** @param {{send: (text: string, display: Node|string) => boolean}} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    this.cards = new Map();
  }

  render(payload) {
    const builder = {
      multiple_choice: () => this.#choice(payload),
      reading: () => this.#choice(payload, this.#passage(payload)),
      listening: () => this.#choice(payload, this.#player(payload)),
      fill_blank: () => this.#fillBlank(payload),
      speaking: () => this.#speaking(payload),
      writing: () => this.#writing(payload),
      flashcards: () => this.#flashcards(payload),
    }[payload.widget];
    if (!builder) return null;
    const card = builder();
    if (payload.exercise_id) this.cards.set(payload.exercise_id, card);
    return card.el;
  }

  applyResult(result) {
    this.cards.get(result.exercise_id)?.applyResult?.(result);
  }

  // ---------------------------------------------------------------- choice
  #choice(p, before = null) {
    const options = p.options.map((text, i) =>
      h("button", { class: "option", type: "button", onclick: () => choose(i) }, h("span", { class: "key" }, LETTERS[i]), h("span", {}, text)),
    );
    const extra = h("div");
    const el = shell(p.skill, null, "+10 XP", before, h("div", { class: "w-question" }, p.question), h("div", { class: "options" }, options), extra);

    const lock = () => {
      el.classList.add("locked");
      options.forEach((o) => (o.disabled = true));
    };
    const choose = (i) => {
      const sent = this.ctx.send(
        `[ANSWER] exercise_id=${p.exercise_id} answer=${i} | ${p.options[i]}`,
        answerDisplay(`${LETTERS[i]}) ${p.options[i]}`),
      );
      if (!sent) return;
      options[i].classList.add("selected");
      lock();
    };

    return {
      el,
      applyResult: (r) => {
        lock();
        const chosen = p.options.findIndex((o) => o === r.student_answer);
        if (r.correct_option != null) options[r.correct_option]?.classList.add("correct");
        if (!r.is_correct && chosen >= 0) options[chosen].classList.add("wrong");
        if (!r.is_correct) el.querySelector(".options").classList.add("shake");
        extra.replaceChildren(
          feedback(r.is_correct, r.is_correct ? "Correct! 🎉" : `Resposta certa: ${r.correct_answer}`, r.explanation),
        );
        if (p.widget === "listening") extra.append(h("div", { class: "transcript" }, "🗒️ ", p.audio_text));
      },
    };
  }

  #passage(p) {
    // Cada palavra do texto pode ser clicada para ouvir a pronúncia.
    const words = p.passage.split(/(\s+)/).map((token) =>
      /\S/.test(token) ? h("span", { class: "w", onclick: () => speak(token.replace(/[^\w'-]/g, ""), { rate: 0.85 }) }, token) : token,
    );
    return h(
      "div",
      {},
      h("div", { class: "passage" }, h("h4", {}, p.title), words),
      h("div", { class: "row", style: "margin-top:8px" },
        h("button", { class: "link-btn", type: "button", onclick: () => speak(p.passage, { rate: 0.9 }) }, "🔊 Ouvir o texto"),
        h("span", { class: "small-hint" }, "· clique em qualquer palavra para ouvir"),
      ),
    );
  }

  #player(p) {
    let rate = 0.9;
    const bars = Array.from({ length: 28 }, (_, i) => h("i", { style: `animation-delay:${(i % 7) * 0.09}s; height:${20 + ((i * 37) % 60)}%` }));
    const speedBtns = [
      ["1x", 0.9],
      ["🐢 0.7x", 0.65],
    ].map(([label, value], idx) =>
      h("button", {
        type: "button",
        class: idx === 0 ? "on" : "",
        onclick: (e) => {
          rate = value;
          speedBtns.forEach((b) => b.classList.remove("on"));
          e.currentTarget.classList.add("on");
        },
      }, label),
    );
    const playBtn = h("button", { class: "play-btn", type: "button", "aria-label": "Tocar áudio" }, "▶");
    const player = h("div", { class: "player" }, playBtn, h("div", { class: "wave" }, bars), h("div", { class: "speed" }, speedBtns));
    let playing = false;
    playBtn.addEventListener("click", async () => {
      if (playing) { stopSpeaking(); return; }
      playing = true;
      player.classList.add("playing");
      playBtn.textContent = "■";
      await speak(p.audio_text, { rate });
      playing = false;
      player.classList.remove("playing");
      playBtn.textContent = "▶";
    });
    return h("div", {}, player, h("div", { class: "small-hint", style: "margin-top:6px" }, "Ouça quantas vezes quiser. A transcrição aparece depois da resposta."));
  }

  // ---------------------------------------------------------------- fill in the blank
  #fillBlank(p) {
    const input = h("input", { class: "blank-input", type: "text", "aria-label": "Resposta", autocomplete: "off", spellcheck: "false" });
    const [before, ...rest] = p.sentence.split("___");
    const sentence = h("div", { class: "blank-sentence" }, before, input, rest.join("___"));
    const hint = h("div", { class: "hint-box", hidden: true }, "💡 ", p.hint);
    const submit = h("button", { class: "btn", type: "button" }, "Verificar");
    const extra = h("div");
    const el = shell(p.skill, null, "+10 XP", sentence, h("div", { class: "row" }, submit,
      h("button", { class: "btn secondary", type: "button", onclick: () => (hint.hidden = !hint.hidden) }, "💡 Dica"),
      h("button", { class: "btn secondary", type: "button", onclick: () => speak(p.sentence.replace("___", "blank"), { rate: 0.85 }) }, "🔊"),
    ), hint, extra);

    const send = () => {
      const value = input.value.trim();
      if (!value) { input.focus(); input.classList.add("shake"); setTimeout(() => input.classList.remove("shake"), 700); return; }
      if (this.ctx.send(`[ANSWER] exercise_id=${p.exercise_id} answer=${value}`, answerDisplay(value))) {
        input.disabled = submit.disabled = true;
      }
    };
    submit.addEventListener("click", send);
    input.addEventListener("keydown", (e) => e.key === "Enter" && send());
    queueMicrotask(() => input.isConnected && input.focus({ preventScroll: true }));

    return {
      el,
      applyResult: (r) => {
        input.disabled = submit.disabled = true;
        input.value = input.value || r.student_answer;
        input.style.borderColor = r.is_correct ? "var(--success)" : "var(--danger)";
        extra.replaceChildren(feedback(r.is_correct, r.is_correct ? "Correct! 🎉" : `Resposta certa: ${r.correct_answer}`, r.explanation));
      },
    };
  }

  // ---------------------------------------------------------------- speaking
  #speaking(p) {
    const tokens = p.target_phrase.split(/\s+/).map((w) => h("span", { class: "tw" }, w, " "));
    const phrase = h("div", { class: "target-phrase" }, tokens);
    const live = h("div", { class: "live-transcript" }, sttSupported ? "Toque no microfone e fale a frase" : "");
    const mic = h("button", { class: "mic-btn", type: "button", "aria-label": "Gravar" }, "🎤");
    const extra = h("div");
    const el = shell("speaking", null, "até +15 XP",
      phrase,
      h("div", { class: "translation" }, p.translation),
      h("div", { class: "row", style: "justify-content:center" },
        h("button", { class: "btn secondary", type: "button", onclick: () => speak(p.target_phrase, { rate: 0.9 }) }, "🔊 Ouvir"),
        h("button", { class: "btn secondary", type: "button", onclick: () => speak(p.target_phrase, { rate: 0.6 }) }, "🐢 Devagar"),
      ),
      sttSupported
        ? h("div", { class: "mic-zone" }, mic, live)
        : h("div", { class: "hint-box" }, "Seu navegador não tem reconhecimento de voz. Use o Google Chrome ou o Microsoft Edge para treinar a fala."),
      h("div", { class: "hint-box" }, "💡 ", p.tip),
      extra,
    );

    let recognizer = null;
    mic.addEventListener("click", async () => {
      if (recognizer) { recognizer.stop(); return; }
      stopSpeaking();
      recognizer = createRecognizer({ lang: "en-US", onInterim: (t) => (live.textContent = `"${t}"`) });
      mic.classList.add("rec");
      mic.textContent = "■";
      live.textContent = "Ouvindo… 👂";
      try {
        const transcript = await recognizer.start();
        if (!transcript) {
          live.textContent = "Não ouvi nada. Tente de novo, falando mais perto do microfone.";
        } else {
          live.textContent = `"${transcript}"`;
          this.ctx.send(`[SPEAKING] exercise_id=${p.exercise_id} transcript="${transcript}"`, answerDisplay(`🎤 "${transcript}"`));
        }
      } catch (err) {
        live.textContent = `⚠️ ${err.message}`;
      } finally {
        recognizer = null;
        mic.classList.remove("rec");
        mic.textContent = "🎤";
      }
    });

    return {
      el,
      applyResult: (r) => {
        const missing = [...(r.missing_or_mispronounced_words || [])];
        tokens.forEach((t) => {
          const norm = t.textContent.toLowerCase().replace(/[^a-z0-9']/g, "");
          const idx = missing.indexOf(norm);
          t.classList.remove("hit", "miss");
          if (idx >= 0) { t.classList.add("miss"); missing.splice(idx, 1); } else t.classList.add("hit");
        });
        const ring = h("div", { class: "score-ring", style: `--p:${r.score}; --ring:${r.passed ? "var(--success)" : "var(--warning)"}` }, h("span", {}, `${r.score}`));
        extra.replaceChildren(
          ring,
          feedback(r.passed, r.passed ? "Excellent pronunciation! 🌟" : "Quase lá! Tente novamente 💪", `Eu ouvi: "${r.heard}"`),
        );
        live.textContent = "Quer melhorar a nota? Grave de novo!";
      },
    };
  }

  // ---------------------------------------------------------------- writing
  #writing(p) {
    const area = h("textarea", { class: "writing-area", placeholder: "Write here in English…", spellcheck: "false" });
    const counter = h("span", { class: "counter" }, `0/${p.min_words} palavras`);
    const submit = h("button", { class: "btn", type: "button", disabled: true }, "Enviar para correção ✍️");
    const chips = (p.useful_words || []).map((w) =>
      h("button", {
        class: "word-chip",
        type: "button",
        title: "Inserir no texto",
        onclick: () => {
          const sep = area.value && !/\s$/.test(area.value) ? " " : "";
          area.value += sep + w;
          area.dispatchEvent(new Event("input"));
          area.focus();
        },
      }, w),
    );
    const extra = h("div");
    const el = shell("writing", null, "até +20 XP",
      h("div", { class: "w-question" }, p.instructions),
      chips.length ? h("div", { class: "word-chips" }, chips) : null,
      area,
      h("div", { class: "row", style: "justify-content:space-between" }, counter, submit),
      extra,
    );
    const countWords = () => (area.value.trim().match(/[A-Za-z']+/g) || []).length;
    area.addEventListener("input", () => {
      const n = countWords();
      counter.textContent = `${n}/${p.min_words} palavras`;
      counter.classList.toggle("ok", n >= p.min_words);
      submit.disabled = n < p.min_words;
    });
    submit.addEventListener("click", () => {
      const text = area.value.trim();
      if (this.ctx.send(`[WRITING] exercise_id=${p.exercise_id}\n${text}`, answerDisplay(`✍️ ${text}`))) {
        area.readOnly = true;
        submit.disabled = true;
      }
    });

    return {
      el,
      applyResult: (r) => {
        area.readOnly = true;
        submit.disabled = true;
        const ring = h("div", { class: "score-ring", style: `--p:${r.score}; --ring:${r.score >= 60 ? "var(--success)" : "var(--warning)"}` }, h("span", {}, `${r.score}`));
        extra.replaceChildren(ring, feedback(r.score >= 60, r.score >= 60 ? "Great job! 🎉" : "Bom esforço! Veja as correções acima.", `+${r.xp_earned} XP`));
      },
    };
  }

  // ---------------------------------------------------------------- flashcards
  #flashcards(p) {
    const cards = p.cards.map((c) => {
      const btn = h("button", { class: "flash", type: "button", "aria-label": `Cartão: ${c.word}` },
        h("div", { class: "flash-inner" },
          h("div", { class: "flash-face flash-front" },
            h("div", { class: "fw" }, c.word),
            h("span", { class: "speak-mini", onclick: (e) => { e.stopPropagation(); speak(c.word, { rate: 0.85 }); } }, "🔊 ouvir"),
            h("span", { class: "small-hint" }, "toque para virar"),
          ),
          h("div", { class: "flash-face flash-back" },
            h("div", { class: "ft" }, c.translation),
            h("div", { class: "fe" }, c.example),
            h("span", { class: "speak-mini", onclick: (e) => { e.stopPropagation(); speak(c.example, { rate: 0.9 }); } }, "🔊 exemplo"),
          ),
        ),
      );
      btn.addEventListener("click", () => btn.classList.toggle("flipped"));
      return btn;
    });
    const el = shell("vocabulary", "🃏 Flashcards", `${p.cards.length} palavras`,
      h("div", { class: "flash-grid" }, cards),
      h("div", { class: "row" },
        h("button", { class: "btn", type: "button", onclick: () => this.ctx.send("Já estudei os flashcards! Pode me testar com um exercício.", "✅ Já estudei os flashcards! Pode me testar.") }, "Me teste! 🧠"),
        h("button", { class: "btn secondary", type: "button", onclick: () => cards.forEach((c) => c.classList.toggle("flipped")) }, "Virar todos"),
      ),
    );
    return { el };
  }
}

export function answerDisplay(text) {
  return h("span", { class: "answer-pill" }, h("small", {}, "Minha resposta:"), text);
}

/** Converte a mensagem técnica enviada por um cartão em algo amigável (usado no histórico). */
export function displayForUserText(text) {
  let m = text.match(/^\[ANSWER\] exercise_id=\S+ answer=(\d+) \| ([\s\S]*)$/);
  if (m) return answerDisplay(`${LETTERS[+m[1]] ?? ""}) ${m[2]}`);
  m = text.match(/^\[ANSWER\] exercise_id=\S+ answer=([\s\S]*)$/);
  if (m) return answerDisplay(m[1]);
  m = text.match(/^\[SPEAKING\] exercise_id=\S+ transcript="([\s\S]*)"$/);
  if (m) return answerDisplay(`🎤 "${m[1]}"`);
  m = text.match(/^\[WRITING\] exercise_id=\S+\n([\s\S]*)$/);
  if (m) return answerDisplay(`✍️ ${m[1]}`);
  return null;
}
