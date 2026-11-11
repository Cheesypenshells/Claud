// Geo Content Studio dashboard — vanilla JS, no build step.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const api = async (path, opts = {}) => {
  const r = await fetch(path, { headers: opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : {}, ...opts });
  if (!r.ok) throw new Error((await r.text()) || r.statusText);
  return r.json();
};
const STAGES = ["research", "concept", "footage", "edit", "review"];
const STAGE_ID = { research: "Riset", concept: "Konsep", footage: "Footage", edit: "Edit", review: "Review" };
const COLORS = ["#ffd400", "#5aa9ff", "#3ecf8e", "#f5a524", "#c58bff", "#ff7aa8", "#7ce0e0"];
let state = { view: "projects", project: null, tab: "overview", timer: null };

const main = $("#main");
document.querySelectorAll("nav a").forEach((a) => a.onclick = () => go(a.dataset.view));

function go(view, extra = {}) {
  Object.assign(state, { view, ...extra });
  document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("active", a.dataset.view === (view === "project" ? "projects" : view)));
  clearInterval(state.timer);
  render();
  if (["project", "projects", "activity", "bank", "premiere"].includes(view)) state.timer = setInterval(render, 2500);
}

async function render() {
  try {
    const fn = { projects: vProjects, project: vProject, bank: vBank, styles: vStyles, activity: vActivity, premiere: vPremiere, toolkit: vToolkit }[state.view];
    await fn();
  } catch (e) { console.error(e); }
}

const stepper = (p) => `<div class="stepper">${STAGES.map((s) => `<span class="step ${p.stages?.[s] || ""}">${STAGE_ID[s]}${p.stages?.[s] && p.stages[s] !== "todo" ? " · " + p.stages[s] : ""}</span>`).join("")}</div>`;

// ------------------------------------------------------------------ projects
async function vProjects() {
  if (!$("#projList")) {
    main.innerHTML = $("#t-projects").innerHTML;
    $("#newBtn").onclick = () => $("#briefForm").classList.toggle("hidden");
    $("#briefForm").onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target), b = Object.fromEntries(f);
      b.duration = +b.duration; b.auto_download = f.has("auto_download"); b.autopilot = f.has("autopilot");
      const p = await api("/api/projects", { method: "POST", body: JSON.stringify(b) });
      go("project", { project: p.id, tab: "overview" });
    };
  }
  const ps = await api("/api/projects");
  $("#projList").innerHTML = ps.length ? ps.map((p) => `<div class="card proj" data-id="${p.id}"><div><b>${esc(p.name)}</b><div class="small mute">ref @${esc(p.brief.reference_handle)} → talent @${esc(p.brief.talent_handle)} · ${p.brief.duration}s</div></div>${stepper(p)}</div>`).join("")
    : `<div class="card mute">Belum ada project. Klik <b>+ Video baru</b>, isi brief, dan tim agent langsung kerja.</div>`;
  document.querySelectorAll(".proj").forEach((el) => el.onclick = () => go("project", { project: el.dataset.id, tab: "overview" }));
}

async function vProject() {
  const p = await api(`/api/projects/${state.project}`);
  const tabs = { overview: "Overview", research: "Riset & Style DNA", concept: "Konsep & Hook", prompter: "Teleprompter & Rekam", edit: "Hasil Edit", review: "Review CD" };
  const focused = document.activeElement && main.contains(document.activeElement) && ["TEXTAREA", "INPUT"].includes(document.activeElement.tagName);
  const recording = state.recorder && state.recorder.state === "recording";
  const sig = `${p.id}:${state.tab}:${p.updated}`;
  const same = $("#projHead")?.dataset.id === p.id;
  if (same && (focused || recording || state.tab === "prompter" || (state.tab !== "overview" && $("#projHead").dataset.sig === sig))) { $("#projSteps").innerHTML = stepper(p); return; }
  main.innerHTML = `<header class="top" id="projHead" data-id="${p.id}" data-sig="${sig}"><div><a class="small mute" onclick="go('projects')" style="cursor:pointer">← Projects</a><h1>${esc(p.name)}</h1></div><div id="projSteps">${stepper(p)}</div></header>
  <div class="tabs">${Object.entries(tabs).map(([k, v]) => `<a data-tab="${k}" class="${state.tab === k ? "active" : ""}">${v}</a>`).join("")}</div>
  <div id="tabBody"></div>`;
  document.querySelectorAll(".tabs a").forEach((a) => a.onclick = () => { state.tab = a.dataset.tab; $("#projHead").dataset.id = ""; render(); });
  const body = $("#tabBody");
  ({ overview: tOverview, research: tResearch, concept: tConcept, prompter: tPrompter, edit: tEdit, review: tReview }[state.tab])(p, body);
}

