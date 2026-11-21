// 🗞️ Berita terkini harian (Indonesia & dunia) memakai web search bawaan Claude.
// Langkah 1: riset dengan web_search. Langkah 2: rapikan jadi JSON terstruktur.
// Berita yang URL-nya tidak muncul di hasil pencarian sungguhan dibuang (anti-halusinasi).
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(here, "data", "news.json");
const client = new Anthropic();
const MODEL = "claude-opus-5-5";
const KEEP_DAYS = 7;

export const NEWS_CATEGORIES = {
  indonesia: { emoji: "🇮🇩", label: "Indonesia", focus: "the most important news in Indonesia today: politics, government policy, society, regions, disasters, law", local: true },
  dunia: { emoji: "🌍", label: "Dunia", focus: "the most important world news today: geopolitics, conflicts, diplomacy, major events in Asia, Americas, Europe, Middle East, Africa" },
  ekonomi: { emoji: "📊", label: "Ekonomi & Bisnis", focus: "economy and business news relevant to Indonesians today: Rupiah, IHSG, Bank Indonesia rate, inflation, commodities, global markets, big company news, UMKM", local: true },
  teknologi: { emoji: "🤖", label: "Teknologi & AI", focus: "technology and AI news today worldwide and in Indonesia: big tech, startups, gadgets, AI developments, cybersecurity" },
  sains: { emoji: "🔬", label: "Sains & Kesehatan", focus: "science, space, environment, climate and health news today (evidence-based)" },
  olahraga: { emoji: "⚽", label: "Olahraga", focus: "sports news today: football (Liga 1, Timnas Indonesia, European leagues), badminton, MotoGP, other major sports", local: true },
  budaya: { emoji: "🎬", label: "Hiburan & Budaya", focus: "entertainment and culture news today: Indonesian and global film, music, K-pop/J-pop, viral culture, food trends" },
};

const NewsList = z.object({
  items: z.array(z.object({
    headline: z.string().describe("Clear headline in Indonesian"),
    summary: z.string().describe("2-3 factual sentences in Indonesian, only what the sources say"),
    why: z.string().describe("One sentence in Indonesian: why it matters / impact on ordinary people"),
    source: z.string().describe("Publisher name, e.g. 'Kompas', 'Reuters', 'BBC'"),
    url: z.string().describe("The exact article URL as it appeared in the search notes"),
    published: z.string().describe("Publication date/time if known, else empty string"),
  })).describe("Up to 6 distinct stories, most important first"),
});

let db = null;
let writing = Promise.resolve();
const running = new Map();

async function load() {
  if (db) return db;
  try { db = JSON.parse(await fs.readFile(FILE, "utf8")); } catch (e) { if (e.code !== "ENOENT") throw e; db = { days: {} }; }
  return db;
}
function save() {
  writing = writing.then(async () => {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    for (const d of Object.keys(db.days).sort().slice(0, -KEEP_DAYS)) delete db.days[d];
    await fs.writeFile(FILE + ".tmp", JSON.stringify(db));
    await fs.rename(FILE + ".tmp", FILE);
  }).catch((e) => console.error("Gagal menyimpan news.json:", e));
  return writing;
}

export const jakartaDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const normUrl = (u) => String(u ?? "").trim().replace(/[#?].*$/, "").replace(/\/+$/, "").toLowerCase();

/** Kumpulkan URL dari blok hasil web search. */
function searchUrls(content) {
  const urls = new Map();
  for (const b of content ?? []) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const r of b.content) if (r.url) urls.set(normUrl(r.url), { url: r.url, title: r.title, page_age: r.page_age });
    }
  }
  return urls;
}

/** Panggil model dengan web search, ulangi saat pause_turn. Kembalikan { text, urls }. */
async function researchWithSearch(system, prompt, { maxUses = 6, local = false } = {}) {
  const tools = [{ type: "web_search_20260209", name: "web_search", max_uses: maxUses,
    ...(local ? { user_location: { type: "approximate", country: "ID", timezone: "Asia/Jakarta" } } : {}) }];
  const messages = [{ role: "user", content: prompt }];
  const urls = new Map();
  let text = "";
  for (let i = 0; i < 5; i++) {
    const res = await client.messages.create({ model: MODEL, max_tokens: 8000, output_config: { effort: "low" }, system, tools, messages });
    for (const [k, v] of searchUrls(res.content)) urls.set(k, v);
    text += res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    if (res.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: res.content });
  }
  return { text, urls };
}

