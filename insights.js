// 🧠 Wawasan: kartu ide singkat (bisa di-scroll) untuk mengembangkan diri — konten ORISINAL yang ditulis AI.
// Konten disimpan bersama (data/insights.json) agar semua pengguna berbagi pustaka ide yang terus bertambah.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(here, "data", "insights.json");
const client = new Anthropic();
const MODEL = "claude-opus-5-5";

export const TOPICS = {
  productivity: { emoji: "⏱️", label: "Produktivitas", en: "productivity, focus, time management, deep work" },
  psychology: { emoji: "🧠", label: "Psikologi", en: "psychology, cognitive biases, emotions, motivation" },
  habits: { emoji: "🔁", label: "Kebiasaan", en: "habit formation, behaviour change, discipline" },
  communication: { emoji: "🗣️", label: "Komunikasi", en: "communication, persuasion, conversation, public speaking, negotiation" },
  leadership: { emoji: "🧭", label: "Kepemimpinan", en: "leadership, management, teams, decision making" },
  money: { emoji: "💰", label: "Keuangan Pribadi", en: "personal finance, saving, investing basics, money psychology" },
  business: { emoji: "📈", label: "Bisnis & Marketing", en: "entrepreneurship, small business, marketing, sales, branding" },
  career: { emoji: "💼", label: "Karier", en: "career growth, skills, interviews, networking, side projects" },
  health: { emoji: "🫀", label: "Kesehatan & Tidur", en: "sleep, nutrition, exercise, energy, stress (evidence-based, non-medical advice)" },
  mindfulness: { emoji: "🧘", label: "Mindfulness", en: "mindfulness, calm, gratitude, mental wellbeing" },
  relationships: { emoji: "💞", label: "Hubungan", en: "friendship, family, love, empathy, conflict" },
  creativity: { emoji: "🎨", label: "Kreativitas", en: "creativity, ideas, writing, design thinking" },
  philosophy: { emoji: "🏛️", label: "Filsafat", en: "philosophy, stoicism, ethics, meaning of life — practical" },
  science: { emoji: "🔬", label: "Sains", en: "surprising science explained simply: physics, biology, the brain, space" },
  tech: { emoji: "🤖", label: "Teknologi & AI", en: "technology, AI, the internet, digital skills, future trends" },
  history: { emoji: "📜", label: "Sejarah", en: "history lessons and turning points that teach something useful today" },
  learning: { emoji: "📚", label: "Cara Belajar", en: "learning how to learn, memory, spaced repetition, language learning" },
  culture: { emoji: "🌏", label: "Bahasa & Budaya", en: "languages, cultures, etiquette around the world, linguistics" },
  rare: { emoji: "🦪", label: "Ilmu Langka", en: "rare, niche, little-known knowledge: mental models, oceanography and oysters, urban design, ecology, odd economics, forgotten inventions, obscure skills" },
};

export const JOURNEYS = {
  prokrastinasi: { topic: "productivity", days: 7, title: "7 Hari Lawan Prokrastinasi", desc: "Kenapa kita menunda, dan teknik kecil untuk mulai bergerak." },
  modelmental: { topic: "psychology", days: 10, title: "Berpikir Jernih: 10 Model Mental", desc: "Alat berpikir untuk keputusan yang lebih baik." },
  bicara: { topic: "communication", days: 7, title: "Bicara di Depan Umum Tanpa Grogi", desc: "Dari degdegan jadi percaya diri." },
  keuangan: { topic: "money", days: 7, title: "Dasar Keuangan Pribadi Anak Muda", desc: "Anggaran, dana darurat, utang, dan mulai berinvestasi." },
  tidur: { topic: "health", days: 5, title: "Tidur Lebih Berkualitas", desc: "Kebiasaan sederhana berbasis riset untuk tidur nyenyak." },
  kebiasaan: { topic: "habits", days: 7, title: "Kebiasaan Kecil, Perubahan Besar", desc: "Membangun kebiasaan yang bertahan." },
  belajar: { topic: "learning", days: 7, title: "Belajar Cara Belajar (Termasuk Bahasa!)", desc: "Teknik belajar yang terbukti efektif." },
  negosiasi: { topic: "communication", days: 5, title: "Negosiasi Sehari-hari", desc: "Dari nawar harga sampai minta naik gaji." },
  booth: { topic: "business", days: 7, title: "Memulai Bisnis Booth Makanan", desc: "Belajar dari dunia booth & event — ala Cheesy Pen Shells." },
  laut: { topic: "rare", days: 5, title: "Ilmu Langka: Rahasia Laut & Tiram", desc: "Ekosistem tiram, laut, dan hal-hal yang jarang diketahui." },
};

