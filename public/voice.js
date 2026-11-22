// Fitur suara memakai Web Speech API bawaan browser (gratis, tanpa API key).
// - SpeechRecognition: ucapan → teks (Chrome, Edge, Safari; tidak didukung Firefox)
// - speechSynthesis: teks → suara (semua browser modern)

export const SPEECH_LANG = {
  en: "en-US", ja: "ja-JP", ko: "ko-KR", zh: "zh-CN",
  ar: "ar-SA", fr: "fr-FR", de: "de-DE", es: "es-ES", id: "id-ID", "en-GB": "en-GB",
};

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = Boolean(Recognition);
export const canSpeak = "speechSynthesis" in window;

// ---------- Pemberitahuan masalah suara (sekali per jenis) ----------
const told = new Set();
export function voiceNotice(kind, msg) {
  if (told.has(kind)) return;
  told.add(kind);
  const el = document.createElement("div");
  el.setAttribute("role", "alert");
  el.style.cssText = "position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:9999;max-width:min(560px,calc(100vw - 32px));" +
    "background:#16226A;color:#fff;border:3px solid #F6B800;border-radius:14px;padding:14px 16px;font:600 .95rem/1.45 system-ui,sans-serif;box-shadow:0 6px 20px #0006";
  el.innerHTML = `${msg}<div style="text-align:right;margin-top:8px"><button type="button" style="background:#F6B800;color:#16226A;border:0;border-radius:8px;padding:6px 14px;font-weight:800">Oke</button></div>`;
  el.querySelector("button").onclick = () => el.remove();
  document.body.append(el);
}

// ---------- Mendengar (mikrofon) ----------
let recognizer = null;

/** Mulai mendengarkan. onInterim(text) dipanggil saat bicara, resolve(text final) saat selesai. */
export function listen(lang, onInterim, { continuous = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!canListen) return reject(new Error("Browser ini belum mendukung input suara. Coba Chrome atau Edge."));
    stopListening();
    recognizer = new Recognition();
    recognizer.lang = SPEECH_LANG[lang] ?? lang;
    recognizer.interimResults = true;
    recognizer.continuous = continuous;
    let finalText = "";
    recognizer.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      onInterim?.((finalText + interim).trim());
    };
    recognizer.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return; // ditangani di onend
      let msg = `Gagal mendengar suara (${e.error}).`;
      if (e.error === "not-allowed") {
        msg = window.isSecureContext
          ? "Izin mikrofon ditolak. Izinkan mikrofon di pengaturan browser."
          : "Mikrofon diblokir karena alamat ini bukan localhost/https. Buka lewat http://localhost:3001 atau atur chrome://flags (lihat README).";
      } else if (["network", "service-not-allowed", "language-not-supported"].includes(e.error)) {
        msg = "Pengenal suara Chrome tidak tersedia di perangkat ini (biasanya karena tidak ada layanan Google, misalnya di tablet Huawei). Pakai ketik, atau pakai HP lain.";
        voiceNotice("stt", "🎙️ " + msg);
      }
      reject(new Error(msg));
    };
    // Perangkat tanpa layanan suara Google (mis. Huawei): mikrofon tidak pernah benar-benar mulai merekam.
    let audioStarted = false;
    recognizer.onaudiostart = () => { audioStarted = true; };
    const sttTimer = setTimeout(() => {
      if (!audioStarted) voiceNotice("stt-silent", "🎙️ Sepertinya Chrome di perangkat ini <b>tidak bisa mengenali suara</b> (biasanya karena tidak ada layanan Google, misalnya di tablet Huawei).<br><br>" +
        "Cara lain: tutup mode robot, ketuk kotak ketik, lalu ketuk <b>ikon 🎤 di keyboard</b> untuk mendikte. Suara robot tetap bisa didengar.");
    }, 6000);
    recognizer.onend = () => {
      clearTimeout(sttTimer);
      recognizer = null;
      resolve(finalText.trim());
    };
    recognizer.start();
  });
}

export function stopListening() {
  if (recognizer) {
    recognizer.onresult = null;
    recognizer.stop();
  }
}

// ---------- Berbicara (text-to-speech) ----------
function pickVoice(langTag) {
  const voices = speechSynthesis.getVoices();
  const base = langTag.split("-")[0];
  return voices.find((v) => v.lang === langTag) ||
    voices.find((v) => v.lang.replace("_", "-").startsWith(base));
}

// Siapkan daftar suara (beberapa browser memuatnya secara async).
if (canSpeak) speechSynthesis.getVoices();

