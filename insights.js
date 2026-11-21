// 🧠 Wawasan: kartu ide singkat (bisa di-scroll) untuk mengembangkan diri — konten ORISINAL yang ditulis AI.
// Konten disimpan bersama (data/insights.json) agar semua pengguna berbagi pustaka ide yang terus bertambah.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { LIBRARY, loadBook, quoteInText } from "./library.js";
import { MODEL } from "./model.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(here, "data", "insights.json");
const client = new Anthropic();

export const TOPICS = {
  productivity: { emoji: "⏱️", label: "Produktivitas", en: "productivity, focus, time management, deep work" },
  psychology: { emoji: "🧠", label: "Psikologi", en: "psychology, cognitive biases, emotions, motivation" },
  habits: { emoji: "🔁", label: "Kebiasaan", en: "habit formation, behaviour change, discipline" },
  communication: { emoji: "🗣️", label: "Komunikasi", en: "communication, persuasion, conversation, public speaking, negotiation" },
  leadership: { emoji: "🧭", label: "Kepemimpinan", en: "leadership, management, teams, decision making" },
  economics: { emoji: "📊", label: "Ekonomi", en: "economics explained simply: supply and demand, inflation, interest rates, money and central banks, trade, growth, inequality, development, behavioral economics, history of economic thought, and the Indonesian economy (Rupiah, BI rate, UMKM, koperasi)" },
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
  literature: { emoji: "📖", label: "Sastra Klasik", en: "classic literature: stories, characters and the life lessons inside them" },
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
  ekodasar: { topic: "economics", days: 10, title: "Ekonomi Dasar dalam 10 Hari", desc: "Kelangkaan, biaya peluang, permintaan-penawaran, pasar, sampai peran pemerintah." },
  ekosejarah: { topic: "economics", days: 10, title: "Sejarah Pemikiran Ekonomi: dari Adam Smith ke Hari Ini", desc: "Smith, Ricardo, Marx, Marshall, Keynes, Hayek, Friedman, ekonomi perilaku." },
  ekoperilaku: { topic: "economics", days: 7, title: "Ekonomi Perilaku: Kenapa Kita Tidak Rasional", desc: "Bias, nudge, dan keputusan uang sehari-hari." },
  ekomakro: { topic: "economics", days: 7, title: "Makroekonomi untuk Orang Awam", desc: "Inflasi, suku bunga, Rupiah, APBN, resesi — dengan contoh Indonesia." },
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

// ---------- 📚 Perpustakaan Bebas (public domain) ----------
const LibIdea = z.object({
  title: z.string().describe("Catchy Indonesian title, max ~70 chars"),
  body: z.string().describe("80-140 words in clear Indonesian: what the AUTHOR says in this passage (attribute it: 'Menurut Seneca…'), then how to apply it today with a modern example. If the passage contains outdated science or views, say so briefly and fairly."),
  try_today: z.string().describe("One small action to try today (Indonesian)"),
  quote: z.string().describe("A short VERBATIM quote (10-45 words) copied exactly from the passage that best captures the idea"),
  quote_id: z.string().describe("Indonesian translation of the quote"),
  chapter: z.string().describe("Chapter/section name or number this comes from, based on the passage heading or content"),
  tags: z.array(z.string()),
});
const LibBatch = z.object({ ideas: z.array(LibIdea).describe("0-3 genuinely useful ideas from THIS passage only; empty if the passage is front matter, an index, a list of contents or has nothing useful") });

/** Ide dari buku public domain, diambil berurutan dari teks aslinya. */
export async function libraryIdeas(slug, offset, count = 3) {
  await load();
  const b = LIBRARY[slug];
  if (!b) throw new Error("Buku tidak ada di katalog");
  const st = ((db.library ??= {})[slug] ??= { next: 0, ids: [], done: false });
  if (st.ids.length < offset + count && !st.done) {
    await once(`lib:${slug}:${st.ids.length}`, async () => {
      const book = await loadBook(slug);
      st.url = book.meta.url;
      for (let tries = 0; tries < 4 && st.ids.length < offset + count; tries++) {
        if (st.next >= book.chunks.length) { st.done = true; break; }
        const idx = st.next++;
        const ch = book.chunks[idx];
        const res = await client.messages.parse({
          model: MODEL, max_tokens: 5000, output_config: { effort: "low", format: zodOutputFormat(LibBatch) },
          system: `You turn passages of a PUBLIC-DOMAIN book into learning cards for Indonesian readers, staying faithful to what the author actually wrote in THIS passage. Never invent content that isn't in the passage. Quotes must be copied exactly.`,
          messages: [{ role: "user", content: `BOOK: ${b.title} — ${b.author} (${b.year < 0 ? `${-b.year} SM` : b.year})
SECTION HEADING: ${ch.heading}
Already covered: ${st.ids.slice(-12).map((id) => db.ideas[id]?.title).join(" | ") || "-"}

PASSAGE:
${ch.text}` }],
        });
        const ideas = (res.parsed_output?.ideas ?? []).slice(0, 3).map((x) => {
          const ok = quoteInText(x.quote, ch.text);
          return { title: x.title, body: x.body, try_today: x.try_today, tags: x.tags, chapter: x.chapter || ch.heading,
            quote: ok ? x.quote : "", quote_id: ok ? x.quote_id : "", source_type: "buku",
            source: `${b.title} — ${b.author}`, author: b.author, year: b.year, chunk: idx, gutenberg: book.meta.url };
        });
        st.ids.push(...storeIdeas(ideas, { topic: b.topic, library: slug }));
      }
      await save();
    });
  }
  return { ideas: st.ids.slice(offset, offset + count).map((id) => db.ideas[id]), total: st.ids.length, done: st.done, url: st.url ?? null };
}

export async function libraryStatus() {
  await load();
  return Object.fromEntries(Object.keys(LIBRARY).map((k) => [k, { ideas: db.library?.[k]?.ids.length ?? 0, done: !!db.library?.[k]?.done, url: db.library?.[k]?.url ?? null }]));
}

/** Ngobrol (tanya-jawab) tentang satu ide; untuk ide dari buku bebas, berdasar pada teks aslinya. Streaming. */
export async function chatAboutIdea(idea, history, onDelta, { fast = false, isRetryable = () => false, learnerLang = null } = {}) {
  let passage = "";
  if (idea.library && Number.isInteger(idea.chunk)) {
    try { passage = (await loadBook(idea.library)).chunks[idea.chunk]?.text ?? ""; } catch {}
  }
  const params = {
    model: MODEL, max_tokens: 2000, output_config: { effort: "low" },
    system: [
      { type: "text", text: `You are Cheesy-Bot, a warm, witty study buddy from Cheesy Pen Shells. The learner is reading a learning card and wants to talk it through until they really get it.
- Reply in casual Indonesian (switch language only if they ask; ${learnerLang ? `they are also learning ${learnerLang}, so you may sprinkle a useful word or two` : ""}).
- Short, conversational turns (2-6 sentences). Explain simply, use everyday Indonesian examples, check understanding with a question now and then, and give a mini-challenge when it fits.
- If the card comes from a book, stay faithful to what the author actually said (use the passage); clearly separate the author's view from modern knowledge or your own opinion. If a claim is outdated, say so.
- Don't invent quotes, facts or sources. If you don't know, say so.` },
      { type: "text", text: `THE CARD:
Title: ${idea.title}
${idea.body}
Try today: ${idea.try_today ?? "-"}
Source: ${idea.source ?? "-"}${idea.chapter ? ` (${idea.chapter})` : ""}${idea.quote ? `
Quote: "${idea.quote}"` : ""}${passage ? `

ORIGINAL PASSAGE FROM THE BOOK (public domain):
${passage.slice(0, 14000)}` : ""}`, cache_control: { type: "ephemeral" } },
    ],
    messages: history,
  };
  let text = "";
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
  await run(fast);
  return text;
}

/** Terjemahkan satu paragraf (mis. dari buku) ke Bahasa Indonesia; disimpan supaya tidak diulang. */
export async function translateText(text, toLang = "Indonesian") {
  await load();
  const key = crypto.createHash("sha1").update(`${toLang}|${text}`).digest("base64url");
  db.paraTr ??= {};
  if (db.paraTr[key]) return db.paraTr[key];
  return once(`pt:${key}`, async () => {
    const res = await client.messages.create({
      model: MODEL, max_tokens: 3000, output_config: { effort: "low" },
      system: `Translate the passage into natural, easy-to-read ${toLang}${toLang === "Indonesian" ? "" : " suitable for an intermediate learner"}. Keep the meaning faithful. Output only the translation.`,
      messages: [{ role: "user", content: text }],
    });
    const out = res.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    if (!out) throw new Error("Terjemahan gagal");
    db.paraTr[key] = out;
    await save();
    return out;
  });
}

export async function getIdeas(ids) {
  await load();
  return ids.map((id) => db.ideas[id]).filter(Boolean);
}
export async function hasIdea(id) {
  await load();
  return !!db.ideas[id];
}
