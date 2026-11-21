import http from "node:http";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { TUTORS, LANGUAGES, LEVELS, STYLES, VOICE_PROMPT, buildSystemPrompt } from "./tutors.js";
import { threadKey, getThread, appendExchange, clearThread, getProfile, wipeUser, getSkills, getLearnerSamples, getDates, setDate, addXp, addCultureNote, getCultureBook } from "./store.js";
import { CHARACTERS, publicCharacters, MOOD_FILES } from "./characters.js";
import { startScene, playTurn, newState, characterSituation, MAX_TURNS, SUCCESS_MIN_RAPPORT } from "./date.js";
import { weatherAt, localParts, ACTIVITIES, currentActivity } from "./context.js";
import { runAssessment, renderSkills, autoLevelText, RANKS, SKILLS, CEFR, ASSESS_EVERY, MIN_MESSAGES } from "./assess.js";
import { maybeUpdateMemory, renderMemory } from "./memory.js";
import { register, login, logout, currentUser, allUserIds, allUsers, sessionCookie, checkRateLimit, recordFailure, AuthError } from "./auth.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, "public");
const PORT = Number(process.env.PORT) || 3000;
const MODEL = "claude-opus-5-5";
const CONTEXT_MESSAGES = 60; // pesan terakhir yang dikirim apa adanya; sisanya diwakili ingatan
const MAX_CHARS = 4000;
// Fast mode: output hingga ~2,5x lebih cepat dengan harga 2x. Atur FAST_MODE=true di .env.
const FAST_MODE = process.env.FAST_MODE === "true";

// ---------- Kondisi & situasi pengguna ----------
const CONDITIONS = {
  semangat: "feeling energetic and motivated", capek: "tired / exhausted", sedih: "sad / down", stres: "stressed",
  lapar: "hungry", sakit: "feeling sick", kerja: "currently at work / busy", dijalan: "on the way / commuting",
  santai: "relaxing, free time", ngantuk: "sleepy",
};
function cleanCtx(ctx) {
  const c = ctx && typeof ctx === "object" ? ctx : {};
  const lat = Number(c.lat), lon = Number(c.lon);
  return {
    tz: typeof c.tz === "string" && c.tz.length < 64 ? c.tz : "Asia/Jakarta",
    condition: CONDITIONS[c.condition] ? c.condition : null,
    lat: Number.isFinite(lat) && Math.abs(lat) <= 90 ? Math.round(lat * 100) / 100 : null,
    lon: Number.isFinite(lon) && Math.abs(lon) <= 180 ? Math.round(lon * 100) / 100 : null,
  };
}
function gapText(lastTs) {
  if (!lastTs) return "this is your first conversation in this chat";
  const min = (Date.now() - new Date(lastTs).getTime()) / 60e3;
  if (min < 3) return "they replied right away (conversation is flowing)";
  if (min < 60) return `last message was ${Math.round(min)} minutes ago`;
  if (min < 48 * 60) return `they've been away for about ${Math.round(min / 60)} hours`;
  return `they've been away for ${Math.round(min / 1440)} days — notice that`;
}
async function learnerSituation(ctx, lastTs) {
  const local = localParts(ctx.tz);
  const weather = ctx.lat != null && ctx.lon != null ? await weatherAt(ctx.lat, ctx.lon) : null;
  return `local time ${local.text} (${local.part}, timezone ${local.zone})${weather ? `, weather where they are: ${weather}` : ""}; ` +
    `condition: ${ctx.condition ? CONDITIONS[ctx.condition] : "not stated — infer it from how they write and ask if unsure"}; ${gapText(lastTs)}.`;
}
const isRetryableFast = (e) => e instanceof Anthropic.APIError && [400, 429, 529].includes(e.status);

const client = new Anthropic(); // membaca ANTHROPIC_API_KEY dari environment
const busy = new Set(); // satu permintaan per percakapan (per pengguna) pada satu waktu

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg" };

