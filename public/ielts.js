// 🎓 Mode IELTS Speaking: penguji AI "Sarah" (Part 1 → 2 → 3), timer Part 2, umpan balik band per jawaban & rapor.
import { canListen, listen, stopListening, createSpeechQueue, speak } from "./voice.js";

const PART_NAME = { 1: "Part 1 · Perkenalan & topik sehari-hari", 2: "Part 2 · Kartu topik (long turn)", 3: "Part 3 · Diskusi" };
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, "0")}`;
const bandClass = (b) => (b >= 7 ? "hi" : b >= 5.5 ? "mid" : "lo");

export function createIelts(ctx) {
  const { $, fetch, escapeHtml, scrollDown, toast, stopAll, setStatus, setControlsDisabled, rate, refreshSkills, refreshMemory } = ctx;
  const st = { session: null, history: [], busy: false, recording: false, timer: null, voice: true, autoRecord: true };
  const tts = () => ctx.varieties()[st.session?.variety ?? "gb"]?.tts ?? "en-GB";
  const stt = () => ctx.varieties()[st.session?.variety ?? "gb"]?.stt ?? "en-GB";

  const panel = () => $("ielts-panel");

  function addCard(html, cls) {
    const el = document.createElement("div");
    el.className = cls;
    el.innerHTML = html;
    $("messages").append(el);
    scrollDown();
    return el;
  }
  function examinerBubble(text = "") {
    const el = document.createElement("div");
    el.className = "msg assistant examiner-msg";
    el.innerHTML = `<div class="body"></div>`;
    el.querySelector(".body").textContent = text;
    const b = document.createElement("button");
    b.className = "speak-btn"; b.title = "Dengarkan"; b.textContent = "🔊";
    b.onclick = () => speak(el.querySelector(".body").textContent, tts(), rate());
    el.append(b);
    $("messages").append(el);
    return el;
  }

  // ---------- panel atas ----------
  function renderPanel() {
    const s = st.session;
    const p = panel();
    p.hidden = false;
    if (!s || s.status !== "active") {
      p.innerHTML = `<div class="ip-row"><b>🎓 IELTS Speaking</b><span class="ip-mode">pilih mode di bawah untuk mulai</span></div>`;
      return;
    }
    p.innerHTML = `
      <div class="ip-row">
        <b>🎓 IELTS Speaking</b><span class="ip-mode">${s.mode === "mock" ? "🧪 Simulasi ujian" : "🏋️ Latihan + umpan balik"} · penguji ${ctx.varieties()[s.variety ?? "gb"]?.flag ?? "🇬🇧"}</span>
        <label class="ip-toggle"><input type="checkbox" id="ip-voice" ${st.voice ? "checked" : ""}> 🔈 Suara penguji</label>
        <label class="ip-toggle"><input type="checkbox" id="ip-auto" ${st.autoRecord ? "checked" : ""}> 🎙️ Rekam otomatis</label>
        <button type="button" class="mini danger" id="ip-end">⏹ Akhiri & rapor</button>
      </div>
      <div class="ip-steps">${[1, 2, 3].map((n) => `<span class="${s.part === n ? "on" : s.part > n ? "done" : ""}">Part ${n}</span>`).join("")}</div>
      <div class="ip-now">${PART_NAME[s.part] ?? ""}</div>
      <div id="ip-cue"></div>
      <div class="ip-rec">
        <button type="button" id="ip-rec" class="rec-btn ${st.recording ? "on" : ""}" ${canListen ? "" : "disabled"}>${st.recording ? "⏺ Merekam… klik untuk selesai" : "🎤 Rekam jawaban"}</button>
        <span id="ip-timer" class="ip-timer"></span>
      </div>
      ${canListen ? "" : `<p class="hint">Mikrofon tidak didukung browser ini — ketik jawabanmu di bawah (Chrome/Edge untuk bicara).</p>`}`;
    $("ip-voice").onchange = (e) => (st.voice = e.target.checked);
    $("ip-auto").onchange = (e) => (st.autoRecord = e.target.checked);
    $("ip-end").onclick = endSession;
    $("ip-rec").onclick = () => (st.recording ? stopListening() : record());
    if (s.part === 2 && s.p2Stage === "card" && s.cue) showCue(s.cue, false);
  }

  function showCue(cue, startTimer) {
    const el = $("ip-cue");
    if (!el) return;
    el.innerHTML = `<div class="cue-card"><div class="cue-tag">CUE CARD</div><b>${escapeHtml(cue.topic)}</b>
      <p>You should say:</p><ul>${cue.points.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul><p>${escapeHtml(cue.final)}</p></div>`;
    if (startTimer) part2Timer();
  }

  // Part 2: 1 menit persiapan → 2 menit bicara
  function part2Timer() {
    clearInterval(st.timer);
    let left = 60;
    const tick = () => {
      const t = $("ip-timer");
      if (t) t.innerHTML = `📝 Persiapan: <b>${fmt(left)}</b> <button type="button" class="mini" id="ip-skip">Siap, mulai bicara</button>`;
      $("ip-skip") && ($("ip-skip").onclick = () => { left = 0; });
      if (left-- <= 0) {
        clearInterval(st.timer);
        toast("⏱️ Waktu persiapan habis — mulai bicara (1–2 menit)!");
        speakLongTurn();
      }
    };
    tick();
    st.timer = setInterval(tick, 1000);
  }
  function speakLongTurn() {
    let left = 120;
    const tick = () => {
      const t = $("ip-timer");
      if (t) t.innerHTML = `🗣️ Bicara: <b class="${left <= 20 ? "warn" : ""}">${fmt(left)}</b>${left > 60 ? " · usahakan lewat 1 menit" : ""}`;
      if (left-- <= 0) {
        clearInterval(st.timer);
        if (st.recording) stopListening();
        toast("⏱️ Waktu habis — terima kasih!");
      }
    };
    tick();
    st.timer = setInterval(tick, 1000);
    if (canListen) record({ longTurn: true });
  }

  // ---------- merekam jawaban (bisa panjang) ----------
  async function record() {
    if (st.recording || st.busy || !canListen) return;
    stopAll();
    st.recording = true;
    renderRecBtn();
    const before = $("input").value.trim();
    const t0 = performance.now();
    setStatus("🎙️ Merekam jawabanmu…");
    try {
      const text = await listen(stt(), (t) => { $("input").value = (before ? before + " " : "") + t; }, { continuous: true });
      const seconds = (performance.now() - t0) / 1000;
      const full = $("input").value.trim();
      if (!text && !before) { setStatus("Tidak ada suara terdengar"); return; }
      $("input").value = "";
      send(full, seconds);
    } catch (e) {
      toast(`⚠️ ${e.message}`);
    } finally {
      st.recording = false;
      renderRecBtn();
      setStatus("");
    }
  }
  function renderRecBtn() {
    const b = $("ip-rec");
    if (!b) return;
    b.classList.toggle("on", st.recording);
    b.textContent = st.recording ? "⏺ Merekam… klik untuk selesai" : "🎤 Rekam jawaban";
  }

  // ---------- giliran ----------
  async function send(text, seconds = null) {
    if (st.busy || !st.session || st.session.status !== "active") return;
    if (st.session.part === 2 && st.session.p2Stage === "card") clearInterval(st.timer);
    st.busy = true;
    setControlsDisabled(true);
    if (text) ctx.addMessage("user", text);
    const bubble = examinerBubble();
    bubble.classList.add("typing");
    setStatus("Sarah sedang bicara…");
    const queue = st.voice ? createSpeechQueue(tts(), rate()) : null;
    let said = "", done = null, report = null, cue = null;
    try {
      const res = await fetch("/api/ielts/turn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answer: text ?? undefined, seconds }) });
      if (!res.ok) throw new Error((await res.json()).error ?? "Gagal");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) !== -1) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = chunk.match(/^event: (.+)$/m)?.[1];
          const data = JSON.parse(chunk.match(/^data: (.+)$/m)?.[1] ?? "{}");
          if (ev === "delta") { said += data.text; bubble.querySelector(".body").textContent = said; queue?.push(data.text); scrollDown(); }
          else if (ev === "metrics" && text) renderMetrics(data);
          else if (ev === "cue") cue = data;
          else if (ev === "feedback") renderFeedback(data);
          else if (ev === "status") setStatus(data.text);
          else if (ev === "report") report = data;
          else if (ev === "error") throw new Error(data.error);
          else if (ev === "done") done = data;
        }
      }
      bubble.classList.remove("typing");
      if (!done) throw new Error("Koneksi terputus. Coba lagi.");
      Object.assign(st.session, done);
      renderPanel();
      if (cue) showCue(cue, false);
      if (report) renderReport(report);
      refreshSkills({ announce: true }); refreshMemory();
      st.busy = false;
      setControlsDisabled(false);
      setStatus("");
      if (queue) await queue.end();
      if (st.session.status !== "active") return;
      if (st.session.part === 2 && st.session.p2Stage === "card" && cue) part2Timer();
      else if (st.autoRecord && canListen) record();
    } catch (e) {
      bubble.remove();
      queue?.end();
      addCard(`⚠️ ${escapeHtml(e.message)}`, "msg error");
    } finally {
      st.busy = false;
      setControlsDisabled(false);
      setStatus("");
    }
  }

  function renderMetrics(m) {
    const last = [...$("messages").querySelectorAll(".msg.user")].at(-1);
    if (!last || last.querySelector(".metrics")) return;
    last.insertAdjacentHTML("beforeend", `<div class="metrics">${m.words} kata${m.seconds ? ` · ${m.seconds} dtk · ${m.wpm} kata/menit` : ""}${m.fillers ? ` · ${m.fillers} filler` : ""}</div>`);
  }

  function bandPill(label, b) { return `<span class="band ${bandClass(b)}"><i>${label}</i>${b.toFixed(1)}</span>`; }

  function renderFeedback(f) {
    const el = addCard(`
      <div class="tag">🧀 COACH CHEESY-BOT · PERKIRAAN BAND JAWABAN INI</div>
      <div class="bands">${bandPill("FC", f.fc)}${bandPill("LR", f.lr)}${bandPill("GRA", f.gra)}${bandPill("≈", f.band)}</div>
      <p>${escapeHtml(f.comment_id)}</p>
      ${f.corrections?.length ? `<ul class="fixes">${f.corrections.map((c) => `<li><s>${escapeHtml(c.wrong)}</s> → <b>${escapeHtml(c.right)}</b> <span>${escapeHtml(c.why_id)}</span></li>`).join("")}</ul>` : ""}
      <details open><summary>✨ Jawabanmu versi Band 8</summary><p class="better">${escapeHtml(f.better_answer)}</p><button type="button" class="mini" data-say>🔊 Dengarkan</button></details>
      ${f.useful_phrases?.length ? `<div class="phrases">${f.useful_phrases.map((p) => `<span><b>${escapeHtml(p.phrase)}</b> — ${escapeHtml(p.meaning_id)}</span>`).join("")}</div>` : ""}
      <p class="tip">💡 ${escapeHtml(f.tip_id)}</p>`, "msg ielts-fb");
    el.querySelector("[data-say]").onclick = () => speak(f.better_answer, tts(), rate());
  }

  function renderReport(r) {
    const crit = (k, name) => `<div class="sk"><div class="sk-top"><span>${name}</span>${bandPill("", r[k].band)}</div><p class="ev">${escapeHtml(r[k].comment_id)}</p></div>`;
    const ul = (a) => (a?.length ? `<ul>${a.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : "");
    const el = addCard(`
      <div class="rep-head"><div class="overall ${bandClass(r.overall)}">${r.overall.toFixed(1)}</div>
        <div><b>Perkiraan Band Speaking</b><span>dari ${r.answers} jawaban · dihitung dari FC, LR & GRA (pengucapan tidak dinilai dari teks)</span></div></div>
      <p class="quote">🤖 ${escapeHtml(r.summary_id)}</p>
      ${crit("fc", "Fluency & Coherence")}${crit("lr", "Lexical Resource")}${crit("gra", "Grammatical Range & Accuracy")}
      <div class="sk"><div class="sk-top"><span>Pronunciation</span><span class="band">—</span></div><p class="ev">${escapeHtml(r.pronunciation_note_id)}</p></div>
      <h3>💪 Kekuatan</h3>${ul(r.strengths)}<h3>🩹 Kelemahan</h3>${ul(r.weaknesses)}<h3>🗓️ Rencana latihan minggu ini</h3>${ul(r.plan)}
      ${r.upgrades?.length ? `<h3>✨ Upgrade jawaban</h3>${r.upgrades.map((u) => `<div class="sk"><p class="ev"><b>Q:</b> ${escapeHtml(u.question)}</p><p class="ev"><s>${escapeHtml(u.original)}</s></p><p><b>Band 8:</b> ${escapeHtml(u.better)}</p></div>`).join("")}` : ""}
      <p class="muted">Ini perkiraan latihan berdasarkan deskriptor band IELTS publik — bukan skor resmi.</p>
      <div class="end-actions"><button type="button" class="btn-utama" data-new>🔁 Sesi baru</button></div>`, "msg ielts-report");
    el.querySelector("[data-new]").onclick = () => showStart();
    toast(`🎓 Perkiraan band speaking: ${r.overall.toFixed(1)}`);
  }

  async function endSession() {
    if (st.busy) return;
    if (!confirm("Akhiri sesi sekarang dan lihat rapor?")) return;
    clearInterval(st.timer);
    stopListening();
    st.busy = true;
    setStatus("Menyusun rapor band…");
    try {
      const res = await fetch("/api/ielts/end", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      st.session = data.current;
      renderPanel();
      if (data.report) renderReport(data.report);
      else addCard("Sesi diakhiri. Belum ada jawaban untuk dinilai.", "msg error");
    } catch (e) {
      toast(`⚠️ ${e.message}`);
    } finally {
      st.busy = false;
      setStatus("");
    }
  }

  // ---------- layar mulai ----------
  function showStart() {
    clearInterval(st.timer);
    st.session = null;
    renderPanel();
    const hist = st.history.slice(-8).reverse();
    $("messages").innerHTML = "";
    const el = addCard(`
      <h2 class="judul"><span>IELTS Speaking</span></h2>
      <p>Latihan ngobrol bahasa Inggris dengan penguji AI <b>Sarah</b> yang natural & luwes, mengikuti format resmi IELTS:
        <b>Part 1</b> (pertanyaan sehari-hari), <b>Part 2</b> (kartu topik: 1 menit persiapan, bicara 1–2 menit), <b>Part 3</b> (diskusi lebih dalam).
        Jawab pakai <b>suara</b> (🎤, disarankan — jawaban panjang tetap terekam) atau ketik.</p>
      <div class="ielts-modes">
        <button type="button" class="mode-card" data-mode="practice"><b>🏋️ Latihan</b><span>Umpan balik setelah tiap jawaban: band per kriteria, koreksi, jawaban versi Band 8, frasa berguna.</span></button>
        <button type="button" class="mode-card" data-mode="mock"><b>🧪 Simulasi Ujian</b><span>Full test ±12 menit tanpa interupsi seperti ujian asli, rapor band lengkap di akhir.</span></button>
      </div>
      <label class="startpart">Aksen penguji:
        <select id="ip-accent">${Object.entries(ctx.varieties()).filter(([k]) => ["gb", "us", "au", "ie", "sc", "in", "ng", "za", "sg"].includes(k))
          .map(([k, v]) => `<option value="${k}" ${k === "gb" ? "selected" : ""}>${v.flag} ${escapeHtml(v.label)}</option>`).join("")}</select></label>
      <label class="startpart">Latihan mulai dari:
        <select id="ip-startpart"><option value="1">Part 1</option><option value="2">Part 2 (kartu topik)</option><option value="3">Part 3 (diskusi)</option></select></label>
      ${hist.length ? `<h3>📈 Riwayat band</h3><div class="hist">${hist.map((h) => `<span>${new Date(h.at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} · ${h.mode === "mock" ? "🧪" : "🏋️"} <b>${h.overall.toFixed(1)}</b></span>`).join("")}</div>` : ""}
      <p class="hint">Skor adalah perkiraan latihan berdasarkan deskriptor band IELTS publik (Fluency & Coherence, Lexical Resource, Grammatical Range & Accuracy). Pengucapan tidak bisa dinilai dari teks.</p>`, "msg scene-card ielts-start");
    el.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => start(b.dataset.mode, Number($("ip-startpart").value), $("ip-accent").value)));
  }

  async function start(mode, startPart, variety) {
    if (st.busy) return;
    const res = await fetch("/api/ielts/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, startPart, variety }) });
    const data = await res.json();
    if (!res.ok) return toast(`⚠️ ${data.error}`);
    st.session = data.current;
    $("messages").innerHTML = "";
    renderPanel();
    send(null);
  }

  async function show() {
    stopAll();
    $("chat-title").textContent = "🎓 IELTS Speaking · English";
    const data = await (await fetch("/api/ielts")).json();
    st.history = data.history ?? [];
    st.session = data.current?.status === "active" ? data.current : null;
    if (!st.session) return showStart();
    // lanjutkan sesi yang belum selesai
    $("messages").innerHTML = "";
    renderPanel();
    for (const t of st.session.transcript) {
      if (t.role === "examiner") examinerBubble(t.text);
      else ctx.addMessage("user", t.text);
    }
    scrollDown();
    if (!st.session.transcript.length || st.session.transcript.at(-1).role === "candidate") send(null);
  }

  function hide() {
    clearInterval(st.timer);
    if (st.recording) stopListening();
    panel().hidden = true;
  }

  return { show, hide, send: (t, sec) => send(t, sec), get busy() { return st.busy; } };
}