async function tOverview(p, el) {
  const logs = await api(`/api/logs?project=${p.id}`);
  const next = p.stages.footage === "waiting" ? `<div class="card" style="border-color:var(--acc)"><b>Giliran lu 🎬</b> — script udah jadi. Buka tab <a style="cursor:pointer;text-decoration:underline" onclick="state.tab='prompter';render()">Teleprompter & Rekam</a>, rekam muka lu langsung dari browser atau upload footage.</div>` : "";
  el.innerHTML = `${next}<div class="grid2"><div class="card"><h3>Brief</h3><ul class="clean">
   <li><b>Tema:</b> ${esc(p.brief.topic)}</li><li><b>Pesan:</b> ${esc(p.brief.message || "-")}</li>
   <li><b>Referensi:</b> @${esc(p.brief.reference_handle)} (${esc(p.brief.platform)})</li><li><b>Talent:</b> @${esc(p.brief.talent_handle)}</li><li><b>Durasi:</b> ${p.brief.duration}s</li></ul>
   <h3 style="margin-top:14px">Jalankan ulang stage</h3><div class="row">${["research", "concept", "edit", "review"].map((s) => `<button data-run="${s}">${STAGE_ID[s]}</button>`).join("")}</div>
   ${p.error ? `<p style="color:var(--err)">${esc(p.error)}</p>` : ""}</div>
   <div class="card"><h3>Aktivitas tim</h3><div class="log">${logs.map(logLine).join("")}</div></div></div>`;
  el.querySelectorAll("[data-run]").forEach((b) => b.onclick = () => api(`/api/projects/${p.id}/run/${b.dataset.run}`, { method: "POST" }).then(render));
}

const logLine = (l) => `<div><span class="ts">${new Date(l.ts * 1000).toLocaleTimeString()}</span><span class="a">${esc(l.agent)}</span>${esc(l.msg)}</div>`;

function tResearch(p, el) {
  const s = p.style;
  if (!s) { el.innerHTML = `<div class="card mute">Research agent lagi kerja…</div>`; return; }
  const m = s.metrics || {};
  el.innerHTML = `<div class="card"><h3>Style DNA — ${esc(s.handle)}</h3><p>${esc(s.summary)}</p>
   <div class="kv"><div><b>${m.clips ?? 0}</b><span>klip dianalisa</span></div><div><b>${s.pace}</b><span>pace</span></div><div><b>${s.target_avg_shot_len}s</b><span>rata2 per shot</span></div>
   <div><b>${m.median_cuts_per_min ?? "-"}</b><span>cut / menit</span></div><div><b>${s.target_wpm}</b><span>kata / menit</span></div><div><b>${s.silence_cut_threshold}s</b><span>jeda maks</span></div></div></div>
   <div class="grid2"><div class="card"><h3>Pola hook</h3><ul class="clean">${s.hook_patterns.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
   <h3 style="margin-top:12px">Struktur narasi</h3><ol>${s.narrative_structure.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></div>
   <div class="card"><h3>Editing</h3><ul class="clean"><li><b>Zoom:</b> ${esc(s.zoom_style)}</li><li><b>B-roll:</b> ${esc(s.broll_usage)}</li><li><b>Musik:</b> ${esc(s.music_mood)}</li><li><b>Caption:</b> ${esc(s.caption_preset)}</li><li><b>Tone:</b> ${esc(s.tone_of_voice)}</li></ul>
   <h3 style="margin-top:12px">Signature moves</h3><ul class="clean">${s.signature_moves.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
   <div class="card"><h3>Do</h3><ul class="clean">${s.do.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div><div class="card"><h3>Don't</h3><ul class="clean">${s.dont.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div></div>
   ${(m.hooks || []).length ? `<div class="card"><h3>Hook asli dari referensi (transkrip 3 detik pertama)</h3><ul class="clean">${m.hooks.map((h) => `<li>${esc(h)}</li>`).join("")}</ul></div>` : ""}
   <div class="card"><h3>Riset web</h3><pre class="md">${esc(p.research_notes || "")}</pre></div>`;
}

