// Mode "💘 Pendekatan": kenalan & PDKT dengan karakter fiksi untuk melatih bahasa dan rasa percaya diri.
import { renderAvatar, setMood, sceneStyle } from "./avatar.js";

const MOOD_EMOJI = { happy: "😊", amused: "😏", shy: "😳", neutral: "🙂", curious: "🤔", annoyed: "😒", uncomfortable: "😟", leaving: "👋" };
const MOVE = {
  great: ["🔥 Mantap!", "great"], good: ["👍 Bagus", "good"], ok: ["😐 Biasa aja", "ok"],
  awkward: ["😬 Canggung", "awkward"], cringe: ["🙈 Cringe", "cringe"], inappropriate: ["🚫 Melewati batas", "bad"],
};
const feelLabel = (r) => (r < 15 ? "Dingin 🥶" : r < 35 ? "Sopan aja" : r < 55 ? "Mulai tertarik" : r < 75 ? "Suka ngobrol sama kamu" : "Naksir berat 💘");

export function createDating(ctx) {
  const { $, fetch, escapeHtml, scrollDown, toast, speak, stopAll, setStatus, getLevel, setLanguage, voiceOn, startListening, refreshSkills, refreshMemory } = ctx;
  const st = { chars: null, states: {}, rules: null, current: null, filter: "all", busy: false };

  const stage = () => $("date-stage");

  async function loadCharacters() {
    const data = await (await fetch("/api/date/characters")).json();
    st.chars = data.characters;
    st.states = data.states;
    st.rules = data.rules;
  }

  // ---------- Pemilih gebetan ----------
  async function showPicker() {
    st.current = null;
    stopAll();
    document.body.classList.add("date-picking");
    document.body.classList.remove("date-playing");
    $("chat-title").textContent = "💘 Pendekatan · pilih gebetan";
    stage().hidden = true;
    await loadCharacters();
    const lang = ctx.lang();
    const list = Object.values(st.chars)
      .filter((c) => st.filter === "all" || c.gender === st.filter)
      .sort((a, b) => (a.lang === lang ? -1 : 0) - (b.lang === lang ? -1 : 0) || a.difficulty - b.difficulty);
    const rec = (id) => st.states[id]?.record ?? {};
    $("messages").innerHTML = `
      <div class="date-intro">
        <h2 class="judul"><span>Pendekatan</span></h2>
        <p>Latihan kenalan &amp; PDKT pakai bahasa asing dengan karakter fiksi yang lagi jalan-jalan di kotanya.
          <b>Kamu yang harus nyapa duluan</b> — Cheesy-Bot jadi wingman-mu. Bikin mereka nyaman, bikin ketawa, dan ajak ketemu lagi!
          Tapi ingat: <b>mereka bisa menolak</b> — dan bakal pergi kalau kamu melecehkan.</p>
        <div class="chips">
          ${[["all", "Semua"], ["F", "👩 Cewek"], ["M", "👨 Cowok"]].map(([v, l]) => `<button type="button" class="chip ${st.filter === v ? "on" : ""}" data-f="${v}">${l}</button>`).join("")}
        </div>
      </div>
      <div class="char-grid">
        ${list.map((c) => `
          <button type="button" class="char-card ${c.lang === lang ? "same-lang" : ""}" data-id="${c.id}">
            <div class="portrait" style="${sceneStyle(c.scene)}">${renderAvatar(c.look, c.gender, "happy", { portrait: true })}</div>
            <div class="char-info">
              <b>${escapeHtml(c.name)}</b>
              <span>${c.age} th · ${escapeHtml(c.job)}</span>
              <span>${c.flag} ${escapeHtml(c.city)}</span>
              <span class="diff d${c.difficulty}">${"●".repeat(c.difficulty)}${"○".repeat(3 - c.difficulty)} ${c.difficultyLabel}</span>
              ${rec(c.id).success ? `<span class="rec ok">💘 Berhasil ${rec(c.id).success}×</span>` : ""}
              ${rec(c.id).walked_away ? `<span class="rec bad">🚶 Ditinggal ${rec(c.id).walked_away}×</span>` : ""}
            </div>
          </button>`).join("")}
      </div>
      <p class="hint center">Semua karakter adalah tokoh fiksi dewasa buatan Cheesy Pen Shells — bukan orang sungguhan.</p>`;
    $("messages").querySelectorAll(".chip").forEach((b) => (b.onclick = () => { st.filter = b.dataset.f; showPicker(); }));
    $("messages").querySelectorAll(".char-card").forEach((b) => (b.onclick = () => openCharacter(b.dataset.id)));
    $("messages").scrollTop = 0;
  }

  // ---------- Adegan ----------
  function renderStage(c, state, mood = "neutral") {
    const s = stage();
    s.hidden = false;
    s.style.cssText = sceneStyle(c.scene);
    s.className = `date-stage scene-${c.scene}`;
    s.innerHTML = `
      <div class="stage-hud">
        <div class="who"><b>${escapeHtml(c.name)}</b><span>${c.flag} ${escapeHtml(c.city)} · ${c.age} th</span></div>
        <div class="rapport"><span class="lbl">💗 Ketertarikan <b id="rapport-num">${state.rapport}</b></span>
          <div class="meter heart"><i id="rapport-bar" style="width:${state.rapport}%"></i><em style="left:${st.rules.successMin}%"></em></div>
          <span class="feel" id="rapport-feel">${feelLabel(state.rapport)}</span></div>
      </div>
      <div class="walker" id="walker">
        <div class="mood-bubble" id="mood-bubble">${MOOD_EMOJI[mood]}</div>
        ${renderAvatar(c.look, c.gender, mood)}
      </div>
      <div class="hearts" id="hearts"></div>
      <div class="stage-actions">
        <button type="button" class="mini" id="date-back">← Pilih gebetan</button>
        <span class="turns" id="date-turns">Giliran ${state.turns}/${st.rules.maxTurns}</span>
        <button type="button" class="mini" id="date-restart">↺ Mulai lagi</button>
      </div>`;
    $("date-back").onclick = showPicker;
    $("date-restart").onclick = () => startScene(c.id);
    applyMotion(state, mood);
  }

  function applyMotion(state, mood) {
    const s = stage();
    s.classList.toggle("walking", state.status === "active" && mood !== "leaving");
    s.classList.toggle("left-scene", state.status === "walked_away" || state.status === "left");
    s.classList.toggle("won", state.status === "success");
    if (state.status === "success") burstHearts();
  }

  function burstHearts() {
    const h = $("hearts");
    if (!h) return;
    h.innerHTML = Array.from({ length: 14 }, (_, i) =>
      `<span style="left:${10 + Math.random() * 80}%;animation-delay:${i * 0.12}s">${["💘", "💖", "🦪", "🧀", "✨"][i % 5]}</span>`).join("");
  }

  function updateStage(c, state, mood) {
    setMood($("walker"), c.look, mood);
    $("mood-bubble").textContent = MOOD_EMOJI[mood] ?? "🙂";
    $("mood-bubble").classList.remove("pop");
    void $("mood-bubble").offsetWidth;
    $("mood-bubble").classList.add("pop");
    $("rapport-num").textContent = state.rapport;
    $("rapport-bar").style.width = `${state.rapport}%`;
    $("rapport-feel").textContent = feelLabel(state.rapport);
    $("date-turns").textContent = `Giliran ${state.turns}/${st.rules.maxTurns}`;
    applyMotion(state, mood);
  }

  function addCard(html, cls) {
    const el = document.createElement("div");
    el.className = cls;
    el.innerHTML = html;
    $("messages").append(el);
    scrollDown();
    return el;
  }

  function fillInput(text) {
    $("input").value = text;
    $("input").focus();
  }

  function renderIntro(c, intro) {
    const el = addCard(`
      <div class="tag">📍 ADEGAN</div>
      <p>${escapeHtml(intro.narration_id)}</p>
      <div class="tag">🧀 WINGMAN: COBA BUKA DENGAN…</div>
      <div class="openers">${intro.openers.map((o, i) => `
        <button type="button" class="opener" data-i="${i}">
          <b>${escapeHtml(o.text)}</b>${o.romanization ? `<i>${escapeHtml(o.romanization)}</i>` : ""}
          <span>${escapeHtml(o.meaning_id)} · <em>${escapeHtml(o.style)}</em></span></button>`).join("")}</div>
      <p class="hint">Klik salah satu untuk dipakai (boleh diedit), atau tulis/ucapkan sapaanmu sendiri — lebih berani lebih bagus 😉</p>`, "msg scene-card");
    el.querySelectorAll(".opener").forEach((b) => (b.onclick = () => fillInput(intro.openers[b.dataset.i].text)));
  }

  function renderCharMsg(c, text, meta) {
    const el = document.createElement("div");
    el.className = "msg assistant char-msg";
    el.dataset.name = c.name.split(" ")[0].toUpperCase();
    el.innerHTML = `<div class="body"></div>
      ${meta?.romanization ? `<div class="roman">${escapeHtml(meta.romanization)}</div>` : ""}
      ${meta?.translation_id ? `<details class="arti"><summary>👁 lihat arti</summary>${escapeHtml(meta.translation_id)}</details>` : ""}`;
    el.querySelector(".body").textContent = text;
    el.dataset.raw = text;
    const btn = document.createElement("button");
    btn.className = "speak-btn";
    btn.title = "Dengarkan";
    btn.textContent = "🔊";
    btn.onclick = () => say(c, text);
    el.append(btn);
    $("messages").append(el);
    if (meta?.boundary && meta.boundary !== "none") {
      addCard(meta.boundary === "soft_no" ? "🙅 Dia agak risih / menolak halus — baca sinyalnya, jangan dipaksa."
        : meta.boundary === "firm_no" ? "🚫 Dia MENOLAK dengan tegas. Hormati batasannya — kalau diulang, dia pergi."
        : "🚶 Dia pergi. Pesanmu bikin dia tidak nyaman.", `msg boundary b-${meta.boundary}`);
    }
    if (meta?.coach) renderCoach(meta);
    scrollDown();
  }

  function renderCoach(meta) {
    const [label, cls] = MOVE[meta.move_rating] ?? MOVE.ok;
    const k = meta.coach;
    const el = addCard(`
      <div class="tag">🧀 WINGMAN CHEESY-BOT <span class="move ${cls}">${label}</span>
        <span class="delta ${meta.rapport_delta >= 0 ? "up" : "down"}">💗 ${meta.rapport_delta >= 0 ? "+" : ""}${meta.rapport_delta}</span></div>
      ${k.correction ? `<p>✏️ ${escapeHtml(k.correction)}</p>` : ""}
      ${k.tip ? `<p>💡 ${escapeHtml(k.tip)}</p>` : ""}
      ${k.try_saying ? `<button type="button" class="opener"><b>${escapeHtml(k.try_saying)}</b><span>${escapeHtml(k.try_saying_id)}</span></button>` : ""}`, "msg coach-card");
    el.querySelector(".opener")?.addEventListener("click", () => fillInput(k.try_saying));
  }

  function renderEnd(c, state) {
    const text = {
      success: `💘 <b>BERHASIL!</b> ${escapeHtml(c.name.split(" ")[0])} mau ketemu lagi sama kamu. +50 XP!`,
      walked_away: `🚶 <b>${escapeHtml(c.name.split(" ")[0])} pergi.</b> PDKT itu soal bikin orang nyaman — bukan memaksa atau melecehkan. Coba lagi dengan cara yang lebih sopan.`,
      left: `👋 <b>${escapeHtml(c.name.split(" ")[0])} harus pergi.</b> Ngobrolnya kelamaan tanpa ngajak ketemu lagi. Lain kali, berani ajak di saat yang pas!`,
    }[state.status];
    const el = addCard(`<p>${text}</p>
      <p class="hint">Ketertarikan tertinggi: ${state.best}/100 · ${state.turns} giliran</p>
      <div class="end-actions"><button type="button" class="btn-utama" data-a="again">↺ Coba lagi</button><button type="button" class="ghost" data-a="pick">Pilih gebetan lain</button></div>`, `msg end-card end-${state.status}`);
    el.querySelector('[data-a="again"]').onclick = () => startScene(c.id);
    el.querySelector('[data-a="pick"]').onclick = showPicker;
  }

  async function openCharacter(id) {
    if (st.busy) return;
    const c = st.chars[id];
    st.current = id;
    if (ctx.lang() !== c.lang) setLanguage(c.lang);
    document.body.classList.remove("date-picking");
    document.body.classList.add("date-playing");
    $("chat-title").textContent = `💘 ${c.name.split(" (")[0]}`;
    $("messages").innerHTML = "";
    const data = await (await fetch(`/api/date/${id}`)).json();
    if (!data.state) return startScene(id);
    renderStage(c, data.state, lastMood(data.messages, data.state));
    if (data.state.intro) renderIntro(c, data.state.intro);
    for (const m of data.messages) {
      if (m.role === "user") ctx.addMessage("user", m.content);
      else renderCharMsg(c, m.content, m.meta);
    }
    if (data.state.status !== "active") renderEnd(c, data.state);
    refreshSkills();
  }

  const lastMood = (msgs, state) => (state.status === "walked_away" ? "leaving" : [...msgs].reverse().find((m) => m.meta)?.meta.mood ?? "neutral");

  async function startScene(id) {
    if (st.busy) return;
    const c = st.chars[id];
    st.busy = true;
    stopAll();
    $("messages").innerHTML = "";
    renderStage(c, { status: "active", rapport: 0, turns: 0, best: 0 }, "neutral");
    const wait = addCard("⟳ Menyiapkan adegan…", "msg error");
    try {
      const res = await fetch(`/api/date/${id}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ level: getLevel() }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      wait.remove();
      renderStage(c, data.state, "neutral");
      renderIntro(c, data.state.intro);
    } catch (e) {
      wait.textContent = `⚠️ ${e.message}`;
    } finally {
      st.busy = false;
    }
  }

  async function say(c, text) {
    stopAll();
    setStatus(`🔊 ${c.name.split(" ")[0]} berbicara…`);
    await speak(text, c.lang, ctx.rate(), null, c.gender === "F" ? 1.15 : 0.85);
    setStatus("");
  }

  /** Kirim pesan ke karakter. Mengembalikan true bila terkirim. */
  async function send(text) {
    const id = st.current;
    if (!id || st.busy) return false;
    const c = st.chars[id];
    st.busy = true;
    ctx.setControlsDisabled(true);
    ctx.addMessage("user", text);
    const typing = addCard(`${escapeHtml(c.name.split(" ")[0])} sedang mikir…`, "msg error typing-note");
    setStatus("💭 …");
    let reply = null;
    try {
      const res = await fetch(`/api/date/${id}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, level: getLevel(), voice: voiceOn() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      typing.remove();
      const { turn, state } = data;
      reply = turn.reply;
      if (reply) renderCharMsg(c, reply, turn);
      else renderCoach(turn);
      updateStage(c, state, turn.mood);
      if (state.status !== "active") {
        renderEnd(c, state);
        if (state.status === "success") toast(`💘 Berhasil PDKT sama ${c.name.split(" ")[0]}! +50 XP`);
      }
      refreshSkills({ announce: true });
      for (const ms of [20000, 45000]) setTimeout(() => refreshSkills({ announce: true }), ms);
      refreshMemory();
      if (reply && voiceOn()) {
        await say(c, reply);
        if (voiceOn() && state.status === "active") startListening({ auto: true });
      }
    } catch (e) {
      typing.textContent = `⚠️ ${e.message}`;
    } finally {
      st.busy = false;
      ctx.setControlsDisabled(false);
      setStatus("");
    }
    return true;
  }

  return { showPicker, send, get active() { return !!st.current; }, get busy() { return st.busy; } };
}