const Idea = z.object({
  title: z.string().describe("Catchy, specific title in Indonesian, max ~70 characters"),
  body: z.string().describe("The idea explained in 70-130 words of clear, warm Indonesian. One idea only. Concrete example. No fluff."),
  try_today: z.string().describe("One small concrete action to try today (Indonesian, one sentence)"),
  source_type: z.enum(["buku", "riset", "konsep", "sejarah", "tokoh", "pengalaman"]),
  source: z.string().describe("Where this idea comes from, e.g. 'Atomic Habits — James Clear', 'Riset: efek Zeigarnik (Bluma Zeigarnik, 1927)', 'Konsep: Prinsip Pareto'. Only cite real, well-known sources you're confident about; otherwise use a generic concept label."),
  tags: z.array(z.string()).describe("2-3 short lowercase tags"),
});
const Batch = z.object({ ideas: z.array(Idea).describe("Distinct ideas, no overlap with the titles to avoid") });
const BookSchema = z.object({
  known: z.boolean().describe("true ONLY if you genuinely know this book's content well enough to summarise its key ideas accurately"),
  book_title: z.string(), author: z.string(),
  ideas: z.array(Idea).describe("6 key ideas of the book in your OWN words (no quotations), each with a practical example; source = 'Title — Author'. Empty if known is false."),
});
const Imported = z.object({
  title: z.string().describe("Short catchy Indonesian title"),
  body: z.string().describe("The idea rewritten as a clear 60-130 word Indonesian card (keep the meaning faithful)"),
  try_today: z.string(),
  tags: z.array(z.string()),
});
const Translation = z.object({
  title: z.string(), body: z.string(), try_today: z.string(),
  vocab: z.array(z.object({ word: z.string(), romanization: z.string(), meaning_id: z.string() })).describe("5 useful words from the translation"),
});

const SYSTEM = `You write ORIGINAL bite-sized learning cards ("ideas") for Indonesian readers in a self-improvement app (like a smart friend summarising the best of books, research and history).
Rules:
- Each card = ONE useful idea, explained simply with a concrete everyday example (Indonesian context welcome), plus one action to try today.
- Be accurate. You may explain concepts from well-known books/research in your own words and name the source, but NEVER copy text or invent quotes, statistics, studies or authors. If unsure, describe the general concept without a specific citation.
- Health and money: general education only, no medical/financial advice, mention seeing a professional when relevant.
- Vary angles: counter-intuitive findings, mental models, history stories, practical techniques, rare facts. Avoid generic clichés.`;

let db = null;
let writing = Promise.resolve();
const running = new Map();

async function load() {
  if (db) return db;
  try { db = JSON.parse(await fs.readFile(FILE, "utf8")); } catch (e) {
    if (e.code !== "ENOENT") throw e;
    db = { ideas: {}, topics: {}, queries: {}, journeys: {}, translations: {} };
  }
  return db;
}
function save() {
  writing = writing.then(async () => {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE + ".tmp", JSON.stringify(db));
    await fs.rename(FILE + ".tmp", FILE);
  }).catch((e) => console.error("Gagal menyimpan insights.json:", e));
  return writing;
}
function once(key, fn) {
  if (running.has(key)) return running.get(key);
  const p = fn().finally(() => running.delete(key));
  running.set(key, p);
  return p;
}

function storeIdeas(list, extra) {
  return list.map((x) => {
    const id = crypto.randomBytes(6).toString("base64url");
    db.ideas[id] = { id, ...x, ...extra, minutes: Math.max(1, Math.round(x.body.split(/\s+/).length / 180)), at: new Date().toISOString() };
    return id;
  });
}

async function generate(prompt, avoid, n) {
  const res = await client.messages.parse({
    model: MODEL, max_tokens: 6000, output_config: { effort: "low", format: zodOutputFormat(Batch) },
    system: SYSTEM,
    messages: [{ role: "user", content: `${prompt}\nWrite ${n} ideas.\nTitles to avoid (already published): ${avoid.slice(-60).join(" | ") || "-"}` }],
  });
  if (!res.parsed_output) throw new Error("Ide gagal dibuat");
  return res.parsed_output.ideas.slice(0, n);
}

/** Ide untuk sebuah topik mulai dari offset; buat batch baru bila belum cukup. */
export async function topicIdeas(topic, offset, count) {
  await load();
  const list = (db.topics[topic] ??= []);
  if (list.length < offset + count) {
    await once(`t:${topic}:${list.length}`, async () => {
      const ideas = await generate(`Topic: ${TOPICS[topic].label} (${TOPICS[topic].en}).`, list.map((i) => db.ideas[i].title), 6);
      list.push(...storeIdeas(ideas, { topic }));
      await save();
    });
  }
  return list.slice(offset, offset + count).map((id) => db.ideas[id]);
}

