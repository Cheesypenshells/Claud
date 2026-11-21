// 🧠 Wawasan: feed kartu ide singkat untuk mengembangkan diri (konten orisinal AI), ala aplikasi "idea feed".
// Fitur: topik & feed Untukmu, scroll tanpa ujung, baca otomatis, suka, simpan ke stash, cari, jalur belajar harian,
// tulis ide sendiri, ulas (flashcard), target harian & streak, lencana, dengarkan, dan baca dalam bahasa yang dipelajari.
import { speak } from "./voice.js";

const SRC_ICON = { buku: "📕", riset: "🔬", konsep: "💡", sejarah: "📜", tokoh: "👤", pengalaman: "✍️" };
const today = () => new Date().toLocaleDateString("en-CA");

export function createWawasan(ctx) {
  const { $, fetch, escapeHtml, toast, stopAll, rate } = ctx;
  const st = { home: null, topic: "foryou", offset: 0, loading: false, view: "feed", observer: null, timers: new Map(), ideas: new Map() };
  const panel = () => $("insights-panel");
  const post = async (path, body) => {
    const res = await fetch(`/api/insights/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: today(), ...body }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Gagal");
    return data;
  };
  const get = async (path) => {
    const res = await fetch(`/api/insights/${path}${path.includes("?") ? "&" : "?"}date=${today()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Gagal");
    return data;
  };
  const badgeToast = (list) => (list ?? []).forEach((b, i) => setTimeout(() => toast(`🏅 Lencana baru: ${b}`), 400 + i * 2500));

  // ---------- panel atas ----------
  function renderPanel() {
    const h = st.home, sm = h.summary;
    const pct = Math.min(100, Math.round((sm.today / sm.goal) * 100));
    panel().hidden = false;
    panel().innerHTML = `
      <div class="wp-row">
        <b class="wp-title">🧠 Wawasan</b>
        <div class="goal-ring" style="--p:${pct}" title="Target harian"><span>${sm.today}/${sm.goal}</span></div>
        <span class="streak" title="Streak (rekor ${sm.streak.best} hari)">🔥 ${sm.streak.count}</span>
        <form id="wp-search" class="wp-search"><input id="wp-q" placeholder="🔍 Cari ilmu apa saja… (mis. negosiasi, black hole, tiram)" maxlength="80"></form>
      </div>
      <div class="wp-row wp-actions">
        ${[["feed", "📰 Feed"], ["stash", "🔖 Stash"], ["journeys", "🧭 Jalur Belajar"], ["write", "✍️ Tulis Ide"], ["review", "🔁 Ulas"], ["settings", "⚙️ Topik & Target"]]
          .map(([v, l]) => `<button type="button" class="wp-tab ${st.view === v ? "on" : ""}" data-view="${v}">${l}</button>`).join("")}
      </div>
      ${st.view === "feed" ? `<div class="wp-topics">
        <button type="button" class="chip ${st.topic === "foryou" ? "on" : ""}" data-topic="foryou">✨ Untukmu</button>
        ${Object.entries(h.topics).map(([k, t]) => `<button type="button" class="chip ${st.topic === k ? "on" : ""}" data-topic="${k}">${t.emoji} ${escapeHtml(t.label)}</button>`).join("")}
      </div>` : ""}`;
    panel().querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => openView(b.dataset.view)));
    panel().querySelectorAll("[data-topic]").forEach((b) => (b.onclick = () => { st.topic = b.dataset.topic; openView("feed"); }));
    $("wp-search").onsubmit = (e) => { e.preventDefault(); const q = $("wp-q").value.trim(); if (q.length >= 2) search(q); };
  }

  function updateGoal(r) {
    st.home.summary.today = r.today;
    st.home.summary.streak = r.streak;
    const ring = panel().querySelector(".goal-ring");
    if (ring) { ring.style.setProperty("--p", Math.min(100, Math.round((r.today / r.goal) * 100))); ring.querySelector("span").textContent = `${r.today}/${r.goal}`; }
    const sk = panel().querySelector(".streak");
    if (sk) sk.textContent = `🔥 ${r.streak.count}`;
    if (r.today === r.goal) toast(`🎯 Target harian tercapai! ${r.goal} ide hari ini · 🔥 streak ${r.streak.count} hari`);
    badgeToast(r.newBadges?.map((k) => k));
  }

  // ---------- kartu ide ----------
  function cardHtml(i) {
    const t = st.home.topics[i.topic];
    const lang = ctx.lang(), L = ctx.languages()[lang];
    return `
      <div class="idea-top">${t ? `<span class="idea-topic">${t.emoji} ${escapeHtml(t.label)}</span>` : i.journey ? `<span class="idea-topic">🧭 Hari ${i.day + 1}</span>` : ""}
        <span class="idea-min">${i.minutes ?? 1} mnt baca</span>${i.read ? `<span class="idea-read">✓ dibaca</span>` : ""}</div>
      <div class="idea-main">
        <h3 class="idea-title">${escapeHtml(i.title)}</h3>
        <p class="idea-body">${escapeHtml(i.body)}</p>
        ${i.try_today ? `<p class="idea-try">🎯 <b>Coba hari ini:</b> <span>${escapeHtml(i.try_today)}</span></p>` : ""}
      </div>
      <div class="idea-tr" hidden></div>
      <div class="idea-src">${SRC_ICON[i.source_type] ?? "💡"} ${escapeHtml(i.source ?? "")}${i.tags?.length ? ` · ${i.tags.map((x) => `#${escapeHtml(x)}`).join(" ")}` : ""}</div>
      <div class="idea-actions">
        <button type="button" data-a="like" class="${i.liked ? "on" : ""}">💡 <span>${i.liked ? "Insightful!" : "Insightful"}</span></button>
        <button type="button" data-a="save" class="${i.stashes?.length ? "on" : ""}">🔖 <span>${i.stashes?.length ? `Di ${escapeHtml(i.stashes[0])}` : "Simpan"}</span></button>
        <button type="button" data-a="listen">🔊</button>
        ${i.mine ? "" : `<button type="button" data-a="tr" title="Baca dalam ${escapeHtml(L ?? lang)}">🌐 ${escapeHtml((L ?? lang).split(" ")[0])}</button>`}
      </div>`;
  }

  function addCard(i, container = $("messages")) {
    st.ideas.set(i.id, i);
    const el = document.createElement("article");
    el.className = "idea-card" + (i.mine ? " mine" : "");
    el.dataset.id = i.id;
    el.innerHTML = cardHtml(i);
    bindCard(el, i);
    container.append(el);
    if (!i.read) st.observer?.observe(el);
    return el;
  }

  function bindCard(el, i) {
    el.querySelector('[data-a="like"]').onclick = async (e) => {
      try {
        const r = await post("like", { id: i.id });
        i.liked = r.liked;
        e.currentTarget.classList.toggle("on", r.liked);
        e.currentTarget.querySelector("span").textContent = r.liked ? "Insightful!" : "Insightful";
      } catch (err) { toast(`⚠️ ${err.message}`); }
    };
    el.querySelector('[data-a="save"]').onclick = (e) => stashPicker(i, e.currentTarget);
    el.querySelector('[data-a="listen"]').onclick = () => {
      stopAll();
      const tr = el.querySelector(".idea-tr");
      if (!tr.hidden && tr.dataset.text) speak(tr.dataset.text, ctx.ttsLang(), rate());
      else speak(`💬 ${i.title}. ${i.body} Coba hari ini: ${i.try_today ?? ""}`, "id", rate());
    };
    el.querySelector('[data-a="tr"]')?.addEventListener("click", async (e) => {
      const tr = el.querySelector(".idea-tr"), main = el.querySelector(".idea-main");
      if (!tr.hidden) { tr.hidden = true; main.hidden = false; return; }
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const t = await post("translate", { id: i.id, lang: ctx.lang() });
        tr.dataset.text = `${t.title}. ${t.body}`;
        tr.innerHTML = `<h3 class="idea-title">${escapeHtml(t.title)}</h3><p class="idea-body">${escapeHtml(t.body)}</p>
          <p class="idea-try">🎯 ${escapeHtml(t.try_today)}</p>
          <div class="vocab">${t.vocab.map((v) => `<button type="button" class="vchip" data-w="${escapeHtml(v.word)}"><b>${escapeHtml(v.word)}</b>${v.romanization ? `<i>${escapeHtml(v.romanization)}</i>` : ""}<span>${escapeHtml(v.meaning_id)}</span></button>`).join("")}</div>
          <p class="hint">Klik 🌐 lagi untuk kembali ke Bahasa Indonesia.</p>`;
        tr.querySelectorAll(".vchip").forEach((b) => (b.onclick = () => speak(b.dataset.w, ctx.ttsLang(), rate())));
        tr.hidden = false; main.hidden = true;
      } catch (err) { toast(`⚠️ ${err.message}`); }
      finally { btn.disabled = false; }
    });
  }

  async function stashPicker(i, anchor) {
    document.querySelector(".stash-pop")?.remove();
    const names = Object.keys(st.home.summary.stashes);
    const pop = document.createElement("div");
    pop.className = "stash-pop";
    pop.innerHTML = `<b>Simpan ke stash</b>${names.map((n) => `<button type="button" data-n="${escapeHtml(n)}">${i.stashes?.includes(n) ? "✓ " : ""}${escapeHtml(n)}</button>`).join("")}
      <form><input maxlength="40" placeholder="+ Stash baru (mis. Bisnis booth)"><button>Buat</button></form>`;
    anchor.closest(".idea-card").append(pop);
    const apply = async (name) => {
      const has = i.stashes?.includes(name);
      try {
        const r = await post(has ? "unsave" : "save", { id: i.id, stash: name });
        i.stashes = has ? i.stashes.filter((x) => x !== name) : [...(i.stashes ?? []), name];
        st.home.summary.stashes[name] = (st.home.summary.stashes[name] ?? 0) + (has ? -1 : 1);
        anchor.classList.toggle("on", i.stashes.length > 0);
        anchor.querySelector("span").textContent = i.stashes.length ? `Di ${i.stashes[0]}` : "Simpan";
        toast(has ? `Dihapus dari "${name}"` : `🔖 Disimpan ke "${name}"`);
        badgeToast(r.newBadges);
      } catch (err) { toast(`⚠️ ${err.message}`); }
      pop.remove();
    };
    pop.querySelectorAll("[data-n]").forEach((b) => (b.onclick = () => apply(b.dataset.n)));
    pop.querySelector("form").onsubmit = (e) => { e.preventDefault(); const n = pop.querySelector("input").value.trim(); if (n) apply(n); };
  }

  // tandai "dibaca" setelah kartu terlihat ≥ 2,5 detik
  function setupObserver() {
    st.observer?.disconnect();
    st.observer = new IntersectionObserver((entries) => {
      for (const en of entries) {
        const id = en.target.dataset.id;
        if (en.isIntersecting && en.intersectionRatio >= 0.6) {
          if (!st.timers.has(id)) st.timers.set(id, setTimeout(async () => {
            st.timers.delete(id);
            st.observer.unobserve(en.target);
            const i = st.ideas.get(id);
            if (!i || i.read) return;
            i.read = true;
            en.target.querySelector(".idea-top").insertAdjacentHTML("beforeend", `<span class="idea-read">✓ dibaca</span>`);
            try { updateGoal(await post("read", { id })); } catch {}
          }, 2500));
        } else if (st.timers.has(id)) { clearTimeout(st.timers.get(id)); st.timers.delete(id); }
      }
    }, { root: $("messages"), threshold: [0.6] });
  }

  // ---------- tampilan ----------
  function setHead(html) {
    $("messages").innerHTML = html ? `<div class="wp-head">${html}</div>` : "";
    $("messages").scrollTop = 0;
  }

  async function loadMore() {
    if (st.loading || st.view !== "feed") return;
    st.loading = true;
    const loader = document.createElement("div");
    loader.className = "msg error wp-loading";
    loader.textContent = st.offset === 0 ? "⟳ Menyiapkan ide-ide segar untukmu…" : "⟳ Memuat ide berikutnya…";
    $("messages").append(loader);
    try {
      const data = await get(`feed?topic=${st.topic}&offset=${st.offset}`);
      loader.remove();
      if (st.view !== "feed") return;
      data.ideas.forEach((i) => addCard(i));
      st.offset = data.next;
    } catch (e) {
      loader.textContent = `⚠️ ${e.message}`;
    } finally { st.loading = false; }
  }

  async function search(q) {
    st.view = "search";
    renderPanel();
    setHead(`<h2 class="judul"><span>Hasil: ${escapeHtml(q)}</span></h2><p class="hint">Ide-ide ini ditulis khusus untuk pencarianmu dan tersimpan untuk pengguna lain juga.</p>`);
    const loader = document.createElement("div");
    loader.className = "msg error wp-loading"; loader.textContent = "⟳ Mencari & meracik ide…";
    $("messages").append(loader);
    try { const d = await get(`search?q=${encodeURIComponent(q)}`); loader.remove(); d.ideas.forEach((i) => addCard(i)); }
    catch (e) { loader.textContent = `⚠️ ${e.message}`; }
  }

  async function openView(view) {
    stopAll();
    st.view = view;
    st.timers.forEach(clearTimeout); st.timers.clear();
    setupObserver();
    renderPanel();
    if (view === "feed") {
      setHead("");
      st.offset = 0;
      return loadMore();
    }
    if (view === "stash") {
      const names = Object.entries(st.home.summary.stashes);
      setHead(`<h2 class="judul"><span>Stash Kamu</span></h2>
        <div class="chips">${names.map(([n, c]) => `<button type="button" class="chip" data-stash="${escapeHtml(n)}">🔖 ${escapeHtml(n)} (${c})</button>`).join("")}</div>
        <p class="hint">Simpan ide dari feed lewat tombol 🔖. Buat stash baru langsung dari tombol itu.</p><div id="stash-list"></div>`);
      $("messages").querySelectorAll("[data-stash]").forEach((b) => (b.onclick = async () => {
        $("messages").querySelectorAll("[data-stash]").forEach((x) => x.classList.toggle("on", x === b));
        const box = $("stash-list");
        box.innerHTML = `<p class="hint">⟳ Memuat…</p>`;
        try {
          const d = await get(`stash?name=${encodeURIComponent(b.dataset.stash)}`);
          box.innerHTML = d.ideas.length ? "" : `<p class="hint">Stash ini masih kosong.</p>`;
          d.ideas.forEach((i) => addCard(i, box));
          if (b.dataset.stash !== "Favorit") {
            const del = document.createElement("button");
            del.type = "button"; del.className = "ghost danger"; del.textContent = `🗑️ Hapus stash "${b.dataset.stash}"`;
            del.onclick = async () => { if (!confirm("Hapus stash ini? (idenya tetap ada di feed)")) return; await post("stash-delete", { name: b.dataset.stash }); await refreshHome(); openView("stash"); };
            box.append(del);
          }
        } catch (e) { box.innerHTML = `<p class="hint">⚠️ ${escapeHtml(e.message)}</p>`; }
      }));
      $("messages").querySelector("[data-stash]")?.click();
      return;
    }
    if (view === "journeys") {
      setHead(`<h2 class="judul"><span>Jalur Belajar</span></h2><p class="hint">Satu ide per hari, berurutan — supaya jadi kebiasaan. Hari berikutnya terbuka besok.</p>
        <div class="journey-grid">${Object.entries(st.home.journeys).map(([k, j]) => `
          <button type="button" class="journey-card ${j.done ? "done" : ""}" data-j="${k}">
            <span class="idea-topic">${st.home.topics[j.topic]?.emoji ?? ""} ${escapeHtml(st.home.topics[j.topic]?.label ?? "")} · ${j.days} hari</span>
            <b>${escapeHtml(j.title)}</b><span>${escapeHtml(j.desc)}</span>
            <div class="meter"><i style="width:${Math.round((j.progress / j.days) * 100)}%"></i></div>
            <span class="jp">${j.done ? "🎉 Selesai" : `${j.progress}/${j.days} hari`}</span></button>`).join("")}</div>`);
      $("messages").querySelectorAll("[data-j]").forEach((b) => (b.onclick = () => openJourney(b.dataset.j)));
      return;
    }
    if (view === "write") {
      setHead(`<h2 class="judul"><span>Tulis Ide</span></h2>
        <form id="wp-write" class="wp-write">
          <label>Judul<input id="ww-title" maxlength="100" placeholder="Mis. Cara bikin pelanggan antre dengan sabar"></label>
          <label>Isi ide<textarea id="ww-body" rows="6" maxlength="1500" placeholder="Jelaskan satu ide yang kamu pelajari dari pengalaman, buku, atau kerja…"></textarea></label>
          <label>Coba hari ini (opsional)<input id="ww-try" maxlength="200" placeholder="Satu langkah kecil yang bisa langsung dicoba"></label>
          <label>Topik<select id="ww-topic">${Object.entries(st.home.topics).map(([k, t]) => `<option value="${k}">${t.emoji} ${escapeHtml(t.label)}</option>`).join("")}</select></label>
          <button class="btn-utama">✍️ Simpan ide</button>
          <p class="hint">Ide kamu disimpan di stash "Ide Saya" (pribadi).</p>
        </form>`);
      $("wp-write").onsubmit = async (e) => {
        e.preventDefault();
        try {
          const r = await post("mine", { title: $("ww-title").value, body: $("ww-body").value, try_today: $("ww-try").value, topic: $("ww-topic").value });
          toast("✍️ Ide tersimpan di \"Ide Saya\"");
          badgeToast(r.newBadges);
          await refreshHome();
          openView("stash");
        } catch (err) { toast(`⚠️ ${err.message}`); }
      };
      return;
    }
    if (view === "review") {
      setHead(`<h2 class="judul"><span>Ulas Ide Tersimpan</span></h2><p class="hint">Ingat-ingat isinya dulu, baru buka. Mengulang = ingatan jangka panjang.</p><div id="review-box"></div>`);
      try {
        const d = await get("review");
        const box = $("review-box");
        if (!d.ideas.length) { box.innerHTML = `<p class="hint">Belum ada ide tersimpan. Simpan dulu beberapa ide dari feed (🔖).</p>`; return; }
        let k = 0, ok = 0;
        const step = () => {
          if (k >= d.ideas.length) { box.innerHTML = `<div class="flash done"><b>Selesai! Kamu ingat ${ok}/${d.ideas.length} ide 🎉</b><button type="button" class="btn-utama" id="rv-again">🔁 Ulas lagi</button></div>`; $("rv-again").onclick = () => openView("review"); return; }
          const i = d.ideas[k];
          box.innerHTML = `<div class="flash"><span class="idea-topic">${k + 1}/${d.ideas.length}</span><h3 class="idea-title">${escapeHtml(i.title)}</h3>
            <p class="hint">Apa inti ide ini? Coba jelaskan dalam hati…</p><button type="button" class="btn-utama" id="rv-show">👀 Tampilkan</button>
            <div id="rv-ans" hidden><p class="idea-body">${escapeHtml(i.body)}</p><div class="end-actions"><button type="button" class="btn-utama" id="rv-ok">✓ Aku ingat</button><button type="button" class="ghost" id="rv-no">✗ Lupa</button></div></div></div>`;
          $("rv-show").onclick = () => { $("rv-ans").hidden = false; $("rv-show").hidden = true; };
          setTimeout(() => {
            $("rv-ok") && ($("rv-ok").onclick = () => { ok++; k++; step(); });
            $("rv-no") && ($("rv-no").onclick = () => { k++; step(); });
          });
        };
        step();
      } catch (e) { $("review-box").innerHTML = `<p class="hint">⚠️ ${escapeHtml(e.message)}</p>`; }
      return;
    }
    if (view === "settings") {
      const sm = st.home.summary;
      setHead(`<h2 class="judul"><span>Topik & Target</span></h2>
        <p>Ikuti topik yang kamu minati — feed <b>✨ Untukmu</b> dibuat dari topik ini (kosong = semua topik).</p>
        <div class="chips" id="wp-follow">${Object.entries(st.home.topics).map(([k, t]) => `<button type="button" class="chip ${sm.follow.includes(k) ? "on" : ""}" data-f="${k}">${t.emoji} ${escapeHtml(t.label)}</button>`).join("")}</div>
        <label class="startpart">🎯 Target harian:
          <select id="wp-goal">${[3, 5, 10, 15].map((g) => `<option value="${g}" ${g === sm.goal ? "selected" : ""}>${g} ide/hari</option>`).join("")}</select></label>
        <button type="button" class="btn-utama" id="wp-save">Simpan</button>
        <h3>📊 Statistik</h3><p>Total ide dibaca: <b>${sm.totalRead}</b> · 🔥 Streak: <b>${sm.streak.count}</b> hari (rekor ${sm.streak.best})</p>
        <h3>🏅 Lencana</h3><div class="hist">${sm.badges.length ? sm.badges.map((b) => `<span>${escapeHtml(b)}</span>`).join("") : `<span>Belum ada — baca ide setiap hari untuk membuka lencana!</span>`}</div>`);
      $("wp-follow").querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => b.classList.toggle("on")));
      $("wp-save").onclick = async () => {
        const follow = [...$("wp-follow").querySelectorAll(".chip.on")].map((b) => b.dataset.f);
        await post("prefs", { follow, goal: Number($("wp-goal").value) });
        await refreshHome();
        toast("✅ Tersimpan. Feed Untukmu diperbarui.");
        st.topic = "foryou";
        openView("feed");
      };
    }
  }

  async function openJourney(jid) {
    st.view = "journey";
    renderPanel();
    setHead(`<p class="hint">⟳ Memuat jalur…</p>`);
    try {
      const d = await get(`journey?id=${jid}`);
      setHead(`<button type="button" class="ghost" id="jr-back">← Semua jalur</button>
        <h2 class="judul"><span>${escapeHtml(d.journey.title)}</span></h2><p>${escapeHtml(d.journey.desc)}</p>
        <div class="meter"><i style="width:${Math.round((d.progress.day / d.journey.days) * 100)}%"></i></div>
        <p class="hint">${d.progress.done ? "🎉 Jalur selesai! Keren." : `Hari ${d.progress.day}/${d.journey.days}`}</p>
        ${d.canUnlock ? `<button type="button" class="btn-utama" id="jr-next">🔓 Buka hari ke-${d.progress.day + 1}</button>` : d.progress.done ? "" : `<p class="hint">✅ Hari ini sudah dibuka. Lanjut besok ya!</p>`}`);
      $("jr-back").onclick = () => openView("journeys");
      d.ideas.forEach((i) => addCard(i));
      $("jr-next")?.addEventListener("click", async (e) => {
        e.currentTarget.disabled = true; e.currentTarget.textContent = "⟳ Membuka…";
        try { const r = await post("journey-next", { id: jid }); badgeToast(r.newBadges); await refreshHome(); openJourney(jid); }
        catch (err) { toast(`⚠️ ${err.message}`); e.currentTarget.disabled = false; }
      });
    } catch (e) { setHead(`<p class="hint">⚠️ ${escapeHtml(e.message)}</p>`); }
  }

  async function refreshHome() { st.home = await get("home"); }

  function onScroll() {
    const m = $("messages");
    if (st.view === "feed" && m.scrollTop + m.clientHeight > m.scrollHeight - 600) loadMore();
  }

  async function show() {
    stopAll();
    $("chat-title").textContent = "🧠 Wawasan · belajar hal baru setiap hari";
    $("messages").addEventListener("scroll", onScroll);
    try { await refreshHome(); } catch (e) { $("messages").innerHTML = `<p class="hint">⚠️ ${escapeHtml(e.message)}</p>`; return; }
    openView(st.view === "journey" || st.view === "search" ? "feed" : st.view);
  }
  function hide() {
    $("messages").removeEventListener("scroll", onScroll);
    st.observer?.disconnect();
    st.timers.forEach(clearTimeout); st.timers.clear();
    panel().hidden = true;
  }
  return { show, hide };
}
