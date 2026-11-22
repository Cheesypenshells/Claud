import http from "node:http";
import os from "node:os";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { TUTORS, LANGUAGES, LEVELS, STYLES, VOICE_PROMPT, buildSystemPrompt } from "./tutors.js";
import { threadKey, getThread, appendExchange, clearThread, getProfile, wipeUser, getSkills, getLearnerSamples, getDates, setDate, addXp, addCultureNote, getCultureBook, getIelts, saveIelts, insightState, markRead, updateInsights, BADGE_LABELS } from "./store.js";
import { TOPICS, JOURNEYS, topicIdeas, searchIdeas, journeyDay, translateIdea, getIdeas, hasIdea, bookIdeas, formatImported, libraryIdeas, libraryStatus, chatAboutIdea, translateText } from "./insights.js";
import { LIBRARY, bookPart, downloadedSet, downloadAll, downloadStatus } from "./library.js";
import { ECONOMISTS, MODERN_READS } from "./economics.js";
import { NEWS_CATEGORIES, getNews, getNewsItem, topHeadlines, startDailyNews, chatWithSearch, jakartaDate } from "./news.js";
import { newSession, nextStep, makeCue, examinerTurn, answerFeedback, finalReport, answerMetrics } from "./ielts.js";
import { CHARACTERS, publicCharacters, MOOD_FILES } from "./characters.js";
import { startScene, playTurn, newState, characterSituation, MAX_TURNS, SUCCESS_MIN_RAPPORT } from "./date.js";
import { weatherAt, localParts, ACTIVITIES, currentActivity } from "./context.js";
import { outfitFor, localDate } from "./outfit.js";
import { ensureLife, lifeToday, lifeWithin } from "./life.js";
import { runAssessment, renderSkills, autoLevelText, RANKS, SKILLS, CEFR, ASSESS_EVERY, MIN_MESSAGES } from "./assess.js";
import { maybeUpdateMemory, renderMemory } from "./memory.js";
import { ENGLISH_VARIETIES } from "./accents.js";
import { register, login, logout, currentUser, allUserIds, allUsers, sessionCookie, checkRateLimit, recordFailure, AuthError } from "./auth.js";
import { MODEL, fallbackParams, SUPPORTS_FAST } from "./model.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, "public");
const PORT = Number(process.env.PORT) || 3000;
const CONTEXT_MESSAGES = 60; // pesan terakhir yang dikirim apa adanya; sisanya diwakili ingatan
const MAX_CHARS = 4000;
// Fast mode: output hingga ~2,5x lebih cepat dengan harga 2x. Atur FAST_MODE=true di .env.
const FAST_MODE = process.env.FAST_MODE === "true" && SUPPORTS_FAST;

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
  if (b.variety !== undefined && !ENGLISH_VARIETIES[b.variety]) return "Varian bahasa Inggris tidak dikenal";
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
    await (async () => {
      const h = await topHeadlines(6);
      return h.length ? `TODAY'S NEWS HEADLINES (real, from today's news digest — use only when natural: as a conversation starter, for vocabulary practice, or if the learner asks "what's new"; don't force it, don't invent details beyond the headline):\n${h.map((x) => `- ${x}`).join("\n")}` : "";
    })(),
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
    ...fallbackParams(),
    cache_control: { type: "ephemeral" },
    system: [
      { type: "text", text: buildSystemPrompt(body.tutor, body.language, levelText, body.style, body.variety) },
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
    const today = await lifeToday(charId, localDate(c.tz));
    if (!today) {
      const lp = localParts(c.tz);
      ensureLife(charId, c, localDate(c.tz), { localText: lp.text, weather: await weatherAt(c.lat, c.lon), outfitDesc: outfitFor(c, localDate(c.tz), currentActivity(c, lp.hour)).desc_id }).catch(() => {});
    }
    return json(res, 200, { state: current, messages: current ? await getThread(user.id, key) : [],
      profile: { ...c.life, job: c.job, jobEmoji: c.jobEmoji, personality: c.personality, today },
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
    const dateStr = localDate(c.tz);
    const situationFor = async (activity, lastTs, extra) => characterSituation(c, {
      local, weather: await weatherAt(c.lat, c.lon), activityId: activity,
      learner: await learnerSituation(ctx, lastTs), ...extra,
    });

    if (action === "start") {
      const allowed = ["walk", "night", ...c.activities.map((a) => a.id)];
      const activity = allowed.includes(body.activity) ? body.activity : currentActivity(c, local.hour);
      const outfit = outfitFor(c, dateStr, activity);
      const newLook = !!(current?.lastLook && current.lastLook !== outfit.key);
      const meetings = (current?.meetings ?? 0) + 1;
      const lastOutcome = current && current.status !== "active" ? current.status : null;
      const weather = await weatherAt(c.lat, c.lon);
      const life = await lifeWithin(ensureLife(charId, c, dateStr, { localText: local.text, weather, outfitDesc: outfit.desc_id }), 9000);
      const extra = { outfit: outfit.desc_id, newLook, life, meetings, lastOutcome };
      const intro = await startScene(charId, levelText, await situationFor(activity, null, extra));
      await clearThread(user.id, key);
      const state = { ...newState(charId, activity), intro, record: current?.record ?? { success: 0, walked_away: 0, left: 0 },
        outfit: { look: outfit.look, desc_id: outfit.desc_id }, newLook, lastLook: outfit.key, meetings, lastOutcome };
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
    const situation = await situationFor(current.activity ?? "walk", thread.at(-1)?.ts, {
      outfit: current.outfit?.desc_id, newLook: current.newLook, life: await lifeToday(charId, dateStr),
      meetings: current.meetings ?? 1, lastOutcome: current.lastOutcome,
    });
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

// ---------- 🧠 Wawasan ----------
const isDate = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
async function handleInsights(req, res, user, action, url) {
  const s = await insightState(user.id);
  const decorate = (ideas) => ideas.map((i) => ({ ...i, read: !!s.read[i.id], liked: !!s.likes[i.id],
    stashes: Object.entries(s.stashes).filter(([, ids]) => ids.includes(i.id)).map(([n]) => n) }));
  const mineById = (id) => s.mine.find((m) => m.id === id);
  const resolve = async (ids) => [...(await getIdeas(ids.filter((x) => !x.startsWith("m_")))), ...ids.filter((x) => x.startsWith("m_")).map(mineById).filter(Boolean)];
  const summary = (date) => ({
    follow: s.follow, goal: s.goal, today: s.daily[date] ?? 0, streak: s.streak, totalRead: Object.keys(s.read).length,
    badges: s.badges.map((k) => BADGE_LABELS[k]), stashes: Object.fromEntries(Object.entries(s.stashes).map(([n, ids]) => [n, ids.length])),
  });
  const q = url.searchParams;

  if (req.method === "GET") {
    const date = isDate(q.get("date")) ? q.get("date") : new Date().toISOString().slice(0, 10);
    if (action === "home") {
      return json(res, 200, { topics: TOPICS, summary: summary(date),
        journeys: Object.fromEntries(Object.entries(JOURNEYS).map(([k, j]) => [k, { ...j, progress: s.journeys[k]?.day ?? 0, done: !!s.journeys[k]?.done, last: s.journeys[k]?.last ?? null }])) });
    }
    if (action === "feed") {
      const topic = q.get("topic") ?? "foryou";
      const offset = Math.max(0, Math.min(5000, Number(q.get("offset")) || 0));
      let ideas;
      if (topic === "foryou") {
        const pool = (s.follow.length ? s.follow : Object.keys(TOPICS)).filter((t) => TOPICS[t]);
        const picks = Array.from({ length: 6 }, (_, i) => [pool[(offset + i) % pool.length], Math.floor((offset + i) / pool.length)]);
        ideas = (await Promise.all(picks.map(([t, idx]) => topicIdeas(t, idx, 1)))).flat();
      } else if (TOPICS[topic]) ideas = await topicIdeas(topic, offset, 6);
      else return json(res, 400, { error: "Topik tidak dikenal" });
      return json(res, 200, { ideas: decorate(ideas), next: offset + 6 });
    }
    if (action === "search") {
      const term = (q.get("q") ?? "").trim();
      if (term.length < 2 || term.length > 80) return json(res, 400, { error: "Kata kunci 2–80 karakter" });
      return json(res, 200, { ideas: decorate(await searchIdeas(term)) });
    }
    if (action === "library") {
      const status = await libraryStatus();
      const saved = await downloadedSet();
      return json(res, 200, { download: downloadStatus(),
        books: Object.fromEntries(Object.entries(LIBRARY).map(([k, b]) => [k, { title: b.title, author: b.author, year: b.year, topic: b.topic, bio: b.bio, lang: b.lang ?? "en", saved: saved.has(k), ...status[k] }])) });
    }
    if (action === "economics") {
      const status = await libraryStatus();
      const saved = await downloadedSet();
      return json(res, 200, { economists: ECONOMISTS, modern: MODERN_READS,
        books: Object.fromEntries(Object.entries(LIBRARY).filter(([, b]) => b.topic === "economics")
          .map(([k, b]) => [k, { title: b.title, author: b.author, year: b.year, bio: b.bio, saved: saved.has(k), ...status[k] }])) });
    }
    if (action === "libtext") {
      const slug = q.get("id");
      if (!LIBRARY[slug]) return json(res, 404, { error: "Buku tidak ada di katalog" });
      try {
        const part = await bookPart(slug, Math.max(0, Number(q.get("part")) || 0));
        const b = LIBRARY[slug];
        return json(res, 200, { ...part, book: { title: b.title, author: b.author, year: b.year, bio: b.bio, lang: b.lang ?? "en" } });
      } catch (e) {
        console.error(e);
        return json(res, 502, { error: `${e.message}. Pastikan komputer server terhubung ke internet (Project Gutenberg).` });
      }
    }
    if (action === "libbook") {
      const slug = q.get("id");
      if (!LIBRARY[slug]) return json(res, 404, { error: "Buku tidak ada di katalog" });
      const offset = Math.max(0, Math.min(2000, Number(q.get("offset")) || 0));
      try {
        const r = await libraryIdeas(slug, offset, 3);
        return json(res, 200, { ...r, ideas: decorate(r.ideas), next: offset + r.ideas.length, book: { ...LIBRARY[slug], q: undefined, match: undefined } });
      } catch (e) {
        console.error(e);
        return json(res, 502, { error: `${e.message}. Pastikan komputer server terhubung ke internet (Project Gutenberg).` });
      }
    }
    if (action === "book") {
      const title = (q.get("title") ?? "").trim();
      if (title.length < 2 || title.length > 100) return json(res, 400, { error: "Judul buku 2–100 karakter" });
      const b = await bookIdeas(title);
      return json(res, 200, { ...b, ideas: decorate(b.ideas) });
    }
    if (action === "stash") {
      const name = q.get("name");
      if (!s.stashes[name]) return json(res, 404, { error: "Stash tidak ditemukan" });
      return json(res, 200, { ideas: decorate(await resolve([...s.stashes[name]].reverse())) });
    }
    if (action === "review") {
      const all = [...new Set(Object.values(s.stashes).flat())];
      const pick = all.sort(() => Math.random() - 0.5).slice(0, 5);
      return json(res, 200, { ideas: decorate(await resolve(pick)) });
    }
    if (action === "journey") {
      const jid = q.get("id");
      if (!JOURNEYS[jid]) return json(res, 404, { error: "Jalur tidak ditemukan" });
      const p = s.journeys[jid] ?? { day: 0 };
      const ideas = [];
      for (let d = 0; d < p.day; d++) ideas.push(await journeyDay(jid, d));
      return json(res, 200, { journey: JOURNEYS[jid], progress: p, ideas: decorate(ideas), canUnlock: !p.done && p.last !== date });
    }
    return json(res, 404, { error: "Tidak ditemukan" });
  }

  if (req.method !== "POST") return json(res, 405, { error: "Metode tidak didukung" });
  const body = await readJson(req);
  const date = isDate(body.date) ? body.date : new Date().toISOString().slice(0, 10);
  const validId = async (id) => typeof id === "string" && (id.startsWith("m_") ? !!mineById(id) : await hasIdea(id));

  if (action === "read") {
    if (!(await validId(body.id))) return json(res, 400, { error: "Ide tidak dikenal" });
    const r = await markRead(user.id, body.id, date);
    return json(res, 200, { ...r, newBadges: r.newBadges.map((k) => BADGE_LABELS[k]) });
  }
  if (action === "like") {
    if (!(await validId(body.id))) return json(res, 400, { error: "Ide tidak dikenal" });
    const { out } = await updateInsights(user.id, (st) => { if (st.likes[body.id]) delete st.likes[body.id]; else st.likes[body.id] = 1; return !!st.likes[body.id]; });
    return json(res, 200, { liked: out });
  }
  if (action === "save" || action === "unsave") {
    const name = String(body.stash ?? "Favorit").trim().slice(0, 40) || "Favorit";
    if (!(await validId(body.id))) return json(res, 400, { error: "Ide tidak dikenal" });
    const { out, newBadges } = await updateInsights(user.id, (st) => {
      if (Object.keys(st.stashes).length >= 30 && !st.stashes[name]) return false;
      const list = (st.stashes[name] ??= []);
      if (action === "save" && !list.includes(body.id)) list.push(body.id);
      if (action === "unsave") st.stashes[name] = list.filter((x) => x !== body.id);
      return true;
    });
    if (!out) return json(res, 400, { error: "Maksimal 30 stash" });
    return json(res, 200, { ok: true, newBadges: newBadges.map((k) => BADGE_LABELS[k]) });
  }
  if (action === "stash-delete") {
    await updateInsights(user.id, (st) => { if (body.name !== "Favorit") delete st.stashes[body.name]; });
    return json(res, 200, { ok: true });
  }
  if (action === "prefs") {
    const follow = Array.isArray(body.follow) ? body.follow.filter((t) => TOPICS[t]).slice(0, 19) : undefined;
    const goal = [3, 5, 10, 15].includes(Number(body.goal)) ? Number(body.goal) : undefined;
    await updateInsights(user.id, (st) => { if (follow) st.follow = follow; if (goal) st.goal = goal; });
    return json(res, 200, { ok: true });
  }
  if (action === "mine") {
    const title = String(body.title ?? "").trim(), text = String(body.body ?? "").trim();
    if (title.length < 3 || title.length > 100 || text.length < 10 || text.length > 1500) return json(res, 400, { error: "Judul 3–100 karakter, isi 10–1500 karakter." });
    const idea = { id: "m_" + Date.now().toString(36), title, body: text, try_today: String(body.try_today ?? "").trim().slice(0, 200),
      source_type: "pengalaman", source: `Ide milik ${user.name}`, tags: [], topic: TOPICS[body.topic] ? body.topic : "rare", minutes: 1, mine: true, at: new Date().toISOString() };
    const { newBadges } = await updateInsights(user.id, (st) => { st.mine.push(idea); (st.stashes["Ide Saya"] ??= []).push(idea.id); });
    return json(res, 200, { idea, newBadges: newBadges.map((k) => BADGE_LABELS[k]) });
  }
  if (action === "import") {
    const text = String(body.text ?? "").trim();
    const source = String(body.source ?? "").trim().slice(0, 300);
    if (text.length < 20 || text.length > 4000) return json(res, 400, { error: "Tempel teks 20–4000 karakter." });
    let card;
    if (body.tidy) {
      try { card = await formatImported(text); } catch (e) { console.error(e); return json(res, 502, { error: "AI gagal merapikan. Coba lagi atau matikan opsi rapikan." }); }
    } else card = { title: text.split(/[.!?\n]/)[0].slice(0, 90), body: text, try_today: "", tags: [] };
    const idea = { id: "m_" + Date.now().toString(36), ...card, source_type: "pengalaman", source: source || "Catatan pribadi", original: body.tidy ? text : undefined,
      topic: TOPICS[body.topic] ? body.topic : "rare", minutes: Math.max(1, Math.round(card.body.split(/\s+/).length / 180)), mine: true, at: new Date().toISOString() };
    const stash = String(body.stash ?? "Dari Bacaan").trim().slice(0, 40) || "Dari Bacaan";
    const { newBadges } = await updateInsights(user.id, (st) => { st.mine.push(idea); (st.stashes[stash] ??= []).push(idea.id); });
    return json(res, 200, { idea, stash, newBadges: newBadges.map((k) => BADGE_LABELS[k]) });
  }
  if (action === "lib-download-all") return json(res, 200, downloadAll());
  if (action === "translate-text") {
    const text = String(body.text ?? "").trim();
    if (text.length < 2 || text.length > 6000) return json(res, 400, { error: "Teks 2–6000 karakter" });
    const to = LANGUAGES[body.to] ? LANGUAGES[body.to] : "Indonesian";
    try { return json(res, 200, { text: await translateText(text, to) }); }
    catch (e) { console.error(e); return json(res, 502, { error: "Terjemahan gagal. Coba lagi." }); }
  }
  if (action === "chat") {
    const isMine = typeof body.id === "string" && body.id.startsWith("m_");
    let idea;
    if (body.book) {
      // ngobrol tentang bagian buku yang sedang dibaca
      const b = LIBRARY[body.book];
      if (!b) return json(res, 400, { error: "Buku tidak dikenal" });
      const part = Math.max(0, Number(body.part) || 0);
      const para = String(body.paragraph ?? "").slice(0, 3000);
      idea = { title: `${b.title} (bagian ${part + 1})`, body: para ? `Paragraf yang ditanyakan: ${para}` : "Pembaca sedang membaca bagian ini dan ingin berdiskusi.",
        source: `${b.title} — ${b.author}`, library: body.book, chunk: part, chapter: "" };
    } else idea = isMine ? mineById(body.id) : (await getIdeas([body.id]))[0];
    if (!idea) return json(res, 400, { error: "Ide tidak dikenal" });
    const hist = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
    if (!hist.length || hist.some((m) => !["user", "assistant"].includes(m?.role) || typeof m.content !== "string" || !m.content.trim() || m.content.length > 2000) || hist.at(-1).role !== "user" || hist[0].role !== "user")
      return json(res, 400, { error: "Format percakapan tidak valid" });
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    try {
      await chatAboutIdea(idea, hist.map(({ role, content }) => ({ role, content })), (t) => send("delta", { text: t }),
        { fast: FAST_MODE, isRetryable: isRetryableFast, learnerLang: LANGUAGES[body.lang] ?? null });
      send("done", {});
    } catch (e) {
      console.error(e);
      send("error", { error: e instanceof Anthropic.AuthenticationError ? "API key Anthropic tidak valid / belum diset." : "Cheesy-Bot lagi bengong. Coba lagi." });
    }
    return res.end();
  }
  if (action === "translate") {
    if (!LANGUAGES[body.lang] || typeof body.id !== "string" || body.id.startsWith("m_")) return json(res, 400, { error: "Parameter tidak valid" });
    try {
      return json(res, 200, await translateIdea(body.id, LANGUAGES[body.lang], body.lang));
    } catch (e) { console.error(e); return json(res, 502, { error: "Terjemahan gagal. Coba lagi." }); }
  }
  if (action === "journey-next") {
    const jid = body.id;
    if (!JOURNEYS[jid]) return json(res, 404, { error: "Jalur tidak ditemukan" });
    const p = s.journeys[jid] ?? { day: 0 };
    if (p.done) return json(res, 409, { error: "Jalur ini sudah selesai 🎉" });
    if (p.last === date) return json(res, 409, { error: "Hari ini sudah dibuka. Lanjut besok ya — biar jadi kebiasaan 😉" });
    const idea = await journeyDay(jid, p.day);
    const { newBadges } = await updateInsights(user.id, (st) => {
      const j = (st.journeys[jid] ??= { day: 0 });
      j.day++; j.last = date;
      if (j.day >= JOURNEYS[jid].days) j.done = true;
    });
    return json(res, 200, { idea: decorate([idea])[0], newBadges: newBadges.map((k) => BADGE_LABELS[k]) });
  }
  return json(res, 404, { error: "Tidak ditemukan" });
}

// ---------- 🗞️ Berita & 💬 Ngobrol bebas ----------
function validHistory(hist) {
  return Array.isArray(hist) && hist.length > 0 && hist.length <= 30 && hist[0].role === "user" && hist.at(-1).role === "user" &&
    hist.every((m, i) => ["user", "assistant"].includes(m?.role) && typeof m.content === "string" && m.content.trim() && m.content.length <= 3000 && (i === 0 || m.role !== hist[i - 1].role));
}
async function streamChat(res, system, hist, maxUses) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  try {
    const { sources } = await chatWithSearch(system, hist.map(({ role, content }) => ({ role, content })), (t) => send("delta", { text: t }), { maxUses, fast: FAST_MODE, isRetryable: isRetryableFast });
    if (sources.length) send("sources", { sources });
    send("done", {});
  } catch (e) {
    console.error(e);
    send("error", { error: e instanceof Anthropic.AuthenticationError ? "API key Anthropic tidak valid / belum diset." : "Cheesy-Bot lagi bengong. Coba lagi." });
  }
  res.end();
}
const BUDDY = `You are Cheesy-Bot from Cheesy Pen Shells: a warm, witty, well-read discussion buddy for an Indonesian learner.
- Talk in casual Indonesian (switch language only if asked). Short conversational turns (2-6 sentences), ask the learner's opinion, connect topics to their life, Indonesia, economics, their work or studies.
- Use web search when you need up-to-date facts, and say where info comes from. Never invent news, numbers or quotes; if unsure, say so. Present different viewpoints fairly on political or controversial topics.`;

async function handleNews(req, res, user, action, url) {
  if (req.method === "GET" && !action) {
    const cat = url.searchParams.get("cat") ?? "indonesia";
    if (!NEWS_CATEGORIES[cat]) return json(res, 400, { error: "Kategori tidak dikenal" });
    try {
      return json(res, 200, { categories: NEWS_CATEGORIES, cat, today: jakartaDate(), ...(await getNews(cat)) });
    } catch (e) {
      console.error(e);
      return json(res, 502, { error: e instanceof Anthropic.AuthenticationError ? "API key Anthropic tidak valid / belum diset." : `Berita belum bisa dimuat: ${e.message}` });
    }
  }
  if (req.method !== "POST") return json(res, 405, { error: "Metode tidak didukung" });
  const body = await readJson(req);
  if (!validHistory(body.messages)) return json(res, 400, { error: "Format percakapan tidak valid" });
  const learnLang = LANGUAGES[body.lang] ?? null;
  if (action === "chat") {
    const item = await getNewsItem(String(body.date ?? ""), String(body.cat ?? ""), Number(body.idx));
    if (!item) return json(res, 404, { error: "Berita tidak ditemukan" });
    const system = `${BUDDY}\nThe learner wants to discuss this news story (from today's digest). Explain context, background and impact simply; search for the latest updates if useful.${learnLang ? ` They're learning ${learnLang}: when helpful, teach 1-2 useful words about this story in that language.` : ""}\n\nNEWS: ${item.headline}\n${item.summary}\nWhy it matters: ${item.why}\nSource: ${item.source} — ${item.url} (${item.published})`;
    return streamChat(res, system, body.messages, 2);
  }
  if (action === "discuss") {
    const s = await insightState(user.id);
    const profile = await getProfile(user.id);
    const recent = (await getIdeas(Object.values(s.stashes).flat().filter((x) => !x.startsWith("m_")).slice(-8))).map((i) => i.title);
    const heads = await topHeadlines(10);
    const system = `${BUDDY}
This is a free discussion. Be proactive: if the learner has no topic, offer 2-3 relevant ones (today's news, their interests, something they saved), and keep the discussion going with good follow-up questions.
LEARNER: ${user.name}${profile?.about?.length ? `; about them: ${profile.about.slice(0, 8).join("; ")}` : ""}${s.follow.length ? `; follows topics: ${s.follow.join(", ")}` : ""}${recent.length ? `; recently saved ideas: ${recent.join(" | ")}` : ""}${learnLang ? `; learning ${learnLang}` : ""}.
TODAY (${jakartaDate()}, WIB) HEADLINES:\n${heads.map((h) => `- ${h}`).join("\n") || "- (belum ada)"}`;
    return streamChat(res, system, body.messages, 3);
  }
  return json(res, 404, { error: "Tidak ditemukan" });
}

// ---------- 🎓 IELTS Speaking ----------
async function handleIelts(req, res, user, action) {
  const lock = `${user.id}|ielts`;
  if (req.method === "GET" && !action) {
    const i = await getIelts(user.id);
    return json(res, 200, { current: i.current, history: i.history });
  }
  if (req.method !== "POST") return json(res, 405, { error: "Metode tidak didukung" });
  const body = await readJson(req);
  if (busy.has(lock)) return json(res, 409, { error: "Tunggu penguji selesai bicara dulu." });
  busy.add(lock);
  try {
    const store = await getIelts(user.id);
    if (action === "start") {
      const mode = body.mode === "mock" ? "mock" : "practice";
      const s = newSession(mode, [1, 2, 3].includes(Number(body.startPart)) && mode === "practice" ? Number(body.startPart) : 1);
      s.variety = ENGLISH_VARIETIES[body.variety] ? body.variety : "gb";
      await saveIelts(user.id, s);
      return json(res, 200, { current: s });
    }
    const s = store.current;
    if (!s || s.status !== "active") return json(res, 409, { error: "Mulai sesi IELTS dulu." });

    if (action === "end") {
      const report = s.transcript.some((t) => t.role === "candidate") ? await finalReport(s) : null;
      s.status = "done";
      s.report = report;
      await saveIelts(user.id, s, report);
      return json(res, 200, { current: s, report });
    }

    // action === "turn" (SSE)
    const answer = typeof body.answer === "string" ? body.answer.trim().slice(0, 4000) : "";
    if (answer && s.transcript.at(-1)?.role === "candidate") return json(res, 409, { error: "Tunggu pertanyaan berikutnya." });
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    try {
      let feedbackP = null;
      if (answer) {
        const metrics = answerMetrics(answer, Number(body.seconds));
        const question = [...s.transcript].reverse().find((t) => t.role === "examiner")?.text ?? "";
        s.transcript.push({ role: "candidate", part: s.part, text: answer, metrics, ts: new Date().toISOString() });
        send("metrics", metrics);
        if (s.mode === "practice") feedbackP = answerFeedback(question, answer, s.part, metrics).catch((e) => { console.error(e); return null; });
      }
      const step = nextStep(s, !!answer);
      if (step?.cue) {
        s.cue = await makeCue(s);
        send("cue", s.cue);
      }
      const partBefore = s.part;
      const said = await examinerTurn(s, step.say, (t) => send("delta", { text: t }), { fast: FAST_MODE, isRetryable: isRetryableFast });
      step.advance(s);
      s.transcript.push({ role: "examiner", part: partBefore, text: said, ts: new Date().toISOString() });
      if (answer) {
        await appendExchange(user.id, threadKey("ielts", "en"), { tutor: "ielts", language: LANGUAGES.en, langId: "en", level: "auto", voice: Number(body.seconds) > 0 }, answer, said);
        maybeUpdateMemory(user.id, { accountName: user.name });
        runAssessment(user.id, "en", LANGUAGES.en).catch(() => {});
      }
      if (feedbackP) {
        const fb = await feedbackP;
        if (fb) { s.feedback.push({ i: s.transcript.length - 2, ...fb }); send("feedback", fb); }
      }
      let report = null;
      if (s.status === "done") {
        send("status", { text: "Menyusun rapor band…" });
        report = await finalReport(s);
        s.report = report;
        if (report) { await addXp(user.id, "en", 30 + Math.round(report.overall * 10)); send("report", report); }
      }
      await saveIelts(user.id, s, report);
      send("done", { part: s.part, p2Stage: s.p2Stage, status: s.status, cue: s.cue, mode: s.mode });
    } catch (e) {
      console.error(e);
      let msg = "Penguji lagi bermasalah (server AI error). Coba lagi.";
      if (e instanceof Anthropic.AuthenticationError) msg = "API key Anthropic tidak valid / belum diset.";
      else if (e instanceof Anthropic.RateLimitError) msg = "Terlalu banyak permintaan, coba lagi sebentar.";
      // batalkan jawaban yang belum dibalas supaya bisa dikirim ulang
      if (s.transcript.at(-1)?.role === "candidate") s.transcript.pop();
      await saveIelts(user.id, s);
      send("error", { error: msg });
    }
    return res.end();
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

// ----- pemasangan API key lewat browser (hanya kalau key belum ada, hanya dari perangkat ini) -----
const KEY_RE = /sk-ant-[A-Za-z0-9_-]{20,}/;
let hasKey = KEY_RE.test(process.env.ANTHROPIC_API_KEY ?? "");
const isLocal = (req) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);

async function handleSetupKey(req, res) {
  if (hasKey) return json(res, 409, { error: "API key sudah terpasang." });
  if (!isLocal(req)) return json(res, 403, { error: "Hanya bisa dari perangkat yang menjalankan server." });
  const body = await readJson(req);
  const key = String(body?.text ?? "").match(KEY_RE)?.[0];
  if (!key) return json(res, 400, { error: "Tidak menemukan key yang diawali sk-ant-. Salin ulang key yang pendek, lalu tempel lagi." });
  try {
    await new Anthropic({ apiKey: key }).models.list({ limit: 1 });
  } catch (e) {
    const st = e?.status;
    return json(res, 400, { error: st === 401 ? "Key ditolak (salah atau sudah dihapus). Buat key baru lalu coba lagi." : `Gagal mengecek key${st ? ` (kode ${st})` : ""}. Cek internet lalu coba lagi.` });
  }
  const envFile = path.join(here, ".env");
  let env = "";
  try { env = await fs.readFile(envFile, "utf8"); } catch {}
  env = env.split("\n").filter((l) => !l.startsWith("ANTHROPIC_API_KEY")).join("\n").replace(/\n*$/, "\n");
  await fs.writeFile(envFile, `${env}ANTHROPIC_API_KEY=${key}\n`, { mode: 0o600 });
  await fs.chmod(envFile, 0o600).catch(() => {});
  hasKey = true;
  console.log("🔑 API key tersimpan di .env. Jalankan ulang server: CTRL+C lalu npm start");
  return json(res, 200, { ok: true });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (req.method === "POST" && url.pathname === "/api/setup-key") return await handleSetupKey(req, res);
    if (!hasKey && req.method === "GET" && /^\/(|index\.html|login\.html)$/.test(url.pathname)) {
      res.writeHead(302, { Location: "/setup.html" });
      return res.end();
    }
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
          varieties: Object.fromEntries(Object.entries(ENGLISH_VARIETIES).map(([k, v]) => [k, { label: v.label, flag: v.flag, tts: v.tts, stt: v.stt }])),
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

      const nm = url.pathname.match(/^\/api\/news(?:\/(chat|discuss))?$/);
      if (nm) {
        try { return await handleNews(req, res, user, nm[1], url); }
        catch (e) { if (e instanceof AuthError) return json(res, e.status, { error: e.message }); throw e; }
      }
      const wm = url.pathname.match(/^\/api\/insights\/([a-z-]+)$/);
      if (wm) {
        try { return await handleInsights(req, res, user, wm[1], url); }
        catch (e) {
          if (e instanceof AuthError) return json(res, e.status, { error: e.message });
          console.error(e);
          return json(res, 502, { error: e instanceof Anthropic.AuthenticationError ? "API key Anthropic tidak valid / belum diset." : "Gagal memuat ide. Coba lagi." });
        }
      }
      const im = url.pathname.match(/^\/api\/ielts(?:\/(start|turn|end))?$/);
      if (im) return await handleIelts(req, res, user, im[1]);

      // ----- mode Pendekatan -----
      if (req.method === "GET" && url.pathname === "/api/date/characters") {
        const dates = await getDates(user.id);
        const chars = publicCharacters(mediaFor);
        for (const [id, pc] of Object.entries(chars)) {
          const c = CHARACTERS[id];
          const local = localParts(c.tz);
          const act = currentActivity(c, local.hour);
          pc.now = { time: local.text.split("pukul ")[1] ?? local.text, part: local.part, activity: act };
          const outfit = outfitFor(c, localDate(c.tz), act);
          pc.outfit = { look: outfit.look, desc_id: outfit.desc_id };
          pc.newLook = !!(dates[id]?.lastLook && dates[id].lastLook !== outfit.key);
          const today = await lifeToday(id, localDate(c.tz));
          pc.today = today ? { text: today.today_id, busy: today.busy, mood: today.mood } : null;
          pc.activities = [...new Set(["walk", ...c.activities.map((a) => a.id)])];
          weatherAt(c.lat, c.lon).catch(() => {}); // panaskan cache cuaca di latar belakang
        }
        return json(res, 200, {
          characters: chars,
          scenePhotos: Object.fromEntries(["city", "park", "beach", "market", "riverside", "lake", "pool", "gym", "cafe", "kitchen", "studio", "office", "clinic", "library", "airport"]
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
  // alamat untuk membuka dari tablet/HP lain di hotspot/WiFi yang sama (di sebagian Android tidak bisa dibaca)
  try {
    const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
    for (const ip of ips) console.log(`📱 Dari tablet (jaringan yang sama): http://${ip}:${PORT}`);
  } catch {}
  if (!hasKey) console.warn(`⚠️  API key belum terpasang. Buka http://localhost:${PORT} di Chrome untuk memasangnya.`);
  startDailyNews(); // berita terkini harian (bisa dimatikan dengan NEWS_AUTO=false)
  // proses sisa antrean ingatan dari sesi sebelumnya, per pengguna
  allUserIds().then((ids) => ids.forEach((id) => maybeUpdateMemory(id, { force: true }))).catch((e) => console.error(e));
});
