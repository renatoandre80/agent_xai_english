// Orquestra a interface: sessão ADK, streaming de eventos, chat, widgets e progresso.

import { AdkClient } from "./api.js";
import { renderMarkdown } from "./markdown.js";
import { createRecognizer, speak, stopSpeaking, sttSupported } from "./speech.js";
import { displayForUserText, h, WidgetFactory } from "./widgets.js";

const APP_NAME = "english_tutor";
const STORAGE = { user: "englishup.userId", session: "englishup.sessionId", theme: "englishup.theme" };

const COACHES = {
  english_teacher: { name: "Teacher Bruna", emoji: "👩‍🏫", role: "Professora coordenadora", color: "var(--primary)", skill: null },
  listening_coach: { name: "Coach Leo", emoji: "🎧", role: "Especialista em Listening", color: "var(--listening)", skill: "listening" },
  speaking_coach: { name: "Coach Mia", emoji: "🎤", role: "Especialista em Speaking", color: "var(--speaking)", skill: "speaking" },
  reading_coach: { name: "Coach Theo", emoji: "📖", role: "Especialista em Reading", color: "var(--reading)", skill: "reading" },
  writing_coach: { name: "Coach Zoe", emoji: "✍️", role: "Especialista em Writing", color: "var(--writing)", skill: "writing" },
  vocabulary_grammar_coach: { name: "Coach Max", emoji: "🧠", role: "Vocabulário & Gramática", color: "var(--grammar)", skill: "grammar" },
};
const LEVELS = [
  [0, "A1 - Iniciante"],
  [150, "A1+ - Iniciante avançado"],
  [400, "A2 - Básico"],
  [800, "A2+ - Básico avançado"],
  [1400, "B1 - Intermediário"],
];
const RESULT_WIDGETS = new Set(["result", "speaking_result", "writing_result"]);

// ------------------------------------------------------------------ helpers
const $ = (sel) => document.querySelector(sel);
const storage = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* modo privado */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* modo privado */ } },
};

const els = {
  chat: $("#chat"),
  messages: $("#messages"),
  welcome: $("#welcome"),
  input: $("#input"),
  form: $("#composer"),
  send: $("#sendBtn"),
  toasts: $("#toasts"),
  coach: $("#coach"),
};

const api = new AdkClient(APP_NAME);
const state = {
  userId: storage.get(STORAGE.user) || `aluno_${crypto.randomUUID().slice(0, 8)}`,
  sessionId: null,
  busy: false,
  controller: null,
  coach: "english_teacher",
  xp: 0,
};
storage.set(STORAGE.user, state.userId);

const widgets = new WidgetFactory({ send: (text, display) => sendMessage(text, display) });

// ------------------------------------------------------------------ UI primitives
function scrollToBottom(force = false) {
  const { chat } = els;
  const nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 240;
  if (force || nearBottom) chat.scrollTop = chat.scrollHeight;
}

function hideWelcome() {
  els.welcome.hidden = true;
}

function toast(content, kind = "") {
  const el = h("div", { class: `toast ${kind}` }, content);
  els.toasts.append(el);
  setTimeout(() => el.remove(), 3200);
}

function confetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#6b4ef6", "#ec4899", "#10b981", "#f59e0b", "#3b82f6"];
  for (let i = 0; i < 46; i++) {
    const piece = h("i", {
      class: "confetti",
      style: `left:${Math.random() * 100}vw; background:${colors[i % colors.length]}; animation-duration:${1.6 + Math.random() * 1.4}s; animation-delay:${Math.random() * 0.25}s; transform:rotate(${Math.random() * 360}deg)`,
    });
    document.body.append(piece);
    setTimeout(() => piece.remove(), 3500);
  }
}

function setCoach(agentName, announce = false) {
  const coach = COACHES[agentName];
  if (!coach || state.coach === agentName) return;
  state.coach = agentName;
  $("#coachAvatar").textContent = coach.emoji;
  $("#coachName").textContent = coach.name;
  $("#coachRole").lastChild.textContent = coach.role;
  els.coach.style.setProperty("--coach", coach.color);
  els.coach.classList.remove("swap");
  void els.coach.offsetWidth;
  els.coach.classList.add("swap");
  document.querySelectorAll(".module").forEach((m) => m.classList.toggle("active", m.dataset.skill === coach.skill));
  if (announce) addSystemChip(`${coach.emoji} ${coach.name} entrou na aula`);
}

function addSystemChip(text) {
  els.messages.append(h("div", { class: "system-chip" }, text));
  scrollToBottom();
}

function addUserMessage(display) {
  hideWelcome();
  const bubble = h("div", { class: "bubble" });
  if (display instanceof Node) bubble.append(display);
  else bubble.innerHTML = renderMarkdown(display);
  els.messages.append(h("div", { class: "msg user" }, bubble));
  scrollToBottom(true);
}

function createAgentBubble(author) {
  const coach = COACHES[author] || COACHES.english_teacher;
  const content = h("div", { class: "content" });
  const bubble = h("div", { class: "bubble" }, h("div", { class: "who" }, coach.name), content);
  const row = h("div", { class: "msg agent", style: `--coach:${coach.color}` }, h("div", { class: "avatar" }, coach.emoji), bubble);
  els.messages.append(row);
  return { row, content, text: "" };
}