function tConcept(p, el) {
  const c = p.concept;
  if (!c) { el.innerHTML = `<div class="card mute">Creative Director lagi nyusun konsep…</div>`; return; }
  el.innerHTML = `<div class="card"><h3>${esc(c.title)}</h3><p><b>Angle:</b> ${esc(c.angle)}</p><p class="mute">${esc(c.why_it_works)}</p></div>
  <div class="grid3">${c.hook_options.map((h, i) => `<div class="hook"><div class="t">${esc(h.type)}</div><div>${esc(h.line)}</div><div class="small mute">layar: ${esc(h.on_screen)}</div><button class="small" data-hook="${i}" style="margin-top:6px">Pakai hook ini</button></div>`).join("")}</div>
  <div class="card"><h3>Beat sheet (bisa diedit)</h3>${c.beats.map((b, i) => `<div class="beat"><div><div class="name">${esc(b.name)}</div><div class="small mute">${esc(b.purpose)}</div><div class="small mute">~${b.est_seconds}s · zoom ${b.zoom}</div></div>
   <div><textarea rows="2" data-line="${i}">${esc(b.line)}</textarea><div class="small mute">${esc(b.shot)}</div></div>
   <div><input data-os="${i}" value="${esc(b.on_screen_text)}" placeholder="teks layar"><input data-br="${i}" value="${esc(b.broll_hint)}" placeholder="b-roll keyword" style="margin-top:6px"></div></div>`).join("")}
   <div class="row" style="margin-top:10px"><button class="primary" id="saveConcept">Simpan script</button><span class="mute small">Edit mood: ${esc(c.edit_mood.pace)} · caption ${esc(c.edit_mood.caption_preset)} · musik ${esc(c.edit_mood.music_mood)} · ${esc(c.edit_mood.color_grade)}</span></div></div>
  <div class="grid2"><div class="card"><h3>Tips rekaman</h3><ul class="clean">${c.recording_tips.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
  <div class="card"><h3>Caption post</h3><p>${esc(c.post_caption)}</p><p class="mute">${c.hashtags.map(esc).join(" ")}</p></div></div>`;
  const save = async () => {
    el.querySelectorAll("[data-line]").forEach((t) => c.beats[t.dataset.line].line = t.value);
    el.querySelectorAll("[data-os]").forEach((t) => c.beats[t.dataset.os].on_screen_text = t.value);
    el.querySelectorAll("[data-br]").forEach((t) => c.beats[t.dataset.br].broll_hint = t.value);
    await api(`/api/projects/${p.id}/concept`, { method: "PUT", body: JSON.stringify({ concept: c }) });
    $("#projHead").dataset.id = ""; render();
  };
  $("#saveConcept").onclick = save;
  el.querySelectorAll("[data-hook]").forEach((b) => b.onclick = () => { const h = c.hook_options[b.dataset.hook]; c.beats[0].line = h.line; c.beats[0].on_screen_text = h.on_screen; el.querySelector('[data-line="0"]').value = h.line; el.querySelector('[data-os="0"]').value = h.on_screen; save(); });
}