export async function searchIdeas(q) {
  await load();
  const key = q.toLowerCase().trim().slice(0, 80);
  if (!db.queries[key]) {
    await once(`q:${key}`, async () => {
      const ideas = await generate(`The user searched for: "${key}". Write ideas that teach the most useful things about this.`, [], 5);
      db.queries[key] = storeIdeas(ideas, { topic: "search", query: key });
      await save();
    });
  }
  return db.queries[key].map((id) => db.ideas[id]);
}

export async function journeyDay(jid, day) {
  await load();
  const j = JOURNEYS[jid];
  const days = (db.journeys[jid] ??= []);
  if (!days[day]) {
    await once(`j:${jid}:${day}`, async () => {
      const prev = days.slice(0, day).map((id) => db.ideas[id]?.title).filter(Boolean);
      const [idea] = await generate(`This is day ${day + 1} of ${j.days} of the learning path "${j.title}" (${j.desc}). Previous days covered: ${prev.join(" | ") || "nothing yet (this is the first day: start with the foundation)"}. Write today's single idea so the path builds step by step.`, prev, 1);
      [days[day]] = storeIdeas([idea], { topic: j.topic, journey: jid, day });
      await save();
    });
  }
  return db.ideas[days[day]];
}

export async function translateIdea(id, langName, langId) {
  await load();
  const key = `${id}|${langId}`;
  if (db.translations[key]) return db.translations[key];
  const idea = db.ideas[id];
  if (!idea) throw new Error("Ide tidak ditemukan");
  return once(`tr:${key}`, async () => {
    const res = await client.messages.parse({
      model: MODEL, max_tokens: 3000, output_config: { effort: "low", format: zodOutputFormat(Translation) },
      system: `Translate a learning card into natural, clear ${langName} for an intermediate learner (simple, natural sentences). Then pick 5 useful words from your translation with Indonesian meanings. Romanization only for non-Latin scripts, else empty string.`,
      messages: [{ role: "user", content: JSON.stringify({ title: idea.title, body: idea.body, try_today: idea.try_today }) }],
    });
    if (!res.parsed_output) throw new Error("Terjemahan gagal");
    db.translations[key] = res.parsed_output;
    await save();
    return res.parsed_output;
  });
}

/** Ringkasan buku: ide-ide pokok sebuah buku dalam kata-kata AI sendiri (bukan salinan). */
export async function bookIdeas(title) {
  await load();
  const key = title.toLowerCase().trim().slice(0, 100);
  db.books ??= {};
  if (!db.books[key]) {
    await once(`b:${key}`, async () => {
      const res = await client.messages.parse({
        model: MODEL, max_tokens: 8000, output_config: { effort: "low", format: zodOutputFormat(BookSchema) },
        system: SYSTEM + "\nNow you summarise a BOOK: give its key ideas in your own words. Never quote passages. If you don't reliably know the book, set known=false and return no ideas.",
        messages: [{ role: "user", content: `Book: "${key}"` }],
      });
      const b = res.parsed_output;
      if (!b) throw new Error("Ringkasan gagal dibuat");
      db.books[key] = b.known && b.ideas.length
        ? { known: true, book_title: b.book_title, author: b.author, ids: storeIdeas(b.ideas.slice(0, 8), { topic: "book", book: b.book_title }) }
        : { known: false, book_title: b.book_title || title, author: b.author || "" };
      await save();
    });
  }
  const b = db.books[key];
  return { ...b, ideas: (b.ids ?? []).map((id) => db.ideas[id]) };
}

/** Rapikan teks yang ditempel pengguna jadi kartu ide (untuk disimpan pribadi). */
export async function formatImported(text) {
  const res = await client.messages.parse({
    model: MODEL, max_tokens: 2000, output_config: { effort: "low", format: zodOutputFormat(Imported) },
    system: "Turn the user's personal note (something they read or learned, any language) into one clear learning card in Indonesian. Stay faithful to its meaning; do not add facts.",
    messages: [{ role: "user", content: text }],
  });
  if (!res.parsed_output) throw new Error("Gagal merapikan catatan");
  return res.parsed_output;
}

export async function getIdeas(ids) {
  await load();
  return ids.map((id) => db.ideas[id]).filter(Boolean);
}
export async function hasIdea(id) {
  await load();
  return !!db.ideas[id];
}
