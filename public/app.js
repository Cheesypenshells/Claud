import { canListen, canSpeak, listen, stopListening, speak, stopSpeaking, createSpeechQueue } from "./voice.js";
import { createRobot } from "./robot.js";
import { createDating } from "./dating.js";
import { createIelts } from "./ielts.js";

const $ = (id) => document.getElementById(id);

// Semua panggilan API: kalau sesi habis (401), arahkan ke halaman masuk.
const rawFetch = window.fetch.bind(window);
const fetch = async (...args) => {
  const res = await rawFetch(...args);
  if (res.status === 401) {
    location.replace("/login.html");
    throw new Error("Sesi berakhir, silakan masuk lagi.");
  }
  return res;
};
const state = {
  tutor: "conversation", mode: "chat", busy: false, config: null,
  voiceMode: false, listening: false, micLang: "target", // "target" | "id"
  loadToken: 0, condition: null, coords: null,
};
const greeted = new Set(); // percakapan yang sudah disapa proaktif di sesi ini

// ---------- Konteks pengguna (jam, kondisi, lokasi/cuaca) ----------
const CONDITIONS = [["semangat", "😊 Semangat"], ["capek", "😴 Capek"], ["ngantuk", "🥱 Ngantuk"], ["sedih", "😢 Sedih"], ["stres", "😤 Stres"],
  ["lapar", "🍜 Lapar"], ["sakit", "🤒 Sakit"], ["kerja", "💼 Lagi kerja"], ["dijalan", "🚌 Di jalan"], ["santai", "🛋️ Santai"]];
function getCtx() {
  let tz = "Asia/Jakarta";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch {}
  return { tz, condition: state.condition, ...(state.coords ?? {}) };
}
function saveCtxPrefs() {
  try { localStorage.setItem(`cps-ctx-${state.user?.id}`, JSON.stringify({ condition: state.condition, coords: state.coords })); } catch {}
}
function setupContextUI() {
  try {
    const saved = JSON.parse(localStorage.getItem(`cps-ctx-${state.user?.id}`) || "{}");
    state.condition = saved.condition ?? null;
    state.coords = saved.coords ?? null;
  } catch {}
  const bar = $("condition-bar");
  for (const [id, label] of CONDITIONS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cond" + (state.condition === id ? " on" : "");
    b.textContent = label;
    b.onclick = () => {
      state.condition = state.condition === id ? null : id;
      bar.querySelectorAll(".cond").forEach((x) => x.classList.toggle("on", x === b && !!state.condition));
      saveCtxPrefs();
      if (state.condition) toast(`Oke, Cheesy-Bot & karakter tahu kamu lagi ${label.slice(2).trim().toLowerCase()}.`);
    };
    bar.append(b);
  }
  const loc = $("use-location");
  loc.checked = !!state.coords;
  loc.onchange = () => {
    if (!loc.checked) { state.coords = null; saveCtxPrefs(); return; }
    if (!navigator.geolocation) { loc.checked = false; toast("Browser ini tidak mendukung lokasi."); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        state.coords = { lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100 };
        saveCtxPrefs();
        toast("📍 Cuaca lokal aktif.");
      },
      () => { loc.checked = false; toast("Izin lokasi ditolak — cuaca lokal tidak dipakai."); },
      { maximumAge: 30 * 60e3, timeout: 10e3 },
    );
  };
}

const lang = () => $("language").value;
// Bahasa Inggris: suara & mikrofon mengikuti varian/aksen yang dipilih (mis. en-GB, en-NG, en-AU)
const variety = () => (state.config?.varieties?.[$("variety").value] ? $("variety").value : "us");
const ttsLang = () => (lang() === "en" ? state.config?.varieties?.[variety()]?.tts ?? "en-US" : lang());
const sttLang = () => (lang() === "en" ? state.config?.varieties?.[variety()]?.stt ?? "en-US" : lang());
const rate = () => Number($("rate").value);
const setStatus = (t) => ($("status").textContent = t);
const robot = createRobot({ onMic: robotMic, onClose: closeRobot });
// Suara aktif jika Mode Suara dicentang atau sedang di Mode Robot
const voiceOn = () => state.voiceMode || robot.isOpen;
const dating = createDating({
  $, fetch, escapeHtml, toast, speak, setStatus, voiceOn,
  scrollDown: () => scrollDown(), stopAll: () => stopAll(),
  addMessage: (r, t) => addMessage(r, t), setControlsDisabled: (d) => setControlsDisabled(d),
  startListening: (o) => startListening(o), refreshSkills: (o) => refreshSkills(o), refreshMemory: () => refreshMemory(),
  lang: () => lang(), rate: () => rate(), getLevel: () => $("level").value, getCtx: () => getCtx(),
  setLanguage: (l) => { $("language").value = l; savePrefs(); updateMicLangLabel(); refreshSkills(); },
});
const ielts = createIelts({
  $, fetch, escapeHtml, toast, setStatus,
  scrollDown: () => scrollDown(), stopAll: () => stopAll(), addMessage: (r, t) => addMessage(r, t),
  setControlsDisabled: (d) => setControlsDisabled(d), rate: () => rate(),
  refreshSkills: (o) => refreshSkills(o), refreshMemory: () => refreshMemory(),
  varieties: () => state.config?.varieties ?? {},
});
const anyBusy = () => state.busy || dating.busy || ielts.busy;

