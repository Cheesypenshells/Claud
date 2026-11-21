import { canListen, canSpeak, listen, stopListening, speak, stopSpeaking } from "./voice.js";
import { createRobot } from "./robot.js";

const $ = (id) => document.getElementById(id);
const state = {
  tutor: "conversation", history: [], busy: false, config: null,
  voiceMode: false, listening: false, micLang: "target", // "target" | "id"
};

const lang = () => $("language").value;
const rate = () => Number($("rate").value);
const setStatus = (t) => ($("status").textContent = t);
const robot = createRobot({ onMic: robotMic, onClose: closeRobot });
// Suara aktif jika Mode Suara dicentang atau sedang di Mode Robot
const voiceOn = () => state.voiceMode || robot.isOpen;

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

// ---------- Pesan ----------
function setBubbleText(el, text) {
  el.dataset.raw = text;
  el.querySelector(".body").innerHTML = renderMarkdown(text);
}

/** speechLang: bahasa untuk dibacakan ("id" untuk sapaan, null = tidak ada tombol suara) */
function addMessage(role, text, speechLang = null) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.innerHTML = `<div class="body"></div>`;
  setBubbleText(el, text);
  if (role.startsWith("assistant") && canSpeak) {
    const btn = document.createElement("button");
    btn.className = "speak-btn";
    btn.title = "Dengarkan";
    btn.textContent = "🔊";
    btn.onclick = () => playBubble(el, speechLang ?? lang());
    el.append(btn);
  }
  $("messages").append(el);
  scrollDown();
  return el;
}
const scrollDown = () => ($("messages").scrollTop = $("messages").scrollHeight);

async function playBubble(el, speechLang) {
  const btn = el.querySelector(".speak-btn");
  const wasPlaying = btn?.classList.contains("playing");
  stopAll();
  if (wasPlaying) return;
  btn?.classList.add("playing");
  setStatus("🔊 AI berbicara…");
  robot.phase("speaking");
  await speak(el.dataset.raw, speechLang, rate(), (part) => robot.captionAI(part));
  btn?.classList.remove("playing");
  setStatus("");
  if (robot.isOpen) robot.phase("idle");
}

function stopAll() {
  stopSpeaking();
  stopListening();
  document.querySelectorAll(".speak-btn.playing").forEach((b) => b.classList.remove("playing"));
  setStatus("");
  if (robot.isOpen) robot.phase("idle");
}

function resetChat() {
  stopAll();
  state.history = [];
  $("messages").innerHTML = "";
  const t = state.config.tutors[state.tutor];
  $("chat-title").textContent = `${t.name} · ${state.config.languages[lang()]}`;
  updateMicLangLabel();
  const greet = addMessage("assistant", t.greeting, "id");
  if (state.voiceMode && !robot.isOpen) playBubble(greet, "id");
}

// ---------- Kirim ke AI ----------
async function send(text) {
  stopAll();
  state.busy = true;
  setControlsDisabled(true);
  addMessage("user", text);
  state.history.push({ role: "user", content: text });
  const bubble = addMessage("assistant typing", "");
  let reply = "";
  setStatus("✍️ AI sedang menjawab…");
  robot.captionUser(text);
  robot.captionAI("");
  robot.phase("thinking");

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tutor: state.tutor, language: lang(), level: $("level").value,
        voice: voiceOn(),
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
          setBubbleText(bubble, reply);
          scrollDown();
        } else if (event === "error") {
          throw new Error(data.error);
        }
      }
    }
    if (!reply.trim()) throw new Error("Tidak ada balasan dari AI.");
    state.history.push({ role: "assistant", content: reply });
  } catch (e) {
    if (reply.trim()) {
      state.history.push({ role: "assistant", content: reply });
    } else {
      bubble.remove();
      state.history.pop(); // buang pesan user yang gagal agar urutan tetap user/assistant
    }
    addMessage("error", `⚠️ ${e.message}`);
    if (robot.isOpen) robot.phase("idle", `⚠️ ${e.message}`);
    reply = "";
  } finally {
    bubble.classList.remove("typing");
    state.busy = false;
    setControlsDisabled(false);
    setStatus("");
    if (robot.isOpen && reply) robot.phase("idle");
  }

  // Mode suara: bacakan balasan, lalu otomatis dengarkan lagi (ngobrol tanpa tangan)
  if (voiceOn() && reply) {
    await playBubble(bubble, lang());
    if (voiceOn() && !state.busy && !state.listening) startListening({ auto: true });
  } else {
    $("input").focus();
  }
}