export async function generateCategory(cat, date) {
  const c = NEWS_CATEGORIES[cat];
  const key = `${date}|${cat}`;
  if (running.has(key)) return running.get(key);
  const job = (async () => {
    const { text, urls } = await researchWithSearch(
      "You are a careful news researcher for an Indonesian audience. Use web search to find REAL, recent news from reputable outlets. Never invent stories, numbers or quotes. For every story, write down the exact article URL from the search results.",
      `Today is ${date} (WIB, Asia/Jakarta). Find ${c.focus}. Focus on the last 24–36 hours. Prefer reputable sources (for Indonesia: Kompas, Tempo, Detik, CNN Indonesia, Antara, The Jakarta Post, CNBC Indonesia, Bisnis.com; global: Reuters, AP, BBC, Bloomberg, Al Jazeera, Nikkei). List up to 6 distinct important stories, each with: headline, key facts, why it matters, publisher, exact URL, publication time.`,
      { maxUses: 6, local: !!c.local });
    if (!urls.size) throw new Error("Pencarian web tidak mengembalikan hasil");
    const parsed = await client.messages.parse({
      model: MODEL, max_tokens: 6000, output_config: { effort: "low", format: zodOutputFormat(NewsList) },
      system: "Convert the research notes into a structured list of news items in Indonesian. Only include stories that appear in the notes with a URL. Keep facts exactly as in the notes.",
      messages: [{ role: "user", content: `RESEARCH NOTES:\n${text}\n\nURLS FOUND BY SEARCH:\n${[...urls.values()].map((u) => `- ${u.url} (${u.title ?? ""})`).join("\n")}` }],
    });
    const items = (parsed.parsed_output?.items ?? [])
      .filter((it) => urls.has(normUrl(it.url)))          // hanya berita dengan URL yang benar-benar dari hasil pencarian
      .slice(0, 6)
      .map((it) => ({ ...it, url: urls.get(normUrl(it.url)).url, published: it.published || urls.get(normUrl(it.url)).page_age || "" }));
    await load();
    (db.days[date] ??= {})[cat] = { items, at: new Date().toISOString() };
    await save();
    console.log(`🗞️ Berita ${c.label} ${date}: ${items.length} berita.`);
    return db.days[date][cat];
  })().finally(() => running.delete(key));
  running.set(key, job);
  return job;
}

/** Berita satu kategori: hari ini kalau sudah ada, kalau belum pakai hari terakhir yang tersedia. */
export async function getNews(cat, { generateIfMissing = true } = {}) {
  await load();
  const today = jakartaDate();
  const have = db.days[today]?.[cat];
  if (have) return { date: today, ...have, fresh: true };
  const prev = Object.keys(db.days).sort().reverse().find((d) => db.days[d][cat]);
  if (generateIfMissing) {
    const p = generateCategory(cat, today);
    if (!prev) return { date: today, ...(await p), fresh: true };
    p.catch((e) => console.error("Gagal update berita:", e.message));
  }
  return prev ? { date: prev, ...db.days[prev][cat], fresh: false, updating: generateIfMissing } : { date: today, items: [], fresh: false };
}

export async function getNewsItem(date, cat, idx) {
  await load();
  return db.days[date]?.[cat]?.items?.[idx] ?? null;
}

/** Judul berita teratas hari ini (untuk bahan obrolan Cheesy-Bot). */
export async function topHeadlines(n = 6) {
  await load();
  const d = db.days[jakartaDate()] ?? db.days[Object.keys(db.days).sort().at(-1)] ?? {};
  const out = [];
  for (const cat of ["indonesia", "dunia", "ekonomi", "teknologi", "olahraga", "budaya", "sains"]) {
    for (const it of (d[cat]?.items ?? []).slice(0, 2)) out.push(`[${NEWS_CATEGORIES[cat].label}] ${it.headline}`);
  }
  return out.slice(0, n);
}

/** Update otomatis tiap hari: cek tiap jam; kategori yang belum ada untuk hari ini dibuat berurutan. */
export function startDailyNews() {
  if (process.env.NEWS_AUTO === "false") return;
  const cats = (process.env.NEWS_CATEGORIES ?? Object.keys(NEWS_CATEGORIES).join(",")).split(",").map((s) => s.trim()).filter((c) => NEWS_CATEGORIES[c]);
  const tick = async () => {
    await load();
    const today = jakartaDate();
    for (const cat of cats) {
      if (db.days[today]?.[cat]) continue;
      try { await generateCategory(cat, today); } catch (e) { console.error(`Update berita ${cat} gagal:`, e.message); }
      await new Promise((r) => setTimeout(r, 5000));
    }
  };
  setTimeout(tick, 20_000);
  setInterval(tick, 60 * 60e3);
}

/** Obrolan dengan web search (streaming), untuk diskusi berita & ngobrol bebas. Mengirim teks & daftar sumber. */
export async function chatWithSearch(system, history, onDelta, { maxUses = 3, fast = false, isRetryable = () => false } = {}) {
  const tools = [{ type: "web_search_20260209", name: "web_search", max_uses: maxUses }];
  const messages = [...history];
  const sources = new Map();
  let text = "";
  for (let i = 0; i < 4; i++) {
    const params = { model: MODEL, max_tokens: 4000, output_config: { effort: "low" }, system, tools, messages };
    let final;
    const run = async (useFast) => {
      const stream = client.messages.stream(useFast ? { ...params, speed: "fast" } : params);
      try {
        for await (const ev of stream) if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") { text += ev.delta.text; onDelta(ev.delta.text); }
        return await stream.finalMessage();
      } catch (e) {
        if (useFast && !text && isRetryable(e)) return run(false);
        throw e;
      }
    };
    final = await run(fast && i === 0);
    for (const b of final.content) {
      if (b.type === "text") for (const c of b.citations ?? []) if (c.url) sources.set(normUrl(c.url), { url: c.url, title: c.title ?? c.url });
    }
    if (final.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: final.content });
  }
  return { text, sources: [...sources.values()].slice(0, 8) };
}