function json(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 50_000) reject(new Error("Body terlalu besar"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function validate(b) {
  if (!TUTORS[b?.tutor]) return "Tutor tidak dikenal";
  if (!LANGUAGES[b.language]) return "Bahasa tidak dikenal";
  if (!LEVELS[b.level] && b.level !== "auto") return "Level tidak dikenal";
  if (!STYLES[b.style]) return "Gaya ngajar tidak dikenal";
  if (b.voice !== undefined && typeof b.voice !== "boolean") return "Parameter voice tidak valid";
  if (b.proactive !== undefined && typeof b.proactive !== "boolean") return "Parameter proactive tidak valid";
  if (!b.proactive && (typeof b.message !== "string" || !b.message.trim() || b.message.length > MAX_CHARS)) return "Pesan kosong atau terlalu panjang";
  return null;
}

const fmtTime = (iso) => new Date(iso).toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short" });

async function handleChat(req, res, user) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: "JSON tidak valid" });
  }
  const err = validate(body);
  if (err) return json(res, 400, { error: err });

  const key = threadKey(body.tutor, body.language);
  const lock = `${user.id}|${key}`;
  if (busy.has(lock)) return json(res, 409, { error: "Tunggu balasan sebelumnya selesai dulu." });
  busy.add(lock);

  const ctx = cleanCtx(body.ctx);
  const thread = await getThread(user.id, key);
  const message = body.proactive
    ? `[SYSTEM NOTE — not typed by the learner: they just opened this chat; ${gapText(thread.at(-1)?.ts)}. Greet them FIRST like a friend who noticed they're back: react to their time of day / condition / weather, call back something from memory if you can, and ask them a question to get the conversation going. Keep it short.]`
    : body.message.trim();
  let recent = thread.slice(-CONTEXT_MESSAGES);
  if (recent[0]?.role === "assistant") recent = recent.slice(1);
  const lastTs = thread.at(-1)?.ts;
  const profile = await getProfile(user.id);
  const assessment = (await getSkills(user.id))[body.language]?.current ?? null;
  const levelText = body.level === "auto" ? autoLevelText(assessment) : LEVELS[body.level];

  const context = [
    renderMemory(profile, LANGUAGES[body.language], user.name),
    renderSkills(assessment),
    `SITUATION (be perceptive about it, but don't recite it): the learner's ${await learnerSituation(ctx, lastTs)}`,
    thread.length > recent.length ? `(Older messages of this chat are summarized in MEMORY.)` : "",
  ].filter(Boolean).join("\n\n");

  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const chatParams = {
    model: MODEL,
    max_tokens: 4000,
    // Chat butuh respons cepat; effort "low" cukup untuk percakapan.
    output_config: { effort: "low" },
    // Jika model menolak (refusal), server Anthropic otomatis mencoba model cadangan.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    cache_control: { type: "ephemeral" },
    system: [
      { type: "text", text: buildSystemPrompt(body.tutor, body.language, levelText, body.style) },
      { type: "text", text: context },
      ...(body.voice ? [{ type: "text", text: VOICE_PROMPT }] : []),
    ],
    messages: [...recent.map(({ role, content }) => ({ role, content })), { role: "user", content: message }],
  };

  let reply = "";
  let aborted = false;
  let stream = null;
  res.on("close", () => {
    if (!res.writableFinished) {
      aborted = true;
      stream?.abort();
    }
  });

  async function runStream(fast) {
    stream = client.beta.messages.stream(fast ? { ...chatParams, speed: "fast" } : chatParams);
    try {
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          reply += event.delta.text;
          send("delta", { text: event.delta.text });
        }
      }
      return await stream.finalMessage();
    } catch (e) {
      if (fast && !reply && !aborted && isRetryableFast(e)) return runStream(false); // fast mode ditolak → mode standar
      throw e;
    }
  }

  try {
    const final = await runStream(FAST_MODE);
    if (final.stop_reason === "refusal") {
      send("error", { error: "Maaf, permintaan ini tidak bisa dijawab. Coba topik lain." });
    }
    send("done", { stop_reason: final.stop_reason });
  } catch (e) {
    if (!aborted && !res.writableEnded) {
      let msg = "Terjadi kesalahan pada server AI. Pastikan ANTHROPIC_API_KEY sudah diset (lihat README).";
      if (e instanceof Anthropic.AuthenticationError) msg = "API key Anthropic tidak valid / belum diset.";
      else if (e instanceof Anthropic.RateLimitError) msg = "Terlalu banyak permintaan, coba lagi sebentar.";
      else if (e instanceof Anthropic.APIError) msg = `Error API (${e.status ?? "?"}): ${e.message}`;
      console.error(e);
      send("error", { error: msg });
    }
  } finally {
    try {
      // Simpan juga balasan yang terpotong, supaya riwayat tetap sama dengan yang dilihat murid.
      if (reply.trim()) {
        await appendExchange(user.id, key, { tutor: body.tutor, language: LANGUAGES[body.language], langId: body.language, level: body.level, voice: !!body.voice, hidden: !!body.proactive }, message, reply);
        maybeUpdateMemory(user.id, { accountName: user.name });
        runAssessment(user.id, body.language, LANGUAGES[body.language]).catch(() => {});
      }
    } finally {
      busy.delete(lock);
      if (!res.writableEnded) res.end();
    }
  }
}

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath === "/" ? "index.html" : urlPath));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

