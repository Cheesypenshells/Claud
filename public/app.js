const $ = (id) => document.getElementById(id);
const state = { tutor: "conversation", history: [], busy: false, config: null };

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
// Markdown ringan: **tebal**, *miring*, `kode`
function renderMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function addMessage(role, text) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.innerHTML = renderMarkdown(text);
  $("messages").append(el);
  $("messages").scrollTop = $("messages").scrollHeight;
  return el;
}

function resetChat() {
  state.history = [];
  $("messages").innerHTML = "";
  const t = state.config.tutors[state.tutor];
  $("chat-title").textContent = `${t.name} · ${state.config.languages[$("language").value]}`;
  addMessage("assistant", t.greeting);
}

async function send(text) {
  state.busy = true;
  $("send").disabled = true;
  addMessage("user", text);
  state.history.push({ role: "user", content: text });
  const bubble = addMessage("assistant typing", "");
  let reply = "";

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tutor: state.tutor, language: $("language").value, level: $("level").value,
        messages: state.history.slice(-40),
      }),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? "Gagal menghubungi server");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const event = chunk.match(/^event: (.+)$/m)?.[1];
        const data = JSON.parse(chunk.match(/^data: (.+)$/m)?.[1] ?? "{}");
        if (event === "delta") {
          reply += data.text;
          bubble.innerHTML = renderMarkdown(reply);
          $("messages").scrollTop = $("messages").scrollHeight;
        } else if (event === "error") {
          throw new Error(data.error);
        }
      }
    }
    if (!reply.trim()) throw new Error("Tidak ada balasan dari AI.");
    state.history.push({ role: "assistant", content: reply });
  } catch (e) {
    if (!reply.trim()) bubble.remove();
    else state.history.push({ role: "assistant", content: reply });
    if (!reply.trim()) state.history.pop(); // buang pesan user yang gagal agar urutan tetap user/assistant
    addMessage("error", `⚠️ ${e.message}`);
  } finally {
    bubble.classList.remove("typing");
    state.busy = false;
    $("send").disabled = false;
    $("input").focus();
  }
}

async function init() {
  state.config = await (await fetch("/api/config")).json();
  for (const [id, name] of Object.entries(state.config.languages)) {
    $("language").append(new Option(name, id));
  }
  for (const [id, t] of Object.entries(state.config.tutors)) {
    const b = document.createElement("button");
    b.className = "tutor-btn" + (id === state.tutor ? " active" : "");
    b.textContent = t.name;
    b.onclick = () => {
      if (state.busy) return;
      state.tutor = id;
      document.querySelectorAll(".tutor-btn").forEach((x) => x.classList.toggle("active", x === b));
      resetChat();
    };
    $("tutors").append(b);
  }
  $("language").onchange = resetChat;
  $("level").onchange = resetChat;
  $("reset").onclick = () => !state.busy && resetChat();

  $("composer").onsubmit = (e) => {
    e.preventDefault();
    const text = $("input").value.trim();
    if (!text || state.busy) return;
    $("input").value = "";
    $("input").style.height = "auto";
    send(text);
  };
  $("input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("composer").requestSubmit(); }
  });
  $("input").addEventListener("input", (e) => {
    e.target.style.height = "auto";
    e.target.style.height = e.target.scrollHeight + "px";
  });
  resetChat();
}
init();
