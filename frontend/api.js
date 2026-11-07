// Cliente mínimo para a API REST/SSE do Google ADK (get_fast_api_app).

export class AdkClient {
  constructor(appName) {
    this.appName = appName;
  }

  #sessionUrl(userId, sessionId = "") {
    const base = `/apps/${encodeURIComponent(this.appName)}/users/${encodeURIComponent(userId)}/sessions`;
    return sessionId ? `${base}/${encodeURIComponent(sessionId)}` : base;
  }

  async getSession(userId, sessionId) {
    const res = await fetch(this.#sessionUrl(userId, sessionId));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Falha ao carregar sessão (${res.status})`);
    return res.json();
  }

  async createSession(userId) {
    const res = await fetch(this.#sessionUrl(userId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok) throw new Error(`Falha ao criar sessão (${res.status})`);
    return res.json();
  }

  /**
   * Executa o agente e entrega cada evento ADK conforme chega (Server-Sent Events).
   * @returns {AsyncGenerator<object>}
   */
  async *run({ userId, sessionId, text, signal }) {
    const res = await fetch("/run_sse", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({
        appName: this.appName,
        userId,
        sessionId,
        newMessage: { role: "user", parts: [{ text }] },
        streaming: true,
      }),
      signal,
    });
    if (res.status === 404) throw Object.assign(new Error("Sessão não encontrada"), { code: 404 });
    if (!res.ok || !res.body) throw new Error(`Erro do servidor (${res.status})`);

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const chunks = buffer.split(/\r?\n\r?\n/);
      buffer = chunks.pop();
      for (const chunk of chunks) {
        const data = chunk
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data) continue;
        const event = JSON.parse(data);
        if (event.error) throw new Error(event.error);
        yield event;
      }
    }
  }
}