// Foto realistis (opsional): public/characters/<id>/<mood>.(jpg|jpeg|png|webp), walk.mp4, dan public/scenes/<scene>.jpg
const IMG_EXT = ["webp", "jpg", "jpeg", "png"];
function findFile(dir, base, exts) {
  for (const e of exts) {
    try {
      fsSync.accessSync(path.join(PUBLIC_DIR, dir, `${base}.${e}`));
      return `/${dir}/${base}.${e}`;
    } catch {}
  }
  return null;
}
function mediaFor(id) {
  const dir = `characters/${id}`;
  const moods = Object.fromEntries(MOOD_FILES.map((m) => [m, findFile(dir, m, IMG_EXT)]).filter(([, u]) => u));
  return {
    moods,
    portrait: findFile(dir, "portrait", IMG_EXT) ?? moods.neutral ?? moods.happy ?? null,
    video: findFile(dir, "walk", ["mp4", "webm"]),
    scene: findFile("scenes", CHARACTERS[id].scene, IMG_EXT),
  };
}

const secretOf = (c) => ({ likes: c.likes, dislikes: c.dislikes });

function dateLevelText(level, assessment) {
  return level === "auto" || !LEVELS[level] ? autoLevelText(assessment) : LEVELS[level];
}

async function handleDate(req, res, user, charId, action) {
  const c = CHARACTERS[charId];
  const key = threadKey(`date-${charId}`, c.lang);
  const lock = `${user.id}|${key}`;
  const dates = await getDates(user.id);
  const current = dates[charId] ?? null;

  if (req.method === "GET" && !action) {
    return json(res, 200, { state: current, messages: current ? await getThread(user.id, key) : [],
      secret: current && current.status !== "active" ? secretOf(c) : null });
  }
  if (req.method !== "POST" || !action) return json(res, 405, { error: "Metode tidak didukung" });
  const body = await readJson(req);
  if (busy.has(lock)) return json(res, 409, { error: "Tunggu balasan sebelumnya dulu." });
  busy.add(lock);
  try {
    const assessment = (await getSkills(user.id))[c.lang]?.current ?? null;
    const levelText = dateLevelText(body.level, assessment);

    const ctx = cleanCtx(body.ctx);
    const local = localParts(c.tz);
    const situationFor = async (activity, lastTs) => characterSituation(c, {
      local, weather: await weatherAt(c.lat, c.lon), activityId: activity,
      learner: await learnerSituation(ctx, lastTs),
    });

    if (action === "start") {
      const allowed = ["walk", "night", ...c.activities.map((a) => a.id)];
      const activity = allowed.includes(body.activity) ? body.activity : currentActivity(c, local.hour);
      const intro = await startScene(charId, levelText, await situationFor(activity, null));
      await clearThread(user.id, key);
      const state = { ...newState(charId, activity), intro, record: current?.record ?? { success: 0, walked_away: 0, left: 0 } };
      await setDate(user.id, charId, state);
      return json(res, 200, { state, messages: [] });
    }

    // action === "chat"
    if (!current) return json(res, 409, { error: "Mulai adegannya dulu." });
    if (current.status !== "active") return json(res, 409, { error: "Adegan sudah selesai. Tekan \"Mulai lagi\"." });
    if (typeof body.message !== "string" || !body.message.trim() || body.message.length > 1000) return json(res, 400, { error: "Pesan kosong atau terlalu panjang" });
    if (body.voice !== undefined && typeof body.voice !== "boolean") return json(res, 400, { error: "Parameter voice tidak valid" });
    const message = body.message.trim();
    const thread = await getThread(user.id, key);
    const history = thread.slice(-40);
    const situation = await situationFor(current.activity ?? "walk", thread.at(-1)?.ts);
    // Streaming: teks balasan dikirim sambil ditulis (SSE), data lengkap di akhir.
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    let turn, state;
    try {
      ({ turn, state } = await playTurn(charId, levelText, current, history, message, situation, (t) => send("delta", { text: t }), { fast: FAST_MODE }));
    } catch (e) {
      console.error(e);
      let msg = "Karakter lagi bengong (server AI error). Coba lagi.";
      if (e instanceof Anthropic.AuthenticationError) msg = "API key Anthropic tidak valid / belum diset.";
      else if (e instanceof Anthropic.RateLimitError) msg = "Terlalu banyak permintaan, coba lagi sebentar.";
      send("error", { error: msg });
      return res.end();
    }

    if (state.status !== "active") state.record = { ...state.record, [state.status]: (state.record?.[state.status] ?? 0) + 1 };
    await setDate(user.id, charId, state);
    const { reply, ...meta } = turn;
    await appendExchange(user.id, key, { tutor: `date-${charId}`, language: LANGUAGES[c.lang], langId: c.lang, level: body.level ?? "auto", voice: !!body.voice },
      message, reply || "(pergi tanpa bicara)", meta);
    if (state.status === "success") await addXp(user.id, c.lang, 50);
    if (turn.culture_note?.title?.trim() && turn.culture_note.note?.trim()) {
      await addCultureNote(user.id, { charId, name: c.name, flag: c.flag, city: c.city, lang: c.lang, title: turn.culture_note.title.trim(), note: turn.culture_note.note.trim() });
    }
    maybeUpdateMemory(user.id, { accountName: user.name });
    runAssessment(user.id, c.lang, LANGUAGES[c.lang]).catch(() => {});
    send("done", { turn, state, secret: state.status !== "active" ? secretOf(c) : null });
    return res.end();
  } catch (e) {
    if (res.headersSent) { console.error(e); if (!res.writableEnded) res.end(); return; }
    if (e instanceof AuthError) return json(res, e.status, { error: e.message });
    console.error(e);
    let msg = "Karakter lagi bengong (server AI error). Coba lagi.";
    if (e instanceof Anthropic.AuthenticationError) msg = "API key Anthropic tidak valid / belum diset.";
    else if (e instanceof Anthropic.RateLimitError) msg = "Terlalu banyak permintaan, coba lagi sebentar.";
    return json(res, 502, { error: msg });
  } finally {
    busy.delete(lock);
  }
}