function tPrompter(p, el) {
  const c = p.concept;
  if (!c) { el.innerHTML = `<div class="card mute">Script belum siap.</div>`; return; }
  el.innerHTML = `<div class="rec"><div><video id="cam" autoplay muted playsinline></video>
    <div class="row" style="margin-top:8px"><button id="camOn">Nyalakan kamera</button><button class="primary hidden" id="recBtn">● Rekam</button></div>
    <p class="small mute">Atau upload file dari HP/kamera:</p><input type="file" id="upl" accept="video/*"><div id="uplMsg" class="small mute"></div>
    ${p.raw ? `<p class="small">Footage terpasang: <b>${esc(p.raw.name)}</b> (${esc(p.raw.status)})</p>` : ""}</div>
    <div style="flex:1;min-width:280px"><div class="row" style="margin-bottom:8px"><button id="scroll">▶ Auto-scroll</button><label class="chk">speed <input type="range" id="spd" min="1" max="8" value="3"></label></div>
    <div class="prompter" id="pr">${c.beats.map((b) => `<p><span class="bn">${esc(b.name)}</span>${esc(b.line)}</p>`).join("")}<p style="height:40vh"></p></div></div></div>`;
  let scrolling = null;
  $("#scroll").onclick = () => { if (scrolling) { clearInterval(scrolling); scrolling = null; $("#scroll").textContent = "▶ Auto-scroll"; } else { scrolling = setInterval(() => $("#pr").scrollTop += +$("#spd").value / 2, 30); $("#scroll").textContent = "⏸ Stop"; } };
  $("#camOn").onclick = async () => {
    state.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1080, height: 1920, facingMode: "user" }, audio: true });
    $("#cam").srcObject = state.stream; $("#recBtn").classList.remove("hidden");
  };
  $("#recBtn").onclick = () => {
    if (state.recorder?.state === "recording") { state.recorder.stop(); return; }
    const chunks = []; state.recorder = new MediaRecorder(state.stream, { mimeType: MediaRecorder.isTypeSupported("video/mp4") ? "video/mp4" : "video/webm" });
    state.recorder.ondataavailable = (e) => chunks.push(e.data);
    state.recorder.onstop = () => { $("#recBtn").textContent = "● Rekam"; const blob = new Blob(chunks, { type: state.recorder.mimeType }); upload(new File([blob], `take_${Date.now()}.${blob.type.includes("mp4") ? "mp4" : "webm"}`)); };
    state.recorder.start(); $("#recBtn").textContent = "■ Stop & kirim ke Editor";
    $("#pr").scrollTop = 0; if (!scrolling) $("#scroll").click();
  };
  const upload = async (file) => {
    $("#uplMsg").textContent = "Upload…"; const fd = new FormData(); fd.append("file", file);
    await api(`/api/projects/${p.id}/footage`, { method: "POST", body: fd });
    $("#uplMsg").textContent = "✓ Terkirim. Editor mulai kerja otomatis — cek tab Hasil Edit.";
  };
  $("#upl").onchange = (e) => e.target.files[0] && upload(e.target.files[0]);
}

function tEdit(p, el) {
  const r = p.report, o = p.outputs;
  if (!r) { el.innerHTML = `<div class="card mute">${p.stages.edit === "running" ? "Editor lagi motong & render…" : "Belum ada footage. Rekam dulu di tab Teleprompter."}</div>`; return; }
  const total = p.edl.segments.reduce((a, s) => a + s.src_out - s.src_in, 0);
  const beats = [...new Set(p.edl.segments.map((s) => s.beat))];
  el.innerHTML = `<div class="player"><video src="${o.final || o.preview}?t=${p.updated}" controls playsinline></video>
   <div style="flex:1;min-width:280px"><div class="kv"><div><b>${r.duration}s</b><span>durasi (dari ${r.source_duration}s)</span></div><div><b>${r.segments}</b><span>shot / jump cut</span></div><div><b>${r.avg_shot_len}s</b><span>rata2 shot (target ${p.style?.target_avg_shot_len ?? "-"}s)</span></div>
   <div><b>${r.retakes_dropped}</b><span>retake dibuang</span></div><div><b>${r.broll_used}</b><span>b-roll</span></div><div><b>${r.captions}</b><span>caption (${esc(r.caption_preset)})</span></div></div>
   <h3 style="margin-top:16px">Timeline</h3><div class="timeline">${p.edl.segments.map((s) => `<div title="${esc(s.beat)} zoom ${s.zoom}" style="flex:${s.src_out - s.src_in};background:${COLORS[beats.indexOf(s.beat) % COLORS.length]};opacity:${s.zoom > 1.04 ? 1 : .6}">${s.zoom > 1.04 ? "⤢" : ""}</div>`).join("")}</div>
   <div class="small mute">${beats.map((b, i) => `<span class="pill" style="color:${COLORS[i % COLORS.length]}">${esc(b)}</span>`).join("")} · ⤢ = punch-in</div>
   <h3 style="margin-top:16px">Export</h3><div class="row">${o.final ? `<a href="${o.final}" download><button class="primary">Download MP4</button></a>` : ""}<a href="${o.xml}" download><button>Premiere XML</button></a><a href="${o.srt}" download><button>Captions SRT</button></a></div>
   <p class="small mute">Sequence juga otomatis dikirim ke Premiere lewat panel <b>Studio Bridge</b>.</p></div></div>`;
}

