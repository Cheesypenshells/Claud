import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { TUTORS, LANGUAGES, LEVELS, STYLES, VOICE_PROMPT, buildSystemPrompt } from "./tutors.js";
import { threadKey, getThread, appendExchange, clearThread, getProfile, wipeUser, getSkills, getLearnerSamples } from "./store.js";
import { runAssessment, renderSkills, autoLevelText, RANKS, SKILLS, CEFR, ASSESS_EVERY, MIN_MESSAGES } from "./assess.js";
import { maybeUpdateMemory, renderMemory } from "./memory.js";
import { register, login, logout, currentUser, allUserIds, allUsers, sessionCookie, checkRateLimit, recordFailure, AuthError } from "./auth.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, "public");
const PORT = Number(process.env.PORT) || 3000;
const MODEL = "claude-opus-5-5";
const CONTEXT_MESSAGES = 60; // pesan terakhir yang dikirim apa adanya; sisanya diwakili ingatan
const MAX_CHARS = 4000;

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
  if (typeof b.message !== "string" || !b.message.trim() || b.message.length > MAX_CHARS) return "Pesan kosong atau terlalu panjang";
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

  const message = body.message.trim();
  const thread = await getThread(user.id, key);
  let recent = thread.slice(-CONTEXT_MESSAGES);
  if (recent[0]?.role === "assistant") recent = recent.slice(1);
  const lastTs = thread.at(-1)?.ts;
  const profile = await getProfile(user.id);
  const assessment = (await getSkills(user.id))[body.language]?.current ?? null;
  const levelText = body.level === "auto" ? autoLevelText(assessment) : LEVELS[body.level];

  const context = [
    renderMemory(profile, LANGUAGES[body.language], user.name),
    renderSkills(assessment),
    `Now: ${fmtTime(new Date().toISOString())}. ${lastTs ? `Last message in this chat: ${fmtTime(lastTs)}.` : "This is the first message in this chat."}`,
    thread.length > recent.length ? `(Older messages of this chat are summarized in MEMORY.)` : "",
  ].filter(Boolean).join("\n\n");

  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const stream = client.beta.messages.stream({
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
  });

  let reply = "";
  let aborted = false;
  res.on("close", () => {
    if (!res.writableFinished) {
      aborted = true;
      stream.abort();
    }
  });

  try {
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        reply += event.delta.text;
        send("delta", { text: event.delta.text });
      }
    }
    const final = await stream.finalMessage();
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
        await appendExchange(user.id, key, { tutor: body.tutor, language: LANGUAGES[body.language], langId: body.language, level: body.level, voice: !!body.voice }, message, reply);
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
