import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { TUTORS, LANGUAGES, LEVELS, STYLES, VOICE_PROMPT, buildSystemPrompt } from "./tutors.js";
import { threadKey, getThread, appendExchange, clearThread, getProfile, wipeAll } from "./store.js";
import { maybeUpdateMemory, renderMemory } from "./memory.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, "public");
const PORT = Number(process.env.PORT) || 3000;
const MODEL = "claude-opus-5-5";
const CONTEXT_MESSAGES = 60; // pesan terakhir yang dikirim apa adanya; sisanya diwakili ingatan
const MAX_CHARS = 4000;

const client = new Anthropic(); // membaca ANTHROPIC_API_KEY dari environment
const busy = new Set(); // satu permintaan per percakapan pada satu waktu

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
  if (!LEVELS[b.level]) return "Level tidak dikenal";
  if (!STYLES[b.style]) return "Gaya ngajar tidak dikenal";
  if (b.voice !== undefined && typeof b.voice !== "boolean") return "Parameter voice tidak valid";
  if (typeof b.message !== "string" || !b.message.trim() || b.message.length > MAX_CHARS) return "Pesan kosong atau terlalu panjang";
  return null;
}

const fmtTime = (iso) => new Date(iso).toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short" });

async function handleChat(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: "JSON tidak valid" });
  }
  const err = validate(body);
  if (err) return json(res, 400, { error: err });

  const key = threadKey(body.tutor, body.language);
  if (busy.has(key)) return json(res, 409, { error: "Tunggu balasan sebelumnya selesai dulu." });
  busy.add(key);

  const message = body.message.trim();
  const thread = await getThread(key);
  let recent = thread.slice(-CONTEXT_MESSAGES);
  if (recent[0]?.role === "assistant") recent = recent.slice(1);
  const lastTs = thread.at(-1)?.ts;
  const profile = await getProfile();

  const context = [
    renderMemory(profile, LANGUAGES[body.language]),
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
      { type: "text", text: buildSystemPrompt(body.tutor, body.language, body.level, body.style) },
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
        await appendExchange(key, { tutor: body.tutor, language: LANGUAGES[body.language], level: body.level }, message, reply);
        maybeUpdateMemory();
      }
    } finally {
      busy.delete(key);
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (req.method === "POST" && url.pathname === "/api/chat") return await handleChat(req, res);

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
      if (req.method === "GET") return json(res, 200, { messages: await getThread(key) });
      if (req.method === "DELETE") {
        if (busy.has(key)) return json(res, 409, { error: "Tunggu balasan selesai dulu." });
        await clearThread(key);
        return json(res, 200, { ok: true });
      }
    }

    if (url.pathname === "/api/memory") {
      if (req.method === "GET") return json(res, 200, { profile: await getProfile() });
      if (req.method === "DELETE") {
        await wipeAll();
        return json(res, 200, { ok: true });
      }
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
  maybeUpdateMemory({ force: true }); // proses sisa antrean ingatan dari sesi sebelumnya
});