// Pilihan disimpan di browser (opsional; aman bila storage tidak tersedia)
const PREFS = ["language", "variety", "level", "style", "rate"];
function savePrefs() {
  try {
    localStorage.setItem(`cps-prefs-${state.user?.id}`, JSON.stringify({
      tutor: state.tutor, ...Object.fromEntries(PREFS.map((k) => [k, $(k).value])),
    }));
  } catch {}
}
function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(`cps-prefs-${state.user?.id}`) || "{}"); } catch { return {}; }
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
    btn.onclick = () => playBubble(el, speechLang ?? ttsLang());
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
  if (state.mode === "date") return dating.showPicker();
  if (state.mode === "ielts") return ielts.show();
  stopAll();
  const token = ++state.loadToken;
  const t = state.config.tutors[state.tutor];
  $("chat-title").textContent = `${t.name} · ${state.config.languages[lang()]}`;
  updateMicLangLabel();
  savePrefs();
  refreshSkills();
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
  const key = `${state.tutor}:${lang()}`;
  const lastTs = messages.at(-1)?.ts;
  const away = !lastTs || Date.now() - new Date(lastTs).getTime() > 3 * 3600e3;
  if (away && !greeted.has(key)) {
    // Sapa duluan: baru pertama kali, atau sudah lama tidak ngobrol
    greeted.add(key);
    if (messages.length) renderHistory(messages);
    send(null, { proactive: true });
    return;
  }
  if (!messages.length) {
    const greet = addMessage("assistant", t.greeting, "id");
    if (state.voiceMode && !robot.isOpen) playBubble(greet, "id");
  } else {
    renderHistory(messages);
  }
}

function renderHistory(messages) {
  const older = document.createElement("div");
  older.className = "msg error";
  older.style.color = "var(--redup)";
  older.textContent = `— ${messages.filter((m) => m.role === "user" && !m.hidden).length} obrolan sebelumnya —`;
  $("messages").append(older);
  for (const m of messages) if (!m.hidden) addMessage(m.role, m.content);
}

// ---------- Kirim ke AI ----------
async function send(text, { proactive = false } = {}) {
  if (state.mode === "ielts") return ielts.send(text);
  if (state.mode === "date") {
    if (!dating.active) toast("Pilih gebetan dulu 😉");
    else dating.send(text);
    return;
  }
  stopAll();
  state.busy = true;
  setControlsDisabled(true);
  if (!proactive) addMessage("user", text);
  const bubble = addMessage("assistant typing", "");
  let reply = "";
  setStatus(proactive ? "👋 Cheesy-Bot nyapa kamu…" : "✍️ AI sedang menjawab…");
  // Mode suara: bacakan per kalimat begitu selesai ditulis (tidak menunggu seluruh balasan)
  const queue = voiceOn() ? createSpeechQueue(ttsLang(), rate(), (part) => { robot.captionAI(part); robot.phase("speaking"); }) : null;
  robot.captionUser(text ?? "");
  robot.captionAI("");
  robot.phase("thinking");

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tutor: state.tutor, language: lang(), level: $("level").value, style: $("style").value,
        voice: voiceOn(), message: text ?? undefined, proactive, ctx: getCtx(), ...(lang() === "en" ? { variety: variety() } : {}),
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
          queue?.push(data.text);
          scrollDown();
        } else if (event === "error") {
          throw new Error(data.error);
        }
      }
    }
    if (!reply.trim()) throw new Error("Tidak ada balasan dari AI.");
  } catch (e) {
    if (!reply.trim()) bubble.remove();
    if (proactive && !reply.trim()) {
      addMessage("assistant", state.config.tutors[state.tutor].greeting, "id"); // sapaan cadangan
    } else addMessage("error", `⚠️ ${e.message}`);
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
    refreshSkills({ announce: true });
    for (const ms of [20000, 45000]) setTimeout(() => refreshSkills({ announce: true }), ms); // penilaian berjalan di latar belakang
  }

  // Mode suara: bacakan balasan, lalu otomatis dengarkan lagi (ngobrol tanpa tangan)
  if (queue && reply) {
    setStatus("🔊 AI berbicara…");
    robot.phase("speaking");
    await queue.end();
    setStatus("");
    if (robot.isOpen) robot.phase("idle");
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
    <div>${(p.name || state.user?.name) ? `Halo, <b>${escapeHtml(p.name || state.user.name)}</b>! ` : ""}Sikap belajar: <span class="badge ${escapeHtml(p.attitude?.mode)}">${MODE_LABEL[p.attitude?.mode] ?? "-"}</span></div>
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
  if (!confirm("Hapus SEMUA ingatan dan riwayat chat akun ini di semua tutor & bahasa? Ini tidak bisa dibatalkan.")) return;
  await fetch("/api/memory", { method: "DELETE" });
  await refreshMemory();
  await loadChat();
}

