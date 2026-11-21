import { canListen, canSpeak, listen, stopListening, speak, stopSpeaking } from "./voice.js";
import { createRobot } from "./robot.js";

const $ = (id) => document.getElementById(id);
const state = {
  tutor: "conversation", busy: false, config: null,
  voiceMode: false, listening: false, micLang: "target", // "target" | "id"
  loadToken: 0,
};

const lang = () => $("language").value;
const rate = () => Number($("rate").value);
const setStatus = (t) => ($("status").textContent = t);
const robot = createRobot({ onMic: robotMic, onClose: closeRobot });
// Suara aktif jika Mode Suara dicentang atau sedang di Mode Robot
const voiceOn = () => state.voiceMode || robot.isOpen;

// Pilihan disimpan di browser (opsional; aman bila storage tidak tersedia)
const PREFS = ["language", "level", "style", "rate"];
function savePrefs() {
  try {
    localStorage.setItem("cps-prefs", JSON.stringify({
      tutor: state.tutor, ...Object.fromEntries(PREFS.map((k) => [k, $(k).value])),
    }));
  } catch {}
}
function loadPrefs() {
  try { return JSON.parse(localStorage.getItem("cps-prefs") || "{}"); } catch { return {}; }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
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

/** speechLang: bahasa untuk dibacakan ("id" untuk sapaan) */
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

/** Muat riwayat percakapan tutor+bahasa ini dari server. */
async function loadChat() {
  stopAll();
  const token = ++state.loadToken;
  const t = state.config.tutors[state.tutor];
  $("chat-title").textContent = `${t.name} · ${state.config.languages[lang()]}`;
  updateMicLangLabel();
  savePrefs();
  $("messages").innerHTML = "";
  let messages = [];
  try {
    const res = await fetch(`/api/history?tutor=${state.tutor}&language=${lang()}`);
    messages = (await res.json()).messages ?? [];
  } catch {
    addMessage("error", "⚠️ Gagal memuat riwayat chat.");
  }
  if (token !== state.loadToken) return; // pengguna sudah pindah tutor/bahasa
  $("messages").innerHTML = "";
  if (!messages.length) {
    const greet = addMessage("assistant", t.greeting, "id");
    if (state.voiceMode && !robot.isOpen) playBubble(greet, "id");
  } else {
    const older = document.createElement("div");
    older.className = "msg error";
    older.style.color = "var(--redup)";
    older.textContent = `— ${messages.length / 2 | 0} obrolan sebelumnya —`;
    $("messages").append(older);
    for (const m of messages) addMessage(m.role, m.content);
  }
}

// ---------- Kirim ke AI ----------
async function send(text) {
  stopAll();
  state.busy = true;
  setControlsDisabled(true);
  addMessage("user", text);
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
        tutor: state.tutor, language: lang(), level: $("level").value, style: $("style").value,
        voice: voiceOn(), message: text,
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
  } catch (e) {
    if (!reply.trim()) bubble.remove();
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

  if (reply) {
    refreshMemory();
    setTimeout(refreshMemory, 25000); // ingatan diperbarui di latar belakang
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

// ---------- Ingatan ----------
const MODE_LABEL = { serius: "Serius 💪", santai: "Santai 😎", tidak_serius: "Kurang serius 😤", belum_jelas: "Belum kebaca 🤔" };

async function fetchMemory() {
  try { return (await (await fetch("/api/memory")).json()).profile; } catch { return null; }
}

async function refreshMemory() {
  const p = await fetchMemory();
  const el = $("memory-summary");
  if (!p) {
    el.textContent = "Belum ada ingatan. Ingatan mulai terbentuk setelah beberapa obrolan.";
    return;
  }
  const mistakes = p.languages?.reduce((n, l) => n + (l.recurring_mistakes?.length ?? 0), 0) ?? 0;
  const vocab = p.languages?.reduce((n, l) => n + (l.vocab_learned?.length ?? 0), 0) ?? 0;
  el.innerHTML = `
    <div>${p.name ? `Halo, <b>${escapeHtml(p.name)}</b>! ` : ""}Sikap belajar: <span class="badge ${escapeHtml(p.attitude?.mode)}">${MODE_LABEL[p.attitude?.mode] ?? "-"}</span></div>
    <div class="row"><span>Fakta tentangmu</span><b>${p.about?.length ?? 0}</b></div>
    <div class="row"><span>Kesalahan berulang</span><b>${mistakes}</b></div>
    <div class="row"><span>Kosakata dipelajari</span><b>${vocab}</b></div>`;
}

async function showMemory() {
  const p = await fetchMemory();
  const ul = (a) => (a?.length ? `<ul>${a.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : `<p class="muted">—</p>`);
  $("memory-body").innerHTML = !p
    ? `<p>Cheesy-Bot belum punya catatan tentang kamu. Ngobrol dulu beberapa kali — ingatan diperbarui otomatis setiap 3 obrolan.</p>`
    : `
      <p><b>Nama:</b> ${escapeHtml(p.name || "(belum tahu)")}</p>
      <p><b>Sikap belajar:</b> <span class="badge ${escapeHtml(p.attitude?.mode)}">${MODE_LABEL[p.attitude?.mode] ?? "-"}</span> <span class="muted">${escapeHtml(p.attitude?.evidence ?? "")}</span></p>
      <h3>Tentang kamu</h3>${ul(p.about)}
      <h3>Terakhir kali</h3><p>${escapeHtml(p.last_session_summary || "—")}</p>
      ${(p.languages ?? []).map((l) => `
        <h3>${escapeHtml(l.language)} · ${escapeHtml(l.level_estimate)}</h3>
        <p><b>Kesalahan berulang</b></p>${ul(l.recurring_mistakes)}
        <p><b>Sudah tidak salah lagi</b></p>${ul(l.fixed_mistakes)}
        <p><b>Kosakata</b></p><p>${escapeHtml(l.vocab_learned?.join(", ") || "—")}</p>
        <p><b>Topik</b></p><p>${escapeHtml(l.topics?.join(", ") || "—")}</p>`).join("")}
      <h3>Lelucon internal</h3>${ul(p.inside_jokes)}
      <p class="muted">Diperbarui: ${p.updated_at ? new Date(p.updated_at).toLocaleString("id-ID") : "-"}</p>`;
  $("memory-dialog").showModal();
}

async function wipeMemory() {
  if (state.busy) return;
  if (!confirm("Hapus SEMUA ingatan dan riwayat chat di semua tutor & bahasa? Ini tidak bisa dibatalkan.")) return;
  await fetch("/api/memory", { method: "DELETE" });
  await refreshMemory();
  await loadChat();
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
  // Robot menyapa dulu (pakai nama kalau sudah ingat), lalu mulai mendengarkan
  const p = await fetchMemory();
  const hi = p?.name ? `Eh, ${p.name}! Cheesy-Bot siap. Ayo ngobrol!` : "Halo! Aku Cheesy-Bot, tutor bahasamu dari Cheesy Pen Shells. Silakan bicara!";
  robot.phase("speaking");
  robot.captionAI(hi);
  await speak("💬 " + hi, lang(), rate());
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
  const prefs = loadPrefs();
  for (const k of PREFS) if (prefs[k] != null && [...($(k).options ?? [{ value: prefs[k] }])].some((o) => o.value === prefs[k])) $(k).value = prefs[k];
  if (state.config.tutors[prefs.tutor]) state.tutor = prefs.tutor;

  for (const [i, [id, t]] of Object.entries(state.config.tutors).entries()) {
    const b = document.createElement("button");
    b.dataset.kode = String(i + 1).padStart(2, "0");
    b.className = "tutor-btn" + (id === state.tutor ? " active" : "");
    b.textContent = t.name;
    b.onclick = () => {
      if (state.busy) return;
      state.tutor = id;
      document.querySelectorAll(".tutor-btn").forEach((x) => x.classList.toggle("active", x === b));
      loadChat();
    };
    $("tutors").append(b);
  }
  $("language").onchange = () => !state.busy && loadChat();
  $("level").onchange = savePrefs;
  $("style").onchange = savePrefs;
  $("rate").onchange = savePrefs;
  $("reset").onclick = async () => {
    if (state.busy) return;
    if (!confirm("Hapus riwayat chat tutor & bahasa ini? (Ingatan Cheesy-Bot tentang kamu tetap ada)")) return;
    await fetch(`/api/history?tutor=${state.tutor}&language=${lang()}`, { method: "DELETE" });
    loadChat();
  };
  $("memory-view").onclick = showMemory;
  $("memory-wipe").onclick = wipeMemory;
  $("memory-close").onclick = () => $("memory-dialog").close();

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
  refreshMemory();
  loadChat();
}
init();
