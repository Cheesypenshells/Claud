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
      const msg = e.error === "not-allowed"
        ? "Izin mikrofon ditolak. Izinkan mikrofon di pengaturan browser."
        : `Gagal mendengar suara (${e.error}).`;
      reject(new Error(msg));
    };
    recognizer.onend = () => {
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

/**
 * Pecah balasan AI jadi bagian-bagian: baris yang diawali "💬" dibaca dengan suara
 * Bahasa Indonesia, sisanya dengan suara bahasa target.
 */
export function splitForSpeech(text, targetLang) {
  const parts = [];
  for (let line of text.split("\n")) {
    const isIndo = line.trim().startsWith("💬");
    line = line.replace(/💬/g, "").replace(/[*_`#>|]/g, ""); // sisa markdown
    // Di kalimat bahasa target, isi kurung biasanya romanisasi → tidak dibaca
    if (!isIndo) line = line.replace(/\([^)]*\)|（[^）]*）/g, "");
    line = line.replace(/[\p{Extended_Pictographic}]/gu, "") // emoji
      .replace(/^\s*(\d+\.|-)\s*/, "")
      .trim();
    if (!line) continue;
    const lang = isIndo ? "id" : targetLang;
    const last = parts.at(-1);
    if (last && last.lang === lang) last.text += " " + line;
    else parts.push({ lang, text: line });
  }
  return parts;
}

let speakToken = 0;

/** Bacakan teks. Resolve ketika selesai (atau dihentikan). */
export function speak(text, targetLang, rate = 0.95, onPart = null, pitch = 1) {
  if (!canSpeak) return Promise.resolve();
  stopSpeaking();
  const token = ++speakToken;
  const parts = splitForSpeech(text, targetLang);
  return new Promise((resolve) => {
    if (!parts.length) return resolve();
    let i = 0;
    const next = () => {
      if (token !== speakToken || i >= parts.length) return resolve();
      const { lang, text } = parts[i++];
      onPart?.(text, lang);
      const u = new SpeechSynthesisUtterance(text);
      u.lang = SPEECH_LANG[lang] ?? lang;
      const v = pickVoice(u.lang);
      if (v) u.voice = v;
      u.rate = rate;
      u.pitch = pitch;
      u.onend = next;
      u.onerror = next;
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
export function createSpeechQueue(targetLang, rate = 0.95, onPart = null, pitch = 1) {
  const token = ++speakToken; // membatalkan bacaan sebelumnya
  if (canSpeak) speechSynthesis.cancel();
  let buf = "";
  let lineIndo = null; // bahasa baris yang sedang ditulis (null = belum diketahui)
  let pending = 0;
  let finished = false;
  let resolveEnd;
  const ended = new Promise((r) => (resolveEnd = r));
  const check = () => { if (finished && pending === 0) resolveEnd(); };

  function say(text, indo) {
    if (!canSpeak || token !== speakToken) return;
    for (const part of splitForSpeech((indo ? "💬 " : "") + text, targetLang)) {
      pending++;
      const u = new SpeechSynthesisUtterance(part.text);
      u.lang = SPEECH_LANG[part.lang] ?? part.lang;
      const v = pickVoice(u.lang);
      if (v) u.voice = v;
      u.rate = rate;
      u.pitch = pitch;
      u.onstart = () => onPart?.(part.text, part.lang);
      u.onend = u.onerror = () => { pending--; check(); };
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
      finished = true;
      check();
      if (!canSpeak || token !== speakToken) return;
      // berhenti juga bila dibatalkan (stopSpeaking) di tengah jalan
      await Promise.race([ended, new Promise((r) => { const iv = setInterval(() => { if (token !== speakToken) { clearInterval(iv); r(); } }, 200); ended.then(() => clearInterval(iv)); })]);
    },
  };
}