// Deteksi perangkat tanpa mesin suara: kalau bacaan pertama tidak mulai dalam 6 detik,
// suara dimatikan (teks tetap tampil) supaya robot tidak macet menunggu.
let ttsOk = null;
function watchFirst(u) {
  if (ttsOk !== null) return;
  const prevStart = u.onstart;
  const timer = setTimeout(() => {
    if (ttsOk !== null) return;
    ttsOk = false;
    speechSynthesis.cancel();
    voiceNotice("tts", "🔇 Perangkat ini belum punya <b>mesin suara (Text-to-Speech)</b>, jadi Cheesy-Bot tidak bisa bersuara. Balasan tetap tampil sebagai teks.<br><br>" +
      "Cara memperbaiki: buka <b>Pengaturan</b> perangkat → cari <b>\"teks ke ucapan\"</b> → pilih/pasang mesin suara, lalu muat ulang halaman ini.");
    u.onerror?.();
  }, 6000);
  u.onstart = (e) => { ttsOk = true; clearTimeout(timer); prevStart?.(e); };
}
const ttsUsable = () => canSpeak && ttsOk !== false;

// ---------- Emosi dalam suara ----------
// AI boleh menandai kalimat dengan [happy] [excited] [sad] [angry] [surprised] [calm] [whisper] [laugh].
// Tanda tidak ditampilkan; dipakai untuk mengatur nada, kecepatan & volume suara supaya tidak monoton.
export const EMOTIONS = {
  happy:     { pitch: 1.12, rate: 1.05, volume: 1 },
  excited:   { pitch: 1.28, rate: 1.15, volume: 1 },
  sad:       { pitch: 0.82, rate: 0.84, volume: 0.8 },
  angry:     { pitch: 0.9,  rate: 1.12, volume: 1 },
  surprised: { pitch: 1.35, rate: 1.0,  volume: 1 },
  calm:      { pitch: 0.96, rate: 0.9,  volume: 0.9 },
  whisper:   { pitch: 1.0,  rate: 0.85, volume: 0.45 },
  laugh:     { pitch: 1.2,  rate: 1.08, volume: 1, prefix: "Haha! " },
};
const EMO_RE = /\[(happy|excited|sad|angry|surprised|calm|whisper|laugh)\]\s*/gi;
/** Hapus tanda emosi dari teks yang ditampilkan. */
export const stripEmotions = (t) => String(t).replace(EMO_RE, "");
/** Ambil emosi terakhir yang disebut di teks (atau null). */
function lastEmotion(t) {
  let m, last = null;
  EMO_RE.lastIndex = 0;
  while ((m = EMO_RE.exec(t))) last = m[1].toLowerCase();
  return last;
}
function applyVoice(u, part, rate, pitch) {
  const e = EMOTIONS[part.emo] ?? null;
  u.rate = Math.min(2, Math.max(0.5, rate * (e?.rate ?? 1)));
  u.pitch = Math.min(2, Math.max(0.1, pitch * (e?.pitch ?? 1)));
  u.volume = e?.volume ?? 1;
}

/**
 * Pecah balasan AI jadi bagian-bagian: baris yang diawali "💬" dibaca dengan suara
 * Bahasa Indonesia, sisanya dengan suara bahasa target.
 */