// ---------- Level & peringkat (CEFR) ----------
const lastLevel = {}; // bahasa -> level terakhir yang diketahui (untuk notifikasi naik level)
const levelIdx = (lv, levels) => levels.indexOf(lv);
const scalePct = (lv, score, levels) => Math.min(100, ((levelIdx(lv, levels) + score / 100) / levels.length) * 100);

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 6000);
}

async function fetchSkills(langId = lang()) {
  try { return await (await fetch(`/api/skills?language=${langId}`)).json(); } catch { return null; }
}

function skillRowsHtml(a, sk) {
  return Object.entries(sk.skillNames).map(([k, label]) => {
    const v = a.skills[k];
    return `<div class="skill-row"><span>${escapeHtml(label)}</span>
      <div class="meter navy"><i style="width:${scalePct(v.level, v.score, sk.levels)}%"></i></div>
      <span class="cefr sm">${escapeHtml(v.level)}</span></div>`;
  }).join("");
}

async function refreshSkills({ announce = false } = {}) {
  const langId = lang();
  const sk = await fetchSkills(langId);
  if (!sk || langId !== lang()) return;
  const el = $("skill-card");
  const a = sk.current;
  if (!a) {
    el.innerHTML = `<div class="rank-line"><span class="rank-title">Belum dinilai</span><span class="cefr">?</span></div>
      <p class="hint">Ngobrol ${sk.nextIn} pesan lagi dalam ${escapeHtml(state.config.languages[langId])} — Cheesy-Bot akan menilai levelmu pakai standar <b>CEFR</b> (A1–C2).</p>
      <div class="xp">XP ${sk.xp}</div>`;
    lastLevel[langId] ??= null;
    return;
  }
  const next = sk.levels[levelIdx(a.overall, sk.levels) + 1];
  el.innerHTML = `
    <div class="rank-line"><span class="rank-title">${escapeHtml(sk.ranks[a.overall])}</span><span class="cefr">${escapeHtml(a.overall)}</span></div>
    <div class="meter"><i style="width:${a.overall_score}%"></i></div>
    <div class="meter-label"><span>${a.overall_score}% ${next ? `menuju ${next}` : "level tertinggi"}</span><span>XP ${sk.xp}</span></div>
    <div class="skill-rows">${skillRowsHtml(a, sk)}</div>
    <div class="scale"><span>Pre-A1</span><span>A1</span><span>A2</span><span>B1</span><span>B2</span><span>C1</span><span>C2</span></div>
    <p class="hint">Dinilai ulang dalam ${sk.nextIn} obrolan lagi.</p>`;
  const prev = lastLevel[langId];
  if (announce && prev !== undefined) {
    if (prev === null) toast(`📊 Penilaian pertama selesai: kamu ${a.overall} — ${sk.ranks[a.overall]}!`);
    else if (levelIdx(a.overall, sk.levels) > levelIdx(prev, sk.levels)) toast(`🎉 NAIK LEVEL! ${prev} → ${a.overall} · ${sk.ranks[a.overall]} (+100 XP)`);
    else if (levelIdx(a.overall, sk.levels) < levelIdx(prev, sk.levels)) toast(`😬 Turun ke ${a.overall}… Cheesy-Bot kecewa. Ayo serius lagi!`);
  }
  lastLevel[langId] = a.overall;
}