function tReview(p, el) {
  const r = p.review;
  if (!r) { el.innerHTML = `<div class="card mute">Belum di-review.</div>`; return; }
  el.innerHTML = `<div class="card"><div class="kv"><div><b style="color:${r.verdict === "ship" ? "var(--ok)" : "var(--warn)"}">${r.score}/100</b><span>${r.verdict.toUpperCase()}</span></div></div></div>
  <div class="grid2"><div class="card"><h3>Kekuatan</h3><ul class="clean">${r.strengths.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
  <div class="card"><h3>Revisi</h3><ul class="clean">${r.fixes.map((x) => `<li>${esc(x)}</li>`).join("") || "<li>—</li>"}</ul><button data-re style="margin-top:10px">Re-edit</button></div></div>`;
  $("[data-re]").onclick = () => api(`/api/projects/${p.id}/run/edit`, { method: "POST" }).then(render);
}

// ------------------------------------------------------------------ bank
async function vBank() {
  if (!$("#bankGrid")) {
    main.innerHTML = `<header class="top"><h1>Content Bank</h1></header>
    <div class="grid3"><form class="card" id="fScan"><h3>Index folder hard disk</h3><label>Path folder<input name="folder" placeholder="D:\\Konten\\Broll atau /Volumes/HDD/broll"></label>
      <label>Jenis<select name="type"><option>broll</option><option>music</option><option>reference</option><option>raw</option><option>sfx</option></select></label><label>Tags (koma)<input name="tags" placeholder="city, money, gym"></label><button class="primary">Scan</button></form>
    <form class="card" id="fRef"><h3>Download referensi</h3><label>Handle<input name="handle" value="theoderick_"></label><label>Platform<select name="platform"><option>instagram</option><option>tiktok</option><option>youtube</option></select></label>
      <label>atau URL spesifik (opsional)<input name="url" placeholder="https://www.instagram.com/reel/..."></label><button class="primary">Download & analisa</button></form>
    <form class="card" id="fUp"><h3>Upload file</h3><label>File<input type="file" name="file" required></label><label>Jenis<select name="type"><option>broll</option><option>music</option><option>reference</option><option>raw</option><option>sfx</option></select></label><label>Tags<input name="tags"></label><button class="primary">Upload</button></form></div>
    <div class="row" style="margin:6px 0 12px"><span class="mute">Filter:</span>${["", "reference", "broll", "music", "raw", "sfx"].map((t) => `<button data-f="${t}">${t || "semua"}</button>`).join("")}</div>
    <div class="assets" id="bankGrid"></div>`;
    $("#fScan").onsubmit = async (e) => { e.preventDefault(); const b = Object.fromEntries(new FormData(e.target)); b.tags = b.tags.split(",").map((s) => s.trim()).filter(Boolean); try { const r = await api("/api/assets/scan", { method: "POST", body: JSON.stringify(b) }); alert(`${r.length} file di-index`); } catch (err) { alert(err.message); } };
    $("#fRef").onsubmit = async (e) => { e.preventDefault(); const b = Object.fromEntries(new FormData(e.target)); if (!b.url) delete b.url; await api("/api/assets/import-references", { method: "POST", body: JSON.stringify(b) }); alert("Download jalan di background — pantau Agent Activity"); };
    $("#fUp").onsubmit = async (e) => { e.preventDefault(); await api("/api/assets/upload", { method: "POST", body: new FormData(e.target) }); e.target.reset(); };
    document.querySelectorAll("[data-f]").forEach((b) => b.onclick = () => { state.filter = b.dataset.f; render(); });
  }
  const as = await api(`/api/assets${state.filter ? "?type=" + state.filter : ""}`);
  $("#bankGrid").innerHTML = as.map((a) => `<div class="asset">${a.thumb ? `<img src="${a.thumb}">` : `<img alt="">`}<div class="m"><b title="${esc(a.name)}">${esc(a.name)}</b>
    <span class="pill">${a.type}</span>${a.status !== "ready" ? `<span class="pill">${a.status}</span>` : ""}${(a.tags || []).map((t) => `<span class="pill">#${esc(t)}</span>`).join("")}
    ${a.analysis ? `<div class="mute">${(a.analysis.duration || 0).toFixed(1)}s${a.analysis.cuts_per_min != null ? ` · ${a.analysis.cuts_per_min} cut/m · shot ${a.analysis.avg_shot_len}s` : ""}</div>` : ""}</div></div>`).join("") || `<div class="mute">Bank masih kosong.</div>`;
}

async function vStyles() {
  const ss = await api("/api/styles");
  main.innerHTML = `<header class="top"><h1>Style DNA library</h1></header>` + (ss.map((s) => `<div class="card"><h3>${esc(s.handle)} <span class="pill">${s.pace}</span> <span class="pill">shot ${s.target_avg_shot_len}s</span> <span class="pill">${s.target_wpm} wpm</span></h3><p>${esc(s.summary)}</p><div class="small mute">${s.signature_moves.map(esc).join(" · ")}</div></div>`).join("") || `<div class="card mute">Belum ada. Style DNA dibuat otomatis waktu project jalan.</div>`);
}

async function vActivity() {
  const ls = await api("/api/logs");
  main.innerHTML = `<header class="top"><h1>Agent Activity</h1></header><div class="card log">${ls.map(logLine).join("")}</div>`;
}

async function vPremiere() {
  const [q, done] = await Promise.all([api("/api/premiere/jobs?status=queued"), api("/api/premiere/jobs?status=imported")]);
  main.innerHTML = `<header class="top"><h1>Premiere Bridge</h1></header>
  <div class="card"><h3>Cara konek (sekali saja)</h3><ol>
   <li>Install panel: jalankan <code>scripts/install_premiere_panel</code> (Mac: <code>.sh</code>, Windows: <code>.ps1</code>).</li>
   <li>Buka Premiere Pro → <b>Window → Extensions → Studio Bridge</b>.</li>
   <li>Panel otomatis narik sequence baru dari dashboard ini (localhost:8787), import XML + caption ke project yang lagi kebuka.</li></ol>
   <p class="small mute">Tidak perlu email/password Adobe — panel jalan di dalam Premiere yang udah login di komputer lu.</p></div>
  <div class="grid2"><div class="card"><h3>Antrian (${q.length})</h3>${q.map((j) => `<div>${esc(j.name)} <span class="small mute">${esc(j.xml)}</span></div>`).join("") || '<span class="mute">kosong</span>'}</div>
  <div class="card"><h3>Sudah di-import (${done.length})</h3>${done.map((j) => `<div>${esc(j.name)}</div>`).join("") || '<span class="mute">-</span>'}</div></div>`;
}

async function vToolkit() {
  const rs = await api("/api/toolkit");
  main.innerHTML = `<header class="top"><h1>Toolkit & repo relevan</h1></header>` + rs.map((r) => `<div class="card"><b><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a></b><div class="mute">${esc(r.why)}</div></div>`).join("");
}

(async function boot() {
  const s = await api("/api/status");
  $("#llm").innerHTML = s.llm.online ? `<b class="on">● AI online</b><br>${esc(s.llm.model)}` : `<b class="off">● Offline playbook</b><br>${esc(s.llm.reason || "")}`;
  go("projects");
})();