let typingEl = null;
function showTyping(on) {
  typingEl?.remove();
  typingEl = null;
  if (!on) return;
  const coach = COACHES[state.coach];
  typingEl = h("div", { class: "typing msg agent", style: `--coach:${coach.color}` },
    h("div", { class: "avatar" }, coach.emoji),
    h("div", { class: "dots" }, h("i"), h("i"), h("i")),
  );
  els.messages.append(typingEl);
  scrollToBottom();
}

function setBusy(busy) {
  state.busy = busy;
  els.send.disabled = busy;
  showTyping(busy);
}

// ------------------------------------------------------------------ progress
function renderProgress(progress) {
  if (!progress) return;
  const xp = progress.xp || 0;
  const gained = xp - state.xp;
  state.xp = xp;
  let idx = 0;
  LEVELS.forEach(([min], i) => { if (xp >= min) idx = i; });
  const [floor, name] = LEVELS[idx];
  const next = LEVELS[idx + 1];
  const pct = next ? ((xp - floor) / (next[0] - floor)) * 100 : 100;

  $("#levelName").textContent = name;
  $("#xp").textContent = xp;
  $("#xpNext").textContent = next ? `· faltam ${next[0] - xp} para ${next[1].split(" ")[0]}` : "· nível máximo 🏆";
  $("#xpFill").style.width = `${Math.min(100, pct)}%`;
  $("#xpBarWrap").setAttribute("aria-valuenow", Math.round(pct));
  $("#streak").textContent = progress.streak_days || 0;
  $("#topXp span").textContent = xp;

  for (const [skill, stats] of Object.entries(progress.skills || {})) {
    const mod = document.querySelector(`.module[data-skill="${skill}"]`);
    if (!mod) continue;
    const accuracy = stats.total ? Math.round((100 * stats.correct) / stats.total) : null;
    mod.querySelector(".m-bar i").style.width = `${accuracy ?? 0}%`;
    mod.querySelector(".m-pct").textContent = accuracy == null ? "–" : `${accuracy}%`;
    mod.title = stats.total ? `${stats.correct} de ${stats.total} acertos` : "Ainda não praticado";
  }
  return gained;
}

// ------------------------------------------------------------------ event handling
/**
 * Processa um evento do ADK (ao vivo ou do histórico).
 * Eventos "partial" trazem pedaços de texto (streaming); o evento final traz o texto completo.
 */
function makeEventHandler({ live }) {
  let stream = null;

  return function handle(event) {
    const author = event.author;
    const parts = event.content?.parts || [];

    if (author === "user") {
      const text = parts.map((p) => p.text || "").join("");
      if (text) addUserMessage(displayForUserText(text) || text);
      return;
    }

    // A resposta de transfer_to_agent ainda vem assinada pelo agente anterior; ignoramos para não "voltar" o coach.
    const isTransferResponse = parts.some((p) => p.functionResponse?.name === "transfer_to_agent");
    if (!isTransferResponse) setCoach(author);
    const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("");

    if (event.partial) {
      if (!text) return;
      showTyping(false);
      if (!stream || stream.author !== author) stream = { author, ...createAgentBubble(author) };
      stream.text += text;
      stream.content.innerHTML = renderMarkdown(stream.text);
      stream.content.classList.add("cursor");
      scrollToBottom();
      return;
    }

    if (text) {
      showTyping(false);
      const target = stream && stream.author === author ? stream : { author, ...createAgentBubble(author) };
      target.content.innerHTML = renderMarkdown(text);
      target.content.classList.remove("cursor");
      stream = null;
      hideWelcome();
      scrollToBottom();
    }

    for (const part of parts) {
      if (part.functionCall?.name === "transfer_to_agent") {
        const to = part.functionCall.args?.agent_name;
        if (to) setCoach(to, true);
      }
      const response = part.functionResponse?.response;
      if (!response || response.status !== "success") continue;

      if (response.progress) {
        const gained = renderProgress(response.progress);
        if (live && gained > 0) toast(`⭐ +${gained} XP`, "xp");
      }
      if (RESULT_WIDGETS.has(response.widget)) {
        widgets.applyResult(response);
        if (live && (response.is_correct || response.passed || response.score >= 80)) confetti();
      } else if (response.widget) {
        const el = widgets.render(response);
        if (el) {
          showTyping(false);
          hideWelcome();
          els.messages.append(el);
          scrollToBottom();
        }
      }
    }
    if (live && state.busy) showTyping(true);
  };
}

// ------------------------------------------------------------------ session
async function ensureSession({ fresh = false } = {}) {
  if (!fresh) {
    const saved = storage.get(STORAGE.session);
    if (saved) {
      const session = await api.getSession(state.userId, saved);
      if (session) {
        state.sessionId = session.id;
        return session;
      }
    }
  }
  const session = await api.createSession(state.userId);
  state.sessionId = session.id;
  storage.set(STORAGE.session, session.id);
  return session;
}

