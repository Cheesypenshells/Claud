// Mode "💘 Pendekatan": kenalan & PDKT dengan karakter fiksi untuk melatih bahasa dan rasa percaya diri.
import { renderAvatar, setMood, sceneStyle } from "./avatar.js";
import { createSpeechQueue } from "./voice.js";

const MOOD_EMOJI = { happy: "😊", amused: "😏", shy: "😳", neutral: "🙂", curious: "🤔", annoyed: "😒", uncomfortable: "😟", leaving: "👋" };
const MOVE = {
  great: ["🔥 Mantap!", "great"], good: ["👍 Bagus", "good"], ok: ["😐 Biasa aja", "ok"],
  awkward: ["😬 Canggung", "awkward"], cringe: ["🙈 Cringe", "cringe"], inappropriate: ["🚫 Melewati batas", "bad"],
};
// Bila foto realistis tersedia (public/characters/<id>/<mood>.jpg), pakai foto; kalau tidak, avatar SVG.
const MOOD_FALLBACK = { amused: ["happy"], shy: ["happy"], curious: ["neutral"], annoyed: ["uncomfortable", "neutral"], uncomfortable: ["annoyed", "neutral"], leaving: ["annoyed", "uncomfortable", "neutral"], happy: ["neutral"] };
const hasPhoto = (c) => !!(c.media && Object.keys(c.media.moods).length);
function photoFor(c, mood) {
  const m = c.media.moods;
  for (const k of [mood, ...(MOOD_FALLBACK[mood] ?? []), "neutral", "happy"]) if (m[k]) return m[k];
  return Object.values(m)[0];
}
function portraitHtml(c) {
  if (c.media?.portrait) return `<img class="photo-portrait" src="${c.media.portrait}" alt="" loading="lazy">`;
  return renderAvatar(c.look, c.gender, "happy", { portrait: true });
}
let SCENE_PHOTOS = {};
function sceneCss(c, scene = c.scene) {
  const photo = SCENE_PHOTOS[scene];
  return photo ? `background-image:url("${photo}");background-size:cover;background-position:center;` : sceneStyle(scene);
}

const feelLabel = (r) => (r < 15 ? "Dingin 🥶" : r < 35 ? "Sopan aja" : r < 55 ? "Mulai tertarik" : r < 75 ? "Suka ngobrol sama kamu" : "Naksir berat 💘");