async function showReport() {
  const sk = await fetchSkills();
  const a = sk?.current;
  $("skill-dialog-title").textContent = `Rapor CEFR · ${state.config.languages[lang()]}`;
  const ul = (x) => (x?.length ? `<ul>${x.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>` : `<p class="muted">—</p>`);
  $("skill-body").innerHTML = !a
    ? `<p>Belum ada penilaian untuk bahasa ini. Kamu sudah menulis <b>${sk?.samples ?? 0}</b> pesan; butuh minimal ${(sk?.samples ?? 0) + (sk?.nextIn ?? 0)} pesan.</p>
       <p class="muted">Penilaian memakai standar <b>CEFR</b> (Common European Framework of Reference for Languages) — standar internasional A1–C2 yang menjadi acuan IELTS, TOEFL, DELF, Goethe, DELE, dan lainnya.</p>
       <div class="actions"><button class="btn-utama" id="assess-now" type="button">⚡ Nilai sekarang</button></div>`
    : `
      <div class="rapor-head"><span class="cefr">${escapeHtml(a.overall)}</span>
        <div><b>${escapeHtml(sk.ranks[a.overall])}</b><small>${a.overall_score}% menuju level berikutnya · XP ${sk.xp} · dari ${a.samples} pesan</small></div></div>
      <div class="quote">🤖 ${escapeHtml(a.summary)}</div>
      ${a.enough_evidence ? "" : `<p class="muted">⚠️ Datanya masih sedikit — nilai ini perkiraan. Tulis lebih banyak dalam bahasa target biar akurat.</p>`}
      <h3>5 aspek CEFR</h3>
      ${Object.entries(sk.skillNames).map(([k, label]) => {
        const v = a.skills[k];
        return `<div class="sk"><div class="sk-top"><span>${escapeHtml(label)}</span><span class="cefr sm">${escapeHtml(v.level)}</span></div>
          <div class="meter navy"><i style="width:${scalePct(v.level, v.score, sk.levels)}%"></i></div>
          <p class="ev">${escapeHtml(v.evidence)}</p></div>`;
      }).join("")}
      <h3>💪 Kekuatan</h3>${ul(a.strengths)}
      <h3>🩹 Kelemahan</h3>${ul(a.weaknesses)}
      <h3>🎯 Fokus berikutnya</h3>${ul(a.next_focus)}
      <h3>📈 Riwayat level</h3>
      <div class="hist">${sk.history.map((h) => `<span>${new Date(h.ts).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} · ${escapeHtml(h.overall)}</span>`).join("")}</div>
      <p class="muted">Standar: <b>CEFR</b> (Dewan Eropa) — acuan IELTS, TOEFL, DELF, Goethe, DELE, dll. Aspek: Range, Accuracy, Fluency, Interaction, Coherence.
        Pengucapan belum dinilai karena yang dibaca hanya teks/transkrip. Dinilai: ${new Date(a.ts).toLocaleString("id-ID")}.</p>
      <div class="actions"><button class="btn-utama" id="assess-now" type="button">⚡ Nilai ulang sekarang</button></div>`;
  $("assess-now").onclick = assessNow;
  if (!$("skill-dialog").open) $("skill-dialog").showModal();
}

