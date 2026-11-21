// 🧠 Wawasan: feed kartu ide singkat untuk mengembangkan diri (konten orisinal AI), ala aplikasi "idea feed".
// Fitur: topik & feed Untukmu, scroll tanpa ujung, baca otomatis, suka, simpan ke stash, cari, jalur belajar harian,
// tulis ide sendiri, ulas (flashcard), target harian & streak, lencana, dengarkan, dan baca dalam bahasa yang dipelajari.
import { speak } from "./voice.js";

const SRC_ICON = { buku: "📕", riset: "🔬", konsep: "💡", sejarah: "📜", tokoh: "👤", pengalaman: "✍️" };
const today = () => new Date().toLocaleDateString("en-CA");
const yearText = (y) => (y == null ? "" : y < 0 ? `${-y} SM` : String(y));
const CHAT_SUGGEST = ["Jelaskan lebih sederhana dong", "Kasih contoh di kehidupan sehari-hari", "Gimana nerapinnya di bisnis/kerja?", "Uji pemahamanku", "Apa kata penulisnya persisnya?", "Ada yang membantah ide ini?"];

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
        ${[["feed", "📰 Feed"], ["economics", "📊 Ekonomi"], ["library", "📚 Perpustakaan"], ["books", "📕 Ringkas Buku"], ["stash", "🔖 Stash"], ["journeys", "🧭 Jalur Belajar"], ["write", "✍️ Tulis / Simpan"], ["review", "🔁 Ulas"], ["settings", "⚙️ Topik & Target"]]
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
      <div class="idea-top">${t ? `<span class="idea-topic">${t.emoji} ${escapeHtml(t.label)}</span>` : i.journey ? `<span class="idea-topic">🧭 Hari ${i.day + 1}</span>` : i.book ? `<span class="idea-topic">📕 ${escapeHtml(i.book)}</span>` : i.query ? `<span class="idea-topic">🔍 ${escapeHtml(i.query)}</span>` : ""}
        <span class="idea-min">${i.minutes ?? 1} mnt baca</span>${i.read ? `<span class="idea-read">✓ dibaca</span>` : ""}</div>
      <div class="idea-main">
        <h3 class="idea-title">${escapeHtml(i.title)}</h3>
        <p class="idea-body">${escapeHtml(i.body)}</p>
        ${i.quote ? `<blockquote class="idea-quote">“${escapeHtml(i.quote)}”<span>${escapeHtml(i.quote_id ?? "")}</span><cite>— ${escapeHtml(i.author ?? "")}${i.chapter ? `, ${escapeHtml(i.chapter)}` : ""}</cite></blockquote>` : ""}
        ${i.try_today ? `<p class="idea-try">🎯 <b>Coba hari ini:</b> <span>${escapeHtml(i.try_today)}</span></p>` : ""}
      </div>
      <div class="idea-tr" hidden></div>
      ${i.original ? `<details class="idea-orig"><summary>📄 Lihat teks asli yang kamu simpan</summary><p>${escapeHtml(i.original)}</p></details>` : ""}
      <div class="idea-src">${i.library ? "📚" : SRC_ICON[i.source_type] ?? "💡"} ${i.library ? `<b>${escapeHtml(i.source)}</b> (${escapeHtml(yearText(i.year))})${i.chapter ? ` · ${escapeHtml(i.chapter)}` : ""}${i.gutenberg ? ` · <a href="${escapeHtml(i.gutenberg)}" target="_blank" rel="noopener noreferrer">baca teks asli (gratis)</a>` : ""}` : /^https?:\/\//.test(i.source ?? "") ? `<a href="${escapeHtml(i.source)}" target="_blank" rel="noopener noreferrer">${escapeHtml(i.source.slice(0, 60))}</a>` : escapeHtml(i.source ?? "")}${i.tags?.length ? ` · ${i.tags.map((x) => `#${escapeHtml(x)}`).join(" ")}` : ""}</div>
      <div class="idea-actions">
        <button type="button" data-a="like" class="${i.liked ? "on" : ""}">💡 <span>${i.liked ? "Insightful!" : "Insightful"}</span></button>
        <button type="button" data-a="save" class="${i.stashes?.length ? "on" : ""}">🔖 <span>${i.stashes?.length ? `Di ${escapeHtml(i.stashes[0])}` : "Simpan"}</span></button>
        <button type="button" data-a="chat">💬 Tanya</button>
        <button type="button" data-a="listen">🔊</button>
        ${i.mine ? "" : `<button type="button" data-a="tr" title="Baca dalam ${escapeHtml(L ?? lang)}">🌐 ${escapeHtml((L ?? lang).split(" ")[0])}</button>`}
      </div>
      <div class="idea-chat" hidden></div>`;
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
      const btn = e.currentTarget;
      try {
        const r = await post("like", { id: i.id });
        i.liked = r.liked;
        btn.classList.toggle("on", r.liked);
        btn.querySelector("span").textContent = r.liked ? "Insightful!" : "Insightful";
      } catch (err) { toast(`⚠️ ${err.message}`); }
    };
    el.querySelector('[data-a="save"]').onclick = (e) => stashPicker(i, e.currentTarget);
    el.querySelector('[data-a="chat"]').onclick = () => toggleChat(el, i);
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

  // ---------- 💬 ngobrol tentang ide ----------
  function toggleChat(el, i) {
    const box = el.querySelector(".idea-chat");
    if (!box.hidden) { box.hidden = true; return; }
    box.hidden = false;
    if (box.dataset.ready) { box.querySelector("input")?.focus(); return; }
    makeChat(box, `Hai! Ada yang bikin bingung dari ide <b>"${escapeHtml(i.title)}"</b>? Tanya apa aja — atau pilih di bawah 👇`,
      { id: i.id }, CHAT_SUGGEST.filter((x) => i.library || !x.includes("penulisnya")));
  }

  /** Kotak obrolan tanya-jawab (dipakai di kartu ide & pembaca buku). payload = { id } atau { book, part, paragraph } */
  function makeChat(box, introHtml, payload, suggestions = CHAT_SUGGEST) {
    box.dataset.ready = "1";
    const hist = [];
    box.innerHTML = `<div class="ic-log"><div class="ic-msg bot">${introHtml}</div></div>
      <div class="ic-sugg">${suggestions.map((x) => `<button type="button">${escapeHtml(x)}</button>`).join("")}</div>
      <form class="ic-form"><input maxlength="2000" placeholder="Tulis pertanyaanmu…"><button>Kirim</button></form>`;
    const log = box.querySelector(".ic-log"), input = box.querySelector("input"), btn = box.querySelector(".ic-form button");
    const add = (cls, text) => { const m = document.createElement("div"); m.className = `ic-msg ${cls}`; m.textContent = text; log.append(m); m.scrollIntoView({ block: "nearest" }); return m; };
    const ask = async (q) => {
      if (!q.trim() || btn.disabled) return;
      add("me", q);
      hist.push({ role: "user", content: q });
      input.value = ""; btn.disabled = true;
      const bubble = add("bot typing", "");
      let reply = "";
      try {
        const res = await fetch("/api/insights/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, messages: hist, lang: ctx.lang() }) });
        if (!res.ok) throw new Error((await res.json()).error ?? "Gagal");
        const reader = res.body.getReader(), dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let k;
          while ((k = buf.indexOf("\n\n")) !== -1) {
            const chunk = buf.slice(0, k); buf = buf.slice(k + 2);
            const ev = chunk.match(/^event: (.+)$/m)?.[1];
            const data = JSON.parse(chunk.match(/^data: (.+)$/m)?.[1] ?? "{}");
            if (ev === "delta") { reply += data.text; bubble.textContent = reply; bubble.scrollIntoView({ block: "nearest" }); }
            else if (ev === "error") throw new Error(data.error);
          }
        }
        if (!reply.trim()) throw new Error("Tidak ada jawaban.");
        hist.push({ role: "assistant", content: reply });
      } catch (e) {
        hist.pop();
        bubble.textContent = `⚠️ ${e.message}`;
      } finally {
        bubble.classList.remove("typing");
        btn.disabled = false;
        input.focus();
      }
    };
    box.querySelector(".ic-form").onsubmit = (e) => { e.preventDefault(); ask(input.value); };
    box.querySelectorAll(".ic-sugg button").forEach((b) => (b.onclick = () => ask(b.textContent)));
    input.focus();
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

  async function openView(view, selectStash = null) {
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
    if (view === "economics") {
      setHead(`<h2 class="judul"><span>Ekonomi</span></h2><p class="hint">⟳ Memuat…</p>`);
      try {
        const d = await get("economics");
        const journeys = Object.entries(st.home.journeys).filter(([, j]) => j.topic === "economics");
        setHead(`<h2 class="judul"><span>Ekonomi</span></h2>
          <p>Belajar ekonomi dari <b>para tokohnya langsung</b>: karya klasik yang sudah public domain bisa dibaca utuh & diambil idenya
            (dengan kutipan asli), karya modern diringkas ide pokoknya. Setiap kartu bisa kamu <b>💬 tanyakan</b> sampai paham.</p>
          <div class="chips"><button type="button" class="chip on" id="eco-feed">📊 Buka feed ide Ekonomi</button></div>
          <h3>🧭 Jalur Belajar Ekonomi</h3>
          <div class="journey-grid">${journeys.map(([k, j]) => `<button type="button" class="journey-card ${j.done ? "done" : ""}" data-j="${k}">
            <b>${escapeHtml(j.title)}</b><span>${escapeHtml(j.desc)}</span>
            <div class="meter"><i style="width:${Math.round((j.progress / j.days) * 100)}%"></i></div><span class="jp">${j.done ? "🎉 Selesai" : `${j.progress}/${j.days} hari`}</span></button>`).join("")}</div>
          <h3>👤 Tokoh-Tokoh Ekonomi</h3>
          <div class="eco-grid">${d.economists.map((e, k) => `<div class="eco-card">
            <div class="eco-top"><b>${e.flag} ${escapeHtml(e.name)}</b><span>${escapeHtml(e.years)}</span></div>
            <span class="idea-topic">${escapeHtml(e.school)}</span>
            <p class="eco-bio">${escapeHtml(e.bio)}</p>
            <ul>${e.ideas.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
            <div class="eco-works">${e.works.map((w) => w.lib
              ? `<button type="button" class="chip" data-lib="${w.lib}">📚 ${escapeHtml(w.title)} <em>teks lengkap</em></button>`
              : `<button type="button" class="chip" data-sum="${escapeHtml(w.title)}">📕 ${escapeHtml(w.title.split(" — ")[0])} <em>ringkasan</em></button>`).join("")}</div>
            <button type="button" class="ghost" data-learn="${k}">🔍 Pelajari pemikirannya</button></div>`).join("")}</div>
          <h3>📚 Karya Klasik Ekonomi (public domain, teks lengkap)</h3>
          <div class="journey-grid">${Object.entries(d.books).map(([k, b]) => `<button type="button" class="journey-card lib-card" data-lib="${k}">
            <b>${escapeHtml(b.title)}</b><span class="lib-author">✍️ ${escapeHtml(b.author)} · ${escapeHtml(yearText(b.year))}</span>
            <span>${escapeHtml(b.bio)}</span><span class="jp">${b.saved ? "💾 tersimpan · " : ""}${b.ideas ? `💡 ${b.ideas} ide` : "belum dibuka"}</span></button>`).join("")}</div>
          <h3>📕 Bacaan Modern yang Sering Direkomendasikan</h3>
          <p class="hint">Masih berhak cipta — jadi yang tersedia adalah ringkasan ide pokok dengan kata-kata AI sendiri. Beli/pinjam bukunya untuk membaca utuh.</p>
          <div class="chips">${d.modern.map((t) => `<button type="button" class="chip" data-sum="${escapeHtml(t)}">📕 ${escapeHtml(t)}</button>`).join("")}</div>`);
        $("eco-feed").onclick = () => { st.topic = "economics"; openView("feed"); };
        $("messages").querySelectorAll("[data-j]").forEach((b) => (b.onclick = () => openJourney(b.dataset.j)));
        $("messages").querySelectorAll("[data-lib]").forEach((b) => (b.onclick = () => openLibBook(b.dataset.lib)));
        $("messages").querySelectorAll("[data-sum]").forEach((b) => (b.onclick = () => { st.autoBook = b.dataset.sum; openView("books"); }));
        $("messages").querySelectorAll("[data-learn]").forEach((b) => (b.onclick = () => {
          const e = d.economists[Number(b.dataset.learn)];
          search(`Pemikiran ekonomi ${e.name} (${e.school}): ${e.ideas.join("; ")}`.slice(0, 80));
        }));
      } catch (e) { setHead(`<p class="hint">⚠️ ${escapeHtml(e.message)}</p>`); }
      return;
    }
    if (view === "library") {
      setHead(`<h2 class="judul"><span>Perpustakaan Bebas</span></h2>
        <p>Buku-buku <b>public domain</b> (hak ciptanya sudah habis — legal & gratis) dari <b>Project Gutenberg</b>. Ide diambil langsung dari
          <b>teks aslinya</b>, lengkap dengan penulis, bab, dan kutipan asli + terjemahan. Klik buku untuk mulai.</p><p class="hint">⟳ Memuat katalog…</p>`);
      try {
        const lib = await get("library");
        const { books, download } = lib;
        const byTopic = {};
        for (const [k, b] of Object.entries(books)) (byTopic[b.topic] ??= []).push([k, b]);
        const nSaved = Object.values(books).filter((b) => b.saved).length;
        setHead(`<h2 class="judul"><span>Perpustakaan Bebas</span></h2>
          <p>Buku-buku <b>public domain</b> (hak ciptanya sudah habis — legal & gratis) dari <b>Project Gutenberg</b>, disimpan utuh di server kita.
          Baca langsung di aplikasi, atau ambil ide dari <b>teks aslinya</b> lengkap dengan penulis, bab, dan kutipan asli + terjemahan.</p>
          <div class="dl-row"><button type="button" class="btn-utama" id="lib-dl">⬇️ Simpan semua buku ke server</button>
            <span id="lib-dl-st" class="hint">💾 ${nSaved}/${Object.keys(books).length} buku sudah tersimpan${download.running ? ` · mengunduh ${download.done}/${download.total}…` : ""}</span></div>
          ${Object.entries(byTopic).map(([t, list]) => `<h3>${st.home.topics[t]?.emoji ?? ""} ${escapeHtml(st.home.topics[t]?.label ?? t)}</h3>
            <div class="journey-grid">${list.map(([k, b]) => `<button type="button" class="journey-card lib-card" data-book="${k}">
              <b>${escapeHtml(b.title)}${b.lang !== "en" ? ` <em class="lang-badge">${escapeHtml(b.lang.toUpperCase())}</em>` : ""}</b><span class="lib-author">✍️ ${escapeHtml(b.author)} · ${escapeHtml(yearText(b.year))}</span>
              <span>${escapeHtml(b.bio)}</span><span class="jp">${b.saved ? "💾 tersimpan · " : ""}${b.ideas ? `💡 ${b.ideas} ide${b.done ? " · selesai" : ""}` : "belum dibuka"}</span></button>`).join("")}</div>`).join("")}`);
        $("messages").querySelectorAll("[data-book]").forEach((b) => (b.onclick = () => openLibBook(b.dataset.book)));
        $("lib-dl").onclick = async () => {
          const r = await post("lib-download-all", {});
          toast(`⬇️ Mengunduh ${r.total} buku di latar belakang… (bisa beberapa menit)`);
          const poll = setInterval(async () => {
            if (st.view !== "library") return clearInterval(poll);
            const d = (await get("library")).download;
            const el = $("lib-dl-st");
            if (el) el.textContent = d.running ? `⬇️ Mengunduh ${d.done}/${d.total}…` : `✅ Selesai: ${d.done - d.failed.length}/${d.total} buku tersimpan${d.failed.length ? ` · ${d.failed.length} gagal` : ""}`;
            if (!d.running) { clearInterval(poll); }
          }, 3000);
        };
      } catch (e) { setHead(`<p class="hint">⚠️ ${escapeHtml(e.message)}</p>`); }
      return;
    }
    if (view === "books") {
      const ideas = ["Atomic Habits", "Thinking, Fast and Slow", "Deep Work", "The 7 Habits of Highly Effective People", "Sapiens", "Rich Dad Poor Dad",
        "How to Win Friends and Influence People", "Man's Search for Meaning", "The Psychology of Money", "Never Split the Difference", "Start With Why", "Ikigai"];
      setHead(`<h2 class="judul"><span>Ringkas Buku</span></h2>
        <p>Ketik judul buku apa saja — AI menuliskan <b>ide-ide pokoknya dengan kata-katanya sendiri</b> jadi kartu yang bisa kamu baca, simpan, dengarkan, dan terjemahkan.</p>
        <form id="bk-form" class="wp-search"><input id="bk-q" maxlength="100" placeholder="📕 Judul buku (dan penulis kalau tahu)…"></form>
        <div class="chips">${ideas.map((t) => `<button type="button" class="chip" data-book="${escapeHtml(t)}">📕 ${escapeHtml(t)}</button>`).join("")}</div>
        <p class="hint">Bukan kutipan isi buku — ringkasan ide dengan bahasa sendiri. Kalau AI tidak cukup kenal bukunya, ia akan bilang terus terang.</p>
        <div id="bk-out"></div>`);
      const run = async (t) => {
        const out = $("bk-out");
        out.innerHTML = `<p class="msg error wp-loading">⟳ Meringkas "${escapeHtml(t)}"…</p>`;
        try {
          const d = await get(`book?title=${encodeURIComponent(t)}`);
          if (!d.known) { out.innerHTML = `<p class="hint">🤔 AI tidak cukup yakin mengenal isi buku "${escapeHtml(t)}", jadi tidak mengarang ringkasan. Coba tulis judul lengkap + penulisnya.</p>`; return; }
          out.innerHTML = `<h3>📕 ${escapeHtml(d.book_title)} — ${escapeHtml(d.author)}</h3>`;
          d.ideas.forEach((i) => addCard(i, out));
        } catch (e) { out.innerHTML = `<p class="hint">⚠️ ${escapeHtml(e.message)}</p>`; }
      };
      $("bk-form").onsubmit = (e) => { e.preventDefault(); const t = $("bk-q").value.trim(); if (t.length >= 2) run(t); };
      if (st.autoBook) { const t = st.autoBook; st.autoBook = null; $("bk-q").value = t; run(t); }
      $("messages").querySelectorAll("[data-book]").forEach((b) => (b.onclick = () => run(b.dataset.book)));
      return;
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
      ([...$("messages").querySelectorAll("[data-stash]")].find((b) => b.dataset.stash === selectStash) ?? $("messages").querySelector("[data-stash]"))?.click();
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
        </form>
        <h2 class="judul"><span>Simpan dari Mana Saja</span></h2>
        <form id="wp-import" class="wp-write">
          <p>Baca sesuatu yang bagus di aplikasi lain, artikel, atau buku? Tempel di sini supaya tersimpan rapi di stash pribadimu.</p>
          <label>Teks yang mau disimpan<textarea id="wi-text" rows="6" maxlength="4000" placeholder="Tempel ide / kutipan / catatanmu di sini…"></textarea></label>
          <label>Sumber (opsional)<input id="wi-src" maxlength="300" placeholder="Judul, penulis, atau tautan"></label>
          <label>Simpan ke stash<input id="wi-stash" maxlength="40" value="Dari Bacaan"></label>
          <label class="switch"><input type="checkbox" id="wi-tidy" checked> <span>✨ Rapikan dengan AI jadi kartu ide berbahasa Indonesia (teks aslinya tetap disimpan)</span></label>
          <button class="btn-utama">📥 Simpan</button>
        </form>`);
      $("wp-import").onsubmit = async (e) => {
        e.preventDefault();
        const btn = e.submitter; btn.disabled = true; btn.textContent = "⟳ Menyimpan…";
        try {
          const r = await post("import", { text: $("wi-text").value, source: $("wi-src").value, stash: $("wi-stash").value, tidy: $("wi-tidy").checked });
          toast(`📥 Tersimpan di "${r.stash}"`);
          badgeToast(r.newBadges);
          await refreshHome();
          openView("stash", r.stash);
        } catch (err) { toast(`⚠️ ${err.message}`); btn.disabled = false; btn.textContent = "📥 Simpan"; }
      };
      $("wp-write").onsubmit = async (e) => {
        e.preventDefault();
        try {
          const r = await post("mine", { title: $("ww-title").value, body: $("ww-body").value, try_today: $("ww-try").value, topic: $("ww-topic").value });
          toast("✍️ Ide tersimpan di \"Ide Saya\"");
          badgeToast(r.newBadges);
          await refreshHome();
          openView("stash", "Ide Saya");
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

  async function openLibBook(slug) {
    st.view = "libbook";
    renderPanel();
    setHead(`<button type="button" class="ghost" id="lb-back">← Perpustakaan</button><p class="hint">⟳ Membuka buku… (pertama kali: server mengunduh teks asli dari Project Gutenberg, bisa ±30 detik)</p>`);
    $("lb-back").onclick = () => openView("library");
    let offset = 0;
    const more = async () => {
      const btn = $("lb-more");
      if (btn) { btn.disabled = true; btn.textContent = "⟳ Membaca bagian berikutnya…"; }
      try {
        const d = await get(`libbook?id=${slug}&offset=${offset}`);
        if (offset === 0) {
          const b = d.book;
          setHead(`<button type="button" class="ghost" id="lb-back">← Perpustakaan</button>
            <div class="book-head"><b>${escapeHtml(b.title)}</b><span>✍️ ${escapeHtml(b.author)} · ${escapeHtml(yearText(b.year))}</span>
              <p>${escapeHtml(b.bio)}</p>
              <div class="end-actions" style="justify-content:flex-start"><button type="button" class="btn-utama" id="lb-read">📖 Baca buku lengkap di sini</button>
              ${d.url ? `<a href="${escapeHtml(d.url)}" target="_blank" rel="noopener noreferrer">sumber: Project Gutenberg</a>` : ""}</div></div>
            <div id="lb-list"></div><button type="button" class="btn-utama" id="lb-more">📖 Ambil 3 ide berikutnya dari buku</button>`);
          $("lb-back").onclick = () => openView("library");
          $("lb-more").onclick = more;
          $("lb-read").onclick = () => openReader(slug, 0);
        }
        d.ideas.forEach((i) => addCard(i, $("lb-list")));
        offset = d.next;
        const btn2 = $("lb-more");
        if (d.done && d.ideas.length < 3) { btn2.textContent = "🎉 Semua bagian buku sudah dibaca"; btn2.disabled = true; }
        else { btn2.disabled = false; btn2.textContent = "📖 Ambil 3 ide berikutnya dari buku"; }
      } catch (e) {
        if (offset === 0) setHead(`<button type="button" class="ghost" id="lb-back">← Perpustakaan</button><p class="hint">⚠️ ${escapeHtml(e.message)}</p>`), ($("lb-back").onclick = () => openView("library"));
        else { toast(`⚠️ ${e.message}`); const b3 = $("lb-more"); if (b3) { b3.disabled = false; b3.textContent = "📖 Coba lagi"; } }
      }
    };
    more();
  }

  // ---------- 📖 pembaca buku ----------
  async function openReader(slug, part) {
    st.view = "reader";
    renderPanel();
    setHead(`<p class="hint">⟳ Membuka bagian ${part + 1}…</p>`);
    let d;
    try { d = await get(`libtext?id=${slug}&part=${part}`); }
    catch (e) { setHead(`<button type="button" class="ghost" id="rd-back">← Kembali</button><p class="hint">⚠️ ${escapeHtml(e.message)}</p>`); $("rd-back").onclick = () => openLibBook(slug); return; }
    const paras = d.text.split(/\n\s*\n/).map((x) => x.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
    const nav = (pos) => `<div class="rd-nav">
        <button type="button" class="ghost" data-go="${d.part - 1}" ${d.part === 0 ? "disabled" : ""}>← Sebelumnya</button>
        <select class="rd-toc">${d.toc.map((t) => `<option value="${t.part}" ${t.part <= d.part ? "selected" : ""}>${escapeHtml(t.heading.slice(0, 60))} (bagian ${t.part + 1})</option>`).join("")}</select>
        <span class="hint">${d.part + 1}/${d.total}</span>
        <button type="button" class="ghost" data-go="${d.part + 1}" ${d.part >= d.total - 1 ? "disabled" : ""}>Berikutnya →</button></div>`;
    setHead(`<button type="button" class="ghost" id="rd-back">← ${escapeHtml(d.book.title)}</button>
      <div class="book-head"><b>${escapeHtml(d.book.title)}</b><span>✍️ ${escapeHtml(d.book.author)} · ${escapeHtml(yearText(d.book.year))} · public domain</span></div>
      ${nav("top")}
      <div class="reader" lang="${escapeHtml(d.book.lang)}">${paras.map((p, k) => `<div class="rd-p" data-k="${k}"><p>${escapeHtml(p)}</p>
        <div class="rd-act"><button type="button" data-r="tr">🌐 Terjemahkan</button><button type="button" data-r="save">🔖 Simpan</button><button type="button" data-r="ask">💬 Tanya</button><button type="button" data-r="say">🔊</button></div></div>`).join("")}</div>
      <div class="rd-chat-wrap"><h3>💬 Tanya tentang bagian ini</h3><div class="idea-chat rd-chat"></div></div>
      ${nav("bottom")}`);
    $("rd-back").onclick = () => openLibBook(slug);
    $("messages").querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => openReader(slug, Number(b.dataset.go))));
    $("messages").querySelectorAll(".rd-toc").forEach((sel) => (sel.onchange = () => openReader(slug, Number(sel.value))));
    const chatBox = $("messages").querySelector(".rd-chat");
    makeChat(chatBox, `Lagi baca <b>${escapeHtml(d.book.title)}</b> bagian ${d.part + 1}. Bingung di mana? Tanya aja — aku jawab berdasarkan teks aslinya 📖`,
      { book: slug, part: d.part }, ["Ringkas bagian ini dong", "Apa pelajaran utamanya?", "Jelaskan kata-kata sulitnya", "Apa relevansinya buat hidupku sekarang?"]);
    $("messages").querySelectorAll(".rd-p").forEach((el) => {
      const text = paras[Number(el.dataset.k)];
      el.querySelector('[data-r="tr"]').onclick = async (e) => {
        const ex = el.querySelector(".rd-tr");
        if (ex) { ex.remove(); return; }
        const btn = e.currentTarget;
        btn.disabled = true;
        try { const r = await post("translate-text", { text }); el.querySelector("p").insertAdjacentHTML("afterend", `<p class="rd-tr">🇮🇩 ${escapeHtml(r.text)}</p>`); }
        catch (err) { toast(`⚠️ ${err.message}`); }
        finally { btn.disabled = false; }
      };
      el.querySelector('[data-r="save"]').onclick = async () => {
        try {
          await post("import", { text, source: `${d.book.title} — ${d.book.author}, bagian ${d.part + 1}`, stash: d.book.title.slice(0, 40), tidy: false });
          toast(`🔖 Paragraf disimpan ke stash "${d.book.title.slice(0, 40)}"`);
          refreshHome();
        } catch (err) { toast(`⚠️ ${err.message}`); }
      };
      el.querySelector('[data-r="ask"]').onclick = () => {
        makeChat(chatBox, `Oke, kita bahas paragraf ini ya: <i>"${escapeHtml(text.slice(0, 160))}${text.length > 160 ? "…" : ""}"</i> — mau tanya apa?`,
          { book: slug, part: d.part, paragraph: text }, ["Artinya apa?", "Jelaskan kata-kata sulitnya", "Kasih contoh zaman sekarang", "Penulis setuju dengan apa di sini?"]);
        chatBox.scrollIntoView({ behavior: "smooth", block: "center" });
      };
      el.querySelector('[data-r="say"]').onclick = () => { stopAll(); speak(text, d.book.lang === "en" ? "en-GB" : d.book.lang, rate()); };
    });
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
        const btn = e.currentTarget;
        btn.disabled = true; btn.textContent = "⟳ Membuka…";
        try { const r = await post("journey-next", { id: jid }); badgeToast(r.newBadges); await refreshHome(); openJourney(jid); }
        catch (err) { toast(`⚠️ ${err.message}`); btn.disabled = false; btn.textContent = "🔓 Coba lagi"; }
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