export function createDating(ctx) {
  const { $, fetch, escapeHtml, scrollDown, toast, speak, stopAll, setStatus, getLevel, setLanguage, voiceOn, startListening, refreshSkills, refreshMemory, getCtx } = ctx;
  const st = { chars: null, states: {}, rules: null, activities: {}, current: null, filter: "all", busy: false };
  // "lagi kerja" memakai tempat kerja masing-masing karakter
  const actInfo = (c, id) => (id === "work" && c?.work
    ? { emoji: c.jobEmoji ?? "💼", label: `lagi kerja · ${c.job}`, scene: c.work.scene, walking: c.work.walking }
    : st.activities[id] ?? st.activities.walk);
  const curChar = () => st.chars?.[st.current];
  const actOf = (state, c = curChar()) => actInfo(c, state?.activity);
  const sceneOf = (c, state) => actOf(state, c)?.scene ?? c.scene;

  const stage = () => $("date-stage");

  async function loadCharacters() {
    const data = await (await fetch("/api/date/characters")).json();
    st.chars = data.characters;
    st.states = data.states;
    st.rules = data.rules;
    st.activities = data.activities;
    SCENE_PHOTOS = data.scenePhotos ?? {};
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
          <b>Kamu yang harus nyapa duluan</b> — Cheesy-Bot jadi wingman-mu. Tiap orang punya <b>sifat beda</b>, jadi cara pendekatannya juga beda.
          Tanya-tanya soal <b>budaya & kebiasaan</b> mereka, ceritakan budaya Indonesia, bikin mereka nyaman, lalu ajak ketemu lagi!
          Ingat: <b>mereka bisa menolak</b> — dan bakal pergi kalau kamu melecehkan.</p>
        <div class="chips">
          ${[["all", "Semua"], ["F", "👩 Cewek"], ["M", "👨 Cowok"]].map(([v, l]) => `<button type="button" class="chip ${st.filter === v ? "on" : ""}" data-f="${v}">${l}</button>`).join("")}
          <button type="button" class="chip book" id="culture-book">📚 Buku Budaya</button>
        </div>
      </div>
      <div class="char-grid">
        ${list.map((c) => `
          <button type="button" class="char-card ${c.lang === lang ? "same-lang" : ""}" data-id="${c.id}">
            <div class="portrait ${c.media?.portrait ? "is-photo" : ""}" style="${sceneCss(c)}">${portraitHtml(c)}</div>
            <div class="char-info">
              <b>${escapeHtml(c.name)}</b>
              <span class="persona-tag">${escapeHtml(c.personality)}</span>
              <span class="job">${c.jobEmoji ?? ""} <b>${escapeHtml(c.job)}</b> · ${c.age} th</span>
              <span>${c.flag} ${escapeHtml(c.city)}</span>
              ${c.now ? `<span class="now">🕗 ${escapeHtml(c.now.time)} di sana · ${actInfo(c, c.now.activity)?.emoji ?? ""} ${escapeHtml(c.now.activity === "work" ? "lagi kerja" : actInfo(c, c.now.activity)?.label ?? "")}</span>` : ""}
              <span class="diff d${c.difficulty}">${"●".repeat(c.difficulty)}${"○".repeat(3 - c.difficulty)} ${c.difficultyLabel}</span>
              ${rec(c.id).success ? `<span class="rec ok">💘 Berhasil ${rec(c.id).success}×</span>` : ""}
              ${rec(c.id).walked_away ? `<span class="rec bad">🚶 Ditinggal ${rec(c.id).walked_away}×</span>` : ""}
            </div>
          </button>`).join("")}
      </div>
      <p class="hint center">Semua karakter adalah tokoh fiksi dewasa buatan Cheesy Pen Shells — bukan orang sungguhan.</p>`;
    $("messages").querySelectorAll(".chip").forEach((b) => (b.onclick = () => { st.filter = b.dataset.f; showPicker(); }));
    $("messages").querySelectorAll(".char-card").forEach((b) => (b.onclick = () => openCharacter(b.dataset.id)));
    $("culture-book").onclick = showCultureBook;
    $("messages").scrollTop = 0;
  }

  // ---------- Adegan ----------
  function renderStage(c, state, mood = "neutral") {
    const s = stage();
    s.hidden = false;
    const photo = hasPhoto(c);
    const scene = sceneOf(c, state);
    s.style.cssText = sceneCss(c, scene);
    s.className = `date-stage scene-${scene} ${photo ? "photo-mode" : ""} ${SCENE_PHOTOS[scene] ? "scene-photo" : ""}`;
    s.innerHTML = `
      <div class="stage-hud">
        <div class="who"><b>${escapeHtml(c.name)}</b><span>${c.flag} ${escapeHtml(c.city)} · ${c.age} th</span>
          <span class="act-now">${actOf(state)?.emoji ?? ""} ${escapeHtml(actOf(state)?.label ?? "")}${c.now ? ` · 🕗 ${escapeHtml(c.now.time)}` : ""}</span></div>
        <div class="rapport"><span class="lbl">💗 Ketertarikan <b id="rapport-num">${state.rapport}</b></span>
          <div class="meter heart"><i id="rapport-bar" style="width:${state.rapport}%"></i><em style="left:${st.rules.successMin}%"></em></div>
          <span class="feel" id="rapport-feel">${feelLabel(state.rapport)}</span></div>
      </div>
      ${photo ? `
      <div class="photo-stage" id="walker">
        ${c.media.video && state.turns === 0 ? `<video class="photo-video" src="${c.media.video}" autoplay muted loop playsinline></video>` : ""}
        <img class="photo-img on" src="${photoFor(c, mood)}" alt="${escapeHtml(c.name)}">
        <img class="photo-img" alt="">
        <div class="mood-bubble" id="mood-bubble">${MOOD_EMOJI[mood]}</div>
      </div>` : `
      <div class="walker" id="walker">
        <div class="mood-bubble" id="mood-bubble">${MOOD_EMOJI[mood]}</div>
        ${renderAvatar(c.look, c.gender, mood)}
      </div>`}
      <div class="hearts" id="hearts"></div>
      <div class="stage-actions">
        <button type="button" class="mini" id="date-back">← Pilih gebetan</button>
        <span class="turns" id="date-turns">Giliran ${state.turns}/${st.rules.maxTurns}</span>
        <select class="mini" id="date-activity" title="Ganti aktivitas (mulai adegan baru)">
          ${(c.activities ?? ["walk"]).map((a) => `<option value="${a}" ${a === state.activity ? "selected" : ""}>${actInfo(c, a)?.emoji ?? ""} ${escapeHtml(a === "work" ? `di tempat kerja (${c.job})` : actInfo(c, a)?.label ?? a)}</option>`).join("")}
        </select>
        <button type="button" class="mini" id="date-restart">↺ Mulai lagi</button>
      </div>`;
    $("date-back").onclick = showPicker;
    $("date-restart").onclick = () => startScene(c.id);
    $("date-activity").onchange = (e) => startScene(c.id, e.target.value);
    applyMotion(state, mood);
  }

  function applyMotion(state, mood) {
    st.lastState = state;
    const s = stage();
    s.classList.toggle("walking", state.status === "active" && mood !== "leaving" && !!actOf(state)?.walking);
    s.classList.toggle("idle", state.status === "active" && !actOf(state)?.walking);
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
    if (hasPhoto(c)) {
      const w = $("walker");
      w.querySelector(".photo-video")?.remove();
      const imgs = w.querySelectorAll(".photo-img");
      const next = [...imgs].find((i) => !i.classList.contains("on"));
      const src = photoFor(c, mood);
      if (!imgs[0].src.endsWith(src) || !imgs[0].classList.contains("on")) {
        next.src = src;
        next.onload = () => { imgs.forEach((i) => i.classList.toggle("on", i === next)); };
      }
    } else {
      setMood($("walker"), c.look, mood);
    }
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
      <p class="hint">Klik salah satu untuk dipakai (boleh diedit), atau tulis/ucapkan sapaanmu sendiri — lebih berani lebih bagus 😉</p>
      ${intro.vocab?.length ? `<div class="tag">🧩 KOSAKATA ${escapeHtml((actOf(st.lastState)?.label ?? "").toUpperCase())}</div>${vocabHtml(intro.vocab)}` : ""}
      <div class="tag">🌏 TOPIK BUDAYA YANG BISA KAMU TANYAIN · ${escapeHtml(c.personality.toUpperCase())}</div>
      <div class="topic-chips">${(c.topics ?? []).map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</div>
      <p class="hint">Tanyakan pakai bahasa ${escapeHtml(c.flag)} — dan ceritakan juga kebiasaan di Indonesia. Pelajaran budayanya otomatis tersimpan di 📚 Buku Budaya.</p>`, "msg scene-card");
    el.querySelectorAll(".opener").forEach((b) => (b.onclick = () => fillInput(intro.openers[b.dataset.i].text)));
    bindVocab(el, c);
  }

  function createCharBubble(c) {
    const el = document.createElement("div");
    el.className = "msg assistant char-msg";
    el.dataset.name = c.name.split(" ")[0].toUpperCase();
    el.innerHTML = `<div class="body"></div>`;
    $("messages").append(el);
    return el;
  }

  function finishCharBubble(el, c, text, meta) {
    el.querySelector(".body").textContent = text;
    el.dataset.raw = text;
    el.classList.remove("typing");
    el.insertAdjacentHTML("beforeend", `${meta?.romanization ? `<div class="roman">${escapeHtml(meta.romanization)}</div>` : ""}
      ${meta?.translation_id ? `<details class="arti"><summary>👁 lihat arti</summary>${escapeHtml(meta.translation_id)}</details>` : ""}`);
    const btn = document.createElement("button");
    btn.className = "speak-btn";
    btn.title = "Dengarkan";
    btn.textContent = "🔊";
    btn.onclick = () => say(c, text);
    el.append(btn);
    if (meta?.boundary && meta.boundary !== "none") {
      addCard(meta.boundary === "soft_no" ? "🙅 Dia agak risih / menolak halus — baca sinyalnya, jangan dipaksa."
        : meta.boundary === "firm_no" ? "🚫 Dia MENOLAK dengan tegas. Hormati batasannya — kalau diulang, dia pergi."
        : "🚶 Dia pergi. Pesanmu bikin dia tidak nyaman.", `msg boundary b-${meta.boundary}`);
    }
    if (meta?.activity_vocab?.length) {
      const v = addCard(`<div class="tag">🧩 KOSAKATA BARU · ${escapeHtml((actOf(st.lastState)?.label ?? "").toUpperCase())}</div>${vocabHtml(meta.activity_vocab)}`, "msg vocab-card");
      bindVocab(v, c);
    }
    if (meta?.culture_note?.title) renderCulture(meta.culture_note, c);
    if (meta?.coach) renderCoach(meta);
    scrollDown();
  }

  function renderCharMsg(c, text, meta) {
    finishCharBubble(createCharBubble(c), c, text, meta);
  }

  function vocabHtml(list) {
    return `<div class="vocab">${list.map((v) => `<button type="button" class="vchip" data-w="${escapeHtml(v.word)}" title="Dengarkan"><b>${escapeHtml(v.word)}</b>${v.romanization ? `<i>${escapeHtml(v.romanization)}</i>` : ""}<span>${escapeHtml(v.meaning_id)}</span></button>`).join("")}</div>`;
  }
  function bindVocab(el, c) {
    el.querySelectorAll(".vchip").forEach((b) => (b.onclick = () => say(c, b.dataset.w)));
  }

  function renderCulture(n, c) {
    addCard(`<div class="tag">📚 CATATAN BUDAYA · ${c.flag} ${escapeHtml(c.city)}</div>
      <b>${escapeHtml(n.title)}</b><p>${escapeHtml(n.note)}</p><span class="saved">✓ tersimpan di Buku Budaya</span>`, "msg culture-card");
  }

  async function showCultureBook() {
    const { notes } = await (await fetch("/api/date/culture")).json();
    const groups = {};
    for (const n of notes) (groups[`${n.flag} ${n.name} · ${n.city}`] ??= []).push(n);
    $("skill-dialog-title").textContent = `📚 Buku Budaya (${notes.length})`;
    $("skill-body").innerHTML = !notes.length
      ? `<p>Belum ada catatan. Ajak karakter ngobrol soal budaya, kebiasaan, makanan, atau hari raya mereka — setiap pelajaran budaya akan tersimpan di sini.</p>`
      : Object.entries(groups).map(([g, list]) => `<h3>${escapeHtml(g)}</h3>${list.map((n) => `<div class="sk"><b>${escapeHtml(n.title)}</b><p class="ev">${escapeHtml(n.note)}</p></div>`).join("")}`).join("");
    if (!$("skill-dialog").open) $("skill-dialog").showModal();
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

  function renderEnd(c, state, secret) {
    const text = {
      success: `💘 <b>BERHASIL!</b> ${escapeHtml(c.name.split(" ")[0])} mau ketemu lagi sama kamu. +50 XP!`,
      walked_away: `🚶 <b>${escapeHtml(c.name.split(" ")[0])} pergi.</b> PDKT itu soal bikin orang nyaman — bukan memaksa atau melecehkan. Coba lagi dengan cara yang lebih sopan.`,
      left: `👋 <b>${escapeHtml(c.name.split(" ")[0])} harus pergi.</b> Ngobrolnya kelamaan tanpa ngajak ketemu lagi. Lain kali, berani ajak di saat yang pas!`,
    }[state.status];
    const el = addCard(`<p>${text}</p>
      <p class="hint">Ketertarikan tertinggi: ${state.best}/100 · ${state.turns} giliran</p>
      ${secret ? `<div class="secret"><div class="tag">🔓 RAHASIA PENDEKATAN · ${escapeHtml(c.personality.toUpperCase())}</div>
        <p>💚 <b>Dia suka:</b> ${secret.likes.map(escapeHtml).join(" · ")}</p>
        <p>💔 <b>Dia nggak suka:</b> ${secret.dislikes.map(escapeHtml).join(" · ")}</p></div>` : ""}
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
    if (data.state.status !== "active") renderEnd(c, data.state, data.secret);
    refreshSkills();
  }

  const lastMood = (msgs, state) => (state.status === "walked_away" ? "leaving" : [...msgs].reverse().find((m) => m.meta)?.meta.mood ?? "neutral");

  async function startScene(id, activity) {
    if (st.busy) return;
    const c = st.chars[id];
    st.busy = true;
    stopAll();
    $("messages").innerHTML = "";
    renderStage(c, { status: "active", rapport: 0, turns: 0, best: 0, activity: activity ?? c.now?.activity }, "neutral");
    const wait = addCard("⟳ Menyiapkan adegan…", "msg error");
    try {
      const res = await fetch(`/api/date/${id}/start`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: getLevel(), activity, ctx: getCtx() }),
      });
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

  /** Kirim pesan ke karakter; balasan mengalir (SSE) dan langsung dibacakan per kalimat di mode suara. */
  async function send(text) {
    const id = st.current;
    if (!id || st.busy) return false;
    const c = st.chars[id];
    st.busy = true;
    stopAll();
    ctx.setControlsDisabled(true);
    ctx.addMessage("user", text);
    const bubble = createCharBubble(c);
    bubble.classList.add("typing");
    scrollDown();
    setStatus(`💭 ${c.name.split(" ")[0]} lagi ngetik…`);
    const queue = voiceOn() ? createSpeechQueue(c.lang, ctx.rate(), null, c.gender === "F" ? 1.15 : 0.85) : null;
    let streamed = "";
    let result = null;
    try {
      const res = await fetch(`/api/date/${id}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, level: getLevel(), voice: voiceOn(), ctx: getCtx() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Gagal");
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
            streamed += data.text;
            bubble.querySelector(".body").textContent = streamed;
            queue?.push(data.text);
            scrollDown();
          } else if (event === "error") throw new Error(data.error);
          else if (event === "done") result = data;
        }
      }
      if (!result) throw new Error("Koneksi terputus. Coba lagi.");
      const { turn, state, secret } = result;
      if (turn.reply) finishCharBubble(bubble, c, turn.reply, turn);
      else { bubble.remove(); renderCoach(turn); }
      updateStage(c, state, turn.mood);
      if (state.status !== "active") {
        renderEnd(c, state, secret);
        if (state.status === "success") toast(`💘 Berhasil PDKT sama ${c.name.split(" ")[0]}! +50 XP`);
      }
      refreshSkills({ announce: true });
      for (const ms of [20000, 45000]) setTimeout(() => refreshSkills({ announce: true }), ms);
      refreshMemory();
      st.busy = false;
      ctx.setControlsDisabled(false);
      setStatus("");
      if (queue) {
        if (!streamed && turn.reply) queue.push(turn.reply);
        setStatus(`🔊 ${c.name.split(" ")[0]} berbicara…`);
        await queue.end();
        setStatus("");
        if (voiceOn() && state.status === "active" && !st.busy) startListening({ auto: true });
      }
    } catch (e) {
      queue?.end();
      if (!streamed) bubble.remove();
      addCard(`⚠️ ${escapeHtml(e.message)}`, "msg error");
    } finally {
      st.busy = false;
      ctx.setControlsDisabled(false);
      if (!queue) setStatus("");
    }
    return true;
  }

  return { showPicker, send, get active() { return !!st.current; }, get busy() { return st.busy; } };
}