async function assessNow() {
  const btn = $("assess-now");
  btn.disabled = true;
  btn.textContent = "⟳ Cheesy-Bot sedang menilai… (bisa ±30 detik)";
  try {
    const res = await fetch(`/api/assess?language=${lang()}`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    await refreshSkills({ announce: true });
    await showReport();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = "⚡ Coba lagi";
    toast(`⚠️ ${e.message}`);
  }
}

async function showBoard() {
  let data;
  try { data = await (await fetch(`/api/leaderboard?language=${lang()}`)).json(); } catch { return; }
  $("skill-dialog-title").textContent = `Peringkat · ${state.config.languages[lang()]}`;
  $("skill-body").innerHTML = !data.rows.length
    ? `<p>Belum ada yang belajar bahasa ini. Jadilah yang pertama! 🦪</p>`
    : `<table class="board"><thead><tr><th>#</th><th>Nama</th><th>Level</th><th>XP</th></tr></thead><tbody>
        ${data.rows.map((r) => `<tr class="${r.me ? "me" : ""}"><td class="pos">${r.pos}</td>
          <td>${escapeHtml(r.name)}${r.me ? " (kamu)" : ""}<br><span class="muted">${escapeHtml(r.rank)}</span></td>
          <td>${r.level ? `<span class="cefr sm">${escapeHtml(r.level)}</span> ${r.score}%` : "—"}</td><td>${r.xp}</td></tr>`).join("")}
       </tbody></table>
       ${data.mine && data.mine.pos > 20 ? `<p class="muted">Posisimu: #${data.mine.pos} dari ${data.total}.</p>` : ""}
       <p class="muted">Urutan: level CEFR → progress dalam level → XP. Yang tampil hanya nama panggilan.</p>`;
  if (!$("skill-dialog").open) $("skill-dialog").showModal();
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
    const text = await listen(state.micLang === "id" ? "id" : sttLang(), (t) => {
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
  const nama = p?.name || state.user?.name;
  const hi = nama ? `Eh, ${nama}! Cheesy-Bot siap. Ayo ngobrol!` : "Halo! Aku Cheesy-Bot, tutor bahasamu dari Cheesy Pen Shells. Silakan bicara!";
  robot.phase("speaking");
  robot.captionAI(hi);
  await speak("💬 " + hi, ttsLang(), rate());
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
  let me;
  try {
    me = await fetch("/api/me");
  } catch {
    return; // diarahkan ke halaman masuk
  }
  state.user = (await me.json()).user;
  $("user-name").textContent = `👤 ${state.user.name}`;
  $("logout").onclick = async () => {
    stopAll();
    await rawFetch("/api/logout", { method: "POST" });
    location.replace("/login.html");
  };
  state.config = await (await fetch("/api/config")).json();
  for (const [id, name] of Object.entries(state.config.languages)) {
    $("language").append(new Option(name, id));
  }
  for (const [id, v] of Object.entries(state.config.varieties ?? {})) $("variety").append(new Option(`${v.flag} ${v.label}`, id));
  const showVariety = () => { $("variety-field").hidden = lang() !== "en"; };
  const prefs = loadPrefs();
  for (const k of PREFS) if (prefs[k] != null && [...($(k).options ?? [{ value: prefs[k] }])].some((o) => o.value === prefs[k])) $(k).value = prefs[k];
  if (state.config.tutors[prefs.tutor]) state.tutor = prefs.tutor;

  const leaveDateMode = () => {
    state.mode = "chat";
    document.body.classList.remove("date-picking", "date-playing", "ielts-on");
    $("date-stage").hidden = true;
    ielts.hide();
    $("date-mode").classList.remove("active");
    $("ielts-mode").classList.remove("active");
  };
  $("ielts-mode").onclick = () => {
    if (anyBusy()) return;
    leaveDateMode();
    state.mode = "ielts";
    document.body.classList.add("ielts-on");
    document.querySelectorAll(".tutor-btn").forEach((x) => x.classList.toggle("active", x.id === "ielts-mode"));
    ielts.show();
  };
  $("date-mode").onclick = () => {
    if (anyBusy()) return;
    leaveDateMode();
    state.mode = "date";
    document.querySelectorAll(".tutor-btn").forEach((x) => x.classList.toggle("active", x.id === "date-mode"));
    dating.showPicker();
  };
  for (const [i, [id, t]] of Object.entries(state.config.tutors).entries()) {
    const b = document.createElement("button");
    b.dataset.kode = String(i + 1).padStart(2, "0");
    b.className = "tutor-btn" + (id === state.tutor ? " active" : "");
    b.textContent = t.name;
    b.onclick = () => {
      if (anyBusy()) return;
      leaveDateMode();
      state.tutor = id;
      document.querySelectorAll(".tutor-btn").forEach((x) => x.classList.toggle("active", x === b));
      loadChat();
    };
    $("tutors").append(b);
  }
  showVariety();
  $("language").onchange = () => { showVariety(); if (!anyBusy() && state.mode !== "ielts") loadChat(); };
  $("variety").onchange = () => {
    savePrefs();
    const v = state.config.varieties[variety()];
    toast(`${v.flag} Sekarang Cheesy-Bot pakai bahasa Inggris ${v.label}. Suara: ${v.tts} (tergantung suara yang terpasang di perangkatmu).`);
  };
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
  $("report-view").onclick = showReport;
  $("board-view").onclick = showBoard;
  $("skill-close").onclick = () => $("skill-dialog").close();

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
    if (!text || anyBusy()) return;
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
  setupContextUI();
  refreshMemory();
  loadChat();
}
init();