function setControlsDisabled(d) {
  $("send").disabled = d;
  $("mic").disabled = d || !canListen;
}

// ---------- Mikrofon ----------
function updateMicLangLabel() {
  $("mic-lang").textContent = state.micLang === "id" ? "ID" : lang().toUpperCase();
  $("mic-lang").title = state.micLang === "id"
    ? "Kamu bicara dalam Bahasa Indonesia (klik untuk ganti)"
    : `Kamu bicara dalam ${state.config.languages[lang()]} (klik untuk ganti)`;
}

async function startListening({ auto = false } = {}) {
  if (!canListen || state.busy) return;
  if (state.listening) return stopListening(); // klik kedua = berhenti
  stopSpeaking();
  state.listening = true;
  $("mic").classList.add("listening");
  setStatus("🎙️ Mendengarkan… silakan bicara");
  robot.phase("listening");
  robot.captionUser("");
  const before = $("input").value;
  try {
    const text = await listen(state.micLang === "id" ? "id" : lang(), (t) => {
      $("input").value = (before ? before + " " : "") + t;
      robot.captionUser(t);
    });
    const full = $("input").value.trim();
    if (!text) {
      $("input").value = before;
      setStatus(auto ? "Tekan 🎤 untuk bicara lagi" : "Tidak ada suara terdengar");
      if (robot.isOpen) robot.phase("idle", "Tidak ada suara terdengar. Tekan 🎤 untuk bicara.");
      return;
    }
    setStatus("");
    if (voiceOn() && full) {
      $("input").value = "";
      send(full);
    } else {
      $("input").focus(); // mode biasa: periksa/edit teks dulu, lalu tekan Kirim
    }
  } catch (e) {
    $("input").value = before;
    setStatus("");
    addMessage("error", `⚠️ ${e.message}`);
    if (robot.isOpen) robot.phase("idle", `⚠️ ${e.message}`);
  } finally {
    state.listening = false;
    $("mic").classList.remove("listening");
  }
}

// ---------- Mode Robot ----------
async function openRobot() {
  if (state.busy) return;
  stopAll();
  robot.open(`${state.config.tutors[state.tutor].name} · ${state.config.languages[lang()]}`);
  if (!canListen) {
    robot.phase("idle", "⚠️ Mikrofon belum didukung browser ini. Pakai Chrome, Edge, atau Safari.");
    return;
  }
  // Robot menyapa dulu, lalu mulai mendengarkan
  robot.phase("speaking");
  robot.captionAI("Halo! Aku Cheesy-Bot, tutor bahasamu dari Cheesy Pen Shells. Silakan bicara!");
  await speak("💬 Halo! Aku Cheesy-Bot, tutor bahasamu dari Cheesy Pen Shells. Silakan bicara!", lang(), rate());
  if (robot.isOpen && !state.listening && !state.busy) startListening({ auto: true });
}

function closeRobot() {
  stopAll();
  robot.close();
  $("input").value = "";
}

function robotMic() {
  if (state.busy) return;
  if (state.listening) return stopListening(); // tekan lagi = selesai bicara
  stopSpeaking(); // potong robot yang sedang bicara
  startListening();
}

// ---------- Inisialisasi ----------
async function init() {
  state.config = await (await fetch("/api/config")).json();
  for (const [id, name] of Object.entries(state.config.languages)) {
    $("language").append(new Option(name, id));
  }
  for (const [i, [id, t]] of Object.entries(state.config.tutors).entries()) {
    const b = document.createElement("button");
    b.dataset.kode = String(i + 1).padStart(2, "0");
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

  // Suara
  $("robot-open").onclick = openRobot;
  $("mic").onclick = () => startListening();
  $("mic-lang").onclick = () => {
    state.micLang = state.micLang === "id" ? "target" : "id";
    updateMicLangLabel();
  };
  $("voice-mode").onchange = (e) => {
    state.voiceMode = e.target.checked;
    stopAll();
    if (state.voiceMode && canListen && !state.busy) startListening({ auto: true });
  };
  if (!canListen) {
    $("mic").disabled = true;
    $("mic").title = "Input suara belum didukung browser ini (pakai Chrome/Edge/Safari)";
    $("voice-hint").textContent = "⚠️ Browser ini belum mendukung mikrofon. Pakai Chrome, Edge, atau Safari agar bisa bicara.";
  } else {
    $("voice-hint").textContent = "Aktifkan Mode Suara: kamu bicara → AI menjawab dengan suara → mikrofon menyala lagi otomatis.";
  }
  if (!canSpeak) $("voice-mode").disabled = true;

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