export function splitForSpeech(text, targetLang, startEmo = null) {
  const parts = [];
  let emo = startEmo;
  // pecah per tanda emosi supaya tiap bagian punya nadanya sendiri
  const segs = [];
  for (const line of String(text).split("\n")) {
    const isIndoLine = line.trim().startsWith("💬");
    const bits = line.split(/(\[(?:happy|excited|sad|angry|surprised|calm|whisper|laugh)\])/i);
    for (const b of bits) {
      const m = b.match(/^\[(\w+)\]$/);
      if (m) { emo = m[1].toLowerCase(); continue; }
      segs.push({ line: (isIndoLine && !b.trim().startsWith("💬") ? "💬 " : "") + b, emo });
    }
  }
  for (let { line, emo: segEmo } of segs) {
    const isIndo = line.trim().startsWith("💬");
    line = line.replace(/💬/g, "").replace(/[*_`#>|]/g, ""); // sisa markdown
    // Di kalimat bahasa target, isi kurung biasanya romanisasi → tidak dibaca
    if (!isIndo) line = line.replace(/\([^)]*\)|（[^）]*）/g, "");
    line = line.replace(/[\p{Extended_Pictographic}]/gu, "") // emoji
      .replace(/^\s*(\d+\.|-)\s*/, "")
      .trim();
    if (!line) continue;
    const lang = isIndo ? "id" : targetLang;
    const pref = EMOTIONS[segEmo]?.prefix ?? "";
    const last = parts.at(-1);
    if (last && last.lang === lang && last.emo === segEmo) last.text += " " + line;
    else parts.push({ lang, text: pref + line, emo: segEmo });
  }
  return parts;
}

/** Catatan bahasa Indonesia (💬) tidak dibacakan bila ada bagian bahasa target; dibacakan bila hanya itu isinya. */
function dropNotes(parts, targetLang) {
  if (targetLang === "id" || targetLang?.startsWith("id-")) return parts;
  const target = parts.filter((p) => p.lang !== "id");
  return target.length ? target : parts;
}

let speakToken = 0;

/** Bacakan teks. Resolve ketika selesai (atau dihentikan). */
export function speak(text, targetLang, rate = 0.95, onPart = null, pitch = 1, { skipNotes = false } = {}) {
  if (!ttsUsable()) return Promise.resolve();
  stopSpeaking();
  const token = ++speakToken;
  let parts = splitForSpeech(text, targetLang);
  if (skipNotes) parts = dropNotes(parts, targetLang);
  return new Promise((resolve) => {
    if (!parts.length) return resolve();
    let i = 0;
    const next = () => {
      if (token !== speakToken || i >= parts.length || !ttsUsable()) return resolve();
      const part = parts[i++];
      const { lang, text } = part;
      onPart?.(stripEmotions(text), lang);
      const u = new SpeechSynthesisUtterance(text);
      u.lang = SPEECH_LANG[lang] ?? lang;
      const v = pickVoice(u.lang);
      if (v) u.voice = v;
      applyVoice(u, part, rate, pitch);
      let done = false;
      u.onend = u.onerror = () => { if (!done) { done = true; next(); } };
      watchFirst(u);
      speechSynthesis.speak(u);
    };
    next();
  });
}

export function stopSpeaking() {
  speakToken++;
  if (canSpeak) speechSynthesis.cancel();
}

/**
 * Antrean bicara untuk teks yang masih mengalir (streaming): kalimat dibacakan begitu selesai ditulis,
 * tanpa menunggu seluruh balasan. Baris yang diawali "💬" dibaca dengan suara Bahasa Indonesia.
 *   const q = createSpeechQueue("en", 0.95, onPart, 1);  q.push(delta) …  await q.end();
 */
export function createSpeechQueue(targetLang, rate = 0.95, onPart = null, pitch = 1, { skipNotes = false } = {}) {
  const notesOff = skipNotes && !(targetLang === "id" || targetLang?.startsWith("id-"));
  let emo = null;          // emosi yang sedang berlaku (berlanjut antar kalimat)
  let spokeTarget = false; // sudah ada kalimat bahasa target yang dibacakan?
  const heldNotes = [];    // catatan 💬 yang ditahan; dibacakan hanya kalau balasan isinya cuma itu
  const token = ++speakToken; // membatalkan bacaan sebelumnya
  if (canSpeak) speechSynthesis.cancel();
  let buf = "";
  let lineIndo = null; // bahasa baris yang sedang ditulis (null = belum diketahui)
  let pending = 0;
  let finished = false;
  let resolveEnd;
  const ended = new Promise((r) => (resolveEnd = r));
  const check = () => { if (finished && pending === 0) resolveEnd(); };

  function say(text, indo, force = false) {
    if (!ttsUsable() || token !== speakToken) return;
    if (indo && notesOff && !force) { heldNotes.push(text); return; }
    const startEmo = emo;
    emo = lastEmotion(text) ?? emo;
    for (const part of splitForSpeech((indo ? "💬 " : "") + text, targetLang, startEmo)) {
      if (part.lang !== "id") spokeTarget = true;
      pending++;
      const u = new SpeechSynthesisUtterance(part.text);
      u.lang = SPEECH_LANG[part.lang] ?? part.lang;
      const v = pickVoice(u.lang);
      if (v) u.voice = v;
      applyVoice(u, part, rate, pitch);
      u.onstart = () => onPart?.(stripEmotions(part.text), part.lang);
      let done = false;
      u.onend = u.onerror = () => { if (!done) { done = true; pending--; check(); } };
      watchFirst(u);
      speechSynthesis.speak(u);
    }
  }

  function drain(final) {
    for (;;) {
      if (lineIndo === null) {
        const t = buf.replace(/^\s+/, "");
        if (!t) return;
        if (t.length < 2 && !final) return; // tunggu untuk tahu apakah baris diawali 💬
        lineIndo = t.startsWith("💬");
      }
      const nl = buf.indexOf("\n");
      const m = buf.match(/[.!?。！？…](?=\s)|[。！？]/);
      const cut = nl >= 0 && (!m || nl <= m.index) ? nl : m ? m.index + 1 : -1;
      if (cut < 0) {
        if (final && buf.trim()) { say(buf, lineIndo); buf = ""; }
        return;
      }
      const piece = buf.slice(0, cut);
      if (piece.trim()) say(piece, lineIndo);
      buf = buf.slice(cut).replace(/^[ \t]+/, "");
      if (buf.startsWith("\n")) { buf = buf.slice(1); lineIndo = null; }
    }
  }

  return {
    push(text) { if (token === speakToken) { buf += text; drain(false); } },
    async end() {
      if (token === speakToken) drain(true);
      if (notesOff && !spokeTarget) for (const t of heldNotes.splice(0)) say(t, true, true);
      finished = true;
      check();
      if (!canSpeak || token !== speakToken) return;
      // berhenti juga bila dibatalkan (stopSpeaking) di tengah jalan
      await Promise.race([ended, new Promise((r) => { const iv = setInterval(() => { if (token !== speakToken) { clearInterval(iv); r(); } }, 200); ended.then(() => clearInterval(iv)); })]);
    },
  };
}
