import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { TUTORS, LANGUAGES, LEVELS, VOICE_PROMPT, buildSystemPrompt } from "./tutors.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, "public");
const PORT = Number(process.env.PORT) || 3000;
const MODEL = "claude-opus-5-5";
const MAX_MESSAGES = 40;
const MAX_CHARS = 4000;

const client = new Anthropic(); // membaca ANTHROPIC_API_KEY dari environment

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 200_000) reject(new Error("Body terlalu besar"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function validate(body) {
  const { tutor, language, level, messages } = body ?? {};
  if (!TUTORS[tutor]) return "Tutor tidak dikenal";
  if (!LANGUAGES[language]) return "Bahasa tidak dikenal";
  if (!LEVELS[level]) return "Level tidak dikenal";
  if (body.voice !== undefined && typeof body.voice !== "boolean") return "Parameter voice tidak valid";
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) return "Riwayat pesan tidak valid";
  for (const [i, m] of messages.entries()) {
    const expected = i % 2 === 0 ? "user" : "assistant";
    if (m?.role !== expected || typeof m.content !== "string" || !m.content.trim() || m.content.length > MAX_CHARS) {
      return "Format pesan tidak valid";
    }
  }
  if (messages.at(-1).role !== "user") return "Pesan terakhir harus dari user";
  return null;
}

async function handleChat(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "JSON tidak valid" }));
  }
  const err = validate(body);
  if (err) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: err }));
  }

  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 4000,
    // Chat tutor butuh respons cepat; effort "low" cukup untuk percakapan.
    output_config: { effort: "low" },
    // Jika model menolak (refusal), server Anthropic otomatis mencoba model cadangan.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [
      { type: "text", text: buildSystemPrompt(body.tutor, body.language, body.level), cache_control: { type: "ephemeral" } },
      ...(body.voice ? [{ type: "text", text: VOICE_PROMPT }] : []),
    ],
    messages: body.messages.map(({ role, content }) => ({ role, content })),
  });

  req.on("close", () => stream.abort());

  try {
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        send("delta", { text: event.delta.text });
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      send("error", { error: "Maaf, permintaan ini tidak bisa dijawab. Coba topik lain." });
    }
    send("done", { stop_reason: final.stop_reason });
  } catch (e) {
    if (!res.writableEnded) {
      let msg = "Terjadi kesalahan pada server AI. Pastikan ANTHROPIC_API_KEY sudah diset (lihat README).";
      if (e instanceof Anthropic.AuthenticationError) msg = "API key Anthropic tidak valid / belum diset.";
      else if (e instanceof Anthropic.RateLimitError) msg = "Terlalu banyak permintaan, coba lagi sebentar.";
      else if (e instanceof Anthropic.APIError) msg = `Error API (${e.status ?? "?"}): ${e.message}`;
      console.error(e);
      send("error", { error: msg });
    }
  } finally {
    res.end();
  }
}

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath === "/" ? "index.html" : urlPath));
  if (!file.startsWith(PUBLIC_DIR)) {
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
  if (req.method === "POST" && req.url === "/api/chat") return handleChat(req, res);
  if (req.method === "GET" && req.url === "/api/config") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      tutors: Object.fromEntries(Object.entries(TUTORS).map(([id, t]) => [id, { name: t.name, greeting: t.greeting }])),
      languages: LANGUAGES,
      levels: Object.fromEntries(Object.keys(LEVELS).map((k) => [k, k])),
    }));
  }
  if (req.method === "GET") return serveStatic(req, res);
  res.writeHead(405);
  res.end();
});

server.listen(PORT, () => {
  console.log(`LinguaTutor AI berjalan di http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) console.warn("⚠️  ANTHROPIC_API_KEY belum diset — salin .env.example ke .env lalu isi API key-mu.");
});