function replay(session) {
  const handle = makeEventHandler({ live: false });
  for (const event of session.events || []) handle(event);
  renderProgress(session.state?.["user:progress"]);
  requestAnimationFrame(() => scrollToBottom(true));
}

async function refreshProgress() {
  try {
    const session = await api.getSession(state.userId, state.sessionId);
    renderProgress(session?.state?.["user:progress"]);
  } catch { /* não crítico */ }
}

// ------------------------------------------------------------------ sending
/** Envia uma mensagem ao agente. Retorna false se já houver uma resposta em andamento. */
function sendMessage(text, display = text) {
  text = text.trim();
  if (!text) return false;
  if (state.busy) {
    toast("⏳ Aguarde a resposta terminar…");
    return false;
  }
  addUserMessage(display);
  run(text);
  return true;
}

async function run(text, retried = false) {
  const controller = new AbortController();
  state.controller = controller;
  setBusy(true);
  const handle = makeEventHandler({ live: true });
  try {
    for await (const event of api.run({ userId: state.userId, sessionId: state.sessionId, text, signal: controller.signal })) {
      handle(event);
    }
  } catch (err) {
    if (controller.signal.aborted) return; // cancelado por "Nova conversa"
    if (err.code === 404 && !retried) {
      await ensureSession({ fresh: true });
      return run(text, true);
    }
    console.error(err);
    const quota = /429|RESOURCE_EXHAUSTED|quota/i.test(err.message || "");
    toast(quota ? "⏳ Limite de uso da IA atingido. Aguarde ~1 minuto." : `⚠️ ${err.message || "Erro de conexão"}`, "err");
    addSystemChip(quota ? "A professora precisa de uma pausa rápida (limite da API). Tente de novo em instantes." : "Algo deu errado. Tente enviar de novo.");
  } finally {
    // Uma execução cancelada não pode mexer no estado da conversa nova.
    if (state.controller === controller) {
      state.controller = null;
      setBusy(false);
      refreshProgress();
      els.input.focus({ preventScroll: true });
    }
  }
}

async function newConversation() {
  state.controller?.abort();
  state.controller = null;
  stopSpeaking();
  setBusy(false);
  els.messages.replaceChildren();
  widgets.reset();
  els.welcome.hidden = false;
  els.input.value = "";
  autoGrow();
  state.coach = null;
  setCoach("english_teacher");
  closeSidebar();
  try {
    await ensureSession({ fresh: true });
    await refreshProgress();
    toast("✨ Nova conversa iniciada. Seu progresso foi mantido!");
  } catch (err) {
    console.error(err);
    toast("⚠️ Não foi possível criar a nova conversa. O servidor está rodando?", "err");
  }
}

// ------------------------------------------------------------------ wiring
function autoGrow() {
  els.input.style.height = "auto";
  els.input.style.height = `${Math.min(els.input.scrollHeight, 160)}px`;
}

function closeSidebar() {
  $("#sidebar").classList.remove("open");
  $("#scrim").classList.remove("show");
}

function wire() {
  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (sendMessage(els.input.value)) {
      els.input.value = "";
      autoGrow();
    }
  });
  els.input.addEventListener("input", autoGrow);
  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      els.form.requestSubmit();
    }
  });

  // Botões com prompt pronto (módulos, cartões e chips)
  document.addEventListener("click", (e) => {
    const say = e.target.closest(".say");
    if (say) { speak(say.dataset.say, { rate: 0.85 }); return; }
    const trigger = e.target.closest("[data-prompt]");
    if (trigger) {
      sendMessage(trigger.dataset.prompt);
      closeSidebar();
    }
  });

  $("#newChatBtn").addEventListener("click", newConversation);

  $("#themeBtn").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    storage.set(STORAGE.theme, next);
  });

  $("#menuBtn").addEventListener("click", () => {
    $("#sidebar").classList.add("open");
    $("#scrim").classList.add("show");
  });
  $("#scrim").addEventListener("click", closeSidebar);

  // Ditado por voz na caixa de mensagem (português)
  const dictate = $("#dictateBtn");
  if (!sttSupported) dictate.hidden = true;
  let recognizer = null;
  dictate.addEventListener("click", async () => {
    if (recognizer) { recognizer.stop(); return; }
    const base = els.input.value ? `${els.input.value.trim()} ` : "";
    recognizer = createRecognizer({ lang: "pt-BR", onInterim: (t) => { els.input.value = base + t; autoGrow(); } });
    dictate.classList.add("rec");
    try {
      const text = await recognizer.start();
      els.input.value = (base + text).trim();
      autoGrow();
      els.input.focus();
    } catch (err) {
      toast(`⚠️ ${err.message}`, "err");
    } finally {
      recognizer = null;
      dictate.classList.remove("rec");
    }
  });
}

function applyTheme() {
  const saved = storage.get(STORAGE.theme);
  const prefersDark = matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = saved || (prefersDark ? "dark" : "light");
}

async function init() {
  applyTheme();
  wire();
  try {
    const session = await ensureSession();
    replay(session);
  } catch (err) {
    console.error(err);
    toast("⚠️ Não foi possível conectar ao servidor. Ele está rodando?", "err");
  }
}

init();