async function readJson(req) {
  if (!(req.headers["content-type"] ?? "").startsWith("application/json")) throw new AuthError("Content-Type harus application/json", 415);
  try {
    return JSON.parse(await readBody(req));
  } catch {
    throw new AuthError("JSON tidak valid");
  }
}

async function handleAuth(req, res, action) {
  const ip = req.socket.remoteAddress ?? "?";
  try {
    if (action === "logout") {
      await logout(req);
      res.setHeader("Set-Cookie", sessionCookie(req, null));
      return json(res, 200, { ok: true });
    }
    checkRateLimit(ip);
    const body = await readJson(req);
    const { user, token } = action === "register" ? await register(body) : await login(body);
    res.setHeader("Set-Cookie", sessionCookie(req, token));
    return json(res, 200, { user });
  } catch (e) {
    if (!(e instanceof AuthError)) throw e;
    if (e.status === 401 || e.status === 409) recordFailure(ip);
    return json(res, e.status, { error: e.message });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    // ----- akun (tanpa login) -----
    if (req.method === "POST" && url.pathname === "/api/register") return await handleAuth(req, res, "register");
    if (req.method === "POST" && url.pathname === "/api/login") return await handleAuth(req, res, "login");
    if (req.method === "POST" && url.pathname === "/api/logout") return await handleAuth(req, res, "logout");

    if (url.pathname.startsWith("/api/")) {
      const user = await currentUser(req);
      if (!user) return json(res, 401, { error: "Silakan masuk dulu." });

      if (req.method === "GET" && url.pathname === "/api/me") return json(res, 200, { user });

      if (req.method === "POST" && url.pathname === "/api/chat") {
        if (!(req.headers["content-type"] ?? "").startsWith("application/json")) return json(res, 415, { error: "Content-Type harus application/json" });
        return await handleChat(req, res, user);
      }

      if (req.method === "GET" && url.pathname === "/api/config") {
        return json(res, 200, {
          tutors: Object.fromEntries(Object.entries(TUTORS).map(([id, t]) => [id, { name: t.name, greeting: t.greeting }])),
          languages: LANGUAGES,
        });
      }

      if (url.pathname === "/api/history") {
        const tutor = url.searchParams.get("tutor"), language = url.searchParams.get("language");
        if (!TUTORS[tutor] || !LANGUAGES[language]) return json(res, 400, { error: "Parameter tidak valid" });
        const key = threadKey(tutor, language);
        if (req.method === "GET") return json(res, 200, { messages: await getThread(user.id, key) });
        if (req.method === "DELETE") {
          if (busy.has(`${user.id}|${key}`)) return json(res, 409, { error: "Tunggu balasan selesai dulu." });
          await clearThread(user.id, key);
          return json(res, 200, { ok: true });
        }
      }

      if (["/api/skills", "/api/assess", "/api/leaderboard"].includes(url.pathname)) {
        const langId = url.searchParams.get("language");
        if (!LANGUAGES[langId]) return json(res, 400, { error: "Bahasa tidak dikenal" });

        if (req.method === "GET" && url.pathname === "/api/skills") {
          const sk = (await getSkills(user.id))[langId] ?? { current: null, history: [], xp: 0, since: 0 };
          const samples = (await getLearnerSamples(user.id, langId, 1000)).length;
          return json(res, 200, {
            ...sk, samples, ranks: RANKS, skillNames: SKILLS, levels: CEFR,
            nextIn: sk.current ? Math.max(0, ASSESS_EVERY - sk.since) : Math.max(0, MIN_MESSAGES - samples),
          });
        }
        if (req.method === "POST" && url.pathname === "/api/assess") {
          try {
            const a = await runAssessment(user.id, langId, LANGUAGES[langId], { force: true });
            if (!a) return json(res, 400, { error: `Ngobrol dulu minimal ${MIN_MESSAGES} pesan dalam bahasa ini biar bisa dinilai.` });
            return json(res, 200, { assessment: a });
          } catch {
            return json(res, 502, { error: "Penilaian gagal. Coba lagi sebentar." });
          }
        }
        if (req.method === "GET" && url.pathname === "/api/leaderboard") {
          const rows = [];
          for (const u of await allUsers()) {
            const sk = (await getSkills(u.id))[langId];
            if (!sk?.xp) continue;
            rows.push({ name: u.name, me: u.id === user.id, level: sk.current?.overall ?? null,
              score: sk.current?.overall_score ?? 0, rank: sk.current ? RANKS[sk.current.overall] : "Belum dinilai", xp: sk.xp });
          }
          const order = (r) => (r.level ? CEFR.indexOf(r.level) : -1);
          rows.sort((a, b) => order(b) - order(a) || b.score - a.score || b.xp - a.xp);
          rows.forEach((r, i) => (r.pos = i + 1));
          return json(res, 200, { rows: rows.slice(0, 20), mine: rows.find((r) => r.me) ?? null, total: rows.length });
        }
      }

      // ----- mode Pendekatan -----
      if (req.method === "GET" && url.pathname === "/api/date/characters") {
        const dates = await getDates(user.id);
        const chars = publicCharacters(mediaFor);
        for (const [id, pc] of Object.entries(chars)) {
          const c = CHARACTERS[id];
          const local = localParts(c.tz);
          const act = currentActivity(c, local.hour);
          pc.now = { time: local.text.split("pukul ")[1] ?? local.text, part: local.part, activity: act };
          pc.activities = [...new Set(["walk", ...c.activities.map((a) => a.id)])];
          weatherAt(c.lat, c.lon).catch(() => {}); // panaskan cache cuaca di latar belakang
        }
        return json(res, 200, {
          characters: chars,
          scenePhotos: Object.fromEntries(["city", "park", "beach", "market", "riverside", "lake", "pool", "gym", "cafe"]
            .map((sc) => [sc, findFile("scenes", sc, IMG_EXT)]).filter(([, u]) => u)),
          activities: Object.fromEntries(Object.entries(ACTIVITIES).map(([k, a]) => [k, { emoji: a.emoji, label: a.label, scene: a.scene ?? null, walking: !!a.walking }])),
          states: Object.fromEntries(Object.entries(dates).map(([id, d]) => [id, { status: d.status, rapport: d.rapport, best: d.best, record: d.record }])),
          rules: { maxTurns: MAX_TURNS, successMin: SUCCESS_MIN_RAPPORT },
        });
      }
      if (req.method === "GET" && url.pathname === "/api/date/culture") {
        return json(res, 200, { notes: await getCultureBook(user.id) });
      }
      const dm = url.pathname.match(/^\/api\/date\/([a-z]+)(?:\/(start|chat))?$/);
      if (dm && CHARACTERS[dm[1]]) return await handleDate(req, res, user, dm[1], dm[2]);

      if (url.pathname === "/api/memory") {
        if (req.method === "GET") return json(res, 200, { profile: await getProfile(user.id) });
        if (req.method === "DELETE") {
          await wipeUser(user.id);
          return json(res, 200, { ok: true });
        }
      }
      return json(res, 404, { error: "Tidak ditemukan" });
    }

    if (req.method === "GET") return await serveStatic(req, res);
    res.writeHead(405);
    res.end();
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: "Kesalahan server" });
  }
});

server.listen(PORT, () => {
  console.log(`Cheesy Pen Shells · Tutor Bahasa AI berjalan di http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) console.warn("⚠️  ANTHROPIC_API_KEY belum diset — salin .env.example ke .env lalu isi API key-mu.");
  // proses sisa antrean ingatan dari sesi sebelumnya, per pengguna
  allUserIds().then((ids) => ids.forEach((id) => maybeUpdateMemory(id, { force: true }))).catch((e) => console.error(e));
});
