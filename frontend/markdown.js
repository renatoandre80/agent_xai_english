// Renderizador de Markdown pequeno e seguro (escapa todo HTML antes de formatar).

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PT_CHARS = /[áàâãéêíóôõúç]/i;

function inline(text) {
  return text
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, (_, inner) => {
      const plain = inner.replace(/<[^>]+>/g, "").replace(/&quot;|&#39;/g, "").trim();
      // Palavras em negrito que parecem inglês ficam clicáveis para ouvir a pronúncia.
      return PT_CHARS.test(plain) || !/[a-z]/i.test(plain)
        ? `<strong>${inner}</strong>`
        : `<strong class="say" data-say="${plain}" title="Ouvir pronúncia">${inner}</strong>`;
    })
    .replace(/(^|[^*\w])\*(?!\s)([^*]+?)\*(?!\w)/g, "$1<em>$2</em>")
    .replace(/(^|\s)_([^_]+)_(?=\s|$|[.,!?])/g, "$1<em>$2</em>");
}

function renderTable(lines) {
  const rows = lines
    .filter((l) => !/^\s*\|?\s*:?-{2,}/.test(l))
    .map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => inline(c.trim())));
  const [head, ...body] = rows;
  return `<table><thead><tr>${head.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${body
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

export function renderMarkdown(source) {
  const lines = escapeHtml(source || "").split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (/^\s*\|.*\|\s*$/.test(line)) {
      const block = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) block.push(lines[i++]);
      out.push(renderTable(block));
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      out.push(`<h4>${inline(heading[2])}</h4>`);
      i++;
      continue;
    }
    if (/^\s*([-*•])\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*([-*•])\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*•]\s+/, ""));
      out.push(`<ul>${items.map((it) => `<li>${inline(it)}</li>`).join("")}</ul>`);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ""));
      out.push(`<ol>${items.map((it) => `<li>${inline(it)}</li>`).join("")}</ol>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(\s*[-*•]\s+|\s*\d+[.)]\s+|#{1,4}\s|\s*\|)/.test(lines[i])) {
      para.push(lines[i++]);
    }
    if (!para.length) para.push(lines[i++]);
    out.push(`<p>${para.map(inline).join("<br>")}</p>`);
  }
  return out.join("");
}
